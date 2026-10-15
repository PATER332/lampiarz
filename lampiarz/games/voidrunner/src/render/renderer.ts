// Draws the game into a 480×270 buffer that is scaled up with crisp pixels. Text (damage
// numbers) is drawn on a separate full-resolution overlay so it stays readable.

import { TILE, VIEW_H, VIEW_W } from '../core/consts';
import { COSMETICS, WEAPONS } from '../game/data';
import type { Game } from '../game/game';
import { AREAS } from '../world/areas';
import { T_EMPTY, T_HAZARD } from '../world/tiles';
import { background } from './background';
import { glow, line, makeCanvas, px, rect, rgba, type Ctx } from './pixel';
import { renderRoom, type Anim, type RoomArt } from './roomArt';
import { drawBoss, drawDoor, drawEnemy, drawMarker, drawObject, drawPickup, drawPlayer, drawProjectile, drawProp, drawSlash } from './sprites';

/** Draws a sprite with a 1-pixel dark outline so characters read clearly against any wall. */
class Outliner {
  private cv: HTMLCanvasElement;
  private c: Ctx;
  private sil: HTMLCanvasElement;
  private sc: Ctx;
  constructor(private size: number) {
    [this.cv, this.c] = makeCanvas(size, size);
    [this.sil, this.sc] = makeCanvas(size, size);
  }
  draw(target: Ctx, cx: number, cy: number, color: string, fn: (c: Ctx) => void, flash = 0) {
    const s = this.size;
    const bx = Math.round(cx - s / 2);
    const by = Math.round(cy - s / 2);
    this.c.setTransform(1, 0, 0, 1, 0, 0);
    this.c.globalAlpha = 1;
    this.c.globalCompositeOperation = 'source-over';
    this.c.clearRect(0, 0, s, s);
    this.c.translate(-bx, -by);
    fn(this.c);
    this.c.setTransform(1, 0, 0, 1, 0, 0);
    this.sc.globalCompositeOperation = 'source-over';
    this.sc.clearRect(0, 0, s, s);
    this.sc.drawImage(this.cv, 0, 0);
    this.sc.globalCompositeOperation = 'source-in';
    this.sc.fillStyle = color;
    this.sc.fillRect(0, 0, s, s);
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) target.drawImage(this.sil, bx + ox, by + oy);
    target.drawImage(this.cv, bx, by);
    if (flash > 0) {
      // hit flash: the whole sprite turns white for a moment
      this.sc.globalCompositeOperation = 'source-over';
      this.sc.clearRect(0, 0, s, s);
      this.sc.drawImage(this.cv, 0, 0);
      this.sc.globalCompositeOperation = 'source-in';
      this.sc.fillStyle = '#ffffff';
      this.sc.fillRect(0, 0, s, s);
      const a = target.globalAlpha;
      target.globalAlpha = Math.min(1, flash) * a;
      target.drawImage(this.sil, bx, by);
      target.globalAlpha = a;
    }
  }
}

export class Renderer {
  private outline = new Outliner(72);
  private outlineBig = new Outliner(160);
  canvas: HTMLCanvasElement;
  c: Ctx;
  overlay: HTMLCanvasElement;
  oc: CanvasRenderingContext2D;
  private light: HTMLCanvasElement;
  private lc: Ctx;
  private art: RoomArt | null = null;
  private artKey = '';
  camX = 0;
  camY = 0;
  scale = 1;
  shakeOn = true;
  private trail: { x: number; y: number; t: number; facing: number; anim: string }[] = [];
  private fogT = 0;
  private bloomCv: HTMLCanvasElement;
  private bc: Ctx;
  private bloom2Cv: HTMLCanvasElement;
  private bc2: Ctx;
  bloomOn = true;
  /** ambient motes drifting in screen space (dust, spores, embers, energy, void wisps) */
  private motes: { x: number; y: number; z: number; ph: number }[] = [];

  constructor(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    this.c = canvas.getContext('2d')!;
    this.c.imageSmoothingEnabled = false;
    this.overlay = overlay;
    this.oc = overlay.getContext('2d')!;
    [this.light, this.lc] = makeCanvas(VIEW_W, VIEW_H);
    [this.bloomCv, this.bc] = makeCanvas(VIEW_W / 4, VIEW_H / 4);
    [this.bloom2Cv, this.bc2] = makeCanvas(VIEW_W / 8, Math.ceil(VIEW_H / 8));
    this.bc.imageSmoothingEnabled = true;
    this.bc2.imageSmoothingEnabled = true;
    for (let i = 0; i < 60; i++) this.motes.push({ x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, z: 0.3 + Math.random() * 0.9, ph: Math.random() * 10 });
  }

