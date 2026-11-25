import { describe, expect, it } from "vitest";
import { EMAIL_LIMIT_REACHED, TEMPORARILY_UNAVAILABLE, friendlyError } from "@/lib/data/supabase";

describe("user-facing error messages never expose infrastructure", () => {
  it.each([
    "canceling statement due to statement timeout",
    "PGRST003 Timed out acquiring connection from connection pool.",
    "upstream connect error or disconnect/reset before headers. reset reason: connection termination",
    "<!DOCTYPE html><html><head><title>502 Bad Gateway</title>",
    'relation "public.projects" does not exist',
    'new row for relation "projects" violates check constraint "x"',
  ])("%s → temporarily unavailable", (raw) => {
    expect(friendlyError(raw)).toBe(TEMPORARILY_UNAVAILABLE);
  });

  it("the shared email allowance gets an honest message", () => {
    expect(friendlyError("email rate limit exceeded")).toBe(EMAIL_LIMIT_REACHED);
    expect(friendlyError("over_email_send_rate_limit")).toBe(EMAIL_LIMIT_REACHED);
  });

  it("messages written for students by our own database functions pass through", () => {
    expect(friendlyError("Invalid NIAT ID. Use the format NXXH01XXXXX, e.g. N24H0100001.")).toMatch(/NIAT ID/);
    expect(friendlyError("Too many requests — please wait a few minutes and try again.")).toMatch(/wait/);
  });

  it("no message mentions a provider", () => {
    for (const m of [TEMPORARILY_UNAVAILABLE, EMAIL_LIMIT_REACHED]) expect(m).not.toMatch(/supabase|vercel|postgres|render|neon/i);
  });
});
