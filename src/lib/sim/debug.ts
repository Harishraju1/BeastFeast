/**
 * Real-time debugging assistant. It only reports what the simulation data shows:
 * "verified" causes are facts read from the circuit graph / runtime / telemetry;
 * "possible" causes are clearly labelled hypotheses.
 */
import type { SimEvent } from "./types";
import type { SimSession } from "./session";
import { DRIVER_WIRING } from "@/lib/robot/drivers";

export interface DebugFinding {
  id: string;
  t: number;
  code: string;
  title: string;
  severity: "critical" | "warning" | "info";
  partUid?: string;
  /** facts read from the simulation */
  verified: string[];
  /** hypotheses the student should check */
  possible: string[];
  telemetry: Record<string, string>;
  steps: string[];
  codeLines?: number[];
  pause: boolean;
}

export class DebugAssistant {
  findings: DebugFinding[] = [];
  private seen = new Set<string>();
  private pauseReq: DebugFinding | null = null;
  private stuckSince: number | null = null;
  constructor(private s: SimSession, private name: string) {}

  takePauseRequest() {
    const p = this.pauseReq;
    this.pauseReq = null;
    return p;
  }

  private add(f: Omit<DebugFinding, "id" | "t">, once = true) {
    if (once && this.seen.has(f.code)) return;
    this.seen.add(f.code);
    const full = { ...f, id: `${f.code}-${this.findings.length}`, t: this.s.time };
    this.findings.push(full);
    if (f.pause) this.pauseReq = full;
  }

  private motorFacts(): { verified: string[]; partUid?: string } {
    const g = this.s.bridge.graph;
    const verified: string[] = [];
    let partUid: string | undefined;
    for (const d of g.parts) {
      const c = g.comps.get(d.uid)!;
      const w = DRIVER_WIRING[c.id];
      if (!w) continue;
      if (!g.powered.has(d.uid)) {
        verified.push(`${d.label} is not powered (its supply/ground wiring is incomplete).`);
        partUid = d.uid;
      }
      const ms = g.netOf.get(`${d.uid}.${w.motorSupply}`);
      if (!ms?.voltage) {
        verified.push(`${d.label} ${w.motorSupply} has no voltage — motors get no power.`);
        partUid = d.uid;
      }
    }
    if (!g.parts.some((p) => g.comps.get(p.uid)?.kind === "motor-driver")) verified.push("There is no motor driver in the circuit.");
    for (const [m, trace] of Object.entries(this.s.bridge.motorTrace)) {
      if (trace.startsWith("terminal floating")) {
        const label = g.parts.find((p) => p.uid === m)?.label ?? m;
        verified.push(`${label}: driver outputs are off (floating) — the enable/standby input is LOW or not driven.`);
      }
    }
    return { verified, partUid };
  }

