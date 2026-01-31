import { redirect } from "next/navigation";
import { getEffectiveUser } from "@/lib/auth";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getEffectiveUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <DashboardSidebar
        user={user}
        isImpersonating={user.isImpersonating}
        realUser={user.isImpersonating ? (user as any).realUser : null}
      />
      <main className="ml-64 min-h-screen p-8">
        {children}
      </main>
    </div>
  );
}
