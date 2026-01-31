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
import { Headphones, Plus } from "lucide-react";

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
        setError(data.error || "Bir hata oluştu");
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
      setError("Bağlantı hatası");
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
    if (!confirm("Bu dinleme kanalını silmek istediğinizden emin misiniz?")) return;

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
            <Headphones className="h-7 w-7 text-blue-500" />
            Dinleme Kanalları
          </h1>
          <p className="text-slate-400 mt-1">Kod kaynaklarını yönetin</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-lg shadow-blue-500/25">
              <Plus className="mr-2 h-4 w-4" />
              Yeni Dinleme Kanalı
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-slate-100">
                {editingChannel ? "Dinleme Kanalını Düzenle" : "Yeni Dinleme Kanalı"}
              </DialogTitle>
              <DialogDescription className="text-slate-400">
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
                <label className="text-sm font-medium text-slate-300">Kanal ID</label>
                <Input
                  value={formData.channel_id}
                  onChange={(e) => setFormData({ ...formData, channel_id: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500"
                  placeholder="-1001234567890"
                  required
                  disabled={!!editingChannel}
                />
                <p className="text-xs text-slate-500">Telegram kanal ID'si (ör: -1001234567890)</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Kanal Adı</label>
                <Input
                  value={formData.channel_name}
                  onChange={(e) => setFormData({ ...formData, channel_name: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500"
                  placeholder="Kaynak Kanal"
                />
                <p className="text-xs text-slate-500">Kanalı tanımlamak için bir isim (isteğe bağlı)</p>
              </div>
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
                  disabled={submitting}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white"
                >
                  {submitting ? "Kaydediliyor..." : editingChannel ? "Güncelle" : "Ekle"}
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
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <Headphones className="h-8 w-8 text-slate-500" />
              </div>
              <p className="text-slate-500">Henüz dinleme kanalı yok</p>
              <p className="text-sm text-slate-600 mt-1">Kodların dinleneceği kanalları ekleyin</p>
            </CardContent>
          </Card>
        ) : (
          channels.map((channel) => (
            <Card key={channel.channel_id} className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                      <Headphones className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <CardTitle className="text-slate-100 text-lg">
                        {channel.channel_name || `Kanal ${channel.channel_id}`}
                      </CardTitle>
                      <CardDescription className="text-slate-500">
                        ID: {channel.channel_id}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(channel)}
                      className="border-slate-700 text-slate-300 hover:bg-slate-700"
                    >
                      Düzenle
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
