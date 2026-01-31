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
} from "lucide-react";

interface ChannelStats {
  id: number;
  channelId: string;
  statDate: string;
  dailyCount: number;
  codeList: string;
}

interface Channel {
  channelId: string;
  channelName: string | null;
  stats: ChannelStats[];
}

interface UserChannel {
  id: number;
  channelId: string;
  paused: boolean;
  channel: Channel;
}

type TimeRange = "today" | "week" | "month";

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (range) {
      case "today":
        return { start: today, label: "Bugun" };
      case "week":
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return { start: weekAgo, label: "Son 7 Gun" };
      case "month":
        const monthAgo = new Date(today);
        monthAgo.setDate(monthAgo.getDate() - 30);
        return { start: monthAgo, label: "Son 30 Gun" };
    }
  };

  const calculateChannelStats = (channel: Channel, range: TimeRange) => {
    const { start } = getDateRange(range);
    const today = new Date().toISOString().split("T")[0];

    let total = 0;
    let codes: string[] = [];

    channel.stats.forEach((stat) => {
      const statDate = new Date(stat.statDate);
      if (statDate >= start) {
        total += stat.dailyCount;
        if (stat.codeList) {
          codes.push(...stat.codeList.split(",").filter((c) => c.trim()));
        }
      }
    });

    // Calculate trend (compare with previous period)
    const previousStart = new Date(start);
    const periodLength = range === "today" ? 1 : range === "week" ? 7 : 30;
    previousStart.setDate(previousStart.getDate() - periodLength);

    let previousTotal = 0;
    channel.stats.forEach((stat) => {
      const statDate = new Date(stat.statDate);
      if (statDate >= previousStart && statDate < start) {
        previousTotal += stat.dailyCount;
      }
    });

    const trend =
      previousTotal === 0
        ? total > 0
          ? 100
          : 0
        : ((total - previousTotal) / previousTotal) * 100;

    return { total, codes: codes.slice(0, 10), trend };
  };

  const calculateTotalStats = () => {
    let todayTotal = 0;
    let weekTotal = 0;
    let monthTotal = 0;

    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    userChannels.forEach((uc) => {
      uc.channel.stats.forEach((stat) => {
        const statDate = stat.statDate.split("T")[0];
        if (statDate === today) {
          todayTotal += stat.dailyCount;
        }
        if (statDate >= weekAgo) {
          weekTotal += stat.dailyCount;
        }
        if (statDate >= monthAgo) {
          monthTotal += stat.dailyCount;
        }
      });
    });

    return { todayTotal, weekTotal, monthTotal };
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 bg-zinc-800" />
          ))}
        </div>
        <Skeleton className="h-96 bg-zinc-800" />
      </div>
    );
  }

  const { todayTotal, weekTotal, monthTotal } = calculateTotalStats();
  const { label } = getDateRange(timeRange);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Istatistikler</h1>
        <p className="text-zinc-400">Kanallarinizin performansini takip edin</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
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

                    {stats.codes.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs text-zinc-500">
                          Son gonderilen kodlar:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {stats.codes.slice(0, 5).map((code, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="bg-zinc-800 text-xs text-zinc-400"
                            >
                              {code}
                            </Badge>
                          ))}
                          {stats.codes.length > 5 && (
                            <Badge
                              variant="secondary"
                              className="bg-zinc-800 text-xs text-zinc-500"
                            >
                              +{stats.codes.length - 5} daha
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
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
