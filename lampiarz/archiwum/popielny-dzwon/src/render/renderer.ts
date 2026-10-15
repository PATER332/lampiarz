// Frame composition: backdrop → tiles → props → actors → particles → light → weather → HUD.
import { LOCATIONS } from '../data/content';
import { clamp } from '../core/util';
import { Dzwon } from '../entities/bosses';
import type { Particle } from '../world/fx';
import type { World } from '../world/world';
import { drawBoss, drawEnemy, drawPlayer } from './actors';
import { drawBackdrop, getBackdrop, type Scene } from './backdrop';
import { drawHud, drawLowHp, HudState, SERIF } from './hud';
import { glow, makeCanvas, rgba, star, type Ctx } from './paint';
import { drawHazard, drawInteractable, drawLostAsh, drawProjectile, drawSecretShimmer } from './props';
import { TileLayer } from './tiles';

export const VIEW_H = 544;
const MIN_W = 720;
const MAX_W = 1280;

interface Flake {
  x: number;
  y: number;
  v: number;
  s: number;
  ph: number;
  hot: boolean;
}

export class Renderer {
  canvas: HTMLCanvasElement;
  g: Ctx;
  viewW = 960;
  viewH = VIEW_H;
  scale = 1;
  dpr = 1;
  tiles = new TileLayer();
  hud = new HudState();
  time = 0;
  /** 0..1 black overlay for scene transitions */
  fade = 0;
  reduced = false;
  /** world zoom: the camera shows a slightly closer view than the full room height */
  zoom = 1.25;
  private light: HTMLCanvasElement;
  private lg: Ctx;
  private glowC: HTMLCanvasElement;
  private gg: Ctx;
  /** set by the game when frames are slow: drops the costliest cosmetics */
  lowQuality = false;
  private vig: HTMLCanvasElement | null = null;

  setLowQuality(on: boolean) {
    if (this.lowQuality === on) return;
    this.lowQuality = on;
    this.resize();
  }
  private vignette: HTMLCanvasElement | null = null;
  private grain: HTMLCanvasElement;
  private flakes: Flake[] = [];
  private weatherKind: string = '';

  constructor(private host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pd-canvas';
    this.canvas.setAttribute('aria-label', 'Popielny Dzwon — obszar gry');
    host.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d', { alpha: false })!;
    [this.light, this.lg] = makeCanvas(640, 272);
    [this.glowC, this.gg] = makeCanvas(640, 272);
    const [gr, gg] = makeCanvas(192, 192);
    const img = gg.createImageData(192, 192);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gg.putImageData(img, 0, 0);
    this.grain = gr;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    const cw = Math.max(320, r.width || window.innerWidth);
    const ch = Math.max(200, r.height || window.innerHeight);
    let s = ch / VIEW_H;
    let vw = cw / s;
    if (vw > MAX_W) {
      vw = MAX_W;
      s = Math.min(s, cw / MAX_W);
    } else if (vw < MIN_W) {
      vw = MIN_W;
      s = cw / MIN_W;
    }
    this.viewW = Math.round(vw);
    this.scale = s;
    this.dpr = Math.min(2, window.devicePixelRatio || 1) * (this.lowQuality || this.reduced ? 0.7 : 1);
    const pw = Math.round(this.viewW * s);
    const ph = Math.round(VIEW_H * s);
    this.canvas.style.width = `${pw}px`;
    this.canvas.style.height = `${ph}px`;
    this.canvas.width = Math.round(pw * this.dpr);
    this.canvas.height = Math.round(ph * this.dpr);
    [this.light, this.lg] = makeCanvas(Math.ceil(this.viewW / 2), Math.ceil(VIEW_H / 2));
    [this.glowC, this.gg] = makeCanvas(Math.ceil(this.viewW / 2), Math.ceil(VIEW_H / 2));
    this.vignette = null;
    this.vig = null;
  }

  private base() {
    const k = this.scale * this.dpr;
    this.g.setTransform(k, 0, 0, k, 0, 0);
    this.g.imageSmoothingEnabled = true;
  }

