import asyncio
import re
import psycopg2
import os
from telethon import TelegramClient, events
from telethon.errors import FloodWaitError, UserPrivacyRestrictedError
from telethon.tl import functions
from telethon.sessions import StringSession
from datetime import datetime, timedelta
import pytz
import time
import base64
import requests
import subprocess
import tempfile
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
import concurrent.futures

# —————— AYARLAR ——————
api_id = int(os.getenv('API_ID', '23134050'))
api_hash = os.getenv('API_HASH', 'a03e2a029f42a96707c9555c5eee95ae')
SUPER_ADMIN = int(os.getenv('SUPER_ADMIN_ID', '5725763398'))
DATABASE_URL = os.getenv('DATABASE_URL')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
SESSION_STRING = os.getenv('SESSION_STRING', '')

# Timezone
istanbul_tz = pytz.timezone('Europe/Istanbul')

# State storage (soru-cevap için)
user_states = {}

# ThreadPoolExecutor for video processing
executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)

# —————— VERİTABANI ——————
def get_db_connection():
    conn = psycopg2.connect(DATABASE_URL)
    with conn.cursor() as cursor:
        cursor.execute("SET timezone = 'Europe/Istanbul'")
    conn.commit()
    return conn

def init_db():
    """Veritabanı tablolarını oluştur"""
    try:
        with get_db_connection() as db:
            cursor = db.cursor()

            # Kanallar tablosu
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS channels (
                channel_id BIGINT PRIMARY KEY,
                paused INTEGER DEFAULT 0
            );
            ''')

            # Kanal adminleri
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS channel_admins (
                channel_id BIGINT,
                admin_id BIGINT,
                admin_username TEXT,
                admin_type TEXT DEFAULT 'ana',
                PRIMARY KEY (channel_id, admin_id),
                FOREIGN KEY(channel_id) REFERENCES channels(channel_id)
            );
            ''')

            # Dinleme kanalları
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS listening_channels (
                channel_id BIGINT PRIMARY KEY,
                keyword TEXT DEFAULT '',
                default_link TEXT DEFAULT 'https://example.com',
                type TEXT DEFAULT 'text',
                triggers TEXT DEFAULT ''
            );
            ''')

            # Özel linkler
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS custom_links (
                listening_channel_id BIGINT,
                target_channel_id BIGINT,
                custom_link TEXT NOT NULL,
                PRIMARY KEY (listening_channel_id, target_channel_id),
                FOREIGN KEY(listening_channel_id) REFERENCES listening_channels(channel_id)
            );
            ''')

            # Link özelleştirmeleri (admin bazlı - YENİ SİSTEM)
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS admin_links (
                admin_id BIGINT,
                channel_id BIGINT,
                link_code TEXT NOT NULL,
                link_url TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Europe/Istanbul'),
                PRIMARY KEY (admin_id, channel_id, link_code)
            );
            ''')

            # Gönderilen kodlar
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS sent_codes (
                code TEXT PRIMARY KEY,
                sent_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Europe/Istanbul')
            );
            ''')

            # Katılınan kanallar
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS joined_channels (
                channel_id BIGINT PRIMARY KEY,
                joined_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Europe/Istanbul')
            );
            ''')

            # İstatistikler tablosu
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS channel_stats (
                channel_id BIGINT,
                stat_date DATE,
                daily_count INTEGER DEFAULT 0,
                code_list TEXT DEFAULT '',
                last_updated TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Europe/Istanbul'),
                PRIMARY KEY (channel_id, stat_date)
            );
            ''')
            # Kelimeler tablosu
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS keywords (
                id SERIAL PRIMARY KEY,
                keyword TEXT NOT NULL UNIQUE
            );
            ''')

            # Yasak kelimeler tablosu
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS banned_words (
                id SERIAL PRIMARY KEY,
                word TEXT NOT NULL UNIQUE
            );
            ''')

            db.commit()
            print("✅ Veritabanı tabloları hazır")

    except Exception as e:
        print(f"⚠️ Database init hatası: {e}")

init_db()

# —————— TELETHON CLIENT ——————
# Heroku için StringSession kullan
if SESSION_STRING:
    client = TelegramClient(StringSession(SESSION_STRING), api_id, api_hash)
    print("✅ StringSession ile başlatılıyor...")
else:
    # Yerel test için (Heroku'da kullanılmaz)
    client = TelegramClient('lalaker', api_id, api_hash)
    print("⚠️ Dosya session ile başlatılıyor (sadece yerel test için)...")

# —————— YARDIMCI FONKSİYONLAR ——————
async def resolve_id(username_or_id):
    """Username veya ID'yi çöz"""
    if str(username_or_id).lstrip('-').isdigit():
        return int(username_or_id)

    username = str(username_or_id).lstrip('@')
    try:
        entity = await client.get_entity(username)
        from telethon.tl.types import Channel, Chat, User

        if isinstance(entity, Channel):
            if entity.megagroup or entity.broadcast:
                return int(f"-100{entity.id}")
        elif isinstance(entity, Chat):
            return int(f"-{entity.id}")
        elif isinstance(entity, User):
            return entity.id

        return entity.id
    except Exception as e:
        raise ValueError(f"Kullanıcı/kanal bulunamadı: @{username}")

async def id_to_username(entity_id):
    """ID'yi username'e çevir"""
    try:
        entity = await client.get_entity(entity_id)
        if hasattr(entity, 'username') and entity.username:
            return f"@{entity.username}"
        elif hasattr(entity, 'title'):
            return f"{entity.title} ({entity_id})"
        else:
            return str(entity_id)
    except:
        return str(entity_id)

