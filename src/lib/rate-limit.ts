/**
 * Issue #12 fix: Basit in-memory rate limiter
 * Login endpoint'i için brute force koruması
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store - production'da Redis kullanılmalı
const rateLimitStore = new Map<string, RateLimitEntry>();

// Ayarlar
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 dakika
const MAX_REQUESTS = 5; // Dakikada maksimum 5 deneme
const BLOCK_DURATION = 15 * 60 * 1000; // 15 dakika blok

// Belirli aralıklarla eski kayıtları temizle
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000); // Her dakika temizle

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
  blocked?: boolean;
}

/**
 * IP bazlı rate limiting kontrolü - SADECE KONTROL, SAYAÇ ARTIRMAZ
 * @param identifier - Genellikle IP adresi veya user ID
 * @param maxRequests - Maksimum istek sayısı (varsayılan: 5)
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number = MAX_REQUESTS
): RateLimitResult {
  const now = Date.now();
  const key = `login:${identifier}`;

  const entry = rateLimitStore.get(key);

  // Kayıt yok veya süre dolmuş - izin ver
  if (!entry || entry.resetTime < now) {
    return {
      success: true,
      remaining: maxRequests,
      resetTime: now + RATE_LIMIT_WINDOW,
    };
  }

  // Limit aşıldı mı kontrol et
  if (entry.count >= maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetTime: entry.resetTime,
      blocked: true,
    };
  }

  return {
    success: true,
    remaining: maxRequests - entry.count,
    resetTime: entry.resetTime,
  };
}

/**
 * Başarısız login sonrası rate limit sayacını artır
 * SADECE BAŞARISIZ DENEMELER İÇİN ÇAĞRILMALI
 */
export function incrementRateLimit(
  identifier: string,
  maxRequests: number = MAX_REQUESTS,
  windowMs: number = RATE_LIMIT_WINDOW
): void {
  const now = Date.now();
  const key = `login:${identifier}`;

  let entry = rateLimitStore.get(key);

  // Yeni giriş veya süre dolmuş
  if (!entry || entry.resetTime < now) {
    entry = {
      count: 1,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(key, entry);
    return;
  }

  // Sayacı artır
  entry.count++;

  // Limit aşıldıysa blok süresini ekle
  if (entry.count >= maxRequests) {
    entry.resetTime = now + BLOCK_DURATION;
  }

  rateLimitStore.set(key, entry);
}

/**
 * Başarılı login sonrası rate limit sayacını sıfırla
 */
export function resetRateLimit(identifier: string): void {
  const key = `login:${identifier}`;
  rateLimitStore.delete(key);
}

/**
 * IP adresini request'ten al
 */
export function getClientIP(request: Request): string {
  // Cloudflare, Vercel, vb. proxy arkasındaysa
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  // Cloudflare
  const cfIP = request.headers.get("cf-connecting-ip");
  if (cfIP) return cfIP;

  // Diğer
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;

  return "unknown";
}
