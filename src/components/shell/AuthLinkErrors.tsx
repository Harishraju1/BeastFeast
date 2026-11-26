"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Email links (sign-up confirmation, password reset) that have expired or were already used come back with
 * the error in the URL hash (#error=access_denied&error_code=otp_expired …), possibly on any page.
 * Send the student to the sign-in page, which explains what happened and offers to resend the email.
 */
export function AuthLinkErrors() {
  const router = useRouter();
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const code = hash.get("error_code") ?? (hash.get("error") ? "invalid_link" : null);
    if (!code) return;
    router.replace(`/login?link_error=${encodeURIComponent(code.slice(0, 40))}`);
  }, [router]);
  return null;
}
