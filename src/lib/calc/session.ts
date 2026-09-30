import { type Engine, type Val, cloneVal, createEngine } from "./engine.ts";
import { formatMath, formatShort, formatVal, scriptForm } from "./format.ts";
import { EXAMPLES, FUNCTIONS, runScript } from "./matlab.ts";
import type { PlotSpec } from "./matlab.ts";

export { EXAMPLES, FUNCTIONS };

type MenuAct =
  | { t: "stack"; op: "dup" | "drop" | "swap" | "over" | "rot" | "unrot" | "last" }
  | { t: "unary"; expr: string }
  | { t: "insert"; s: string }
  | { t: "binop"; op: string }
  | { t: "angle"; mode: 0 | 1 }
  | { t: "clear" }
  | { t: "undo" };

type MenuItem = { label: string; act: MenuAct };

const MENUS: { title: string; items: MenuItem[] }[] = [
  {
    title: "STACK",
    items: [
      { label: "DUP", act: { t: "stack", op: "dup" } },
      { label: "DROP", act: { t: "stack", op: "drop" } },
      { label: "SWAP", act: { t: "stack", op: "swap" } },
      { label: "OVER", act: { t: "stack", op: "over" } },
      { label: "ROT", act: { t: "stack", op: "rot" } },
      { label: "LAST", act: { t: "stack", op: "last" } },
    ],
  },
  {
    title: "MAT",
    items: [
      { label: "TRN", act: { t: "unary", expr: "(__x)'" } },
      { label: "INV", act: { t: "unary", expr: "inv(__x)" } },
      { label: "DET", act: { t: "unary", expr: "det(__x)" } },
      { label: "EYE", act: { t: "insert", s: "eye(" } },
      { label: "ZER", act: { t: "insert", s: "zeros(" } },
      { label: "NRM", act: { t: "unary", expr: "norm(__x)" } },
    ],
  },
  {
    title: "TRIG",
    items: [
      { label: "SIN", act: { t: "unary", expr: "sin(__x)" } },
      { label: "COS", act: { t: "unary", expr: "cos(__x)" } },
      { label: "TAN", act: { t: "unary", expr: "tan(__x)" } },
      { label: "ASIN", act: { t: "unary", expr: "asin(__x)" } },
      { label: "ACOS", act: { t: "unary", expr: "acos(__x)" } },
      { label: "ATAN", act: { t: "unary", expr: "atan(__x)" } },
    ],
  },
  {
    title: "EXP",
    items: [
      { label: "LN", act: { t: "unary", expr: "log(__x)" } },
      { label: "LOG", act: { t: "unary", expr: "log10(__x)" } },
      { label: "EXP", act: { t: "unary", expr: "exp(__x)" } },
      { label: "SQRT", act: { t: "unary", expr: "sqrt(__x)" } },
      { label: "ABS", act: { t: "unary", expr: "abs(__x)" } },
      { label: "SUM", act: { t: "unary", expr: "sum(__x)" } },
    ],
  },
  {
    title: "MODE",
    items: [
      { label: "DEG", act: { t: "angle", mode: 1 } },
      { label: "RAD", act: { t: "angle", mode: 0 } },
      { label: "PI", act: { t: "insert", s: "pi" } },
      { label: "E", act: { t: "insert", s: "e" } },
      { label: "CLR", act: { t: "clear" } },
      { label: "UNDO", act: { t: "undo" } },
    ],
  },
  {
    title: "CALC",
    items: [
      { label: "DIFF", act: { t: "insert", s: "diff(" } },
      { label: "INT", act: { t: "insert", s: "integ(" } },
      { label: "PLOT", act: { t: "insert", s: "plot(" } },
      { label: "SURF", act: { t: "insert", s: "surf(" } },
      { label: "ROOT", act: { t: "insert", s: "nthroot(" } },
      { label: "CBRT", act: { t: "insert", s: "cbrt(" } },
    ],
  },
];

