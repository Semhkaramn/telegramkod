"""
Telegram Kod Botu - Sadeleştirilmiş Versiyon (Detaylı Loglama)
=============================================
- Dinleme kanalları, anahtar kelimeler, yasak kelimeler → Hardcoded
- Hedef kanallar ve admin links → DB'den
- Gönderilen kodlar → Sadece memory cache
- İstatistik/Log → Detaylı Heroku Logging
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

# ══════════════════════════════════════════════════════════════════════════════
# LOGGING AYARLARI - Heroku için optimize edilmiş
# ══════════════════════════════════════════════════════════════════════════════

# Formatter - Heroku'da timestamp zaten ekleniyor ama yine de ekleyelim
class HerokuFormatter(logging.Formatter):
    """Heroku için özel formatter"""

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

# Logger oluştur
logger = logging.getLogger('TelegramBot')
logger.setLevel(logging.DEBUG)

# Handler - stdout için (Heroku bunu yakalar)
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
    'last_code_time': None
}

# ══════════════════════════════════════════════════════════════════════════════
# HARDCODED CONFIG - BURAYA KENDİ DEĞERLERİNİZİ YAZIN
# ══════════════════════════════════════════════════════════════════════════════

# Dinleme kanalları - Kodların alınacağı kanallar (ID formatında)
LISTENING_CHANNELS = [
    -1002059757502,
    -1001513128130,
    -1002980401785,
    -1001904588149
]

# Kanal isimlerini tutmak için (log'larda göstermek için)
CHANNEL_NAMES = {
    -1002059757502: "Kanal1",
    -1001513128130: "Kanal2",
    -1002980401785: "Kanal3",
    -1001904588149: "Kanal4"
}

# Anahtar kelimeler - Mesajın ilk satırında aranacak kelimeler
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

# Yasak kelimeler - Bu kelimeleri içeren kodlar gönderilmez
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
# ENV AYARLARI
# ══════════════════════════════════════════════════════════════════════════════

API_ID = int(os.getenv('API_ID', '0'))
API_HASH = os.getenv('API_HASH', '')
DATABASE_URL = os.getenv('DATABASE_URL', '')
SESSION_STRING = os.getenv('SESSION_STRING', '')
BOT_TOKEN = os.getenv('BOT_TOKEN', '')

# Kontroller
if not API_ID or not API_HASH:
    logger.error("HATA: API_ID ve API_HASH ayarlanmalı!")
if not DATABASE_URL:
    logger.error("HATA: DATABASE_URL ayarlanmalı!")
if not BOT_TOKEN:
    logger.error("HATA: BOT_TOKEN ayarlanmalı!")

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
    stats['last_code'] = code
    stats['last_code_time'] = datetime.now().strftime('%H:%M:%S')

    # Memory temizliği - 5000'den fazla kod varsa eski olanları sil
    if len(sent_codes) > 5000:
        now = time.time()
        expired = [k for k, v in sent_codes.items() if now - v > CODE_TTL]
        for k in expired:
            del sent_codes[k]
        logger.debug(f"Memory temizlendi: {len(expired)} eski kod silindi")

def has_banned_word(text: str) -> bool:
    """Metin yasak kelime içeriyor mu?"""
    text_lower = text.lower()
    for word in BANNED_WORDS:
        if word in text_lower:
            return word  # Hangi yasak kelime olduğunu döndür
    return None

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
        logger.info("DB'den hedef kanallar yükleniyor...")
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

        logger.info(f"Cache güncellendi: {len(target_channels_cache)} hedef kanal, {len(admin_links_cache)} admin link grubu")

        # Hedef kanalları listele
        if target_channels_cache:
            logger.debug(f"Hedef kanal ID'leri: {target_channels_cache[:5]}{'...' if len(target_channels_cache) > 5 else ''}")

        return True

    except Exception as e:
        logger.error(f"DB hatası: {e}")
        return False

def get_link_for_channel(channel_id: int, code: str, original_link: str) -> str:
    """Kanal için uygun linki al - önce özel link, yoksa orijinal"""
    user_id = channel_user_map.get(channel_id)
    if user_id:
        links = admin_links_cache.get((user_id, channel_id), {})
        code_lower = code.lower()
        for link_code, link_url in links.items():
            if link_code in code_lower:
                logger.debug(f"Özel link kullanılıyor: {link_code} -> {channel_id}")
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

async def send_message(chat_id: int, text: str) -> dict:
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

        if result.get("ok"):
            return {"success": True, "chat_id": chat_id}
        else:
            error_desc = result.get("description", "Bilinmeyen hata")
            logger.warning(f"Gönderim başarısız ({chat_id}): {error_desc}")
            return {"success": False, "chat_id": chat_id, "error": error_desc}

    except Exception as e:
        logger.error(f"Gönderim hatası ({chat_id}): {e}")
        return {"success": False, "chat_id": chat_id, "error": str(e)}

async def send_to_all_channels(code: str, link: str, source_channel: int):
    """Kodu tüm hedef kanallara gönder"""
    if not target_channels_cache:
        logger.warning(f"HEDEF KANAL YOK! Kod gönderilemedi: {code}")
        return

    logger.info(f"{'='*50}")
    logger.info(f"📤 GÖNDERME BAŞLADI | Kod: {code}")
    logger.info(f"   Kaynak: {CHANNEL_NAMES.get(source_channel, source_channel)}")
    logger.info(f"   Hedef: {len(target_channels_cache)} kanal")
    logger.info(f"   Link: {link[:50]}...")

    tasks = []
    for channel_id in target_channels_cache:
        final_link = get_link_for_channel(channel_id, code, link)
        message = f"`{code}`\n\n{final_link}"
        tasks.append(send_message(channel_id, message))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Sonuçları analiz et
    success_count = 0
    fail_count = 0
    errors = []

    for r in results:
        if isinstance(r, dict):
            if r.get("success"):
                success_count += 1
            else:
                fail_count += 1
                errors.append(f"{r.get('chat_id')}: {r.get('error', 'Bilinmeyen')}")
        else:
            fail_count += 1
            errors.append(str(r))

    # İstatistikleri güncelle
    stats['codes_sent'] += 1
    stats['send_failures'] += fail_count

    # Sonuç logu
    logger.info(f"📊 GÖNDERME SONUCU:")
    logger.info(f"   ✅ Başarılı: {success_count}/{len(target_channels_cache)}")

    if fail_count > 0:
        logger.warning(f"   ❌ Başarısız: {fail_count}")
        for err in errors[:3]:  # İlk 3 hatayı göster
            logger.warning(f"      - {err}")
        if len(errors) > 3:
            logger.warning(f"      ... ve {len(errors) - 3} hata daha")

    logger.info(f"{'='*50}")

# ══════════════════════════════════════════════════════════════════════════════
# MESAJ İŞLEME - Detaylı Loglama ile
# ══════════════════════════════════════════════════════════════════════════════

async def process_message(event):
    """Gelen mesajı işle - Her adımda detaylı log"""
    stats['messages_received'] += 1

    try:
        # Kaynak kanal bilgisi
        source_channel = event.chat_id
        channel_name = CHANNEL_NAMES.get(source_channel, f"ID:{source_channel}")

        text = event.message.message
        if not text:
            logger.debug(f"[{channel_name}] Boş mesaj, atlanıyor")
            return

        text = text.strip()
        lines = [l.strip() for l in text.splitlines() if l.strip()]

        # Kısa preview oluştur
        preview = text[:50].replace('\n', ' ') + ('...' if len(text) > 50 else '')

        logger.info(f"{'─'*40}")
        logger.info(f"📩 MESAJ ALINDI | Kaynak: {channel_name}")
        logger.info(f"   Satır sayısı: {len(lines)}")
        logger.info(f"   Önizleme: {preview}")

        # Satır sayısı kontrolü
        if len(lines) < 2:
            logger.debug(f"   ⏭️ FORMAT HATASI: Yetersiz satır ({len(lines)} < 2)")
            stats['format_failed'] += 1
            return

        # Link pattern
        link_pattern = r'^(?:https?://)?(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+(?:/[^\s]*)?$'
        code_pattern = r'^[\wÇçĞğİıÖöŞşÜü-]+$'

        code = None
        link = None
        matched_format = None
        matched_keyword = None

        # FORMAT 1: anahtar_kelime\nkod\nlink (3 satır)
        if len(lines) >= 3:
            first_line_lower = lines[0].lower()
            if first_line_lower in KEYWORDS:
                potential_code = lines[1]
                potential_link = lines[2]

                code_valid = re.match(code_pattern, potential_code)
                link_valid = re.match(link_pattern, potential_link, re.IGNORECASE)

                if code_valid and link_valid:
                    code = potential_code
                    link = potential_link
                    matched_format = "FORMAT 1 (keyword+kod+link)"
                    matched_keyword = lines[0]
                    stats['keyword_matched'] += 1
                    logger.info(f"   ✅ {matched_format}")
                    logger.info(f"   🔑 Anahtar Kelime: {matched_keyword}")
                else:
                    logger.debug(f"   ⏭️ FORMAT 1 uymadı: kod_valid={bool(code_valid)}, link_valid={bool(link_valid)}")
            else:
                logger.debug(f"   ⏭️ FORMAT 1: İlk satır anahtar kelime değil: '{lines[0]}'")

        # FORMAT 2: kod\nlink (2 satır)
        if not code:
            potential_code = lines[0]
            potential_link = lines[1]

            code_valid = re.match(code_pattern, potential_code)
            link_valid = re.match(link_pattern, potential_link, re.IGNORECASE)

            if code_valid and link_valid:
                code = potential_code
                link = potential_link
                matched_format = "FORMAT 2 (kod+link)"
                logger.info(f"   ✅ {matched_format}")
            else:
                logger.debug(f"   ⏭️ FORMAT 2 uymadı:")
                if not code_valid:
                    logger.debug(f"      - Kod formatı geçersiz: '{potential_code[:30]}'")
                if not link_valid:
                    logger.debug(f"      - Link formatı geçersiz: '{potential_link[:30]}'")

        # Format uyuşmadı
        if not code or not link:
            logger.info(f"   ❌ FORMAT UYMADI - Mesaj atlandı")
            stats['format_failed'] += 1
            return

        stats['format_passed'] += 1
        logger.info(f"   📝 Kod: {code}")
        logger.info(f"   🔗 Link: {link[:40]}...")

        # Yasak kelime kontrolü - KOD
        banned_in_code = has_banned_word(code)
        if banned_in_code:
            logger.warning(f"   🚫 YASAK KELİME (kodda): '{banned_in_code}' -> Kod: {code}")
            stats['banned_word_blocked'] += 1
            return

        # Yasak kelime kontrolü - LINK
        banned_in_link = has_banned_word(link)
        if banned_in_link:
            logger.warning(f"   🚫 YASAK KELİME (linkte): '{banned_in_link}' -> Link: {link[:40]}")
            stats['banned_word_blocked'] += 1
            return

        logger.debug(f"   ✅ Yasak kelime yok")

        # Tekrar kontrolü (memory cache)
        if is_code_sent(code):
            logger.warning(f"   🔄 TEKRAR KOD - Daha önce gönderildi: {code}")
            stats['duplicate_blocked'] += 1
            return

        logger.debug(f"   ✅ Tekrar değil, yeni kod")

        # Kodu işaretle ve gönder
        mark_code_sent(code)
        logger.info(f"   🚀 GÖNDERİLİYOR...")

        await send_to_all_channels(code, link, source_channel)

    except Exception as e:
        logger.error(f"İŞLEME HATASI: {e}")
        import traceback
        logger.error(traceback.format_exc())

# ══════════════════════════════════════════════════════════════════════════════
# EVENT HANDLER
# ══════════════════════════════════════════════════════════════════════════════

def setup_handler():
    """Event handler'ı kur"""
    if LISTENING_CHANNELS:
        @client.on(events.NewMessage(chats=LISTENING_CHANNELS))
        async def handler(event):
            await process_message(event)

        logger.info(f"Dinleme kanalları ayarlandı: {len(LISTENING_CHANNELS)} kanal")
        for ch_id in LISTENING_CHANNELS:
            ch_name = CHANNEL_NAMES.get(ch_id, "Bilinmeyen")
            logger.info(f"   - {ch_name} ({ch_id})")
    else:
        logger.error("DİNLEME KANALI TANIMLANMAMIŞ! Lütfen LISTENING_CHANNELS listesini doldurun.")

