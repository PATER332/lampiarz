// The two characters, drawn with canvas paths: a squashy gummy body with a big
// head, stubby limbs, expressive eyes and one trademark each (Bąbel's springy
// antenna, Pieprz's flame tuft). Squash and stretch follow the physics.
import { clamp } from '../engine/math';
import type { Player } from '../sim/player';

export const PCOL = [
  { body: '#2f7bff', light: '#8ec0ff', dark: '#1745b8', ink: '#0d1f4d', accent: '#ffe066', tag: 'P1' },
  { body: '#ff5a2a', light: '#ffb08a', dark: '#c0310f', ink: '#4a1206', accent: '#ffe066', tag: 'P2' },
];

interface Wobble {
  a: number;
  v: number;
  lastVx: number;
  lastVy: number;
  look: number;
}
const wob = new WeakMap<Player, Wobble>();

export interface DrawOpts {
  time: number;
  dt: number;
  /** show the P1 / P2 tag above the head */
  tag?: boolean;
  /** menu / results: bigger smile, no tag */
  pose?: 'win' | 'lose' | null;
}

export function drawCharacter(g: CanvasRenderingContext2D, p: Player, o: DrawOpts) {
  const C = PCOL[p.id];
  const s = p.w / 36;
  const cx = p.cx;
  const by = p.bottom;
  const t = o.time;
  const W = wob.get(p) ?? { a: 0, v: 0, lastVx: p.vx, lastVy: p.vy, look: p.facing };
  wob.set(p, W);
  // the antenna / tuft swings against acceleration
  const ax = (p.vx - W.lastVx) / Math.max(o.dt, 1e-3);
  const ay = (p.vy - W.lastVy) / Math.max(o.dt, 1e-3);
  W.lastVx = p.vx;
  W.lastVy = p.vy;
  W.v += (-W.a * 120 - W.v * 9 - ax * 0.0009 + Math.sin(t * 2 + p.id) * 0.4) * o.dt;
  W.v -= ay * 0.00002;
  W.a = clamp(W.a + W.v * o.dt, -1.1, 1.1);
  W.look += ((p.dir || p.facing) - W.look) * Math.min(1, o.dt * 10);

  if (p.invuln > 0 && Math.floor(t * 16) % 2 === 0 && p.alive && p.winT <= 0) g.globalAlpha *= 0.45;

  // squash and stretch
  let sy = 1;
  if (!p.grounded) sy = 1 + clamp(-p.vy / 2600, -0.18, 0.22);
  if (p.landT > 0) sy = 1 - (p.landT / 0.16) * 0.28;
  if (p.jumpT > 0) sy = 1 + (p.jumpT / 0.18) * 0.2;
  if (p.grounded && p.idleT > 0) sy *= 1 + Math.sin(p.idleT * 3.2 + p.id) * 0.025;
  if (p.winT > 0) sy *= 1 + Math.abs(Math.sin(p.winT * 9)) * 0.12;
  const sx = 1 / sy;
  const lean = clamp(p.vx * 0.0006, -0.22, 0.22) + (p.dashT > 0 ? p.facing * 0.25 : 0);
  const stunned = p.stun > 0.05;
  const run = p.grounded && Math.abs(p.vx) > 30;
  const ph = p.runPhase;

  // ---- legs (behind the body)
  const hipY = by - 13 * s;
  for (const side of [-1, 1]) {
    let fx = cx + side * 9 * s * sx;
    let fy = by - 3 * s;
    if (run) {
      const k = Math.sin(ph + (side > 0 ? Math.PI : 0));
      fx += k * 9 * s;
      fy -= Math.max(0, Math.cos(ph + (side > 0 ? Math.PI : 0))) * 6 * s;
    } else if (!p.grounded) {
      fx += side * 4 * s;
      fy -= (p.vy < 0 ? 6 : 2) * s + (side > 0 ? 3 * s : 0);
    }
    if (p.winT > 0) fy -= Math.abs(Math.sin(p.winT * 9 + side)) * 5 * s;
    g.strokeStyle = C.ink;
    g.lineWidth = 9 * s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx + side * 7 * s, hipY);
    g.lineTo(fx, fy - 2 * s);
    g.stroke();
    g.strokeStyle = C.dark;
    g.lineWidth = 5.5 * s;
    g.beginPath();
    g.moveTo(cx + side * 7 * s, hipY);
    g.lineTo(fx, fy - 2 * s);
    g.stroke();
    // feet
    g.fillStyle = C.ink;
    g.beginPath();
    g.ellipse(fx + p.facing * 3 * s, fy, 8 * s, 5 * s, 0, 0, Math.PI * 2);
    g.fill();
  }

  g.save();
  g.translate(cx, by - 8 * s);
  g.rotate(lean);
  g.scale(sx, sy);
  const R = 25 * s;
  const H = 27 * s;
  const yc = -H - 2 * s;

  // ---- arms (back one)
  // arm angle: 0 hangs down, +π/2 points forward (the way it faces), π points up
  const armA = (side: number) => {
    const f = side === p.facing ? 1 : -1;
    if (p.winT > 0 || o.pose === 'win') return f * (2.5 + Math.sin(t * 10 + side) * 0.35);
    if (p.dashT > 0) return f > 0 ? Math.PI / 2 : -0.7;
    if (p.slamming) return f * 2.8;
    if (stunned) return f * (2.0 + Math.sin(t * 20 + side) * 0.6);
    if (!p.grounded) return p.vy < 0 ? f * 2.4 : f * (1.3 + Math.sin(t * 18 + side) * 0.5);
    if (run) return Math.sin(ph + (f > 0 ? 0 : Math.PI)) * 0.9;
    return f * (0.25 + Math.sin(t * 2 + side) * 0.06);
  };
  const drawArm = (side: number) => {
    const sx0 = side * (R - 3 * s);
    const sy0 = yc + 6 * s;
    const a = armA(side);
    const punch = p.dashT > 0 && side === p.facing;
    const len = (punch ? 21 : 14) * s;
    const hx = sx0 + Math.sin(a) * len * p.facing;
    const hy = sy0 + Math.cos(a) * len;
    g.strokeStyle = C.ink;
    g.lineWidth = 8 * s;
    g.beginPath();
    g.moveTo(sx0, sy0);
    g.lineTo(hx, hy);
    g.stroke();
    g.strokeStyle = C.body;
    g.lineWidth = 4.5 * s;
    g.beginPath();
    g.moveTo(sx0, sy0);
    g.lineTo(hx, hy);
    g.stroke();
    g.fillStyle = C.light;
    g.strokeStyle = C.ink;
    g.lineWidth = 2.5 * s;
    g.beginPath();
    g.arc(hx, hy, (punch ? 7.5 : 5.5) * s, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  };
  drawArm(-p.facing);

  // ---- body / head
  const grad = g.createRadialGradient(-R * 0.35, yc - H * 0.45, R * 0.1, 0, yc, R * 1.3);
  grad.addColorStop(0, C.light);
  grad.addColorStop(0.45, C.body);
  grad.addColorStop(1, C.dark);
  g.fillStyle = grad;
  g.strokeStyle = C.ink;
  g.lineWidth = 3.2 * s;
  g.beginPath();
  // a bean: wider at the bottom
  g.moveTo(0, yc - H);
  g.bezierCurveTo(R * 1.05, yc - H, R * 1.12, yc + H * 0.55, R * 0.55, yc + H);
  g.lineTo(-R * 0.55, yc + H);
  g.bezierCurveTo(-R * 1.12, yc + H * 0.55, -R * 1.05, yc - H, 0, yc - H);
  g.closePath();
  g.fill();
  g.stroke();
  // belly
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.ellipse(W.look * 3 * s, yc + H * 0.45, R * 0.5, H * 0.38, 0, 0, Math.PI * 2);
  g.fill();
  // shine
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  g.ellipse(-R * 0.45, yc - H * 0.55, R * 0.16, H * 0.12, -0.6, 0, Math.PI * 2);
  g.fill();

  // ---- trademark
  if (p.id === 0) {
    // springy antenna with a glowing bulb
    const baseX = 2 * s;
    const baseY = yc - H + 2 * s;
    const ang = W.a * 0.9 + lean * -1.5;
    const L = 20 * s;
    const tipX = baseX + Math.sin(ang) * L;
    const tipY = baseY - Math.cos(ang) * L;
    g.strokeStyle = C.ink;
    g.lineWidth = 3 * s;
    g.beginPath();
    g.moveTo(baseX, baseY);
    g.quadraticCurveTo(baseX + Math.sin(ang * 0.5) * L * 0.5, baseY - L * 0.6, tipX, tipY);
    g.stroke();
    g.fillStyle = C.accent;
    g.beginPath();
    g.arc(tipX, tipY, 5.5 * s, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else {
    // a flame-shaped tuft
    const baseY = yc - H + 4 * s;
    for (const [i, h] of [
      [-1, 14],
      [0, 20],
      [1, 13],
    ] as const) {
      const ang = W.a * (0.8 + Math.abs(i) * 0.2) + lean * -1.2 + i * 0.35;
      const bx = i * 7 * s;
      const L = h * s * (1 + Math.sin(t * 9 + i) * 0.06);
      g.fillStyle = i === 0 ? '#ffd23f' : C.light;
      g.strokeStyle = C.ink;
      g.lineWidth = 2.5 * s;
      g.beginPath();
      g.moveTo(bx - 5 * s, baseY + 4 * s);
      g.quadraticCurveTo(bx + Math.sin(ang) * L * 0.7 - 4 * s, baseY - L * 0.6, bx + Math.sin(ang) * L, baseY - Math.cos(ang) * L);
      g.quadraticCurveTo(bx + Math.sin(ang) * L * 0.7 + 4 * s, baseY - L * 0.5, bx + 5 * s, baseY + 4 * s);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }

  // ---- face
  const lx = W.look * 5 * s;
  const ey = yc - H * 0.22;
  const blink = p.blinkT < 0 && !stunned && p.winT <= 0;
  const happy = p.winT > 0 || o.pose === 'win';
  const sad = o.pose === 'lose';
  const scared = !p.grounded && p.vy > 800 && !p.slamming;
  for (const side of [-1, 1]) {
    const ex = lx + side * 9.5 * s;
    if (stunned) {
      // dizzy spirals
      g.strokeStyle = C.ink;
      g.lineWidth = 2.2 * s;
      g.beginPath();
      for (let k = 0; k < 14; k++) {
        const a = k * 0.8 + t * 12 * side;
        const rr = k * 0.45 * s;
        if (k === 0) g.moveTo(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr);
        else g.lineTo(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr);
      }
      g.stroke();
      continue;
    }
    if (happy) {
      g.strokeStyle = C.ink;
      g.lineWidth = 3 * s;
      g.beginPath();
      g.arc(ex, ey + 2 * s, 5.5 * s, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      continue;
    }
    if (p.hitT > 0.12) {
      g.strokeStyle = C.ink;
      g.lineWidth = 3 * s;
      g.beginPath();
      g.moveTo(ex - 5 * s * side, ey - 4 * s);
      g.lineTo(ex + 4 * s * side, ey);
      g.lineTo(ex - 5 * s * side, ey + 4 * s);
      g.stroke();
      continue;
    }
    g.fillStyle = '#ffffff';
    g.strokeStyle = C.ink;
    g.lineWidth = 2.2 * s;
    g.beginPath();
    g.ellipse(ex, ey, 6.8 * s, (blink ? 0.8 : scared ? 9.5 : 8.5) * s, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (!blink) {
      g.fillStyle = C.ink;
      g.beginPath();
      const pr = scared ? 2.2 : sad ? 3.2 : 3.6;
      g.arc(ex + W.look * 2.2 * s, ey + (sad ? 2.5 : 0.5) * s + clamp(p.vy * 0.003, -2, 2) * s, pr * s, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(ex + W.look * 2.2 * s - 1.2 * s, ey - 1.2 * s, 1.1 * s, 0, Math.PI * 2);
      g.fill();
    }
    if (sad) {
      g.strokeStyle = C.ink;
      g.lineWidth = 2.2 * s;
      g.beginPath();
      g.moveTo(ex - 6 * s, ey - 10 * s + side * 2 * s);
      g.lineTo(ex + 6 * s, ey - 10 * s - side * 2 * s);
      g.stroke();
    }
  }
  // mouth
  const my = yc + H * 0.18;
  g.strokeStyle = C.ink;
  g.fillStyle = '#3a0d14';
  g.lineWidth = 2.6 * s;
  g.beginPath();
  if (happy) {
    g.moveTo(lx - 8 * s, my - 2 * s);
    g.quadraticCurveTo(lx, my + 12 * s, lx + 8 * s, my - 2 * s);
    g.closePath();
    g.fill();
    g.stroke();
  } else if (sad) {
    g.arc(lx, my + 6 * s, 5 * s, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  } else if (!p.grounded || stunned || p.dashT > 0 || scared) {
    g.ellipse(lx + W.look * 1 * s, my + 2 * s, (p.dashT > 0 ? 5 : 3.5) * s, (scared ? 6 : 4.5) * s, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else {
    g.arc(lx, my - 2 * s, 5 * s, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
  }
  // cheeks
  g.fillStyle = 'rgba(255,120,150,0.35)';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(lx + side * 15 * s, my - 1 * s, 4 * s, 2.6 * s, 0, 0, Math.PI * 2);
    g.fill();
  }

  // ---- front arm
  drawArm(p.facing);
  g.restore();

  // ---- dizzy stars
  if (stunned) {
    for (let i = 0; i < 3; i++) {
      const a = t * 6 + (i / 3) * Math.PI * 2;
      star(g, cx + Math.cos(a) * 22 * s, by - 66 * s + Math.sin(a) * 6 * s, 5 * s, '#ffe066');
    }
  }
  g.globalAlpha = 1;
  if (o.tag && p.alive) {
    const ty = by - 86 * s - (p.id === 0 ? 4 * s : 0);
    g.fillStyle = C.body;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - 14, ty - 12);
    g.lineTo(cx + 14, ty - 12);
    g.lineTo(cx + 14, ty + 4);
    g.lineTo(cx + 4, ty + 4);
    g.lineTo(cx, ty + 10);
    g.lineTo(cx - 4, ty + 4);
    g.lineTo(cx - 14, ty + 4);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.font = '900 11px "RC Display", Inter, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(C.tag, cx, ty - 4);
  }
}

export function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  g.fillStyle = col;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}
