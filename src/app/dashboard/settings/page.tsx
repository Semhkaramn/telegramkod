"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Lock, User, Check, X } from "lucide-react";

interface UserProfile {
  id: number;
  username: string;
  role: string;
}

export default function SettingsPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await fetch("/api/auth/me");
      if (response.ok) {
        const data = await response.json();
        const userData = data.user || data;
        setUser(userData);
      }
    } catch (error) {
      console.error("Error fetching user:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!user) return;

    if (newPassword !== confirmPassword) {
      setPasswordError("Yeni sifreler eslesmiyor");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("Sifre en az 6 karakter olmali");
      return;
    }

    setPasswordSaving(true);
    setPasswordError("");
    setPasswordSuccess(false);

    try {
      const response = await fetch(`/api/users/${user.id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (response.ok) {
        setPasswordSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPasswordSuccess(false), 3000);
      } else {
        const data = await response.json();
        setPasswordError(data.error || "Sifre degistirilemedi");
      }
    } catch (error) {
      setPasswordError("Bir hata olustu");
    } finally {
      setPasswordSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 bg-zinc-800" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64 bg-zinc-800" />
          <Skeleton className="h-64 bg-zinc-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Ayarlar</h1>
        <p className="text-zinc-400">Hesap ayarlarinizi yonetin</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Account Info */}
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <User className="h-5 w-5 text-emerald-500" />
              Hesap Bilgileri
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-sm text-zinc-500">Kullanici Adi</p>
              <p className="text-lg font-medium text-white">
                @{user?.username}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-sm text-zinc-500">Hesap Tipi</p>
              <p className="text-lg font-medium text-white">
                Kullanici
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Password Settings */}
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Lock className="h-5 w-5 text-emerald-500" />
              Sifre Degistir
            </CardTitle>
            <CardDescription className="text-zinc-500">
              Hesabinizin sifresini guncelleyin
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400">Mevcut Sifre</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Mevcut sifrenizi girin"
                className="mt-1 border-zinc-700 bg-zinc-800 text-white"
              />
            </div>

            <div>
              <label className="text-sm text-zinc-400">Yeni Sifre</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Yeni sifrenizi girin"
                className="mt-1 border-zinc-700 bg-zinc-800 text-white"
              />
            </div>

            <div>
              <label className="text-sm text-zinc-400">
                Yeni Sifre (Tekrar)
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Yeni sifrenizi tekrar girin"
                className="mt-1 border-zinc-700 bg-zinc-800 text-white"
              />
            </div>

            {passwordError && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <X className="h-4 w-4" />
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <Check className="h-4 w-4" />
                Sifre basariyla degistirildi
              </div>
            )}

            <Button
              onClick={handlePasswordChange}
              disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {passwordSaving ? (
                "Degistiriliyor..."
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Sifre Degistir
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
