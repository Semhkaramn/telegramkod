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
import { useRouter } from "next/navigation";
import { UserPlus, Edit2, Trash2, Ban, CheckCircle, LogIn, Power, Eye, EyeOff, Users, Search } from "lucide-react";

interface User {
  id: number;
  username: string;
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
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [banReason, setBanReason] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
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
        setError(data.error || "Bir hata oluştu");
        setSubmitting(false);
        return;
      }

      setDialogOpen(false);
      setEditingUser(null);
      setFormData({ username: "", password: "" });
      fetchUsers();
    } catch (error) {
      setError("Bağlantı hatası");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: "",
    });
    setShowPassword(true);
    setDialogOpen(true);
  };

  const handleDelete = async (userId: number) => {
    if (!confirm("Bu kullanıcıyı silmek istediğinizden emin misiniz?")) return;

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
    if (!confirm(`${user.username} kullanıcısının banını kaldırmak istediğinizden emin misiniz?`)) return;

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
    setFormData({ username: "", password: "" });
    setError("");
    setShowPassword(true);
    setDialogOpen(true);
  };

  const openBanDialog = (user: User) => {
    setSelectedUser(user);
    setBanReason("");
    setBanDialogOpen(true);
  };

  const handleImpersonate = async (user: User) => {
    try {
      const res = await fetch("/api/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: user.id }),
      });

      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Panele giriş yapılamadı");
      }
    } catch (error) {
      console.error("Error impersonating user:", error);
      alert("Bir hata oluştu");
    }
  };

  const filteredUsers = users
    .filter(u => u.role !== "superadmin")
    .filter(u =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 bg-slate-800" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
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
            <Users className="h-7 w-7 text-blue-500" />
            Kullanıcılar
          </h1>
          <p className="text-slate-400 mt-1">Sistem kullanıcılarını yönetin</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewUserDialog} className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-lg shadow-blue-500/25">
              <UserPlus className="mr-2 h-4 w-4" />
              Yeni Kullanıcı
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-white">
                {editingUser ? "Kullanıcıyı Düzenle" : "Yeni Kullanıcı"}
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                {editingUser ? "Kullanıcı bilgilerini güncelleyin" : "Yeni bir kullanıcı ekleyin"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Kullanıcı Adı</label>
                <Input
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:ring-blue-500/20"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">
                  Şifre {editingUser && <span className="text-slate-500">(boş bırakın değiştirmemek için)</span>}
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white pr-10 focus:border-blue-500 focus:ring-blue-500/20"
                    required={!editingUser}
                    placeholder={showPassword ? "Şifre girin" : "••••••••"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-blue-400">
                  Şifreyi görmek/gizlemek için göz ikonuna tıklayın
                </p>
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
                  {submitting ? "Kaydediliyor..." : editingUser ? "Güncelle" : "Oluştur"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Kullanıcı ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-slate-900 border-slate-700 text-white focus:border-blue-500"
        />
      </div>

      {/* Ban Dialog */}
      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Kullanıcıyı Banla</DialogTitle>
            <DialogDescription className="text-slate-400">
              {selectedUser?.username} kullanıcısını banlamak üzeresiniz.
              Banlanan kullanıcı giriş yapamaz ve kanallarına kod gönderilmez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Ban Sebebi (Opsiyonel)</label>
              <Input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
                placeholder="Örnek: Kural ihlali"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBanDialogOpen(false)}
                className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                İptal
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-white">{filteredUsers.length}</div>
            <p className="text-sm text-slate-400">Toplam Kullanıcı</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-900/30 to-slate-800 border-green-700/30">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-400">
              {users.filter(u => u.botEnabled && !u.isBanned && u.role !== "superadmin").length}
            </div>
            <p className="text-sm text-slate-400">Aktif Bot</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-900/30 to-slate-800 border-yellow-700/30">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-400">
              {users.filter(u => !u.isActive && !u.isBanned && u.role !== "superadmin").length}
            </div>
            <p className="text-sm text-slate-400">Pasif</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-900/30 to-slate-800 border-red-700/30">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-400">
              {users.filter(u => u.isBanned).length}
            </div>
            <p className="text-sm text-slate-400">Banlı</p>
          </CardContent>
        </Card>
      </div>

      {/* User List */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Kullanıcı Listesi</CardTitle>
          <CardDescription className="text-slate-400">
            {filteredUsers.length} kullanıcı gösteriliyor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredUsers.length === 0 ? (
              <p className="text-slate-500 text-center py-8">
                {searchQuery ? "Arama sonucu bulunamadı" : "Henüz kullanıcı yok"}
              </p>
            ) : (
              filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl transition-all duration-200 ${
                    user.isBanned
                      ? "bg-red-500/10 border border-red-500/20"
                      : "bg-slate-800/50 hover:bg-slate-800 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-medium text-lg ${
                      user.isBanned
                        ? "bg-red-500/20 text-red-400"
                        : "bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30 text-blue-400"
                    }`}>
                      {user.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-white">{user.username}</p>
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
                      <p className="text-sm text-slate-500">@{user.username}</p>
                      {user.isBanned && user.bannedReason && (
                        <p className="text-xs text-red-400 mt-1">Sebep: {user.bannedReason}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 lg:gap-6">
                    {/* Bot Toggle */}
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs text-slate-500">Bot</span>
                      <Switch
                        checked={user.botEnabled}
                        onCheckedChange={() => handleToggleBotEnabled(user)}
                        disabled={user.isBanned}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </div>

                    {/* Stats */}
                    <div className="text-right">
                      <p className="text-sm text-slate-400">{user._count.channels} Kanal</p>
                      <p className="text-xs text-slate-500">{user._count.adminLinks} Link</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                      {/* Active Toggle */}
                      {!user.isBanned && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleActive(user)}
                          className={user.isActive
                            ? "border-slate-600 text-slate-300 hover:bg-slate-700"
                            : "border-green-500/30 text-green-400 hover:bg-green-500/10"
                          }
                          title={user.isActive ? "Pasif Yap" : "Aktif Yap"}
                        >
                          {user.isActive ? <Power className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                        </Button>
                      )}

                      {/* Paneline Gir */}
                      {!user.isBanned && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleImpersonate(user)}
                          className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                          title="Paneline Gir"
                        >
                          <LogIn className="h-4 w-4" />
                        </Button>
                      )}

                      {/* Edit */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(user)}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                        title="Düzenle"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>

                      {/* Ban/Unban */}
                      {user.isBanned ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUnbanUser(user)}
                          className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                          title="Banı Kaldır"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openBanDialog(user)}
                          className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                          title="Banla"
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}

                      {/* Delete */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(user.id)}
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                        title="Sil"
                      >
                        <Trash2 className="h-4 w-4" />
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
      <Card className="bg-gradient-to-br from-blue-900/20 to-slate-900 border-blue-700/30">
        <CardHeader>
          <CardTitle className="text-white text-lg">Bilgi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-400">
          <div className="flex items-start gap-2">
            <LogIn className="h-4 w-4 text-blue-400 mt-0.5" />
            <p><strong className="text-slate-200">Paneline Gir:</strong> Kullanıcının panelini görüntüleyebilirsiniz. Kullanıcı gibi işlem yapabilirsiniz.</p>
          </div>
          <div className="flex items-start gap-2">
            <Power className="h-4 w-4 text-green-400 mt-0.5" />
            <p><strong className="text-slate-200">Bot Switch:</strong> Kullanıcının botunu aç/kapat. Kapalıyken kullanıcının kanallarına kod gönderilmez.</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-yellow-400 mt-0.5" />
            <p><strong className="text-slate-200">Pasif Yap:</strong> Kullanıcı giriş yapabilir ama bot çalışmaz.</p>
          </div>
          <div className="flex items-start gap-2">
            <Ban className="h-4 w-4 text-red-400 mt-0.5" />
            <p><strong className="text-slate-200">Banla:</strong> Kullanıcı giriş yapamaz ve bot çalışmaz. Tüm kanallar otomatik durdurulur.</p>
          </div>
          <div className="p-3 mt-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <p className="text-blue-300"><strong>Not:</strong> Yeni kullanıcı oluşturulduğunda bot varsayılan olarak KAPALI başlar. Manuel olarak açmanız gerekir.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
