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
      paused: true,
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

// ============ USER/ADMIN FUNCTIONS ============

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

export async function assignUserToChannel(
  userId: number,
  channelId: number,
  paused: boolean = true
) {
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
      paused,
    },
  });
}

export async function addAdmin(
  channelId: number,
  adminId: number,
  _adminUsername?: string | null,
  _adminType?: string
) {
  return assignUserToChannel(adminId, channelId, true);
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
