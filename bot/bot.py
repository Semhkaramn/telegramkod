"""
Telegram Kod Botu - ANLIK DİNLEME VERSİYONU
=============================================
- FIX: Telegram bazı kanallar için update göndermiyor
- ÇÖZÜM: Agresif polling (1-2 saniye) + catch_up + GetChannelDifference
"""

import asyncio
import re
import time
import os
import sys
import logging
from datetime import datetime
import httpx
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.tl.functions.messages import GetHistoryRequest
from telethon.tl.functions.updates import GetChannelDifferenceRequest
from telethon.tl.types import ChannelMessagesFilterEmpty, InputChannel
from telethon.errors import ChannelPrivateError, ChannelInvalidError

# ══════════════════════════════════════════════════════════════════════════════
# LOGGING AYARLARI
# ══════════════════════════════════════════════════════════════════════════════

class HerokuFormatter(logging.Formatter):
    COLORS = {
        'DEBUG': '🔍',
        'INFO': '📋',
        'WARNING': '⚠️',
        'ERROR': '❌',
        'CRITICAL': '🚨'
    }

    def format(self, record):
        emoji = self.COLORS.get(record.levelname, '📋')
        timestamp = datetime.now().strftime('%H:%M:%S')
        return f"[{timestamp}] {emoji} {record.levelname} | {record.getMessage()}"

logger = logging.getLogger('TelegramBot')
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.DEBUG)
handler.setFormatter(HerokuFormatter())
logger.addHandler(handler)

# İstatistikler
stats = {
    'messages_received': 0,
    'format_passed': 0,
    'format_failed': 0,
    'keyword_matched': 0,
    'banned_word_blocked': 0,
    'duplicate_blocked': 0,
    'codes_sent': 0,
    'send_failures': 0,
    'last_code': None,
    'last_code_time': None,
    'polling_checks': 0,
    'polling_messages': 0,
    'catch_up_calls': 0
}

# ══════════════════════════════════════════════════════════════════════════════
# HARDCODED CONFIG
# ══════════════════════════════════════════════════════════════════════════════

LISTENING_CHANNELS = [
    -1002059757502,
    -1001513128130,
    -1002980401785,
    -1001904588149
]

CHANNEL_NAMES = {
    -1002059757502: "Kanal1",
    -1001513128130: "Kanal2",
    -1002980401785: "Kanal3",
    -1001904588149: "Kanal4"
}

KEYWORDS = {
    "bahi̇s1000",
    "eli̇t",
    "grand",
    "hizli",
    "jojobet",
    "kavbet",
    "mavi̇bet",
    "pusula",
    "pusulabet",
    "turbo",
    "megabahis"
}

BANNED_WORDS = {
    "aktif",
    "başladı",
    "test",
    "etkinliği",
    "geliyor",
    "hazirla",
    "için",
    "kimler"
}

# ══════════════════════════════════════════════════════════════════════════════
# ANLIK DİNLEME AYARLARI - KRİTİK!
# ══════════════════════════════════════════════════════════════════════════════
POLLING_INTERVAL = 2  # 2 SANİYE - Anlık dinleme için
CATCH_UP_INTERVAL = 30  # Her 30 saniyede catch_up çağır
USE_CHANNEL_DIFFERENCE = True  # GetChannelDifference API kullan

# Son mesaj ID'leri ve PTS takibi
last_seen_message_ids = {}  # {channel_id: last_message_id}
channel_pts = {}  # {channel_id: pts} - GetChannelDifference için

# ══════════════════════════════════════════════════════════════════════════════
# ENV AYARLARI
# ══════════════════════════════════════════════════════════════════════════════

API_ID = int(os.getenv('API_ID', '0'))
API_HASH = os.getenv('API_HASH', '')
DATABASE_URL = os.getenv('DATABASE_URL', '')
SESSION_STRING = os.getenv('SESSION_STRING', '')
BOT_TOKEN = os.getenv('BOT_TOKEN', '')

if not API_ID or not API_HASH:
    logger.error("HATA: API_ID ve API_HASH ayarlanmalı!")
if not DATABASE_URL:
    logger.error("HATA: DATABASE_URL ayarlanmalı!")
if not BOT_TOKEN:
    logger.error("HATA: BOT_TOKEN ayarlanmalı!")

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
    stats['last_code'] = code
    stats['last_code_time'] = datetime.now().strftime('%H:%M:%S')

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

target_channels_cache = []
admin_links_cache = {}
channel_user_map = {}
cache_last_update = 0
CACHE_TTL = 300

def get_db_connection():
    return psycopg2.connect(DATABASE_URL, connect_timeout=10)

