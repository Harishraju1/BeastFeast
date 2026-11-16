/**
 * Reference robots built through the same public API students use (addPart + wires).
 * Used by tests and offered in the UI as optional "inspect an example" projects — never forced.
 */
import type { CompetitionId, Project, Wire, WireColor } from "@/lib/types";
import { addPart, newProject, uid } from "./assembly";

export function wire(project: Project, from: string, to: string, color: WireColor = "yellow"): Project {
  const [fp, fpin] = from.split(".");
  const [tp, tpin] = to.split(".");
  const byLabel = (l: string) => project.parts.find((p) => p.label === l || p.uid === l)?.uid;
  const w: Wire = { id: uid("w"), from: { part: byLabel(fp) ?? fp, pin: fpin }, to: { part: byLabel(tp) ?? tp, pin: tpin }, color };
  if (!w.from.part || !w.to.part) throw new Error(`wire: unknown part in ${from} -> ${to}`);
  return { ...project, wires: [...project.wires, w] };
}

function add(p: Project, id: string, label?: string, config?: Record<string, number | boolean | string>): Project {
  const r = addPart(p, id, { ...(label ? { label } : {}), ...(config ? { config } : {}) } as never);
  return r.project;
}

/** TEST 1: 2WD robot — Arduino Uno, L298N, two TT motors, wheels, caster, 2S 18650 pack, power switch. */
export function reference2WD(competition: CompetitionId = "race", ownerId = "local"): Project {
  let p = newProject(competition, "Reference 2WD", ownerId);
  p = add(p, "2wd-robot-chassis");
  p = add(p, "tt-yellow-gear-motor");
  p = add(p, "tt-yellow-gear-motor");
  p = add(p, "rubber-robot-wheels");
  p = add(p, "rubber-robot-wheels");
  p = add(p, "ball-caster-wheels");
  p = add(p, "arduino-uno-r3", "U1");
  p = add(p, "l298n", "DRV1");
  p = add(p, "18650-li-ion-cell", "BAT1", { series: 2, capacity: 2500 });
  p = add(p, "toggle-switch", "SW1");
  const W: [string, string, WireColor][] = [
    ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VS", "red"], ["SW1.2", "U1.VIN", "red"],
    ["BAT1.-", "DRV1.GND", "black"], ["DRV1.GND", "U1.GND1", "black"],
    ["U1.D5", "DRV1.ENA", "yellow"], ["U1.D7", "DRV1.IN1", "yellow"], ["U1.D8", "DRV1.IN2", "yellow"],
    ["U1.D9", "DRV1.IN3", "yellow"], ["U1.D10", "DRV1.IN4", "yellow"], ["U1.D6", "DRV1.ENB", "yellow"],
    ["DRV1.OUT1", "Left Motor.M+", "orange"], ["DRV1.OUT2", "Left Motor.M-", "orange"],
    // right motor is mounted mirrored, so its leads are swapped to make "forward" match the left side
    ["DRV1.OUT3", "Right Motor.M-", "orange"], ["DRV1.OUT4", "Right Motor.M+", "orange"],
  ];
  for (const [a, b, c] of W) p = wire(p, a, b, c);
  return p;
}

/** TEST 2: line follower — reference 2WD plus a 5-channel IR array on A0–A4. */
export function referenceLineFollower(ownerId = "local"): Project {
  let p = reference2WD("line", ownerId);
  p = { ...p, name: "Reference Line Follower", chassis: { ...p.chassis!, componentId: "line-follower-chassis" } };
  p = add(p, "5-channel-ir-sensor-array", "S1");
  const W: [string, string, WireColor][] = [
    ["U1.5V", "S1.VCC", "red"], ["U1.GND2", "S1.GND", "black"],
    ["S1.S1", "U1.A0", "yellow"], ["S1.S2", "U1.A1", "yellow"], ["S1.S3", "U1.A2", "yellow"], ["S1.S4", "U1.A3", "yellow"], ["S1.S5", "U1.A4", "yellow"],
  ];
  for (const [a, b, c] of W) p = wire(p, a, b, c);
  return p;
}

/** TEST 7: sumo robot — reference 2WD on a mini-sumo chassis with HC-SR04, two edge sensors and a wedge. */
export function referenceSumo(ownerId = "local"): Project {
  let p = reference2WD("sumo", ownerId);
  p = { ...p, name: "Reference Sumo", parts: [], wires: [] };
  p = add(p, "mini-sumo-robot-chassis");
  p = add(p, "n20-micro-metal-gear-motor");
  p = add(p, "n20-micro-metal-gear-motor");
  p = add(p, "sumo-robot-wheels", undefined, { diameter: 32, width: 12 });
  p = add(p, "sumo-robot-wheels", undefined, { diameter: 32, width: 12 });
  p = add(p, "ball-caster-wheels");
  p = add(p, "arduino-nano", "U1");
  p = add(p, "tb6612fng", "DRV1");
  p = add(p, "lipo-2s-battery", "BAT1", { capacity: 450 });
  p = add(p, "toggle-switch", "SW1");
  p = add(p, "hc-sr04", "S1");
  p = add(p, "tcrt5000-edge-detection-sensor", "S2");
  p = add(p, "tcrt5000-edge-detection-sensor", "S3");
  p = add(p, "front-wedge", "WEDGE");
  const W: [string, string, WireColor][] = [
    ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VM", "red"], ["SW1.2", "U1.VIN", "red"],
    ["BAT1.-", "DRV1.GND", "black"], ["DRV1.GND", "U1.GND1", "black"], ["U1.5V", "DRV1.VCC", "red"],
    ["U1.D5", "DRV1.PWMA", "yellow"], ["U1.D7", "DRV1.AIN1", "yellow"], ["U1.D8", "DRV1.AIN2", "yellow"],
    ["U1.D6", "DRV1.PWMB", "yellow"], ["U1.D9", "DRV1.BIN1", "yellow"], ["U1.D10", "DRV1.BIN2", "yellow"], ["U1.D4", "DRV1.STBY", "yellow"],
    ["DRV1.AO1", "Left Motor.M+", "orange"], ["DRV1.AO2", "Left Motor.M-", "orange"],
    ["DRV1.BO1", "Right Motor.M-", "orange"], ["DRV1.BO2", "Right Motor.M+", "orange"],
    ["U1.5V", "S1.VCC", "red"], ["U1.GND2", "S1.GND", "black"], ["U1.D11", "S1.TRIG", "yellow"], ["S1.ECHO", "U1.D12", "yellow"],
    ["U1.5V", "S2.VCC", "red"], ["U1.GND2", "S2.GND", "black"], ["S2.D0", "U1.D2", "yellow"],
    ["U1.5V", "S3.VCC", "red"], ["U1.GND2", "S3.GND", "black"], ["S3.D0", "U1.D3", "yellow"],
  ];
  for (const [a, b, c] of W) p = wire(p, a, b, c);
  return p;
}
