"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Radio, Plus } from "lucide-react";

interface Channel {
  channel_id: string;
  channel_name: string | null;
  channel_username: string | null;
  channel_photo: string | null;
  member_count: number | null;
  description: string | null;
  last_updated: string | null;
  created_at: string;
  paused: boolean;
  users: {
    id: number;
    username: string;
    displayName: string | null;
    paused: boolean;
  }[];

}

interface User {
  id: number;
  username: string;
}

interface ChannelPreview {
  id: string;
  title: string;
  username: string | null;
  type: string;
  description: string | null;
  memberCount: number | null;
  photoUrl: string | null;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [channelInput, setChannelInput] = useState("");
  const [channelPreview, setChannelPreview] = useState<ChannelPreview | null>(null);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchData(true);
  }, []);

  const fetchData = async (refresh = false) => {
    try {
      const [channelsRes, usersRes] = await Promise.all([
        fetch(`/api/channels${refresh ? "?refresh=true" : ""}`),
        fetch("/api/users"),
      ]);

      if (channelsRes.ok) {
        setChannels(await channelsRes.json());
      }
      if (usersRes.ok) {
        setUsers(await usersRes.json());
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChannelPreview = async () => {
    if (!channelInput.trim()) return;

    setFetchingPreview(true);
    setPreviewError("");
    setChannelPreview(null);

    try {
      const res = await fetch(`/api/telegram/channel-info?channelId=${encodeURIComponent(channelInput.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setPreviewError(data.error || "Kanal bilgisi alınamadı");
        return;
      }

      setChannelPreview(data.channel);
    } catch (error) {
      setPreviewError("Bağlantı hatası");
    } finally {
      setFetchingPreview(false);
    }
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      let channelId = channelInput.trim();
      let channelName = channelPreview?.title || null;

      if (channelPreview) {
        channelId = channelPreview.id;
        channelName = channelPreview.title;
      }

      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channelId,
          channel_name: channelName,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Bir hata oluştu");
        setSubmitting(false);
        return;
      }

      setDialogOpen(false);
      setChannelInput("");
      setChannelPreview(null);
      setPreviewError("");
      fetchData();
    } catch (error) {
      setError("Bağlantı hatası");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (channelId: string) => {
    if (!confirm("Bu kanalı silmek istediğinizden emin misiniz?")) return;

    try {
      const res = await fetch(`/api/channels?channel_id=${channelId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error deleting channel:", error);
    }
  };

  const handleTogglePause = async (channelId: string, currentPaused: boolean) => {
    try {
      await fetch("/api/channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channelId,
          paused: !currentPaused,
        }),
      });
      fetchData();
    } catch (error) {
      console.error("Error toggling pause:", error);
    }
  };

  const handleAssignUser = async (userId: number) => {
    if (!selectedChannel) return;

    try {
      await fetch("/api/user-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId,
          channelId: selectedChannel.channel_id,
        }),
      });
      fetchData();
      setAssignDialogOpen(false);
    } catch (error) {
      console.error("Error assigning user:", error);
    }
  };

  const handleRemoveUser = async (userId: number, channelId: string) => {
    try {
      await fetch(`/api/user-channels?userId=${userId}&channelId=${channelId}`, {
        method: "DELETE",
      });
      fetchData();
    } catch (error) {
      console.error("Error removing user:", error);
    }
  };

  const openAddDialog = () => {
    setChannelInput("");
    setChannelPreview(null);
    setPreviewError("");
    setError("");
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 bg-slate-800" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 bg-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Radio className="h-7 w-7 text-blue-500" />
            Kanallar
          </h1>
          <p className="text-slate-400 mt-1">Hedef kanalları yönetin</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog} className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-lg shadow-blue-500/25">
              <Plus className="mr-2 h-4 w-4" />
              Yeni Kanal
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-100">Yeni Kanal Ekle</DialogTitle>
              <DialogDescription className="text-slate-400">
                Kanal ID veya kullanıcı adı girin. Bot otomatik olarak kanal bilgilerini alacak.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddChannel} className="space-y-4 mt-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Kanal ID veya Kullanıcı Adı</label>
                <div className="flex gap-2">
                  <Input
                    value={channelInput}
                    onChange={(e) => {
                      setChannelInput(e.target.value);
                      setChannelPreview(null);
                      setPreviewError("");
                    }}
                    className="bg-slate-800 border-slate-700 text-slate-100 flex-1 focus:border-blue-500"
                    placeholder="-1001234567890 veya @kanaladı"
                    required
                  />
                  <Button
                    type="button"
                    onClick={fetchChannelPreview}
                    disabled={fetchingPreview || !channelInput.trim()}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-100"
                  >
                    {fetchingPreview ? (
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      "Kontrol Et"
                    )}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Bot'un kanala admin olarak eklenmiş olması gerekir.
                </p>
              </div>

              {previewError && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm">
                  {previewError}
                </div>
              )}

              {channelPreview && (
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                  <div className="flex items-center gap-3">
                    {channelPreview.photoUrl ? (
                      <img
                        src={channelPreview.photoUrl}
                        alt={channelPreview.title}
                        className="w-12 h-12 rounded-lg object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center ${channelPreview.photoUrl ? 'hidden' : ''}`}>
                      <Radio className="h-6 w-6 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-100 truncate">{channelPreview.title}</p>
                      <p className="text-sm text-slate-400">
                        {channelPreview.username ? `@${channelPreview.username}` : `ID: ${channelPreview.id}`}
                      </p>
                      {channelPreview.memberCount && (
                        <p className="text-xs text-slate-500">{channelPreview.memberCount} üye</p>
                      )}
                    </div>
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                      Hazır
                    </Badge>
                  </div>
                  {channelPreview.description && (
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                      {channelPreview.description}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  İptal
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || (!channelPreview && !channelInput.trim())}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white"
                >
                  {submitting ? "Ekleniyor..." : "Ekle"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Channels List */}
      <div className="grid gap-4">
        {channels.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="py-12 text-center">
              <p className="text-slate-500">Henüz kanal yok</p>
            </CardContent>
          </Card>
        ) : (
          channels.map((channel) => (
            <Card key={channel.channel_id} className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {channel.channel_photo ? (
                      <img
                        src={channel.channel_photo}
                        alt={channel.channel_name || "Kanal"}
                        className="w-10 h-10 rounded-lg object-cover"
                        onError={(e) => {
                          // Resim yüklenemezse (expire olmuş URL) varsayılan ikona geç
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/30 ${channel.channel_photo ? 'hidden' : ''}`}>
                      <Radio className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <CardTitle className="text-slate-100 text-lg">
                        {channel.channel_name || `Kanal ${channel.channel_id}`}
                      </CardTitle>
                      <CardDescription className="text-slate-500">
                        {channel.channel_username ? `@${channel.channel_username}` : `ID: ${channel.channel_id}`}
                        {channel.member_count && ` · ${channel.member_count.toLocaleString()} üye`}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-400">
                        {channel.paused ? "Durduruldu" : "Aktif"}
                      </span>
                      <Switch
                        checked={!channel.paused}
                        onCheckedChange={() => handleTogglePause(channel.channel_id, channel.paused)}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(channel.channel_id)}
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                    >
                      Sil
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {channel.users.slice(0, 3).map((user) => (
                        <div
                          key={user.id}
                          className="w-8 h-8 rounded-full bg-blue-500/20 border-2 border-slate-900 flex items-center justify-center text-xs text-blue-400"
                          title={user.username}
                        >
                          {user.username[0].toUpperCase()}
                        </div>
                      ))}
                      {channel.users.length > 3 && (
                        <div className="w-8 h-8 rounded-full bg-slate-600 border-2 border-slate-900 flex items-center justify-center text-xs text-slate-300">
                          +{channel.users.length - 3}
                        </div>
                      )}
                    </div>
                    <Dialog open={assignDialogOpen && selectedChannel?.channel_id === channel.channel_id} onOpenChange={(open) => {
                      setAssignDialogOpen(open);
                      if (open) setSelectedChannel(channel);
                    }}>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-slate-700 text-slate-300 hover:bg-slate-800"
                        >
                          Kullanıcı Ata
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-slate-900 border-slate-700">
                        <DialogHeader>
                          <DialogTitle className="text-slate-100">Kullanıcı Ata</DialogTitle>
                          <DialogDescription className="text-slate-400">
                            Bu kanala kullanıcı atayın
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 mt-4">
                          {channel.users.length > 0 && (
                            <div className="space-y-2 pb-4 border-b border-slate-800">
                              <p className="text-sm text-slate-400">Atanmış Kullanıcılar</p>
                              {channel.users.map((user) => (
                                <div key={user.id} className="flex items-center justify-between p-2 rounded bg-slate-800/50">
                                  <span className="text-slate-100">{user.username}</span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleRemoveUser(user.id, channel.channel_id)}
                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                  >
                                    Kaldır
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="text-sm text-slate-400">Mevcut Kullanıcılar</p>
                          {users
                            .filter((u: any) => u.role !== "superadmin" && !channel.users.some((cu) => cu.id === u.id))
                            .map((user) => (
                              <div
                                key={user.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer"
                                onClick={() => handleAssignUser(user.id)}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm">
                                    {user.username[0].toUpperCase()}
                                  </div>
                                  <span className="text-slate-100">{user.username}</span>
                                </div>
                                <Plus className="h-4 w-4 text-slate-500" />
                              </div>
                            ))}
                          {users.filter((u: any) => u.role !== "superadmin" && !channel.users.some((cu) => cu.id === u.id)).length === 0 && (
                            <p className="text-slate-500 text-center py-4">Tüm kullanıcılar zaten atanmış</p>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
