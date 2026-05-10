"""
Telegram Kod Botu - ANLIK DİNLEME VERSİYONU
- Detaylı Loglama Eklendi
"""

import asyncio
import re
import time
import os
import sys
import logging
import httpx
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import ChannelPrivateError, ChannelInvalidError

# ══════════════════════════════════════════════════════════════════════════════
# LOGGING AYARLARI (Heroku için)
# ══════════════════════════════════════════════════════════════════════════════

# Heroku için stdout'a loglama
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Flush logları hemen yazdırmak için
sys.stdout.reconfigure(line_buffering=True)

def log_info(message):
    """Bilgi logu"""
    logger.info(message)
    sys.stdout.flush()

def log_success(message):
    """Başarı logu"""
    logger.info(f"✅ {message}")
    sys.stdout.flush()

def log_warning(message):
    """Uyarı logu"""
    logger.warning(f"⚠️ {message}")
    sys.stdout.flush()

def log_error(message):
    """Hata logu"""
    logger.error(f"❌ {message}")
    sys.stdout.flush()

# ══════════════════════════════════════════════════════════════════════════════
# HARDCODED CONFIG
# ══════════════════════════════════════════════════════════════════════════════

LISTENING_CHANNELS = [
    -1002059757502,
    -1001513128130,
    -1001904588149,
    -1003795422286
]

CHANNEL_NAMES = {
    -1002059757502: "bamco",
    -1001513128130: "soft",
    -1001904588149: "bonusuzmanı",
    -1003795422286: "eser"
}

# Tek kelimelik isimler artık otomatik kabul ediliyor
# Bu set sadece birden fazla kelimeli özel durumlar için kullanılır
KEYWORDS = set()

BANNED_WORDS = {
    "aktif",
    "başladı",
    "test",
    "etkinliği",
    "geliyor",
    "hazirla",
    "için",
    "kimler",
    "BamcooSiteler"
}

# ══════════════════════════════════════════════════════════════════════════════
# ANLIK DİNLEME AYARLARI
# ══════════════════════════════════════════════════════════════════════════════
POLLING_INTERVAL = 2
CATCH_UP_INTERVAL = 30

last_seen_message_ids = {}
channel_pts = {}

# ══════════════════════════════════════════════════════════════════════════════
# ENV AYARLARI
# ══════════════════════════════════════════════════════════════════════════════

API_ID = int(os.getenv('API_ID', '0'))
API_HASH = os.getenv('API_HASH', '')
DATABASE_URL = os.getenv('DATABASE_URL', '')
SESSION_STRING = os.getenv('SESSION_STRING', '')
BOT_TOKEN = os.getenv('BOT_TOKEN', '')

TELEGRAM_BOT_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

# ══════════════════════════════════════════════════════════════════════════════
# MEMORY CACHE
# ══════════════════════════════════════════════════════════════════════════════

sent_codes = {}
CODE_TTL = 3600

def is_code_sent(code: str) -> bool:
    if code in sent_codes:
        if time.time() - sent_codes[code] < CODE_TTL:
            return True
        del sent_codes[code]
    return False

def mark_code_sent(code: str):
    sent_codes[code] = time.time()

    if len(sent_codes) > 5000:
        now = time.time()
        expired = [k for k, v in sent_codes.items() if now - v > CODE_TTL]
        for k in expired:
            del sent_codes[k]

def has_banned_word(text: str):
    text_lower = text.lower()
    for word in BANNED_WORDS:
        if word in text_lower:
            return word
    return None

# ══════════════════════════════════════════════════════════════════════════════
# DATABASE
# ══════════════════════════════════════════════════════════════════════════════

import psycopg2

# Cache yapısı: (user_id, channel_id) tuple bazlı
user_channel_cache = []  # [(user_id, channel_id), ...]
admin_links_cache = {}  # (user_id, channel_id) -> {link_code: link_url}
user_channel_filter_mode = {}  # (user_id, channel_id) -> "all" veya "filtered"
channel_filters = {}  # channel_id -> set of keywords (şimdilik channel bazlı)
cache_last_update = 0
cache_version = 0  # DB'deki cache version
CACHE_TTL = 60  # Fallback: 60 saniye (version kontrolü başarısız olursa)

def get_db_connection():
    return psycopg2.connect(DATABASE_URL, connect_timeout=10)

