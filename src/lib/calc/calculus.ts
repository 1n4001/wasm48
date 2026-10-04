import type { Expr } from "./matlab.ts";

export type Plot =
  | { kind: "xy"; label: string; a: number; b: number; sample: (x: number) => number }
  | { kind: "xyz"; label: string; xs: number[]; ys: number[]; zs: number[][] };

export function derivative(expr: Expr, variable: string): Expr {
  return simplify(diffExpr(simplify(expr), variable));
}

export function antiderivative(expr: Expr, variable: string): Expr {
  return simplify(integrateExpr(expr, variable));
}

function integrateExpr(e: Expr, v: string): Expr {
  const s = simplify(e);
  if (!depends(s, v)) return times(s, { k: "name", s: v }, "*");
  if (s.k === "name") return over(pow(s, 2), { k: "num", v: 2 });
  if (s.k === "unary") return neg(integrateExpr(s.a, v));
  if (s.k === "bin" && (s.op === "+" || s.op === "-")) {
    const left = integrateExpr(s.a, v);
    const right = integrateExpr(s.b, v);
    return s.op === "+" ? plus(left, right) : minus(left, right);
  }
  if (s.k === "bin" && (s.op === "*" || s.op === ".*")) {
    const parts = splitMul(s);
    if (!parts.factors.length) return times({ k: "num", v: num(parts.coeff) }, { k: "name", s: v }, "*");
    const inner = integrateProduct(parts.factors, v);
    return parts.coeff === 1 ? inner : times({ k: "num", v: num(parts.coeff) }, inner, "*");
  }
  if (s.k === "bin" && (s.op === "/" || s.op === "./")) {
    if (!depends(s.b, v)) return over(integrateExpr(s.a, v), s.b);
    if (!depends(s.a, v)) return times(s.a, integrateRecip(s.b, v), "*");
    return integrateProduct([s.a, over(one(), s.b)], v);
  }
  if (s.k === "bin" && (s.op === "^" || s.op === ".^")) return integratePower(s.a, s.b, v);
  if (s.k === "call") return integrateCall(s, v);
  throw new Error("Cannot integrate");
}

function integrateProduct(factors: Expr[], v: string): Expr {
  if (factors.length === 1) return integrateExpr(factors[0]!, v);
  const powers = factors.map((factor) => powerOfVar(factor, v));
  if (powers.every((n) => n !== null)) {
    const degree = powers.reduce((sum, n) => sum + (n ?? 0), 0);
    return integratePower({ k: "name", s: v }, { k: "num", v: degree }, v);
  }
  for (let i = 0; i < factors.length; i++) {
    const inside = knownInside(factors[i]!);
    if (!inside || !depends(inside.u, v)) continue;
    const du = simplify(diffExpr(inside.u, v));
    const rest = fromMul(1, factors.filter((_, index) => index !== i));
    const ratio = mulRatio(rest, du, v);
    if (ratio) return times(ratio, inside.F, "*");
  }
  for (let i = 0; i < factors.length; i++) {
    const u = factors[i]!;
    if (!depends(u, v)) continue;
    const du = simplify(diffExpr(u, v));
    const rest = fromMul(1, factors.filter((_, index) => index !== i));
    const ratio = mulRatio(rest, du, v);
    if (ratio) return times(ratio, over(pow(u, 2), { k: "num", v: 2 }), "*");
  }
  throw new Error("Cannot integrate");
}

function powerOfVar(factor: Expr, v: string): number | null {
  if (factor.k === "name") return factor.s === v ? 1 : null;
  if (factor.k === "bin" && (factor.op === "^" || factor.op === ".^") && factor.a.k === "name" && factor.a.s === v) {
    const n = constValue(factor.b);
    return n === null ? null : n;
  }
  return null;
}

function knownInside(factor: Expr): { u: Expr; F: Expr } | null {
  if (factor.k === "call" && factor.args.length === 1) {
    const F = primitive(factor.name.toLowerCase(), factor.args[0]!);
    return F ? { u: factor.args[0]!, F } : null;
  }
  const inv = recipInner(factor);
  if (inv) return { u: inv, F: call("log", call("abs", inv)) };
  if (factor.k === "bin" && (factor.op === "^" || factor.op === ".^")) {
    const n = constValue(factor.b);
    if (n === null || Math.abs(n + 1) < 1e-12) return null;
    const u = factor.a;
    return { u, F: over(pow(u, num(n + 1)), { k: "num", v: num(n + 1) }) };
  }
  return null;
}

