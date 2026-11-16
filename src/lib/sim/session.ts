/**
 * Simulation session: couples the student's code, circuit and robot with the physics world.
 *
 *   code (sandboxed interpreter or AVR emulator) → controller pins → circuit graph (RobotElectrical)
 *   → driver model → motor voltages → physics (SimWorld, fixed 1 ms step) → sensor geometry
 *   → sensor pin values → back to the code.
 *
 * Rendering is separate: the UI calls advance(realSeconds × speed) each animation frame and draws snapshots.
 */
import type { Project } from "@/lib/types";
import { compile, getBoard, ArduinoRuntime, AvrRunner, AVR_SUPPORTED_BOARDS } from "@/lib/arduino";
import type { CompileResult, RuntimeStatus } from "@/lib/arduino/types";
import { RobotElectrical } from "@/lib/robot/bridge";
import { buildRobotSpec, type ModelNotes } from "@/lib/robot/model";
import { compileTrack } from "@/lib/track/compile";
import { sumoOpponentPose } from "@/lib/track/examples";
import { SimWorld } from "./world";
import { createOpponent, type OpponentLevel } from "./opponent";
import type { MotorCommands, SensorReading, SimEvent, SimRobotSpec, TrackDef } from "./types";
import { DebugAssistant, type DebugFinding } from "./debug";

export type ControlMode = "code" | "manual";

export interface ManualInput {
  forward: number; // -1..1
  turn: number; // -1..1 (positive = left)
  boost: boolean;
  speed: number; // 0.2..1
  estop: boolean;
}

export interface SessionOptions {
  project: Project;
  track: TrackDef;
  mode: ControlMode;
  /** compiled .hex for the AVR emulator (Uno R3 / Nano only); otherwise the interpreter runs project.code */
  hex?: string | null;
  opponent?: OpponentLevel | null;
  opponentStartDelayS?: number;
  dt?: number;
  studentName?: string;
}

export interface Sample {
  t: number;
  x: number;
  y: number;
  h: number;
  speed: number;
  battery: number;
  motorV: Record<string, number>;
  rpm: Record<string, number>;
  darkness: number[];
}

export class SimSession {
  readonly world: SimWorld;
  readonly bridge: RobotElectrical;
  readonly spec: SimRobotSpec;
  readonly notes: ModelNotes;
  readonly track: TrackDef;
  readonly mode: ControlMode;
  readonly compileResult: CompileResult | null = null;
  readonly runtimeKind: "interpreter" | "avr" | "none" = "none";
  private runtime: ArduinoRuntime | AvrRunner | null = null;
  private opponent: ReturnType<typeof createOpponent> | null = null;
  private opponentDelay: number;
  readonly dt: number;
  manual: ManualInput = { forward: 0, turn: 0, boost: false, speed: 0.7, estop: false };
  lastCommands: MotorCommands = {};
  runtimeStatus: RuntimeStatus | null = null;
  events: SimEvent[] = [];
  samples: Sample[] = [];
  maxSpeed = 0;
  readonly debug: DebugAssistant;
  private lastSample = -1;
  private stepsSinceRuntime = 0;

  constructor(opts: SessionOptions) {
    this.dt = opts.dt ?? 0.001;
    this.track = opts.track;
    this.mode = opts.mode;
    const { spec, notes } = buildRobotSpec(opts.project);
    this.spec = spec;
    this.notes = notes;
    const bridgeBoard = getBoard(this.boardKeyOf(opts.project));
    this.bridge = new RobotElectrical(opts.project, { adcMax: bridgeBoard.adcMax, vRef: bridgeBoard.vRef });

    const compiled = compileTrack(opts.track);
    const robots: { spec: SimRobotSpec; pose: { x: number; y: number; heading: number } }[] = [{ spec, pose: { ...opts.track.start } }];
    if (opts.opponent && opts.track.kind === "sumo") {
      this.opponent = createOpponent(opts.opponent, { id: "opponent" });
      robots.push({ spec: this.opponent.spec, pose: sumoOpponentPose(opts.track) });
    }
    this.opponentDelay = opts.opponentStartDelayS ?? 0;
    this.world = new SimWorld(compiled, robots, { dt: this.dt });
    this.debug = new DebugAssistant(this, opts.studentName ?? "Engineer");

    if (opts.mode === "code") {
      const board = getBoard(this.boardKeyOf(opts.project));
      if (opts.hex) {
        if (!AVR_SUPPORTED_BOARDS.includes(board.key)) throw new Error(`AVR emulation supports ${AVR_SUPPORTED_BOARDS.join(", ")} only; your controller is ${board.name}.`);
        this.runtime = new AvrRunner(opts.hex, this.bridge);
        this.runtimeKind = "avr";
      } else {
        const res = compile(opts.project.code, { board });
        this.compileResult = res;
        if (res.ok && res.program) {
          this.runtime = new ArduinoRuntime(res.program, this.bridge, { board });
          this.runtimeKind = "interpreter";
        }
      }
    }
    this.refreshSensors();
  }

  private boardKeyOf(project: Project): string {
    for (const p of project.parts) {
      const c = this.bridge?.graph.comps.get(p.uid);
      if (c?.kind === "controller" && c.board) return c.board;
    }
    // bridge not built yet (constructor order) — look up via catalogue ids
    const ids: Record<string, string> = { "arduino-uno-r3": "uno", "arduino-uno-r4": "uno-r4", "arduino-nano": "nano", "arduino-nano-every": "nano-every", "arduino-pro-mini": "pro-mini", "arduino-micro": "micro", "arduino-leonardo": "leonardo", "arduino-mega-2560": "mega", "esp32-devkit-v1": "esp32-devkit-v1", "esp8266-nodemcu": "nodemcu", "raspberry-pi-pico": "pico", "raspberry-pi-pico-w": "pico-w" };
    for (const p of project.parts) if (ids[p.componentId]) return ids[p.componentId];
    return "generic";
  }

