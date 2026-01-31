"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface User {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
  isBanned: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
  botEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  _count: {
    channels: number;
    adminLinks: number;
  };
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [banReason, setBanReason] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    displayName: "",
    role: "user",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : "/api/users";
      const method = editingUser ? "PATCH" : "POST";

      const body: Record<string, string> = {
        username: formData.username,
        displayName: formData.displayName || formData.username,
        role: formData.role,
      };

      if (formData.password) {
        body.password = formData.password;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Bir hata olustu");
        setSubmitting(false);
        return;
      }

      setDialogOpen(false);
      setEditingUser(null);
      setFormData({ username: "", password: "", displayName: "", role: "user" });
      fetchUsers();
    } catch (error) {
      setError("Baglantı hatası");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: "",
      displayName: user.displayName || "",
      role: user.role,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (userId: number) => {
    if (!confirm("Bu kullanıcıyı silmek istediginizden emin misiniz?")) return;

    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  };

  const handleToggleBotEnabled = async (user: User) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botEnabled: !user.botEnabled }),
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error toggling bot:", error);
    }
  };

  const handleBanUser = async () => {
    if (!selectedUser) return;

    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isBanned: true,
          bannedReason: banReason || "Sebep belirtilmedi"
        }),
      });
      if (res.ok) {
        setBanDialogOpen(false);
        setSelectedUser(null);
        setBanReason("");
        fetchUsers();
      }
    } catch (error) {
      console.error("Error banning user:", error);
    }
  };

  const handleUnbanUser = async (user: User) => {
    if (!confirm(`${user.displayName || user.username} kullanıcısının banını kaldırmak istediginizden emin misiniz?`)) return;

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBanned: false }),
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error unbanning user:", error);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error toggling active:", error);
    }
  };

  const openNewUserDialog = () => {
    setEditingUser(null);
    setFormData({ username: "", password: "", displayName: "", role: "user" });
    setError("");
    setDialogOpen(true);
  };

  const openBanDialog = (user: User) => {
    setSelectedUser(user);
    setBanReason("");
    setBanDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 bg-zinc-800" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 bg-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Kullanıcılar</h1>
          <p className="text-zinc-400">Sistem kullanıcılarını yonetin</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewUserDialog} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" x2="19" y1="8" y2="14" />
                <line x1="22" x2="16" y1="11" y2="11" />
              </svg>
              Yeni Kullanıcı
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">
                {editingUser ? "Kullanıcıyı Duzenle" : "Yeni Kullanıcı"}
              </DialogTitle>
              <DialogDescription className="text-zinc-400">
                {editingUser ? "Kullanıcı bilgilerini guncelleyin" : "Yeni bir kullanıcı ekleyin"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Kullanıcı Adı</label>
                <Input
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">
                  Sifre {editingUser && <span className="text-zinc-500">(bos bırakın degistirmemek icin)</span>}
                </label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                  required={!editingUser}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Gorunen Ad</label>
                <Input
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                  placeholder={formData.username || "Opsiyonel"}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Rol</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full h-10 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-100 px-3"
                >
                  <option value="user">Kullanıcı</option>
                  <option value="superadmin">Super Admin</option>
                </select>
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
                  {submitting ? "Kaydediliyor..." : editingUser ? "Guncelle" : "Olustur"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Ban Dialog */}
      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Kullanıcıyı Banla</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {selectedUser?.displayName || selectedUser?.username} kullanıcısını banlamak uzeresiniz.
              Banlanan kullanıcı giris yapamaz ve kanallarına kod gonderilmez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Ban Sebebi (Opsiyonel)</label>
              <Input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
                placeholder="Ornek: Kural ihlali"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBanDialogOpen(false)}
                className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                Iptal
              </Button>
              <Button
                onClick={handleBanUser}
                className="flex-1 bg-red-600 text-white hover:bg-red-700"
              >
                Banla
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100">Kullanıcı Listesi</CardTitle>
          <CardDescription className="text-zinc-400">
            Toplam {users.length} kullanıcı |
            {" "}{users.filter(u => u.botEnabled && !u.isBanned).length} aktif bot |
            {" "}{users.filter(u => u.isBanned).length} banlı
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users.length === 0 ? (
              <p className="text-zinc-500 text-center py-8">Henuz kullanıcı yok</p>
            ) : (
              users.map((user) => (
                <div
                  key={user.id}
                  className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                    user.isBanned
                      ? "bg-red-500/10 border border-red-500/20"
                      : "bg-zinc-800/50 hover:bg-zinc-800"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                      user.isBanned
                        ? "bg-red-500/20 text-red-400"
                        : "bg-zinc-700 text-zinc-300"
                    }`}>
                      {user.displayName?.[0]?.toUpperCase() || user.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-zinc-100">{user.displayName || user.username}</p>
                        <Badge
                          variant={user.role === "superadmin" ? "default" : "secondary"}
                          className={user.role === "superadmin" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-zinc-700 text-zinc-300"}
                        >
                          {user.role === "superadmin" ? "Super Admin" : "Kullanıcı"}
                        </Badge>
                        {user.isBanned && (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                            Banlı
                          </Badge>
                        )}
                        {!user.isActive && !user.isBanned && (
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                            Pasif
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-zinc-500">@{user.username}</p>
                      {user.isBanned && user.bannedReason && (
                        <p className="text-xs text-red-400 mt-1">Sebep: {user.bannedReason}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Bot Toggle */}
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs text-zinc-500">Bot</span>
                      <Switch
                        checked={user.botEnabled}
                        onCheckedChange={() => handleToggleBotEnabled(user)}
                        disabled={user.isBanned || user.role === "superadmin"}
                        className="data-[state=checked]:bg-green-600"
                      />
                    </div>

                    {/* Stats */}
                    <div className="text-right">
                      <p className="text-sm text-zinc-400">{user._count.channels} Kanal</p>
                      <p className="text-xs text-zinc-500">{user._count.adminLinks} Link</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {/* Active Toggle */}
                      {!user.isBanned && user.role !== "superadmin" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleActive(user)}
                          className={user.isActive
                            ? "border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                            : "border-green-500/30 text-green-400 hover:bg-green-500/10"
                          }
                          title={user.isActive ? "Pasif Yap" : "Aktif Yap"}
                        >
                          {user.isActive ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="4" y1="4" x2="20" y2="20" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </Button>
                      )}

                      {/* Edit */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(user)}
                        className="border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          <path d="m15 5 4 4" />
                        </svg>
                      </Button>

                      {/* Ban/Unban */}
                      {user.role !== "superadmin" && (
                        user.isBanned ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnbanUser(user)}
                            className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                            title="Banı Kaldır"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                              <path d="m9 12 2 2 4-4" />
                            </svg>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openBanDialog(user)}
                            className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                            title="Banla"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                            </svg>
                          </Button>
                        )
                      )}

                      {/* Delete */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(user.id)}
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100 text-lg">Bilgi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-400">
          <p><strong className="text-zinc-200">Bot Switch:</strong> Kullanıcının botunu ac/kapat. Kapalıyken kullanıcının kanallarına kod gonderilmez.</p>
          <p><strong className="text-zinc-200">Pasif Yap:</strong> Kullanıcı giris yapabilir ama bot calısmaz.</p>
          <p><strong className="text-zinc-200">Banla:</strong> Kullanıcı giris yapamaz ve bot calısmaz. Tum kanallar otomatik durdurulur.</p>
          <p><strong className="text-zinc-200">Not:</strong> Yeni kullanıcı olusturulduğunda bot varsayılan olarak KAPALI baslar. Manuel olarak acmanız gerekir.</p>
        </CardContent>
      </Card>
    </div>
  );
}
