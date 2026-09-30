import { Asm, F64, I32, OP, WasmModule } from "./wasm-module.ts";
import { type Engine, type Val, cloneVal, matrix, scalar, valData } from "./engine.ts";

export class MatlabError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatlabError";
  }
}

type Expr =
  | { k: "num"; v: number }
  | { k: "name"; s: string }
  | { k: "unary"; op: "-"; a: Expr }
  | { k: "bin"; op: string; a: Expr; b: Expr }
  | { k: "trans"; a: Expr }
  | { k: "call"; name: string; args: Expr[] }
  | { k: "mat"; rows: Expr[][] }
  | { k: "colon"; a: Expr; step: Expr | null; b: Expr };

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; s: string }
  | { t: "op"; s: string }
  | { t: "sp" }
  | { t: "nl" }
  | { t: "eof" };

type Stmt = { assign: string | null; expr: Expr; silent: boolean };

const SINGLES = new Set(["+", "-", "*", "/", "\\", "^", "(", ")", "[", "]", ";", ",", "'", "=", ":"]);

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  const groups: Array<"s" | "p"> = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === "%") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "\n") {
      out.push({ t: "nl" });
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      while (i < src.length && (src[i] === " " || src[i] === "\t" || src[i] === "\r")) i++;
      if (groups[groups.length - 1] === "s") out.push({ t: "sp" });
      continue;
    }
    if (c === "." && i + 1 < src.length && "*\\/^'".includes(src[i + 1]!)) {
      out.push({ t: "op", s: src.slice(i, i + 2) });
      i += 2;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^((?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(src.slice(i));
      if (m && m[1] && /\d/.test(m[1])) {
        out.push({ t: "num", v: Number(m[1]) });
        i += m[1].length;
        continue;
      }
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      const s = m?.[0] ?? c;
      out.push({ t: "id", s });
      i += s.length;
      continue;
    }
    if (c === "(") groups.push("p");
    else if (c === "[") groups.push("s");
    else if (c === ")") {
      if (groups[groups.length - 1] === "p") groups.pop();
    } else if (c === "]") {
      if (groups[groups.length - 1] === "s") groups.pop();
    }
    if (SINGLES.has(c)) {
      out.push({ t: "op", s: c });
      i++;
      continue;
    }
    throw new MatlabError("Syntax Error");
  }
  out.push({ t: "eof" });
  return out;
}

class Parser {
  private i = 0;
  private toks: Tok[];

  constructor(toks: Tok[]) {
    this.toks = toks;
  }

  private peek(): Tok {
    return this.toks[this.i] ?? { t: "eof" };
  }

  private eat(kind: Tok["t"], op?: string): boolean {
    const p = this.peek();
    if (p.t !== kind) return false;
    if (op !== undefined && (p.t !== "op" || p.s !== op)) return false;
    this.i++;
    return true;
  }

  private skipGap(matrix: boolean) {
    while (true) {
      const p = this.peek();
      if (p.t === "nl" && !matrix) this.i++;
      else break;
    }
  }

  parseScript(): Stmt[] {
    const stmts: Stmt[] = [];
    this.skipGap(false);
    while (this.peek().t !== "eof") {
      if (this.eat("op", ";") || this.eat("nl")) continue;
      const stmt = this.parseStmt();
      stmt.silent = this.eat("op", ";");
      while (this.eat("op", ";")) stmt.silent = true;
      stmts.push(stmt);
      this.skipGap(false);
    }
    return stmts;
  }

  private parseStmt(): Stmt {
    const p = this.peek();
    const n = this.toks[this.i + 1];
    if (p.t === "id" && n?.t === "op" && n.s === "=") {
      this.i += 2;
      return { assign: p.s, expr: this.parseExpr(false), silent: false };
    }
    return { assign: null, expr: this.parseExpr(false), silent: false };
  }

  private parseExpr(matrix: boolean): Expr {
    this.skipGap(matrix);
    let a = this.parseSum(matrix);
    if (!matrix && this.eat("op", ":")) {
      const mid = this.parseSum(matrix);
      if (this.eat("op", ":")) return { k: "colon", a, step: mid, b: this.parseSum(matrix) };
      return { k: "colon", a, step: null, b: mid };
    }
    if (matrix && this.peek().t === "op" && this.peek().t === "op") {
      const op = this.peek();
      if (op.t === "op" && op.s === ":") {
        this.i++;
        const mid = this.parseSum(matrix);
        if (this.peek().t === "op" && (this.peek() as { s: string }).s === ":") {
          this.i++;
          return { k: "colon", a, step: mid, b: this.parseSum(matrix) };
        }
        return { k: "colon", a, step: null, b: mid };
      }
    }
    return a;
  }

