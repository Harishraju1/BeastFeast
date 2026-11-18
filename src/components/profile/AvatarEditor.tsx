"use client";
import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { getBackend } from "@/lib/data";
import { useApp } from "@/lib/store/app";
import { avatarFileError } from "@/lib/validation";
import { Avatar } from "./Avatar";

/** Upload / replace / remove the signed-in user's profile picture (validated on the server in cloud mode). */
export function AvatarEditor() {
  const { user, toast } = useApp();
  const [busy, setBusy] = useState<"up" | "rm" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  if (!user) return null;

  async function upload(file: File | undefined) {
    setErr(null);
    if (!file || busy) return;
    const e = await avatarFileError(file);
    if (e) {
      setErr(e);
      return;
    }
    setBusy("up");
    try {
      const p = await (await getBackend()).setAvatar(file);
      useApp.setState({ user: p });
      toast("success", "Profile picture updated");
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(null);
      if (ref.current) ref.current.value = "";
    }
  }

  async function remove() {
    if (busy) return;
    setBusy("rm");
    setErr(null);
    try {
      const p = await (await getBackend()).removeAvatar();
      useApp.setState({ user: p });
      toast("success", "Profile picture removed");
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <Avatar name={user.name} src={user.avatar} size={64} />
        <div className="flex flex-wrap gap-2">
          <input ref={ref} id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} disabled={!!busy} />
          <label htmlFor="avatar-file" className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line2 px-3 py-1.5 text-xs hover:border-accent ${busy ? "pointer-events-none opacity-60" : ""}`}>
            {busy === "up" ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />} {busy === "up" ? "Uploading…" : user.avatar ? "Replace picture" : "Upload picture"}
          </label>
          {user.avatar && (
            <button type="button" onClick={() => void remove()} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted hover:text-accent-ink disabled:opacity-60">
              {busy === "rm" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Remove
            </button>
          )}
        </div>
      </div>
      {err ? <p role="alert" className="text-xs font-medium text-accent-ink">{err}</p> : <p className="text-[11px] text-dim">JPEG, PNG or WebP, up to 5 MB. Shown on your profile and the leaderboard.</p>}
    </div>
  );
}
