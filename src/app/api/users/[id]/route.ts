import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import { invalidateCache } from "@/lib/cache";

// GET - Tek kullanıcı detayı
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { id } = await params;
    const userId = parseInt(id);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        isBanned: true,
        bannedAt: true,
        bannedReason: true,
        botEnabled: true,
        createdAt: true,
        updatedAt: true,
        channels: {
          include: {
            channel: true,
          },
        },
        adminLinks: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }

    return NextResponse.json({
      ...user,
      channels: user.channels.map((uc) => ({
        ...uc,
        channelId: uc.channelId.toString(),
        channel: {
          ...uc.channel,
          channelId: uc.channel.channelId.toString(),
        },
      })),
      adminLinks: user.adminLinks.map((link) => ({
        ...link,
        channelId: link.channelId.toString(),
      })),
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// PATCH - Kullanıcı güncelle
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { id } = await params;
    const userId = parseInt(id);
    const body = await request.json();
    const {
      username,
      password,
      displayName,
      role,
      isActive,
      isBanned,
      bannedReason,
      botEnabled
    } = body;

    // Güncelleme verisi hazırla
    const updateData: Record<string, unknown> = {};

    if (username !== undefined) updateData.username = username;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (botEnabled !== undefined) updateData.botEnabled = botEnabled;

    // Ban işlemi
    if (isBanned !== undefined) {
      updateData.isBanned = isBanned;
      if (isBanned) {
        updateData.bannedAt = new Date();
        updateData.bannedReason = bannedReason || null;
        // Banlanan kullanıcının bot'unu da kapat
        updateData.botEnabled = false;
      } else {
        updateData.bannedAt = null;
        updateData.bannedReason = null;
      }
    }

    if (password) {
      updateData.password = await hashPassword(password);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        isBanned: true,
        bannedAt: true,
        bannedReason: true,
        botEnabled: true,
        updatedAt: true,
      },
    });

    // Eğer kullanıcı banlandıysa veya devre dışı bırakıldıysa, tüm kanallarını durdur
    if (isBanned === true || isActive === false) {
      await prisma.userChannel.updateMany({
        where: { userId },
        data: { paused: true },
      });
    }

    // Cache'i invalidate et - kullanıcı durumu değişti (botEnabled, isBanned, isActive)
    // Bot aktif kanalları yenilemeli
    await invalidateCache();

    return NextResponse.json(user);
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// DELETE - Kullanıcı sil
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { id } = await params;
    const userId = parseInt(id);

    // Kendi kendini silemesin
    if (userId === session.userId) {
      return NextResponse.json(
        { error: "Kendi hesabınızı silemezsiniz" },
        { status: 400 }
      );
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    // Cache'i invalidate et - kullanıcı silindi, aktif kanallar değişebilir
    await invalidateCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
