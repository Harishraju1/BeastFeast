/**
 * Token-level C preprocessor for the BEAST subset.
 * Supports: object-like and simple function-like #define, #undef, #include (known libraries only),
 * #ifdef / #ifndef / #if / #elif / #else / #endif (integer expressions + defined()), #pragma (ignored),
 * #error / #warning. Not supported: stringizing (#), token pasting (##), variadic macros.
 *
 * Tokens produced by a macro expansion carry the location of the macro *use* and `macro` = the
 * outermost macro name, so diagnostics and pin-usage extraction point at what the student wrote.
 */
import type { Diagnostic } from "./types";
import type { Token } from "./lexer";

export interface MacroDef {
  name: string;
  params: string[] | null;
  body: Token[];
  line: number;
  col: number;
}

export interface IncludeInfo {
  name: string;
  line: number;
  col: number;
}

export interface PreprocessResult {
  tokens: Token[];
  macros: Map<string, MacroDef>;
  /** every #define in source order (including ones later #undef'd) */
  defines: MacroDef[];
  includes: IncludeInfo[];
  diagnostics: Diagnostic[];
}

/** Libraries the interpreter knows about. */
export const KNOWN_LIBRARIES: Record<string, "full" | "declare-only" | "ignored"> = {
  "Arduino.h": "ignored",
  "math.h": "ignored",
  "stdint.h": "ignored",
  "stdlib.h": "ignored",
  "stdbool.h": "ignored",
  "inttypes.h": "ignored",
  "Servo.h": "full",
  "Wire.h": "declare-only",
  "SoftwareSerial.h": "declare-only",
  // display / sensor libraries emulated by the BEAST interpreter (text output and readings — see features.ts)
  "LiquidCrystal.h": "full",
  "LiquidCrystal_I2C.h": "full",
  "Adafruit_SSD1306.h": "full",
  "Adafruit_GFX.h": "ignored",
  "SPI.h": "ignored",
  "DHT.h": "full",
};

interface CondFrame {
  active: boolean; // this branch is active
  taken: boolean; // some branch of this group already taken
  parentActive: boolean;
  elseSeen: boolean;
  line: number;
  col: number;
}

let expCounter = 1;

export function preprocess(tokens: Token[]): PreprocessResult {
  const pp = new Preprocessor();
  pp.run(tokens);
  return { tokens: pp.out, macros: pp.macros, defines: pp.defines, includes: pp.includes, diagnostics: pp.diags };
}

class Preprocessor {
  macros = new Map<string, MacroDef>();
  defines: MacroDef[] = [];
  includes: IncludeInfo[] = [];
  diags: Diagnostic[] = [];
  out: Token[] = [];
  conds: CondFrame[] = [];

  get active(): boolean {
    return this.conds.length === 0 || this.conds[this.conds.length - 1].active;
  }

  err(t: { line: number; col: number }, message: string, code = "PREPROCESSOR", severity: Diagnostic["severity"] = "error") {
    this.diags.push({ line: t.line, column: t.col, severity, message, code });
  }

