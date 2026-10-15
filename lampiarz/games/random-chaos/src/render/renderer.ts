// Draws a round: camera, parallax background, blocks, hazards, loose objects,
// coins, the two characters, particles, glows and the HUD. It also turns the
// simulation's events into particles, sounds and screen shake.
import { clamp, lerp, type Rect } from '../engine/math';
import type { Coins } from '../sim/games/coins';
import { COLOR_HEX, type Colors } from '../sim/games/colors';
import type { King } from '../sim/games/king';
import { MOD_BY_ID } from '../sim/modifiers';
import type { Player } from '../sim/player';
import type { Round } from '../sim/round';
import type { Prop, SimEvent, Solid, Zone } from '../sim/world';
import { drawCharacter, PCOL, star } from './character';
import { type Marker, Particles, PK, type Popup } from './fx';
import { drawBackground, gear, THEMES, type Theme } from './themes';

export interface RenderOpts {
  /** 0..1 screen shake strength from settings */
  shake: number;
  reduced: boolean;
  hud: boolean;
  /** a results panel covers the middle: skip the big round-over banner */
  panel?: boolean;
  /** match score shown under the timer */
  match?: { score: [number, number]; target: number };
  sfx: (name: string, x?: number, vol?: number) => void;
}

const FONT = '"RC Display", "Inter", system-ui, sans-serif';
const BODY = '"Inter", system-ui, sans-serif';

export class Renderer {
  g: CanvasRenderingContext2D;
  W = 1280;
  H = 720;
  dpr = 1;
  cam = { x: 640, y: 360, z: 1 };
  shakeT = 0;
  shakeP = 0;
  hitStop = 0;
  fx = new Particles();
  pops: Popup[] = [];
  marks: Marker[] = [];
  time = 0;
  private round: Round | null = null;

  constructor(public canvas: HTMLCanvasElement) {
    const g = canvas.getContext('2d', { alpha: false });
    if (!g) throw new Error('Canvas 2D is not available');
    this.g = g;
  }

  resize(cssW: number, cssH: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(1, Math.round(cssW * this.dpr));
    this.H = Math.max(1, Math.round(cssH * this.dpr));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
  }

  /** base scale: 1280×720 logical units fit inside the canvas */
  get base() {
    return Math.min(this.W / 1280, this.H / 720);
  }

  /** New round: snap the camera, clear effects. */
  attach(r: Round | null) {
    this.round = r;
    this.fx.clear();
    this.pops = [];
    this.marks = [];
    if (r) {
      const v = r.game.view();
      this.cam.x = v.x + v.w / 2;
      this.cam.y = v.y + v.h / 2;
      this.cam.z = this.zoomFor(v);
    }
  }

  private zoomFor(v: Rect) {
    return clamp(Math.min(1280 / v.w, 720 / v.h), 0.42, 1);
  }

  /** Effects and sound for the simulation's events. */
  consume(r: Round, o: RenderOpts) {
    const evs = r.world.events;
    const th = THEMES[r.game.def.theme];
    for (const e of evs) this.event(e, r, th, o);
    evs.length = 0;
  }

  private event(e: SimEvent, r: Round, th: Theme, o: RenderOpts) {
    const F = this.fx;
    const dust = th.dark > 0.2 ? '#8a7d8f' : '#ffffff';
    switch (e.type) {
      case 'jump':
        F.burst(PK.Smoke, e.x, e.y - 4, 4, 90, 0.35, 7, [dust], -40, 4);
        o.sfx('jump', e.x, 0.9);
        break;
      case 'land':
        if ((e.power ?? 0) > 0.25) {
          F.burst(PK.Smoke, e.x, e.y - 4, 6, 160 * (e.power ?? 0.5), 0.4, 8, [dust], -20, 5);
          o.sfx('land', e.x, e.power ?? 0.5);
        }
        break;
      case 'dash':
        if (e.power === -1) o.sfx('slamStart', e.x);
        else {
          F.burst(PK.Spark, e.x, e.y, 6, 260, 0.25, 3, ['#ffffff', PCOL[e.p].light], 0, 6);
          o.sfx('dash', e.x);
        }
        break;
      case 'slam':
        F.burst(PK.Smoke, e.x, e.y - 6, 14, 380, 0.5, 11, [dust], -30, 5);
        F.spawn(PK.Ring, e.x, e.y - 6, 0, 0, 0.4, 150, '#ffffff');
        o.sfx('slam', e.x);
        this.shake(0.35 * o.shake);
        break;
      case 'hit':
        F.burst(PK.Spark, e.x, e.y, 14, 520, 0.3, 4, ['#ffffff', '#ffe066', PCOL[e.by].light], 0, 4);
        F.burst(PK.Star, e.x, e.y, 5, 260, 0.6, 9, ['#ffe066'], 300, 2);
        F.spawn(PK.Ring, e.x, e.y, 0, 0, 0.25, 70, '#ffffff');
        this.pop(['BUM!', 'PAC!', 'ŁUP!', 'BACH!'][Math.floor(Math.random() * 4)], e.x, e.y - 40, '#ffe066', 30);
        o.sfx('hit', e.x, Math.min(1.2, 0.7 + e.power * 0.3));
        if (!o.reduced) this.hitStop = Math.min(0.09, 0.04 + e.power * 0.02);
        this.shake(0.18 * e.power * o.shake);
        break;
      case 'stomp':
        F.burst(PK.Star, e.x, e.y, 6, 220, 0.6, 8, ['#ffe066', '#ffffff'], 200, 2);
        o.sfx('stomp', e.x);
        break;
      case 'spring':
        F.burst(PK.Spark, e.x, e.y, 10, 300, 0.3, 3, ['#ffffff', th.accent], 300, 3);
        o.sfx('spring', e.x);
        break;
      case 'crumble': {
        for (let i = 0; i < 10; i++) F.spawn(PK.Debris, e.x + Math.random() * e.w, e.y + Math.random() * e.h, (Math.random() - 0.5) * 200, -Math.random() * 200, 0.9, 5 + Math.random() * 4, th.tints[i % 4], 1600, 0.5);
        o.sfx('crumble', e.x + e.w / 2, 0.8);
        break;
      }
      case 'appear':
        F.burst(PK.Spark, e.x + e.w / 2, e.y, 8, 200, 0.3, 2, ['#ffffff'], 0, 4);
        break;
      case 'explode':
        F.burst(PK.Smoke, e.x, e.y, 18, 300, 0.8, 22, ['#3b3b3b', '#585858'], -60, 3);
        F.burst(PK.Spark, e.x, e.y, 22, 700, 0.35, 4, ['#ffcf33', '#ff7a1a', '#ffffff'], 600, 2);
        F.spawn(PK.Ring, e.x, e.y, 0, 0, 0.35, 220, '#ffb21f');
        o.sfx('explode', e.x);
        this.shake(0.6 * o.shake);
        break;
      case 'impact':
      case 'thud':
        F.burst(PK.Smoke, e.x, e.y, 6, 180, 0.45, 9, [dust], -20, 4);
        o.sfx(e.type === 'thud' ? 'thud' : 'impact', e.x, e.power);
        if (e.type === 'thud') this.shake(0.12 * e.power * o.shake);
        break;
      case 'warn':
        this.marks.push({ x: e.x, y: e.y, t: 0, max: 1.1, power: e.power });
        o.sfx('warn', e.x, 0.6);
        break;
      case 'blast':
        F.spawn(PK.Ring, e.x, e.y, 0, 0, 0.5, 380, '#ffe066');
        F.burst(PK.Spark, e.x, e.y, 30, 800, 0.4, 3, ['#ffe066', '#ffffff'], 0, 3);
        o.sfx('blast', e.x);
        break;
      case 'coin':
        F.burst(PK.Star, e.x, e.y, e.n > 1 ? 12 : 5, 220, 0.5, e.n > 1 ? 9 : 6, ['#ffe066', '#fff6c2'], 0, 3);
        this.pop(`+${e.n}`, e.x, e.y - 20, '#ffe066', e.n > 1 ? 34 : 24);
        o.sfx(e.n > 1 ? 'bigCoin' : 'coin', e.x);
        break;
      case 'coinDrop':
        this.pop(`-${e.n}`, e.x, e.y - 50, '#ff6b6b', 26);
        o.sfx('coinDrop', e.x);
        break;
      case 'button':
        F.burst(PK.Spark, e.x, e.y, 8, 200, 0.3, 2, ['#7dff9a'], 0, 4);
        o.sfx('button', e.x);
        break;
      case 'gate':
        o.sfx('gate', e.x);
        break;
      case 'score':
        this.pop(e.text, e.x, e.y, PCOL[e.p].light, 26);
        break;
      case 'text':
        this.pop(e.text, e.x, e.y, e.color ?? '#ffffff', 30);
        break;
      case 'hurt':
        F.burst(PK.Spark, e.x, e.y, 12, 380, 0.3, 3, ['#ff4f6d', '#ffffff'], 0, 4);
        o.sfx('hurt', e.x);
        this.shake(0.2 * o.shake);
        break;
      case 'fall': {
        const lava = r.world.zones.some((z) => z.kind === 'lava');
        if (lava) F.burst(PK.Dot, e.x, e.y, 18, 420, 0.7, 5, [th.lava[0], th.lava[1]], 900, 1);
        o.sfx('fall', e.x);
        break;
      }
      case 'respawn':
        F.spawn(PK.Ring, e.x, e.y, 0, 0, 0.45, 70, PCOL[e.p].light);
        o.sfx('respawn', e.x, 0.7);
        break;
      case 'stun':
        break;
      case 'sfx':
        o.sfx(e.name, e.x, e.vol);
        break;
      case 'shake':
        this.shake(e.power * o.shake);
        break;
      case 'vanish':
        break;
    }
  }

