import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

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
    let targetUserId = session.userId;

    if (userId && session.role === "superadmin") {
      targetUserId = parseInt(userId);
    } else if (userId && session.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userChannels = await prisma.userChannel.findMany({
      where: { userId: targetUserId },
      include: {
        channel: {
          include: {
            stats: {
              orderBy: { statDate: "desc" },
              take: 30,
            },
          },
        },
      },
    });

    return NextResponse.json(userChannels);
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

    // Kullanıcı-kanal ilişkisi oluştur
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
        paused: false,
      },
    });

    return NextResponse.json(userChannel);
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
    let targetUserId = session.userId;

    if (userId && session.role === "superadmin") {
      targetUserId = parseInt(userId);
    } else if (userId && parseInt(userId) !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    return NextResponse.json(userChannel);
  } catch (error) {
    console.error("Error updating channel status:", error);
    return NextResponse.json(
      { error: "Failed to update channel status" },
      { status: 500 }
    );
  }
}