def load_target_channels():
    global user_channel_cache, admin_links_cache, user_channel_filter_mode, channel_filters

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Hedef user-channel kombinasyonlarını ve filter_mode bilgisini çek
        cursor.execute("""
            SELECT uc.user_id, uc.channel_id, uc.filter_mode
            FROM user_channels uc
            INNER JOIN users u ON uc.user_id = u.id
            WHERE uc.paused = false
              AND u.is_banned = false
              AND u.is_active = true
              AND u.bot_enabled = true
        """)

        results = cursor.fetchall()

        # (user_id, channel_id) tuple listesi
        user_channel_cache = [(row[0], row[1]) for row in results]

        # (user_id, channel_id) -> filter_mode
        user_channel_filter_mode = {(row[0], row[1]): (row[2] or "all") for row in results}

        log_info(f"📊 Hedef user-channel sayısı: {len(user_channel_cache)}")
        for user_id, ch_id in user_channel_cache:
            filter_mode = user_channel_filter_mode.get((user_id, ch_id), "all")
            log_info(f"   - User: {user_id} | Kanal: {ch_id} | Filter: {filter_mode}")

        # Admin linkleri çek
        cursor.execute("""
            SELECT user_id, channel_id, link_code, link_url
            FROM admin_links
        """)

        admin_links_cache = {}
        for row in cursor.fetchall():
            user_id, channel_id, link_code, link_url = row
            key = (user_id, channel_id)
            if key not in admin_links_cache:
                admin_links_cache[key] = {}
            admin_links_cache[key][link_code.lower()] = link_url

        log_info(f"🔗 Admin link sayısı: {len(admin_links_cache)}")

        # Kanal filtrelerini çek
        cursor.execute("""
            SELECT channel_id, keyword
            FROM channel_filters
        """)

        channel_filters = {}
        for row in cursor.fetchall():
            channel_id, keyword = row
            if channel_id not in channel_filters:
                channel_filters[channel_id] = set()
            channel_filters[channel_id].add(keyword.lower())

        log_info(f"🔍 Kanal filtresi sayısı: {len(channel_filters)}")

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        log_error(f"DB hatası: {e}")
        return False

def get_link_for_user_channel(user_id: int, channel_id: int, code: str, original_link: str) -> str:
    """Kullanıcı-kanal kombinasyonu için özel link getir"""
    links = admin_links_cache.get((user_id, channel_id), {})
    code_lower = code.lower()
    link_lower = original_link.lower()

    # Link kodlarını uzunluğa göre büyükten küçüğe sırala
    # Bu sayede "supertotobet" önce kontrol edilir, "otobet" sonra
    # Böylece "supertotobet" içinde "otobet" bulunması sorunu önlenir
    sorted_links = sorted(links.items(), key=lambda x: len(x[0]), reverse=True)

    for link_code, link_url in sorted_links:
        if link_code in code_lower or link_code in link_lower:
            return link_url
    return original_link

def should_send_to_user_channel(user_id: int, channel_id: int, code: str, link: str) -> tuple[bool, str]:
    """Kullanıcı-kanal kombinasyonu için gönderilmeli mi kontrol et
    Returns: (should_send, reason)
    """
    filter_mode = user_channel_filter_mode.get((user_id, channel_id), "all")

    # Eğer filter_mode "all" ise tüm kodlar gönderilir
    if filter_mode == "all":
        return True, "all"

    # Eğer filter_mode "filtered" ise sadece belirli kelimeler gönderilir
    keywords = channel_filters.get(channel_id, set())

    # Eğer hiç keyword tanımlanmamışsa gönderme
    if not keywords:
        return False, "no_keywords"

    # Kod veya linkte keyword var mı kontrol et
    code_lower = code.lower()
    link_lower = link.lower()

    # Keyword'leri uzunluğa göre büyükten küçüğe sırala
    # Bu sayede "supertotobet" önce kontrol edilir, "otobet" sonra
    sorted_keywords = sorted(keywords, key=len, reverse=True)

    for keyword in sorted_keywords:
        if keyword in code_lower or keyword in link_lower:
            return True, f"matched:{keyword}"

    return False, "no_match"

def check_cache_version() -> bool:
    """DB'deki cache_version değişmiş mi kontrol et"""
    global cache_version
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT version FROM cache_version WHERE id = 1")
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if row:
            db_version = row[0]
            if db_version != cache_version:
                cache_version = db_version
                return True  # Değişmiş, yenileme gerekli
        return False
    except Exception as e:
        log_warning(f"Cache version kontrol hatası: {e}")
        return False

