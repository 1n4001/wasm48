/** Minimal WebAssembly binary encoder for the calculator VM and expression compiler. */

export const I32 = 0x7f;
export const F64 = 0x7c;
export const EMPTY = 0x40;

export const OP = {
  block: 0x02,
  loop: 0x03,
  if: 0x04,
  else: 0x05,
  end: 0x0b,
  br: 0x0c,
  brIf: 0x0d,
  return: 0x0f,
  call: 0x10,
  drop: 0x1a,
  localGet: 0x20,
  localSet: 0x21,
  globalGet: 0x23,
  globalSet: 0x24,
  f64Load: 0x2b,
  f64Store: 0x39,
  i32Const: 0x41,
  f64Const: 0x44,
  i32Eqz: 0x45,
  i32Eq: 0x46,
  i32Ne: 0x47,
  i32LtS: 0x48,
  i32GtS: 0x4a,
  i32GeS: 0x4e,
  f64Eq: 0x5b,
  f64Ne: 0x5c,
  f64Lt: 0x5d,
  f64Gt: 0x5e,
  i32Add: 0x6a,
  i32Sub: 0x6b,
  i32Mul: 0x6c,
  f64Abs: 0x99,
  f64Neg: 0x9a,
  f64Ceil: 0x9b,
  f64Floor: 0x9c,
  f64Trunc: 0x9d,
  f64Nearest: 0x9e,
  f64Sqrt: 0x9f,
  f64Add: 0xa0,
  f64Sub: 0xa1,
  f64Mul: 0xa2,
  f64Div: 0xa3,
  i32TruncF64S: 0xaa,
  f64ConvertI32S: 0xbc,
} as const;

export function uleb(n: number): number[] {
  if (!Number.isInteger(n) || n < 0) throw new Error(`uleb ${n}`);
  const out: number[] = [];
  do {
    let b = n & 0x7f;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}

export function sleb(value: number): number[] {
  if (!Number.isInteger(value)) throw new Error(`sleb ${value}`);
  const out: number[] = [];
  let more = true;
  while (more) {
    let byte = value & 0x7f;
    value >>= 7;
    const sign = (byte & 0x40) !== 0;
    if ((value === 0 && !sign) || (value === -1 && sign)) more = false;
    else byte |= 0x80;
    out.push(byte);
  }
  return out;
}

export function f64Bytes(n: number): number[] {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, n, true);
  return [...new Uint8Array(buf)];
}

function utf8(s: string): number[] {
  return [...new TextEncoder().encode(s)];
}

function vecName(s: string): number[] {
  const b = utf8(s);
  return [...uleb(b.length), ...b];
}

export class Asm {
  buf: number[] = [];
  u8(n: number) {
    this.buf.push(n & 0xff);
  }
  bytes(xs: number[]) {
    for (const x of xs) this.buf.push(x & 0xff);
  }
  op(n: number) {
    this.u8(n);
  }
  i32(n: number) {
    this.op(OP.i32Const);
    this.bytes(sleb(n));
  }
  f64(n: number) {
    this.op(OP.f64Const);
    this.bytes(f64Bytes(n));
  }
  localGet(i: number) {
    this.op(OP.localGet);
    this.bytes(uleb(i));
  }
  localSet(i: number) {
    this.op(OP.localSet);
    this.bytes(uleb(i));
  }
  globalGet(i: number) {
    this.op(OP.globalGet);
    this.bytes(uleb(i));
  }
  globalSet(i: number) {
    this.op(OP.globalSet);
    this.bytes(uleb(i));
  }
  call(i: number) {
    this.op(OP.call);
    this.bytes(uleb(i));
  }
  f64Load() {
    this.op(OP.f64Load);
    this.bytes(uleb(3));
    this.bytes(uleb(0));
  }
  f64Store() {
    this.op(OP.f64Store);
    this.bytes(uleb(3));
    this.bytes(uleb(0));
  }
  end() {
    this.op(OP.end);
  }
}

type FuncRec = { type: number; locals: number[]; body: number[] };

