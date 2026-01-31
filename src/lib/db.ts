import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;

// ============ CHANNEL FUNCTIONS ============

export async function getAllChannels() {
  const channels = await prisma.channel.findMany({
    include: {
      userChannels: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return channels.map((channel) => ({
    channel_id: channel.channelId.toString(),
    channel_name: channel.channelName,
    channel_username: channel.channelUsername,
    channel_photo: channel.channelPhoto,
    member_count: channel.memberCount,
    description: channel.description,
    last_updated: channel.lastUpdated,
    created_at: channel.createdAt,
    // Kanalın pause durumu: Tüm kullanıcılar durdurulmuşsa durdurulmuş sayılır
    // Eğer hiç kullanıcı atanmamışsa veya en az bir kullanıcı aktifse, kanal aktiftir
    paused: channel.userChannels.length > 0 && channel.userChannels.every((uc) => uc.paused),
    users: channel.userChannels.map((uc) => ({
      id: uc.user.id,
      username: uc.user.username,
      displayName: uc.user.displayName,
      paused: uc.paused,
    })),
  }));
}

export async function addChannel(
  channelId: number,
  channelName?: string,
  channelUsername?: string,
  channelPhoto?: string,
  memberCount?: number,
  description?: string
) {
  return prisma.channel.upsert({
    where: { channelId: BigInt(channelId) },
    update: {
      channelName,
      channelUsername,
      channelPhoto,
      memberCount,
      description,
      lastUpdated: new Date(),
    },
    create: {
      channelId: BigInt(channelId),
      channelName: channelName || null,
      channelUsername: channelUsername || null,
      channelPhoto: channelPhoto || null,
      memberCount: memberCount || null,
      description: description || null,
      lastUpdated: new Date(),
    },
  });
}

export async function removeChannel(channelId: number) {
  return prisma.channel.delete({
    where: { channelId: BigInt(channelId) },
  });
}

export async function setChannelPause(channelId: number, paused: boolean, userId?: number) {
  if (userId) {
    return prisma.userChannel.updateMany({
      where: {
        channelId: BigInt(channelId),
        userId,
      },
      data: { paused },
    });
  }
  return prisma.userChannel.updateMany({
    where: { channelId: BigInt(channelId) },
    data: { paused },
  });
}

export async function getChannelAdmins(channelId: string) {
  const userChannels = await prisma.userChannel.findMany({
    where: { channelId: BigInt(channelId) },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
  });

  return userChannels.map((uc) => ({
    id: uc.user.id,
    username: uc.user.username,
    displayName: uc.user.displayName,
    paused: uc.paused,
  }));
}

export async function assignChannelToUser(userId: number, channelId: number) {
  return prisma.userChannel.upsert({
    where: {
      userId_channelId: {
        userId,
        channelId: BigInt(channelId),
      },
    },
    update: {},
    create: {
      userId,
      channelId: BigInt(channelId),
      paused: true,  // Varsayılan KAPALI - kod gönderilen kanallar kapalı eklenecek
    },
  });
}

export async function removeChannelFromUser(userId: number, channelId: number) {
  return prisma.userChannel.delete({
    where: {
      userId_channelId: {
        userId,
        channelId: BigInt(channelId),
      },
    },
  });
}

// ============ STATS FUNCTIONS ============

export async function getDailyStats(channelId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stats = await prisma.channelStats.findFirst({
    where: {
      channelId: BigInt(channelId),
      statDate: today,
    },
  });

  return {
    daily_count: stats?.dailyCount || 0,
  };
}

export async function getWeeklyStats(channelId: string) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);

  const stats = await prisma.channelStats.findMany({
    where: {
      channelId: BigInt(channelId),
      statDate: { gte: weekAgo },
    },
  });

  return stats.reduce((sum, s) => sum + s.dailyCount, 0);
}

export async function getMonthlyStats(channelId: string) {
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  monthAgo.setHours(0, 0, 0, 0);

  const stats = await prisma.channelStats.findMany({
    where: {
      channelId: BigInt(channelId),
      statDate: { gte: monthAgo },
    },
  });

  return stats.reduce((sum, s) => sum + s.dailyCount, 0);
}

export async function getTotalStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  monthAgo.setHours(0, 0, 0, 0);

  const [dailyStats, weeklyStats, monthlyStats] = await Promise.all([
    prisma.channelStats.findMany({
      where: { statDate: today },
    }),
    prisma.channelStats.findMany({
      where: { statDate: { gte: weekAgo } },
    }),
    prisma.channelStats.findMany({
      where: { statDate: { gte: monthAgo } },
    }),
  ]);

  return {
    daily: dailyStats.reduce((sum, s) => sum + s.dailyCount, 0),
    weekly: weeklyStats.reduce((sum, s) => sum + s.dailyCount, 0),
    monthly: monthlyStats.reduce((sum, s) => sum + s.dailyCount, 0),
  };
}

