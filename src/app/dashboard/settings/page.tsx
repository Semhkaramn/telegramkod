"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, Check, X, Settings } from "lucide-react";

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
      setPasswordError("Yeni şifreler eşleşmiyor");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("Şifre en az 6 karakter olmalı");
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
        setPasswordError(data.error || "Şifre değiştirilemedi");
      }
    } catch (error) {
      setPasswordError("Bir hata oluştu");
    } finally {
      setPasswordSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 bg-slate-800" />
        <Skeleton className="h-64 bg-slate-800 max-w-md mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="h-7 w-7 text-blue-500" />
          Ayarlar
        </h1>
        <p className="text-slate-400 mt-1">Şifrenizi değiştirin</p>
      </div>

      <div className="max-w-md">
        {/* Password Settings */}
        <Card className="border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Lock className="h-5 w-5 text-blue-500" />
              Şifre Değiştir
            </CardTitle>
            <CardDescription className="text-slate-500">
              Hesabınızın şifresini güncelleyin
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-slate-400">Mevcut Şifre</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Mevcut şifrenizi girin"
                className="mt-1 border-slate-700 bg-slate-800 text-white focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-sm text-slate-400">Yeni Şifre</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Yeni şifrenizi girin"
                className="mt-1 border-slate-700 bg-slate-800 text-white focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-sm text-slate-400">
                Yeni Şifre (Tekrar)
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Yeni şifrenizi tekrar girin"
                className="mt-1 border-slate-700 bg-slate-800 text-white focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {passwordError && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <X className="h-4 w-4" />
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="flex items-center gap-2 text-sm text-blue-400">
                <Check className="h-4 w-4" />
                Şifre başarıyla değiştirildi
              </div>
            )}

            <Button
              onClick={handlePasswordChange}
              disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-lg shadow-blue-500/25"
            >
              {passwordSaving ? (
                "Değiştiriliyor..."
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Şifre Değiştir
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
