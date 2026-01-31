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

interface Channel {
  channel_id: string;
  channel_name: string | null;
  created_at: string;
  paused: boolean;
  users: {
    id: number;
    username: string;
    displayName: string | null;
    paused: boolean;
  }[];
  stats?: {
    daily: number;
    weekly: number;
    monthly: number;
    total?: number;
  };
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
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [channelsRes, usersRes] = await Promise.all([
        fetch("/api/channels"),
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

  // Telegram'dan kanal bilgisi al
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
      // Önce kanal bilgisini al (eğer henüz alınmamışsa)
      let channelId = channelInput.trim();
      let channelName = channelPreview?.title || null;

      // Eğer preview varsa, preview'daki ID'yi kullan
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
        setError(data.error || "Bir hata olustu");
        setSubmitting(false);
        return;
      }

      setDialogOpen(false);
      setChannelInput("");
      setChannelPreview(null);
      setPreviewError("");
      fetchData();
    } catch (error) {
      setError("Baglantı hatası");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (channelId: string) => {
    if (!confirm("Bu kanalı silmek istediginizden emin misiniz?")) return;

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
        <Skeleton className="h-8 w-48 bg-zinc-800" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 bg-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Kanallar</h1>
          <p className="text-zinc-400">Hedef kanalları yonetin</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <line x1="12" x2="12" y1="5" y2="19" />
                <line x1="5" x2="19" y1="12" y2="12" />
              </svg>
              Yeni Kanal
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Yeni Kanal Ekle</DialogTitle>
              <DialogDescription className="text-zinc-400">
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
                <label className="text-sm font-medium text-zinc-300">Kanal ID veya Kullanıcı Adı</label>
                <div className="flex gap-2">
                  <Input
                    value={channelInput}
                    onChange={(e) => {
                      setChannelInput(e.target.value);
                      setChannelPreview(null);
                      setPreviewError("");
                    }}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 flex-1"
                    placeholder="-1001234567890 veya @kanaladı"
                    required
                  />
                  <Button
                    type="button"
                    onClick={fetchChannelPreview}
                    disabled={fetchingPreview || !channelInput.trim()}
                    className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
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
                <p className="text-xs text-zinc-500">
                  Bot'un kanala admin olarak eklenmiş olması gerekir.
                </p>
              </div>

              {/* Preview Error */}
              {previewError && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm">
                  {previewError}
                </div>
              )}

              {/* Channel Preview */}
              {channelPreview && (
                <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
                  <div className="flex items-center gap-3">
                    {channelPreview.photoUrl ? (
                      <img
                        src={channelPreview.photoUrl}
                        alt={channelPreview.title}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-zinc-700 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                          <path d="m22 2-7 20-4-9-9-4Z" />
                          <path d="M22 2 11 13" />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-zinc-100 truncate">{channelPreview.title}</p>
                      <p className="text-sm text-zinc-400">
                        {channelPreview.username ? `@${channelPreview.username}` : `ID: ${channelPreview.id}`}
                      </p>
                      {channelPreview.memberCount && (
                        <p className="text-xs text-zinc-500">{channelPreview.memberCount} üye</p>
                      )}
                    </div>
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      Hazır
                    </Badge>
                  </div>
                  {channelPreview.description && (
                    <p className="text-xs text-zinc-500 mt-2 line-clamp-2">
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
                  className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Iptal
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || (!channelPreview && !channelInput.trim())}
                  className="flex-1 bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
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
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="py-12 text-center">
              <p className="text-zinc-500">Henuz kanal yok</p>
            </CardContent>
          </Card>
        ) : (
          channels.map((channel) => (
            <Card key={channel.channel_id} className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                        <path d="m22 2-7 20-4-9-9-4Z" />
                        <path d="M22 2 11 13" />
                      </svg>
                    </div>
                    <div>
                      <CardTitle className="text-zinc-100 text-lg">
                        {channel.channel_name || `Kanal ${channel.channel_id}`}
                      </CardTitle>
                      <CardDescription className="text-zinc-500">
                        ID: {channel.channel_id}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-400">
                        {channel.paused ? "Durduruldu" : "Aktif"}
                      </span>
                      <Switch
                        checked={!channel.paused}
                        onCheckedChange={() => handleTogglePause(channel.channel_id, channel.paused)}
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
                  <div className="flex items-center gap-4">
                    {/* Stats */}
                    <div className="flex gap-4 text-sm">
                      <div className="text-zinc-400">
                        <span className="text-zinc-100 font-medium">{channel.stats?.daily || 0}</span> bugun
                      </div>
                      <div className="text-zinc-400">
                        <span className="text-zinc-100 font-medium">{channel.stats?.weekly || 0}</span> hafta
                      </div>
                      <div className="text-zinc-400">
                        <span className="text-zinc-100 font-medium">{channel.stats?.monthly || 0}</span> ay
                      </div>
                      <div className="text-zinc-400">
                        <span className="text-zinc-100 font-medium">{channel.stats?.total || 0}</span> toplam
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Assigned Users */}
                    <div className="flex -space-x-2">
                      {channel.users.slice(0, 3).map((user) => (
                        <div
                          key={user.id}
                          className="w-8 h-8 rounded-full bg-zinc-700 border-2 border-zinc-900 flex items-center justify-center text-xs text-zinc-300"
                          title={user.username}
                        >
                          {user.username[0].toUpperCase()}
                        </div>
                      ))}
                      {channel.users.length > 3 && (
                        <div className="w-8 h-8 rounded-full bg-zinc-600 border-2 border-zinc-900 flex items-center justify-center text-xs text-zinc-300">
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
                          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        >
                          Kullanıcı Ata
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-zinc-900 border-zinc-800">
                        <DialogHeader>
                          <DialogTitle className="text-zinc-100">Kullanıcı Ata</DialogTitle>
                          <DialogDescription className="text-zinc-400">
                            Bu kanala kullanıcı atayın
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 mt-4">
                          {/* Current Users */}
                          {channel.users.length > 0 && (
                            <div className="space-y-2 pb-4 border-b border-zinc-800">
                              <p className="text-sm text-zinc-400">Atanmıs Kullanıcılar</p>
                              {channel.users.map((user) => (
                                <div key={user.id} className="flex items-center justify-between p-2 rounded bg-zinc-800/50">
                                  <span className="text-zinc-100">{user.username}</span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleRemoveUser(user.id, channel.channel_id)}
                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                  >
                                    Kaldir
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Available Users */}
                          <p className="text-sm text-zinc-400">Mevcut Kullanıcılar</p>
                          {users
                            .filter((u: any) => u.role !== "superadmin" && !channel.users.some((cu) => cu.id === u.id))
                            .map((user) => (
                              <div
                                key={user.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors cursor-pointer"
                                onClick={() => handleAssignUser(user.id)}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-sm">
                                    {user.username[0].toUpperCase()}
                                  </div>
                                  <span className="text-zinc-100">{user.username}</span>
                                </div>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                                  <line x1="12" x2="12" y1="5" y2="19" />
                                  <line x1="5" x2="19" y1="12" y2="12" />
                                </svg>
                              </div>
                            ))}
                          {users.filter((u: any) => u.role !== "superadmin" && !channel.users.some((cu) => cu.id === u.id)).length === 0 && (
                            <p className="text-zinc-500 text-center py-4">Tum kullanıcılar zaten atanmıs</p>
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
