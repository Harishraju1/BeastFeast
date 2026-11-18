/**
 * Browser-side preparation of a profile picture: centre-crop to a square and re-encode at `size` pixels.
 * Keeps uploads small (well under Vercel's 4.5 MB request limit) and drops the original's metadata.
 * The server still decodes and re-encodes whatever it receives — this is not the security check.
 */
export async function squareImage(file: Blob, size = 512, type: "image/webp" | "image/jpeg" = "image/webp"): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  try {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const s = Math.min(bmp.width, bmp.height);
    c.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, type, 0.9));
    if (!blob) throw new Error("Could not read that image. Choose a JPEG, PNG or WebP picture.");
    return blob;
  } finally {
    bmp.close();
  }
}

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Could not read that image."));
    r.readAsDataURL(b);
  });
}
