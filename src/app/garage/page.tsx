"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { Box, Eye, Loader2, Play, Upload, Wrench } from "lucide-react";
import { GARAGE_TEMPLATES, type ProjectTemplate, type ReadinessReport } from "@/lib/garage";
import { useApp } from "@/lib/store/app";
import { Badge, Button } from "@/components/ui";
import { RobotTopView } from "@/components/garage/RobotTopView";
import { LoadFlow } from "@/components/garage/LoadFlow";
import { usePreviewProjects, useReadiness } from "@/components/garage/useGarage";
import type { Project } from "@/lib/types";

const Preview3D = dynamic(() => import("@/components/garage/Preview3D"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-bg2" /> });

const LABS = [
  {
    competition: "line" as const,
    title: "LINE FOLLOWING LAB",
    kicker: "A · Sensors, calibration and PID",
    bg: "bg-[linear-gradient(135deg,#f2f2ee0d_0%,transparent_60%)]",
    accent: "text-text",
    deco: (
      <svg viewBox="0 0 600 120" className="absolute inset-x-0 bottom-0 h-24 w-full opacity-30" preserveAspectRatio="none" aria-hidden>
        <path d="M0 80 C 120 20, 220 120, 330 60 S 520 30, 600 70" stroke="#f4f7fb" strokeWidth="6" fill="none" />
      </svg>
    ),
  },
  {
    competition: "race" as const,
    title: "ROBO RACE GARAGE",
    kicker: "B · Speed, traction and control",
    bg: "bg-[repeating-linear-gradient(115deg,#ff6b1a0f_0_18px,transparent_18px_60px)]",
    accent: "text-orange",
    deco: <div className="absolute inset-x-0 bottom-0 h-2 bg-[repeating-linear-gradient(90deg,#ff6b1a_0_30px,#080a0f_30px_60px)] opacity-60" aria-hidden />,
  },
  {
    competition: "sumo" as const,
    title: "SUMO BATTLE WORKSHOP",
    kicker: "C · Detect, attack, survive",
    bg: "bg-[radial-gradient(circle_at_85%_30%,#ff3b4e26,transparent_45%)]",
    accent: "text-bad",
    deco: (
      <svg viewBox="0 0 200 200" className="absolute -right-10 -top-10 h-56 w-56 opacity-20" aria-hidden>
        <circle cx="100" cy="100" r="90" fill="#0b0b0b" stroke="#f4f4f4" strokeWidth="8" />
        <rect x="70" y="95" width="10" height="30" fill="#8a5a2b" />
        <rect x="120" y="75" width="10" height="30" fill="#8a5a2b" />
      </svg>
    ),
  },
];

function StatusBadge({ r }: { r?: ReadinessReport }) {
  if (!r)
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-dim">
        <Loader2 size={10} className="animate-spin" /> RUNNING READINESS TEST…
      </span>
    );
  const tone = r.status === "READY TO SIMULATE" ? "ok" : r.status === "READY WITH WARNINGS" ? "warn" : "bad";
  return <Badge tone={tone}>{r.status}</Badge>;
}

function ProjectCard({ t, project, report, onAction }: { t: ProjectTemplate; project: Project; report?: ReadinessReport; onAction: (a: "load" | "simulate" | "customise") => void }) {
  const [show3d, setShow3d] = useState(false);
  const diffTone = t.metadata.difficulty === "beginner" ? "ok" : t.metadata.difficulty === "intermediate" ? "warn" : "bad";
  const ready = report && report.status !== "NOT READY";
  return (
    <article className="bf-panel group relative flex flex-col overflow-hidden transition hover:-translate-y-1 hover:border-orange/60">
      <div className="relative h-44 border-b border-line bg-[#0b0f16]" onMouseEnter={() => setShow3d(true)}>
        {show3d ? <Preview3D project={project} /> : <RobotTopView project={project} className="mx-auto h-full p-3" />}
        <span className="absolute left-2 top-2 font-mono text-[10px] tracking-widest text-orange">{t.metadata.id}</span>
        <span className="pointer-events-none absolute bottom-1 right-2 font-mono text-[9px] text-dim">{show3d ? "DRAG TO ROTATE" : "HOVER FOR 3D"}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display text-lg font-bold leading-tight">{t.metadata.name}</h3>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={diffTone}>{t.metadata.difficulty}</Badge>
          <Badge tone="cyan">{t.metadata.competition === "line" ? "Line Following" : t.metadata.competition === "race" ? "Robo Race" : "Robo War"}</Badge>
          <StatusBadge r={report} />
        </div>
        <dl className="grid grid-cols-[92px_1fr] gap-x-2 gap-y-0.5 text-xs">
          <dt className="text-dim">Components</dt>
          <dd>{project.parts.length} parts · {project.wires.length} wires</dd>
          <dt className="text-dim">Sensors</dt>
          <dd>{t.metadata.sensorSummary}</dd>
          <dt className="text-dim">Simulation</dt>
          <dd>{t.simulation.keyboardViaSerial ? "Keyboard → Bluetooth → firmware" : "Autonomous firmware"}</dd>
          <dt className="text-dim">Level</dt>
          <dd>{t.metadata.learningLevel}</dd>
        </dl>
        <div className="mt-auto grid grid-cols-2 gap-1.5 pt-2">
          <Link href={`/garage/${t.metadata.id}`} className="inline-flex items-center justify-center gap-1 rounded-md border border-line2 px-2 py-1.5 text-xs hover:border-cyan hover:text-cyan"><Eye size={12} /> VIEW PROJECT</Link>
          <Button size="sm" onClick={() => onAction("load")}><Upload size={12} /> LOAD PROJECT</Button>
          <Button size="sm" variant="primary" disabled={!ready} onClick={() => onAction("simulate")} title={ready ? "Load the original and start the simulation" : "Waiting for the readiness test"}><Play size={12} /> SIMULATE NOW</Button>
          <Button size="sm" variant="cyan" onClick={() => onAction("customise")}><Wrench size={12} /> CUSTOMISE</Button>
        </div>
      </div>
    </article>
  );
}

export default function GaragePage() {
  const { user, ready } = useApp();
  const previews = usePreviewProjects();
  const reports = useReadiness();
  const [flow, setFlow] = useState<{ id: string; intent: "load" | "simulate" | "customise" } | null>(null);

  return (
    <div>
      <section className="bf-grid relative overflow-hidden border-b border-line">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,#ff6b1a22,transparent_60%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-10">
          <div className="bf-label mb-2 text-cyan">BEAST FEAST 5.0 · ROBOTICS CLUB KKH</div>
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            BEAST PROJECT <span className="text-orange">GARAGE</span>
          </h1>
          <p className="mt-2 font-mono text-sm tracking-[0.3em] text-muted">EXPLORE. LOAD. SIMULATE. MODIFY. MASTER.</p>
          <p className="mt-4 max-w-3xl text-sm text-muted">
            Complete reference robots — chassis, motors, wiring, pin maps, firmware and a ready track — built from the same components, circuit engine, interpreter and physics you use in your own projects. Every
            card is checked by an automated readiness test that compiles the firmware, validates the circuit and actually starts the simulation.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 font-mono text-xs text-dim">
            <span><Box size={12} className="mr-1 inline" />{GARAGE_TEMPLATES.length} projects</span>
            <span>{Object.values(reports).filter((r) => r.status === "READY TO SIMULATE").length}/{GARAGE_TEMPLATES.length} ready to simulate</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-10 px-5 py-8">
        {LABS.map((lab) => (
          <section key={lab.competition} className={`relative overflow-hidden rounded-2xl border border-line p-5 ${lab.bg}`}>
            {lab.deco}
            <div className="relative mb-4">
              <div className="bf-label">{lab.kicker}</div>
              <h2 className={`font-display text-2xl font-bold tracking-wide ${lab.accent}`}>{lab.title}</h2>
            </div>
            <div className="relative grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {GARAGE_TEMPLATES.filter((t) => t.metadata.competition === lab.competition).map((t) => (
                <ProjectCard
                  key={t.metadata.id}
                  t={t}
                  project={previews[t.metadata.id]}
                  report={reports[t.metadata.id]}
                  onAction={(intent) => (ready && !user ? (location.href = `/login?next=/garage`) : setFlow({ id: t.metadata.id, intent }))}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      {flow && <LoadFlow templateId={flow.id} intent={flow.intent} onClose={() => setFlow(null)} />}
    </div>
  );
}
