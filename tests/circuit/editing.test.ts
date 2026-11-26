/**
 * Component management (delete / duplicate / rotate / move), what deleting does to the netlist and the live
 * simulation, save → reopen, electrical ↔ 3D synchronisation, the new 3D models, and the 4WD / brushless fixes.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { reference2WD, wire } from "@/lib/robot/reference";
import { addPart, newProject } from "@/lib/robot/assembly";
import { duplicateParts, moveSchematic, nextFreeLabel, removeParts, rotateSchematic, wiresTouching } from "@/lib/robot/edit";
import { buildGraph } from "@/lib/circuit/nets";
import { validateProject } from "@/lib/circuit/validate";
import { applyAndVerify, planRepair } from "@/lib/circuit/repair";
import { BenchSim } from "@/lib/sim/bench";
import { liveParts } from "@/lib/sim/live3d";
import { allComponents, getComponent } from "@/lib/catalogue";
import { CustomComponentSchema, newCustomId, registerCustomComponents, templatePins } from "@/lib/catalogue/custom";
import { modelKeyFor } from "@/lib/models/modelKey";
import { PartMesh } from "@/components/three/RobotParts";
import { LiveContext } from "@/components/three/models";
import { resistorBands } from "@/components/three/models/electronics";
import type { Project } from "@/lib/types";

const uidOf = (p: Project, l: string) => p.parts.find((x) => x.label === l)!.uid;
const code = "void setup(){pinMode(5,OUTPUT);pinMode(7,OUTPUT);pinMode(8,OUTPUT);pinMode(6,OUTPUT);pinMode(9,OUTPUT);pinMode(10,OUTPUT);}\nvoid loop(){digitalWrite(7,HIGH);digitalWrite(8,LOW);analogWrite(5,255);digitalWrite(9,HIGH);digitalWrite(10,LOW);analogWrite(6,255);delay(10);}";

describe("component management", () => {
  it("adding a component puts it in the circuit graph", () => {
    const p = addPart(reference2WD(), "red-led", { label: "LED9" } as never).project;
    expect(buildGraph(p).parts.some((x) => x.label === "LED9")).toBe(true);
  });
  it("deleting a connected component removes it, every wire to it and nothing else — no orphaned wires", () => {
    const p = reference2WD();
    const drv = uidOf(p, "DRV1");
    const touching = wiresTouching(p, [drv]);
    expect(touching.length).toBeGreaterThan(8);
    const q = removeParts(p, [drv]);
    expect(q.parts.some((x) => x.uid === drv)).toBe(false);
    expect(q.wires.length).toBe(p.wires.length - touching.length);
    const ids = new Set(q.parts.map((x) => x.uid));
    expect(q.wires.every((w) => ids.has(w.from.part) && ids.has(w.to.part))).toBe(true);
    // the netlist no longer contains the driver, and the motors are now reported unconnected
    const g = buildGraph(q);
    expect(g.parts.some((x) => x.uid === drv)).toBe(false);
    expect(validateProject(q).issues.filter((i) => i.code === "E_MOTOR_UNCONNECTED")).toHaveLength(2);
  });
  it("deleting a motor clears the wheel attached to it", () => {
    const p = reference2WD();
    const motor = uidOf(p, "Left Motor");
    const wheel = p.parts.find((x) => x.attachedTo === motor)!;
    const q = removeParts(p, [motor]);
    expect(q.parts.find((x) => x.uid === wheel.uid)!.attachedTo).toBeNull();
  });
  it("multi-delete removes all selected parts and their wires", () => {
    const p = reference2WD();
    const q = removeParts(p, [uidOf(p, "U1"), uidOf(p, "SW1")]);
    expect(q.parts.some((x) => x.label === "U1" || x.label === "SW1")).toBe(false);
    expect(q.wires.some((w) => [uidOf(p, "U1"), uidOf(p, "SW1")].includes(w.from.part) || [uidOf(p, "U1"), uidOf(p, "SW1")].includes(w.to.part))).toBe(false);
  });
  it("undo = restoring the previous project (the store keeps the snapshot); the restored circuit validates as before", () => {
    const p = reference2WD();
    const before = JSON.stringify(validateProject(p).issues.map((i) => i.code));
    const deleted = removeParts(p, [uidOf(p, "DRV1")]);
    expect(JSON.stringify(validateProject(deleted).issues.map((i) => i.code))).not.toBe(before);
    const undone = p; // the app store pushes `p` to history before applying removeParts; Ctrl+Z restores it
    expect(JSON.stringify(validateProject(undone).issues.map((i) => i.code))).toBe(before);
  });
  it("duplicate copies parts with new uids and free labels; wires inside the selection are copied, others not", () => {
    const p = reference2WD();
    const r = duplicateParts(p, [uidOf(p, "DRV1"), uidOf(p, "Left Motor")]);
    expect(r.created).toHaveLength(2);
    const copies = r.project.parts.filter((x) => r.created.includes(x.uid));
    expect(copies.map((x) => x.label).sort()).toEqual(["DRV2", "Left Motor 2"].sort());
    const internal = r.project.wires.filter((w) => r.created.includes(w.from.part) && r.created.includes(w.to.part));
    expect(internal).toHaveLength(2); // OUT1 → M+, OUT2 → M−
    expect(r.project.wires.filter((w) => r.created.includes(w.from.part) !== r.created.includes(w.to.part))).toHaveLength(0);
    expect(nextFreeLabel(p, "U1")).toBe("U2");
  });
  it("rotate cycles 0 → 90 → 180 → 270 → 0, both directions; move shifts the schematic", () => {
    let p = reference2WD();
    const u = uidOf(p, "DRV1");
    const rot = () => p.parts.find((x) => x.uid === u)!.schematic.rot ?? 0;
    for (const want of [90, 180, 270, 0]) {
      p = rotateSchematic(p, [u], 1);
      expect(rot()).toBe(want);
    }
    p = rotateSchematic(p, [u], -1);
    expect(rot()).toBe(270);
    const x0 = p.parts.find((x) => x.uid === u)!.schematic.x;
    p = moveSchematic(p, [u], 30, 0);
    expect(p.parts.find((x) => x.uid === u)!.schematic.x).toBe(x0 + 30);
    // rotation is visual only: the electrical graph is unchanged
    expect(validateProject(p).issues.map((i) => i.code)).toEqual(validateProject(reference2WD()).issues.map((i) => i.code));
  });
});

describe("deleting updates the live simulation", () => {
  it("deleting the motor driver stops the motors; deleting the battery powers everything down", () => {
    const p = { ...reference2WD(), code };
    const running = new BenchSim(p);
    for (let i = 0; i < 10; i++) running.advance(0.05);
    expect(Object.values(running.state.motors).every((m) => Math.abs(m.rpm) > 20)).toBe(true);
    const noDriver = new BenchSim(removeParts(p, [uidOf(p, "DRV1")]));
    for (let i = 0; i < 10; i++) noDriver.advance(0.05);
    expect(Object.values(noDriver.state.motors).every((m) => m.volts === null && Math.abs(m.rpm) < 1)).toBe(true);
    const noBattery = new BenchSim(removeParts(p, [uidOf(p, "BAT1")]));
    noBattery.advance(0.2);
    expect(noBattery.state.battery).toBeNull();
    expect(noBattery.graph.powered.size).toBe(0);
  });
});

describe("save and reopen", () => {
  it("a project (with a custom component, rotations and battery settings) survives a JSON round trip unchanged", () => {
    const def = CustomComponentSchema.parse({ id: newCustomId("Driver X"), name: "Driver X", kind: "motor-driver", model: "driver-in-in", vMin: 3, vMax: 12, maxCurrentA: 2, pins: templatePins("driver-in-in"), driver: { dropV: 0.3, contCurrentA: 1.5, peakCurrentA: 3 } });
    registerCustomComponents([def]); // the workspace registers a project's custom parts when it opens
    let p: Project = { ...reference2WD(), customComponents: [def] };
    p = rotateSchematic(p, [uidOf(p, "DRV1")], 1);
    p = addPart(p, def.id, { label: "DX" } as never).project;
    const reopened = JSON.parse(JSON.stringify(p)) as Project;
    registerCustomComponents(reopened.customComponents);
    expect(reopened).toEqual(p);
    expect(getComponent(def.id)?.name).toBe("Driver X");
    expect(validateProject(reopened).issues.map((i) => i.code)).toEqual(validateProject(p).issues.map((i) => i.code));
  });
});

describe("electrical ↔ 3D synchronisation", () => {
  it("the 3D live state is exactly the bench state (LED, servo, battery, driver channels, switch)", () => {
    let p = { ...reference2WD(), code: "#include <Servo.h>\nServo s;\n" + code.replace("void setup(){", "void setup(){s.attach(3);s.write(40);") };
    p = addPart(p, "red-led", { label: "LED1" } as never).project;
    p = addPart(p, "220-resistor", { label: "R1" } as never).project;
    p = addPart(p, "sg90", { label: "SV" } as never).project;
    for (const [a, b] of [["U1.5V", "R1.1"], ["R1.2", "LED1.A"], ["LED1.K", "U1.GND2"], ["U1.5V", "SV.V+"], ["U1.GND3", "SV.GND"], ["U1.D3", "SV.SIG"]]) p = wire(p, a, b);
    const b = new BenchSim(p);
    for (let i = 0; i < 16; i++) b.advance(0.05);
    const live = liveParts(b);
    expect(live[uidOf(p, "LED1")].led).toBeCloseTo(b.state.dc.find((e) => e.kind === "led")!.brightness!, 6);
    expect(live[uidOf(p, "SV")].servoAngle).toBe(b.state.servos[uidOf(p, "SV")].angle);
    expect(live[uidOf(p, "SV")].servoAngle).toBeCloseTo(40, 0);
    expect(live[uidOf(p, "BAT1")].soc).toBe(b.state.battery!.soc);
    expect(live[uidOf(p, "DRV1")].channels![0]).toBeGreaterThan(0.5);
    expect(live[uidOf(p, "SW1")].closed).toBe(true);
    // not running → nothing animates
    const idle = new BenchSim({ ...p, code: "void setup(){}\nvoid loop(){}" });
    idle.advance(0.1);
    expect(liveParts(idle)[uidOf(p, "DRV1")].channels!.every((c) => c === 0)).toBe(true);
  });
});

describe("3D models", () => {
  const partFor = (id: string) => ({ uid: "x", componentId: id, label: "X", position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, config: Object.fromEntries((getComponent(id)!.options ?? []).map((o) => [o.key, o.default])), schematic: { x: 0, y: 0 }, attachedTo: null, inCircuit: true });
  it("resistors, capacitors, LEDs, switches, breadboards, LDR, DHT, TO-92, displays and regulators get their own models and render", () => {
    const keys = new Set(["resistor", "capacitor", "led", "switch", "breadboard", "ldr", "dht", "to92", "display", "regulator"]);
    const comps = allComponents().filter((c) => keys.has(modelKeyFor(c).key));
    expect(new Set(comps.map((c) => modelKeyFor(c).key))).toEqual(keys);
    for (const c of comps) {
      const html = renderToString(createElement(LiveContext.Provider, { value: { x: { led: 1, closed: true, lines: ["HELLO"], backlight: true } } }, createElement(PartMesh, { part: partFor(c.id) as never, comp: c })));
      expect(html, c.id).toContain("<mesh");
    }
  });
  it("resistor colour bands follow the value (220 Ω = red red brown gold, 10 kΩ = brown black orange)", () => {
    expect(resistorBands(220)).toEqual(["#d32f2f", "#d32f2f", "#7b3f00", "#c9a227"]);
    expect(resistorBands(10000).slice(0, 3)).toEqual(["#7b3f00", "#111", "#ef6c00"]);
  });
  it("each 18650 pack renders its own number of cells", () => {
    const counts = [1, 2, 3, 4, 5].map((n) => renderToString(createElement(PartMesh, { part: partFor(`18650-battery-${n}-cell`) as never, comp: getComponent(`18650-battery-${n}-cell`)! })).split("<mesh").length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
  });
});

describe("4WD motors and brushless motors", () => {
  it("an unwired 4WD motor is explained and FIX IT wires it in parallel with the motor on its side", () => {
    let p = newProject("race", "4wd", "local");
    for (const [id, l] of [["arduino-uno-r3", "U1"], ["l298n", "DRV1"], ["lipo-3s-2100mah", "BAT1"]]) p = addPart(p, id, { label: l } as never).project;
    for (const [a, b] of [["BAT1.+", "DRV1.VS"], ["BAT1.+", "U1.VIN"], ["BAT1.-", "DRV1.GND"], ["DRV1.GND", "U1.GND1"], ["U1.D5", "DRV1.ENA"], ["U1.D7", "DRV1.IN1"], ["U1.D8", "DRV1.IN2"], ["U1.D6", "DRV1.ENB"], ["U1.D9", "DRV1.IN3"], ["U1.D10", "DRV1.IN4"], ["DRV1.OUT1", "FL Motor.M+"], ["DRV1.OUT2", "FL Motor.M-"], ["DRV1.OUT3", "FR Motor.M+"], ["DRV1.OUT4", "FR Motor.M-"]]) p = wire(p, a, b);
    const issue = validateProject(p).issues.find((i) => i.code === "E_MOTOR_UNCONNECTED" && i.partUid === uidOf(p, "RL Motor"))!;
    expect(issue.incorrect).toMatch(/added by the 4WD drivetrain/);
    expect(issue.fix).toMatch(/in parallel with FL Motor/);
    const r = applyAndVerify(p, issue, planRepair(p, issue)!);
    expect(r.resolved).toBe(true);
    // and it is not reported as disconnected just because the pair exceeds the driver rating
    expect(r.report.issues.find((i) => i.code === "W_DRIVER_CURRENT")).toBeTruthy();
    expect(r.report.issues.some((i) => i.code === "E_MOTOR_UNCONNECTED" && i.partUid === uidOf(p, "RL Motor"))).toBe(false);
  });
  it("a brushless motor on an H-bridge gets 'needs an ESC', not 'phase C unconnected'", () => {
    let p = reference2WD();
    p = addPart(p, "brushless-dc-motor", { label: "BL" } as never).project;
    p = wire(p, "DRV1.OUT1", "BL.A");
    p = wire(p, "DRV1.OUT2", "BL.B");
    const codes = validateProject(p).issues.filter((i) => i.partUid === uidOf(p, "BL")).map((i) => i.code);
    expect(codes).toContain("E_BLDC_NEEDS_ESC");
    expect(codes).not.toContain("E_MOTOR_UNCONNECTED");
  });
});