  /** Fit the buffer into the window: integer scale when possible, crisp pixels always. */
  resize(w: number, h: number) {
    const s = Math.min(w / VIEW_W, h / VIEW_H);
    const scale = s >= 2 ? Math.floor(s * 2) / 2 : s;
    this.scale = scale;
    const cw = Math.round(VIEW_W * scale);
    const ch = Math.round(VIEW_H * scale);
    for (const cv of [this.canvas, this.overlay]) {
      cv.style.width = `${cw}px`;
      cv.style.height = `${ch}px`;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.overlay.width = Math.round(cw * dpr);
    this.overlay.height = Math.round(ch * dpr);
    this.oc.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }

  private roomArt(g: Game) {
    const key = `${g.run.seed}:${g.run.area}:${g.run.room}`;
    if (key !== this.artKey) {
      const skip = new Set<number>();
      for (const pr of g.props) if (pr.kind === 'crumble') for (const i of pr.tiles ?? []) skip.add(i);
      this.art = renderRoom(g.room.grid, g.run.area, (g.run.seed ^ (g.run.area * 7919 + g.run.room * 104729)) >>> 0, skip);
      this.artKey = key;
      this.trail = [];
      // snap the camera on room change
      const p = g.player;
      this.camX = this.clampX(g, p.x + p.w / 2 - VIEW_W / 2);
      this.camY = this.clampY(g, p.y - VIEW_H * 0.55);
    }
    return this.art!;
  }

  private clampX(g: Game, x: number) {
    return Math.max(0, Math.min(g.grid.w * TILE - VIEW_W, x));
  }
  private clampY(g: Game, y: number) {
    return Math.max(0, Math.min(g.grid.h * TILE - VIEW_H, y));
  }

  render(g: Game, dt: number) {
    const c = this.c;
    const area = g.run.area;
    const pal = AREAS[area].palette;
    const art = this.roomArt(g);
    const p = g.player;
    const t = g.time;
    this.fogT += dt;
    // ---- camera
    const boss = g.boss();
    let tx = p.x + p.w / 2 - VIEW_W / 2 + p.facing * 28 + p.vx * 0.15;
    let ty = p.y + p.h / 2 - VIEW_H * 0.56;
    if (boss && !boss.dead) {
      tx = (tx + (boss.x + boss.w / 2 - VIEW_W / 2)) / 2;
      ty = (ty + (boss.y - VIEW_H * 0.4)) / 2;
    }
    const k = 1 - Math.pow(0.002, dt);
    this.camX += (this.clampX(g, tx) - this.camX) * k;
    this.camY += (this.clampY(g, ty) - this.camY) * k;
    let cx = Math.round(this.camX);
    let cy = Math.round(this.camY);
    if (this.shakeOn && g.shake > 0) {
      cx += Math.round((Math.random() - 0.5) * g.shake);
      cy += Math.round((Math.random() - 0.5) * g.shake);
    }
    const roomW = g.grid.w * TILE;
    const roomH = g.grid.h * TILE;

    // ---- background
    const bg = background(area);
    c.drawImage(bg.sky, 0, 0);
    for (const L of bg.layers) {
      const off = -((cx * L.factor) % L.cv.width);
      const ly = Math.round(VIEW_H - L.cv.height + 40 + (roomH - VIEW_H - cy) * L.factor * 0.6);
      for (let x = off - L.cv.width; x < VIEW_W; x += L.cv.width) c.drawImage(L.cv, Math.round(x), ly);
    }
    // haze between background and room
    c.fillStyle = rgba(pal.fog, 0.25);
    c.fillRect(0, 0, VIEW_W, VIEW_H);

    c.save();
    c.translate(-cx, -cy);
    c.drawImage(art.back, 0, 0);
    for (const a of art.anims) {
      if (a.x < cx - 40 || a.x > cx + VIEW_W + 40 || a.y > cy + VIEW_H + 10 || a.y + a.h < cy - 10) continue;
      drawAnim(c, a, t);
    }
    c.drawImage(art.front, 0, 0);

    // ---- animated hazard tiles
    for (const h of art.hazards) {
      if (h.x + TILE < cx || h.x > cx + VIEW_W) continue;
      hazardTile(c, h.x, h.y, area, t);
    }

    // ---- lasers (security + boss)
    for (const hz of g.hazards) drawHazard(c, hz, t, roomW);

    // ---- doors
    const ex = g.room.exit;
    drawDoor(c, ex.x * TILE, (ex.y - 2) * TILE, g.doorLocked, area, t);
    const sp = g.room.spawn;
    if (sp.x <= 3) drawDoor(c, 1 * TILE - 14, (sp.y - 2) * TILE, true, area, t, true);

    // ---- objects
    const near = g.nearObject();
    for (const o of g.objects) drawObject(c, o, area, t, o === near);
    for (const pr of g.props) if (pr.x + pr.w > cx - 20 && pr.x < cx + VIEW_W + 20) drawProp(c, pr, area, t);
    for (const k2 of g.pickups) drawPickup(c, k2, t);

    // ---- contact shadows under everything standing on the ground
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.35)';
    const shadow = (x: number, y: number, w: number) => {
      c.beginPath();
      c.ellipse(Math.round(x), Math.round(y) - 0.5, w / 2, 1.5, 0, 0, Math.PI * 2);
      c.fill();
    };
    if (!p.dead) {
      const gy = groundBelow(g, p.x + p.w / 2, p.y + p.h);
      if (gy !== null) {
        const d = gy - (p.y + p.h);
        shadow(p.x + p.w / 2, gy, Math.max(4, p.w + 4 - d * 0.15));
      }
    }
    for (const e of g.enemies) if (!e.dead && e.onGround && e.type !== 'turret') shadow(e.x + e.w / 2, e.y + e.h, e.w + 2);
    c.restore();

    // ---- enemies
    for (const e of g.enemies) {
      if (e.x + e.w < cx - 40 || e.x > cx + VIEW_W + 40) continue;
      const fl = e.flash > 0 && !e.dead ? 0.85 : 0;
      if (e.type === 'boss') this.outlineBig.draw(c, e.x + e.w / 2, e.y + e.h / 2 - (e.boss === 'matka' ? 6 : 0), '#020308', (cc) => drawBoss(cc, e, t), fl * 0.7);
      else this.outline.draw(c, e.x + e.w / 2, e.y + e.h / 2, e.elite ? '#2a040c' : '#020308', (cc) => drawEnemy(cc, e, area, t), fl);
      if (e.type === 'shield' && !e.dead && e.guard && e.flash > 0) {
        // blocked hit: sparks of a shield bubble in front
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = rgba('#9fd8ff', 0.6 * Math.min(1, e.flash * 6));
        c.lineWidth = 1;
        c.beginPath();
        c.arc(e.x + e.w / 2, e.y + e.h / 2, 14, e.facing > 0 ? -1 : Math.PI - 1, e.facing > 0 ? 1 : Math.PI + 1);
        c.stroke();
        c.restore();
      }
      // turret aim line while charging
      if (e.type === 'turret' && e.state === 'charge' && e.aimX !== undefined) {
        c.save();
        c.globalAlpha = 0.35 + (e.stateT > 0.55 ? 0.4 : 0);
        line(c, e.x + e.w / 2, e.y + e.h / 2, e.aimX, e.aimY!, '#ff4a5a');
        c.restore();
      }
      if (!e.dead && e.type !== 'boss' && e.hp < e.maxHp) {
        rect(c, e.x, e.y - 5, e.w, 2, '#1a0a10');
        rect(c, e.x, e.y - 5, Math.max(1, (e.w * e.hp) / e.maxHp), 2, e.elite ? '#ff3d5e' : '#ff6a3a');
      }
    }

    // ---- player (with dash after-images)
    const col = COSMETICS[g.cosmetic].glow;
    if (p.dashT > 0 && !p.dead) this.trail.push({ x: p.x, y: p.y, t: 0, facing: p.facing, anim: 'dash' });
    for (const tr of this.trail) tr.t += dt;
    this.trail = this.trail.filter((tr) => tr.t < 0.22);
    for (const tr of this.trail) {
      c.save();
      const ka = 1 - tr.t / 0.22;
      c.globalAlpha = 0.35 * ka;
      c.globalCompositeOperation = 'lighter';
      rect(c, tr.x + 1, tr.y + 4, p.w - 2, p.h - 6, col);
      rect(c, tr.x + 2, tr.y - 3, p.w - 4, 6, col);
      c.globalAlpha = 0.6 * ka;
      rect(c, tr.x + p.w / 2 - 1, tr.y + 2, 2, p.h - 4, '#ffffff');
      c.restore();
    }
    const chargeK = p.chargeT > 0.12 && g.input.down('attack') ? Math.min(1, p.chargeT / g.chargeTime()) : 0;
    drawSlash(c, p, g.cosmetic, g.weapon, g.reach());
    // charge aura: particles spiralling into the weapon while charging
    if (chargeK > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const an = t * 6 + (i * Math.PI) / 3;
        const rr = 18 * (1 - ((t * 2 + i / 6) % 1));
        px(c, p.x + p.w / 2 + Math.cos(an) * rr, p.y + p.h / 2 + Math.sin(an) * rr * 0.7, chargeK >= 1 ? '#ffffff' : col);
      }
      c.restore();
    }
    this.outline.draw(c, p.x + p.w / 2, p.y + p.h / 2 - 4, '#020308', (cc) => drawPlayer(cc, p, g.cosmetic, g.weapon, t, chargeK), p.hurtT > 0.12 ? 0.8 : 0);

