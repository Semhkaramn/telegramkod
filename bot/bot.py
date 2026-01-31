import asyncio
import re
import psycopg2
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

# —————— VERİTABANI ——————
def get_db_connection():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor() as cursor:
            cursor.execute("SET timezone = 'Europe/Istanbul'")
        conn.commit()
        return conn
    except Exception as e:
        print(f"❌ DB BAĞLANTI HATASI: {e}")
        print(traceback.format_exc())
        raise

# —————— DİNLEME KANALLARI ——————
def get_listening_channels():
    """Dinleme kanallarını al - sadece channel_id"""
    try:
        with get_db_connection() as db:
            cursor = db.cursor()
            cursor.execute("SELECT channel_id FROM listening_channels")
            result = [row[0] for row in cursor.fetchall()]
            print(f"🔍 DEBUG get_listening_channels: {result}")
            return result
    except Exception as e:
        print(f"❌ get_listening_channels HATASI: {e}")
        print(traceback.format_exc())
        return []

# —————— HEDEF KANALLAR ——————
def get_active_channels():
    """Aktif hedef kanalları al"""
    try:
        with get_db_connection() as db:
            cursor = db.cursor()
            # Önce tüm verileri kontrol et
            cursor.execute("SELECT COUNT(*) FROM channels")
            total_channels = cursor.fetchone()[0]
            print(f"🔍 DEBUG: Toplam kanal sayısı: {total_channels}")

            cursor.execute("SELECT COUNT(*) FROM user_channels")
            total_user_channels = cursor.fetchone()[0]
            print(f"🔍 DEBUG: Toplam user_channels sayısı: {total_user_channels}")

            cursor.execute("SELECT COUNT(*) FROM users WHERE is_active = true AND is_banned = false AND bot_enabled = true")
            active_users = cursor.fetchone()[0]
            print(f"🔍 DEBUG: Aktif kullanıcı sayısı: {active_users}")

            cursor.execute("SELECT COUNT(*) FROM user_channels WHERE paused = false")
            unpaused_channels = cursor.fetchone()[0]
            print(f"🔍 DEBUG: Paused=false kanal sayısı: {unpaused_channels}")

            # Detaylı kullanıcı bilgisi
            cursor.execute("""
                SELECT u.id, u.username, u.is_active, u.is_banned, u.bot_enabled
                FROM users u
            """)
            users = cursor.fetchall()
            for u in users:
                print(f"🔍 DEBUG User: id={u[0]}, username={u[1]}, is_active={u[2]}, is_banned={u[3]}, bot_enabled={u[4]}")

            # Detaylı user_channels bilgisi
            cursor.execute("""
                SELECT uc.user_id, uc.channel_id, uc.paused
                FROM user_channels uc
            """)
            ucs = cursor.fetchall()
            for uc in ucs:
                print(f"🔍 DEBUG UserChannel: user_id={uc[0]}, channel_id={uc[1]}, paused={uc[2]}")

            # Asıl sorgu
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
            print(f"🔍 DEBUG get_active_channels SONUÇ: {result}")
            return result
    except Exception as e:
        print(f"❌ get_active_channels HATASI: {e}")
        print(traceback.format_exc())
        return []

# —————— ANAHTAR KELİMELER ——————
def get_all_keywords():
    """Anahtar kelimeleri al"""
    try:
        with get_db_connection() as db:
            cursor = db.cursor()
            cursor.execute("SELECT keyword FROM keywords ORDER BY keyword")
            result = [row[0].lower() for row in cursor.fetchall()]
            print(f"🔍 DEBUG get_all_keywords: {result}")
            return result
    except Exception as e:
        print(f"❌ get_all_keywords HATASI: {e}")
        print(traceback.format_exc())
        return []

