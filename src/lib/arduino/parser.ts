/**
 * Recursive-descent parser for the BEAST Arduino C/C++ subset.
 * Unsupported C++ constructs are reported with code UNSUPPORTED_FEATURE instead of being guessed at.
 */
import type { Diagnostic } from "./types";
import type { Token } from "./lexer";
import type { Declarator, EnumDecl, Expr, FuncDecl, Loc, Param, ProgramAST, Stmt, TopLevel, TypeSpec, VarDecl } from "./ast";

class ParseError extends Error {}

const BASE_TYPE_WORDS = new Set([
  "void", "bool", "boolean", "char", "byte", "int", "long", "short", "float", "double", "word", "String",
  "Servo", "SoftwareSerial", "LiquidCrystal_I2C", "LiquidCrystal", "Adafruit_SSD1306", "DHT", "size_t", "uint8_t", "int8_t", "uint16_t", "int16_t", "uint32_t", "int32_t",
  "uint64_t", "int64_t", "unsigned", "signed",
]);
const QUALIFIERS = new Set(["const", "static", "volatile", "constexpr", "inline", "register", "extern"]);

/** C++ keywords / constructs the interpreter deliberately does not support. */
const UNSUPPORTED_KEYWORDS: Record<string, string> = {
  class: "Classes (class) are not supported by the BEAST interpreter — use global variables and functions instead.",
  struct: "Structs (struct) are not supported by the BEAST interpreter — use separate variables or arrays instead.",
  union: "Unions are not supported.",
  template: "Templates are not supported.",
  typename: "Templates are not supported.",
  typedef: "typedef is not supported — write the type out in full.",
  namespace: "Namespaces are not supported.",
  using: "'using' is not supported.",
  new: "Dynamic memory (new) is not supported — declare variables and arrays with a fixed size.",
  delete: "Dynamic memory (delete) is not supported.",
  goto: "goto is not supported — use loops, break and continue instead.",
  operator: "Operator overloading is not supported.",
  virtual: "Classes and virtual functions are not supported.",
  friend: "Classes are not supported.",
  public: "Classes are not supported.",
  private: "Classes are not supported.",
  protected: "Classes are not supported.",
  this: "Classes ('this') are not supported.",
  throw: "Exceptions are not supported.",
  try: "Exceptions are not supported.",
  catch: "Exceptions are not supported.",
  auto: "'auto' type deduction is not supported — write the type (int, float, …) explicitly.",
  nullptr: "Pointers (nullptr) are not supported.",
  NULL: "Pointers (NULL) are not supported.",
  asm: "Inline assembly is not supported.",
  __asm__: "Inline assembly is not supported.",
  PROGMEM: "PROGMEM (flash-stored data) is not supported — remove PROGMEM.",
  ISR: "Raw AVR interrupt vectors (ISR) are not supported — use attachInterrupt() instead.",
  decltype: "decltype is not supported.",
  dynamic_cast: "dynamic_cast is not supported.",
  reinterpret_cast: "reinterpret_cast is not supported.",
  const_cast: "const_cast is not supported.",
};

const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>="]);
const BIN_PREC: Record<string, number> = {
  "||": 1, "&&": 2, "|": 3, "^": 4, "&": 5, "==": 6, "!=": 6, "<": 7, ">": 7, "<=": 7, ">=": 7,
  "<<": 8, ">>": 8, "+": 9, "-": 9, "*": 10, "/": 10, "%": 10,
};

export interface ParseResult {
  ast: ProgramAST;
  diagnostics: Diagnostic[];
}

export function parse(tokens: Token[]): ParseResult {
  const p = new Parser(tokens);
  const ast = p.program();
  return { ast, diagnostics: p.diags };
}

class Parser {
  pos = 0;
  diags: Diagnostic[] = [];
  enumNames = new Set<string>();
  constructor(private toks: Token[]) {}