def load_target_channels():
    global target_channels_cache, channel_user_map, admin_links_cache

    try:
        logger.info("DB'den hedef kanallar yükleniyor...")
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT DISTINCT uc.channel_id, uc.user_id
            FROM user_channels uc
            INNER JOIN users u ON uc.user_id = u.id
            WHERE uc.paused = false
              AND u.is_banned = false
              AND u.is_active = true
              AND u.bot_enabled = true
        """)

        results = cursor.fetchall()
        target_channels_cache = list(set([row[0] for row in results]))
        channel_user_map = {row[0]: row[1] for row in results}

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

        cursor.close()
        conn.close()

        logger.info(f"Cache güncellendi: {len(target_channels_cache)} hedef kanal")
        return True

    except Exception as e:
        logger.error(f"DB hatası: {e}")
        return False

def get_link_for_channel(channel_id: int, code: str, original_link: str) -> str:
    user_id = channel_user_map.get(channel_id)
    if user_id:
        links = admin_links_cache.get((user_id, channel_id), {})
        code_lower = code.lower()
        for link_code, link_url in links.items():
            if link_code in code_lower:
                return link_url
    return original_link

def maybe_refresh_cache():
    global cache_last_update
    now = time.time()
    if now - cache_last_update > CACHE_TTL:
        cache_last_update = now
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

    logger.info("📡 Kanal erişim kontrolü başlıyor...")

    for channel_id in LISTENING_CHANNELS:
        channel_name = CHANNEL_NAMES.get(channel_id, f"ID:{channel_id}")
        try:
            entity = await client.get_entity(channel_id)
            channel_entities[channel_id] = entity

            # Son mesaj ve pts al
            messages = await client.get_messages(entity, limit=1)
            if messages:
                last_seen_message_ids[channel_id] = messages[0].id
                # Full channel bilgisi al (pts için)
                full = await client.get_entity(channel_id)
                if hasattr(full, 'pts'):
                    channel_pts[channel_id] = full.pts
                logger.info(f"   ✅ {channel_name}: Erişim OK (Son ID: {messages[0].id})")
            else:
                last_seen_message_ids[channel_id] = 0
                logger.info(f"   ✅ {channel_name}: Erişim OK (Mesaj yok)")

        except ChannelPrivateError:
            inaccessible_channels.add(channel_id)
            logger.error(f"   ❌ {channel_name}: ÖZEL KANAL - Üye değilsiniz!")
        except ChannelInvalidError:
            inaccessible_channels.add(channel_id)
            logger.error(f"   ❌ {channel_name}: GEÇERSİZ KANAL ID!")
        except Exception as e:
            inaccessible_channels.add(channel_id)
            logger.error(f"   ❌ {channel_name}: Erişim hatası - {e}")

    accessible_count = len(LISTENING_CHANNELS) - len(inaccessible_channels)
    logger.info(f"📊 Erişim sonucu: {accessible_count}/{len(LISTENING_CHANNELS)} kanala erişim sağlandı")

# ══════════════════════════════════════════════════════════════════════════════
# AGRESİF POLLİNG - 2 SANİYEDE BİR KONTROL
# ══════════════════════════════════════════════════════════════════════════════

async def aggressive_polling():
    """Her 2 saniyede bir tüm kanalları kontrol et"""
    logger.info(f"🚀 Agresif polling başlatıldı ({POLLING_INTERVAL} saniye aralık)")

    while True:
        try:
            for channel_id in LISTENING_CHANNELS:
                if channel_id in inaccessible_channels:
                    continue

                entity = channel_entities.get(channel_id)
                if not entity:
                    continue

                channel_name = CHANNEL_NAMES.get(channel_id, f"ID:{channel_id}")
                last_id = last_seen_message_ids.get(channel_id, 0)

                try:
                    # Son 3 mesajı al (hız için az mesaj)
                    messages = await client.get_messages(
                        entity,
                        limit=3,
                        min_id=last_id
                    )

                    stats['polling_checks'] += 1

                    if messages:
                        for msg in reversed(messages):
                            if msg.id > last_id:
                                stats['polling_messages'] += 1
                                logger.info(f"⚡ ANLIK YAKALANDI! Kanal: {channel_name}, ID: {msg.id}")
                                await process_message_from_polling(msg, channel_id)
                                last_seen_message_ids[channel_id] = msg.id

                except Exception as e:
                    logger.debug(f"Polling hatası ({channel_name}): {e}")

            await asyncio.sleep(POLLING_INTERVAL)

        except Exception as e:
            logger.error(f"Polling loop hatası: {e}")
            await asyncio.sleep(1)

async def process_message_from_polling(message, channel_id):
    """Polling ile yakalanan mesajı işle"""
    class FakeEvent:
        def __init__(self, msg, chat_id):
            self.message = msg
            self.chat_id = chat_id

    fake_event = FakeEvent(message, channel_id)
    await process_message(fake_event)

# ══════════════════════════════════════════════════════════════════════════════
# CATCH_UP - Kaçırılan mesajları yakala
# ══════════════════════════════════════════════════════════════════════════════

async def periodic_catch_up():
    """Her 30 saniyede catch_up çağır - kaçırılan update'leri al"""
    while True:
        try:
            await asyncio.sleep(CATCH_UP_INTERVAL)
            logger.debug("🔄 catch_up() çağrılıyor...")
            await client.catch_up()
            stats['catch_up_calls'] += 1
        except Exception as e:
            logger.debug(f"catch_up hatası: {e}")

