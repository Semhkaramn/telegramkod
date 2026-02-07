/**
 * Issue #19 fix: Telegram API yardımcı fonksiyonları
 * Kanal fotoğrafları ve bilgileri otomatik güncelleme
 */

import { prisma } from "./db";

const BOT_TOKEN = process.env.BOT_TOKEN || "";

interface TelegramChannelInfo {
  id: string;
  title: string;
  username: string | null;
  photoUrl: string | null;
  memberCount: number | null;
  description: string | null;
}

/**
 * Telegram Bot API'den kanal bilgisi al
 */
export async function fetchChannelInfoFromTelegram(
  channelId: string
): Promise<TelegramChannelInfo | null> {
  if (!BOT_TOKEN) return null;

  try {
    // @ işaretini kaldır
    let chatId = channelId.trim();
    if (chatId.startsWith("@")) {
      chatId = chatId.substring(1);
    }

    // Telegram Bot API ile kanal bilgisi al
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId.includes("-") ? chatId : `@${chatId}`,
        }),
      }
    );

    const data = await response.json();
    if (!data.ok) return null;

    const chat = data.result;

    // Kanal fotoğrafını al
    let photoUrl = null;
    if (chat.photo) {
      try {
        const fileResponse = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/getFile`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file_id: chat.photo.small_file_id }),
          }
        );
        const fileData = await fileResponse.json();
        if (fileData.ok) {
          photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
        }
      } catch (e) {
        console.error("Error fetching channel photo:", e);
      }
    }

    return {
      id: chat.id.toString(),
      title: chat.title || chat.username || `Kanal ${chat.id}`,
      username: chat.username || null,
      photoUrl,
      memberCount: chat.member_count || null,
      description: chat.description || null,
    };
  } catch (error) {
    console.error("Error fetching channel from Telegram:", error);
    return null;
  }
}

// Son güncelleme zamanlarını takip et (gereksiz API çağrılarını önlemek için)
const channelLastRefresh = new Map<string, number>();
const REFRESH_INTERVAL = 1 * 60 * 1000; // 1 dakika (daha sık güncelleme)

/**
 * Tek bir kanalın bilgilerini güncelle (arka planda)
 * @param channelId - Kanal ID'si
 * @param forceRefresh - true ise cache'i atla ve mutlaka güncelle
 */
export async function refreshChannelInfo(channelId: bigint, forceRefresh = false): Promise<void> {
  if (!BOT_TOKEN) {
    console.log("BOT_TOKEN ayarlanmamış, kanal güncellemesi atlanıyor");
    return;
  }

  const channelIdStr = channelId.toString();
  const lastRefresh = channelLastRefresh.get(channelIdStr) || 0;
  const now = Date.now();

  // forceRefresh değilse ve son 1 dakika içinde güncellendiyse atla
  if (!forceRefresh && now - lastRefresh < REFRESH_INTERVAL) {
    return;
  }

  channelLastRefresh.set(channelIdStr, now);

  try {
    const info = await fetchChannelInfoFromTelegram(channelIdStr);
    if (info) {
      await prisma.channel.update({
        where: { channelId },
        data: {
          channelName: info.title,
          channelUsername: info.username,
          channelPhoto: info.photoUrl,
          memberCount: info.memberCount,
          description: info.description,
          lastUpdated: new Date(),
        },
      });
    }
  } catch (error) {
    // Hata durumunda sessizce devam et
    console.error(`Error refreshing channel ${channelIdStr}:`, error);
  }
}

/**
 * Birden fazla kanalın bilgilerini arka planda güncelle
 * Issue #19: Site yüklendiğinde kanal bilgileri otomatik güncellenir
 * @param channelIds - Kanal ID'leri
 * @param forceRefresh - true ise cache'i atla ve mutlaka güncelle
 */
export async function refreshChannelsInBackground(
  channelIds: bigint[],
  forceRefresh = false
): Promise<void> {
  if (!BOT_TOKEN || channelIds.length === 0) {
    console.log("BOT_TOKEN yok veya kanal yok, güncelleme atlanıyor");
    return;
  }

  console.log(`${channelIds.length} kanal güncelleniyor (forceRefresh: ${forceRefresh})`);

  // Paralel olarak güncelle (max 5 eşzamanlı)
  const batchSize = 5;
  for (let i = 0; i < channelIds.length; i += batchSize) {
    const batch = channelIds.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map((channelId) => refreshChannelInfo(channelId, forceRefresh))
    );
  }
}

/**
 * Tüm kanalların bilgilerini güncelle
 * @param forceRefresh - true ise cache'i atla ve mutlaka güncelle
 */
export async function refreshAllChannels(forceRefresh = false): Promise<void> {
  if (!BOT_TOKEN) {
    console.log("BOT_TOKEN ayarlanmamış, tüm kanallar güncellemesi atlanıyor");
    return;
  }

  try {
    const channels = await prisma.channel.findMany({
      select: { channelId: true },
    });

    console.log(`Tüm kanallar güncelleniyor: ${channels.length} kanal`);
    await refreshChannelsInBackground(channels.map((c) => c.channelId), forceRefresh);
  } catch (error) {
    console.error("Error refreshing all channels:", error);
  }
}