# —————— KANAL YÖNETİMİ ——————
async def join_channel_if_needed(channel_id: int):
    """Kanala henüz katılmamışsa katıl"""
    try:
        with get_db_connection() as db:
            cursor = db.cursor()
            cursor.execute("SELECT 1 FROM joined_channels WHERE channel_id = %s", (channel_id,))
            if cursor.fetchone():
                return True

        try:
            await client.get_entity(channel_id)
            await client(functions.channels.JoinChannelRequest(channel_id))
            print(f"📥 Kanala katıldı: {await id_to_username(channel_id)}")

            with get_db_connection() as db:
                cursor = db.cursor()
                cursor.execute("INSERT INTO joined_channels (channel_id) VALUES (%s) ON CONFLICT (channel_id) DO NOTHING", (channel_id,))
                db.commit()
            return True
        except Exception as e:
            print(f"⚠️ Kanala katılamadı {channel_id}: {e}")
            return False
    except Exception as e:
        print(f"⚠️ Kanal katılım kontrolü hatası {channel_id}: {e}")
        return False

def add_channel(channel_id: int):
    """Kanal ekle"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("INSERT INTO channels (channel_id) VALUES (%s) ON CONFLICT (channel_id) DO NOTHING", (channel_id,))
        db.commit()

def remove_channel(channel_id: int):
    """Kanal sil"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("DELETE FROM channel_admins WHERE channel_id = %s", (channel_id,))
        cursor.execute("DELETE FROM custom_links WHERE target_channel_id = %s", (channel_id,))
        cursor.execute("DELETE FROM admin_links WHERE channel_id = %s", (channel_id,))
        cursor.execute("DELETE FROM channel_stats WHERE channel_id = %s", (channel_id,))
        cursor.execute("DELETE FROM channels WHERE channel_id = %s", (channel_id,))
        db.commit()

def set_pause(channel_id: int, pause: bool):
    """Kanalı duraklat/başlat"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("UPDATE channels SET paused = %s WHERE channel_id = %s", (1 if pause else 0, channel_id))
        db.commit()

def is_channel_paused(channel_id: int) -> bool:
    """Kanal duraklatılmış mı?"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT paused FROM channels WHERE channel_id = %s", (channel_id,))
        result = cursor.fetchone()
        return result[0] == 1 if result else False

def get_all_channels():
    """Tüm kanalları al"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT channel_id, paused FROM channels")
        return cursor.fetchall()

# —————— ADMİN YÖNETİMİ ——————
def add_admin(channel_id: int, admin_id: int, admin_username: str = None, admin_type: str = 'ana'):
    """Admin ekle"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("INSERT INTO channels (channel_id) VALUES (%s) ON CONFLICT (channel_id) DO NOTHING", (channel_id,))
        cursor.execute("""
            INSERT INTO channel_admins (channel_id, admin_id, admin_username, admin_type)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (channel_id, admin_id) DO UPDATE SET
            admin_username = %s, admin_type = %s
        """, (channel_id, admin_id, admin_username, admin_type, admin_username, admin_type))
        db.commit()

def remove_admin(channel_id: int, admin_id: int):
    """Admin sil"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("DELETE FROM channel_admins WHERE channel_id = %s AND admin_id = %s", (channel_id, admin_id))
        db.commit()

def get_admin_channels(admin_id: int):
    """Adminin kanallarını al"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT channel_id FROM channel_admins WHERE admin_id = %s", (admin_id,))
        return [row[0] for row in cursor.fetchall()]

def get_channel_admins(channel_id: int):
    """Kanalın adminlerini al"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT admin_id, admin_username, admin_type FROM channel_admins WHERE channel_id = %s", (channel_id,))
        return cursor.fetchall()

def is_admin(admin_id: int, channel_id: int = None) -> bool:
    """Kullanıcı admin mi?"""
    channels = get_admin_channels(admin_id)
    if channel_id:
        return channel_id in channels
    return len(channels) > 0

def get_admin_type(admin_id: int, channel_id: int = None):
    """Admin tipini al"""
    with get_db_connection() as db:
        cursor = db.cursor()
        if channel_id:
            cursor.execute("SELECT admin_type FROM channel_admins WHERE admin_id = %s AND channel_id = %s", (admin_id, channel_id))
        else:
            cursor.execute("SELECT admin_type FROM channel_admins WHERE admin_id = %s LIMIT 1", (admin_id,))
        result = cursor.fetchone()
        return result[0] if result else 'ana'

# —————— DİNLEME KANALI YÖNETİMİ ——————
def add_listening_channel(channel_id: int, default_link: str = 'https://example.com'):
    """Grup dinleme kanalı ekle (eski format)"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            INSERT INTO listening_channels (channel_id, keyword, default_link, type)
            VALUES (%s, '', %s, 'text')
            ON CONFLICT (channel_id) DO UPDATE SET
            keyword = '', default_link = %s, type = 'text'
        """, (channel_id, default_link, default_link))
        db.commit()

def remove_listening_channel(channel_id: int):
    """Dinleme kanalını sil"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("DELETE FROM custom_links WHERE listening_channel_id = %s", (channel_id,))
        cursor.execute("DELETE FROM listening_channels WHERE channel_id = %s", (channel_id,))
        db.commit()

def get_listening_channels():
    """Tüm dinleme kanallarını al (eski format)"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT channel_id, COALESCE(default_link, 'https://example.com') FROM listening_channels WHERE keyword = '' OR keyword IS NULL")
        return cursor.fetchall()

# —————— LİNK ÖZELLEŞTİRME (YENİ SİSTEM) ——————
def add_admin_link(admin_id: int, channel_id: int, link_code: str, link_url: str):
    """Admin link özelleştirmesi ekle"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("""
            INSERT INTO admin_links (admin_id, channel_id, link_code, link_url)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (admin_id, channel_id, link_code) DO UPDATE SET
            link_url = %s
        """, (admin_id, channel_id, link_code, link_url, link_url))
        db.commit()

def add_admin_links_bulk(admin_id: int, channel_id: int, links_dict: dict):
    """Toplu link ekleme"""
    with get_db_connection() as db:
        cursor = db.cursor()
        for code, url in links_dict.items():
            cursor.execute("""
                INSERT INTO admin_links (admin_id, channel_id, link_code, link_url)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (admin_id, channel_id, link_code) DO UPDATE SET
                link_url = %s
            """, (admin_id, channel_id, code, url, url))
        db.commit()

def remove_admin_link(admin_id: int, channel_id: int, link_code: str):
    """Admin link özelleştirmesini sil"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("DELETE FROM admin_links WHERE admin_id = %s AND channel_id = %s AND link_code = %s", (admin_id, channel_id, link_code))
        db.commit()

