/**
 * BEAST virtual machine: runs a CompiledProgram against an ArduinoHost on a virtual clock.
 *
 * Execution model
 *  - The runtime owns `nowMicros`. Every bytecode instruction costs `stepCostMicros` (default 1 µs).
 *    Built-ins add realistic costs (digitalWrite/digitalRead ≈ 4 µs, analogRead ≈ 112 µs,
 *    analogWrite ≈ 6 µs, Serial ≈ 10 µs per character).
 *  - delay()/delayMicroseconds()/pulseIn() SUSPEND the program: `runUntil` returns when the target
 *    time is reached and the next call resumes exactly where it stopped (the VM state is an explicit
 *    frame stack + operand stack, so it can pause between any two instructions).
 *  - `runUntil(t)` stops when nowMicros >= t, the program halts/errors, or `maxStepsPerSlice`
 *    instructions ran (then status.throttled = true). Small built-in costs (< 1 ms) may overshoot t
 *    by up to that cost; always read status.nowMicros.
 *  - Interrupts: triggerInterrupt(pin) queues the attached ISR; queued ISRs run between instructions
 *    (also during delay()) while interrupts are enabled. ISRs run with interrupts disabled.
 *
 * Sandboxing: student code is never turned into JavaScript. Only the bytecode below is executed;
 * the only side effects are calls on the ArduinoHost.
 */
import type { ArduinoHost, BoardProfile, PinModeValue, RuntimeError, RuntimeOptions, RuntimeState, RuntimeStatus } from "./types";
import { B, F, K, wrap, isCompiledProgram, type CompiledProgram, type FuncCode, type Instr } from "./bytecode";
import { boardArch, usesInterruptNumbers } from "./boards";

class RtError extends Error {}

interface Frame {
  fn: FuncCode;
  code: Instr[];
  pc: number;
  locals: unknown[];
  isIsr: boolean;
  spBase: number;
}

interface ServoObj {
  __servo: true;
  pin: number;
  us: number;
  min: number;
  max: number;
  lastAngle: number;
  written: boolean;
}

const MODES: PinModeValue[] = ["INPUT", "OUTPUT", "INPUT_PULLUP"];
const SERIAL_LOG_CAP = 64 * 1024;

export class ArduinoRuntime {
  /** De-duplicated runtime warnings (teaching hints), oldest first. */
  warnings: string[] = [];
  /** Everything written to Serial (last 64 KB). */
  serialLog = "";

  private readonly prog: CompiledProgram;
  private readonly board: BoardProfile;
  private readonly stepCost: number;
  private readonly maxSteps: number;
  private readonly maxDepth: number;
  private readonly avr: boolean;

  private now = 0;
  private state: RuntimeState = "ready";
  private loopCount = 0;
  private error: RuntimeError | undefined;
  private lastThrottled = false;

  private globals: unknown[] = [];
  private stack: unknown[] = [];
  private sp = 0;
  private frames: Frame[] = [];
  private sliceSteps = 0;
  private sleepUntil = 0;
  private yieldFlag = false;
  private intEnabled = true;
  private inIsr = false;
  private isrByPin = new Map<number, { fn: number; mode: number }>();
  private isrQueue: number[] = [];
  private events: { at: number; pin: number; kind: "noTone" }[] = [];
  private pinModes = new Map<number, PinModeValue>();
  private rng = 1;
  private adcBits = 10;
  private pwmBits = 8;
  private rx: number[] = [];
  private serialBegun = false;
  private servoCount = 0;
  private warnSet = new Set<string>();
  private curIns: Instr | null = null;

  constructor(program: unknown, private host: ArduinoHost, opts: RuntimeOptions) {
    if (!isCompiledProgram(program)) throw new Error("ArduinoRuntime: program must be the `program` returned by a successful compile()");
    this.prog = program;
    this.board = opts.board ?? program.board;
    this.stepCost = opts.stepCostMicros ?? 1;
    this.maxSteps = opts.maxStepsPerSlice ?? 200000;
    this.maxDepth = opts.maxCallDepth ?? 64;
    this.avr = boardArch(this.board) === "avr";
    this.reset();
  }

  /** Back to power-on state (does not touch the host). */
  reset(): void {
    this.now = 0;
    this.state = "ready";
    this.loopCount = 0;
    this.error = undefined;
    this.lastThrottled = false;
    this.globals = new Array(this.prog.nGlobals).fill(0);
    this.stack = new Array(1024).fill(0);
    this.sp = 0;
    const main = this.prog.funcs[this.prog.mainIndex];
    this.frames = [{ fn: main, code: main.code, pc: 0, locals: [], isIsr: false, spBase: 0 }];
    this.sliceSteps = 0;
    this.sleepUntil = 0;
    this.yieldFlag = false;
    this.intEnabled = true;
    this.inIsr = false;
    this.isrByPin.clear();
    this.isrQueue = [];
    this.events = [];
    this.pinModes.clear();
    this.rng = 1;
    this.adcBits = Math.round(Math.log2(this.board.adcMax + 1));
    this.pwmBits = 8;
    this.rx = [];
    this.serialBegun = false;
    this.servoCount = 0;
    this.warnings = [];
    this.warnSet.clear();
    this.serialLog = "";
    this.curIns = null;
  }

  get status(): RuntimeStatus {
    return this.makeStatus();
  }

  get nowMicros(): number {
    return this.now;
  }

  /** Queue the ISR attached to `pin` (if any). The host decides when an edge happened. */
  triggerInterrupt(pin: number): void {
    const h = this.isrByPin.get(pin);
    if (!h) return;
    if (!this.isrQueue.includes(h.fn)) this.isrQueue.push(h.fn);
    this.yieldFlag = true;
  }

