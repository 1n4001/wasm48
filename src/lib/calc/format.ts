import type { Val } from "./engine.ts";

export function formatNum(n: number): string {
  if (n === Infinity) return "Inf";
  if (n === -Infinity) return "-Inf";
  if (Number.isNaN(n)) return "NaN";
  if (Object.is(n, -0)) return "0";
  const a = Math.abs(n);
  if (a !== 0 && (a >= 1e7 || a < 1e-4)) {
    return n.toExponential(4).replace("e+", "e");
  }
  const rounded = Math.round(n * 1e10) / 1e10;
  const text = String(rounded);
  return text;
}

export function formatVal(v: Val): string {
  if (v.t === "sym") return v.text;
  if (v.t === "s") return formatNum(v.v);
  const cells: string[][] = [];
  const width = Array.from({ length: v.c }, () => 0);
  for (let i = 0; i < v.r; i++) {
    const row: string[] = [];
    for (let j = 0; j < v.c; j++) {
      const text = formatNum(v.d[i + j * v.r] ?? NaN);
      row.push(text);
      width[j] = Math.max(width[j] ?? 0, text.length);
    }
    cells.push(row);
  }
  return cells.map((row) => row.map((cell, j) => cell.padStart(width[j] ?? 0)).join("  ")).join("\n");
}

export function formatMath(v: Val): string {
  if (v.t === "sym") return v.text;
  if (v.t === "s") return formatNum(v.v);
  const parts: string[] = [];
  for (let i = 0; i < v.r; i++) {
    const row: string[] = [];
    for (let j = 0; j < v.c; j++) row.push(formatNum(v.d[i + j * v.r] ?? NaN));
    parts.push(row.join(" "));
  }
  return `[${parts.join("; ")}]`;
}

export function formatShort(v: Val): string {
  if (v.t === "sym") return v.text;
  if (v.t === "s") return formatNum(v.v);
  if (v.r * v.c > 6) return `[${v.r}×${v.c}]`;
  const parts: string[] = [];
  for (let i = 0; i < v.r; i++) {
    const row: string[] = [];
    for (let j = 0; j < v.c; j++) row.push(formatNum(v.d[i + j * v.r] ?? NaN));
    parts.push(row.join(" "));
  }
  return `[${parts.join("; ")}]`;
}
