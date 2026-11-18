/**
 * Sign-up and profile field rules. The database enforces the same rules (migration 0010), so these exist
 * for instant feedback in the form and for local mode — they are not the security boundary.
 */

/** Official NIAT student ID: N + 2 digits + H01 + 5 digits, e.g. N24H0100001. */
export const NIAT_ID_RE = /^N\d{2}H01\d{5}$/;
export const NIAT_ID_EXAMPLE = "N24H0100001";

/** Uppercase and remove spaces (users often type "n24h01 00001"). */
export function normalizeNiatId(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function niatIdError(raw: string): string | null {
  const v = normalizeNiatId(raw);
  if (!v) return "Enter your NIAT ID.";
  if (!NIAT_ID_RE.test(v)) return `Use the format NXXH01XXXXX, e.g. ${NIAT_ID_EXAMPLE}.`;
  return null;
}

export const COUNTRY_CODE = "+91";

/** Digits only, without the +91 / leading 0 people sometimes type. Returns the 10-digit national number. */
export function nationalMobileDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

/** Indian mobile numbers are 10 digits starting with 6, 7, 8 or 9. */
export function mobileError(raw: string): string | null {
  const d = nationalMobileDigits(raw);
  if (!d) return "Enter your mobile number.";
  if (!/^[6-9]\d{9}$/.test(d)) return "Enter a valid 10-digit Indian mobile number (starts with 6, 7, 8 or 9).";
  return null;
}

/** Stored format: +919876543210 */
export function toE164India(raw: string): string {
  return COUNTRY_CODE + nationalMobileDigits(raw);
}

/** +919876543210 → +91 98765 43210 */
export function formatIndianMobile(e164: string | null | undefined): string {
  if (!e164) return "—";
  const d = e164.replace(/^\+91/, "");
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : e164;
}

export function passwordError(pw: string, confirm?: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use letters and at least one number.";
  if (confirm !== undefined && pw !== confirm) return "The passwords do not match.";
  return null;
}

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Checks the file's first bytes, not just its name or browser-reported type. */
export async function sniffImageType(file: Blob): Promise<(typeof AVATAR_TYPES)[number] | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export async function avatarFileError(file: File): Promise<string | null> {
  if (file.size > AVATAR_MAX_BYTES) return "The picture must be 5 MB or smaller.";
  if (!(await sniffImageType(file))) return "Choose a JPEG, PNG or WebP image.";
  return null;
}
