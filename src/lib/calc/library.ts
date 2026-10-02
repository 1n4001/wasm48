export const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  g0: 9.80665,
  G: 6.6743e-11,
  clight: 299792458,
  hplanck: 6.62607015e-34,
  hbar: 6.62607015e-34 / (2 * Math.PI),
  kB: 1.380649e-23,
  eps0: 8.8541878128e-12,
  mu0: 1.25663706212e-6,
  qe: 1.602176634e-19,
  NA: 6.02214076e23,
  Rgas: 8.314462618,
  sigmaSB: 5.670374419e-8,
  me: 9.1093837139e-31,
  mp: 1.67262192595e-27,
  atm: 101325,
};

const G = CONSTANTS.G;
const G0 = CONSTANTS.g0;
const EPS0 = CONSTANTS.eps0;

export type ElemSpec = { op: number; min: number; max: number; defaults?: number[] };

export const ELEM_SPEC: Record<string, ElemSpec> = {
  sign: { op: 1, min: 1, max: 1 },
  log2: { op: 2, min: 1, max: 1 },
  factorial: { op: 3, min: 1, max: 1 },
  gamma: { op: 4, min: 1, max: 1 },
  gammaln: { op: 5, min: 1, max: 1 },
  erf: { op: 6, min: 1, max: 1 },
  erfc: { op: 7, min: 1, max: 1 },
  sinc: { op: 8, min: 1, max: 1 },
  deg2rad: { op: 9, min: 1, max: 1 },
  rad2deg: { op: 10, min: 1, max: 1 },
  asinh: { op: 11, min: 1, max: 1 },
  acosh: { op: 12, min: 1, max: 1 },
  atanh: { op: 13, min: 1, max: 1 },
  heaviside: { op: 14, min: 1, max: 1 },
  harmonic: { op: 15, min: 1, max: 1 },
  zeta: { op: 16, min: 1, max: 1 },
  atan2: { op: 17, min: 2, max: 2 },
  hypot: { op: 18, min: 2, max: 2 },
  mod: { op: 19, min: 2, max: 2 },
  rem: { op: 20, min: 2, max: 2 },
  gcd: { op: 21, min: 2, max: 2 },
  lcm: { op: 22, min: 2, max: 2 },
  nchoosek: { op: 23, min: 2, max: 2 },
  npr: { op: 24, min: 2, max: 2 },
  beta: { op: 25, min: 2, max: 2 },
  clamp: { op: 26, min: 3, max: 3 },
  normpdf: { op: 29, min: 1, max: 3, defaults: [0, 1] },
  normcdf: { op: 30, min: 1, max: 3, defaults: [0, 1] },
  binopdf: { op: 31, min: 3, max: 3 },
  binocdf: { op: 32, min: 3, max: 3 },
  poisspdf: { op: 33, min: 2, max: 2 },
  poisscdf: { op: 34, min: 2, max: 2 },
  momentum: { op: 35, min: 2, max: 2 },
  kinetic: { op: 36, min: 2, max: 2 },
  weight: { op: 37, min: 1, max: 2, defaults: [G0] },
  grav: { op: 38, min: 3, max: 3 },
  orbitv: { op: 39, min: 2, max: 2 },
  escape: { op: 40, min: 2, max: 2 },
  coulomb: { op: 41, min: 3, max: 3 },
  efield: { op: 42, min: 2, max: 2 },
  vfield: { op: 43, min: 2, max: 2 },
  current: { op: 44, min: 2, max: 2 },
  voltage: { op: 45, min: 2, max: 2 },
  epower: { op: 46, min: 2, max: 2 },
  cap: { op: 47, min: 2, max: 2 },
  cenergy: { op: 48, min: 2, max: 2 },
  magforce: { op: 49, min: 3, max: 3 },
  cyclotron: { op: 50, min: 3, max: 3 },
  rcyc: { op: 51, min: 4, max: 4 },
  flux: { op: 52, min: 3, max: 3 },
  hydro: { op: 53, min: 2, max: 2 },
  buoyant: { op: 54, min: 2, max: 2 },
  bernoulli: { op: 55, min: 4, max: 4 },
  reynolds: { op: 56, min: 4, max: 4 },
  stokes: { op: 57, min: 3, max: 3 },
  qflow: { op: 58, min: 2, max: 2 },
};

