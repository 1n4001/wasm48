import { useEffect, useRef, useState } from "react";
import type { PlotSpec } from "@/lib/calc/matlab";

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
  const pad = 28;
  const plotWidth = Math.max(1, width - pad * 2);
  const columns = Math.max(2, Math.round(plotWidth * ratio));
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
  if (!Number.isFinite(y0)) return;
  if (y0 === y1) {
    y0 -= 1;
    y1 += 1;
  }
  const X = (x: number) => pad + ((x - plot.a) / (plot.b - plot.a || 1)) * plotWidth;
  const Y = (y: number) => height - pad - ((y - y0) / (y1 - y0)) * (height - pad * 2);
  ctx.strokeStyle = "#5c6a50";
  ctx.lineWidth = 1 / ratio;
  ctx.beginPath();
  if (y0 <= 0 && y1 >= 0) {
    ctx.moveTo(pad, Y(0));
    ctx.lineTo(width - pad, Y(0));
  }
  ctx.moveTo(X(plot.a), pad);
  ctx.lineTo(X(plot.a), height - pad);
  ctx.stroke();
  ctx.strokeStyle = "#9af0b8";
  ctx.lineWidth = 1.25 / ratio;
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
    if (span > 2 / ratio) {
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
  ctx.fillStyle = "#9a958c";
  ctx.font = "12px IBM Plex Mono, monospace";
  ctx.fillText(String(round(y1)), 4, 16);
  ctx.fillText(String(round(y0)), 4, height - 8);
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

function round(n: number): string {
  const v = Math.round(n * 1000) / 1000;
  return String(v);
}
