import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { invalidateCache } from "@/lib/cache";

const BOT_TOKEN = process.env.BOT_TOKEN || "";

// Telegram'dan kanal bilgisi al
async function fetchChannelInfoFromTelegram(channelInput: string): Promise<{
  id: string;
  title: string;
  username: string | null;
  photoUrl: string | null;
  memberCount: number | null;
  description: string | null;
} | null> {
  if (!BOT_TOKEN) return null;

  try {
    // @ işaretini kaldır
    let chatId = channelInput.trim();
    if (chatId.startsWith("@")) {
      chatId = chatId.substring(1);
    }

    // Telegram Bot API ile kanal bilgisi al
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId.includes("-") ? chatId : `@${chatId}`
      }),
    });

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

// Tüm kanalları güncelle (arka planda)
async function refreshAllChannelsInBackground() {
  if (!BOT_TOKEN) return;

  try {
    const channels = await prisma.channel.findMany();

    for (const channel of channels) {
      try {
        const info = await fetchChannelInfoFromTelegram(channel.channelId.toString());
        if (info) {
          await prisma.channel.update({
            where: { channelId: channel.channelId },
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
      } catch (e) {
        // Tek kanal hatası diğerlerini etkilemesin
        console.error(`Error updating channel ${channel.channelId}:`, e);
      }
    }
  } catch (error) {
    console.error("Error refreshing channels:", error);
  }
}

// GET - Tüm kanalları getir
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "true";

    // Refresh parametresi varsa arka planda güncelle
    if (refresh) {
      // Arka planda çalıştır, response'u bekletme
      refreshAllChannelsInBackground();
    }

    const channels = await prisma.channel.findMany({
      include: {
        userChannels: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
        },
        stats: {
          orderBy: { statDate: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // İstatistikleri hesapla
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    monthAgo.setHours(0, 0, 0, 0);

    const result = channels.map((channel) => {
      let daily = 0;
      let weekly = 0;
      let monthly = 0;
      let total = 0;

      channel.stats.forEach((stat) => {
        total += stat.dailyCount;
        if (stat.statDate >= today) daily += stat.dailyCount;
        if (stat.statDate >= weekAgo) weekly += stat.dailyCount;
        if (stat.statDate >= monthAgo) monthly += stat.dailyCount;
      });

      return {
        channel_id: channel.channelId.toString(),
        channel_name: channel.channelName,
        channel_username: channel.channelUsername,
        channel_photo: channel.channelPhoto,
        member_count: channel.memberCount,
        description: channel.description,
        last_updated: channel.lastUpdated,
        created_at: channel.createdAt,
        paused: channel.userChannels.length > 0 && channel.userChannels.every((uc) => uc.paused),
        users: channel.userChannels.map((uc) => ({
          id: uc.user.id,
          username: uc.user.username,
          displayName: uc.user.displayName,
          paused: uc.paused,
        })),
        stats: { daily, weekly, monthly, total },
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching channels:", error);
    return NextResponse.json({ error: "Failed to fetch channels" }, { status: 500 });
  }
}

// POST - Yeni kanal ekle (otomatik bilgi al)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    let { channel_id, channel_name } = body;

    if (!channel_id) {
      return NextResponse.json({ error: "channel_id gerekli" }, { status: 400 });
    }

    // Telegram'dan kanal bilgisi al
    const telegramInfo = await fetchChannelInfoFromTelegram(channel_id);

    let finalChannelId: bigint;
    let finalChannelName = channel_name;
    let channelUsername: string | null = null;
    let channelPhoto: string | null = null;
    let memberCount: number | null = null;
    let description: string | null = null;

    if (telegramInfo) {
      // Telegram'dan bilgi alındı - ID'yi kullan
      finalChannelId = BigInt(telegramInfo.id);
      finalChannelName = telegramInfo.title;
      channelUsername = telegramInfo.username;
      channelPhoto = telegramInfo.photoUrl;
      memberCount = telegramInfo.memberCount;
      description = telegramInfo.description;
    } else {
      // Telegram'dan bilgi alınamadı - manuel girilen değeri kullan
      // Eğer @ ile başlıyorsa hata ver (sayısal ID gerekli)
      const cleanInput = channel_id.toString().trim();
      if (cleanInput.startsWith("@") || !/^-?\d+$/.test(cleanInput)) {
        return NextResponse.json(
          { error: "Kanal bulunamadı. Bot'un kanala admin olarak eklendiğinden emin olun veya sayısal ID girin." },
          { status: 400 }
        );
      }
      finalChannelId = BigInt(cleanInput);
    }

    // Kanal zaten var mı kontrol et
    const existingChannel = await prisma.channel.findUnique({
      where: { channelId: finalChannelId },
    });

    if (existingChannel) {
      // Güncelle
      await prisma.channel.update({
        where: { channelId: finalChannelId },
        data: {
          channelName: finalChannelName || existingChannel.channelName,
          channelUsername: channelUsername || existingChannel.channelUsername,
          channelPhoto: channelPhoto || existingChannel.channelPhoto,
          memberCount: memberCount || existingChannel.memberCount,
          description: description || existingChannel.description,
          lastUpdated: new Date(),
        },
      });
    } else {
      // Yeni oluştur
      await prisma.channel.create({
        data: {
          channelId: finalChannelId,
          channelName: finalChannelName,
          channelUsername,
          channelPhoto,
          memberCount,
          description,
          lastUpdated: new Date(),
        },
      });
    }

    // Cache'i invalidate et - bot yeni kanalı görecek
    await invalidateCache();

    return NextResponse.json({
      success: true,
      channel_id: finalChannelId.toString(),
      channel_name: finalChannelName,
      channel_photo: channelPhoto,
    });
  } catch (error) {
    console.error("Error adding channel:", error);
    return NextResponse.json({ error: "Kanal eklenirken hata oluştu" }, { status: 500 });
  }
}

// DELETE - Kanal sil
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channel_id");

    if (!channelId) {
      return NextResponse.json({ error: "channel_id gerekli" }, { status: 400 });
    }

    // Issue #10 fix: BigInt parse hatası yakalama
    let parsedChannelId: bigint;
    try {
      parsedChannelId = BigInt(channelId);
    } catch {
      return NextResponse.json({ error: "Geçersiz kanal ID formatı" }, { status: 400 });
    }

    await prisma.channel.delete({
      where: { channelId: parsedChannelId },
    });

    // Cache'i invalidate et
    await invalidateCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing channel:", error);
    return NextResponse.json({ error: "Kanal silinirken hata oluştu" }, { status: 500 });
  }
}

// PATCH - Kanal durumunu güncelle
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { channel_id, paused } = body;

    if (!channel_id || paused === undefined) {
      return NextResponse.json({ error: "channel_id ve paused gerekli" }, { status: 400 });
    }

    // Issue #10 fix: BigInt parse hatası yakalama
    let parsedChannelId: bigint;
    try {
      parsedChannelId = BigInt(channel_id);
    } catch {
      return NextResponse.json({ error: "Geçersiz kanal ID formatı" }, { status: 400 });
    }

    // Tüm kullanıcılar için pause durumunu güncelle
    await prisma.userChannel.updateMany({
      where: { channelId: parsedChannelId },
      data: { paused: Boolean(paused) },
    });

    // Cache'i invalidate et - pause durumu değişti
    await invalidateCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating channel:", error);
    return NextResponse.json({ error: "Kanal güncellenirken hata oluştu" }, { status: 500 });
  }
}

// PUT - Tek bir kanalı güncelle (Telegram'dan bilgi al)
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { channel_id } = body;

    if (!channel_id) {
      return NextResponse.json({ error: "channel_id gerekli" }, { status: 400 });
    }

    const info = await fetchChannelInfoFromTelegram(channel_id);

    if (!info) {
      return NextResponse.json(
        { error: "Kanal bilgisi alınamadı. Bot'un kanala erişimi olduğundan emin olun." },
        { status: 400 }
      );
    }

    // Issue #10 fix: BigInt parse hatası yakalama
    let parsedChannelId: bigint;
    try {
      parsedChannelId = BigInt(channel_id);
    } catch {
      return NextResponse.json({ error: "Geçersiz kanal ID formatı" }, { status: 400 });
    }

    await prisma.channel.update({
      where: { channelId: parsedChannelId },
      data: {
        channelName: info.title,
        channelUsername: info.username,
        channelPhoto: info.photoUrl,
        memberCount: info.memberCount,
        description: info.description,
        lastUpdated: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      channel: info,
    });
  } catch (error) {
    console.error("Error updating channel:", error);
    return NextResponse.json({ error: "Kanal güncellenirken hata oluştu" }, { status: 500 });
  }
}
