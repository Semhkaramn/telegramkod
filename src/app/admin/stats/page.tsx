"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Radio,
  Send,
  Headphones,
  Tag,
  Ban,
  Activity,
  TrendingUp,
  Calendar,
  BarChart3,
  Zap,
} from "lucide-react";

interface Stats {
  users: {
    total: number;
    active: number;
    banned: number;
    inactive: number;
    botEnabled: number;
    superadmins: number;
  };
  channels: {
    total: number;
    active: number;
    paused: number;
    joined: number;
  };
  codes: {
    daily: number;
    weekly: number;
    monthly: number;
    allTime: number;
  };
  listeningChannels: number;
  keywords: number;
  bannedWords: number;
  botStatus: {
    isRunning: boolean;
    lastPing: string | null;
    lastError: string | null;
    startedAt: string | null;
  } | null;
  dailyDistribution: { date: string; count: number }[];
  channelPerformance: { channelId: string; channelName: string; totalCodes: number }[];
}

export default function AdminStatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/admin/stats");
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "short",
    });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("tr-TR");
  };

  const getTimeSince = (dateString: string | null) => {
    if (!dateString) return "-";
    const diff = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Az once";
    if (minutes < 60) return `${minutes} dakika once`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} saat once`;
    const days = Math.floor(hours / 24);
    return `${days} gun once`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 bg-slate-800" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 bg-slate-800" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 bg-slate-800" />
          <Skeleton className="h-64 bg-slate-800" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-slate-400">
        Istatistikler yuklenemedi
      </div>
    );
  }

  const maxDaily = Math.max(...stats.dailyDistribution.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Detayli Istatistikler</h1>
        <p className="text-slate-400">Sistem genelinde tum veriler</p>
      </div>

      {/* Bot Durumu */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Activity className="h-5 w-5" />
            Bot Durumu
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50">
              <div
                className={`w-3 h-3 rounded-full ${
                  stats.botStatus?.isRunning ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                }`}
              />
              <div>
                <p className="text-sm text-slate-400">Durum</p>
                <p className={`font-medium ${stats.botStatus?.isRunning ? "text-emerald-400" : "text-red-400"}`}>
                  {stats.botStatus?.isRunning ? "Calisiyor" : "Durduruldu"}
                </p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50">
              <p className="text-sm text-slate-400">Son Ping</p>
              <p className="font-medium text-slate-200">
                {getTimeSince(stats.botStatus?.lastPing || null)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50">
              <p className="text-sm text-slate-400">Baslangic</p>
              <p className="font-medium text-slate-200 text-sm">
                {formatDateTime(stats.botStatus?.startedAt || null)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50">
              <p className="text-sm text-slate-400">Son Hata</p>
              <p className="font-medium text-slate-200 text-sm truncate" title={stats.botStatus?.lastError || "-"}>
                {stats.botStatus?.lastError || "-"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kod İstatistikleri */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-emerald-900/30 to-emerald-800/20 border-emerald-700/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-emerald-400 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Bugun
            </CardDescription>
            <CardTitle className="text-4xl text-white">{stats.codes.daily}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-emerald-400/70">kod gonderildi</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border-blue-700/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-blue-400 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Bu Hafta
            </CardDescription>
            <CardTitle className="text-4xl text-white">{stats.codes.weekly}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-400/70">kod gonderildi</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border-purple-700/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-purple-400 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Bu Ay
            </CardDescription>
            <CardTitle className="text-4xl text-white">{stats.codes.monthly}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-purple-400/70">kod gonderildi</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 border-amber-700/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-amber-400 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Toplam
            </CardDescription>
            <CardTitle className="text-4xl text-white">{stats.codes.allTime}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-400/70">tum zamanlar</p>
          </CardContent>
        </Card>
      </div>

      {/* Günlük Grafik */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-slate-100">Son 30 Gun</CardTitle>
          <CardDescription className="text-slate-400">Gunluk kod dagilimi</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-end gap-1">
            {stats.dailyDistribution.map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-blue-500/80 rounded-t transition-all hover:bg-blue-400"
                  style={{
                    height: `${(day.count / maxDaily) * 100}%`,
                    minHeight: day.count > 0 ? "4px" : "0",
                  }}
                  title={`${formatDate(day.date)}: ${day.count} kod`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>{stats.dailyDistribution.length > 0 ? formatDate(stats.dailyDistribution[0].date) : ""}</span>
            <span>{stats.dailyDistribution.length > 0 ? formatDate(stats.dailyDistribution[stats.dailyDistribution.length - 1].date) : ""}</span>
          </div>
        </CardContent>
      </Card>

      {/* Kullanıcı ve Kanal Detayları */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Kullanıcı İstatistikleri */}
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Users className="h-5 w-5" />
              Kullanicilar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-3 rounded-lg bg-slate-800/50">
              <span className="text-slate-400">Toplam</span>
              <Badge variant="secondary" className="bg-slate-700">{stats.users.total}</Badge>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-slate-800/50">
              <span className="text-slate-400">Aktif</span>
              <Badge className="bg-emerald-600">{stats.users.active}</Badge>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-slate-800/50">
              <span className="text-slate-400">Bot Acik</span>
              <Badge className="bg-blue-600">{stats.users.botEnabled}</Badge>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-slate-800/50">
              <span className="text-slate-400">Banli</span>
              <Badge variant="destructive">{stats.users.banned}</Badge>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-slate-800/50">
              <span className="text-slate-400">Super Admin</span>
              <Badge className="bg-amber-600">{stats.users.superadmins}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Kanal İstatistikleri */}
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Radio className="h-5 w-5" />
              Kanallar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-3 rounded-lg bg-slate-800/50">
              <span className="text-slate-400">Toplam Kanal</span>
              <Badge variant="secondary" className="bg-slate-700">{stats.channels.total}</Badge>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-slate-800/50">
              <span className="text-slate-400">Aktif Atama</span>
              <Badge className="bg-emerald-600">{stats.channels.active}</Badge>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-slate-800/50">
              <span className="text-slate-400">Durdurulmus</span>
              <Badge className="bg-amber-600">{stats.channels.paused}</Badge>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-slate-800/50">
              <span className="text-slate-400">Dinleme Kanali</span>
              <Badge className="bg-blue-600">{stats.listeningChannels}</Badge>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-slate-800/50">
              <span className="text-slate-400">Anahtar Kelime</span>
              <Badge variant="secondary" className="bg-slate-700">{stats.keywords}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* En Aktif Kanallar */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Send className="h-5 w-5" />
            En Aktif Kanallar (Son 30 Gun)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.channelPerformance.length === 0 ? (
            <p className="text-slate-400 text-center py-4">Henuz veri yok</p>
          ) : (
            <div className="space-y-3">
              {stats.channelPerformance.map((channel, i) => {
                const maxCodes = stats.channelPerformance[0]?.totalCodes || 1;
                const percentage = (channel.totalCodes / maxCodes) * 100;
                return (
                  <div key={channel.channelId} className="relative">
                    <div
                      className="absolute inset-0 bg-blue-500/20 rounded-lg"
                      style={{ width: `${percentage}%` }}
                    />
                    <div className="relative flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 w-6">#{i + 1}</span>
                        <span className="text-slate-200">{channel.channelName}</span>
                      </div>
                      <Badge className="bg-blue-600">{channel.totalCodes} kod</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