# —————— YASAK KELİMELER ——————
def get_all_banned_words():
    """Yasak kelimeleri al"""
    try:
        with get_db_connection() as db:
            cursor = db.cursor()
            cursor.execute("SELECT word FROM banned_words ORDER BY word")
            result = [row[0].lower() for row in cursor.fetchall()]
            return result
    except Exception as e:
        print(f"❌ get_all_banned_words HATASI: {e}")
        return []

def has_banned_word(code: str) -> bool:
    """Kod yasak kelime içeriyor mu?"""
    banned = get_all_banned_words()
    code_lower = code.lower()
    for word in banned:
        if word in code_lower:
            print(f"🚫 DEBUG: Yasak kelime bulundu: '{word}' in '{code}'")
            return True
    return False

# —————— LİNK ÖZELLEŞTİRME ——————
def get_channel_user_id(channel_id: int):
    """Kanalın aktif kullanıcısını al"""
    try:
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
            print(f"🔍 DEBUG get_channel_user_id({channel_id}): {result[0] if result else None}")
            return result[0] if result else None
    except Exception as e:
        print(f"❌ get_channel_user_id HATASI: {e}")
        print(traceback.format_exc())
        return None

def get_custom_link(user_id: int, channel_id: int, code: str, original_link: str) -> str:
    """Kullanıcının özel linkini al"""
    try:
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
            print(f"🔍 DEBUG get_custom_link(user_id={user_id}, channel_id={channel_id}, code={code}): {result[0] if result else None}")
            return result[0] if result else None
    except Exception as e:
        print(f"❌ get_custom_link HATASI: {e}")
        print(traceback.format_exc())
        return None

def get_link_for_channel(channel_id: int, code: str, original_link: str) -> str:
    """Kanal için uygun linki al - önce özel link, yoksa orijinal"""
    user_id = get_channel_user_id(channel_id)
    print(f"🔍 DEBUG get_link_for_channel: channel_id={channel_id}, user_id={user_id}")
    if user_id:
        custom_link = get_custom_link(user_id, channel_id, code, original_link)
        if custom_link:
            print(f"🔍 DEBUG get_link_for_channel: custom_link bulundu: {custom_link}")
            return custom_link
    print(f"🔍 DEBUG get_link_for_channel: custom_link yok, orijinal link: {original_link}")
    return original_link

# —————— KOD KONTROLÜ ——————
def is_code_recently_sent(code: str) -> bool:
    """Son 1 saat içinde kod gönderilmiş mi?"""
    try:
        with get_db_connection() as db:
            cursor = db.cursor()
            cursor.execute("""
                SELECT 1 FROM sent_codes
                WHERE code = %s AND sent_at > (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'
            """, (code,))
            result = cursor.fetchone() is not None
            print(f"🔍 DEBUG is_code_recently_sent({code}): {result}")
            return result
    except Exception as e:
        print(f"❌ is_code_recently_sent HATASI: {e}")
        return False

def mark_code_as_sent(code: str) -> bool:
    """Kodu gönderildi olarak işaretle"""
    try:
        with get_db_connection() as db:
            cursor = db.cursor()
            cursor.execute("""
                SELECT 1 FROM sent_codes
                WHERE code = %s AND sent_at > (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'
                FOR UPDATE
            """, (code,))

            if cursor.fetchone():
                print(f"🔍 DEBUG mark_code_as_sent({code}): Zaten gönderilmiş, FALSE")
                return False

            cursor.execute("""
                INSERT INTO sent_codes (code, sent_at)
                VALUES (%s, NOW() AT TIME ZONE 'Europe/Istanbul')
                ON CONFLICT (code) DO UPDATE SET sent_at = NOW() AT TIME ZONE 'Europe/Istanbul'
            """, (code,))
            db.commit()
            print(f"🔍 DEBUG mark_code_as_sent({code}): Yeni kod, TRUE")
            return True
    except Exception as e:
        print(f"❌ mark_code_as_sent HATASI: {e}")
        print(traceback.format_exc())
        return False

