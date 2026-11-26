/**
 * Client-side compute benchmark: validation, recommendations, repair planning, the DC solver and the circuit
 * bench all run in the student's browser (no server round trip). This measures how long they take on this
 * machine for the reference robots, so the cost per student is known.
 *
 *   npm run sim:bench
 */
import { performance } from "node:perf_hooks";
import { reference2WD, referenceLineFollower, referenceSumo } from "@/lib/robot/reference";
import { validateProject } from "@/lib/circuit/validate";
import { recommendAll } from "@/lib/circuit/recommend";
import { planRepair } from "@/lib/circuit/repair";
import { BenchSim } from "@/lib/sim/bench";
import type { Project } from "@/lib/types";

const code = `#define ENA 5
#define IN1 7
#define IN2 8
#define ENB 6
#define IN3 9
#define IN4 10
void setup(){ pinMode(ENA,OUTPUT); pinMode(IN1,OUTPUT); pinMode(IN2,OUTPUT); pinMode(ENB,OUTPUT); pinMode(IN3,OUTPUT); pinMode(IN4,OUTPUT); }
void loop(){ digitalWrite(IN1,HIGH); digitalWrite(IN2,LOW); analogWrite(ENA,200); digitalWrite(IN3,HIGH); digitalWrite(IN4,LOW); analogWrite(ENB,150); delay(20); }`;

function time(label: string, n: number, fn: () => void) {
  fn(); // warm-up
  const t = performance.now();
  for (let i = 0; i < n; i++) fn();
  const ms = (performance.now() - t) / n;
  console.log(`${label.padEnd(58)} ${ms.toFixed(2).padStart(8)} ms`);
  return ms;
}

const robots: [string, Project][] = [["2WD (Uno + L298N)", reference2WD()], ["line follower (+5-ch IR array)", referenceLineFollower()], ["sumo (Nano + TB6612 + 3 sensors)", referenceSumo()]];
console.log("BEAST FEAST client-side compute (per call, this machine)\n");
for (const [name, p] of robots) {
  time(`validate — ${name}`, 50, () => validateProject(p));
  time(`recommendations for every part — ${name}`, 20, () => recommendAll(p));
}
const broken = (() => {
  const p = reference2WD();
  const U1 = p.parts.find((x) => x.label === "U1")!.uid;
  return { ...p, wires: p.wires.filter((w) => !(w.from.part === U1 && w.from.pin === "D5")) };
})();
const issue = validateProject(broken).issues.find((i) => i.code === "E_DRIVER_EN_UNCONNECTED")!;
time("repair plan (ENA unwired)", 50, () => planRepair(broken, issue));
const bench = new BenchSim({ ...reference2WD(), code });
time("bench: 1 s of simulated time (1000 code steps + motors)", 10, () => {
  bench.advance(0.4);
  bench.advance(0.4);
  bench.advance(0.2);
});
time("bench: one 50 ms UI frame", 50, () => bench.advance(0.05));
console.log("\nThe bench needs one 50 ms step per animation frame; anything well under 16 ms keeps 60 fps.");