function recipInner(e: Expr): Expr | null {
  if (e.k === "bin" && (e.op === "/" || e.op === "./") && e.a.k === "num" && e.a.v === 1) return e.b;
  if (e.k === "bin" && (e.op === "^" || e.op === ".^")) {
    const n = constValue(e.b);
    if (n !== null && Math.abs(n + 1) < 1e-12) return e.a;
  }
  return null;
}

function mulRatio(numer: Expr, denom: Expr, v: string): Expr | null {
  const n = splitMul(simplify(numer));
  const d = splitMul(simplify(denom));
  if (d.coeff === 0) return null;
  const bag = new Map<string, { expr: Expr; count: number }>();
  for (const factor of n.factors) {
    const key = termKey(factor);
    const hit = bag.get(key);
    if (hit) hit.count += 1;
    else bag.set(key, { expr: factor, count: 1 });
  }
  for (const factor of d.factors) {
    const hit = bag.get(termKey(factor));
    if (!hit || hit.count === 0) return null;
    hit.count -= 1;
  }
  const remain: Expr[] = [];
  for (const hit of bag.values()) {
    for (let i = 0; i < hit.count; i++) remain.push(hit.expr);
  }
  if (remain.some((factor) => depends(factor, v))) return null;
  return fromMul(num(n.coeff / d.coeff), remain);
}

function integratePower(base: Expr, exponent: Expr, v: string): Expr {
  const n = constValue(exponent);
  if (n === null) {
    if (!depends(base, v)) {
      const lin = asAffine(exponent, v);
      const baseN = constValue(base);
      if (lin && lin.slope !== 0 && baseN !== null && baseN > 0 && baseN !== 1) {
        return bySlope(ePow(base, exponent, "^"), num(Math.log(baseN) * lin.slope));
      }
    }
    throw new Error("Cannot integrate");
  }
  if (!depends(base, v)) return times(ePow(base, exponent, "^"), { k: "name", s: v }, "*");
  const lin = asAffine(base, v);
  if (!lin || lin.slope === 0) throw new Error("Cannot integrate");
  if (Math.abs(n + 1) < 1e-12) return bySlope(call("log", call("abs", base)), lin.slope);
  return bySlope(pow(base, num(n + 1)), num((n + 1) * lin.slope));
}

function integrateCall(e: Expr, v: string): Expr {
  if (e.args.length !== 1) throw new Error("Cannot integrate");
  const u = e.args[0]!;
  if (!depends(u, v)) return times(e, { k: "name", s: v }, "*");
  const F = primitive(e.name.toLowerCase(), u);
  if (!F) throw new Error("Cannot integrate");
  const lin = asAffine(u, v);
  if (!lin || lin.slope === 0) throw new Error("Cannot integrate");
  return bySlope(F, lin.slope);
}

function integrateRecip(b: Expr, v: string): Expr {
  const lin = asAffine(b, v);
  if (lin && lin.slope !== 0) return bySlope(call("log", call("abs", b)), lin.slope);
  if (b.k === "bin" && (b.op === "^" || b.op === ".^")) {
    const n = constValue(b.b);
    if (n !== null) return integratePower(b.a, { k: "num", v: num(-n) }, v);
  }
  const inside = knownInside(b);
  if (inside && depends(inside.u, v)) {
    const du = simplify(diffExpr(inside.u, v));
    const ratio = mulRatio(one(), du, v);
    if (ratio) return times(ratio, call("log", call("abs", b)), "*");
  }
  throw new Error("Cannot integrate");
}

function primitive(name: string, u: Expr): Expr | null {
  if (name === "sin") return neg(call("cos", u));
  if (name === "cos") return call("sin", u);
  if (name === "tan") return neg(call("log", call("abs", call("cos", u))));
  if (name === "exp") return call("exp", u);
  if (name === "sinh") return call("cosh", u);
  if (name === "cosh") return call("sinh", u);
  if (name === "tanh") return call("log", call("cosh", u));
  if (name === "sqrt") return bySlope(pow(u, 1.5), 1.5);
  if (name === "log" || name === "ln") return minus(times(u, call("log", u), "*"), u);
  if (name === "log10") return over(minus(times(u, call("log", u), "*"), u), call("log", { k: "num", v: 10 }));
  if (name === "asin") return plus(times(u, call("asin", u), "*"), call("sqrt", minus(one(), pow(u, 2))));
  if (name === "acos") return minus(times(u, call("acos", u), "*"), call("sqrt", minus(one(), pow(u, 2))));
  if (name === "atan") return minus(times(u, call("atan", u), "*"), over(call("log", plus(one(), pow(u, 2))), { k: "num", v: 2 }));
  if (name === "abs") return over(times(u, call("abs", u), "*"), { k: "num", v: 2 });
  return null;
}