def get_admin_links(admin_id: int, channel_id: int = None):
    """Admin linklerini al"""
    with get_db_connection() as db:
        cursor = db.cursor()
        if channel_id:
            cursor.execute("SELECT link_code, link_url FROM admin_links WHERE admin_id = %s AND channel_id = %s ORDER BY link_code", (admin_id, channel_id))
        else:
            cursor.execute("SELECT channel_id, link_code, link_url FROM admin_links WHERE admin_id = %s ORDER BY channel_id, link_code", (admin_id,))
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
            AND (%s ILIKE '%%' || link_code || '%%' OR %s ILIKE '%%' || link_code || '%%')
            ORDER BY LENGTH(link_code) DESC
            LIMIT 1
        """, (admin_id, channel_id, code, original_link))
        result = cursor.fetchone()
        return result[0] if result else None

def get_link_for_channel(target_channel_id: int, code: str, default_link: str):
    """Kanal için link al (önce admin özelleştirmesi, sonra default)"""
    admin_id = get_admin_for_channel(target_channel_id)
    if admin_id:
        custom_link = get_custom_link_for_code(admin_id, target_channel_id, code, default_link)
        if custom_link:
            return custom_link
    return default_link

# —————— KOD KONTROLÜ ——————
def is_code_recently_sent(code: str) -> bool:
    """Son 1 saat içinde kod gönderilmiş mi?"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT 1 FROM sent_codes WHERE code = %s AND sent_at > (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'", (code,))
        return cursor.fetchone() is not None

