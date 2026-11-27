import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : "*.supabase.co";

/**
 * Content-Security-Policy, kept compatible with the robotics workspace:
 * - Monaco is self-hosted (/monaco) and starts its workers from blob: URLs → worker-src 'self' blob:
 * - three.js / WebGL and the simulator need no extra sources; textures come from data:/blob:
 * - Next.js inlines its bootstrap scripts → script-src 'unsafe-inline' (no third-party script origins allowed)
 * - Supabase (REST, Auth, Storage, Realtime) → connect-src; avatars and admin-supplied component images → img-src https:
 * - lesson videos: official players of YouTube (nocookie), Vimeo, Dailymotion, Instagram and Facebook → frame-src;
 *   uploaded videos play from signed Supabase Storage URLs → media-src
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `media-src 'self' blob: https://${supabase}`,
  `connect-src 'self' https://${supabase} wss://${supabase}${isDev ? " ws: http://localhost:*" : ""}`,
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://www.dailymotion.com https://geo.dailymotion.com https://www.instagram.com https://www.facebook.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      // security headers ship with production builds (next build / Vercel); the dev server stays embeddable for tooling
      ...(isDev ? [] : [{ source: "/:path*", headers: securityHeaders }]),
      // API responses are never cached by shared caches
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
