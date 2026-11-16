/**
 * BEAST compiler: source -> (lex, preprocess, parse) -> semantic check + bytecode generation.
 * Produces diagnostics with accurate line/column, static pin usage and the program for ArduinoRuntime.
 */
import type { BoardProfile, CompileResult, Diagnostic, PinModeValue, PinUsage } from "./types";
import type { Declarator, EnumDecl, Expr, FuncDecl, Loc, Param, Stmt, TypeSpec, VarDecl } from "./ast";
import { lex } from "./lexer";
import { preprocess, type MacroDef } from "./preprocess";
import { parse } from "./parser";
import { B, F, JUMP_OPS, K, OP, wrap, type CompiledProgram, type FuncCode, type Instr } from "./bytecode";
import { boardArch, intBitsFor, usesInterruptNumbers } from "./boards";

// ------------------------------------------------------------------------------------------------
// Types
// ------------------------------------------------------------------------------------------------

export type CType =
  | { k: "int"; bits: 8 | 16 | 32; signed: boolean; isChar?: boolean; name: string }
  | { k: "float"; bits: 32 | 64; name: string }
  | { k: "bool"; name: string }
  | { k: "void"; name: string }
  | { k: "String"; name: string }
  | { k: "cstr"; name: string }
  | { k: "array"; elem: CType; size: number | null; name: string }
  | { k: "Servo"; name: string }
  | { k: "SoftwareSerial"; name: string };

type IntType = Extract<CType, { k: "int" }>;

interface VarSym {
  kind: "var";
  name: string;
  type: CType;
  storage: "local" | "global";
  slot: number;
  isConst: boolean;
  constValue?: number;
  initConst?: number; // constant initial value (for non-const globals, used by pin resolution)
  line: number;
  col: number;
  mutated: boolean;
}
interface ConstSym {
  kind: "const";
  name: string;
  type: CType;
  value: number;
  line: number;
}
interface FuncSym {
  kind: "func";
  name: string;
  index: number;
  ret: CType;
  params: { type: CType; name: string | null }[];
  defined: boolean;
  decl: FuncDecl;
}
type Sym = VarSym | ConstSym;

class CompileError extends Error {}

interface PinRecord {
  call: PinUsage["call"];
  arg: Expr;
  sym?: VarSym | ConstSym;
  modeArg?: Expr;
  viaInterruptNumber?: boolean;
  loc: Loc;
  scopes: Map<string, Sym>[];
}

const LANGUAGE_CONSTANTS: Record<string, number> = {
  HIGH: 1,
  LOW: 0,
  INPUT: 0,
  OUTPUT: 1,
  INPUT_PULLUP: 2,
  CHANGE: 1,
  FALLING: 2,
  RISING: 3,
  LSBFIRST: 0,
  MSBFIRST: 1,
  DEC: 10,
  HEX: 16,
  OCT: 8,
  BIN: 2,
  NOT_AN_INTERRUPT: -1,
  DEFAULT: 1,
  EXTERNAL: 0,
  INTERNAL: 3,
};
const FLOAT_CONSTANTS: Record<string, number> = {
  PI: Math.PI,
  HALF_PI: Math.PI / 2,
  TWO_PI: Math.PI * 2,
  DEG_TO_RAD: Math.PI / 180,
  RAD_TO_DEG: 180 / Math.PI,
  EULER: Math.E,
};
const UNSIGNED_LONG_CONSTANTS: Record<string, number> = {};

