import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

// Issue #13 fix: Fallback secret kaldırıldı - production'da JWT_SECRET zorunlu
const jwtSecretValue = process.env.JWT_SECRET;
if (!jwtSecretValue) {
  console.error("❌ KRİTİK HATA: JWT_SECRET environment variable tanımlanmamış!");
  // Development'ta uyarı ver ama çalışmaya devam et
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production environment");
  }
}
const JWT_SECRET = new TextEncoder().encode(
  jwtSecretValue || "dev-only-fallback-DO-NOT-USE-IN-PRODUCTION"
);

export interface SessionPayload {
  userId: number;
  username: string;
  role: string;
  impersonatingUserId?: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export async function createSession(payload: SessionPayload): Promise<string> {
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  return token;
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      createdAt: true,
    },
  });

  return user;
}

export async function setImpersonation(targetUserId: number): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    return { success: false, error: "Yetkisiz erişim" };
  }

  // Issue #9 fix: Hedef kullanıcının var olduğunu kontrol et
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, isActive: true, isBanned: true },
  });

  if (!targetUser) {
    return { success: false, error: "Hedef kullanıcı bulunamadı" };
  }

  if (!targetUser.isActive) {
    return { success: false, error: "Hedef kullanıcı aktif değil" };
  }

  if (targetUser.isBanned) {
    return { success: false, error: "Hedef kullanıcı yasaklı" };
  }

  await createSession({
    ...session,
    impersonatingUserId: targetUserId,
  });

  return { success: true };
}

export async function clearImpersonation(): Promise<void> {
  const session = await getSession();
  if (!session) return;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { impersonatingUserId: _removed, ...rest } = session;
  await createSession(rest);
}

export async function getEffectiveUser() {
  const session = await getSession();
  if (!session) return null;

  // If superadmin is impersonating another user
  if (session.impersonatingUserId && session.role === "superadmin") {
    const targetUser = await prisma.user.findUnique({
      where: { id: session.impersonatingUserId },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        createdAt: true,
      },
    });

    if (targetUser) {
      return {
        ...targetUser,
        isImpersonating: true,
        realUser: {
          id: session.userId,
          username: session.username,
          role: session.role,
        },
      };
    }
  }

  const user = await getCurrentUser();
  return user ? { ...user, isImpersonating: false } : null;
}
