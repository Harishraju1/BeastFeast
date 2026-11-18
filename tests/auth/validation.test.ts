import { describe, expect, it } from "vitest";
import { formatIndianMobile, mobileError, niatIdError, normalizeNiatId, passwordError, sniffImageType, toE164India } from "@/lib/validation";

describe("NIAT ID", () => {
  it.each(["N24H0100001", "N25H0101234", "N26H0198765"])("accepts %s", (id) => expect(niatIdError(id)).toBeNull());
  it("normalises case and spaces", () => {
    expect(normalizeNiatId("  n24h01 00001 ")).toBe("N24H0100001");
    expect(niatIdError("  n24h0100001 ")).toBeNull();
  });
  it.each(["", "N24H0200001", "N2H0100001", "N24H010001", "N24H01000011", "M24H0100001", "N24A0100001", "NAAH0100001"])("rejects %s", (id) =>
    expect(niatIdError(id)).not.toBeNull(),
  );
});

describe("Indian mobile number", () => {
  it("accepts 10 digits starting 6–9 and stores +91 format", () => {
    expect(mobileError("9876543210")).toBeNull();
    expect(toE164India("98765 43210")).toBe("+919876543210");
    expect(toE164India("+91 98765-43210")).toBe("+919876543210");
    expect(toE164India("09876543210")).toBe("+919876543210");
    expect(formatIndianMobile("+919876543210")).toBe("+91 98765 43210");
  });
  it.each(["", "5876543210", "987654321", "98765432101", "abcdefghij"])("rejects %s", (n) => expect(mobileError(n)).not.toBeNull());
});

describe("password", () => {
  it("needs 8+ characters with a letter and a number, and a matching confirmation", () => {
    expect(passwordError("short1")).not.toBeNull();
    expect(passwordError("onlyletters")).not.toBeNull();
    expect(passwordError("beast2026", "beast2025")).toBe("The passwords do not match.");
    expect(passwordError("beast2026", "beast2026")).toBeNull();
  });
});

describe("image sniffing", () => {
  const blob = (bytes: number[]) => new Blob([new Uint8Array([...bytes, ...new Array(16).fill(0)])]);
  it("recognises real JPEG/PNG/WebP headers and rejects others", async () => {
    expect(await sniffImageType(blob([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(await sniffImageType(blob([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(await sniffImageType(blob([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(await sniffImageType(blob([0x3c, 0x73, 0x76, 0x67]))).toBeNull(); // "<svg"
    expect(await sniffImageType(blob([0x4d, 0x5a]))).toBeNull(); // "MZ" executable
  });
});