# ══════════════════════════════════════════════════════════════════════════════
# KEEP ALIVE & İSTATİSTİKLER
# ══════════════════════════════════════════════════════════════════════════════

async def keep_alive():
    """Bot'u canlı tut ve cache'i güncelle"""
    iteration = 0
    while True:
        try:
            iteration += 1
            await client.get_me()
            maybe_refresh_cache()

            # Memory temizliği
            now = time.time()
            expired = [k for k, v in sent_codes.items() if now - v > CODE_TTL]
            for k in expired:
                del sent_codes[k]

            # Her 5 dakikada bir istatistik göster
            if iteration % 5 == 0:
                logger.info(f"{'═'*50}")
                logger.info(f"📊 BOT İSTATİSTİKLERİ (Son {iteration} dakika)")
                logger.info(f"   Alınan mesaj: {stats['messages_received']}")
                logger.info(f"   Format geçen: {stats['format_passed']}")
                logger.info(f"   Format kalan: {stats['format_failed']}")
                logger.info(f"   Keyword eşleşen: {stats['keyword_matched']}")
                logger.info(f"   Yasak kelime engeli: {stats['banned_word_blocked']}")
                logger.info(f"   Tekrar engeli: {stats['duplicate_blocked']}")
                logger.info(f"   Gönderilen kod: {stats['codes_sent']}")
                logger.info(f"   Gönderim hatası: {stats['send_failures']}")
                logger.info(f"   Memory'de kod: {len(sent_codes)}")
                logger.info(f"   Hedef kanal: {len(target_channels_cache)}")
                if stats['last_code']:
                    logger.info(f"   Son kod: {stats['last_code']} ({stats['last_code_time']})")
                logger.info(f"{'═'*50}")

        except Exception as e:
            logger.error(f"Keep alive hatası: {e}")

        await asyncio.sleep(60)  # Her 1 dakikada bir

