import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatTick, niceStep, tickValues } from "./ticks.ts";

describe("plot ticks", () => {
  it("picks a 1-2-5 step", () => {
    assert.equal(niceStep(10, 400), 2);
    assert.equal(niceStep(100, 300), 20);
    assert.equal(niceStep(1, 200), 0.5);
    assert.equal(niceStep(0.03, 180), 0.01);
  });

  it("lands on the step, including zero", () => {
    const ticks = tickValues(-1, 1, 0.5).map((n) => formatTick(n, 0.5));
    assert.deepEqual(ticks, ["-1", "-0.5", "0", "0.5", "1"]);
  });

  it("drops trailing zeros", () => {
    assert.equal(formatTick(2, 1), "2");
    assert.equal(formatTick(1, 0.5), "1");
    assert.equal(formatTick(-0, 1), "0");
  });
});
