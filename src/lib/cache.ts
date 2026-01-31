import { prisma } from "./db";

/**
 * Cache version'ı artır - Bot bu değişikliği algılayıp cache'i yeniler
 * Website'de keywords, banned words, channels, users değiştiğinde çağrılmalı
 */
export async function invalidateCache(): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO cache_version (id, version, updated_at)
      VALUES (1, 1, NOW())
      ON CONFLICT (id)
      DO UPDATE SET version = cache_version.version + 1, updated_at = NOW()
    `;
  } catch (error) {
    console.error("Cache invalidation hatası:", error);
    // Hata olsa bile devam et, kritik değil
  }
}
