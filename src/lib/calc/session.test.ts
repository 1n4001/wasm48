import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bootSession } from "./session.ts";

describe("rpn session", () => {
  it("adds in reverse polish and from a matlab line", () => {
    const session = bootSession();
    session.press("2");
    session.press("enter");
    session.press("3");
    session.press("enter");
    session.press("add");
    const top = session.stack.at(-1);
    assert.equal(top?.t, "s");
    if (top?.t === "s") assert.equal(top.v, 5);

    for (const id of ["2", "add", "3", "mul", "4", "enter"]) session.press(id);
    const next = session.stack.at(-1);
    assert.equal(next?.t, "s");
    if (next?.t === "s") assert.equal(next.v, 14);
    assert.ok(session.bytes > 40);
  });

  it("shows an unlimited stack with infix over the result", () => {
    const session = bootSession();
    for (const id of ["1", "enter", "2", "enter", "add"]) session.press(id);
    const levels = session.face().levels;
    assert.equal(levels.length, 1);
    assert.equal(levels[0]?.level, 1);
    assert.equal(levels[0]?.expr, "1+2");
    assert.equal(levels[0]?.text, "3");

    for (const id of ["4", "enter", "mul"]) session.press(id);
    const next = session.face().levels.at(-1);
    assert.equal(next?.expr, "(1+2)*4");
    assert.equal(next?.text, "12");

    session.press("5");
    session.press("enter");
    assert.equal(session.face().levels.length, 2);
  });

  it("multiplies matrices through the command line", () => {
    const session = bootSession();
    for (const ch of "[1 2; 3 4]*[5 6; 7 8]") {
      if (ch === "*") session.press("mul");
      else if (ch === "[") session.press("lbracket");
      else if (ch === "]") session.press("rbracket");
      else if (ch === " ") session.press("spc");
      else if (ch === ";") session.insertChar(";");
      else session.press(ch);
    }
    session.press("enter");
    const top = session.stack.at(-1);
    assert.equal(top?.t, "m");
    if (top?.t === "m") {
      assert.ok(Math.abs(top.d[0]! - 19) < 1e-9);
      assert.ok(Math.abs(top.d[3]! - 50) < 1e-9);
    }
    assert.match(session.listing, /dgemm/);
  });
});
