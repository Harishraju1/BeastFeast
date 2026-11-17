import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { SUPABASE_CONFIGURED, getServerSession } from "@/lib/supabase/server";
import { isStaff } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * Server-side gate for the admin dashboard (cloud mode).
 * The role is read from the database on the server for every request, so hiding links or editing
 * browser state cannot open /admin. In local mode there is no server-side data, so the page's own
 * client check applies (local mode is single-device and documented as not tamper-proof).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!SUPABASE_CONFIGURED) return <>{children}</>;
  const { userId, role } = await getServerSession();
  if (!userId) redirect("/login?next=/admin");
  if (!isStaff(role)) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6">
        <div className="bf-panel max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 text-accent-ink" size={36} />
          <h1 className="font-display text-2xl font-bold">Access denied</h1>
          <p className="mt-2 text-sm text-muted">The admin dashboard is only available to BEAST FEAST administrators. If you need access, ask the club&apos;s Super Admin.</p>
          <Link href="/" className="mt-5 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover">
            Back to Command Center
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
