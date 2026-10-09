import type { Point } from './types';

export const DIRS4: readonly Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export const DIRS8: readonly Point[] = [
  ...DIRS4,
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

export function inBounds(w: number, h: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < w && y < h;
}

export function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Breadth-first distances from one or more sources. -1 = unreachable. */
export function bfs(
  w: number,
  h: number,
  sources: Point[],
  passable: (x: number, y: number) => boolean,
): Int16Array {
  const d = new Int16Array(w * h).fill(-1);
  const qx = new Int16Array(w * h);
  const qy = new Int16Array(w * h);
  let head = 0;
  let tail = 0;
  for (const s of sources) {
    if (!inBounds(w, h, s.x, s.y)) continue;
    d[s.y * w + s.x] = 0;
    qx[tail] = s.x;
    qy[tail++] = s.y;
  }
  while (head < tail) {
    const x = qx[head];
    const y = qy[head++];
    const base = d[y * w + x];
    for (const dir of DIRS4) {
      const nx = x + dir.x;
      const ny = y + dir.y;
      if (!inBounds(w, h, nx, ny)) continue;
      const i = ny * w + nx;
      if (d[i] !== -1 || !passable(nx, ny)) continue;
      d[i] = base + 1;
      qx[tail] = nx;
      qy[tail++] = ny;
    }
  }
  return d;
}

/** Bresenham line of sight between tile centers. Opaque tiles block, except the endpoints. */
export function lineOfSight(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opaque: (x: number, y: number) => boolean,
): boolean {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    if (x === x1 && y === y1) return true;
    if (!(x === x0 && y === y0) && opaque(x, y)) return false;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    // diagonal squeeze between two walls blocks light
    if (e2 >= dy && e2 <= dx && !(x === x1 && y === y1)) {
      if (opaque(x - sx, y) && opaque(x, y - sy)) return false;
    }
  }
}
