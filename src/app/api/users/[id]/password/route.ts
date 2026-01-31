import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = parseInt(id);

    // Users can only change their own password, superadmin can change anyone's
    if (session.userId !== userId && session.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: "Sifre en az 6 karakter olmali" },
        { status: 400 }
      );
    }

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "Kullanici bulunamadi" }, { status: 404 });
    }

    // If not superadmin, verify current password
    if (session.role !== "superadmin") {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Mevcut sifre gerekli" },
          { status: 400 }
        );
      }

      const isValid = await verifyPassword(currentPassword, user.password);
      if (!isValid) {
        return NextResponse.json(
          { error: "Mevcut sifre yanlis" },
          { status: 400 }
        );
      }
    }

    // Hash and update password
    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error changing password:", error);
    return NextResponse.json(
      { error: "Sifre degistirilemedi" },
      { status: 500 }
    );
  }
}
