"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Calendar,
  TrendingUp,
  Radio,
  ArrowUp,
  ArrowDown,
  Minus,
  Hash,
} from "lucide-react";

interface ChannelStats {
  id: number;
  channelId: string;
  statDate: string;
  dailyCount: number;
}

interface Channel {
  channelId: string;
  channelName: string | null;
  channelPhoto: string | null;
  stats: ChannelStats[];
}

interface UserChannel {
  id: number;
  channelId: string;
  paused: boolean;
  channel: Channel;
}

type TimeRange = "today" | "week" | "month";

// Timezone-safe tarih karşılaştırma fonksiyonları (İstanbul)
const getIstanbulDate = (date: Date): string => {
  // İstanbul timezone'unda YYYY-MM-DD formatında tarih al
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
};

const getIstanbulToday = (): string => {
  return getIstanbulDate(new Date());
};

const getIstanbulDateMinusDays = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return getIstanbulDate(date);
};

const normalizeStatDate = (statDate: string): string => {
  // API'den gelen ISO tarihini YYYY-MM-DD formatına çevir
  // Örnek: "2024-01-15T00:00:00.000Z" -> "2024-01-15"
  return statDate.split("T")[0];
};

export default function StatsPage() {
  const [userChannels, setUserChannels] = useState<UserChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("week");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/user-channels");
      if (response.ok) {
        const data = await response.json();
        setUserChannels(data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDateRange = (range: TimeRange) => {
    const today = getIstanbulToday();

    switch (range) {
      case "today":
        return { startDate: today, label: "Bugun" };
      case "week":
        return { startDate: getIstanbulDateMinusDays(7), label: "Son 7 Gun" };
      case "month":
        return { startDate: getIstanbulDateMinusDays(30), label: "Son 30 Gun" };
    }
  };

  const calculateChannelStats = (channel: Channel, range: TimeRange) => {
    const { startDate } = getDateRange(range);
    const today = getIstanbulToday();

    let total = 0;

    channel.stats.forEach((stat) => {
      const statDate = normalizeStatDate(stat.statDate);
      if (statDate >= startDate && statDate <= today) {
        total += stat.dailyCount;
      }
    });

    // Önceki dönemle karşılaştırma (trend hesaplama)
    const periodLength = range === "today" ? 1 : range === "week" ? 7 : 30;
    const previousStartDate = getIstanbulDateMinusDays(periodLength * 2);
    const previousEndDate = getIstanbulDateMinusDays(periodLength);

    let previousTotal = 0;
    channel.stats.forEach((stat) => {
      const statDate = normalizeStatDate(stat.statDate);
      if (statDate >= previousStartDate && statDate < previousEndDate) {
        previousTotal += stat.dailyCount;
      }
    });

    const trend =
      previousTotal === 0
        ? total > 0
          ? 100
          : 0
        : ((total - previousTotal) / previousTotal) * 100;

    return { total, trend };
  };

  const calculateTotalStats = () => {
    let todayTotal = 0;
    let weekTotal = 0;
    let monthTotal = 0;
    let allTimeTotal = 0;

    const today = getIstanbulToday();
    const weekAgo = getIstanbulDateMinusDays(7);
    const monthAgo = getIstanbulDateMinusDays(30);

    userChannels.forEach((uc) => {
      uc.channel.stats.forEach((stat) => {
        const statDate = normalizeStatDate(stat.statDate);
        allTimeTotal += stat.dailyCount;
        if (statDate === today) {
          todayTotal += stat.dailyCount;
        }
        if (statDate >= weekAgo && statDate <= today) {
          weekTotal += stat.dailyCount;
        }
        if (statDate >= monthAgo && statDate <= today) {
          monthTotal += stat.dailyCount;
        }
      });
    });

    return { todayTotal, weekTotal, monthTotal, allTimeTotal };
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 bg-zinc-800" />
          ))}
        </div>
        <Skeleton className="h-96 bg-zinc-800" />
      </div>
    );
  }

  const { todayTotal, weekTotal, monthTotal, allTimeTotal } = calculateTotalStats();
  const { label } = getDateRange(timeRange);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Istatistikler</h1>
        <p className="text-zinc-400">Kanallarinizin performansini takip edin</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Bugun
            </CardTitle>
            <Calendar className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{todayTotal}</div>
            <p className="text-xs text-zinc-500">kod gonderildi</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Bu Hafta
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{weekTotal}</div>
            <p className="text-xs text-zinc-500">kod gonderildi</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Bu Ay
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{monthTotal}</div>
            <p className="text-xs text-zinc-500">kod gonderildi</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Toplam
            </CardTitle>
            <Hash className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{allTimeTotal}</div>
            <p className="text-xs text-zinc-500">kod gonderildi</p>
          </CardContent>
        </Card>
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-2">
        {(["today", "week", "month"] as TimeRange[]).map((range) => (
          <Button
            key={range}
            variant={timeRange === range ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeRange(range)}
            className={
              timeRange === range
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }
          >
            {range === "today" && "Bugun"}
            {range === "week" && "Haftalik"}
            {range === "month" && "Aylik"}
          </Button>
        ))}
      </div>

      {/* Channel Stats */}
      {userChannels.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="py-12 text-center">
            <Radio className="mx-auto h-12 w-12 text-zinc-600" />
            <p className="mt-4 text-zinc-400">Henuz atanmis kanaliniz yok.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {userChannels.map((uc) => {
            const stats = calculateChannelStats(uc.channel, timeRange);

            return (
              <Card key={uc.id} className="border-zinc-800 bg-zinc-900">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-white">
                      <div
                        className={`h-3 w-3 rounded-full ${
                          uc.paused ? "bg-red-500" : "bg-emerald-500"
                        }`}
                      />
                      {uc.channel.channelName || `Kanal ${uc.channelId}`}
                    </CardTitle>
                    <Badge
                      variant={uc.paused ? "destructive" : "default"}
                      className={uc.paused ? "" : "bg-emerald-600"}
                    >
                      {uc.paused ? "Durduruldu" : "Aktif"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-3xl font-bold text-white">
                          {stats.total}
                        </p>
                        <p className="text-sm text-zinc-500">{label}</p>
                      </div>
                      <div
                        className={`flex items-center gap-1 rounded-full px-2 py-1 text-sm ${
                          stats.trend > 0
                            ? "bg-emerald-900/30 text-emerald-400"
                            : stats.trend < 0
                            ? "bg-red-900/30 text-red-400"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {stats.trend > 0 ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : stats.trend < 0 ? (
                          <ArrowDown className="h-3 w-3" />
                        ) : (
                          <Minus className="h-3 w-3" />
                        )}
                        {Math.abs(stats.trend).toFixed(0)}%
                      </div>
                    </div>


                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