  shake(p: number) {
    this.shakeP = Math.max(this.shakeP, p);
    this.shakeT = 0.3;
  }
  pop(text: string, x: number, y: number, color: string, size: number) {
    if (this.pops.length > 30) this.pops.shift();
    this.pops.push({ text, x, y, t: 0, color, size });
  }

  // ---------------------------------------------------------------- frame
  frame(r: Round | null, dt: number, o: RenderOpts) {
    this.time += dt;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!r) {
      g.fillStyle = '#10142b';
      g.fillRect(0, 0, this.W, this.H);
      return;
    }
    if (r !== this.round) this.attach(r);
    this.consume(r, o);
    this.fx.density = o.reduced ? 0.4 : 1;
    this.fx.update(dt);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 1.1);
    for (const m of this.marks) m.t += dt;
    this.marks = this.marks.filter((m) => m.t < m.max);

    // camera
    const v = r.game.view();
    const tz = this.zoomFor(v);
    const k = Math.min(1, dt * 4);
    this.cam.z = lerp(this.cam.z, tz, k);
    const halfW = 640 / this.cam.z;
    const halfH = 360 / this.cam.z;
    const B = r.world.bounds;
    let tx = v.x + v.w / 2;
    let ty = v.y + v.h / 2;
    // stay inside the arena when it is bigger than the view
    if (B.w > halfW * 2) tx = clamp(tx, B.x + halfW, B.x + B.w - halfW);
    else tx = B.x + B.w / 2;
    if (B.h > halfH * 2) ty = clamp(ty, B.y + halfH, B.y + B.h - halfH);
    this.cam.x = lerp(this.cam.x, tx, k * 1.2);
    this.cam.y = lerp(this.cam.y, ty, k * 1.2);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT <= 0) this.shakeP = 0;
    const sh = o.reduced ? 0 : this.shakeP * (this.shakeT / 0.3) * 14;
    const S = this.base * this.cam.z;
    const ox = this.W / 2 - this.cam.x * S + (Math.random() - 0.5) * sh * this.base;
    const oy = this.H / 2 - this.cam.y * S + (Math.random() - 0.5) * sh * this.base;
    const theme = r.game.def.theme;
    const T = THEMES[theme];

    drawBackground(g, theme, this.cam.x, this.cam.y, this.cam.z, this.W, this.H, this.time);
    g.setTransform(S, 0, 0, S, ox, oy);

    this.drawZonesBack(g, r, T);
    for (const s of r.world.solids) this.drawSolid(g, s, r, T);
    this.drawZonesFront(g, r, T);
    this.drawMarkers(g, r, T);
    if (r.cfg.game === 'coins') this.drawCoins(g, r.game as Coins);
    for (const pr of r.world.props) if (pr.alive) this.drawProp(g, pr, r);
    // shadows, then characters (the leader on top)
    for (const p of r.players) if (p.alive) this.drawShadow(g, p, r);
    const order = [...r.players].sort((a, b) => (a.winT > 0 ? 1 : 0) - (b.winT > 0 ? 1 : 0));
    for (const p of order) if (p.alive) drawCharacter(g, p, { time: this.time, dt, tag: r.phase !== 'over' });
    this.fx.draw(g);
    this.drawLava(g, r, T);
    this.drawModWorld(g, r);
    this.drawPops(g);

    // glow / vignette in screen space
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!o.reduced) {
      const vg = g.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.45, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, `rgba(0,0,0,${0.18 + T.dark * 0.5})`);
      g.fillStyle = vg;
      g.fillRect(0, 0, this.W, this.H);
    }
    // off-screen pointers
    for (const p of r.players) this.drawOffscreen(g, p, S, ox, oy);
    if (o.hud) this.drawHud(g, r, o);
  }

  // ---------------------------------------------------------------- world parts
  private drawShadow(g: CanvasRenderingContext2D, p: Player, r: Round) {
    const gy = r.world.groundBelow(p.cx, p.bottom - 2, 600);
    if (gy === null) return;
    const d = gy - p.bottom;
    const k = clamp(1 - d / 400, 0.2, 1);
    g.fillStyle = `rgba(0,0,0,${0.28 * k})`;
    g.beginPath();
    g.ellipse(p.cx, gy + 1, p.w * 0.7 * k, 5 * k, 0, 0, Math.PI * 2);
    g.fill();
  }

  private drawSolid(g: CanvasRenderingContext2D, s: Solid, r: Round, T: Theme) {
    if (s.state === 'gone') return;
    if (!s.active && s.tag !== 'sweeper') return;
    if (s.tag === 'sweeper' && s.x < -100) return;
    const shakeX = s.state === 'warn' ? Math.sin(this.time * 70) * 2.5 * s.shake : 0;
    const x = s.x + shakeX;
    const y = s.y;
    g.save();
    g.globalAlpha = s.alpha * (s.state === 'warn' && s.respawn > 0 && s.crumble > 0.8 ? 0.85 : 1);
    let tint = T.tints[s.tint % 4];
    if (s.color >= 0) tint = COLOR_HEX[s.color];
    switch (s.style) {
      case 'ground':
      case 'wall': {
        g.fillStyle = T.ground.body;
        g.fillRect(x, y, s.w, s.h);
        // texture stripes
        g.fillStyle = 'rgba(0,0,0,0.08)';
        for (let yy = y + 18; yy < y + s.h; yy += 22) g.fillRect(x, yy, s.w, 3);
        if (s.style === 'ground') {
          g.fillStyle = T.ground.top;
          roundRect(g, x - 2, y, s.w + 4, 12, 4);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.25)';
          g.fillRect(x, y + 2, s.w, 2);
        }
        g.strokeStyle = T.ground.edge;
        g.lineWidth = 3;
        g.strokeRect(x + 1.5, y + 1.5, s.w - 3, s.h - 3);
        break;
      }
      case 'pillar': {
        const grd = g.createLinearGradient(x, y, x + s.w, y);
        grd.addColorStop(0, shade(T.ground.body, 0.15));
        grd.addColorStop(1, shade(T.ground.body, -0.2));
        g.fillStyle = grd;
        g.fillRect(x, y, s.w, s.h);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        for (let i = 0; i < 6; i++) g.fillRect(x + 20 + i * 44, y + 30 + (i % 2) * 40, 26, 10);
        g.fillStyle = T.ground.top;
        roundRect(g, x - 6, y - 4, s.w + 12, 16, 6);
        g.fill();
        g.strokeStyle = T.ground.edge;
        g.lineWidth = 3;
        g.strokeRect(x + 1.5, y + 1.5, s.w - 3, s.h - 3);
        break;
      }
      case 'platform':
      case 'tile': {
        const h = s.h;
        const called = r.cfg.game === 'colors' && (r.game as Colors).called === s.color && s.color >= 0;
        if (called && !(this.time * 8 % 2 < 1)) {
          g.shadowColor = tint;
          g.shadowBlur = 24;
        }
        g.fillStyle = 'rgba(0,0,0,0.22)';
        roundRect(g, x + 3, y + 6, s.w, h, 7);
        g.fill();
        g.shadowBlur = 0;
        const grd = g.createLinearGradient(x, y, x, y + h);
        grd.addColorStop(0, shade(tint, 0.25));
        grd.addColorStop(0.5, tint);
        grd.addColorStop(1, shade(tint, -0.25));
        g.fillStyle = grd;
        roundRect(g, x, y, s.w, h, 7);
        g.fill();
        g.strokeStyle = T.platformEdge;
        g.lineWidth = 3;
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        roundRect(g, x + 6, y + 3, s.w - 12, 4, 2);
        g.fill();
        if (s.path) {
          // little gears: it moves
          gear(g, x + 14, y + h / 2 + 1, 5, this.time * 4, 'rgba(0,0,0,0.35)');
          gear(g, x + s.w - 14, y + h / 2 + 1, 5, -this.time * 4, 'rgba(0,0,0,0.35)');
        }
        if (s.crumble > 0 && s.state === 'warn') {
          // cracks
          g.strokeStyle = 'rgba(40,10,10,0.75)';
          g.lineWidth = 2;
          g.beginPath();
          const n = 2 + Math.floor(s.shake * 4);
          for (let i = 0; i < n; i++) {
            const cx0 = x + (s.w * (i + 0.5)) / n;
            g.moveTo(cx0, y + 2);
            g.lineTo(cx0 + 6, y + h * 0.5);
            g.lineTo(cx0 - 4, y + h - 2);
          }
          g.stroke();
          g.fillStyle = `rgba(255,60,60,${0.25 * s.shake})`;
          roundRect(g, x, y, s.w, h, 7);
          g.fill();
        } else if (s.crumble > 0 && s.style === 'tile' && r.cfg.game !== 'colors') {
          g.fillStyle = 'rgba(0,0,0,0.12)';
          g.fillRect(x + s.w / 2 - 1, y + 4, 2, h - 8);
        }
        break;
      }
      case 'spring': {
        const sq = s.squash;
        g.fillStyle = '#3a3f4b';
        roundRect(g, x, y + s.h - 6, s.w, 6, 2);
        g.fill();
        g.strokeStyle = '#c9ced8';
        g.lineWidth = 3;
        g.beginPath();
        const top = y - 6 + sq * 6 - (sq > 0 ? 0 : Math.sin(this.time * 6) * 1);
        for (let i = 0; i <= 6; i++) g.lineTo(x + (i % 2 ? s.w * 0.75 : s.w * 0.25), lerp(y + s.h - 6, top + 6, i / 6));
        g.stroke();
        g.fillStyle = '#ff4f6d';
        roundRect(g, x - 2, top, s.w + 4, 8, 3);
        g.fill();
        g.strokeStyle = '#7a1424';
        g.lineWidth = 2;
        g.stroke();
        break;
      }
      case 'metal': {
        const grd = g.createLinearGradient(x, y, x + s.w, y);
        grd.addColorStop(0, '#8d96a8');
        grd.addColorStop(0.5, '#c9d0dc');
        grd.addColorStop(1, '#6d7486');
        g.fillStyle = grd;
        g.fillRect(x, y, s.w, s.h);
        g.fillStyle = '#4b5263';
        for (let yy = y + 12; yy < y + s.h - 8; yy += 36) {
          g.beginPath();
          g.arc(x + 10, yy, 3, 0, 6.283);
          g.arc(x + s.w - 10, yy, 3, 0, 6.283);
          g.fill();
        }
        if (s.tag === 'piston' || s.tag === 'sweeper') hazard(g, x, y + s.h - 18, s.w, 18, this.time);
        g.strokeStyle = '#2b2f3a';
        g.lineWidth = 3;
        g.strokeRect(x + 1.5, y + 1.5, s.w - 3, s.h - 3);
        break;
      }
      case 'crate': {
        g.fillStyle = '#b97a3c';
        g.fillRect(x, y, s.w, s.h);
        g.strokeStyle = '#6e4420';
        g.lineWidth = 4;
        g.strokeRect(x + 2, y + 2, s.w - 4, s.h - 4);
        g.beginPath();
        g.moveTo(x + 4, y + 4);
        g.lineTo(x + s.w - 4, y + s.h - 4);
        g.moveTo(x + s.w - 4, y + 4);
        g.lineTo(x + 4, y + s.h - 4);
        g.stroke();
        break;
      }
      case 'gate': {
        hazard(g, x, y, s.w, s.h, 0);
        g.strokeStyle = '#1b1d22';
        g.lineWidth = 3;
        g.strokeRect(x + 1.5, y + 1.5, s.w - 3, s.h - 3);
        break;
      }
    }
    g.restore();
  }

  private drawZonesBack(g: CanvasRenderingContext2D, r: Round, T: Theme) {
    for (const z of r.world.zones) {
      if (z.kind === 'fan') this.drawFan(g, z, T);
      if (z.kind === 'hill') this.drawHill(g, z, r);
      if (z.kind === 'goal') this.drawGoal(g, z);
    }
  }
  private drawZonesFront(g: CanvasRenderingContext2D, r: Round, T: Theme) {
    for (const z of r.world.zones) {
      if (z.kind === 'pad') {
        g.fillStyle = '#1b1d22';
        g.fillRect(z.x, z.y, z.w, z.h);
        for (let i = 0; i < 5; i++) {
          const xx = z.x + ((i * 28 + this.time * 120 * z.dir[0]) % z.w + z.w) % z.w;
          g.fillStyle = `rgba(80,255,170,${0.5 + 0.5 * Math.sin(this.time * 10 + i)})`;
          g.beginPath();
          g.moveTo(xx, z.y + 2);
          g.lineTo(xx + 10 * z.dir[0], z.y + z.h / 2);
          g.lineTo(xx, z.y + z.h - 2);
          g.lineTo(xx + 5 * z.dir[0], z.y + z.h / 2);
          g.fill();
        }
      } else if (z.kind === 'button') {
        const ready = z.pressed || r.cfg.game === 'race';
        g.fillStyle = '#2b2f3a';
        roundRect(g, z.x - 6, z.y + 2, z.w + 12, 10, 3);
        g.fill();
        const down = r.cfg.game === 'race' ? (z.pressed ? 6 : 0) : 0;
        g.fillStyle = ready ? '#ff4f6d' : '#6d7486';
        roundRect(g, z.x + 4, z.y - 6 + down, z.w - 8, 10, 4);
        g.fill();
        g.strokeStyle = '#1b1d22';
        g.lineWidth = 2;
        g.stroke();
        if (ready && r.cfg.game !== 'race') {
          g.fillStyle = `rgba(255,79,109,${0.3 + 0.3 * Math.sin(this.time * 6)})`;
          g.beginPath();
          g.arc(z.x + z.w / 2, z.y - 2, 26, 0, 6.283);
          g.fill();
        }
      } else if (z.kind === 'laser') this.drawLaser(g, z);
    }
    void T;
  }

  private drawFan(g: CanvasRenderingContext2D, z: Zone, T: Theme) {
    // air streaks along the flow
    const up = z.dir[1] < -0.5;
    g.save();
    g.beginPath();
    g.rect(z.x, z.y, z.w, z.h);
    g.clip();
    for (let i = 0; i < 14; i++) {
      const u = (i * 0.137 + this.time * (up ? 1.4 : 1.8)) % 1;
      const px = up ? z.x + ((i * 61) % z.w) : z.dir[0] > 0 ? z.x + u * z.w : z.x + z.w - u * z.w;
      const py = up ? z.y + z.h - u * z.h : z.y + ((i * 17) % z.h);
      g.strokeStyle = `rgba(255,255,255,${0.35 * (1 - Math.abs(u - 0.5) * 2)})`;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px - z.dir[0] * 24, py - z.dir[1] * 24);
      g.stroke();
    }
    g.restore();
    if (up) {
      // the fan housing at the bottom
      const by = z.y + z.h;
      g.fillStyle = '#3a3f4b';
      roundRect(g, z.x + 10, by - 6, z.w - 20, 22, 6);
      g.fill();
      for (let i = 0; i < Math.floor(z.w / 70); i++) {
        const cx = z.x + 45 + i * 70;
        g.save();
        g.translate(cx, by + 4);
        g.scale(1, 0.3);
        g.rotate(this.time * 14);
        g.fillStyle = T.accent;
        for (let b = 0; b < 3; b++) {
          g.rotate(2.094);
          g.beginPath();
          g.ellipse(0, -12, 6, 13, 0, 0, 6.283);
          g.fill();
        }
        g.restore();
      }
    }
  }

  private drawHill(g: CanvasRenderingContext2D, z: Zone, r: Round) {
    const k = r.game as King;
    const col = k.contested ? '255,255,255' : '255,214,90';
    const grd = g.createLinearGradient(0, z.y, 0, z.y + z.h);
    grd.addColorStop(0, `rgba(${col},0)`);
    grd.addColorStop(1, `rgba(${col},${0.35 + 0.1 * Math.sin(this.time * 5)})`);
    g.fillStyle = grd;
    g.fillRect(z.x, z.y, z.w, z.h);
    g.strokeStyle = `rgba(${col},0.8)`;
    g.lineWidth = 3;
    g.setLineDash([10, 8]);
    g.lineDashOffset = -this.time * 30;
    g.strokeRect(z.x, z.y, z.w, z.h);
    g.setLineDash([]);
    crown(g, z.x + z.w / 2, z.y - 18 + Math.sin(this.time * 3) * 4, 22);
    // where it goes next
    if (k.next >= 0) {
      const spots = [
        [640, 250],
        [250, 340],
        [1030, 340],
      ];
      const [nx, ny] = spots[k.next];
      g.globalAlpha = 0.5 + 0.5 * Math.sin(this.time * 12);
      crown(g, nx, ny - 20, 18);
      g.globalAlpha = 1;
    }
  }

  private drawGoal(g: CanvasRenderingContext2D, z: Zone) {
    const x = z.x + z.w / 2;
    g.fillStyle = '#e9edf5';
    g.fillRect(x - 4, z.y, 8, z.h);
    const fw = 90;
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 4; j++) {
        const wav = Math.sin(this.time * 6 + i * 0.7) * 5;
        g.fillStyle = (i + j) % 2 ? '#111' : '#fff';
        g.fillRect(x + 4 + i * (fw / 6), z.y + 8 + j * 12 + wav * (i / 6), fw / 6 + 0.5, 12);
      }
  }

  private drawLaser(g: CanvasRenderingContext2D, z: Zone) {
    const vertical = z.h > z.w;
    if (z.tag === 'wave') {
      if (z.warn > 0) return;
      g.fillStyle = 'rgba(58,209,255,0.35)';
      g.fillRect(z.x - 10, z.y - 6, z.w + 20, z.h + 6);
      g.strokeStyle = '#bff3ff';
      g.lineWidth = 3;
      g.beginPath();
      for (let i = 0; i <= 10; i++) g.lineTo(z.x + (z.w * i) / 10, z.y + z.h - Math.abs(Math.sin(i + this.time * 30)) * z.h);
      g.stroke();
      return;
    }
    if (z.warn > 0) {
      const blink = Math.sin(this.time * (14 + (1.05 - z.warn) * 30)) > 0;
      g.strokeStyle = blink ? 'rgba(255,60,80,0.95)' : 'rgba(255,60,80,0.35)';
      g.lineWidth = 2;
      g.setLineDash([12, 10]);
      g.beginPath();
      if (vertical) {
        g.moveTo(z.x + z.w / 2, z.y);
        g.lineTo(z.x + z.w / 2, z.y + z.h);
      } else {
        g.moveTo(z.x, z.y + z.h / 2);
        g.lineTo(z.x + z.w, z.y + z.h / 2);
      }
      g.stroke();
      g.setLineDash([]);
      // emitters
      g.fillStyle = '#ff3b55';
      if (vertical) g.fillRect(z.x - 6, 0, z.w + 12, 14);
      else {
        g.fillRect(0, z.y - 4, 16, z.h + 8);
        g.fillRect(1264, z.y - 4, 16, z.h + 8);
      }
      return;
    }
    if (!z.active) return;
    const fade = 1 - Math.min(1, z.t / 0.45);
    g.fillStyle = `rgba(255,40,70,${0.45 * fade + 0.2})`;
    g.fillRect(z.x - (vertical ? 8 : 0), z.y - (vertical ? 0 : 8), z.w + (vertical ? 16 : 0), z.h + (vertical ? 0 : 16));
    g.fillStyle = `rgba(255,255,255,${0.9 * fade + 0.1})`;
    if (vertical) g.fillRect(z.x + z.w / 2 - 3, z.y, 6, z.h);
    else g.fillRect(z.x, z.y + z.h / 2 - 3, z.w, 6);
  }

  private drawLava(g: CanvasRenderingContext2D, r: Round, T: Theme) {
    for (const z of r.world.zones) {
      if (z.kind !== 'lava') continue;
      const top = z.y;
      const bottom = z.y + z.h;
      // glow above the surface
      const glow = g.createLinearGradient(0, top - 160, 0, top);
      glow.addColorStop(0, 'rgba(255,120,30,0)');
      glow.addColorStop(1, hexA(T.lava[0], 0.35));
      g.fillStyle = glow;
      g.fillRect(z.x, top - 160, z.w, 160);
      const grd = g.createLinearGradient(0, top, 0, Math.min(bottom, top + 300));
      grd.addColorStop(0, T.lava[1]);
      grd.addColorStop(0.15, T.lava[0]);
      grd.addColorStop(1, shade(T.lava[0], -0.45));
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(z.x, bottom);
      for (let x = z.x; x <= z.x + z.w; x += 20) g.lineTo(x, top + Math.sin(x * 0.03 + this.time * 3) * 5 + Math.sin(x * 0.011 - this.time * 2) * 4);
      g.lineTo(z.x + z.w, bottom);
      g.closePath();
      g.fill();
      // bubbles
      for (let i = 0; i < 12; i++) {
        const u = (this.time * 0.6 + i * 0.37) % 1;
        const x = z.x + ((i * 233) % z.w);
        g.fillStyle = hexA(T.lava[1], 0.7 * (1 - u));
        g.beginPath();
        g.arc(x, top + 10 - u * 14, 3 + u * 6, 0, 6.283);
        g.fill();
      }
    }
  }

  private drawMarkers(g: CanvasRenderingContext2D, r: Round, T: Theme) {
    for (const m of this.marks) {
      const k = m.t / m.max;
      const blink = Math.sin(this.time * 25) > 0 ? 1 : 0.5;
      if (m.power < 0) {
        // an arrow at the wall
        const dir = m.x < 640 ? 1 : -1;
        g.fillStyle = `rgba(255,70,90,${0.9 * blink})`;
        g.beginPath();
        g.moveTo(m.x, m.y - 24);
        g.lineTo(m.x + dir * 40, m.y);
        g.lineTo(m.x, m.y + 24);
        g.fill();
      } else {
        g.fillStyle = `rgba(255,50,70,${0.25 + 0.3 * blink})`;
        g.beginPath();
        g.ellipse(m.x, m.y, 34 * (1 - k * 0.3), 8, 0, 0, 6.283);
        g.fill();
        g.strokeStyle = `rgba(255,255,255,${0.7 * blink})`;
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(m.x, m.y, 34 * (1 - k * 0.3), 8, 0, 0, 6.283);
        g.stroke();
        if (m.y < 30) {
          g.fillStyle = `rgba(255,70,90,${blink})`;
          g.beginPath();
          g.moveTo(m.x - 14, 8);
          g.lineTo(m.x + 14, 8);
          g.lineTo(m.x, 30);
          g.fill();
        }
      }
    }
    // chaos blast target
    const M = r.mod;
    if (M.id === 'chaosBlast' && M.blastAt && M.blastWarn > 0) {
      const [x, y] = M.blastAt;
      const k = 1 - M.blastWarn / 1.4;
      g.strokeStyle = `rgba(255,224,102,${0.4 + 0.6 * k})`;
      g.lineWidth = 4;
      g.setLineDash([14, 10]);
      g.lineDashOffset = this.time * 60;
      g.beginPath();
      g.arc(x, y, 330 * (1 - k * 0.15), 0, 6.283);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = `rgba(255,224,102,${0.1 + 0.25 * k})`;
      g.beginPath();
      g.arc(x, y, 40 + 300 * k, 0, 6.283);
      g.fill();
    }
    void T;
  }

  private drawProp(g: CanvasRenderingContext2D, p: Prop, r: Round) {
    g.save();
    g.translate(p.x, p.y);
    switch (p.kind) {
      case 'anvil':
        g.fillStyle = '#3b4150';
        g.strokeStyle = '#151820';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(-30, -18);
        g.lineTo(30, -18);
        g.lineTo(22, -6);
        g.lineTo(12, -6);
        g.lineTo(16, 14);
        g.lineTo(26, 14);
        g.lineTo(26, 24);
        g.lineTo(-26, 24);
        g.lineTo(-26, 14);
        g.lineTo(-16, 14);
        g.lineTo(-12, -6);
        g.lineTo(-30, -6);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(-26, -16, 50, 4);
        break;
      case 'boulder':
        g.rotate(p.rot);
        g.fillStyle = r.game.def.theme === 'volcano' ? '#5a3a2e' : '#8a7563';
        g.strokeStyle = '#2b1d16';
        g.lineWidth = 3;
        g.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * 6.283;
          const rr = p.r * (0.88 + ((i * 37) % 7) * 0.025);
          g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
        g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.3)';
        g.beginPath();
        g.moveTo(-p.r * 0.4, -p.r * 0.2);
        g.lineTo(p.r * 0.1, p.r * 0.1);
        g.lineTo(p.r * 0.3, -p.r * 0.4);
        g.stroke();
        if (r.game.def.theme === 'volcano') {
          g.fillStyle = 'rgba(255,120,30,0.6)';
          g.beginPath();
          g.arc(0, 0, p.r * 0.35, 0, 6.283);
          g.fill();
        }
        break;
      case 'spikeball':
        g.rotate(p.rot);
        g.fillStyle = '#2e2a33';
        for (let i = 0; i < 10; i++) {
          g.rotate(0.628);
          g.beginPath();
          g.moveTo(-5, -p.r + 4);
          g.lineTo(0, -p.r - 9);
          g.lineTo(5, -p.r + 4);
          g.fill();
        }
        g.beginPath();
        g.arc(0, 0, p.r, 0, 6.283);
        g.fill();
        g.fillStyle = '#ff4f6d';
        g.beginPath();
        g.arc(-4, -4, 4, 0, 6.283);
        g.fill();
        break;
      case 'bomb': {
        const flash = p.ttl - p.t < 0.8 && Math.sin(this.time * 40) > 0;
        g.fillStyle = flash ? '#ff3b3b' : '#1d1f26';
        g.beginPath();
        g.arc(0, 0, p.r, 0, 6.283);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.beginPath();
        g.arc(-p.r * 0.35, -p.r * 0.35, p.r * 0.25, 0, 6.283);
        g.fill();
        g.strokeStyle = '#8a6b3b';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(0, -p.r);
        g.quadraticCurveTo(8, -p.r - 10, 4, -p.r - 16);
        g.stroke();
        star(g, 4, -p.r - 17, 5 + Math.random() * 3, '#ffcf33');
        break;
      }
      default:
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(0, 0, p.r, 0, 6.283);
        g.fill();
    }
    g.restore();
  }

  private drawCoins(g: CanvasRenderingContext2D, c: Coins) {
    for (const co of c.coins) {
      if (!co.alive) continue;
      const big = co.v > 1;
      const r = big ? 20 : 12;
      const bob = co.loose ? 0 : Math.sin(this.time * 3 + co.x) * 5;
      const sx = Math.abs(Math.cos(this.time * 4 + co.x * 0.1));
      const x = co.x;
      const y = co.y + bob;
      if (co.t < 0 && Math.sin(this.time * 30) > 0) continue;
      g.fillStyle = 'rgba(255,214,60,0.25)';
      g.beginPath();
      g.arc(x, y, r * 1.8, 0, 6.283);
      g.fill();
      g.fillStyle = '#d99a1b';
      g.beginPath();
      g.ellipse(x, y, r * Math.max(0.15, sx), r, 0, 0, 6.283);
      g.fill();
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.ellipse(x, y, r * 0.8 * Math.max(0.12, sx), r * 0.8, 0, 0, 6.283);
      g.fill();
      if (big && sx > 0.4) star(g, x, y, r * 0.5 * sx, '#fff6c2');
      else if (sx > 0.4) {
        g.fillStyle = '#fff6c2';
        g.fillRect(x - 1.5 * sx, y - r * 0.45, 3 * sx, r * 0.9);
      }
    }
  }

  private drawModWorld(g: CanvasRenderingContext2D, r: Round) {
    const M = r.mod;
    if (M.id === 'wind' && (M.windLeft > 0 || M.windWarn > 0)) {
      const dir = Math.sign(M.windNext) || 1;
      const strong = M.windLeft > 0;
      const halfW = 640 / this.cam.z;
      const halfH = 360 / this.cam.z;
      for (let i = 0; i < (strong ? 40 : 12); i++) {
        const u = (i * 0.0731 + this.time * (strong ? 1.6 : 0.6)) % 1;
        const x = this.cam.x - halfW + (dir > 0 ? u : 1 - u) * halfW * 2;
        const y = this.cam.y - halfH + ((i * 71.3) % (halfH * 2));
        g.strokeStyle = `rgba(255,255,255,${strong ? 0.45 : 0.2})`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - dir * (strong ? 60 : 30), y);
        g.stroke();
      }
    }
  }

  private drawPops(g: CanvasRenderingContext2D) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const p of this.pops) {
      const k = p.t / 1.1;
      const sc = k < 0.15 ? 0.6 + k * 4 : 1.2 - k * 0.3;
      g.globalAlpha = Math.min(1, (1 - k) * 2);
      g.font = `900 ${Math.round(p.size * sc)}px ${FONT}`;
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(20,10,30,0.85)';
      g.lineJoin = 'round';
      g.strokeText(p.text, p.x, p.y - k * 40);
      g.fillStyle = p.color;
      g.fillText(p.text, p.x, p.y - k * 40);
    }
    g.globalAlpha = 1;
  }

  private drawOffscreen(g: CanvasRenderingContext2D, p: Player, S: number, ox: number, oy: number) {
    if (!p.alive) return;
    const sx = p.cx * S + ox;
    const sy = p.cy * S + oy;
    const m = 30 * this.base;
    if (sx > -10 && sx < this.W + 10 && sy > -10 && sy < this.H + 10) return;
    const x = clamp(sx, m, this.W - m);
    const y = clamp(sy, m + 80 * this.base, this.H - m);
    const a = Math.atan2(sy - y, sx - x);
    g.save();
    g.translate(x, y);
    g.fillStyle = PCOL[p.id].body;
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 18 * this.base, 0, 6.283);
    g.fill();
    g.stroke();
    g.rotate(a);
    g.beginPath();
    g.moveTo(22 * this.base, 0);
    g.lineTo(12 * this.base, -8 * this.base);
    g.lineTo(12 * this.base, 8 * this.base);
    g.fill();
    g.restore();
    g.fillStyle = '#fff';
    g.font = `900 ${Math.round(13 * this.base)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(PCOL[p.id].tag, x, y);
  }

  // ---------------------------------------------------------------- HUD
  private drawHud(g: CanvasRenderingContext2D, r: Round, o: RenderOpts) {
    const b = this.base;
    const W = this.W;
    // the HUD sits in the 1280×720 frame, centred
    const fx = (W - 1280 * b) / 2;
    const fy = (this.H - 720 * b) / 2;
    g.save();
    g.translate(fx, fy);
    g.scale(b, b);
    const info = r.game.hud();
    for (const id of [0, 1] as const) this.playerCard(g, r, id, info.p[id]);
    // timer
    const left = r.phase === 'countdown' ? r.limit : r.timeLeft;
    const secs = Math.ceil(left);
    const low = left < 10 && r.phase === 'play';
    g.fillStyle = 'rgba(14,16,40,0.78)';
    roundRect(g, 640 - 92, 12, 184, 66, 18);
    g.fill();
    g.strokeStyle = low ? `rgba(255,79,109,${0.6 + 0.4 * Math.sin(this.time * 10)})` : 'rgba(255,255,255,0.18)';
    g.lineWidth = 2;
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = low ? '#ff6b88' : '#ffffff';
    g.font = `900 34px ${FONT}`;
    g.fillText(r.overtime && r.phase === 'play' ? `+${secs}` : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 640, 38);
    g.font = `800 11px ${BODY}`;
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText(r.game.def.name, 640, 64);
    if (o.match) {
      g.font = `900 13px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText(`${o.match.score[0]} : ${o.match.score[1]}   ·   do ${o.match.target}`, 640, 92);
    }
    // modifier chip
    if (r.mod.id) {
      const M = MOD_BY_ID[r.mod.id];
      g.font = `900 12px ${FONT}`;
      const tw = g.measureText(M.name).width + 34;
      g.fillStyle = 'rgba(14,16,40,0.78)';
      roundRect(g, 640 - tw / 2, 102, tw, 24, 12);
      g.fill();
      g.fillStyle = M.color;
      g.beginPath();
      g.arc(640 - tw / 2 + 14, 114, 5, 0, 6.283);
      g.fill();
      g.fillText(M.name, 640 + 8, 115);
    }
    // banner
    const bannerY = r.mod.id ? 148 : 120;
    if (info.banner && r.phase === 'play') {
      const pulse = 1 + Math.sin(this.time * 8) * 0.04;
      g.save();
      g.translate(640, bannerY);
      g.scale(pulse, pulse);
      g.font = `900 22px ${FONT}`;
      const tw = g.measureText(info.banner).width + 40;
      g.fillStyle = 'rgba(14,16,40,0.85)';
      roundRect(g, -tw / 2, -20, tw, 40, 20);
      g.fill();
      g.strokeStyle = info.bannerColor ?? '#fff';
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = info.bannerColor ?? '#fff';
      g.fillText(info.banner, 0, 1);
      g.restore();
    }
    // modifier warnings in the middle of the screen
    const M = r.mod;
    if (M.id === 'reversed' && (M.revWarn > 0 || M.revOn > 0) && r.phase === 'play') {
      const on = M.revOn > 0;
      g.font = `900 ${on ? 26 : 30}px ${FONT}`;
      g.fillStyle = on ? '#f5a6ff' : `rgba(245,166,255,${0.6 + 0.4 * Math.sin(this.time * 14)})`;
      g.strokeStyle = 'rgba(20,10,30,0.9)';
      g.lineWidth = 7;
      const txt = on ? `← → ODWRÓCONE · ${M.revOn.toFixed(1)} s` : `← → ODWRÓCENIE ZA ${Math.ceil(M.revWarn)}…`;
      g.lineJoin = 'round';
      g.strokeText(txt, 640, on ? 680 : 220);
      g.fillText(txt, 640, on ? 680 : 220);
    }
    if (M.id === 'wind' && M.windWarn > 0 && r.phase === 'play') {
      const dir = M.windNext > 0 ? '→ → →' : '← ← ←';
      g.font = `900 30px ${FONT}`;
      g.fillStyle = `rgba(166,227,233,${0.6 + 0.4 * Math.sin(this.time * 14)})`;
      g.strokeStyle = 'rgba(20,10,30,0.9)';
      g.lineWidth = 7;
      g.lineJoin = 'round';
      g.strokeText(`WIATR ${dir}`, 640, 220);
      g.fillText(`WIATR ${dir}`, 640, 220);
    }
    // countdown
    if (r.phase === 'countdown') {
      const c = r.countdown - 0.2;
      const n = Math.ceil(c);
      const frac = c - Math.floor(c);
      const sc = 1 + frac * 0.6;
      g.save();
      g.translate(640, 360);
      g.scale(sc, sc);
      g.font = `900 150px ${FONT}`;
      g.lineWidth = 16;
      g.strokeStyle = 'rgba(20,10,30,0.9)';
      g.fillStyle = ['#ff5a2a', '#ffd23f', '#2f7bff'][n % 3];
      const txt = n > 0 ? String(n) : 'START!';
      g.lineJoin = 'round';
      g.strokeText(txt, 0, 0);
      g.fillText(txt, 0, 0);
      g.restore();
    } else if (r.phase === 'play' && r.t < 0.6) {
      const k = r.t / 0.6;
      g.save();
      g.globalAlpha = 1 - k;
      g.translate(640, 360);
      g.scale(1 + k * 0.6, 1 + k * 0.6);
      g.font = `900 130px ${FONT}`;
      g.lineWidth = 16;
      g.strokeStyle = 'rgba(20,10,30,0.9)';
      g.fillStyle = '#7dff9a';
      g.lineJoin = 'round';
      g.strokeText('START!', 0, 0);
      g.fillText('START!', 0, 0);
      g.restore();
    }
    // the end of the round
    if (r.phase === 'over' && r.result && !o.panel) {
      const k = Math.min(1, r.overT / 0.35);
      const w = r.result.winner;
      g.save();
      g.globalAlpha = k;
      g.fillStyle = 'rgba(10,8,30,0.55)';
      g.fillRect(-1000, 290, 3280, 150);
      g.translate(640, 352);
      const sc = 0.6 + 0.4 * Math.min(1, r.overT / 0.25) + Math.sin(r.overT * 6) * 0.015;
      g.scale(sc, sc);
      g.font = `900 64px ${FONT}`;
      g.lineWidth = 12;
      g.strokeStyle = 'rgba(20,10,30,0.95)';
      const txt = w < 0 ? 'REMIS!' : `${r.players[w as 0 | 1].name.toUpperCase()} WYGRYWA RUNDĘ!`;
      g.fillStyle = w < 0 ? '#ffffff' : PCOL[w as 0 | 1].light;
      g.lineJoin = 'round';
      g.strokeText(txt, 0, 0);
      g.fillText(txt, 0, 0);
      g.font = `700 22px ${BODY}`;
      g.fillStyle = '#ffffff';
      g.fillText(r.result.reason, 0, 56);
      g.restore();
    }
    g.restore();
  }

  private playerCard(g: CanvasRenderingContext2D, r: Round, id: 0 | 1, h: import('../sim/games/base').PlayerHud) {
    const p = r.players[id];
    const C = PCOL[id];
    const w = 290;
    const x = id === 0 ? 16 : 1280 - 16 - w;
    const y = 12;
    g.save();
    g.globalAlpha = h.out ? 0.55 : 1;
    g.fillStyle = 'rgba(14,16,40,0.78)';
    roundRect(g, x, y, w, 74, 18);
    g.fill();
    g.fillStyle = C.body;
    roundRect(g, id === 0 ? x : x + w - 12, y, 12, 74, 6);
    g.fill();
    // a small face
    const fx = id === 0 ? x + 46 : x + w - 46;
    g.fillStyle = C.body;
    g.strokeStyle = C.ink;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(fx, y + 37, 22, 0, 6.283);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(fx + s * 7, y + 33, 5, 6.5, 0, 0, 6.283);
      g.fill();
    }
    g.fillStyle = C.ink;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(fx + s * 7 + (id === 0 ? 1.5 : -1.5), y + 34, 2.6, 0, 6.283);
      g.fill();
    }
    const tx = id === 0 ? x + 80 : x + w - 80;
    g.textAlign = id === 0 ? 'left' : 'right';
    g.textBaseline = 'alphabetic';
    g.font = `900 13px ${FONT}`;
    g.fillStyle = C.light;
    g.fillText(`${C.tag} · ${p.name.toUpperCase()}`, tx, y + 24);
    g.font = `900 30px ${FONT}`;
    g.fillStyle = '#ffffff';
    if (h.main) g.fillText(h.out ? 'ODPADŁ' : h.main, tx, y + 56);
    if (h.pips !== undefined) {
      const n = h.pipsMax ?? h.pips;
      for (let i = 0; i < n; i++) {
        const px = id === 0 ? tx + (h.main ? 120 : 10) + i * 28 : tx - (h.main ? 120 : 10) - i * 28;
        heart(g, px, y + 46, 11, i < h.pips ? '#ff4f6d' : 'rgba(255,255,255,0.18)');
      }
    }
    if (h.sub) {
      g.font = `600 11px ${BODY}`;
      g.fillStyle = 'rgba(255,255,255,0.65)';
      g.fillText(h.sub, tx, y + 69);
    }
    if (h.bar !== undefined) {
      const bw = 120;
      const bx = id === 0 ? x + w - bw - 18 : x + 18;
      g.fillStyle = 'rgba(255,255,255,0.15)';
      roundRect(g, bx, y + 46, bw, 10, 5);
      g.fill();
      g.fillStyle = C.light;
      roundRect(g, id === 0 ? bx : bx + bw - bw * h.bar, y + 46, Math.max(10, bw * h.bar), 10, 5);
      g.fill();
    }
    g.restore();
  }

  /** A small emblem for a minigame (intro card, menus). */
  static icon(g: CanvasRenderingContext2D, id: string, size: number, time = 0) {
    const s = size / 100;
    g.save();
    g.scale(s, s);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const ink = '#14102b';
    g.lineWidth = 6;
    g.strokeStyle = ink;
    switch (id) {
      case 'lastStanding':
        for (let i = 0; i < 4; i++) {
          g.fillStyle = ['#ff6fa8', '#5fd0ff', '#ffd25f', '#a48cff'][i];
          const drop = i === 2 ? 16 + Math.sin(time * 4) * 4 : 0;
          roundRect(g, 8 + i * 22, 58 + drop, 19, 14, 4);
          g.fill();
          g.stroke();
        }
        g.fillStyle = '#2f7bff';
        g.beginPath();
        g.arc(30, 40, 12, 0, 6.283);
        g.fill();
        g.stroke();
        break;
      case 'lavaRush':
        g.fillStyle = '#ff5a1f';
        g.beginPath();
        g.moveTo(0, 70);
        for (let x = 0; x <= 100; x += 10) g.lineTo(x, 66 + Math.sin(x * 0.2 + time * 4) * 4);
        g.lineTo(100, 100);
        g.lineTo(0, 100);
        g.fill();
        g.fillStyle = '#6b5149';
        roundRect(g, 18, 44, 34, 10, 4);
        g.fill();
        g.stroke();
        roundRect(g, 54, 22, 34, 10, 4);
        g.fill();
        g.stroke();
        g.strokeStyle = '#ffd23f';
        g.beginPath();
        g.moveTo(50, 92);
        g.lineTo(50, 74);
        g.moveTo(42, 80);
        g.lineTo(50, 72);
        g.lineTo(58, 80);
        g.stroke();
        break;
      case 'knockout':
        g.fillStyle = '#ff5a2a';
        g.beginPath();
        g.arc(50, 50, 26, 0, 6.283);
        g.fill();
        g.stroke();
        g.fillStyle = '#ffd23f';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * 6.283 + time;
          star(g, 50 + Math.cos(a) * 40, 50 + Math.sin(a) * 40, 7, '#ffd23f');
        }
        g.fillStyle = '#fff';
        g.font = '900 26px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('KO', 50, 52);
        break;
      case 'race':
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 3; j++) {
            g.fillStyle = (i + j) % 2 ? '#14102b' : '#ffffff';
            g.fillRect(34 + i * 12, 18 + j * 12 + Math.sin(time * 6 + i) * 2, 12, 12);
          }
        g.fillStyle = '#e9edf5';
        g.fillRect(28, 14, 6, 74);
        g.strokeRect(28, 14, 6, 74);
        g.strokeStyle = '#ffcf33';
        g.beginPath();
        g.moveTo(8, 80);
        g.lineTo(24, 80);
        g.moveTo(4, 66);
        g.lineTo(20, 66);
        g.stroke();
        break;
      case 'coins':
        for (const [x, y, r] of [
          [36, 58, 20],
          [62, 44, 22],
          [70, 72, 16],
        ]) {
          g.fillStyle = '#ffd23f';
          g.beginPath();
          g.arc(x, y, r, 0, 6.283);
          g.fill();
          g.stroke();
          g.fillStyle = '#fff6c2';
          g.fillRect(x - 2, y - r * 0.5, 4, r);
        }
        break;
      case 'colors':
        ['#ff4fa3', '#2fe0d0', '#ffd23f'].forEach((c, i) => {
          g.fillStyle = c;
          roundRect(g, 10 + i * 28, 40 + (i === 1 ? -12 : 0), 24, 14, 4);
          g.fill();
          g.stroke();
        });
        g.fillStyle = '#ff2e63';
        g.beginPath();
        g.moveTo(0, 78);
        for (let x = 0; x <= 100; x += 10) g.lineTo(x, 76 + Math.sin(x * 0.25 + time * 4) * 3);
        g.lineTo(100, 100);
        g.lineTo(0, 100);
        g.fill();
        break;
      case 'dodge':
        g.strokeStyle = '#ff3b55';
        g.lineWidth = 8;
        g.beginPath();
        g.moveTo(6, 40);
        g.lineTo(94, 40);
        g.stroke();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(6, 40);
        g.lineTo(94, 40);
        g.stroke();
        g.fillStyle = '#3b4150';
        g.strokeStyle = ink;
        g.lineWidth = 5;
        roundRect(g, 32, 58, 36, 22, 4);
        g.fill();
        g.stroke();
        break;
      case 'king':
        g.fillStyle = '#7cc95a';
        roundRect(g, 18, 62, 64, 26, 6);
        g.fill();
        g.stroke();
        crown(g, 50, 36 + Math.sin(time * 3) * 3, 30);
        break;
    }
    g.restore();
  }
}

