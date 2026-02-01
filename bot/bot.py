"""
Telegram Kod Botu - Sadeleştirilmiş Versiyon
=============================================
- Dinleme kanalları, anahtar kelimeler, yasak kelimeler → Hardcoded
- Hedef kanallar ve admin links → DB'den
- Gönderilen kodlar → Sadece memory cache
- İstatistik/Log → YOK
"""

import asyncio
import re
import time
import os
import httpx
from telethon import TelegramClient, events
from telethon.sessions import StringSession

# ══════════════════════════════════════════════════════════════════════════════
# HARDCODED CONFIG - BURAYA KENDİ DEĞERLERİNİZİ YAZIN
# ══════════════════════════════════════════════════════════════════════════════

# Dinleme kanalları - Kodların alınacağı kanallar (ID formatında)
# Örnek: [-1001234567890, -1009876543210]
LISTENING_CHANNELS = [
    -1002059757502,
    -1001513128130,
    -1002980401785,
    -1001904588149
]

# Anahtar kelimeler - Mesajın ilk satırında aranacak kelimeler
# Örnek: {"bonus", "kod", "promosyon", "code"}
KEYWORDS = {
    # BURAYA ANAHTAR KELİMELERİ YAZIN
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
    # "promosyon",
}

# Yasak kelimeler - Bu kelimeleri içeren kodlar gönderilmez
# Örnek: {"spam", "fake", "test"}
BANNED_WORDS = {
    # BURAYA YASAK KELİMELERİ YAZIN
    "aktif",
    "başladı",
    "test",
    "etkinliği",
    "geliyor",
    "hazirla",
    "için",
    "kimler"


    # "fake",
}

# ══════════════════════════════════════════════════════════════════════════════
# ENV AYARLARI
# ══════════════════════════════════════════════════════════════════════════════

API_ID = int(os.getenv('API_ID', '0'))
API_HASH = os.getenv('API_HASH', '')
DATABASE_URL = os.getenv('DATABASE_URL', '')
SESSION_STRING = os.getenv('SESSION_STRING', '')
BOT_TOKEN = os.getenv('BOT_TOKEN', '')

# Kontroller
if not API_ID or not API_HASH:
    print("❌ HATA: API_ID ve API_HASH ayarlanmalı!")
if not DATABASE_URL:
    print("❌ HATA: DATABASE_URL ayarlanmalı!")
if not BOT_TOKEN:
    print("❌ HATA: BOT_TOKEN ayarlanmalı!")

# Telegram Bot API
TELEGRAM_BOT_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

# ══════════════════════════════════════════════════════════════════════════════
# MEMORY CACHE - Gönderilen kodlar (DB yok, sadece memory)
# ══════════════════════════════════════════════════════════════════════════════

sent_codes = {}  # {code: timestamp}
CODE_TTL = 3600  # 1 saat

def is_code_sent(code: str) -> bool:
    """Kod daha önce gönderildi mi?"""
    if code in sent_codes:
        if time.time() - sent_codes[code] < CODE_TTL:
            return True
        del sent_codes[code]
    return False

def mark_code_sent(code: str):
    """Kodu gönderildi olarak işaretle"""
    sent_codes[code] = time.time()

    # Memory temizliği - 5000'den fazla kod varsa eski olanları sil
    if len(sent_codes) > 5000:
        now = time.time()
        expired = [k for k, v in sent_codes.items() if now - v > CODE_TTL]
        for k in expired:
            del sent_codes[k]

def has_banned_word(text: str) -> bool:
    """Metin yasak kelime içeriyor mu?"""
    text_lower = text.lower()
    return any(word in text_lower for word in BANNED_WORDS)

# ══════════════════════════════════════════════════════════════════════════════
# DATABASE - Sadece hedef kanallar ve admin links için
# ══════════════════════════════════════════════════════════════════════════════

import psycopg2

# Cache - Başlangıçta bir kez yüklenir, 5 dakikada bir güncellenir
target_channels_cache = []  # [channel_id, ...]
admin_links_cache = {}  # {(user_id, channel_id): {code: url}}
channel_user_map = {}  # {channel_id: user_id}
cache_last_update = 0
CACHE_TTL = 300  # 5 dakika

def get_db_connection():
    """DB bağlantısı al"""
    return psycopg2.connect(DATABASE_URL, connect_timeout=10)

def load_target_channels():
    """Hedef kanalları DB'den yükle"""
    global target_channels_cache, channel_user_map, admin_links_cache

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Aktif hedef kanalları al
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

        # Admin linklerini al
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

        print(f"✅ Cache güncellendi: {len(target_channels_cache)} hedef kanal, {len(admin_links_cache)} admin link")
        return True

    except Exception as e:
        print(f"❌ DB hatası: {e}")
        return False

def get_link_for_channel(channel_id: int, code: str, original_link: str) -> str:
    """Kanal için uygun linki al - önce özel link, yoksa orijinal"""
    user_id = channel_user_map.get(channel_id)
    if user_id:
        links = admin_links_cache.get((user_id, channel_id), {})
        code_lower = code.lower()
        for link_code, link_url in links.items():
            if link_code in code_lower:
                return link_url
    return original_link

def maybe_refresh_cache():
    """Gerekirse cache'i güncelle"""
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

# HTTP Client
http_client = httpx.AsyncClient(
    timeout=httpx.Timeout(5.0, connect=3.0),
    limits=httpx.Limits(max_keepalive_connections=20, max_connections=50)
)