export type KeyFace = {
  id: string;
  label: string;
  hint?: string;
  legendL?: string;
  legendR?: string;
  alpha?: string;
  variant: "dark" | "light" | "purple" | "green" | "enter";
  span?: 2;
  legend: boolean;
};

export const KEY_ROWS: KeyFace[][] = [
  [
    { id: "mth", label: "MTH", legendL: "RAD", legendR: "DEG", alpha: "G", variant: "dark", legend: true },
    { id: "prg", label: "PRG", legendL: "DUP", alpha: "H", variant: "dark", legend: true },
    { id: "cst", label: "CST", legendR: "EQW", alpha: "I", variant: "dark", legend: true },
    { id: "var", label: "VAR", alpha: "J", variant: "dark", legend: true },
    { id: "rot", label: "ROT", legendR: "R↓", alpha: "K", variant: "dark", legend: true },
    { id: "nxt", label: "NXT", legendL: "PREV", alpha: "L", variant: "dark", legend: true },
  ],
  [
    { id: "lparen", label: "(", alpha: "M", variant: "dark", legend: true },
    { id: "rparen", label: ")", legendL: ",", legendR: ";", alpha: "N", variant: "dark", legend: true },
    { id: "lbracket", label: "[", legendL: ":", alpha: "O", variant: "dark", legend: true },
    { id: "rbracket", label: "]", alpha: "P", variant: "dark", legend: true },
    { id: "eq", label: "=", alpha: "Q", variant: "dark", legend: true },
    { id: "tick", label: "'", legendL: ":'", alpha: "R", variant: "dark", legend: true },
  ],
  [
    { id: "sin", label: "SIN", legendL: "ASIN", legendR: "SINH", alpha: "S", variant: "dark", legend: true },
    { id: "cos", label: "COS", legendL: "ACOS", legendR: "COSH", alpha: "T", variant: "dark", legend: true },
    { id: "tan", label: "TAN", legendL: "ATAN", legendR: "TANH", alpha: "U", variant: "dark", legend: true },
    { id: "sqrt", label: "√", legendL: "x²", alpha: "V", variant: "dark", legend: true },
    { id: "pow", label: "yˣ", legendL: ".^", alpha: "W", variant: "dark", legend: true },
    { id: "inv", label: "1/x", legendL: "EXP", legendR: "LN", alpha: "X", variant: "dark", legend: true },
  ],
  [
    { id: "enter", label: "ENTER", variant: "enter", span: 2, legend: true },
    { id: "chs", label: "+/−", alpha: "Y", variant: "dark", legend: true },
    { id: "eex", label: "EEX", alpha: "Z", variant: "dark", legend: true },
    { id: "del", label: "DEL", legendR: "CLR", variant: "dark", legend: true },
    { id: "drop", label: "DROP", variant: "dark", legend: true },
  ],
  [
    { id: "alpha", label: "α", variant: "light", legend: true },
    { id: "7", label: "7", variant: "light", legend: true },
    { id: "8", label: "8", variant: "light", legend: true },
    { id: "9", label: "9", variant: "light", legend: true },
    { id: "div", label: "÷", legendL: "\\", variant: "dark", span: 2, legend: true },
  ],
  [
    { id: "shiftl", label: "◀", variant: "purple", legend: true },
    { id: "4", label: "4", variant: "light", legend: true },
    { id: "5", label: "5", variant: "light", legend: true },
    { id: "6", label: "6", variant: "light", legend: true },
    { id: "mul", label: "×", legendL: ".*", variant: "dark", span: 2, legend: true },
  ],
  [
    { id: "shiftr", label: "▶", variant: "green", legend: true },
    { id: "1", label: "1", variant: "light", legend: true },
    { id: "2", label: "2", variant: "light", legend: true },
    { id: "3", label: "3", variant: "light", legend: true },
    { id: "sub", label: "−", variant: "dark", span: 2, legend: true },
  ],
  [
    { id: "on", label: "ON", variant: "dark", legend: true },
    { id: "0", label: "0", variant: "light", legend: true },
    { id: "dot", label: ".", variant: "light", legend: true },
    { id: "spc", label: "SPC", legendL: "π", variant: "light", legend: true },
    { id: "add", label: "+", variant: "dark", span: 2, legend: true },
  ],
];

