import asyncio
import re
import psycopg2
import os
from telethon import TelegramClient, events
from telethon.errors import FloodWaitError, ChannelPrivateError, ChatAdminRequiredError
from telethon.tl import functions
from telethon.sessions import StringSession
from datetime import datetime
import pytz
import httpx

# —————— AYARLAR ——————
# Heroku Config Vars'tan alınacak
api_id = int(os.getenv('API_ID', '0'))
api_hash = os.getenv('API_HASH', '')
DATABASE_URL = os.getenv('DATABASE_URL')
SESSION_STRING = os.getenv('SESSION_STRING', '')
BOT_TOKEN = os.getenv('BOT_TOKEN', '')  # Telegram Bot Token (kod göndermek için)

# Gerekli değişkenleri kontrol et
if not api_id or not api_hash:
    print("❌ HATA: API_ID ve API_HASH environment variable'ları ayarlanmalı!")
    print("   Heroku Dashboard > Settings > Config Vars")
if not DATABASE_URL:
    print("❌ HATA: DATABASE_URL environment variable'ı ayarlanmalı!")
if not SESSION_STRING:
    print("⚠️ UYARI: SESSION_STRING ayarlanmamış. Heroku'da çalışmaz!")
if not BOT_TOKEN:
    print("❌ HATA: BOT_TOKEN ayarlanmamış! Kodlar kanallara gönderilemez!")

# Timezone
istanbul_tz = pytz.timezone('Europe/Istanbul')

# Telegram Bot API base URL
TELEGRAM_BOT_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

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
    """Tüm dinleme kanallarını al - her zaman aktif"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            SELECT channel_id, COALESCE(default_link, 'https://example.com'),
                   COALESCE(keyword, ''), COALESCE(type, 'text'), COALESCE(triggers, '')
            FROM listening_channels
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

# —————— KANALA KATILMA (SADECE DİNLEME İÇİN) ——————
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

# —————— TELETHON CLIENT (SADECE DİNLEME İÇİN) ——————
if SESSION_STRING:
    client = TelegramClient(StringSession(SESSION_STRING), api_id, api_hash)
    print("✅ Telethon: StringSession ile başlatılıyor (SADECE DİNLEME)...")
else:
    client = TelegramClient('bot_session', api_id, api_hash)
    print("⚠️ Telethon: Dosya session ile başlatılıyor (sadece yerel test için)...")

# —————— HTTP CLIENT (BOT API İÇİN) ——————
http_client = httpx.AsyncClient(timeout=30.0)

# —————— TELEGRAM BOT API FONKSİYONLARI ——————
async def send_message_via_bot(chat_id: int, text: str) -> dict:
    """Telegram Bot API ile mesaj gönder"""
    if not BOT_TOKEN:
        print("❌ BOT_TOKEN ayarlanmamış!")
        return {"ok": False, "error": "BOT_TOKEN not set"}

    try:
        url = f"{TELEGRAM_BOT_API}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True
        }

        response = await http_client.post(url, json=payload)
        result = response.json()

        if not result.get("ok"):
            error_desc = result.get("description", "Unknown error")
            print(f"❌ Bot API hatası ({chat_id}): {error_desc}")
            return {"ok": False, "error": error_desc}

        return {"ok": True}

    except Exception as e:
        print(f"❌ HTTP hatası ({chat_id}): {e}")
        return {"ok": False, "error": str(e)}

async def check_bot_in_channel(chat_id: int) -> dict:
    """Bot'un kanalda olup olmadığını kontrol et"""
    if not BOT_TOKEN:
        return {"ok": False, "error": "BOT_TOKEN not set"}

    try:
        url = f"{TELEGRAM_BOT_API}/getChat"
        payload = {"chat_id": chat_id}

        response = await http_client.post(url, json=payload)
        result = response.json()

        return result

    except Exception as e:
        return {"ok": False, "error": str(e)}

# —————— YARDIMCI FONKSİYONLAR ——————
def normalize_channel_id(channel_id: int) -> int:
    """Kanal ID'sini normalize et (-100 prefix ekle)"""
    if channel_id > 0:
        return int(f"-100{channel_id}")
    return channel_id