function bySlope(e: Expr, slope: number): Expr {
  const s = num(slope);
  if (s === 1) return e;
  if (s === -1) return neg(e);
  if (s === 0) throw new Error("Cannot integrate");
  return over(e, { k: "num", v: s });
}

function asAffine(e: Expr, v: string): { slope: number; rest: Expr } | null {
  if (e.k === "num") return { slope: 0, rest: e };
  if (e.k === "name") return e.s === v ? { slope: 1, rest: { k: "num", v: 0 } } : { slope: 0, rest: e };
  if (e.k === "unary") {
    const inner = asAffine(e.a, v);
    if (!inner) return null;
    return { slope: num(-inner.slope), rest: simplify(neg(inner.rest)) };
  }
  if (e.k === "bin" && (e.op === "+" || e.op === "-")) {
    const left = asAffine(e.a, v);
    const right = asAffine(e.b, v);
    if (!left || !right) return null;
    const sign = e.op === "-" ? -1 : 1;
    const rest = e.op === "+" ? plus(left.rest, right.rest) : minus(left.rest, right.rest);
    return { slope: num(left.slope + sign * right.slope), rest: simplify(rest) };
  }
  if (e.k === "bin" && (e.op === "*" || e.op === ".*")) {
    const parts = splitMul(e);
    if (!parts.factors.length) return { slope: 0, rest: { k: "num", v: num(parts.coeff) } };
    if (parts.factors.length === 1 && parts.factors[0]!.k === "name" && parts.factors[0]!.s === v) {
      return { slope: num(parts.coeff), rest: { k: "num", v: 0 } };
    }
  }
  return null;
}

