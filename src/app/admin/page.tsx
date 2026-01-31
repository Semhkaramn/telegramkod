"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Stats {
  users: number;
  channels: { total: number; active: number; paused: number };
  listeningChannels: number;
  codes: { daily: number; weekly: number; monthly: number };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [statsRes, usersRes] = await Promise.all([
          fetch("/api/stats"),
          fetch("/api/users"),
        ]);

        const statsData = statsRes.ok ? await statsRes.json() : null;
        const usersData = usersRes.ok ? await usersRes.json() : [];

        setStats({
          users: Array.isArray(usersData) ? usersData.length : 0,
          channels: statsData?.channels || { total: 0, active: 0, paused: 0 },
          listeningChannels: statsData?.listeningChannels || 0,
          codes: statsData?.codes || { daily: 0, weekly: 0, monthly: 0 },
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 bg-zinc-800" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 bg-zinc-800" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 bg-zinc-800" />
          <Skeleton className="h-64 bg-zinc-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <p className="text-zinc-400">Sistem genel gorunumu</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-zinc-400">Kullanıcılar</CardDescription>
            <CardTitle className="text-3xl text-zinc-100">{stats?.users || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-500">Toplam kayıtlı kullanıcı</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-zinc-400">Kanallar</CardDescription>
            <CardTitle className="text-3xl text-zinc-100">{stats?.channels.total || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 text-sm">
              <span className="text-emerald-400">{stats?.channels.active || 0} Aktif</span>
              <span className="text-amber-400">{stats?.channels.paused || 0} Durduruldu</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-zinc-400">Dinleme Kanalları</CardDescription>
            <CardTitle className="text-3xl text-zinc-100">{stats?.listeningChannels || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-500">Kaynak kanallar</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-zinc-400">Bugun Gonderilen</CardDescription>
            <CardTitle className="text-3xl text-zinc-100">{stats?.codes.daily || 0}</CardTitle>
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

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Hızlı Islemler</CardTitle>
            <CardDescription className="text-zinc-400">Sık kullanılan islemler</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <a
              href="/admin/users"
              className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center group-hover:bg-zinc-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" x2="19" y1="8" y2="14" />
                  <line x1="22" x2="16" y1="11" y2="11" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-zinc-100">Yeni Kullanıcı Ekle</p>
                <p className="text-sm text-zinc-500">Sisteme yeni kullanıcı ekle</p>
              </div>
            </a>
            <a
              href="/admin/channels"
              className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center group-hover:bg-zinc-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300">
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-zinc-100">Kanal Yonetimi</p>
                <p className="text-sm text-zinc-500">Hedef kanalları yonet</p>
              </div>
            </a>
            <a
              href="/admin/listening"
              className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center group-hover:bg-zinc-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-zinc-100">Dinleme Kanalları</p>
                <p className="text-sm text-zinc-500">Kod kaynaklarını yonet</p>
              </div>
            </a>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Sistem Durumu</CardTitle>
            <CardDescription className="text-zinc-400">Bot ve sistem bilgileri</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-zinc-300">Bot Durumu</span>
              </div>
              <span className="text-emerald-400 font-medium">Aktif</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-zinc-300">Veritabanı</span>
              </div>
              <span className="text-emerald-400 font-medium">Baglı</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-zinc-500" />
                <span className="text-zinc-300">Son Guncelleme</span>
              </div>
              <span className="text-zinc-400 text-sm">{new Date().toLocaleString("tr-TR")}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