export const MIN2 = 27;
export const MAX2 = 28;

export const AGG = {
  mean: 1,
  median: 2,
  std: 3,
  stdPop: 4,
  variance: 5,
  varPop: 6,
  min: 7,
  max: 8,
  prod: 9,
  cov: 10,
  corr: 11,
  zscore: 12,
  quantile: 13,
} as const;

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lngamma(z: number): number {
  if (!Number.isFinite(z)) return NaN;
  if (z < 0.5) return Math.log(Math.abs(gamma(z)));
  let x = 0.99999999999980993;
  const w = z - 1;
  for (let i = 0; i < LANCZOS.length; i++) x += LANCZOS[i]! / (w + i + 1);
  const t = w + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (w + 0.5) * Math.log(t) - t + Math.log(x);
}

export function gamma(z: number): number {
  if (!Number.isFinite(z)) return NaN;
  const n = Math.round(z);
  if (z <= 0 && Math.abs(z - n) < 1e-10) return NaN;
  if (z < 0.5) {
    const s = Math.sin(Math.PI * z);
    if (s === 0) return NaN;
    return Math.PI / (s * gamma(1 - z));
  }
  return Math.exp(lngamma(z));
}

function nearInt(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return Math.abs(n - r) < 1e-8 ? r : null;
}

function factorial(n: number): number {
  const k = nearInt(n);
  if (k !== null && k >= 0 && k <= 170) {
    let f = 1;
    for (let i = 2; i <= k; i++) f *= i;
    return f;
  }
  if (k !== null && k < 0) return NaN;
  return gamma(n + 1);
}

function nchoosek(n: number, k: number): number {
  const ni = nearInt(n);
  const ki = nearInt(k);
  if (ni !== null && ki !== null) {
    if (ki < 0 || ni < 0) return NaN;
    if (ki > ni) return 0;
    const kk = Math.min(ki, ni - ki);
    let c = 1;
    for (let i = 1; i <= kk; i++) c = (c * (ni - kk + i)) / i;
    return c;
  }
  return Math.exp(lngamma(n + 1) - lngamma(k + 1) - lngamma(n - k + 1));
}

function npr(n: number, k: number): number {
  const ni = nearInt(n);
  const ki = nearInt(k);
  if (ni === null || ki === null || ki < 0 || ni < 0) return NaN;
  if (ki > ni) return 0;
  let p = 1;
  for (let i = 0; i < ki; i++) p *= ni - i;
  return p;
}

function igcd(a: number, b: number): number {
  const ai = nearInt(a);
  const bi = nearInt(b);
  if (ai === null || bi === null) return NaN;
  let x = Math.abs(ai);
  let y = Math.abs(bi);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

function erf(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-ax * ax);
  return sign * y;
}

function binopdf(k: number, n: number, p: number): number {
  const ki = nearInt(k);
  const ni = nearInt(n);
  if (ki === null || ni === null || p < 0 || p > 1 || ni < 0 || ni > 100000) return NaN;
  if (ki < 0 || ki > ni) return 0;
  if (p === 0) return ki === 0 ? 1 : 0;
  if (p === 1) return ki === ni ? 1 : 0;
  return Math.exp(lngamma(ni + 1) - lngamma(ki + 1) - lngamma(ni - ki + 1) + ki * Math.log(p) + (ni - ki) * Math.log(1 - p));
}

function poisspdf(k: number, lambda: number): number {
  const ki = nearInt(k);
  if (ki === null || !(lambda >= 0) || ki < 0 || ki > 100000) return NaN;
  if (lambda === 0) return ki === 0 ? 1 : 0;
  return Math.exp(-lambda + ki * Math.log(lambda) - lngamma(ki + 1));
}

function inverseSquare(scale: number, r: number): number {
  if (r === 0) return NaN;
  return scale / (r * r);
}

export function padElem(spec: ElemSpec, args: number[]): number[] {
  const full = args.slice();
  const missing = spec.max - full.length;
  const defaults = spec.defaults ?? [];
  for (let i = defaults.length - missing; i < defaults.length; i++) full.push(defaults[i]!);
  return full;
}