    // ---- projectiles & effects
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const pr of g.projectiles) drawProjectile(c, pr, col, t);
    for (const b of g.beams) {
      const a = 1 - b.t / b.max;
      c.globalAlpha = a;
      rect(c, Math.min(b.x0, b.x1), b.y0 - b.width / 2, Math.abs(b.x1 - b.x0), b.width, b.color);
      rect(c, Math.min(b.x0, b.x1), b.y0 - 1, Math.abs(b.x1 - b.x0), 2, '#ffffff');
      c.globalAlpha = 1;
    }
    for (const b of g.bolts) {
      for (let i = 1; i < b.pts.length; i++) {
        line(c, b.pts[i - 1].x, b.pts[i - 1].y, b.pts[i].x, b.pts[i].y, '#8ef6ff');
        line(c, b.pts[i - 1].x + 1, b.pts[i - 1].y, b.pts[i].x + 1, b.pts[i].y, '#ffffff');
      }
    }
    c.restore();

    // ---- particles
    for (const q of g.particles) {
      const a = Math.max(0, q.life / q.max);
      if (q.kind === 'ring') {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = rgba(q.color.startsWith('#') ? q.color : '#ffffff', a * 0.8);
        c.lineWidth = 2;
        c.beginPath();
        c.arc(Math.round(q.x), Math.round(q.y), q.size * (1 - a * 0.7), 0, Math.PI * 2);
        c.stroke();
        c.restore();
        continue;
      }
      c.save();
      c.globalAlpha = q.kind === 'smoke' ? a * 0.5 : a;
      if (q.kind === 'glow' || q.kind === 'spark') c.globalCompositeOperation = 'lighter';
      const s = q.kind === 'smoke' ? q.size * (2 - a) : q.size;
      if (q.kind === 'spark') {
        line(c, q.x, q.y, q.x - q.vx * 0.02, q.y - q.vy * 0.02, q.color);
        px(c, q.x, q.y, '#ffffff');
      } else if (q.kind === 'glow') {
        rect(c, q.x - s / 2, q.y - s / 2, s, s, q.color);
        c.globalAlpha = a * 0.35;
        rect(c, q.x - s / 2 - 1, q.y - s / 2 - 1, s + 2, s + 2, q.color);
      } else rect(c, q.x - s / 2, q.y - s / 2, s, s, q.color);
      c.restore();
    }
    c.restore();

    // ---- ambient motes (screen space with a little parallax)
    this.drawMotes(c, area, dt, cx, cy, t);

    // ---- lighting
    this.lighting(g, art, cx, cy, t);

    // ---- bloom: a blurred copy of the brightest parts added back on top
    if (this.bloomOn) this.bloom(c);

    // ---- foreground silhouettes, moving faster than the room
    if (this.bloomOn) {
      const fw = bg.fore.width;
      const foff = -((cx * 1.25) % fw);
      c.save();
      c.globalAlpha = 0.92;
      const fy = Math.round(Math.max(-24, Math.min(0, -(cy * 0.05) % 24)));
      for (let x = foff - fw; x < VIEW_W; x += fw) c.drawImage(bg.fore, Math.round(x), fy);
      c.restore();
    }

    // ---- drifting fog
    c.save();
    c.globalAlpha = 0.07;
    for (let i = 0; i < 4; i++) {
      const fx = ((this.fogT * (6 + i * 3) + i * 200 - cx * 0.4) % (VIEW_W + 300)) - 150;
      const fy = VIEW_H * (0.3 + i * 0.18);
      glow(c, fx, fy, 120, pal.fog, 1);
    }
    c.restore();

    // ---- screen effects
    const vg = c.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = vg;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    if (g.flash > 0) {
      // chromatic split on taking damage
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = Math.min(0.35, g.flash * 0.6);
      c.drawImage(this.canvas, 2, 0);
      c.drawImage(this.canvas, -2, 0);
      c.restore();
      c.fillStyle = `rgba(255,40,70,${g.flash * 0.35})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (g.slowmo > 0) {
      // perfect dodge: cold tint and a pulse ring around the edges
      const k = Math.min(1, g.slowmo / 0.4);
      c.fillStyle = `rgba(120,200,255,${0.12 * k})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
      c.strokeStyle = `rgba(200,240,255,${0.5 * k})`;
      c.lineWidth = 2;
      c.strokeRect(3, 3, VIEW_W - 6, VIEW_H - 6);
    }
    // faint scanlines for the CRT-ish sci-fi feel
    if (this.bloomOn) {
      c.fillStyle = 'rgba(0,0,0,0.06)';
      for (let y = 0; y < VIEW_H; y += 2) c.fillRect(0, y, VIEW_W, 1);
    }
    if (p.hp < p.maxHp * 0.3 && !p.dead) {
      c.fillStyle = `rgba(255,30,60,${0.08 + Math.sin(t * 5) * 0.05})`;
      c.fillRect(0, 0, VIEW_W, 3);
      c.fillRect(0, VIEW_H - 3, VIEW_W, 3);
    }
    if (g.transition) {
      const tr = g.transition;
      const a = tr.phase === 'out' ? Math.min(1, tr.t / 0.28) : 1 - Math.min(1, tr.t / 0.28);
      c.fillStyle = `rgba(2,3,8,${a})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    // ---- text overlay (crisp)
    this.drawText(g, cx, cy);
  }

  private bloom(c: Ctx) {
    const b = this.bc;
    const bw = this.bloomCv.width;
    const bh = this.bloomCv.height;
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.drawImage(this.canvas, 0, 0, bw, bh);
    // squaring the image (multiply by itself) keeps bright areas and crushes the darks: a cheap threshold
    b.globalCompositeOperation = 'multiply';
    b.drawImage(this.bloomCv, 0, 0);
    b.drawImage(this.bloomCv, 0, 0);
    const b2 = this.bc2;
    b2.globalCompositeOperation = 'source-over';
    b2.clearRect(0, 0, this.bloom2Cv.width, this.bloom2Cv.height);
    b2.drawImage(this.bloomCv, 0, 0, this.bloom2Cv.width, this.bloom2Cv.height);
    c.save();
    c.imageSmoothingEnabled = true;
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.45;
    c.drawImage(this.bloomCv, 0, 0, VIEW_W, VIEW_H);
    c.globalAlpha = 0.35;
    c.drawImage(this.bloom2Cv, 0, 0, VIEW_W, VIEW_H);
    c.restore();
    c.imageSmoothingEnabled = false;
  }

  private drawMotes(c: Ctx, area: number, dt: number, cx: number, cy: number, t: number) {
    const pal = AREAS[area].palette;
    // per-sector look: dust (0), spores rising (1), embers falling (2), energy specks (3), void wisps (4)
    const cfg = [
      { vx: 4, vy: 3, col: '#c8d2e6', a: 0.35 },
      { vx: 2, vy: -8, col: '#7dff4a', a: 0.55 },
      { vx: -6, vy: 14, col: '#ffb23e', a: 0.6 },
      { vx: 0, vy: -4, col: pal.accent, a: 0.6 },
      { vx: 3, vy: -6, col: '#e04aff', a: 0.6 },
    ][area] ?? { vx: 4, vy: 3, col: '#c8d2e6', a: 0.35 };
    if (this.lastCx === null) {
      this.lastCx = cx;
      this.lastCy = cy;
    }
    const dcx = cx - this.lastCx;
    const dcy = cy - (this.lastCy ?? cy);
    this.lastCx = cx;
    this.lastCy = cy;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      m.x += (cfg.vx + Math.sin(t * 0.8 + m.ph) * 4) * m.z * dt - (Math.abs(dcx) < 100 ? dcx * m.z : 0);
      m.y += (cfg.vy + Math.cos(t * 0.6 + m.ph) * 3) * m.z * dt - (Math.abs(dcy) < 100 ? dcy * m.z : 0);
      if (m.x < -4) m.x += VIEW_W + 8;
      if (m.x > VIEW_W + 4) m.x -= VIEW_W + 8;
      if (m.y < -4) m.y += VIEW_H + 8;
      if (m.y > VIEW_H + 4) m.y -= VIEW_H + 8;
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + m.ph * 3);
      c.globalAlpha = cfg.a * m.z * (0.4 + tw * 0.6);
      const sz = m.z > 1 ? 2 : 1;
      rect(c, m.x, m.y, sz, sz, cfg.col);
      if (area === 2 && m.z > 0.8) px(c, m.x + 1, m.y - 2, cfg.col); // ember streak
    }
    c.restore();
  }
  private lastCx: number | null = null;
  private lastCy: number | null = null;

  private lighting(g: Game, art: RoomArt, cx: number, cy: number, t: number) {
    const lc = this.lc;
    const pal = AREAS[g.run.area].palette;
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, VIEW_W, VIEW_H);
    lc.fillStyle = `rgba(2,3,10,${1 - pal.ambient})`;
    lc.fillRect(0, 0, VIEW_W, VIEW_H);
    lc.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, a: number) => {
      const X = x - cx;
      const Y = y - cy;
      if (X < -r || Y < -r || X > VIEW_W + r || Y > VIEW_H + r) return;
      const gr = lc.createRadialGradient(X, Y, 0, X, Y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = gr;
      lc.fillRect(X - r, Y - r, r * 2, r * 2);
    };
    const p = g.player;
    hole(p.x + p.w / 2, p.y + p.h / 2, 92, 0.85);
    for (const L of art.lights) {
      const f = L.flicker ? (Math.sin(t * 13 + L.x) > 1 - L.flicker * 2 ? 0.55 : 1) : 1;
      hole(L.x, L.y, L.r, Math.min(1, L.a * 1.6) * f);
    }
    for (const pr of g.projectiles) hole(pr.x, pr.y, pr.kind === 'wave' ? 40 : 22, 0.6);
    for (const b of g.beams) hole((b.x0 + b.x1) / 2, b.y0, Math.abs(b.x1 - b.x0) / 2 + 20, 0.6);
    for (const q of g.particles) if (q.kind === 'ring') hole(q.x, q.y, q.size + 10, 0.4 * (q.life / q.max));
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (e.type === 'boss') hole(e.x + e.w / 2, e.y + e.h / 2, 90, 0.6);
      else if (e.state === 'windup' || e.state === 'tell' || e.state === 'charge' || e.state === 'cast') hole(e.x + e.w / 2, e.y + e.h / 2, 30, 0.5);
      else hole(e.x + e.w / 2, e.y + e.h / 2, 24, 0.45);
    }
    for (const h of g.hazards) {
      if (h.kind === 'laser') hole(h.x + 3, h.y + h.h / 2, h.h / 2 + 10, 0.35);
      if (h.kind === 'hline' || h.kind === 'spikes') hole(h.x + h.w / 2, h.y + h.h / 2, Math.max(h.w, h.h) / 2 + 20, 0.3);
    }
    if (!g.doorLocked) hole(g.room.exit.x * TILE + 8, (g.room.exit.y - 1) * TILE, 40, 0.5);
    for (const o of g.objects) if (!o.used || o.kind === 'checkpoint') hole(o.x, o.y - 12, 34, 0.45);
    for (const k of g.pickups) hole(k.x, k.y, 12, 0.35);
    for (const pr of g.props) {
      if (pr.kind === 'barrel' && pr.state === 'lit') hole(pr.x + pr.w / 2, pr.y + pr.h / 2, 50, 0.7);
      else if (pr.kind === 'pad') hole(pr.x + pr.w / 2, pr.y, 26, 0.45);
      else if (pr.kind === 'vent') hole(pr.x + pr.w / 2, pr.y - 6, 18, 0.3);
    }
    for (const q of g.particles) if (q.kind === 'glow' && q.size >= 3) hole(q.x, q.y, 10, 0.25 * (q.life / q.max));
    this.c.drawImage(this.light, 0, 0);
    // coloured light: a light additive tint around light sources
    const c = this.c;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const L of art.lights) {
      const X = L.x - cx;
      const Y = L.y - cy;
      if (X < -L.r || Y < -L.r || X > VIEW_W + L.r || Y > VIEW_H + L.r) continue;
      glow(c, X, Y, L.r * 0.8, L.color, L.a * 0.25);
    }
    glow(c, p.x + p.w / 2 - cx, p.y + p.h / 2 - cy, 26, COSMETICS[g.cosmetic].glow, 0.12);
    c.restore();
  }

  private drawText(g: Game, cx: number, cy: number) {
    const o = this.oc;
    o.save();
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, this.overlay.width, this.overlay.height);
    o.restore();
    o.font = '700 7px "Heros Cn", "Arial Narrow", sans-serif';
    o.textAlign = 'center';
    for (const f of g.floaters) {
      const a = 1 - f.t / 0.9;
      o.globalAlpha = Math.max(0, a);
      const x = f.x - cx;
      const y = f.y - cy - f.t * 22;
      o.fillStyle = 'rgba(0,0,0,0.75)';
      o.fillText(f.text, x + 0.6, y + 0.6);
      o.fillStyle = f.color;
      o.fillText(f.text, x, y);
    }
    o.globalAlpha = 1;
  }
}

function hazardTile(c: Ctx, x: number, y: number, area: number, t: number) {
  const pal = AREAS[area].palette;
  if (area === 1) {
    // bubbling acid
    rect(c, x, y + 4, TILE, TILE - 4, '#1f5a1a');
    for (let i = 0; i < TILE; i++) px(c, x + i, y + 4 + Math.round(Math.sin(t * 3 + (x + i) * 0.4) * 1), '#7dff4a');
    if (Math.sin(t * 2 + x) > 0.9) px(c, x + 8, y + 2, '#d8ffe6');
    glow(c, x + 8, y + 8, 12, '#7dff4a', 0.15);
  } else if (area === 2) {
    // exposed live cables
    rect(c, x, y + 10, TILE, 6, '#1a1220');
    line(c, x, y + 12, x + TILE, y + 11, '#3a2f45');
    if (Math.random() < 0.08) {
      line(c, x + 4, y + 10, x + 8, y + 2, '#ffe066');
      line(c, x + 8, y + 2, x + 11, y + 8, '#ffffff');
    }
  } else if (area === 3) {
    rect(c, x, y + 8, TILE, 8, '#0a1a2a');
    for (let i = 0; i < 3; i++) line(c, x + i * 5, y + 15, x + i * 5 + 3, y + 9 + Math.round(Math.sin(t * 20 + i + x) * 2), pal.hazard);
  } else if (area === 4) {
    rect(c, x, y + 5, TILE, 11, '#2a0835');
    for (let i = 0; i < TILE; i += 2) px(c, x + i, y + 5 + Math.round(Math.sin(t * 2 + i + x * 0.3) * 1.5), '#e04aff');
    glow(c, x + 8, y + 10, 12, '#e04aff', 0.15);
  } else {
    // steel spikes
    rect(c, x, y + 13, TILE, 3, '#2a3040');
    for (let i = 0; i < 4; i++) {
      const sx = x + i * 4;
      c.fillStyle = '#9aa7c4';
      c.beginPath();
      c.moveTo(sx, y + 14);
      c.lineTo(sx + 2, y + 5);
      c.lineTo(sx + 4, y + 14);
      c.fill();
      px(c, sx + 2, y + 6, '#ffffff');
    }
  }
}

function drawHazard(c: Ctx, h: Game['hazards'][number], t: number, roomW: number) {
  if (h.t < 0) return;
  switch (h.kind) {
    case 'laser': {
      const cyc = h.t % (h.period ?? 3);
      // emitter
      rect(c, h.x - 3, h.y - 2, 12, 5, '#2a3040');
      rect(c, h.x + 1, h.y + 2, 4, 2, cyc < h.warn ? '#ff4a5a' : '#3a4256');
      if (cyc < h.warn) {
        if (Math.floor(t * 16) % 2 === 0) {
          c.save();
          c.globalAlpha = 0.25 + (cyc / h.warn) * 0.5;
          rect(c, h.x + 2, h.y, 1, h.h, '#ff4a5a');
          c.restore();
        }
      } else if (cyc < h.warn + h.active) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        rect(c, h.x, h.y, h.w, h.h, '#ff2a4a');
        rect(c, h.x + 2, h.y, 2, h.h, '#ffffff');
        glow(c, h.x + 3, h.y + h.h, 14, '#ff4a5a', 0.6);
        c.restore();
      }
      break;
    }
    case 'beam': {
      const ang = h.angle ?? 0;
      const len = h.len ?? 400;
      const x1 = h.x + Math.cos(ang) * len;
      const y1 = h.y + Math.sin(ang) * len;
      if (h.t < h.warn) {
        c.save();
        c.globalAlpha = 0.3 + (h.t / h.warn) * 0.5;
        if (h.t > h.warn - 0.3 || Math.floor(t * 14) % 2 === 0) line(c, h.x, h.y, x1, y1, '#ff4a5a');
        c.restore();
      } else if (h.t < h.warn + h.active) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = 'rgba(255,60,90,0.85)';
        c.lineWidth = h.w;
        c.beginPath();
        c.moveTo(h.x, h.y);
        c.lineTo(x1, y1);
        c.stroke();
        c.strokeStyle = '#ffffff';
        c.lineWidth = 2;
        c.stroke();
        c.restore();
      }
      break;
    }
    case 'hline': {
      if (h.t < h.warn) {
        c.save();
        c.globalAlpha = 0.18 + (h.t / h.warn) * 0.3;
        rect(c, h.x, h.y, Math.min(h.w, roomW), h.h, '#c45cff');
        if (Math.floor(t * 12) % 2 === 0) {
          rect(c, h.x, h.y, h.w, 1, '#ffffff');
          rect(c, h.x, h.y + h.h - 1, h.w, 1, '#ffffff');
        }
        c.restore();
      } else if (h.t < h.warn + h.active) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        rect(c, h.x, h.y, h.w, h.h, 'rgba(224,74,255,0.8)');
        rect(c, h.x, h.y + h.h / 2 - 1, h.w, 2, '#ffffff');
        c.restore();
      }
      break;
    }
    case 'spikes': {
      const fy = h.y + h.h;
      if (h.t < h.warn) {
        c.save();
        c.globalAlpha = 0.4 + (h.t / h.warn) * 0.5;
        rect(c, h.x, fy - 2, h.w, 2, Math.floor(t * 14) % 2 ? '#e04aff' : '#ffffff');
        for (let i = 0; i < 5; i++) px(c, h.x + Math.random() * h.w, fy - 3 - Math.random() * 6, '#e04aff');
        c.restore();
      } else if (h.t < h.warn + h.active) {
        const k = Math.min(1, (h.t - h.warn) / 0.08);
        for (let i = 0; i < 4; i++) {
          const sx = h.x + 2 + i * 5;
          c.fillStyle = i % 2 ? '#5a1a78' : '#2a0b35';
          c.beginPath();
          c.moveTo(sx - 3, fy);
          c.lineTo(sx, fy - h.h * k * (0.7 + (i % 2) * 0.3));
          c.lineTo(sx + 3, fy);
          c.fill();
        }
      }
      break;
    }
    case 'shockwave':
      c.save();
      c.globalCompositeOperation = 'lighter';
      rect(c, h.x, h.y + 4, h.w, h.h - 4, 'rgba(125,255,74,0.6)');
      rect(c, h.x, h.y, h.w, 4, 'rgba(216,255,230,0.8)');
      c.restore();
      break;
    case 'acidPool':
      c.save();
      c.globalAlpha = Math.max(0, 1 - h.t / h.active);
      rect(c, h.x, h.y + 2, h.w, 3, '#7dff4a');
      for (let i = 0; i < h.w; i += 3) px(c, h.x + i, h.y + 1 + Math.round(Math.sin(t * 5 + i)), '#d8ffe6');
      c.restore();
      break;
    case 'marker':
      if (h.t < h.warn + 0.3) drawMarker(c, h.x, h.y, h.w, h.h, Math.min(1, h.t / h.warn), t);
      break;
    case 'mine':
      if (h.t < h.warn) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        glow(c, h.x, h.y, 6 + (h.t / h.warn) * 10, '#c45cff', 0.6);
        c.restore();
      }
      break;
  }
}

/** The first floor surface under a point (pixels), or null when there is none nearby. */
function groundBelow(g: Game, x: number, y: number): number | null {
  const tx = Math.floor(x / TILE);
  for (let ty = Math.floor((y - 1) / TILE) + 1, n = 0; n < 6 && ty < g.grid.h; ty++, n++) {
    const k = g.grid.tiles[ty * g.grid.w + tx];
    if (k !== T_EMPTY && k !== T_HAZARD) return ty * TILE;
  }
  return null;
}

function drawAnim(c: Ctx, a: Anim, t: number) {
  switch (a.kind) {
    case 'shaft': {
      // volumetric cone of light under a ceiling lamp
      const on = a.ph === 0 || Math.sin(t * 13 + a.ph * 7) > -0.6;
      if (!on) return;
      c.save();
      c.globalCompositeOperation = 'lighter';
      const gr = c.createLinearGradient(0, a.y, 0, a.y + a.h);
      gr.addColorStop(0, rgba(a.color, 0.16));
      gr.addColorStop(1, rgba(a.color, 0));
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(a.x - 4, a.y);
      c.lineTo(a.x + 4, a.y);
      c.lineTo(a.x + 4 + a.h * 0.35, a.y + a.h);
      c.lineTo(a.x - 4 - a.h * 0.35, a.y + a.h);
      c.closePath();
      c.fill();
      // dust in the beam
      for (let i = 0; i < 5; i++) {
        const k = (t * 0.07 + i * 0.21 + a.ph) % 1;
        const yy = a.y + k * a.h;
        const xx = a.x + Math.sin(t * 0.7 + i * 2 + a.ph) * (4 + k * a.h * 0.3);
        px(c, xx, yy, rgba('#ffffff', 0.35 * (1 - k)));
      }
      c.restore();
      break;
    }
    case 'drip': {
      const period = 2.2 + (a.ph % 1.5);
      const k = ((t + a.ph) % period) / period;
      if (k < 0.55) {
        // drop swelling
        if (k > 0.3) px(c, a.x, a.y, a.color);
      } else {
        const f = (k - 0.55) / 0.45;
        const y = a.y + f * f * a.h;
        if (y < a.y + a.h - 1) {
          px(c, a.x, y, a.color);
          px(c, a.x, y - 1, rgba(a.color, 0.5));
        } else {
          // splash
          px(c, a.x - 1, a.y + a.h - 2, a.color);
          px(c, a.x + 1, a.y + a.h - 2, a.color);
        }
      }
      break;
    }
    case 'led': {
      const on = Math.sin(t * (1.5 + (a.ph % 3)) + a.ph) > 0.2;
      rect(c, a.x, a.y, a.h, 1, on ? a.color : '#1a1d28');
      if (on) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        glow(c, a.x + 1, a.y, 4, a.color, 0.4);
        c.restore();
      }
      break;
    }
    case 'fan': {
      const ang = t * 6 + a.ph;
      for (let i = 0; i < 3; i++) {
        const an = ang + (i * Math.PI * 2) / 3;
        line(c, a.x, a.y, a.x + Math.cos(an) * a.h, a.y + Math.sin(an) * a.h, '#2e3546');
        line(c, a.x, a.y, a.x + Math.cos(an + 0.3) * (a.h - 2), a.y + Math.sin(an + 0.3) * (a.h - 2), '#252b3a');
      }
      rect(c, a.x - 1, a.y - 1, 3, 3, '#4a5470');
      break;
    }
    case 'neon': {
      // occasional stutter
      const off = Math.sin(t * 23 + a.ph * 5) > 0.93 || (Math.sin(t * 0.7 + a.ph) > 0.97 && Math.floor(t * 30) % 2 === 0);
      if (off) {
        c.save();
        c.globalAlpha = 0.8;
        for (let i = 0; i < a.h; i++) rect(c, a.x, a.y + i * 3, 4, 1, '#1a1220');
        c.restore();
      }
      break;
    }
    case 'screen': {
      // scrolling lines of text
      c.save();
      c.globalAlpha = 0.8;
      const rows = Math.max(2, Math.floor(a.h / 2));
      for (let i = 0; i < rows; i++) {
        const w = 2 + Math.floor(((Math.sin(i * 7.1 + Math.floor(t * 3 + a.ph) * 1.7) + 1) / 2) * 5);
        rect(c, a.x + 1, a.y + i * 2, w, 1, i === Math.floor(t * 4 + a.ph) % rows ? '#ffffff' : rgba(a.color, 0.9));
      }
      c.restore();
      break;
    }
    case 'arc': {
      if (Math.sin(t * 9 + a.ph * 3) < 0.5) return;
      c.save();
      c.globalCompositeOperation = 'lighter';
      let x = a.x;
      let y = a.y;
      for (let i = 0; i < 4; i++) {
        const nx = a.x + (Math.random() - 0.5) * a.h * 1.4;
        const ny = a.y - 2 - i * 2 + (Math.random() - 0.5) * 3;
        line(c, x, y, nx, ny, i % 2 ? '#ffffff' : a.color);
        x = nx;
        y = ny;
      }
      c.restore();
      break;
    }
    case 'bulb': {
      const sw = Math.sin(t * 1.3 + a.ph) * 1.2;
      const on = Math.sin(t * 17 + a.ph * 4) > -0.85;
      px(c, a.x + sw, a.y, on ? '#fff2b0' : '#5a4a2a');
      if (on) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        glow(c, a.x + sw, a.y, 6, a.color, 0.4);
        c.restore();
      }
      break;
    }
    case 'steam': {
      c.save();
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.6 + i * 0.25 + a.ph) % 1;
        c.globalAlpha = 0.25 * (1 - k);
        const sz = 1 + Math.floor(k * 4);
        rect(c, a.x + Math.sin(t + i) * 2 + k * 6, a.y + k * 18, sz, sz, a.color);
      }
      c.restore();
      break;
    }
  }
}

export const weaponLabel = (id: keyof typeof WEAPONS) => WEAPONS[id].name;