def cleanup_old_codes():
    """Eski kodları temizle"""
    try:
        with get_db_connection() as db:
            cursor = db.cursor()
            cursor.execute("""
                DELETE FROM sent_codes
                WHERE sent_at < (NOW() AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour'
            """)
            db.commit()
            print(f"🔍 DEBUG cleanup_old_codes: Eski kodlar temizlendi")
    except Exception as e:
        print(f"❌ cleanup_old_codes HATASI: {e}")
        print(traceback.format_exc())

# —————— İSTATİSTİK ——————
def record_code_stat(channel_id: int, code: str):
    """Kod istatistiğini kaydet"""
    try:
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
            print(f"🔍 DEBUG record_code_stat: channel_id={channel_id}, code={code}")
    except Exception as e:
        print(f"❌ record_code_stat HATASI: {e}")
        print(traceback.format_exc())

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
            print(f"🔍 DEBUG log_bot_message: level={level}, message={message}, details={details}")
    except Exception as e:
        print(f"⚠️ Log hatası: {e}")
        print(traceback.format_exc())

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
            print(f"🔍 DEBUG update_bot_status: is_running={is_running}, error={error}")
    except Exception as e:
        print(f"⚠️ Status hatası: {e}")
        print(traceback.format_exc())

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
    print(f"🔍 DEBUG send_message_via_bot başladı: chat_id={chat_id}")

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
        print(f"🔍 DEBUG: Gönderiliyor -> URL: {url}")
        print(f"🔍 DEBUG: Payload -> chat_id: {chat_id}, text length: {len(text)}")

        response = await http_client.post(url, json=payload)
        result = response.json()

        print(f"🔍 DEBUG: API Yanıt -> {result}")

        if not result.get("ok"):
            error_desc = result.get("description", "Unknown error")
            error_code = result.get("error_code", "N/A")
            print(f"❌ Gönderim hatası ({chat_id}): [{error_code}] {error_desc}")
            return {"ok": False, "error": error_desc, "error_code": error_code}

        print(f"✅ Mesaj başarıyla gönderildi: chat_id={chat_id}")
        return {"ok": True}
    except Exception as e:
        print(f"❌ HTTP hatası ({chat_id}): {e}")
        print(traceback.format_exc())
        return {"ok": False, "error": str(e)}

# —————— YARDIMCI ——————
def normalize_channel_id(channel_id: int) -> int:
    """Kanal ID'sini normalize et"""
    if channel_id > 0:
        result = int(f"-100{channel_id}")
        print(f"🔍 DEBUG normalize: {channel_id} -> {result}")
        return result
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
            print(f"✅ Gönderildi: {channel_id}")
            return {"channel_id": channel_id, "success": True}
        else:
            print(f"❌ Gönderilemedi: {channel_id} - {result.get('error')}")
            return {"channel_id": channel_id, "success": False, "error": result.get('error')}
    except Exception as e:
        print(f"❌ Gönderim hatası {channel_id}: {e}")
        return {"channel_id": channel_id, "success": False, "error": str(e)}

async def send_to_all_channels(code: str, original_link: str):
    """Kodu tüm aktif kanallara PARALEL olarak gönder"""
    print(f"🚀 DEBUG send_to_all_channels başladı: code={code}, link={original_link}")

    try:
        active_channels = get_active_channels()
        print(f"🔍 DEBUG: Aktif kanal listesi: {active_channels}")

        if not active_channels:
            print(f"⚠️ Aktif kanal yok! Kod gönderilemedi: {code}")
            log_bot_message("warning", f"Aktif kanal yok, kod gönderilemedi: {code}")
            return

        print(f"🚀 {len(active_channels)} kanala PARALEL gönderim başlıyor...")

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
                print(f"❌ Task hatası: {result}")
            elif result.get("success"):
                sent_count += 1
            else:
                error_count += 1

        if sent_count > 0:
            print(f"✅ Kod gönderildi: {code} | {sent_count}/{len(active_channels)} kanal (PARALEL)")
            log_bot_message("info", f"Kod gönderildi: {code}", f"{sent_count} başarılı, {error_count} hata")
            cleanup_old_codes()
        else:
            print(f"❌ Kod hiçbir kanala gönderilemedi: {code}")

    except Exception as e:
        print(f"❌ Toplu gönderim hatası: {e}")
        print(traceback.format_exc())
        log_bot_message("error", "Toplu gönderim hatası", str(e)[:500])

