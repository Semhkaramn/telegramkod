"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, BarChart3, Calendar, TrendingUp } from "lucide-react";

interface ChannelStats {
  id: number;
  channelId: string;
  statDate: string;
  dailyCount: number;
}

interface Channel {
  channelId: string;
  channelName: string | null;
  stats: ChannelStats[];
}

interface UserChannel {
  id: number;
  userId: number;
  channelId: string;
  paused: boolean;
  channel: Channel;
}

export default function DashboardPage() {
  const [userChannels, setUserChannels] = useState<UserChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserChannels();
  }, []);

  const fetchUserChannels = async () => {
    try {
      const response = await fetch("/api/user-channels");
      if (response.ok) {
        const data = await response.json();
        setUserChannels(data);
      }
    } catch (error) {
      console.error("Error fetching channels:", error);
    } finally {
      setLoading(false);
    }
  };

  // İstatistik hesaplamaları
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const calculateStats = () => {
    let todayTotal = 0;
    let weekTotal = 0;
    let monthTotal = 0;

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

  const { todayTotal, weekTotal, monthTotal } = calculateStats();
  const activeChannels = userChannels.filter((uc) => !uc.paused).length;
  const pausedChannels = userChannels.filter((uc) => uc.paused).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 bg-slate-800" />
          ))}
        </div>
        <Skeleton className="h-64 bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400">Hoş geldiniz! İşte genel bakış.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Toplam Kanal
            </CardTitle>
            <Radio className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{userChannels.length}</div>
            <p className="text-xs text-slate-500">
              {activeChannels} aktif, {pausedChannels} durdurulmuş
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Bugün Gönderilen
            </CardTitle>
            <Calendar className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{todayTotal}</div>
            <p className="text-xs text-slate-500">kod gönderildi</p>
          </CardContent>
        </Card>

        <Card className="border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Bu Hafta
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{weekTotal}</div>
            <p className="text-xs text-slate-500">kod gönderildi</p>
          </CardContent>
        </Card>

        <Card className="border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Bu Ay
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{monthTotal}</div>
            <p className="text-xs text-slate-500">kod gönderildi</p>
          </CardContent>
        </Card>
      </div>

      {/* Channels List */}
      <Card className="border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Kanallarınız</CardTitle>
        </CardHeader>
        <CardContent>
          {userChannels.length === 0 ? (
            <div className="text-center py-8">
              <Radio className="mx-auto h-12 w-12 text-slate-600" />
              <p className="mt-4 text-slate-400">Henüz atanmış kanalınız yok.</p>
              <p className="text-sm text-slate-500">
                Süper admin tarafından kanal atanması gerekiyor.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {userChannels.map((uc) => {
                const channelTodayStats = uc.channel.stats.find(
                  (s) => s.statDate.split("T")[0] === today
                );
                return (
                  <div
                    key={uc.id}
                    className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/50 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${uc.paused ? "bg-red-500" : "bg-blue-500"}`} />
                      <div>
                        <p className="font-medium text-white">
                          {uc.channel.channelName || `Kanal ${uc.channelId}`}
                        </p>
                        <p className="text-xs text-slate-500">ID: {uc.channelId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-white">
                          {channelTodayStats?.dailyCount || 0} kod
                        </p>
                        <p className="text-xs text-slate-500">bugün</p>
                      </div>
                      <Badge variant={uc.paused ? "destructive" : "default"} className={uc.paused ? "" : "bg-blue-600 hover:bg-blue-700"}>
                        {uc.paused ? "Durduruldu" : "Aktif"}
                      </Badge>
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
