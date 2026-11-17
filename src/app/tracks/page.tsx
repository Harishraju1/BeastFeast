"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Copy, Trash2 } from "lucide-react";
import { RequireAuth } from "@/components/shell/AppShell";
import { Badge, Button, PageHeader, Panel } from "@/components/ui";
import { useApp } from "@/lib/store/app";
import { EXAMPLE_TRACKS } from "@/lib/track/examples";
import type { TrackDef } from "@/lib/sim/types";
import { blankTrack } from "@/lib/track/blank";
import { uid } from "@/lib/robot/assembly";

function Inner() {
  const { user, tracks, saveTrack, deleteTrack } = useApp();
  const router = useRouter();
  const projectId = useSearchParams().get("project");
  const create = async (t: TrackDef) => {
    await saveTrack(t);
    router.push(`/tracks/${t.id}${projectId ? `?project=${projectId}` : ""}`);
  };
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <PageHeader kicker="BUILD YOUR BATTLEGROUND" title="Track Designer" actions={<>{(["race", "line", "sumo"] as const).map((k) => <Button key={k} variant={k === "race" ? "primary" : "outline"} onClick={() => void create(blankTrack(k, user!.id))}>+ New {k} track</Button>)}</>}>
        Design custom racing circuits, line-following courses and sumo arenas. Your robot runs on them in the Simulation Arena with the same physics.
      </PageHeader>
      <Panel title={`My tracks (${tracks.length})`} className="mb-6">
        {tracks.length === 0 ? <div className="text-sm text-muted">No custom tracks yet — start from a blank track or copy an example below.</div> : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tracks.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded border border-line bg-bg2 p-3">
                <Link href={`/tracks/${t.id}`} className="min-w-0">
                  <div className="truncate font-medium hover:text-accent-ink">{t.name}</div>
                  <div className="flex gap-1"><Badge tone="brand">{t.kind}</Badge><Badge>{t.difficulty}</Badge><span className="text-xs text-dim">{t.pieces.length} pieces</span></div>
                </Link>
                <button className="p-1.5 text-muted hover:text-bad" title="Delete" onClick={() => confirm(`Delete track "${t.name}"? This cannot be undone.`) && void deleteTrack(t.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Example tracks">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {EXAMPLE_TRACKS.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded border border-line bg-bg2 p-3">
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="flex gap-1"><Badge tone="brand">{t.kind}</Badge><Badge tone={t.difficulty === "beast" ? "bad" : t.difficulty === "advanced" ? "accent" : "dim"}>{t.difficulty}</Badge></div>
              </div>
              <Button size="sm" onClick={() => void create({ ...structuredClone(t), id: uid("trk"), ownerId: user!.id, name: `${t.name} (copy)` })}><Copy size={13} /> Copy & edit</Button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export default function TracksPage() {
  return (
    <RequireAuth>
      <Suspense>
        <Inner />
      </Suspense>
    </RequireAuth>
  );
}