  private parseSum(matrix: boolean): Expr {
    let left = this.parseMul(matrix);
    while (true) {
      if (matrix && (this.peek().t === "sp" || this.peek().t === "nl")) break;
      this.skipGap(matrix);
      if (matrix && this.peek().t === "sp") break;
      const p = this.peek();
      if (p.t === "op" && (p.s === "+" || p.s === "-")) {
        this.i++;
        while (this.peek().t === "sp") this.i++;
        left = { k: "bin", op: p.s, a: left, b: this.parseMul(matrix) };
        continue;
      }
      break;
    }
    return left;
  }

  private parseMul(matrix: boolean): Expr {
    let left = this.parseUnary(matrix);
    while (true) {
      if (matrix && (this.peek().t === "sp" || this.peek().t === "nl")) break;
      this.skipGap(matrix);
      const p = this.peek();
      if (p.t === "op" && ["*", "/", "\\", ".*", "./", ".\\"].includes(p.s)) {
        this.i++;
        while (this.peek().t === "sp") this.i++;
        left = { k: "bin", op: p.s, a: left, b: this.parseUnary(matrix) };
        continue;
      }
      break;
    }
    return left;
  }

  private parseUnary(matrix: boolean): Expr {
    if (matrix && this.peek().t === "sp") throw new MatlabError("Syntax Error");
    this.skipGap(matrix);
    const p = this.peek();
    if (p.t === "op" && p.s === "+") {
      this.i++;
      while (this.peek().t === "sp") this.i++;
      return this.parseUnary(matrix);
    }
    if (p.t === "op" && p.s === "-") {
      this.i++;
      while (this.peek().t === "sp") this.i++;
      return { k: "unary", op: "-", a: this.parseUnary(matrix) };
    }
    return this.parsePow(matrix);
  }

  private parsePow(matrix: boolean): Expr {
    const base = this.parsePostfix(matrix);
    const p = this.peek();
    if (p.t === "op" && (p.s === "^" || p.s === ".^")) {
      this.i++;
      return { k: "bin", op: p.s, a: base, b: this.parseUnary(matrix) };
    }
    return base;
  }

  private parsePostfix(matrix: boolean): Expr {
    let a = this.parsePrimary(matrix);
    while (true) {
      const p = this.peek();
      if (p.t === "op" && (p.s === "'" || p.s === ".'")) {
        this.i++;
        a = { k: "trans", a };
        continue;
      }
      break;
    }
    return a;
  }

  private parsePrimary(matrix: boolean): Expr {
    this.skipGap(matrix);
    const p = this.peek();
    if (p.t === "num") {
      this.i++;
      return { k: "num", v: p.v };
    }
    if (p.t === "id") {
      this.i++;
      if (this.peek().t === "op" && (this.peek() as { s: string }).s === "(") {
        this.i++;
        const args: Expr[] = [];
        this.skipGap(false);
        if (!(this.peek().t === "op" && (this.peek() as { s: string }).s === ")")) {
          while (true) {
            args.push(this.parseExpr(false));
            this.skipGap(false);
            if (this.eat("op", ",")) {
              this.skipGap(false);
              continue;
            }
            break;
          }
        }
        if (!this.eat("op", ")")) throw new MatlabError("Syntax Error");
        return { k: "call", name: p.s, args };
      }
      return { k: "name", s: p.s };
    }
    if (p.t === "op" && p.s === "(") {
      this.i++;
      const e = this.parseExpr(false);
      if (!this.eat("op", ")")) throw new MatlabError("Syntax Error");
      return e;
    }
    if (p.t === "op" && p.s === "[") return this.parseMatrix();
    throw new MatlabError("Syntax Error");
  }

  private parseMatrix(): Expr {
    if (!this.eat("op", "[")) throw new MatlabError("Syntax Error");
    const rows: Expr[][] = [];
    let row: Expr[] = [];
    const flush = () => {
      if (row.length) rows.push(row);
      row = [];
    };
    while (true) {
      while (this.peek().t === "nl" || this.peek().t === "sp") {
        if (this.peek().t === "nl") flush();
        this.i++;
      }
      if (this.eat("op", "]")) break;
      if (this.eat("op", ";")) {
        flush();
        continue;
      }
      if (this.peek().t === "eof") throw new MatlabError("Syntax Error");
      row.push(this.parseExpr(true));
      if (this.eat("sp")) {
        while (this.eat("sp")) {}
        continue;
      }
      if (this.eat("op", ",")) {
        while (this.eat("sp")) {}
        continue;
      }
    }
    flush();
    if (!rows.length) throw new MatlabError("Empty Matrix");
    return { k: "mat", rows };
  }
}

function getVar(scope: Map<string, Val>, name: string): Val | undefined {
  if (scope.has(name)) return scope.get(name);
  if (name === "pi") return scalar(Math.PI);
  if (name === "e") return scalar(Math.E);
  return undefined;
}

type Slot = { ptr: number; r: number; c: number };

