/**
 * Lexer for the BEAST Arduino C/C++ subset.
 * Produces tokens with 1-based line/column and source offsets. Preprocessor directives are
 * returned as a single `directive` token whose `sub` holds the lexed tokens of the directive line.
 */
import type { Diagnostic } from "./types";

export type TokType = "ident" | "num" | "char" | "str" | "punct" | "directive" | "eof";

export interface Token {
  type: TokType;
  value: string; // identifier name, punctuator, raw number text, decoded string/char
  line: number;
  col: number;
  start: number; // source offset
  end: number; // source offset (exclusive)
  /** for numbers */
  num?: number;
  isFloat?: boolean;
  suffix?: string; // lowercase integer suffix e.g. "ul", or "f"
  radix?: number;
  /** for directives: name ("define", "include", ...) and lexed rest of line */
  dirName?: string;
  sub?: Token[];
  /** raw text of directive after the name */
  raw?: string;
  /** set by macro expansion: outermost macro name this token came from */
  macro?: string;
  /** set by macro expansion: id shared by all tokens of one expansion */
  expId?: number;
  /** true if whitespace preceded the token (used for function-like macro detection) */
  spaceBefore?: boolean;
}

const PUNCTS = [
  ">>=", "<<=", "...", "->*", "<=>",
  "->", "++", "--", "&&", "||", "==", "!=", "<=", ">=", "<<", ">>", "+=", "-=", "*=", "/=", "%=",
  "&=", "|=", "^=", "::", "##",
  "+", "-", "*", "/", "%", "&", "|", "^", "~", "!", "=", "<", ">", "?", ":", ";", ",", ".",
  "(", ")", "[", "]", "{", "}", "#", "@", "\\",
];

const isIdStart = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isDigit = (c: string) => c >= "0" && c <= "9";
const isIdChar = (c: string) => isIdStart(c) || isDigit(c);

export interface LexResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
}

export function lex(src: string): LexResult {
  const diags: Diagnostic[] = [];
  const tokens = lexRange(src, 0, src.length, 1, 1, true, diags);
  const last = tokens.length ? tokens[tokens.length - 1] : null;
  tokens.push({
    type: "eof",
    value: "<end of file>",
    line: last ? last.line : 1,
    col: last ? last.col + (last.end - last.start) : 1,
    start: src.length,
    end: src.length,
  });
  return { tokens, diagnostics: diags };
}

function decodeEscape(src: string, i: number): { ch: number; next: number } {
  // src[i] is the char after the backslash
  const c = src[i];
  switch (c) {
    case "n": return { ch: 10, next: i + 1 };
    case "t": return { ch: 9, next: i + 1 };
    case "r": return { ch: 13, next: i + 1 };
    case "0": {
      // octal
      let j = i;
      let v = 0;
      while (j < i + 3 && src[j] >= "0" && src[j] <= "7") { v = v * 8 + (src.charCodeAt(j) - 48); j++; }
      return { ch: v & 0xff, next: j };
    }
    case "a": return { ch: 7, next: i + 1 };
    case "b": return { ch: 8, next: i + 1 };
    case "f": return { ch: 12, next: i + 1 };
    case "v": return { ch: 11, next: i + 1 };
    case "\\": return { ch: 92, next: i + 1 };
    case "'": return { ch: 39, next: i + 1 };
    case '"': return { ch: 34, next: i + 1 };
    case "?": return { ch: 63, next: i + 1 };
    case "x": {
      let j = i + 1;
      let v = 0;
      while (j < src.length && /[0-9a-fA-F]/.test(src[j])) { v = v * 16 + parseInt(src[j], 16); j++; }
      return { ch: v & 0xff, next: j };
    }
    default:
      if (c >= "1" && c <= "7") {
        let j = i;
        let v = 0;
        while (j < i + 3 && src[j] >= "0" && src[j] <= "7") { v = v * 8 + (src.charCodeAt(j) - 48); j++; }
        return { ch: v & 0xff, next: j };
      }
      return { ch: c ? c.charCodeAt(0) : 0, next: i + 1 };
  }
}

