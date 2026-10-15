export interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  color: string; size: number; g: number; drag: number; glow: boolean; shrink: boolean;
}

export interface BurstOpts {
  count: number; color: string | string[]; speed?: number; life?: number; size?: number; g?: number;
  spread?: number; glow?: boolean; drag?: number; dirX?: number; dirY?: number; shrink?: boolean; up?: boolean;
}

export class Particles {
  list: Particle[] = [];

  add(p: Particle) {
    if (this.list.length > 900) this.list.shift();
    this.list.push(p);
  }

  burst(x: number, y: number, o: BurstOpts) {
    const colors = Array.isArray(o.color) ? o.color : [o.color];
    const speed = o.speed ?? 1.2;
    for (let i = 0; i < o.count; i++) {
      const ang = o.up ? -Math.PI / 2 + (Math.random() - 0.5) * (o.spread ?? Math.PI) : Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random() * 0.9);
      const life = (o.life ?? 40) * (0.6 + Math.random() * 0.7);
      this.add({
        x, y,
        vx: Math.cos(ang) * sp + (o.dirX ?? 0),
        vy: Math.sin(ang) * sp + (o.dirY ?? 0),
        life, max: life,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: o.size ?? 1 + (Math.random() < 0.3 ? 1 : 0),
        g: o.g ?? 0,
        drag: o.drag ?? 0.98,
        glow: o.glow ?? false,
        shrink: o.shrink ?? false,
      });
    }
  }

  update() {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life--;
      if (p.life <= 0) {
        l[i] = l[l.length - 1];
        l.pop();
        continue;
      }
      p.vy += p.g;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  clear() {
    this.list.length = 0;
  }
}
