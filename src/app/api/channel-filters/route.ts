import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { invalidateCache } from "@/lib/cache";

// GET - Kanal filtrelerini getir
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");

    // Kullanıcının bu kanala erişimi var mı kontrol et
    let targetUserId = session.impersonatingUserId || session.userId;

    let whereClause: { channelId?: bigint } = {};

    if (channelId) {
      // Kullanıcının bu kanala erişimi var mı?
      if (session.role !== "superadmin") {
        const hasAccess = await prisma.userChannel.findFirst({
          where: {
            userId: targetUserId,
            channelId: BigInt(channelId),
          },
        });
        if (!hasAccess) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
      whereClause.channelId = BigInt(channelId);
    } else {
      // Kullanıcının erişebildiği tüm kanalların filtrelerini getir
      const userChannels = await prisma.userChannel.findMany({
        where: { userId: targetUserId },
        select: { channelId: true },
      });
      const channelIds = userChannels.map((uc) => uc.channelId);

      if (channelIds.length === 0) {
        return NextResponse.json([]);
      }

      const filters = await prisma.channelFilter.findMany({
        where: { channelId: { in: channelIds } },
        orderBy: { createdAt: "desc" },
      });

      const serialized = filters.map((f) => ({
        id: f.id,
        channelId: f.channelId.toString(),
        keyword: f.keyword,
        createdAt: f.createdAt.toISOString(),
      }));

      return NextResponse.json(serialized);
    }

    const filters = await prisma.channelFilter.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    const serialized = filters.map((f) => ({
      id: f.id,
      channelId: f.channelId.toString(),
      keyword: f.keyword,
      createdAt: f.createdAt.toISOString(),
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error("Error fetching channel filters:", error);
    return NextResponse.json(
      { error: "Failed to fetch channel filters" },
      { status: 500 }
    );
  }
}

// POST - Yeni filtre ekle
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { channelId, keyword } = body;

    if (!channelId || !keyword) {
      return NextResponse.json(
        { error: "channelId and keyword are required" },
        { status: 400 }
      );
    }

    // Kullanıcının bu kanala erişimi var mı?
    let targetUserId = session.impersonatingUserId || session.userId;

    if (session.role !== "superadmin") {
      const hasAccess = await prisma.userChannel.findFirst({
        where: {
          userId: targetUserId,
          channelId: BigInt(channelId),
        },
      });
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Filtre ekle
    const filter = await prisma.channelFilter.upsert({
      where: {
        channelId_keyword: {
          channelId: BigInt(channelId),
          keyword: keyword.toLowerCase().trim(),
        },
      },
      update: {},
      create: {
        channelId: BigInt(channelId),
        keyword: keyword.toLowerCase().trim(),
      },
    });

    // Cache'i invalidate et
    await invalidateCache();

    return NextResponse.json({
      id: filter.id,
      channelId: filter.channelId.toString(),
      keyword: filter.keyword,
      createdAt: filter.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Error adding channel filter:", error);
    return NextResponse.json(
      { error: "Failed to add channel filter" },
      { status: 500 }
    );
  }
}

// DELETE - Filtre sil
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    // Filtreyi bul
    const filter = await prisma.channelFilter.findUnique({
      where: { id: parseInt(id) },
    });

    if (!filter) {
      return NextResponse.json({ error: "Filter not found" }, { status: 404 });
    }

    // Kullanıcının bu kanala erişimi var mı?
    let targetUserId = session.impersonatingUserId || session.userId;

    if (session.role !== "superadmin") {
      const hasAccess = await prisma.userChannel.findFirst({
        where: {
          userId: targetUserId,
          channelId: filter.channelId,
        },
      });
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    await prisma.channelFilter.delete({
      where: { id: parseInt(id) },
    });

    // Cache'i invalidate et
    await invalidateCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting channel filter:", error);
    return NextResponse.json(
      { error: "Failed to delete channel filter" },
      { status: 500 }
    );
  }
}

// PATCH - Filter mode güncelle (all veya filtered)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { channelId, filterMode } = body;

    if (!channelId || !filterMode) {
      return NextResponse.json(
        { error: "channelId and filterMode are required" },
        { status: 400 }
      );
    }

    if (!["all", "filtered"].includes(filterMode)) {
      return NextResponse.json(
        { error: "filterMode must be 'all' or 'filtered'" },
        { status: 400 }
      );
    }

    // Kullanıcının bu kanala erişimi var mı?
    let targetUserId = session.impersonatingUserId || session.userId;

    const userChannel = await prisma.userChannel.findFirst({
      where: {
        userId: session.role === "superadmin" ? undefined : targetUserId,
        channelId: BigInt(channelId),
      },
    });

    if (!userChannel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    if (session.role !== "superadmin" && userChannel.userId !== targetUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Filter mode güncelle
    await prisma.userChannel.update({
      where: { id: userChannel.id },
      data: { filterMode },
    });

    // Cache'i invalidate et
    await invalidateCache();

    return NextResponse.json({ success: true, filterMode });
  } catch (error) {
    console.error("Error updating filter mode:", error);
    return NextResponse.json(
      { error: "Failed to update filter mode" },
      { status: 500 }
    );
  }
}
