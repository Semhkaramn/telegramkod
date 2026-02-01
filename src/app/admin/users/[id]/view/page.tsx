"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  User,
  Radio,
  Link2,
  Eye,
} from "lucide-react";

interface UserProfile {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
  createdAt: string;
}

interface Channel {
  channelId: string;
  channelName: string | null;
  channelPhoto: string | null;
  memberCount: number | null;
  isJoined: boolean;
}

interface UserChannel {
  id: number;
  channelId: string;
  paused: boolean;
  channel: Channel;
}

interface AdminLink {
  id: number;
  channel_id: string;
  link_code: string;
  link_url: string;
}

export default function ViewUserPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  const [user, setUser] = useState<UserProfile | null>(null);
  const [channels, setChannels] = useState<UserChannel[]>([]);
  const [links, setLinks] = useState<AdminLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      fetchData();
    }
  }, [userId]);

  const fetchData = async () => {
    try {
      const [userRes, channelsRes, linksRes] = await Promise.all([
        fetch(`/api/users/${userId}`),
        fetch(`/api/user-channels?userId=${userId}`),
        fetch(`/api/admin-links?user_id=${userId}`),
      ]);

      if (userRes.ok) {
        setUser(await userRes.json());
      }
      if (channelsRes.ok) {
        setChannels(await channelsRes.json());
      }
      if (linksRes.ok) {
        setLinks(await linksRes.json());
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImpersonate = async () => {
    try {
      const response = await fetch("/api/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: parseInt(userId) }),
      });

      if (response.ok) {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (error) {
      console.error("Error impersonating:", error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 bg-zinc-800" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 bg-zinc-800" />
          ))}
        </div>
        <Skeleton className="h-64 bg-zinc-800" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-400">Kullanici bulunamadi</p>
        <Button
          variant="outline"
          className="mt-4 border-zinc-700"
          onClick={() => router.push("/admin/users")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Geri Don
        </Button>
      </div>
    );
  }

  const activeChannels = channels.filter((c) => !c.paused).length;
  const pausedChannels = channels.filter((c) => c.paused).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700"
            onClick={() => router.push("/admin/users")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Geri
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <User className="h-6 w-6 text-emerald-500" />
              {user.displayName || user.username}
            </h1>
            <p className="text-zinc-400">@{user.username}</p>
          </div>
        </div>
        <Button
          onClick={handleImpersonate}
          className="bg-amber-600 hover:bg-amber-700"
        >
          <Eye className="mr-2 h-4 w-4" />
          Paneli Goruntule
        </Button>
      </div>

      {/* User Info */}
      <Card className="border-zinc-800 bg-zinc-900">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-sm text-zinc-500">Kullanici Adi</p>
              <p className="text-lg font-medium text-white">@{user.username}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-sm text-zinc-500">Rol</p>
              <Badge
                className={
                  user.role === "superadmin"
                    ? "bg-amber-600"
                    : "bg-emerald-600"
                }
              >
                {user.role === "superadmin" ? "Super Admin" : "Kullanici"}
              </Badge>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-sm text-zinc-500">Kanal Sayisi</p>
              <p className="text-lg font-medium text-white">
                {channels.length}{" "}
                <span className="text-sm text-zinc-500">
                  ({activeChannels} aktif)
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-sm text-zinc-500">Link Sayisi</p>
              <p className="text-lg font-medium text-white">{links.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400">Toplam Kanal</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">{channels.length}</p>
            <p className="text-xs text-zinc-500">kanal atandi</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400">Aktif Kanal</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-400">{activeChannels}</p>
            <p className="text-xs text-zinc-500">kanal aktif</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400">Durdurulmus</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-400">{pausedChannels}</p>
            <p className="text-xs text-zinc-500">kanal durduruldu</p>
          </CardContent>
        </Card>
      </div>

      {/* Channels */}
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Radio className="h-5 w-5 text-emerald-500" />
            Atanan Kanallar
            <Badge variant="secondary" className="ml-2 bg-zinc-800">
              {channels.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {channels.length === 0 ? (
            <p className="text-center py-4 text-zinc-500">
              Henuz kanal atanmamis
            </p>
          ) : (
            <div className="space-y-3">
              {channels.map((uc) => (
                <div
                  key={uc.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        uc.paused ? "bg-red-500" : "bg-emerald-500"
                      }`}
                    />
                    <div>
                      <p className="font-medium text-white">
                        {uc.channel.channelName || `Kanal ${uc.channelId}`}
                      </p>
                      <p className="text-xs text-zinc-500">ID: {uc.channelId}</p>
                    </div>
                  </div>
                  <Badge
                    variant={uc.paused ? "destructive" : "default"}
                    className={uc.paused ? "" : "bg-emerald-600"}
                  >
                    {uc.paused ? "Durduruldu" : "Aktif"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Links */}
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Link2 className="h-5 w-5 text-emerald-500" />
            Link Ozellestirmeleri
            <Badge variant="secondary" className="ml-2 bg-zinc-800">
              {links.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="text-center py-4 text-zinc-500">
              Henuz link eklenmemis
            </p>
          ) : (
            <div className="space-y-2">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3"
                >
                  <Badge className="bg-emerald-600/20 text-emerald-400">
                    {link.link_code}
                  </Badge>
                  <span className="text-zinc-500">&rarr;</span>
                  <span className="text-sm text-zinc-400 truncate">
                    {link.link_url}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