# —————— MESAJ İŞLEME ——————
async def process_message(event):
    """
    Mesajı işle - 2 format desteklenir
    """
    print(f"📨 DEBUG process_message başladı")

    try:
        text = event.message.message
        if not text:
            print("🔍 DEBUG: Mesaj boş, atlanıyor")
            return

        text = text.strip()
        lines = [l.strip() for l in text.splitlines() if l.strip()]

        print(f"🔍 DEBUG: Mesaj içeriği:")
        print(f"---")
        print(text)
        print(f"---")
        print(f"🔍 DEBUG: Satır sayısı: {len(lines)}")
        print(f"🔍 DEBUG: Satırlar: {lines}")

        if len(lines) < 2:
            print(f"🔍 DEBUG: Satır sayısı < 2, atlanıyor")
            return

        # Anahtar kelimeler
        keywords = get_all_keywords()
        print(f"🔍 DEBUG: Keywords: {keywords}")

        # Link regex - daha esnek (http://, https://, www. veya doğrudan domain)
        link_pattern = r'^(https?://|www\.)[^\s]+$|^[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}[^\s]*

        # FORMAT 1: kelime\nkod\nlink (3 satır)
        if len(lines) >= 3:
            first_line = lines[0].lower()
            print(f"🔍 DEBUG FORMAT1 kontrol: first_line='{first_line}', in keywords={first_line in keywords}")

            if first_line in keywords:
                code = lines[1].strip()
                link = lines[2].strip()

                print(f"🔍 DEBUG FORMAT1: code='{code}', link='{link}'")

                # Kod kontrolü (alfanümerik + Türkçe + tire)
                code_match = re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code)
                link_match = re.match(link_pattern, link)
                print(f"🔍 DEBUG: code_match={bool(code_match)}, link_match={bool(link_match)}")

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
                else:
                    print(f"🔍 DEBUG: FORMAT1 regex eşleşmedi")

        # FORMAT 2: kod\nlink (2 satır)
        code = lines[0].strip()
        link = lines[1].strip()

        print(f"🔍 DEBUG FORMAT2: code='{code}', link='{link}'")

        # Kod kontrolü
        code_match = re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code)
        link_match = re.match(link_pattern, link)
        print(f"🔍 DEBUG: code_match={bool(code_match)}, link_match={bool(link_match)}")

        if code_match and link_match:
            if has_banned_word(code):
                print(f"🚫 Yasak kelime: {code}")
                return

            print(f"📡 FORMAT 2 | Kod: {code}")

            if mark_code_as_sent(code):
                await send_to_all_channels(code, link)
            else:
                print(f"🔄 Tekrar: {code}")
        else:
            print(f"🔍 DEBUG: FORMAT2 regex eşleşmedi, mesaj işlenmedi")

    except Exception as e:
        print(f"❌ Mesaj işleme hatası: {e}")
        print(traceback.format_exc())
        log_bot_message("error", "Mesaj işleme hatası", str(e)[:500])