  // ---------- token helpers ----------
  get t(): Token { return this.toks[this.pos]; }
  peek(n = 1): Token { return this.toks[Math.min(this.pos + n, this.toks.length - 1)]; }
  get prevEnd(): number { return this.pos > 0 ? this.toks[this.pos - 1].end : 0; }
  isP(v: string, tok: Token = this.t): boolean { return tok.type === "punct" && tok.value === v; }
  isId(v?: string, tok: Token = this.t): boolean { return tok.type === "ident" && (v === undefined || tok.value === v); }
  next(): Token { const t = this.t; if (t.type !== "eof") this.pos++; return t; }
  accept(v: string): boolean { if (this.isP(v)) { this.pos++; return true; } return false; }
  expect(v: string, what?: string): Token {
    if (this.isP(v)) return this.next();
    const t = this.t;
    const got = t.type === "eof" ? "end of file" : `'${t.value}'`;
    let hint = "";
    if (v === ";") hint = " — did you forget a semicolon at the end of the previous line?";
    // report missing ';' at the end of the previous token, like real compilers
    if (v === ";" && this.pos > 0) {
      const pt = this.toks[this.pos - 1];
      this.fail(pt.line, pt.col + Math.max(1, pt.end - pt.start), `Expected ';' after ${what ?? "statement"} but found ${got}${hint}`);
    }
    this.fail(t.line, t.col, `Expected '${v}'${what ? " " + what : ""} but found ${got}`);
  }
  fail(line: number, col: number, message: string, code = "SYNTAX"): never {
    this.diags.push({ line, column: col, severity: "error", message, code });
    throw new ParseError(message);
  }
  failAt(t: Token, message: string, code = "SYNTAX"): never { return this.fail(t.line, t.col, message, code); }
  unsupported(t: Token, message: string): never { return this.fail(t.line, t.col, message, "UNSUPPORTED_FEATURE"); }
  locFrom(t: Token): Loc { return { line: t.line, col: t.col, start: t.start, end: Math.max(this.prevEnd, t.end) }; }

  checkUnsupported(t: Token = this.t) {
    if (t.type === "ident" && Object.prototype.hasOwnProperty.call(UNSUPPORTED_KEYWORDS, t.value)) {
      this.unsupported(t, UNSUPPORTED_KEYWORDS[t.value]);
    }
  }

  // ---------- recovery ----------
  syncTop() {
    // skip to the end of the current top-level item
    let depth = 0;
    while (this.t.type !== "eof") {
      const t = this.next();
      if (t.type !== "punct") continue;
      if (t.value === "{") depth++;
      else if (t.value === "}") { depth--; if (depth <= 0) { this.accept(";"); return; } }
      else if (t.value === ";" && depth === 0) return;
    }
  }
  syncStmt() {
    let depth = 0;
    while (this.t.type !== "eof") {
      if (this.isP("}") && depth === 0) return;
      const t = this.next();
      if (t.type !== "punct") continue;
      if (t.value === "{") depth++;
      else if (t.value === "}") { depth--; if (depth === 0) return; }
      else if (t.value === ";" && depth === 0) return;
    }
  }

  // ---------- program ----------
  program(): ProgramAST {
    const items: TopLevel[] = [];
    while (this.t.type !== "eof") {
      if (this.diags.length > 50) break;
      const start = this.pos;
      try {
        if (this.accept(";")) continue;
        const item = this.topLevel();
        if (item) items.push(...item);
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        if (this.pos === start) this.next();
        this.syncTop();
      }
    }
    return { items };
  }

  isTypeStart(tok: Token = this.t): boolean {
    if (tok.type !== "ident") return false;
    return BASE_TYPE_WORDS.has(tok.value) || QUALIFIERS.has(tok.value) || this.enumNames.has(tok.value) || tok.value === "enum";
  }

