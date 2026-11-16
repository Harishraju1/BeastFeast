import type { Backend } from "./types";
import { LocalBackend } from "./local";

let backend: Backend | null = null;

/** Picks Supabase when its public URL + anon key are configured, otherwise the local (this-browser) backend. */
export async function getBackend(): Promise<Backend> {
  if (backend) return backend;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const { SupabaseBackend } = await import("./supabase");
    backend = new SupabaseBackend(url, key);
  } else {
    backend = new LocalBackend();
  }
  return backend;
}

export const BACKEND_MODE: "local" | "supabase" = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "supabase" : "local";
export * from "./types";