# —————— ANA DİNLEYİCİ ——————
@client.on(events.NewMessage())
async def message_handler(event):
    """Dinleme kanallarından gelen mesajları işle"""
    try:
        if not event.chat:
            print("🔍 DEBUG: event.chat yok, atlanıyor")
            return

        current_channel_id = event.chat.id
        normalized_id = normalize_channel_id(current_channel_id)

        # DEBUG: Her mesajı logla
        chat_title = getattr(event.chat, 'title', 'Bilinmeyen')
        chat_username = getattr(event.chat, 'username', 'N/A')
        is_channel = getattr(event.chat, 'broadcast', False)

        print(f"")
        print(f"{'='*60}")
        print(f"🔔 YENİ MESAJ GELDİ!")
        print(f"{'='*60}")
        print(f"📍 Kanal: {chat_title} (@{chat_username})")
        print(f"📍 ID: {current_channel_id}")
        print(f"📍 Normalized ID: {normalized_id}")
        print(f"📍 Is Channel: {is_channel}")
        print(f"{'='*60}")

        # Dinleme kanallarını kontrol et
        listening_channels = get_listening_channels()
        print(f"📋 Dinleme listesi: {listening_channels}")

        matched = False
        for lc_id in listening_channels:
            print(f"🔍 Karşılaştırma: normalized_id({normalized_id}) == lc_id({lc_id})? {normalized_id == lc_id}")
            print(f"🔍 Karşılaştırma: current_channel_id({current_channel_id}) == lc_id({lc_id})? {current_channel_id == lc_id}")

            if normalized_id == lc_id or current_channel_id == lc_id:
                print(f"✅ EŞLEŞME BULUNDU! Kanal: {lc_id}")
                matched = True
                await process_message(event)
                break

        if not matched:
            print(f"⚠️ EŞLEŞME YOK!")
            print(f"   Mesaj kanal ID: {current_channel_id} (normalized: {normalized_id})")
            print(f"   Dinleme kanalları: {listening_channels}")
            print(f"   Tip karşılaştırması: mesaj_id type={type(current_channel_id)}, db type={type(listening_channels[0]) if listening_channels else 'N/A'}")

    except Exception as e:
        print(f"❌ Handler hatası: {e}")
        print(traceback.format_exc())

# —————— KEEP ALIVE ——————
async def keep_alive():
    """Bot'u canlı tut"""
    while True:
        try:
            print(f"🔍 DEBUG keep_alive: get_me çağrılıyor")
            await client.get_me()
            print(f"🔍 DEBUG keep_alive: cleanup_old_codes çağrılıyor")
            cleanup_old_codes()
            print(f"🔍 DEBUG keep_alive: update_bot_status(True) çağrılıyor")
            update_bot_status(True)
        except Exception as e:
            print(f"⚠️ Keep alive hatası: {e}")
            print(traceback.format_exc())
            update_bot_status(True, str(e)[:200])
        await asyncio.sleep(300)

