import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEngine, type Val } from "./engine.ts";
import { runScript } from "./matlab.ts";

const engine = createEngine();

function run(src: string, scope = new Map<string, Val>()) {
  const result = runScript(src, scope, engine);
  if (!result.ok) throw new Error(result.error);
  return result;
}

function num(src: string, scope?: Map<string, Val>) {
  const result = run(src, scope);
  const value = result.printed.at(-1)?.value;
  assert.equal(value?.t, "s");
  if (value?.t !== "s") throw new Error("shape");
  return value.v;
}

function mat(src: string) {
  const value = run(src).printed.at(-1)?.value;
  assert.equal(value?.t, "m");
  if (value?.t !== "m") throw new Error("shape");
  return value;
}

describe("matlab wasm", () => {
  it("shifts, masks, and converts radix", () => {
    assert.equal(num("1 << 8"), 256);
    assert.equal(num("0xF0 & 0x3C"), 0x30);
    assert.equal(num("5 | 2"), 7);
    assert.equal(num("bitxor(5, 1)"), 4);
    assert.equal(num("xor(5, 1)"), 4);
    assert.equal(num("bitshift(1, 4)"), 16);
    assert.equal(num("bitshift(16, -2)"), 4);
    assert.equal(num("-16 >> 2"), -4);
    assert.equal(num("hex2dec('FF')"), 255);
    assert.equal(num("bit2dec('1010')"), 10);
    assert.equal(num("dec2dec('42')"), 42);
    assert.equal(num("0b1010"), 10);
    assert.equal(num("hex2dec('FF') + 1"), 256);
    const hex = run("dec2hex(255)").printed.at(-1)?.value;
    assert.equal(hex?.t, "txt");
    if (hex?.t === "txt") assert.equal(hex.s, "FF");
    const bits = run("hex2bit('A')").printed.at(-1)?.value;
    assert.equal(bits?.t, "txt");
    if (bits?.t === "txt") assert.equal(bits.s, "1010");
    const back = run("bit2hex('1111')").printed.at(-1)?.value;
    assert.equal(back?.t, "txt");
    if (back?.t === "txt") assert.equal(back.s, "F");
    assert.equal(num("bit2dec(hex2bit('A'))"), 10);
  });

  it("evaluates scalar arithmetic and powers", () => {
    assert.equal(num("2+3*4"), 14);
    assert.equal(num("-2^2"), -4);
    assert.equal(num("2^3^2"), 512);
    assert.ok(Math.abs(num("sin(pi/2)") - 1) < 1e-12);
  });

  it("evaluates the quadratic formula", () => {
    const scope = new Map<string, Val>();
    const result = run("a = 1; b = -3; c = 2; (-b + sqrt(b^2 - 4*a*c)) / (2*a)", scope);
    const value = result.printed.at(-1)?.value;
    assert.equal(value?.t, "s");
    if (value?.t === "s") assert.ok(Math.abs(value.v - 2) < 1e-9);
    assert.ok(result.listing.includes("dgemm") || result.listing.includes("ew_"));
    assert.ok(result.bytes.byteLength > 50);
  });

  it("multiplies matrices with DGEMM", () => {
    const m = mat("[1 2; 3 4] * [5 6; 7 8]");
    assert.deepEqual(m.r, 2);
    assert.deepEqual(m.c, 2);
    assert.ok(Math.abs((m.d[0] ?? 0) - 19) < 1e-9);
    assert.ok(Math.abs((m.d[1] ?? 0) - 43) < 1e-9);
    assert.ok(Math.abs((m.d[2] ?? 0) - 22) < 1e-9);
    assert.ok(Math.abs((m.d[3] ?? 0) - 50) < 1e-9);
    assert.match(run("[1 2; 3 4] * [5 6; 7 8]").listing, /dgemm/);
  });

  it("solves, inverts, and takes a determinant", () => {
    const solved = mat("A = [1 2; 3 4]\nb = [5; 6]\nA\\b");
    // [1 2; 3 4] \ [5; 6] = [-4; 4.5]? 
    // inv = [-2 1; 1.5 -0.5]; inv*[5;6] = [-10+6; 7.5-3] = [-4; 4.5]
    assert.ok(Math.abs((solved.d[0] ?? 0) + 4) < 1e-8);
    assert.ok(Math.abs((solved.d[1] ?? 0) - 4.5) < 1e-8);
    assert.ok(Math.abs(num("det([1 2; 3 4])") + 2) < 1e-9);
    const eye = mat("inv([1 2; 3 4]) * [1 2; 3 4]");
    assert.ok(Math.abs((eye.d[0] ?? 0) - 1) < 1e-8);
    assert.ok(Math.abs((eye.d[1] ?? 0) - 0) < 1e-8);
    assert.ok(Math.abs((eye.d[3] ?? 0) - 1) < 1e-8);
  });

  it("handles norm, dot, colon, transpose, and elementwise ops", () => {
    assert.ok(Math.abs(num("norm([3 4])") - 5) < 1e-12);
    assert.ok(Math.abs(num("dot([1 2 3], [4 5 6])") - 32) < 1e-12);
    const range = mat("1:2:9");
    assert.deepEqual(Array.from(range.d), [1, 3, 5, 7, 9]);
    const t = mat("[1 2; 3 4]'");
    assert.deepEqual(Array.from(t.d), [1, 2, 3, 4]);
    const ew = mat("[1 2; 3 4] .* [10 10; 10 10]");
    assert.deepEqual(Array.from(ew.d), [10, 30, 20, 40]);
    assert.ok(Math.abs(num("nthroot(8, 3)") - 2) < 1e-9);
    assert.ok(Math.abs(num("nthroot(-8, 3)") + 2) < 1e-9);
    assert.ok(Math.abs(num("cbrt(-27)") + 3) < 1e-9);
    assert.ok(Number.isNaN(num("nthroot(-4, 2)")));
    const roots = mat("nthroot([8 -27], 3)");
    assert.ok(Math.abs((roots.d[0] ?? 0) - 2) < 1e-9);
    assert.ok(Math.abs((roots.d[1] ?? 0) + 3) < 1e-9);
  });

  it("evaluates special functions, statistics, and physics", () => {
    assert.equal(num("factorial(5)"), 120);
    assert.ok(Math.abs(num("gamma(0.5)") - Math.sqrt(Math.PI)) < 1e-9);
    assert.equal(num("nchoosek(5, 2)"), 10);
    assert.equal(num("npr(5, 2)"), 20);
    assert.equal(num("gcd(12, 18)"), 6);
    assert.equal(num("mod(-3, 2)"), 1);
    assert.ok(Math.abs(num("beta(2, 3)") - 1 / 12) < 1e-9);
    assert.ok(Math.abs(num("zeta(2)") - Math.PI ** 2 / 6) < 1e-4);
    assert.equal(num("mean([1 2 3 4])"), 2.5);
    assert.equal(num("std([1 2 3])"), 1);
    assert.equal(num("median([1 3 2])"), 2);
    assert.ok(Math.abs(num("normcdf(0)") - 0.5) < 1e-6);
    assert.ok(Math.abs(num("binopdf(2, 4, 0.5)") - 0.375) < 1e-12);
    assert.equal(num("corr([1 2 3], [2 4 6])"), 1);
    assert.equal(num("kinetic(2, 3)"), 9);
    assert.equal(num("current(12, 4)"), 3);
    assert.equal(num("grav(1, 1, 1)"), num("G"));
    const z = mat("zscore([1 2 3])");
    assert.deepEqual(Array.from(z.d).map((v) => Math.round(v * 1e9) / 1e9), [-1, 0, 1]);
    const cols = mat("mean([1 3; 2 4])");
    assert.deepEqual(Array.from(cols.d), [1.5, 3.5]);
    assert.equal(num("quantile([1 2 3 4], 0.5)"), 2.5);
  });

  it("defines functions and differentiates them", () => {
    const scope = new Map<string, Val>();
    const defined = runScript("f(t) = 1/2*9.8*t^2+2*t+3", scope, engine);
    assert.equal(defined.ok, true);
    assert.equal(scope.get("f")?.t, "fn");
    const at = runScript("f(1)", scope, engine);
    assert.equal(at.ok, true);
    if (at.ok && at.pushed[0]?.t === "s") assert.ok(Math.abs(at.pushed[0].v - 9.9) < 1e-9);
    const slope = runScript("f'(1)", scope, engine);
    assert.equal(slope.ok, true);
    if (slope.ok && slope.pushed[0]?.t === "s") assert.ok(Math.abs(slope.pushed[0].v - 11.8) < 1e-9);
    const formula = runScript("f'(t)", scope, engine);
    assert.equal(formula.ok, true);
    if (formula.ok) assert.equal(formula.pushed[0]?.t, "sym");
    runScript("g(x) = f(x)+1", scope, engine);
    const composed = runScript("g(1)", scope, engine);
    assert.equal(composed.ok, true);
    if (composed.ok && composed.pushed[0]?.t === "s") assert.ok(Math.abs(composed.pushed[0].v - 10.9) < 1e-9);
  });

  it("reports syntax and size errors", () => {
    const bad = runScript("2 +", new Map(), engine);
    assert.equal(bad.ok, false);
    const mismatch = runScript("[1 2; 3 4] * [1 2 3]", new Map(), engine);
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) assert.equal(mismatch.error, "Size Mismatch");
  });
});