def mark_code_as_sent(code: str) -> bool:
    """Kodu gönderildi olarak işaretle (atomik)"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT 1 FROM sent_codes WHERE code = %s AND sent_at > (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour' FOR UPDATE", (code,))

        if cursor.fetchone():
            return False

        cursor.execute("INSERT INTO sent_codes (code, sent_at) VALUES (%s, NOW() AT TIME ZONE 'Europe/Istanbul') ON CONFLICT (code) DO UPDATE SET sent_at = NOW() AT TIME ZONE 'Europe/Istanbul'", (code,))
        db.commit()
        return True

def cleanup_old_codes():
    """1 saatten eski kodları temizle"""
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("DELETE FROM sent_codes WHERE sent_at < (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'")
        db.commit()

# —————— KELİME YÖNETİMİ ——————
def add_keyword(keyword: str):
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("INSERT INTO keywords (keyword) VALUES (%s) ON CONFLICT DO NOTHING", (keyword.lower(),))
        db.commit()

def remove_keyword(keyword: str):
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("DELETE FROM keywords WHERE keyword = %s", (keyword.lower(),))
        db.commit()

def get_all_keywords():
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT keyword FROM keywords ORDER BY keyword")
        return [row[0] for row in cursor.fetchall()]

def add_banned_word(word: str):
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("INSERT INTO banned_words (word) VALUES (%s) ON CONFLICT DO NOTHING", (word.lower(),))
        db.commit()

def remove_banned_word(word: str):
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("DELETE FROM banned_words WHERE word = %s", (word.lower(),))
        db.commit()

def get_all_banned_words():
    with get_db_connection() as db:
        cursor = db.cursor()
        cursor.execute("SELECT word FROM banned_words ORDER BY word")
        return [row[0] for row in cursor.fetchall()]

def has_banned_word(code: str):
    banned = get_all_banned_words()
    code_lower = code.lower()
    for word in banned:
        if word in code_lower:
            return True
    return False

# —————— İSTATİSTİK FONKSİYONLARI ——————
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

def get_daily_stats(channel_id: int):
    """Günlük istatistik"""
    with get_db_connection() as db:
        cursor = db.cursor()
        today = datetime.now(istanbul_tz).date()
        cursor.execute("SELECT daily_count, code_list FROM channel_stats WHERE channel_id = %s AND stat_date = %s", (channel_id, today))
        result = cursor.fetchone()
        return result if result else (0, '')

def get_weekly_stats(channel_id: int):
    """Haftalık istatistik"""
    with get_db_connection() as db:
        cursor = db.cursor()
        today = datetime.now(istanbul_tz).date()
        week_ago = today - timedelta(days=7)
        cursor.execute("SELECT SUM(daily_count) FROM channel_stats WHERE channel_id = %s AND stat_date > %s", (channel_id, week_ago))
        result = cursor.fetchone()
        return result[0] if result and result[0] else 0

def get_monthly_stats(channel_id: int):
    """Aylık istatistik"""
    with get_db_connection() as db:
        cursor = db.cursor()
        today = datetime.now(istanbul_tz).date()
        month_ago = today - timedelta(days=30)
        cursor.execute("SELECT SUM(daily_count) FROM channel_stats WHERE channel_id = %s AND stat_date > %s", (channel_id, month_ago))
        result = cursor.fetchone()
        return result[0] if result and result[0] else 0

# —————— ESKİ FORMAT İŞLEME ——————
async def process_old_format(event, current_channel_id):
    """ESKİ KODTIME FORMATI: Kod ve Link satırları"""
    try:
        text_raw = event.message.message.strip()
        listening_channels = get_listening_channels()

        for listening_id, default_link in listening_channels:
            if current_channel_id > 0:
                normalized_current = int(f"-100{current_channel_id}")
            else:
                normalized_current = current_channel_id

            if normalized_current == listening_id:
                lines = [l.strip() for l in text_raw.splitlines() if l.strip()]

                # YENİ FORMAT: kelime\nkod\nlink (3 satır)
                if len(lines) >= 3:
                    first_line = lines[0].lower()
                    keywords = get_all_keywords()

                    if first_line in keywords:
                        code_line = lines[1]
                        link_line = lines[2]

                        if re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code_line) and \
                           re.match(r'^https?://[\w\.-]+\.[a-z]{2,}(/.*)?$', link_line):

                            if has_banned_word(code_line):
                                print(f"🚫 YASAK KELİME | Kod: {code_line}")
                                break

                            promo_code = code_line
                            actual_link = link_line
                            print(f"📡 KELİME DİNLEME | Kelime: {first_line} | Kod: {promo_code}")

                            if mark_code_as_sent(promo_code):
                                await send_to_all_channels(client, promo_code, actual_link)
                                print(f"✅ Kod gönderildi: {promo_code}")
                            else:
                                print(f"🚫 Kod tekrarı: {promo_code}")

                            break

                # ESKİ FORMAT: kod\nlink (2 satır)
                if len(lines) >= 2:
                    code_line = lines[0]
                    link_line = lines[1]

                    if re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code_line) and \
                       re.match(r'^https?://[\w\.-]+\.[a-z]{2,}(/.*)?$', link_line):

                        if has_banned_word(code_line):
                            print(f"🚫 YASAK KELİME | Kod: {code_line}")
                            break

                        promo_code = code_line
                        actual_link = link_line
                        print(f"📡 GRUP DİNLEME | Kod: {promo_code} | Link: {actual_link}")

                        if mark_code_as_sent(promo_code):
                            await send_to_all_channels(client, promo_code, actual_link)
                            print(f"✅ Kod gönderildi: {promo_code}")
                        else:
                            print(f"🚫 Kod tekrarı: {promo_code}")

                        break

    except Exception as e:
        print(f"❌ Old format processing error: {e}")

async def send_to_all_channels(client, code: str, default_link: str):
    """Kodu tüm kanallara gönder (link özelleştirme ile)"""
    try:
        channels = get_all_channels()
        active_channels = [(ch, paused) for ch, paused in channels if not paused]

        if not active_channels:
            print(f"⚠️ No active channels")
            return

        sent_count = 0

        for ch, _ in active_channels:
            try:
                final_link = get_link_for_channel(ch, code, default_link)
                message = f"`{code}`\n\n{final_link}"

                await client.send_message(ch, message, link_preview=False)

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

# —————— SORU-CEVAP STATE YÖNETİMİ ——————
async def handle_state_message(event, user_id, state):
    """Soru-cevap state işleme"""
    message = event.message.message.strip()
    action = state.get('action')

    # İLETİ KOMUTU
    if action == 'ileti_step1':
        try:
            channel_id = await resolve_id(message)
            channel_name = await id_to_username(channel_id)

            add_listening_channel(channel_id, 'https://example.com')

            await event.reply(f"✅ Dinleme kanalı eklendi!\n\n📢 Kanal: {channel_name}\n\nℹ️ Botu restart edin.")

            del user_states[user_id]
        except Exception as e:
            await event.reply(f"❌ Hata: {str(e)}\n\nTekrar deneyin veya 'iptal' yazın:")

    # EKLE KOMUTU
    elif action == 'ekle_step1':
        if message.lower() == 'iptal':
            await event.reply("❌ İşlem iptal edildi.")
            del user_states[user_id]
            return

        try:
            channel_id = await resolve_id(message)
            channel_name = await id_to_username(channel_id)

            user_states[user_id] = {
                'action': 'ekle_step2',
                'channel_id': channel_id,
                'channel_name': channel_name
            }

            await event.reply(f"📢 Kanal: {channel_name}\n\nℹ️ Şimdi admin kullanıcı adını (@admin) veya ID'sini gönderin:")
        except Exception as e:
            await event.reply(f"❌ Hata: {str(e)}\n\nTekrar deneyin:")

    elif action == 'ekle_step2':
        try:
            admin_id = await resolve_id(message)
            admin_name = await id_to_username(admin_id)

            channel_id = state['channel_id']
            channel_name = state['channel_name']

            add_channel(channel_id)
            add_admin(channel_id, admin_id, admin_name, 'ana')

            await event.reply(f"✅ Kanal eklendi!\n\n📢 Kanal: {channel_name}\n👤 Admin: {admin_name}")

            del user_states[user_id]
        except Exception as e:
            await event.reply(f"❌ Hata: {str(e)}\n\nTekrar admin adı gönderin:")

    # ÇIKAR KOMUTU
    elif action == 'cikar_step1':
        if message.lower() == 'iptal':
            await event.reply("❌ İşlem iptal edildi.")
            del user_states[user_id]
            return

        try:
            channel_id = await resolve_id(message)
            channel_name = await id_to_username(channel_id)

            remove_channel(channel_id)

            await event.reply(f"✅ Kanal silindi!\n\n📢 {channel_name}")

            del user_states[user_id]
        except Exception as e:
            await event.reply(f"❌ Hata: {str(e)}\n\nTekrar deneyin:")

    # ADMİN SİL KOMUTU
    elif action == 'admin_sil_step1':
        if message.lower() == 'iptal':
            await event.reply("❌ İşlem iptal edildi.")
            del user_states[user_id]
            return

        try:
            channel_id = await resolve_id(message)
            channel_name = await id_to_username(channel_id)

            user_states[user_id] = {
                'action': 'admin_sil_step2',
                'channel_id': channel_id,
                'channel_name': channel_name
            }

            await event.reply(f"📢 Kanal: {channel_name}\n\nℹ️ Şimdi silinecek admin kullanıcı adını (@admin) veya ID'sini gönderin:")
        except Exception as e:
            await event.reply(f"❌ Hata: {str(e)}\n\nTekrar deneyin:")

    elif action == 'admin_sil_step2':
        try:
            admin_id = await resolve_id(message)
            admin_name = await id_to_username(admin_id)

            channel_id = state['channel_id']
            channel_name = state['channel_name']

            remove_admin(channel_id, admin_id)

            await event.reply(f"✅ Admin silindi!\n\n📢 Kanal: {channel_name}\n👤 Admin: {admin_name}")

            del user_states[user_id]
        except Exception as e:
            await event.reply(f"❌ Hata: {str(e)}\n\nTekrar admin adı gönderin:")

    # LİNK EKLE - KANAL SEÇİMİ
    elif action == 'link_ekle_step1':
        channels = state.get('channels', [])

        if message.lower() == 'iptal':
            await event.reply("❌ İşlem iptal edildi.")
            del user_states[user_id]
            return

        try:
            index = int(message) - 1
            if index < 0 or index >= len(channels):
                await event.reply("❌ Geçersiz numara! Tekrar deneyin:")
                return

            channel_id = channels[index]
            channel_name = await id_to_username(channel_id)

            user_states[user_id] = {
                'action': 'link_ekle_step2',
                'channel_id': channel_id,
                'channel_name': channel_name
            }

            await event.reply(f"📢 Kanal: {channel_name}\n\nℹ️ Linkleri şu formatta gönderin:\n\n```\ndeneme www.deneme.com\ngoogle www.google.com\ntest https://test.com\n```\n\nHer satıra bir link yazın:")
        except ValueError:
            await event.reply("❌ Geçerli bir numara gönderin:")
        except Exception as e:
            await event.reply(f"❌ Hata: {str(e)}")

    # LİNK EKLE - ALT ALTA FORMAT
    elif action == 'link_ekle_step2':
        channel_id = state['channel_id']
        channel_name = state['channel_name']

        lines = [l.strip() for l in message.splitlines() if l.strip()]
        links_dict = {}
        errors = []

        for line in lines:
            parts = line.split(maxsplit=1)
            if len(parts) == 2:
                code = parts[0]
                url = parts[1]

                if not url.startswith('http'):
                    url = f"https://{url}"

                if re.match(r'^https?://[\w\.-]+\.[a-z]{2,}(/.*)?$', url):
                    links_dict[code] = url
                else:
                    errors.append(f"❌ Geçersiz: {line}")
            else:
                errors.append(f"❌ Format hatası: {line}")

        if links_dict:
            add_admin_links_bulk(user_id, channel_id, links_dict)

            response = f"✅ {len(links_dict)} link eklendi!\n\n📢 Kanal: {channel_name}\n\n"
            for code, url in links_dict.items():
                response += f"• {code} → {url}\n"

            if errors:
                response += f"\n⚠️ Hatalar:\n" + "\n".join(errors)

            await event.reply(response)
        else:
            await event.reply("❌ Hiç geçerli link bulunamadı!\n\nTekrar deneyin:")
            return

        del user_states[user_id]

    # LİNK SİL - KANAL SEÇİMİ
    elif action == 'link_sil_step1':
        channels = state.get('channels', [])

        if message.lower() == 'iptal':
            await event.reply("❌ İşlem iptal edildi.")
            del user_states[user_id]
            return

        try:
            index = int(message) - 1
            if index < 0 or index >= len(channels):
                await event.reply("❌ Geçersiz numara! Tekrar deneyin:")
                return

            channel_id = channels[index]
            channel_name = await id_to_username(channel_id)

            user_states[user_id] = {
                'action': 'link_sil_step2',
                'channel_id': channel_id,
                'channel_name': channel_name
            }

            await event.reply(f"📢 Kanal: {channel_name}\n\nℹ️ Silinecek link kodunu gönderin:")
        except ValueError:
            await event.reply("❌ Geçerli bir numara gönderin:")
        except Exception as e:
            await event.reply(f"❌ Hata: {str(e)}")

    # LİNK SİL - KOD GİRİŞİ
    elif action == 'link_sil_step2':
        channel_id = state['channel_id']
        channel_name = state['channel_name']

        # Satır satır veya boşlukla ayrılmış kodları al
        codes = []
        for line in message.splitlines():
            codes.extend([c.strip() for c in line.split() if c.strip()])

        deleted_codes = []
        for link_code in codes:
            remove_admin_link(user_id, channel_id, link_code)
            deleted_codes.append(link_code)

        if deleted_codes:
            response = f"✅ Link(ler) silindi!\n\n📢 Kanal: {channel_name}\n🔑 Kodlar:\n"
            for code in deleted_codes:
                response += f"  • {code}\n"
            await event.reply(response)
        else:
            await event.reply(f"❌ Geçerli kod bulunamadı!")

        del user_states[user_id]

# —————— KOMUT İŞLEYİCİLERİ ——————
@client.on(events.NewMessage())
async def message_handler(event):
    """Tüm mesajları işle"""
    user_id = event.sender_id
    text = event.message.message.strip()
    text_lower = text.lower()

    # STATE KONTROLÜ (soru-cevap devam ediyorsa)
    if user_id in user_states:
        await handle_state_message(event, user_id, user_states[user_id])
        return

    # KANAL DURDURULMUŞ MU KONTROLÜ (Adminler için)
    # NOT: "bot dur" ve "bot devam" komutları her zaman çalışır
    if user_id != SUPER_ADMIN and text_lower not in ("bot dur", "bot devam"):
        admin_channels = get_admin_channels(user_id)
        if admin_channels:
            # Bu adminin kanallarından EN AZ BİRİ aktifse komutlara cevap ver
            has_active_channel = False
            for ch_id in admin_channels:
                if not is_channel_paused(ch_id):
                    has_active_channel = True
                    break

            # Tüm kanalları durdurulmuşsa hiç cevap verme
            if not has_active_channel and len(admin_channels) > 0:
                # Sessizce geç (hiç mesaj gönderme)
                return

    # ═══════════════════════════════════════════════════════════
    # SÜPER ADMİN KOMUTLARI
    # ═══════════════════════════════════════════════════════════
    if user_id == SUPER_ADMIN:

        # EKLE (soru-cevap)
        if text_lower == "ekle":
            await event.reply("📢 **KANAL EKLE**\n\nℹ️ Lütfen kanalın kullanıcı adını (@kanal) veya ID'sini gönderin:\n\n💡 İptal için: iptal")
            user_states[user_id] = {'action': 'ekle_step1'}
            return

        # ÇIKAR (soru-cevap)
        if text_lower == "çıkar":
            await event.reply("📢 **KANAL SİL**\n\nℹ️ Lütfen silinecek kanalın kullanıcı adını (@kanal) veya ID'sini gönderin:\n\n💡 İptal için: iptal")
            user_states[user_id] = {'action': 'cikar_step1'}
            return

        # ADMİN SİL (soru-cevap)
        if text_lower == "admin sil":
            await event.reply("📢 **ADMİN SİL**\n\nℹ️ Lütfen kanalın kullanıcı adını (@kanal) veya ID'sini gönderin:\n\n💡 İptal için: iptal")
            user_states[user_id] = {'action': 'admin_sil_step1'}
            return

        # İLETİ (soru-cevap)
        if text_lower == "ileti":
            await event.reply("📢 **DİNLEME KANALI EKLE**\n\nℹ️ Lütfen dinlenecek kanalın kullanıcı adını (@kanal) veya ID'sini gönderin:")
            user_states[user_id] = {'action': 'ileti_step1'}
            return

        # İLETİ SİL
        if text_lower.startswith("iletisil "):
            try:
                parts = text.split()
                if len(parts) != 2:
                    await event.reply("❌ Kullanım: iletisil @kanal")
                    return

                channel_input = parts[1]
                channel_id = await resolve_id(channel_input)
                channel_name = await id_to_username(channel_id)

                remove_listening_channel(channel_id)

                await event.reply(f"✅ Dinleme kanalı silindi!\n\n📢 {channel_name}")
            except Exception as e:
                await event.reply(f"❌ Hata: {str(e)}")
            return

        # DUR (kanal durdur)
        if text_lower.startswith("dur "):
            try:
                parts = text.split()
                if len(parts) != 2:
                    await event.reply("❌ Kullanım: dur @kanal")
                    return

                channel_input = parts[1]
                channel_id = await resolve_id(channel_input)
                channel_name = await id_to_username(channel_id)

                set_pause(channel_id, True)

                await event.reply(f"⏸️ Kanal durduruldu!\n\n📢 {channel_name}\n\nℹ️ Bu kanalın admini artık komutları kullanamaz.")
            except Exception as e:
                await event.reply(f"❌ Hata: {str(e)}")
            return

        # BAŞLAT (kanal başlat)
        if text_lower.startswith("başlat "):
            try:
                parts = text.split()
                if len(parts) != 2:
                    await event.reply("❌ Kullanım: başlat @kanal")
                    return

                channel_input = parts[1]
                channel_id = await resolve_id(channel_input)
                channel_name = await id_to_username(channel_id)

                set_pause(channel_id, False)

                await event.reply(f"✅ Kanal başlatıldı!\n\n📢 {channel_name}\n\nℹ️ Adminler artık komutları kullanabilir.")
            except Exception as e:
                await event.reply(f"❌ Hata: {str(e)}")
            return

        # İSTATİSTİK (tüm sistem)
        if text_lower == "istatistik":
            try:
                channels = get_all_channels()
                listening = get_listening_channels()

                msg = "📊 **SİSTEM İSTATİSTİKLERİ**\n\n"
                msg += f"📢 **Toplam Kanal:** {len(channels)}\n"
                msg += f"🎧 **Dinleme Kanalı:** {len(listening)}\n\n"

                total_daily = 0
                total_weekly = 0
                total_monthly = 0

                msg += "📋 **KANALLAR:**\n\n"

                for ch_id, paused in channels:
                    channel_name = await id_to_username(ch_id)
                    daily, _ = get_daily_stats(ch_id)
                    weekly = get_weekly_stats(ch_id)
                    monthly = get_monthly_stats(ch_id)

                    total_daily += daily
                    total_weekly += weekly
                    total_monthly += monthly

                    status = "⏸️ DURDURULDU" if paused else "✅ Aktif"

                    msg += f"📢 **{channel_name}** - {status}\n"
                    msg += f"  • Bugün: {daily} kod\n"
                    msg += f"  • Bu hafta: {weekly} kod\n"
                    msg += f"  • Bu ay: {monthly} kod\n\n"

                msg += f"🔢 **GENEL TOPLAM**\n"
                msg += f"  • Bugün: {total_daily} kod\n"
                msg += f"  • Bu hafta: {total_weekly} kod\n"
                msg += f"  • Bu ay: {total_monthly} kod\n\n"

                msg += "🎧 **DİNLEME KANALLARI:**\n"
                for l_id, l_link in listening:
                    l_name = await id_to_username(l_id)
                    msg += f"  • {l_name}\n"

                await event.reply(msg)
            except Exception as e:
                await event.reply(f"❌ Hata: {str(e)}")
            return

        # KELİME EKLE
        if text_lower.startswith("kelime ekle "):
            try:
                keyword = text.split(maxsplit=2)[2].strip()
                add_keyword(keyword)
                await event.reply(f"✅ Kelime eklendi: {keyword}")
            except Exception as e:
                await event.reply(f"❌ Kullanım: kelime ekle <kelime>")
            return

        # KELİME SİL
        if text_lower.startswith("kelime sil "):
            try:
                keyword = text.split(maxsplit=2)[2].strip()
                remove_keyword(keyword)
                await event.reply(f"✅ Kelime silindi: {keyword}")
            except Exception as e:
                await event.reply(f"❌ Kullanım: kelime sil <kelime>")
            return

        # KELİMELER
        if text_lower == "kelimeler":
            keywords = get_all_keywords()
            if keywords:
                msg = "📝 **ANAHTAR KELİMELER**\n\n"
                for kw in keywords:
                    msg += f"• {kw}\n"
                await event.reply(msg)
            else:
                await event.reply("❌ Henüz kelime eklenmemiş.\n\n💡 Eklemek için: kelime ekle <kelime>")
            return

        # YASAK EKLE
        if text_lower.startswith("yasak ekle "):
            try:
                word = text.split(maxsplit=2)[2].strip()
                add_banned_word(word)
                await event.reply(f"✅ Yasak kelime eklendi: {word}")
            except Exception as e:
                await event.reply(f"❌ Kullanım: yasak ekle <kelime>")
            return

        # YASAK SİL
        if text_lower.startswith("yasak sil "):
            try:
                word = text.split(maxsplit=2)[2].strip()
                remove_banned_word(word)
                await event.reply(f"✅ Yasak kelime silindi: {word}")
            except Exception as e:
                await event.reply(f"❌ Kullanım: yasak sil <kelime>")
            return

        # YASAKLAR
        if text_lower == "yasaklar":
            banned = get_all_banned_words()
            if banned:
                msg = "🚫 **YASAK KELİMELER**\n\n"
                for w in banned:
                    msg += f"• {w}\n"
                await event.reply(msg)
            else:
                await event.reply("❌ Henüz yasak kelime eklenmemiş.\n\n💡 Eklemek için: yasak ekle <kelime>")
            return

        # YARDIM
        if text_lower in ("yardım", "help"):
            help_msg = """🤖 **SÜPER ADMİN KOMUTLARI**

