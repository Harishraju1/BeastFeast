/**
 * L298N simulation — the 12 required scenarios, exercised through the real circuit graph and the
 * electrical bridge (the same code path the arena uses), not through mocks.
 */
import { describe, expect, it } from "vitest";
import { reference2WD, wire } from "@/lib/robot/reference";
import { addPart, newProject } from "@/lib/robot/assembly";
import { RobotElectrical } from "@/lib/robot/bridge";
import { validateProject } from "@/lib/circuit/validate";
import type { Project } from "@/lib/types";

const uidOf = (p: Project, label: string) => p.parts.find((x) => x.label === label)!.uid;
const unwire = (p: Project, a: string, b: string): Project => {
  const [ap, apin] = a.split("."), [bp, bpin] = b.split(".");
  const A = uidOf(p, ap), B = uidOf(p, bp);
  return { ...p, wires: p.wires.filter((w) => !((w.from.part === A && w.from.pin === apin && w.to.part === B && w.to.pin === bpin) || (w.to.part === A && w.to.pin === apin && w.from.part === B && w.from.pin === bpin))) };
};
const add = (p: Project, id: string, label?: string, config?: Record<string, number | boolean | string>) => addPart(p, id, { ...(label ? { label } : {}), ...(config ? { config } : {}) } as never).project;

/** Drive the reference wiring: ENA=D5, IN1=D7, IN2=D8, IN3=D9, IN4=D10, ENB=D6. */
function drive(e: RobotElectrical, a: { in1: 0 | 1; in2: 0 | 1; en: number }, b: { in3: 0 | 1; in4: 0 | 1; en: number }) {
  for (const pin of [5, 6, 7, 8, 9, 10]) e.pinMode(pin, "OUTPUT");
  e.digitalWrite(7, a.in1);
  e.digitalWrite(8, a.in2);
  e.analogWrite(5, a.en);
  e.digitalWrite(9, b.in3);
  e.digitalWrite(10, b.in4);
  e.analogWrite(6, b.en);
  return e.motorCommands();
}
const motorV = (p: Project, cmds: Record<string, number>, label: string) => cmds[uidOf(p, label)];

/** Minimal build a beginner makes: no switch, battery straight to VS and VIN, one motor per channel. */
function beginnerBuild(opts: { cells?: number; motorB?: boolean; motorA?: boolean } = {}): Project {
  let p = newProject("race", "L298N test", "local", { drivetrain: "none" });
  p = add(p, "arduino-uno-r3", "U1");
  p = add(p, "l298n", "DRV1");
  p = add(p, "18650-li-ion-cell", "BAT1", { series: opts.cells ?? 2, capacity: 2500 });
  if (opts.motorA !== false) p = add(p, "tt-yellow-gear-motor", "MA");
  if (opts.motorB !== false) p = add(p, "tt-yellow-gear-motor", "MB");
  const W: [string, string][] = [
    ["BAT1.+", "DRV1.VS"], ["BAT1.+", "U1.VIN"], ["BAT1.-", "DRV1.GND"], ["DRV1.GND", "U1.GND1"],
    ["U1.D5", "DRV1.ENA"], ["U1.D7", "DRV1.IN1"], ["U1.D8", "DRV1.IN2"],
    ["U1.D9", "DRV1.IN3"], ["U1.D10", "DRV1.IN4"], ["U1.D6", "DRV1.ENB"],
  ];
  if (opts.motorA !== false) W.push(["DRV1.OUT1", "MA.M+"], ["DRV1.OUT2", "MA.M-"]);
  if (opts.motorB !== false) W.push(["DRV1.OUT3", "MB.M+"], ["DRV1.OUT4", "MB.M-"]);
  for (const [a, b] of W) p = wire(p, a, b);
  return p;
}