const UNOP: Record<string, number> = {
  sin: 0,
  cos: 1,
  tan: 2,
  asin: 3,
  acos: 4,
  atan: 5,
  sinh: 6,
  cosh: 7,
  tanh: 8,
  exp: 9,
  log: 10,
  ln: 10,
  log10: 11,
  sqrt: 12,
  abs: 13,
  floor: 14,
  ceil: 15,
  round: 16,
};

type ImportSpec = { name: string; params: number[]; results: number[] };

const IMPORTS: ImportSpec[] = [
  { name: "dgemm", params: [I32, I32, I32, F64, I32, I32, I32, I32, F64, I32, I32], results: [] },
  { name: "blit", params: [I32, I32, I32, I32, I32, I32, I32], results: [] },
  { name: "transpose", params: [I32, I32, I32, I32, I32, I32], results: [] },
  { name: "ew_unop", params: [I32, I32, I32, I32], results: [] },
  { name: "ew_binop", params: [I32, I32, I32, I32, I32], results: [] },
  { name: "add_scalar", params: [I32, I32, F64, I32], results: [] },
  { name: "scale_copy", params: [I32, F64, I32, I32], results: [] },
  { name: "fill", params: [I32, I32, F64], results: [] },
  { name: "eye", params: [I32, I32, I32], results: [] },
  { name: "range_row", params: [F64, F64, I32, I32], results: [] },
  { name: "sum_all", params: [I32, I32], results: [F64] },
  { name: "sum_cols", params: [I32, I32, I32, I32], results: [] },
  { name: "trace", params: [I32, I32], results: [F64] },
  { name: "diag_of", params: [I32, I32, I32, I32], results: [I32] },
  { name: "diag_mat", params: [I32, I32, I32], results: [] },
  { name: "cross3", params: [I32, I32, I32], results: [] },
  { name: "inv", params: [I32, I32, I32], results: [I32] },
  { name: "det", params: [I32, I32], results: [F64] },
  { name: "ddot", params: [I32, I32, I32, I32, I32], results: [F64] },
  { name: "dnrm2", params: [I32, I32, I32], results: [F64] },
];

class Compiler {
  private asm = new Asm();
  private lines: string[] = [];
  private fn = new Map<string, number>();
  private mod = new WasmModule();
  private engine: Engine;
  private scope: Map<string, Val>;

  constructor(engine: Engine, scope: Map<string, Val>) {
    this.engine = engine;
    this.scope = scope;
    for (const spec of IMPORTS) {
      const type = this.mod.addType(spec.params, spec.results);
      this.fn.set(spec.name, this.mod.addImport("blas", spec.name, type));
    }
    this.mod.addMemoryImport("env", "memory", 1);
  }

  private fail(message: string): never {
    throw new MatlabError(message);
  }

  private alloc(n: number): number {
    if (n <= 0) this.fail("Empty Matrix");
    if (n > 4096) this.fail("Expression too large");
    return this.engine.alloc(n);
  }

  private line(text: string) {
    this.lines.push(`  ${text}`);
  }

  private call(name: string) {
    const idx = this.fn.get(name);
    if (idx === undefined) this.fail("Bad Size");
    this.asm.call(idx);
    this.line(`call $${name}`);
  }

  private storeScalar(ptr: number, value: number) {
    this.asm.i32(ptr);
    this.asm.f64(value);
    this.asm.f64Store();
    this.line(`f64.store ${ptr} ${value}`);
  }

  private storeMatrix(ptr: number, data: Float64Array) {
    for (let i = 0; i < data.length; i++) this.storeScalar(ptr + i * 8, data[i] ?? 0);
  }

  private loadPush(ptr: number) {
    this.asm.i32(ptr);
    this.asm.f64Load();
  }

  private slotFromVal(v: Val): Slot {
    const raw = valData(v);
    const ptr = this.alloc(raw.r * raw.c);
    this.storeMatrix(ptr, raw.d);
    return { ptr, r: raw.r, c: raw.c };
  }

  private emit(e: Expr): Slot {
    switch (e.k) {
      case "num":
        return this.slotFromVal(scalar(e.v));
      case "name": {
        const v = getVar(this.scope, e.s);
        if (!v) this.fail(`Undefined Name '${e.s}'`);
        return this.slotFromVal(v);
      }
      case "unary": {
        const a = this.emit(e.a);
        return this.unop(a, 17);
      }
      case "trans":
        return this.transpose(this.emit(e.a));
      case "colon":
        return this.colon(e);
      case "mat":
        return this.matrix(e.rows);
      case "call":
        return this.callFn(e.name, e.args);
      case "bin":
        return this.bin(e.op, this.emit(e.a), e.b, e);
      default:
        this.fail("Syntax Error");
    }
  }