export function definiteIntegral(sample: (x: number) => number, a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("Bad bound");
  if (a === b) return 0;
  if (a > b) return -definiteIntegral(sample, b, a);
  const whole = simpson(sample, a, b);
  return adapt(sample, a, b, 1e-7, whole, 16);
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

export function simplify(e: Expr): Expr {
  const s = simp(e);
  const n = constValue(s);
  return n === null ? s : { k: "num", v: num(n) };
}

function simp(e: Expr): Expr {
  switch (e.k) {
    case "num":
    case "name":
      return e;
    case "unary": {
      const a = simp(e.a);
      if (a.k === "unary") return a.a;
      if (a.k === "num") return { k: "num", v: num(-a.v) };
      if (a.k === "bin" && (a.op === "+" || a.op === "-")) return simpSum({ k: "unary", op: "-", a });
      return { k: "unary", op: "-", a };
    }
    case "trans":
      return { k: "trans", a: simp(e.a) };
    case "call":
      return { k: "call", name: e.name, args: e.args.map(simp) };
    case "bin": {
      if (e.op === "+" || e.op === "-") return simpSum(e);
      return simpBin(e.op, simp(e.a), simp(e.b));
    }
    default:
      return e;
  }
}

function simpSum(e: Expr): Expr {
  const groups = new Map<string, { coeff: number; factors: Expr[] }>();
  let constant = 0;
  for (const term of collectSum(e, 1)) {
    if (term.coeff === 0) continue;
    if (!term.factors.length) {
      constant = num(constant + term.coeff);
      continue;
    }
    const key = term.factors.map(termKey).sort().join("*");
    const prev = groups.get(key);
    if (prev) prev.coeff = num(prev.coeff + term.coeff);
    else groups.set(key, { coeff: term.coeff, factors: term.factors });
  }
  let acc: Expr | null = null;
  const add = (coeff: number, factors: Expr[]) => {
    if (coeff === 0) return;
    const neg = coeff < 0;
    const piece = fromMul(neg ? num(-coeff) : coeff, factors);
    if (!acc) {
      acc = neg ? negNum(piece) : piece;
      return;
    }
    acc = { k: "bin", op: neg ? "-" : "+", a: acc, b: piece };
  };
  for (const group of groups.values()) add(group.coeff, group.factors);
  if (constant !== 0) add(constant, []);
  return acc ?? { k: "num", v: 0 };
}

function collectSum(e: Expr, sign: number): { coeff: number; factors: Expr[] }[] {
  if (e.k === "bin" && (e.op === "+" || e.op === "-")) {
    return [...collectSum(e.a, sign), ...collectSum(e.b, e.op === "-" ? -sign : sign)];
  }
  if (e.k === "unary") return collectSum(e.a, -sign);
  const flat = simp(e);
  if (flat.k === "unary" || (flat.k === "bin" && (flat.op === "+" || flat.op === "-"))) return collectSum(flat, sign);
  const parts = splitMul(flat);
  return [{ coeff: num(sign * parts.coeff), factors: parts.factors }];
}

function termKey(e: Expr): string {
  switch (e.k) {
    case "num":
      return `#${e.v}`;
    case "name":
      return e.s;
    case "unary":
      return `-(${termKey(e.a)})`;
    case "bin":
      return `(${termKey(e.a)}${e.op}${termKey(e.b)})`;
    case "trans":
      return `(${termKey(e.a)})'`;
    case "call":
      return `${e.prime ? "'" : ""}${e.name}(${e.args.map(termKey).join(",")})`;
    case "mat":
      return `[${e.rows.map((row) => row.map(termKey).join(",")).join(";")}]`;
    case "colon":
      return `${termKey(e.a)}:${e.step ? `${termKey(e.step)}:` : ""}${termKey(e.b)}`;
    default:
      return "?";
  }
}

function simpBin(op: string, a: Expr, b: Expr): Expr {
  const av = a.k === "num" ? a.v : null;
  const bv = b.k === "num" ? b.v : null;
  if (av !== null && bv !== null && !((op === "/" || op === "./" || op === "\\") && bv === 0)) {
    if ((op === "/" || op === "./") && Number.isInteger(av) && Number.isInteger(bv)) return intQuotient(av, bv);
    const n = applyConst(op, av, bv);
    if (n !== null) return { k: "num", v: num(n) };
  }
  if (op === "+" || op === "-") {
    if (av === 0) return op === "+" ? b : negNum(b);
    if (bv === 0) return a;
  }
  if (op === "*" || op === ".*") {
    if (av === 0 || bv === 0) return { k: "num", v: 0 };
    if (av === 1) return b;
    if (bv === 1) return a;
    if (op === "*") {
      const left = splitMul(a);
      const right = splitMul(b);
      return mulJoined(num(left.coeff * right.coeff), [...left.factors, ...right.factors]);
    }
  }
  if ((op === "/" || op === "./") && bv === 1) return a;
  if ((op === "/" || op === "./") && av === 0 && bv !== 0) return { k: "num", v: 0 };
  if ((op === "/" || op === "./") && bv !== null && bv < 0) return simp(over(negNum(a), { k: "num", v: num(-bv) }));
  if (op === "^" || op === ".^") {
    if (bv === 0) return { k: "num", v: 1 };
    if (bv === 1) return a;
    if (av === 0) return { k: "num", v: 0 };
    if (av === 1) return { k: "num", v: 1 };
  }
  return { k: "bin", op, a, b };
}

function applyConst(op: string, a: number, b: number): number | null {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*" || op === ".*") return a * b;
  if (op === "/" || op === "./") return a / b;
  if (op === "^" || op === ".^") return a ** b;
  return null;
}

function splitMul(e: Expr): { coeff: number; factors: Expr[] } {
  if (e.k === "num") return { coeff: e.v, factors: [] };
  if (e.k === "unary") {
    const inner = splitMul(e.a);
    return { coeff: -inner.coeff, factors: inner.factors };
  }
  if (e.k === "bin" && e.op === "*") {
    const left = splitMul(e.a);
    const right = splitMul(e.b);
    return { coeff: left.coeff * right.coeff, factors: [...left.factors, ...right.factors] };
  }
  return { coeff: 1, factors: [e] };
}

function mulJoined(coeff: number, factors: Expr[]): Expr {
  const kept: Expr[] = [];
  for (const factor of factors) {
    if (factor.k === "bin" && (factor.op === "/" || factor.op === "./") && factor.b.k === "num" && factor.b.v !== 0) {
      const den = num(factor.b.v);
      if (Number.isInteger(num(coeff)) && Number.isInteger(den)) {
        const g = gcd(Math.abs(num(coeff)), Math.abs(den));
        const reduced = num(den / g);
        if (reduced === 1 || reduced === -1) {
          const inner = splitMul(factor.a);
          coeff = num((coeff / g) * inner.coeff * (reduced === -1 ? -1 : 1));
          kept.push(...inner.factors);
          continue;
        }
      } else if (factor.a.k === "num") {
        coeff = num((coeff * factor.a.v) / den);
        continue;
      }
    }
    kept.push(factor);
  }
  return fromMul(num(coeff), kept);
}

function intQuotient(numer: number, den: number): Expr {
  const g = gcd(Math.abs(numer), Math.abs(den));
  let n = numer / g;
  let d = den / g;
  if (d < 0) {
    n = -n;
    d = -d;
  }
  if (d === 1) return { k: "num", v: num(n) };
  return over({ k: "num", v: num(n) }, { k: "num", v: num(d) });
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function fromMul(coeff: number, factors: Expr[]): Expr {
  if (coeff === 0) return { k: "num", v: 0 };
  if (!factors.length) return { k: "num", v: num(coeff) };
  let body = factors[0]!;
  for (let i = 1; i < factors.length; i++) body = { k: "bin", op: "*", a: body, b: factors[i]! };
  if (coeff === 1) return body;
  if (coeff === -1) return { k: "unary", op: "-", a: body };
  return { k: "bin", op: "*", a: { k: "num", v: num(coeff) }, b: body };
}

function negNum(e: Expr): Expr {
  if (e.k === "num") return { k: "num", v: num(-e.v) };
  if (e.k === "unary") return e.a;
  return { k: "unary", op: "-", a: e };
}

function num(n: number): number {
  const rounded = tidy(n);
  return rounded === 0 ? 0 : rounded;
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

export function solveLinear(equations: Expr[], vars: string[]): Expr[] {
  if (!vars.length || equations.length !== vars.length) throw new Error("Bad Size");
  if (new Set(vars).size !== vars.length) throw new Error("Repeated Name");
  const wanted = new Set(vars);
  const rows = equations.map((eq) => affine(eq, wanted, vars));
  if (rows.every((row) => row.coeff.every((c) => c.k === "num") && row.rhs.k === "num")) {
    return numericSolve(rows.map((row) => row.coeff.map((c) => (c.k === "num" ? c.v : NaN))), rows.map((row) => (row.rhs.k === "num" ? row.rhs.v : NaN)));
  }
  return symbolicSolve(rows.map((row) => row.coeff), rows.map((row) => row.rhs));
}

function affine(eq: Expr, wanted: Set<string>, vars: string[]): { coeff: Expr[]; rhs: Expr } {
  const zero = eq.k === "bin" && eq.op === "==" ? minus(eq.a, eq.b) : eq;
  const lin = collectLinear(simplify(zero), wanted);
  return {
    coeff: vars.map((name) => lin.coeff.get(name) ?? { k: "num", v: 0 }),
    rhs: simplify(neg(lin.constant)),
  };
}

function collectLinear(e: Expr, vars: Set<string>): { coeff: Map<string, Expr>; constant: Expr } {
  if (e.k === "bin" && (e.op === "+" || e.op === "-")) {
    const left = collectLinear(e.a, vars);
    const right = collectLinear(e.b, vars);
    const coeff = new Map(left.coeff);
    for (const [name, term] of right.coeff) {
      const prev = coeff.get(name) ?? { k: "num", v: 0 };
      coeff.set(name, simplify(e.op === "+" ? plus(prev, term) : minus(prev, term)));
    }
    return {
      coeff,
      constant: simplify(e.op === "+" ? plus(left.constant, right.constant) : minus(left.constant, right.constant)),
    };
  }
  if (e.k === "unary") {
    const inner = collectLinear(e.a, vars);
    return {
      coeff: new Map([...inner.coeff].map(([name, term]) => [name, simplify(neg(term))])),
      constant: simplify(neg(inner.constant)),
    };
  }
  if (!mentions(e, vars)) return { coeff: new Map(), constant: e };
  const term = linearTerm(e, vars);
  if (!term) throw new Error("Not linear");
  return { coeff: new Map([[term.name, term.coeff]]), constant: { k: "num", v: 0 } };
}

function linearTerm(e: Expr, vars: Set<string>): { name: string; coeff: Expr } | null {
  if (e.k === "name" && vars.has(e.s)) return { name: e.s, coeff: one() };
  if (e.k === "bin" && (e.op === "*" || e.op === ".*")) {
    const left = linearTerm(e.a, vars);
    const right = linearTerm(e.b, vars);
    if (left && !mentions(e.b, vars)) return { name: left.name, coeff: simplify(times(left.coeff, e.b, "*")) };
    if (right && !mentions(e.a, vars)) return { name: right.name, coeff: simplify(times(e.a, right.coeff, "*")) };
    return null;
  }
  if (e.k === "bin" && (e.op === "/" || e.op === "./") && !mentions(e.b, vars)) {
    const left = linearTerm(e.a, vars);
    if (left) return { name: left.name, coeff: simplify(over(left.coeff, e.b)) };
  }
  return null;
}

function mentions(e: Expr, vars: Set<string>): boolean {
  for (const name of vars) if (depends(e, name)) return true;
  return false;
}

function numericSolve(a: number[][], b: number[]): Expr[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i] ?? NaN]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(m[row]![col] ?? 0) > Math.abs(m[pivot]![col] ?? 0)) pivot = row;
    if (Math.abs(m[pivot]![col] ?? 0) < 1e-12) throw new Error("Singular");
    if (pivot !== col) [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const div = m[col]![col] ?? 1;
    for (let c = col; c <= n; c++) m[col]![c] = (m[col]![c] ?? 0) / div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row]![col] ?? 0;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) m[row]![c] = (m[row]![c] ?? 0) - factor * (m[col]![c] ?? 0);
    }
  }
  return m.map((row) => ({ k: "num", v: num(row[n] ?? NaN) }));
}