// ============ LISTENING CHANNELS ============

export async function getAllListeningChannels() {
  const channels = await prisma.listeningChannel.findMany();
  return channels.map((c) => ({
    channel_id: c.channelId.toString(),
    channel_name: c.channelName,
  }));
}

// Alias for API compatibility
export const getListeningChannels = getAllListeningChannels;

export async function addListeningChannel(
  channelId: number,
  channelName?: string
) {
  return prisma.listeningChannel.upsert({
    where: { channelId: BigInt(channelId) },
    update: {
      channelName: channelName || null,
    },
    create: {
      channelId: BigInt(channelId),
      channelName: channelName || null,
    },
  });
}

export async function updateListeningChannel(
  channelId: number,
  data: {
    channelName?: string;
  }
) {
  return prisma.listeningChannel.update({
    where: { channelId: BigInt(channelId) },
    data,
  });
}

export async function removeListeningChannel(channelId: number) {
  return prisma.listeningChannel.delete({
    where: { channelId: BigInt(channelId) },
  });
}

// ============ KEYWORDS ============

export async function getAllKeywords() {
  return prisma.keyword.findMany({
    orderBy: { id: "asc" },
  });
}

export async function addKeyword(keyword: string) {
  return prisma.keyword.upsert({
    where: { keyword },
    update: {},
    create: { keyword },
  });
}

export async function removeKeyword(id: number) {
  return prisma.keyword.delete({
    where: { id },
  });
}

// ============ BANNED WORDS ============

export async function getAllBannedWords() {
  return prisma.bannedWord.findMany({
    orderBy: { id: "asc" },
  });
}

export async function addBannedWord(word: string) {
  return prisma.bannedWord.upsert({
    where: { word },
    update: {},
    create: { word },
  });
}

export async function removeBannedWord(id: number) {
  return prisma.bannedWord.delete({
    where: { id },
  });
}

// ============ ADMIN LINKS ============

export async function getAdminLinks(userId: number) {
  const links = await prisma.adminLink.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return links.map((link) => ({
    id: link.id,
    channel_id: link.channelId.toString(),
    link_code: link.linkCode,
    link_url: link.linkUrl,
    created_at: link.createdAt,
  }));
}

export async function addAdminLink(
  userId: number,
  channelId: number,
  linkCode: string,
  linkUrl: string
) {
  return prisma.adminLink.upsert({
    where: {
      userId_channelId_linkCode: {
        userId,
        channelId: BigInt(channelId),
        linkCode,
      },
    },
    update: { linkUrl },
    create: {
      userId,
      channelId: BigInt(channelId),
      linkCode,
      linkUrl,
    },
  });
}

export async function removeAdminLink(id: number) {
  return prisma.adminLink.delete({
    where: { id },
  });
}

// ============ ADMIN FUNCTIONS ============

export async function getAllAdmins() {
  const admins = await prisma.user.findMany({
    where: { role: "superadmin" },
    select: {
      id: true,
      username: true,
      displayName: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return admins.map((admin) => ({
    admin_id: admin.id,
    admin_username: admin.username,
    display_name: admin.displayName,
    created_at: admin.createdAt,
  }));
}

export async function addAdmin(
  channelId: number,
  adminId: number,
  adminUsername: string | null,
  adminType: string = "ana"
) {
  // Bu fonksiyon aslında kullanıcıya kanal atama işlemi yapıyor
  // Mevcut sistemde UserChannel tablosu kullanılıyor
  return prisma.userChannel.upsert({
    where: {
      userId_channelId: {
        userId: adminId,
        channelId: BigInt(channelId),
      },
    },
    update: {},
    create: {
      userId: adminId,
      channelId: BigInt(channelId),
      paused: true,
    },
  });
}

export async function removeAdmin(channelId: number, adminId: number) {
  return prisma.userChannel.delete({
    where: {
      userId_channelId: {
        userId: adminId,
        channelId: BigInt(channelId),
      },
    },
  });
}
