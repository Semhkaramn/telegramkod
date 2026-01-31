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
  };
}

interface User {
  id: number;
  username: string;
  displayName: string | null;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [formData, setFormData] = useState({
    channel_id: "",
    channel_name: "",
  });
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

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: formData.channel_id,
          channel_name: formData.channel_name || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Bir hata olustu");
        setSubmitting(false);
        return;
      }

      setDialogOpen(false);
      setFormData({ channel_id: "", channel_name: "" });
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
            <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <line x1="12" x2="12" y1="5" y2="19" />
                <line x1="5" x2="19" y1="12" y2="12" />
              </svg>
              Yeni Kanal
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Yeni Kanal Ekle</DialogTitle>
              <DialogDescription className="text-zinc-400">
                Telegram kanal ID sini girin
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddChannel} className="space-y-4 mt-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Kanal ID</label>
                <Input
                  value={formData.channel_id}
                  onChange={(e) => setFormData({ ...formData, channel_id: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                  placeholder="-1001234567890"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Kanal Adı (Opsiyonel)</label>
                <Input
                  value={formData.channel_name}
                  onChange={(e) => setFormData({ ...formData, channel_name: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                  placeholder="Kanal adı"
                />
              </div>
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
                  disabled={submitting}
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
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Assigned Users */}
                    <div className="flex -space-x-2">
                      {channel.users.slice(0, 3).map((user) => (
                        <div
                          key={user.id}
                          className="w-8 h-8 rounded-full bg-zinc-700 border-2 border-zinc-900 flex items-center justify-center text-xs text-zinc-300"
                          title={user.displayName || user.username}
                        >
                          {(user.displayName || user.username)[0].toUpperCase()}
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
                                  <span className="text-zinc-100">{user.displayName || user.username}</span>
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
                            .filter((u) => !channel.users.some((cu) => cu.id === u.id))
                            .map((user) => (
                              <div
                                key={user.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors cursor-pointer"
                                onClick={() => handleAssignUser(user.id)}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-sm">
                                    {(user.displayName || user.username)[0].toUpperCase()}
                                  </div>
                                  <span className="text-zinc-100">{user.displayName || user.username}</span>
                                </div>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                                  <line x1="12" x2="12" y1="5" y2="19" />
                                  <line x1="5" x2="19" y1="12" y2="12" />
                                </svg>
                              </div>
                            ))}
                          {users.filter((u) => !channel.users.some((cu) => cu.id === u.id)).length === 0 && (
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
