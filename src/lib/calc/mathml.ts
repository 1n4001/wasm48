import { formatNum } from "./format.ts";
import { parseDisplay, type Expr } from "./matlab.ts";

type Piece = { xml: string; prec: number; atom: "num" | "id" | "other" };

const FUN = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh", "floor", "ceil", "round"]);

export function toMathML(source: string): string | null {
  const expr = parseDisplay(source);
  if (!expr) return null;
  const body = render(expr).xml;
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline">${body}</math>`;
}

function render(e: Expr): Piece {
  switch (e.k) {
    case "num":
      return renderNum(e.v);
    case "name":
      return renderName(e.s);
    case "unary": {
      const a = render(e.a);
      return { xml: `<mrow><mo>−</mo>${paren(a, 4)}</mrow>`, prec: 4, atom: "other" };
    }
    case "trans": {
      const a = render(e.a);
      const base = a.prec < 5 ? paren(a, 6) : a.xml;
      return { xml: `<msup>${base}<mi mathvariant="normal">T</mi></msup>`, prec: 5, atom: "other" };
    }
    case "colon": {
      const parts = [render(e.a).xml, e.step ? render(e.step).xml : "", render(e.b).xml].filter(Boolean);
      return { xml: `<mrow>${parts.join('<mo>:</mo>')}</mrow>`, prec: 6, atom: "other" };
    }
    case "mat":
      return {
        xml: `<mrow><mo>[</mo><mtable rowspacing="0.4em" columnspacing="0.6em">${e.rows
          .map((row) => `<mtr>${row.map((cell) => `<mtd>${render(cell).xml}</mtd>`).join("")}</mtr>`)
          .join("")}</mtable><mo>]</mo></mrow>`,
        prec: 6,
        atom: "other",
      };
    case "call":
      return renderCall(e.name.toLowerCase(), e.args);
    case "bin":
      return renderBin(e.op, e.a, e.b);
    default:
      return { xml: "<mrow></mrow>", prec: 6, atom: "other" };
  }
}

function renderBin(op: string, a: Expr, b: Expr): Piece {
  if (op === "/" || op === "./") {
    return { xml: `<mfrac>${render(a).xml}${render(b).xml}</mfrac>`, prec: 6, atom: "other" };
  }
  if (op === ".\\") {
    return { xml: `<mfrac>${render(b).xml}${render(a).xml}</mfrac>`, prec: 6, atom: "other" };
  }
  if (op === "\\") {
    const left = render(a);
    const right = render(b);
    const base = left.prec < 5 ? paren(left, 6) : left.xml;
    return {
      xml: `<mrow><msup>${base}<mrow><mo>−</mo><mn>1</mn></mrow></msup><mo>&InvisibleTimes;</mo>${paren(right, 2)}</mrow>`,
      prec: 2,
      atom: "other",
    };
  }
  if (op === "^" || op === ".^") {
    const base = render(a);
    const exp = render(b);
    const shown = base.prec < 5 ? paren(base, 6) : base.xml;
    return { xml: `<msup>${shown}${exp.xml}</msup>`, prec: 3, atom: "other" };
  }
  const left = render(a);
  const right = render(b);
  if (op === "*" || op === ".*") {
    const symbol = op === ".*" ? "⊙" : left.atom === "num" && right.atom === "num" ? "×" : "";
    const opXml = symbol ? `<mo>${symbol}</mo>` : `<mo>&InvisibleTimes;</mo>`;
    return {
      xml: `<mrow>${paren(left, 2)}${opXml}${paren(right, op === "*" ? 2.1 : 2)}</mrow>`,
      prec: 2,
      atom: "other",
    };
  }
  const symbol = op === "-" ? "−" : op;
  const prec = op === "+" || op === "-" ? 1 : 2;
  return {
    xml: `<mrow>${paren(left, prec)}${`<mo>${symbol}</mo>`}${paren(right, prec + 0.1)}</mrow>`,
    prec,
    atom: "other",
  };
}

