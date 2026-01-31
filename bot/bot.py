import asyncio
import re
import psycopg2
import os
from telethon import TelegramClient, events
from telethon.errors import FloodWaitError
from telethon.tl import functions
from telethon.sessions import StringSession
from datetime import datetime, timedelta
import pytz

# —————— AYARLAR ——————
api_id = int(os.getenv('API_ID', '23134050'))
api_hash = os.getenv('API_HASH', 'a03e2a029f42a96707c9555c5eee95ae')
DATABASE_URL = os.getenv('DATABASE_URL')
SESSION_STRING = os.getenv('SESSION_STRING', '')

# Timezone
istanbul_tz = pytz.timezone('Europe/Istanbul')

# —————— VERİTABANI ——————
def get_db_connection():
    """Veritabanı bağlantısı al"""
    conn = psycopg2.connect(DATABASE_URL)
    with conn.cursor() as cursor:
        cursor.execute("SET timezone = 'Europe/Istanbul'")
    conn.commit()
    return conn

# —————— KANAL FONKSİYONLARI ——————
def get_active_channels():
    """Aktif hedef kanalları al (user_channels tablosundan paused=false olanlar)"""
    with get_db_connection() as db:
        cursor = db.cursor()
        # channels ve user_channels tablolarını join et
        # En az bir kullanıcının paused=false olduğu kanalları getir
        cursor.execute("""
            SELECT DISTINCT c.channel_id
            FROM channels c
            INNER JOIN user_channels uc ON c.channel_id = uc.channel_id
            WHERE uc.paused = false
        """)
        return [row[0] for row in cursor.fetchall()]

def get_listening_channels():
    """Tüm dinleme kanallarını al"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            SELECT channel_id, COALESCE(default_link, 'https://example.com'),
                   COALESCE(keyword, ''), COALESCE(type, 'text'), COALESCE(triggers, '')
            FROM listening_channels
        """)
        return cursor.fetchall()

# —————— KELİME FONKSİYONLARI ——————
def get_all_keywords():
    """Tüm anahtar kelimeleri al"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT keyword FROM keywords ORDER BY keyword")
        return [row[0] for row in cursor.fetchall()]

def get_all_banned_words():
    """Tüm yasak kelimeleri al"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT word FROM banned_words ORDER BY word")
        return [row[0] for row in cursor.fetchall()]

def has_banned_word(code: str) -> bool:
    """Kod yasak kelime içeriyor mu?"""
    banned = get_all_banned_words()
    code_lower = code.lower()
    for word in banned:
        if word.lower() in code_lower:
            return True
    return False

# —————— LİNK ÖZELLEŞTİRME ——————
def get_channel_user_id(channel_id: int):
    """Kanalın ilk kullanıcısını al (link özelleştirmesi için)"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            SELECT user_id FROM user_channels
            WHERE channel_id = %s AND paused = false
            LIMIT 1
        """, (channel_id,))
        result = cursor.fetchone()
        return result[0] if result else None

def get_custom_link(user_id: int, channel_id: int, code: str, original_link: str) -> str:
    """Kullanıcının özel linkini al (kod veya link içinde eşleşme)"""
    with get_db_connection() as db:
        cursor = db.cursor()
        # link_code, kod veya original_link içinde geçiyorsa eşleştir
        cursor.execute("""
            SELECT link_url FROM admin_links
            WHERE user_id = %s AND channel_id = %s
            AND (%s ILIKE '%%' || link_code || '%%' OR %s ILIKE '%%' || link_code || '%%')
            ORDER BY LENGTH(link_code) DESC
            LIMIT 1
        """, (user_id, channel_id, code, original_link))
        result = cursor.fetchone()
        return result[0] if result else None

def get_link_for_channel(channel_id: int, code: str, default_link: str) -> str:
    """Kanal için uygun linki al"""
    user_id = get_channel_user_id(channel_id)
    if user_id:
        custom_link = get_custom_link(user_id, channel_id, code, default_link)
        if custom_link:
            return custom_link
    return default_link

# —————— KOD KONTROLÜ ——————
def is_code_recently_sent(code: str) -> bool:
    """Son 1 saat içinde kod gönderilmiş mi?"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            SELECT 1 FROM sent_codes
            WHERE code = %s AND sent_at > (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'
        """, (code,))
        return cursor.fetchone() is not None

def mark_code_as_sent(code: str) -> bool:
    """Kodu gönderildi olarak işaretle (atomik)"""
    with get_db_connection() as db:
        cursor = db.cursor()
        # Önce kontrol et (FOR UPDATE ile lock)
        cursor.execute("""
            SELECT 1 FROM sent_codes
            WHERE code = %s AND sent_at > (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'
            FOR UPDATE
        """, (code,))

        if cursor.fetchone():
            return False

        # Ekle veya güncelle
        cursor.execute("""
            INSERT INTO sent_codes (code, sent_at)
            VALUES (%s, NOW() AT TIME ZONE 'Europe/Istanbul')
            ON CONFLICT (code) DO UPDATE SET sent_at = NOW() AT TIME ZONE 'Europe/Istanbul'
        """, (code,))
        db.commit()
        return True

