// Atmospheric skyline scenes for the main menu and district cards.

import { THEMES } from '../game/content';
import type { ThemeId } from '../game/types';
import { drawFlame } from './sprites';

interface Building {
  x: number;
  w: number;
  h: number;
  roof: number;
  windows: { x: number; y: number; lit: boolean; ph: number }[];
}

function rng(seed: number) {
  let s = seed >>> 0 || 7;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeLayer(seed: number, width: number, minH: number, maxH: number, litChance: number): Building[] {
  const r = rng(seed);
  const out: Building[] = [];
  let x = -20;
  while (x < width + 40) {
    const w = 40 + r() * 90;
    const h = minH + r() * (maxH - minH);
    const windows: Building['windows'] = [];
    for (let wy = 18; wy < h - 14; wy += 22) {
      for (let wx = 10; wx < w - 14; wx += 18) {
        if (r() < 0.55) windows.push({ x: wx, y: wy, lit: r() < litChance, ph: r() * 10 });
      }
    }
    out.push({ x, w, h, roof: Math.floor(r() * 4), windows });
    x += w + r() * 6;
  }
  return out;
}

function drawBuilding(c: CanvasRenderingContext2D, b: Building, base: number, color: string, t: number, winAlpha: number, warm: string) {
  c.fillStyle = color;
  const top = base - b.h;
  c.beginPath();
  c.moveTo(b.x, base);
  c.lineTo(b.x, top);
  if (b.roof === 1) {
    c.lineTo(b.x + b.w / 2, top - b.w * 0.35);
  } else if (b.roof === 2) {
    c.lineTo(b.x + b.w * 0.15, top);
    c.lineTo(b.x + b.w * 0.15, top - 26);
    c.lineTo(b.x + b.w * 0.28, top - 26);
    c.lineTo(b.x + b.w * 0.28, top);
  } else if (b.roof === 3) {
    c.lineTo(b.x + b.w * 0.5 - 6, top);
    c.lineTo(b.x + b.w * 0.5, top - 40);
    c.lineTo(b.x + b.w * 0.5 + 6, top);
  }
  c.lineTo(b.x + b.w, top);
  c.lineTo(b.x + b.w, base);
  c.closePath();
  c.fill();
  if (winAlpha <= 0) return;
  for (const w of b.windows) {
    if (!w.lit) continue;
    const fl = 0.75 + Math.sin(t * 0.7 + w.ph) * 0.12 + Math.sin(t * 3.1 + w.ph * 2) * 0.05;
    c.fillStyle = warm.replace('A', String(winAlpha * fl));
    c.fillRect(b.x + w.x, top + w.y, 7, 10);
  }
}

export class MenuScene {
  private far: Building[];
  private mid: Building[];
  private near: Building[];
  private embers: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private start = performance.now();
  mouseX = 0;
  mouseY = 0;

  constructor() {
    this.far = makeLayer(11, 2400, 120, 260, 0.08);
    this.mid = makeLayer(23, 2400, 90, 200, 0.14);
    this.near = makeLayer(37, 2400, 60, 140, 0.18);
  }

  draw(c: CanvasRenderingContext2D, W: number, H: number, now: number, reduced: boolean) {
    const t = (now - this.start) / 1000;
    // sky
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05070d');
    sky.addColorStop(0.55, '#0e1424');
    sky.addColorStop(1, '#1a1a24');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    // stars
    const sr = rng(5);
    for (let i = 0; i < 90; i++) {
      const x = sr() * W;
      const y = sr() * H * 0.5;
      const a = 0.15 + sr() * 0.4 + (reduced ? 0 : Math.sin(t * (0.5 + sr()) + i) * 0.1);
      c.fillStyle = `rgba(220,225,240,${a})`;
      c.fillRect(x, y, 1.2, 1.2);
    }
    // moon behind haze
    const mx = W * 0.78 - this.mouseX * 8;
    const my = H * 0.2 - this.mouseY * 6;
    const mg = c.createRadialGradient(mx, my, 10, mx, my, 160);
    mg.addColorStop(0, 'rgba(220,214,190,0.35)');
    mg.addColorStop(1, 'rgba(220,214,190,0)');
    c.fillStyle = mg;
    c.fillRect(mx - 160, my - 160, 320, 320);
    c.fillStyle = '#d9d2bb';
    c.beginPath();
    c.arc(mx, my, 34, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#0e1424';
    c.beginPath();
    c.arc(mx + 14, my - 8, 32, 0, Math.PI * 2);
    c.fill();

    const ground = H * 0.82;
    const par = (k: number) => -this.mouseX * k;
    c.save();
    c.translate(par(6), 0);
    for (const b of this.far) drawBuilding(c, b, ground - 70, '#121725', t, 0.35, 'rgba(255,190,110,A)');
    c.restore();
    // haze band
    const hz = c.createLinearGradient(0, ground - 200, 0, ground);
    hz.addColorStop(0, 'rgba(60,70,100,0)');
    hz.addColorStop(1, 'rgba(60,70,100,0.25)');
    c.fillStyle = hz;
    c.fillRect(0, ground - 200, W, 200);
    c.save();
    c.translate(par(14), 0);
    for (const b of this.mid) drawBuilding(c, b, ground - 30, '#0c1019', t, 0.55, 'rgba(255,180,100,A)');
    c.restore();
    c.save();
    c.translate(par(24), 0);
    for (const b of this.near) drawBuilding(c, b, ground + 10, '#07090f', t, 0.75, 'rgba(255,170,90,A)');
    c.restore();
    // street
    c.fillStyle = '#06080d';
    c.fillRect(0, ground + 8, W, H - ground);

    // street lamps lighting up one by one
    const n = Math.max(4, Math.round(W / 260));
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * W + par(34);
      const on = t > 0.8 + i * 0.45;
      const k = on ? Math.min(1, (t - 0.8 - i * 0.45) * 2.5) : 0;
      const y = ground + 8;
      if (k > 0) {
        const fl = 0.9 + Math.sin(t * 9 + i) * 0.05 + Math.sin(t * 15 + i * 2) * 0.04;
        const g = c.createRadialGradient(x, y - 118, 0, x, y - 118, 230);
        g.addColorStop(0, `rgba(255,190,100,${0.32 * k * fl})`);
        g.addColorStop(0.4, `rgba(255,160,80,${0.1 * k * fl})`);
        g.addColorStop(1, 'rgba(255,150,70,0)');
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = g;
        c.fillRect(x - 230, y - 350, 460, 460);
        c.restore();
        const pool = c.createRadialGradient(x, y + 6, 0, x, y + 6, 140);
        pool.addColorStop(0, `rgba(255,190,110,${0.22 * k})`);
        pool.addColorStop(1, 'rgba(255,190,110,0)');
        c.fillStyle = pool;
        c.fillRect(x - 140, y - 20, 280, 60);
      }
      c.fillStyle = '#020306';
      c.fillRect(x - 3, y - 112, 6, 112);
      c.fillRect(x - 9, y - 6, 18, 8);
      c.beginPath();
      c.moveTo(x - 12, y - 112);
      c.lineTo(x + 12, y - 112);
      c.lineTo(x + 8, y - 136);
      c.lineTo(x - 8, y - 136);
      c.closePath();
      c.fill();
      c.fillRect(x - 13, y - 142, 26, 6);
      c.fillStyle = k > 0 ? `rgba(255,214,140,${0.95 * k})` : 'rgba(60,66,80,0.9)';
      c.fillRect(x - 7, y - 132, 14, 18);
      if (k > 0) drawFlame(c, x, y - 116, 6, t, i, k);
      if (k > 0 && !reduced && Math.random() < 0.04) this.embers.push({ x, y: y - 130, vx: (Math.random() - 0.5) * 12, vy: -20 - Math.random() * 20, life: 2.2 });
    }
    // embers
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const e of this.embers) {
      e.life -= 1 / 60;
      e.x += e.vx / 60;
      e.y += e.vy / 60;
      e.vx += Math.sin(t * 2 + e.y * 0.05) * 0.2;
      c.fillStyle = `rgba(255,160,70,${Math.max(0, e.life / 2.2)})`;
      c.fillRect(e.x, e.y, 2, 2);
    }
    c.restore();
    this.embers = this.embers.filter((e) => e.life > 0);
    // drifting fog
    if (!reduced) {
      c.save();
      c.globalAlpha = 0.09;
      for (let i = 0; i < 6; i++) {
        const fx = ((t * (10 + i * 4) + i * 420) % (W + 800)) - 400;
        const fy = ground - 40 + Math.sin(t * 0.2 + i) * 30 - i * 18;
        const g = c.createRadialGradient(fx, fy, 0, fx, fy, 300);
        g.addColorStop(0, '#a3b0cc');
        g.addColorStop(1, 'rgba(163,176,204,0)');
        c.fillStyle = g;
        c.fillRect(fx - 300, fy - 300, 600, 600);
      }
      c.restore();
    }
    // left readability scrim
    const scrim = c.createLinearGradient(0, 0, W * 0.65, 0);
    scrim.addColorStop(0, 'rgba(4,5,9,0.82)');
    scrim.addColorStop(1, 'rgba(4,5,9,0)');
    c.fillStyle = scrim;
    c.fillRect(0, 0, W, H);
  }
}

