import asyncio
import re
import psycopg2
from psycopg2 import pool
import os
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from datetime import datetime
import pytz
import httpx
import traceback

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

# —————— CONNECTION POOL ——————
# Thread-safe connection pool - minimum 2, maximum 10 connection
connection_pool = None

def init_connection_pool():
    """Connection pool'u başlat"""
    global connection_pool
    try:
        connection_pool = pool.ThreadedConnectionPool(
            minconn=2,
            maxconn=10,
            dsn=DATABASE_URL
        )
        print("✅ Connection pool başlatıldı")
    except Exception as e:
        print(f"❌ Connection pool hatası: {e}")
        raise

def get_db_connection():
    """Pool'dan connection al"""
    global connection_pool
    if connection_pool is None:
        init_connection_pool()
    try:
        conn = connection_pool.getconn()
        with conn.cursor() as cursor:
            cursor.execute("SET timezone = 'Europe/Istanbul'")
        conn.commit()
        return conn
    except Exception as e:
        print(f"❌ DB BAĞLANTI HATASI: {e}")
        raise

def release_db_connection(conn):
    """Connection'ı pool'a geri ver"""
    global connection_pool
    if connection_pool and conn:
        try:
            connection_pool.putconn(conn)
        except Exception as e:
            print(f"⚠️ Connection release hatası: {e}")

# —————— DİNLEME KANALLARI ——————
def get_listening_channels():
    """Dinleme kanallarını al - sadece channel_id"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT channel_id FROM listening_channels")
        result = [row[0] for row in cursor.fetchall()]
        return result
    except Exception as e:
        print(f"❌ get_listening_channels HATASI: {e}")
        return []
    finally:
        if conn:
            release_db_connection(conn)

# —————— HEDEF KANALLAR ——————
def get_active_channels():
    """Aktif hedef kanalları al"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
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
        result = [row[0] for row in cursor.fetchall()]
        return result
    except Exception as e:
        print(f"❌ get_active_channels HATASI: {e}")
        return []
    finally:
        if conn:
            release_db_connection(conn)

# —————— ANAHTAR KELİMELER ——————
def get_all_keywords():
    """Anahtar kelimeleri al"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT keyword FROM keywords ORDER BY keyword")
        result = [row[0].lower() for row in cursor.fetchall()]
        return result
    except Exception as e:
        print(f"❌ get_all_keywords HATASI: {e}")
        return []
    finally:
        if conn:
            release_db_connection(conn)

# —————— YASAK KELİMELER ——————
def get_all_banned_words():
    """Yasak kelimeleri al"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT word FROM banned_words ORDER BY word")
        result = [row[0].lower() for row in cursor.fetchall()]
        return result
    except Exception as e:
        print(f"❌ get_all_banned_words HATASI: {e}")
        return []
    finally:
        if conn:
            release_db_connection(conn)

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
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
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
    except Exception as e:
        print(f"❌ get_channel_user_id HATASI: {e}")
        return None
    finally:
        if conn:
            release_db_connection(conn)

def get_custom_link(user_id: int, channel_id: int, code: str, original_link: str) -> str:
    """Kullanıcının özel linkini al"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT link_url FROM admin_links
            WHERE user_id = %s AND channel_id = %s
            AND (%s ILIKE '%%' || link_code || '%%' OR %s ILIKE '%%' || link_code || '%%')
            ORDER BY LENGTH(link_code) DESC
            LIMIT 1
        """, (user_id, channel_id, code, original_link))
        result = cursor.fetchone()
        return result[0] if result else None
    except Exception as e:
        print(f"❌ get_custom_link HATASI: {e}")
        return None
    finally:
        if conn:
            release_db_connection(conn)

def get_link_for_channel(channel_id: int, code: str, original_link: str) -> str:
    """Kanal için uygun linki al - önce özel link, yoksa orijinal"""
    user_id = get_channel_user_id(channel_id)
    if user_id:
        custom_link = get_custom_link(user_id, channel_id, code, original_link)
        if custom_link:
            return custom_link
    return original_link

# —————— KOD KONTROLÜ (RACE CONDITION DÜZELTİLDİ) ——————
def is_code_recently_sent(code: str) -> bool:
    """Son 1 saat içinde kod gönderilmiş mi?"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 1 FROM sent_codes
            WHERE code = %s AND sent_at > (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'
        """, (code,))
        result = cursor.fetchone() is not None
        return result
    except Exception as e:
        print(f"❌ is_code_recently_sent HATASI: {e}")
        return False
    finally:
        if conn:
            release_db_connection(conn)

