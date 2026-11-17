"use client";
import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import { getBackend } from "@/lib/data";
import { type XpConfig, type XpEventType, XP_RULES, defaultXpConfig } from "@/lib/data/types";
import { useApp } from "@/lib/store/app";

const GROUPS: { title: string; types: XpEventType[] }[] = [
  { title: "Building & coding (own work only)", types: ["validation-pass", "code-check-pass", "lap-complete", "sumo-win", "record-improved", "track-created", "competition-win"] },
  { title: "Learning", types: ["lesson-complete", "quiz-pass"] },
];

/**
 * Admins set how much each activity is worth. In cloud mode these values are the xp_rules / xp_settings
 * rows the server functions read, so changes apply to every student immediately (new XP only — XP already
 * earned isn't recalculated).
 */
export function XpRulesEditor() {
  const { toast } = useApp();
  const [cfg, setCfg] = useState<XpConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void getBackend()
      .then((b) => b.getXpConfig())
      .then(setCfg)
      .catch((e) => setErr((e as Error).message));
  }, []);

  if (err) return <Panel title="XP rules"><div className="text-sm text-bad">{err}</div></Panel>;
  if (!cfg) return <Panel title="XP rules"><div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Loading XP rules…</div></Panel>;

  const setRule = (t: XpEventType, patch: Partial<XpConfig["rules"][XpEventType]>) => setCfg({ ...cfg, rules: { ...cfg.rules, [t]: { ...cfg.rules[t], ...patch } } });
  const num = (v: string, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

  const save = async () => {
    setSaving(true);
    try {
      await (await getBackend()).saveXpConfig(cfg);
      toast("success", "XP rules saved — they apply to new XP from now on.");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const pen = cfg.rules["inactivity-penalty"];
  return (
    <div className="space-y-4">
      <Panel
        title="XP rules"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setCfg({ ...defaultXpConfig(), penalty: { ...defaultXpConfig().penalty, start: cfg.penalty.start } })} title="Restore the recommended amounts">
              <RotateCcw size={13} /> Defaults
            </Button>
            <Button size="sm" variant="primary" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
            </Button>
          </>
        }
        bodyClass="p-0"
      >
        <p className="border-b border-line px-4 py-3 text-sm text-muted">
          XP is earned for real work: designing your own robot, writing your own code and completing simulations with it. Opening or creating projects, loading Garage robots and simply starting a simulation earn nothing. Code that is mostly a starter template or Garage firmware earns no code or simulation XP. Changes apply to new XP; XP already earned isn&apos;t recalculated.
        </p>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="bf-label border-b border-line bg-bg2 px-4 py-2">{g.title}</div>
            <div className="divide-y divide-[var(--line)]">
              {g.types.map((t) => (
                <div key={t} className="grid items-center gap-3 px-4 py-3 md:grid-cols-[1fr_120px_140px]">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text">{XP_RULES[t].label}</div>
                    <div className="text-xs text-muted">{XP_RULES[t].description}</div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-dim">
                    XP
                    <input className="bf-input !py-1.5 text-right font-mono" type="number" min={0} max={1000} value={cfg.rules[t].amount} onChange={(e) => setRule(t, { amount: num(e.target.value, 1000) })} aria-label={`${XP_RULES[t].label} XP`} />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-dim" title="Most times one student can earn this (empty = unlimited)">
                    Max
                    <input className="bf-input !py-1.5 text-right font-mono" type="number" min={1} placeholder="no limit" value={cfg.rules[t].limit ?? ""} onChange={(e) => setRule(t, { limit: e.target.value === "" ? null : Math.max(1, num(e.target.value, 10000)) })} aria-label={`${XP_RULES[t].label} limit`} />
                  </label>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Panel>

      <Panel title="Daily learning penalty">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="space-y-2 text-sm text-muted">
            <p>
              Each day a student does <b className="text-text">none</b> of these costs them XP: studying a Beast Topic (a minute on the page), watching a video, completing a lesson, or taking a quiz.
            </p>
            <p className="text-xs text-dim">
              Checked when the student next opens the app, for each missed day since {cfg.penalty.start} (at most {cfg.penalty.maxDaysBack} days back, days in {cfg.penalty.timezone}). Never takes XP below 0. Admins are exempt. The day a student signs up is never charged.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:w-56">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[var(--signal-red)]" checked={cfg.penalty.enabled} onChange={(e) => setCfg({ ...cfg, penalty: { ...cfg.penalty, enabled: e.target.checked } })} />
              Penalty switched on
            </label>
            <label className="flex items-center gap-2 text-xs text-dim">
              XP per missed day
              <input className="bf-input !w-24 !py-1.5 text-right font-mono" type="number" min={0} max={500} disabled={!cfg.penalty.enabled} value={pen.amount} onChange={(e) => setRule("inactivity-penalty", { amount: num(e.target.value, 500) })} aria-label="Penalty per missed day" />
            </label>
          </div>
        </div>
      </Panel>
    </div>
  );
}
