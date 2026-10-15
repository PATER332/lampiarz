// Small canvas helpers shared by every drawing module.

export type Ctx = CanvasRenderingContext2D;

const cache = new Map<string, [number, number, number]>();

export function rgb(hex: string): [number, number, number] {
  let v = cache.get(hex);
  if (v) return v;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  cache.set(hex, v);
  return v;
}

/** Mix two hex colours, returns an rgb() string. */
export function mix(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  const A = rgb(a);
  const B = rgb(b);
  const k = Math.min(1, t);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')!];
}

/** Rounded limb: a thick line with round caps. */
export function limb(g: Ctx, x1: number, y1: number, x2: number, y2: number, w: number, color: string) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

/** Two-segment limb with a bending joint (knee / elbow). */
export function limb2(g: Ctx, x1: number, y1: number, x2: number, y2: number, bend: number, w: number, color: string) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const jx = mx + (-dy / len) * bend;
  const jy = my + (dx / len) * bend;
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(jx, jy);
  g.lineTo(x2, y2);
  g.stroke();
}

export function circle(g: Ctx, x: number, y: number, r: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  g.fill();
}

export function glow(g: Ctx, x: number, y: number, r: number, color: string, a: number) {
  if (a <= 0 || r <= 0) return;
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, rgba(color, a));
  grd.addColorStop(0.4, rgba(color, a * 0.35));
  grd.addColorStop(1, rgba(color, 0));
  g.fillStyle = grd;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

export function poly(g: Ctx, pts: number[], color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
}

/** A four-point star used for attack telegraphs and sparkles. */
export function star(g: Ctx, x: number, y: number, r: number, color: string, a = 1, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha *= a;
  g.fillStyle = color;
  g.beginPath();
  const k = r * 0.18;
  g.moveTo(0, -r);
  g.lineTo(k, -k);
  g.lineTo(r, 0);
  g.lineTo(k, k);
  g.lineTo(0, r);
  g.lineTo(-k, k);
  g.lineTo(-r, 0);
  g.lineTo(-k, -k);
  g.closePath();
  g.fill();
  g.restore();
}

/** Deterministic pseudo-random for static art (backgrounds, tiles). */
export function srand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
