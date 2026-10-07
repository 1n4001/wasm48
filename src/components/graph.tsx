import { useEffect, useRef, useState } from "react";
import type { PlotSpec } from "@/lib/calc/matlab";
import { formatTick, niceStep, tickValues } from "@/lib/calc/ticks";

export function Graph({ plot }: { plot: PlotSpec }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ yaw: 0.7, pitch: 0.55 });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  useEffect(() => {
    setView({ yaw: 0.7, pitch: 0.55 });
  }, [plot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#171b18";
    ctx.fillRect(0, 0, width, height);
    if (plot.kind === "xy") drawCurve(ctx, width, height, plot, ratio);
    else drawSurface(ctx, width, height, plot, view.yaw, view.pitch);
  }, [plot, view]);

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-sm text-ink">{plot.label}</span>
        <span className="text-2xs tracking-[0.16em] text-muted">{plot.kind === "xy" ? "2D" : "3D · DRAG"}</span>
      </figcaption>
      <canvas
        ref={canvasRef}
        className="h-72 w-full touch-none rounded-md bg-[#171b18]"
        aria-label={plot.kind === "xy" ? "2D graph" : "3D graph"}
        onPointerDown={(event) => {
          if (plot.kind !== "xyz") return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, yaw: view.yaw, pitch: view.pitch };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start) return;
          setView({
            yaw: start.yaw + (event.clientX - start.x) * 0.01,
            pitch: Math.max(-1.2, Math.min(1.2, start.pitch + (event.clientY - start.y) * 0.01)),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      />
    </figure>
  );
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  plot: Extract<PlotSpec, { kind: "xy" }>,
  ratio: number,
) {
  const left = 48;
  const right = 14;
  const top = 12;
  const bottom = 26;
  const innerW = Math.max(1, width - left - right);
  const innerH = Math.max(1, height - top - bottom);
  const x0 = plot.a;
  const x1 = plot.b;
  const xSpan = x1 - x0 || 1;
  const probe = Math.max(2, Math.round(innerW * ratio));
  const extent = extents(plot, probe);
  if (!extent) return;
  let y0 = extent.y0;
  let y1 = extent.y1;
  if (y0 === y1) {
    y0 -= 1;
    y1 += 1;
  }
  const ySpan = y1 - y0 || 1;
  const scale = Math.min(innerW / xSpan, innerH / ySpan);
  const usedW = xSpan * scale;
  const usedH = ySpan * scale;
  const originX = left + (innerW - usedW) / 2;
  const originY = top + (innerH - usedH) / 2;
  const X = (x: number) => originX + (x - x0) * scale;
  const Y = (y: number) => originY + (y1 - y) * scale;

  ctx.strokeStyle = "#2e382e";
  ctx.lineWidth = 1;
  ctx.strokeRect(originX + 0.5, originY + 0.5, Math.max(0, usedW - 1), Math.max(0, usedH - 1));

  const xStep = niceStep(xSpan, usedW);
  const yStep = niceStep(ySpan, usedH);
  const xs = tickValues(x0, x1, xStep);
  const ys = tickValues(y0, y1, yStep);
  const yAxis = x0 <= 0 && x1 >= 0 ? 0 : x0;
  const xAxis = y0 <= 0 && y1 >= 0 ? 0 : y0;

  ctx.strokeStyle = "#5c6a50";
  ctx.beginPath();
  ctx.moveTo(originX, Y(xAxis));
  ctx.lineTo(originX + usedW, Y(xAxis));
  ctx.moveTo(X(yAxis), originY);
  ctx.lineTo(X(yAxis), originY + usedH);
  const mark = 4;
  for (const x of xs) hashX(ctx, X(x), Y(xAxis), mark, xAxis === y1 ? 1 : xAxis === y0 ? -1 : 0);
  for (const y of ys) hashY(ctx, X(yAxis), Y(y), mark, yAxis === x0 ? 1 : yAxis === x1 ? -1 : 0);
  ctx.stroke();

  const columns = Math.max(2, Math.round(usedW * ratio));
  const centers = extents(plot, columns)?.centers ?? [];
  ctx.save();
  ctx.beginPath();
  ctx.rect(originX, originY, usedW, usedH);
  ctx.clip();
  ctx.strokeStyle = "#9af0b8";
  ctx.lineWidth = 1.25;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  let drawing = false;
  for (const col of centers) {
    if (!Number.isFinite(col.y)) {
      drawing = false;
      continue;
    }
    const px = X(col.x);
    const py = Y(col.y);
    const span = Math.abs(Y(col.lo) - Y(col.hi));
    if (span > 2) {
      ctx.moveTo(px, Y(col.lo));
      ctx.lineTo(px, Y(col.hi));
      drawing = false;
      continue;
    }
    if (!drawing) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
    drawing = true;
  }
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#c8c2b8";
  ctx.font = "11px IBM Plex Mono, ui-monospace, monospace";
  labelY(ctx, ys, yStep, Y, X(yAxis), yAxis === x1, width);
  labelX(ctx, xs, ys, xStep, yStep, X, Y(xAxis), width, height);
}

function hashX(ctx: CanvasRenderingContext2D, x: number, y: number, mark: number, dir: number) {
  if (dir === 0) {
    ctx.moveTo(x, y - mark);
    ctx.lineTo(x, y + mark);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + dir * mark);
  }
}

