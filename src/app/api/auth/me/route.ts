import { NextResponse } from "next/server";
import { getEffectiveUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getEffectiveUser();

    if (!user) {
      return NextResponse.json(
        { error: "Oturum bulunamadı" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        telegramId: user.telegramId?.toString() || null,
        isImpersonating: user.isImpersonating || false,
        realUser: (user as any).realUser || null,
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