  /** Pins that currently have an ISR attached, with the attachInterrupt mode (1 CHANGE, 2 FALLING, 3 RISING, 0 LOW). */
  get attachedInterrupts(): { pin: number; mode: number }[] {
    return [...this.isrByPin.entries()].map(([pin, v]) => ({ pin, mode: v.mode }));
  }

  runUntil(untilMicros: number): RuntimeStatus {
    if (this.state === "error" || this.state === "halted") return this.makeStatus();
    if (this.state === "ready") this.state = "setup";
    let throttled = false;
    this.sliceSteps = 0;
    try {
      for (;;) {
        this.yieldFlag = false;
        if (this.events.length) this.fireEvents();
        if (this.isrQueue.length && this.intEnabled && !this.inIsr) this.enterIsr();
        if (!this.inIsr && this.sleepUntil > this.now) {
          let next = Math.min(this.sleepUntil, untilMicros);
          for (const ev of this.events) if (ev.at < next) next = ev.at;
          if (next > this.now) this.now = next;
          if (this.now >= untilMicros && this.now < this.sleepUntil) break;
          continue;
        }
        if (this.now >= untilMicros) break;
        if (this.sliceSteps >= this.maxSteps) {
          throttled = true;
          break;
        }
        this.exec(untilMicros);
        if (this.isStopped()) break;
      }
    } catch (e) {
      const top = this.frames[this.frames.length - 1];
      const ins = this.curIns ?? top?.code[Math.max(0, top.pc - 1)];
      const message = e instanceof RtError ? e.message : `Internal runtime error: ${(e as Error).message}`;
      this.state = "error";
      this.error = { line: ins?.line ?? 0, column: ins?.col ?? 0, message };
    }
    this.lastThrottled = throttled;
    return this.makeStatus();
  }

  private isStopped(): boolean {
    return this.state === "error" || this.state === "halted";
  }

  private makeStatus(): RuntimeStatus {
    const top = this.frames[this.frames.length - 1];
    let line: number | null = null;
    if (this.state === "error" && this.error) line = this.error.line || null;
    else if (top) {
      const ins = top.code[Math.max(0, top.pc - 1)];
      line = ins && ins.line > 0 ? ins.line : null;
    }
    return {
      state: this.state,
      nowMicros: this.now,
      line,
      throttled: this.lastThrottled,
      error: this.error,
      loopCount: this.loopCount,
    };
  }

  // ----------------------------------------------------------------------------------------------
  // helpers
  // ----------------------------------------------------------------------------------------------

  private warn(msg: string) {
    const line = this.curIns?.line;
    const text = line ? `Line ${line}: ${msg}` : msg;
    if (this.warnSet.has(text)) return;
    this.warnSet.add(text);
    if (this.warnings.length < 200) this.warnings.push(text);
  }

  /** Spend `us` microseconds of CPU time (busy). Long waits suspend so physics can run. */
  private spend(us: number) {
    if (!(us > 0)) return;
    if (us < 1000) this.now += us;
    else this.sleep(us);
  }
  private sleep(us: number) {
    if (!(us > 0)) return;
    this.sleepUntil = Math.max(this.sleepUntil, this.now) + us;
    this.yieldFlag = true;
  }

  private enterIsr() {
    const fnIndex = this.isrQueue.shift()!;
    const fn = this.prog.funcs[fnIndex];
    this.frames.push({ fn, code: fn.code, pc: 0, locals: new Array(fn.nLocals).fill(0), isIsr: true, spBase: this.sp });
    this.inIsr = true;
    this.intEnabled = false;
  }

  private fireEvents() {
    const due = this.events.filter((e) => e.at <= this.now);
    if (!due.length) return;
    this.events = this.events.filter((e) => e.at > this.now);
    for (const ev of due) if (ev.kind === "noTone") this.host.noTone?.(ev.pin);
  }

  private pinExists(pin: number): boolean {
    return this.board.digitalPins.includes(pin) || this.board.analogPins.includes(pin);
  }
  private checkPin(fn: string, pin: number): boolean {
    if (this.pinExists(pin)) return true;
    this.warn(`${fn}(${pin}, …): pin ${pin} does not exist on ${this.board.name} — the call was ignored`);
    return false;
  }

  private outOfBounds(arr: unknown[], i: number, name: string): never {
    throw new RtError(`Array index out of bounds: ${name}[${i}] — '${name}' has ${arr.length} element${arr.length === 1 ? "" : "s"} (valid indexes 0 to ${arr.length - 1}). On a real Arduino this would silently corrupt other memory.`);
  }

  // ----------------------------------------------------------------------------------------------
  // the interpreter loop
  // ----------------------------------------------------------------------------------------------