  // ------------------------------------------------------------------ title
  renderTitle(dt: number) {
    this.time += dt;
    this.base();
    const g = this.g;
    const t = this.time;
    const bd = getBackdrop('rynek');
    drawBackdrop(g, bd, t * 14, this.viewW, this.viewH, t);
    // the great bell hangs over the city
    const bx = this.viewW / 2;
    const by = 150 + Math.sin(t * 0.5) * 4;
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, bx, by + 40, 260, '#ff9a4a', 0.16 + Math.sin(t * 0.8) * 0.04);
    g.restore();
    g.fillStyle = '#0a0808';
    g.beginPath();
    g.moveTo(bx - 70, by + 90);
    g.quadraticCurveTo(bx - 60, by + 70, bx - 48, by + 20);
    g.quadraticCurveTo(bx - 40, by - 50, bx, by - 56);
    g.quadraticCurveTo(bx + 40, by - 50, bx + 48, by + 20);
    g.quadraticCurveTo(bx + 60, by + 70, bx + 70, by + 90);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,170,90,0.35)';
    g.lineWidth = 1.5;
    g.stroke();
    g.strokeStyle = 'rgba(255,170,90,0.55)';
    g.beginPath();
    g.moveTo(bx - 6, by - 56);
    g.lineTo(bx + 4, by - 10);
    g.lineTo(bx - 8, by + 30);
    g.lineTo(bx + 6, by + 88);
    g.stroke();
    g.fillStyle = '#0a0808';
    g.fillRect(bx - 2, 0, 4, by - 56);
    this.weather('ash', dt, 0);
    this.post(null);
  }

  // ------------------------------------------------------------------ world
  render(w: World, dt: number, opts: { usingPad: boolean; halszkaNew: boolean; hudVisible: boolean }) {
    this.time += dt;
    this.hud.update(dt);
    if (this.reduced !== w.settings.reduced) {
      this.reduced = w.settings.reduced;
      this.resize();
    }
    w.fx.reduced = this.reduced;
    const Z = this.zoom;
    w.viewW = this.viewW / Z;
    w.viewH = this.viewH / Z;
    this.base();
    const g = this.g;
    const t = this.time;
    const scene: Scene = w.location;
    const bd = getBackdrop(scene);
    const camX = w.camX;
    this.mark('start');
    drawBackdrop(g, bd, camX * Z, this.viewW, this.viewH, t, w.camY * Z, !this.lowQuality);
    this.mark('bg');

    let sx = 0;
    let sy = 0;
    if (w.shakeT > 0 && w.shakePow > 0) {
      const k = Math.min(1, w.shakeT * 4);
      sx = (Math.random() - 0.5) * w.shakePow * k;
      sy = (Math.random() - 0.5) * w.shakePow * k;
    }
    const WV = w.viewW;
    g.save();
    g.scale(Z, Z);
    g.translate(-camX + sx / Z, -w.camY + sy / Z);
    this.tiles.sync(w.level);
    this.tiles.draw(g, camX, WV, scene);
    this.mark('tiles');
    if (w.player.stats.revealSecrets) drawSecretShimmer(g, w.level, camX, WV, t);

    const pc = {
      level: w.level,
      scene,
      time: t,
      reveal: w.player.stats.revealSecrets,
      halszkaNew: opts.halszkaNew,
      bossDefeated: !!w.save.bosses.dzwon,
    };
    const L = camX - 200;
    const R = camX + WV + 200;
    for (const it of w.interactables) if (it.x > L && it.x < R) drawInteractable(g, it, pc);
    this.mark('props');
    for (const h of w.hazards) drawHazard(g, h, t);
    if (w.lostAsh) drawLostAsh(g, w.lostAsh.x, w.lostAsh.y, t);
    const b = w.boss;
    if (b) drawBoss(g, b, t, w.windupMul, w.arena.floor, w.arena.top || 0);
    for (const e of w.enemies) if (e.cx > L && e.cx < R) drawEnemy(g, e, t, w.windupMul);
    drawPlayer(g, w.player, t);
    this.mark('actors');
    for (const pr of w.projectiles) drawProjectile(g, pr, t);
    this.cosmetics(w);
    this.particles(g, w.fx.parts);
    this.mark('parts');
    // floating numbers
    for (const f of w.fx.floaters) {
      const k = f.t / 1.1;
      g.save();
      g.globalAlpha = clamp(1.4 - k * 1.4, 0, 1);
      g.font = `${f.big ? 'bold 20' : '15'}px ${SERIF}`;
      g.textAlign = 'center';
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.fillText(f.text, f.x + 1, f.y - k * 34 + 1);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y - k * 34);
      g.restore();
    }
    g.restore();

    // darkness with light holes
    const dark = w.darkOverride ?? (scene === 'krypta' ? 0.4 : LOCATIONS[scene].darkness);
    this.darkness(w, dark, camX - sx / Z, w.camY - sy / Z);
    this.mark('dark');

    const weather = scene === 'krypta' ? 'embers' : LOCATIONS[scene].weather;
    this.weather(weather, dt, camX);
    this.mark('weather');

    if (w.fx.flash > 0) {
      g.fillStyle = `rgba(${w.fx.flashColor},${w.fx.flash})`;
      g.fillRect(0, 0, this.viewW, this.viewH);
    }
    drawLowHp(g, w, this.viewW, this.viewH, t);
    this.post(w);
    this.mark('post');
    if (opts.hudVisible) drawHud(g, w, this.hud, this.viewW, this.viewH, t, opts.usingPad, Z);
    this.mark('hud');
    if (this.fade > 0) {
      g.fillStyle = `rgba(0,0,0,${clamp(this.fade, 0, 1)})`;
      g.fillRect(0, 0, this.viewW, this.viewH);
    }
  }

  /** Purely decorative particle emitters tied to world state. */
  private cosmetics(w: World) {
    if (this.reduced) return;
    const b = w.boss;
    if (b && !b.dead && b.bossId === 'kat' && b.phase === 2 && Math.random() < 0.35) {
      w.fx.emit('ember', b.cx + b.face * 50 + (Math.random() - 0.5) * 60, b.body.y + 20, 1, { color: '#ff9a4a', speed: 40, life: 1, g: -80 });
    }
    if (b instanceof Dzwon && b.phase === 1 && b.state === 'grounded' && Math.random() < 0.3) {
      w.fx.emit('ember', b.cx + (Math.random() - 0.5) * 40, b.feet - 10, 1, { color: '#ff8a3a', speed: 30, life: 1.2, g: -60 });
    }
    if (w.lostAsh && Math.random() < 0.15) w.fx.emit('soul', w.lostAsh.x, w.lostAsh.y - 10, 1, { color: '#ffd38a', speed: 20, life: 1.5, g: -40 });
    for (const it of w.interactables) {
      if (Math.abs(it.x - w.player.cx) > 700) continue;
      if (it.kind === 'shrine' && it.used && Math.random() < 0.06) w.fx.emit('ember', it.x, it.y - 34, 1, { color: '#ffcf7a', speed: 20, life: 1.4, g: -50 });
      if (it.kind === 'station' && it.data === 'S' && Math.random() < 0.25) w.fx.emit('ember', it.x + (Math.random() - 0.5) * 30, it.y - 20, 1, { color: '#ffae5a', speed: 30, life: 1.6, g: -70 });
      if (it.kind === 'portal' && Math.random() < 0.2) w.fx.emit('soul', it.x + (Math.random() - 0.5) * 30, it.y - 10, 1, { color: '#cfc6ff', speed: 30, life: 1.4, g: -60 });
    }
  }

  private particles(g: Ctx, parts: Particle[]) {
    for (const p of parts) {
      const k = p.life / p.max;
      if (p.add) g.globalCompositeOperation = 'lighter';
      switch (p.kind) {
        case 'spark':
          g.strokeStyle = rgba(p.color, k);
          g.lineWidth = p.size * 0.7;
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          g.stroke();
          break;
        case 'ring':
          g.strokeStyle = rgba(p.color, k * 0.8);
          g.lineWidth = 3 * k;
          g.beginPath();
          g.arc(p.x, p.y, p.size * (1.6 - k), 0, Math.PI * 2);
          g.stroke();
          break;
        case 'glint':
          star(g, p.x, p.y, p.size * 3, p.color, k);
          break;
        case 'soul':
        case 'ember':
          g.fillStyle = rgba(p.color, k);
          g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          if (p.kind === 'soul') glow(g, p.x, p.y, p.size * 4, p.color, k * 0.4);
          break;
        case 'smoke':
          g.fillStyle = rgba(p.color, k * 0.25);
          g.beginPath();
          g.arc(p.x, p.y, p.size * (2 - k) * 3, 0, Math.PI * 2);
          g.fill();
          break;
        default:
          g.fillStyle = rgba(p.color, Math.min(1, k * 1.5));
          g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      if (p.add) g.globalCompositeOperation = 'source-over';
    }
  }

  private darkness(w: World, dark: number, camX: number, camY: number) {
    const lg = this.lg;
    const W = this.light.width;
    const H = this.light.height;
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, W, H);
    lg.fillStyle = `rgba(4,3,8,${dark})`;
    lg.fillRect(0, 0, W, H);
    // light holes: a pre-rendered falloff sprite scaled per light
    lg.globalCompositeOperation = 'destination-out';
    const k = this.zoom / 2;
    const hole = sprite('#000000');
    const vis: { x: number; y: number; r: number; l: (typeof w.lights)[number] }[] = [];
    for (const l of w.lights) {
      const x = (l.x - camX) * k;
      const y = (l.y - camY) * k;
      const r = l.r * k;
      if (x + r < 0 || x - r > W || y + r < 0 || y - r > H) continue;
      vis.push({ x, y, r, l });
      lg.globalAlpha = clamp(l.a, 0, 1);
      lg.drawImage(hole, x - r, y - r, r * 2, r * 2);
    }
    lg.globalAlpha = 1;
    // vignette shares the same pass
    lg.globalCompositeOperation = 'source-over';
    lg.drawImage(this.vignetteCanvas(W, H), 0, 0);
    this.g.drawImage(this.light, 0, 0, this.viewW, this.viewH);
    // coloured glow, additive, also at half resolution
    const gg = this.gg;
    gg.globalCompositeOperation = 'source-over';
    gg.clearRect(0, 0, W, H);
    gg.globalCompositeOperation = 'lighter';
    for (const v of vis) {
      gg.globalAlpha = clamp(v.l.a * 0.2, 0, 1);
      gg.drawImage(sprite(v.l.color), v.x - v.r * 0.9, v.y - v.r * 0.9, v.r * 1.8, v.r * 1.8);
    }
    gg.globalAlpha = 1;
    this.g.save();
    this.g.globalCompositeOperation = 'lighter';
    this.g.drawImage(this.glowC, 0, 0, this.viewW, this.viewH);
    this.g.restore();
  }

  private weather(kind: string, dt: number, camX: number) {
    const g = this.g;
    const n = this.reduced ? 30 : Math.round((kind === 'rain' ? 170 : kind === 'embers' ? 26 : 90) * (this.lowQuality ? 0.5 : 1));
    if (this.weatherKind !== kind || this.flakes.length !== n) {
      this.weatherKind = kind;
      this.flakes = Array.from({ length: n }, () => ({
        x: Math.random() * this.viewW,
        y: Math.random() * this.viewH,
        v: 0.5 + Math.random(),
        s: 0.6 + Math.random() * 1.4,
        ph: Math.random() * 6,
        hot: Math.random() < 0.12,
      }));
    }
    const W = this.viewW;
    const H = this.viewH;
    const drift = (this.lastCam === null ? 0 : camX - this.lastCam) || 0;
    this.lastCam = camX;
    for (const f of this.flakes) {
      f.ph += dt;
      if (kind === 'rain') {
        f.x += (-140 * f.v) * dt - drift * 0.9;
        f.y += 760 * f.v * dt;
      } else if (kind === 'embers') {
        f.x += Math.sin(f.ph * 1.3) * 12 * dt - drift * 0.5;
        f.y -= 24 * f.v * dt;
      } else if (kind === 'dust') {
        f.x += Math.sin(f.ph * 0.4) * 8 * dt - drift * 0.6;
        f.y += Math.cos(f.ph * 0.3) * 5 * dt;
      } else {
        f.x += (Math.sin(f.ph) * 16 - 10) * dt - drift * 0.8;
        f.y += 34 * f.v * dt;
      }
      if (f.y > H + 10) {
        f.y = -10;
        f.x = Math.random() * W;
      }
      if (f.y < -12) {
        f.y = H + 8;
        f.x = Math.random() * W;
      }
      if (f.x < -20) f.x += W + 40;
      if (f.x > W + 20) f.x -= W + 40;
      if (kind === 'rain') {
        g.strokeStyle = `rgba(170,200,210,${0.18 * f.v})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(f.x, f.y);
        g.lineTo(f.x + 3.5 * f.v, f.y - 15 * f.v);
        g.stroke();
      } else if (kind === 'embers' || (kind === 'ash' && f.hot)) {
        g.fillStyle = `rgba(255,${140 + f.s * 40},80,${0.5 + Math.sin(f.ph * 5) * 0.3})`;
        g.fillRect(f.x, f.y, f.s, f.s);
      } else if (kind === 'dust') {
        g.fillStyle = `rgba(255,220,170,${0.12 + Math.sin(f.ph * 2) * 0.08})`;
        g.fillRect(f.x, f.y, f.s, f.s);
      } else {
        g.fillStyle = `rgba(190,185,180,${0.35 * f.v})`;
        g.fillRect(f.x, f.y, f.s * 1.6, f.s * 1.6);
      }
    }
  }
  private lastCam: number | null = null;
  /** optional section timings for performance tests (window.__pdProfile = {}) */
  private profT = 0;
  private mark(name: string) {
    const prof = (window as unknown as { __pdProfile?: Record<string, number> }).__pdProfile;
    if (!prof) return;
    const now = performance.now();
    if (name === 'start') {
      this.profT = now;
      return;
    }
    prof[name] = (prof[name] ?? 0) + (now - this.profT);
    this.profT = now;
  }

  private post(w: World | null) {
    const g = this.g;
    if (!this.vignette) {
      const [v, vg] = makeCanvas(this.viewW, this.viewH);
      const grd = vg.createRadialGradient(this.viewW / 2, this.viewH / 2, this.viewH * 0.3, this.viewW / 2, this.viewH / 2, this.viewW * 0.66);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.78)');
      vg.fillStyle = grd;
      vg.fillRect(0, 0, this.viewW, this.viewH);
      this.vignette = v;
    }
    if (!w) g.drawImage(this.vignette, 0, 0);
    if (!this.reduced && !this.lowQuality) {
      g.save();
      g.globalAlpha = 0.045;
      g.globalCompositeOperation = 'overlay';
      const ox = Math.floor(Math.random() * 192);
      const oy = Math.floor(Math.random() * 192);
      for (let x = -ox; x < this.viewW; x += 192) for (let y = -oy; y < this.viewH; y += 192) g.drawImage(this.grain, x, y);
      g.restore();
    }
  }

  private vignetteCanvas(W: number, H: number) {
    if (this.vig && this.vig.width === W && this.vig.height === H) return this.vig;
    const [v, vg] = makeCanvas(W, H);
    const grd = vg.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.66);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.78)');
    vg.fillStyle = grd;
    vg.fillRect(0, 0, W, H);
    this.vig = v;
    return v;
  }
}

const sprites = new Map<string, HTMLCanvasElement>();
/** Radial falloff sprite in one colour (cached). */
function sprite(color: string): HTMLCanvasElement {
  let c = sprites.get(color);
  if (c) return c;
  const [cv, g] = makeCanvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, rgba(color, 1));
  grd.addColorStop(0.45, rgba(color, 0.5));
  grd.addColorStop(1, rgba(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  sprites.set(color, cv);
  c = cv;
  return c;
}
