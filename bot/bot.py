"""
Telegram Kod Botu - ANLIK DİNLEME VERSİYONU
"""

import asyncio
import re
import time
import os
from datetime import datetime
import httpx
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import ChannelPrivateError, ChannelInvalidError

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
    "turboslot",
    "megabahis",
    "matbet"
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
        return True

    except Exception as e:
        print(f"DB hatası: {e}")
        return False

def get_link_for_channel(channel_id: int, code: str, original_link: str) -> str:
    user_id = channel_user_map.get(channel_id)
    if user_id:
        links = admin_links_cache.get((user_id, channel_id), {})
        code_lower = code.lower()
        link_lower = original_link.lower()
        for link_code, link_url in links.items():
            if link_code in code_lower or link_code in link_lower:
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

    for channel_id in LISTENING_CHANNELS:
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

        except (ChannelPrivateError, ChannelInvalidError):
            inaccessible_channels.add(channel_id)
        except Exception:
            inaccessible_channels.add(channel_id)

# ══════════════════════════════════════════════════════════════════════════════
# AGRESİF POLLİNG
# ══════════════════════════════════════════════════════════════════════════════

async def aggressive_polling():
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

                except Exception:
                    pass

            await asyncio.sleep(POLLING_INTERVAL)

        except Exception:
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
            return {"success": False, "chat_id": chat_id}

    except Exception:
        return {"success": False, "chat_id": chat_id}

async def send_to_all_channels(code: str, link: str, source_channel: int):
    if not target_channels_cache:
        return

    tasks = []
    for channel_id in target_channels_cache:
        final_link = get_link_for_channel(channel_id, code, link)
        message = f"`{code}`\n\n{final_link}"
        tasks.append(send_message(channel_id, message))

    await asyncio.gather(*tasks, return_exceptions=True)

# ══════════════════════════════════════════════════════════════════════════════
# MESAJ İŞLEME
# ══════════════════════════════════════════════════════════════════════════════

async def process_message(event):
    try:
        source_channel = event.chat_id

        text = event.message.message
        if not text:
            return

        text = text.strip()
        lines = [l.strip() for l in text.splitlines() if l.strip()]

        if len(lines) < 2:
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

        # FORMAT 2: kod\nlink
        if not code:
            potential_code = lines[0]
            potential_link = lines[1]

            if re.match(code_pattern, potential_code) and re.match(link_pattern, potential_link, re.IGNORECASE):
                code = potential_code
                link = potential_link

        if not code or not link:
            return

        # Yasak kelime kontrolü
        if has_banned_word(code):
            return

        if has_banned_word(link):
            return

        # Tekrar kontrolü
        if is_code_sent(code):
            return

        mark_code_sent(code)

        await send_to_all_channels(code, link, source_channel)

    except Exception:
        pass

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

        except Exception:
            pass

        await asyncio.sleep(60)

# ══════════════════════════════════════════════════════════════════════════════
# BAŞLANGIÇ
# ══════════════════════════════════════════════════════════════════════════════

async def main():
    try:
        await client.start()
        await check_channel_access()
        load_target_channels()
        setup_handler()

        asyncio.create_task(keep_alive())
        asyncio.create_task(aggressive_polling())
        asyncio.create_task(periodic_catch_up())

        await client.run_until_disconnected()

    except Exception as e:
        print(f"Bot hatası: {e}")
    finally:
        await http_client.aclose()
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
