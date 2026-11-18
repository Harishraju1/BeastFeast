/**
 * Regenerates every logo image used by the site from the one official logo file.
 *   node scripts/brand-assets.mjs [path/to/logo]      (default data/source/brand/beast-feast-logo.webp)
 * Outputs: src/assets/brand/{beast-feast-logo,beast-feast-sidebar,beast-feast-mark}.webp (full logo, sidebar
 * lock-up without the banner, emblem), src/app/{icon,apple-icon,opengraph-image}.png (favicon, home-screen
 * icon, link preview). Crop boxes are in the source's own pixels (the official file is 1536 × 1024).
 */
import sharp from "sharp";

const SRC = process.argv[2] ?? "data/source/brand/beast-feast-logo.webp";
const BG = { r: 24, g: 32, b: 27, alpha: 1 }; // dark forest, matches the app background family
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const meta = await sharp(SRC).metadata();
const sx = meta.width / 1536, sy = meta.height / 1024;
const box = (left, top, right, bottom) => ({ left: Math.round(left * sx), top: Math.round(top * sy), width: Math.round((right - left) * sx), height: Math.round((bottom - top) * sy) });

const FULL = box(40, 6, 1490, 1004); // whole logo, transparent margin trimmed
const LOCKUP = box(40, 6, 1490, 866); // emblem + BEAST FEAST wordmark, without the club banner
const EMBLEM = box(330, 6, 1250, 478); // gear + beast head

// transparent output: contain-fit the region, keep the alpha channel
const fit = (region, w, h) => sharp(SRC).extract(region).resize(w, h, { fit: "contain", background: CLEAR });

await fit(FULL, 1200, 800).webp({ quality: 90 }).toFile("src/assets/brand/beast-feast-logo.webp");
await fit(LOCKUP, 420, 240).webp({ quality: 92 }).toFile("src/assets/brand/beast-feast-sidebar.webp");
await fit(EMBLEM, 512, 512).webp({ quality: 92 }).toFile("src/assets/brand/beast-feast-mark.webp");

// app icons: emblem on a rounded dark tile
async function tile(size, radius, pad) {
  const inner = await sharp(SRC).extract(EMBLEM).resize(size - pad * 2, size - pad * 2, { fit: "contain", background: CLEAR }).png().toBuffer();
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`);
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: inner, top: pad, left: pad }, { input: mask, blend: "dest-in" }])
    .png();
}
await (await tile(256, 56, 14)).toFile("src/app/icon.png");
// iOS adds its own rounding and needs an opaque square
await sharp({ create: { width: 180, height: 180, channels: 4, background: BG } })
  .composite([{ input: await sharp(SRC).extract(EMBLEM).resize(160, 160, { fit: "contain", background: CLEAR }).png().toBuffer(), top: 10, left: 10 }])
  .png().toFile("src/app/apple-icon.png");
// link preview 1200 × 630
await sharp({ create: { width: 1200, height: 630, channels: 4, background: BG } })
  .composite([{ input: await sharp(SRC).extract(FULL).resize(1060, 580, { fit: "contain", background: CLEAR }).png().toBuffer(), top: 25, left: 70 }])
  .png().toFile("src/app/opengraph-image.png");
console.log("brand assets written from", SRC, `${meta.width}×${meta.height}`);