// ---------------------------------------------------------------- helpers
export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}
function hazard(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = '#ffcf33';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#1b1d22';
  for (let i = -h; i < w + h; i += 24) {
    const xx = x + i + ((t * 20) % 24);
    g.beginPath();
    g.moveTo(xx, y);
    g.lineTo(xx + 12, y);
    g.lineTo(xx + 12 - h, y + h);
    g.lineTo(xx - h, y + h);
    g.fill();
  }
  g.restore();
}
function crown(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#ffd23f';
  g.strokeStyle = '#7a5410';
  g.lineWidth = r * 0.12;
  g.beginPath();
  g.moveTo(-r, r * 0.5);
  g.lineTo(-r, -r * 0.4);
  g.lineTo(-r * 0.5, r * 0.05);
  g.lineTo(0, -r * 0.7);
  g.lineTo(r * 0.5, r * 0.05);
  g.lineTo(r, -r * 0.4);
  g.lineTo(r, r * 0.5);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#ff4f6d';
  g.beginPath();
  g.arc(0, r * 0.2, r * 0.14, 0, 6.283);
  g.fill();
  g.restore();
}
function heart(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.6, y - r * 1.2, x, y - r * 0.4);
  g.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  g.fill();
}
/** lighten (k > 0) or darken (k < 0) a #rrggbb colour */
export function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let gg = (n >> 8) & 255;
  let b = n & 255;
  if (k > 0) {
    r += (255 - r) * k;
    gg += (255 - gg) * k;
    b += (255 - b) * k;
  } else {
    r *= 1 + k;
    gg *= 1 + k;
    b *= 1 + k;
  }
  return `rgb(${Math.round(r)},${Math.round(gg)},${Math.round(b)})`;
}
function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