def mark_code_as_sent(code: str) -> bool:
    """Kodu gönderildi olarak işaretle - Race condition için SERIALIZABLE isolation kullan"""
    conn = None
    try:
        conn = get_db_connection()
        # Transaction isolation level'ı SERIALIZABLE yap - race condition önleme
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_SERIALIZABLE)
        cursor = conn.cursor()

        try:
            # Tek sorguda kontrol ve insert - atomik işlem
            cursor.execute("""
                INSERT INTO sent_codes (code, sent_at)
                SELECT %s, NOW() AT TIME ZONE 'Europe/Istanbul'
                WHERE NOT EXISTS (
                    SELECT 1 FROM sent_codes
                    WHERE code = %s
                    AND sent_at > (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'
                )
                ON CONFLICT (code) DO UPDATE
                SET sent_at = CASE
                    WHEN sent_codes.sent_at <= (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'
                    THEN NOW() AT TIME ZONE 'Europe/Istanbul'
                    ELSE sent_codes.sent_at
                END
                RETURNING code
            """, (code, code))

            result = cursor.fetchone()
            conn.commit()

            # Eğer sonuç varsa, yeni kayıt eklendi veya güncellendi
            return result is not None

        except psycopg2.Error as e:
            conn.rollback()
            # Serialization failure durumunda - başka bir process aynı kodu ekledi
            if e.pgcode == '40001':  # serialization_failure
                print(f"🔄 Concurrent insert algılandı: {code}")
                return False
            raise

    except Exception as e:
        print(f"❌ mark_code_as_sent HATASI: {e}")
        if conn:
            try:
                conn.rollback()
            except:
                pass
        return False
    finally:
        if conn:
            # Isolation level'ı varsayılana döndür
            try:
                conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_READ_COMMITTED)
            except:
                pass
            release_db_connection(conn)

def cleanup_old_codes():
    """Eski kodları temizle"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            DELETE FROM sent_codes
            WHERE sent_at < (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'
        """)
        conn.commit()
    except Exception as e:
        print(f"❌ cleanup_old_codes HATASI: {e}")
    finally:
        if conn:
            release_db_connection(conn)

# —————— İSTATİSTİK ——————
def record_code_stat(channel_id: int, code: str):
    """Kod istatistiğini kaydet"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        now = datetime.now(istanbul_tz)
        today = now.date()
        cursor.execute("""
            INSERT INTO channel_stats (channel_id, stat_date, daily_count, last_updated)
            VALUES (%s, %s, 1, %s)
            ON CONFLICT (channel_id, stat_date) DO UPDATE
            SET daily_count = channel_stats.daily_count + 1,
                last_updated = %s
        """, (channel_id, today, now, now))
        conn.commit()
    except Exception as e:
        print(f"❌ record_code_stat HATASI: {e}")
    finally:
        if conn:
            release_db_connection(conn)

# —————— BOT LOG ——————
def log_bot_message(level: str, message: str, details: str = None):
    """Log kaydet"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO bot_logs (level, message, details, created_at)
            VALUES (%s, %s, %s, NOW() AT TIME ZONE 'Europe/Istanbul')
        """, (level, message, details))
        conn.commit()
    except Exception as e:
        print(f"⚠️ Log hatası: {e}")
    finally:
        if conn:
            release_db_connection(conn)

def update_bot_status(is_running: bool, error: str = None):
    """Bot durumunu güncelle"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
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
        conn.commit()
    except Exception as e:
        print(f"⚠️ Status hatası: {e}")
    finally:
        if conn:
            release_db_connection(conn)

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
            error_code = result.get("error_code", "N/A")
            print(f"❌ Gönderim hatası ({chat_id}): [{error_code}] {error_desc}")
            return {"ok": False, "error": error_desc, "error_code": error_code}

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
async def send_to_single_channel(channel_id: int, code: str, original_link: str) -> dict:
    """Tek kanala kod gönder (paralel gönderim için)"""
    try:
        final_link = get_link_for_channel(channel_id, code, original_link)
        message = f"`{code}`\n\n{final_link}"

        result = await send_message_via_bot(channel_id, message)

        if result.get("ok"):
            record_code_stat(channel_id, code)
            return {"channel_id": channel_id, "success": True}
        else:
            return {"channel_id": channel_id, "success": False, "error": result.get('error')}
    except Exception as e:
        print(f"❌ Gönderim hatası {channel_id}: {e}")
        return {"channel_id": channel_id, "success": False, "error": str(e)}