def cleanup_old_codes():
    """1 saatten eski kodları temizle"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            DELETE FROM sent_codes
            WHERE sent_at < (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'
        """)
        db.commit()

# —————— İSTATİSTİK ——————
def record_code_stat(channel_id: int, code: str):
    """Kod istatistiğini kaydet"""
    with get_db_connection() as db:
        cursor = db.cursor()
        now = datetime.now(istanbul_tz)
        today = now.date()

        cursor.execute("""
            INSERT INTO channel_stats (channel_id, stat_date, daily_count, code_list, last_updated)
            VALUES (%s, %s, 1, %s, %s)
            ON CONFLICT (channel_id, stat_date) DO UPDATE
            SET daily_count = channel_stats.daily_count + 1,
                code_list = channel_stats.code_list || ',' || %s,
                last_updated = %s
        """, (channel_id, today, code, now, code, now))
        db.commit()

# —————— KANALA KATILMA ——————
def is_channel_joined(channel_id: int) -> bool:
    """Kanala daha önce katılınmış mı?"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT 1 FROM joined_channels WHERE channel_id = %s", (channel_id,))
        return cursor.fetchone() is not None

def mark_channel_joined(channel_id: int):
    """Kanalı katılındı olarak işaretle"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            INSERT INTO joined_channels (channel_id, joined_at)
            VALUES (%s, NOW() AT TIME ZONE 'Europe/Istanbul')
            ON CONFLICT (channel_id) DO NOTHING
        """, (channel_id,))
        db.commit()

# —————— TELETHON CLIENT ——————
if SESSION_STRING:
    client = TelegramClient(StringSession(SESSION_STRING), api_id, api_hash)
    print("✅ StringSession ile başlatılıyor...")
else:
    client = TelegramClient('bot_session', api_id, api_hash)
    print("⚠️ Dosya session ile başlatılıyor (sadece yerel test için)...")

# —————— YARDIMCI FONKSİYONLAR ——————
def normalize_channel_id(channel_id: int) -> int:
    """Kanal ID'sini normalize et (-100 prefix ekle)"""
    if channel_id > 0:
        return int(f"-100{channel_id}")
    return channel_id

async def join_channel_if_needed(channel_id: int) -> bool:
    """Kanala henüz katılmamışsa katıl"""
    try:
        if is_channel_joined(channel_id):
            return True

        try:
            await client.get_entity(channel_id)
            await client(functions.channels.JoinChannelRequest(channel_id))
            mark_channel_joined(channel_id)
            print(f"📥 Kanala katıldı: {channel_id}")
            return True
        except Exception as e:
            print(f"⚠️ Kanala katılamadı {channel_id}: {e}")
            return False
    except Exception as e:
        print(f"⚠️ Kanal katılım hatası {channel_id}: {e}")
        return False

# —————— KOD GÖNDERİM ——————
async def send_to_all_channels(code: str, default_link: str):
    """Kodu tüm aktif kanallara gönder"""
    try:
        active_channels = get_active_channels()

        if not active_channels:
            print(f"⚠️ Aktif kanal bulunamadı")
            return

        sent_count = 0

        for channel_id in active_channels:
            try:
                # Kanal için uygun linki al
                final_link = get_link_for_channel(channel_id, code, default_link)
                message = f"`{code}`\n\n{final_link}"

                await client.send_message(channel_id, message, link_preview=False)

                # İstatistik kaydet
                record_code_stat(channel_id, code)

                sent_count += 1
                await asyncio.sleep(0.1)  # Rate limit için kısa bekleme

            except FloodWaitError as e:
                print(f"⚠️ FloodWait: {e.seconds} saniye bekleniyor...")
                await asyncio.sleep(e.seconds)
            except Exception as e:
                print(f"❌ Gönderim hatası {channel_id}: {e}")

        if sent_count > 0:
            print(f"✅ Dağıtım: {sent_count}/{len(active_channels)} kanal | Kod: {code}")
            cleanup_old_codes()

    except Exception as e:
        print(f"❌ Toplu gönderim hatası: {e}")