  private bin(op: string, a: Slot, rhs: Expr, full: Expr): Slot {
    if ((op === "^" || op === ".^") && !(a.r === 1 && a.c === 1) && op === "^") {
      const n = foldScalar(rhs, this.scope);
      if (n === null) this.fail("Exponent must be scalar");
      return this.matpow(a, n);
    }
    const b = this.emit(rhs);
    if (op === "^" || op === ".^") {
      if (op === "^" && a.r === 1 && a.c === 1 && b.r === 1 && b.c === 1) return this.ew(a, b, 4);
      if (op === ".^") return this.ewBroadcast(a, b, 4);
      this.fail("Non-integer Power");
    }
    if (op === "+") return this.add(a, b, 1);
    if (op === "-") return this.add(a, b, -1);
    if (op === "*") return this.mul(a, b);
    if (op === "/") return this.div(a, b);
    if (op === "\\") return this.ldiv(a, b);
    if (op === ".*") return this.ewBroadcast(a, b, 2);
    if (op === "./") return this.ewBroadcast(a, b, 3);
    if (op === ".\\") return this.ewBroadcast(b, a, 3);
    void full;
    this.fail("Syntax Error");
  }

  private add(a: Slot, b: Slot, sign: 1 | -1): Slot {
    if (a.r === b.r && a.c === b.c) {
      if (sign === 1) return this.ew(a, b, 0);
      const neg = this.unop(b, 17);
      return this.ew(a, neg, 0);
    }
    if (b.r === 1 && b.c === 1) return this.addScalar(a, b, sign);
    if (a.r === 1 && a.c === 1 && sign === 1) return this.addScalar(b, a, 1);
    if (a.r === 1 && a.c === 1 && sign === -1) {
      const neg = this.unop(b, 17);
      return this.addScalar(neg, a, 1);
    }
    this.fail("Size Mismatch");
  }

  private addScalar(matrixSlot: Slot, scalarSlot: Slot, sign: 1 | -1): Slot {
    const n = matrixSlot.r * matrixSlot.c;
    const dest = this.alloc(n);
    this.asm.i32(n);
    this.asm.i32(matrixSlot.ptr);
    this.loadPush(scalarSlot.ptr);
    if (sign < 0) this.asm.op(OP.f64Neg);
    this.asm.i32(dest);
    this.call("add_scalar");
    return { ptr: dest, r: matrixSlot.r, c: matrixSlot.c };
  }

  private mul(a: Slot, b: Slot): Slot {
    if (a.r === 1 && a.c === 1 && !(b.r === 1 && b.c === 1)) return this.scale(b, a);
    if (b.r === 1 && b.c === 1 && !(a.r === 1 && a.c === 1)) return this.scale(a, b);
    if (a.c !== b.r) this.fail("Size Mismatch");
    return this.gemm(a, b);
  }

  private scale(mat: Slot, factor: Slot): Slot {
    const n = mat.r * mat.c;
    const dest = this.alloc(n);
    this.asm.i32(n);
    this.loadPush(factor.ptr);
    this.asm.i32(mat.ptr);
    this.asm.i32(dest);
    this.call("scale_copy");
    return { ptr: dest, r: mat.r, c: mat.c };
  }

  private gemm(a: Slot, b: Slot): Slot {
    const dest = this.alloc(a.r * b.c);
    this.asm.i32(a.r);
    this.asm.i32(b.c);
    this.asm.i32(a.c);
    this.asm.f64(1);
    this.asm.i32(a.ptr);
    this.asm.i32(a.r);
    this.asm.i32(b.ptr);
    this.asm.i32(b.r);
    this.asm.f64(0);
    this.asm.i32(dest);
    this.asm.i32(a.r);
    this.line(`;; DGEMM ${a.r}×${a.c} * ${b.r}×${b.c}`);
    this.call("dgemm");
    return { ptr: dest, r: a.r, c: b.c };
  }

  private div(a: Slot, b: Slot): Slot {
    if (b.r === 1 && b.c === 1) {
      const invs = this.unop(b, 18);
      if (a.r === 1 && a.c === 1) return this.ew(a, invs, 2);
      return this.scale(a, invs);
    }
    if (b.r !== b.c) this.fail("Size Mismatch");
    const ib = this.inverse(b);
    if (a.r === 1 && a.c === 1) return this.scale(ib, a);
    if (a.c !== ib.r) this.fail("Size Mismatch");
    return this.gemm(a, ib);
  }

  private ldiv(a: Slot, b: Slot): Slot {
    if (a.r === 1 && a.c === 1 && b.r === 1 && b.c === 1) return this.ew(b, this.unop(a, 18), 2);
    if (a.r !== a.c) this.fail("Size Mismatch");
    const ia = this.inverse(a);
    if (b.r === 1 && b.c === 1) return this.scale(ia, b);
    if (ia.c !== b.r) this.fail("Size Mismatch");
    return this.gemm(ia, b);
  }

