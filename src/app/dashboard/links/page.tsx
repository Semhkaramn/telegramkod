"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Link2, Plus, Trash2, Radio, Edit2, Save } from "lucide-react";

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

  const filteredLinks = links.filter(
    (link) => link.channel_id === selectedChannel
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 bg-zinc-800" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24 bg-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Link Ozellestirme</h1>
          <p className="text-zinc-400">
            Kanallariniz icin ozel linkler tanimlayin
          </p>
        </div>
      </div>

      {userChannels.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="py-12 text-center">
            <Radio className="mx-auto h-12 w-12 text-zinc-600" />
            <p className="mt-4 text-zinc-400">Henuz atanmis kanaliniz yok.</p>
            <p className="text-sm text-zinc-500">
              Super admin tarafindan kanal atanmasi gerekiyor.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Channel Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-400">Kanal Secin:</span>
            {userChannels.map((uc) => (
              <Button
                key={uc.channelId}
                variant={selectedChannel === uc.channelId ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedChannel(uc.channelId)}
                className={
                  selectedChannel === uc.channelId
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                }
              >
                {uc.channel.channelName || `Kanal ${uc.channelId}`}
              </Button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="mr-2 h-4 w-4" />
                  Link Ekle
                </Button>
              </DialogTrigger>
              <DialogContent className="border-zinc-800 bg-zinc-900">
                <DialogHeader>
                  <DialogTitle className="text-white">Yeni Link Ekle</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <label className="text-sm text-zinc-400">Link Kodu</label>
                    <Input
                      placeholder="ornek: deneme, google, test"
                      value={linkCode}
                      onChange={(e) => setLinkCode(e.target.value)}
                      className="mt-1 border-zinc-700 bg-zinc-800 text-white"
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Kod icinde bu kelime gectiginde link degistirilir
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400">Link URL</label>
                    <Input
                      placeholder="https://example.com"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      className="mt-1 border-zinc-700 bg-zinc-800 text-white"
                    />
                  </div>
                  <Button
                    onClick={handleAddLink}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
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
                <Button variant="outline" className="border-zinc-700 text-zinc-400 hover:bg-zinc-800">
                  <Edit2 className="mr-2 h-4 w-4" />
                  Toplu Ekle
                </Button>
              </DialogTrigger>
              <DialogContent className="border-zinc-800 bg-zinc-900">
                <DialogHeader>
                  <DialogTitle className="text-white">Toplu Link Ekle</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <label className="text-sm text-zinc-400">
                      Her satira bir link yazin (kod + URL)
                    </label>
                    <Textarea
                      placeholder={`deneme www.deneme.com\ngoogle www.google.com\ntest https://test.com`}
                      value={bulkLinks}
                      onChange={(e) => setBulkLinks(e.target.value)}
                      className="mt-1 h-40 border-zinc-700 bg-zinc-800 text-white"
                    />
                  </div>
                  <Button
                    onClick={handleBulkAdd}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    disabled={!bulkLinks.trim()}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Hepsini Ekle
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Links List */}
          <Card className="border-zinc-800 bg-zinc-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Link2 className="h-5 w-5 text-emerald-500" />
                Link Ozellestirmeleri
                <Badge variant="secondary" className="ml-2 bg-zinc-800 text-zinc-400">
                  {filteredLinks.length} link
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredLinks.length === 0 ? (
                <div className="py-8 text-center">
                  <Link2 className="mx-auto h-12 w-12 text-zinc-600" />
                  <p className="mt-4 text-zinc-400">
                    Bu kanal icin henuz link eklenmemis.
                  </p>
                  <p className="text-sm text-zinc-500">
                    &quot;Link Ekle&quot; butonunu kullanarak ekleyebilirsiniz.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <Badge className="bg-emerald-600/20 text-emerald-400">
                            {link.link_code}
                          </Badge>
                          <span className="text-zinc-300">&rarr;</span>
                          <a
                            href={link.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-zinc-400 hover:text-emerald-400 truncate max-w-md"
                          >
                            {link.link_url}
                          </a>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:bg-red-900/20 hover:text-red-300"
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
