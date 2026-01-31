import asyncio
import re
import psycopg2
import os
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from datetime import datetime
import pytz
import httpx

# —————— AYARLAR ——————
api_id = int(os.getenv('API_ID', '0'))
api_hash = os.getenv('API_HASH', '')
DATABASE_URL = os.getenv('DATABASE_URL')
SESSION_STRING = os.getenv('SESSION_STRING', '')
BOT_TOKEN = os.getenv('BOT_TOKEN', '')

# Kontroller
if not api_id or not api_hash:
    print("❌ HATA: API_ID ve API_HASH ayarlanmalı!")
if not DATABASE_URL:
    print("❌ HATA: DATABASE_URL ayarlanmalı!")
if not SESSION_STRING:
    print("⚠️ UYARI: SESSION_STRING ayarlanmamış!")
if not BOT_TOKEN:
    print("❌ HATA: BOT_TOKEN ayarlanmamış!")

# Timezone
istanbul_tz = pytz.timezone('Europe/Istanbul')

# Telegram Bot API
TELEGRAM_BOT_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

# —————— VERİTABANI ——————
def get_db_connection():
    conn = psycopg2.connect(DATABASE_URL)
    with conn.cursor() as cursor:
        cursor.execute("SET timezone = 'Europe/Istanbul'")
    conn.commit()
    return conn

# —————— DİNLEME KANALLARI ——————
def get_listening_channels():
    """Dinleme kanallarını al - sadece channel_id"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT channel_id FROM listening_channels")
        return [row[0] for row in cursor.fetchall()]

# —————— HEDEF KANALLAR ——————
def get_active_channels():
    """Aktif hedef kanalları al"""
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

# —————— ANAHTAR KELİMELER ——————
def get_all_keywords():
    """Anahtar kelimeleri al"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT keyword FROM keywords ORDER BY keyword")
        return [row[0].lower() for row in cursor.fetchall()]

# —————— YASAK KELİMELER ——————
def get_all_banned_words():
    """Yasak kelimeleri al"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT word FROM banned_words ORDER BY word")
        return [row[0].lower() for row in cursor.fetchall()]

def has_banned_word(code: str) -> bool:
    """Kod yasak kelime içeriyor mu?"""
    banned = get_all_banned_words()
    code_lower = code.lower()
    for word in banned:
        if word in code_lower:
            return True
    return False

# —————— LİNK ÖZELLEŞTİRME ——————
def get_channel_user_id(channel_id: int):
    """Kanalın aktif kullanıcısını al"""
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
    """Kullanıcının özel linkini al"""
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

def get_link_for_channel(channel_id: int, code: str, original_link: str) -> str:
    """Kanal için uygun linki al - önce özel link, yoksa orijinal"""
    user_id = get_channel_user_id(channel_id)
    if user_id:
        custom_link = get_custom_link(user_id, channel_id, code, original_link)
        if custom_link:
            return custom_link
    return original_link

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
    """Kodu gönderildi olarak işaretle"""
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
    """Eski kodları temizle"""
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
    """Log kaydet"""
    try:
        with get_db_connection() as db:
            cursor = db.cursor()
            cursor.execute("""
                INSERT INTO bot_logs (level, message, details, created_at)
                VALUES (%s, %s, %s, NOW() AT TIME ZONE 'Europe/Istanbul')
            """, (level, message, details))
            db.commit()
    except Exception as e:
        print(f"⚠️ Log hatası: {e}")

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
        print(f"⚠️ Status hatası: {e}")

# —————— TELETHON CLIENT ——————
if SESSION_STRING:
    client = TelegramClient(StringSession(SESSION_STRING), api_id, api_hash)
else:
    client = TelegramClient('bot_session', api_id, api_hash)

# —————— HTTP CLIENT ——————
http_client = httpx.AsyncClient(timeout=30.0)

# —————— TELEGRAM BOT API ——————
async def send_message_via_bot(chat_id: int, text: str) -> dict:
    """Bot API ile mesaj gönder"""
    if not BOT_TOKEN:
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
            print(f"❌ Gönderim hatası ({chat_id}): {error_desc}")
            return {"ok": False, "error": error_desc}

        return {"ok": True}
    except Exception as e:
        print(f"❌ HTTP hatası ({chat_id}): {e}")
        return {"ok": False, "error": str(e)}

# —————— YARDIMCI ——————
def normalize_channel_id(channel_id: int) -> int:
    """Kanal ID'sini normalize et"""
    if channel_id > 0:
        return int(f"-100{channel_id}")
    return channel_id

