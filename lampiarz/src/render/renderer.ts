// Canvas renderer: camera, layered drawing, soft tile lighting, particles and
// intent overlays. Pure view — it never mutates the Run.

import { THEMES } from '../game/content';
import { computeIntents, gateOpen, hasRelic, type Intent } from '../game/engine';
import { computeLight, lanternRadius, type LightState } from '../game/light';
import type { Fx, Point, Run } from '../game/types';
import {
  drawEnemy,
  drawEnemyEyes,
  drawFlame,
  drawGate,
  drawItem,
  drawItemGlow,
  drawLampBase,
  drawLanternGlow,
  drawPlayer,
  flamePoint,
  lanternOffset,
} from './sprites';
import { prerender, type Prerendered } from './tiles';

export interface RenderSettings {
  shake: boolean;
  reducedMotion: boolean;
  showGrid: boolean;
}

interface Anim {
  x: number;
  y: number;
  flash: number;
  bx: number;
  by: number;
  bt: number;
  fade: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'spark' | 'smoke' | 'ember' | 'drop';
  g: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  t: number;
  color: string;
  dark: boolean;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private c: CanvasRenderingContext2D;
  private dpr = 1;
  W = 0;
  H = 0;
  tile = 48;
  private run: Run | null = null;
  private light: LightState | null = null;
  private intents = new Map<number, Intent>();
  private pre: Prerendered | null = null;
  private preKey = '';
  private player: Anim = { x: 0, y: 0, flash: 0, bx: 0, by: 0, bt: 0, fade: 1 };
  private face = 1;
  private enemies = new Map<number, Anim>();
  private dark = new Float32Array(0);
  private darkTarget = new Float32Array(0);
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  private lightImg: ImageData | null = null;
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private rings: Ring[] = [];
  private shakeAmt = 0;
  private hurt = 0;
  private whiteFlash = 0;
  private time = 0;
  private camX = 0;
  private camY = 0;
  private districtKey = '';
  hover: Point | null = null;
  settings: RenderSettings = { shake: true, reducedMotion: false, showGrid: false };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D niedostępny');
    this.c = ctx;
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d')!;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(1, rect.width);
    this.H = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    const small = this.W < 640;
    const t = Math.round(small ? Math.min(this.W / 10.5, this.H / 15) : Math.min(this.W / 20, this.H / 12.5));
    this.tile = Math.max(30, Math.min(62, t));
    this.preKey = '';
  }

  /** Call whenever the run state changes. */
  sync(run: Run) {
    this.run = run;
    const d = run.district;
    const key = `${run.seed}:${run.depth}:${d.seed}`;
    const fresh = key !== this.districtKey;
    this.light = computeLight(run);
    this.intents = computeIntents(run, this.light);
    if (fresh) {
      this.districtKey = key;
      this.preKey = '';
      this.enemies.clear();
      this.particles = [];
      this.floaters = [];
      this.rings = [];
      this.player.x = run.player.x;
      this.player.y = run.player.y;
      this.camX = run.player.x + 0.5;
      this.camY = run.player.y + 0.5;
      this.dark = new Float32Array(d.w * d.h).fill(1);
      this.lightCanvas.width = d.w;
      this.lightCanvas.height = d.h;
      this.lightImg = this.lightCtx.createImageData(d.w, d.h);
    }
    if (run.player.facing.x !== 0) this.face = run.player.facing.x;
    // enemies
    const seen = new Set<number>();
    for (const e of d.enemies) {
      seen.add(e.id);
      const a = this.enemies.get(e.id);
      if (!a) this.enemies.set(e.id, { x: e.x, y: e.y, flash: 0, bx: 0, by: 0, bt: 0, fade: fresh ? 1 : 0 });
    }
    for (const id of [...this.enemies.keys()]) if (!seen.has(id)) this.enemies.delete(id);
    // darkness targets
    this.darkTarget = new Float32Array(d.w * d.h);
    for (let i = 0; i < d.w * d.h; i++) {
      if (this.light.visible[i]) this.darkTarget[i] = Math.max(0.0, Math.min(0.72, 0.9 - this.light.level[i] * 1.1));
      else if (d.explored[i]) this.darkTarget[i] = 0.76;
      else this.darkTarget[i] = 0.975;
    }
    if (fresh) this.dark.set(this.darkTarget.map((v) => Math.max(v, 0.6)));
  }

  // ------------------------------------------------------------------ fx
  fx(list: Fx[]) {
    const run = this.run;
    if (!run) return;
    const rm = this.settings.reducedMotion;
    for (const f of list) {
      switch (f.k) {
        case 'attack': {
          const a = f.from === -1 ? this.player : this.enemies.get(f.from);
          if (a) {
            a.bx = f.dx;
            a.by = f.dy;
            a.bt = 1;
          }
          break;
        }
        case 'bump':
          this.player.bx = f.dx * 0.4;
          this.player.by = f.dy * 0.4;
          this.player.bt = 1;
          break;
        case 'hit':
          if (f.target === 'player') {
            this.player.flash = 1;
            this.hurt = Math.min(1, this.hurt + 0.55);
            this.floater(f.x, f.y, `−${f.amount}`, '#ff7a6a');
          } else {
            for (const [id, a] of this.enemies) {
              const e = run.district.enemies.find((q) => q.id === id);
              if (e && e.x === f.x && e.y === f.y) a.flash = 1;
            }
            this.burst(f.x, f.y, 6, '#ffd9a0', 'spark', 3.2);
          }
          break;
        case 'death':
          this.burst(f.x, f.y, rm ? 6 : 18, 'rgba(20,22,34,0.8)', 'smoke', 1.2);
          this.burst(f.x, f.y, rm ? 4 : 12, '#cfe8ff', 'spark', 4);
          if (f.type === 'matka') {
            this.burst(f.x, f.y, 60, '#ffe6a8', 'spark', 7);
            this.whiteFlash = 1;
          }
          break;
        case 'light': {
          const fp = flamePoint(f.kind, 0, 0, 1);
          this.rings.push({ x: f.x + 0.5, y: f.y + 0.5 + fp.y, r: f.kind === 'lamp' ? 2.6 : f.kind === 'brazier' ? 3.6 : 7, t: 0, color: '255,200,120', dark: false });
          this.burst(f.x, f.y + fp.y, rm ? 8 : 22, '#ffc070', 'ember', 2.5);
          if (f.kind === 'lighthouse') this.whiteFlash = 1;
          break;
        }
        case 'snuff':
        case 'drain':
          this.burst(f.x, f.y - 0.4, 10, 'rgba(120,120,130,0.5)', 'smoke', 0.8);
          break;
        case 'pickup':
          if (f.kind === 'oil') {
            this.burst(f.x, f.y, 10, '#e8b04b', 'drop', 2);
            this.floater(f.x, f.y, `+${f.amount} olej`, '#e8b04b');
          } else if (f.kind === 'embers') {
            this.burst(f.x, f.y, 10, '#ff9a4a', 'ember', 2.2);
            this.floater(f.x, f.y, `+${f.amount} żar`, '#ffae5e');
          }
          break;
        case 'flare':
          this.rings.push({ x: f.x + 0.5, y: f.y + 0.5, r: f.r, t: 0, color: hexToRgb(f.color), dark: false });
          this.burst(f.x, f.y, rm ? 8 : 24, f.color, 'spark', 5);
          break;
        case 'burn':
          this.burst(f.x, f.y, 8, '#ff8a3a', 'ember', 2.5);
          break;
        case 'spawn':
          if (f.visible) this.burst(f.x, f.y, 14, 'rgba(10,10,20,0.85)', 'smoke', 1);
          break;
        case 'text':
          this.floater(f.x, f.y, f.text, f.color);
          break;
        case 'pulse':
          this.rings.push({ x: f.x + 0.5, y: f.y + 0.5, r: f.r, t: 0, color: '90,60,160', dark: true });
          break;
        case 'heal':
          this.burst(run.player.x, run.player.y, 10, '#ff8f80', 'ember', 1.5);
          break;
        case 'shake':
          if (this.settings.shake && !rm) this.shakeAmt = Math.min(16, this.shakeAmt + f.power);
          break;
        case 'lunge':
          this.shakeAmt = Math.min(16, this.shakeAmt + (this.settings.shake && !rm ? 3 : 0));
          break;
        case 'victory':
          this.whiteFlash = 1;
          break;
        default:
          break;
      }
    }
  }

  private floater(x: number, y: number, text: string, color: string) {
    this.floaters.push({ x: x + 0.5, y: y + 0.2, text, color, t: 0 });
  }

  private burst(x: number, y: number, n: number, color: string, kind: Particle['kind'], speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.3 + Math.random()) * speed;
      const life = kind === 'smoke' ? 0.9 + Math.random() * 0.6 : 0.4 + Math.random() * 0.6;
      this.particles.push({
        x: x + 0.5 + (Math.random() - 0.5) * 0.3,
        y: y + 0.5 + (Math.random() - 0.5) * 0.3,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (kind === 'ember' ? 1.5 : 0),
        life,
        max: life,
        size: kind === 'smoke' ? 0.12 + Math.random() * 0.14 : 0.03 + Math.random() * 0.04,
        color,
        kind,
        g: kind === 'drop' ? 6 : kind === 'ember' ? -0.8 : kind === 'smoke' ? -0.4 : 1.5,
      });
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  // ------------------------------------------------------------------ input helpers
  tileAt(clientX: number, clientY: number): Point | null {
    const run = this.run;
    if (!run) return null;
    const rect = this.canvas.getBoundingClientRect();
    const { ox, oy } = this.origin();
    const x = Math.floor((clientX - rect.left - ox) / this.tile);
    const y = Math.floor((clientY - rect.top - oy) / this.tile);
    if (x < 0 || y < 0 || x >= run.district.w || y >= run.district.h) return null;
    return { x, y };
  }

  private origin() {
    const run = this.run!;
    const d = run.district;
    const T = this.tile;
    const mapW = d.w * T;
    const mapH = d.h * T;
    const hudTop = this.W < 640 ? 64 : 70;
    const hudBottom = this.W < 640 ? 150 : 86;
    const viewH = this.H - hudTop - hudBottom;
    let ox = this.W / 2 - this.camX * T;
    let oy = hudTop + viewH / 2 - this.camY * T;
    if (mapW <= this.W) ox = (this.W - mapW) / 2;
    else ox = Math.min(T * 0.5, Math.max(this.W - mapW - T * 0.5, ox));
    if (mapH <= viewH) oy = hudTop + (viewH - mapH) / 2;
    else oy = Math.min(hudTop + T * 0.3, Math.max(this.H - hudBottom - mapH - T * 0.3, oy));
    return { ox: Math.round(ox), oy: Math.round(oy) };
  }

  // ------------------------------------------------------------------ frame
  frame(now: number) {
    const run = this.run;
    const c = this.c;
    const dt = Math.min(0.05, this.time ? now / 1000 - this.time : 0.016);
    this.time = now / 1000;
    const t = this.time;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!run || !this.light) {
      c.fillStyle = '#07090f';
      c.fillRect(0, 0, this.W, this.H);
      return;
    }
    const d = run.district;
    const T = this.tile;
    const pal = THEMES[d.theme].palette;
    const preKey = `${this.districtKey}:${T}:${this.dpr}`;
    if (this.preKey !== preKey) {
      this.pre = prerender(d, T, this.dpr);
      this.preKey = preKey;
    }

    // ---- animate
    const k = 1 - Math.pow(0.0001, dt * 1.6);
    const pl = this.player;
    if (Math.abs(pl.x - run.player.x) + Math.abs(pl.y - run.player.y) > 3) {
      pl.x = run.player.x;
      pl.y = run.player.y;
    }
    pl.x += (run.player.x - pl.x) * k;
    pl.y += (run.player.y - pl.y) * k;
    pl.flash = Math.max(0, pl.flash - dt * 3);
    pl.bt = Math.max(0, pl.bt - dt * 6);
    for (const e of d.enemies) {
      const a = this.enemies.get(e.id);
      if (!a) continue;
      if (Math.abs(a.x - e.x) + Math.abs(a.y - e.y) > 5) {
        a.x = e.x;
        a.y = e.y;
      }
      a.x += (e.x - a.x) * k;
      a.y += (e.y - a.y) * k;
      a.flash = Math.max(0, a.flash - dt * 4);
      a.bt = Math.max(0, a.bt - dt * 6);
      a.fade = Math.min(1, a.fade + dt * 2.5);
    }
    this.camX += (pl.x + 0.5 - this.camX) * Math.min(1, dt * 6);
    this.camY += (pl.y + 0.5 - this.camY) * Math.min(1, dt * 6);
    const dk = Math.min(1, dt * 7);
    for (let i = 0; i < this.dark.length; i++) this.dark[i] += (this.darkTarget[i] - this.dark[i]) * dk;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 30);
    this.hurt = Math.max(0, this.hurt - dt * 1.2);
    this.whiteFlash = Math.max(0, this.whiteFlash - dt * 1.4);

    // ---- background
    c.fillStyle = pal.fog;
    c.fillRect(0, 0, this.W, this.H);
    let { ox, oy } = this.origin();
    if (this.shakeAmt > 0) {
      ox += (Math.random() - 0.5) * this.shakeAmt;
      oy += (Math.random() - 0.5) * this.shakeAmt;
    }
    const tx = (x: number) => ox + x * T;
    const ty = (y: number) => oy + y * T;
    const visible = (x: number, y: number) => this.light!.visible[y * d.w + x] === 1;
    const explored = (x: number, y: number) => d.explored[y * d.w + x] === 1;

    // ---- static map
    if (this.pre) c.drawImage(this.pre.canvas, ox, oy, d.w * T, d.h * T);

    // burning ground
    for (const b of d.burning) {
      c.fillStyle = 'rgba(80,30,10,0.55)';
      c.fillRect(tx(b.x) + T * 0.06, ty(b.y) + T * 0.06, T * 0.88, T * 0.88);
    }

    // grid
    if (this.settings.showGrid) {
      c.strokeStyle = 'rgba(255,255,255,0.05)';
      c.lineWidth = 1;
      for (let x = 0; x <= d.w; x++) {
        c.beginPath();
        c.moveTo(tx(x), ty(0));
        c.lineTo(tx(x), ty(d.h));
        c.stroke();
      }
      for (let y = 0; y <= d.h; y++) {
        c.beginPath();
        c.moveTo(tx(0), ty(y));
        c.lineTo(tx(d.w), ty(y));
        c.stroke();
      }
    }

    // gate
    if (d.gate.x >= 0) drawGate(c, tx(d.gate.x) + T / 2, ty(d.gate.y) + T / 2, T, gateOpen(d), t);

    // ---- y-sorted objects
    type Drawable = { y: number; draw: () => void };
    const list: Drawable[] = [];
    for (const it of d.items) {
      if (!explored(it.x, it.y) && !visible(it.x, it.y)) continue;
      list.push({ y: it.y, draw: () => drawItem(c, it.kind, tx(it.x) + T / 2, ty(it.y) + T / 2, T, t) });
    }
    for (const l of d.lamps) {
      list.push({ y: l.y + 0.01, draw: () => drawLampBase(c, l.kind, l.lit, tx(l.x) + T / 2, ty(l.y) + T / 2, T) });
    }
    const awareRange = hasRelic(run, 'czujne_oko') ? 6 : 0;
    const showEnemy = (x: number, y: number) =>
      visible(x, y) || (awareRange > 0 && Math.hypot(x - run.player.x, y - run.player.y) <= awareRange);
    for (const e of d.enemies) {
      const a = this.enemies.get(e.id);
      if (!a || !visible(e.x, e.y)) continue;
      list.push({
        y: a.y + 0.02,
        draw: () => {
          const bump = Math.sin(a.bt * Math.PI) * 0.3;
          c.save();
          c.globalAlpha = a.fade;
          drawEnemy(c, e.type, tx(a.x + a.bx * bump) + T / 2, ty(a.y + a.by * bump) + T / 2, T, t, e.id, e.elite, a.flash);
          c.restore();
        },
      });
    }
    list.push({
      y: pl.y + 0.03,
      draw: () => {
        const bump = Math.sin(pl.bt * Math.PI) * 0.3;
        drawPlayer(c, tx(pl.x + pl.bx * bump) + T / 2, ty(pl.y + pl.by * bump) + T / 2, T, run.cls, this.face, t, pl.flash);
      },
    });
    list.sort((a, b) => a.y - b.y);
    for (const dr of list) dr.draw();
    // x-ray: keep the player readable when standing behind a tall lamp or the lighthouse
    {
      const below = d.lamps.find((l) => l.x === run.player.x && (l.y === run.player.y + 1 || (l.kind === 'lighthouse' && l.y === run.player.y + 2)));
      if (below) {
        c.save();
        c.globalAlpha = 0.55;
        const bump = Math.sin(pl.bt * Math.PI) * 0.3;
        drawPlayer(c, tx(pl.x + pl.bx * bump) + T / 2, ty(pl.y + pl.by * bump) + T / 2, T, run.cls, this.face, t, pl.flash);
        c.restore();
      }
    }

    // ---- darkness (soft, per-tile, bilinear upscaled)
    const img = this.lightImg;
    if (img) {
      const fog = hexToRgbArr(pal.fog);
      for (let i = 0; i < this.dark.length; i++) {
        img.data[i * 4] = Math.round(fog[0] * 0.35);
        img.data[i * 4 + 1] = Math.round(fog[1] * 0.35);
        img.data[i * 4 + 2] = Math.round(fog[2] * 0.45 + 4);
        img.data[i * 4 + 3] = Math.round(this.dark[i] * 255);
      }
      this.lightCtx.putImageData(img, 0, 0);
      c.save();
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(this.lightCanvas, ox, oy, d.w * T, d.h * T);
      // map borders fully dark
      c.restore();
    }

    // ---- additive warm glow
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const s of this.light.sources) {
      const fl = 0.85 + Math.sin(t * 9 + s.x * 3 + s.y) * 0.06 + Math.sin(t * 15.7 + s.y) * 0.05;
      const cx = tx(s.x) + T / 2;
      const cy = ty(s.y) + T / 2 - (s.kind === 'lamp' ? T * 0.35 : s.kind === 'lighthouse' ? T * 1.1 : 0);
      const R = s.r * T * (s.kind === 'lantern' ? 0.75 : 0.95);
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, R);
      const col = s.kind === 'fire' ? '255,120,50' : s.kind === 'lantern' ? '255,190,110' : '255,176,90';
      const a0 = (s.kind === 'lantern' ? (run.player.oil > 0 ? 0.16 : 0.06) : s.kind === 'fire' ? 0.2 : 0.2) * fl;
      g.addColorStop(0, `rgba(${col},${a0})`);
      g.addColorStop(0.5, `rgba(${col},${a0 * 0.35})`);
      g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g;
      c.fillRect(cx - R, cy - R, R * 2, R * 2);
    }
    c.restore();

    // ---- emissive: windows, flames, eyes, item glows
    if (this.pre) {
      for (const w of this.pre.windows) {
        if (!w.lit) continue;
        const wx = Math.floor((w.x * this.dpr) / (T * this.dpr));
        const wy = Math.floor((w.y * this.dpr) / (T * this.dpr));
        if (wy < 0 || wx < 0 || wy >= d.h || wx >= d.w) continue;
        if (!explored(wx, wy) && !visible(wx, Math.min(d.h - 1, wy + 1)) && !explored(wx, Math.min(d.h - 1, wy + 1))) continue;
        const fl = 0.45 + Math.sin(t * 1.3 + w.phase) * 0.08 + Math.sin(t * 5.1 + w.phase * 3) * 0.04;
        c.fillStyle = `rgba(255,190,110,${fl})`;
        c.fillRect(ox + w.x, oy + w.y, w.w, w.h);
        c.fillStyle = 'rgba(40,22,12,0.85)';
        c.fillRect(ox + w.x + w.w / 2 - T * 0.012, oy + w.y, T * 0.024, w.h);
        c.fillRect(ox + w.x, oy + w.y + w.h / 2 - T * 0.012, w.w, T * 0.024);
      }
    }
    for (const it of d.items) {
      if (visible(it.x, it.y) || (d.revealed && it.kind !== 'event' && it.kind !== 'shrine'))
        drawItemGlow(c, it.kind, tx(it.x) + T / 2, ty(it.y) + T / 2, T, t);
    }
    for (const l of d.lamps) {
      const fp = flamePoint(l.kind, tx(l.x) + T / 2, ty(l.y) + T / 2, T);
      if (l.lit) drawFlame(c, fp.x, fp.y, fp.size, t, l.id);
      else if ((d.revealed && l.kind !== 'lamp') || explored(l.x, l.y) || visible(l.x, l.y)) {
        // faint marker so unlit lamps remain readable in remembered areas
        if (!visible(l.x, l.y)) {
          c.fillStyle = l.kind === 'lamp' ? 'rgba(200,190,170,0.35)' : 'rgba(240,196,108,0.6)';
          c.beginPath();
          c.arc(fp.x, fp.y + (l.kind === 'lamp' ? T * 0.06 : 0), T * (l.kind === 'lamp' ? 0.04 : 0.07), 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    for (const b of d.burning) drawFlame(c, tx(b.x) + T / 2, ty(b.y) + T * 0.8, T * 0.32, t, b.x * 7 + b.y, 0.9);
    // gate beacon when open
    if (d.gate.x >= 0 && gateOpen(d)) {
      const gx = tx(d.gate.x) + T / 2;
      const gy = ty(d.gate.y) + T / 2;
      const fl = 0.6 + Math.sin(t * 2.4) * 0.25;
      c.strokeStyle = `rgba(255,214,140,${fl})`;
      c.lineWidth = 2;
      c.strokeRect(gx - T * 0.46, gy - T * 0.5, T * 0.92, T);
    }
    // lantern
    {
      const bump = Math.sin(pl.bt * Math.PI) * 0.3;
      const px = tx(pl.x + pl.bx * bump) + T / 2;
      const py = ty(pl.y + pl.by * bump) + T / 2;
      const lo = lanternOffset(T, this.face);
      drawLanternGlow(c, px + lo.x, py + lo.y + Math.sin(t * 2.2) * T * 0.012, T, t, run.player.oil);
    }
    // eyes
    const pr = lanternRadius(run) + 2.5;
    for (const e of d.enemies) {
      const a = this.enemies.get(e.id);
      if (!a) continue;
      const vis = visible(e.x, e.y);
      const near = Math.hypot(e.x - run.player.x, e.y - run.player.y) <= pr;
      if (!vis && !near && !showEnemy(e.x, e.y)) continue;
      const alpha = (vis ? 1 : showEnemy(e.x, e.y) ? 0.8 : 0.45) * a.fade;
      drawEnemyEyes(c, e.type, tx(a.x) + T / 2, ty(a.y) + T / 2, T, t, e.id, alpha);
    }

    // ---- intents & health pips
    for (const e of d.enemies) {
      const a = this.enemies.get(e.id);
      // intents are readable whenever the enemy's eyes are (visible, or close enough to glimpse)
      if (!a || !(showEnemy(e.x, e.y) || Math.hypot(e.x - run.player.x, e.y - run.player.y) <= pr)) continue;
      const cx = tx(a.x) + T / 2;
      const cy = ty(a.y) + T / 2;
      // hp pips
      const big = e.type === 'matka';
      const pipW = T * (big ? 0.06 : 0.09);
      const total = e.maxHp;
      const startX = cx - (total * (pipW + 2)) / 2;
      const pipY = cy + T * (big ? 0.62 : 0.38);
      for (let i = 0; i < total; i++) {
        c.fillStyle = i < e.hp ? (e.elite ? '#c9a2ff' : '#e9e2d2') : 'rgba(255,255,255,0.15)';
        c.fillRect(startX + i * (pipW + 2), pipY, pipW, T * 0.045);
      }
      this.drawIntent(e.id, cx, cy, T, t, tx, ty);
    }

    // ---- rings
    for (const r of this.rings) {
      r.t += dt;
      const p = Math.min(1, r.t / 0.6);
      const R = r.r * T * (0.3 + p * 0.7);
      c.save();
      c.globalCompositeOperation = r.dark ? 'source-over' : 'lighter';
      c.strokeStyle = `rgba(${r.color},${(1 - p) * (r.dark ? 0.7 : 0.55)})`;
      c.lineWidth = T * 0.12 * (1 - p) + 1;
      c.beginPath();
      c.arc(tx(r.x), ty(r.y), R, 0, Math.PI * 2);
      c.stroke();
      if (r.dark) {
        c.fillStyle = `rgba(10,6,24,${(1 - p) * 0.35})`;
        c.fill();
      }
      c.restore();
    }
    this.rings = this.rings.filter((r) => r.t < 0.6);

    // ---- particles
    c.save();
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.vx *= 1 - dt * 1.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = Math.max(0, p.life / p.max);
      c.globalCompositeOperation = p.kind === 'smoke' ? 'source-over' : 'lighter';
      c.globalAlpha = a;
      c.fillStyle = p.color;
      const sz = p.size * T * (p.kind === 'smoke' ? 1 + (1 - a) * 1.5 : 1);
      c.beginPath();
      c.arc(tx(p.x), ty(p.y), sz, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    this.particles = this.particles.filter((p) => p.life > 0);

    // ambient embers rising from lit braziers/lamps
    if (!this.settings.reducedMotion) {
      for (const l of d.lamps) {
        if (!l.lit || Math.random() > (l.kind === 'lamp' ? 0.03 : 0.12)) continue;
        const fp = flamePoint(l.kind, l.x + 0.5, l.y + 0.5, 1);
        this.particles.push({ x: fp.x + (Math.random() - 0.5) * 0.2, y: fp.y - 0.1, vx: (Math.random() - 0.5) * 0.3, vy: -0.6 - Math.random() * 0.5, life: 1.4, max: 1.4, size: 0.02, color: '#ffb060', kind: 'ember', g: -0.1 });
      }
    }

    // ---- floaters
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `600 ${Math.round(T * 0.3)}px Lora, Georgia, serif`;
    for (const f of this.floaters) {
      f.t += dt;
      const p = f.t / 1.2;
      c.globalAlpha = Math.max(0, 1 - p * p);
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillText(f.text, tx(f.x) + 1, ty(f.y - p * 0.8) + 1);
      c.fillStyle = f.color;
      c.fillText(f.text, tx(f.x), ty(f.y - p * 0.8));
    }
    c.restore();
    this.floaters = this.floaters.filter((f) => f.t < 1.2);

    // ---- hover
    if (this.hover && (explored(this.hover.x, this.hover.y) || visible(this.hover.x, this.hover.y))) {
      c.strokeStyle = 'rgba(240,220,180,0.45)';
      c.lineWidth = 1.5;
      c.strokeRect(tx(this.hover.x) + 2, ty(this.hover.y) + 2, T - 4, T - 4);
    }

    // ---- ambient fog drift
    if (!this.settings.reducedMotion) {
      c.save();
      c.globalAlpha = 0.07;
      for (let i = 0; i < 5; i++) {
        const fx = ((t * (8 + i * 3) + i * 300) % (this.W + 600)) - 300;
        const fy = (this.H * (0.15 + i * 0.18)) + Math.sin(t * 0.3 + i) * 30;
        const g = c.createRadialGradient(fx, fy, 0, fx, fy, 260);
        g.addColorStop(0, '#9aa8c8');
        g.addColorStop(1, 'rgba(154,168,200,0)');
        c.fillStyle = g;
        c.fillRect(fx - 260, fy - 260, 520, 520);
      }
      c.restore();
    }

    // ---- screen overlays
    if (this.hurt > 0) {
      const g = c.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.3, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.75);
      g.addColorStop(0, 'rgba(120,10,10,0)');
      g.addColorStop(1, `rgba(140,14,14,${this.hurt * 0.55})`);
      c.fillStyle = g;
      c.fillRect(0, 0, this.W, this.H);
    }
    if (run.player.oil <= 0) {
      const g = c.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.25, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.45)');
      c.fillStyle = g;
      c.fillRect(0, 0, this.W, this.H);
    }
    if (this.whiteFlash > 0) {
      c.fillStyle = `rgba(255,236,200,${this.whiteFlash * 0.5})`;
      c.fillRect(0, 0, this.W, this.H);
    }
  }

  private drawIntent(
    id: number,
    cx: number,
    cy: number,
    T: number,
    t: number,
    tx: (x: number) => number,
    ty: (y: number) => number,
  ) {
    const c = this.c;
    const it = this.intents.get(id);
    if (!it) return;
    const iconY = cy - T * 0.62;
    const badge = (bg: string) => {
      c.fillStyle = 'rgba(10,10,16,0.82)';
      c.beginPath();
      c.arc(cx, iconY, T * 0.15, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = bg;
      c.lineWidth = 1.5;
      c.stroke();
    };
    switch (it.kind) {
      case 'attack': {
        badge('#ff6a5a');
        c.strokeStyle = '#ff8a7a';
        c.lineWidth = Math.max(1.5, T * 0.03);
        for (let i = -1; i <= 1; i++) {
          c.beginPath();
          c.moveTo(cx - T * 0.07 + i * T * 0.045, iconY - T * 0.07);
          c.lineTo(cx + T * 0.03 + i * T * 0.045, iconY + T * 0.07);
          c.stroke();
        }
        break;
      }
      case 'drain': {
        badge('#b6e07a');
        c.fillStyle = '#b6e07a';
        c.beginPath();
        c.moveTo(cx, iconY - T * 0.08);
        c.quadraticCurveTo(cx + T * 0.07, iconY + T * 0.02, cx, iconY + T * 0.07);
        c.quadraticCurveTo(cx - T * 0.07, iconY + T * 0.02, cx, iconY - T * 0.08);
        c.fill();
        break;
      }
      case 'move': {
        const dx = it.to.x + 0.5;
        const dy = it.to.y + 0.5;
        const ex = tx(dx);
        const ey = ty(dy);
        const ang = Math.atan2(ey - cy, ex - cx);
        const mx = cx + Math.cos(ang) * T * 0.42;
        const my = cy + Math.sin(ang) * T * 0.42;
        c.save();
        c.globalAlpha = 0.55 + Math.sin(t * 4) * 0.15;
        c.fillStyle = '#d9cfbb';
        c.translate(mx, my);
        c.rotate(ang);
        c.beginPath();
        c.moveTo(T * 0.1, 0);
        c.lineTo(-T * 0.05, -T * 0.07);
        c.lineTo(-T * 0.02, 0);
        c.lineTo(-T * 0.05, T * 0.07);
        c.closePath();
        c.fill();
        c.restore();
        break;
      }
      case 'aim': {
        const pulse = 0.35 + Math.sin(t * 8) * 0.15;
        for (const p of it.tiles) {
          c.fillStyle = `rgba(255,70,60,${pulse})`;
          c.fillRect(tx(p.x) + 3, ty(p.y) + 3, T - 6, T - 6);
          c.strokeStyle = 'rgba(255,120,100,0.8)';
          c.lineWidth = 1.5;
          c.strokeRect(tx(p.x) + 3, ty(p.y) + 3, T - 6, T - 6);
        }
        badge('#ff5040');
        c.fillStyle = '#ff6a5a';
        c.font = `700 ${Math.round(T * 0.2)}px Lora, Georgia, serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('!', cx, iconY + 1);
        break;
      }
      case 'snuff': {
        badge('#c8a4ff');
        c.strokeStyle = '#c8a4ff';
        c.lineWidth = 1.5;
        c.setLineDash([3, 3]);
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(tx(it.lamp.x) + T / 2, ty(it.lamp.y) + T / 2 - T * 0.3);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = '#c8a4ff';
        c.font = `700 ${Math.round(T * 0.17)}px Lora, Georgia, serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(`${it.need - it.progress}`, cx, iconY + 1);
        break;
      }
      case 'boss': {
        const R = 2.6 * T;
        if (it.pulse <= 0) {
          c.strokeStyle = `rgba(170,120,255,${0.5 + Math.sin(t * 8) * 0.3})`;
          c.lineWidth = 2;
          c.setLineDash([6, 5]);
          c.beginPath();
          c.arc(cx, cy, R, 0, Math.PI * 2);
          c.stroke();
          c.setLineDash([]);
        }
        const y = cy - T * 1.1;
        c.fillStyle = 'rgba(10,10,16,0.85)';
        c.beginPath();
        c.roundRect(cx - T * 0.5, y - T * 0.15, T, T * 0.3, T * 0.08);
        c.fill();
        c.fillStyle = '#c8a4ff';
        c.font = `600 ${Math.round(T * 0.17)}px Lora, Georgia, serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(it.pulse <= 0 ? 'ZAĆMIENIE!' : `zaćmienie ${it.pulse}`, cx, y + 1);
        break;
      }
      default:
        break;
    }
  }
}

function hexToRgbArr(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hexToRgb(hex: string): string {
  if (!hex.startsWith('#')) return '255,210,140';
  return hexToRgbArr(hex).join(',');
}

