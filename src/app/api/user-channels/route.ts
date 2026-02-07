import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { invalidateCache } from "@/lib/cache";
import { refreshChannelsInBackground } from "@/lib/telegram";

// Channel tipi - Prisma şemasına uygun
interface ChannelData {
  channelId: bigint;
  channelName: string | null;
  channelUsername: string | null;
  channelPhoto: string | null;
  memberCount: number | null;
  isJoined: boolean;
}

interface UserChannelWithChannel {
  id: number;
  userId: number;
  channelId: bigint;
  paused: boolean;
  channel: ChannelData;
}

// GET - Kullanıcının kanallarını getir
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    // Superadmin tüm kullanıcıların kanallarını görebilir
    // Normal kullanıcı sadece kendi kanallarını görebilir
    // Impersonation durumunda taklit edilen kullanıcının kanallarını göster
    let targetUserId = session.impersonatingUserId || session.userId;

    if (userId && session.role === "superadmin") {
      targetUserId = parseInt(userId);
    } else if (userId && session.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Kullanıcının ban durumunu kontrol et (superadmin hariç)
    if (session.role !== "superadmin") {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { isBanned: true, isActive: true }
      });

      if (currentUser?.isBanned) {
        return NextResponse.json({ error: "Hesabınız askıya alınmış" }, { status: 403 });
      }

      if (!currentUser?.isActive) {
        return NextResponse.json({ error: "Hesabınız devre dışı" }, { status: 403 });
      }
    }

    const userChannels = await prisma.userChannel.findMany({
      where: { userId: targetUserId },
      include: {
        channel: true,
      },
    }) as UserChannelWithChannel[];

    // BigInt'leri string'e dönüştür (JSON serileştirme için)
    const serializedChannels = userChannels.map((uc: UserChannelWithChannel & { filterMode?: string }) => ({
      id: uc.id,
      userId: uc.userId,
      channelId: uc.channelId.toString(),
      paused: uc.paused,
      filterMode: uc.filterMode || "all",
      channel: {
        channelId: uc.channel.channelId.toString(),
        channelName: uc.channel.channelName,
        channelUsername: uc.channel.channelUsername ?? null,
        channelPhoto: uc.channel.channelPhoto ?? null,
        memberCount: uc.channel.memberCount ?? null,
        isJoined: uc.channel.isJoined,
      },
    }));

    // Issue #19: Arka planda kanal bilgilerini güncelle (site her yüklendiğinde)
    // Bu işlem bloklama yapmaz, response hemen döner
    if (userChannels.length > 0) {
      const channelIds = userChannels.map((uc) => uc.channel.channelId);
      // Arka planda çalıştır - await yok, response'ı bekletmez
      refreshChannelsInBackground(channelIds).catch((err) => {
        console.error("Background channel refresh error:", err);
      });
    }

    return NextResponse.json(serializedChannels);
  } catch (error) {
    console.error("Error fetching user channels:", error);
    return NextResponse.json(
      { error: "Failed to fetch user channels" },
      { status: 500 }
    );
  }
}

// POST - Kullanıcıya kanal ata
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, channelId } = body;

    if (!userId || !channelId) {
      return NextResponse.json(
        { error: "userId and channelId are required" },
        { status: 400 }
      );
    }

    // Kanal mevcut mu kontrol et, yoksa oluştur
    const existingChannel = await prisma.channel.findUnique({
      where: { channelId: BigInt(channelId) },
    });

    if (!existingChannel) {
      await prisma.channel.create({
        data: {
          channelId: BigInt(channelId),
          channelName: `Channel ${channelId}`,
        },
      });
    }

    // Kullanıcı-kanal ilişkisi oluştur - varsayılan KAPALI
    const userChannel = await prisma.userChannel.upsert({
      where: {
        userId_channelId: {
          userId: parseInt(userId),
          channelId: BigInt(channelId),
        },
      },
      update: {},
      create: {
        userId: parseInt(userId),
        channelId: BigInt(channelId),
        paused: true,  // Kod gönderilen kanallar kapalı olarak eklenir
      },
    });

    // Cache'i invalidate et - bot yeni kanal atamasını görecek
    await invalidateCache();

    // BigInt'i string'e dönüştür
    return NextResponse.json({
      id: userChannel.id,
      userId: userChannel.userId,
      channelId: userChannel.channelId.toString(),
      paused: userChannel.paused,
    });
  } catch (error) {
    console.error("Error assigning channel:", error);
    return NextResponse.json(
      { error: "Failed to assign channel" },
      { status: 500 }
    );
  }
}

// DELETE - Kullanıcıdan kanal kaldır
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const channelId = searchParams.get("channelId");

    if (!userId || !channelId) {
      return NextResponse.json(
        { error: "userId and channelId are required" },
        { status: 400 }
      );
    }

    await prisma.userChannel.delete({
      where: {
        userId_channelId: {
          userId: parseInt(userId),
          channelId: BigInt(channelId),
        },
      },
    });

    // Cache'i invalidate et
    await invalidateCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing channel:", error);
    return NextResponse.json(
      { error: "Failed to remove channel" },
      { status: 500 }
    );
  }
}

// PATCH - Kanal durumunu güncelle (pause/resume)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { userId, channelId, paused } = body;

    // Superadmin herkesin kanalını güncelleyebilir
    // Normal kullanıcı sadece kendi kanalını güncelleyebilir
    // Impersonation durumunda taklit edilen kullanıcının kanalını güncelle
    let targetUserId = session.impersonatingUserId || session.userId;

    if (userId && session.role === "superadmin") {
      targetUserId = parseInt(userId);
    } else if (userId && parseInt(userId) !== targetUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Normal kullanıcılar için ban ve bot kontrolü
    if (session.role !== "superadmin") {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { isBanned: true, isActive: true, botEnabled: true }
      });

      // Banlı kullanıcı hiçbir işlem yapamaz
      if (currentUser?.isBanned) {
        return NextResponse.json(
          { error: "Hesabınız askıya alınmış. İşlem yapamazsınız." },
          { status: 403 }
        );
      }

      // Pasif kullanıcı işlem yapamaz
      if (!currentUser?.isActive) {
        return NextResponse.json(
          { error: "Hesabınız devre dışı. İşlem yapamazsınız." },
          { status: 403 }
        );
      }

      // Bot kapalıyken kanal AKTİFLEŞTİRİLEMEZ (sadece durdurulabilir)
      if (!currentUser?.botEnabled && paused === false) {
        return NextResponse.json(
          { error: "Bot yönetici tarafından durdurulmuş. Kanalları aktifleştiremezsiniz." },
          { status: 403 }
        );
      }
    }

    const userChannel = await prisma.userChannel.update({
      where: {
        userId_channelId: {
          userId: targetUserId,
          channelId: BigInt(channelId),
        },
      },
      data: { paused },
    });

    // Cache'i invalidate et - pause durumu değişti, bot aktif kanalları yenilemeli
    await invalidateCache();

    // BigInt'i string'e dönüştür
    return NextResponse.json({
      id: userChannel.id,
      userId: userChannel.userId,
      channelId: userChannel.channelId.toString(),
      paused: userChannel.paused,
    });
  } catch (error) {
    console.error("Error updating channel status:", error);
    return NextResponse.json(
      { error: "Failed to update channel status" },
      { status: 500 }
    );
  }
}