  private exec(until: number) {
    const funcs = this.prog.funcs;
    const stack = this.stack;
    const G = this.globals;
    const cost = this.stepCost;
    const maxSteps = this.maxSteps;
    const frames = this.frames;
    let frame = frames[frames.length - 1];
    let code = frame.code;
    let pc = frame.pc;
    let L = frame.locals as number[];
    let sp = this.sp;
    let now = this.now;
    let steps = this.sliceSteps;
    let ins: Instr;
    try {
      outer: while (now < until && steps < maxSteps) {
        ins = code[pc++];
        steps++;
        now += cost;
        switch (ins.op) {
          case 1: // PUSH
            stack[sp++] = ins.a;
            break;
          case 2: { // PUSH_CLONE
            const t = ins.a as unknown[];
            stack[sp++] = t.map((x) => (Array.isArray(x) ? x.slice() : x));
            break;
          }
          case 3: // POP
            sp--;
            break;
          case 4: // DUP
            stack[sp] = stack[sp - 1];
            sp++;
            break;
          case 5: // DUP2
            stack[sp] = stack[sp - 2];
            stack[sp + 1] = stack[sp - 1];
            sp += 2;
            break;
          case 6: // LOAD_L
            stack[sp++] = L[ins.a];
            break;
          case 7: // STORE_L
            L[ins.a] = stack[--sp] as number;
            if (ins.b) sp++;
            break;
          case 8: // LOAD_G
            stack[sp++] = G[ins.a];
            break;
          case 9: // STORE_G
            G[ins.a] = stack[--sp];
            if (ins.b) sp++;
            break;
          case 10: { // LOAD_ELEM
            const i = stack[--sp] as number;
            const arr = stack[sp - 1] as unknown[];
            if (i < 0 || i >= arr.length) { this.curIns = ins; this.outOfBounds(arr, i, ins.a); }
            stack[sp - 1] = arr[i];
            break;
          }
          case 11: { // STORE_ELEM
            const v = stack[--sp];
            const i = stack[--sp] as number;
            const arr = stack[--sp] as unknown[];
            if (i < 0 || i >= arr.length) { this.curIns = ins; this.outOfBounds(arr, i, ins.a); }
            arr[i] = v;
            if (ins.b) stack[sp++] = v;
            break;
          }
          case 12: // CONV
            stack[sp - 1] = wrap(stack[sp - 1] as number, ins.a);
            break;
          case 13: { // ADD
            const b = stack[--sp] as number;
            stack[sp - 1] = wrap((stack[sp - 1] as number) + b, ins.a);
            break;
          }
          case 14: { // SUB
            const b = stack[--sp] as number;
            stack[sp - 1] = wrap((stack[sp - 1] as number) - b, ins.a);
            break;
          }
          case 15: { // MUL
            const b = stack[--sp] as number;
            const a = stack[sp - 1] as number;
            const k = ins.a;
            stack[sp - 1] = k === K.I32 ? Math.imul(a, b) : k === K.U32 ? Math.imul(a, b) >>> 0 : wrap(a * b, k);
            break;
          }
          case 16: { // DIV
            const b = stack[--sp] as number;
            const a = stack[sp - 1] as number;
            const k = ins.a;
            if (k >= K.I8 && k <= K.U32) {
              if (b === 0) { this.curIns = ins; throw new RtError(`Division by zero: ${a} / 0. Integer division by zero gives garbage on a real Arduino — check the divisor before dividing.`); }
              stack[sp - 1] = wrap(Math.trunc(a / b), k);
            } else stack[sp - 1] = wrap(a / b, k);
            break;
          }
          case 17: { // MOD
            const b = stack[--sp] as number;
            const a = stack[sp - 1] as number;
            if (b === 0) { this.curIns = ins; throw new RtError(`Division by zero: ${a} % 0 (remainder of a division by zero).`); }
            stack[sp - 1] = wrap(a % b, ins.a);
            break;
          }
          case 18: { // SHL
            const b = stack[--sp] as number;
            stack[sp - 1] = wrap((stack[sp - 1] as number) << b, ins.a);
            break;
          }
          case 19: { // SHR
            const b = stack[--sp] as number;
            const a = stack[sp - 1] as number;
            stack[sp - 1] = ins.a === K.U32 ? a >>> b : wrap(a >> b, ins.a);
            break;
          }
          case 20: { // BAND
            const b = stack[--sp] as number;
            stack[sp - 1] = wrap((stack[sp - 1] as number) & b, ins.a);
            break;
          }
          case 21: { // BOR
            const b = stack[--sp] as number;
            stack[sp - 1] = wrap((stack[sp - 1] as number) | b, ins.a);
            break;
          }
          case 22: { // BXOR
            const b = stack[--sp] as number;
            stack[sp - 1] = wrap((stack[sp - 1] as number) ^ b, ins.a);
            break;
          }
          case 23: // NEG
            stack[sp - 1] = wrap(-(stack[sp - 1] as number), ins.a);
            break;
          case 24: // BNOT
            stack[sp - 1] = wrap(~(stack[sp - 1] as number), ins.a);
            break;
          case 25: // NOT
            stack[sp - 1] = stack[sp - 1] ? 0 : 1;
            break;
          case 26: { const b = stack[--sp] as number; stack[sp - 1] = (stack[sp - 1] as number) < b ? 1 : 0; break; } // LT
          case 27: { const b = stack[--sp] as number; stack[sp - 1] = (stack[sp - 1] as number) <= b ? 1 : 0; break; } // LE
          case 28: { const b = stack[--sp] as number; stack[sp - 1] = (stack[sp - 1] as number) > b ? 1 : 0; break; } // GT
          case 29: { const b = stack[--sp] as number; stack[sp - 1] = (stack[sp - 1] as number) >= b ? 1 : 0; break; } // GE
          case 30: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] === b ? 1 : 0; break; } // EQ
          case 31: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] !== b ? 1 : 0; break; } // NE
          case 32: // JMP
            pc = ins.a;
            break;
          case 33: // JF
            if (!stack[--sp]) pc = ins.a;
            break;
          case 34: // JT
            if (stack[--sp]) pc = ins.a;
            break;
          case 35: { // INC_L
            const old = L[ins.a];
            const nv = wrap(old + ins.b, ins.c);
            L[ins.a] = nv;
            if (ins.d === 1) stack[sp++] = nv;
            else if (ins.d === 2) stack[sp++] = old;
            break;
          }
          case 36: { // INC_G
            const old = G[ins.a] as number;
            const nv = wrap(old + ins.b, ins.c);
            G[ins.a] = nv;
            if (ins.d === 1) stack[sp++] = nv;
            else if (ins.d === 2) stack[sp++] = old;
            break;
          }
          case 37: { // INC_ELEM
            const i = stack[--sp] as number;
            const arr = stack[--sp] as number[];
            if (i < 0 || i >= arr.length) { this.curIns = ins; this.outOfBounds(arr, i, ins.a); }
            const old = arr[i];
            const nv = wrap(old + ins.b, ins.c);
            arr[i] = nv;
            if (ins.d === 1) stack[sp++] = nv;
            else if (ins.d === 2) stack[sp++] = old;
            break;
          }
          case 38: { // CALL
            const fn = funcs[ins.a];
            if (frames.length > this.maxDepth) {
              this.curIns = ins;
              throw new RtError(`Stack overflow: more than ${this.maxDepth} nested function calls (calling ${fn.name}()). Check for recursion that never stops — a real Arduino would crash or reset.`);
            }
            frame.pc = pc;
            const locals = new Array(fn.nLocals).fill(0);
            for (let i = fn.nParams - 1; i >= 0; i--) locals[i] = stack[--sp];
            frame = { fn, code: fn.code, pc: 0, locals, isIsr: false, spBase: sp };
            frames.push(frame);
            code = frame.code;
            pc = 0;
            L = locals as number[];
            break;
          }
          case 39: // RET
          case 40: { // RET_VOID
            const v = ins.op === 39 ? stack[--sp] : 0;
            const done = frames.pop()!;
            frame = frames[frames.length - 1];
            code = frame.code;
            pc = frame.pc;
            L = frame.locals as number[];
            if (done.isIsr) {
              sp = done.spBase;
              this.inIsr = false;
              this.intEnabled = true;
              break outer;
            }
            sp = done.spBase;
            stack[sp++] = v;
            break;
          }
          case 41: { // BUILTIN
            const argc = ins.b as number;
            const args = new Array(argc);
            for (let i = argc - 1; i >= 0; i--) args[i] = stack[--sp];
            this.now = now;
            this.curIns = ins;
            const r = this.builtin(ins.a, args, ins);
            this.curIns = null;
            now = this.now;
            stack[sp++] = r === undefined ? 0 : r;
            if (this.yieldFlag) break outer;
            break;
          }
          case 42: { // STRCAT
            const b = stack[--sp] as string;
            stack[sp - 1] = (stack[sp - 1] as string) + b;
            break;
          }
          case 43: { // TOSTR
            const extra = ins.b ? (stack[--sp] as number) : undefined;
            stack[sp - 1] = toStr(stack[sp - 1], ins.a, extra);
            break;
          }
          case 44: { // SERIAL_PRINT
            const argc = ins.c as number;
            const extra = argc === 2 ? (stack[--sp] as number) : undefined;
            const v = argc >= 1 ? stack[--sp] : "";
            let text = argc >= 1 ? printStr(v, ins.a, extra) : "";
            if (ins.b) text += "\r\n";
            this.now = now;
            this.curIns = ins;
            this.serialOut(text);
            this.curIns = null;
            now = this.now;
            stack[sp++] = text.length;
            if (this.yieldFlag) break outer;
            break;
          }
          case 45: // NEWARR
            stack[sp++] = this.newArray(ins.a as number[], 0, ins.b);
            break;
          case 46: // LOOP_DONE
            this.loopCount++;
            break;
          case 47: // SET_STATE
            this.state = ins.a;
            break;
          case 48: // HALT
            this.state = "halted";
            break outer;
          case 49: { // STRIDX
            const i = stack[--sp] as number;
            const s = stack[sp - 1] as string;
            stack[sp - 1] = i >= 0 && i < s.length ? wrap(s.charCodeAt(i), K.I8) : 0;
            break;
          }
          case 0: // NOP
            break;
          default:
            throw new RtError(`Unknown instruction ${ins.op}`);
        }
      }
    } finally {
      frame.pc = pc;
      this.sp = sp;
      this.now = now;
      this.sliceSteps = steps;
    }
  }

  private newArray(dims: number[], d: number, init: unknown): unknown[] {
    const n = dims[d];
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      if (d + 1 < dims.length) out[i] = this.newArray(dims, d + 1, init);
      else out[i] = init === "servo" ? newServo() : init;
    }
    return out;
  }

  private serialOut(text: string) {
    if (!text) return;
    if (!this.serialBegun) this.warn("Serial output before Serial.begin(…) — on a real board nothing would be sent. Add Serial.begin(9600); in setup().");
    this.host.serialWrite(text);
    this.serialLog += text;
    if (this.serialLog.length > SERIAL_LOG_CAP) this.serialLog = this.serialLog.slice(-SERIAL_LOG_CAP);
    this.spend(10 * text.length);
  }

  private readByte(): number {
    if (this.rx.length) return this.rx.shift()!;
    return this.host.serialAvailable() > 0 ? this.host.serialRead() : -1;
  }
  private peekByte(): number {
    if (!this.rx.length) {
      const b = this.host.serialAvailable() > 0 ? this.host.serialRead() : -1;
      if (b < 0) return -1;
      this.rx.push(b);
    }
    return this.rx[0];
  }

  private nextRandom(): number {
    // avr-libc random(): Park–Miller "minimal standard" generator
    let x = this.rng;
    if (x === 0) x = 123459876;
    const hi = Math.trunc(x / 127773);
    const lo = x % 127773;
    x = 16807 * lo - 2836 * hi;
    if (x < 0) x += 0x7fffffff;
    this.rng = x;
    return x % 0x80000000;
  }
  private random1(max: number): number {
    if (max === 0) return 0;
    return (this.nextRandom() % max) | 0;
  }

  private interruptPin(n: number): number | undefined {
    if (n < 0) return undefined;
    if (usesInterruptNumbers(this.board)) return this.board.interruptPins[n];
    return n;
  }

  private servoArg(v: unknown): ServoObj {
    return v as ServoObj;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private builtin(id: number, a: any[], ins: Instr): unknown {
    const host = this.host;
    switch (id) {
      case B.PIN_MODE: {
        const pin = a[0] as number;
        if (!this.checkPin("pinMode", pin)) return;
        const mode = MODES[a[1]] ?? "INPUT";
        if (mode === "OUTPUT" && this.board.key === "esp32-devkit-v1" && [34, 35, 36, 39].includes(pin)) {
          this.warn(`pinMode(${pin}, OUTPUT): GPIO ${pin} is input-only on the ESP32`);
        }
        if (mode !== "INPUT" && this.board.analogPins.includes(pin) && !this.board.digitalPins.includes(pin)) {
          this.warn(`pinMode(${pin}, ${mode}): pin ${pin} is analog-input only on ${this.board.name}`);
        }
        this.pinModes.set(pin, mode);
        host.pinMode(pin, mode);
        this.spend(4);
        return;
      }
      case B.DIGITAL_WRITE: {
        const pin = a[0] as number;
        if (!this.checkPin("digitalWrite", pin)) return;
        if (!this.board.digitalPins.includes(pin)) this.warn(`digitalWrite(${pin}): pin ${pin} is analog-input only on ${this.board.name}`);
        if (this.pinModes.get(pin) !== "OUTPUT") {
          this.warn(`digitalWrite(${pin}, …) without pinMode(${pin}, OUTPUT) — on a real board the pin is still an input, so HIGH only turns on the weak pull-up (an LED would glow very dimly).`);
        }
        host.digitalWrite(pin, a[1] ? 1 : 0);
        this.spend(4);
        return;
      }
      case B.DIGITAL_READ: {
        const pin = a[0] as number;
        if (!this.checkPin("digitalRead", pin)) return 0;
        this.spend(4);
        return host.digitalRead(pin) ? 1 : 0;
      }
      case B.ANALOG_WRITE: {
        const pin = a[0] as number;
        let v = a[1] as number;
        if (!this.checkPin("analogWrite", pin)) return;
        const max = this.pwmBits === 8 ? 255 : Math.pow(2, this.pwmBits) - 1;
        if (v < 0 || v > max) {
          this.warn(`analogWrite(${pin}, ${v}): the value must be between 0 and ${max} — clamped to ${v < 0 ? 0 : max}`);
          v = v < 0 ? 0 : max;
        }
        let duty = this.pwmBits === 8 ? v : Math.round((v * 255) / max);
        if (this.pinModes.get(pin) !== "OUTPUT") {
          // analogWrite() switches the pin to OUTPUT itself on the real cores
          this.pinModes.set(pin, "OUTPUT");
          host.pinMode(pin, "OUTPUT");
        }
        if (!this.board.pwmPins.includes(pin)) {
          this.warn(`analogWrite(${pin}, …): pin ${pin} has no PWM on ${this.board.name} (PWM pins: ${this.board.pwmPins.join(", ")}). Like a real Arduino, values below 128 give LOW and 128 or more give HIGH.`);
          duty = duty < 128 ? 0 : 1;
          host.digitalWrite(pin, duty as 0 | 1);
          this.spend(6);
          return;
        }
        if (this.servoCount > 0 && this.avr && ["uno", "nano", "pro-mini", "generic"].includes(this.board.key) && (pin === 9 || pin === 10)) {
          this.warn(`analogWrite(${pin}, …) while a Servo is attached: the Servo library uses Timer1, so PWM on pins 9 and 10 does not work on ${this.board.name}.`);
        }
        host.analogWrite(pin, duty);
        this.spend(6);
        return;
      }
      case B.ANALOG_READ: {
        let pin = a[0] as number;
        if (this.avr && !this.board.analogPins.includes(pin) && pin >= 0 && pin < this.board.analogPins.length) {
          pin = this.board.analogPins[pin]; // analogRead(0) means A0 on AVR boards
        }
        if (!this.board.analogPins.includes(pin)) {
          this.warn(`analogRead(${pin}): pin ${pin} is not an analog input on ${this.board.name} (analog pins: ${this.analogPinNames()}) — returned 0`);
          this.spend(112);
          return 0;
        }
        let v = Number(host.analogRead(pin));
        if (!Number.isFinite(v)) v = 0;
        v = Math.round(Math.min(this.board.adcMax, Math.max(0, v)));
        const nativeBits = Math.round(Math.log2(this.board.adcMax + 1));
        if (this.adcBits !== nativeBits) {
          const max = Math.pow(2, this.adcBits) - 1;
          v = Math.round((v * max) / this.board.adcMax);
        }
        this.spend(112);
        return v;
      }
      case B.ANALOG_READ_RES:
        if (this.avr) {
          this.warn(`analogReadResolution() does not exist on ${this.board.name} (AVR boards are fixed at 10 bits) — ignored`);
          return;
        }
        this.adcBits = Math.max(1, Math.min(16, a[0] as number));
        return;
      case B.ANALOG_WRITE_RES:
        if (this.avr) {
          this.warn(`analogWriteResolution() does not exist on ${this.board.name} (AVR PWM is 8-bit) — ignored`);
          return;
        }
        this.pwmBits = Math.max(1, Math.min(16, a[0] as number));
        return;
      case B.ANALOG_REFERENCE:
        this.warn("analogReference() is ignored by the simulator (the default reference is used)");
        return;
      case B.DELAY: {
        const ms = (a[0] as number) >>> 0;
        if (this.inIsr) {
          this.warn("delay() inside an interrupt handler does not work on a real Arduino (it hangs or returns immediately) — ignored. Keep ISRs short.");
          return;
        }
        this.sleep(ms * 1000);
        return;
      }
      case B.DELAY_US: {
        const us = a[0] as number;
        this.spend(us);
        return;
      }
      case B.MILLIS:
        return Math.floor(this.now / 1000) >>> 0;
      case B.MICROS:
        return (this.avr ? Math.floor(this.now / 4) * 4 : Math.floor(this.now)) >>> 0;
      case B.PULSE_IN: {
        const pin = a[0] as number;
        const timeout = (a[2] as number) >>> 0;
        if (!this.checkPin("pulseIn", pin)) return 0;
        let r = Math.floor(Number(host.pulseIn(pin, a[1] ? 1 : 0, timeout, this.now)));
        if (!Number.isFinite(r) || r < 0) r = 0;
        if (r > timeout) r = 0;
        this.spend(r > 0 ? r : timeout);
        return r >>> 0;
      }
      case B.MAP: {
        const [x, inMin, inMax, outMin, outMax] = a as number[];
        if (inMax === inMin) throw new RtError(`map(): fromLow and fromHigh are both ${inMin}, which would divide by zero`);
        const num = Math.imul((x - inMin) | 0, (outMax - outMin) | 0);
        return (Math.trunc(num / ((inMax - inMin) | 0)) + outMin) | 0;
      }
      case B.CONSTRAIN: {
        const [x, lo, hi] = a as number[];
        return x < lo ? lo : x > hi ? hi : x;
      }
      case B.MIN: return a[0] < a[1] ? a[0] : a[1];
      case B.MAX: return a[0] > a[1] ? a[0] : a[1];
      case B.ABS: return wrap(a[0] > 0 ? a[0] : -a[0], ins.c);
      case B.SQ: {
        const v = a[0] as number;
        return ins.c === K.I32 ? Math.imul(v, v) : ins.c === K.U32 ? Math.imul(v, v) >>> 0 : wrap(v * v, ins.c);
      }
      case B.MATH1: return math1(ins.c, a[0]);
      case B.MATH2: return math2(ins.c, a[0], a[1]);
      case B.ROUND_LONG: {
        const v = a[0] as number;
        return v >= 0 ? (v + 0.5) | 0 : (v - 0.5) | 0;
      }
      case B.RANDOM1: return this.random1(a[0]);
      case B.RANDOM2: {
        const [lo, hi] = a as number[];
        if (lo >= hi) return lo;
        return (this.random1((hi - lo) | 0) + lo) | 0;
      }
      case B.RANDOM_SEED:
        if (a[0] !== 0) this.rng = (a[0] as number) >>> 0;
        return;
      case B.ATTACH_INT: {
        const [n, fn, mode] = a as number[];
        const pin = this.interruptPin(n);
        if (pin === undefined) {
          this.warn(`attachInterrupt(${n}, …): ${n} is not a valid interrupt number on ${this.board.name} — use attachInterrupt(digitalPinToInterrupt(pin), …) with an interrupt pin (${this.board.interruptPins.join(", ")})`);
          return;
        }
        if (!this.board.interruptPins.includes(pin)) {
          this.warn(`attachInterrupt(): pin ${pin} cannot trigger interrupts on ${this.board.name} (interrupt pins: ${this.board.interruptPins.join(", ")})`);
          return;
        }
        this.isrByPin.set(pin, { fn, mode });
        return;
      }
      case B.DETACH_INT: {
        const pin = this.interruptPin(a[0]);
        if (pin !== undefined) this.isrByPin.delete(pin);
        return;
      }
      case B.PIN_TO_INT: {
        const pin = a[0] as number;
        if (usesInterruptNumbers(this.board)) return this.board.interruptPins.indexOf(pin);
        return this.board.interruptPins.includes(pin) ? pin : -1;
      }
      case B.NO_INTERRUPTS:
        this.intEnabled = false;
        return;
      case B.INTERRUPTS:
        if (!this.inIsr) {
          this.intEnabled = true;
          if (this.isrQueue.length) this.yieldFlag = true;
        }
        return;
      case B.TONE: {
        const [pin, freq, dur] = a as number[];
        if (!this.checkPin("tone", pin)) return;
        this.events = this.events.filter((e) => e.pin !== pin);
        host.tone?.(pin, freq);
        if (dur > 0) this.events.push({ at: this.now + dur * 1000, pin, kind: "noTone" });
        return;
      }
      case B.NO_TONE: {
        const pin = a[0] as number;
        this.events = this.events.filter((e) => e.pin !== pin);
        host.noTone?.(pin);
        return;
      }
      case B.YIELD:
        return;
      case B.EXIT:
        this.state = "halted";
        this.yieldFlag = true;
        return;
      // ---------------- Serial
      case B.SERIAL_BEGIN:
        this.serialBegun = true;
        return;
      case B.SERIAL_FLUSH:
        return;
      case B.SERIAL_AVAILABLE:
        return this.rx.length + Math.max(0, host.serialAvailable() | 0);
      case B.SERIAL_READ:
        return this.readByte();
      case B.SERIAL_PEEK:
        return this.peekByte();
      case B.SERIAL_PARSE_INT:
      case B.SERIAL_PARSE_FLOAT: {
        const isFloat = id === B.SERIAL_PARSE_FLOAT;
        // skip characters that cannot start a number
        for (;;) {
          const c = this.peekByte();
          if (c < 0) return 0;
          if ((c >= 48 && c <= 57) || c === 45 || (isFloat && c === 46)) break;
          this.readByte();
        }
        let s = "";
        for (;;) {
          const c = this.peekByte();
          if (c < 0) break;
          const ch = String.fromCharCode(c);
          if (/[0-9]/.test(ch) || (ch === "-" && s === "") || (isFloat && ch === "." && !s.includes("."))) {
            s += ch;
            this.readByte();
          } else break;
        }
        const v = isFloat ? parseFloat(s) : parseInt(s, 10);
        return Number.isFinite(v) ? (isFloat ? Math.fround(v) : v | 0) : 0;
      }
      case B.SERIAL_READ_STRING: {
        let s = "";
        for (let c = this.readByte(); c >= 0; c = this.readByte()) s += String.fromCharCode(c);
        return s;
      }
      case B.SERIAL_READ_UNTIL: {
        const term = (a[0] as number) & 0xff;
        let s = "";
        for (let c = this.readByte(); c >= 0; c = this.readByte()) {
          if (c === term) break;
          s += String.fromCharCode(c);
        }
        return s;
      }
      case B.SERIAL_WRITE_BYTE:
        this.serialOut(String.fromCharCode((a[0] as number) & 0xff));
        return 1;
      case B.SERIAL_WRITE_STR:
        this.serialOut(a[0] as string);
        return (a[0] as string).length;
      // ---------------- Servo
      case B.SERVO_NEW:
        return newServo();
      case B.SERVO_ATTACH: {
        const s = this.servoArg(a[0]);
        const pin = a[1] as number;
        if (!this.checkPin("servo.attach", pin)) return 0;
        if (s.pin < 0) this.servoCount++;
        s.pin = pin;
        s.min = a[2];
        s.max = a[3];
        if (s.max <= s.min) { s.min = 544; s.max = 2400; }
        if (!s.written) {
          // centre the servo (90°) on attach, like a real servo receiving its first pulses
          s.us = arduinoMap(90, 0, 180, s.min, s.max);
          s.lastAngle = 90;
        }
        host.servoWrite(pin, s.lastAngle);
        return this.servoCount - 1;
      }
      case B.SERVO_WRITE:
      case B.SERVO_WRITE_US: {
        const s = this.servoArg(a[0]);
        let v = a[1] as number;
        let angle: number;
        s.written = true;
        if (id === B.SERVO_WRITE && v < 544) {
          if (v < 0 || v > 180) this.warn(`servo.write(${v}): servo angles go from 0 to 180 — clamped`);
          v = Math.max(0, Math.min(180, v));
          angle = v;
          s.us = arduinoMap(v, 0, 180, s.min, s.max);
        } else {
          s.us = Math.max(s.min, Math.min(s.max, v));
          angle = usToAngle(s, s.us);
        }
        if (s.pin < 0) {
          this.warn("servo.write() before servo.attach(pin) — the servo will not move");
          return;
        }
        s.lastAngle = angle;
        host.servoWrite(s.pin, angle);
        return;
      }
      case B.SERVO_READ: {
        const s = this.servoArg(a[0]);
        return arduinoMap(s.us + 1, s.min, s.max, 0, 180);
      }
      case B.SERVO_READ_US:
        return this.servoArg(a[0]).us;
      case B.SERVO_ATTACHED:
        return this.servoArg(a[0]).pin >= 0 ? 1 : 0;
      case B.SERVO_DETACH: {
        const s = this.servoArg(a[0]);
        if (s.pin >= 0) this.servoCount--;
        s.pin = -1;
        return;
      }
      // ---------------- String
      case B.STR_LENGTH: return (a[0] as string).length;
      case B.STR_ISEMPTY: return (a[0] as string).length === 0 ? 1 : 0;
      case B.STR_CHARAT: {
        const s = a[0] as string;
        const i = a[1] as number;
        return i < s.length ? wrap(s.charCodeAt(i), K.I8) : 0;
      }
      case B.STR_INDEXOF: {
        const [s, needle, from] = a as [string, string, number];
        return s.indexOf(needle, Math.max(0, from));
      }
      case B.STR_LASTINDEXOF: {
        const [s, needle, from] = a as [string, string, number];
        return from < 0 ? s.lastIndexOf(needle) : s.lastIndexOf(needle, from);
      }
      case B.STR_SUBSTRING: {
        const s = a[0] as string;
        let left = a[1] as number;
        let right = a[2] as number;
        if (right < 0) right = s.length;
        if (left > right) [left, right] = [right, left];
        if (left >= s.length) return "";
        if (right > s.length) right = s.length;
        return s.slice(left, right);
      }
      case B.STR_TOINT: {
        const m = /^\s*([+-]?\d+)/.exec(a[0] as string);
        return m ? parseInt(m[1], 10) | 0 : 0;
      }
      case B.STR_TOFLOAT: {
        const v = parseFloat(a[0] as string);
        return Number.isFinite(v) ? Math.fround(v) : 0;
      }
      case B.STR_EQUALS: return a[0] === a[1] ? 1 : 0;
      case B.STR_EQUALS_IC: return (a[0] as string).toLowerCase() === (a[1] as string).toLowerCase() ? 1 : 0;
      case B.STR_STARTS: return (a[0] as string).startsWith(a[1]) ? 1 : 0;
      case B.STR_ENDS: return (a[0] as string).endsWith(a[1]) ? 1 : 0;
      case B.STR_COMPARE: return a[0] < a[1] ? -1 : a[0] > a[1] ? 1 : 0;
      case B.STR_TRIM: return (a[0] as string).replace(/^[\s]+|[\s]+$/g, "");
      case B.STR_UPPER: return (a[0] as string).toUpperCase();
      case B.STR_LOWER: return (a[0] as string).toLowerCase();
      case B.STR_REPLACE: {
        const [s, from, to] = a as string[];
        return from === "" ? s : s.split(from).join(to);
      }
      case B.STR_REMOVE: {
        const s = a[0] as string;
        const idx = a[1] as number;
        if (idx >= s.length) return s;
        const count = Math.min(a[2] as number, s.length - idx);
        return s.slice(0, idx) + s.slice(idx + count);
      }
      case B.STR_SETCHARAT: {
        const s = a[0] as string;
        const i = a[1] as number;
        if (i >= s.length) return s;
        return s.slice(0, i) + String.fromCharCode((a[2] as number) & 0xff) + s.slice(i + 1);
      }
      case B.STRLEN: {
        if (ins.c === 1) {
          const arr = a[0] as number[];
          const z = arr.indexOf(0);
          return z < 0 ? arr.length : z;
        }
        return (a[0] as string).length;
      }
      case B.CHAR_CLASS: return charClass(ins.c, (a[0] as number) & 0xff) ? 1 : 0;
    }
    throw new RtError(`Unknown built-in #${id}`);
  }

  private analogPinNames(): string {
    const names = Object.entries(this.board.constants).filter(([k]) => /^A\d+$/.test(k));
    if (names.length) return names.map(([k, v]) => `${k}=${v}`).join(", ");
    return this.board.analogPins.join(", ");
  }
}