type Shift = "none" | "l" | "r";
type Alpha = "off" | "once" | "lock";

type Snap = { stack: Val[]; scope: Map<string, Val>; last: Val | null };

export type LogLine = { name: string; text: string };

export type FaceState = {
  levels: { level: number; expr: string; text: string }[];
  matrix: string | null;
  command: string;
  message: string | null;
  shift: Shift;
  alpha: Alpha;
  angle: "RAD" | "DEG";
  menuTitle: string;
  menuLabels: string[];
  bytes: number;
  listing: string;
  vars: { name: string; text: string }[];
  log: LogLine[];
  xFull: string;
  plot: PlotSpec | null;
};

const STORE_KEY = "caliber48";

function lineEndsOpen(line: string): boolean {
  return /(?:[[(+\-*/\\^=,:;e.]|\.\*|\.\/|\.\\|\.\^)$/i.test(line.trim());
}

export class Session {
  readonly engine: Engine;
  stack: Val[] = [];
  scope = new Map<string, Val>();
  line = "";
  shift: Shift = "none";
  alpha: Alpha = "off";
  menu = 0;
  message: string | null = null;
  listing = "";
  bytes = 0;
  lastBytes: Uint8Array<ArrayBufferLike> = new Uint8Array();
  log: LogLine[] = [];
  plot: PlotSpec | null = null;
  private last: Val | null = null;
  private exprs = new WeakMap<Val, string>();
  private undoStack: Snap[] = [];
  private listeners = new Set<() => void>();

  constructor(engine: Engine) {
    this.engine = engine;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  face(): FaceState {
    const size = this.stack.length;
    const levels = this.stack.map((value, index) => ({
      level: size - index,
      expr: this.exprOf(value),
      text: formatMath(value),
    }));
    const top = this.stack[size - 1];
    const matrix = top && top.t === "m" && top.r * top.c > 1 ? formatVal(top) : null;
    const labels =
      this.alpha === "off"
        ? MENUS[this.menu]!.items.map((item) => item.label)
        : ["A", "B", "C", "D", "E", "F"];
    const vars = [...this.scope.entries()]
      .filter(([name]) => name !== "ans")
      .map(([name, value]) => ({
        name: value.t === "fn" ? `${name}(${value.params.join(", ")})` : name,
        text: formatMath(value),
      }));
    return {
      levels,
      matrix,
      command: this.line,
      message: this.message,
      shift: this.shift,
      alpha: this.alpha,
      angle: this.engine.getAngle() === 1 ? "DEG" : "RAD",
      menuTitle: this.alpha === "off" ? MENUS[this.menu]!.title : "ALPHA",
      menuLabels: labels,
      bytes: this.bytes,
      listing: this.listing,
      vars,
      log: this.log,
      xFull: top && top.t !== "sym" ? formatVal(top) : "",
      plot: this.plot,
    };
  }

  press(id: string): "script" | "vars" | null {
    const msg = this.message;
    this.message = null;
    if (id === "on") {
      this.cancel();
      this.emit();
      return null;
    }
    if (id === "shiftl" || id === "shiftr") {
      const side: Shift = id === "shiftl" ? "l" : "r";
      this.shift = this.shift === side ? "none" : side;
      this.emit();
      return null;
    }
    if (id === "alpha") {
      this.alpha = this.alpha === "off" ? "once" : this.alpha === "once" ? "lock" : "off";
      this.shift = "none";
      this.emit();
      return null;
    }
    if (msg && id.startsWith("soft")) {
      /* the key still runs */
    }
    const shifted = this.shift;
    this.shift = "none";
    if (id.startsWith("soft")) {
      const index = Number(id.slice(4));
      if (this.alpha !== "off") {
        this.insertChar("ABCDEF"[index] ?? "");
        if (this.alpha === "once") this.alpha = "off";
        this.emit();
        return null;
      }
      this.runAct(MENUS[this.menu]!.items[index]!.act);
      this.emit();
      return null;
    }
    const key = KEY_ROWS.flat().find((item) => item.id === id);
    if (this.alpha !== "off" && key?.alpha && shifted === "none") {
      this.insertChar(key.alpha);
      if (this.alpha === "once") this.alpha = "off";
      this.emit();
      return null;
    }
    const effect = this.dispatch(id, shifted);
    this.emit();
    return effect;
  }

  insertChar(ch: string) {
    this.line += ch;
  }

  typeText(ch: string) {
    this.message = null;
    this.insertChar(ch);
    this.emit();
  }

  runSource(src: string): boolean {
    this.message = null;
    const ok = this.execSource(src, true);
    this.emit();
    return ok;
  }

  notify(message: string) {
    this.message = message;
    this.emit();
  }

  levelScript(level: number): string {
    const value = this.stack[this.stack.length - level];
    return value ? scriptForm(this.exprOf(value)) : "";
  }

  restore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        stack: Serialized[];
        exprs?: string[];
        scope: [string, Serialized][];
        line: string;
        angle: 0 | 1;
        menu: number;
      };
      this.stack = data.stack.map((value, index) => {
        const hydrated = hydrate(value);
        this.exprs.set(hydrated, data.exprs?.[index] || formatShort(hydrated));
        return hydrated;
      });
      this.scope = new Map(data.scope.map(([name, value]) => [name, hydrate(value)]));
      this.line = data.line ?? "";
      this.menu = data.menu ?? 0;
      this.engine.setAngle(data.angle === 1 ? 1 : 0);
    } catch {
      /* ignore broken saves */
    }
  }

  persist() {
    const data = {
      stack: this.stack.map(dehydrate),
      exprs: this.stack.map((value) => this.exprOf(value)),
      scope: [...this.scope.entries()].map(([name, value]) => [name, dehydrate(value)]),
      line: this.line,
      angle: this.engine.getAngle(),
      menu: this.menu,
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  }

  private dispatch(id: string, shift: Shift): "script" | "vars" | null {
    if (shift === "l") {
      const left: Record<string, () => void> = {
        mth: () => this.setAngle(0),
        prg: () => this.stackOp("dup"),
        nxt: () => this.stepMenu(-1),
        rparen: () => this.insertChar(","),
        lbracket: () => this.insertChar(":"),
        tick: () => this.insertChar(".'"),
        sin: () => this.applyFn("asin(__x)", "asin("),
        cos: () => this.applyFn("acos(__x)", "acos("),
        tan: () => this.applyFn("atan(__x)", "atan("),
        sqrt: () => this.applyFn("(__x)^2", "^2"),
        pow: () => this.applyBin(".^", ".^"),
        inv: () => this.applyFn("exp(__x)", "exp("),
        del: () => this.clearStack(),
        div: () => this.applyBin("\\", "\\"),
        mul: () => this.applyBin(".*", ".*"),
        spc: () => this.insertChar("pi"),
      };
      const fn = left[id];
      if (!fn) this.message = "No Function";
      else fn();
      return null;
    }
    if (shift === "r") {
      const right: Record<string, () => void> = {
        mth: () => this.setAngle(1),
        cst: () => undefined,
        rot: () => this.stackOp("unrot"),
        rparen: () => this.insertChar(";"),
        sin: () => this.applyFn("sinh(__x)", "sinh("),
        cos: () => this.applyFn("cosh(__x)", "cosh("),
        tan: () => this.applyFn("tanh(__x)", "tanh("),
        inv: () => this.applyFn("log(__x)", "log("),
        del: () => this.clearStack(),
      };
      if (id === "cst") return "script";
      const fn = right[id];
      if (!fn) this.message = "No Function";
      else fn();
      return null;
    }
    switch (id) {
      case "mth":
        this.menu = 2;
        return null;
      case "prg":
        this.menu = 0;
        return null;
      case "cst":
        return "script";
      case "var":
        return "vars";
      case "rot":
        this.stackOp("rot");
        return null;
      case "nxt":
        this.stepMenu(1);
        return null;
      case "lparen":
        this.insertChar("(");
        return null;
      case "rparen":
        this.insertChar(")");
        return null;
      case "lbracket":
        this.insertChar("[");
        return null;
      case "rbracket":
        this.insertChar("]");
        return null;
      case "eq":
        this.insertChar("=");
        return null;
      case "tick":
        this.applyFn("(__x)'", "'");
        return null;
      case "sin":
        this.applyFn("sin(__x)", "sin(");
        return null;
      case "cos":
        this.applyFn("cos(__x)", "cos(");
        return null;
      case "tan":
        this.applyFn("tan(__x)", "tan(");
        return null;
      case "sqrt":
        this.applyFn("sqrt(__x)", "sqrt(");
        return null;
      case "pow":
        this.applyBin("^", "^");
        return null;
      case "inv":
        this.applyFn("1/(__x)", "1/");
        return null;
      case "enter":
        this.enter();
        return null;
      case "chs":
        this.chs();
        return null;
      case "eex":
        this.insertChar("e");
        return null;
      case "del":
        this.del();
        return null;
      case "drop":
        this.stackOp("drop");
        return null;
      case "alpha":
        return null;
      case "div":
        this.applyBin("/", "/");
        return null;
      case "mul":
        this.applyBin("*", "*");
        return null;
      case "sub":
        this.applyBin("-", "-");
        return null;
      case "add":
        this.applyBin("+", "+");
        return null;
      case "spc":
        this.insertChar(" ");
        return null;
      case "dot":
        this.insertChar(".");
        return null;
      case "on":
        this.cancel();
        return null;
      default:
        if (/^\d$/.test(id)) this.insertChar(id);
        return null;
    }
  }

  private runAct(act: MenuAct) {
    switch (act.t) {
      case "stack":
        this.stackOp(act.op);
        break;
      case "unary":
        this.applyFn(act.expr, act.expr.includes("(") ? act.expr.slice(0, act.expr.indexOf("(") + 1) : "");
        break;
      case "insert":
        this.insertChar(act.s);
        break;
      case "binop":
        this.applyBin(act.op, act.op);
        break;
      case "angle":
        this.setAngle(act.mode);
        break;
      case "clear":
        this.clearStack();
        break;
      case "undo":
        this.undo();
        break;
    }
  }

  private setAngle(mode: 0 | 1) {
    this.engine.setAngle(mode);
  }

  private stepMenu(dir: number) {
    this.menu = (this.menu + dir + MENUS.length) % MENUS.length;
  }

  private cancel() {
    this.line = "";
    this.shift = "none";
    this.alpha = "off";
    this.message = null;
  }

  private del() {
    if (this.line) this.line = this.line.slice(0, -1);
    else this.stackOp("drop");
  }

  private enter() {
    if (!this.line.trim()) {
      this.stackOp("dup");
      return;
    }
    if (!this.execSource(this.line, true)) return;
    this.line = "";
    if (this.alpha !== "lock") this.alpha = "off";
  }

  private chs() {
    if (this.line) {
      this.line = this.line.startsWith("-") ? this.line.slice(1) : `-${this.line}`;
      return;
    }
    this.applyFn("-(__x)", "-");
  }

  private clearStack() {
    this.checkpoint();
    this.stack = [];
    this.line = "";
  }

  private stackOp(op: "dup" | "drop" | "swap" | "over" | "rot" | "unrot" | "last") {
    if (op === "last") {
      if (!this.last) {
        this.message = "No Last";
        return;
      }
      this.checkpoint();
      this.stack.push(this.keep(this.last));
      return;
    }
    if (op === "dup") {
      if (!this.stack.length) {
        this.message = "Too Few Arguments";
        return;
      }
      this.checkpoint();
      this.stack.push(this.keep(this.stack[this.stack.length - 1]!));
      return;
    }
    if (op === "drop") {
      if (!this.stack.length) {
        this.message = "Too Few Arguments";
        return;
      }
      this.checkpoint();
      this.stack.pop();
      return;
    }
    if (op === "swap" || op === "over") {
      if (this.stack.length < 2) {
        this.message = "Too Few Arguments";
        return;
      }
      this.checkpoint();
      const x = this.stack.pop()!;
      const y = this.stack.pop()!;
      if (op === "swap") this.stack.push(x, y);
      else this.stack.push(y, x, this.keep(y));
      return;
    }
    if (this.stack.length < 3) {
      this.message = "Too Few Arguments";
      return;
    }
    this.checkpoint();
    const x = this.stack.pop()!;
    const y = this.stack.pop()!;
    const z = this.stack.pop()!;
    if (op === "rot") this.stack.push(y, x, z);
    else this.stack.push(x, z, y);
  }

  private applyBin(op: string, insert: string) {
    if (this.line.trim()) {
      this.insertChar(insert);
      return;
    }
    if (this.stack.length < 2) {
      this.message = "Too Few Arguments";
      return;
    }
    this.checkpoint();
    const x = this.stack.pop()!;
    const y = this.stack.pop()!;
    const yExpr = this.exprOf(y);
    const xExpr = this.exprOf(x);
    this.last = this.keep(x);
    const scope = new Map(this.scope);
    scope.set("__y", y);
    scope.set("__x", x);
    const result = runScript(`__y ${op} __x`, scope, this.engine);
    if (!result.ok || !result.pushed[0]) {
      this.revert();
      this.message = result.ok ? "Bad Size" : result.error;
      return;
    }
    this.note(result.listing, result.bytes);
    this.stack.push(this.tag(result.pushed[0], infix(op, yExpr, xExpr)));
  }

  private applyFn(expr: string, insert: string) {
    if (this.line.trim() && lineEndsOpen(this.line)) {
      if (insert) this.insertChar(insert);
      return;
    }
    if (this.line.trim()) {
      if (!this.execSource(this.line, true)) return;
      this.line = "";
    }
    if (!this.stack.length) {
      if (insert && insert !== "'" && insert !== ".'" && insert !== "^2") this.insertChar(insert);
      else this.message = "Too Few Arguments";
      return;
    }
    this.checkpoint();
    const x = this.stack.pop()!;
    const xExpr = this.exprOf(x);
    this.last = this.keep(x);
    const scope = new Map(this.scope);
    scope.set("__x", x);
    const result = runScript(expr, scope, this.engine);
    if (!result.ok || !result.pushed[0]) {
      this.revert();
      this.message = result.ok ? "Bad Size" : result.error;
      return;
    }
    this.note(result.listing, result.bytes);
    this.stack.push(this.tag(result.pushed[0], unaryExpr(expr, xExpr)));
  }

  private execSource(src: string, push: boolean): boolean {
    const trimmed = src.trim();
    if (!trimmed) return true;
    let expanded = trimmed;
    try {
      expanded = this.expandStack(trimmed);
    } catch {
      this.message = "Bad Level";
      return false;
    }
    this.checkpoint();
    const result = runScript(expanded, this.scope, this.engine);
    if (!result.ok) {
      this.revert();
      this.message = result.error;
      return false;
    }
    this.note(result.listing, result.bytes);
    if (result.plot) {
      this.plot = result.plot;
      if (!result.pushed.length) this.message = "Plotted";
    }
    for (const row of result.printed) {
      this.log = [...this.log, { name: row.name, text: formatVal(row.value) }].slice(-8);
    }
    if (push) {
      result.pushed.forEach((value, index) => {
        this.stack.push(this.tag(value, result.pushedExpr[index] ?? trimmed));
      });
    }
    return true;
  }

  private expandStack(src: string): string {
    return src.replace(/\bstk\(\s*(\d+)\s*\)/gi, (_full, raw: string) => {
      const level = Number(raw);
      const value = this.stack[this.stack.length - level];
      if (!Number.isInteger(level) || level < 1 || !value) throw new Error("bad");
      return `(${scriptForm(this.exprOf(value))})`;
    });
  }

  private note(listing: string, bytes: Uint8Array<ArrayBufferLike>) {
    this.listing = listing;
    this.bytes = bytes.byteLength;
    this.lastBytes = bytes;
  }

  private exprOf(value: Val): string {
    return this.exprs.get(value) ?? formatShort(value);
  }

  private keep(value: Val): Val {
    const copy = cloneVal(value);
    this.exprs.set(copy, this.exprOf(value));
    return copy;
  }

  private tag(value: Val, expr: string): Val {
    const copy = cloneVal(value);
    this.exprs.set(copy, expr);
    return copy;
  }

  private checkpoint() {
    this.undoStack.push(this.capture());
    if (this.undoStack.length > 30) this.undoStack.shift();
  }

  private revert() {
    const snap = this.undoStack.pop();
    if (snap) this.apply(snap);
  }

  private undo() {
    const snap = this.undoStack.pop();
    if (!snap) {
      this.message = "Nothing to Undo";
      return;
    }
    this.apply(snap);
  }

  private capture(): Snap {
    const scope = new Map<string, Val>();
    for (const [name, value] of this.scope) scope.set(name, cloneVal(value));
    return {
      stack: this.stack.map((value) => this.keep(value)),
      scope,
      last: this.last ? this.keep(this.last) : null,
    };
  }

  private apply(snap: Snap) {
    this.stack = snap.stack;
    this.scope = snap.scope;
    this.last = snap.last;
  }
}

type Serialized =
  | { t: "s"; v: number }
  | { t: "m"; r: number; c: number; d: number[] }
  | { t: "sym"; text: string }
  | { t: "fn"; params: string[]; body: string };

function dehydrate(v: Val): Serialized {
  if (v.t === "s") return { t: "s", v: v.v };
  if (v.t === "sym") return { t: "sym", text: v.text };
  if (v.t === "fn") return { t: "fn", params: v.params, body: v.body };
  return { t: "m", r: v.r, c: v.c, d: [...v.d] };
}

function hydrate(v: Serialized): Val {
  if (v.t === "s") return { t: "s", v: v.v };
  if (v.t === "sym") return { t: "sym", text: v.text };
  if (v.t === "fn") return { t: "fn", params: v.params, body: v.body };
  return { t: "m", r: v.r, c: v.c, d: new Float64Array(v.d) };
}

function infix(op: string, y: string, x: string): string {
  return `${side(y, op, "L")}${op}${side(x, op, "R")}`;
}

function unaryExpr(template: string, inner: string): string {
  if (template === "-(__x)") return topPrec(inner) < 5 ? `-(${inner})` : `-${inner}`;
  if (template === "(__x)'") return `${topPrec(inner) < 4 ? `(${inner})` : inner}'`;
  if (template === "(__x)^2") return `${side(inner, "^", "L")}^2`;
  if (template === "1/(__x)") return `1/${side(inner, "/", "R")}`;
  const call = /^([A-Za-z]\w*)\(__x\)$/.exec(template);
  if (call) return `${call[1]}(${inner})`;
  return template.replaceAll("__x", inner);
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

function side(text: string, op: string, edge: "L" | "R"): string {
  const need = BIN_PREC[op] ?? 1;
  const have = topPrec(text);
  const rightAssoc = op === "^" || op === ".^";
  if (have < need) return `(${text})`;
  if (have === need && edge === "R" && (op === "-" || op === "/" || op === "\\" || op === "./" || op === ".\\" || rightAssoc)) {
    return `(${text})`;
  }
  if (have === need && edge === "L" && rightAssoc) return `(${text})`;
  return text;
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

export function bootSession(): Session {
  return new Session(createEngine());
}