  topLevel(): TopLevel[] | null {
    const t = this.t;
    this.checkUnsupported(t);
    if (this.isId("enum")) {
      const e = this.enumDecl();
      if (this.accept(";")) return [e];
      // enum Name var = ...;
      const decl = this.declRest(this.enumTypeSpec(e, t), t);
      return [e, decl];
    }
    if (!this.isTypeStart()) {
      if (t.type === "ident" && this.peek().type === "ident") {
        this.failAt(t, `Unknown type '${t.value}'. The BEAST interpreter supports int, long, float, bool, char, byte, String, Servo and the uintN_t types; libraries/classes like '${t.value}' are not available.`, "UNSUPPORTED_FEATURE");
      }
      if (t.type === "ident" && this.isP("(", this.peek())) {
        this.failAt(t, `Function '${t.value}' needs a return type, e.g. 'void ${t.value}()'`);
      }
      this.failAt(t, `Expected a declaration (variable or function) but found '${t.value}'. Statements must be inside a function such as setup() or loop().`);
    }
    const type = this.typeSpec();
    const nameTok = this.t;
    if (nameTok.type !== "ident") this.failAt(nameTok, `Expected a name after the type but found '${nameTok.value}'`);
    this.checkUnsupported(nameTok);
    // "LiquidCrystal_I2C lcd(0x27, 16, 2);" is an object with constructor arguments, not a function
    if (this.isP("(", this.peek()) && !["SoftwareSerial", "LiquidCrystal_I2C", "LiquidCrystal", "Adafruit_SSD1306", "DHT"].includes(type.base)) {
      return [this.funcDecl(type, t)];
    }
    if (this.isP("::", this.peek())) this.unsupported(this.peek(), "Scope resolution (::) is not supported — classes and namespaces are not available.");
    return [this.declRest(type, t)];
  }

  enumTypeSpec(e: EnumDecl, t: Token): TypeSpec {
    return { base: e.name ? `enum:${e.name}` : "int", isConst: false, isStatic: false, isVolatile: false, loc: this.locFrom(t) };
  }

  enumDecl(): EnumDecl {
    const start = this.next(); // 'enum'
    if (this.isId("class") || this.isId("struct")) this.unsupported(this.t, "Scoped enums (enum class) are not supported — use a plain enum.");
    let name: string | null = null;
    if (this.t.type === "ident") { name = this.next().value; this.enumNames.add(name); }
    if (this.isP(":")) this.unsupported(this.t, "Enums with an explicit underlying type are not supported.");
    if (!this.isP("{")) {
      if (name) this.failAt(this.t, `Expected '{' after enum ${name}`);
      this.failAt(this.t, "Expected '{' after enum");
    }
    this.next();
    const members: EnumDecl["members"] = [];
    while (!this.isP("}")) {
      const mt = this.t;
      if (mt.type !== "ident") this.failAt(mt, `Expected an enum member name but found '${mt.value}'`);
      this.next();
      let value: Expr | null = null;
      if (this.accept("=")) value = this.assignment();
      members.push({ name: mt.value, value, loc: this.locFrom(mt) });
      if (!this.accept(",")) break;
    }
    this.expect("}", "to close the enum");
    return { kind: "enum", name, members, loc: this.locFrom(start) };
  }

  /** Parses qualifiers + base type. Pointer/reference declarators are handled by callers. */
  typeSpec(): TypeSpec {
    const start = this.t;
    let isConst = false, isStatic = false, isVolatile = false;
    const words: string[] = [];
    for (;;) {
      const t = this.t;
      if (t.type !== "ident") break;
      if (QUALIFIERS.has(t.value)) {
        if (t.value === "const" || t.value === "constexpr") isConst = true;
        else if (t.value === "static") isStatic = true;
        else if (t.value === "volatile") isVolatile = true;
        else if (t.value === "extern") this.unsupported(t, "'extern' declarations are not supported (everything lives in one sketch file).");
        this.next();
        continue;
      }
      if (BASE_TYPE_WORDS.has(t.value) || this.enumNames.has(t.value)) {
        // "int" after "unsigned/long/short" is part of the same type
        if (words.length && !["unsigned", "signed", "long", "short"].includes(words[words.length - 1]) ) break;
        if (words.length && !["int", "long", "short", "char", "unsigned", "signed"].includes(t.value)) break;
        words.push(t.value);
        this.next();
        continue;
      }
      if (t.value === "enum" && words.length === 0) {
        this.next();
        const n = this.t;
        if (n.type !== "ident" || !this.enumNames.has(n.value)) this.failAt(n, "Expected an enum type name after 'enum'");
        words.push(n.value);
        this.next();
        continue;
      }
      if (t.value === "std" && this.isP("::", this.peek())) this.unsupported(t, "The C++ standard library (std::) is not available on the BEAST interpreter.");
      break;
    }
    if (!words.length) {
      if (this.t.type === "ident") this.checkUnsupported(this.t);
      this.failAt(this.t, `Expected a type but found '${this.t.value}'`);
    }
    const base = this.normaliseType(words, start);
    // trailing const (e.g. "int const x")
    while (this.isId("const")) { isConst = true; this.next(); }
    let spec: TypeSpec = { base, isConst, isStatic, isVolatile, loc: this.locFrom(start) };
    // pointers / references
    if (this.isP("*")) {
      if (base === "char" && isConst) {
        this.next();
        if (this.isP("*")) this.unsupported(this.t, "Pointers to pointers are not supported.");
        while (this.isId("const")) this.next();
        spec = { ...spec, base: "cstr" };
      } else {
        this.unsupported(this.t, base === "char"
          ? "Pointers are not supported. For text use String, or 'const char*' for read-only text."
          : "Pointers (*) are not supported by the BEAST interpreter — use arrays or global variables instead.");
      }
    }
    if (this.isP("&") || this.isP("&&")) {
      this.unsupported(this.t, "References (&) are not supported — pass values, use a return value, or use a global variable instead.");
    }
    return spec;
  }

