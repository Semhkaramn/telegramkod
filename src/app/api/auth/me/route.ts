import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Oturum bulunamadı" },
        { status: 401 }
      );
    }

    // Kullanıcının güncel bilgilerini veritabanından al
    const targetUserId = session.impersonatingUserId || session.userId;

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        isBanned: true,
        bannedAt: true,
        bannedReason: true,
        botEnabled: true,
        createdAt: true,
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: "Kullanıcı bulunamadı" },
        { status: 404 }
      );
    }

    // Banlı kullanıcıyı bilgilendir
    if (user.isBanned && session.role !== "superadmin") {
      return NextResponse.json(
        {
          error: "Hesabınız askıya alınmış",
          bannedReason: user.bannedReason
        },
        { status: 403 }
      );
    }

    // Superadmin için impersonation bilgisi
    let realUser = null;
    if (session.impersonatingUserId && session.role === "superadmin") {
      const superadmin = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { id: true, username: true, role: true }
      });
      realUser = superadmin;
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        isBanned: user.isBanned,
        bannedReason: user.bannedReason,
        botEnabled: user.botEnabled,
        isImpersonating: !!session.impersonatingUserId && session.role === "superadmin",
        realUser,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}
