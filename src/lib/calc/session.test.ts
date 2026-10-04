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

  it("differentiates, integrates, and samples a graph", () => {
    const session = bootSession();
    session.runSource("diff(x^2, x)");
    const diff = session.stack.at(-1);
    assert.equal(diff?.t, "sym");
    if (diff?.t === "sym") assert.equal(diff.text, "2*x");

    session.runSource("diff(x^2, x, 3)");
    const at = session.stack.at(-1);
    assert.equal(at?.t, "s");
    if (at?.t === "s") assert.equal(at.v, 6);

    session.runSource("integ(x^2, x, 0, 1)");
    const area = session.stack.at(-1);
    assert.equal(area?.t, "s");
    if (area?.t === "s") assert.ok(Math.abs(area.v - 1 / 3) < 1e-4);

    session.runSource("integ(sin(x), x, 0, pi)");
    const sine = session.stack.at(-1);
    assert.equal(sine?.t, "s");
    if (sine?.t === "s") assert.ok(Math.abs(sine.v - 2) < 1e-3);

    session.runSource("integ(x^2, x)");
    const cubic = session.stack.at(-1);
    assert.equal(cubic?.t, "sym");
    if (cubic?.t === "sym") assert.equal(cubic.text, "x^3/3");
    session.runSource("integ(sin(x), x)");
    const wave = session.stack.at(-1);
    assert.equal(wave?.t, "sym");
    if (wave?.t === "sym") assert.equal(wave.text, "-cos(x)");
    session.runSource("f(t) = 1/2*9.8*t^2+2*t+3");
    session.runSource("integ(f, t)");
    const motion = session.stack.at(-1);
    assert.equal(motion?.t, "sym");
    if (motion?.t === "sym") {
      session.runSource(`diff(${motion.text}, t, 2)`);
      const back = session.stack.at(-1);
      assert.equal(back?.t, "s");
      if (back?.t === "s") assert.ok(Math.abs(back.v - 26.6) < 1e-9);
    }

    session.runSource("plot(sin(x), x, 0, pi)");
    const plot = session.face().plot;
    assert.equal(plot?.kind, "xy");
    if (plot?.kind === "xy") {
      assert.ok(plot.sample((plot.a + plot.b) / 2) > 0.9);
    }

    session.runSource("plot(sin(33*x), x, 0, 2*pi)");
    const fast = session.face().plot;
    assert.equal(fast?.kind, "xy");
    if (fast?.kind === "xy") assert.ok(Math.abs(fast.sample(Math.PI / 66) - 1) < 1e-9);

    session.runSource("surf(x^2 - y^2, x, -1, 1, y, -1, 1)");
    assert.equal(session.face().plot?.kind, "xyz");
  });

  it("addresses the stack and copies a script form", () => {
    const session = bootSession();
    assert.equal(session.runSource("1+2"), true);
    assert.equal(session.runSource("stk(1)+1"), true);
    const top = session.face().levels.at(-1);
    assert.equal(top?.text, "4");
    assert.equal(top?.expr, "1+2+1");
    assert.equal(session.levelScript(1), "1+2+1");
    assert.equal(session.runSource("stk(9)"), false);
    assert.equal(session.face().message, "Bad Level");
  });

  it("defines a function, its derivative, and a composition", () => {
    const session = bootSession();
    session.runSource("f(t) = t^2");
    session.runSource("g(x) = f(x)+1");
    session.runSource("g(3)");
    const value = session.stack.at(-1);
    assert.equal(value?.t, "s");
    if (value?.t === "s") assert.equal(value.v, 10);
    session.runSource("f'(t)");
    const deriv = session.stack.at(-1);
    assert.equal(deriv?.t, "sym");
    if (deriv?.t === "sym") assert.equal(deriv.text, "2*t");
    session.runSource("f'(4)");
    const at = session.stack.at(-1);
    assert.equal(at?.t, "s");
    if (at?.t === "s") assert.equal(at.v, 8);
    const shown = session.face().vars.find((row) => row.name.startsWith("f"));
    assert.equal(shown?.name, "f(t)");

    session.runSource("h(t) = 1/2*9.8*t^2+2*t+3");
    session.runSource("h'(t)");
    const slope = session.stack.at(-1);
    assert.equal(slope?.t, "sym");
    if (slope?.t === "sym") assert.equal(slope.text, "9.8*t+2");
    session.runSource("p(t) = 1/2*9.8*t^2+2*t+3");
    session.runSource("q(x) = p(x)+1");
    session.runSource("q(x)");
    const simplified = session.stack.at(-1);
    assert.equal(simplified?.t, "sym");
    if (simplified?.t === "sym") assert.equal(simplified.text, "4.9*x^2+2*x+4");

    session.runSource("syms a v p");
    assert.ok(session.face().vars.some((row) => row.id === "a" && row.symbol));
    session.runSource("s(t) = 1/2*a*t^2+v*t+p");
    session.runSource("s(t)");
    const position = session.stack.at(-1);
    assert.equal(position?.t, "sym");
    if (position?.t === "sym") assert.equal(position.text, "1/2*a*t^2+v*t+p");
    assert.equal(session.face().levels.at(-1)?.expr, "s(t)");
    session.runSource("s'(t)");
    const velocity = session.stack.at(-1);
    assert.equal(velocity?.t, "sym");
    if (velocity?.t === "sym") assert.equal(velocity.text, "a*t+v");
    session.runSource("fp(t) = 1/2*a*t^2+v*t+p");
    session.runSource("fv(t) = fp'(t)");
    session.runSource("fp(t)");
    const fp = session.stack.at(-1);
    assert.equal(fp?.t, "sym");
    if (fp?.t === "sym") assert.equal(fp.text, "1/2*a*t^2+v*t+p");
    session.runSource("fv(t)");
    const fv = session.stack.at(-1);
    assert.equal(fv?.t, "sym");
    if (fv?.t === "sym") assert.equal(fv.text, "a*t+v");
    assert.equal(session.face().levels.at(-1)?.expr, "fv(t)");
    session.runSource("a = 9.8");
    session.runSource("s'(t)");
    const plugged = session.stack.at(-1);
    assert.equal(plugged?.t, "sym");
    if (plugged?.t === "sym") assert.equal(plugged.text, "9.8*t+v");
    session.runSource("clear v");
    assert.equal(session.face().vars.some((row) => row.id === "v"), false);
    session.forget("p");
    assert.equal(session.face().vars.some((row) => row.id === "p"), false);

    session.runSource("solve(2*x+y==5, x-y==1, [x, y])");
    const system = session.stack.at(-1);
    assert.equal(system?.t, "m");
    if (system?.t === "m") {
      assert.equal(system.r, 2);
      assert.ok(Math.abs((system.d[0] ?? 0) - 2) < 1e-9);
      assert.ok(Math.abs((system.d[1] ?? 0) - 1) < 1e-9);
    }
    const x = session.face().vars.find((row) => row.id === "x");
    const y = session.face().vars.find((row) => row.id === "y");
    assert.equal(x?.text, "2");
    assert.equal(y?.text, "1");
    session.runSource("syms a");
    session.runSource("solve(u+w==a, u-w==1, [u, w])");
    const parametric = session.stack.at(-1);
    assert.equal(parametric?.t, "sym");
    if (parametric?.t === "sym") assert.equal(parametric.text, "u = (a+1)/2\nw = (a-1)/2");
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