function renderCall(name: string, args: Expr[]): Piece {
  const [x, y, z] = args;
  if (name === "dot" && x && y && args.length === 2) {
    return { xml: `<mrow>${paren(render(x), 2)}<mo>·</mo>${paren(render(y), 2)}</mrow>`, prec: 2, atom: "other" };
  }
  if (name === "cross" && x && y && args.length === 2) {
    return { xml: `<mrow>${paren(render(x), 2)}<mo>×</mo>${paren(render(y), 2)}</mrow>`, prec: 2, atom: "other" };
  }
  if (name === "sqrt" && x && args.length === 1) {
    return { xml: `<msqrt>${render(x).xml}</msqrt>`, prec: 6, atom: "other" };
  }
  if (name === "abs" && x && args.length === 1) {
    return { xml: `<mrow><mo>|</mo>${render(x).xml}<mo>|</mo></mrow>`, prec: 6, atom: "other" };
  }
  if (name === "det" && x && args.length === 1) {
    return { xml: `<mrow><mo>|</mo>${render(x).xml}<mo>|</mo></mrow>`, prec: 6, atom: "other" };
  }
  if (name === "norm" && x && args.length === 1) {
    return { xml: `<mrow><mo>‖</mo>${render(x).xml}<mo>‖</mo></mrow>`, prec: 6, atom: "other" };
  }
  if (name === "inv" && x && args.length === 1) {
    const base = render(x);
    const shown = base.prec < 5 ? paren(base, 6) : base.xml;
    return { xml: `<msup>${shown}<mrow><mo>−</mo><mn>1</mn></mrow></msup>`, prec: 3, atom: "other" };
  }
  if ((name === "transpose") && x && args.length === 1) {
    const base = render(x);
    const shown = base.prec < 5 ? paren(base, 6) : base.xml;
    return { xml: `<msup>${shown}<mi mathvariant="normal">T</mi></msup>`, prec: 5, atom: "other" };
  }
  if (name === "exp" && x && args.length === 1) {
    return { xml: `<msup><mi>e</mi>${render(x).xml}</msup>`, prec: 3, atom: "other" };
  }
  if ((name === "log" || name === "ln") && x && args.length === 1) {
    return fn("ln", [x]);
  }
  if (name === "log10" && x && args.length === 1) {
    return {
      xml: `<mrow><msub><mi mathvariant="normal">log</mi><mn>10</mn></msub><mo>(</mo>${render(x).xml}<mo>)</mo></mrow>`,
      prec: 6,
      atom: "other",
    };
  }
  if (name === "diff" && x && y?.k === "name") {
    const body = render(x);
    const deriv = `<mfrac><mi mathvariant="normal">d</mi><mrow><mi mathvariant="normal">d</mi>${renderName(y.s).xml}</mrow></mfrac><mspace width="0.15em"/>${paren(body, 3)}`;
    if (z) {
      return {
        xml: `<msub><mrow>${deriv}</mrow><mrow>${renderName(y.s).xml}<mo>=</mo>${render(z).xml}</mrow></msub>`,
        prec: 6,
        atom: "other",
      };
    }
    return { xml: `<mrow>${deriv}</mrow>`, prec: 6, atom: "other" };
  }
  if (name === "integ" && x && y?.k === "name" && z && args[3]) {
    return {
      xml: `<mrow><msubsup><mo>∫</mo>${render(z).xml}${render(args[3]).xml}</msubsup><mspace width="0.2em"/>${paren(render(x), 3)}<mspace width="0.15em"/><mi mathvariant="normal">d</mi>${renderName(y.s).xml}</mrow>`,
      prec: 6,
      atom: "other",
    };
  }
  if (name === "sum" && x && args.length === 1) {
    return { xml: `<mrow><mo>∑</mo>${paren(render(x), 3)}</mrow>`, prec: 6, atom: "other" };
  }
  if (FUN.has(name) && x && args.length === 1) return fn(name, [x]);
  return fn(name, args);
}

function fn(name: string, args: Expr[]): Piece {
  const inner = args.map((arg) => render(arg).xml).join("<mo>,</mo>");
  return {
    xml: `<mrow><mi mathvariant="normal">${esc(name)}</mi><mo>(</mo>${inner}<mo>)</mo></mrow>`,
    prec: 6,
    atom: "other",
  };
}

function renderNum(n: number): Piece {
  if (!Number.isFinite(n)) return { xml: `<mi mathvariant="normal">${esc(formatNum(n))}</mi>`, prec: 6, atom: "id" };
  const text = formatNum(n);
  const sci = /^(-?)(\d+\.?\d*)e(-?\d+)$/.exec(text);
  if (sci) {
    const sign = sci[1] ? "<mo>−</mo>" : "";
    const exp = sci[3]!.startsWith("-") ? `<mrow><mo>−</mo><mn>${sci[3]!.slice(1)}</mn></mrow>` : `<mn>${sci[3]}</mn>`;
    return {
      xml: `<mrow>${sign}<mn>${sci[2]}</mn><mo>×</mo><msup><mn>10</mn>${exp}</msup></mrow>`,
      prec: sci[1] ? 4 : 2,
      atom: "other",
    };
  }
  if (text.startsWith("-")) return { xml: `<mrow><mo>−</mo><mn>${text.slice(1)}</mn></mrow>`, prec: 4, atom: "other" };
  return { xml: `<mn>${esc(text)}</mn>`, prec: 6, atom: "num" };
}

function renderName(name: string): Piece {
  if (name === "pi") return { xml: "<mi>π</mi>", prec: 6, atom: "id" };
  const variant = name.length === 1 ? "" : ` mathvariant="normal"`;
  return { xml: `<mi${variant}>${esc(name)}</mi>`, prec: 6, atom: "id" };
}

function paren(piece: Piece, min: number): string {
  if (piece.prec >= min) return piece.xml;
  return `<mrow><mo>(</mo>${piece.xml}<mo>)</mo></mrow>`;
}

function esc(text: string): string {
  return text.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}
