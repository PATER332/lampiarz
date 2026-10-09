// Particles, floating texts, flashes. Cosmetic only — never affects gameplay.
import { fx } from '../core/util';

export type PKind = 'spark' | 'ember' | 'ash' | 'ichor' | 'dust' | 'smoke' | 'soul' | 'glint' | 'ring' | 'wax' | 'rain';

export interface Particle {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  g: number;
  drag: number;
  add: boolean;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  big: boolean;
}

const MAX = 900;

export class Fx {
  parts: Particle[] = [];
  floaters: Floater[] = [];
  flash = 0;
  flashColor = '255,255,255';
  reduced = false;

  emit(kind: PKind, x: number, y: number, n: number, o: Partial<Particle> & { speed?: number; spread?: number; dir?: number } = {}) {
    if (this.reduced) n = Math.ceil(n / 3);
    const speed = o.speed ?? 120;
    const spread = o.spread ?? Math.PI * 2;
    const dir = o.dir ?? -Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const v = speed * (0.35 + Math.random() * 0.8);
      const life = (o.life ?? 0.6) * (0.6 + Math.random() * 0.7);
      this.parts.push({
        kind,
        x: x + fx.r(-3, 3),
        y: y + fx.r(-3, 3),
        vx: Math.cos(a) * v + (o.vx ?? 0),
        vy: Math.sin(a) * v + (o.vy ?? 0),
        life,
        max: life,
        size: (o.size ?? 2) * (0.6 + Math.random() * 0.8),
        color: o.color ?? '#ffd08a',
        g: o.g ?? 0,
        drag: o.drag ?? 2,
        add: o.add ?? (kind === 'spark' || kind === 'ember' || kind === 'glint' || kind === 'soul' || kind === 'ring'),
      });
    }
    if (this.parts.length > MAX) this.parts.splice(0, this.parts.length - MAX);
  }

  text(x: number, y: number, text: string, color = '#f2e6cf', big = false) {
    this.floaters.push({ x, y, text, color, t: 0, big });
    if (this.floaters.length > 40) this.floaters.shift();
  }

  screenFlash(color: string, a: number) {
    this.flashColor = color;
    this.flash = Math.max(this.flash, a);
  }

  update(dt: number) {
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += p.g * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < 1.1);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  clear() {
    this.parts = [];
    this.floaters = [];
  }
}
