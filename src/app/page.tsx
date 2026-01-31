"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface Stats {
  codes: { daily: number; weekly: number; monthly: number };
  channels: { total: number; active: number; paused: number };
  listeningChannels: number;
  admins: number;
}

interface Channel {
  channel_id: number;
  paused: number;
  admins: { admin_id: number; admin_username: string | null; admin_type: string }[];
  stats: { daily: number; weekly: number; monthly: number };
}

interface ListeningChannel {
  channel_id: number;
  keyword: string;
  default_link: string;
  type: string;
}

interface Keyword {
  id: number;
  keyword: string;
}

interface BannedWord {
  id: number;
  word: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [listeningChannels, setListeningChannels] = useState<ListeningChannel[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [bannedWords, setBannedWords] = useState<BannedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  // Form states
  const [newChannelId, setNewChannelId] = useState("");
  const [newAdminId, setNewAdminId] = useState("");
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [selectedChannelForAdmin, setSelectedChannelForAdmin] = useState("");
  const [newListeningChannelId, setNewListeningChannelId] = useState("");
  const [newListeningDefaultLink, setNewListeningDefaultLink] = useState("https://example.com");
  const [newKeyword, setNewKeyword] = useState("");
  const [newBannedWord, setNewBannedWord] = useState("");

  // Dialog states
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [addListeningOpen, setAddListeningOpen] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [statsRes, channelsRes, listeningRes, keywordsRes, bannedRes] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/channels"),
        fetch("/api/listening-channels"),
        fetch("/api/keywords"),
        fetch("/api/banned-words"),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (channelsRes.ok) setChannels(await channelsRes.json());
      if (listeningRes.ok) setListeningChannels(await listeningRes.json());
      if (keywordsRes.ok) setKeywords(await keywordsRes.json());
      if (bannedRes.ok) setBannedWords(await bannedRes.json());
    } catch (error) {
      console.error("Error fetching data:", error);
    }
    setLoading(false);
  };

  const addChannel = async () => {
    if (!newChannelId) return;
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: newChannelId }),
      });
      if (res.ok) {
        setNewChannelId("");
        setAddChannelOpen(false);
        fetchAllData();
      }
    } catch (error) {
      console.error("Error adding channel:", error);
    }
  };

  const removeChannel = async (channelId: number) => {
    if (!confirm("Bu kanalı silmek istediğinize emin misiniz?")) return;
    try {
      const res = await fetch(`/api/channels?channel_id=${channelId}`, { method: "DELETE" });
      if (res.ok) fetchAllData();
    } catch (error) {
      console.error("Error removing channel:", error);
    }
  };

  const toggleChannelPause = async (channelId: number, currentPaused: number) => {
    try {
      const res = await fetch("/api/channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, paused: !currentPaused }),
      });
      if (res.ok) fetchAllData();
    } catch (error) {
      console.error("Error toggling channel:", error);
    }
  };

  const addAdmin = async () => {
    if (!selectedChannelForAdmin || !newAdminId) return;
    try {
      const res = await fetch("/api/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: selectedChannelForAdmin,
          admin_id: newAdminId,
          admin_username: newAdminUsername || null,
          admin_type: "ana",
        }),
      });
      if (res.ok) {
        setNewAdminId("");
        setNewAdminUsername("");
        setSelectedChannelForAdmin("");
        setAddAdminOpen(false);
        fetchAllData();
      }
    } catch (error) {
      console.error("Error adding admin:", error);
    }
  };

  const removeAdmin = async (channelId: number, adminId: number) => {
    if (!confirm("Bu admini silmek istediğinize emin misiniz?")) return;
    try {
      const res = await fetch(`/api/admins?channel_id=${channelId}&admin_id=${adminId}`, { method: "DELETE" });
      if (res.ok) fetchAllData();
    } catch (error) {
      console.error("Error removing admin:", error);
    }
  };

  const addListeningChannel = async () => {
    if (!newListeningChannelId) return;
    try {
      const res = await fetch("/api/listening-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: newListeningChannelId, default_link: newListeningDefaultLink }),
      });
      if (res.ok) {
        setNewListeningChannelId("");
        setNewListeningDefaultLink("https://example.com");
        setAddListeningOpen(false);
        fetchAllData();
      }
    } catch (error) {
      console.error("Error adding listening channel:", error);
    }
  };

  const removeListeningChannel = async (channelId: number) => {
    if (!confirm("Bu dinleme kanalını silmek istediğinize emin misiniz?")) return;
    try {
      const res = await fetch(`/api/listening-channels?channel_id=${channelId}`, { method: "DELETE" });
      if (res.ok) fetchAllData();
    } catch (error) {
      console.error("Error removing listening channel:", error);
    }
  };

  const addKeywordHandler = async () => {
    if (!newKeyword.trim()) return;
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: newKeyword.trim() }),
      });
      if (res.ok) {
        setNewKeyword("");
        fetchAllData();
      }
    } catch (error) {
      console.error("Error adding keyword:", error);
    }
  };

  const removeKeywordHandler = async (keyword: string) => {
    try {
      const res = await fetch(`/api/keywords?keyword=${encodeURIComponent(keyword)}`, { method: "DELETE" });
      if (res.ok) fetchAllData();
    } catch (error) {
      console.error("Error removing keyword:", error);
    }
  };

  const addBannedWordHandler = async () => {
    if (!newBannedWord.trim()) return;
    try {
      const res = await fetch("/api/banned-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: newBannedWord.trim() }),
      });
      if (res.ok) {
        setNewBannedWord("");
        fetchAllData();
      }
    } catch (error) {
      console.error("Error adding banned word:", error);
    }
  };

  const removeBannedWordHandler = async (word: string) => {
    try {
      const res = await fetch(`/api/banned-words?word=${encodeURIComponent(word)}`, { method: "DELETE" });
      if (res.ok) fetchAllData();
    } catch (error) {
      console.error("Error removing banned word:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 2-7 20-4-9-9-4Z"/>
                  <path d="M22 2 11 13"/>
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-900">Telegram Bot Admin</h1>
                <p className="text-sm text-zinc-500">Super Admin Panel</p>
              </div>
            </div>
            <Button onClick={fetchAllData} variant="outline" size="sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                <path d="M16 16h5v5"/>
              </svg>
              Yenile
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="channels">Kanallar</TabsTrigger>
            <TabsTrigger value="listening">Dinleme Kanalları</TabsTrigger>
            <TabsTrigger value="keywords">Kelimeler</TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Toplam Kanal</CardDescription>
                  <CardTitle className="text-3xl">{stats?.channels.total || 0}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Badge variant="success">{stats?.channels.active || 0} Aktif</Badge>
                    <Badge variant="warning">{stats?.channels.paused || 0} Durduruldu</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Dinleme Kanalı</CardDescription>
                  <CardTitle className="text-3xl">{stats?.listeningChannels || 0}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-zinc-500">Kaynak kanallar</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Admin Sayısı</CardDescription>
                  <CardTitle className="text-3xl">{stats?.admins || 0}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-zinc-500">Kayıtlı adminler</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Bugün Gönderilen</CardDescription>
                  <CardTitle className="text-3xl">{stats?.codes.daily || 0}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-zinc-500">
                    <span>Hafta: {stats?.codes.weekly || 0}</span>
                    <span className="mx-2">|</span>
                    <span>Ay: {stats?.codes.monthly || 0}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Channels */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Kanallar</CardTitle>
                    <CardDescription>Hedef kanal listesi</CardDescription>
                  </div>
                  <Dialog open={addChannelOpen} onOpenChange={setAddChannelOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                          <path d="M5 12h14"/>
                          <path d="M12 5v14"/>
                        </svg>
                        Kanal Ekle
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Yeni Kanal Ekle</DialogTitle>
                        <DialogDescription>Hedef kanal ID'sini girin (ör: -1001234567890)</DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                        <Input
                          placeholder="Kanal ID"
                          value={newChannelId}
                          onChange={(e) => setNewChannelId(e.target.value)}
                        />
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAddChannelOpen(false)}>
                          İptal
                        </Button>
                        <Button onClick={addChannel}>Ekle</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {channels.length === 0 ? (
                    <p className="text-zinc-500 text-center py-8">Henüz kanal eklenmemiş</p>
                  ) : (
                    channels.slice(0, 5).map((channel) => (
                      <div
                        key={channel.channel_id}
                        className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-zinc-900">{channel.channel_id}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={channel.paused ? "warning" : "success"}>
                              {channel.paused ? "Durduruldu" : "Aktif"}
                            </Badge>
                            <span className="text-xs text-zinc-500">
                              Bugün: {channel.stats.daily} kod
                            </span>
                          </div>
                        </div>
                        <Switch
                          checked={!channel.paused}
                          onCheckedChange={() => toggleChannelPause(channel.channel_id, channel.paused)}
                        />
                      </div>
                    ))
                  )}
                  {channels.length > 5 && (
                    <Button variant="ghost" className="w-full" onClick={() => setActiveTab("channels")}>
                      Tümünü Görüntüle ({channels.length})
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Channels Tab */}
          <TabsContent value="channels">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Kanal Yönetimi</h2>
                <div className="flex gap-2">
                  <Dialog open={addAdminOpen} onOpenChange={setAddAdminOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <line x1="19" x2="19" y1="8" y2="14"/>
                          <line x1="22" x2="16" y1="11" y2="11"/>
                        </svg>
                        Admin Ekle
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Admin Ekle</DialogTitle>
                        <DialogDescription>Kanala admin atayın</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">Kanal</label>
                          <select
                            className="w-full h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm"
                            value={selectedChannelForAdmin}
                            onChange={(e) => setSelectedChannelForAdmin(e.target.value)}
                          >
                            <option value="">Kanal seçin</option>
                            {channels.map((ch) => (
                              <option key={ch.channel_id} value={ch.channel_id}>
                                {ch.channel_id}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-2 block">Admin ID</label>
                          <Input
                            placeholder="5725763398"
                            value={newAdminId}
                            onChange={(e) => setNewAdminId(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-2 block">Username (opsiyonel)</label>
                          <Input
                            placeholder="@username"
                            value={newAdminUsername}
                            onChange={(e) => setNewAdminUsername(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAddAdminOpen(false)}>
                          İptal
                        </Button>
                        <Button onClick={addAdmin}>Ekle</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={addChannelOpen} onOpenChange={setAddChannelOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                          <path d="M5 12h14"/>
                          <path d="M12 5v14"/>
                        </svg>
                        Kanal Ekle
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Yeni Kanal Ekle</DialogTitle>
                        <DialogDescription>Hedef kanal ID'sini girin</DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                        <Input
                          placeholder="Kanal ID (ör: -1001234567890)"
                          value={newChannelId}
                          onChange={(e) => setNewChannelId(e.target.value)}
                        />
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAddChannelOpen(false)}>
                          İptal
                        </Button>
                        <Button onClick={addChannel}>Ekle</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div className="grid gap-4">
                {channels.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-zinc-500">
                      Henüz kanal eklenmemiş
                    </CardContent>
                  </Card>
                ) : (
                  channels.map((channel) => (
                    <Card key={channel.channel_id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-semibold text-lg">{channel.channel_id}</h3>
                              <Badge variant={channel.paused ? "warning" : "success"}>
                                {channel.paused ? "Durduruldu" : "Aktif"}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                              <div>
                                <span className="text-zinc-500">Bugün:</span>
                                <span className="ml-2 font-medium">{channel.stats.daily} kod</span>
                              </div>
                              <div>
                                <span className="text-zinc-500">Hafta:</span>
                                <span className="ml-2 font-medium">{channel.stats.weekly} kod</span>
                              </div>
                              <div>
                                <span className="text-zinc-500">Ay:</span>
                                <span className="ml-2 font-medium">{channel.stats.monthly} kod</span>
                              </div>
                            </div>
                            {channel.admins.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                <span className="text-sm text-zinc-500">Adminler:</span>
                                {channel.admins.map((admin) => (
                                  <Badge
                                    key={admin.admin_id}
                                    variant="outline"
                                    className="cursor-pointer hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                                    onClick={() => removeAdmin(channel.channel_id, admin.admin_id)}
                                  >
                                    {admin.admin_username || admin.admin_id}
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1">
                                      <path d="M18 6 6 18"/>
                                      <path d="m6 6 12 12"/>
                                    </svg>
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={!channel.paused}
                              onCheckedChange={() => toggleChannelPause(channel.channel_id, channel.paused)}
                            />
                            <Button
                              variant="destructive"
                              size="icon"
                              onClick={() => removeChannel(channel.channel_id)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18"/>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                              </svg>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* Listening Channels Tab */}
          <TabsContent value="listening">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Dinleme Kanalları</h2>
                <Dialog open={addListeningOpen} onOpenChange={setAddListeningOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                        <path d="M5 12h14"/>
                        <path d="M12 5v14"/>
                      </svg>
                      Dinleme Kanalı Ekle
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Dinleme Kanalı Ekle</DialogTitle>
                      <DialogDescription>Kod dinlenecek kaynak kanalı ekleyin</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Kanal ID</label>
                        <Input
                          placeholder="-1001234567890"
                          value={newListeningChannelId}
                          onChange={(e) => setNewListeningChannelId(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">Varsayılan Link</label>
                        <Input
                          placeholder="https://example.com"
                          value={newListeningDefaultLink}
                          onChange={(e) => setNewListeningDefaultLink(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setAddListeningOpen(false)}>
                        İptal
                      </Button>
                      <Button onClick={addListeningChannel}>Ekle</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-4">
                {listeningChannels.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-zinc-500">
                      Henüz dinleme kanalı eklenmemiş
                    </CardContent>
                  </Card>
                ) : (
                  listeningChannels.map((channel) => (
                    <Card key={channel.channel_id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-lg">{channel.channel_id}</h3>
                            <p className="text-sm text-zinc-500 mt-1">
                              Varsayılan Link: {channel.default_link}
                            </p>
                          </div>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => removeListeningChannel(channel.channel_id)}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18"/>
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                            </svg>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* Keywords Tab */}
          <TabsContent value="keywords">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Keywords Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Anahtar Kelimeler</CardTitle>
                  <CardDescription>Kod algılama için tetikleyici kelimeler</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 mb-4">
                    <Input
                      placeholder="Yeni kelime"
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addKeywordHandler()}
                    />
                    <Button onClick={addKeywordHandler}>Ekle</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {keywords.length === 0 ? (
                      <p className="text-zinc-500 py-4">Henüz kelime eklenmemiş</p>
                    ) : (
                      keywords.map((kw) => (
                        <Badge
                          key={kw.id}
                          variant="outline"
                          className="cursor-pointer hover:bg-red-50 hover:border-red-300 hover:text-red-700 py-1.5 px-3"
                          onClick={() => removeKeywordHandler(kw.keyword)}
                        >
                          {kw.keyword}
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2">
                            <path d="M18 6 6 18"/>
                            <path d="m6 6 12 12"/>
                          </svg>
                        </Badge>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Banned Words Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Yasak Kelimeler</CardTitle>
                  <CardDescription>Bu kelimeleri içeren kodlar gönderilmez</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 mb-4">
                    <Input
                      placeholder="Yeni yasak kelime"
                      value={newBannedWord}
                      onChange={(e) => setNewBannedWord(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addBannedWordHandler()}
                    />
                    <Button onClick={addBannedWordHandler}>Ekle</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {bannedWords.length === 0 ? (
                      <p className="text-zinc-500 py-4">Henüz yasak kelime eklenmemiş</p>
                    ) : (
                      bannedWords.map((bw) => (
                        <Badge
                          key={bw.id}
                          variant="destructive"
                          className="cursor-pointer hover:opacity-80 py-1.5 px-3"
                          onClick={() => removeBannedWordHandler(bw.word)}
                        >
                          {bw.word}
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2">
                            <path d="M18 6 6 18"/>
                            <path d="m6 6 12 12"/>
                          </svg>
                        </Badge>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
