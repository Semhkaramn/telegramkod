import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { checkRateLimit, incrementRateLimit, resetRateLimit, getClientIP } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);

    // Rate limit kontrolü - sadece kontrol, sayaç artırmaz
    const rateLimitResult = checkRateLimit(clientIP);

    if (!rateLimitResult.success) {
      const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);
      return NextResponse.json(
        {
          error: `Cok fazla basarisiz deneme. ${Math.ceil(retryAfter / 60)} dakika sonra tekrar deneyin.`,
          retryAfter
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateLimitResult.resetTime.toString(),
          }
        }
      );
    }

    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Kullanici adi ve sifre gerekli" },
        { status: 400 }
      );
    }

    // Kullanıcıyı bul (case-insensitive)
    const user = await prisma.user.findFirst({
      where: {
        username: {
          equals: username,
          mode: 'insensitive'
        }
      },
    });

    if (!user) {
      // Başarısız login - sayacı artır
      incrementRateLimit(clientIP);
      return NextResponse.json(
        { error: "Kullanici adi veya sifre hatali" },
        { status: 401 }
      );
    }

    // Kullanıcı aktif mi kontrol et
    if (!user.isActive) {
      // Başarısız login - sayacı artır
      incrementRateLimit(clientIP);
      return NextResponse.json(
        { error: "Hesabiniz devre disi birakilmis. Yonetici ile iletisime gecin." },
        { status: 403 }
      );
    }

    // Kullanıcı banlı mı kontrol et
    if (user.isBanned) {
      // Başarısız login - sayacı artır
      incrementRateLimit(clientIP);
      const reason = user.bannedReason ? ` Sebep: ${user.bannedReason}` : "";
      return NextResponse.json(
        { error: `Hesabiniz askiya alinmis.${reason} Yonetici ile iletisime gecin.` },
        { status: 403 }
      );
    }

    // Şifre kontrolü
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      // Başarısız login - sayacı artır
      incrementRateLimit(clientIP);
      return NextResponse.json(
        { error: "Kullanici adi veya sifre hatali" },
        { status: 401 }
      );
    }

    // Session oluştur
    await createSession({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    // Başarılı login - rate limit sıfırla
    resetRateLimit(clientIP);

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
      { error: "Sunucu hatasi" },
      { status: 500 }
    );
  }
}
