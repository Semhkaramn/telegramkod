import asyncio
import re
import psycopg2
import os
from telethon import TelegramClient, events
from telethon.errors import FloodWaitError, ChannelPrivateError, ChatAdminRequiredError, UserBannedInChannelError
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
    """
    Aktif hedef kanalları al:
    - user_channels.paused = false
    - users.is_banned = false
    - users.is_active = true
    - users.bot_enabled = true
    """
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            SELECT DISTINCT c.channel_id
            FROM channels c
            INNER JOIN user_channels uc ON c.channel_id = uc.channel_id
            INNER JOIN users u ON uc.user_id = u.id
            WHERE uc.paused = false
              AND u.is_banned = false
              AND u.is_active = true
              AND u.bot_enabled = true
        """)
        return [row[0] for row in cursor.fetchall()]

def get_all_target_channels():
    """Tüm hedef kanalları al (katılma kontrolü için)"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            SELECT DISTINCT c.channel_id, c.is_joined
            FROM channels c
            INNER JOIN user_channels uc ON c.channel_id = uc.channel_id
            INNER JOIN users u ON uc.user_id = u.id
            WHERE u.is_banned = false
              AND u.is_active = true
              AND u.bot_enabled = true
        """)
        return cursor.fetchall()

def get_listening_channels():
    """Aktif dinleme kanallarını al (is_active = true)"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            SELECT channel_id, COALESCE(default_link, 'https://example.com'),
                   COALESCE(keyword, ''), COALESCE(type, 'text'), COALESCE(triggers, '')
            FROM listening_channels
            WHERE is_active = true
        """)
        return cursor.fetchall()

def update_channel_join_status(channel_id: int, is_joined: bool, error: str = None):
    """Kanal katılım durumunu güncelle"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            UPDATE channels
            SET is_joined = %s, join_error = %s
            WHERE channel_id = %s
        """, (is_joined, error, channel_id))
        db.commit()

# —————— KULLANICI KONTROL ——————
def get_active_users_for_channel(channel_id: int):
    """
    Kanal için aktif kullanıcıları al:
    - is_banned = false
    - is_active = true
    - bot_enabled = true
    - paused = false
    """
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            SELECT u.id, u.username
            FROM users u
            INNER JOIN user_channels uc ON u.id = uc.user_id
            WHERE uc.channel_id = %s
              AND uc.paused = false
              AND u.is_banned = false
              AND u.is_active = true
              AND u.bot_enabled = true
        """, (channel_id,))
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
    """
    Kanalın ilk AKTİF kullanıcısını al (link özelleştirmesi için)
    Banned olmayan, aktif ve bot_enabled olan kullanıcı
    """
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            SELECT uc.user_id FROM user_channels uc
            INNER JOIN users u ON uc.user_id = u.id
            WHERE uc.channel_id = %s
              AND uc.paused = false
              AND u.is_banned = false
              AND u.is_active = true
              AND u.bot_enabled = true
            LIMIT 1
        """, (channel_id,))
        result = cursor.fetchone()
        return result[0] if result else None

def get_custom_link(user_id: int, channel_id: int, code: str, original_link: str) -> str:
    """Kullanıcının özel linkini al (kod veya link içinde eşleşme)"""
    with get_db_connection() as db:
        cursor = db.cursor()
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
        cursor.execute("""
            SELECT 1 FROM sent_codes
            WHERE code = %s AND sent_at > (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'
            FOR UPDATE
        """, (code,))

        if cursor.fetchone():
            return False

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

# —————— BOT LOG ——————
def log_bot_message(level: str, message: str, details: str = None):
    """Bot logunu veritabanına kaydet"""
    try:
        with get_db_connection() as db:
            cursor = db.cursor()
            cursor.execute("""
                INSERT INTO bot_logs (level, message, details, created_at)
                VALUES (%s, %s, %s, NOW() AT TIME ZONE 'Europe/Istanbul')
            """, (level, message, details))
            db.commit()
    except Exception as e:
        print(f"⚠️ Log kayıt hatası: {e}")

def update_bot_status(is_running: bool, error: str = None):
    """Bot durumunu güncelle"""
    try:
        with get_db_connection() as db:
            cursor = db.cursor()
            cursor.execute("""
                INSERT INTO bot_status (id, is_running, last_ping, last_error, started_at, updated_at)
                VALUES (1, %s, NOW(), %s, CASE WHEN %s THEN NOW() ELSE NULL END, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    is_running = %s,
                    last_ping = NOW(),
                    last_error = %s,
                    started_at = CASE WHEN %s AND bot_status.started_at IS NULL THEN NOW() ELSE bot_status.started_at END,
                    updated_at = NOW()
            """, (is_running, error, is_running, is_running, error, is_running))
            db.commit()
    except Exception as e:
        print(f"⚠️ Status güncelleme hatası: {e}")

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

async def join_channel_if_needed(channel_id: int, is_target: bool = False) -> bool:
    """Kanala henüz katılmamışsa katıl"""
    try:
        if is_channel_joined(channel_id):
            return True

        try:
            entity = await client.get_entity(channel_id)
            await client(functions.channels.JoinChannelRequest(channel_id))
            mark_channel_joined(channel_id)

            # Hedef kanal ise veritabanını güncelle
            if is_target:
                update_channel_join_status(channel_id, True)

            print(f"📥 Kanala katıldı: {channel_id}")
            log_bot_message("info", f"Kanala katıldı: {channel_id}")
            return True

        except ChannelPrivateError:
            error_msg = "Kanal özel veya davet gerekli"
            print(f"⚠️ {error_msg}: {channel_id}")
            if is_target:
                update_channel_join_status(channel_id, False, error_msg)
            log_bot_message("warning", f"Kanala katılamadı: {channel_id}", error_msg)
            return False

        except ChatAdminRequiredError:
            error_msg = "Admin yetkisi gerekli"
            print(f"⚠️ {error_msg}: {channel_id}")
            if is_target:
                update_channel_join_status(channel_id, False, error_msg)
            log_bot_message("warning", f"Kanala katılamadı: {channel_id}", error_msg)
            return False

        except Exception as e:
            error_msg = str(e)[:200]
            print(f"⚠️ Kanala katılamadı {channel_id}: {e}")
            if is_target:
                update_channel_join_status(channel_id, False, error_msg)
            log_bot_message("error", f"Kanal katılım hatası: {channel_id}", error_msg)
            return False

    except Exception as e:
        print(f"⚠️ Kanal katılım hatası {channel_id}: {e}")
        return False

async def check_and_join_new_channels():
    """Yeni eklenen hedef kanallara katıl"""
    try:
        target_channels = get_all_target_channels()

        for channel_id, is_joined in target_channels:
            if not is_joined:
                print(f"🔄 Yeni hedef kanal tespit edildi: {channel_id}")
                await join_channel_if_needed(channel_id, is_target=True)
                await asyncio.sleep(1)  # Rate limit için bekle

    except Exception as e:
        print(f"❌ Yeni kanal kontrol hatası: {e}")
        log_bot_message("error", "Yeni kanal kontrol hatası", str(e)[:500])

# —————— KOD GÖNDERİM ——————
async def send_to_all_channels(code: str, default_link: str):
    """Kodu tüm aktif kanallara gönder (sadece aktif ve ban olmayan kullanıcıların kanallarına)"""
    try:
        active_channels = get_active_channels()

        if not active_channels:
            print(f"⚠️ Aktif kanal bulunamadı (tüm kullanıcılar banlı/pasif veya kanallar duraklatılmış)")
            return

        sent_count = 0
        error_count = 0

        for channel_id in active_channels:
            try:
                # Kanal için aktif kullanıcı var mı kontrol et
                active_users = get_active_users_for_channel(channel_id)
                if not active_users:
                    print(f"⚠️ Kanal {channel_id} için aktif kullanıcı yok, atlanıyor")
                    continue

                # Kanal için uygun linki al
                final_link = get_link_for_channel(channel_id, code, default_link)
                message = f"`{code}`\n\n{final_link}"

                await client.send_message(channel_id, message, link_preview=False)

                # İstatistik kaydet
                record_code_stat(channel_id, code)

                sent_count += 1
                await asyncio.sleep(0.1)  # Rate limit için kısa bekleme

            except UserBannedInChannelError:
                error_count += 1
                print(f"❌ Bot bu kanalda banlı: {channel_id}")
                update_channel_join_status(channel_id, False, "Bot bu kanalda banlı")
                log_bot_message("error", f"Bot kanalda banlı: {channel_id}")

            except FloodWaitError as e:
                print(f"⚠️ FloodWait: {e.seconds} saniye bekleniyor...")
                log_bot_message("warning", f"FloodWait: {e.seconds} saniye")
                await asyncio.sleep(e.seconds)

            except Exception as e:
                error_count += 1
                print(f"❌ Gönderim hatası {channel_id}: {e}")
                log_bot_message("error", f"Gönderim hatası: {channel_id}", str(e)[:200])

        if sent_count > 0:
            print(f"✅ Dağıtım: {sent_count}/{len(active_channels)} kanal | Kod: {code}")
            log_bot_message("info", f"Kod dağıtıldı: {code}", f"{sent_count} kanal başarılı, {error_count} hata")
            cleanup_old_codes()

    except Exception as e:
        print(f"❌ Toplu gönderim hatası: {e}")
        log_bot_message("error", "Toplu gönderim hatası", str(e)[:500])

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

                if re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code_line) and \
                   re.match(r'^https?://[\w\.-]+\.[a-z]{2,}(/.*)?$', link_line):

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

            if re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code_line) and \
               re.match(r'^https?://[\w\.-]+\.[a-z]{2,}(/.*)?$', link_line):

                if has_banned_word(code_line):
                    print(f"🚫 YASAK KELİME | Kod: {code_line}")
                    return

                print(f"📡 STANDART DİNLEME | Kod: {code_line}")

                if mark_code_as_sent(code_line):
                    await send_to_all_channels(code_line, link_line)
                else:
                    print(f"🔄 Tekrar kod: {code_line}")
                return

        # FORMAT 3: Özel keyword ile eşleşme
        if keyword:
            keyword_lower = keyword.lower()
            text_lower = text.lower()

            if keyword_lower in text_lower:
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
        log_bot_message("error", "Mesaj işleme hatası", str(e)[:500])

# —————— ANA DİNLEYİCİ ——————
@client.on(events.NewMessage())
async def message_handler(event):
    """Tüm mesajları dinle"""
    try:
        if not event.chat:
            return

        current_channel_id = event.chat.id
        normalized_id = normalize_channel_id(current_channel_id)

        # Aktif dinleme kanallarını kontrol et (sadece is_active=true olanlar)
        listening_channels = get_listening_channels()

        for lc_id, default_link, keyword, lc_type, triggers in listening_channels:
            if normalized_id == lc_id or current_channel_id == lc_id:
                await process_message(event, lc_id, default_link, keyword)
                break

    except Exception as e:
        print(f"❌ Handler hatası: {e}")

# —————— KEEP ALIVE & SYNC ——————
async def keep_alive():
    """Bot'u canlı tut, eski kodları temizle ve yeni kanalları kontrol et"""
    while True:
        try:
            await client.get_me()
            cleanup_old_codes()
            update_bot_status(True)

            # Her 5 dakikada bir yeni kanalları kontrol et
            await check_and_join_new_channels()

        except Exception as e:
            print(f"⚠️ Keep alive hatası: {e}")
            update_bot_status(True, str(e)[:200])

        await asyncio.sleep(300)  # 5 dakikada bir

# —————— BAŞLANGIÇ ——————
async def main():
    """Bot'u başlat"""
    print("🤖 Telegram Bot başlatılıyor...")
    print("📋 Mod: Sadece kod dinleme ve iletme (komut yok)")
    print("🌐 Yönetim: Web panelinden yapılacak")
    print("🔒 Güvenlik: Sadece aktif ve ban olmayan kullanıcılar")
    print("-" * 50)

    try:
        await client.start()
        update_bot_status(True)
        log_bot_message("info", "Bot başlatıldı")

        me = await client.get_me()
        print(f"✅ Giriş yapıldı: {me.first_name} (@{me.username})")

        # Aktif dinleme kanallarına katıl
        listening_channels = get_listening_channels()
        print(f"📡 Aktif dinleme kanalları: {len(listening_channels)}")

        for channel_id, default_link, keyword, lc_type, triggers in listening_channels:
            await join_channel_if_needed(channel_id)
            await asyncio.sleep(0.5)

        # Hedef kanalları kontrol et ve katıl
        print("🔄 Hedef kanallar kontrol ediliyor...")
        await check_and_join_new_channels()

        # Aktif hedef kanalları göster
        active_channels = get_active_channels()
        print(f"📢 Aktif hedef kanalları: {len(active_channels)}")

        # Keep alive task başlat
        asyncio.create_task(keep_alive())

        print("-" * 50)
        print("🚀 Bot çalışıyor - Kodlar dinleniyor...")
        print("⚠️ Not: Sadece bot_enabled=true olan kullanıcıların kanallarına kod gönderilir")

        await client.run_until_disconnected()

    except Exception as e:
        print(f"❌ Bot hatası: {e}")
        update_bot_status(False, str(e)[:200])
        log_bot_message("error", "Bot hatası", str(e)[:500])
    finally:
        update_bot_status(False)
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