# —————— BAŞLANGIÇ ——————
async def main():
    """Bot'u başlat"""
    print("=" * 60)
    print("🤖 Telegram Kod Botu Başlatılıyor...")
    print("=" * 60)
    print(f"🔍 DEBUG: API_ID = {api_id}")
    print(f"🔍 DEBUG: API_HASH = {api_hash[:10]}..." if api_hash else "❌ API_HASH boş!")
    print(f"🔍 DEBUG: SESSION_STRING = {'Var' if SESSION_STRING else 'Yok'}")
    print(f"🔍 DEBUG: BOT_TOKEN = {'Var' if BOT_TOKEN else 'Yok'}")
    print(f"🔍 DEBUG: DATABASE_URL = {'Var' if DATABASE_URL else 'Yok'}")
    print("=" * 60)

    try:
        print("🔄 Telethon client başlatılıyor...")
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
            print(f"   • {ch} (type: {type(ch)})")

        # Aktif hedef kanalları göster
        active_channels = get_active_channels()
        print(f"📢 Hedef kanallar: {len(active_channels)}")
        for ch in active_channels:
            print(f"   • {ch} (type: {type(ch)})")

        # Anahtar kelimeleri göster
        keywords = get_all_keywords()
        print(f"🔑 Anahtar kelimeler: {keywords}")

        # Telethon'un hangi kanallara erişebildiğini kontrol et
        print("")
        print("=" * 60)
        print("🔍 TELETHON KANAL ERİŞİM KONTROLÜ")
        print("=" * 60)
        try:
            dialogs = await client.get_dialogs(limit=50)
            print(f"📋 Erişilebilir kanal/grup sayısı: {len(dialogs)}")
            for dialog in dialogs:
                if dialog.is_channel:
                    print(f"   📢 {dialog.title} | ID: {dialog.id} | @{dialog.entity.username or 'N/A'}")
        except Exception as e:
            print(f"❌ Dialog listesi alınamadı: {e}")
        print("=" * 60)

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
        print(traceback.format_exc())
        update_bot_status(False, str(e)[:200])
        log_bot_message("error", "Bot hatası", str(e)[:500])
    finally:
        update_bot_status(False)
        await http_client.aclose()
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())


        # FORMAT 1: kelime\nkod\nlink (3 satır)
        if len(lines) >= 3:
            first_line = lines[0].lower()
            print(f"🔍 DEBUG FORMAT1 kontrol: first_line='{first_line}', in keywords={first_line in keywords}")

            if first_line in keywords:
                code = lines[1].strip()
                link = lines[2].strip()

                print(f"🔍 DEBUG FORMAT1: code='{code}', link='{link}'")

                # Kod kontrolü (alfanümerik + Türkçe + tire)
                code_match = re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code)
                link_match = re.match(link_pattern, link)
                print(f"🔍 DEBUG: code_match={bool(code_match)}, link_match={bool(link_match)}")

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
                else:
                    print(f"🔍 DEBUG: FORMAT1 regex eşleşmedi")

        # FORMAT 2: kod\nlink (2 satır)
        code = lines[0].strip()
        link = lines[1].strip()

        print(f"🔍 DEBUG FORMAT2: code='{code}', link='{link}'")

        # Kod kontrolü
        code_match = re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', code)
        link_match = re.match(link_pattern, link)
        print(f"🔍 DEBUG: code_match={bool(code_match)}, link_match={bool(link_match)}")

        if code_match and link_match:
            if has_banned_word(code):
                print(f"🚫 Yasak kelime: {code}")
                return

            print(f"📡 FORMAT 2 | Kod: {code}")

            if mark_code_as_sent(code):
                await send_to_all_channels(code, link)
            else:
                print(f"🔄 Tekrar: {code}")
        else:
            print(f"🔍 DEBUG: FORMAT2 regex eşleşmedi, mesaj işlenmedi")

    except Exception as e:
        print(f"❌ Mesaj işleme hatası: {e}")
        print(traceback.format_exc())
        log_bot_message("error", "Mesaj işleme hatası", str(e)[:500])

# —————— ANA DİNLEYİCİ ——————
@client.on(events.NewMessage())
async def message_handler(event):
    """Dinleme kanallarından gelen mesajları işle"""
    try:
        if not event.chat:
            print("🔍 DEBUG: event.chat yok, atlanıyor")
            return

        current_channel_id = event.chat.id
        normalized_id = normalize_channel_id(current_channel_id)

        # DEBUG: Her mesajı logla
        chat_title = getattr(event.chat, 'title', 'Bilinmeyen')
        chat_username = getattr(event.chat, 'username', 'N/A')
        is_channel = getattr(event.chat, 'broadcast', False)

        print(f"")
        print(f"{'='*60}")
        print(f"🔔 YENİ MESAJ GELDİ!")
        print(f"{'='*60}")
        print(f"📍 Kanal: {chat_title} (@{chat_username})")
        print(f"📍 ID: {current_channel_id}")
        print(f"📍 Normalized ID: {normalized_id}")
        print(f"📍 Is Channel: {is_channel}")
        print(f"{'='*60}")

        # Dinleme kanallarını kontrol et
        listening_channels = get_listening_channels()
        print(f"📋 Dinleme listesi: {listening_channels}")

        matched = False
        for lc_id in listening_channels:
            print(f"🔍 Karşılaştırma: normalized_id({normalized_id}) == lc_id({lc_id})? {normalized_id == lc_id}")
            print(f"🔍 Karşılaştırma: current_channel_id({current_channel_id}) == lc_id({lc_id})? {current_channel_id == lc_id}")

            if normalized_id == lc_id or current_channel_id == lc_id:
                print(f"✅ EŞLEŞME BULUNDU! Kanal: {lc_id}")
                matched = True
                await process_message(event)
                break

        if not matched:
            print(f"⚠️ EŞLEŞME YOK!")
            print(f"   Mesaj kanal ID: {current_channel_id} (normalized: {normalized_id})")
            print(f"   Dinleme kanalları: {listening_channels}")
            print(f"   Tip karşılaştırması: mesaj_id type={type(current_channel_id)}, db type={type(listening_channels[0]) if listening_channels else 'N/A'}")

    except Exception as e:
        print(f"❌ Handler hatası: {e}")
        print(traceback.format_exc())