  run(tokens: Token[]) {
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.type === "directive") {
        this.directive(t);
        i++;
        continue;
      }
      if (t.type === "eof") {
        for (const c of this.conds) this.err(c, "#if/#ifdef without a matching #endif");
        this.out.push(t);
        break;
      }
      if (!this.active) { i++; continue; }
      if (t.type === "ident" && this.macros.has(t.value)) {
        const m = this.macros.get(t.value)!;
        const r = this.invoke(m, tokens, i, new Set(), true);
        if (r) {
          this.out.push(...r.tokens);
          i = r.next;
          continue;
        }
      }
      this.out.push(t);
      i++;
    }
  }

  /** Try to expand macro `m` whose name token is list[i]. Returns null if not an invocation. */
  invoke(m: MacroDef, list: Token[], i: number, hide: Set<string>, stamp: boolean): { tokens: Token[]; next: number } | null {
    const nameTok = list[i];
    let args: Token[][] | null = null;
    let endTok = nameTok;
    let next = i + 1;
    if (m.params) {
      const open = list[i + 1];
      if (!open || open.type !== "punct" || open.value !== "(") return null;
      args = [];
      let cur: Token[] = [];
      let depth = 0;
      let j = i + 2;
      let closed = false;
      for (; j < list.length; j++) {
        const a = list[j];
        if (a.type === "directive" || a.type === "eof") break;
        if (a.type === "punct" && a.value === "(") depth++;
        if (a.type === "punct" && a.value === ")") {
          if (depth === 0) { closed = true; break; }
          depth--;
        }
        if (a.type === "punct" && a.value === "," && depth === 0) { args.push(cur); cur = []; continue; }
        cur.push(a);
      }
      if (!closed) {
        this.err(nameTok, `Macro '${m.name}' call is missing its closing ')'`);
        return { tokens: [], next: j };
      }
      if (cur.length || args.length) args.push(cur);
      endTok = list[j];
      next = j + 1;
      if (args.length !== m.params.length) {
        this.err(nameTok, `Macro '${m.name}' expects ${m.params.length} argument(s) but got ${args.length}`);
        return { tokens: [], next };
      }
    }
    const inner = new Set(hide);
    inner.add(m.name);
    let body: Token[];
    if (args && m.params) {
      const expandedArgs = args.map((a) => this.expandList(a, hide));
      body = [];
      for (const bt of m.body) {
        const idx = bt.type === "ident" ? m.params.indexOf(bt.value) : -1;
        if (idx >= 0) body.push(...expandedArgs[idx]);
        else body.push(bt);
      }
    } else {
      body = m.body;
    }
    const expanded = this.expandList(body, inner);
    if (!stamp) return { tokens: expanded, next };
    const expId = expCounter++;
    const stamped = expanded.map((bt) => ({
      ...bt,
      line: nameTok.line,
      col: nameTok.col,
      start: nameTok.start,
      end: endTok.end,
      macro: nameTok.macro ?? m.name,
      expId: nameTok.expId ?? expId,
    }));
    return { tokens: stamped, next };
  }

  expandList(list: Token[], hide: Set<string>): Token[] {
    const out: Token[] = [];
    let i = 0;
    while (i < list.length) {
      const t = list[i];
      if (t.type === "ident" && this.macros.has(t.value) && !hide.has(t.value)) {
        const r = this.invoke(this.macros.get(t.value)!, list, i, hide, false);
        if (r) {
          out.push(...r.tokens);
          i = r.next;
          continue;
        }
      }
      out.push(t);
      i++;
    }
    return out;
  }

  directive(t: Token) {
    const name = t.dirName ?? "";
    const sub = t.sub ?? [];
    // conditionals are processed even in inactive regions
    switch (name) {
      case "ifdef":
      case "ifndef": {
        const id = sub[0];
        let cond = false;
        if (!id || id.type !== "ident") this.err(t, `#${name} needs a macro name`);
        else cond = this.macros.has(id.value) === (name === "ifdef");
        const parentActive = this.active;
        this.conds.push({ active: parentActive && cond, taken: cond, parentActive, elseSeen: false, line: t.line, col: t.col });
        return;
      }
      case "if": {
        const parentActive = this.active;
        const cond = parentActive ? this.evalCondition(sub, t) : false;
        this.conds.push({ active: parentActive && cond, taken: cond, parentActive, elseSeen: false, line: t.line, col: t.col });
        return;
      }
      case "elif": {
        const f = this.conds[this.conds.length - 1];
        if (!f) { this.err(t, "#elif without #if"); return; }
        if (f.elseSeen) this.err(t, "#elif after #else");
        if (f.taken) { f.active = false; return; }
        const cond = f.parentActive ? this.evalCondition(sub, t) : false;
        f.active = f.parentActive && cond;
        f.taken = cond;
        return;
      }
      case "else": {
        const f = this.conds[this.conds.length - 1];
        if (!f) { this.err(t, "#else without #if"); return; }
        if (f.elseSeen) this.err(t, "Duplicate #else");
        f.elseSeen = true;
        f.active = f.parentActive && !f.taken;
        f.taken = true;
        return;
      }
      case "endif": {
        if (!this.conds.length) { this.err(t, "#endif without #if"); return; }
        this.conds.pop();
        return;
      }
    }
    if (!this.active) return;
    switch (name) {
      case "define": return this.define(t, sub);
      case "undef": {
        const id = sub[0];
        if (!id || id.type !== "ident") this.err(t, "#undef needs a macro name");
        else this.macros.delete(id.value);
        return;
      }
      case "include": {
        const raw = t.raw ?? "";
        const m = /^[<"]\s*([^>"]+?)\s*[>"]/.exec(raw);
        if (!m) { this.err(t, "#include needs a file name like <Servo.h>"); return; }
        const lib = m[1];
        this.includes.push({ name: lib, line: t.line, col: t.col });
        if (!Object.prototype.hasOwnProperty.call(KNOWN_LIBRARIES, lib)) {
          this.err(
            t,
            `Library "${lib}" is not available in the BEAST simulator. Supported: Servo.h, LiquidCrystal.h, LiquidCrystal_I2C.h, Adafruit_SSD1306.h (text), DHT.h (plus Arduino.h, math.h; Wire.h and SoftwareSerial.h can be included but not used).`,
            "UNSUPPORTED_FEATURE",
          );
        }
        return;
      }
      case "pragma":
      case "line":
        return;
      case "error":
        this.err(t, `#error ${t.raw ?? ""}`.trim(), "PREPROCESSOR");
        return;
      case "warning":
        this.err(t, `#warning ${t.raw ?? ""}`.trim(), "PREPROCESSOR", "warning");
        return;
      case "":
        return; // null directive "#"
      default:
        this.err(t, `Unknown or unsupported preprocessor directive #${name}`, "UNSUPPORTED_FEATURE");
    }
  }

  define(t: Token, sub: Token[]) {
    const id = sub[0];
    if (!id || id.type !== "ident") { this.err(t, "#define needs a name, e.g. #define LED_PIN 13"); return; }
    let params: string[] | null = null;
    let k = 1;
    const open = sub[1];
    if (open && open.type === "punct" && open.value === "(" && !open.spaceBefore) {
      params = [];
      k = 2;
      let ok = false;
      while (k < sub.length) {
        const p = sub[k];
        if (p.type === "punct" && p.value === ")") { ok = true; k++; break; }
        if (p.type === "punct" && p.value === "...") {
          this.err(p, "Variadic macros (...) are not supported", "UNSUPPORTED_FEATURE");
          return;
        }
        if (p.type === "ident") params.push(p.value);
        else if (!(p.type === "punct" && p.value === ",")) { this.err(p, `Unexpected '${p.value}' in macro parameter list`); return; }
        k++;
      }
      if (!ok) { this.err(t, "Macro parameter list is missing ')'"); return; }
    }
    const body = sub.slice(k);
    for (const b of body) {
      if (b.type === "punct" && (b.value === "#" || b.value === "##")) {
        this.err(b, `The macro operator '${b.value}' (stringizing / token pasting) is not supported`, "UNSUPPORTED_FEATURE");
        return;
      }
    }
    const def: MacroDef = { name: id.value, params, body, line: t.line, col: t.col };
    const prev = this.macros.get(id.value);
    if (prev && prev.body.map((x) => x.value).join(" ") !== body.map((x) => x.value).join(" ")) {
      this.err(t, `'${id.value}' is redefined (previous #define on line ${prev.line})`, "PREPROCESSOR", "warning");
    }
    this.macros.set(id.value, def);
    this.defines.push(def);
  }

  evalCondition(sub: Token[], at: Token): boolean {
    // replace defined X / defined(X)
    const pre: Token[] = [];
    for (let i = 0; i < sub.length; i++) {
      const s = sub[i];
      if (s.type === "ident" && s.value === "defined") {
        let nameTok: Token | undefined;
        if (sub[i + 1]?.value === "(") { nameTok = sub[i + 2]; i += 3; } else { nameTok = sub[i + 1]; i += 1; }
        const v = nameTok && this.macros.has(nameTok.value) ? 1 : 0;
        pre.push({ ...s, type: "num", value: String(v), num: v, isFloat: false });
        continue;
      }
      pre.push(s);
    }
    const toks = this.expandList(pre, new Set());
    let pos = 0;
    const peek = () => toks[pos];
    const isP = (v: string) => peek()?.type === "punct" && peek()?.value === v;
    const fail = (msg: string): never => { throw new Error(msg); };
    const primary = (): number => {
      const t = toks[pos++];
      if (!t) return fail("unexpected end of #if expression");
      if (t.type === "num") return t.num ?? 0;
      if (t.type === "char") return t.num ?? 0;
      if (t.type === "ident") return t.value === "true" ? 1 : 0;
      if (t.type === "punct") {
        if (t.value === "(") { const v = expr(0); if (!isP(")")) fail("missing ')'"); pos++; return v; }
        if (t.value === "!") return primary() ? 0 : 1;
        if (t.value === "-") return -primary();
        if (t.value === "+") return primary();
        if (t.value === "~") return ~primary();
      }
      return fail(`unexpected '${t.value}'`);
    };
    const prec: Record<string, number> = {
      "||": 1, "&&": 2, "|": 3, "^": 4, "&": 5, "==": 6, "!=": 6, "<": 7, ">": 7, "<=": 7, ">=": 7,
      "<<": 8, ">>": 8, "+": 9, "-": 9, "*": 10, "/": 10, "%": 10,
    };
    const expr = (minPrec: number): number => {
      let left = primary();
      for (;;) {
        const t = peek();
        if (!t || t.type !== "punct") break;
        if (t.value === "?" && minPrec === 0) {
          pos++;
          const a = expr(0);
          if (!isP(":")) fail("missing ':'");
          pos++;
          const b = expr(0);
          left = left ? a : b;
          continue;
        }
        const p = prec[t.value];
        if (!p || p <= minPrec - 1 || p < minPrec) break;
        pos++;
        const right = expr(p + 1);
        switch (t.value) {
          case "||": left = left || right ? 1 : 0; break;
          case "&&": left = left && right ? 1 : 0; break;
          case "|": left = left | right; break;
          case "^": left = left ^ right; break;
          case "&": left = left & right; break;
          case "==": left = left === right ? 1 : 0; break;
          case "!=": left = left !== right ? 1 : 0; break;
          case "<": left = left < right ? 1 : 0; break;
          case ">": left = left > right ? 1 : 0; break;
          case "<=": left = left <= right ? 1 : 0; break;
          case ">=": left = left >= right ? 1 : 0; break;
          case "<<": left = left << right; break;
          case ">>": left = left >> right; break;
          case "+": left = left + right; break;
          case "-": left = left - right; break;
          case "*": left = left * right; break;
          case "/": left = right === 0 ? fail("division by zero") : Math.trunc(left / right); break;
          case "%": left = right === 0 ? fail("division by zero") : left % right; break;
        }
      }
      return left;
    };
    try {
      if (!toks.length) { this.err(at, "#if needs an expression"); return false; }
      const v = expr(0);
      if (pos < toks.length) fail(`unexpected '${toks[pos].value}'`);
      return v !== 0;
    } catch (e) {
      this.err(at, `Cannot evaluate #${at.dirName} condition: ${(e as Error).message}`);
      return false;
    }
  }
}
