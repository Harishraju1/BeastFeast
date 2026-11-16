import type { ArduinoHost, BoardProfile, PinModeValue, CompileResult } from "@/lib/arduino/types";
import { compile } from "@/lib/arduino/compile";
import { ArduinoRuntime } from "@/lib/arduino/interpreter";
import { getBoard } from "@/lib/arduino/boards";

export interface Call {
  fn: string;
  args: unknown[];
  t: number;
}

/** Records every host call with the runtime's virtual time. */
export class MockHost implements ArduinoHost {
  calls: Call[] = [];
  clock: () => number = () => 0;
  analog = new Map<number, number>();
  digital = new Map<number, 0 | 1>();
  pulseValue = 0;
  serial = "";
  rx: number[] = [];

  private rec(fn: string, ...args: unknown[]) {
    this.calls.push({ fn, args, t: this.clock() });
  }
  pinMode(pin: number, mode: PinModeValue) { this.rec("pinMode", pin, mode); }
  digitalWrite(pin: number, value: 0 | 1) { this.rec("digitalWrite", pin, value); }
  analogWrite(pin: number, duty: number) { this.rec("analogWrite", pin, duty); }
  digitalRead(pin: number): 0 | 1 { this.rec("digitalRead", pin); return this.digital.get(pin) ?? 0; }
  analogRead(pin: number): number { this.rec("analogRead", pin); return this.analog.get(pin) ?? 0; }
  pulseIn(pin: number, level: 0 | 1, timeoutMicros: number, nowMicros: number): number {
    this.rec("pulseIn", pin, level, timeoutMicros, nowMicros);
    return this.pulseValue;
  }
  servoWrite(pin: number, angleDeg: number) { this.rec("servoWrite", pin, angleDeg); }
  serialWrite(text: string) { this.serial += text; this.rec("serialWrite", text); }
  serialAvailable(): number { return this.rx.length; }
  serialRead(): number { return this.rx.length ? this.rx.shift()! : -1; }
  tone(pin: number, freq: number) { this.rec("tone", pin, freq); }
  noTone(pin: number) { this.rec("noTone", pin); }

  of(fn: string): Call[] { return this.calls.filter((c) => c.fn === fn); }
  sendSerial(text: string) { for (const ch of text) this.rx.push(ch.charCodeAt(0)); }
}

export function build(source: string, boardKey = "uno"): { result: CompileResult; board: BoardProfile } {
  const board = getBoard(boardKey);
  return { result: compile(source, { board }), board };
}

export function errorsOf(r: CompileResult) {
  return r.diagnostics.filter((d) => d.severity === "error");
}

/** Compile + create runtime; throws with diagnostics if compilation fails. */
export function start(source: string, boardKey = "uno", opts: { stepCostMicros?: number; maxStepsPerSlice?: number; maxCallDepth?: number } = {}) {
  const { result, board } = build(source, boardKey);
  if (!result.ok) throw new Error("compile failed:\n" + result.diagnostics.map((d) => `${d.line}:${d.column} ${d.severity} ${d.message}`).join("\n"));
  const host = new MockHost();
  const rt = new ArduinoRuntime(result.program, host, { board, ...opts });
  host.clock = () => rt.nowMicros;
  return { rt, host, result, board };
}

/** Run in physics-sized slices up to `untilMicros`. */
export function runTo(rt: ArduinoRuntime, untilMicros: number, slice = 16_667) {
  let t = rt.nowMicros;
  let st = rt.status;
  while (t < untilMicros) {
    t = Math.min(untilMicros, t + slice);
    st = rt.runUntil(t);
    if (st.state === "error" || st.state === "halted") break;
    // if throttled, keep calling with the same target
    while (st.throttled && st.nowMicros < t) st = rt.runUntil(t);
  }
  return st;
}