  normaliseType(words: string[], at: Token): string {
    const w = words.join(" ");
    const map: Record<string, string> = {
      void: "void", bool: "bool", boolean: "bool",
      char: "char", "signed char": "signed char", "unsigned char": "unsigned char", byte: "unsigned char", uint8_t: "unsigned char", int8_t: "signed char",
      short: "short", "short int": "short", "signed short": "short", "unsigned short": "unsigned short", "unsigned short int": "unsigned short",
      int16_t: "short", uint16_t: "unsigned short", word: "unsigned short",
      int: "int", signed: "int", "signed int": "int", unsigned: "unsigned int", "unsigned int": "unsigned int", size_t: "size_t",
      long: "long", "long int": "long", "signed long": "long", "unsigned long": "unsigned long", "unsigned long int": "unsigned long", "long unsigned int": "unsigned long",
      int32_t: "long", uint32_t: "unsigned long",
      float: "float", double: "double", "long double": "double",
      String: "String", Servo: "Servo", SoftwareSerial: "SoftwareSerial",
      LiquidCrystal_I2C: "LiquidCrystal_I2C", LiquidCrystal: "LiquidCrystal", Adafruit_SSD1306: "Adafruit_SSD1306", DHT: "DHT",
    };
    if (map[w]) return map[w];
    if (words.length === 1 && this.enumNames.has(w)) return `enum:${w}`;
    if (/long long/.test(w) || w === "int64_t" || w === "uint64_t") {
      this.unsupported(at, "64-bit integers (long long / int64_t) are not supported — use long or unsigned long (32-bit).");
    }
    return this.failAt(at, `Invalid type '${w}'`);
  }

  funcDecl(ret: TypeSpec, start: Token): FuncDecl {
    const name = this.next().value;
    this.expect("(");
    const params: Param[] = [];
    if (this.isId("void") && this.isP(")", this.peek())) this.next();
    else if (!this.isP(")")) {
      for (;;) {
        const pt = this.t;
        if (this.isP("...")) this.unsupported(pt, "Variadic functions (...) are not supported.");
        this.checkUnsupported(pt);
        if (!this.isTypeStart()) {
          if (pt.type === "ident") this.failAt(pt, `Unknown parameter type '${pt.value}'`, "UNSUPPORTED_FEATURE");
          this.failAt(pt, `Expected a parameter type but found '${pt.value}'`);
        }
        const type = this.typeSpec();
        let pname: string | null = null;
        if (this.t.type === "ident") pname = this.next().value;
        const dims: (Expr | null)[] = [];
        while (this.accept("[")) {
          if (this.accept("]")) { dims.push(null); continue; }
          dims.push(this.expression());
          this.expect("]");
        }
        if (this.isP("=")) this.unsupported(this.t, "Default parameter values are not supported — pass every argument explicitly.");
        params.push({ type, name: pname, dims, loc: this.locFrom(pt) });
        if (!this.accept(",")) break;
      }
    }
    this.expect(")", "to close the parameter list");
    if (this.isId("const")) this.unsupported(this.t, "Member functions are not supported.");
    if (this.accept(";")) {
      return { kind: "func", ret, name, params, body: null, loc: this.locFrom(start), endLoc: this.locFrom(this.toks[this.pos - 1]) };
    }
    if (!this.isP("{")) this.failAt(this.t, `Expected '{' to start the body of ${name}() but found '${this.t.value}'`);
    const body = this.blockBody();
    const endTok = this.toks[this.pos - 1];
    return { kind: "func", ret, name, params, body, loc: { line: start.line, col: start.col, start: start.start, end: endTok.end }, endLoc: this.locFrom(endTok) };
  }

