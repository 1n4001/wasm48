import type { Expr } from "./matlab.ts";

export type Plot =
  | { kind: "xy"; label: string; xs: number[]; ys: number[] }
  | { kind: "xyz"; label: string; xs: number[]; ys: number[]; zs: number[][] };

export function derivative(expr: Expr, variable: string): Expr {
  return simplify(diffExpr(expr, variable));
}

export function definiteIntegral(sample: (x: number) => number, a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("Bad bound");
  if (a === b) return 0;
  if (a > b) return -definiteIntegral(sample, b, a);
  const whole = simpson(sample, a, b);
  return adapt(sample, a, b, 1e-7, whole, 16);
}

export function sampleCurve(sample: (x: number) => number, a: number, b: number, n = 160): { xs: number[]; ys: number[] } {
  if (!(b > a)) throw new Error("Bad bound");
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = a + ((b - a) * i) / (n - 1);
    xs.push(x);
    ys.push(sample(x));
  }
  return { xs, ys };
}

export function sampleSurface(
  sample: (x: number, y: number) => number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  n = 24,
): { xs: number[]; ys: number[]; zs: number[][] } {
  if (!(x1 > x0) || !(y1 > y0)) throw new Error("Bad bound");
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) xs.push(x0 + ((x1 - x0) * i) / (n - 1));
  for (let j = 0; j < n; j++) ys.push(y0 + ((y1 - y0) * j) / (n - 1));
  const zs = xs.map((x) => ys.map((y) => sample(x, y)));
  return { xs, ys, zs };
}

function diffExpr(e: Expr, v: string): Expr {
  switch (e.k) {
    case "num":
      return { k: "num", v: 0 };
    case "name":
      return { k: "num", v: e.s === v ? 1 : 0 };
    case "unary":
      return { k: "unary", op: "-", a: diffExpr(e.a, v) };
    case "trans":
      return { k: "trans", a: diffExpr(e.a, v) };
    case "bin":
      return diffBin(e.op, e.a, e.b, v);
    case "call":
      return diffCall(e.name.toLowerCase(), e.args, v);
    default:
      throw new Error("Cannot differentiate");
  }
}

function diffBin(op: string, a: Expr, b: Expr, v: string): Expr {
  const da = diffExpr(a, v);
  const db = diffExpr(b, v);
  if (op === "+" || op === "-") return { k: "bin", op, a: da, b: db };
  if (op === "*" || op === ".*") {
    return plus(times(da, b, op), times(a, db, op));
  }
  if (op === "/" || op === "./") {
    const num = minus(times(da, b, "*"), times(a, db, "*"));
    const den = { k: "bin", op: "^", a: b, b: { k: "num", v: 2 } } as Expr;
    return { k: "bin", op, a: num, b: den };
  }
  if (op === "^" || op === ".^") {
    if (!depends(b, v)) {
      const n = constValue(b);
      if (n === null) throw new Error("Cannot differentiate");
      const pow = { k: "bin", op, a, b: { k: "num", v: n - 1 } } as Expr;
      return times(times({ k: "num", v: n }, pow, "*"), da, "*");
    }
    if (!depends(a, v)) {
      const ln = { k: "call", name: "log", args: [a] } as Expr;
      return times(times(ePow(a, b, op), ln, "*"), db, "*");
    }
    const ln = { k: "call", name: "log", args: [a] } as Expr;
    const left = times(db, ln, "*");
    const right = times(b, { k: "bin", op: "/", a: da, b: a }, "*");
    return times(ePow(a, b, op), plus(left, right), "*");
  }
  throw new Error("Cannot differentiate");
}

function diffCall(name: string, args: Expr[], v: string): Expr {
  if (args.length !== 1) throw new Error("Cannot differentiate");
  const u = args[0]!;
  const du = diffExpr(u, v);
  const chain = (inner: Expr) => times(inner, du, "*");
  if (name === "sin") return chain(call("cos", u));
  if (name === "cos") return chain(neg(call("sin", u)));
  if (name === "tan") return chain(over(one(), pow(call("cos", u), 2)));
  if (name === "exp") return chain(call("exp", u));
  if (name === "log" || name === "ln") return chain(over(one(), u));
  if (name === "log10") return chain(over(one(), times(u, call("log", { k: "num", v: 10 }), "*")));
  if (name === "sqrt") return chain(over(one(), times({ k: "num", v: 2 }, call("sqrt", u), "*")));
  if (name === "asin") return chain(over(one(), call("sqrt", minus(one(), pow(u, 2)))));
  if (name === "acos") return neg(chain(over(one(), call("sqrt", minus(one(), pow(u, 2))))));
  if (name === "atan") return chain(over(one(), plus(one(), pow(u, 2))));
  if (name === "sinh") return chain(call("cosh", u));
  if (name === "cosh") return chain(call("sinh", u));
  if (name === "tanh") return chain(minus(one(), pow(call("tanh", u), 2)));
  if (name === "abs") return chain(over(u, call("abs", u)));
  throw new Error("Cannot differentiate");
}

