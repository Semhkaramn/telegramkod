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
import { Link2, Plus, Trash2, Radio, Edit2, Save, Search, ArrowRight, X, Check, Pencil, ChevronDown, ChevronUp } from "lucide-react";

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
  const [showInfo, setShowInfo] = useState(false);

  const [linkCode, setLinkCode] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [bulkLinks, setBulkLinks] = useState("");

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
      console.error("Error:", error);
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
      console.error("Error:", error);
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
        if (!url.startsWith("http")) url = `https://${url}`;
        linksToAdd.push({ code, url });
      }
    }

    try {
      // Paralel olarak tüm linkleri ekle (daha hızlı)
      await Promise.all(
        linksToAdd.map((link) =>
          fetch("/api/admin-links", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channel_id: selectedChannel,
              link_code: link.code,
              link_url: link.url,
            }),
          })
        )
      );
      setBulkLinks("");
      setIsBulkDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLink = async (id: number) => {
    try {
      const response = await fetch(`/api/admin-links?id=${id}`, { method: "DELETE" });
      if (response.ok) {
        setLinks((prev) => prev.filter((l) => l.id !== id));
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const startEditing = (link: AdminLink) => {
    setEditState({ id: link.id, link_code: link.link_code, link_url: link.link_url });
  };

  const cancelEditing = () => {
    setEditState({ id: null, link_code: "", link_url: "" });
  };

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
      console.error("Error:", error);
    } finally {
      setSaving(false);
    }
  };

  const filteredLinks = links
    .filter((link) => link.channel_id === selectedChannel)
    .filter((link) =>
      link.link_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.link_url.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => a.link_code.localeCompare(b.link_code, 'tr'));

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48 bg-slate-800" />
        <Skeleton className="h-32 bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white flex items-center gap-1.5">
          <Link2 className="h-5 w-5 text-blue-500" />
          Link Ozellestirme
        </h1>
        <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
          {filteredLinks.length} link
        </Badge>
      </div>

      {/* Collapsible Info */}
      <button
        onClick={() => setShowInfo(!showInfo)}
        className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-400 hover:bg-slate-800"
      >
        <span>Nasil calisir?</span>
        {showInfo ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {showInfo && (
        <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-400 space-y-2">
          <p><strong className="text-white">Link Kodu:</strong> Mesajda aranacak kelime</p>
          <p><strong className="text-white">Link URL:</strong> Yerine koyulacak link</p>
          <div className="flex items-center gap-2 pt-1">
            <Badge className="text-[10px] bg-blue-600/20 text-blue-400">google</Badge>
            <ArrowRight className="h-3 w-3" />
            <span className="text-green-400">https://sizin-link.com</span>
          </div>
        </div>
      )}

      {userChannels.length === 0 ? (
        <Card className="border-slate-700 bg-slate-900">
          <CardContent className="py-8 text-center">
            <Radio className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-2 text-xs text-slate-400">Henuz kanal yok</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Channel Selector - Horizontal Scroll */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {userChannels.map((uc) => (
              <Button
                key={uc.channelId}
                size="sm"
                variant={selectedChannel === uc.channelId ? "default" : "outline"}
                onClick={() => setSelectedChannel(uc.channelId)}
                className={`h-7 px-2.5 text-xs shrink-0 ${
                  selectedChannel === uc.channelId
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "border-slate-700 text-slate-400"
                }`}
              >
                {uc.channel.channelName || `Kanal`}
              </Button>
            ))}
          </div>

          {/* Search and Actions */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <Input
                placeholder="Ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 px-2.5 bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="border-slate-700 bg-slate-900 max-w-sm">
                <DialogHeader>
                  <DialogTitle className="text-sm text-white">Yeni Link</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase">Arama Kodu</label>
                    <Input
                      placeholder="ornek: google"
                      value={linkCode}
                      onChange={(e) => setLinkCode(e.target.value)}
                      className="h-8 mt-1 text-xs border-slate-700 bg-slate-800 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase">Link URL</label>
                    <Input
                      placeholder="https://..."
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      className="h-8 mt-1 text-xs border-slate-700 bg-slate-800 text-white"
                    />
                  </div>
                  <Button
                    onClick={handleAddLink}
                    className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700"
                    disabled={!linkCode || !linkUrl || saving}
                  >
                    <Save className="h-3.5 w-3.5 mr-1" />
                    Kaydet
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 px-2.5 border-slate-700 text-slate-400">
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="border-slate-700 bg-slate-900 max-w-sm">
                <DialogHeader>
                  <DialogTitle className="text-sm text-white">Toplu Ekle</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <Textarea
                    placeholder={`kod1 url1\nkod2 url2`}
                    value={bulkLinks}
                    onChange={(e) => setBulkLinks(e.target.value)}
                    className="h-32 text-xs border-slate-700 bg-slate-800 text-white"
                  />
                  <Button
                    onClick={handleBulkAdd}
                    className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700"
                    disabled={!bulkLinks.trim() || saving}
                  >
                    Ekle
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Links List */}
          <Card className="border-slate-700 bg-slate-900">
            <CardContent className="p-0">
              {filteredLinks.length === 0 ? (
                <div className="py-8 text-center">
                  <Link2 className="mx-auto h-8 w-8 text-slate-600" />
                  <p className="mt-2 text-xs text-slate-400">
                    {searchQuery ? "Sonuc yok" : "Link yok"}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700/50">
                  {filteredLinks.map((link, index) => (
                    <div
                      key={link.id}
                      className={`p-2.5 ${editState.id === link.id ? "bg-blue-900/20" : "hover:bg-slate-800/50"}`}
                    >
                      {editState.id === link.id ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              value={editState.link_code}
                              onChange={(e) => setEditState((prev) => ({ ...prev, link_code: e.target.value }))}
                              className="h-7 text-xs bg-slate-800 border-slate-600 text-white"
                              placeholder="Kod"
                            />
                            <Input
                              value={editState.link_url}
                              onChange={(e) => setEditState((prev) => ({ ...prev, link_url: e.target.value }))}
                              className="h-7 text-xs bg-slate-800 border-slate-600 text-white"
                              placeholder="URL"
                            />
                          </div>
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="ghost" onClick={cancelEditing} className="h-6 px-2 text-[10px] text-slate-400">
                              <X className="h-3 w-3 mr-0.5" />
                              Iptal
                            </Button>
                            <Button size="sm" onClick={saveEdit} disabled={saving} className="h-6 px-2 text-[10px] bg-green-600 hover:bg-green-700">
                              <Check className="h-3 w-3 mr-0.5" />
                              Kaydet
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 w-4">{index + 1}</span>
                          <Badge className="text-[10px] px-1.5 py-0 bg-blue-600/20 text-blue-400 border-blue-500/30 shrink-0">
                            {link.link_code}
                          </Badge>
                          <ArrowRight className="h-3 w-3 text-slate-600 shrink-0" />
                          <a
                            href={link.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-slate-400 hover:text-blue-400 truncate flex-1"
                          >
                            {link.link_url}
                          </a>
                          <div className="flex shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEditing(link)}
                              className="h-6 w-6 p-0 text-slate-500 hover:text-blue-400"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteLink(link.id)}
                              className="h-6 w-6 p-0 text-slate-500 hover:text-red-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
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
