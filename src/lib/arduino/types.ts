/**
 * Contracts for the Arduino code path.
 *
 * Two execution back-ends exist:
 *  1. The BEAST interpreter: a sandboxed tree-walking interpreter for a documented SUBSET of
 *     Arduino C/C++ (see SUPPORTED_FEATURES). It never uses eval/Function and has no access to
 *     browser or server globals. It is NOT a C++ compiler — unsupported syntax is reported, never guessed.
 *  2. AVR emulation (avr8js): runs a real compiled .hex (ATmega328P – Uno R3 / Nano) cycle by cycle.
 */

export interface Diagnostic {
  line: number; // 1-based
  column: number; // 1-based
  endLine?: number;
  endColumn?: number;
  severity: "error" | "warning" | "info";
  message: string;
  code?: string; // e.g. "UNSUPPORTED_FEATURE", "UNDECLARED", "SYNTAX"
}

/** Pin numbering and capabilities of the board the code targets. */
export interface BoardProfile {
  key: string; // "uno", "nano", "mega", "esp32-devkit-v1", "pico", ...
  name: string;
  /** symbolic constants available to code, e.g. { A0: 14, LED_BUILTIN: 13 } */
  constants: Record<string, number>;
  digitalPins: number[];
  analogPins: number[]; // arduino pin numbers that support analogRead
  pwmPins: number[];
  interruptPins: number[];
  adcMax: number; // 1023 for 10-bit
  pwmMax: number; // 255
  vRef: number; // ADC reference volts
  logicV: number;
}

export type PinModeValue = "INPUT" | "OUTPUT" | "INPUT_PULLUP";

/**
 * The world the program talks to. The simulator implements this; tests can stub it.
 * All calls are synchronous; time is virtual and owned by the runtime.
 */
export interface ArduinoHost {
  pinMode(pin: number, mode: PinModeValue): void;
  digitalWrite(pin: number, value: 0 | 1): void;
  /** duty 0..255 */
  analogWrite(pin: number, duty: number): void;
  digitalRead(pin: number): 0 | 1;
  /** 0..adcMax */
  analogRead(pin: number): number;
  /**
   * Behavioural pulseIn: return the pulse length in µs or 0 on timeout.
   * `nowMicros` is the runtime's virtual clock at the call.
   */
  pulseIn(pin: number, level: 0 | 1, timeoutMicros: number, nowMicros: number): number;
  /** Servo library: attach + write angle */
  servoWrite(pin: number, angleDeg: number): void;
  /** Serial output text (already formatted) */
  serialWrite(text: string): void;
  /** Bytes waiting in the Serial RX buffer */
  serialAvailable(): number;
  /** Pop one byte from Serial RX, -1 if none */
  serialRead(): number;
  tone?(pin: number, freq: number): void;
  noTone?(pin: number): void;
}

export interface RuntimeOptions {
  board: BoardProfile;
  /** virtual CPU cost of one statement/expression evaluation step, µs (default 1) */
  stepCostMicros?: number;
  /** hard cap on interpreter steps per runUntil call to keep the UI responsive (default 200000) */
  maxStepsPerSlice?: number;
  /** maximum call depth (default 64) */
  maxCallDepth?: number;
}

export type RuntimeState = "ready" | "setup" | "loop" | "halted" | "error";

export interface RuntimeError {
  line: number;
  column: number;
  message: string;
}

export interface RuntimeStatus {
  state: RuntimeState;
  nowMicros: number;
  /** line currently executing (1-based) or null */
  line: number | null;
  /** true if the step cap was hit before reaching the requested time */
  throttled: boolean;
  error?: RuntimeError;
  loopCount: number;
}

/** Records which pins the source code refers to, for circuit-aware checks. */
export interface PinUsage {
  pin: number | null; // resolved pin number, null if it could not be resolved statically
  expression: string; // source text, e.g. "ENA"
  symbol?: string; // #define / const name that held the pin, e.g. "ENA"
  call: "pinMode" | "digitalWrite" | "analogWrite" | "digitalRead" | "analogRead" | "pulseIn" | "attachInterrupt" | "servo.attach" | "tone";
  mode?: PinModeValue;
  line: number;
  column: number;
}

export interface CompileResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  /** opaque compiled program for ArduinoRuntime */
  program?: unknown;
  /** statically extracted pin usage (best effort) */
  pinUsage: PinUsage[];
  /** symbolic pin definitions found: name -> value, with line */
  pinSymbols: { name: string; value: number; line: number }[];
  hasSetup: boolean;
  hasLoop: boolean;
}