// ------------------------------------------------------------------------------------------------
// formatting helpers (Arduino-compatible)
// ------------------------------------------------------------------------------------------------

function newServo(): ServoObj {
  return { __servo: true, pin: -1, us: 1472, min: 544, max: 2400, lastAngle: 90, written: false };
}

function arduinoMap(x: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return (Math.trunc(((x - inMin) * (outMax - outMin)) / (inMax - inMin)) + outMin) | 0;
}

function usToAngle(s: ServoObj, us: number): number {
  return Math.round((((us - s.min) * 180) / (s.max - s.min)) * 10) / 10;
}

/** Arduino Print::printFloat */
export function formatFloat(value: number, digits: number): string {
  if (Number.isNaN(value)) return "nan";
  if (!Number.isFinite(value)) return "inf";
  if (value > 4294967040.0) return "ovf";
  if (value < -4294967040.0) return "ovf";
  let out = "";
  let number = value;
  if (number < 0.0) {
    out += "-";
    number = -number;
  }
  if (digits < 0) digits = 2;
  let rounding = 0.5;
  for (let i = 0; i < digits; ++i) rounding /= 10.0;
  number += rounding;
  const intPart = Math.floor(number) >>> 0;
  let remainder = number - intPart;
  out += String(intPart);
  if (digits > 0) out += ".";
  while (digits-- > 0) {
    remainder *= 10.0;
    const toPrint = Math.floor(remainder);
    out += String(toPrint);
    remainder -= toPrint;
  }
  return out;
}