def maybe_refresh_cache():
    global cache_last_update
    now = time.time()

    # Önce cache_version tablosunu kontrol et (anlık algılama)
    if check_cache_version():
        cache_last_update = now
        log_info("🔄 Cache yenileniyor (version değişti)...")
        load_target_channels()
        return

    # Fallback: Zaman bazlı kontrol (version kontrolü başarısız olursa)
    if now - cache_last_update > CACHE_TTL:
        cache_last_update = now
        log_info("🔄 Cache yenileniyor (TTL)...")
        load_target_channels()

# ══════════════════════════════════════════════════════════════════════════════
# TELEGRAM CLIENT
# ══════════════════════════════════════════════════════════════════════════════

if SESSION_STRING:
    client = TelegramClient(StringSession(SESSION_STRING), API_ID, API_HASH)
else:
    client = TelegramClient('bot_session', API_ID, API_HASH)

http_client = httpx.AsyncClient(
    timeout=httpx.Timeout(5.0, connect=3.0),
    limits=httpx.Limits(max_keepalive_connections=20, max_connections=50)
)

# ══════════════════════════════════════════════════════════════════════════════
# KANAL ERİŞİM KONTROLÜ VE ENTITY CACHE
# ══════════════════════════════════════════════════════════════════════════════

channel_entities = {}
inaccessible_channels = set()

async def check_channel_access():
    global channel_entities, inaccessible_channels, channel_pts

    log_info("🔍 Kaynak kanal erişimleri kontrol ediliyor...")

    for channel_id in LISTENING_CHANNELS:
        channel_name = CHANNEL_NAMES.get(channel_id, str(channel_id))
        try:
            entity = await client.get_entity(channel_id)
            channel_entities[channel_id] = entity

            messages = await client.get_messages(entity, limit=1)
            if messages:
                last_seen_message_ids[channel_id] = messages[0].id
                full = await client.get_entity(channel_id)
                if hasattr(full, 'pts'):
                    channel_pts[channel_id] = full.pts
            else:
                last_seen_message_ids[channel_id] = 0

            log_success(f"Kaynak kanal erişimi OK: {channel_name} ({channel_id})")

        except (ChannelPrivateError, ChannelInvalidError) as e:
            inaccessible_channels.add(channel_id)
            log_error(f"Kaynak kanal ERİŞİM YOK: {channel_name} ({channel_id}) - {type(e).__name__}")
        except Exception as e:
            inaccessible_channels.add(channel_id)
            log_error(f"Kaynak kanal HATA: {channel_name} ({channel_id}) - {e}")

    log_info(f"📡 Erişilebilir kaynak kanal: {len(channel_entities)}/{len(LISTENING_CHANNELS)}")

# ══════════════════════════════════════════════════════════════════════════════
# AGRESİF POLLİNG
# ══════════════════════════════════════════════════════════════════════════════

async def aggressive_polling():
    log_info("🚀 Aggressive polling başlatıldı...")
    while True:
        try:
            for channel_id in LISTENING_CHANNELS:
                if channel_id in inaccessible_channels:
                    continue

                entity = channel_entities.get(channel_id)
                if not entity:
                    continue

                last_id = last_seen_message_ids.get(channel_id, 0)

                try:
                    messages = await client.get_messages(
                        entity,
                        limit=3,
                        min_id=last_id
                    )

                    if messages:
                        for msg in reversed(messages):
                            if msg.id > last_id:
                                await process_message_from_polling(msg, channel_id)
                                last_seen_message_ids[channel_id] = msg.id

                except Exception as e:
                    log_warning(f"Polling hatası ({channel_id}): {e}")

            await asyncio.sleep(POLLING_INTERVAL)

        except Exception as e:
            log_error(f"Polling döngü hatası: {e}")
            await asyncio.sleep(1)

async def process_message_from_polling(message, channel_id):
    class FakeEvent:
        def __init__(self, msg, chat_id):
            self.message = msg
            self.chat_id = chat_id

    fake_event = FakeEvent(message, channel_id)
    await process_message(fake_event)

# ══════════════════════════════════════════════════════════════════════════════
# CATCH_UP
# ══════════════════════════════════════════════════════════════════════════════

async def periodic_catch_up():
    while True:
        try:
            await asyncio.sleep(CATCH_UP_INTERVAL)
            await client.catch_up()
        except Exception:
            pass

