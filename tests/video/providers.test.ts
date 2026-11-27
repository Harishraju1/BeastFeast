import { describe, expect, it } from "vitest";
import { EMBED_ORIGINS, oembedEndpoint, parseVideoUrl, sniffVideo, videoFileError } from "@/lib/video/providers";
import { storageName } from "@/lib/video/upload";

describe("parseVideoUrl — supported platforms", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", false],
    ["https://youtu.be/dQw4w9WgXcQ?t=10", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", false],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", false],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube-shorts", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", true],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", false],
    ["https://vimeo.com/76979871", "vimeo", "https://player.vimeo.com/video/76979871", false],
    ["https://vimeo.com/76979871/abc123def0", "vimeo", "https://player.vimeo.com/video/76979871?h=abc123def0", false],
    ["https://player.vimeo.com/video/76979871?h=abc123def0", "vimeo", "https://player.vimeo.com/video/76979871?h=abc123def0", false],
    ["https://www.dailymotion.com/video/x8abcd1", "dailymotion", "https://www.dailymotion.com/embed/video/x8abcd1", false],
    ["https://dai.ly/x8abcd1", "dailymotion", "https://www.dailymotion.com/embed/video/x8abcd1", false],
    ["https://www.instagram.com/reel/C1a2B3c4D5e/", "instagram", "https://www.instagram.com/reel/C1a2B3c4D5e/embed", true],
    ["https://www.instagram.com/p/C1a2B3c4D5e/?igsh=abc", "instagram", "https://www.instagram.com/p/C1a2B3c4D5e/embed", true],
  ] as const)("%s → %s", (url, provider, embed, vertical) => {
    const p = parseVideoUrl(url)!;
    expect(p).toBeTruthy();
    expect(p.provider).toBe(provider);
    expect(p.embed).toBe(embed);
    expect(p.vertical).toBe(vertical);
    expect(EMBED_ORIGINS.some((o) => p.embed!.startsWith(o + "/"))).toBe(true);
  });
  it("Facebook uses the official video plugin with the encoded canonical link", () => {
    const p = parseVideoUrl("https://www.facebook.com/NASA/videos/1234567890123/")!;
    expect(p.provider).toBe("facebook");
    expect(p.embed).toBe(`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent("https://www.facebook.com/NASA/videos/1234567890123/")}&show_text=false`);
    expect(parseVideoUrl("https://www.facebook.com/watch/?v=1234567890123")?.provider).toBe("facebook");
    expect(parseVideoUrl("https://www.facebook.com/reel/1234567890123")?.vertical).toBe(true);
    expect(parseVideoUrl("https://fb.watch/abcDEF12/")?.provider).toBe("facebook");
  });
  it("X / Twitter is recognised but never embedded (link-out only)", () => {
    const p = parseVideoUrl("https://x.com/nasa/status/1234567890123456789")!;
    expect(p.provider).toBe("x");
    expect(p.embed).toBeNull();
    expect(parseVideoUrl("https://twitter.com/nasa/status/1234567890123456789")?.canonical).toBe("https://x.com/nasa/status/1234567890123456789");
  });
});

describe("parseVideoUrl — rejects anything else", () => {
  it.each([
    "",
    "not a url",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ\"><script>",
    "https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://vimeo.com/channels/staffpicks",
    "https://www.instagram.com/someuser/",
    "https://www.facebook.com/someone",
    "https://x.com/nasa",
    "ftp://youtu.be/dQw4w9WgXcQ",
  ])("%j", (url) => expect(parseVideoUrl(url)).toBeNull());
  it("an injected id can never reach the embed address", () => {
    const p = parseVideoUrl("https://player.vimeo.com/video/76979871?h=zz\"onload=alert(1)");
    expect(p?.embed ?? "").not.toMatch(/["<>]/);
  });
});

describe("oEmbed endpoints are fixed and keyless", () => {
  it("only the platforms with a public endpoint", () => {
    expect(oembedEndpoint(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")!)).toMatch(/^https:\/\/www\.youtube\.com\/oembed\?/);
    expect(oembedEndpoint(parseVideoUrl("https://vimeo.com/76979871")!)).toMatch(/^https:\/\/vimeo\.com\/api\/oembed\.json\?/);
    expect(oembedEndpoint(parseVideoUrl("https://www.instagram.com/p/C1a2B3c4D5e/")!)).toBeNull();
    expect(oembedEndpoint(parseVideoUrl("https://www.facebook.com/watch/?v=1234567890123")!)).toBeNull();
  });
});

describe("uploaded files", () => {
  it("type and size limits", () => {
    expect(videoFileError({ name: "a.mp4", type: "video/mp4", size: 10_000_000 })).toBeNull();
    expect(videoFileError({ name: "a.mov", type: "", size: 10 })).toBeNull();
    expect(videoFileError({ name: "a.mp4", type: "video/mp4", size: 60 * 1048576 })).toMatch(/50 MB/);
    expect(videoFileError({ name: "a.exe", type: "application/x-msdownload", size: 10 })).toMatch(/MP4, WebM or MOV/);
    expect(videoFileError({ name: "a.mp4", type: "video/mp4", size: 0 })).toMatch(/empty/);
  });
  it("content sniffing recognises MP4 / MOV / WebM and refuses a renamed file", () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const mov = new Uint8Array([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]);
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
    expect(sniffVideo(mp4)).toBe("video/mp4");
    expect(sniffVideo(mov)).toBe("video/quicktime");
    expect(sniffVideo(webm)).toBe("video/webm");
    expect(sniffVideo(new TextEncoder().encode("MZ\u0090\u0000 not a video"))).toBeNull();
  });
  it("storage names are safe and match the bucket policy pattern", () => {
    const n = storageName("My Robot (final) ✓.MP4");
    expect(n).toMatch(/^[a-z0-9-]+\.mp4$/);
    expect(`videos/vid-abc/${n}`).toMatch(/^videos\/[A-Za-z0-9_-]{3,64}\/[A-Za-z0-9._-]{1,100}$/);
  });
});
