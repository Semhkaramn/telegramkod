import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";

// GET - Tüm kullanıcıları listele (superadmin only)
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        telegramId: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { channels: true, adminLinks: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // BigInt'leri string'e çevir
    const serializedUsers = users.map((user) => ({
      ...user,
      telegramId: user.telegramId?.toString() || null,
    }));

    return NextResponse.json(serializedUsers);
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST - Yeni kullanıcı oluştur (superadmin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const body = await request.json();
    const { username, password, displayName, telegramId, role } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Kullanıcı adı ve şifre gerekli" },
        { status: 400 }
      );
    }

    // Kullanıcı adı kontrolü
    const existing = await prisma.user.findUnique({
      where: { username },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Bu kullanıcı adı zaten kullanılıyor" },
        { status: 400 }
      );
    }

    // Şifreyi hash'le
    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        displayName: displayName || username,
        telegramId: telegramId ? BigInt(telegramId) : null,
        role: role || "user",
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        telegramId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ...user,
      telegramId: user.telegramId?.toString() || null,
    });
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