  /** after the type spec: one or more declarators then ';' */
  declRest(type: TypeSpec, start: Token): VarDecl {
    const decls: Declarator[] = [];
    for (;;) {
      const nt = this.t;
      if (this.isP("*")) this.unsupported(nt, "Pointers (*) are not supported by the BEAST interpreter — use arrays or global variables instead.");
      if (this.isP("&")) this.unsupported(nt, "References (&) are not supported.");
      if (nt.type !== "ident") this.failAt(nt, `Expected a variable name but found '${nt.value}'`);
      this.checkUnsupported(nt);
      if (BASE_TYPE_WORDS.has(nt.value) || QUALIFIERS.has(nt.value)) this.failAt(nt, `'${nt.value}' is a type name and cannot be used as a variable name`);
      this.next();
      const dims: (Expr | null)[] = [];
      while (this.accept("[")) {
        if (this.accept("]")) { dims.push(null); continue; }
        dims.push(this.expression());
        this.expect("]", "to close the array size");
      }
      let init: Expr | null = null;
      let ctorArgs: Expr[] | null = null;
      if (this.accept("=")) {
        init = this.isP("{") ? this.initList() : this.assignment();
      } else if (this.isP("{")) {
        init = this.initList();
      } else if (this.isP("(")) {
        this.next();
        ctorArgs = [];
        if (!this.isP(")")) {
          for (;;) { ctorArgs.push(this.assignment()); if (!this.accept(",")) break; }
        }
        this.expect(")");
      }
      decls.push({ name: nt.value, dims, init, ctorArgs, loc: this.locFrom(nt) });
      if (this.accept(",")) continue;
      break;
    }
    this.expect(";", "declaration");
    return { kind: "vardecl", type, decls, loc: this.locFrom(start) };
  }

  initList(): Expr {
    const start = this.expect("{");
    const items: Expr[] = [];
    while (!this.isP("}")) {
      items.push(this.isP("{") ? this.initList() : this.assignment());
      if (!this.accept(",")) break;
    }
    this.expect("}", "to close the initialiser list");
    return { kind: "initlist", items, loc: this.locFrom(start) };
  }

  // ---------- statements ----------
  blockBody(): Stmt[] {
    this.expect("{");
    const body: Stmt[] = [];
    while (!this.isP("}")) {
      if (this.t.type === "eof") this.failAt(this.t, "Missing '}' — a block or function was not closed");
      const start = this.pos;
      try {
        body.push(this.statement());
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        if (this.diags.length > 50) throw e;
        if (this.pos === start) this.next();
        this.syncStmt();
      }
    }
    this.next();
    return body;
  }