/** Arduino Print::print(long/unsigned long, base) */
export function formatInt(v: number, base: number | undefined): string {
  if (base === undefined || base === 10) return String(v);
  if (base < 2 || base > 36) return String(v);
  const u = v < 0 ? v >>> 0 : v;
  return u.toString(base).toUpperCase();
}

function charArrayToString(arr: unknown[]): string {
  let s = "";
  for (const c of arr) {
    if (!c) break;
    s += String.fromCharCode((c as number) & 0xff);
  }
  return s;
}

function printStr(v: unknown, fmt: number, extra: number | undefined): string {
  switch (fmt) {
    case F.INT: return formatInt(v as number, extra);
    case F.CHAR: return String.fromCharCode((v as number) & 0xff);
    case F.FLOAT: return formatFloat(v as number, extra ?? 2);
    case F.STR: return String(v);
    case F.CHARARR: return charArrayToString(v as unknown[]);
  }
  return String(v);
}

/** String(value[, base|decimals]) conversion (uses lowercase hex like the Arduino String class) */
function toStr(v: unknown, fmt: number, extra: number | undefined): string {
  switch (fmt) {
    case F.INT: {
      if (extra === undefined || extra === 10) return String(v);
      const n = v as number;
      return (n < 0 ? n >>> 0 : n).toString(extra);
    }
    case F.CHAR: return String.fromCharCode((v as number) & 0xff);
    case F.FLOAT: {
      const d = extra ?? 2;
      const n = v as number;
      if (Number.isNaN(n)) return "nan";
      if (!Number.isFinite(n)) return n > 0 ? "inf" : "-inf";
      return n.toFixed(Math.max(0, Math.min(20, d)));
    }
    case F.STR: return String(v);
    case F.CHARARR: return charArrayToString(v as unknown[]);
  }
  return String(v);
}