# ══════════════════════════════════════════════════════════════════════════════
# MESAJ GÖNDERME
# ══════════════════════════════════════════════════════════════════════════════

async def send_message(chat_id: int, text: str) -> dict:
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
            return {"success": True, "chat_id": chat_id}
        else:
            error_desc = result.get("description", "Bilinmeyen hata")
            return {"success": False, "chat_id": chat_id, "error": error_desc}

    except Exception as e:
        return {"success": False, "chat_id": chat_id, "error": str(e)}

async def send_to_all_channels(code: str, link: str, source_channel: int):
    if not target_channels_cache:
        logger.warning(f"HEDEF KANAL YOK! Kod gönderilemedi: {code}")
        return

    logger.info(f"{'='*50}")
    logger.info(f"📤 GÖNDERİLİYOR | Kod: {code}")
    logger.info(f"   Kaynak: {CHANNEL_NAMES.get(source_channel, source_channel)}")
    logger.info(f"   Hedef: {len(target_channels_cache)} kanal")

    tasks = []
    for channel_id in target_channels_cache:
        final_link = get_link_for_channel(channel_id, code, link)
        message = f"`{code}`\n\n{final_link}"
        tasks.append(send_message(channel_id, message))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    success_count = sum(1 for r in results if isinstance(r, dict) and r.get("success"))
    fail_count = len(results) - success_count

    stats['codes_sent'] += 1
    stats['send_failures'] += fail_count

    logger.info(f"📊 SONUÇ: ✅ {success_count} başarılı, ❌ {fail_count} başarısız")
    logger.info(f"{'='*50}")

# ══════════════════════════════════════════════════════════════════════════════
# MESAJ İŞLEME
# ══════════════════════════════════════════════════════════════════════════════

async def process_message(event):
    stats['messages_received'] += 1

    try:
        source_channel = event.chat_id
        channel_name = CHANNEL_NAMES.get(source_channel, f"ID:{source_channel}")

        text = event.message.message
        if not text:
            return

        text = text.strip()
        lines = [l.strip() for l in text.splitlines() if l.strip()]

        preview = text[:50].replace('\n', ' ') + ('...' if len(text) > 50 else '')

        logger.info(f"📩 MESAJ | {channel_name} | {preview}")

        if len(lines) < 2:
            stats['format_failed'] += 1
            return

        link_pattern = r'^(?:https?://)?(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+(?:/[^\s]*)?$'
        code_pattern = r'^[\wÇçĞğİıÖöŞşÜü-]+$'

        code = None
        link = None

        # FORMAT 1: anahtar_kelime\nkod\nlink
        if len(lines) >= 3:
            first_line_lower = lines[0].lower()
            if first_line_lower in KEYWORDS:
                potential_code = lines[1]
                potential_link = lines[2]

                if re.match(code_pattern, potential_code) and re.match(link_pattern, potential_link, re.IGNORECASE):
                    code = potential_code
                    link = potential_link
                    stats['keyword_matched'] += 1

        # FORMAT 2: kod\nlink
        if not code:
            potential_code = lines[0]
            potential_link = lines[1]

            if re.match(code_pattern, potential_code) and re.match(link_pattern, potential_link, re.IGNORECASE):
                code = potential_code
                link = potential_link

        if not code or not link:
            stats['format_failed'] += 1
            return

        stats['format_passed'] += 1

        # Yasak kelime kontrolü
        banned_in_code = has_banned_word(code)
        if banned_in_code:
            logger.warning(f"🚫 YASAK KELİME: '{banned_in_code}' -> {code}")
            stats['banned_word_blocked'] += 1
            return

        banned_in_link = has_banned_word(link)
        if banned_in_link:
            stats['banned_word_blocked'] += 1
            return

        # Tekrar kontrolü
        if is_code_sent(code):
            logger.debug(f"🔄 TEKRAR: {code}")
            stats['duplicate_blocked'] += 1
            return

        mark_code_sent(code)
        logger.info(f"🚀 YENİ KOD: {code}")

        await send_to_all_channels(code, link, source_channel)

    except Exception as e:
        logger.error(f"İŞLEME HATASI: {e}")
        import traceback
        logger.error(traceback.format_exc())

