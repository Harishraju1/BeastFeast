"use client";
import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { RequireAuth } from "@/components/shell/AppShell";
import { Badge, PageHeader } from "@/components/ui";
import { BACKEND_MODE, getBackend } from "@/lib/data";
import type { XpEvent } from "@/lib/data/types";
import type { Profile, Project } from "@/lib/types";
import { rankFor } from "@/lib/gamification";
import { EXAMPLE_TRACKS } from "@/lib/track/examples";
import { useApp } from "@/lib/store/app";

type Board = { id: string; title: string; metric: string; value: (u: Profile, ev: XpEvent[], prj: Project[]) => number };

const kindOfTrack = (trackId: string, tracks: { id: string; kind: string }[]) => (EXAMPLE_TRACKS.find((t) => t.id === trackId) ?? tracks.find((t) => t.id === trackId))?.kind;

export default function LeaderboardPage() {
  const me = useApp((s) => s.user);
  const myTracks = useApp((s) => s.tracks);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [events, setEvents] = useState<XpEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [board, setBoard] = useState("overall");
  useEffect(() => {
    void getBackend().then(async (b) => {
      setProfiles(await b.listProfiles());
      setEvents(await b.listXpEvents());
      setProjects(await b.listAllProjects());
    });
  }, []);
  const lapKind = (e: XpEvent) => kindOfTrack(e.refId.split(":").slice(1).join(":"), myTracks);
  const BOARDS: Board[] = useMemo(
    () => [
      { id: "overall", title: "Overall Beast Engineers", metric: "XP", value: (u) => u.xp },
      { id: "circuit", title: "Circuit Design Masters", metric: "validated robots", value: (_u, ev) => ev.filter((e) => e.type === "validation-pass").length },
      { id: "sim", title: "Robot Simulation Masters", metric: "tracks completed + wins", value: (_u, ev) => ev.filter((e) => e.type === "lap-complete" || e.type === "sumo-win").length },
      { id: "race", title: "Robo Race Champions", metric: "race tracks completed + records", value: (_u, ev) => ev.filter((e) => (e.type === "lap-complete" && lapKind(e) === "race") || (e.type === "record-improved" && kindOfTrack(e.refId.split(":")[0], myTracks) === "race")).length },
      { id: "line", title: "Line Following Champions", metric: "line tracks completed", value: (_u, ev) => ev.filter((e) => e.type === "lap-complete" && lapKind(e) === "line").length },
      { id: "sumo", title: "Sumo Robot Champions", metric: "sumo wins (arena × level)", value: (_u, ev) => ev.filter((e) => e.type === "sumo-win").length },
      { id: "tracks", title: "Track Design Masters", metric: "tracks designed", value: (_u, ev) => ev.filter((e) => e.type === "track-created").length },
      { id: "learning", title: "Learning Champions", metric: "lessons completed", value: (_u, ev) => ev.filter((e) => e.type === "lesson-complete").length },
      { id: "quiz", title: "Quiz Masters", metric: "quiz XP", value: (_u, ev) => ev.filter((e) => e.type === "question-correct" || e.type === "quiz-pass").reduce((a, e) => a + e.amount, 0) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myTracks],
  );
  const b = BOARDS.find((x) => x.id === board)!;
  const rows = profiles
    .map((u) => {
      const ev = events.filter((e) => e.userId === u.id);
      const prj = projects.filter((p) => p.ownerId === u.id);
      return { u, v: b.value(u, ev, prj), projects: prj.length, ach: new Set(ev.map((e) => e.type)).size };
    })
    .sort((a, b2) => b2.v - a.v || b2.u.xp - a.u.xp);

  return (
    <RequireAuth>
      <div className="mx-auto max-w-6xl px-5 py-8">
        <PageHeader kicker="GLOBAL RANKINGS" title="Leaderboard">
          {BACKEND_MODE === "local" ? "Local mode: rankings include the accounts on this device. Connect Supabase for a campus-wide, server-validated leaderboard." : "Scores come from server-validated XP events."}
        </PageHeader>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {BOARDS.map((x) => (
            <button key={x.id} onClick={() => setBoard(x.id)} className={`rounded-full border px-3 py-1 text-xs ${board === x.id ? "border-orange bg-orange/10 text-orange" : "border-line text-muted hover:text-text"}`}>{x.title}</button>
          ))}
        </div>
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-bg2">
              <tr className="bf-label text-left">
                <th className="px-4 py-2">Rank</th><th className="px-4 py-2">Student</th><th className="hidden px-4 py-2 sm:table-cell">Campus</th><th className="px-4 py-2 text-right">{b.metric}</th><th className="hidden px-4 py-2 text-right md:table-cell">XP</th><th className="hidden px-4 py-2 text-right md:table-cell">Projects</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.u.id} className={`border-t border-line ${r.u.id === me?.id ? "bg-orange/5" : ""}`}>
                  <td className="px-4 py-2 font-mono">{i < 3 ? <Trophy size={16} className={i === 0 ? "text-orange" : i === 1 ? "text-muted" : "text-[#b07040]"} /> : i + 1}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-panel2 text-xs text-cyan">{r.u.avatar ? <img src={r.u.avatar} alt="" className="h-full w-full object-cover" /> : r.u.name[0]}</span>
                      <span>{r.u.name}</span>
                      <Badge>{rankFor(r.u.xp).name}</Badge>
                    </div>
                  </td>
                  <td className="hidden px-4 py-2 text-muted sm:table-cell">{r.u.campus || "—"}</td>
                  <td className="px-4 py-2 text-right font-mono text-orange">{r.v}</td>
                  <td className="hidden px-4 py-2 text-right font-mono md:table-cell">{r.u.xp}</td>
                  <td className="hidden px-4 py-2 text-right md:table-cell">{BACKEND_MODE === "local" || r.u.id === me?.id ? r.projects : "—"}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-muted">No students yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </RequireAuth>
  );
}