function math1(name: string, v: number): number {
  switch (name) {
    case "sqrt": return Math.sqrt(v);
    case "sin": return Math.sin(v);
    case "cos": return Math.cos(v);
    case "tan": return Math.tan(v);
    case "asin": return Math.asin(v);
    case "acos": return Math.acos(v);
    case "atan": return Math.atan(v);
    case "exp": return Math.exp(v);
    case "log": return Math.log(v);
    case "log10": return Math.log10(v);
    case "fabs": return Math.abs(v);
    case "floor": return Math.floor(v);
    case "ceil": return Math.ceil(v);
    case "trunc": return Math.trunc(v);
    case "cbrt": return Math.cbrt(v);
    case "round": return v < 0 ? -Math.round(-v) : Math.round(v);
    case "radians": return (v * Math.PI) / 180;
    case "degrees": return (v * 180) / Math.PI;
  }
  throw new RtError(`Unknown math function ${name}`);
}

function math2(name: string, a: number, b: number): number {
  switch (name) {
    case "pow": return Math.pow(a, b);
    case "atan2": return Math.atan2(a, b);
    case "fmod": return a % b;
    case "hypot": return Math.hypot(a, b);
    case "fmin": return Math.min(a, b);
    case "fmax": return Math.max(a, b);
  }
  throw new RtError(`Unknown math function ${name}`);
}

function charClass(name: string, c: number): boolean {
  const ch = String.fromCharCode(c);
  switch (name) {
    case "isDigit": return c >= 48 && c <= 57;
    case "isAlpha": return /[A-Za-z]/.test(ch);
    case "isAlphaNumeric": return /[A-Za-z0-9]/.test(ch);
    case "isSpace": return c === 32 || (c >= 9 && c <= 13);
    case "isWhitespace": return c === 32 || c === 9;
    case "isUpperCase": return c >= 65 && c <= 90;
    case "isLowerCase": return c >= 97 && c <= 122;
    case "isPunct": return c > 32 && c < 127 && !/[A-Za-z0-9]/.test(ch);
    case "isHexadecimalDigit": return /[0-9A-Fa-f]/.test(ch);
    case "isPrintable": return c >= 32 && c < 127;
    case "isControl": return c < 32 || c === 127;
    case "isAscii": return c < 128;
    case "isGraph": return c > 32 && c < 127;
  }
  return false;
}
