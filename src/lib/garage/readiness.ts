/**
 * Automated readiness test for reference projects. A project is only "READY TO SIMULATE" when its
 * real circuit validates, its real firmware compiles and matches the circuit, every simulated part has
 * a model, the robot starts in a valid place AND a live simulation runs without a runtime error.
 * A 3D model loading proves nothing and is not a check.
 */
import { getComponent } from "@/lib/catalogue";
import { validateProject } from "@/lib/circuit/validate";
import { compile, getBoard } from "@/lib/arduino";
import { checkCodeAgainstCircuit } from "@/lib/code/check";
import { buildRobotSpec } from "@/lib/robot/model";
import { SimSession } from "@/lib/sim/session";
import { getExampleTrack } from "@/lib/track/examples";
import type { TrackDef } from "@/lib/sim/types";
import type { Project } from "@/lib/types";
import { buildFromTemplate } from "./build";
import type { ProjectTemplate, ReadinessCheck, ReadinessReport } from "./types";
import { validateTemplate } from "./validateTemplate";

const has = (codes: string[], prefix: RegExp) => codes.filter((c) => prefix.test(c));

export function runReadiness(t: ProjectTemplate, opts: { simSeconds?: number; project?: Project; track?: TrackDef } = {}): ReadinessReport {
  const checks: ReadinessCheck[] = [];
  const add = (name: string, ok: boolean, detail: string, warning = false) => checks.push({ id: checks.length + 1, name, ok, warning: ok && warning, detail });

  let project: Project;
  try {
    project = opts.project ?? buildFromTemplate(t, "readiness", "original");
  } catch (e) {
    add("Project builds from its definition", false, (e as Error).message);
    return { templateId: t.metadata.id, status: "NOT READY", checks, at: new Date().toISOString() };
  }
  const report = validateProject(project, "Engineer");
  const crit = report.issues.filter((i) => i.severity === "critical").map((i) => i.code);
  const warn = report.issues.filter((i) => i.severity === "warning").map((i) => i.code);
  const kinds = project.parts.map((p) => getComponent(p.componentId)?.kind);

  // 1
  const missingIds = t.parts.filter((p) => !getComponent(p.componentId)).map((p) => p.componentId);
  // race robots may be driver-controlled (no sensors); line and sumo robots must carry sensors
  const needSensor = t.metadata.competition === "race" || project.parts.some((p) => getComponent(p.componentId)?.sensor);
  add(
    "Every required component exists",
    !missingIds.length && !crit.includes("E_MISSING_COMPONENT") && kinds.filter((k) => k === "dc-motor").length >= 2 && kinds.includes("controller") && kinds.includes("battery") && needSensor,
    missingIds.length ? `Not in the catalogue: ${missingIds.join(", ")}` : `${project.parts.length} catalogue parts on a ${getComponent(project.chassis!.componentId)?.name}`,
  );
  // 2
  const mechCrit = report.issues.filter((i) => i.area === "mechanical" && i.severity === "critical");
  const mechWarn = report.issues.filter((i) => i.area === "mechanical" && i.severity === "warning");
  add("Mechanical assembly is complete", !mechCrit.length, mechCrit.length ? mechCrit.map((i) => i.title).join("; ") : mechWarn.length ? `${mechWarn.length} warning(s): ${mechWarn.map((i) => i.code).join(", ")}` : "No mechanical problems", mechWarn.length > 0);
  // 3
  const motorProblems = has(crit, /^M_(MOTOR_NO_WHEEL|MOTOR_ORIENTATION|ONE_SIDED)$/);
  add("Motors are attached correctly", !motorProblems.length, motorProblems.length ? motorProblems.join(", ") : `${kinds.filter((k) => k === "dc-motor").length} motors, each driving a wheel`);
  // 4
  const wheelProblems = has(crit, /^M_WHEEL_/);
  add("Wheels are attached correctly", !wheelProblems.length, wheelProblems.length ? wheelProblems.join(", ") : "Every wheel is on a motor shaft");
  // 5
  const sensorWarn = has(warn, /^M_SENSOR_/);
  add("Sensor positions are valid", true, sensorWarn.length ? `Warnings: ${sensorWarn.join(", ")}` : "Sensors mounted where they can see their targets", sensorWarn.length > 0);
  // 6
  const wiring = crit.filter((c) => /UNCONNECTED|MOTOR_|DRIVER_|STBY|TRIG|GPIO|OUTPUT_CONFLICT|DUPLICATE|ANALOG|DIGITAL|BUS|UART|I2C|PWM/.test(c));
  add("Circuit connections are complete", !wiring.length, wiring.length ? wiring.join(", ") : `${project.wires.length} wires, no open or conflicting connections`);
  // 7
  const power = report.issues.filter((i) => i.area === "power" && i.severity === "critical").map((i) => i.code);
  add("Power connections are valid", !power.length, power.length ? power.join(", ") : "Every supply input is within its voltage range");
  // 8
  const ground = has(crit, /GROUND/);
  add("Ground connections are present", !ground.length, ground.length ? ground.join(", ") : "Common ground between battery, driver and controller");
  // 9 + 10 — firmware the interpreter cannot run (ESP32 Wi-Fi) is checked through its simulator-compilable twin
  const board = getBoard(t.firmware.board);
  const simulatedFirmware = t.firmware.runsInSimulator !== false;
  const compiled = compile(simulatedFirmware ? project.code : (t.firmware.checkSource ?? project.code), { board });
  const codeIssues = compiled.ok ? checkCodeAgainstCircuit(project, compiled) : [];
  const codeCrit = codeIssues.filter((i) => i.severity === "critical");
  add("Pin assignments match the code", compiled.ok && !codeCrit.length, !compiled.ok ? "Code does not compile" : codeCrit.length ? codeCrit.map((i) => i.incorrect).join("; ") : codeIssues.length ? `${codeIssues.length} warning(s)` : "Every #define matches the wired pin", codeIssues.length > 0);
  const realHasEntry = simulatedFirmware || (/\bvoid\s+setup\s*\(\s*\)/.test(project.code) && /\bvoid\s+loop\s*\(\s*\)/.test(project.code));
  add("Required code is present", compiled.ok && compiled.hasSetup && compiled.hasLoop && realHasEntry, compiled.ok ? `setup() + loop(), ${project.code.split("\n").length} lines, board ${board.name}${simulatedFirmware ? "" : " (Wi-Fi sketch: statically checked through its simulator-compilable twin)"}` : compiled.diagnostics.filter((d) => d.severity === "error").map((d) => `line ${d.line}: ${d.message}`).join("; "));
  // 11
  const { notes } = buildRobotSpec(project);
  const unsimulated = project.parts
    .map((p) => getComponent(p.componentId)!)
    .filter((c) => ["dc-motor", "motor-driver", "battery", "wheel"].includes(c.kind) || (c.sensor && c.kind === "sensor"))
    .filter((c) => c.simStatus !== "green");
  add("Simulation models exist", !notes.problems.length && !unsimulated.length, notes.problems.length ? notes.problems.join("; ") : unsimulated.length ? `No simulation model: ${unsimulated.map((c) => c.name).join(", ")}` : `Physics model built${notes.estimated.length ? ` (${notes.estimated.length} estimated parameter sets, labelled)` : ""}`);
  // 12
  const track = opts.track ?? getExampleTrack(t.simulation.defaultTrackId);
  add("Default environment exists", !!track && track.kind === t.metadata.competition, track ? `${track.name}` : `Track ${t.simulation.defaultTrackId} not found`);

  // 13 + 14
  let session: SimSession | null = null;
  try {
    if (track) session = new SimSession({ project, track, mode: simulatedFirmware ? "code" : "manual", opponent: t.simulation.opponent ?? null, opponentStartDelayS: 5 });
  } catch (e) {
    add("Robot initial position is valid", false, (e as Error).message);
    add("Simulation starts without errors", false, (e as Error).message);
  }
  if (session) {
    const tel = session.telemetry(0);
    const startOk = track!.kind === "sumo" ? !tel.out : tel.onTrack;
    add("Robot initial position is valid", startOk, `Start (${track!.start.x.toFixed(2)}, ${track!.start.y.toFixed(2)}) m, ${track!.kind === "sumo" ? "inside the arena" : tel.onTrack ? "on the " + (track!.kind === "line" ? "line" : "road") : "OFF the track"}`);
    let err: string | null = null;
    try {
      if (!simulatedFirmware) session.manual.forward = 1; // Manual mode: drive forward like a student would
      session.advance(opts.simSeconds ?? 1.5, 4000);
      const st = session.runtimeStatus;
      if (st?.state === "error") err = `Runtime error line ${st.error?.line}: ${st.error?.message}`;
      if (simulatedFirmware && !session.compileResult?.ok) err = "Firmware did not compile for the simulator";
      if (!Number.isFinite(session.telemetry().pose.x)) err = "The simulation produced an invalid pose";
    } catch (e) {
      err = (e as Error).message;
    }
    add("Simulation starts without errors", !err, err ?? (simulatedFirmware ? `Ran ${session.time.toFixed(2)} s of physics with the firmware (${session.runtimeKind})` : `Ran ${session.time.toFixed(2)} s in Manual mode (firmware not simulated: ${t.firmware.simulationNote ?? "Wi-Fi"})`));
  }

  // spec-driven families: the template validator (documented warnings are shown but do not lower the status)
  const template = t.metadata.family ? validateTemplate(t, project) : undefined;
  const all = [...checks, ...(template ?? [])];
  const failed = all.some((c) => !c.ok);
  const warned = all.some((c) => c.warning && !c.documented);
  return { templateId: t.metadata.id, status: failed ? "NOT READY" : warned ? "READY WITH WARNINGS" : "READY TO SIMULATE", checks, ...(template ? { template } : {}), at: new Date().toISOString() };
}
