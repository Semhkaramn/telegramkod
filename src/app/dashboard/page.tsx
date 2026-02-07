"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Radio, AlertTriangle, Filter, Plus, X, Settings2, Check, Search, FileText } from "lucide-react";

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

interface DialogState {
  isOpen: boolean;
  channelId: string | null;
  channelName: string | null;
  newKeyword: string;
  searchQuery: string;
  bulkMode: boolean;
  bulkKeywords: string;
}

export default function DashboardPage() {
  const [userChannels, setUserChannels] = useState<UserChannel[]>([]);
  const [channelFilters, setChannelFilters] = useState<ChannelFilter[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [addingKeyword, setAddingKeyword] = useState(false);

  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    channelId: null,
    channelName: null,
    newKeyword: "",
    searchQuery: "",
    bulkMode: false,
    bulkKeywords: "",
  });

  useEffect(() => {
    // İlk yüklemede refresh=true ile kanal bilgilerini güncelle
    fetchData(true);
  }, []);

  const fetchData = async (refresh = false) => {
    try {
      const [channelsRes, userRes, filtersRes] = await Promise.all([
        fetch(`/api/user-channels${refresh ? "?refresh=true" : ""}`),
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
      alert("Bot yonetici tarafindan durdurulmus.");
      return;
    }

    setUpdating(channelId);
    try {
      const response = await fetch("/api/user-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, paused: !currentPaused }),
      });

      if (response.ok) {
        setUserChannels((prev) =>
          prev.map((uc) =>
            uc.channelId === channelId ? { ...uc, paused: !currentPaused } : uc
          )
        );
      } else {
        const data = await response.json();
        alert(data.error || "Hata olustu");
      }
    } catch (error) {
      console.error("Error:", error);
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
        body: JSON.stringify({ channelId, filterMode: newMode }),
      });

      if (response.ok) {
        setUserChannels((prev) =>
          prev.map((uc) =>
            uc.channelId === channelId ? { ...uc, filterMode: newMode } : uc
          )
        );
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const openKeywordDialog = (uc: UserChannel) => {
    setDialogState({
      isOpen: true,
      channelId: uc.channelId,
      channelName: uc.channel.channelName || `Kanal ${uc.channelId}`,
      newKeyword: "",
      searchQuery: "",
      bulkMode: false,
      bulkKeywords: "",
    });
  };

  const closeKeywordDialog = () => {
    setDialogState({
      isOpen: false,
      channelId: null,
      channelName: null,
      newKeyword: "",
      searchQuery: "",
      bulkMode: false,
      bulkKeywords: "",
    });
  };

  const updateDialogKeyword = (keyword: string) => {
    setDialogState((prev) => ({ ...prev, newKeyword: keyword }));
  };

  const addKeyword = async () => {
    if (!dialogState.channelId || !dialogState.newKeyword.trim()) return;

    setAddingKeyword(true);
    try {
      const response = await fetch("/api/channel-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: dialogState.channelId,
          keyword: dialogState.newKeyword.trim(),
        }),
      });

      if (response.ok) {
        const newFilter = await response.json();
        setChannelFilters((prev) => [...prev, newFilter]);
        setDialogState((prev) => ({ ...prev, newKeyword: "" }));
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setAddingKeyword(false);
    }
  };

  const addBulkKeywords = async () => {
    if (!dialogState.channelId || !dialogState.bulkKeywords.trim()) return;

    setAddingKeyword(true);
    const keywords = dialogState.bulkKeywords
      .split("\n")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    try {
      for (const keyword of keywords) {
        const response = await fetch("/api/channel-filters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId: dialogState.channelId,
            keyword: keyword,
          }),
        });

        if (response.ok) {
          const newFilter = await response.json();
          setChannelFilters((prev) => [...prev, newFilter]);
        }
      }
      setDialogState((prev) => ({ ...prev, bulkKeywords: "", bulkMode: false }));
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setAddingKeyword(false);
    }
  };

  const deleteKeyword = async (id: number) => {
    try {
      const response = await fetch(`/api/channel-filters?id=${id}`, { method: "DELETE" });
      if (response.ok) {
        setChannelFilters((prev) => prev.filter((f) => f.id !== id));
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const getFiltersForChannel = (channelId: string) => {
    return channelFilters
      .filter((f) => f.channelId === channelId)
      .sort((a, b) => a.keyword.localeCompare(b.keyword, 'tr'));
  };

  const activeChannels = userChannels.filter((uc) => !uc.paused).length;
  const pausedChannels = userChannels.filter((uc) => uc.paused).length;

  // Dialog için filtreler - arama ve A-Z sıralı
  const dialogFilters = dialogState.channelId
    ? getFiltersForChannel(dialogState.channelId)
        .filter((f) =>
          f.keyword.toLowerCase().includes(dialogState.searchQuery.toLowerCase())
        )
    : [];

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid gap-2 grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 bg-slate-800" />
          ))}
        </div>
        <Skeleton className="h-40 bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Dashboard</h1>
        <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
          {userChannels.length} kanal
        </Badge>
      </div>

      {/* Bot Disabled Warning */}
      {userInfo && !userInfo.botEnabled && (
        <div className="flex items-center gap-2 p-2 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0" />
          <span className="text-orange-300">Bot durduruldu - kod gonderilmiyor</span>
        </div>
      )}

      {/* Stats Cards - Compact */}
      <div className="grid gap-2 grid-cols-3">
        <Card className="border-slate-700/50 bg-slate-900/50 p-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Toplam</p>
              <p className="text-lg font-bold text-white">{userChannels.length}</p>
            </div>
            <Radio className="h-4 w-4 text-blue-500" />
          </div>
        </Card>

        <Card className="border-slate-700/50 bg-slate-900/50 p-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Aktif</p>
              <p className="text-lg font-bold text-green-400">{activeChannels}</p>
            </div>
            <Radio className="h-4 w-4 text-green-500" />
          </div>
        </Card>

        <Card className="border-slate-700/50 bg-slate-900/50 p-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Durdu</p>
              <p className="text-lg font-bold text-red-400">{pausedChannels}</p>
            </div>
            <Radio className="h-4 w-4 text-red-500" />
          </div>
        </Card>
      </div>

      {/* Channels List */}
      <Card className="border-slate-700/50 bg-slate-900/50">
        <CardHeader className="py-2.5 px-3">
          <CardTitle className="text-sm text-white">Kanallar</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {userChannels.length === 0 ? (
            <div className="text-center py-6 px-3">
              <Radio className="mx-auto h-8 w-8 text-slate-600" />
              <p className="mt-2 text-xs text-slate-400">Henuz kanal yok</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {userChannels.map((uc) => {
                const isUpdating = updating === uc.channelId;
                const canToggle = userInfo?.botEnabled || !uc.paused;
                const filters = getFiltersForChannel(uc.channelId);

                return (
                  <div key={uc.id} className="p-2.5 space-y-2">
                    {/* Channel Row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {uc.channel.channelPhoto ? (
                          <img
                            src={uc.channel.channelPhoto}
                            alt=""
                            className="h-7 w-7 rounded-md object-cover border border-slate-700 shrink-0"
                            onError={(e) => {
                              // Resim yüklenemezse (expire olmuş URL) varsayılan ikona geç
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              target.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${uc.channel.channelPhoto ? 'hidden' : ''} ${uc.paused ? "bg-red-500/20" : "bg-blue-500/20"}`}>
                          <Radio className={`h-3.5 w-3.5 ${uc.paused ? "text-red-400" : "text-blue-400"}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-white truncate">
                            {uc.channel.channelName || `Kanal ${uc.channelId}`}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {uc.channel.channelUsername ? `@${uc.channel.channelUsername}` : `ID: ${uc.channelId}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          className={`text-[10px] px-1.5 py-0 ${uc.paused ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-green-500/20 text-green-400 border-green-500/30"}`}
                        >
                          {uc.paused ? "Durdu" : "Aktif"}
                        </Badge>
                        <Switch
                          checked={!uc.paused}
                          onCheckedChange={() => togglePause(uc.channelId, uc.paused)}
                          disabled={isUpdating || !canToggle}
                          className="scale-75 data-[state=checked]:bg-green-600"
                        />
                      </div>
                    </div>

                    {/* Filter Row - Compact */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={uc.filterMode === "all" ? "default" : "outline"}
                          onClick={() => toggleFilterMode(uc.channelId, uc.filterMode)}
                          className={`h-6 px-2 text-[10px] ${uc.filterMode === "all" ? "bg-green-600 hover:bg-green-700" : "border-slate-600 text-slate-400"}`}
                        >
                          {uc.filterMode === "all" && <Check className="h-2.5 w-2.5 mr-0.5" />}
                          Tum
                        </Button>
                        <Button
                          size="sm"
                          variant={uc.filterMode === "filtered" ? "default" : "outline"}
                          onClick={() => toggleFilterMode(uc.channelId, uc.filterMode)}
                          className={`h-6 px-2 text-[10px] ${uc.filterMode === "filtered" ? "bg-orange-600 hover:bg-orange-700" : "border-slate-600 text-slate-400"}`}
                        >
                          {uc.filterMode === "filtered" && <Check className="h-2.5 w-2.5 mr-0.5" />}
                          Filtreli
                        </Button>
                      </div>

                      {uc.filterMode === "filtered" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openKeywordDialog(uc)}
                          className="h-6 px-2 text-[10px] text-slate-400 hover:text-white"
                        >
                          <Settings2 className="h-3 w-3 mr-1" />
                          {filters.length} kelime
                        </Button>
                      )}
                    </div>

                    {/* Inline Keywords - A-Z sıralı */}
                    {uc.filterMode === "filtered" && filters.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {filters.slice(0, 4).map((filter) => (
                          <Badge key={filter.id} className="text-[10px] px-1.5 py-0 bg-orange-600/20 text-orange-400 border-orange-500/30">
                            {filter.keyword}
                          </Badge>
                        ))}
                        {filters.length > 4 && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-slate-700 text-slate-400">
                            +{filters.length - 4}
                          </Badge>
                        )}
                      </div>
                    )}

                    {uc.filterMode === "filtered" && filters.length === 0 && (
                      <p className="text-[10px] text-orange-400">Kelime ekleyin!</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Keyword Dialog - Geliştirilmiş */}
      <Dialog open={dialogState.isOpen} onOpenChange={(open) => !open && closeKeywordDialog()}>
        <DialogContent className="border-slate-700 bg-slate-900 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm text-white flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-orange-400" />
              {dialogState.channelName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Mod Seçimi */}
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={!dialogState.bulkMode ? "default" : "outline"}
                onClick={() => setDialogState((prev) => ({ ...prev, bulkMode: false }))}
                className={`flex-1 h-7 text-xs ${!dialogState.bulkMode ? "bg-orange-600 hover:bg-orange-700" : "border-slate-600 text-slate-400"}`}
              >
                <Plus className="h-3 w-3 mr-1" />
                Tekli Ekle
              </Button>
              <Button
                size="sm"
                variant={dialogState.bulkMode ? "default" : "outline"}
                onClick={() => setDialogState((prev) => ({ ...prev, bulkMode: true }))}
                className={`flex-1 h-7 text-xs ${dialogState.bulkMode ? "bg-orange-600 hover:bg-orange-700" : "border-slate-600 text-slate-400"}`}
              >
                <FileText className="h-3 w-3 mr-1" />
                Toplu Ekle
              </Button>
            </div>

            {/* Tekli Ekleme */}
            {!dialogState.bulkMode && (
              <div className="flex gap-1.5">
                <Input
                  placeholder="Kelime ekle..."
                  value={dialogState.newKeyword}
                  onChange={(e) => updateDialogKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                  className="h-8 text-xs bg-slate-800 border-slate-700 text-white"
                />
                <Button
                  onClick={addKeyword}
                  disabled={addingKeyword || !dialogState.newKeyword.trim()}
                  className="h-8 w-8 p-0 bg-orange-600 hover:bg-orange-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {/* Toplu Ekleme */}
            {dialogState.bulkMode && (
              <div className="space-y-2">
                <Textarea
                  placeholder="Her satira bir kelime yazin...&#10;kelime1&#10;kelime2&#10;kelime3"
                  value={dialogState.bulkKeywords}
                  onChange={(e) => setDialogState((prev) => ({ ...prev, bulkKeywords: e.target.value }))}
                  className="h-24 text-xs bg-slate-800 border-slate-700 text-white resize-none"
                />
                <Button
                  onClick={addBulkKeywords}
                  disabled={addingKeyword || !dialogState.bulkKeywords.trim()}
                  className="w-full h-8 text-xs bg-orange-600 hover:bg-orange-700"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Toplu Ekle ({dialogState.bulkKeywords.split("\n").filter((k) => k.trim()).length} kelime)
                </Button>
              </div>
            )}

            {/* Arama */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <Input
                placeholder="Kelime ara..."
                value={dialogState.searchQuery}
                onChange={(e) => setDialogState((prev) => ({ ...prev, searchQuery: e.target.value }))}
                className="h-8 pl-8 text-xs bg-slate-800 border-slate-700 text-white"
              />
            </div>

            {/* Kelime Listesi - A-Z sıralı */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {dialogFilters.length === 0 ? (
                <p className="text-center text-xs text-slate-500 py-4">
                  {dialogState.searchQuery ? "Sonuc bulunamadi" : "Kelime yok"}
                </p>
              ) : (
                <>
                  <p className="text-[10px] text-slate-500 px-1">
                    {dialogFilters.length} kelime (A-Z sirali)
                  </p>
                  {dialogFilters.map((filter) => (
                    <div key={filter.id} className="flex items-center justify-between rounded bg-slate-800 px-2 py-1.5">
                      <Badge className="text-[10px] bg-orange-600/20 text-orange-400 border-orange-500/30">
                        {filter.keyword}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 text-red-400 hover:bg-red-500/10"
                        onClick={() => deleteKeyword(filter.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
