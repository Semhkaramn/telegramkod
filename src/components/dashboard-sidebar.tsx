"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Radio,
  Link2,
  BarChart3,
  Settings,
  LogOut,
  ArrowLeft,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardSidebarProps {
  user: {
    id: number;
    username: string;
    displayName?: string | null;
    role: string;
  };
  isImpersonating?: boolean;
  realUser?: {
    id: number;
    username: string;
    role: string;
  } | null;
}

const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Link Ozellestirme",
    href: "/dashboard/links",
    icon: Link2,
  },
  {
    title: "Istatistikler",
    href: "/dashboard/stats",
    icon: BarChart3,
  },
  {
    title: "Ayarlar",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

export function DashboardSidebar({ user, isImpersonating, realUser }: DashboardSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const handleStopImpersonating = async () => {
    await fetch("/api/impersonate", { method: "DELETE" });
    router.push("/admin/users");
    router.refresh();
  };

  const SidebarContent = () => (
    <>
      {/* Header */}
      <div className="flex h-16 items-center border-b border-slate-700/50 px-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/20">
            <Radio className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-blue-300 bg-clip-text text-transparent">Bot Panel</span>
        </Link>
      </div>

      {/* Impersonation Banner */}
      {isImpersonating && realUser && (
        <div className="border-b border-amber-600/30 bg-amber-900/20 px-4 py-3">
          <p className="text-xs text-amber-400 mb-2">
            {user.displayName || user.username} olarak görüntülüyorsunuz
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full border-amber-600 text-amber-400 hover:bg-amber-900/30"
            onClick={handleStopImpersonating}
          >
            <ArrowLeft className="mr-2 h-3 w-3" />
            Kendi Panelime Dön
          </Button>
        </div>
      )}

      {/* User Info */}
      <div className="px-4 py-4 border-b border-slate-700/50">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30">
            <span className="text-sm font-semibold text-blue-400">
              {(user.displayName || user.username)[0].toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">
              {user.displayName || user.username}
            </p>
            <p className="text-xs text-slate-500">Üye Paneli</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Menü
        </p>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "text-white")} />
              {item.title}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-slate-700/50 p-4">
        <Button
          variant="ghost"
          className="w-full justify-start text-slate-400 hover:bg-red-500/10 hover:text-red-400 rounded-xl"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Çıkış Yap
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-slate-700/50 bg-slate-900/95 backdrop-blur px-4 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
            <Radio className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-white">Bot Panel</span>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-slate-400 hover:text-white"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-72 border-r border-slate-700/50 bg-slate-900 transform transition-transform duration-300 lg:hidden",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col pt-16">
          <SidebarContent />
        </div>
      </aside>

      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-72 border-r border-slate-700/50 bg-slate-900 lg:block">
        <div className="flex h-full flex-col">
          <SidebarContent />
        </div>
      </aside>
    </>
  );
}
