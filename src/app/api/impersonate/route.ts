import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, setImpersonation, clearImpersonation } from "@/lib/auth";

// POST - Kullanıcı olarak giriş yap (impersonate)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      return NextResponse.json(
        { error: "targetUserId is required" },
        { status: 400 }
      );
    }

    // Hedef kullanıcıyı kontrol et
    const targetUser = await prisma.user.findUnique({
      where: { id: parseInt(targetUserId) },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Impersonation başlat
    await setImpersonation(parseInt(targetUserId));

    return NextResponse.json({
      success: true,
      message: `Now viewing as ${targetUser.displayName || targetUser.username}`,
      user: {
        id: targetUser.id,
        username: targetUser.username,
        displayName: targetUser.displayName,
      },
    });
  } catch (error) {
    console.error("Error starting impersonation:", error);
    return NextResponse.json(
      { error: "Failed to start impersonation" },
      { status: 500 }
    );
  }
}

// DELETE - Impersonation'ı sonlandır
export async function DELETE() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await clearImpersonation();

    return NextResponse.json({
      success: true,
      message: "Returned to your own panel",
    });
  } catch (error) {
    console.error("Error clearing impersonation:", error);
    return NextResponse.json(
      { error: "Failed to clear impersonation" },
      { status: 500 }
    );
  }
}
