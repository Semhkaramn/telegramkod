"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, Play, Pause, BarChart3 } from "lucide-react";

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

export default function ChannelsPage() {
  const [userChannels, setUserChannels] = useState<UserChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

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

  const togglePause = async (channelId: string, currentPaused: boolean) => {
    setUpdating(channelId);
    try {
      const response = await fetch("/api/user-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          paused: !currentPaused,
        }),
      });

      if (response.ok) {
        setUserChannels((prev) =>
          prev.map((uc) =>
            uc.channelId === channelId ? { ...uc, paused: !currentPaused } : uc
          )
        );
      }
    } catch (error) {
      console.error("Error toggling pause:", error);
    } finally {
      setUpdating(null);
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const getChannelStats = (channel: Channel) => {
    let todayCount = 0;
    let weekCount = 0;
    let monthCount = 0;

    channel.stats.forEach((stat) => {
      const statDate = stat.statDate.split("T")[0];
      if (statDate === today) {
        todayCount += stat.dailyCount;
      }
      if (statDate >= weekAgo) {
        weekCount += stat.dailyCount;
      }
      if (statDate >= monthAgo) {
        monthCount += stat.dailyCount;
      }
    });

    return { todayCount, weekCount, monthCount };
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 bg-zinc-800" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 bg-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Kanallarım</h1>
        <p className="text-zinc-400">
          Atanan kanallarınızı yönetin ve durumlarını kontrol edin.
        </p>
      </div>

      {userChannels.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Radio className="h-16 w-16 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              Henüz kanal atanmamış
            </h3>
            <p className="text-zinc-400 text-center max-w-md">
              Süper admin tarafından size kanal atanması gerekiyor. Kanal
              atandıktan sonra burada görüntüleyebilir ve yönetebilirsiniz.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {userChannels.map((uc) => {
            const stats = getChannelStats(uc.channel);
            const isUpdating = updating === uc.channelId;

            return (
              <Card key={uc.id} className="border-zinc-800 bg-zinc-900">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Channel Info */}
                    <div className="flex items-center gap-4">
                      <div
                        className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                          uc.paused
                            ? "bg-red-900/30 text-red-400"
                            : "bg-emerald-900/30 text-emerald-400"
                        }`}
                      >
                        <Radio className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-white">
                          {uc.channel.channelName || `Kanal ${uc.channelId}`}
                        </h3>
                        <p className="text-sm text-zinc-500">ID: {uc.channelId}</p>
                      </div>
                    </div>

                    {/* Status Toggle */}
                    <div className="flex items-center gap-4">
                      <Badge
                        variant={uc.paused ? "destructive" : "default"}
                        className={uc.paused ? "" : "bg-emerald-600"}
                      >
                        {uc.paused ? "Durduruldu" : "Aktif"}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-400">
                          {uc.paused ? "Başlat" : "Durdur"}
                        </span>
                        <Switch
                          checked={!uc.paused}
                          onCheckedChange={() => togglePause(uc.channelId, uc.paused)}
                          disabled={isUpdating}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="mt-6 grid grid-cols-3 gap-4">
                    <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
                      <div className="flex items-center gap-2 text-zinc-400 mb-1">
                        <BarChart3 className="h-4 w-4" />
                        <span className="text-xs">Bugün</span>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        {stats.todayCount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
                      <div className="flex items-center gap-2 text-zinc-400 mb-1">
                        <BarChart3 className="h-4 w-4" />
                        <span className="text-xs">Bu Hafta</span>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        {stats.weekCount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
                      <div className="flex items-center gap-2 text-zinc-400 mb-1">
                        <BarChart3 className="h-4 w-4" />
                        <span className="text-xs">Bu Ay</span>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        {stats.monthCount}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Bulk Actions */}
      {userChannels.length > 1 && (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-white text-base">Toplu İşlemler</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Button
              variant="outline"
              className="border-emerald-600 text-emerald-400 hover:bg-emerald-900/30"
              onClick={async () => {
                for (const uc of userChannels.filter((c) => c.paused)) {
                  await togglePause(uc.channelId, true);
                }
              }}
            >
              <Play className="mr-2 h-4 w-4" />
              Tümünü Başlat
            </Button>
            <Button
              variant="outline"
              className="border-red-600 text-red-400 hover:bg-red-900/30"
              onClick={async () => {
                for (const uc of userChannels.filter((c) => !c.paused)) {
                  await togglePause(uc.channelId, false);
                }
              }}
            >
              <Pause className="mr-2 h-4 w-4" />
              Tümünü Durdur
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