  private inverse(a: Slot): Slot {
    if (a.r !== a.c) this.fail("Size Mismatch");
    if (a.r > 16) this.fail("Bad Size");
    const dest = this.alloc(a.r * a.c);
    this.asm.i32(a.r);
    this.asm.i32(a.ptr);
    this.asm.i32(dest);
    this.call("inv");
    this.asm.i32(0);
    this.asm.op(OP.i32Ne);
    this.asm.op(OP.if);
    this.asm.u8(0x40);
    this.asm.i32(1);
    this.asm.op(OP.return);
    this.asm.end();
    this.line(";; check singular");
    return { ptr: dest, r: a.r, c: a.c };
  }

  private ew(a: Slot, b: Slot, op: number): Slot {
    if (a.r !== b.r || a.c !== b.c) this.fail("Size Mismatch");
    const n = a.r * a.c;
    const dest = this.alloc(n);
    this.asm.i32(n);
    this.asm.i32(a.ptr);
    this.asm.i32(b.ptr);
    this.asm.i32(dest);
    this.asm.i32(op);
    this.call("ew_binop");
    return { ptr: dest, r: a.r, c: a.c };
  }

  private ewBroadcast(a: Slot, b: Slot, op: number): Slot {
    const [x, y] = this.pair(a, b);
    return this.ew(x, y, op);
  }

  private pair(a: Slot, b: Slot): [Slot, Slot] {
    if (a.r === b.r && a.c === b.c) return [a, b];
    if (a.r === 1 && a.c === 1) return [this.splat(a, b.r, b.c), b];
    if (b.r === 1 && b.c === 1) return [a, this.splat(b, a.r, a.c)];
    this.fail("Size Mismatch");
  }

  private splat(scalarSlot: Slot, r: number, c: number): Slot {
    const dest = this.alloc(r * c);
    this.asm.i32(r * c);
    this.asm.i32(dest);
    this.loadPush(scalarSlot.ptr);
    this.call("fill");
    return { ptr: dest, r, c };
  }

  private unop(a: Slot, op: number): Slot {
    const n = a.r * a.c;
    const dest = this.alloc(n);
    this.asm.i32(n);
    this.asm.i32(a.ptr);
    this.asm.i32(dest);
    this.asm.i32(op);
    this.call("ew_unop");
    return { ptr: dest, r: a.r, c: a.c };
  }

  private transpose(a: Slot): Slot {
    if (a.r === 1 && a.c === 1) return a;
    const dest = this.alloc(a.r * a.c);
    this.asm.i32(a.r);
    this.asm.i32(a.c);
    this.asm.i32(a.ptr);
    this.asm.i32(a.r);
    this.asm.i32(dest);
    this.asm.i32(a.c);
    this.call("transpose");
    return { ptr: dest, r: a.c, c: a.r };
  }

  private matpow(base: Slot, exp: number): Slot {
    if (base.r !== base.c) this.fail("Size Mismatch");
    const p = Math.round(exp);
    if (Math.abs(exp - p) > 1e-8) this.fail("Non-integer Power");
    if (Math.abs(p) > 12) this.fail("Exponent Too Large");
    if (p < 0) return this.matpow(this.inverse(base), -p);
    if (p === 0) return this.eye(base.r, base.r);
    let acc = base;
    for (let i = 1; i < p; i++) acc = this.gemm(acc, base);
    return acc;
  }

  private eye(rows: number, cols: number): Slot {
    const dest = this.alloc(rows * cols);
    this.asm.i32(rows);
    this.asm.i32(cols);
    this.asm.i32(dest);
    this.call("eye");
    return { ptr: dest, r: rows, c: cols };
  }

  private fill(rows: number, cols: number, value: number): Slot {
    const dest = this.alloc(rows * cols);
    this.asm.i32(rows * cols);
    this.asm.i32(dest);
    this.asm.f64(value);
    this.call("fill");
    return { ptr: dest, r: rows, c: cols };
  }

  private colon(e: Extract<Expr, { k: "colon" }>): Slot {
    const start = foldScalar(e.a, this.scope);
    const end = foldScalar(e.b, this.scope);
    const step = e.step ? foldScalar(e.step, this.scope) : 1;
    if (start === null || end === null || step === null) this.fail("Size must be scalar");
    if (step === 0) this.fail("Empty Range");
    if ((step > 0 && start > end) || (step < 0 && start < end)) this.fail("Empty Range");
    const n = Math.floor((end - start) / step + 1e-9) + 1;
    if (n <= 0 || n > 256) this.fail(n > 256 ? "Bad Size" : "Empty Range");
    const dest = this.alloc(n);
    this.asm.f64(start);
    this.asm.f64(step);
    this.asm.i32(n);
    this.asm.i32(dest);
    this.call("range_row");
    return { ptr: dest, r: 1, c: n };
  }

