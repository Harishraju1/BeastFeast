/**
 * End-to-end tests of the required scenarios that need code + circuit + physics together.
 */
import { describe, expect, it } from "vitest";
import { reference2WD, referenceLineFollower, referenceSumo, wire } from "@/lib/robot/reference";
import { CODE_TEMPLATES } from "@/lib/code/templates";
import { checkCodeAgainstCircuit } from "@/lib/code/check";
import { compile, getBoard } from "@/lib/arduino";
import { SimSession } from "@/lib/sim/session";
import { getExampleTrack } from "@/lib/track/examples";
import type { TrackDef } from "@/lib/sim/types";
import type { Project } from "@/lib/types";

const tpl = (id: string) => CODE_TEMPLATES.find((t) => t.id === id)!.code;
const withCode = (p: Project, code: string): Project => ({ ...p, code });

describe("templates compile on the reference boards", () => {
  for (const t of CODE_TEMPLATES) {
    it(t.id, () => {
      const r = compile(t.code, { board: getBoard(t.id === "sumo" ? "nano" : "uno") });
      expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(r.ok).toBe(true);
    });
  }
});

describe("TEST 4 — code pin differs from circuit", () => {
  it("detects ENA wired to D5 but defined as 11 in code", () => {
    const p = reference2WD();
    const code = tpl("motor-test").replace("#define ENA 5", "#define ENA 11");
    const issues = checkCodeAgainstCircuit(p, compile(code, { board: getBoard("uno") }), "Asha");
    const mm = issues.find((i) => i.code === "C_PIN_MISMATCH");
    expect(mm).toBeTruthy();
    expect(mm!.title).toBe("HEY ASHA! YOUR CODE AND CIRCUIT PIN MAPPING DO NOT MATCH.");
    expect(mm!.incorrect).toContain("D5");
    expect(mm!.incorrect).toContain("D11");
  });
  it("matching code has no pin mismatch", () => {
    const issues = checkCodeAgainstCircuit(reference2WD(), compile(tpl("motor-test"), { board: getBoard("uno") }));
    expect(issues.filter((i) => i.severity === "critical")).toEqual([]);
  });
});

describe("TEST 5 — manual WASD driving through the real circuit", () => {
  it("W drives forward, D turns right, SPACE stops", () => {
    const s = new SimSession({ project: reference2WD(), track: getExampleTrack("example-race-beginner-oval")!, mode: "manual" });
    const start = s.telemetry().pose;
    s.manual = { forward: 1, turn: 0, boost: false, speed: 0.8, estop: false };
    s.advance(1.5);
    const t1 = s.telemetry();
    const dx = t1.pose.x - start.x,
      dy = t1.pose.y - start.y;
    const along = dx * Math.cos(start.heading) + dy * Math.sin(start.heading);
    expect(along).toBeGreaterThan(0.2);
    expect(Math.abs(t1.pose.heading - start.heading)).toBeLessThan(0.15);
    s.manual = { ...s.manual, forward: 1, turn: -1 };
    s.advance(0.8);
    expect(s.telemetry().pose.heading).toBeLessThan(t1.pose.heading - 0.2); // turned clockwise (right)
    s.manual = { ...s.manual, estop: true };
    s.advance(1.0);
    expect(Math.abs(s.telemetry().speed)).toBeLessThan(0.02);
  });
  it("a robot with its driver ground removed cannot be driven", () => {
    let p = reference2WD();
    const uidOf = (l: string) => p.parts.find((x) => x.label === l)!.uid;
    p = { ...p, wires: p.wires.filter((w) => !(w.from.part === uidOf("BAT1") && w.from.pin === "-")) };
    const s = new SimSession({ project: p, track: getExampleTrack("example-race-beginner-oval")!, mode: "manual" });
    s.manual = { forward: 1, turn: 0, boost: true, speed: 1, estop: false };
    s.advance(1);
    expect(Math.abs(s.telemetry().speed)).toBeLessThan(0.01);
    void wire;
  });
});

describe("TEST 2/line — the student's own code follows the line using the robot's own sensors", () => {
  it("PID template completes a lap of the beginner line oval", () => {
    const p = withCode(referenceLineFollower(), tpl("line-pid"));
    const track = getExampleTrack("example-line-beginner-oval")!;
    const s = new SimSession({ project: p, track, mode: "code" });
    expect(s.compileResult?.ok).toBe(true);
    let laps = 0;
    for (let i = 0; i < 60 && laps === 0; i++) {
      s.advance(1, 2000);
      laps = s.events.filter((e) => e.type === "lap" && e.robot === 0).length;
    }
    expect(s.runtimeStatus?.state).not.toBe("error");
    expect(laps).toBeGreaterThanOrEqual(1);
  }, 120_000);
  it("with sensors unplugged the same code cannot follow the line", () => {
    let p = withCode(referenceLineFollower(), tpl("line-pid"));
    const sUid = p.parts.find((x) => x.label === "S1")!.uid;
    p = { ...p, wires: p.wires.filter((w) => w.from.part !== sUid && w.to.part !== sUid) };
    const s = new SimSession({ project: p, track: getExampleTrack("example-line-beginner-oval")!, mode: "code" });
    s.advance(15, 20000);
    expect(s.events.filter((e) => e.type === "lap").length).toBe(0);
  }, 60_000);
});

describe("TEST 6 — custom race track", () => {
  it("simulates the robot on a student-made track", () => {
    const custom: TrackDef = {
      id: "custom-1", name: "My track", kind: "race", difficulty: "beginner", ownerId: "u1", size: { w: 4, h: 3 },
      surface: { color: "#2b2f36", mu: 1, lineColor: "#fff" },
      pieces: [
        { id: "a", type: "start", x: 0, y: 0, rotation: 0, params: { width: 0.4 } },
        { id: "b", type: "straight", x: 0, y: 0, rotation: 0, params: { length: 1.2, width: 0.4 } },
        { id: "c", type: "obstacle", x: 1.6, y: 0, rotation: 0, params: { width: 0.2, depth: 0.2 } },
      ],
      start: { x: 0.1, y: 0, heading: 0 },
    };
    const s = new SimSession({ project: withCode(reference2WD(), tpl("motor-test").replace("delay(1500);\n  Serial.println(\"Both backward\");", "delay(9000);\n  Serial.println(\"Both backward\");")), track: custom, mode: "code" });
    s.advance(5, 6000);
    expect(s.telemetry().pose.x).toBeGreaterThan(0.6);
    expect(s.events.some((e) => e.type === "collision")).toBe(true); // drove into the obstacle
  }, 60_000);
});

describe("TEST 7 — sumo robot vs AI opponent", () => {
  it("runs a match with the student's sumo code and an opponent", () => {
    const p = withCode(referenceSumo(), tpl("sumo"));
    const s = new SimSession({ project: p, track: getExampleTrack("example-sumo-standard-dohyo")!, mode: "code", opponent: "beginner", opponentStartDelayS: 5 });
    expect(s.compileResult?.ok).toBe(true);
    s.advance(4.5, 5000);
    // 5-second start delay in the code: robot has not moved yet
    expect(Math.abs(s.telemetry().speed)).toBeLessThan(0.02);
    for (let i = 0; i < 40 && !s.events.some((e) => e.type === "ring-out"); i++) s.advance(1, 2000);
    expect(s.runtimeStatus?.state).not.toBe("error");
    expect(s.world.robotCount).toBe(2);
    expect(s.events.some((e) => e.type === "ring-out")).toBe(true);
  }, 120_000);
});
