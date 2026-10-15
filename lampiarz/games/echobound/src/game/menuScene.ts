import { mulberry32 } from './rng';
import { ECHO_PAL, drawCharacter } from './sprites';

interface Mote { x: number; y: number; r: number; sp: number; ph: number; hue: number }
interface Crystal { x: number; y: number; s: number; ph: number; hue: number }
interface Walker { x: number; y: number; speed: number; scale: number; trail: number[]; t: number; alpha: number }

export class MenuScene {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private t = 0;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private mouse = { x: 0.5, y: 0.5 };
  private smooth = { x: 0.5, y: 0.5 };
  private motes: Mote[] = [];
  private crystals: Crystal[] = [];
  private walkers: Walker[] = [];
  private far: HTMLCanvasElement | null = null;
  private mid: HTMLCanvasElement | null = null;
  private near: HTMLCanvasElement | null = null;
  private sprite: HTMLCanvasElement;
  private nextWalker = 120;
  private running = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.sprite = document.createElement('canvas');
    this.sprite.width = 28; this.sprite.height = 20;
    window.addEventListener('resize', this.resize);
    window.addEventListener('pointermove', this.onMove);
    this.resize();
  }

  private onMove = (e: PointerEvent) => {
    this.mouse.x = e.clientX / Math.max(1, window.innerWidth);
    this.mouse.y = e.clientY / Math.max(1, window.innerHeight);
  };

  private resize = () => {
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.floor(this.W * this.dpr);
    this.canvas.height = Math.floor(this.H * this.dpr);
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.build();
  };

  private build() {
    const W = this.W + 160, H = this.H + 120;
    const rnd = mulberry32(7);
    const layer = (color: string, scale: number, seed: number, detail: boolean) => {
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const c = cv.getContext('2d')!;
      const r = mulberry32(seed);
      c.fillStyle = color;
      let x = -40;
      while (x < W + 40) {
        const w = (40 + r() * 120) * scale;
        const h = (H * 0.12 + r() * H * 0.33) * scale;
        c.beginPath();
        c.moveTo(x, -10); c.lineTo(x + w, -10);
        c.lineTo(x + w * 0.62, h * 0.55); c.lineTo(x + w * 0.45, h); c.lineTo(x + w * 0.3, h * 0.6);
        c.closePath(); c.fill();
        x += w * (0.5 + r() * 0.5);
      }
      x = -40;
      while (x < W + 40) {
        const w = (60 + r() * 160) * scale;
        const h = (H * 0.15 + r() * H * 0.4) * scale;
        c.beginPath();
        c.moveTo(x, H + 10); c.lineTo(x + w, H + 10);
        c.lineTo(x + w * 0.7, H - h * 0.6); c.lineTo(x + w * 0.5, H - h); c.lineTo(x + w * 0.25, H - h * 0.5);
        c.closePath(); c.fill();
        if (detail && r() < 0.4) {
          // ruin pillar
          const px = x + w * 0.5, ph = h * 0.9;
          c.fillRect(px - 8 * scale, H - ph, 16 * scale, ph);
          c.fillRect(px - 14 * scale, H - ph - 6 * scale, 28 * scale, 8 * scale);
        }
        x += w * (0.55 + r() * 0.5);
      }
      return cv;
    };
    this.far = layer('#0d1230', 1, 11, false);
    this.mid = layer('#080b1f', 1.25, 23, true);
    this.near = layer('#04050f', 1.6, 37, true);
    this.motes = [];
    for (let i = 0; i < 110; i++) this.motes.push({ x: rnd() * this.W, y: rnd() * this.H, r: 0.6 + rnd() * 1.6, sp: 0.15 + rnd() * 0.35, ph: rnd() * 10, hue: rnd() < 0.7 ? 190 : 165 });
    this.crystals = [];
    for (let i = 0; i < 26; i++) this.crystals.push({ x: rnd() * this.W, y: this.H * (0.1 + rnd() * 0.8), s: 3 + rnd() * 9, ph: rnd() * 10, hue: rnd() < 0.8 ? 190 : 280 });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('pointermove', this.onMove);
  }

  private frame = () => {
    if (!this.running) return;
    this.t++;
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw() {
    const c = this.ctx;
    const W = this.W, H = this.H, t = this.t;
    this.smooth.x += (this.mouse.x - this.smooth.x) * 0.04;
    this.smooth.y += (this.mouse.y - this.smooth.y) * 0.04;
    const mx = (this.smooth.x - 0.5), my = (this.smooth.y - 0.5);
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05060f'); sky.addColorStop(0.5, '#0a1026'); sky.addColorStop(1, '#040308');
    c.fillStyle = sky; c.fillRect(0, 0, W, H);
    // light shafts
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const bx = W * (0.2 + i * 0.22) + Math.sin(t * 0.003 + i) * 40 - mx * 60;
      const g = c.createLinearGradient(bx, 0, bx + 120, H);
      g.addColorStop(0, `rgba(110,220,255,${0.05 + 0.02 * Math.sin(t * 0.01 + i)})`);
      g.addColorStop(1, 'rgba(110,220,255,0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(bx - 30, 0); c.lineTo(bx + 60, 0); c.lineTo(bx + 260, H); c.lineTo(bx - 10, H); c.closePath(); c.fill();
    }
    c.restore();
    // far layer
    if (this.far) c.drawImage(this.far, -80 - mx * 18 + Math.sin(t * 0.0015) * 6, -60 - my * 10);
    // crystals (behind mid)
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const cr of this.crystals) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 0.03 + cr.ph);
      const x = cr.x - mx * 30, y = cr.y - my * 16;
      const r = cr.s * 5 * pulse;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${cr.hue},90%,70%,${0.22 * pulse})`);
      g.addColorStop(1, `hsla(${cr.hue},90%,70%,0)`);
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
      c.fillStyle = `hsla(${cr.hue},95%,80%,${0.6 + 0.4 * pulse})`;
      c.beginPath(); c.moveTo(x, y - cr.s); c.lineTo(x + cr.s * 0.5, y); c.lineTo(x, y + cr.s); c.lineTo(x - cr.s * 0.5, y); c.closePath(); c.fill();
    }
    c.restore();
    if (this.mid) c.drawImage(this.mid, -80 - mx * 45 + Math.sin(t * 0.002) * 10, -60 - my * 22);
    // fog bands
    c.save();
    for (let i = 0; i < 7; i++) {
      const fx = ((i * 331 + t * (0.12 + i * 0.03)) % (W + 500)) - 250 - mx * 60;
      const fy = H * (0.25 + (i % 4) * 0.2) + Math.sin(t * 0.004 + i) * 24;
      const g = c.createRadialGradient(fx, fy, 0, fx, fy, 260);
      g.addColorStop(0, 'rgba(150,190,255,0.07)');
      g.addColorStop(1, 'rgba(150,190,255,0)');
      c.fillStyle = g;
      c.fillRect(fx - 260, fy - 130, 520, 260);
    }
    c.restore();
    // walkers
    this.updateWalkers();
    // near layer
    if (this.near) c.drawImage(this.near, -80 - mx * 90, -60 - my * 40 + 10);
    // glowing plants on near floor
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      const px = ((i * 173) % (W + 100)) - 50 - mx * 90;
      const py = H - 10 - ((i * 53) % 40);
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.04 + i * 1.7);
      c.fillStyle = `rgba(110,250,220,${0.25 + 0.35 * pulse})`;
      c.fillRect(px, py - 14 - pulse * 4, 2, 14 + pulse * 4);
      c.fillRect(px - 1, py - 16 - pulse * 4, 4, 2);
    }
    c.restore();
    // motes
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      m.y -= m.sp;
      m.x += Math.sin(t * 0.01 + m.ph) * 0.2;
      if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W; }
      const a = 0.35 + 0.5 * Math.sin(t * 0.05 + m.ph);
      const x = m.x - mx * (40 + m.r * 30), y = m.y - my * 20;
      c.fillStyle = `hsla(${m.hue},100%,75%,${Math.max(0, a)})`;
      c.beginPath(); c.arc(x, y, m.r, 0, Math.PI * 2); c.fill();
      if (m.r > 1.6) {
        const g = c.createRadialGradient(x, y, 0, x, y, m.r * 6);
        g.addColorStop(0, `hsla(${m.hue},100%,75%,${Math.max(0, a) * 0.3})`);
        g.addColorStop(1, `hsla(${m.hue},100%,75%,0)`);
        c.fillStyle = g; c.fillRect(x - m.r * 6, y - m.r * 6, m.r * 12, m.r * 12);
      }
    }
    c.restore();
    // vignette
    const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.7)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
  }

  private updateWalkers() {
    const c = this.ctx;
    const W = this.W, H = this.H;
    if (--this.nextWalker <= 0) {
      this.nextWalker = 360 + Math.random() * 420;
      const scale = 3 + Math.floor(Math.random() * 2);
      this.walkers.push({ x: -60, y: H - 34 - Math.random() * 30, speed: 0.6 + Math.random() * 0.5, scale, trail: [], t: 0, alpha: 0 });
    }
    const sc = this.sprite.getContext('2d')!;
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const wk = this.walkers[i];
      wk.t++;
      wk.x += wk.speed;
      wk.alpha = Math.min(0.55, wk.alpha + 0.01);
      if (wk.t % 6 === 0) { wk.trail.push(wk.x); if (wk.trail.length > 6) wk.trail.shift(); }
      if (wk.x > W + 80) { this.walkers.splice(i, 1); continue; }
      sc.clearRect(0, 0, 28, 20);
      drawCharacter(sc, 14, 18, 1, 'run', wk.t, ECHO_PAL);
      c.save();
      c.imageSmoothingEnabled = false;
      for (let k = 0; k < wk.trail.length; k++) {
        c.globalAlpha = wk.alpha * 0.12 * (k + 1) / wk.trail.length;
        c.drawImage(this.sprite, Math.round(wk.trail[k] - 14 * wk.scale), Math.round(wk.y - 18 * wk.scale), 28 * wk.scale, 20 * wk.scale);
      }
      c.globalAlpha = wk.alpha;
      c.drawImage(this.sprite, Math.round(wk.x - 14 * wk.scale), Math.round(wk.y - 18 * wk.scale), 28 * wk.scale, 20 * wk.scale);
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(wk.x, wk.y - 8 * wk.scale, 0, wk.x, wk.y - 8 * wk.scale, 40 * wk.scale * 0.6);
      g.addColorStop(0, `rgba(111,243,255,${wk.alpha * 0.25})`);
      g.addColorStop(1, 'rgba(111,243,255,0)');
      c.fillStyle = g;
      c.fillRect(wk.x - 60, wk.y - 70, 120, 120);
      c.restore();
    }
  }
}
