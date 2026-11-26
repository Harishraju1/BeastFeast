/**
 * Maps the circuit-bench state to what each 3D model shows. Pure: the same BenchState always gives the same
 * picture, and nothing is shown that the electrical simulation did not compute.
 */
import { DRIVER_WIRING } from "@/lib/robot/drivers";
import type { BenchSim } from "./bench";
import type { LivePart } from "@/components/three/models/live";

export function liveParts(sim: BenchSim): Record<string, LivePart> {
  const st = sim.state;
  const g = sim.graph;
  const out: Record<string, LivePart> = {};
  const at = (uid: string) => (out[uid] ??= {});
  for (const e of st.dc) if (e.kind === "led") at(e.partUid).led = Math.max(at(e.partUid).led ?? 0, e.overload ? 0 : e.brightness ?? 0);
  for (const [uid, sv] of Object.entries(st.servos)) at(uid).servoAngle = sv.angle;
  for (const d of st.displays) if (d.partUid && !d.reason) Object.assign(at(d.partUid), { lines: d.lines, runs: d.runs, backlight: d.backlight && d.on });
  if (st.battery) Object.assign(at(st.battery.uid), { soc: st.battery.soc, volts: st.battery.volts });
  for (const p of g.parts) {
    const c = g.comps.get(p.uid)!;
    if (c.kind === "switch") at(p.uid).closed = Boolean(p.config.closed ?? c.options.find((o) => o.key === "closed")?.default);
    const wiring = DRIVER_WIRING[c.id];
    if (!wiring || !c.driver) continue;
    const vs = g.netOf.get(`${p.uid}.${wiring.motorSupply}`)?.voltage ?? 0;
    at(p.uid).channels = wiring.channels.map((ch) => {
      let v = 0;
      for (const o of ch.outs)
        for (const m of g.netOf.get(`${p.uid}.${o}`)?.members ?? []) {
          const mv = st.motors[m.part.uid]?.volts;
          if (m.pin.fn === "motor-term" && mv != null) v = Math.max(v, Math.abs(mv));
        }
      return vs > 0 ? Math.min(1, v / vs) : 0;
    });
  }
  return out;
}
