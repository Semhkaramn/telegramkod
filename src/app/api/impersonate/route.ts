import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, setImpersonation, clearImpersonation } from "@/lib/auth";

// POST - Kullanıcı olarak giriş yap (impersonate)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 403 });
    }

    const body = await request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      return NextResponse.json(
        { error: "targetUserId gerekli" },
        { status: 400 }
      );
    }

    // Hedef kullanıcıyı kontrol et
    const targetUser = await prisma.user.findUnique({
      where: { id: parseInt(targetUserId) },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "Kullanici bulunamadi" },
        { status: 404 }
      );
    }

    // Impersonation başlat ve sonucu kontrol et
    const result = await setImpersonation(parseInt(targetUserId));

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Impersonation basarilamadi" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Simdi ${targetUser.displayName || targetUser.username} olarak goruntuleniyor`,
      user: {
        id: targetUser.id,
        username: targetUser.username,
        displayName: targetUser.displayName,
      },
    });
  } catch (error) {
    console.error("Error starting impersonation:", error);
    return NextResponse.json(
      { error: "Impersonation baslatilamadi" },
      { status: 500 }
    );
  }
}

// DELETE - Impersonation'ı sonlandır
export async function DELETE() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 401 });
    }

    await clearImpersonation();

    return NextResponse.json({
      success: true,
      message: "Kendi panelinize geri donuldu",
    });
  } catch (error) {
    console.error("Error clearing impersonation:", error);
    return NextResponse.json(
      { error: "Impersonation sonlandirilamadi" },
      { status: 500 }
    );
  }
}
