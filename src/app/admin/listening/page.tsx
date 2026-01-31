"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ListeningChannel {
  channel_id: string;
  channel_name: string | null;
}

export default function ListeningChannelsPage() {
  const [channels, setChannels] = useState<ListeningChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ListeningChannel | null>(null);
  const [formData, setFormData] = useState({
    channel_id: "",
    channel_name: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchChannels();
  }, []);

  const fetchChannels = async () => {
    try {
      const res = await fetch("/api/listening-channels");
      if (res.ok) {
        setChannels(await res.json());
      }
    } catch (error) {
      console.error("Error fetching channels:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const method = editingChannel ? "PATCH" : "POST";
      const res = await fetch("/api/listening-channels", {
        method,
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
      setEditingChannel(null);
      setFormData({
        channel_id: "",
        channel_name: "",
      });
      fetchChannels();
    } catch (error) {
      setError("Baglantı hatası");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (channel: ListeningChannel) => {
    setEditingChannel(channel);
    setFormData({
      channel_id: channel.channel_id,
      channel_name: channel.channel_name || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (channelId: string) => {
    if (!confirm("Bu dinleme kanalını silmek istediginizden emin misiniz?")) return;

    try {
      const res = await fetch(`/api/listening-channels?channel_id=${channelId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchChannels();
      }
    } catch (error) {
      console.error("Error deleting channel:", error);
    }
  };

  const openNewDialog = () => {
    setEditingChannel(null);
    setFormData({
      channel_id: "",
      channel_name: "",
    });
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
          <h1 className="text-2xl font-bold text-zinc-100">Dinleme Kanalları</h1>
          <p className="text-zinc-400">Kod kaynaklarını yonetin</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
              </svg>
              Yeni Dinleme Kanalı
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">
                {editingChannel ? "Dinleme Kanalını Duzenle" : "Yeni Dinleme Kanalı"}
              </DialogTitle>
              <DialogDescription className="text-zinc-400">
                Kod dinlenecek kanal bilgilerini girin
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
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
                  disabled={!!editingChannel}
                />
                <p className="text-xs text-zinc-500">Telegram kanal ID'si (ör: -1001234567890)</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Kanal Adı</label>
                <Input
                  value={formData.channel_name}
                  onChange={(e) => setFormData({ ...formData, channel_name: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                  placeholder="Kaynak Kanal"
                />
                <p className="text-xs text-zinc-500">Kanalı tanımlamak için bir isim (isteğe bağlı)</p>
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
                  {submitting ? "Kaydediliyor..." : editingChannel ? "Guncelle" : "Ekle"}
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
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                </svg>
              </div>
              <p className="text-zinc-500">Henuz dinleme kanalı yok</p>
              <p className="text-sm text-zinc-600 mt-1">Kodların dinlenecegi kanalları ekleyin</p>
            </CardContent>
          </Card>
        ) : (
          channels.map((channel) => (
            <Card key={channel.channel_id} className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
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
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(channel)}
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                    >
                      Duzenle
                    </Button>
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
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
