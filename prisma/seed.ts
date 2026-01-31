import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Çevre değişkenlerinden veya varsayılan değerler
  const adminUsername = process.env.SUPER_ADMIN_USERNAME || "Semhkaramn";
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || "Abuzittin74.";

  // Süper admin hesabı oluştur
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  const superAdmin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      password: hashedPassword,
      role: "superadmin",
    },
    create: {
      username: adminUsername,
      password: hashedPassword,
      displayName: "Super Admin",
      role: "superadmin",
    },
  });

  console.log("✅ Süper admin oluşturuldu:", superAdmin.username);

  // Örnek anahtar kelimeler
  const keywords = ["bonus", "freespin", "promosyon", "kod"];
  for (const keyword of keywords) {
    await prisma.keyword.upsert({
      where: { keyword },
      update: {},
      create: { keyword },
    });
  }
  console.log("✅ Anahtar kelimeler eklendi:", keywords.join(", "));

  // Örnek yasak kelimeler
  const bannedWords = ["test", "deneme"];
  for (const word of bannedWords) {
    await prisma.bannedWord.upsert({
      where: { word },
      update: {},
      create: { word },
    });
  }
  console.log("✅ Yasak kelimeler eklendi:", bannedWords.join(", "));

  console.log("\n📋 Kurulum tamamlandı!");
  console.log(`   Giriş: ${adminUsername}`);
  console.log(`   Şifre: ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed hatası:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