📢 **KANAL YÖNETİMİ:**
• ekle - Kanal ekle (soru-cevap)
• çıkar - Kanal sil (soru-cevap)
• admin sil - Admin sil (soru-cevap)
• ileti - Dinleme kanalı ekle (soru-cevap)
• iletisil @kanal - Dinleme kanalı sil

⚙️ **KANAL KONTROL:**
• dur @kanal - Kanalı durdur (admin komutları çalışmaz)
• başlat @kanal - Kanalı başlat

📝 **KELİME SİSTEMİ:**
• kelime ekle <kelime> - Anahtar kelime ekle
• kelime sil <kelime> - Anahtar kelime sil
• kelimeler - Tüm kelimeleri listele

🚫 **YASAK KELİME:**
• yasak ekle <kelime> - Yasak kelime ekle
• yasak sil <kelime> - Yasak kelime sil
• yasaklar - Tüm yasak kelimeleri listele

📊 **İSTATİSTİK:**
• istatistik - Tüm sistem istatistikleri

ℹ️ **BİLGİ:**
• yardım - Bu mesaj
"""
            await event.reply(help_msg)
            return

    # ═══════════════════════════════════════════════════════════
    # ADMİN KOMUTLARI
    # ═══════════════════════════════════════════════════════════
    admin_channels = get_admin_channels(user_id)

    if admin_channels:

        # BOT DUR (adminin tüm kanallarını duraklat)
        if text_lower == "bot dur":
            paused_count = 0
            for channel_id in admin_channels:
                set_pause(channel_id, True)
                paused_count += 1

            await event.reply(f"⏸️ **BOT DURDURULDU**\n\n✅ {paused_count} kanal durduruldu.\n\nℹ️ Kod gönderimi durduruldu.\n💡 Başlatmak için: bot devam")
            return

        # BOT DEVAM (adminin tüm kanallarını başlat)
        if text_lower == "bot devam":
            started_count = 0
            for channel_id in admin_channels:
                set_pause(channel_id, False)
                started_count += 1

            await event.reply(f"✅ **BOT BAŞLATILDI**\n\n✅ {started_count} kanal başlatıldı.\n\nℹ️ Kod gönderimi devam ediyor.\n💡 Durdurmak için: bot dur")
            return

        # KANALLARIM
        if text_lower == "kanallarım":
            response = "📋 **KANALLARIM**\n\n"

            for i, channel_id in enumerate(admin_channels, 1):
                channel_name = await id_to_username(channel_id)
                paused = "⏸️ DURDURULDU" if is_channel_paused(channel_id) else "✅ Aktif"

                daily, _ = get_daily_stats(channel_id)
                weekly = get_weekly_stats(channel_id)
                monthly = get_monthly_stats(channel_id)

                response += f"{i}. {channel_name}\n"
                response += f"   Durum: {paused}\n"
                response += f"   📊 Bugün: {daily} | Hafta: {weekly} | Ay: {monthly}\n\n"

            response += "ℹ️ Detaylı ayarlar için: ayarlar <numara>"

            await event.reply(response)
            return

        # AYARLAR
        if text_lower.startswith("ayarlar"):
            parts = text.split()

            if len(parts) == 1:
                response = "📋 **KANALLARIM**\n\n"
                for i, channel_id in enumerate(admin_channels, 1):
                    channel_name = await id_to_username(channel_id)
                    response += f"{i}. {channel_name}\n"
                response += "\nℹ️ Detay için: ayarlar <numara>"
                await event.reply(response)
                return

            try:
                index = int(parts[1]) - 1
                if index < 0 or index >= len(admin_channels):
                    await event.reply("❌ Geçersiz numara!")
                    return

                channel_id = admin_channels[index]
                channel_name = await id_to_username(channel_id)

                daily, codes = get_daily_stats(channel_id)
                weekly = get_weekly_stats(channel_id)
                monthly = get_monthly_stats(channel_id)

                links = get_admin_links(user_id, channel_id)

                response = f"⚙️ **KANAL AYARLARI**\n\n"
                response += f"📢 {channel_name}\n\n"
                response += f"📊 **İSTATİSTİKLER**\n"
                response += f"• Bugün: {daily} kod\n"
                response += f"• Bu hafta: {weekly} kod\n"
                response += f"• Bu ay: {monthly} kod\n\n"

                if links:
                    response += f"🔗 **LİNK ÖZELLEŞTİRMELERİ** ({len(links)})\n"
                    for code, url in links:
                        response += f"• {code} → {url}\n"
                else:
                    response += f"🔗 **LİNK ÖZELLEŞTİRMELERİ**\nHenüz link eklenmemiş.\n"

                response += f"\n💡 **KOMUTLAR**\n"
                response += f"• link ekle\n"
                response += f"• link sil\n"
                response += f"• linkler\n"

                await event.reply(response)
            except ValueError:
                await event.reply("❌ Geçersiz numara!")
            except Exception as e:
                await event.reply(f"❌ Hata: {str(e)}")
            return

        # LİNK EKLE (alt alta format)
        if text_lower == "link ekle":
            if len(admin_channels) == 1:
                channel_id = admin_channels[0]
                channel_name = await id_to_username(channel_id)

                user_states[user_id] = {
                    'action': 'link_ekle_step2',
                    'channel_id': channel_id,
                    'channel_name': channel_name
                }

                await event.reply(f"📢 Kanal: {channel_name}\n\nℹ️ Linkleri şu formatta gönderin:\n\n```\ndeneme www.deneme.com\ngoogle www.google.com\ntest https://test.com\n```\n\nHer satıra bir link yazın:")
            else:
                response = "📋 **KANALLARINIZ**\n\n"
                for i, ch_id in enumerate(admin_channels, 1):
                    ch_name = await id_to_username(ch_id)
                    response += f"{i}. {ch_name}\n"
                response += f"\nℹ️ Hangi kanala eklensin? Numara gönderin:"

                await event.reply(response)

                user_states[user_id] = {
                    'action': 'link_ekle_step1',
                    'channels': admin_channels
                }
            return

        # LİNK SİL
        if text_lower == "link sil":
            if len(admin_channels) == 1:
                channel_id = admin_channels[0]
                channel_name = await id_to_username(channel_id)

                user_states[user_id] = {
                    'action': 'link_sil_step2',
                    'channel_id': channel_id,
                    'channel_name': channel_name
                }

                await event.reply(f"📢 Kanal: {channel_name}\n\nℹ️ Silinecek link kodunu gönderin:")
            else:
                response = "📋 **KANALLARINIZ**\n\n"
                for i, ch_id in enumerate(admin_channels, 1):
                    ch_name = await id_to_username(ch_id)
                    response += f"{i}. {ch_name}\n"
                response += f"\nℹ️ Hangi kanaldan silinsin? Numara gönderin:"

                await event.reply(response)

                user_states[user_id] = {
                    'action': 'link_sil_step1',
                    'channels': admin_channels
                }
            return

        # LİNKLER
        if text_lower == "linkler":
            response = "🔗 **LİNK ÖZELLEŞTİRMELERİM**\n\n"

            has_links = False
            for channel_id in admin_channels:
                links = get_admin_links(user_id, channel_id)
                if links:
                    has_links = True
                    channel_name = await id_to_username(channel_id)
                    response += f"📢 **{channel_name}**\n"
                    for code, url in links:
                        response += f"  • {code} → {url}\n"
                    response += "\n"

            if not has_links:
                response += "❌ Henüz link eklenmemiş.\n\n"
                response += "💡 Link eklemek için: link ekle"

            await event.reply(response)
            return

        # İSTATİSTİK (admin için)
        if text_lower == "istatistik":
            response = "📊 **İSTATİSTİKLERİM**\n\n"

            total_daily = 0
            total_weekly = 0
            total_monthly = 0

            for channel_id in admin_channels:
                channel_name = await id_to_username(channel_id)
                daily, _ = get_daily_stats(channel_id)
                weekly = get_weekly_stats(channel_id)
                monthly = get_monthly_stats(channel_id)

                total_daily += daily
                total_weekly += weekly
                total_monthly += monthly

                response += f"📢 **{channel_name}**\n"
                response += f"  • Bugün: {daily} kod\n"
                response += f"  • Bu hafta: {weekly} kod\n"
                response += f"  • Bu ay: {monthly} kod\n\n"

            response += f"🔢 **TOPLAM**\n"
            response += f"  • Bugün: {total_daily} kod\n"
            response += f"  • Bu hafta: {total_weekly} kod\n"
            response += f"  • Bu ay: {total_monthly} kod\n"

            await event.reply(response)
            return

        # YARDIM (admin)
        if text_lower in ("yardım", "help"):
            help_msg = """🤖 **ADMİN KOMUTLARI**