const MATH1 = new Set(["sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "exp", "log", "log10", "fabs", "floor", "ceil", "radians", "degrees", "trunc", "cbrt"]);
const MATH2 = new Set(["pow", "atan2", "fmod", "hypot", "fmin", "fmax"]);
const CHAR_CLASSES = new Set(["isDigit", "isAlpha", "isAlphaNumeric", "isSpace", "isWhitespace", "isUpperCase", "isLowerCase", "isPunct", "isHexadecimalDigit", "isPrintable", "isControl", "isAscii", "isGraph"]);

const SERIAL_NAMES = new Set(["Serial", "Serial1", "Serial2", "Serial3", "SerialUSB"]);

const BUILTIN_NAMES = [
  "pinMode", "digitalWrite", "digitalRead", "analogWrite", "analogRead", "analogReadResolution", "analogWriteResolution",
  "analogReference", "delay", "delayMicroseconds", "millis", "micros", "pulseIn", "pulseInLong", "map", "constrain", "abs",
  "min", "max", "sq", "round", "random", "randomSeed", "bitRead", "bitWrite", "bitSet", "bitClear", "bit", "highByte",
  "lowByte", "attachInterrupt", "detachInterrupt", "digitalPinToInterrupt", "noInterrupts", "interrupts", "tone",
  "noTone", "yield", "exit", "F", "String", "strlen", ...MATH1, ...MATH2, ...CHAR_CLASSES,
];

// ------------------------------------------------------------------------------------------------
// Public entry
// ------------------------------------------------------------------------------------------------

export function compile(source: string, opts: { board: BoardProfile }): CompileResult {
  const board = opts.board;
  const diagnostics: Diagnostic[] = [];
  const lexed = lex(source);
  diagnostics.push(...lexed.diagnostics);
  const pp = preprocess(lexed.tokens);
  diagnostics.push(...pp.diagnostics);
  const parsed = parse(pp.tokens);
  diagnostics.push(...parsed.diagnostics);

  const c = new Compiler(source, board, pp.macros, pp.includes.map((i) => i.name));
  const syntaxOk = !diagnostics.some((d) => d.severity === "error");
  let program: CompiledProgram | undefined;
  try {
    program = c.compileProgram(parsed.ast.items, syntaxOk);
  } catch (e) {
    if (!(e instanceof CompileError)) {
      c.diags.push({ line: 1, column: 1, severity: "error", message: `Internal compiler error: ${(e as Error).message}`, code: "INTERNAL" });
    }
  }
  diagnostics.push(...c.diags);

  const pinSymbols = c.pinSymbols(pp.defines);
  const pinUsage = c.resolvePinUsage();
  diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
  // de-duplicate identical diagnostics
  const seen = new Set<string>();
  const uniq = diagnostics.filter((d) => {
    const key = `${d.line}:${d.column}:${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const ok = !uniq.some((d) => d.severity === "error") && !!program;
  return {
    ok,
    diagnostics: uniq,
    program: ok ? program : undefined,
    pinUsage,
    pinSymbols,
    hasSetup: c.hasSetup,
    hasLoop: c.hasLoop,
  };
}

// ------------------------------------------------------------------------------------------------
// Compiler
// ------------------------------------------------------------------------------------------------

interface LoopCtx {
  breaks: number[];
  continues: number[] | null; // null for switch
}

interface FnCtx {
  sym: FuncSym | null;
  nLocals: number;
  isIsr?: boolean;
}

class Compiler {
  diags: Diagnostic[] = [];
  hasSetup = false;
  hasLoop = false;
  readonly intBits: 16 | 32;
  readonly avr: boolean;
  readonly T: Record<string, CType>;
  globals = new Map<string, Sym>();
  globalVars: VarSym[] = [];
  funcs = new Map<string, FuncSym>();
  funcCodes: FuncCode[] = [];
  scopes: Map<string, Sym>[] = [];
  code: Instr[] = [];
  initCode: Instr[] = [];
  fn: FnCtx = { sym: null, nLocals: 0 };
  loops: LoopCtx[] = [];
  curLine = 0;
  curCol = 0;
  nGlobals = 0;
  pinRecords: PinRecord[] = [];
  enumTypes = new Set<string>();
  suppressPins = 0;

  constructor(
    private source: string,
    private board: BoardProfile,
    private macros: Map<string, MacroDef>,
    private includes: string[],
  ) {
    this.intBits = intBitsFor(board);
    this.avr = boardArch(board) === "avr";
    const I = (bits: 8 | 16 | 32, signed: boolean, name: string, isChar = false): CType => ({ k: "int", bits, signed, name, isChar });
    this.T = {
      int: I(this.intBits, true, "int"),
      uint: I(this.intBits, false, "unsigned int"),
      long: I(32, true, "long"),
      ulong: I(32, false, "unsigned long"),
      short: I(16, true, "short"),
      ushort: I(16, false, "unsigned short"),
      char: I(8, true, "char", true),
      schar: I(8, true, "int8_t"),
      uchar: I(8, false, "byte"),
      float: { k: "float", bits: 32, name: "float" },
      double: { k: "float", bits: this.avr ? 32 : 64, name: "double" },
      bool: { k: "bool", name: "bool" },
      void: { k: "void", name: "void" },
      String: { k: "String", name: "String" },
      cstr: { k: "cstr", name: "const char*" },
      Servo: { k: "Servo", name: "Servo" },
      SoftwareSerial: { k: "SoftwareSerial", name: "SoftwareSerial" },
    };
  }

  // ---------- diagnostics ----------
  error(loc: { line: number; col: number }, message: string, code = "SEMANTIC"): never {
    this.diags.push({ line: loc.line, column: loc.col, severity: "error", message, code });
    throw new CompileError(message);
  }
  softError(loc: { line: number; col: number }, message: string, code = "SEMANTIC") {
    this.diags.push({ line: loc.line, column: loc.col, severity: "error", message, code });
  }
  warn(loc: { line: number; col: number }, message: string, code = "WARNING") {
    this.diags.push({ line: loc.line, column: loc.col, severity: "warning", message, code });
  }
  text(loc: Loc): string {
    return this.source.slice(loc.start, loc.end);
  }

  // ---------- emission ----------
  emit(op: number, a: unknown = 0, b: unknown = 0, c: unknown = 0, d = 0): number {
    this.code.push({ op, a, b, c, d, line: this.curLine, col: this.curCol });
    return this.code.length - 1;
  }
  here(): number {
    return this.code.length;
  }
  patch(i: number, target: number) {
    this.code[i].a = target;
  }
  at(loc: Loc) {
    this.curLine = loc.line;
    this.curCol = loc.col;
  }

  // ---------- types ----------
  resolveType(ts: TypeSpec): CType {
    const T = this.T;
    switch (ts.base) {
      case "void": return T.void;
      case "bool": return T.bool;
      case "char": return T.char;
      case "signed char": return T.schar;
      case "unsigned char": return T.uchar;
      case "short": return T.short;
      case "unsigned short": return T.ushort;
      case "int": return T.int;
      case "unsigned int": return T.uint;
      case "size_t": return T.uint;
      case "long": return T.long;
      case "unsigned long": return T.ulong;
      case "float": return T.float;
      case "double": return T.double;
      case "String": return T.String;
      case "cstr": return T.cstr;
      case "Servo":
        if (!this.includes.includes("Servo.h")) this.softError(ts.loc, "Servo needs '#include <Servo.h>' at the top of the sketch", "UNDECLARED");
        return T.Servo;
      case "SoftwareSerial":
        if (!this.includes.includes("SoftwareSerial.h")) this.softError(ts.loc, "SoftwareSerial needs '#include <SoftwareSerial.h>'", "UNDECLARED");
        return T.SoftwareSerial;
    }
    if (ts.base.startsWith("enum:")) return T.int;
    return this.error(ts.loc, `Unknown type '${ts.base}'`);
  }

  kindOf(t: CType): number {
    switch (t.k) {
      case "int":
        if (t.bits === 8) return t.signed ? K.I8 : K.U8;
        if (t.bits === 16) return t.signed ? K.I16 : K.U16;
        return t.signed ? K.I32 : K.U32;
      case "float": return t.bits === 32 ? K.F32 : K.F64;
      case "bool": return K.BOOL;
      default: return K.NONE;
    }
  }
  isNum(t: CType): boolean {
    return t.k === "int" || t.k === "float" || t.k === "bool";
  }
  isInt(t: CType): boolean {
    return t.k === "int" || t.k === "bool";
  }
  promote(t: CType): CType {
    if (t.k === "bool") return this.T.int;
    if (t.k === "int" && (t.bits < this.intBits || t.isChar)) {
      if (t.bits < this.intBits) return this.T.int;
      return { ...t, isChar: false };
    }
    return t;
  }
  common(a: CType, b: CType): CType {
    if (a.k === "float" || b.k === "float") {
      const ab = a.k === "float" ? a.bits : 0;
      const bb = b.k === "float" ? b.bits : 0;
      return Math.max(ab, bb) === 64 ? { k: "float", bits: 64, name: "double" } : this.T.float;
    }
    const pa = this.promote(a) as IntType;
    const pb = this.promote(b) as IntType;
    if (pa.signed === pb.signed) return pa.bits >= pb.bits ? pa : pb;
    const u = pa.signed ? pb : pa;
    const s = pa.signed ? pa : pb;
    if (u.bits >= s.bits) return u;
    return s;
  }
  sameType(a: CType, b: CType): boolean {
    if (a.k !== b.k) return false;
    if (a.k === "int" && b.k === "int") return a.bits === b.bits && a.signed === b.signed;
    if (a.k === "float" && b.k === "float") return a.bits === b.bits;
    if (a.k === "array" && b.k === "array") return this.sameType(a.elem, b.elem) && (a.size === b.size || a.size === null || b.size === null);
    return true;
  }
  sizeOf(t: CType, loc: Loc): number {
    switch (t.k) {
      case "int": return t.bits / 8;
      case "float": return t.bits / 8;
      case "bool": return 1;
      case "cstr": return this.avr ? 2 : 4;
      case "array":
        if (t.size === null) return this.avr ? 2 : 4;
        return t.size * this.sizeOf(t.elem, loc);
      default:
        return this.error(loc, `sizeof(${t.name}) is not supported by the BEAST interpreter`, "UNSUPPORTED_FEATURE");
    }
  }
  arrayType(elem: CType, dims: number[]): CType {
    let t = elem;
    for (let i = dims.length - 1; i >= 0; i--) t = { k: "array", elem: t, size: dims[i], name: `${elem.name}[]` };
    return t;
  }
  defaultValue(t: CType): unknown {
    if (t.k === "String") return "";
    if (t.k === "cstr") return "";
    if (t.k === "Servo") return "servo";
    if (t.k === "SoftwareSerial") return 0;
    return 0;
  }

  /** Emit code converting the value on top of the stack from `from` to `to`. */
  emitConv(from: CType, to: CType, loc: Loc, what = "value"): void {
    const op = this.convInstr(from, to, loc, what);
    if (op) this.emit(op.op, op.a, op.b, op.c);
  }
  convInstr(from: CType, to: CType, loc: Loc, what = "value"): { op: number; a: unknown; b?: unknown; c?: unknown } | null {
    if (this.isNum(to)) {
      if (!this.isNum(from)) {
        if (from.k === "String") this.error(loc, `Cannot use a String as a number (${what}) — use .toInt() or .toFloat()`, "TYPE");
        if (from.k === "cstr") this.error(loc, `Cannot use text as a number (${what})`, "TYPE");
        if (from.k === "array") this.error(loc, `Cannot use a whole array as a number (${what}) — pick one element with [index]`, "TYPE");
        if (from.k === "void") this.error(loc, `This function does not return a value (it is void), so it cannot be used as ${what}`, "TYPE");
        this.error(loc, `Cannot convert ${from.name} to ${to.name}`, "TYPE");
      }
      const fk = this.kindOf(from);
      const tk = this.kindOf(to);
      if (fk === tk) return null;
      // widening to double never changes the value
      if (tk === K.F64) return null;
      // widening integer conversions are no-ops
      if (from.k === "int" && to.k === "int" && to.bits > from.bits && (from.signed === to.signed || (!from.signed && to.signed))) return null;
      if (from.k === "bool" && to.k === "int") return null;
      if (to.k === "float" && from.k !== "float" && to.bits === 32 && from.k === "int" && from.bits <= 16) return null; // exact in float32
      return { op: OP.CONV, a: tk };
    }
    if (to.k === "String") {
      if (from.k === "String" || from.k === "cstr") return null;
      if (from.k === "array" && from.elem.k === "int" && from.elem.isChar) return { op: OP.TOSTR, a: F.CHARARR };
      if (this.isNum(from)) return { op: OP.TOSTR, a: this.fmtOf(from) };
      this.error(loc, `Cannot convert ${from.name} to String`, "TYPE");
    }
    if (to.k === "cstr") {
      if (from.k === "cstr") return null;
      if (from.k === "array" && from.elem.k === "int" && from.elem.isChar) return { op: OP.TOSTR, a: F.CHARARR };
      if (from.k === "String") this.error(loc, "Cannot convert a String to const char* — use .c_str()", "TYPE");
      this.error(loc, `Cannot convert ${from.name} to const char*`, "TYPE");
    }
    if (to.k === "array") {
      if (from.k !== "array" || !this.sameType(from.elem, to.elem)) this.error(loc, `Expected an array of ${to.elem.name} but got ${from.name}`, "TYPE");
      return null;
    }
    if (from.k !== to.k) this.error(loc, `Cannot convert ${from.name} to ${to.name}`, "TYPE");
    return null;
  }
  fmtOf(t: CType): number {
    if (t.k === "int" && t.isChar) return F.CHAR;
    if (t.k === "float") return F.FLOAT;
    if (t.k === "String" || t.k === "cstr") return F.STR;
    if (t.k === "array" && t.elem.k === "int" && t.elem.isChar) return F.CHARARR;
    return F.INT;
  }

  // ---------- symbols ----------
  lookup(name: string): Sym | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const s = this.scopes[i].get(name);
      if (s) return s;
    }
    return this.globals.get(name);
  }
  declareLocal(name: string, type: CType, isConst: boolean, loc: Loc): VarSym {
    const scope = this.scopes[this.scopes.length - 1];
    if (scope.has(name)) this.error(loc, `'${name}' is already declared in this block`, "REDECLARED");
    const sym: VarSym = { kind: "var", name, type, storage: "local", slot: this.fn.nLocals++, isConst, line: loc.line, col: loc.col, mutated: false };
    scope.set(name, sym);
    return sym;
  }
  declareGlobal(name: string, type: CType, isConst: boolean, loc: Loc): VarSym {
    if (this.globals.has(name)) this.error(loc, `'${name}' is already declared (line ${this.globals.get(name)!.line})`, "REDECLARED");
    if (this.funcs.has(name)) this.error(loc, `'${name}' is already the name of a function`, "REDECLARED");
    const sym: VarSym = { kind: "var", name, type, storage: "global", slot: this.nGlobals++, isConst, line: loc.line, col: loc.col, mutated: false };
    this.globals.set(name, sym);
    this.globalVars.push(sym);
    return sym;
  }

  suggest(name: string): string {
    const candidates = new Set<string>([...BUILTIN_NAMES, ...this.funcs.keys(), ...this.globals.keys(), ...Object.keys(LANGUAGE_CONSTANTS), ...Object.keys(this.board.constants), "Serial"]);
    for (const s of this.scopes) for (const k of s.keys()) candidates.add(k);
    const lower = name.toLowerCase();
    for (const c of candidates) if (c.toLowerCase() === lower) return ` — did you mean '${c}'? (names are case-sensitive)`;
    if (name.length > 3) {
      for (const c of candidates) if (Math.abs(c.length - name.length) <= 2 && levenshtein(c, name) <= 2) return ` — did you mean '${c}'?`;
    }
    return "";
  }

  // ---------- constant evaluation ----------
  constEval(e: Expr): { v: number; float: boolean } | null {
    switch (e.kind) {
      case "num": return { v: e.value, float: e.isFloat };
      case "char": return { v: e.value, float: false };
      case "bool": return { v: e.value ? 1 : 0, float: false };
      case "ident": {
        const s = this.lookup(e.name);
        if (s) {
          if (s.kind === "const") return { v: s.value, float: false };
          if (s.isConst && s.constValue !== undefined) return { v: s.constValue, float: s.type.k === "float" };
          return null;
        }
        const b = this.builtinConstant(e.name);
        return b ? { v: b.v, float: b.t.k === "float" } : null;
      }
      case "unary": {
        const a = this.constEval(e.arg);
        if (!a) return null;
        switch (e.op) {
          case "-": return { v: -a.v, float: a.float };
          case "+": return a;
          case "!": return { v: a.v ? 0 : 1, float: false };
          case "~": return a.float ? null : { v: ~a.v, float: false };
        }
        return null;
      }
      case "binary": {
        const l = this.constEval(e.left);
        const r = this.constEval(e.right);
        if (!l || !r) return null;
        const fl = l.float || r.float;
        const a = l.v, b = r.v;
        switch (e.op) {
          case "+": return { v: a + b, float: fl };
          case "-": return { v: a - b, float: fl };
          case "*": return { v: a * b, float: fl };
          case "/": if (b === 0) return null; return { v: fl ? a / b : Math.trunc(a / b), float: fl };
          case "%": if (b === 0 || fl) return null; return { v: a % b, float: false };
          case "<<": return { v: a * Math.pow(2, b), float: false };
          case ">>": return { v: a >> b, float: false };
          case "&": return { v: a & b, float: false };
          case "|": return { v: a | b, float: false };
          case "^": return { v: a ^ b, float: false };
          case "<": return { v: a < b ? 1 : 0, float: false };
          case ">": return { v: a > b ? 1 : 0, float: false };
          case "<=": return { v: a <= b ? 1 : 0, float: false };
          case ">=": return { v: a >= b ? 1 : 0, float: false };
          case "==": return { v: a === b ? 1 : 0, float: false };
          case "!=": return { v: a !== b ? 1 : 0, float: false };
          case "&&": return { v: a && b ? 1 : 0, float: false };
          case "||": return { v: a || b ? 1 : 0, float: false };
        }
        return null;
      }
      case "cond": {
        const t = this.constEval(e.test);
        if (!t) return null;
        return this.constEval(t.v ? e.then : e.else);
      }
      case "cast": {
        const a = this.constEval(e.arg);
        if (!a) return null;
        let t: CType;
        try { t = this.resolveType(e.type); } catch { return null; }
        if (!this.isNum(t)) return null;
        return { v: wrap(a.v, this.kindOf(t)), float: t.k === "float" };
      }
      case "sizeof": {
        try {
          if (e.type) return { v: this.sizeOf(this.resolveType(e.type), e.loc), float: false };
          if (e.arg) return { v: this.sizeOf(this.typeOf(e.arg), e.loc), float: false };
        } catch { return null; }
        return null;
      }
      case "call": {
        // digitalPinToInterrupt(const) is constant
        if (e.callee.kind === "ident" && e.callee.name === "digitalPinToInterrupt" && e.args.length === 1 && !this.lookupFunc("digitalPinToInterrupt")) {
          const p = this.constEval(e.args[0]);
          if (!p) return null;
          return { v: this.pinToInterrupt(p.v), float: false };
        }
        return null;
      }
    }
    return null;
  }
  pinToInterrupt(pin: number): number {
    if (usesInterruptNumbers(this.board)) return this.board.interruptPins.indexOf(pin);
    return this.board.interruptPins.includes(pin) ? pin : -1;
  }
  lookupFunc(name: string): FuncSym | undefined {
    return this.funcs.get(name);
  }

  builtinConstant(name: string): { v: number; t: CType } | null {
    if (Object.prototype.hasOwnProperty.call(this.board.constants, name)) return { v: this.board.constants[name], t: this.T.int };
    if (Object.prototype.hasOwnProperty.call(LANGUAGE_CONSTANTS, name)) return { v: LANGUAGE_CONSTANTS[name], t: this.T.int };
    if (Object.prototype.hasOwnProperty.call(FLOAT_CONSTANTS, name)) return { v: FLOAT_CONSTANTS[name], t: this.T.double };
    if (Object.prototype.hasOwnProperty.call(UNSIGNED_LONG_CONSTANTS, name)) return { v: UNSIGNED_LONG_CONSTANTS[name], t: this.T.ulong };
    if (/^B[01]{1,8}$/.test(name)) return { v: parseInt(name.slice(1), 2), t: this.T.int };
    if (/^A\d+$/.test(name)) return null;
    return null;
  }

  /** type of an expression without emitting code (expression is compiled into a scratch buffer) */
  typeOf(e: Expr): CType {
    const saved = this.code;
    const savedPins = this.pinRecords.length;
    const savedDiags = this.diags.length;
    this.code = [];
    this.suppressPins++;
    try {
      const t = this.genExpr(e, true);
      this.diags.length = savedDiags; // warnings will be reported again by the real compilation
      return t;
    } finally {
      this.code = saved;
      this.suppressPins--;
      this.pinRecords.length = savedPins;
    }
  }

  // ------------------------------------------------------------------------------------------------
  // Program
  // ------------------------------------------------------------------------------------------------

  compileProgram(items: (VarDecl | FuncDecl | EnumDecl)[], syntaxOk: boolean): CompiledProgram | undefined {
    // pass 1: function signatures & enums
    const funcDecls: FuncDecl[] = [];
    for (const it of items) {
      if (it.kind === "func") {
        if (it.name === "setup" && it.body) this.hasSetup = true;
        if (it.name === "loop" && it.body) this.hasLoop = true;
        try { this.declareFunc(it); } catch (e) { if (!(e instanceof CompileError)) throw e; }
        funcDecls.push(it);
      }
    }
    // reserve function indices: 0 = main, 1 = global init
    // (funcCodes is filled as functions are compiled; indices assigned in declareFunc)
    // pass 2: in source order
    this.code = this.initCode;
    this.fn = { sym: null, nLocals: 0 };
    for (const it of items) {
      try {
        if (it.kind === "vardecl") this.globalDecl(it);
        else if (it.kind === "enum") this.enumDecl(it, true);
        else if (it.kind === "func" && it.body) this.funcBody(it);
      } catch (e) {
        if (!(e instanceof CompileError)) throw e;
      }
    }
    for (const f of this.funcs.values()) {
      if (!f.defined) this.softError(f.decl.loc, `Function ${f.name}() is declared but never defined (no body)`, "UNDEFINED");
    }
    const endLoc = { line: Math.max(1, this.source.split("\n").length), col: 1 };
    if (!syntaxOk) {
      // a syntax error may have swallowed setup()/loop(); don't pile on misleading errors
      if (/\bvoid\s+setup\s*\(/.test(this.source)) this.hasSetup = true;
      if (/\bvoid\s+loop\s*\(/.test(this.source)) this.hasLoop = true;
    }
    if (!this.hasSetup) this.diags.push({ line: endLoc.line, column: 1, severity: "error", message: "Missing 'void setup() { … }' — every Arduino sketch needs a setup() function (it can be empty).", code: "MISSING_SETUP" });
    if (!this.hasLoop) this.diags.push({ line: endLoc.line, column: 1, severity: "error", message: "Missing 'void loop() { … }' — every Arduino sketch needs a loop() function (it can be empty).", code: "MISSING_LOOP" });
    for (const name of ["setup", "loop"]) {
      const f = this.funcs.get(name);
      if (f && (f.ret.k !== "void" || f.params.length)) this.softError(f.decl.loc, `${name}() must be declared as 'void ${name}()' with no parameters`, "SEMANTIC");
    }
    if (!syntaxOk || this.diags.some((d) => d.severity === "error")) return undefined;

    // global init function
    this.code = this.initCode;
    this.curLine = 0;
    this.curCol = 0;
    this.emit(OP.RET_VOID);
    const initIndex = this.funcCodes.length;
    this.funcCodes.push({ name: "<globals>", code: this.initCode, nParams: 0, nLocals: this.fn.nLocals, isVoid: true, line: 0 });

    // main
    this.code = [];
    const setup = this.funcs.get("setup")!;
    const loop = this.funcs.get("loop")!;
    this.emit(OP.CALL, initIndex);
    this.emit(OP.POP);
    this.emit(OP.SET_STATE, "setup");
    this.emit(OP.CALL, setup.index);
    this.emit(OP.POP);
    this.emit(OP.SET_STATE, "loop");
    const top = this.here();
    this.emit(OP.CALL, loop.index);
    this.emit(OP.POP);
    // like the Arduino core's main(): call serialEvent() between loops when data is waiting
    const serialEvent = this.funcs.get("serialEvent");
    if (serialEvent && serialEvent.params.length === 0 && serialEvent.defined) {
      this.emit(OP.BUILTIN, B.SERIAL_AVAILABLE, 0);
      const skip = this.emit(OP.JF, 0);
      this.emit(OP.CALL, serialEvent.index);
      this.emit(OP.POP);
      this.patch(skip, this.here());
    }
    this.emit(OP.LOOP_DONE);
    this.emit(OP.JMP, top);
    const mainIndex = this.funcCodes.length;
    this.funcCodes.push({ name: "<main>", code: this.code, nParams: 0, nLocals: 0, isVoid: true, line: 0 });

    for (const f of this.funcCodes) f.code = stripNops(f.code);
    return {
      __beast: 1,
      board: this.board,
      intBits: this.intBits,
      avr: this.avr,
      funcs: this.funcCodes,
      mainIndex,
      nGlobals: this.nGlobals,
    };
  }

  declareFunc(d: FuncDecl) {
    if (this.globals.has(d.name)) this.error(d.loc, `'${d.name}' is already declared as a variable`, "REDECLARED");
    if (SERIAL_NAMES.has(d.name)) this.error(d.loc, `'${d.name}' is a reserved name`, "REDECLARED");
    const ret = this.resolveType(d.ret);
    if (ret.k === "Servo" || ret.k === "SoftwareSerial") this.error(d.ret.loc, `Functions cannot return ${ret.name}`, "UNSUPPORTED_FEATURE");
    const params = d.params.map((p) => ({ type: this.paramType(p), name: p.name }));
    const existing = this.funcs.get(d.name);
    if (existing) {
      const same = existing.params.length === params.length && existing.params.every((p, i) => this.sameType(p.type, params[i].type)) && this.sameType(existing.ret, ret);
      if (!same) this.error(d.loc, `Function ${d.name}() is declared twice with different parameters — function overloading is not supported`, "UNSUPPORTED_FEATURE");
      if (existing.defined && d.body) this.error(d.loc, `Function ${d.name}() is defined twice (first on line ${existing.decl.loc.line})`, "REDECLARED");
      if (d.body) { existing.defined = true; existing.decl = d; }
      return;
    }
    const index = this.funcCodes.length;
    this.funcCodes.push({ name: d.name, code: [], nParams: params.length, nLocals: 0, isVoid: ret.k === "void", line: d.loc.line });
    this.funcs.set(d.name, { kind: "func", name: d.name, index, ret, params, defined: !!d.body, decl: d });
  }

  paramType(p: Param): CType {
    let t = this.resolveType(p.type);
    if (t.k === "void") this.error(p.loc, "A parameter cannot have type void");
    if (t.k === "Servo" || t.k === "SoftwareSerial") this.error(p.loc, `Passing a ${t.name} object to a function needs references, which are not supported — use the global object directly`, "UNSUPPORTED_FEATURE");
    if (p.dims.length) {
      const dims: (number | null)[] = p.dims.map((d, i) => {
        if (!d) {
          if (i > 0) this.error(p.loc, "Only the first array dimension of a parameter may be empty, e.g. int grid[][3]");
          return null;
        }
        const c = this.constEval(d);
        if (!c || c.float || c.v <= 0) this.error(d.loc, "Array size must be a positive integer constant");
        return c.v;
      });
      for (let i = dims.length - 1; i >= 0; i--) t = { k: "array", elem: t, size: i === 0 ? null : dims[i], name: `${t.name}[]` };
    }
    return t;
  }

  funcBody(d: FuncDecl) {
    const sym = this.funcs.get(d.name);
    if (!sym || sym.decl !== d) return;
    this.code = [];
    this.fn = { sym, nLocals: 0 };
    this.scopes = [new Map()];
    this.loops = [];
    this.at(d.loc);
    d.params.forEach((p, i) => {
      if (!p.name) this.error(p.loc, "Function parameters need names in a function definition");
      this.declareLocal(p.name, sym.params[i].type, false, p.loc);
    });
    let hasReturn = false;
    const visit = (s: Stmt): void => {
      if (s.kind === "return") hasReturn = true;
      else if (s.kind === "block") s.body.forEach(visit);
      else if (s.kind === "if") { visit(s.then); if (s.else) visit(s.else); }
      else if (s.kind === "while" || s.kind === "dowhile" || s.kind === "for") visit(s.body);
      else if (s.kind === "switch") s.cases.forEach((c) => c.body.forEach(visit));
    };
    d.body!.forEach(visit);
    if (sym.ret.k !== "void" && !hasReturn) this.warn(d.loc, `Function ${d.name}() should return a ${sym.ret.name} but has no return statement`, "MISSING_RETURN");
    for (const s of d.body!) this.stmtSafe(s);
    this.at(d.endLoc);
    if (sym.ret.k === "void") this.emit(OP.RET_VOID);
    else {
      this.emit(OP.PUSH, 0);
      this.emit(OP.RET);
    }
    const fc = this.funcCodes[sym.index];
    fc.code = this.code;
    fc.nLocals = this.fn.nLocals;
    this.scopes = [];
    this.code = this.initCode;
    this.fn = { sym: null, nLocals: 0 };
  }

  stmtSafe(s: Stmt) {
    try {
      this.stmt(s);
    } catch (e) {
      if (!(e instanceof CompileError)) throw e;
      // keep going so the student sees more than one error
    }
  }

  // ---------- declarations ----------
  enumDecl(e: EnumDecl, global: boolean) {
    let next = 0;
    for (const m of e.members) {
      if (m.value) {
        const c = this.constEval(m.value);
        if (!c || c.float) this.error(m.value.loc, "Enum values must be integer constants");
        next = c.v;
      }
      const sym: ConstSym = { kind: "const", name: m.name, type: this.T.int, value: next, line: m.loc.line };
      if (global) {
        if (this.globals.has(m.name)) this.error(m.loc, `'${m.name}' is already declared`, "REDECLARED");
        this.globals.set(m.name, sym);
      } else {
        const scope = this.scopes[this.scopes.length - 1];
        if (scope.has(m.name)) this.error(m.loc, `'${m.name}' is already declared`, "REDECLARED");
        scope.set(m.name, sym);
      }
      next++;
    }
  }

  globalDecl(d: VarDecl) {
    const base = this.resolveType(d.type);
    for (const dc of d.decls) {
      this.at(dc.loc);
      try {
        this.varDecl(d, dc, base, true, false);
      } catch (e) {
        if (!(e instanceof CompileError)) throw e;
      }
    }
  }

  /** Declares one variable and emits its initialisation into the current code buffer. */
  varDecl(d: VarDecl, dc: Declarator, base: CType, global: boolean, isStaticLocal: boolean) {
    if (base.k === "void") this.error(dc.loc, `Variable '${dc.name}' cannot have type void`);
    if (BUILTIN_NAMES.includes(dc.name) && global) this.warn(dc.loc, `'${dc.name}' hides the built-in Arduino function of the same name`);
    if (SERIAL_NAMES.has(dc.name)) this.error(dc.loc, `'${dc.name}' is a reserved name`, "REDECLARED");
    const isConst = d.type.isConst;
    let type: CType = base;
    // ---- arrays
    if (dc.dims.length) {
      if (dc.dims.length > 2) this.error(dc.loc, "Arrays with more than 2 dimensions are not supported", "UNSUPPORTED_FEATURE");
      if (base.k === "SoftwareSerial" || base.k === "cstr") this.error(dc.loc, `Arrays of ${base.name} are not supported`, "UNSUPPORTED_FEATURE");
      const dims: (number | null)[] = dc.dims.map((x, i) => {
        if (!x) {
          if (i > 0) this.error(dc.loc, "Only the first array dimension may be left empty");
          return null;
        }
        const c = this.constEval(x);
        if (!c || c.float) this.error(x.loc, `Array size must be a constant integer (use a number, #define or const int)`);
        if (c.v <= 0) this.error(x.loc, "Array size must be greater than zero");
        if (c.v > 10000) this.error(x.loc, `Array size ${c.v} is too large for an Arduino`);
        return c.v;
      });
      const plan = this.initPlan(dc, base, dims);
      if (isStaticLocal && !plan.constant && plan.items.length) this.error(dc.loc, "A static local array must be initialised with constants", "UNSUPPORTED_FEATURE");
      const finalDims = plan.dims;
      type = this.arrayType(base, finalDims);
      const total = finalDims.reduce((a, b) => a * b, 1) * (this.isNum(base) ? (base.k === "bool" ? 1 : (base as { bits: number }).bits / 8) : 6);
      if (this.avr && total > 1500) this.warn(dc.loc, `Array '${dc.name}' uses about ${total} bytes — an ATmega328P only has 2048 bytes of RAM`);
      const sym = this.declareVar(dc, type, isConst, global, isStaticLocal);
      const store = () => (sym.storage === "global" ? this.emit(OP.STORE_G, sym.slot, 0) : this.emit(OP.STORE_L, sym.slot, 0));
      const load = () => (sym.storage === "global" ? this.emit(OP.LOAD_G, sym.slot) : this.emit(OP.LOAD_L, sym.slot));
      const target = isStaticLocal ? this.initCode : this.code;
      const saved = this.code;
      this.code = target;
      try {
        if (plan.constant) {
          this.emit(OP.PUSH_CLONE, plan.template);
          store();
        } else {
          this.emit(OP.NEWARR, finalDims, this.defaultValue(base));
          store();
          for (const it of plan.items) {
            load();
            for (let k = 0; k < it.path.length - 1; k++) {
              this.emit(OP.PUSH, it.path[k]);
              this.emit(OP.LOAD_ELEM, dc.name);
            }
            this.emit(OP.PUSH, it.path[it.path.length - 1]);
            const vt = this.genExpr(it.expr, true);
            this.emitConv(vt, base, it.expr.loc, `element of '${dc.name}'`);
            this.emit(OP.STORE_ELEM, dc.name, 0);
          }
        }
      } finally {
        this.code = saved;
      }
      return;
    }
    // ---- scalars / objects
    if (dc.init && dc.init.kind === "initlist") {
      if (dc.init.items.length !== 1) this.error(dc.init.loc, `'${dc.name}' is not an array, so it cannot be initialised with a { … } list`);
      dc = { ...dc, init: dc.init.items[0] };
    }
    if (base.k === "Servo") {
      if (dc.init || (dc.ctorArgs && dc.ctorArgs.length)) this.error(dc.loc, "A Servo is declared without arguments, e.g. 'Servo myServo;' — then call myServo.attach(pin) in setup()");
      const sym = this.declareVar(dc, type, isConst, global, isStaticLocal);
      this.withTarget(isStaticLocal, () => {
        this.emit(OP.BUILTIN, B.SERVO_NEW, 0);
        this.storeVar(sym);
      });
      return;
    }
    if (base.k === "SoftwareSerial") {
      const sym = this.declareVar(dc, type, isConst, global, isStaticLocal);
      this.warn(dc.loc, "SoftwareSerial can be declared, but using it is not supported by the BEAST simulator (use Serial instead)", "UNSUPPORTED_FEATURE");
      this.withTarget(isStaticLocal, () => {
        this.emit(OP.PUSH, 0);
        this.storeVar(sym);
      });
      return;
    }
    let init = dc.init;
    if (dc.ctorArgs) {
      if (base.k === "String" && dc.ctorArgs.length <= 2) {
        init = { kind: "call", callee: { kind: "ident", name: "String", loc: dc.loc }, args: dc.ctorArgs, loc: dc.loc };
      } else if (dc.ctorArgs.length === 1) init = dc.ctorArgs[0];
      else this.error(dc.loc, `Unexpected constructor arguments for '${dc.name}'`);
    }
    if (isConst && !init) this.error(dc.loc, `const variable '${dc.name}' must be initialised, e.g. const int ${dc.name} = 13;`);
    // constant value?
    let cv: { v: number; float: boolean } | null = null;
    if (init && this.isNum(base)) cv = this.constEval(init);
    if (isStaticLocal && init && !cv && base.k !== "String") {
      if (!(init.kind === "str")) this.error(init.loc, "A static local variable must be initialised with a constant", "UNSUPPORTED_FEATURE");
    }
    if (init) {
      // type-check the initialiser before declaring (so 'int x = x;' sees outer x, as in C it would be UB anyway)
    }
    const sym = this.declareVar(dc, type, isConst, global, isStaticLocal);
    if (cv && this.isNum(base)) {
      const v = wrap(cv.v, this.kindOf(base));
      if (isConst) sym.constValue = v;
      sym.initConst = v;
      const initT = this.typeOf(init!);
      const alreadyWarned = init!.kind === "binary" && initT.k === "int" && wrap(cv.v, this.kindOf(initT)) !== cv.v;
      if (!cv.float && base.k === "int" && v !== cv.v && Number.isInteger(cv.v) && !alreadyWarned) {
        this.warn(init!.loc, `The value ${cv.v} does not fit in ${base.name} (${base.bits}-bit ${base.signed ? "signed" : "unsigned"}) and becomes ${v}`, "OVERFLOW");
      }
    } else if (!init && this.isNum(base)) {
      sym.initConst = 0;
    }
    this.withTarget(isStaticLocal, () => {
      if (init) {
        if (init.kind === "assign") this.warn(init.loc, "Assignment inside an initialiser — did you mean ==?");
        const t = this.genExpr(init, true);
        this.emitConv(t, base, init.loc, `the initial value of '${dc.name}'`);
      } else {
        this.emit(OP.PUSH, this.defaultValue(base));
      }
      this.storeVar(sym);
    });
  }

  withTarget(staticLocal: boolean, fn: () => void) {
    if (!staticLocal) return fn();
    const saved = this.code;
    this.code = this.initCode;
    try { fn(); } finally { this.code = saved; }
  }

  declareVar(dc: Declarator, type: CType, isConst: boolean, global: boolean, isStaticLocal: boolean): VarSym {
    if (global) return this.declareGlobal(dc.name, type, isConst, dc.loc);
    if (isStaticLocal) {
      const scope = this.scopes[this.scopes.length - 1];
      if (scope.has(dc.name)) this.error(dc.loc, `'${dc.name}' is already declared in this block`, "REDECLARED");
      const sym: VarSym = { kind: "var", name: dc.name, type, storage: "global", slot: this.nGlobals++, isConst, line: dc.loc.line, col: dc.loc.col, mutated: false };
      scope.set(dc.name, sym);
      return sym;
    }
    return this.declareLocal(dc.name, type, isConst, dc.loc);
  }

  storeVar(sym: VarSym, keep = 0) {
    this.emit(sym.storage === "global" ? OP.STORE_G : OP.STORE_L, sym.slot, keep);
  }

  initPlan(dc: Declarator, base: CType, dims: (number | null)[]): { dims: number[]; items: { path: number[]; expr: Expr }[]; constant: boolean; template?: unknown[] } {
    const items: { path: number[]; expr: Expr }[] = [];
    const init = dc.init;
    const isCharElem = base.k === "int" && base.isChar;
    const strItems = (s: Extract<Expr, { kind: "str" }>, prefix: number[]) => {
      const codes = [...s.value].map((ch) => ch.charCodeAt(0) & 0xff);
      codes.push(0);
      codes.forEach((c, i) => items.push({ path: [...prefix, i], expr: { kind: "char", value: c, loc: s.loc } }));
      return codes.length;
    };
    let n0 = 0;
    let n1 = 0;
    if (init) {
      if (dims.length === 1) {
        if (init.kind === "str") {
          if (!isCharElem) this.error(init.loc, `Only char arrays can be initialised with "text"`);
          n0 = strItems(init, []);
        } else if (init.kind === "initlist") {
          init.items.forEach((x, i) => {
            if (x.kind === "initlist") this.error(x.loc, `'${dc.name}' is a 1-D array; nested { } lists need a 2-D array`);
            items.push({ path: [i], expr: x });
          });
          n0 = init.items.length;
        } else this.error(init.loc, `Initialise an array with a { … } list, e.g. int ${dc.name}[] = {1, 2, 3};`);
      } else {
        if (init.kind !== "initlist") this.error(init.loc, "Initialise a 2-D array with nested { { … }, { … } } lists");
        const cols = dims[1]!;
        const nested = init.items.some((x) => x.kind === "initlist" || x.kind === "str");
        if (nested) {
          init.items.forEach((row, i) => {
            if (row.kind === "str" && isCharElem) {
              const len = strItems(row, [i]);
              if (len > cols) this.error(row.loc, `Text "${row.value}" is too long for a row of ${cols} chars (needs ${len} including the terminating 0)`);
              return;
            }
            if (row.kind !== "initlist") this.error(row.loc, "Mixing { } rows and plain values is not supported — use { } for every row");
            if (row.items.length > cols) this.error(row.loc, `Too many values in row ${i}: ${row.items.length} > ${cols}`);
            row.items.forEach((x, j) => items.push({ path: [i, j], expr: x }));
          });
          n0 = init.items.length;
        } else {
          init.items.forEach((x, k) => items.push({ path: [Math.floor(k / cols), k % cols], expr: x }));
          n0 = Math.ceil(init.items.length / cols);
        }
        n1 = cols;
      }
    }
    const d0 = dims[0] ?? n0;
    if (!d0) this.error(dc.loc, `Array '${dc.name}' needs a size, e.g. ${dc.name}[5], or an initialiser list`);
    if (n0 > d0) this.error(init!.loc, `Too many initial values for '${dc.name}': ${n0} given but the array holds ${d0}`);
    const finalDims = dims.length === 1 ? [d0] : [d0, dims[1] ?? n1];
    // constant template?
    let constant = true;
    const values: unknown[] = [];
    for (const it of items) {
      if (base.k === "String" && it.expr.kind === "str") { values.push(it.expr.value); continue; }
      const c = this.isNum(base) ? this.constEval(it.expr) : null;
      if (!c) { constant = false; break; }
      values.push(wrap(c.v, this.kindOf(base)));
    }
    if (base.k === "Servo") constant = false;
    if (!constant) return { dims: finalDims, items, constant: false };
    const dv = this.defaultValue(base);
    const make = (): unknown[] => {
      if (finalDims.length === 1) return new Array(finalDims[0]).fill(dv);
      const out: unknown[] = [];
      for (let i = 0; i < finalDims[0]; i++) out.push(new Array(finalDims[1]).fill(dv));
      return out;
    };
    const template = make();
    items.forEach((it, i) => {
      if (it.path.length === 1) template[it.path[0]] = values[i];
      else (template[it.path[0]] as unknown[])[it.path[1]] = values[i];
    });
    return { dims: finalDims, items, constant: true, template };
  }

  // ---------- statements ----------
  stmt(s: Stmt): void {
    switch (s.kind) {
      case "vardecl": {
        const base = this.resolveType(s.type);
        for (const dc of s.decls) {
          this.at(dc.loc);
          this.varDecl(s, dc, base, false, s.type.isStatic);
        }
        return;
      }
      case "enum":
        this.enumDecl(s, false);
        return;
      case "expr": {
        this.at(s.loc);
        const e = s.expr;
        if (e.kind === "binary" && ["==", "!=", "<", ">", "<=", ">="].includes(e.op)) this.warn(s.loc, `This comparison does nothing on its own — did you mean '=' (assignment)?`);
        this.genExpr(e, false);
        return;
      }
      case "block":
        this.scopes.push(new Map());
        try {
          for (const x of s.body) this.stmtSafe(x);
        } finally {
          this.scopes.pop();
        }
        return;
      case "if": {
        this.at(s.loc);
        this.checkCondition(s.test);
        if (s.then.kind === "empty") this.warn(s.then.loc, "Empty statement after if(…) — the ';' ends the if, so the next line always runs. Remove the ';'.");
        this.genCond(s.test);
        const jf = this.emit(OP.JF, 0);
        this.scoped(s.then);
        if (s.else) {
          const jend = this.emit(OP.JMP, 0);
          this.patch(jf, this.here());
          this.scoped(s.else);
          this.patch(jend, this.here());
        } else this.patch(jf, this.here());
        return;
      }
      case "while": {
        this.at(s.loc);
        this.checkCondition(s.test);
        if (s.body.kind === "empty") this.warn(s.body.loc, "Empty statement after while(…) — the loop body is just ';'. Remove the ';' if that is not intended.");
        const top = this.here();
        const constTrue = this.constEval(s.test);
        let jf = -1;
        if (!(constTrue && constTrue.v)) {
          this.genCond(s.test);
          jf = this.emit(OP.JF, 0);
        }
        const ctx: LoopCtx = { breaks: [], continues: [] };
        this.loops.push(ctx);
        try { this.scoped(s.body); } finally { this.loops.pop(); }
        this.at(s.loc);
        this.emit(OP.JMP, top);
        const end = this.here();
        if (jf >= 0) this.patch(jf, end);
        ctx.breaks.forEach((b) => this.patch(b, end));
        ctx.continues!.forEach((c) => this.patch(c, top));
        return;
      }
      case "dowhile": {
        this.at(s.loc);
        this.checkCondition(s.test);
        const top = this.here();
        const ctx: LoopCtx = { breaks: [], continues: [] };
        this.loops.push(ctx);
        try { this.scoped(s.body); } finally { this.loops.pop(); }
        const cont = this.here();
        this.at(s.test.loc);
        this.genCond(s.test);
        this.emit(OP.JT, top);
        const end = this.here();
        ctx.breaks.forEach((b) => this.patch(b, end));
        ctx.continues!.forEach((c) => this.patch(c, cont));
        return;
      }
      case "for": {
        this.at(s.loc);
        this.scopes.push(new Map());
        try {
          if (s.init) this.stmt(s.init);
          if (s.body.kind === "empty") this.warn(s.body.loc, "Empty statement after for(…) — the loop body is just ';'. Remove the ';' if that is not intended.");
          const top = this.here();
          let jf = -1;
          if (s.test) {
            this.checkCondition(s.test);
            this.at(s.test.loc);
            this.genCond(s.test);
            jf = this.emit(OP.JF, 0);
          }
          const ctx: LoopCtx = { breaks: [], continues: [] };
          this.loops.push(ctx);
          try { this.scoped(s.body); } finally { this.loops.pop(); }
          const cont = this.here();
          if (s.update) {
            this.at(s.update.loc);
            this.genExpr(s.update, false);
          }
          this.emit(OP.JMP, top);
          const end = this.here();
          if (jf >= 0) this.patch(jf, end);
          ctx.breaks.forEach((b) => this.patch(b, end));
          ctx.continues!.forEach((c) => this.patch(c, cont));
        } finally {
          this.scopes.pop();
        }
        return;
      }
      case "switch": {
        this.at(s.loc);
        const dt = this.genExpr(s.disc, true);
        if (!this.isInt(dt)) this.error(s.disc.loc, `switch needs an integer or char value, not ${dt.name}`, "TYPE");
        const pt = this.promote(dt);
        this.emitConv(dt, pt, s.disc.loc);
        const tmp = this.fn.nLocals++;
        this.emit(OP.STORE_L, tmp, 0);
        const seen = new Map<number, number>();
        const jumps: { idx: number; caseIdx: number }[] = [];
        let defaultIdx = -1;
        s.cases.forEach((c, i) => {
          if (!c.test) {
            if (defaultIdx >= 0) this.error(c.loc, "A switch can only have one default label");
            defaultIdx = i;
            return;
          }
          const v = this.constEval(c.test);
          if (!v || v.float) this.error(c.test.loc, "case labels must be integer constants (numbers, chars, #defines, const ints or enum values)");
          const wv = wrap(v.v, this.kindOf(pt));
          if (seen.has(wv)) this.error(c.loc, `Duplicate case value ${wv} (also on line ${seen.get(wv)})`);
          seen.set(wv, c.loc.line);
          this.at(c.loc);
          this.emit(OP.LOAD_L, tmp);
          this.emit(OP.PUSH, wv);
          this.emit(OP.EQ);
          jumps.push({ idx: this.emit(OP.JT, 0), caseIdx: i });
        });
        const jdefault = this.emit(OP.JMP, 0);
        const ctx: LoopCtx = { breaks: [], continues: null };
        this.loops.push(ctx);
        const starts: number[] = [];
        this.scopes.push(new Map());
        try {
          s.cases.forEach((c) => {
            starts.push(this.here());
            for (const x of c.body) this.stmtSafe(x);
          });
        } finally {
          this.scopes.pop();
          this.loops.pop();
        }
        const end = this.here();
        jumps.forEach((j) => this.patch(j.idx, starts[j.caseIdx]));
        this.patch(jdefault, defaultIdx >= 0 ? starts[defaultIdx] : end);
        ctx.breaks.forEach((b) => this.patch(b, end));
        return;
      }
      case "break": {
        this.at(s.loc);
        const ctx = this.loops[this.loops.length - 1];
        if (!ctx) this.error(s.loc, "'break' can only be used inside a loop or switch");
        ctx.breaks.push(this.emit(OP.JMP, 0));
        return;
      }
      case "continue": {
        this.at(s.loc);
        for (let i = this.loops.length - 1; i >= 0; i--) {
          const c = this.loops[i].continues;
          if (c) { c.push(this.emit(OP.JMP, 0)); return; }
        }
        this.error(s.loc, "'continue' can only be used inside a loop");
        return;
      }
      case "return": {
        this.at(s.loc);
        const f = this.fn.sym;
        if (!f) this.error(s.loc, "return outside of a function");
        if (f.ret.k === "void") {
          if (s.value) this.error(s.value.loc, `${f.name}() is void, so it cannot return a value`, "TYPE");
          this.emit(OP.RET_VOID);
        } else {
          if (!s.value) this.error(s.loc, `${f.name}() must return a ${f.ret.name} value`, "TYPE");
          const t = this.genExpr(s.value, true);
          this.emitConv(t, f.ret, s.value.loc, "the return value");
          this.emit(OP.RET);
        }
        return;
      }
      case "empty":
        return;
    }
  }

  scoped(s: Stmt) {
    if (s.kind === "vardecl") {
      this.warn(s.loc, "A declaration as the only statement of an if/loop body has no effect outside it — use { }");
    }
    this.scopes.push(new Map());
    try { this.stmtSafe(s); } finally { this.scopes.pop(); }
  }

  checkCondition(e: Expr) {
    if (e.kind === "assign" && e.op === "=") {
      this.warn(e.loc, `Assignment '=' used as a condition — did you mean '==' (comparison)?`, "SUSPICIOUS");
    }
  }

  genCond(e: Expr) {
    const t = this.genExpr(e, true);
    if (!this.isNum(t)) {
      if (t.k === "String") this.error(e.loc, "A String cannot be used as a true/false condition — compare it, e.g. s.length() > 0", "TYPE");
      if (t.k === "void") this.error(e.loc, "This function returns nothing (void), so it cannot be used as a condition", "TYPE");
      this.error(e.loc, `A ${t.name} cannot be used as a true/false condition`, "TYPE");
    }
  }

  // ------------------------------------------------------------------------------------------------
  // Expressions
  // ------------------------------------------------------------------------------------------------

  /** Compiles `e`. If want is false the result is discarded (nothing left on the stack). */
  genExpr(e: Expr, want: boolean): CType {
    switch (e.kind) {
      case "assign": return this.genAssign(e, want);
      case "update": return this.genUpdate(e, want);
      case "call": {
        const t = this.genCall(e);
        if (!want) this.emit(OP.POP);
        return t;
      }
      case "comma": {
        e.list.forEach((x, i) => {
          if (i < e.list.length - 1) this.genExpr(x, false);
        });
        return this.genExpr(e.list[e.list.length - 1], want);
      }
    }
    const t = this.genValue(e);
    if (!want) this.emit(OP.POP);
    return t;
  }

  literalIntType(e: Extract<Expr, { kind: "num" }>): CType {
    const v = e.value;
    const T = this.T;
    const fits = (t: CType) => {
      const it = t as IntType;
      const max = it.signed ? Math.pow(2, it.bits - 1) - 1 : Math.pow(2, it.bits) - 1;
      return v <= max;
    };
    const sfx = e.suffix;
    const dec = e.radix === 10;
    let cands: CType[];
    if (sfx === "") cands = dec ? [T.int, T.long] : [T.int, T.uint, T.long, T.ulong];
    else if (sfx === "u") cands = [T.uint, T.ulong];
    else if (sfx === "l") cands = dec ? [T.long] : [T.long, T.ulong];
    else if (sfx === "ul" || sfx === "lu") cands = [T.ulong];
    else this.error(e.loc, "64-bit integer literals (LL) are not supported", "UNSUPPORTED_FEATURE");
    for (const c of cands) if (fits(c)) return c;
    if (fits(T.ulong) && dec && sfx === "") {
      this.warn(e.loc, `The number ${e.text} is too large for long; treating it as unsigned long (write ${e.text}UL)`);
      return T.ulong;
    }
    return this.error(e.loc, `The number ${e.text} is too large (maximum is 4294967295)`, "OVERFLOW");
  }

  genValue(e: Expr): CType {
    switch (e.kind) {
      case "num": {
        if (e.isFloat) {
          const t = e.floatSuffix ? this.T.float : this.T.double;
          this.emit(OP.PUSH, wrap(e.value, this.kindOf(t)));
          return t;
        }
        const t = this.literalIntType(e);
        this.emit(OP.PUSH, e.value);
        return t;
      }
      case "char":
        this.emit(OP.PUSH, wrap(e.value, K.I8));
        return this.T.char;
      case "bool":
        this.emit(OP.PUSH, e.value ? 1 : 0);
        return this.T.bool;
      case "str":
        this.emit(OP.PUSH, e.value);
        return this.T.cstr;
      case "ident": return this.genIdent(e);
      case "unary": return this.genUnary(e);
      case "binary": return this.genBinary(e);
      case "cond": {
        this.genCond(e.test);
        const jf = this.emit(OP.JF, 0);
        const t1 = this.genExpr(e.then, true);
        const ph1 = this.emit(OP.NOP);
        const jend = this.emit(OP.JMP, 0);
        this.patch(jf, this.here());
        const t2 = this.genExpr(e.else, true);
        let rt: CType;
        if (this.isNum(t1) && this.isNum(t2)) {
          rt = t1.k === "bool" && t2.k === "bool" ? this.T.bool : this.common(t1, t2);
        } else if ((t1.k === "String" || t1.k === "cstr") && (t2.k === "String" || t2.k === "cstr")) {
          rt = t1.k === "String" || t2.k === "String" ? this.T.String : this.T.cstr;
        } else if (t1.k === "String" || t2.k === "String") {
          rt = this.T.String;
        } else {
          return this.error(e.loc, `Both sides of ?: must have compatible types (got ${t1.name} and ${t2.name})`, "TYPE");
        }
        this.setPlaceholder(ph1, this.convInstr(t1, rt, e.then.loc));
        this.emitConv(t2, rt, e.else.loc);
        this.patch(jend, this.here());
        return rt;
      }
      case "index": return this.genIndex(e);
      case "member": {
        if (e.obj.kind === "ident" && SERIAL_NAMES.has(e.obj.name)) this.error(e.loc, `Serial.${e.name} must be called like a function: Serial.${e.name}(…)`);
        return this.error(e.loc, `Member access '.${e.name}' is only supported for method calls on Serial, Servo and String objects`, "UNSUPPORTED_FEATURE");
      }
      case "cast": {
        const to = this.resolveType(e.type);
        const from = this.genExpr(e.arg, true);
        if (to.k === "String") { this.emitConv(from, to, e.loc); return to; }
        if (!this.isNum(to)) this.error(e.loc, `Casting to ${to.name} is not supported`, "UNSUPPORTED_FEATURE");
        if (!this.isNum(from)) {
          if (from.k === "String") this.error(e.loc, "Cannot cast a String to a number — use .toInt() or .toFloat()", "TYPE");
          this.error(e.loc, `Cannot cast ${from.name} to ${to.name}`, "TYPE");
        }
        const fk = this.kindOf(from), tk = this.kindOf(to);
        if (fk !== tk && tk !== K.F64) this.emit(OP.CONV, tk);
        return to;
      }
      case "sizeof": {
        let n: number;
        if (e.type) n = this.sizeOf(this.resolveType(e.type), e.loc);
        else {
          const arg = e.arg!;
          const t = this.typeOf(arg);
          if (arg.kind === "ident" && t.k === "array" && t.size === null) {
            this.warn(e.loc, `sizeof(${arg.name}) on an array parameter gives the size of a pointer (${this.avr ? 2 : 4} bytes), not the array — pass the length as another parameter`, "SUSPICIOUS");
          }
          n = this.sizeOf(t, e.loc);
        }
        this.emit(OP.PUSH, n);
        return this.T.uint;
      }
      case "initlist":
        return this.error(e.loc, "A { … } list can only be used to initialise an array in its declaration");
      case "assign":
      case "update":
      case "call":
      case "comma":
        return this.genExpr(e, true);
    }
  }

  setPlaceholder(idx: number, ins: { op: number; a: unknown; b?: unknown; c?: unknown } | null) {
    if (!ins) return;
    const x = this.code[idx];
    x.op = ins.op;
    x.a = ins.a;
    x.b = ins.b ?? 0;
    x.c = ins.c ?? 0;
  }

  genIdent(e: Extract<Expr, { kind: "ident" }>): CType {
    const s = this.lookup(e.name);
    if (s) {
      if (s.kind === "const") { this.emit(OP.PUSH, s.value); return s.type; }
      if (s.isConst && s.constValue !== undefined) { this.emit(OP.PUSH, s.constValue); return s.type; }
      this.emit(s.storage === "global" ? OP.LOAD_G : OP.LOAD_L, s.slot);
      return s.type;
    }
    const b = this.builtinConstant(e.name);
    if (b) { this.emit(OP.PUSH, b.v); return b.t; }
    if (SERIAL_NAMES.has(e.name)) {
      // `if (Serial)` / `while (!Serial)` — the simulated port is always ready
      this.emit(OP.PUSH, 1);
      return this.T.bool;
    }
    if (this.funcs.has(e.name)) this.error(e.loc, `'${e.name}' is a function — call it with ${e.name}(…)`, "TYPE");
    if (/^A\d+$/.test(e.name)) this.error(e.loc, `${e.name} does not exist on ${this.board.name}`, "UNDECLARED");
    if (e.name === "Wire") this.error(e.loc, this.includes.includes("Wire.h") ? "Wire (I2C) can be included but is not simulated by the BEAST interpreter" : "'Wire' needs #include <Wire.h> (and I2C is not simulated by the BEAST interpreter)", "UNSUPPORTED_FEATURE");
    return this.error(e.loc, `'${e.name}' was not declared${this.suggest(e.name)}`, "UNDECLARED");
  }

  genUnary(e: Extract<Expr, { kind: "unary" }>): CType {
    const t = this.genExpr(e.arg, true);
    if (!this.isNum(t)) this.error(e.loc, `Operator '${e.op}' cannot be applied to ${t.name}`, "TYPE");
    switch (e.op) {
      case "!":
        this.emit(OP.NOT);
        return this.T.bool;
      case "+": {
        const pt = this.promote(t);
        this.emitConv(t, pt, e.loc);
        return pt;
      }
      case "-": {
        const pt = this.promote(t);
        this.emitConv(t, pt, e.loc);
        this.emit(OP.NEG, this.kindOf(pt));
        return pt;
      }
      case "~": {
        if (t.k === "float") this.error(e.loc, "Operator '~' needs an integer, not a float", "TYPE");
        const pt = this.promote(t);
        this.emitConv(t, pt, e.loc);
        this.emit(OP.BNOT, this.kindOf(pt));
        return pt;
      }
    }
    return this.error(e.loc, `Unknown operator ${e.op}`);
  }

  isStrLike(t: CType): boolean {
    return t.k === "String" || t.k === "cstr";
  }

  genBinary(e: Extract<Expr, { kind: "binary" }>): CType {
    const op = e.op;
    if (op === "&&" || op === "||") {
      this.genCond(e.left);
      const j = this.emit(op === "&&" ? OP.JF : OP.JT, 0);
      this.genCond(e.right);
      this.emit(OP.CONV, K.BOOL);
      const jend = this.emit(OP.JMP, 0);
      this.patch(j, this.here());
      this.emit(OP.PUSH, op === "&&" ? 0 : 1);
      this.patch(jend, this.here());
      return this.T.bool;
    }
    const lt = this.genExpr(e.left, true);
    const ph = this.emit(OP.NOP);
    const rt = this.genExpr(e.right, true);
    // ---- strings
    if (this.isStrLike(lt) || this.isStrLike(rt) || (lt.k === "array" && this.fmtOf(lt) === F.CHARARR) || (rt.k === "array" && this.fmtOf(rt) === F.CHARARR)) {
      const anyString = lt.k === "String" || rt.k === "String";
      if (op === "+") {
        if (!anyString) {
          if (lt.k === "cstr" && rt.k === "cstr") this.error(e.loc, `Cannot add two "text" literals with + — write them as one literal or use String("…") + "…"`, "TYPE");
          this.error(e.loc, `Adding a number to "text" does pointer arithmetic in C++, not joining — use String("text") + value`, "TYPE");
        }
        if (lt.k === "array" && this.fmtOf(lt) !== F.CHARARR) this.error(e.left.loc, "Cannot add an array to a String", "TYPE");
        if (rt.k === "array" && this.fmtOf(rt) !== F.CHARARR) this.error(e.right.loc, "Cannot add an array to a String", "TYPE");
        this.setPlaceholder(ph, this.convInstr(lt, this.T.String, e.left.loc));
        this.emitConv(rt, this.T.String, e.right.loc);
        this.emit(OP.STRCAT);
        return this.T.String;
      }
      if (["==", "!=", "<", ">", "<=", ">="].includes(op)) {
        if (!anyString) {
          if (this.isStrLike(lt) && this.isStrLike(rt)) this.error(e.loc, `Comparing two C strings with ${op} compares memory addresses, not text — use String or strcmp()`, "TYPE");
          this.error(e.loc, `Cannot compare ${lt.name} with ${rt.name}`, "TYPE");
        }
        if (!(this.isStrLike(lt) || this.fmtOf(lt) === F.CHARARR) || !(this.isStrLike(rt) || this.fmtOf(rt) === F.CHARARR)) {
          this.error(e.loc, `Cannot compare a String with ${this.isStrLike(lt) ? rt.name : lt.name} — compare with "text" or convert with String(…)`, "TYPE");
        }
        this.setPlaceholder(ph, this.convInstr(lt, this.T.String, e.left.loc));
        this.emitConv(rt, this.T.String, e.right.loc);
        this.emit(CMP_OPS[op]);
        return this.T.bool;
      }
      return this.error(e.loc, `Operator '${op}' cannot be used with text`, "TYPE");
    }
    if (!this.isNum(lt) || !this.isNum(rt)) {
      const bad = !this.isNum(lt) ? lt : rt;
      if (bad.k === "array") this.error(e.loc, `Operator '${op}' cannot be applied to a whole array — use an element like arr[i]`, "TYPE");
      if (bad.k === "void") this.error(e.loc, `A void function call has no value to use with '${op}'`, "TYPE");
      this.error(e.loc, `Operator '${op}' cannot be applied to ${bad.name}`, "TYPE");
    }
    if (op === "<<" || op === ">>") {
      if (lt.k === "float" || rt.k === "float") this.error(e.loc, `Shift '${op}' needs integers, not floats`, "TYPE");
      const pt = this.promote(lt);
      this.setPlaceholder(ph, this.convInstr(lt, pt, e.left.loc));
      this.emitConv(rt, this.promote(rt), e.right.loc);
      this.emit(op === "<<" ? OP.SHL : OP.SHR, this.kindOf(pt));
      this.overflowCheck(e, pt);
      return pt;
    }
    const ct = this.common(lt, rt);
    this.setPlaceholder(ph, this.convInstr(lt, ct, e.left.loc));
    this.emitConv(rt, ct, e.right.loc);
    if (CMP_OPS[op] !== undefined) {
      this.emit(CMP_OPS[op]);
      return this.T.bool;
    }
    const k = this.kindOf(ct);
    switch (op) {
      case "+": this.emit(OP.ADD, k); break;
      case "-": this.emit(OP.SUB, k); break;
      case "*": this.emit(OP.MUL, k); break;
      case "/": {
        const rc = this.constEval(e.right);
        if (rc && rc.v === 0 && ct.k === "int") this.error(e.right.loc, "Division by zero", "DIVISION_BY_ZERO");
        this.emit(OP.DIV, k);
        break;
      }
      case "%":
        if (ct.k === "float") this.error(e.loc, "'%' needs integers — use fmod(a, b) for floats", "TYPE");
        this.emit(OP.MOD, k);
        break;
      case "&": case "|": case "^":
        if (ct.k === "float") this.error(e.loc, `Bitwise '${op}' needs integers, not floats`, "TYPE");
        this.emit(op === "&" ? OP.BAND : op === "|" ? OP.BOR : OP.BXOR, k);
        break;
      default:
        this.error(e.loc, `Unknown operator ${op}`);
    }
    this.overflowCheck(e, ct);
    return ct;
  }

  overflowCheck(e: Expr, t: CType) {
    if (t.k !== "int") return;
    const c = this.constEval(e);
    if (!c || c.float) return;
    if (e.kind === "binary" && (e.op === "/" || e.op === "%")) return;
    const w = wrap(c.v, this.kindOf(t));
    if (w !== c.v) {
      this.warn(e.loc, `Integer overflow: ${this.text(e.loc)} = ${c.v} does not fit in ${t.name} (${t.bits}-bit) on ${this.board.name} and becomes ${w}.${t.bits < 32 ? " Use long or a UL suffix (e.g. 1000UL)." : " The result needs more than 32 bits."}`, "OVERFLOW");
    }
  }

  // ---------- lvalues ----------
  lvalue(e: Expr, what: string): { kind: "var"; sym: VarSym } | { kind: "elem"; type: CType; name: string; obj: Expr; index: Expr } {
    if (e.kind === "ident") {
      const s = this.lookup(e.name);
      if (!s) {
        if (this.builtinConstant(e.name) || SERIAL_NAMES.has(e.name)) this.error(e.loc, `'${e.name}' is a built-in constant and cannot be changed`, "TYPE");
        this.error(e.loc, `'${e.name}' was not declared${this.suggest(e.name)}`, "UNDECLARED");
      }
      if (s.kind === "const") this.error(e.loc, `'${e.name}' is a constant and cannot be ${what}`, "CONST");
      if (s.isConst) this.error(e.loc, `'${e.name}' is const and cannot be ${what}`, "CONST");
      if (s.type.k === "array") this.error(e.loc, `Cannot assign to a whole array '${e.name}' — assign elements one by one`, "TYPE");
      s.mutated = true;
      return { kind: "var", sym: s };
    }
    if (e.kind === "index") {
      const name = this.rootName(e);
      const root = this.rootSym(e);
      if (root && root.kind === "var" && root.isConst) this.error(e.loc, `'${root.name}' is const and its elements cannot be ${what}`, "CONST");
      const objT = this.typeOf(e.obj);
      if (objT.k === "String") this.error(e.loc, "Changing a String character with s[i] = … is not supported — use s.setCharAt(i, c)", "UNSUPPORTED_FEATURE");
      if (objT.k !== "array") this.error(e.loc, `'${this.text(e.obj.loc)}' is not an array`, "TYPE");
      if (objT.elem.k === "array") this.error(e.loc, "Cannot assign to a whole row of a 2-D array", "TYPE");
      return { kind: "elem", type: objT.elem, name, obj: e.obj, index: e.index };
    }
    if (e.kind === "call" || e.kind === "num" || e.kind === "binary") this.error(e.loc, `This expression cannot be ${what} (it is not a variable)`, "TYPE");
    return this.error(e.loc, `This expression cannot be ${what}`, "TYPE");
  }
  rootName(e: Expr): string {
    while (e.kind === "index") e = e.obj;
    return e.kind === "ident" ? e.name : "array";
  }
  rootSym(e: Expr): Sym | undefined {
    while (e.kind === "index") e = e.obj;
    return e.kind === "ident" ? this.lookup(e.name) : undefined;
  }

  genElemAddr(obj: Expr, index: Expr) {
    const ot = this.genExpr(obj, true);
    if (ot.k !== "array") this.error(obj.loc, "Not an array", "TYPE");
    this.genIndexValue(index);
  }
  genIndexValue(index: Expr) {
    const it = this.genExpr(index, true);
    if (!this.isInt(it)) {
      if (it.k === "float") this.error(index.loc, "Array index must be an integer, not a float — use (int)", "TYPE");
      this.error(index.loc, `Array index must be an integer, not ${it.name}`, "TYPE");
    }
  }

  genAssign(e: Extract<Expr, { kind: "assign" }>, want: boolean): CType {
    const lv = this.lvalue(e.target, "assigned");
    const keep = want ? 1 : 0;
    const op = e.op;
    const binop = op === "=" ? null : op.slice(0, -1);
    const ttype = lv.kind === "var" ? lv.sym.type : lv.type;
    if (ttype.k === "Servo" || ttype.k === "SoftwareSerial") this.error(e.loc, `Cannot assign to a ${ttype.name} object`, "TYPE");
    if (lv.kind === "var") {
      const sym = lv.sym;
      if (!binop) {
        const vt = this.genExpr(e.value, true);
        this.emitConv(vt, sym.type, e.value.loc, `'${sym.name}'`);
      } else {
        this.emit(sym.storage === "global" ? OP.LOAD_G : OP.LOAD_L, sym.slot);
        this.compoundOp(binop, sym.type, e);
      }
      this.storeVar(sym, keep);
      return sym.type;
    }
    this.genElemAddr(lv.obj, lv.index);
    if (!binop) {
      const vt = this.genExpr(e.value, true);
      this.emitConv(vt, lv.type, e.value.loc, `an element of '${lv.name}'`);
    } else {
      this.emit(OP.DUP2);
      this.emit(OP.LOAD_ELEM, lv.name);
      this.compoundOp(binop, lv.type, e);
    }
    this.emit(OP.STORE_ELEM, lv.name, keep);
    return lv.type;
  }

  /** stack: current value of type `t`; compiles `value` and applies binop, converts back to t */
  compoundOp(binop: string, t: CType, e: Extract<Expr, { kind: "assign" }>) {
    if (t.k === "String") {
      if (binop !== "+") this.error(e.loc, `Operator '${binop}=' cannot be used with a String`, "TYPE");
      const vt = this.genExpr(e.value, true);
      this.emitConv(vt, this.T.String, e.value.loc);
      this.emit(OP.STRCAT);
      return;
    }
    if (!this.isNum(t)) this.error(e.loc, `Operator '${binop}=' cannot be applied to ${t.name}`, "TYPE");
    const ph = this.emit(OP.NOP);
    const vt = this.genExpr(e.value, true);
    if (!this.isNum(vt)) this.error(e.value.loc, `Cannot use ${vt.name} with '${binop}='`, "TYPE");
    let ct: CType;
    if (binop === "<<" || binop === ">>") {
      if (t.k === "float" || vt.k === "float") this.error(e.loc, "Shifts need integers", "TYPE");
      ct = this.promote(t);
      this.setPlaceholder(ph, this.convInstr(t, ct, e.loc));
      this.emitConv(vt, this.promote(vt), e.value.loc);
      this.emit(binop === "<<" ? OP.SHL : OP.SHR, this.kindOf(ct));
    } else {
      ct = this.common(t, vt);
      this.setPlaceholder(ph, this.convInstr(t, ct, e.loc));
      this.emitConv(vt, ct, e.value.loc);
      const k = this.kindOf(ct);
      switch (binop) {
        case "+": this.emit(OP.ADD, k); break;
        case "-": this.emit(OP.SUB, k); break;
        case "*": this.emit(OP.MUL, k); break;
        case "/": this.emit(OP.DIV, k); break;
        case "%":
          if (ct.k === "float") this.error(e.loc, "'%=' needs integers", "TYPE");
          this.emit(OP.MOD, k);
          break;
        case "&": case "|": case "^":
          if (ct.k === "float") this.error(e.loc, `'${binop}=' needs integers`, "TYPE");
          this.emit(binop === "&" ? OP.BAND : binop === "|" ? OP.BOR : OP.BXOR, k);
          break;
        default: this.error(e.loc, `Unknown operator ${binop}=`);
      }
    }
    this.emitConv(ct, t, e.loc);
  }

  genUpdate(e: Extract<Expr, { kind: "update" }>, want: boolean): CType {
    const lv = this.lvalue(e.arg, e.op === "++" ? "incremented" : "decremented");
    const t = lv.kind === "var" ? lv.sym.type : lv.type;
    if (!this.isNum(t)) this.error(e.loc, `Cannot use ${e.op} on ${t.name}`, "TYPE");
    const delta = e.op === "++" ? 1 : -1;
    const mode = !want ? 0 : e.prefix ? 1 : 2;
    const k = this.kindOf(t);
    if (lv.kind === "var") {
      this.emit(lv.sym.storage === "global" ? OP.INC_G : OP.INC_L, lv.sym.slot, delta, k, mode);
    } else {
      this.genElemAddr(lv.obj, lv.index);
      this.emit(OP.INC_ELEM, lv.name, delta, k, mode);
    }
    return t;
  }

  genIndex(e: Extract<Expr, { kind: "index" }>): CType {
    const ot = this.genExpr(e.obj, true);
    if (ot.k === "String") {
      this.genIndexValue(e.index);
      this.emit(OP.STRIDX);
      return this.T.char;
    }
    if (ot.k === "cstr") {
      this.genIndexValue(e.index);
      this.emit(OP.STRIDX);
      return this.T.char;
    }
    if (ot.k !== "array") this.error(e.loc, `'${this.text(e.obj.loc)}' is not an array, so it cannot be indexed with [ ]`, "TYPE");
    this.genIndexValue(e.index);
    this.at(e.loc);
    this.emit(OP.LOAD_ELEM, this.rootName(e));
    return ot.elem;
  }

  // ------------------------------------------------------------------------------------------------
  // Calls
  // ------------------------------------------------------------------------------------------------

  genArgs(e: Extract<Expr, { kind: "call" }>, types: CType[], fname: string) {
    if (e.args.length !== types.length) {
      this.error(e.loc, `${fname}() takes ${types.length} argument${types.length === 1 ? "" : "s"} but ${e.args.length} ${e.args.length === 1 ? "was" : "were"} given`, "ARGUMENTS");
    }
    e.args.forEach((a, i) => {
      const t = this.genExpr(a, true);
      this.emitConv(t, types[i], a.loc, `argument ${i + 1} of ${fname}()`);
    });
  }
  argCount(e: Extract<Expr, { kind: "call" }>, min: number, max: number, fname: string) {
    const n = e.args.length;
    if (n < min || n > max) {
      const exp = min === max ? `${min}` : `${min} to ${max}`;
      this.error(e.loc, `${fname}() takes ${exp} argument${max === 1 ? "" : "s"} but ${n} ${n === 1 ? "was" : "were"} given`, "ARGUMENTS");
    }
  }
  builtin(id: number, argc: number, c: unknown = 0) {
    this.emit(OP.BUILTIN, id, argc, c);
  }
  recordPin(call: PinUsage["call"], arg: Expr, loc: Loc, modeArg?: Expr, viaInterruptNumber = false) {
    if (this.suppressPins) return;
    let sym: VarSym | ConstSym | undefined;
    if (arg.kind === "ident") sym = this.lookup(arg.name);
    this.pinRecords.push({ call, arg, sym, modeArg, viaInterruptNumber, loc, scopes: this.scopes.map((s) => new Map(s)) });
  }

  genCall(e: Extract<Expr, { kind: "call" }>): CType {
    this.at(e.loc);
    const callee = e.callee;
    if (callee.kind === "member") return this.genMethodCall(e, callee);
    if (callee.kind !== "ident") return this.error(e.loc, "Only named functions can be called", "UNSUPPORTED_FEATURE");
    const name = callee.name;
    const local = this.lookup(name);
    if (local && local.kind === "var") this.error(callee.loc, `'${name}' is a variable, not a function`, "TYPE");
    const user = this.funcs.get(name);
    if (user) {
      this.genArgs(e, user.params.map((p) => p.type), name);
      this.at(e.loc);
      this.emit(OP.CALL, user.index);
      return user.ret;
    }
    const T = this.T;
    const n = e.args.length;
    switch (name) {
      case "pinMode": {
        this.recordPin("pinMode", e.args[0] ?? callee, e.loc, e.args[1]);
        this.genArgs(e, [T.int, T.int], name);
        const m = e.args[1] && this.constEval(e.args[1]);
        if (m && ![0, 1, 2].includes(m.v)) this.warn(e.args[1].loc, "pinMode() mode should be INPUT, OUTPUT or INPUT_PULLUP");
        this.builtin(B.PIN_MODE, 2);
        return T.void;
      }
      case "digitalWrite":
        this.recordPin("digitalWrite", e.args[0] ?? callee, e.loc);
        this.genArgs(e, [T.int, T.int], name);
        this.builtin(B.DIGITAL_WRITE, 2);
        return T.void;
      case "digitalRead":
        this.recordPin("digitalRead", e.args[0] ?? callee, e.loc);
        this.genArgs(e, [T.int], name);
        this.builtin(B.DIGITAL_READ, 1);
        return T.int;
      case "analogWrite":
        this.recordPin("analogWrite", e.args[0] ?? callee, e.loc);
        this.genArgs(e, [T.int, T.int], name);
        this.builtin(B.ANALOG_WRITE, 2);
        return T.void;
      case "analogRead":
        this.recordPin("analogRead", e.args[0] ?? callee, e.loc);
        this.genArgs(e, [T.int], name);
        this.builtin(B.ANALOG_READ, 1);
        return T.int;
      case "analogReadResolution":
        this.genArgs(e, [T.int], name);
        this.builtin(B.ANALOG_READ_RES, 1);
        return T.void;
      case "analogWriteResolution":
        this.genArgs(e, [T.int], name);
        this.builtin(B.ANALOG_WRITE_RES, 1);
        return T.void;
      case "analogReference":
        this.genArgs(e, [T.int], name);
        this.builtin(B.ANALOG_REFERENCE, 1);
        return T.void;
      case "delay":
        this.genArgs(e, [T.ulong], name);
        this.builtin(B.DELAY, 1);
        return T.void;
      case "delayMicroseconds":
        this.genArgs(e, [T.uint], name);
        this.builtin(B.DELAY_US, 1);
        return T.void;
      case "millis":
        this.genArgs(e, [], name);
        this.builtin(B.MILLIS, 0);
        return T.ulong;
      case "micros":
        this.genArgs(e, [], name);
        this.builtin(B.MICROS, 0);
        return T.ulong;
      case "pulseIn":
      case "pulseInLong": {
        this.argCount(e, 2, 3, name);
        this.recordPin("pulseIn", e.args[0], e.loc);
        this.genArgs(e, [T.int, T.int, T.ulong].slice(0, n), name);
        if (n === 2) this.emit(OP.PUSH, 1000000);
        this.builtin(B.PULSE_IN, 3);
        return T.ulong;
      }
      case "map":
        this.genArgs(e, [T.long, T.long, T.long, T.long, T.long], name);
        this.builtin(B.MAP, 5);
        return T.long;
      case "constrain":
      case "min":
      case "max": {
        const want = name === "constrain" ? 3 : 2;
        this.argCount(e, want, want, name);
        const types = e.args.map((a) => this.typeOf(a));
        types.forEach((t, i) => { if (!this.isNum(t)) this.error(e.args[i].loc, `${name}() needs numbers, not ${t.name}`, "TYPE"); });
        let ct = types[0];
        for (const t of types.slice(1)) ct = this.common(ct, t);
        ct = this.promote(ct);
        this.genArgs(e, types.map(() => ct), name);
        this.builtin(name === "constrain" ? B.CONSTRAIN : name === "min" ? B.MIN : B.MAX, want);
        return ct;
      }
      case "abs":
      case "sq": {
        this.argCount(e, 1, 1, name);
        const t = this.typeOf(e.args[0]);
        if (!this.isNum(t)) this.error(e.args[0].loc, `${name}() needs a number`, "TYPE");
        const pt = this.promote(t);
        this.genArgs(e, [pt], name);
        this.builtin(name === "abs" ? B.ABS : B.SQ, 1, this.kindOf(pt));
        return pt;
      }
      case "round":
        this.genArgs(e, [T.double], name);
        if (this.avr) {
          this.builtin(B.ROUND_LONG, 1);
          return T.long;
        }
        this.builtin(B.MATH1, 1, "round");
        return T.double;
      case "random":
        this.argCount(e, 1, 2, name);
        this.genArgs(e, n === 1 ? [T.long] : [T.long, T.long], name);
        this.builtin(n === 1 ? B.RANDOM1 : B.RANDOM2, n);
        return T.long;
      case "randomSeed":
        this.genArgs(e, [T.ulong], name);
        this.builtin(B.RANDOM_SEED, 1);
        return T.void;
      case "bitRead": {
        this.argCount(e, 2, 2, name);
        const vt = this.genExpr(e.args[0], true);
        if (!this.isInt(vt)) this.error(e.args[0].loc, "bitRead() needs an integer", "TYPE");
        const pt = this.promote(vt);
        this.emitConv(vt, pt, e.loc);
        this.emitConv(this.genExpr(e.args[1], true), T.int, e.args[1].loc);
        this.emit(OP.SHR, this.kindOf(pt));
        this.emit(OP.PUSH, 1);
        this.emit(OP.BAND, this.kindOf(pt));
        return pt;
      }
      case "bitSet":
      case "bitClear":
      case "bitWrite": {
        this.argCount(e, name === "bitWrite" ? 3 : 2, name === "bitWrite" ? 3 : 2, name);
        const L = e.loc;
        const one: Expr = { kind: "num", value: 1, isFloat: false, suffix: "ul", radix: 10, text: "1UL", loc: L };
        const mask: Expr = { kind: "binary", op: "<<", left: one, right: e.args[1], loc: L };
        const setE: Expr = { kind: "assign", op: "|=", target: e.args[0], value: mask, loc: L };
        const clrE: Expr = { kind: "assign", op: "&=", target: e.args[0], value: { kind: "unary", op: "~", arg: mask, loc: L }, loc: L };
        if (name === "bitSet") return this.genExpr(setE, true);
        if (name === "bitClear") return this.genExpr(clrE, true);
        return this.genExpr({ kind: "cond", test: e.args[2], then: setE, else: clrE, loc: L }, true);
      }
      case "bit": {
        this.argCount(e, 1, 1, name);
        this.emit(OP.PUSH, 1);
        this.emitConv(this.genExpr(e.args[0], true), T.int, e.args[0].loc);
        this.emit(OP.SHL, K.U32);
        return T.ulong;
      }
      case "highByte":
      case "lowByte": {
        this.argCount(e, 1, 1, name);
        const vt = this.genExpr(e.args[0], true);
        if (!this.isInt(vt)) this.error(e.args[0].loc, `${name}() needs an integer`, "TYPE");
        this.emitConv(vt, T.ulong, e.loc);
        if (name === "highByte") {
          this.emit(OP.PUSH, 8);
          this.emit(OP.SHR, K.U32);
        }
        this.emit(OP.CONV, K.U8);
        return T.uchar;
      }
      case "attachInterrupt": {
        this.argCount(e, 3, 3, name);
        const a0 = e.args[0];
        let viaNumber = true;
        let pinArg: Expr = a0;
        if (a0.kind === "call" && a0.callee.kind === "ident" && a0.callee.name === "digitalPinToInterrupt" && a0.args.length === 1) {
          pinArg = a0.args[0];
          viaNumber = false;
        }
        this.recordPin("attachInterrupt", pinArg, e.loc, undefined, viaNumber);
        this.emitConv(this.genExpr(a0, true), T.int, a0.loc);
        const isr = e.args[1];
        if (isr.kind !== "ident") this.error(isr.loc, "The second argument of attachInterrupt() must be the name of a function, e.g. attachInterrupt(digitalPinToInterrupt(2), onPulse, RISING)", "TYPE");
        const f = this.funcs.get(isr.name);
        if (!f) this.error(isr.loc, `'${isr.name}' is not a function defined in this sketch${this.suggest(isr.name)}`, "UNDECLARED");
        if (f.params.length || f.ret.k !== "void") this.error(isr.loc, `Interrupt handler ${isr.name}() must be 'void ${isr.name}()' with no parameters`, "TYPE");
        this.emit(OP.PUSH, f.index);
        this.emitConv(this.genExpr(e.args[2], true), T.int, e.args[2].loc);
        const m = this.constEval(e.args[2]);
        if (m && ![0, 1, 2, 3, 4].includes(m.v)) this.warn(e.args[2].loc, "Interrupt mode should be RISING, FALLING, CHANGE or LOW");
        if (viaNumber && !this.avr) {
          // on non-AVR cores the first argument is the pin itself; fine
        }
        this.builtin(B.ATTACH_INT, 3);
        return T.void;
      }
      case "detachInterrupt":
        this.genArgs(e, [T.int], name);
        this.builtin(B.DETACH_INT, 1);
        return T.void;
      case "digitalPinToInterrupt":
        this.genArgs(e, [T.int], name);
        this.builtin(B.PIN_TO_INT, 1);
        return T.int;
      case "noInterrupts":
      case "cli":
        this.genArgs(e, [], name);
        this.builtin(B.NO_INTERRUPTS, 0);
        return T.void;
      case "interrupts":
      case "sei":
        this.genArgs(e, [], name);
        this.builtin(B.INTERRUPTS, 0);
        return T.void;
      case "tone":
        this.argCount(e, 2, 3, name);
        this.recordPin("tone", e.args[0], e.loc);
        this.genArgs(e, [T.int, T.uint, T.ulong].slice(0, n), name);
        if (n === 2) this.emit(OP.PUSH, 0);
        this.builtin(B.TONE, 3);
        return T.void;
      case "noTone":
        this.genArgs(e, [T.int], name);
        this.builtin(B.NO_TONE, 1);
        return T.void;
      case "yield":
        this.genArgs(e, [], name);
        this.builtin(B.YIELD, 0);
        return T.void;
      case "exit":
        this.genArgs(e, [T.int], name);
        this.builtin(B.EXIT, 1);
        return T.void;
      case "F": {
        this.argCount(e, 1, 1, name);
        if (e.args[0].kind !== "str") this.error(e.args[0].loc, 'F() takes a "text" literal', "TYPE");
        this.genExpr(e.args[0], true);
        return T.cstr;
      }
      case "String": {
        this.argCount(e, 0, 2, name);
        if (n === 0) { this.emit(OP.PUSH, ""); return T.String; }
        const t = this.genExpr(e.args[0], true);
        if (n === 2) {
          if (t.k !== "int" && t.k !== "float" && t.k !== "bool") this.error(e.args[1].loc, "String(value, base/decimals) needs a number as the first argument", "TYPE");
          this.emitConv(this.genExpr(e.args[1], true), T.int, e.args[1].loc);
          this.emit(OP.TOSTR, this.fmtOf(t) === F.CHAR ? F.INT : this.fmtOf(t), 1, 1);
          return T.String;
        }
        if (t.k === "String") return T.String;
        if (this.isStrLike(t) || this.fmtOf(t) === F.CHARARR || this.isNum(t)) {
          if (t.k !== "cstr") this.emit(OP.TOSTR, this.fmtOf(t), 0, 1);
          return T.String;
        }
        return this.error(e.loc, `Cannot convert ${t.name} to String`, "TYPE");
      }
      case "strlen": {
        this.argCount(e, 1, 1, name);
        const t = this.genExpr(e.args[0], true);
        if (t.k === "cstr") { this.builtin(B.STRLEN, 1, 0); return T.uint; }
        if (this.fmtOf(t) === F.CHARARR) { this.builtin(B.STRLEN, 1, 1); return T.uint; }
        return this.error(e.loc, "strlen() needs text (a char array or \"literal\")", "TYPE");
      }
      case "shiftOut":
      case "shiftIn":
      case "pulseOut":
        return this.error(e.loc, `${name}() is not supported by the BEAST interpreter`, "UNSUPPORTED_FEATURE");
      case "malloc":
      case "free":
      case "calloc":
      case "realloc":
        return this.error(e.loc, `Dynamic memory (${name}) is not supported`, "UNSUPPORTED_FEATURE");
      case "sprintf":
      case "snprintf":
      case "printf":
      case "dtostrf":
      case "strcpy":
      case "strcat":
      case "strcmp":
      case "itoa":
      case "atoi":
        return this.error(e.loc, `${name}() is not supported — use the String class (String(value), +, .toInt()) instead`, "UNSUPPORTED_FEATURE");
    }
    if (MATH1.has(name)) {
      this.genArgs(e, [T.double], name);
      this.builtin(B.MATH1, 1, name);
      return T.double;
    }
    if (MATH2.has(name)) {
      this.genArgs(e, [T.double, T.double], name);
      this.builtin(B.MATH2, 2, name);
      return T.double;
    }
    if (CHAR_CLASSES.has(name)) {
      this.genArgs(e, [T.int], name);
      this.builtin(B.CHAR_CLASS, 1, name);
      return T.bool;
    }
    return this.error(callee.loc, `'${name}' was not declared — it is not a function in this sketch or a supported Arduino function${this.suggest(name)}`, "UNDECLARED");
  }

  genMethodCall(e: Extract<Expr, { kind: "call" }>, m: Extract<Expr, { kind: "member" }>): CType {
    const T = this.T;
    const obj = m.obj;
    const name = m.name;
    const n = e.args.length;
    // ---- Serial
    if (obj.kind === "ident" && SERIAL_NAMES.has(obj.name) && !this.lookup(obj.name)) {
      const S = obj.name;
      switch (name) {
        case "begin":
          this.argCount(e, 1, 2, `${S}.begin`);
          this.genArgs(e, [T.ulong, T.int].slice(0, n), `${S}.begin`);
          if (n === 2) this.emit(OP.POP);
          this.builtin(B.SERIAL_BEGIN, 1);
          return T.void;
        case "end":
        case "flush":
          this.genArgs(e, [], `${S}.${name}`);
          this.builtin(B.SERIAL_FLUSH, 0);
          return T.void;
        case "setTimeout":
          this.genArgs(e, [T.ulong], `${S}.setTimeout`);
          this.emit(OP.POP);
          this.emit(OP.PUSH, 0);
          return T.void;
        case "print":
        case "println": {
          this.argCount(e, name === "println" ? 0 : 1, 2, `${S}.${name}`);
          let fmt: number = F.STR;
          if (n >= 1) {
            const t = this.genExpr(e.args[0], true);
            fmt = this.fmtOf(t);
            if (t.k === "array" && fmt !== F.CHARARR) this.error(e.args[0].loc, "Cannot print a whole array — print the elements one at a time in a loop", "TYPE");
            if (t.k === "void") this.error(e.args[0].loc, "This function returns nothing (void), so there is nothing to print", "TYPE");
            if (t.k === "Servo" || t.k === "SoftwareSerial") this.error(e.args[0].loc, `Cannot print a ${t.name} object`, "TYPE");
            if (n === 2) {
              if (fmt === F.STR || fmt === F.CHARARR) this.error(e.args[1].loc, "The second argument of print() (base or decimals) only applies to numbers", "TYPE");
              if (fmt === F.CHAR) fmt = F.INT;
              this.emitConv(this.genExpr(e.args[1], true), T.int, e.args[1].loc);
            }
          }
          this.emit(OP.SERIAL_PRINT, fmt, name === "println" ? 1 : 0, n);
          return T.uint;
        }
        case "write": {
          this.argCount(e, 1, 1, `${S}.write`);
          const t = this.genExpr(e.args[0], true);
          if (t.k === "String" || t.k === "cstr") { this.builtin(B.SERIAL_WRITE_STR, 1); return T.uint; }
          if (this.fmtOf(t) === F.CHARARR) { this.emit(OP.TOSTR, F.CHARARR); this.builtin(B.SERIAL_WRITE_STR, 1); return T.uint; }
          if (!this.isNum(t)) this.error(e.args[0].loc, `Cannot write ${t.name}`, "TYPE");
          this.emitConv(t, T.uchar, e.args[0].loc);
          this.builtin(B.SERIAL_WRITE_BYTE, 1);
          return T.uint;
        }
        case "available":
          this.genArgs(e, [], `${S}.available`);
          this.builtin(B.SERIAL_AVAILABLE, 0);
          return T.int;
        case "availableForWrite":
          this.genArgs(e, [], `${S}.availableForWrite`);
          this.emit(OP.PUSH, 63);
          return T.int;
        case "read":
          this.genArgs(e, [], `${S}.read`);
          this.builtin(B.SERIAL_READ, 0);
          return T.int;
        case "peek":
          this.genArgs(e, [], `${S}.peek`);
          this.builtin(B.SERIAL_PEEK, 0);
          return T.int;
        case "parseInt":
          this.genArgs(e, [], `${S}.parseInt`);
          this.builtin(B.SERIAL_PARSE_INT, 0);
          return T.long;
        case "parseFloat":
          this.genArgs(e, [], `${S}.parseFloat`);
          this.builtin(B.SERIAL_PARSE_FLOAT, 0);
          return T.float;
        case "readString":
          this.genArgs(e, [], `${S}.readString`);
          this.builtin(B.SERIAL_READ_STRING, 0);
          return T.String;
        case "readStringUntil":
          this.genArgs(e, [T.char], `${S}.readStringUntil`);
          this.builtin(B.SERIAL_READ_UNTIL, 1);
          return T.String;
      }
      return this.error(m.loc, `${S}.${name}() is not supported by the BEAST interpreter`, "UNSUPPORTED_FEATURE");
    }
    if (obj.kind === "ident" && obj.name === "Wire" && !this.lookup("Wire")) {
      return this.error(m.loc, `Wire.${name}() — I2C (Wire library) is not simulated by the BEAST interpreter`, "UNSUPPORTED_FEATURE");
    }
    // ---- objects
    const ot = this.typeOf(obj);
    if (ot.k === "SoftwareSerial") return this.error(m.loc, `SoftwareSerial.${name}() is not supported by the BEAST simulator — use Serial instead`, "UNSUPPORTED_FEATURE");
    if (ot.k === "Servo") {
      const recv = () => this.genExpr(obj, true);
      switch (name) {
        case "attach": {
          this.argCount(e, 1, 3, "attach");
          this.recordPin("servo.attach", e.args[0], e.loc);
          recv();
          e.args.forEach((a, i) => this.emitConv(this.genExpr(a, true), T.int, a.loc, `argument ${i + 1} of attach()`));
          for (let i = n; i < 3; i++) this.emit(OP.PUSH, i === 1 ? 544 : 2400);
          this.builtin(B.SERVO_ATTACH, 4);
          return T.uchar;
        }
        case "write":
          recv();
          this.genArgs(e, [T.int], "write");
          this.builtin(B.SERVO_WRITE, 2);
          return T.void;
        case "writeMicroseconds":
          recv();
          this.genArgs(e, [T.int], "writeMicroseconds");
          this.builtin(B.SERVO_WRITE_US, 2);
          return T.void;
        case "read":
          recv();
          this.genArgs(e, [], "read");
          this.builtin(B.SERVO_READ, 1);
          return T.int;
        case "readMicroseconds":
          recv();
          this.genArgs(e, [], "readMicroseconds");
          this.builtin(B.SERVO_READ_US, 1);
          return T.int;
        case "attached":
          recv();
          this.genArgs(e, [], "attached");
          this.builtin(B.SERVO_ATTACHED, 1);
          return T.bool;
        case "detach":
          recv();
          this.genArgs(e, [], "detach");
          this.builtin(B.SERVO_DETACH, 1);
          return T.void;
      }
      return this.error(m.loc, `Servo has no method '${name}' (supported: attach, write, writeMicroseconds, read, attached, detach)`, "UNSUPPORTED_FEATURE");
    }
    if (ot.k === "String" || ot.k === "cstr") {
      const recv = () => {
        const t = this.genExpr(obj, true);
        this.emitConv(t, T.String, obj.loc);
      };
      const mutate = (id: number, argTypes: CType[]) => {
        if (ot.k === "cstr") this.error(m.loc, `'${name}()' changes the text, so it needs a String variable`, "TYPE");
        const lv = this.lvalue(obj, "changed");
        if (lv.kind === "var") {
          recv();
          this.genArgs(e, argTypes, name);
          this.builtin(id, argTypes.length + 1);
          this.storeVar(lv.sym, 0);
        } else {
          this.genElemAddr(lv.obj, lv.index);
          this.emit(OP.DUP2);
          this.emit(OP.LOAD_ELEM, lv.name);
          this.genArgs(e, argTypes, name);
          this.builtin(id, argTypes.length + 1);
          this.emit(OP.STORE_ELEM, lv.name, 0);
        }
        this.emit(OP.PUSH, 0);
        return T.void;
      };
      switch (name) {
        case "length": recv(); this.genArgs(e, [], name); this.builtin(B.STR_LENGTH, 1); return T.uint;
        case "isEmpty": recv(); this.genArgs(e, [], name); this.builtin(B.STR_ISEMPTY, 1); return T.bool;
        case "charAt": recv(); this.genArgs(e, [T.uint], name); this.builtin(B.STR_CHARAT, 2); return T.char;
        case "c_str": recv(); this.genArgs(e, [], name); return T.cstr;
        case "reserve": recv(); this.genArgs(e, [T.uint], name); this.emit(OP.POP); this.emit(OP.POP); this.emit(OP.PUSH, 1); return T.bool;
        case "indexOf":
        case "lastIndexOf": {
          this.argCount(e, 1, 2, name);
          recv();
          const t = this.genExpr(e.args[0], true);
          if (t.k === "int" && t.isChar) { this.emit(OP.TOSTR, F.CHAR); } else this.emitConv(t, T.String, e.args[0].loc);
          if (n === 2) this.emitConv(this.genExpr(e.args[1], true), T.int, e.args[1].loc);
          else this.emit(OP.PUSH, name === "indexOf" ? 0 : -1);
          this.builtin(name === "indexOf" ? B.STR_INDEXOF : B.STR_LASTINDEXOF, 3);
          return T.int;
        }
        case "substring":
          this.argCount(e, 1, 2, name);
          recv();
          this.genArgs(e, [T.uint, T.uint].slice(0, n), name);
          if (n === 1) this.emit(OP.PUSH, -1);
          this.builtin(B.STR_SUBSTRING, 3);
          return T.String;
        case "toInt": recv(); this.genArgs(e, [], name); this.builtin(B.STR_TOINT, 1); return T.long;
        case "toFloat":
        case "toDouble": recv(); this.genArgs(e, [], name); this.builtin(B.STR_TOFLOAT, 1); return T.float;
        case "equals": recv(); this.genArgs(e, [T.String], name); this.builtin(B.STR_EQUALS, 2); return T.bool;
        case "equalsIgnoreCase": recv(); this.genArgs(e, [T.String], name); this.builtin(B.STR_EQUALS_IC, 2); return T.bool;
        case "startsWith": recv(); this.genArgs(e, [T.String], name); this.builtin(B.STR_STARTS, 2); return T.bool;
        case "endsWith": recv(); this.genArgs(e, [T.String], name); this.builtin(B.STR_ENDS, 2); return T.bool;
        case "compareTo": recv(); this.genArgs(e, [T.String], name); this.builtin(B.STR_COMPARE, 2); return T.int;
        case "concat": {
          if (ot.k === "cstr") this.error(m.loc, "concat() needs a String variable", "TYPE");
          this.argCount(e, 1, 1, name);
          const lv = this.lvalue(obj, "changed");
          if (lv.kind !== "var") this.error(m.loc, "concat() on an array element is not supported — use +=", "UNSUPPORTED_FEATURE");
          recv();
          this.emitConv(this.genExpr(e.args[0], true), T.String, e.args[0].loc);
          this.emit(OP.STRCAT);
          this.storeVar(lv.sym, 0);
          this.emit(OP.PUSH, 1);
          return T.bool;
        }
        case "trim": return mutate(B.STR_TRIM, []);
        case "toUpperCase": return mutate(B.STR_UPPER, []);
        case "toLowerCase": return mutate(B.STR_LOWER, []);
        case "replace": {
          const ts = e.args.map((a) => this.typeOf(a));
          const asStr = ts.map((t) => (t.k === "int" && t.isChar ? T.char : T.String));
          if (asStr.some((t) => t.k === "int")) {
            // replace(char, char): convert chars to strings
            return this.mutateWithStrings(e, m, B.STR_REPLACE, ot);
          }
          return mutate(B.STR_REPLACE, [T.String, T.String]);
        }
        case "remove":
          this.argCount(e, 1, 2, name);
          if (n === 1) {
            // remove(index) == remove(index, rest)
            const ex: Extract<Expr, { kind: "call" }> = { ...e, args: [e.args[0], { kind: "num", value: 65535, isFloat: false, suffix: "u", radix: 10, text: "65535", loc: e.loc }] };
            return this.mutateCall(ex, m, B.STR_REMOVE, [T.uint, T.ulong], ot);
          }
          return mutate(B.STR_REMOVE, [T.uint, T.uint]);
        case "setCharAt":
          return mutate(B.STR_SETCHARAT, [T.uint, T.char]);
      }
      return this.error(m.loc, `String has no supported method '${name}'`, "UNSUPPORTED_FEATURE");
    }
    if (ot.k === "array") return this.error(m.loc, `Arrays have no methods — '.${name}()' is not available (use sizeof(a) / sizeof(a[0]) for the length)`, "TYPE");
    return this.error(m.loc, `${ot.name} has no method '${name}'`, "TYPE");
  }

  mutateCall(e: Extract<Expr, { kind: "call" }>, m: Extract<Expr, { kind: "member" }>, id: number, argTypes: CType[], ot: CType): CType {
    if (ot.k !== "String") this.error(m.loc, `'${m.name}()' changes the text, so it needs a String variable`, "TYPE");
    const lv = this.lvalue(m.obj, "changed");
    if (lv.kind !== "var") this.error(m.loc, `${m.name}() on an array element is not supported`, "UNSUPPORTED_FEATURE");
    this.genExpr(m.obj, true);
    this.genArgs(e, argTypes, m.name);
    this.builtin(id, argTypes.length + 1);
    this.storeVar(lv.sym, 0);
    this.emit(OP.PUSH, 0);
    return this.T.void;
  }

  mutateWithStrings(e: Extract<Expr, { kind: "call" }>, m: Extract<Expr, { kind: "member" }>, id: number, ot: CType): CType {
    if (ot.k !== "String") this.error(m.loc, `'${m.name}()' changes the text, so it needs a String variable`, "TYPE");
    this.argCount(e, 2, 2, m.name);
    const lv = this.lvalue(m.obj, "changed");
    if (lv.kind !== "var") this.error(m.loc, `${m.name}() on an array element is not supported`, "UNSUPPORTED_FEATURE");
    this.genExpr(m.obj, true);
    for (const a of e.args) {
      const t = this.genExpr(a, true);
      if (t.k === "int" && t.isChar) this.emit(OP.TOSTR, F.CHAR);
      else this.emitConv(t, this.T.String, a.loc);
    }
    this.builtin(id, 3);
    this.storeVar(lv.sym, 0);
    this.emit(OP.PUSH, 0);
    return this.T.void;
  }

  // ------------------------------------------------------------------------------------------------
  // Pin analysis
  // ------------------------------------------------------------------------------------------------

  isPlausiblePin(v: number): boolean {
    return Number.isInteger(v) && (this.board.digitalPins.includes(v) || this.board.analogPins.includes(v));
  }

  resolvePinUsage(): PinUsage[] {
    const out: PinUsage[] = [];
    for (const r of this.pinRecords) {
      const savedScopes = this.scopes;
      this.scopes = r.scopes;
      let pin: number | null = null;
      try {
        const sym = r.sym;
        if (sym && sym.kind === "var" && !sym.isConst && sym.storage === "global" && !sym.mutated && sym.initConst !== undefined && this.isNum(sym.type)) {
          pin = sym.initConst;
        } else {
          const c = this.constEval(r.arg);
          if (c && !c.float) pin = c.v;
        }
      } finally {
        this.scopes = savedScopes;
      }
      if (pin !== null && r.call === "attachInterrupt" && r.viaInterruptNumber) {
        pin = usesInterruptNumbers(this.board) ? this.board.interruptPins[pin] ?? null : pin;
      }
      if (pin !== null && r.call === "analogRead" && this.avr && !this.board.analogPins.includes(pin) && pin >= 0 && pin < this.board.analogPins.length) {
        pin = this.board.analogPins[pin]; // analogRead(0) == analogRead(A0) on AVR
      }
      const exprText = this.text(r.arg.loc).trim();
      const usage: PinUsage = {
        pin,
        expression: exprText,
        call: r.call,
        line: r.loc.line,
        column: r.loc.col,
      };
      if (/^[A-Za-z_]\w*$/.test(exprText)) usage.symbol = exprText;
      if (r.call === "pinMode" && r.modeArg) {
        this.scopes = r.scopes;
        const m = this.constEval(r.modeArg);
        this.scopes = savedScopes;
        const modes: PinModeValue[] = ["INPUT", "OUTPUT", "INPUT_PULLUP"];
        if (m && modes[m.v]) usage.mode = modes[m.v];
      }
      out.push(usage);
    }
    return out;
  }

  pinSymbols(defines: MacroDef[]): { name: string; value: number; line: number }[] {
    const out: { name: string; value: number; line: number }[] = [];
    const seen = new Set<string>();
    const evalMacro = (name: string, depth: number): number | null => {
      if (depth > 10) return null;
      const m = this.macros.get(name) ?? defines.find((d) => d.name === name);
      if (!m || m.params) return null;
      let body = m.body;
      while (body.length >= 3 && body[0].value === "(" && body[body.length - 1].value === ")") body = body.slice(1, -1);
      if (body.length === 1) {
        const t = body[0];
        if (t.type === "num" && !t.isFloat) return t.num ?? null;
        if (t.type === "ident") {
          const b = this.builtinConstant(t.value);
          if (b && b.t.k === "int") return b.v;
          const g = this.globals.get(t.value);
          if (g && g.kind === "var" && g.isConst && g.constValue !== undefined) return g.constValue;
          return evalMacro(t.value, depth + 1);
        }
      }
      return null;
    };
    for (const d of defines) {
      if (d.params || seen.has(d.name)) continue;
      const v = evalMacro(d.name, 0);
      if (v !== null && this.isPlausiblePin(v)) {
        out.push({ name: d.name, value: v, line: d.line });
        seen.add(d.name);
      }
    }
    for (const g of this.globalVars) {
      if (g.isConst && g.constValue !== undefined && g.type.k === "int" && this.isPlausiblePin(g.constValue) && !seen.has(g.name)) {
        out.push({ name: g.name, value: g.constValue, line: g.line });
        seen.add(g.name);
      }
    }
    return out.sort((a, b) => a.line - b.line);
  }
}

const CMP_OPS: Record<string, number> = { "<": OP.LT, "<=": OP.LE, ">": OP.GT, ">=": OP.GE, "==": OP.EQ, "!=": OP.NE };

/** Remove NOP placeholders and re-target jumps. */
function stripNops(code: Instr[]): Instr[] {
  const map = new Array<number>(code.length + 1);
  let n = 0;
  for (let i = 0; i < code.length; i++) {
    map[i] = n;
    if (code[i].op !== OP.NOP) n++;
  }
  map[code.length] = n;
  const out: Instr[] = [];
  for (const ins of code) {
    if (ins.op === OP.NOP) continue;
    if (JUMP_OPS.has(ins.op)) ins.a = map[ins.a];
    out.push(ins);
  }
  return out;
}

function levenshtein(a: string, b: string): number {
  const dp: number[] = [];
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
