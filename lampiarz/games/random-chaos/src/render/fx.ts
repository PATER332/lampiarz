// Particles, floating texts and warning markers. A fixed pool: nothing is
// allocated per frame once the pool is warm.
export const PK = { Dot: 0, Spark: 1, Confetti: 2, Star: 3, Smoke: 4, Ring: 5, Debris: 6 } as const;
export type PK = (typeof PK)[keyof typeof PK];

export interface Particle {
  on: boolean;
  kind: PK;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  grav: number;
  drag: number;
}

export class Particles {
  pool: Particle[] = [];
  private next = 0;
  constructor(public cap = 700) {
    for (let i = 0; i < cap; i++) this.pool.push({ on: false, kind: PK.Dot, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: '#fff', rot: 0, vr: 0, grav: 0, drag: 0 });
  }
  /** reduced effects: fewer particles */
  density = 1;
  spawn(kind: PK, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, grav = 0, drag = 0) {
    if (this.density < 1 && Math.random() > this.density) return;
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.cap;
    p.on = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = 0;
    p.max = life;
    p.size = size;
    p.color = color;
    p.rot = Math.random() * 6.28;
    p.vr = (Math.random() - 0.5) * 12;
    p.grav = grav;
    p.drag = drag;
  }
  burst(kind: PK, x: number, y: number, n: number, speed: number, life: number, size: number, colors: string[], grav = 0, drag = 2, up = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.35 + Math.random() * 0.65);
      this.spawn(kind, x, y, Math.cos(a) * sp, Math.sin(a) * sp - up, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), colors[i % colors.length], grav, drag);
    }
  }
  clear() {
    for (const p of this.pool) p.on = false;
  }
  update(dt: number) {
    for (const p of this.pool) {
      if (!p.on) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.on = false;
        continue;
      }
      p.vy += p.grav * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }
  draw(g: CanvasRenderingContext2D) {
    for (const p of this.pool) {
      if (!p.on) continue;
      const k = p.life / p.max;
      const a = 1 - k;
      g.globalAlpha = Math.max(0, Math.min(1, a * 1.4));
      g.fillStyle = p.color;
      g.strokeStyle = p.color;
      switch (p.kind) {
        case PK.Dot:
          g.beginPath();
          g.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, 6.283);
          g.fill();
          break;
        case PK.Smoke:
          g.globalAlpha = a * 0.5;
          g.beginPath();
          g.arc(p.x, p.y, p.size * (0.6 + k * 1.2), 0, 6.283);
          g.fill();
          break;
        case PK.Spark: {
          g.lineWidth = p.size;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
          g.stroke();
          break;
        }
        case PK.Confetti:
        case PK.Debris:
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillRect(-p.size, -p.size * (p.kind === PK.Confetti ? 0.45 : 0.8), p.size * 2, p.size * (p.kind === PK.Confetti ? 0.9 : 1.6));
          g.restore();
          break;
        case PK.Star: {
          g.beginPath();
          for (let i = 0; i < 10; i++) {
            const an = (i / 10) * 6.283 + p.rot;
            const r = i % 2 ? p.size * 0.45 : p.size;
            g.lineTo(p.x + Math.cos(an) * r, p.y + Math.sin(an) * r);
          }
          g.closePath();
          g.fill();
          break;
        }
        case PK.Ring:
          g.lineWidth = Math.max(1, p.size * 0.15 * a);
          g.beginPath();
          g.arc(p.x, p.y, p.size * (0.2 + k * 1.2), 0, 6.283);
          g.stroke();
          break;
      }
    }
    g.globalAlpha = 1;
  }
}

export interface Popup {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
  size: number;
}

export interface Marker {
  x: number;
  y: number;
  t: number;
  max: number;
  /** >0 shadow/ring on a spot, <0 arrow from a wall */
  power: number;
}
