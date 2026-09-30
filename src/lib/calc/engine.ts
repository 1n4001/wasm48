import { BLAS_B64 } from "./blas-bytes.ts";

export type Val =
  | { t: "s"; v: number }
  | { t: "m"; r: number; c: number; d: Float64Array }
  | { t: "sym"; text: string };

type Exports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  blas_init: () => void;
  reset_arena: () => void;
  alloc_f64: (n: number) => number;
  set_angle: (mode: number) => void;
  get_angle: () => number;
};

export class Engine {
  readonly bytes: Uint8Array;
  readonly memory: WebAssembly.Memory;
  readonly exp: Exports;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes as BufferSource), {});
    this.exp = instance.exports as Exports;
    this.memory = this.exp.memory;
    this.exp.blas_init();
  }

  resetArena() {
    this.exp.reset_arena();
  }

  alloc(n: number): number {
    const p = this.exp.alloc_f64(n);
    if (!p) throw new Error("Expression too large");
    return p;
  }

  read(ptr: number, n: number): Float64Array {
    const heap = new Float64Array(this.memory.buffer);
    return heap.slice(ptr / 8, ptr / 8 + n);
  }

  setAngle(mode: 0 | 1) {
    this.exp.set_angle(mode);
  }

  getAngle(): 0 | 1 {
    return this.exp.get_angle() === 0 ? 0 : 1;
  }
}

let cached: Uint8Array | null = null;

export function blasBytes(): Uint8Array {
  if (cached) return cached;
  const bin = atob(BLAS_B64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  cached = out;
  return out;
}

export function createEngine(): Engine {
  return new Engine(blasBytes());
}

export function scalar(v: number): Val {
  return { t: "s", v };
}

export function matrix(r: number, c: number, d: Float64Array): Val {
  if (r === 1 && c === 1) return { t: "s", v: d[0] ?? NaN };
  return { t: "m", r, c, d };
}

export function cloneVal(v: Val): Val {
  if (v.t === "s") return { t: "s", v: v.v };
  if (v.t === "sym") return { t: "sym", text: v.text };
  return { t: "m", r: v.r, c: v.c, d: new Float64Array(v.d) };
}

export function valData(v: Val): { r: number; c: number; d: Float64Array } {
  if (v.t === "sym") throw new Error("Symbolic");
  if (v.t === "s") return { r: 1, c: 1, d: new Float64Array([v.v]) };
  return { r: v.r, c: v.c, d: v.d };
}
