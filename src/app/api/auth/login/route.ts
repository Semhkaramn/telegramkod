import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Kullanıcı adı ve şifre gerekli" },
        { status: 400 }
      );
    }

    // Kullanıcıyı bul
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Kullanıcı adı veya şifre hatalı" },
        { status: 401 }
      );
    }

    // Kullanıcı aktif mi kontrol et
    if (!user.isActive) {
      return NextResponse.json(
        { error: "Hesabınız devre dışı bırakılmış. Yönetici ile iletişime geçin." },
        { status: 403 }
      );
    }

    // Kullanıcı banlı mı kontrol et
    if (user.isBanned) {
      const reason = user.bannedReason ? ` Sebep: ${user.bannedReason}` : "";
      return NextResponse.json(
        { error: `Hesabınız askıya alınmış.${reason} Yönetici ile iletişime geçin.` },
        { status: 403 }
      );
    }

    // Şifre kontrolü
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: "Kullanıcı adı veya şifre hatalı" },
        { status: 401 }
      );
    }

    // Session oluştur
    await createSession({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}
