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
    <div className="min-h-screen bg-slate-950">
      <DashboardSidebar
        user={user}
        isImpersonating={user.isImpersonating}
        realUser={user.isImpersonating ? (user as any).realUser : null}
      />
      <main className="min-h-screen pt-20 px-4 pb-8 lg:pt-8 lg:pl-80 lg:pr-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