# ══════════════════════════════════════════════════════════════════════════════
# BAŞLANGIÇ
# ══════════════════════════════════════════════════════════════════════════════

async def main():
    """Bot'u başlat"""
    logger.info("=" * 60)
    logger.info("🤖 TELEGRAM KOD BOTU BAŞLATILIYOR")
    logger.info("   Versiyon: 2.0 (Detaylı Loglama)")
    logger.info("=" * 60)

    try:
        await client.start()

        me = await client.get_me()
        logger.info(f"Telethon bağlandı: {me.first_name} (@{me.username})")

        # Bot token kontrol
        if BOT_TOKEN:
            try:
                response = await http_client.get(f"{TELEGRAM_BOT_API}/getMe")
                bot_data = response.json()
                if bot_data.get("ok"):
                    logger.info(f"Bot API bağlandı: @{bot_data['result'].get('username')}")
            except Exception as e:
                logger.error(f"Bot API hatası: {e}")

        # Hedef kanalları yükle
        logger.info("")
        logger.info("📥 Hedef kanallar yükleniyor...")
        load_target_channels()

        # Event handler kur
        setup_handler()

        # Özet bilgi
        logger.info("")
        logger.info("📊 BAŞLANGIÇ ÖZETİ:")
        logger.info(f"   Dinleme kanalları: {len(LISTENING_CHANNELS)} (hardcoded)")
        logger.info(f"   Anahtar kelimeler: {len(KEYWORDS)} adet")
        logger.info(f"   Yasak kelimeler: {len(BANNED_WORDS)} adet")
        logger.info(f"   Hedef kanallar: {len(target_channels_cache)} (DB'den)")

        # Keep alive başlat
        asyncio.create_task(keep_alive())

        logger.info("")
        logger.info("=" * 60)
        logger.info("🚀 BOT ÇALIŞIYOR - Mesajlar dinleniyor...")
        logger.info("=" * 60)
        logger.info("")

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