async def send_to_all_channels(code: str, original_link: str):
    """Kodu tüm aktif kanallara PARALEL olarak gönder"""
    try:
        active_channels = get_active_channels()

        if not active_channels:
            print(f"⚠️ Aktif kanal yok! Kod gönderilemedi: {code}")
            log_bot_message("warning", f"Aktif kanal yok, kod gönderilemedi: {code}")
            return

        print(f"🚀 {len(active_channels)} kanala gönderim başlıyor: {code}")

        # Tüm kanallara paralel gönderim
        tasks = [
            send_to_single_channel(channel_id, code, original_link)
            for channel_id in active_channels
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Sonuçları say
        sent_count = 0
        error_count = 0

        for result in results:
            if isinstance(result, Exception):
                error_count += 1
            elif result.get("success"):
                sent_count += 1
            else:
                error_count += 1

        if sent_count > 0:
            print(f"✅ Kod gönderildi: {code} | {sent_count}/{len(active_channels)} kanal")
            log_bot_message("info", f"Kod gönderildi: {code}", f"{sent_count} başarılı, {error_count} hata")
            cleanup_old_codes()
        else:
            print(f"❌ Kod hiçbir kanala gönderilemedi: {code}")

    except Exception as e:
        print(f"❌ Toplu gönderim hatası: {e}")
        log_bot_message("error", "Toplu gönderim hatası", str(e)[:500])

# —————— MESAJ İŞLEME ——————
async def process_message(event):
    """
    Mesajı işle - 2 format desteklenir
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

        # Link regex - daha kapsamlı URL pattern
        # Desteklenen formatlar:
        # - https://example.com/path
        # - http://example.com
        # - www.example.com/path
        # - example.com (TLD ile)
        # - subdomain.example.com
        # - URL'ler query string ve fragment içerebilir
        link_pattern = r'^(?:https?://)?(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+(?:/[^\s]*)?$'

        # FORMAT 1: kelime\nkod\nlink (3 satır)
        if len(lines) >= 3:
            first_line = lines[0].lower()

            if first_line in keywords:
                code = lines[1].strip()
                link = lines[2].strip()

                # Kod kontrolü (alfanümerik + Türkçe + tire)
                code_match = re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code)
                link_match = re.match(link_pattern, link, re.IGNORECASE)

                if code_match and link_match:
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
        code_match = re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code)
        link_match = re.match(link_pattern, link, re.IGNORECASE)

        if code_match and link_match:
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

# —————— DİNLEME KANALLARI CACHE ——————
listening_channels_cache = []
cache_last_update = 0

def get_listening_channels_cached():
    """Dinleme kanallarını cache'den al (her 60 saniyede güncelle)"""
    global listening_channels_cache, cache_last_update
    import time
    now = time.time()
    if now - cache_last_update > 60:
        listening_channels_cache = get_listening_channels()
        cache_last_update = now
    return listening_channels_cache

# —————— ANA DİNLEYİCİ ——————
@client.on(events.NewMessage())
async def message_handler(event):
    """Sadece dinleme kanallarından gelen mesajları işle"""
    try:
        if not event.chat:
            return

        current_channel_id = event.chat.id
        normalized_id = normalize_channel_id(current_channel_id)

        # Dinleme kanallarını kontrol et
        listening_channels = get_listening_channels_cached()

        # Sadece dinleme kanallarındaki mesajları işle
        for lc_id in listening_channels:
            if normalized_id == lc_id or current_channel_id == lc_id:
                await process_message(event)
                break

    except Exception as e:
        print(f"❌ Handler hatası: {e}")

# —————— KEEP ALIVE ——————
async def keep_alive():
    """Bot'u canlı tut"""
    global listening_channels_cache, cache_last_update
    import time
    while True:
        try:
            await client.get_me()
            cleanup_old_codes()
            update_bot_status(True)
            # Cache'i güncelle
            listening_channels_cache = get_listening_channels()
            cache_last_update = time.time()
        except Exception as e:
            print(f"⚠️ Keep alive hatası: {e}")
            update_bot_status(True, str(e)[:200])
        await asyncio.sleep(300)

# —————— BAŞLANGIÇ ——————
async def main():
    """Bot'u başlat"""
    print("=" * 60)
    print("🤖 Telegram Kod Botu Başlatılıyor...")
    print("=" * 60)

    try:
        # Connection pool'u başlat
        init_connection_pool()

        await client.start()
        update_bot_status(True)
        log_bot_message("info", "Bot başlatıldı")

        me = await client.get_me()
        print(f"✅ Telethon: {me.first_name} (@{me.username}) [ID: {me.id}]")

        # Bot token kontrol
        if BOT_TOKEN:
            try:
                response = await http_client.get(f"{TELEGRAM_BOT_API}/getMe")
                bot_data = response.json()
                if bot_data.get("ok"):
                    print(f"✅ Bot API: @{bot_data['result'].get('username')} [ID: {bot_data['result'].get('id')}]")
                else:
                    print(f"❌ Bot API hatası: {bot_data}")
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

        print("")
        print("=" * 60)
        print("🚀 Bot çalışıyor! Mesajlar bekleniyor...")
        print("=" * 60)
        print("")

        await client.run_until_disconnected()

    except Exception as e:
        print(f"❌ Bot hatası: {e}")
        update_bot_status(False, str(e)[:200])
        log_bot_message("error", "Bot hatası", str(e)[:500])
    finally:
        update_bot_status(False)
        await http_client.aclose()
        await client.disconnect()
        # Connection pool'u kapat
        if connection_pool:
            connection_pool.closeall()
            print("✅ Connection pool kapatıldı")

if __name__ == "__main__":
    asyncio.run(main())
