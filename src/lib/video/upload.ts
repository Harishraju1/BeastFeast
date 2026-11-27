/**
 * Upload with progress and cancel (fetch cannot report upload progress). Used by the cloud backend to send a file
 * to Supabase Storage with the signed-in administrator's own session token; Storage RLS decides whether it is
 * accepted. Nothing secret is involved: the anon key is public and the token is the user's.
 */
export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export class UploadCancelled extends Error {
  constructor() {
    super("Upload cancelled.");
  }
}

export function xhrUpload(url: string, file: Blob, headers: Record<string, string>, opts: UploadOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new UploadCancelled());
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(1);
        resolve();
        return;
      }
      let msg = "";
      try {
        msg = String((JSON.parse(xhr.responseText) as { message?: string; error?: string }).message ?? "");
      } catch {
        /* not JSON */
      }
      if (xhr.status === 413 || /exceeded the maximum allowed size|too large/i.test(msg)) reject(new Error("The file is larger than the 50 MB limit."));
      else if (xhr.status === 415 || /mime type/i.test(msg)) reject(new Error("This file type is not allowed. Use MP4, WebM or MOV (thumbnails: JPEG, PNG or WebP)."));
      else if (xhr.status === 401 || xhr.status === 403 || /row-level security|unauthorized/i.test(msg)) reject(new Error("Only administrators can upload videos. Sign in again if your session expired."));
      else reject(new Error(`Upload failed (${xhr.status}). Check your connection and press Retry.`));
    };
    xhr.onerror = () => reject(new Error("Network connection failed during the upload. Press Retry."));
    xhr.onabort = () => reject(new UploadCancelled());
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/** Safe object name for an uploaded file: lowercase ASCII, the original extension kept. */
export function storageName(name: string): string {
  const ext = (/\.([a-z0-9]{2,5})$/i.exec(name)?.[1] ?? "bin").toLowerCase();
  const base = name.replace(/\.[^.]*$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "file";
  return `${base}-${Date.now().toString(36)}.${ext}`;
}