# —————— KEEP ALIVE ——————
async def keep_alive():
    """Bot'u canlı tut"""
    while True:
        try:
            print(f"🔍 DEBUG keep_alive: get_me çağrılıyor")
            await client.get_me()
            print(f"🔍 DEBUG keep_alive: cleanup_old_codes çağrılıyor")
            cleanup_old_codes()
            print(f"🔍 DEBUG keep_alive: update_bot_status(True) çağrılıyor")
            update_bot_status(True)
        except Exception as e:
            print(f"⚠️ Keep alive hatası: {e}")
            print(traceback.format_exc())
            update_bot_status(True, str(e)[:200])
        await asyncio.sleep(300)

# —————— BAŞLANGIÇ ——————
async def main():
    """Bot'u başlat"""
    print("=" * 60)
    print("🤖 Telegram Kod Botu Başlatılıyor...")
    print("=" * 60)
    print(f"🔍 DEBUG: API_ID = {api_id}")
    print(f"🔍 DEBUG: API_HASH = {api_hash[:10]}..." if api_hash else "❌ API_HASH boş!")
    print(f"🔍 DEBUG: SESSION_STRING = {'Var' if SESSION_STRING else 'Yok'}")
    print(f"🔍 DEBUG: BOT_TOKEN = {'Var' if BOT_TOKEN else 'Yok'}")
    print(f"🔍 DEBUG: DATABASE_URL = {'Var' if DATABASE_URL else 'Yok'}")
    print("=" * 60)

    try:
        print("🔄 Telethon client başlatılıyor...")
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
            print(f"   • {ch} (type: {type(ch)})")

        # Aktif hedef kanalları göster
        active_channels = get_active_channels()
        print(f"📢 Hedef kanallar: {len(active_channels)}")
        for ch in active_channels:
            print(f"   • {ch} (type: {type(ch)})")

        # Anahtar kelimeleri göster
        keywords = get_all_keywords()
        print(f"🔑 Anahtar kelimeler: {keywords}")

        # Telethon'un hangi kanallara erişebildiğini kontrol et
        print("")
        print("=" * 60)
        print("🔍 TELETHON KANAL ERİŞİM KONTROLÜ")
        print("=" * 60)
        try:
            dialogs = await client.get_dialogs(limit=50)
            print(f"📋 Erişilebilir kanal/grup sayısı: {len(dialogs)}")
            for dialog in dialogs:
                if dialog.is_channel:
                    print(f"   📢 {dialog.title} | ID: {dialog.id} | @{dialog.entity.username or 'N/A'}")
        except Exception as e:
            print(f"❌ Dialog listesi alınamadı: {e}")
        print("=" * 60)

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
        print(traceback.format_exc())
        update_bot_status(False, str(e)[:200])
        log_bot_message("error", "Bot hatası", str(e)[:500])
    finally:
        update_bot_status(False)
        await http_client.aclose()
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