# ══════════════════════════════════════════════════════════════════════════════
# MESAJ GÖNDERME
# ══════════════════════════════════════════════════════════════════════════════

async def send_message(chat_id: int, text: str) -> bool:
    """Bot API ile mesaj gönder"""
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
        return result.get("ok", False)
    except Exception as e:
        print(f"❌ Gönderim hatası ({chat_id}): {e}")
        return False

async def send_to_all_channels(code: str, link: str):
    """Kodu tüm hedef kanallara gönder"""
    if not target_channels_cache:
        print(f"⚠️ Hedef kanal yok! Kod: {code}")
        return

    print(f"📤 Gönderiliyor: {code} -> {len(target_channels_cache)} kanal")

    tasks = []
    for channel_id in target_channels_cache:
        final_link = get_link_for_channel(channel_id, code, link)
        message = f"`{code}`\n\n{final_link}"
        tasks.append(send_message(channel_id, message))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    success = sum(1 for r in results if r is True)
    print(f"   ✅ {success}/{len(target_channels_cache)} başarılı")

# ══════════════════════════════════════════════════════════════════════════════
# MESAJ İŞLEME
# ══════════════════════════════════════════════════════════════════════════════

async def process_message(event):
    """Gelen mesajı işle"""
    try:
        text = event.message.message
        if not text:
            return

        text = text.strip()
        lines = [l.strip() for l in text.splitlines() if l.strip()]

        if len(lines) < 2:
            return

        # Link pattern
        link_pattern = r'^(?:https?://)?(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+(?:/[^\s]*)?$'

        code = None
        link = None

        # FORMAT 1: anahtar_kelime\nkod\nlink (3 satır)
        if len(lines) >= 3 and lines[0].lower() in KEYWORDS:
            potential_code = lines[1]
            potential_link = lines[2]

            if re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', potential_code) and re.match(link_pattern, potential_link, re.IGNORECASE):
                code = potential_code
                link = potential_link
                print(f"📡 FORMAT 1 | Kelime: {lines[0]} | Kod: {code}")

        # FORMAT 2: kod\nlink (2 satır)
        if not code:
            potential_code = lines[0]
            potential_link = lines[1]

            if re.match(r'^[\wÇçĞğİıÖöŞşÜü-]+$', potential_code) and re.match(link_pattern, potential_link, re.IGNORECASE):
                code = potential_code
                link = potential_link
                print(f"📡 FORMAT 2 | Kod: {code}")

        if not code or not link:
            return

        # Yasak kelime kontrolü
        if has_banned_word(code) or has_banned_word(link):
            print(f"🚫 Yasak kelime: {code}")
            return

        # Tekrar kontrolü (memory cache)
        if is_code_sent(code):
            print(f"🔄 Tekrar: {code}")
            return

        # Kodu işaretle ve gönder
        mark_code_sent(code)
        await send_to_all_channels(code, link)

    except Exception as e:
        print(f"❌ İşleme hatası: {e}")

# ══════════════════════════════════════════════════════════════════════════════
# EVENT HANDLER
# ══════════════════════════════════════════════════════════════════════════════

def setup_handler():
    """Event handler'ı kur"""
    if LISTENING_CHANNELS:
        @client.on(events.NewMessage(chats=LISTENING_CHANNELS))
        async def handler(event):
            await process_message(event)
        print(f"✅ {len(LISTENING_CHANNELS)} dinleme kanalı ayarlandı")
    else:
        print("⚠️ DİNLEME KANALI TANIMLANMAMIŞ! Lütfen LISTENING_CHANNELS listesini doldurun.")

# ══════════════════════════════════════════════════════════════════════════════
# KEEP ALIVE
# ══════════════════════════════════════════════════════════════════════════════

async def keep_alive():
    """Bot'u canlı tut ve cache'i güncelle"""
    while True:
        try:
            await client.get_me()
            maybe_refresh_cache()

            # Memory temizliği
            now = time.time()
            expired = [k for k, v in sent_codes.items() if now - v > CODE_TTL]
            for k in expired:
                del sent_codes[k]

        except Exception as e:
            print(f"⚠️ Keep alive hatası: {e}")

        await asyncio.sleep(60)  # Her 1 dakikada bir

# ══════════════════════════════════════════════════════════════════════════════
# BAŞLANGIÇ
# ══════════════════════════════════════════════════════════════════════════════

async def main():
    """Bot'u başlat"""
    print("=" * 60)
    print("🤖 Telegram Kod Botu - Sadeleştirilmiş Versiyon")
    print("=" * 60)

    try:
        await client.start()

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

        # Hedef kanalları yükle
        print("\n📥 Hedef kanallar yükleniyor...")
        load_target_channels()

        # Event handler kur
        setup_handler()

        print(f"\n📊 Özet:")
        print(f"   Dinleme kanalları: {len(LISTENING_CHANNELS)} (hardcoded)")
        print(f"   Anahtar kelimeler: {KEYWORDS if KEYWORDS else 'YOK'}")
        print(f"   Yasak kelimeler: {BANNED_WORDS if BANNED_WORDS else 'YOK'}")
        print(f"   Hedef kanallar: {len(target_channels_cache)} (DB'den)")

        # Keep alive başlat
        asyncio.create_task(keep_alive())

        print("\n" + "=" * 60)
        print("🚀 Bot çalışıyor!")
        print("=" * 60 + "\n")

        await client.run_until_disconnected()

    except Exception as e:
        print(f"❌ Bot hatası: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await http_client.aclose()
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