  statement(): Stmt {
    const t = this.t;
    this.checkUnsupported(t);
    if (t.type === "punct") {
      if (t.value === "{") { const body = this.blockBody(); return { kind: "block", body, loc: this.locFrom(t) }; }
      if (t.value === ";") { this.next(); return { kind: "empty", loc: this.locFrom(t) }; }
    }
    if (t.type === "ident") {
      if (this.isP(":", this.peek()) && t.value !== "default" && t.value !== "case") {
        this.unsupported(t, "Statement labels and goto are not supported — use loops, break and continue instead.");
      }
      switch (t.value) {
        case "if": {
          this.next();
          this.expect("(", "after 'if'");
          const test = this.expression();
          this.expect(")", "to close the if condition");
          const then = this.statement();
          let els: Stmt | null = null;
          if (this.isId("else")) { this.next(); els = this.statement(); }
          return { kind: "if", test, then, else: els, loc: this.locFrom(t) };
        }
        case "while": {
          this.next();
          this.expect("(", "after 'while'");
          const test = this.expression();
          this.expect(")", "to close the while condition");
          const body = this.statement();
          return { kind: "while", test, body, loc: this.locFrom(t) };
        }
        case "do": {
          this.next();
          const body = this.statement();
          if (!this.isId("while")) this.failAt(this.t, "Expected 'while' after the do { … } body");
          this.next();
          this.expect("(");
          const test = this.expression();
          this.expect(")");
          this.expect(";", "do-while");
          return { kind: "dowhile", test, body, loc: this.locFrom(t) };
        }
        case "for": {
          this.next();
          this.expect("(", "after 'for'");
          let init: Stmt | null = null;
          if (!this.accept(";")) {
            const it = this.t;
            if (this.isTypeStart()) {
              const type = this.typeSpec();
              init = this.declRest(type, it);
            } else {
              const e = this.expression();
              this.expect(";", "for-loop initialiser");
              init = { kind: "expr", expr: e, loc: this.locFrom(it) };
            }
          }
          let test: Expr | null = null;
          if (!this.isP(";")) {
            if (this.isTypeStart()) this.unsupported(this.t, "Declarations inside a for-loop condition are not supported.");
            test = this.expression();
          }
          this.expect(";", "for-loop condition");
          let update: Expr | null = null;
          if (!this.isP(")")) update = this.expression();
          if (this.isP(":")) this.unsupported(this.t, "Range-based for loops (for (x : array)) are not supported — use an index.");
          this.expect(")", "to close the for header");
          const body = this.statement();
          return { kind: "for", init, test, update, body, loc: this.locFrom(t) };
        }
        case "switch": {
          this.next();
          this.expect("(", "after 'switch'");
          const disc = this.expression();
          this.expect(")");
          this.expect("{", "to open the switch body");
          const cases: { test: Expr | null; body: Stmt[]; loc: Loc }[] = [];
          while (!this.isP("}")) {
            const ct = this.t;
            if (this.isId("case")) {
              this.next();
              const test = this.conditional();
              if (this.isP("...")) this.unsupported(this.t, "Case ranges (case 1 ... 5:) are not supported — list each case.");
              this.expect(":", "after the case value");
              cases.push({ test, body: [], loc: this.locFrom(ct) });
              continue;
            }
            if (this.isId("default")) {
              this.next();
              this.expect(":", "after default");
              cases.push({ test: null, body: [], loc: this.locFrom(ct) });
              continue;
            }
            if (ct.type === "eof") this.failAt(ct, "Missing '}' at the end of the switch");
            if (!cases.length) this.failAt(ct, "Statements inside a switch must come after a 'case' or 'default' label");
            const start = this.pos;
            try {
              cases[cases.length - 1].body.push(this.statement());
            } catch (e) {
              if (!(e instanceof ParseError)) throw e;
              if (this.pos === start) this.next();
              this.syncStmt();
            }
          }
          this.next();
          return { kind: "switch", disc, cases, loc: this.locFrom(t) };
        }
        case "case":
        case "default":
          this.failAt(t, `'${t.value}' label outside of a switch`);
          break;
        case "else":
          this.failAt(t, "'else' without a matching 'if' (check for a stray ';' after the if condition or a missing '{')");
          break;
        case "break": this.next(); this.expect(";", "break"); return { kind: "break", loc: this.locFrom(t) };
        case "continue": this.next(); this.expect(";", "continue"); return { kind: "continue", loc: this.locFrom(t) };
        case "return": {
          this.next();
          let value: Expr | null = null;
          if (!this.isP(";")) value = this.expression();
          this.expect(";", "return statement");
          return { kind: "return", value, loc: this.locFrom(t) };
        }
        case "enum": {
          const e = this.enumDecl();
          if (this.accept(";")) return e;
          this.failAt(this.t, "Declare enum variables in a separate statement");
          break;
        }
      }
      if (this.isTypeStart() && !(this.isP("(", this.peek()) && BASE_TYPE_WORDS.has(t.value))) {
        const type = this.typeSpec();
        if (this.isP("(") ) this.failAt(this.t, "Functions cannot be defined inside other functions");
        if (this.t.type === "ident" && this.isP("(", this.peek()) && !["Servo", "SoftwareSerial", "String", "LiquidCrystal_I2C", "LiquidCrystal", "Adafruit_SSD1306", "DHT"].includes(type.base)) {
          // a function definition inside a function: usually a missing '}' further up
          let depth = 0;
          let k = this.pos + 1;
          for (; k < this.toks.length; k++) {
            const tk = this.toks[k];
            if (tk.type === "eof") break;
            if (this.isP("(", tk)) depth++;
            else if (this.isP(")", tk)) { depth--; if (depth === 0) break; }
          }
          if (this.isP("{", this.toks[Math.min(k + 1, this.toks.length - 1)])) {
            this.failAt(t, `Function ${this.t.value}() is defined inside another function — is a closing '}' missing above this line?`);
          }
        }
        return this.declRest(type, t);
      }
      if (this.peek().type === "ident" && !this.isTypeStart()) {
        this.failAt(t, `Unknown type '${t.value}'. Libraries/classes like '${t.value}' are not available in the BEAST interpreter.`, "UNSUPPORTED_FEATURE");
      }
    }
    const e = this.expression();
    this.expect(";", "statement");
    return { kind: "expr", expr: e, loc: this.locFrom(t) };
  }