async def join_listening_channel_if_needed(channel_id: int) -> bool:
    """Dinleme kanalına Telethon ile katıl (sadece dinleme için)"""
    try:
        if is_channel_joined(channel_id):
            return True

        try:
            entity = await client.get_entity(channel_id)
            await client(functions.channels.JoinChannelRequest(channel_id))
            mark_channel_joined(channel_id)

            print(f"📥 [Telethon] Dinleme kanalına katıldı: {channel_id}")
            log_bot_message("info", f"Dinleme kanalına katıldı: {channel_id}")
            return True

        except ChannelPrivateError:
            error_msg = "Kanal özel veya davet gerekli"
            print(f"⚠️ {error_msg}: {channel_id}")
            log_bot_message("warning", f"Dinleme kanalına katılamadı: {channel_id}", error_msg)
            return False

        except ChatAdminRequiredError:
            error_msg = "Admin yetkisi gerekli"
            print(f"⚠️ {error_msg}: {channel_id}")
            log_bot_message("warning", f"Dinleme kanalına katılamadı: {channel_id}", error_msg)
            return False

        except Exception as e:
            error_msg = str(e)[:200]
            print(f"⚠️ Dinleme kanalına katılamadı {channel_id}: {e}")
            log_bot_message("error", f"Dinleme kanal katılım hatası: {channel_id}", error_msg)
            return False

    except Exception as e:
        print(f"⚠️ Dinleme kanal katılım hatası {channel_id}: {e}")
        return False

async def verify_bot_in_target_channels():
    """Bot'un hedef kanallarda olup olmadığını kontrol et"""
    try:
        target_channels = get_all_target_channels()

        for channel_id, is_joined in target_channels:
            result = await check_bot_in_channel(channel_id)

            if result.get("ok"):
                if not is_joined:
                    update_channel_join_status(channel_id, True)
                    print(f"✅ [Bot] Kanal doğrulandı: {channel_id}")
            else:
                error = result.get("error", "Unknown")
                if is_joined:
                    update_channel_join_status(channel_id, False, f"Bot kanalda değil: {error}")
                print(f"⚠️ [Bot] Kanal erişilemiyor: {channel_id} - {error}")

            await asyncio.sleep(0.5)  # Rate limit için bekle

    except Exception as e:
        print(f"❌ Hedef kanal kontrol hatası: {e}")
        log_bot_message("error", "Hedef kanal kontrol hatası", str(e)[:500])

# —————— KOD GÖNDERİM (TELEGRAM BOT API İLE) ——————
async def send_to_all_channels(code: str, default_link: str):
    """Kodu tüm aktif kanallara TELEGRAM BOT ile gönder"""
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

                # Telegram Bot API ile gönder
                result = await send_message_via_bot(channel_id, message)

                if result.get("ok"):
                    # İstatistik kaydet
                    record_code_stat(channel_id, code)
                    sent_count += 1
                else:
                    error_count += 1
                    error_msg = result.get("error", "Unknown")

                    # Bot kanalda değilse veritabanını güncelle
                    if "chat not found" in error_msg.lower() or "bot is not a member" in error_msg.lower():
                        update_channel_join_status(channel_id, False, error_msg)

                    log_bot_message("error", f"Gönderim hatası: {channel_id}", error_msg)

                await asyncio.sleep(0.05)  # Rate limit için kısa bekleme

            except Exception as e:
                error_count += 1
                print(f"❌ Gönderim hatası {channel_id}: {e}")
                log_bot_message("error", f"Gönderim hatası: {channel_id}", str(e)[:200])

        if sent_count > 0:
            print(f"✅ [Bot API] Dağıtım: {sent_count}/{len(active_channels)} kanal | Kod: {code}")
            log_bot_message("info", f"Kod dağıtıldı: {code}", f"{sent_count} kanal başarılı, {error_count} hata")
            cleanup_old_codes()

    except Exception as e:
        print(f"❌ Toplu gönderim hatası: {e}")
        log_bot_message("error", "Toplu gönderim hatası", str(e)[:500])

# —————— MESAJ İŞLEME ——————
async def process_message(event, listening_channel_id: int, default_link: str, keyword: str):
    """Mesajı işle ve kod varsa TELEGRAM BOT ile gönder"""
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