  private matrix(rows: Expr[][]): Slot {
    const built: Slot[][] = rows.map((row) => row.map((cell) => this.emit(cell)));
    const hrows = built.map((row) => this.hcat(row));
    return this.vcat(hrows);
  }

  private hcat(parts: Slot[]): Slot {
    if (!parts.length) this.fail("Empty Matrix");
    const r = parts[0]!.r;
    if (parts.some((p) => p.r !== r)) this.fail("Size Mismatch");
    const c = parts.reduce((s, p) => s + p.c, 0);
    if (parts.length === 1) return parts[0]!;
    const dest = this.alloc(r * c);
    let col = 0;
    for (const p of parts) {
      this.blit(p, dest, r, 0, col);
      col += p.c;
    }
    return { ptr: dest, r, c };
  }

  private vcat(parts: Slot[]): Slot {
    if (!parts.length) this.fail("Empty Matrix");
    const c = parts[0]!.c;
    if (parts.some((p) => p.c !== c)) this.fail("Size Mismatch");
    const r = parts.reduce((s, p) => s + p.r, 0);
    if (parts.length === 1) return parts[0]!;
    const dest = this.alloc(r * c);
    let row = 0;
    for (const p of parts) {
      this.blit(p, dest, r, row, 0);
      row += p.r;
    }
    return { ptr: dest, r, c };
  }

  private blit(src: Slot, dest: number, destRows: number, rowOff: number, colOff: number) {
    this.asm.i32(src.r);
    this.asm.i32(src.c);
    this.asm.i32(src.ptr);
    this.asm.i32(dest);
    this.asm.i32(destRows);
    this.asm.i32(rowOff);
    this.asm.i32(colOff);
    this.call("blit");
  }

  private asInt(e: Expr, label: string): number {
    const n = foldScalar(e, this.scope);
    if (n === null || !Number.isFinite(n) || Math.abs(n - Math.round(n)) > 1e-8) this.fail(label);
    return Math.round(n);
  }

  private callFn(name: string, args: Expr[]): Slot {
    const id = name.toLowerCase();
    if (id in UNOP) {
      if (args.length !== 1) this.fail("Too Few Arguments");
      return this.unop(this.emit(args[0]!), UNOP[id]!);
    }
    if (id === "eye" || id === "zeros" || id === "ones") {
      if (args.length < 1 || args.length > 2) this.fail("Too Few Arguments");
      const r = this.asInt(args[0]!, "Bad Size");
      const c = args.length === 2 ? this.asInt(args[1]!, "Bad Size") : r;
      if (r < 1 || c < 1 || r > 16 || c > 16) this.fail("Bad Size");
      if (id === "eye") return this.eye(r, c);
      return this.fill(r, c, id === "ones" ? 1 : 0);
    }
    if (id === "inv" || id === "transpose") {
      if (args.length !== 1) this.fail("Too Few Arguments");
      const a = this.emit(args[0]!);
      return id === "inv" ? this.inverse(a) : this.transpose(a);
    }
    if (id === "det" || id === "trace") {
      if (args.length !== 1) this.fail("Too Few Arguments");
      const a = this.emit(args[0]!);
      if (a.r !== a.c) this.fail("Size Mismatch");
      const dest = this.alloc(1);
      this.asm.i32(dest);
      this.asm.i32(a.r);
      this.asm.i32(a.ptr);
      this.call(id === "det" ? "det" : "trace");
      this.asm.f64Store();
      this.line(`f64.store result of ${id}`);
      return { ptr: dest, r: 1, c: 1 };
    }
    if (id === "norm") {
      if (args.length !== 1) this.fail("Too Few Arguments");
      const a = this.emit(args[0]!);
      const dest = this.alloc(1);
      this.asm.i32(dest);
      this.asm.i32(a.r * a.c);
      this.asm.i32(a.ptr);
      this.asm.i32(1);
      this.call("dnrm2");
      this.asm.f64Store();
      return { ptr: dest, r: 1, c: 1 };
    }
    if (id === "dot") {
      if (args.length !== 2) this.fail("Too Few Arguments");
      const a = this.emit(args[0]!);
      const b = this.emit(args[1]!);
      const n = a.r * a.c;
      if (n !== b.r * b.c) this.fail("Size Mismatch");
      const dest = this.alloc(1);
      this.asm.i32(dest);
      this.asm.i32(n);
      this.asm.i32(a.ptr);
      this.asm.i32(1);
      this.asm.i32(b.ptr);
      this.asm.i32(1);
      this.call("ddot");
      this.asm.f64Store();
      return { ptr: dest, r: 1, c: 1 };
    }
    if (id === "cross") {
      if (args.length !== 2) this.fail("Too Few Arguments");
      const a = this.emit(args[0]!);
      const b = this.emit(args[1]!);
      if (a.r * a.c !== 3 || b.r * b.c !== 3) this.fail("Size Mismatch");
      const dest = this.alloc(3);
      this.asm.i32(a.ptr);
      this.asm.i32(b.ptr);
      this.asm.i32(dest);
      this.call("cross3");
      return { ptr: dest, r: 3, c: 1 };
    }
    if (id === "sum") {
      if (args.length !== 1) this.fail("Too Few Arguments");
      const a = this.emit(args[0]!);
      if (a.r === 1 || a.c === 1) {
        const dest = this.alloc(1);
        this.asm.i32(dest);
        this.asm.i32(a.r * a.c);
        this.asm.i32(a.ptr);
        this.call("sum_all");
        this.asm.f64Store();
        return { ptr: dest, r: 1, c: 1 };
      }
      const dest = this.alloc(a.c);
      this.asm.i32(a.r);
      this.asm.i32(a.c);
      this.asm.i32(a.ptr);
      this.asm.i32(dest);
      this.call("sum_cols");
      return { ptr: dest, r: 1, c: a.c };
    }
    if (id === "diag") {
      if (args.length !== 1) this.fail("Too Few Arguments");
      const a = this.emit(args[0]!);
      if (a.r === 1 || a.c === 1) {
        const n = a.r * a.c;
        if (n > 16) this.fail("Bad Size");
        const dest = this.alloc(n * n);
        this.asm.i32(n);
        this.asm.i32(a.ptr);
        this.asm.i32(dest);
        this.call("diag_mat");
        return { ptr: dest, r: n, c: n };
      }
      const len = Math.min(a.r, a.c);
      const dest = this.alloc(len);
      this.asm.i32(a.r);
      this.asm.i32(a.c);
      this.asm.i32(a.ptr);
      this.asm.i32(dest);
      this.call("diag_of");
      this.asm.op(OP.drop);
      return { ptr: dest, r: len, c: 1 };
    }
    if (id === "size") {
      if (args.length !== 1) this.fail("Too Few Arguments");
      const a = this.emit(args[0]!);
      const dest = this.alloc(2);
      this.storeScalar(dest, a.r);
      this.storeScalar(dest + 8, a.c);
      return { ptr: dest, r: 1, c: 2 };
    }
    this.fail(`Undefined Function '${name}'`);
  }