# —————— KOD GÖNDER ——————
async def send_to_all_channels(code: str, original_link: str):
    """Kodu tüm aktif kanallara gönder"""
    try:
        active_channels = get_active_channels()

        if not active_channels:
            print(f"⚠️ Aktif kanal yok! Kod gönderilemedi: {code}")
            log_bot_message("warning", f"Aktif kanal yok, kod gönderilemedi: {code}")
            return

        sent_count = 0
        error_count = 0

        for channel_id in active_channels:
            try:
                # Kanal için linki al (özel veya orijinal)
                final_link = get_link_for_channel(channel_id, code, original_link)
                message = f"`{code}`\n\n{final_link}"

                result = await send_message_via_bot(channel_id, message)

                if result.get("ok"):
                    record_code_stat(channel_id, code)
                    sent_count += 1
                else:
                    error_count += 1

                await asyncio.sleep(0.05)

            except Exception as e:
                error_count += 1
                print(f"❌ Gönderim hatası {channel_id}: {e}")

        if sent_count > 0:
            print(f"✅ Kod gönderildi: {code} | {sent_count}/{len(active_channels)} kanal")
            log_bot_message("info", f"Kod gönderildi: {code}", f"{sent_count} başarılı, {error_count} hata")
            cleanup_old_codes()

    except Exception as e:
        print(f"❌ Toplu gönderim hatası: {e}")
        log_bot_message("error", "Toplu gönderim hatası", str(e)[:500])

# —————— MESAJ İŞLEME ——————
async def process_message(event):
    """
    Mesajı işle - 2 format desteklenir:

    FORMAT 1 (3 satır - anahtar kelime ile):
    kelime
    KOD123
    https://link.com

    FORMAT 2 (2 satır - standart):
    KOD123
    https://link.com
    """
    try:
        text = event.message.message
        if not text:
            return

        text = text.strip()
        lines = [l.strip() for l in text.splitlines() if l.strip()]

        if len(lines) < 2:
            return

        # Anahtar kelimeler
        keywords = get_all_keywords()

        # Link regex - daha esnek
        link_pattern = r'^https?://[^\s]+$'

        # FORMAT 1: kelime\nkod\nlink (3 satır)
        if len(lines) >= 3:
            first_line = lines[0].lower()
            if first_line in keywords:
                code = lines[1].strip()
                link = lines[2].strip()

                # Kod kontrolü (alfanümerik + Türkçe + tire)
                if re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code) and re.match(link_pattern, link):
                    if has_banned_word(code):
                        print(f"🚫 Yasak kelime: {code}")
                        return

                    print(f"📡 FORMAT 1 | Kelime: {first_line} | Kod: {code}")

                    if mark_code_as_sent(code):
                        await send_to_all_channels(code, link)
                    else:
                        print(f"🔄 Tekrar: {code}")
                    return

        # FORMAT 2: kod\nlink (2 satır)
        code = lines[0].strip()
        link = lines[1].strip()

        # Kod kontrolü
        if re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code) and re.match(link_pattern, link):
            if has_banned_word(code):
                print(f"🚫 Yasak kelime: {code}")
                return

            print(f"📡 FORMAT 2 | Kod: {code}")

            if mark_code_as_sent(code):
                await send_to_all_channels(code, link)
            else:
                print(f"🔄 Tekrar: {code}")

    except Exception as e:
        print(f"❌ Mesaj işleme hatası: {e}")
        log_bot_message("error", "Mesaj işleme hatası", str(e)[:500])

# —————— ANA DİNLEYİCİ ——————
@client.on(events.NewMessage())
async def message_handler(event):
    """Dinleme kanallarından gelen mesajları işle"""
    try:
        if not event.chat:
            return

        current_channel_id = event.chat.id
        normalized_id = normalize_channel_id(current_channel_id)

        # Dinleme kanallarını kontrol et
        listening_channels = get_listening_channels()

        for lc_id in listening_channels:
            if normalized_id == lc_id or current_channel_id == lc_id:
                await process_message(event)
                break

    except Exception as e:
        print(f"❌ Handler hatası: {e}")

# —————— KEEP ALIVE ——————
async def keep_alive():
    """Bot'u canlı tut"""
    while True:
        try:
            await client.get_me()
            cleanup_old_codes()
            update_bot_status(True)
        except Exception as e:
            print(f"⚠️ Keep alive hatası: {e}")
            update_bot_status(True, str(e)[:200])
        await asyncio.sleep(300)

# —————— BAŞLANGIÇ ——————
async def main():
    """Bot'u başlat"""
    print("=" * 50)
    print("🤖 Telegram Kod Botu Başlatılıyor...")
    print("=" * 50)

    try:
        await client.start()
        update_bot_status(True)
        log_bot_message("info", "Bot başlatıldı")

        me = await client.get_me()
        print(f"✅ Telethon: {me.first_name} (@{me.username})")

        # Bot token kontrol
        if BOT_TOKEN:
            try:
                response = await http_client.get(f"{TELEGRAM_BOT_API}/getMe")
                bot_data = response.json()
                if bot_data.get("ok"):
                    print(f"✅ Bot API: @{bot_data['result'].get('username')}")
            except Exception as e:
                print(f"❌ Bot API hatası: {e}")

        # Dinleme kanallarını göster
        listening_channels = get_listening_channels()
        print(f"📡 Dinleme kanalları: {len(listening_channels)}")
        for ch in listening_channels:
            print(f"   • {ch}")

        # Aktif hedef kanalları göster
        active_channels = get_active_channels()
        print(f"📢 Hedef kanallar: {len(active_channels)}")

        # Anahtar kelimeleri göster
        keywords = get_all_keywords()
        print(f"🔑 Anahtar kelimeler: {keywords}")

        # Keep alive başlat
        asyncio.create_task(keep_alive())

        print("=" * 50)
        print("🚀 Bot çalışıyor!")
        print("=" * 50)

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
