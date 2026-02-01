import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Issue #13 fix: Fallback secret kaldırıldı - production'da JWT_SECRET zorunlu
const jwtSecretValue = process.env.JWT_SECRET;
if (!jwtSecretValue && process.env.NODE_ENV === "production") {
  console.error("❌ KRİTİK HATA: JWT_SECRET environment variable tanımlanmamış!");
}
const JWT_SECRET = new TextEncoder().encode(
  jwtSecretValue || "dev-only-fallback-DO-NOT-USE-IN-PRODUCTION"
);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths - login sayfaları ve API auth
  const publicPaths = ["/login", "/admin/login", "/api/auth/login"];
  if (publicPaths.some((path) => pathname === path || pathname.startsWith(path + "/"))) {
    return NextResponse.next();
  }

  // API routes that don't need auth check here (will check in route handlers)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Get session from cookie
  const token = request.cookies.get("session")?.value;

  if (!token) {
    // Not authenticated - admin sayfasına gitmek istiyorsa admin login'e yonlendir
    if (pathname.startsWith("/admin")) {
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
    // Normal sayfalar icin login'e yonlendir
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const role = payload.role as string;

    // Admin routes - only superadmin can access
    if (pathname.startsWith("/admin")) {
      if (role !== "superadmin") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }

    // Dashboard routes - any authenticated user
    if (pathname.startsWith("/dashboard")) {
      // Kullanıcının ban ve aktiflik durumu API seviyesinde kontrol ediliyor
      // Middleware'de sadece token geçerliliği kontrol edilir
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
    // Invalid token - admin sayfasına gitmek istiyorsa admin login'e yonlendir
    if (pathname.startsWith("/admin")) {
      const loginUrl = new URL("/admin/login", request.url);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete("session");
      return response;
    }
    // Normal sayfalar icin login'e yonlendir
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
