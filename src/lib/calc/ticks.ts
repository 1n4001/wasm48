/** A 1-2-5 step that places a readable number of ticks across `pixels`. */
export function niceStep(span: number, pixels: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const target = Math.max(2, Math.round(Math.max(pixels, 1) / 72));
  const rough = span / target;
  if (!(rough > 0) || !Number.isFinite(rough)) return 1;
  const exp = Math.floor(Math.log10(rough));
  const mag = 10 ** exp;
  const frac = rough / mag;
  const base = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  return base * mag;
}

export function tickValues(min: number, max: number, step: number): number[] {
  if (!(step > 0) || !Number.isFinite(step) || !Number.isFinite(min) || !Number.isFinite(max) || max < min) return [];
  const i0 = Math.ceil(min / step - 1e-9);
  const i1 = Math.floor(max / step + 1e-9);
  const out: number[] = [];
  for (let i = i0; i <= i1 && out.length < 400; i++) out.push(i * step);
  return out;
}

export function formatTick(n: number, step: number): string {
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n) < Math.abs(step) * 1e-8) return "0";
  const decimals = !(step > 0) || step >= 1 ? 0 : Math.min(8, Math.ceil(-Math.log10(step) - 1e-12));
  const text = n.toFixed(decimals);
  if (text === "-0") return "0";
  return text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