describe("L298N — H-bridge simulation", () => {
  it("1. one motor on channel A only: runs, channel B idle", () => {
    const p = beginnerBuild({ motorB: false });
    const c = drive(new RobotElectrical(p), { in1: 1, in2: 0, en: 255 }, { in3: 1, in4: 0, en: 255 });
    expect(motorV(p, c, "MA")).toBeCloseTo(7.4 - 2, 1);
    expect(Object.keys(c)).toHaveLength(1);
  });

  it("2. one motor on channel B only", () => {
    const p = beginnerBuild({ motorA: false });
    const c = drive(new RobotElectrical(p), { in1: 0, in2: 0, en: 0 }, { in3: 1, in4: 0, en: 255 });
    expect(motorV(p, c, "MB")).toBeCloseTo(5.4, 1);
  });

  it("3. two motors are independent loads (A stopped while B runs)", () => {
    const p = beginnerBuild();
    const c = drive(new RobotElectrical(p), { in1: 0, in2: 0, en: 255 }, { in3: 1, in4: 0, en: 255 });
    expect(motorV(p, c, "MA")).toBeCloseTo(0, 5);
    expect(motorV(p, c, "MB")).toBeCloseTo(5.4, 1);
  });

  it("4. both motors forward", () => {
    const p = beginnerBuild();
    const c = drive(new RobotElectrical(p), { in1: 1, in2: 0, en: 255 }, { in3: 1, in4: 0, en: 255 });
    expect(motorV(p, c, "MA")).toBeGreaterThan(5);
    expect(motorV(p, c, "MB")).toBeGreaterThan(5);
  });

  it("5. both motors backward", () => {
    const p = beginnerBuild();
    const c = drive(new RobotElectrical(p), { in1: 0, in2: 1, en: 255 }, { in3: 0, in4: 1, en: 255 });
    expect(motorV(p, c, "MA")).toBeLessThan(-5);
    expect(motorV(p, c, "MB")).toBeLessThan(-5);
  });

  it("6. one forward, one backward (spin on the spot)", () => {
    const p = beginnerBuild();
    const c = drive(new RobotElectrical(p), { in1: 1, in2: 0, en: 255 }, { in3: 0, in4: 1, en: 255 });
    expect(motorV(p, c, "MA")).toBeGreaterThan(5);
    expect(motorV(p, c, "MB")).toBeLessThan(-5);
  });

  it("7. different PWM duty on ENA and ENB gives different speeds", () => {
    const p = beginnerBuild();
    const c = drive(new RobotElectrical(p), { in1: 1, in2: 0, en: 255 }, { in3: 1, in4: 0, en: 102 });
    expect(motorV(p, c, "MA")).toBeCloseTo(5.4, 1);
    expect(motorV(p, c, "MB")).toBeCloseTo(5.4 * (102 / 255), 1);
  });

  it("8. stopping: IN1=IN2 brakes (0 V), EN=0 coasts (outputs off)", () => {
    const p = beginnerBuild();
    const brake = drive(new RobotElectrical(p), { in1: 1, in2: 1, en: 255 }, { in3: 0, in4: 0, en: 255 });
    expect(motorV(p, brake, "MA")).toBeCloseTo(0, 5);
    expect(motorV(p, brake, "MB")).toBeCloseTo(0, 5);
    const coast = drive(new RobotElectrical(p), { in1: 1, in2: 0, en: 0 }, { in3: 1, in4: 0, en: 0 });
    expect(motorV(p, coast, "MA")).toBeUndefined();
    expect(motorV(p, coast, "MB")).toBeUndefined();
  });

  it("9. incorrect enable wiring: ENA unwired with jumper removed → channel A never runs and validation says why", () => {
    const p = unwire(beginnerBuild(), "U1.D5", "DRV1.ENA");
    const c = drive(new RobotElectrical(p), { in1: 1, in2: 0, en: 255 }, { in3: 1, in4: 0, en: 255 });
    expect(motorV(p, c, "MA")).toBeUndefined();
    expect(motorV(p, c, "MB")).toBeGreaterThan(5);
    const r = validateProject(p);
    expect(r.issues.find((i) => i.code === "E_DRIVER_EN_UNCONNECTED" && i.pinId === "ENA")).toBeTruthy();
  });

  it("9b. ENA jumper fitted: full speed without a wire", () => {
    let p = unwire(beginnerBuild(), "U1.D5", "DRV1.ENA");
    p = { ...p, parts: p.parts.map((x) => (x.label === "DRV1" ? { ...x, config: { ...x.config, enaJumper: true } } : x)) };
    const c = drive(new RobotElectrical(p), { in1: 1, in2: 0, en: 0 }, { in3: 0, in4: 0, en: 0 });
    expect(motorV(p, c, "MA")).toBeCloseTo(5.4, 1);
  });

  it("10. insufficient supply: 1S (3.7 V) is below VS minimum and the motor gets almost nothing", () => {
    const p = beginnerBuild({ cells: 1 });
    const r = validateProject(p);
    expect(r.issues.some((i) => i.code === "W_UNDERVOLTAGE" && i.pinId === "VS")).toBe(true);
    const c = drive(new RobotElectrical(p), { in1: 1, in2: 0, en: 255 }, { in3: 1, in4: 0, en: 255 });
    expect(Math.abs(motorV(p, c, "MA") ?? 0)).toBeLessThan(2);
  });

  it("11. excessive current: two motors in parallel on one channel sum their stall current", () => {
    let p = beginnerBuild();
    p = add(p, "tt-yellow-gear-motor", "MA2");
    p = add(p, "tt-yellow-gear-motor", "MA3");
    p = add(p, "tt-yellow-gear-motor", "MA4");
    for (const m of ["MA2", "MA3", "MA4"]) {
      p = wire(p, "DRV1.OUT1", `${m}.M+`);
      p = wire(p, "DRV1.OUT2", `${m}.M-`);
    }
    const r = validateProject(p);
    const w = r.issues.find((i) => i.code === "W_DRIVER_CURRENT");
    expect(w).toBeTruthy();
    expect(w!.incorrect).toMatch(/channel A/);
    // parallel motors still all receive the channel voltage in the simulation (they are not merged into one)
    const c = drive(new RobotElectrical(p), { in1: 1, in2: 0, en: 255 }, { in3: 0, in4: 0, en: 0 });
    for (const m of ["MA", "MA2", "MA3", "MA4"]) expect(motorV(p, c, m)).toBeCloseTo(5.4, 1);
  });

  it("12. invalid pin connections: motor across two channels and a motor on a GPIO are reported", () => {
    let p = beginnerBuild({ motorB: false });
    p = unwire(p, "DRV1.OUT2", "MA.M-");
    p = wire(p, "DRV1.OUT3", "MA.M-");
    expect(validateProject(p).issues.some((i) => i.code === "W_MOTOR_SPLIT_CHANNELS")).toBe(true);
    let q = beginnerBuild({ motorB: false });
    q = unwire(q, "DRV1.OUT1", "MA.M+");
    q = wire(q, "U1.D3", "MA.M+");
    expect(validateProject(q).issues.some((i) => i.code === "E_MOTOR_ON_GPIO")).toBe(true);
  });

  it("logic supply: jumper removed and +5V unfed → driver ignores inputs (sim agrees with validation)", () => {
    let p = beginnerBuild();
    p = { ...p, parts: p.parts.map((x) => (x.label === "DRV1" ? { ...x, config: { ...x.config, regJumper: false } } : x)) };
    expect(validateProject(p).issues.some((i) => i.code === "E_L298N_NO_LOGIC")).toBe(true);
    const c = drive(new RobotElectrical(p), { in1: 1, in2: 0, en: 255 }, { in3: 1, in4: 0, en: 255 });
    expect(motorV(p, c, "MA")).toBeUndefined();
    // feeding +5V from the Uno fixes it
    p = wire(p, "U1.5V", "DRV1.5V");
    const c2 = drive(new RobotElectrical(p), { in1: 1, in2: 0, en: 255 }, { in3: 1, in4: 0, en: 255 });
    expect(motorV(p, c2, "MA")).toBeGreaterThan(5);
  });

  it("Uno powered from the L298N +5V output (jumper fitted) still drives both motors", () => {
    let p = unwire(beginnerBuild(), "BAT1.+", "U1.VIN");
    p = wire(p, "DRV1.5V", "U1.5V");
    const r = validateProject(p);
    expect(r.issues.filter((i) => i.severity === "critical" && (i.area === "electrical" || i.area === "power"))).toEqual([]);
    const c = drive(new RobotElectrical(p), { in1: 1, in2: 0, en: 200 }, { in3: 0, in4: 1, en: 120 });
    expect(motorV(p, c, "MA")).toBeGreaterThan(3);
    expect(motorV(p, c, "MB")).toBeLessThan(-2);
  });

  it("reference 2WD (with switch, mirrored right motor) drives forward on both sides", () => {
    const p = reference2WD();
    const c = drive(new RobotElectrical(p), { in1: 1, in2: 0, en: 255 }, { in3: 1, in4: 0, en: 255 });
    expect(motorV(p, c, "Left Motor")).toBeGreaterThan(5);
    expect(motorV(p, c, "Right Motor")).toBeLessThan(-5); // leads swapped on purpose for the mirrored motor
  });
});
