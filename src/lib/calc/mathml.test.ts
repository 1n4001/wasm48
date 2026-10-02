import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toMathML } from "./mathml.ts";

describe("mathml", () => {
  it("renders fractions, powers, products, integrals, and matrices", () => {
    const frac = toMathML("(1+2)/4");
    assert.ok(frac?.includes("<mfrac>"));
    assert.ok(frac?.includes("<mo>+</mo>"));

    const pow = toMathML("x^2");
    assert.ok(pow?.includes("<msup>"));

    const dot = toMathML("dot(A,B)");
    assert.ok(dot?.includes("<mo>·</mo>"));
    assert.ok(!dot?.includes("dot"));

    const cross = toMathML("cross(A,B)");
    assert.ok(cross?.includes("<mo>×</mo>"));

    const integral = toMathML("integ(sin(x), x, 0, pi)");
    assert.ok(integral?.includes("∫"));
    assert.ok(integral?.includes("<msubsup>"));
    assert.ok(integral?.includes("π"));

    const matrix = toMathML("[1 2; 3 4]");
    assert.ok(matrix?.includes("<mtable"));
    assert.ok(matrix?.includes("<mn>4</mn>"));

    const diff = toMathML("diff(x^2, x)");
    assert.ok(diff?.includes("<mfrac>"));

    const root = toMathML("nthroot(x, 3)");
    assert.ok(root?.includes("<mroot>"));
    assert.equal(toMathML("A = 1"), null);

    const juxtaposed = toMathML("2*t");
    assert.ok(juxtaposed?.includes("InvisibleTimes"));
    assert.ok(!juxtaposed?.includes("<mo>⋅</mo>"));
    const explicit = toMathML("1/2*9.8*2");
    assert.ok(explicit?.includes("<mo>⋅</mo>"));
    assert.ok(explicit?.includes("<mn>9.8</mn>"));
    assert.ok(explicit?.includes("<mn>2</mn>"));
  });
});