# —————— ANA DİNLEYİCİ (TELETHON) ——————
@client.on(events.NewMessage())
async def message_handler(event):
    """Tüm mesajları Telethon ile dinle"""
    try:
        if not event.chat:
            return

        current_channel_id = event.chat.id
        normalized_id = normalize_channel_id(current_channel_id)

        # Aktif dinleme kanallarını kontrol et
        listening_channels = get_listening_channels()

        for lc_id, default_link, keyword, lc_type, triggers in listening_channels:
            if normalized_id == lc_id or current_channel_id == lc_id:
                await process_message(event, lc_id, default_link, keyword)
                break

    except Exception as e:
        print(f"❌ Handler hatası: {e}")

# —————— KEEP ALIVE & SYNC ——————
async def keep_alive():
    """Bot'u canlı tut, eski kodları temizle ve kanalları kontrol et"""
    while True:
        try:
            await client.get_me()
            cleanup_old_codes()
            update_bot_status(True)

            # Her 5 dakikada bir hedef kanalları kontrol et
            await verify_bot_in_target_channels()

        except Exception as e:
            print(f"⚠️ Keep alive hatası: {e}")
            update_bot_status(True, str(e)[:200])

        await asyncio.sleep(300)  # 5 dakikada bir

# —————— BAŞLANGIÇ ——————
async def main():
    """Bot'u başlat"""
    print("=" * 60)
    print("🤖 Telegram Kod Botu v2.0 başlatılıyor...")
    print("=" * 60)
    print("📋 Mimari:")
    print("   • Telethon (Kişisel Hesap) → Sadece DINLEME")
    print("   • Telegram Bot API → Kod GÖNDERME")
    print("-" * 60)
    print("⚠️ ÖNEMLİ: Bot'u hedef kanallara ADMIN olarak ekleyin!")
    print("-" * 60)

    try:
        # Telethon client başlat (dinleme için)
        await client.start()
        update_bot_status(True)
        log_bot_message("info", "Bot başlatıldı (v2.0 - Ayrılmış Mimari)")

        me = await client.get_me()
        print(f"✅ [Telethon] Giriş yapıldı: {me.first_name} (@{me.username})")

        # Bot token kontrol
        if BOT_TOKEN:
            # Bot bilgilerini al
            try:
                bot_info_url = f"{TELEGRAM_BOT_API}/getMe"
                response = await http_client.get(bot_info_url)
                bot_data = response.json()
                if bot_data.get("ok"):
                    bot_username = bot_data["result"].get("username", "Unknown")
                    print(f"✅ [Bot API] Bot aktif: @{bot_username}")
                else:
                    print(f"❌ [Bot API] Bot doğrulanamadı: {bot_data}")
            except Exception as e:
                print(f"❌ [Bot API] Bağlantı hatası: {e}")
        else:
            print("❌ [Bot API] BOT_TOKEN ayarlanmamış!")

        # Dinleme kanallarına Telethon ile katıl
        listening_channels = get_listening_channels()
        print(f"\n📡 Dinleme kanalları: {len(listening_channels)}")

        for channel_id, default_link, keyword, lc_type, triggers in listening_channels:
            await join_listening_channel_if_needed(channel_id)
            await asyncio.sleep(0.5)

        # Hedef kanalları kontrol et (Bot API ile)
        print(f"\n🔄 Hedef kanallar kontrol ediliyor...")
        await verify_bot_in_target_channels()

        # Aktif hedef kanalları göster
        active_channels = get_active_channels()
        print(f"📢 Aktif hedef kanalları: {len(active_channels)}")

        # Keep alive task başlat
        asyncio.create_task(keep_alive())

        print("-" * 60)
        print("🚀 Bot çalışıyor!")
        print("   • Telethon dinliyor...")
        print("   • Kodlar Bot API ile gönderiliyor...")
        print("=" * 60)

        await client.run_until_disconnected()

    except Exception as e:
        print(f"❌ Bot hatası: {e}")
        update_bot_status(False, str(e)[:200])
        log_bot_message("error", "Bot hatası", str(e)[:500])
    finally:
        update_bot_status(False)
        await http_client.aclose()
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
