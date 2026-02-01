"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, AlertTriangle } from "lucide-react";

interface Channel {
  channelId: string;
  channelName: string | null;
  channelUsername: string | null;
  channelPhoto: string | null;
  memberCount: number | null;
  isJoined: boolean;
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

export default function DashboardPage() {
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
    // Bot kapaliysa aktifleştirme yapilamaz
    if (!userInfo?.botEnabled && currentPaused) {
      alert("Bot yonetici tarafindan durdurulmus. Kanallari aktiflestiremezsiniz.");
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
        alert(data.error || "Bir hata olustu");
      }
    } catch (error) {
      console.error("Error toggling pause:", error);
    } finally {
      setUpdating(null);
    }
  };

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
        <p className="text-slate-400">Hos geldiniz! Kanallarinizi buradan yonetin.</p>
      </div>

      {/* Bot Disabled Warning */}
      {userInfo && !userInfo.botEnabled && (
        <Card className="border-orange-500/30 bg-orange-500/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            <div>
              <p className="font-medium text-orange-400">Bot Durduruldu</p>
              <p className="text-sm text-orange-300/80">
                Yonetici tarafindan botunuz durdurulmustur. Kanallariniza kod gonderilmeyecek ve kanallari aktiflestiremezsiniz.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
              {activeChannels} aktif, {pausedChannels} durdurulmus
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Aktif Kanallar
            </CardTitle>
            <Radio className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{activeChannels}</div>
            <p className="text-xs text-slate-500">kanal aktif durumda</p>
          </CardContent>
        </Card>

        <Card className="border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Duraklatilmis
            </CardTitle>
            <Radio className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{pausedChannels}</div>
            <p className="text-xs text-slate-500">kanal durdurulmus</p>
          </CardContent>
        </Card>
      </div>

      {/* Channels List with Toggle */}
      <Card className="border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Kanallariniz</CardTitle>
        </CardHeader>
        <CardContent>
          {userChannels.length === 0 ? (
            <div className="text-center py-8">
              <Radio className="mx-auto h-12 w-12 text-slate-600" />
              <p className="mt-4 text-slate-400">Henuz atanmis kanaliniz yok.</p>
              <p className="text-sm text-slate-500">
                Super admin tarafindan kanal atanmasi gerekiyor.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {userChannels.map((uc) => {
                const isUpdating = updating === uc.channelId;
                const canToggle = userInfo?.botEnabled || !uc.paused;

                return (
                  <div
                    key={uc.id}
                    className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/50 p-4"
                  >
                    <div className="flex items-center gap-3">
                      {uc.channel.channelPhoto ? (
                        <img
                          src={uc.channel.channelPhoto}
                          alt={uc.channel.channelName || "Kanal"}
                          className="h-10 w-10 rounded-lg object-cover border border-slate-700"
                        />
                      ) : (
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${uc.paused ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>
                          <Radio className="h-5 w-5" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-white">
                          {uc.channel.channelName || `Kanal ${uc.channelId}`}
                        </p>
                        <p className="text-xs text-slate-500">
                          {uc.channel.channelUsername ? `@${uc.channel.channelUsername}` : `ID: ${uc.channelId}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge
                        variant={uc.paused ? "destructive" : "default"}
                        className={uc.paused ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-blue-600 hover:bg-blue-700"}
                      >
                        {uc.paused ? "Durduruldu" : "Aktif"}
                      </Badge>
                      <Switch
                        checked={!uc.paused}
                        onCheckedChange={() => togglePause(uc.channelId, uc.paused)}
                        disabled={isUpdating || !canToggle}
                        className="data-[state=checked]:bg-blue-600"
                      />
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