  get time() {
    return this.world.time;
  }

  private refreshSensors() {
    const readings = this.world.readSensors(0);
    this.bridge.update(readings, this.world.telemetry(0));
  }

  private manualCommands(): MotorCommands {
    if (this.manual.estop) return Object.fromEntries(this.spec.motors.map((m) => [m.id, 0]));
    const drivable = this.bridge.drivableMotors();
    const s = this.manual.boost ? 1 : this.manual.speed;
    const f = this.manual.forward,
      t = this.manual.turn;
    let l = f - t * (f === 0 ? 1 : 0.6);
    let r = f + t * (f === 0 ? 1 : 0.6);
    const m = Math.max(1, Math.abs(l), Math.abs(r));
    l /= m;
    r /= m;
    const cmds: MotorCommands = {};
    for (const motor of this.spec.motors) {
      const wheel = this.spec.wheels.find((w) => w.motorId === motor.id);
      const d = drivable[motor.id];
      if (!d || !wheel) continue; // not electrically reachable → no power, exactly as on the real robot
      const side = wheel.y >= 0 ? l : r;
      cmds[motor.id] = side * s * d.maxV * (motor.invert ? -1 : 1);
    }
    return cmds;
  }

  /** Match encoder edges against each ISR's attachInterrupt mode (0 LOW, 1 CHANGE, 2 FALLING, 3 RISING). */
  private deliverEdges() {
    const edges = this.bridge.pendingInterrupts.splice(0);
    const rt = this.runtime;
    if (!edges.length || !(rt instanceof ArduinoRuntime)) return;
    for (const e of edges) {
      const isr = rt.attachedInterrupts.find((a) => a.pin === e.pin);
      if (!isr) continue;
      const fire = isr.mode === 1 || (isr.mode === 3 && e.rising) || ((isr.mode === 2 || isr.mode === 0) && !e.rising);
      if (!fire) continue;
      // run the ISR now, with the encoder pins showing their state at THIS edge (exact quadrature decoding)
      this.bridge.encoderOverride.set(e.sensor, e.count);
      rt.triggerInterrupt(e.pin);
      rt.runUntil(rt.status.nowMicros + 40);
    }
    this.bridge.encoderOverride.clear();
  }

  /** One fixed physics step. */
  step() {
    let cmds: MotorCommands;
    if (this.mode === "code") {
      if (this.runtime) {
        // run the program up to the current simulated time (1 kHz coupling)
        const target = (this.world.time + this.dt) * 1e6;
        let st = this.runtime.runUntil(target);
        let guard = 0;
        while (st.throttled && st.nowMicros < target && guard++ < 3) st = this.runtime.runUntil(target);
        this.runtimeStatus = st;
        this.deliverEdges();
      }
      cmds = this.manual.estop ? Object.fromEntries(this.spec.motors.map((m) => [m.id, 0])) : this.bridge.motorCommands();
    } else cmds = this.manualCommands();
    this.lastCommands = cmds;
    const all: (MotorCommands | undefined)[] = [cmds];
    if (this.opponent) {
      const t = this.world.time;
      all.push(t < this.opponentDelay ? {} : this.opponent.controller(this.world.readSensors(1), this.world.telemetry(1), { t }));
    }
    this.world.step(all);
    this.stepsSinceRuntime++;
    this.refreshSensors();
    const ev = this.world.drainEvents();
    if (ev.length) this.events.push(...ev);
    const tel = this.world.telemetry(0);
    this.maxSpeed = Math.max(this.maxSpeed, Math.abs(tel.speed));
    if (this.world.time - this.lastSample >= 0.05) {
      this.lastSample = this.world.time;
      const reading = Object.values(this.world.readSensors(0)).find((r) => r.kind === "reflectance") as Extract<SensorReading, { kind: "reflectance" }> | undefined;
      this.samples.push({ t: this.world.time, x: tel.pose.x, y: tel.pose.y, h: tel.pose.heading, speed: tel.speed, battery: tel.batteryVoltage, motorV: { ...tel.motorVoltage }, rpm: { ...tel.motorRpm }, darkness: reading?.darkness ?? [] });
      if (this.samples.length > 6000) this.samples.splice(0, 1000);
      this.debug.inspect(ev);
    }
  }

  /** Advance by simulated seconds, stopping early if the debugger asks to pause. Returns steps executed. */
  advance(seconds: number, maxSteps = 4000): { steps: number; pauseFor: DebugFinding | null } {
    const n = Math.min(maxSteps, Math.round(seconds / this.dt));
    for (let i = 0; i < n; i++) {
      this.step();
      const p = this.debug.takePauseRequest();
      if (p) return { steps: i + 1, pauseFor: p };
    }
    return { steps: n, pauseFor: null };
  }

  telemetry(i = 0) {
    return this.world.telemetry(i);
  }

  sensorReadings(i = 0): Record<string, SensorReading> {
    return this.world.readSensors(i);
  }

  sendSerial(text: string) {
    this.bridge.pushSerial(text);
  }

  get serialOutput(): string {
    if (this.runtime && "serialLog" in this.runtime) return this.runtime.serialLog;
    return this.bridge.serialOut;
  }

  get runtimeWarnings(): string[] {
    return this.runtime && "warnings" in this.runtime ? this.runtime.warnings : [];
  }

  get opponentState(): unknown {
    return this.opponent?.getState?.() ?? null;
  }
}