function hashY(ctx: CanvasRenderingContext2D, x: number, y: number, mark: number, dir: number) {
  if (dir === 0) {
    ctx.moveTo(x - mark, y);
    ctx.lineTo(x + mark, y);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * mark, y);
  }
}

function labelY(
  ctx: CanvasRenderingContext2D,
  ticks: number[],
  step: number,
  Y: (y: number) => number,
  axisX: number,
  axisOnRight: boolean,
  width: number,
) {
  ctx.textBaseline = "middle";
  let last = -Infinity;
  for (const y of [...ticks].sort((a, b) => b - a)) {
    const py = Y(y);
    if (Math.abs(py - last) < 13) continue;
    const text = formatTick(y, step);
    const textW = ctx.measureText(text).width;
    let right = !axisOnRight;
    let x = right ? axisX - 6 : axisX + 6;
    if (right && x - textW < 2) {
      right = false;
      x = axisX + 6;
    }
    if (!right && x + textW > width - 2) continue;
    ctx.textAlign = right ? "right" : "left";
    ctx.fillText(text, x, py);
    last = py;
  }
}

function labelX(
  ctx: CanvasRenderingContext2D,
  xs: number[],
  ys: number[],
  xStep: number,
  yStep: number,
  X: (x: number) => number,
  axisY: number,
  width: number,
  height: number,
) {
  const yHasZero = ys.some((y) => Math.abs(y) <= Math.abs(yStep) * 1e-6);
  ctx.textAlign = "center";
  let y = axisY + 5;
  let baseline: CanvasTextBaseline = "top";
  if (y + 13 > height - 1) {
    y = axisY - 5;
    baseline = "bottom";
  }
  ctx.textBaseline = baseline;
  let lastRight = -Infinity;
  for (const x of xs) {
    if (yHasZero && Math.abs(x) <= Math.abs(xStep) * 1e-6) continue;
    const text = formatTick(x, xStep);
    const textW = ctx.measureText(text).width;
    const px = X(x);
    if (px - textW / 2 < 2 || px + textW / 2 > width - 2) continue;
    if (px - textW / 2 < lastRight + 6) continue;
    ctx.fillText(text, px, y);
    lastRight = px + textW / 2;
  }
}

function extents(plot: Extract<PlotSpec, { kind: "xy" }>, columns: number) {
  const centers: { x: number; y: number; lo: number; hi: number }[] = [];
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < columns; i++) {
    const x = plot.a + ((plot.b - plot.a) * (i + 0.5)) / columns;
    const left = plot.a + ((plot.b - plot.a) * i) / columns;
    const right = plot.a + ((plot.b - plot.a) * (i + 1)) / columns;
    const y = plot.sample(x);
    let lo = y;
    let hi = y;
    for (const t of [0, 0.25, 0.75, 1]) {
      const sample = plot.sample(left + (right - left) * t);
      if (!Number.isFinite(sample)) continue;
      if (!Number.isFinite(lo) || sample < lo) lo = sample;
      if (!Number.isFinite(hi) || sample > hi) hi = sample;
    }
    centers.push({ x, y, lo, hi });
    if (Number.isFinite(lo) && lo < y0) y0 = lo;
    if (Number.isFinite(hi) && hi > y1) y1 = hi;
  }
  if (!Number.isFinite(y0) || !Number.isFinite(y1)) return null;
  return { centers, y0, y1 };
}

function drawSurface(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  plot: Extract<PlotSpec, { kind: "xyz" }>,
  yaw: number,
  pitch: number,
) {
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const row of plot.zs) {
    for (const z of row) {
      if (!Number.isFinite(z)) continue;
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  }
  if (!Number.isFinite(z0)) return;
  if (z0 === z1) {
    z0 -= 1;
    z1 += 1;
  }
  const n = plot.xs.length;
  const project = (i: number, j: number, z: number) => {
    const x = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const y = n <= 1 ? 0 : (j / (n - 1)) * 2 - 1;
    const zz = ((z - z0) / (z1 - z0)) * 2 - 1;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const x1 = x * cy - y * sy;
    const y1 = x * sy + y * cy;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const z2 = y1 * sp + zz * cp;
    const scale = Math.min(width, height) * 0.34;
    return [width / 2 + x1 * scale, height * 0.58 - z2 * scale] as const;
  };
  ctx.strokeStyle = "#7dcea0";
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < n; i++) {
    strokeLine(ctx, n, (j) => {
      const z = plot.zs[i]?.[j];
      return Number.isFinite(z) ? project(i, j, z ?? 0) : null;
    });
  }
  for (let j = 0; j < n; j++) {
    strokeLine(ctx, n, (i) => {
      const z = plot.zs[i]?.[j];
      return Number.isFinite(z) ? project(i, j, z ?? 0) : null;
    });
  }
  ctx.globalAlpha = 1;
}

function strokeLine(ctx: CanvasRenderingContext2D, n: number, at: (i: number) => readonly [number, number] | null) {
  ctx.beginPath();
  let drawing = false;
  for (let i = 0; i < n; i++) {
    const p = at(i);
    if (!p) {
      drawing = false;
      continue;
    }
    if (!drawing) ctx.moveTo(p[0], p[1]);
    else ctx.lineTo(p[0], p[1]);
    drawing = true;
  }
  ctx.stroke();
}