  finish(expr: Expr): { bytes: Uint8Array; listing: string; slot: Slot } {
    const slot = this.emit(expr);
    this.asm.i32(0);
    this.asm.end();
    const type = this.mod.addType([], [I32]);
    const fn = this.mod.addFunc(type, [], this.asm.buf);
    this.mod.exportFunc("run", fn);
    const bytes = this.mod.toBytes();
    const used = [...this.fn.keys()].filter((name) => this.lines.some((l) => l.includes(`$${name}`)));
    const header = [
      "(module",
      '  (import "env" "memory" (memory 1))',
      ...used.map((name) => `  (import "blas" "${name}" (func $${name}))`),
      '  (func (export "run") (result i32)',
    ];
    const listing = [...header, ...this.lines, "    i32.const 0", "  )", ")"].join("\n");
    return { bytes, listing, slot };
  }
}

function foldScalar(e: Expr, scope: Map<string, Val>): number | null {
  try {
    return fold(e, scope);
  } catch {
    return null;
  }
}

function fold(e: Expr, scope: Map<string, Val>): number {
  switch (e.k) {
    case "num":
      return e.v;
    case "name": {
      const v = getVar(scope, e.s);
      if (!v || v.t !== "s") throw new Error("no");
      return v.v;
    }
    case "unary":
      return -fold(e.a, scope);
    case "bin": {
      const a = fold(e.a, scope);
      const b = fold(e.b, scope);
      switch (e.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
        case ".*":
          return a * b;
        case "/":
        case "./":
          return a / b;
        case "\\":
        case ".\\":
          return b / a;
        case "^":
        case ".^":
          return a ** b;
        default:
          throw new Error("op");
      }
    }
    case "call": {
      const name = e.name.toLowerCase();
      const args = e.args.map((a) => fold(a, scope));
      if (name === "sqrt") return Math.sqrt(args[0] ?? NaN);
      if (name === "abs") return Math.abs(args[0] ?? NaN);
      throw new Error("call");
    }
    default:
      throw new Error("expr");
  }
}

export type Printed = { name: string; value: Val };

export type ScriptResult =
  | {
      ok: true;
      printed: Printed[];
      pushed: Val[];
      pushedExpr: string[];
      listing: string;
      bytes: Uint8Array;
    }
  | { ok: false; error: string };

