/**
 * Bytecode shared by the BEAST compiler (compile.ts) and virtual machine (interpreter.ts).
 * A simple stack machine; every executed instruction is one "step" of virtual CPU time.
 */
import type { BoardProfile } from "./types";

export const OP = {
  NOP: 0,
  PUSH: 1, // a = constant
  PUSH_CLONE: 2, // a = template array (deep-cloned)
  POP: 3,
  DUP: 4,
  DUP2: 5,
  LOAD_L: 6, // a = slot
  STORE_L: 7, // a = slot, b = keep value on stack (0/1)
  LOAD_G: 8,
  STORE_G: 9,
  LOAD_ELEM: 10, // pops idx, arr; a = array name for messages
  STORE_ELEM: 11, // pops value, idx, arr; b = keep; a = array name
  CONV: 12, // a = kind
  ADD: 13, // a = kind
  SUB: 14,
  MUL: 15,
  DIV: 16,
  MOD: 17,
  SHL: 18,
  SHR: 19,
  BAND: 20,
  BOR: 21,
  BXOR: 22,
  NEG: 23,
  BNOT: 24,
  NOT: 25,
  LT: 26,
  LE: 27,
  GT: 28,
  GE: 29,
  EQ: 30,
  NE: 31,
  JMP: 32, // a = target
  JF: 33, // pop; jump if false
  JT: 34, // pop; jump if true
  INC_L: 35, // a = slot, b = delta, c = kind, d = mode (0 discard, 1 pre, 2 post)
  INC_G: 36,
  INC_ELEM: 37, // pops idx, arr; a = name, b = delta, c = kind, d = mode
  CALL: 38, // a = function index
  RET: 39, // pops return value
  RET_VOID: 40,
  BUILTIN: 41, // a = builtin id, b = argc; always pushes a result
  STRCAT: 42,
  TOSTR: 43, // a = format, b = has extra arg (base / decimals), c = lowercase hex (String())
  SERIAL_PRINT: 44, // a = format, b = newline, c = number of args (0..2)
  NEWARR: 45, // a = dims, b = element initial value ("servo" creates Servo objects)
  LOOP_DONE: 46,
  SET_STATE: 47, // a = "setup" | "loop"
  HALT: 48,
  STRIDX: 49, // pops idx, string -> char code (String operator[])
} as const;

export const JUMP_OPS = new Set<number>([OP.JMP, OP.JF, OP.JT]);

/** numeric representation kinds used for wrap-around / rounding */
export const K = {
  F64: 0,
  F32: 1,
  I8: 2,
  U8: 3,
  I16: 4,
  U16: 5,
  I32: 6,
  U32: 7,
  BOOL: 8,
  NONE: 9,
} as const;

/** print / to-string formats */
export const F = {
  INT: 0,
  CHAR: 1,
  FLOAT: 2,
  STR: 3,
  CHARARR: 4,
} as const;

export const B = {
  PIN_MODE: 1,
  DIGITAL_WRITE: 2,
  DIGITAL_READ: 3,
  ANALOG_WRITE: 4,
  ANALOG_READ: 5,
  ANALOG_READ_RES: 6,
  ANALOG_WRITE_RES: 7,
  ANALOG_REFERENCE: 8,
  DELAY: 9,
  DELAY_US: 10,
  MILLIS: 11,
  MICROS: 12,
  PULSE_IN: 13,
  MAP: 14,
  CONSTRAIN: 15,
  ABS: 16,
  MIN: 17,
  MAX: 18,
  SQ: 19,
  MATH1: 20, // c = function name
  MATH2: 21,
  ROUND_LONG: 22,
  RANDOM1: 23,
  RANDOM2: 24,
  RANDOM_SEED: 25,
  ATTACH_INT: 26,
  DETACH_INT: 27,
  PIN_TO_INT: 28,
  NO_INTERRUPTS: 29,
  INTERRUPTS: 30,
  TONE: 31,
  NO_TONE: 32,
  YIELD: 33,
  EXIT: 34,
  // ESP32 Arduino core 3.x LEDC PWM
  LEDC_ATTACH: 35,
  LEDC_WRITE: 36,
  LEDC_DETACH: 37,
  SERIAL_BEGIN: 40,
  SERIAL_AVAILABLE: 41,
  SERIAL_READ: 42,
  SERIAL_PEEK: 43,
  SERIAL_PARSE_INT: 44,
  SERIAL_PARSE_FLOAT: 45,
  SERIAL_READ_STRING: 46,
  SERIAL_READ_UNTIL: 47,
  SERIAL_WRITE_BYTE: 48,
  SERIAL_WRITE_STR: 49,
  SERIAL_FLUSH: 50,
  SERVO_NEW: 60,
  SERVO_ATTACH: 61,
  SERVO_WRITE: 62,
  SERVO_WRITE_US: 63,
  SERVO_READ: 64,
  SERVO_READ_US: 65,
  SERVO_ATTACHED: 66,
  SERVO_DETACH: 67,
  STR_LENGTH: 80,
  STR_CHARAT: 81,
  STR_INDEXOF: 82,
  STR_LASTINDEXOF: 83,
  STR_SUBSTRING: 84,
  STR_TOINT: 85,
  STR_TOFLOAT: 86,
  STR_EQUALS: 87,
  STR_EQUALS_IC: 88,
  STR_STARTS: 89,
  STR_ENDS: 90,
  STR_COMPARE: 91,
  STR_TRIM: 92,
  STR_UPPER: 93,
  STR_LOWER: 94,
  STR_REPLACE: 95,
  STR_REMOVE: 96,
  STR_SETCHARAT: 97,
  STR_ISEMPTY: 98,
  CHAR_CLASS: 100, // c = class name
  STRLEN: 101,
} as const;

export interface Instr {
  op: number;
  a: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  b: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  c: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  d: number;
  line: number;
  col: number;
}

export interface FuncCode {
  name: string;
  code: Instr[];
  nParams: number;
  nLocals: number;
  isVoid: boolean;
  line: number;
}

export interface CompiledProgram {
  readonly __beast: 1;
  board: BoardProfile;
  intBits: 16 | 32;
  avr: boolean;
  funcs: FuncCode[];
  mainIndex: number;
  nGlobals: number;
}

export function isCompiledProgram(p: unknown): p is CompiledProgram {
  return !!p && typeof p === "object" && (p as { __beast?: number }).__beast === 1;
}

/** Wrap / round a JS number to the representation of `kind` (C conversion semantics). */
export function wrap(v: number, kind: number): number {
  switch (kind) {
    case K.F64: return v;
    case K.F32: return Math.fround(v);
    case K.I8: return (v << 24) >> 24;
    case K.U8: return v & 0xff;
    case K.I16: return (v << 16) >> 16;
    case K.U16: return v & 0xffff;
    case K.I32: return v | 0;
    case K.U32: return v >>> 0;
    case K.BOOL: return v ? 1 : 0;
    default: return v;
  }
}

export function isIntKind(kind: number): boolean {
  return kind >= K.I8 && kind <= K.U32;
}
