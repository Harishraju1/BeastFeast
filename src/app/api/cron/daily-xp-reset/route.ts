import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Backup scheduler for the 11:15 PM IST daily XP reset (vercel.json: "45 17 * * *" = 17:45 UTC = 23:15 IST).
 * The primary scheduler is pg_cron inside Supabase (migration 0007). Both call reset_daily_xp(), which
 * re-baselines only the current XP day and only once (xp_reset_runs), so a duplicate, early or late call
 * cannot reset anything twice. If CRON_SECRET is set in Vercel, only Vercel's cron runner may call this.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "service not configured" }, { status: 500 });
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("reset_daily_xp", { p_trigger: "vercel-cron" });
  if (error) {
    console.error("daily XP reset failed", error.message); // details stay in the server log
    return NextResponse.json({ ok: false, error: "reset failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, profilesUpdated: data === -1 ? 0 : data, alreadyReset: data === -1, at: new Date().toISOString() });
}
