"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Link2, Plus, Trash2, Radio, Edit2, Save, Search, Info, ArrowRight, Lightbulb, X, Check, Pencil } from "lucide-react";

interface AdminLink {
  id: number;
  channel_id: string;
  link_code: string;
  link_url: string;
  created_at: string;
}

interface Channel {
  channelId: string;
  channelName: string | null;
}

interface UserChannel {
  id: number;
  channelId: string;
  paused: boolean;
  channel: Channel;
}

// Edit state interface for managing inline editing
interface EditState {
  id: number | null;
  link_code: string;
  link_url: string;
}

export default function LinksPage() {
  const [userChannels, setUserChannels] = useState<UserChannel[]>([]);
  const [links, setLinks] = useState<AdminLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Form states
  const [linkCode, setLinkCode] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [bulkLinks, setBulkLinks] = useState("");

  // Edit state for inline editing
  const [editState, setEditState] = useState<EditState>({
    id: null,
    link_code: "",
    link_url: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [channelsRes, linksRes] = await Promise.all([
        fetch("/api/user-channels"),
        fetch("/api/admin-links"),
      ]);

      if (channelsRes.ok) {
        const channelsData = await channelsRes.json();
        setUserChannels(channelsData);
        if (channelsData.length > 0 && !selectedChannel) {
          setSelectedChannel(channelsData[0].channelId);
        }
      }

      if (linksRes.ok) {
        const linksData = await linksRes.json();
        setLinks(linksData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLink = async () => {
    if (!selectedChannel || !linkCode || !linkUrl) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: selectedChannel,
          link_code: linkCode,
          link_url: linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`,
        }),
      });

      if (response.ok) {
        setLinkCode("");
        setLinkUrl("");
        setIsAddDialogOpen(false);
        fetchData();
      }
    } catch (error) {
      console.error("Error adding link:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkAdd = async () => {
    if (!selectedChannel || !bulkLinks.trim()) return;

    setSaving(true);
    const lines = bulkLinks.split("\n").filter((l) => l.trim());
    const linksToAdd: { code: string; url: string }[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const code = parts[0];
        let url = parts.slice(1).join(" ");
        if (!url.startsWith("http")) {
          url = `https://${url}`;
        }
        linksToAdd.push({ code, url });
      }
    }

    try {
      for (const link of linksToAdd) {
        await fetch("/api/admin-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel_id: selectedChannel,
            link_code: link.code,
            link_url: link.url,
          }),
        });
      }

      setBulkLinks("");
      setIsBulkDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error adding bulk links:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLink = async (id: number) => {
    try {
      const response = await fetch(`/api/admin-links?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setLinks((prev) => prev.filter((l) => l.id !== id));
      }
    } catch (error) {
      console.error("Error deleting link:", error);
    }
  };

  // Start editing a link
  const startEditing = (link: AdminLink) => {
    setEditState({
      id: link.id,
      link_code: link.link_code,
      link_url: link.link_url,
    });
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditState({
      id: null,
      link_code: "",
      link_url: "",
    });
  };

  // Save edited link
  const saveEdit = async () => {
    if (!editState.id || !editState.link_code || !editState.link_url) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editState.id,
          link_code: editState.link_code,
          link_url: editState.link_url.startsWith("http") ? editState.link_url : `https://${editState.link_url}`,
        }),
      });

      if (response.ok) {
        // Update local state
        setLinks((prev) =>
          prev.map((l) =>
            l.id === editState.id
              ? { ...l, link_code: editState.link_code, link_url: editState.link_url.startsWith("http") ? editState.link_url : `https://${editState.link_url}` }
              : l
          )
        );
        cancelEditing();
      }
    } catch (error) {
      console.error("Error updating link:", error);
    } finally {
      setSaving(false);
    }
  };

  const filteredLinks = links
    .filter((link) => link.channel_id === selectedChannel)
    .filter((link) =>
      link.link_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.link_url.toLowerCase().includes(searchQuery.toLowerCase())
    );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 bg-slate-800" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24 bg-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Link2 className="h-7 w-7 text-blue-500" />
            Link Ozellestirme
          </h1>
          <p className="text-slate-400 mt-1">
            Kanallariniz icin ozel linkler tanimlayin
          </p>
        </div>
      </div>

      {/* Info Card - How it works */}
      <Card className="bg-gradient-to-br from-blue-900/30 to-slate-900 border-blue-700/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-white flex items-center gap-2 text-lg">
            <Lightbulb className="h-5 w-5 text-yellow-400" />
            Nasil Calisir?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm text-slate-300">
            <p className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <span>
                <strong className="text-white">Link Kodu:</strong> Gelen mesajlarda veya kodlarda aranacak kelime.
                Ornegin "google" yazarsaniz, mesajda "google" gectiginde link degistirilir.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <span>
                <strong className="text-white">Link URL:</strong> Bulunan kelimenin yerine koyulacak link.
                Bu sizin ozel linkiniz olacak.
              </span>
            </p>
            <div className="p-4 mt-3 rounded-xl bg-slate-800/50 border border-slate-700">
              <p className="text-blue-300 font-medium mb-2">Ornek Kullanim:</p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30">google</Badge>
                  <span className="text-slate-400">kelimesi</span>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-500 hidden sm:block" />
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">-&gt;</span>
                  <span className="text-green-400">https://sizin-linkiniz.com</span>
                  <span className="text-slate-400">ile degistirilir</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {userChannels.length === 0 ? (
        <Card className="border-slate-700 bg-slate-900">
          <CardContent className="py-12 text-center">
            <Radio className="mx-auto h-12 w-12 text-slate-600" />
            <p className="mt-4 text-slate-400">Henuz atanmis kanaliniz yok.</p>
            <p className="text-sm text-slate-500">
              Super admin tarafindan kanal atanmasi gerekiyor.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Channel Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-400">Kanal Secin:</span>
            {userChannels.map((uc) => (
              <Button
                key={uc.channelId}
                variant={selectedChannel === uc.channelId ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedChannel(uc.channelId)}
                className={
                  selectedChannel === uc.channelId
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-lg shadow-blue-500/25"
                    : "border-slate-700 text-slate-400 hover:bg-slate-800"
                }
              >
                {uc.channel.channelName || `Kanal ${uc.channelId}`}
              </Button>
            ))}
          </div>

          {/* Search and Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Link ara (kod veya URL)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-900 border-slate-700 text-white focus:border-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-lg shadow-blue-500/25">
                    <Plus className="mr-2 h-4 w-4" />
                    Link Ekle
                  </Button>
                </DialogTrigger>
                <DialogContent className="border-slate-700 bg-slate-900">
                  <DialogHeader>
                    <DialogTitle className="text-white">Yeni Link Ekle</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div>
                      <label className="text-sm text-slate-400">Link Kodu (Aranacak Kelime)</label>
                      <Input
                        placeholder="Ornek: google, deneme, test"
                        value={linkCode}
                        onChange={(e) => setLinkCode(e.target.value)}
                        className="mt-1 border-slate-700 bg-slate-800 text-white focus:border-blue-500"
                      />
                      <p className="mt-1 text-xs text-blue-400">
                        Mesajda bu kelime gectiginde link degistirilir
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-slate-400">Link URL (Sizin Linkiniz)</label>
                      <Input
                        placeholder="https://example.com"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        className="mt-1 border-slate-700 bg-slate-800 text-white focus:border-blue-500"
                      />
                    </div>
                    <Button
                      onClick={handleAddLink}
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600"
                      disabled={!linkCode || !linkUrl || saving}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Kaydet
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-slate-700 text-slate-400 hover:bg-slate-800">
                    <Edit2 className="mr-2 h-4 w-4" />
                    Toplu Ekle
                  </Button>
                </DialogTrigger>
                <DialogContent className="border-slate-700 bg-slate-900">
                  <DialogHeader>
                    <DialogTitle className="text-white">Toplu Link Ekle</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div>
                      <label className="text-sm text-slate-400">
                        Her satira bir link yazin (kod + URL)
                      </label>
                      <Textarea
                        placeholder={`deneme www.deneme.com\ngoogle www.google.com\ntest https://test.com`}
                        value={bulkLinks}
                        onChange={(e) => setBulkLinks(e.target.value)}
                        className="mt-1 h-40 border-slate-700 bg-slate-800 text-white"
                      />
                    </div>
                    <Button
                      onClick={handleBulkAdd}
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600"
                      disabled={!bulkLinks.trim() || saving}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Hepsini Ekle
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Links Table/List */}
          <Card className="border-slate-700 bg-slate-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Link2 className="h-5 w-5 text-blue-500" />
                Link Ozellestirmeleri
                <Badge variant="secondary" className="ml-2 bg-slate-800 text-slate-400">
                  {filteredLinks.length} link
                </Badge>
              </CardTitle>
              {searchQuery && (
                <CardDescription className="text-slate-400">
                  "{searchQuery}" icin arama sonuclari
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {filteredLinks.length === 0 ? (
                <div className="py-8 text-center">
                  <Link2 className="mx-auto h-12 w-12 text-slate-600" />
                  <p className="mt-4 text-slate-400">
                    {searchQuery ? "Arama sonucu bulunamadi." : "Bu kanal icin henuz link eklenmemis."}
                  </p>
                  <p className="text-sm text-slate-500">
                    {!searchQuery && '"Link Ekle" butonunu kullanarak ekleyebilirsiniz.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  {/* Table Header */}
                  <div className="hidden sm:grid sm:grid-cols-12 gap-4 px-4 py-3 bg-slate-800/50 rounded-t-lg border-b border-slate-700 text-sm font-medium text-slate-400">
                    <div className="col-span-1">#</div>
                    <div className="col-span-3">Arama Kodu</div>
                    <div className="col-span-6">Hedef URL</div>
                    <div className="col-span-2 text-right">Islemler</div>
                  </div>

                  {/* Table Body */}
                  <div className="divide-y divide-slate-700/50">
                    {filteredLinks.map((link, index) => (
                      <div
                        key={link.id}
                        className={`group px-4 py-3 transition-colors ${
                          editState.id === link.id
                            ? "bg-blue-900/20 border border-blue-500/30 rounded-lg my-1"
                            : "hover:bg-slate-800/50"
                        }`}
                      >
                        {editState.id === link.id ? (
                          // Edit Mode
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm text-blue-400 font-medium">
                              <Pencil className="h-4 w-4" />
                              Duzenleme Modu
                            </div>
                            <div className="grid sm:grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-slate-400 mb-1 block">Arama Kodu</label>
                                <Input
                                  value={editState.link_code}
                                  onChange={(e) => setEditState((prev) => ({ ...prev, link_code: e.target.value }))}
                                  className="bg-slate-800 border-slate-600 text-white focus:border-blue-500"
                                  placeholder="Arama kodu..."
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-400 mb-1 block">Hedef URL</label>
                                <Input
                                  value={editState.link_url}
                                  onChange={(e) => setEditState((prev) => ({ ...prev, link_url: e.target.value }))}
                                  className="bg-slate-800 border-slate-600 text-white focus:border-blue-500"
                                  placeholder="https://..."
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelEditing}
                                className="border-slate-600 text-slate-400 hover:bg-slate-700"
                              >
                                <X className="h-4 w-4 mr-1" />
                                Iptal
                              </Button>
                              <Button
                                size="sm"
                                onClick={saveEdit}
                                disabled={saving || !editState.link_code || !editState.link_url}
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Kaydet
                              </Button>
                            </div>
                          </div>
                        ) : (
                          // View Mode
                          <div className="grid sm:grid-cols-12 gap-4 items-center">
                            {/* Index */}
                            <div className="hidden sm:block col-span-1 text-slate-500 text-sm">
                              {index + 1}
                            </div>

                            {/* Link Code */}
                            <div className="sm:col-span-3">
                              <div className="flex items-center gap-2">
                                <span className="sm:hidden text-xs text-slate-500">Kod:</span>
                                <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30 font-medium">
                                  {link.link_code}
                                </Badge>
                              </div>
                            </div>

                            {/* Link URL */}
                            <div className="sm:col-span-6 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="sm:hidden text-xs text-slate-500">URL:</span>
                                <ArrowRight className="h-4 w-4 text-slate-500 shrink-0 hidden sm:block" />
                                <a
                                  href={link.link_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-slate-300 hover:text-blue-400 truncate transition-colors"
                                  title={link.link_url}
                                >
                                  {link.link_url}
                                </a>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="sm:col-span-2 flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEditing(link)}
                                className="h-8 w-8 p-0 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Duzenle"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteLink(link.id)}
                                className="h-8 w-8 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Sil"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
