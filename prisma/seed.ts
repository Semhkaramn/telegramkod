import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Süper admin hesabı oluştur
  const hashedPassword = await bcrypt.hash("admin123", 12);

  const superAdmin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: hashedPassword,
      displayName: "Super Admin",
      role: "superadmin",
      telegramId: BigInt(5725763398), // SUPER_ADMIN_ID from bot.py
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
  console.log("✅ Anahtar kelimeler eklendi");

  // Örnek yasak kelimeler
  const bannedWords = ["test", "deneme"];
  for (const word of bannedWords) {
    await prisma.bannedWord.upsert({
      where: { word },
      update: {},
      create: { word },
    });
  }
  console.log("✅ Yasak kelimeler eklendi");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
