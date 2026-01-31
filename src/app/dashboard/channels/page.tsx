"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, Play, Pause, BarChart3, AlertTriangle, Tv } from "lucide-react";

interface ChannelStats {
  id: number;
  channelId: string;
  statDate: string;
  dailyCount: number;
}

interface Channel {
  channelId: string;
  channelName: string | null;
  channelUsername: string | null;
  channelPhoto: string | null;
  memberCount: number | null;
  stats: ChannelStats[];
}

interface UserChannel {
  id: number;
  userId: number;
  channelId: string;
  paused: boolean;
  channel: Channel;
}

interface UserInfo {
  botEnabled: boolean;
  isBanned: boolean;
}

export default function ChannelsPage() {
  const [userChannels, setUserChannels] = useState<UserChannel[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [channelsRes, userRes] = await Promise.all([
        fetch("/api/user-channels"),
        fetch("/api/auth/me")
      ]);

      if (channelsRes.ok) {
        const data = await channelsRes.json();
        setUserChannels(data);
      }

      if (userRes.ok) {
        const userData = await userRes.json();
        setUserInfo(userData.user || userData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const togglePause = async (channelId: string, currentPaused: boolean) => {
    // Bot kapalıysa aktifleştirme yapılamaz
    if (!userInfo?.botEnabled && currentPaused) {
      alert("Bot yönetici tarafından durdurulmuş. Kanalları aktifleştiremezsiniz.");
      return;
    }

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
      } else {
        const data = await response.json();
        alert(data.error || "Bir hata oluştu");
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
    let totalCount = 0;

    channel.stats.forEach((stat) => {
      const statDate = stat.statDate.split("T")[0];
      totalCount += stat.dailyCount;
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

    return { todayCount, weekCount, monthCount, totalCount };
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 bg-slate-800" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 bg-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Tv className="h-7 w-7 text-blue-500" />
          Kanallarım
        </h1>
        <p className="text-slate-400 mt-1">
          Atanan kanallarınızı yönetin ve durumlarını kontrol edin.
        </p>
      </div>

      {/* Bot Disabled Warning */}
      {userInfo && !userInfo.botEnabled && (
        <Card className="border-orange-500/30 bg-orange-500/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            <div>
              <p className="font-medium text-orange-400">Bot Durduruldu</p>
              <p className="text-sm text-orange-300/80">
                Yönetici tarafından botunuz durdurulmuştur. Kanallarınıza kod gönderilmeyecek ve kanalları aktifleştiremezsiniz.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {userChannels.length === 0 ? (
        <Card className="border-slate-700 bg-slate-900">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Radio className="h-16 w-16 text-slate-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              Henüz kanal atanmamış
            </h3>
            <p className="text-slate-400 text-center max-w-md">
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
            const canToggle = userInfo?.botEnabled || !uc.paused;

            return (
              <Card key={uc.id} className="border-slate-700 bg-slate-900 hover:bg-slate-900/80 transition-colors">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Channel Info */}
                    <div className="flex items-center gap-4">
                      {uc.channel.channelPhoto ? (
                        <img
                          src={uc.channel.channelPhoto}
                          alt={uc.channel.channelName || "Kanal"}
                          className="h-14 w-14 rounded-xl object-cover border border-slate-700"
                        />
                      ) : (
                        <div
                          className={`h-14 w-14 rounded-xl flex items-center justify-center ${
                            uc.paused
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : "bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30 text-blue-400"
                          }`}
                        >
                          <Radio className="h-6 w-6" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-lg font-medium text-white">
                          {uc.channel.channelName || `Kanal ${uc.channelId}`}
                        </h3>
                        <p className="text-sm text-slate-500">
                          {uc.channel.channelUsername ? `@${uc.channel.channelUsername}` : `ID: ${uc.channelId}`}
                          {uc.channel.memberCount && ` · ${uc.channel.memberCount.toLocaleString()} üye`}
                        </p>
                      </div>
                    </div>

                    {/* Status Toggle */}
                    <div className="flex items-center gap-4">
                      <Badge
                        variant={uc.paused ? "destructive" : "default"}
                        className={uc.paused ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-gradient-to-r from-blue-600 to-blue-500 text-white"}
                      >
                        {uc.paused ? "Durduruldu" : "Aktif"}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-400">
                          {uc.paused ? "Başlat" : "Durdur"}
                        </span>
                        <Switch
                          checked={!uc.paused}
                          onCheckedChange={() => togglePause(uc.channelId, uc.paused)}
                          disabled={isUpdating || !canToggle}
                          className="data-[state=checked]:bg-blue-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-4">
                      <div className="flex items-center gap-2 text-slate-400 mb-1">
                        <BarChart3 className="h-4 w-4 text-blue-400" />
                        <span className="text-xs">Bugün</span>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        {stats.todayCount}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-4">
                      <div className="flex items-center gap-2 text-slate-400 mb-1">
                        <BarChart3 className="h-4 w-4 text-blue-400" />
                        <span className="text-xs">Bu Hafta</span>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        {stats.weekCount}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-4">
                      <div className="flex items-center gap-2 text-slate-400 mb-1">
                        <BarChart3 className="h-4 w-4 text-blue-400" />
                        <span className="text-xs">Bu Ay</span>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        {stats.monthCount}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-4">
                      <div className="flex items-center gap-2 text-slate-400 mb-1">
                        <BarChart3 className="h-4 w-4 text-blue-400" />
                        <span className="text-xs">Toplam</span>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        {stats.totalCount}
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
      {userChannels.length > 1 && userInfo?.botEnabled && (
        <Card className="border-slate-700 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-white text-base">Toplu İşlemler</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button
              variant="outline"
              className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
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
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
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