function execute(bytes: Uint8Array, engine: Engine, slot: Slot): Val {
  const blas: Record<string, (...args: number[]) => number | void> = {};
  for (const spec of IMPORTS) {
    const fn = (engine.exp as unknown as Record<string, (...args: number[]) => number | void>)[spec.name];
    if (!fn) throw new MatlabError(`Missing ${spec.name}`);
    blas[spec.name] = fn;
  }
  const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes as BufferSource), {
    env: { memory: engine.memory },
    blas,
  });
  const code = (instance.exports.run as () => number)();
  if (code === 1) throw new MatlabError("Singular Matrix");
  if (code !== 0) throw new MatlabError("Bad Size");
  const data = engine.read(slot.ptr, slot.r * slot.c);
  return matrix(slot.r, slot.c, data);
}

export function runScript(src: string, scope: Map<string, Val>, engine: Engine): ScriptResult {
  let stmts: Stmt[];
  try {
    stmts = new Parser(lex(src)).parseScript();
  } catch (err) {
    return { ok: false, error: err instanceof MatlabError ? err.message : "Syntax Error" };
  }
  if (!stmts.length) return { ok: false, error: "Syntax Error" };
  const printed: Printed[] = [];
  const pushed: Val[] = [];
  const pushedExpr: string[] = [];
  const listings: string[] = [];
  let bytes: Uint8Array<ArrayBufferLike> = new Uint8Array();
  try {
    for (const stmt of stmts) {
      engine.resetArena();
      const compiled = new Compiler(engine, scope).finish(stmt.expr);
      const value = cloneVal(execute(compiled.bytes, engine, compiled.slot));
      listings.push(compiled.listing);
      bytes = compiled.bytes;
      if (stmt.assign) {
        scope.set(stmt.assign, value);
        if (!stmt.silent) printed.push({ name: stmt.assign, value });
      } else {
        scope.set("ans", value);
        if (!stmt.silent) {
          printed.push({ name: "ans", value });
          pushed.push(value);
          pushedExpr.push(exprText(stmt.expr));
        }
      }
    }
  } catch (err) {
    return { ok: false, error: err instanceof MatlabError ? err.message : "Bad Size" };
  }
  return { ok: true, printed, pushed, pushedExpr, listing: listings.join("\n\n"), bytes };
}

function exprText(e: Expr): string {
  switch (e.k) {
    case "num":
      return String(e.v);
    case "name":
      return e.s;
    case "unary":
      return `-${exprAtom(exprText(e.a))}`;
    case "bin":
      return `${exprSide(exprText(e.a), e.op, "L")}${e.op}${exprSide(exprText(e.b), e.op, "R")}`;
    case "trans":
      return `${exprAtom(exprText(e.a))}'`;
    case "call":
      return `${e.name}(${e.args.map(exprText).join(",")})`;
    case "mat":
      return `[${e.rows.map((row) => row.map(exprText).join(" ")).join("; ")}]`;
    case "colon":
      return e.step ? `${exprText(e.a)}:${exprText(e.step)}:${exprText(e.b)}` : `${exprText(e.a)}:${exprText(e.b)}`;
    default:
      return "";
  }
}

const BIN_PREC: Record<string, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "\\": 2,
  ".*": 2,
  "./": 2,
  ".\\": 2,
  "^": 3,
  ".^": 3,
};

function exprSide(text: string, op: string, side: "L" | "R"): string {
  const need = BIN_PREC[op] ?? 1;
  const have = topPrec(text);
  const rightAssoc = op === "^" || op === ".^";
  if (have < need) return `(${text})`;
  if (have === need && side === "R" && (op === "-" || op === "/" || op === "\\" || op === "./" || op === ".\\" || rightAssoc)) {
    return `(${text})`;
  }
  if (have === need && side === "L" && rightAssoc) return `(${text})`;
  return text;
}

function exprAtom(text: string): string {
  return topPrec(text) < 4 ? `(${text})` : text;
}

function topPrec(expr: string): number {
  let depth = 0;
  let min = 5;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]!;
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const two = expr.slice(i, i + 2);
      if (two === ".*" || two === "./" || two === ".\\" || two === ".^") {
        min = Math.min(min, BIN_PREC[two] ?? 2);
        i++;
      } else if ((c === "+" || c === "-") && i > 0 && !"([+-*/\\^".includes(expr[i - 1]!)) {
        min = Math.min(min, 1);
      } else if (c === "*" || c === "/" || c === "\\") min = Math.min(min, 2);
      else if (c === "^") min = Math.min(min, 3);
    }
  }
  return min;
}

export const EXAMPLES: { name: string; source: string }[] = [
  {
    name: "Solve A\\b",
    source: "A = [1 2; 3 4]\nb = [1; 0]\nA\\b",
  },
  {
    name: "Quadratic",
    source: "a = 1\nb = -3\nc = 2\n(-b + sqrt(b^2 - 4*a*c)) / (2*a)",
  },
  {
    name: "Norm",
    source: "norm([3 4])",
  },
  {
    name: "sin(pi/2)",
    source: "sin(pi/2)",
  },
];