  // ---------- expressions ----------
  expression(): Expr {
    const start = this.t;
    const first = this.assignment();
    if (!this.isP(",")) return first;
    const list = [first];
    while (this.accept(",")) list.push(this.assignment());
    return { kind: "comma", list, loc: this.locFrom(start) };
  }

  assignment(): Expr {
    const start = this.t;
    const left = this.conditional();
    if (this.t.type === "punct" && ASSIGN_OPS.has(this.t.value)) {
      const op = this.next().value;
      const value = this.isP("{") ? this.unsupported(this.t, "Assigning a { … } list is only allowed when declaring an array.") : this.assignment();
      return { kind: "assign", op, target: left, value, loc: this.locFrom(start) };
    }
    return left;
  }

  conditional(): Expr {
    const start = this.t;
    const test = this.binary(1);
    if (this.accept("?")) {
      const a = this.assignment();
      this.expect(":", "in the ?: expression");
      const b = this.assignment();
      return { kind: "cond", test, then: a, else: b, loc: this.locFrom(start) };
    }
    return test;
  }

  binary(minPrec: number): Expr {
    const start = this.t;
    let left = this.unary();
    for (;;) {
      const t = this.t;
      if (t.type !== "punct") break;
      const p = BIN_PREC[t.value];
      if (!p || p < minPrec) break;
      this.next();
      const right = this.binary(p + 1);
      left = { kind: "binary", op: t.value, left, right, loc: this.locFrom(start) };
    }
    return left;
  }

  unary(): Expr {
    const t = this.t;
    if (t.type === "punct") {
      switch (t.value) {
        case "++":
        case "--": {
          this.next();
          const arg = this.unary();
          return { kind: "update", op: t.value, prefix: true, arg, loc: this.locFrom(t) };
        }
        case "+": case "-": case "!": case "~": {
          this.next();
          const arg = this.unary();
          return { kind: "unary", op: t.value, arg, loc: this.locFrom(t) };
        }
        case "&":
          // the only address the simulator accepts: &Wire in display constructors, e.g. Adafruit_SSD1306 d(128, 64, &Wire, -1)
          if (this.peek().type === "ident" && this.peek().value === "Wire") {
            this.next();
            const w = this.next();
            return { kind: "num", value: 0, isFloat: false, suffix: "", radix: 10, text: "0", loc: this.locFrom(w) } as Expr;
          }
          this.unsupported(t, "Taking an address (&variable) needs pointers, which are not supported.");
          break;
        case "&&":
          this.unsupported(t, "Taking an address (&&) is not supported.");
          break;
        case "*":
          this.unsupported(t, "Dereferencing pointers (*p) is not supported.");
          break;
        case "(": {
          // cast?
          const n = this.peek();
          if (n.type === "ident" && (BASE_TYPE_WORDS.has(n.value) || this.enumNames.has(n.value) || n.value === "const")) {
            this.next();
            const type = this.typeSpec();
            this.expect(")", "to close the cast");
            const arg = this.unary();
            return { kind: "cast", type, arg, loc: this.locFrom(t) };
          }
          break;
        }
      }
    }
    if (this.isId("sizeof")) {
      this.next();
      if (this.isP("(") && this.peek().type === "ident" && (BASE_TYPE_WORDS.has(this.peek().value) || this.enumNames.has(this.peek().value))) {
        this.next();
        const type = this.typeSpec();
        this.expect(")");
        return { kind: "sizeof", type, loc: this.locFrom(t) };
      }
      const arg = this.unary();
      return { kind: "sizeof", arg, loc: this.locFrom(t) };
    }
    return this.postfix();
  }