# ══════════════════════════════════════════════════════════════════════════════
# EVENT HANDLER
# ══════════════════════════════════════════════════════════════════════════════

def setup_handler():
    if LISTENING_CHANNELS:
        accessible_channels = [ch for ch in LISTENING_CHANNELS if ch not in inaccessible_channels]

        if accessible_channels:
            @client.on(events.NewMessage(chats=accessible_channels))
            async def handler(event):
                channel_id = event.chat_id
                msg_id = event.message.id

                last_id = last_seen_message_ids.get(channel_id, 0)
                if msg_id <= last_id:
                    return

                last_seen_message_ids[channel_id] = msg_id
                logger.info(f"📡 EVENT: Kanal {CHANNEL_NAMES.get(channel_id, channel_id)}, ID: {msg_id}")
                await process_message(event)

            logger.info(f"Event handler: {len(accessible_channels)} kanal")
        else:
            logger.error("HİÇBİR KANALA ERİŞİM YOK!")
    else:
        logger.error("DİNLEME KANALI TANIMLANMAMIŞ!")

# ══════════════════════════════════════════════════════════════════════════════
# KEEP ALIVE & İSTATİSTİKLER
# ══════════════════════════════════════════════════════════════════════════════

async def keep_alive():
    iteration = 0
    while True:
        try:
            iteration += 1
            await client.get_me()
            maybe_refresh_cache()

            now = time.time()
            expired = [k for k, v in sent_codes.items() if now - v > CODE_TTL]
            for k in expired:
                del sent_codes[k]

            if iteration % 5 == 0:
                logger.info(f"{'═'*50}")
                logger.info(f"📊 İSTATİSTİKLER ({iteration} dk)")
                logger.info(f"   Mesaj: {stats['messages_received']} | Kod: {stats['codes_sent']}")
                logger.info(f"   Polling: {stats['polling_checks']} kontrol, {stats['polling_messages']} mesaj")
                logger.info(f"   catch_up: {stats['catch_up_calls']} çağrı")
                if stats['last_code']:
                    logger.info(f"   Son: {stats['last_code']} ({stats['last_code_time']})")
                logger.info(f"{'═'*50}")

        except Exception as e:
            logger.error(f"Keep alive hatası: {e}")

        await asyncio.sleep(60)

# ══════════════════════════════════════════════════════════════════════════════
# BAŞLANGIÇ
# ══════════════════════════════════════════════════════════════════════════════

async def main():
    logger.info("=" * 60)
    logger.info("🤖 TELEGRAM KOD BOTU - ANLIK DİNLEME")
    logger.info("   Versiyon: 3.0 (Agresif Polling)")
    logger.info("=" * 60)

    try:
        await client.start()

        me = await client.get_me()
        logger.info(f"✅ Telethon: {me.first_name} (@{me.username})")

        if BOT_TOKEN:
            try:
                response = await http_client.get(f"{TELEGRAM_BOT_API}/getMe")
                bot_data = response.json()
                if bot_data.get("ok"):
                    logger.info(f"✅ Bot API: @{bot_data['result'].get('username')}")
            except Exception as e:
                logger.error(f"Bot API hatası: {e}")

        logger.info("")
        await check_channel_access()

        logger.info("")
        load_target_channels()

        setup_handler()

        logger.info("")
        logger.info("📊 AYARLAR:")
        logger.info(f"   Dinleme: {len(LISTENING_CHANNELS)} kanal")
        logger.info(f"   Erişilebilir: {len(LISTENING_CHANNELS) - len(inaccessible_channels)}")
        logger.info(f"   Hedef: {len(target_channels_cache)} kanal")
        logger.info(f"   ⚡ Polling: {POLLING_INTERVAL} saniye")
        logger.info(f"   🔄 Catch-up: {CATCH_UP_INTERVAL} saniye")

        # Tüm görevleri başlat
        asyncio.create_task(keep_alive())
        asyncio.create_task(aggressive_polling())  # AGRESİF POLLING
        asyncio.create_task(periodic_catch_up())   # CATCH_UP

        logger.info("")
        logger.info("=" * 60)
        logger.info("🚀 BOT ÇALIŞIYOR")
        logger.info("   ⚡ Event Handler + Agresif Polling + Catch-up")
        logger.info("=" * 60)

        await client.run_until_disconnected()

    except Exception as e:
        logger.error(f"Bot hatası: {e}")
        import traceback
        logger.error(traceback.format_exc())
    finally:
        await http_client.aclose()
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
