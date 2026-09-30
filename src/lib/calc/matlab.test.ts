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

  it("reports syntax and size errors", () => {
    const bad = runScript("2 +", new Map(), engine);
    assert.equal(bad.ok, false);
    const mismatch = runScript("[1 2; 3 4] * [1 2 3]", new Map(), engine);
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) assert.equal(mismatch.error, "Size Mismatch");
  });
});
