import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { invalidateCache } from "@/lib/cache";

// GET - Get admin links for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");

    // Superadmin can view any user's links
    // Impersonation durumunda taklit edilen kullanıcının linklerini göster
    let targetUserId = session.impersonatingUserId || session.userId;
    if (userId && session.role === "superadmin") {
      targetUserId = parseInt(userId);
    }

    const links = await prisma.adminLink.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      links.map((link) => ({
        id: link.id,
        channel_id: link.channelId.toString(),
        link_code: link.linkCode,
        link_url: link.linkUrl,
        created_at: link.createdAt,
      }))
    );
  } catch (error) {
    console.error("Error fetching admin links:", error);
    return NextResponse.json({ error: "Failed to fetch admin links" }, { status: 500 });
  }
}

// POST - Add admin link
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { channel_id, link_code, link_url, user_id } = body;

    if (!channel_id || !link_code || !link_url) {
      return NextResponse.json(
        { error: "channel_id, link_code, and link_url are required" },
        { status: 400 }
      );
    }

    // Superadmin can add links for any user
    // Impersonation durumunda taklit edilen kullanıcı için link ekle
    let targetUserId = session.impersonatingUserId || session.userId;
    if (user_id && session.role === "superadmin") {
      targetUserId = parseInt(user_id);
    }

    // Verify user has access to this channel
    const userChannel = await prisma.userChannel.findFirst({
      where: {
        userId: targetUserId,
        channelId: BigInt(channel_id),
      },
    });

    if (!userChannel && session.role !== "superadmin") {
      return NextResponse.json(
        { error: "Bu kanala erisim izniniz yok" },
        { status: 403 }
      );
    }

    const link = await prisma.adminLink.upsert({
      where: {
        userId_channelId_linkCode: {
          userId: targetUserId,
          channelId: BigInt(channel_id),
          linkCode: link_code,
        },
      },
      update: { linkUrl: link_url },
      create: {
        userId: targetUserId,
        channelId: BigInt(channel_id),
        linkCode: link_code,
        linkUrl: link_url,
      },
    });

    // Cache'i invalidate et - bot yeni linki görecek
    await invalidateCache();

    return NextResponse.json({
      id: link.id,
      channel_id: link.channelId.toString(),
      link_code: link.linkCode,
      link_url: link.linkUrl,
    });
  } catch (error) {
    console.error("Error adding admin link:", error);
    return NextResponse.json({ error: "Failed to add admin link" }, { status: 500 });
  }
}

// DELETE - Remove admin link
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Check if link belongs to user or user is superadmin
    const link = await prisma.adminLink.findUnique({
      where: { id: parseInt(id) },
    });

    if (!link) {
      return NextResponse.json({ error: "Link bulunamadi" }, { status: 404 });
    }

    // Impersonation durumunda taklit edilen kullanicinin ID'sini kullan
    const effectiveUserId = session.impersonatingUserId || session.userId;

    if (link.userId !== effectiveUserId && session.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.adminLink.delete({
      where: { id: parseInt(id) },
    });

    // Cache'i invalidate et
    await invalidateCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing admin link:", error);
    return NextResponse.json({ error: "Failed to remove admin link" }, { status: 500 });
  }
}
