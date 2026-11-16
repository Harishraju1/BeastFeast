/** AST for the BEAST Arduino C/C++ subset. */

export interface Loc {
  line: number;
  col: number;
  start: number; // source offset of first token
  end: number; // source offset after last token
}

/** A parsed type specifier (before semantic resolution). */
export interface TypeSpec {
  base: string; // "int", "long", "unsigned long", "float", "String", "Servo", "enum:Name", "cstr", ...
  isConst: boolean;
  isStatic: boolean;
  isVolatile: boolean;
  loc: Loc;
}

export type Expr =
  | { kind: "num"; value: number; isFloat: boolean; suffix: string; radix: number; text: string; floatSuffix?: boolean; loc: Loc }
  | { kind: "char"; value: number; loc: Loc }
  | { kind: "str"; value: string; loc: Loc }
  | { kind: "bool"; value: boolean; loc: Loc }
  | { kind: "ident"; name: string; loc: Loc }
  | { kind: "unary"; op: string; arg: Expr; loc: Loc }
  | { kind: "update"; op: "++" | "--"; prefix: boolean; arg: Expr; loc: Loc }
  | { kind: "binary"; op: string; left: Expr; right: Expr; loc: Loc }
  | { kind: "assign"; op: string; target: Expr; value: Expr; loc: Loc }
  | { kind: "cond"; test: Expr; then: Expr; else: Expr; loc: Loc }
  | { kind: "call"; callee: Expr; args: Expr[]; loc: Loc }
  | { kind: "index"; obj: Expr; index: Expr; loc: Loc }
  | { kind: "member"; obj: Expr; name: string; loc: Loc }
  | { kind: "cast"; type: TypeSpec; arg: Expr; loc: Loc }
  | { kind: "sizeof"; type?: TypeSpec; arg?: Expr; loc: Loc }
  | { kind: "comma"; list: Expr[]; loc: Loc }
  | { kind: "initlist"; items: Expr[]; loc: Loc };

export interface Declarator {
  name: string;
  dims: (Expr | null)[]; // array dimensions; null = [] (size from initialiser)
  init: Expr | null; // may be an initlist
  ctorArgs: Expr[] | null; // Servo s(…) / SoftwareSerial ss(2,3)
  loc: Loc;
}

export interface VarDecl {
  kind: "vardecl";
  type: TypeSpec;
  decls: Declarator[];
  loc: Loc;
}

export interface Param {
  type: TypeSpec;
  name: string | null;
  dims: (Expr | null)[];
  loc: Loc;
}

export interface FuncDecl {
  kind: "func";
  ret: TypeSpec;
  name: string;
  params: Param[];
  body: Stmt[] | null; // null = prototype
  loc: Loc;
  endLoc: Loc;
}

export interface EnumDecl {
  kind: "enum";
  name: string | null;
  members: { name: string; value: Expr | null; loc: Loc }[];
  loc: Loc;
}

export type Stmt =
  | VarDecl
  | EnumDecl
  | { kind: "expr"; expr: Expr; loc: Loc }
  | { kind: "block"; body: Stmt[]; loc: Loc }
  | { kind: "if"; test: Expr; then: Stmt; else: Stmt | null; loc: Loc }
  | { kind: "while"; test: Expr; body: Stmt; loc: Loc }
  | { kind: "dowhile"; test: Expr; body: Stmt; loc: Loc }
  | { kind: "for"; init: Stmt | null; test: Expr | null; update: Expr | null; body: Stmt; loc: Loc }
  | { kind: "switch"; disc: Expr; cases: { test: Expr | null; body: Stmt[]; loc: Loc }[]; loc: Loc }
  | { kind: "break"; loc: Loc }
  | { kind: "continue"; loc: Loc }
  | { kind: "return"; value: Expr | null; loc: Loc }
  | { kind: "empty"; loc: Loc };

export type TopLevel = VarDecl | FuncDecl | EnumDecl;

export interface ProgramAST {
  items: TopLevel[];
}
