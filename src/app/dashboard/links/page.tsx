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
import { Link2, Plus, Trash2, Radio, Edit2, Save, Search, Info, ArrowRight, Lightbulb } from "lucide-react";

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

export default function LinksPage() {
  const [userChannels, setUserChannels] = useState<UserChannel[]>([]);
  const [links, setLinks] = useState<AdminLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Form states
  const [linkCode, setLinkCode] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [bulkLinks, setBulkLinks] = useState("");

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
    }
  };

  const handleBulkAdd = async () => {
    if (!selectedChannel || !bulkLinks.trim()) return;

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
    }
  };

  const handleDeleteLink = async (id: number) => {
    try {
      const response = await fetch(`/api/admin-links?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error deleting link:", error);
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
            Link Özelleştirme
          </h1>
          <p className="text-slate-400 mt-1">
            Kanallarınız için özel linkler tanımlayın
          </p>
        </div>
      </div>

      {/* Info Card - How it works */}
      <Card className="bg-gradient-to-br from-blue-900/30 to-slate-900 border-blue-700/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-white flex items-center gap-2 text-lg">
            <Lightbulb className="h-5 w-5 text-yellow-400" />
            Nasıl Çalışır?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm text-slate-300">
            <p className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <span>
                <strong className="text-white">Link Kodu:</strong> Gelen mesajlarda veya kodlarda aranacak kelime.
                Örneğin "google" yazarsanız, mesajda "google" geçtiğinde link değiştirilir.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <span>
                <strong className="text-white">Link URL:</strong> Bulunan kelimenin yerine koyulacak link.
                Bu sizin özel linkiniz olacak.
              </span>
            </p>
            <div className="p-4 mt-3 rounded-xl bg-slate-800/50 border border-slate-700">
              <p className="text-blue-300 font-medium mb-2">Örnek Kullanım:</p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30">google</Badge>
                  <span className="text-slate-400">kelimesi</span>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-500 hidden sm:block" />
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">→</span>
                  <span className="text-green-400">https://sizin-linkiniz.com</span>
                  <span className="text-slate-400">ile değiştirilir</span>
                </div>
              </div>
              <p className="text-slate-500 text-xs mt-3">
                Mesajda "Hemen google.com'a gir" yazıyorsa → "Hemen https://sizin-linkiniz.com'a gir" olarak değiştirilir.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {userChannels.length === 0 ? (
        <Card className="border-slate-700 bg-slate-900">
          <CardContent className="py-12 text-center">
            <Radio className="mx-auto h-12 w-12 text-slate-600" />
            <p className="mt-4 text-slate-400">Henüz atanmış kanalınız yok.</p>
            <p className="text-sm text-slate-500">
              Süper admin tarafından kanal atanması gerekiyor.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Channel Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-400">Kanal Seçin:</span>
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
                        placeholder="Örnek: google, deneme, test"
                        value={linkCode}
                        onChange={(e) => setLinkCode(e.target.value)}
                        className="mt-1 border-slate-700 bg-slate-800 text-white focus:border-blue-500"
                      />
                      <p className="mt-1 text-xs text-blue-400">
                        Mesajda bu kelime geçtiğinde link değiştirilir
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
                      disabled={!linkCode || !linkUrl}
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
                        Her satıra bir link yazın (kod + URL)
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
                      disabled={!bulkLinks.trim()}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Hepsini Ekle
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Links List */}
          <Card className="border-slate-700 bg-slate-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Link2 className="h-5 w-5 text-blue-500" />
                Link Özelleştirmeleri
                <Badge variant="secondary" className="ml-2 bg-slate-800 text-slate-400">
                  {filteredLinks.length} link
                </Badge>
              </CardTitle>
              {searchQuery && (
                <CardDescription className="text-slate-400">
                  "{searchQuery}" için arama sonuçları
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {filteredLinks.length === 0 ? (
                <div className="py-8 text-center">
                  <Link2 className="mx-auto h-12 w-12 text-slate-600" />
                  <p className="mt-4 text-slate-400">
                    {searchQuery ? "Arama sonucu bulunamadı." : "Bu kanal için henüz link eklenmemiş."}
                  </p>
                  <p className="text-sm text-slate-500">
                    {!searchQuery && '"Link Ekle" butonunu kullanarak ekleyebilirsiniz.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800/50 p-4 hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30">
                            {link.link_code}
                          </Badge>
                          <ArrowRight className="h-4 w-4 text-slate-500 hidden sm:block" />
                          <span className="text-slate-400 sm:hidden">→</span>
                          <a
                            href={link.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-slate-400 hover:text-blue-400 truncate max-w-md"
                          >
                            {link.link_url}
                          </a>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        onClick={() => handleDeleteLink(link.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
