import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Role } from "@/lib/types";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const SUPABASE_CONFIGURED = Boolean(URL_ && KEY);

/**
 * Supabase client for Server Components, bound to the request's auth cookies.
 * Uses only the public (publishable/anon) key — every query still goes through RLS as the signed-in user.
 * The secret key is never used by the web app.
 */
export async function serverSupabase() {
  const store = await cookies();
  return createServerClient(URL_!, KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; src/proxy.ts refreshes the session before /admin renders.
        }
      },
    },
  });
}

/** Verifies the session with Supabase Auth (not just the cookie) and reads the user's role from the database. */
export async function getServerSession(): Promise<{ userId: string | null; role: Role | null }> {
  const sb = await serverSupabase();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return { userId: null, role: null };
  const { data: profile } = await sb.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return { userId: data.user.id, role: (profile?.role as Role | undefined) ?? null };
}
