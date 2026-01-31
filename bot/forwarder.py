import asyncio
import re
import psycopg2
import os
from telethon import TelegramClient, events
from telethon.errors import FloodWaitError
from telethon.tl import functions
from telethon.sessions import StringSession
from datetime import datetime
import pytz

# Environment variables
api_id = int(os.getenv('API_ID', '23134050'))
api_hash = os.getenv('API_HASH', 'a03e2a029f42a96707c9555c5eee95ae')
DATABASE_URL = os.getenv('DATABASE_URL')
SESSION_STRING = os.getenv('SESSION_STRING', '')

# Timezone
istanbul_tz = pytz.timezone('Europe/Istanbul')

# —————— DATABASE FUNCTIONS ——————
def get_db_connection():
    conn = psycopg2.connect(DATABASE_URL)
    with conn.cursor() as cursor:
        cursor.execute("SET timezone = 'Europe/Istanbul'")
    conn.commit()
    return conn

def get_all_channels():
    """Tüm kanalları al (paused durumları ile)"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT channel_id, paused FROM channels")
        return cursor.fetchall()

def get_listening_channels():
    """Grup dinleme kanallarını al (sadece eski kodtime formatı)"""
    with get_db_connection() as db:
        cursor = db.cursor()
        # keyword boş olanlar = eski kodtime formatı
        cursor.execute("SELECT channel_id, COALESCE(default_link, 'https://example.com') FROM listening_channels WHERE keyword = '' OR keyword IS NULL")
        return cursor.fetchall()

def get_admin_for_channel(channel_id: int):
    """Kanalın adminini al"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT admin_id FROM channel_admins WHERE channel_id = %s LIMIT 1", (channel_id,))
        result = cursor.fetchone()
        return result[0] if result else None

def get_custom_link_for_code(admin_id: int, channel_id: int, code: str, original_link: str = ''):
    """Admin'in kod veya link için özel linki al (büyük-küçük harf duyarlı değil)"""
    with get_db_connection() as db:
        cursor = db.cursor()
        # Kod veya link içinde link_code varsa eşleştir
        cursor.execute("""
            SELECT link_url FROM admin_links
            WHERE admin_id = %s AND channel_id = %s
            AND (%s ILIKE '%' || link_code || '%' OR %s ILIKE '%' || link_code || '%')
            ORDER BY LENGTH(link_code) DESC
            LIMIT 1
        """, (admin_id, channel_id, code, original_link))
        result = cursor.fetchone()
        return result[0] if result else None

def get_link_for_channel(target_channel_id: int, code: str, default_link: str):
    """Kanal için link al (önce admin özelleştirmesi, sonra default)"""
    # Admin'in özel linkine bak
    admin_id = get_admin_for_channel(target_channel_id)
    if admin_id:
        custom_link = get_custom_link_for_code(admin_id, target_channel_id, code, default_link)
        if custom_link:
            return custom_link

    # Özel link yoksa default link
    return default_link

def is_code_recently_sent(code: str) -> bool:
    """Son 1 saat içinde kod gönderilmiş mi?"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            SELECT 1 FROM sent_codes
            WHERE code = %s
            AND sent_at > (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'
        """, (code,))
        return cursor.fetchone() is not None

