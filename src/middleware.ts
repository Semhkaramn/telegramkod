import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-key-change-in-production"
);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths
  const publicPaths = ["/login", "/api/auth/login"];
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // API routes that don't need auth check here (will check in route handlers)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Get session from cookie
  const token = request.cookies.get("session")?.value;

  if (!token) {
    // Not authenticated, redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const role = payload.role as string;
    const userId = payload.userId as number;

    // Admin routes - only superadmin
    if (pathname.startsWith("/admin")) {
      if (role !== "superadmin") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }

    // Dashboard routes - any authenticated user
    if (pathname.startsWith("/dashboard")) {
      // Kullanıcının ban ve aktiflik durumu API seviyesinde kontrol ediliyor
      // Middleware'de sadece token geçerliliği kontrol edilir
      // Eğer kullanıcı banlıysa, API çağrılarında 403 dönecek
    }

    // Root path - redirect based on role
    if (pathname === "/") {
      if (role === "superadmin") {
        return NextResponse.redirect(new URL("/admin", request.url));
      } else {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }

    return NextResponse.next();
  } catch (error) {
    // Invalid token, redirect to login
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("session");
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