export function evalElem(op: number, args: number[]): number {
  const [a = NaN, b = NaN, c = NaN, d = NaN] = args;
  switch (op) {
    case 1:
      return a === 0 ? 0 : Math.sign(a);
    case 2:
      return Math.log2(a);
    case 3:
      return factorial(a);
    case 4:
      return gamma(a);
    case 5:
      return lngamma(a);
    case 6:
      return erf(a);
    case 7:
      return 1 - erf(a);
    case 8:
      return a === 0 ? 1 : Math.sin(Math.PI * a) / (Math.PI * a);
    case 9:
      return (a * Math.PI) / 180;
    case 10:
      return (a * 180) / Math.PI;
    case 11:
      return Math.asinh(a);
    case 12:
      return Math.acosh(a);
    case 13:
      return Math.atanh(a);
    case 14:
      return a < 0 ? 0 : a > 0 ? 1 : 0.5;
    case 15: {
      const k = nearInt(a);
      if (k === null || k < 1 || k > 1_000_000) return NaN;
      let s = 0;
      for (let i = 1; i <= k; i++) s += 1 / i;
      return s;
    }
    case 16: {
      if (!(a > 1)) return a === 1 ? Infinity : NaN;
      let sum = 0;
      for (let n = 1; n <= 100000; n++) {
        const t = n ** -a;
        sum += t;
        if (t < 1e-16) break;
      }
      return sum;
    }
    case 17:
      return Math.atan2(a, b);
    case 18:
      return Math.hypot(a, b);
    case 19:
      return b === 0 ? NaN : a - b * Math.floor(a / b);
    case 20:
      return b === 0 ? NaN : a % b;
    case 21:
      return igcd(a, b);
    case 22: {
      const g = igcd(a, b);
      if (!Number.isFinite(g) || g === 0) return g === 0 ? 0 : NaN;
      return Math.abs((nearInt(a)! / g) * nearInt(b)!);
    }
    case 23:
      return nchoosek(a, b);
    case 24:
      return npr(a, b);
    case 25:
      return Math.exp(lngamma(a) + lngamma(b) - lngamma(a + b));
    case 26:
      return Math.min(Math.max(a, b), c);
    case MIN2:
      return Math.min(a, b);
    case MAX2:
      return Math.max(a, b);
    case 29: {
      if (!(c > 0)) return NaN;
      const z = (a - b) / c;
      return Math.exp(-0.5 * z * z) / (c * Math.sqrt(2 * Math.PI));
    }
    case 30:
      return c > 0 ? 0.5 * (1 + erf((a - b) / (c * Math.SQRT2))) : NaN;
    case 31:
      return binopdf(a, b, c);
    case 32: {
      const ki = nearInt(a);
      const ni = nearInt(b);
      if (ki === null || ni === null || c < 0 || c > 1) return NaN;
      if (ki < 0) return 0;
      if (ki >= ni) return 1;
      let s = 0;
      for (let i = 0; i <= ki; i++) s += binopdf(i, ni, c);
      return Math.min(1, s);
    }
    case 33:
      return poisspdf(a, b);
    case 34: {
      const ki = nearInt(a);
      if (ki === null || !(b >= 0)) return NaN;
      if (ki < 0) return 0;
      let s = 0;
      for (let i = 0; i <= ki; i++) s += poisspdf(i, b);
      return Math.min(1, s);
    }
    case 35:
      return a * b;
    case 36:
      return 0.5 * a * b * b;
    case 37:
      return a * b;
    case 38:
      return inverseSquare(G * a * b, c);
    case 39:
      return cOrbits(a, b, 1);
    case 40:
      return cOrbits(a, b, 2);
    case 41:
      return inverseSquare(a * b / (4 * Math.PI * EPS0), c);
    case 42:
      return inverseSquare(a / (4 * Math.PI * EPS0), b);
    case 43:
      return b === 0 ? NaN : a / (4 * Math.PI * EPS0 * b);
    case 44:
      return b === 0 ? NaN : a / b;
    case 45:
      return a * b;
    case 46:
      return a * b;
    case 47:
      return b === 0 ? NaN : a / b;
    case 48:
      return 0.5 * a * b * b;
    case 49:
      return a * b * c;
    case 50:
      return c === 0 ? NaN : Math.abs(a) * b / c;
    case 51:
      return c === 0 || d === 0 ? NaN : (a * b) / (Math.abs(c) * d);
    case 52:
      return a * b * Math.cos(c);
    case 53:
      return a * G0 * b;
    case 54:
      return a * b * G0;
    case 55:
      return a + 0.5 * b * c * c + b * G0 * d;
    case 56:
      return d === 0 ? NaN : (a * b * c) / d;
    case 57:
      return 6 * Math.PI * a * b * c;
    case 58:
      return a * b;
    default:
      return NaN;
  }
}

