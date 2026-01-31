"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminSidebar } from "@/components/admin-sidebar";

interface User {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
  isImpersonating?: boolean;
  realUser?: {
    id: number;
    username: string;
    role: string;
  };
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (data.user.role !== "superadmin") {
          router.push("/dashboard");
          return;
        }
        setUser(data.user);
      } catch (error) {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm text-slate-400">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <AdminSidebar user={user} />
      <main className="min-h-screen pt-20 px-4 pb-8 lg:pt-8 lg:pl-80 lg:pr-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
