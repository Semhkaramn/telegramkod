import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);

    // Paralel sorgular
    const [
      users,
      channels,
      userChannels,
      listeningChannels,
      keywords,
      bannedWords,
      botStatus,
      dailyStats,
      weeklyStats,
      monthlyStats,
      allTimeStats,
      last30DaysStats,
    ] = await Promise.all([
      // Kullanıcılar
      prisma.user.findMany({
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          isActive: true,
          isBanned: true,
          botEnabled: true,
          createdAt: true,
        },
      }),
      // Kanallar
      prisma.channel.findMany({
        select: {
          channelId: true,
          channelName: true,
          channelUsername: true,
          memberCount: true,
          isJoined: true,
          createdAt: true,
        },
      }),
      // Kullanıcı-Kanal ilişkileri
      prisma.userChannel.findMany({
        select: {
          userId: true,
          channelId: true,
          paused: true,
        },
      }),
      // Dinleme kanalları
      prisma.listeningChannel.count(),
      // Anahtar kelimeler
      prisma.keyword.count(),
      // Yasaklı kelimeler
      prisma.bannedWord.count(),
      // Bot durumu
      prisma.botStatus.findFirst({
        where: { id: 1 },
      }),
      // Günlük istatistikler
      prisma.channelStats.aggregate({
        where: { statDate: today },
        _sum: { dailyCount: true },
      }),
      // Haftalık istatistikler
      prisma.channelStats.aggregate({
        where: { statDate: { gte: weekAgo } },
        _sum: { dailyCount: true },
      }),
      // Aylık istatistikler
      prisma.channelStats.aggregate({
        where: { statDate: { gte: monthAgo } },
        _sum: { dailyCount: true },
      }),
      // Tüm zamanlar
      prisma.channelStats.aggregate({
        _sum: { dailyCount: true },
      }),
      // Son 30 günlük günlük dağılım
      prisma.channelStats.groupBy({
        by: ["statDate"],
        where: { statDate: { gte: monthAgo } },
        _sum: { dailyCount: true },
        orderBy: { statDate: "asc" },
      }),
    ]);

    // Kullanıcı istatistikleri
    const userStats = {
      total: users.length,
      active: users.filter((u) => u.isActive && !u.isBanned).length,
      banned: users.filter((u) => u.isBanned).length,
      inactive: users.filter((u) => !u.isActive).length,
      botEnabled: users.filter((u) => u.botEnabled).length,
      superadmins: users.filter((u) => u.role === "superadmin").length,
    };

    // Kanal istatistikleri
    const activeUserChannels = userChannels.filter((uc) => !uc.paused).length;
    const pausedUserChannels = userChannels.filter((uc) => uc.paused).length;

    const channelStats = {
      total: channels.length,
      active: activeUserChannels,
      paused: pausedUserChannels,
      joined: channels.filter((c) => c.isJoined).length,
    };

    // Kod istatistikleri
    const codeStats = {
      daily: dailyStats._sum.dailyCount || 0,
      weekly: weeklyStats._sum.dailyCount || 0,
      monthly: monthlyStats._sum.dailyCount || 0,
      allTime: allTimeStats._sum.dailyCount || 0,
    };

    // Günlük dağılım (grafik için)
    const dailyDistribution = last30DaysStats.map((s) => ({
      date: s.statDate.toISOString().split("T")[0],
      count: s._sum.dailyCount || 0,
    }));

    // Kanal bazlı istatistikler (en aktif 10 kanal)
    const channelPerformance = await prisma.channelStats.groupBy({
      by: ["channelId"],
      where: { statDate: { gte: monthAgo } },
      _sum: { dailyCount: true },
      orderBy: { _sum: { dailyCount: "desc" } },
      take: 10,
    });

    // Kanal isimlerini ekle
    const channelPerformanceWithNames = await Promise.all(
      channelPerformance.map(async (cp) => {
        const channel = channels.find(
          (c) => c.channelId.toString() === cp.channelId.toString()
        );
        return {
          channelId: cp.channelId.toString(),
          channelName: channel?.channelName || `Kanal ${cp.channelId}`,
          totalCodes: cp._sum.dailyCount || 0,
        };
      })
    );

    return NextResponse.json({
      users: userStats,
      channels: channelStats,
      codes: codeStats,
      listeningChannels,
      keywords,
      bannedWords,
      botStatus: botStatus
        ? {
            isRunning: botStatus.isRunning,
            lastPing: botStatus.lastPing?.toISOString(),
            lastError: botStatus.lastError,
            startedAt: botStatus.startedAt?.toISOString(),
          }
        : null,
      dailyDistribution,
      channelPerformance: channelPerformanceWithNames,
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