  postfix(): Expr {
    const start = this.t;
    let e = this.primary();
    for (;;) {
      const t = this.t;
      if (t.type !== "punct") break;
      if (t.value === "[") {
        this.next();
        const index = this.expression();
        this.expect("]", "to close the array index");
        e = { kind: "index", obj: e, index, loc: this.locFrom(start) };
      } else if (t.value === "(") {
        this.next();
        const args: Expr[] = [];
        if (!this.isP(")")) {
          for (;;) {
            args.push(this.assignment());
            if (!this.accept(",")) break;
          }
        }
        this.expect(")", "to close the function call");
        e = { kind: "call", callee: e, args, loc: this.locFrom(start) };
      } else if (t.value === ".") {
        this.next();
        const n = this.t;
        if (n.type !== "ident") this.failAt(n, `Expected a member name after '.' but found '${n.value}'`);
        this.next();
        e = { kind: "member", obj: e, name: n.value, loc: this.locFrom(start) };
      } else if (t.value === "++" || t.value === "--") {
        this.next();
        e = { kind: "update", op: t.value, prefix: false, arg: e, loc: this.locFrom(start) };
      } else if (t.value === "->") {
        this.unsupported(t, "Pointers (->) are not supported.");
      } else if (t.value === "::") {
        this.unsupported(t, "Scope resolution (::) is not supported — classes and namespaces are not available.");
      } else break;
    }
    return e;
  }

  primary(): Expr {
    const t = this.t;
    switch (t.type) {
      case "num": {
        this.next();
        const floatSuffix = t.isFloat && t.suffix === "f";
        return { kind: "num", value: t.num ?? 0, isFloat: !!t.isFloat, suffix: t.isFloat ? "" : t.suffix ?? "", radix: t.radix ?? 10, text: t.value, floatSuffix, loc: this.locFrom(t) };
      }
      case "char":
        this.next();
        return { kind: "char", value: t.num ?? 0, loc: this.locFrom(t) };
      case "str": {
        this.next();
        let s = t.value;
        while (this.t.type === "str") s += this.next().value;
        return { kind: "str", value: s, loc: this.locFrom(t) };
      }
      case "ident": {
        this.checkUnsupported(t);
        if (t.value === "true" || t.value === "false") { this.next(); return { kind: "bool", value: t.value === "true", loc: this.locFrom(t) }; }
        if (t.value === "static_cast") {
          this.next();
          this.expect("<");
          const type = this.typeSpec();
          this.expect(">");
          this.expect("(");
          const arg = this.expression();
          this.expect(")");
          return { kind: "cast", type, arg, loc: this.locFrom(t) };
        }
        if ((BASE_TYPE_WORDS.has(t.value) || this.enumNames.has(t.value)) && this.isP("(", this.peek())) {
          // functional cast: int(x), float(x), String(x), byte(x)
          const type = this.typeSpec();
          this.expect("(");
          const args: Expr[] = [];
          if (!this.isP(")")) for (;;) { args.push(this.assignment()); if (!this.accept(",")) break; }
          this.expect(")");
          if (type.base === "String") {
            return { kind: "call", callee: { kind: "ident", name: "String", loc: type.loc }, args, loc: this.locFrom(t) };
          }
          if (args.length !== 1) this.failAt(t, `A ${type.base}(…) conversion takes exactly one value`);
          return { kind: "cast", type, arg: args[0], loc: this.locFrom(t) };
        }
        if (BASE_TYPE_WORDS.has(t.value) || QUALIFIERS.has(t.value)) {
          this.failAt(t, `Unexpected type '${t.value}' here — declarations must be statements of their own`);
        }
        this.next();
        return { kind: "ident", name: t.value, loc: this.locFrom(t) };
      }
      case "punct":
        if (t.value === "(") {
          this.next();
          const e = this.expression();
          this.expect(")", "to close the parenthesis");
          return e;
        }
        if (t.value === "[") this.unsupported(t, "Lambdas are not supported.");
        if (t.value === "{") this.failAt(t, "A { … } list can only be used to initialise an array in its declaration");
        break;
      case "eof":
        this.failAt(t, "Unexpected end of file — is a '}' or ')' missing?");
    }
    return this.failAt(t, `Unexpected '${t.value}'`);
  }
}