def mark_code_as_sent(code: str) -> bool:
    """Kodu gönderildi olarak işaretle (atomik)"""
    with get_db_connection() as db:
        cursor = db.cursor()
        # Atomik kontrol
        cursor.execute("""
            SELECT 1 FROM sent_codes
            WHERE code = %s
            AND sent_at > (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'
            FOR UPDATE
        """, (code,))

        if cursor.fetchone():
            return False  # Zaten gönderilmiş

        # Yoksa ekle
        cursor.execute("""
            INSERT INTO sent_codes (code, sent_at)
            VALUES (%s, NOW() AT TIME ZONE 'Europe/Istanbul')
            ON CONFLICT (code) DO UPDATE
            SET sent_at = NOW() AT TIME ZONE 'Europe/Istanbul'
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

async def join_channel_if_needed(client, channel_id: int):
    """Kanala katılma (gerekiyorsa)"""
    try:
        with get_db_connection() as db:
            cursor = db.cursor()
            cursor.execute("SELECT 1 FROM joined_channels WHERE channel_id = %s", (channel_id,))
            if cursor.fetchone():
                return True

        try:
            await client.get_entity(channel_id)
            await client(functions.channels.JoinChannelRequest(channel_id))
            print(f"📥 Joined channel: {channel_id}")

            with get_db_connection() as db:
                cursor = db.cursor()
                cursor.execute("""
                    INSERT INTO joined_channels (channel_id)
                    VALUES (%s)
                    ON CONFLICT (channel_id) DO NOTHING
                """, (channel_id,))
                db.commit()
            return True
        except Exception as e:
            print(f"⚠️ Could not join channel {channel_id}: {e}")
            return False
    except Exception as e:
        print(f"⚠️ Channel join check error {channel_id}: {e}")
        return False

# —————— MESSAGE PROCESSING ——————
async def process_old_format(client, event, current_channel_id):
    """ESKİ KODTIME FORMATI: Kod ve Link satırları"""
    try:
        text_raw = event.message.message.strip()
        listening_channels = get_listening_channels()

        for listening_id, default_link in listening_channels:
            # Normalize channel ID
            if current_channel_id > 0:
                normalized_current = int(f"-100{current_channel_id}")
            else:
                normalized_current = current_channel_id

            if normalized_current == listening_id:
                # Eski format kontrolü
                lines = [l.strip() for l in text_raw.splitlines() if l.strip()]
                if len(lines) >= 2:
                    code_line = lines[0]
                    link_line = lines[1]

                    # Format kontrolü: kod (alfanumerik) + link (http)
                    if re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code_line) and \
                       re.match(r'^https?://[\w\.-]+\.[a-z]{2,}(/.*)?$', link_line):

                        promo_code = code_line
                        actual_link = link_line

                        print(f"📡 GRUP DİNLEME | Kod: {promo_code} | Link: {actual_link}")

                        # Atomik kontrol ve işaretleme
                        if mark_code_as_sent(promo_code):
                            await send_to_all_channels(client, promo_code, actual_link)
                            print(f"✅ Kod gönderildi: {promo_code}")
                        else:
                            print(f"🚫 Kod tekrarı: {promo_code}")

                        break

    except Exception as e:
        print(f"❌ Old format processing error: {e}")

async def send_to_all_channels(client, code: str, default_link: str):
    """Kodu tüm kanallara gönder ve istatistik kaydet (link özelleştirme ile)"""
    try:
        channels = get_all_channels()
        active_channels = [(ch, paused) for ch, paused in channels if not paused]

        if not active_channels:
            print(f"⚠️ No active channels")
            return

        sent_count = 0

        for ch, _ in active_channels:
            try:
                # Her kanal için uygun linki al (admin özelleştirmesi varsa onu kullan)
                final_link = get_link_for_channel(ch, code, default_link)
                message = f"`{code}`\n\n{final_link}"

                await client.send_message(ch, message, link_preview=False)

                # İstatistik kaydet
                record_code_stat(ch, code)

                sent_count += 1
                await asyncio.sleep(0.1)
            except Exception as e:
                print(f"❌ Send error to {ch}: {e}")

        if sent_count > 0:
            print(f"✅ Distribution: {sent_count}/{len(active_channels)} channels | Code: {code}")
            cleanup_old_codes()

    except Exception as e:
        print(f"❌ Send to all channels error: {e}")

# —————— MAIN FORWARDER ——————
async def run_forwarder():
    """Ana forwarder"""
    # Heroku için StringSession kullan
    if SESSION_STRING:
        client = TelegramClient(StringSession(SESSION_STRING), api_id, api_hash)
        print("✅ Forwarder StringSession ile başlatılıyor...")
    else:
        # Yerel test için
        client = TelegramClient('lalaker', api_id, api_hash)
        print("⚠️ Forwarder dosya session ile başlatılıyor...")

    try:
        await client.start()
        print("🚀 Forwarder started (GRUP DİNLEME)")

        # Join all listening channels
        listening_channels = get_listening_channels()
        for channel_id, _ in listening_channels:
            await join_channel_if_needed(client, channel_id)
            await asyncio.sleep(0.1)

        @client.on(events.NewMessage())
        async def handler(event):
            try:
                current_channel_id = event.chat.id
                await process_old_format(client, event, current_channel_id)
            except Exception as e:
                print(f"❌ Message processing error: {e}")

        # Keep alive & cleanup task
        async def keep_alive():
            while True:
                try:
                    await client.get_me()
                    cleanup_old_codes()
                except Exception:
                    pass
                await asyncio.sleep(1500)

        asyncio.create_task(keep_alive())

        print("🎧 Forwarder listening...")
        await client.run_until_disconnected()

    except Exception as e:
        print(f"❌ Forwarder error: {e}")
    finally:
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(run_forwarder())