function cOrbits(mass: number, r: number, k: number): number {
  if (!(r > 0) || mass < 0) return NaN;
  return Math.sqrt((k * G * mass) / r);
}

function mean(xs: number[]): number {
  if (!xs.length) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function moment(xs: number[], pop: boolean): number {
  if (xs.length < (pop ? 1 : 2)) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (pop ? xs.length : xs.length - 1);
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((p, q) => p - q);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

function covariance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return NaN;
  const ma = mean(a);
  const mb = mean(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += ((a[i] ?? 0) - ma) * ((b[i] ?? 0) - mb);
  return s / (a.length - 1);
}

function zvalues(xs: number[]): number[] {
  const m = mean(xs);
  const s = Math.sqrt(moment(xs, false));
  return xs.map((x) => (s === 0 || !Number.isFinite(s) ? NaN : (x - m) / s));
}

function quantile(data: number[], p: number): number {
  if (!(p >= 0 && p <= 1)) return NaN;
  const xs = data.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!xs.length) return NaN;
  if (xs.length === 1) return xs[0]!;
  const h = p * (xs.length - 1);
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  if (lo === hi) return xs[lo]!;
  return xs[lo]! * (hi - h) + xs[hi]! * (h - lo);
}

function reduce(op: number, xs: number[]): number {
  switch (op) {
    case AGG.mean:
      return mean(xs);
    case AGG.median:
      return median(xs);
    case AGG.std:
      return Math.sqrt(moment(xs, false));
    case AGG.stdPop:
      return Math.sqrt(moment(xs, true));
    case AGG.variance:
      return moment(xs, false);
    case AGG.varPop:
      return moment(xs, true);
    case AGG.min:
      return xs.reduce((m, x) => Math.min(m, x), Infinity);
    case AGG.max:
      return xs.reduce((m, x) => Math.max(m, x), -Infinity);
    case AGG.prod:
      return xs.reduce((p, x) => p * x, 1);
    default:
      return NaN;
  }
}

function copyAt(heap: Float64Array, index: number, n: number): number[] {
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = heap[index + i] ?? NaN;
  return out;
}

export function runAgg(heap: Float64Array, op: number, rows: number, cols: number, x: number, y: number, yn: number, dest: number): void {
  const n = rows * cols;
  const data = copyAt(heap, x, n);
  if (op === AGG.cov || op === AGG.corr) {
    const other = copyAt(heap, y, yn);
    const cv = covariance(data, other);
    heap[dest] = op === AGG.corr ? cv / (Math.sqrt(moment(data, false)) * Math.sqrt(moment(other, false))) : cv;
    return;
  }
  if (op === AGG.zscore) {
    const write = (col: number[], at: number) => {
      const z = zvalues(col);
      for (let i = 0; i < z.length; i++) heap[at + i] = z[i] ?? NaN;
    };
    if (rows === 1 || cols === 1) write(data, dest);
    else for (let j = 0; j < cols; j++) write(data.slice(j * rows, (j + 1) * rows), dest + j * rows);
    return;
  }
  if (op === AGG.quantile) {
    const ps = copyAt(heap, y, yn);
    for (let i = 0; i < yn; i++) heap[dest + i] = quantile(data, ps[i] ?? NaN);
    return;
  }
  if (rows === 1 || cols === 1) {
    heap[dest] = reduce(op, data);
    return;
  }
  for (let j = 0; j < cols; j++) heap[dest + j] = reduce(op, data.slice(j * rows, (j + 1) * rows));
}

export function foldCall(name: string, args: number[]): number | undefined {
  const spec = ELEM_SPEC[name];
  if (spec) {
    if (args.length < spec.min || args.length > spec.max) return undefined;
    return evalElem(spec.op, padElem(spec, args));
  }
  if ((name === "min" || name === "max") && args.length === 2) return name === "min" ? Math.min(args[0]!, args[1]!) : Math.max(args[0]!, args[1]!);
  if ((name === "mean" || name === "median" || name === "prod" || name === "min" || name === "max") && args.length === 1) return args[0];
  if ((name === "std" || name === "var" || name === "zscore") && args.length >= 1) return NaN;
  if (name === "quantile" && args.length === 2) return args[1]! >= 0 && args[1]! <= 1 ? args[0] : NaN;
  if ((name === "cov" || name === "corr") && args.length === 2) return NaN;
  return undefined;
}

export type FunctionRow = { group: string; name: string; args: string; about: string; example: string };

const constantRows: FunctionRow[] = [
  ["g0", "Standard gravity, 9.80665 m/s².", "g0"],
  ["G", "Gravitational constant, N·m²/kg².", "G"],
  ["clight", "Speed of light, m/s.", "clight"],
  ["hplanck", "Planck constant, J·s.", "hplanck"],
  ["hbar", "Reduced Planck constant, J·s.", "hbar"],
  ["kB", "Boltzmann constant, J/K.", "kB"],
  ["eps0", "Vacuum permittivity, F/m.", "eps0"],
  ["mu0", "Vacuum permeability, N/A².", "mu0"],
  ["qe", "Elementary charge, C. Euler's number stays e.", "qe"],
  ["NA", "Avogadro constant, 1/mol.", "NA"],
  ["Rgas", "Molar gas constant, J/(mol·K).", "Rgas"],
  ["sigmaSB", "Stefan–Boltzmann constant, W/(m²·K⁴).", "sigmaSB"],
  ["me", "Electron mass, kg.", "me"],
  ["mp", "Proton mass, kg.", "mp"],
  ["atm", "Standard atmosphere, 101325 Pa.", "atm"],
].map(([name, about, example]) => ({ group: "Constants", name: name!, args: "", about: about!, example: example! }));

export const FUNCTIONS: FunctionRow[] = [
  ...constantRows,
  { group: "Roots", name: "nthroot", args: "x, n", about: "Real nth root. Odd n keeps the sign.", example: "nthroot(-8, 3)" },
  { group: "Roots", name: "cbrt", args: "x", about: "Cube root.", example: "cbrt(-27)" },
  { group: "Roots", name: "sqrt", args: "x", about: "Square root.", example: "sqrt(2)" },
  { group: "Elementary", name: "abs", args: "x", about: "Absolute value.", example: "abs(-4)" },
  { group: "Elementary", name: "sign", args: "x", about: "Sign of x: −1, 0, or 1.", example: "sign(-3)" },
  { group: "Elementary", name: "exp", args: "x", about: "e to the x.", example: "exp(1)" },
  { group: "Elementary", name: "log", args: "x", about: "Natural log.", example: "log(e)" },
  { group: "Elementary", name: "log10", args: "x", about: "Base-10 log.", example: "log10(100)" },
  { group: "Elementary", name: "log2", args: "x", about: "Base-2 log.", example: "log2(8)" },
  { group: "Elementary", name: "sin", args: "x", about: "Sine. Honors DEG or RAD.", example: "sin(pi/2)" },
  { group: "Elementary", name: "cos", args: "x", about: "Cosine.", example: "cos(0)" },
  { group: "Elementary", name: "tan", args: "x", about: "Tangent.", example: "tan(pi/4)" },
  { group: "Elementary", name: "asin", args: "x", about: "Arcsine.", example: "asin(1)" },
  { group: "Elementary", name: "acos", args: "x", about: "Arccosine.", example: "acos(1)" },
  { group: "Elementary", name: "atan", args: "x", about: "Arctangent.", example: "atan(1)" },
  { group: "Elementary", name: "atan2", args: "y, x", about: "Four-quadrant arctangent, radians.", example: "atan2(1, -1)" },
  { group: "Elementary", name: "hypot", args: "x, y", about: "sqrt(x² + y²).", example: "hypot(3, 4)" },
  { group: "Elementary", name: "sinh", args: "x", about: "Hyperbolic sine.", example: "sinh(0)" },
  { group: "Elementary", name: "cosh", args: "x", about: "Hyperbolic cosine.", example: "cosh(0)" },
  { group: "Elementary", name: "tanh", args: "x", about: "Hyperbolic tangent.", example: "tanh(0)" },
  { group: "Elementary", name: "asinh", args: "x", about: "Inverse hyperbolic sine.", example: "asinh(0)" },
  { group: "Elementary", name: "acosh", args: "x", about: "Inverse hyperbolic cosine.", example: "acosh(1)" },
  { group: "Elementary", name: "atanh", args: "x", about: "Inverse hyperbolic tangent.", example: "atanh(0)" },
  { group: "Elementary", name: "floor", args: "x", about: "Round toward −∞.", example: "floor(1.7)" },
  { group: "Elementary", name: "ceil", args: "x", about: "Round toward +∞.", example: "ceil(1.2)" },
  { group: "Elementary", name: "round", args: "x", about: "Round to nearest.", example: "round(1.5)" },
  { group: "Elementary", name: "mod", args: "x, m", about: "Remainder with the sign of m.", example: "mod(-3, 2)" },
  { group: "Elementary", name: "rem", args: "x, m", about: "Remainder with the sign of x.", example: "rem(-3, 2)" },
  { group: "Elementary", name: "clamp", args: "x, lo, hi", about: "Clamp x into [lo, hi].", example: "clamp(5, 0, 3)" },
  { group: "Elementary", name: "heaviside", args: "x", about: "0 if x < 0, 1 if x > 0, 1/2 at 0.", example: "heaviside(-1)" },
  { group: "Elementary", name: "deg2rad", args: "x", about: "Degrees to radians.", example: "deg2rad(180)" },
  { group: "Elementary", name: "rad2deg", args: "x", about: "Radians to degrees.", example: "rad2deg(pi)" },
  { group: "Elementary", name: "sinc", args: "x", about: "sin(πx) / (πx), and 1 at 0.", example: "sinc(0)" },
  { group: "Special", name: "factorial", args: "n", about: "n!. Non-integers use Γ(n+1).", example: "factorial(5)" },
  { group: "Special", name: "gamma", args: "x", about: "Gamma function.", example: "gamma(0.5)" },
  { group: "Special", name: "gammaln", args: "x", about: "Log of |Γ(x)|.", example: "gammaln(5)" },
  { group: "Special", name: "beta", args: "x, y", about: "Beta function B(x, y).", example: "beta(2, 3)" },
  { group: "Special", name: "erf", args: "x", about: "Error function.", example: "erf(0)" },
  { group: "Special", name: "erfc", args: "x", about: "Complementary error function.", example: "erfc(0)" },
  { group: "Special", name: "nchoosek", args: "n, k", about: "Binomial coefficient.", example: "nchoosek(5, 2)" },
  { group: "Special", name: "npr", args: "n, k", about: "Permutations P(n, k).", example: "npr(5, 2)" },
  { group: "Special", name: "gcd", args: "a, b", about: "Greatest common divisor.", example: "gcd(12, 18)" },
  { group: "Special", name: "lcm", args: "a, b", about: "Least common multiple.", example: "lcm(4, 6)" },
  { group: "Special", name: "harmonic", args: "n", about: "nth harmonic number.", example: "harmonic(4)" },
  { group: "Special", name: "zeta", args: "s", about: "Riemann zeta for s > 1, truncated series.", example: "zeta(2)" },
  { group: "Statistics", name: "sum", args: "x", about: "Sum of a vector, or column sums of a matrix.", example: "sum([1 2 3])" },
  { group: "Statistics", name: "prod", args: "x", about: "Product of a vector, or of each column.", example: "prod([1 2 3 4])" },
  { group: "Statistics", name: "mean", args: "x", about: "Arithmetic mean. Matrices reduce down columns.", example: "mean([1 2 3 4])" },
  { group: "Statistics", name: "median", args: "x", about: "Median. Matrices reduce down columns.", example: "median([1 3 2])" },
  { group: "Statistics", name: "std", args: "x", about: "Sample standard deviation, N−1. std(x, 1) is population.", example: "std([1 2 3])" },
  { group: "Statistics", name: "var", args: "x", about: "Sample variance, N−1. var(x, 1) is population.", example: "var([1 2 3])" },
  { group: "Statistics", name: "min", args: "x", about: "Smallest entry, or column minima. min(a, b) is elementwise.", example: "min([3 1 2])" },
  { group: "Statistics", name: "max", args: "x", about: "Largest entry, or column maxima. max(a, b) is elementwise.", example: "max([3 1 2])" },
  { group: "Statistics", name: "quantile", args: "x, p", about: "Linear quantile. p is between 0 and 1.", example: "quantile([1 2 3 4], 0.5)" },
  { group: "Statistics", name: "zscore", args: "x", about: "Sample z-scores. Matrices are scored per column.", example: "zscore([1 2 3])" },
  { group: "Statistics", name: "cov", args: "x, y", about: "Sample covariance of two equal-length samples.", example: "cov([1 2 3], [2 4 6])" },
  { group: "Statistics", name: "corr", args: "x, y", about: "Pearson correlation.", example: "corr([1 2 3], [2 4 6])" },
  { group: "Probability", name: "normpdf", args: "x, mu, sigma", about: "Normal density. mu defaults to 0, sigma to 1.", example: "normpdf(0)" },
  { group: "Probability", name: "normcdf", args: "x, mu, sigma", about: "Normal cumulative distribution.", example: "normcdf(0)" },
  { group: "Probability", name: "binopdf", args: "k, n, p", about: "Binomial probability.", example: "binopdf(2, 4, 0.5)" },
  { group: "Probability", name: "binocdf", args: "k, n, p", about: "Binomial cumulative probability.", example: "binocdf(2, 4, 0.5)" },
  { group: "Probability", name: "poisspdf", args: "k, lambda", about: "Poisson probability.", example: "poisspdf(2, 1)" },
  { group: "Probability", name: "poisscdf", args: "k, lambda", about: "Poisson cumulative probability.", example: "poisscdf(2, 1)" },
  { group: "Newtonian", name: "momentum", args: "m, v", about: "Linear momentum m·v.", example: "momentum(2, 3)" },
  { group: "Newtonian", name: "kinetic", args: "m, v", about: "Kinetic energy ½mv².", example: "kinetic(2, 3)" },
  { group: "Newtonian", name: "weight", args: "m, g", about: "m·g. g defaults to g0.", example: "weight(2)" },
  { group: "Newtonian", name: "grav", args: "m1, m2, r", about: "Newton's gravity, G·m1·m2/r².", example: "grav(1, 1, 1)" },
  { group: "Newtonian", name: "orbitv", args: "M, r", about: "Circular orbit speed sqrt(GM/r).", example: "orbitv(5.972e24, 6.371e6)" },
  { group: "Newtonian", name: "escape", args: "M, r", about: "Escape speed sqrt(2GM/r).", example: "escape(5.972e24, 6.371e6)" },
  { group: "Electricity", name: "coulomb", args: "q1, q2, r", about: "Coulomb force. SI units.", example: "coulomb(qe, qe, 1e-10)" },
  { group: "Electricity", name: "efield", args: "q, r", about: "Point-charge electric field magnitude.", example: "efield(qe, 1)" },
  { group: "Electricity", name: "vfield", args: "q, r", about: "Point-charge electric potential.", example: "vfield(qe, 1)" },
  { group: "Electricity", name: "current", args: "V, R", about: "Ohm's law, I = V/R.", example: "current(12, 4)" },
  { group: "Electricity", name: "voltage", args: "I, R", about: "Ohm's law, V = IR.", example: "voltage(2, 4)" },
  { group: "Electricity", name: "epower", args: "I, V", about: "Electric power I·V.", example: "epower(2, 12)" },
  { group: "Electricity", name: "cap", args: "Q, V", about: "Capacitance Q/V.", example: "cap(1e-6, 5)" },
  { group: "Electricity", name: "cenergy", args: "C, V", about: "Energy stored in a capacitor, ½CV².", example: "cenergy(1e-6, 5)" },
  { group: "Magnetism", name: "magforce", args: "q, v, B", about: "Perpendicular magnetic force qvB.", example: "magforce(qe, 1e6, 0.1)" },
  { group: "Magnetism", name: "cyclotron", args: "q, B, m", about: "Cyclotron frequency |q|B/m.", example: "cyclotron(qe, 0.1, me)" },
  { group: "Magnetism", name: "rcyc", args: "m, v, q, B", about: "Cyclotron radius mv/(|q|B).", example: "rcyc(me, 1e6, qe, 0.1)" },
  { group: "Magnetism", name: "flux", args: "B, A, theta", about: "Magnetic flux BA cos θ. θ is radians.", example: "flux(0.2, 0.05, 0)" },
  { group: "Fluids", name: "hydro", args: "rho, h", about: "Gauge pressure ρ·g0·h.", example: "hydro(997, 10)" },
  { group: "Fluids", name: "buoyant", args: "rho, V", about: "Buoyant force ρ·V·g0.", example: "buoyant(997, 0.001)" },
  { group: "Fluids", name: "bernoulli", args: "P, rho, v, h", about: "Bernoulli head P + ½ρv² + ρ·g0·h.", example: "bernoulli(atm, 997, 2, 0)" },
  { group: "Fluids", name: "reynolds", args: "rho, v, L, mu", about: "Reynolds number ρvL/μ.", example: "reynolds(997, 1, 0.1, 1e-3)" },
  { group: "Fluids", name: "stokes", args: "mu, r, v", about: "Stokes drag 6πμrv.", example: "stokes(1e-3, 0.001, 0.2)" },
  { group: "Fluids", name: "qflow", args: "A, v", about: "Volume flow rate A·v.", example: "qflow(0.01, 2)" },
  { group: "Linear algebra", name: "norm", args: "x", about: "Euclidean norm.", example: "norm([3 4])" },
  { group: "Linear algebra", name: "dot", args: "a, b", about: "Dot product.", example: "dot([1 2], [3 4])" },
  { group: "Linear algebra", name: "cross", args: "a, b", about: "Cross product of length-3 vectors.", example: "cross([1;0;0], [0;1;0])" },
  { group: "Linear algebra", name: "det", args: "A", about: "Determinant.", example: "det([1 2; 3 4])" },
  { group: "Linear algebra", name: "inv", args: "A", about: "Inverse.", example: "inv([1 2; 3 4])" },
  { group: "Linear algebra", name: "transpose", args: "A", about: "Transpose. A' is the same.", example: "[1 2; 3 4]'" },
  { group: "Linear algebra", name: "trace", args: "A", about: "Trace.", example: "trace([1 2; 3 4])" },
  { group: "Linear algebra", name: "diag", args: "x", about: "Diagonal of a matrix, or a diagonal matrix from a vector.", example: "diag([1 2 3])" },
  { group: "Linear algebra", name: "eye", args: "n", about: "Identity. eye(r, c) is rectangular.", example: "eye(3)" },
  { group: "Linear algebra", name: "zeros", args: "n", about: "Zero matrix. zeros(r, c) sets the shape.", example: "zeros(2, 3)" },
  { group: "Linear algebra", name: "ones", args: "n", about: "Matrix of ones.", example: "ones(2)" },
  { group: "Linear algebra", name: "size", args: "A", about: "Row count and column count.", example: "size([1 2; 3 4])" },
  { group: "Calculus", name: "diff", args: "f, x", about: "Symbolic derivative. diff(f, x, a) evaluates it.", example: "diff(x^2, x)" },
  { group: "Calculus", name: "integ", args: "f, x", about: "Antiderivative. integ(f, x, a, b) integrates from a to b.", example: "integ(x^2, x)" },
  { group: "Functions", name: "f(x) =", args: "expr", about: "Define f. Call f(2). f'(x) is the derivative. Functions can call functions.", example: "f(t) = 1/2*9.8*t^2+2*t+3" },
  { group: "Stack", name: "stk", args: "n", about: "Stack level n, as shown on the left. 1 is the newest.", example: "stk(1)+1" },
  { group: "Graphs", name: "plot", args: "f, x, a, b", about: "Graph y = f(x) from a to b.", example: "plot(sin(x), x, 0, 2*pi)" },
  { group: "Graphs", name: "surf", args: "f, x, a, b, y, c, d", about: "Surface z = f(x, y).", example: "surf(x^2-y^2, x, -2, 2, y, -2, 2)" },
];