# —————— MESAJ İŞLEME ——————
async def process_message(event, listening_channel_id: int, default_link: str, keyword: str):
    """Mesajı işle ve kod varsa gönder"""
    try:
        text = event.message.message.strip()
        if not text:
            return

        lines = [l.strip() for l in text.splitlines() if l.strip()]

        # Anahtar kelimeler
        keywords = get_all_keywords()

        # FORMAT 1: kelime\nkod\nlink (3 satır - anahtar kelime ile)
        if len(lines) >= 3:
            first_line = lines[0].lower()
            if first_line in [k.lower() for k in keywords]:
                code_line = lines[1]
                link_line = lines[2]

                # Kod ve link formatı doğrula
                if re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code_line) and \
                   re.match(r'^https?://[\w\.-]+\.[a-z]{2,}(/.*)?$', link_line):

                    # Yasak kelime kontrolü
                    if has_banned_word(code_line):
                        print(f"🚫 YASAK KELİME | Kod: {code_line}")
                        return

                    print(f"📡 KELİME DİNLEME | Kelime: {first_line} | Kod: {code_line}")

                    if mark_code_as_sent(code_line):
                        await send_to_all_channels(code_line, link_line)
                    else:
                        print(f"🔄 Tekrar kod: {code_line}")
                    return

        # FORMAT 2: kod\nlink (2 satır - standart)
        if len(lines) >= 2:
            code_line = lines[0]
            link_line = lines[1]

            # Kod ve link formatı doğrula
            if re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code_line) and \
               re.match(r'^https?://[\w\.-]+\.[a-z]{2,}(/.*)?$', link_line):

                # Yasak kelime kontrolü
                if has_banned_word(code_line):
                    print(f"🚫 YASAK KELİME | Kod: {code_line}")
                    return

                print(f"📡 STANDART DİNLEME | Kod: {code_line}")

                if mark_code_as_sent(code_line):
                    await send_to_all_channels(code_line, link_line)
                else:
                    print(f"🔄 Tekrar kod: {code_line}")
                return

        # FORMAT 3: Özel keyword ile eşleşme (listening_channels.keyword alanı)
        if keyword:
            keyword_lower = keyword.lower()
            text_lower = text.lower()

            if keyword_lower in text_lower:
                # Metinden kod ve link çıkarmaya çalış
                code_match = re.search(r'[A-Za-z0-9ÇçĞğİıÖöŞşÜü-]{6,}', text)
                link_match = re.search(r'https?://[\w\.-]+\.[a-z]{2,}(/\S*)?', text)

                if code_match:
                    code = code_match.group()
                    link = link_match.group() if link_match else default_link

                    if has_banned_word(code):
                        print(f"🚫 YASAK KELİME | Kod: {code}")
                        return

                    print(f"📡 KEYWORD DİNLEME | Keyword: {keyword} | Kod: {code}")

                    if mark_code_as_sent(code):
                        await send_to_all_channels(code, link)
                    else:
                        print(f"🔄 Tekrar kod: {code}")

    except Exception as e:
        print(f"❌ Mesaj işleme hatası: {e}")

# —————— ANA DİNLEYİCİ ——————
@client.on(events.NewMessage())
async def message_handler(event):
    """Tüm mesajları dinle"""
    try:
        # Sadece kanal/grup mesajlarını işle
        if not event.chat:
            return

        current_channel_id = event.chat.id
        normalized_id = normalize_channel_id(current_channel_id)

        # Dinleme kanallarını kontrol et
        listening_channels = get_listening_channels()

        for lc_id, default_link, keyword, lc_type, triggers in listening_channels:
            # Kanal ID'lerini karşılaştır
            if normalized_id == lc_id or current_channel_id == lc_id:
                await process_message(event, lc_id, default_link, keyword)
                break

    except Exception as e:
        print(f"❌ Handler hatası: {e}")

# —————— KEEP ALIVE ——————
async def keep_alive():
    """Bot'u canlı tut ve eski kodları temizle"""
    while True:
        try:
            await client.get_me()
            cleanup_old_codes()
        except Exception as e:
            print(f"⚠️ Keep alive hatası: {e}")
        await asyncio.sleep(1500)  # 25 dakikada bir

# —————— BAŞLANGIÇ ——————
async def main():
    """Bot'u başlat"""
    print("🤖 Telegram Bot başlatılıyor...")
    print("📋 Mod: Sadece kod dinleme ve iletme (komut yok)")
    print("🌐 Yönetim: Web panelinden yapılacak")
    print("-" * 50)

    try:
        await client.start()

        me = await client.get_me()
        print(f"✅ Giriş yapıldı: {me.first_name} (@{me.username})")

        # Dinleme kanallarına katıl
        listening_channels = get_listening_channels()
        print(f"📡 Dinleme kanalları: {len(listening_channels)}")

        for channel_id, default_link, keyword, lc_type, triggers in listening_channels:
            await join_channel_if_needed(channel_id)
            await asyncio.sleep(0.5)

        # Hedef kanalları kontrol et
        active_channels = get_active_channels()
        print(f"📢 Aktif hedef kanalları: {len(active_channels)}")

        # Keep alive task başlat
        asyncio.create_task(keep_alive())

        print("-" * 50)
        print("🚀 Bot çalışıyor - Kodlar dinleniyor...")

        await client.run_until_disconnected()

    except Exception as e:
        print(f"❌ Bot hatası: {e}")
    finally:
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