# ══════════════════════════════════════════════════════════════════════════════
# MESAJ GÖNDERME
# ══════════════════════════════════════════════════════════════════════════════

async def send_message(chat_id: int, text: str, code: str) -> dict:
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

        if result.get("ok"):
            log_success(f"GÖNDERİM BAŞARILI | Kanal: {chat_id} | Kod: {code}")
            return {"success": True, "chat_id": chat_id}
        else:
            error_desc = result.get("description", "Bilinmeyen hata")
            error_code = result.get("error_code", "?")
            log_error(f"GÖNDERİM BAŞARISIZ | Kanal: {chat_id} | Kod: {code} | Hata: [{error_code}] {error_desc}")
            return {"success": False, "chat_id": chat_id, "error": error_desc}

    except Exception as e:
        log_error(f"GÖNDERİM EXCEPTION | Kanal: {chat_id} | Kod: {code} | Hata: {e}")
        return {"success": False, "chat_id": chat_id, "error": str(e)}

async def send_to_all_channels(code: str, link: str, source_channel: int):
    source_name = CHANNEL_NAMES.get(source_channel, str(source_channel))

    if not user_channel_cache:
        log_warning(f"HEDEF KANAL YOK! Kod: {code} | Kaynak: {source_name}")
        return

    # Filtre kontrolü ile gönderilecek user-channel kombinasyonlarını belirle
    user_channels_to_send = []
    filtered_out_count = 0

    # Aynı kanala birden fazla kez gönderilmemesi için kanal bazlı takip
    sent_channels = set()

    for user_id, channel_id in user_channel_cache:
        # Aynı kanala zaten gönderilmişse atla (ilk user'ın ayarları geçerli)
        if channel_id in sent_channels:
            continue

        should_send, reason = should_send_to_user_channel(user_id, channel_id, code, link)
        if should_send:
            user_channels_to_send.append((user_id, channel_id))
            sent_channels.add(channel_id)
        else:
            filtered_out_count += 1

    if not user_channels_to_send:
        log_info(f"⛔ Tüm kanallar filtrelendi ({filtered_out_count}) | Kod: {code} | Kaynak: {source_name}")
        return

    # Sadece özet bilgi logla
    log_info(f"📤 GÖNDERİM | Kod: {code} | Kaynak: {source_name} | Hedef: {len(user_channels_to_send)} kanal (filtrelenen: {filtered_out_count})")

    tasks = []
    for user_id, channel_id in user_channels_to_send:
        final_link = get_link_for_user_channel(user_id, channel_id, code, link)
        message = f"`{code}`\n\n{final_link}"
        tasks.append(send_message(channel_id, message, code))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Sonuçları say
    success_count = 0
    fail_count = 0
    for r in results:
        if isinstance(r, dict) and r.get("success"):
            success_count += 1
        else:
            fail_count += 1

    # Sadece başarısız varsa detaylı log
    if fail_count > 0:
        log_info(f"📊 SONUÇ | Kod: {code} | Başarılı: {success_count} | Başarısız: {fail_count}")

# ══════════════════════════════════════════════════════════════════════════════
# MESAJ İŞLEME
# ══════════════════════════════════════════════════════════════════════════════