function symbolicSolve(a: Expr[][], b: Expr[]): Expr[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = -1;
    for (let row = col; row < n; row++) {
      if (!isZeroExpr(m[row]![col]!)) {
        pivot = row;
        break;
      }
    }
    if (pivot < 0) throw new Error("Singular");
    if (pivot !== col) [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const div = m[col]![col]!;
    for (let c = col; c <= n; c++) m[col]![c] = simplify(over(m[col]![c]!, div));
    for (let row = 0; row < n; row++) {
      if (row === col || isZeroExpr(m[row]![col]!)) continue;
      const factor = m[row]![col]!;
      for (let c = col; c <= n; c++) m[row]![c] = simplify(minus(m[row]![c]!, times(factor, m[col]![c]!, "*")));
    }
  }
  return m.map((row) => canonRational(simplify(row[n]!)));
}

function canonRational(e: Expr): Expr {
  if (e.k === "bin" && (e.op === "+" || e.op === "-")) {
    const combined = combineRational(e.op, e.a, e.b);
    if (combined) return canonRational(combined);
  }
  return e;
}

function combineRational(op: "+" | "-", a: Expr, b: Expr): Expr | null {
  const left = quotient(a);
  const right = quotient(b);
  if (!left && !right) return null;
  const ln = left?.numer ?? a;
  const ld = left?.den ?? 1;
  const rn = right?.numer ?? b;
  const rd = right?.den ?? 1;
  const leftScaled = simplify(times(ln, { k: "num", v: num(rd) }, "*"));
  const rightScaled = simplify(times(rn, { k: "num", v: num(ld) }, "*"));
  const numer = simplify(op === "+" ? plus(leftScaled, rightScaled) : minus(leftScaled, rightScaled));
  return reduceQuotient(numer, num(ld * rd));
}

function quotient(e: Expr): { numer: Expr; den: number } | null {
  if (e.k === "bin" && (e.op === "/" || e.op === "./") && e.b.k === "num" && e.b.v !== 0) return { numer: e.a, den: e.b.v };
  return null;
}

function reduceQuotient(numer: Expr, den: number): Expr {
  const d = num(den);
  if (d === 0) throw new Error("Singular");
  const parts = splitMul(numer);
  if (Number.isInteger(num(parts.coeff)) && Number.isInteger(d)) {
    const g = gcd(Math.abs(num(parts.coeff)), Math.abs(d));
    const coeff = num(parts.coeff / g);
    const reduced = num(d / g);
    const body = fromMul(coeff, parts.factors);
    if (reduced === 1) return body;
    if (reduced === -1) return negNum(body);
    return over(body, { k: "num", v: reduced });
  }
  if (d === 1) return numer;
  if (d === -1) return negNum(numer);
  return over(numer, { k: "num", v: d });
}

function isZeroExpr(e: Expr): boolean {
  const s = simplify(e);
  return s.k === "num" && s.v === 0;
}

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