function simplify(e: Expr): Expr {
  const s = simp(e);
  const n = constValue(s);
  return n === null ? s : { k: "num", v: tidy(n) };
}

function simp(e: Expr): Expr {
  switch (e.k) {
    case "num":
    case "name":
      return e;
    case "unary": {
      const a = simp(e.a);
      if (a.k === "unary") return a.a;
      if (a.k === "num") return { k: "num", v: -a.v };
      return { k: "unary", op: "-", a };
    }
    case "trans":
      return { k: "trans", a: simp(e.a) };
    case "call":
      return { k: "call", name: e.name, args: e.args.map(simp) };
    case "bin": {
      const a = simp(e.a);
      const b = simp(e.b);
      return simpBin(e.op, a, b);
    }
    default:
      return e;
  }
}

function simpBin(op: string, a: Expr, b: Expr): Expr {
  const av = a.k === "num" ? a.v : null;
  const bv = b.k === "num" ? b.v : null;
  if (op === "+" || op === "-") {
    if (av === 0) return op === "+" ? b : neg(b);
    if (bv === 0) return a;
  }
  if (op === "*" || op === ".*") {
    if (av === 0 || bv === 0) return { k: "num", v: 0 };
    if (av === 1) return b;
    if (bv === 1) return a;
  }
  if ((op === "/" || op === "./") && bv === 1) return a;
  if ((op === "/" || op === "./") && av === 0) return { k: "num", v: 0 };
  if (op === "^" || op === ".^") {
    if (bv === 0) return { k: "num", v: 1 };
    if (bv === 1) return a;
    if (av === 0) return { k: "num", v: 0 };
    if (av === 1) return { k: "num", v: 1 };
  }
  return { k: "bin", op, a, b };
}

function constValue(e: Expr): number | null {
  try {
    return ev(e);
  } catch {
    return null;
  }
}

function ev(e: Expr): number {
  switch (e.k) {
    case "num":
      return e.v;
    case "unary":
      return -ev(e.a);
    case "bin": {
      const a = ev(e.a);
      const b = ev(e.b);
      if (e.op === "+") return a + b;
      if (e.op === "-") return a - b;
      if (e.op === "*" || e.op === ".*") return a * b;
      if (e.op === "/" || e.op === "./") return a / b;
      if (e.op === "^" || e.op === ".^") return a ** b;
      throw new Error("var");
    }
    case "call": {
      const f = MATH[e.name.toLowerCase()];
      if (!f || e.args.length !== 1) throw new Error("var");
      return f(ev(e.args[0]!));
    }
    default:
      throw new Error("var");
  }
}

function depends(e: Expr, v: string): boolean {
  switch (e.k) {
    case "name":
      return e.s === v;
    case "num":
      return false;
    case "unary":
    case "trans":
      return depends(e.a, v);
    case "bin":
      return depends(e.a, v) || depends(e.b, v);
    case "call":
      return e.args.some((a) => depends(a, v));
    default:
      return true;
  }
}

function simpson(f: (x: number) => number, a: number, b: number): number {
  const c = (a + b) / 2;
  return ((b - a) / 6) * (f(a) + 4 * f(c) + f(b));
}

function adapt(f: (x: number) => number, a: number, b: number, eps: number, whole: number, depth: number): number {
  const c = (a + b) / 2;
  const left = simpson(f, a, c);
  const right = simpson(f, c, b);
  if (depth <= 0 || Math.abs(left + right - whole) <= eps * 15) return left + right + (left + right - whole) / 15;
  return adapt(f, a, c, eps / 2, left, depth - 1) + adapt(f, c, b, eps / 2, right, depth - 1);
}

function tidy(n: number): number {
  return Math.round(n * 1e12) / 1e12;
}

const one = (): Expr => ({ k: "num", v: 1 });
const neg = (a: Expr): Expr => ({ k: "unary", op: "-", a });
const plus = (a: Expr, b: Expr): Expr => ({ k: "bin", op: "+", a, b });
const minus = (a: Expr, b: Expr): Expr => ({ k: "bin", op: "-", a, b });
const times = (a: Expr, b: Expr, op: string): Expr => ({ k: "bin", op, a, b });
const over = (a: Expr, b: Expr): Expr => ({ k: "bin", op: "/", a, b });
const pow = (a: Expr, n: number): Expr => ({ k: "bin", op: "^", a, b: { k: "num", v: n } });
const call = (name: string, a: Expr): Expr => ({ k: "call", name, args: [a] });
const ePow = (a: Expr, b: Expr, op: string): Expr => ({ k: "bin", op, a, b });

const MATH: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  log: Math.log,
  ln: Math.log,
  log10: Math.log10,
  sqrt: Math.sqrt,
  abs: Math.abs,
};