/** Small themed illustration used on district path cards. */
export function drawThemeCard(c: CanvasRenderingContext2D, W: number, H: number, theme: ThemeId) {
  const pal = THEMES[theme].palette;
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#05070d');
  sky.addColorStop(1, pal.fog);
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  const seed = theme.split('').reduce((a, ch) => a + ch.charCodeAt(0) * 31, 0);
  const layer = makeLayer(seed, W + 60, H * 0.25, H * 0.65, 0.2);
  for (const b of layer) {
    if (theme === 'cmentarz') b.roof = 3;
    if (theme === 'port') b.roof = 0;
    drawBuilding(c, b, H - 8, '#06080d', 0, 0.7, 'rgba(255,180,100,A)');
  }
  if (theme === 'port') {
    c.strokeStyle = '#06080d';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(W * 0.7, H - 8);
    c.lineTo(W * 0.7, H * 0.15);
    c.lineTo(W * 0.92, H * 0.6);
    c.stroke();
  }
  if (theme === 'fabryka') {
    c.fillStyle = '#06080d';
    for (const x of [0.2, 0.55, 0.8]) c.fillRect(W * x, H * 0.1, 10, H);
  }
  if (theme === 'latarnia') {
    c.fillStyle = '#06080d';
    c.beginPath();
    c.moveTo(W * 0.5 - 16, H);
    c.lineTo(W * 0.5 - 9, H * 0.15);
    c.lineTo(W * 0.5 + 9, H * 0.15);
    c.lineTo(W * 0.5 + 16, H);
    c.fill();
    c.save();
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(W * 0.5, H * 0.12, 0, W * 0.5, H * 0.12, W * 0.5);
    g.addColorStop(0, 'rgba(255,214,140,0.5)');
    g.addColorStop(1, 'rgba(255,214,140,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.restore();
  }
  c.fillStyle = '#04050a';
  c.fillRect(0, H - 8, W, 8);
  c.save();
  c.globalCompositeOperation = 'lighter';
  const acc = c.createRadialGradient(W * 0.25, H, 0, W * 0.25, H, H * 1.2);
  acc.addColorStop(0, pal.accent + '55');
  acc.addColorStop(1, pal.accent + '00');
  c.fillStyle = acc;
  c.fillRect(0, 0, W, H);
  c.restore();
}
