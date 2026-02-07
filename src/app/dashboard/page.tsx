"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Radio, AlertTriangle, Filter, Plus, X, Settings2, Check } from "lucide-react";

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
  filterMode: string;
  channel: Channel;
}

interface ChannelFilter {
  id: number;
  channelId: string;
  keyword: string;
  createdAt: string;
}

interface UserInfo {
  botEnabled: boolean;
  isBanned: boolean;
}

export default function DashboardPage() {
  const [userChannels, setUserChannels] = useState<UserChannel[]>([]);
  const [channelFilters, setChannelFilters] = useState<ChannelFilter[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<UserChannel | null>(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [addingKeyword, setAddingKeyword] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [channelsRes, userRes, filtersRes] = await Promise.all([
        fetch("/api/user-channels"),
        fetch("/api/auth/me"),
        fetch("/api/channel-filters"),
      ]);

      if (channelsRes.ok) {
        const data = await channelsRes.json();
        setUserChannels(data);
      }

      if (userRes.ok) {
        const userData = await userRes.json();
        setUserInfo(userData.user || userData);
      }

      if (filtersRes.ok) {
        const filtersData = await filtersRes.json();
        setChannelFilters(filtersData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const togglePause = async (channelId: string, currentPaused: boolean) => {
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

  const toggleFilterMode = async (channelId: string, currentMode: string) => {
    const newMode = currentMode === "all" ? "filtered" : "all";

    try {
      const response = await fetch("/api/channel-filters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          filterMode: newMode,
        }),
      });

      if (response.ok) {
        setUserChannels((prev) =>
          prev.map((uc) =>
            uc.channelId === channelId ? { ...uc, filterMode: newMode } : uc
          )
        );
      }
    } catch (error) {
      console.error("Error toggling filter mode:", error);
    }
  };

  const addKeyword = async () => {
    if (!selectedChannel || !newKeyword.trim()) return;

    setAddingKeyword(true);
    try {
      const response = await fetch("/api/channel-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: selectedChannel.channelId,
          keyword: newKeyword.trim(),
        }),
      });

      if (response.ok) {
        const newFilter = await response.json();
        setChannelFilters((prev) => [...prev, newFilter]);
        setNewKeyword("");
      }
    } catch (error) {
      console.error("Error adding keyword:", error);
    } finally {
      setAddingKeyword(false);
    }
  };

  const deleteKeyword = async (id: number) => {
    try {
      const response = await fetch(`/api/channel-filters?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setChannelFilters((prev) => prev.filter((f) => f.id !== id));
      }
    } catch (error) {
      console.error("Error deleting keyword:", error);
    }
  };

  const getFiltersForChannel = (channelId: string) => {
    return channelFilters.filter((f) => f.channelId === channelId);
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
            <div className="space-y-4">
              {userChannels.map((uc) => {
                const isUpdating = updating === uc.channelId;
                const canToggle = userInfo?.botEnabled || !uc.paused;
                const filters = getFiltersForChannel(uc.channelId);

                return (
                  <div
                    key={uc.id}
                    className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 space-y-4"
                  >
                    {/* Channel Info Row */}
                    <div className="flex items-center justify-between">
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

                    {/* Filter Settings Row */}
                    <div className="border-t border-slate-700/50 pt-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Filter className="h-4 w-4 text-slate-400" />
                          <span className="text-sm text-slate-400">Kod Filtresi:</span>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={uc.filterMode === "all" ? "default" : "outline"}
                              onClick={() => toggleFilterMode(uc.channelId, uc.filterMode)}
                              className={uc.filterMode === "all"
                                ? "bg-green-600 hover:bg-green-700 text-white"
                                : "border-slate-600 text-slate-400 hover:bg-slate-700"}
                            >
                              {uc.filterMode === "all" && <Check className="h-3 w-3 mr-1" />}
                              Tum Kodlar
                            </Button>
                            <Button
                              size="sm"
                              variant={uc.filterMode === "filtered" ? "default" : "outline"}
                              onClick={() => toggleFilterMode(uc.channelId, uc.filterMode)}
                              className={uc.filterMode === "filtered"
                                ? "bg-orange-600 hover:bg-orange-700 text-white"
                                : "border-slate-600 text-slate-400 hover:bg-slate-700"}
                            >
                              {uc.filterMode === "filtered" && <Check className="h-3 w-3 mr-1" />}
                              Belirli Kodlar
                            </Button>
                          </div>
                        </div>

                        {uc.filterMode === "filtered" && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-slate-600 text-slate-300 hover:bg-slate-700"
                                onClick={() => setSelectedChannel(uc)}
                              >
                                <Settings2 className="h-4 w-4 mr-2" />
                                Kelimeleri Yonet ({filters.length})
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="border-slate-700 bg-slate-900">
                              <DialogHeader>
                                <DialogTitle className="text-white flex items-center gap-2">
                                  <Filter className="h-5 w-5 text-orange-400" />
                                  Filtre Kelimeleri - {uc.channel.channelName || `Kanal ${uc.channelId}`}
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 pt-4">
                                <p className="text-sm text-slate-400">
                                  Sadece asagidaki kelimeleri iceren kodlar bu kanala gonderilir.
                                </p>

                                {/* Add new keyword */}
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="Yeni kelime ekle..."
                                    value={newKeyword}
                                    onChange={(e) => setNewKeyword(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                                    className="bg-slate-800 border-slate-700 text-white"
                                  />
                                  <Button
                                    onClick={addKeyword}
                                    disabled={addingKeyword || !newKeyword.trim()}
                                    className="bg-orange-600 hover:bg-orange-700"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>

                                {/* Keywords list */}
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                  {filters.length === 0 ? (
                                    <p className="text-center text-slate-500 py-4">
                                      Henuz kelime eklenmemis. Kelime ekleyin.
                                    </p>
                                  ) : (
                                    filters.map((filter) => (
                                      <div
                                        key={filter.id}
                                        className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2"
                                      >
                                        <Badge className="bg-orange-600/20 text-orange-400 border-orange-500/30">
                                          {filter.keyword}
                                        </Badge>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                          onClick={() => deleteKeyword(filter.id)}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                      </div>

                      {/* Show current filters inline */}
                      {uc.filterMode === "filtered" && filters.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {filters.slice(0, 5).map((filter) => (
                            <Badge
                              key={filter.id}
                              className="bg-orange-600/20 text-orange-400 border-orange-500/30"
                            >
                              {filter.keyword}
                            </Badge>
                          ))}
                          {filters.length > 5 && (
                            <Badge className="bg-slate-700 text-slate-400">
                              +{filters.length - 5} daha
                            </Badge>
                          )}
                        </div>
                      )}

                      {uc.filterMode === "filtered" && filters.length === 0 && (
                        <p className="text-xs text-orange-400 mt-2">
                          Uyari: Filtre aktif ama kelime eklenmemis. Hicbir kod gonderilmeyecek!
                        </p>
                      )}
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