async def process_message(event):
    try:
        source_channel = event.chat_id
        source_name = CHANNEL_NAMES.get(source_channel, str(source_channel))

        text = event.message.message
        if not text:
            return

        text = text.strip()
        lines = [l.strip() for l in text.splitlines() if l.strip()]

        # Format kontrolü: en az 2 satır gerekli
        if len(lines) < 2:
            log_info(f"📥 MESAJ ALINDI | Kaynak: {source_name} | FORMAT UYMUYOR: 2 satırdan az | İçerik: {text[:50]}...")
            return

        link_pattern = r'^(?:https?://)?(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+(?:/[^\s]*)?$'
        code_pattern = r'^[\wÇçĞğİıÖöŞşÜü-]+$'

        code = None
        link = None
        format_type = None

        # FORMAT 1: anahtar_kelime\nkod\nlink
        if len(lines) >= 3:
            first_line_lower = lines[0].lower()
            # Tek kelimelik ise direkt kabul et, yoksa KEYWORDS'de olmalı
            is_single_word = ' ' not in first_line_lower and '\t' not in first_line_lower
            if is_single_word or first_line_lower in KEYWORDS:
                potential_code = lines[1]
                potential_link = lines[2]

                if re.match(code_pattern, potential_code) and re.match(link_pattern, potential_link, re.IGNORECASE):
                    code = potential_code
                    link = potential_link
                    if is_single_word:
                        format_type = f"FORMAT-1 (tek_kelime:{lines[0]}+kod+link)"
                    else:
                        format_type = f"FORMAT-1 (keyword:{lines[0]}+kod+link)"

        # FORMAT 2: kod\nlink
        if not code:
            potential_code = lines[0]
            potential_link = lines[1]

            if re.match(code_pattern, potential_code) and re.match(link_pattern, potential_link, re.IGNORECASE):
                code = potential_code
                link = potential_link
                format_type = "FORMAT-2 (kod+link)"

        if not code or not link:
            log_info(f"📥 MESAJ ALINDI | Kaynak: {source_name} | FORMAT UYMUYOR: Kod veya link bulunamadı | Satırlar: {lines[:3]}")
            return

        # Yasak kelime kontrolü
        banned = has_banned_word(code)
        if banned:
            log_info(f"📥 MESAJ ALINDI | Kaynak: {source_name} | YASAK KELİME (kod): '{banned}' | Kod: {code}")
            return

        banned_link = has_banned_word(link)
        if banned_link:
            log_info(f"📥 MESAJ ALINDI | Kaynak: {source_name} | YASAK KELİME (link): '{banned_link}' | Link: {link}")
            return

        # Tekrar kontrolü
        if is_code_sent(code):
            log_info(f"📥 MESAJ ALINDI | Kaynak: {source_name} | TEKRAR KOD: {code}")
            return

        # ✅ FORMAT UYGUN - İşleme al
        log_success(f"FORMAT UYGUN | Kaynak: {source_name} | {format_type} | Kod: {code} | Link: {link}")

        mark_code_sent(code)

        await send_to_all_channels(code, link, source_channel)

    except Exception as e:
        log_error(f"process_message hatası: {e}")

# ══════════════════════════════════════════════════════════════════════════════
# EVENT HANDLER
# ══════════════════════════════════════════════════════════════════════════════

def setup_handler():
    if LISTENING_CHANNELS:
        accessible_channels = [ch for ch in LISTENING_CHANNELS if ch not in inaccessible_channels]

        if accessible_channels:
            log_info(f"🎯 Event handler kuruldu: {len(accessible_channels)} kanal")

            @client.on(events.NewMessage(chats=accessible_channels))
            async def handler(event):
                channel_id = event.chat_id
                msg_id = event.message.id

                last_id = last_seen_message_ids.get(channel_id, 0)
                if msg_id <= last_id:
                    return

                last_seen_message_ids[channel_id] = msg_id
                await process_message(event)

# ══════════════════════════════════════════════════════════════════════════════
# KEEP ALIVE
# ══════════════════════════════════════════════════════════════════════════════

async def keep_alive():
    while True:
        try:
            await client.get_me()
            maybe_refresh_cache()

            now = time.time()
            expired = [k for k, v in sent_codes.items() if now - v > CODE_TTL]
            for k in expired:
                del sent_codes[k]

        except Exception as e:
            log_warning(f"Keep-alive hatası: {e}")

        await asyncio.sleep(10)  # 10 saniyede bir cache kontrolü (version-based)

# ══════════════════════════════════════════════════════════════════════════════
# BAŞLANGIÇ
# ══════════════════════════════════════════════════════════════════════════════

async def main():
    try:
        log_info("=" * 60)
        log_info("🤖 TELEGRAM KOD BOTU BAŞLATILIYOR")
        log_info("=" * 60)

        await client.start()
        log_success("Telegram client bağlandı")

        await check_channel_access()

        # İlk cache_version'ı yükle
        check_cache_version()
        load_target_channels()
        setup_handler()

        log_info("=" * 60)
        log_info("✅ BOT HAZIR - DİNLEME BAŞLADI")
        log_info(f"📡 Dinlenen kaynak kanal: {len(channel_entities)}")
        log_info(f"📤 Hedef user-channel sayısı: {len(user_channel_cache)}")
        log_info("=" * 60)

        asyncio.create_task(keep_alive())
        asyncio.create_task(aggressive_polling())
        asyncio.create_task(periodic_catch_up())

        await client.run_until_disconnected()

    except Exception as e:
        log_error(f"Bot kritik hatası: {e}")
    finally:
        await http_client.aclose()
        await client.disconnect()
        log_info("Bot kapatıldı")

if __name__ == "__main__":
    asyncio.run(main())