⚙️ **BOT KONTROL:**
• bot dur - Tüm kanallarını durdur
• bot devam - Tüm kanallarını başlat

👤 **ADMİN PANELİ:**
• kanallarım - Kanallarını görüntüle
• ayarlar [numara] - Kanal ayarları
• istatistik - İstatistikler

🔗 **LİNK ÖZELLEŞTİRME:**
• link ekle - Link ekle (alt alta format)
• link sil - Link sil
• linkler - Linkleri listele

ℹ️ **BİLGİ:**
• yardım - Bu mesaj
"""
            await event.reply(help_msg)
            return

    # ═══════════════════════════════════════════════════════════
    # DİNLEME SİSTEMİ (ESKİ FORMAT)
    # ═══════════════════════════════════════════════════════════
    if event.chat:
        current_channel_id = event.chat.id
        await process_old_format(event, current_channel_id)

# —————— BOT YAŞATMA ——————
async def keep_alive():
    while True:
        try:
            await client.get_me()
            cleanup_old_codes()
        except Exception:
            pass
        await asyncio.sleep(1500)

# —————— ANA BOT ——————
async def main():
    """Bot başlat"""
    try:
        await client.start()
        print("🤖 Bot started")

        me = await client.get_me()
        print(f"✅ Logged in as: {me.first_name} (@{me.username})")

        # Keep alive task
        asyncio.create_task(keep_alive())

        # Join all listening channels
        listening_channels = get_listening_channels()
        for channel_id, _ in listening_channels:
            await join_channel_if_needed(channel_id)
            await asyncio.sleep(0.1)

        await client.run_until_disconnected()

    except Exception as e:
        print(f"❌ Bot error: {e}")
    finally:
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