  inspect(events: SimEvent[]) {
    const s = this.s;
    const tel = s.telemetry(0);
    const t = s.time;
    const NAME = this.name.toUpperCase();
    const telemetry = {
      "Simulation time": `${t.toFixed(2)} s`,
      Speed: `${tel.speed.toFixed(3)} m/s`,
      Battery: `${tel.batteryVoltage.toFixed(2)} V`,
      Position: `(${tel.pose.x.toFixed(2)}, ${tel.pose.y.toFixed(2)}) m`,
      ...Object.fromEntries(Object.entries(tel.motorVoltage).map(([k, v]) => [`Motor ${s.bridge.graph.parts.find((p) => p.uid === k)?.label ?? k}`, `${v.toFixed(2)} V · ${(tel.motorRpm[k] ?? 0).toFixed(0)} rpm`])),
    };

    // runtime errors / compile issues
    const st = s.runtimeStatus;
    if (st?.state === "error" && st.error)
      this.add({ code: "RUNTIME_ERROR", title: `HEY ${NAME}! YOUR CODE CRASHED ON LINE ${st.error.line}!`, severity: "critical", verified: [st.error.message], possible: [], telemetry, steps: ["Open Code Studio at the highlighted line.", "Read the error — it names exactly what went wrong.", "Fix it and restart the simulation."], codeLines: [st.error.line], pause: true });
    if (s.mode === "code" && s.compileResult && !s.compileResult.ok)
      this.add({ code: "COMPILE_FAILED", title: "YOUR CODE DID NOT COMPILE", severity: "critical", verified: s.compileResult.diagnostics.filter((d) => d.severity === "error").slice(0, 3).map((d) => `Line ${d.line}: ${d.message}`), possible: [], telemetry, steps: ["Fix the errors in Code Studio."], codeLines: s.compileResult.diagnostics.filter((d) => d.severity === "error").map((d) => d.line), pause: false });
    for (const w of s.runtimeWarnings) {
      const m = /^Line (\d+):/.exec(w);
      this.add({ code: `RT_WARN_${w}`, title: "CODE WARNING DURING THE RUN", severity: "warning", verified: [w], possible: [], telemetry, steps: ["Check the line in Code Studio."], codeLines: m ? [Number(m[1])] : undefined, pause: false });
    }

    // motor not responding
    const anyCmd = Object.values(s.lastCommands).some((v) => Math.abs(v) > 0.3);
    // Only a fault if something is actually asking the motors to move: keys held in manual mode, or in code mode
    // a controller output that is wired to a motor-driver input is HIGH / PWM > 0 (a sketch sitting in its
    // start delay with every output LOW is behaving correctly).
    const g = s.bridge.graph;
    const speedPins = new Set<number>();
    for (const d of g.parts) {
      const w = DRIVER_WIRING[g.comps.get(d.uid)!.id];
      if (!w) continue;
      for (const pinId of w.channels.flatMap((ch) => ch.speedPins)) {
        const gp = g.netOf.get(`${d.uid}.${pinId}`)?.members.find((m) => m.comp.kind === "controller" && m.pin.fn === "gpio");
        if (gp?.pin.arduinoPin !== undefined) speedPins.add(gp.pin.arduinoPin);
      }
    }
    const commanding =
      s.mode === "manual"
        ? s.manual.forward !== 0 || s.manual.turn !== 0
        : s.bridge.pinSnapshot().some((p) => speedPins.has(p.pin) && p.mode === "OUTPUT" && (p.duty ?? p.level) > 0);
    if (t > 1.5 && commanding && !anyCmd && Math.abs(tel.speed) < 0.005) {
      if (this.stuckSince === null) this.stuckSince = t;
      if (t - this.stuckSince > 1.5) {
        const f = this.motorFacts();
        const pins = s.bridge.pinSnapshot().filter((p) => p.mode === "OUTPUT");
        const possible: string[] = [];
        if (s.mode === "code") {
          if (!pins.length) possible.push("Your code never set any pin to OUTPUT, or never reached that part of the code (check delays / blocking loops).");
          else possible.push(`Your code drives pins ${pins.map((p) => p.pin).join(", ")} — check they are the pins wired to the driver (Code Studio pin check).`);
          possible.push("Speed values may be too small (e.g. analogWrite below ≈60 often cannot overcome friction).");
        }
        this.add({ code: "MOTOR_NOT_RESPONDING", title: `HEY ${NAME}! YOUR MOTORS ARE NOT RESPONDING!`, severity: "critical", partUid: f.partUid, verified: f.verified.length ? f.verified : ["All motor voltages are 0 V."], possible, telemetry: { ...telemetry, "Controller output pins": pins.map((p) => `${p.pin}=${p.duty !== null ? `PWM ${(p.duty * 100).toFixed(0)}%` : p.level ? "HIGH" : "LOW"}`).join(", ") || "none" }, steps: ["Run VALIDATE MY ROBOT and fix every critical error.", "In Code Studio run the pin check.", "Make sure ENA/ENB (or PWMA/STBY) are driven HIGH/PWM."], pause: true });
      }
    } else this.stuckSince = null;

    // wrong motor direction: commanded voltages same sign but robot spins in place
    const v = Object.values(tel.motorVoltage);
    if (t > 1 && v.length >= 2 && Math.abs(tel.yawRate) > 2.5 && Math.abs(tel.speed) < 0.05 && s.mode === "code") {
      const mirroredMotors = Object.entries(s.notes.motorMirrored).filter(([, m]) => m).map(([id]) => s.bridge.graph.parts.find((p) => p.uid === id)?.label ?? id);
      this.add({
        code: "MOTOR_DIRECTION", title: `HEY ${NAME}! ONE MOTOR IS TURNING THE WRONG WAY!`, severity: "warning",
        verified: [`The robot spins in place (${tel.yawRate.toFixed(1)} rad/s) instead of driving.`, ...(mirroredMotors.length ? [`${mirroredMotors.join(", ")} ${mirroredMotors.length > 1 ? "are" : "is"} mounted mirrored: the same voltage turns its wheel the opposite way.`] : [])],
        possible: ["If your code meant to spin, ignore this."], telemetry,
        steps: ["Swap that motor's two wires on the driver outputs (Circuit Studio), OR", "swap the IN1/IN2 logic for that motor in your code, OR", "tick 'Mounted reversed' in the motor's inspector."], pause: false,
      });
    }

    for (const e of events) {
      if (e.robot !== 0) continue;
      if (e.type === "off-track") {
        const r = s.sensorReadings(0);
        const refl = Object.values(r).find((x) => x.kind === "reflectance");
        const darkness = refl?.kind === "reflectance" ? refl.darkness : [];
        const possible = [] as string[];
        if (darkness.length && darkness.every((d) => d < 0.2)) possible.push("All line sensors read white — the line was lost; add lost-line recovery (keep turning towards the side that last saw the line).");
        if (Math.abs(tel.speed) > 0.6) possible.push(`Speed ${tel.speed.toFixed(2)} m/s may be too high to react before the curve.`);
        possible.push("Your steering correction may be too weak (increase Kp) or too slow (reduce delays in loop()).");
        this.add({ code: "OFF_TRACK", title: `HEY ${NAME}! YOUR ROBOT IS GOING OFF TRACK!`, severity: "warning", verified: [`Left the ${s.track.kind === "line" ? "line" : "road"} at (${tel.pose.x.toFixed(2)}, ${tel.pose.y.toFixed(2)}) m, t = ${t.toFixed(2)} s.`, darkness.length ? `Line sensors at that moment: [${darkness.map((d) => d.toFixed(2)).join(", ")}] (0 = white, 1 = black).` : "No reflectance sensors on the robot."], possible, telemetry, steps: ["Press SHOW ME THE ISSUE to see where it happened.", "Check the sensor readings panel while driving slowly.", "Tune your control logic in Code Studio."], pause: true });
      }
      if (e.type === "collision") this.add({ code: `COLLISION_${Math.floor(t)}`, title: "COLLISION DETECTED", severity: "info", verified: [`Collision at t = ${t.toFixed(2)} s${e.detail ? ` (${e.detail})` : ""}.`], possible: s.track.kind === "race" ? ["Use a distance sensor to slow down near obstacles."] : [], telemetry, steps: [], pause: false }, true);
      if (e.type === "ring-out") {
        const edges = Object.entries(s.sensorReadings(0)).filter(([, r]) => r.kind === "reflectance");
        this.add({ code: "RING_OUT", title: `HEY ${NAME}! YOUR ROBOT LEFT THE ARENA!`, severity: "critical", verified: [`Crossed the boundary at t = ${t.toFixed(2)} s.`, edges.length ? `Edge sensor readings: ${edges.map(([id, r]) => `${s.bridge.graph.parts.find((p) => p.uid === id)?.label ?? id}=${r.kind === "reflectance" ? r.darkness[0].toFixed(2) : "?"}`).join(", ")} (white border ≈ 0).` : "The robot has no edge sensors."], possible: edges.length ? ["Your code may not react to the edge sensors fast enough, or reacts to the wrong level (TCRT5000 module D0 is LOW over white)."] : ["Add downward-facing edge sensors."], telemetry, steps: ["Read the edge sensors every loop, before anything else.", "On white: reverse, then turn away."], pause: true });
      }
      if (e.type === "battery-low") this.add({ code: "BATTERY_LOW", title: "BATTERY VOLTAGE PROBLEM", severity: "warning", verified: [`Battery terminal voltage fell to ${tel.batteryVoltage.toFixed(2)} V.`], possible: ["Motors are stalled or the battery is too small for this load."], telemetry, steps: ["Choose a higher-capacity / higher-discharge battery.", "Avoid stalling the motors for long periods."], pause: false });
    }
  }
}
