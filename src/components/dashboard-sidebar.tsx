"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Radio,
  Link2,
  BarChart3,
  Settings,
  LogOut,
  ArrowLeft,
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
    title: "Link Özelleştirme",
    href: "/dashboard/links",
    icon: Link2,
  },
  {
    title: "İstatistikler",
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

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-zinc-800 bg-zinc-950">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex h-16 items-center border-b border-zinc-800 px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Radio className="h-6 w-6 text-emerald-500" />
            <span className="text-lg font-semibold text-white">Bot Panel</span>
          </Link>
        </div>

        {/* Impersonation Banner */}
        {isImpersonating && realUser && (
          <div className="border-b border-amber-600/30 bg-amber-900/20 px-4 py-3">
            <p className="text-xs text-amber-400 mb-2">
              {user.displayName || user.username} olarak goruntuluyorsunuz
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full border-amber-600 text-amber-400 hover:bg-amber-900/30"
              onClick={handleStopImpersonating}
            >
              <ArrowLeft className="mr-2 h-3 w-3" />
              Kendi Panelime Don
            </Button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.title}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="border-t border-zinc-800 p-4">
          <Button
            variant="ghost"
            className="w-full justify-start text-zinc-400 hover:bg-zinc-800 hover:text-white"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cikis Yap
          </Button>
        </div>
      </div>
    </aside>
  );
}