export function lexRange(
  src: string,
  start: number,
  end: number,
  startLine: number,
  startCol: number,
  allowDirectives: boolean,
  diags: Diagnostic[],
): Token[] {
  const out: Token[] = [];
  let i = start;
  let line = startLine;
  let col = startCol;
  let bol = true; // at beginning of line (only whitespace so far)
  let space = true;

  const adv = (n: number) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === "\n") { line++; col = 1; bol = true; } else col++;
      i++;
    }
  };

  while (i < end) {
    const c = src[i];
    // whitespace
    if (c === "\n") { adv(1); space = true; continue; }
    if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v") { adv(1); space = true; continue; }
    // line continuation
    if (c === "\\" && (src[i + 1] === "\n" || (src[i + 1] === "\r" && src[i + 2] === "\n"))) {
      const wasBol: boolean = bol;
      adv(src[i + 1] === "\r" ? 3 : 2);
      bol = wasBol;
      space = true;
      continue;
    }
    // comments
    if (c === "/" && src[i + 1] === "/") {
      while (i < end && src[i] !== "\n") adv(1);
      space = true;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const sl = line, sc = col;
      const wasBol: boolean = bol;
      adv(2);
      let closed = false;
      while (i < end) {
        if (src[i] === "*" && src[i + 1] === "/") { adv(2); closed = true; break; }
        adv(1);
      }
      if (!closed) diags.push({ line: sl, column: sc, severity: "error", message: "Unterminated /* comment — add the closing */", code: "SYNTAX" });
      bol = wasBol && bol;
      space = true;
      continue;
    }

    const tl = line, tc = col, ts = i;

    // preprocessor directive
    if (c === "#" && bol && allowDirectives) {
      // find end of logical line
      let j = i + 1;
      let inStr: string | null = null;
      while (j < end) {
        const d = src[j];
        if (inStr) {
          if (d === "\\") { j += 2; continue; }
          if (d === inStr || d === "\n") inStr = null;
          j++;
          continue;
        }
        if (d === '"' || d === "'") { inStr = d; j++; continue; }
        if (d === "\\" && src[j + 1] === "\n") { j += 2; continue; }
        if (d === "\\" && src[j + 1] === "\r" && src[j + 2] === "\n") { j += 3; continue; }
        if (d === "/" && src[j + 1] === "*") {
          const close = src.indexOf("*/", j + 2);
          j = close < 0 ? end : close + 2;
          continue;
        }
        if (d === "/" && src[j + 1] === "/") {
          while (j < end && src[j] !== "\n") j++;
          break;
        }
        if (d === "\n") break;
        j++;
      }
      const sub = lexRange(src, i + 1, j, line, col + 1, false, diags);
      const nameTok = sub[0];
      const dirName = nameTok && nameTok.type === "ident" ? nameTok.value : nameTok ? nameTok.value : "";
      const rawStart = nameTok ? nameTok.end : i + 1;
      out.push({
        type: "directive",
        value: "#" + dirName,
        line: tl,
        col: tc,
        start: ts,
        end: j,
        dirName,
        sub: sub.slice(1),
        raw: src.slice(rawStart, j).replace(/\\\r?\n/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/, "").trim(),
        spaceBefore: true,
      });
      adv(j - i);
      space = true;
      continue;
    }
    bol = false;

    // identifiers
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < end && isIdChar(src[j])) j++;
      const name = src.slice(i, j);
      out.push({ type: "ident", value: name, line: tl, col: tc, start: ts, end: j, spaceBefore: space });
      adv(j - i);
      space = false;
      continue;
    }

    // numbers
    if (isDigit(c) || (c === "." && isDigit(src[i + 1] ?? ""))) {
      let j = i;
      let isFloat = false;
      let radix = 10;
      let digits = "";
      if (c === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
        radix = 16;
        j = i + 2;
        while (j < end && /[0-9a-fA-F']/.test(src[j])) j++;
        digits = src.slice(i + 2, j).replace(/'/g, "");
      } else if (c === "0" && (src[i + 1] === "b" || src[i + 1] === "B")) {
        radix = 2;
        j = i + 2;
        while (j < end && /[01']/.test(src[j])) j++;
        digits = src.slice(i + 2, j).replace(/'/g, "");
      } else {
        while (j < end && (isDigit(src[j]) || src[j] === "'")) j++;
        if (src[j] === ".") { isFloat = true; j++; while (j < end && isDigit(src[j])) j++; }
        if (src[j] === "e" || src[j] === "E") {
          let k = j + 1;
          if (src[k] === "+" || src[k] === "-") k++;
          if (isDigit(src[k] ?? "")) {
            isFloat = true;
            j = k;
            while (j < end && isDigit(src[j])) j++;
          }
        }
        digits = src.slice(i, j).replace(/'/g, "");
        if (!isFloat && digits.length > 1 && digits[0] === "0") radix = 8;
      }
      // suffix
      let k = j;
      while (k < end && isIdChar(src[k])) k++;
      const suffix = src.slice(j, k).toLowerCase();
      let num = 0;
      let bad = false;
      if (isFloat) {
        num = parseFloat(digits);
        if (suffix !== "" && suffix !== "f" && suffix !== "l") bad = true;
      } else {
        if (!/^(u|l|ul|lu|ll|ull|llu)?$/.test(suffix)) bad = true;
        if (digits === "" ) bad = true;
        else {
          if (radix === 8 && /[89]/.test(digits)) bad = true;
          num = radix === 8 ? parseInt(digits, 8) : radix === 10 ? parseInt(digits, 10) : parseInt(digits, radix);
          if (!Number.isFinite(num)) bad = true;
        }
      }
      if (bad) {
        diags.push({ line: tl, column: tc, severity: "error", message: `Invalid number '${src.slice(i, k)}'`, code: "SYNTAX" });
      }
      out.push({ type: "num", value: src.slice(i, k), line: tl, col: tc, start: ts, end: k, num, isFloat, suffix, radix, spaceBefore: space });
      adv(k - i);
      space = false;
      continue;
    }

    // char literal
    if (c === "'") {
      let j = i + 1;
      const chars: number[] = [];
      let closed = false;
      while (j < end && src[j] !== "\n") {
        if (src[j] === "'") { closed = true; j++; break; }
        if (src[j] === "\\") { const e = decodeEscape(src, j + 1); chars.push(e.ch); j = e.next; continue; }
        chars.push(src.charCodeAt(j) & 0xff);
        j++;
      }
      if (!closed) diags.push({ line: tl, column: tc, severity: "error", message: "Unterminated character literal — add the closing '", code: "SYNTAX" });
      else if (chars.length !== 1) diags.push({ line: tl, column: tc, severity: "error", message: chars.length === 0 ? "Empty character literal ''" : "A character literal must contain exactly one character (use \"double quotes\" for text)", code: "SYNTAX" });
      out.push({ type: "char", value: String.fromCharCode(chars[0] ?? 0), num: chars[0] ?? 0, line: tl, col: tc, start: ts, end: j, spaceBefore: space });
      adv(j - i);
      space = false;
      continue;
    }

    // string literal
    if (c === '"') {
      let j = i + 1;
      let s = "";
      let closed = false;
      while (j < end && src[j] !== "\n") {
        if (src[j] === '"') { closed = true; j++; break; }
        if (src[j] === "\\") {
          if (src[j + 1] === "\n") { j += 2; continue; }
          const e = decodeEscape(src, j + 1);
          s += String.fromCharCode(e.ch);
          j = e.next;
          continue;
        }
        s += src[j];
        j++;
      }
      if (!closed) diags.push({ line: tl, column: tc, severity: "error", message: 'Unterminated string — add the closing "', code: "SYNTAX" });
      out.push({ type: "str", value: s, line: tl, col: tc, start: ts, end: j, spaceBefore: space });
      adv(j - i);
      space = false;
      continue;
    }

    // punctuators
    let matched = "";
    for (const p of PUNCTS) {
      if (src.startsWith(p, i) && i + p.length <= end) { matched = p; break; }
    }
    if (matched) {
      out.push({ type: "punct", value: matched, line: tl, col: tc, start: ts, end: i + matched.length, spaceBefore: space });
      adv(matched.length);
      space = false;
      continue;
    }

    diags.push({ line: tl, column: tc, severity: "error", message: `Unexpected character '${c}'`, code: "SYNTAX" });
    adv(1);
  }
  return out;
}
