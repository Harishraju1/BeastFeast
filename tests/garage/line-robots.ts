/**
 * Test robots for the Code Studio line templates (line-basic / line-pid).
 *
 * - `referenceLineFollower()` (src/lib/robot/reference.ts) is the old 2WD + caster robot; students' saved
 *   2WD projects still look like it, so the templates keep being tested on it.
 * - `studentLineFollower4WD()` is what a student builds today: a new line project (4WD by default), the same
 *   Uno + L298N + 2S 18650 electronics and a 5-channel IR array, with the left motor pair in parallel on
 *   OUT1/OUT2 and the right pair on OUT3/OUT4 — so the templates' pins work unchanged.
 */
import type { Project, WireColor } from "@/lib/types";
import { addPart, newProject } from "@/lib/robot/assembly";
import { wire } from "@/lib/robot/reference";

export function studentLineFollower4WD(ownerId = "local"): Project {
  let p = newProject("line", "Student 4WD Line Follower", ownerId);
  const add = (id: string, label: string, config?: Record<string, number | boolean | string>, position?: { x: number; y: number; z: number }) => {
    p = addPart(p, id, { label, ...(config ? { config } : {}), ...(position ? { position } : {}) } as never).project;
  };
  add("arduino-uno-r3", "U1");
  add("l298n", "DRV1");
  // battery on standoffs above the Uno, set back so the centre of mass is over the middle of the wheels
  // (a well-balanced 4WD robot pivots on the spot instead of wandering)
  add("18650-li-ion-cell", "BAT1", { series: 2, capacity: 2500 }, { x: -33, y: 0, z: 47.5 });
  add("toggle-switch", "SW1");
  add("5-channel-ir-sensor-array", "S1");
  const W: [string, string, WireColor][] = [
    ["BAT1.+", "SW1.1", "red"], ["SW1.2", "DRV1.VS", "red"], ["SW1.2", "U1.VIN", "red"],
    ["BAT1.-", "DRV1.GND", "black"], ["DRV1.GND", "U1.GND1", "black"],
    ["U1.D5", "DRV1.ENA", "yellow"], ["U1.D7", "DRV1.IN1", "yellow"], ["U1.D8", "DRV1.IN2", "yellow"],
    ["U1.D9", "DRV1.IN3", "yellow"], ["U1.D10", "DRV1.IN4", "yellow"], ["U1.D6", "DRV1.ENB", "yellow"],
    // left pair in parallel on channel A, right pair (mirrored, leads swapped) on channel B
    ["DRV1.OUT1", "FL Motor.M+", "orange"], ["DRV1.OUT2", "FL Motor.M-", "orange"],
    ["DRV1.OUT1", "RL Motor.M+", "orange"], ["DRV1.OUT2", "RL Motor.M-", "orange"],
    ["DRV1.OUT3", "FR Motor.M-", "orange"], ["DRV1.OUT4", "FR Motor.M+", "orange"],
    ["DRV1.OUT3", "RR Motor.M-", "orange"], ["DRV1.OUT4", "RR Motor.M+", "orange"],
    ["U1.5V", "S1.VCC", "red"], ["U1.GND2", "S1.GND", "black"],
    ["S1.S1", "U1.A0", "yellow"], ["S1.S2", "U1.A1", "yellow"], ["S1.S3", "U1.A2", "yellow"], ["S1.S4", "U1.A3", "yellow"], ["S1.S5", "U1.A4", "yellow"],
  ];
  for (const [a, b, c] of W) p = wire(p, a, b, c);
  return p;
}