function groupLocals(locals: number[]): { count: number; type: number }[] {
  const groups: { count: number; type: number }[] = [];
  for (const t of locals) {
    const last = groups[groups.length - 1];
    if (last && last.type === t) last.count += 1;
    else groups.push({ count: 1, type: t });
  }
  return groups;
}

function encodeBody(locals: number[], body: number[]): number[] {
  const groups = groupLocals(locals);
  const inner: number[] = [...uleb(groups.length)];
  for (const g of groups) inner.push(...uleb(g.count), g.type);
  inner.push(...body);
  return [...uleb(inner.length), ...inner];
}

function section(id: number, content: number[]): number[] {
  return [id, ...uleb(content.length), ...content];
}

export class WasmModule {
  private types: { params: number[]; results: number[] }[] = [];
  private imports: { mod: string; name: string; type: number }[] = [];
  private funcs: FuncRec[] = [];
  private globals: { type: number; mut: boolean; init: number[] }[] = [];
  private memoryMin: number | null = null;
  private memoryImport: { mod: string; name: string; min: number } | null = null;
  private exports: { name: string; kind: number; index: number }[] = [];

  addType(params: number[], results: number[]): number {
    const idx = this.types.length;
    this.types.push({ params, results });
    return idx;
  }

  /** Returns the function index in the combined import+local space. */
  addImport(mod: string, name: string, type: number): number {
    const idx = this.imports.length;
    this.imports.push({ mod, name, type });
    return idx;
  }

  addMemory(min: number) {
    this.memoryMin = min;
  }

  /** Import a memory (kind 0x02) after the function imports. */
  addMemoryImport(mod: string, name: string, min: number) {
    this.memoryImport = { mod, name, min };
  }

  /** `init` is an initializer expression without the terminating end. */
  addGlobal(type: number, mut: boolean, init: number[]): number {
    const idx = this.globals.length;
    this.globals.push({ type, mut, init });
    return idx;
  }

  addFunc(type: number, locals: number[], body: number[]): number {
    const idx = this.imports.length + this.funcs.length;
    this.funcs.push({ type, locals, body });
    return idx;
  }

  exportFunc(name: string, index: number) {
    this.exports.push({ name, kind: 0x00, index });
  }

  exportMemory(name: string) {
    this.exports.push({ name, kind: 0x02, index: 0 });
  }

  toBytes(): Uint8Array {
    const typeBody: number[] = [...uleb(this.types.length)];
    for (const t of this.types) {
      typeBody.push(0x60, ...uleb(t.params.length), ...t.params, ...uleb(t.results.length), ...t.results);
    }

    const parts: number[][] = [section(1, typeBody)];

    const importCount = this.imports.length + (this.memoryImport ? 1 : 0);
    if (importCount) {
      const imp: number[] = [...uleb(importCount)];
      for (const im of this.imports) {
        imp.push(...vecName(im.mod), ...vecName(im.name), 0x00, ...uleb(im.type));
      }
      if (this.memoryImport) {
        const mi = this.memoryImport;
        imp.push(...vecName(mi.mod), ...vecName(mi.name), 0x02, 0x00, ...uleb(mi.min));
      }
      parts.push(section(2, imp));
    }

    const fnSec: number[] = [...uleb(this.funcs.length)];
    for (const f of this.funcs) fnSec.push(...uleb(f.type));
    parts.push(section(3, fnSec));

    if (this.memoryMin !== null) {
      parts.push(section(5, [...uleb(1), 0x00, ...uleb(this.memoryMin)]));
    }

    if (this.globals.length) {
      const g: number[] = [...uleb(this.globals.length)];
      for (const gl of this.globals) {
        g.push(gl.type, gl.mut ? 0x01 : 0x00, ...gl.init, OP.end);
      }
      parts.push(section(6, g));
    }

    const ex: number[] = [...uleb(this.exports.length)];
    for (const e of this.exports) {
      ex.push(...vecName(e.name), e.kind, ...uleb(e.index));
    }
    parts.push(section(7, ex));

    const code: number[] = [...uleb(this.funcs.length)];
    for (const f of this.funcs) code.push(...encodeBody(f.locals, f.body));
    parts.push(section(10, code));

    const flat = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
    for (const p of parts) flat.push(...p);
    return new Uint8Array(flat);
  }
}
