// Draws the game into a 480×270 buffer that is scaled up with crisp pixels. Text (damage
// numbers) is drawn on a separate full-resolution overlay so it stays readable.

import { TILE, VIEW_H, VIEW_W } from '../core/consts';
import { COSMETICS, WEAPONS } from '../game/data';
import type { Game } from '../game/game';
import { AREAS } from '../world/areas';
import { background } from './background';
import { glow, line, makeCanvas, px, rect, rgba, type Ctx } from './pixel';
import { renderRoom, type RoomArt } from './roomArt';
import { drawBoss, drawDoor, drawEnemy, drawObject, drawPickup, drawPlayer, drawProjectile, drawSlash } from './sprites';

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
  draw(target: Ctx, cx: number, cy: number, color: string, fn: (c: Ctx) => void) {
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

  constructor(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    this.c = canvas.getContext('2d')!;
    this.c.imageSmoothingEnabled = false;
    this.overlay = overlay;
    this.oc = overlay.getContext('2d')!;
    [this.light, this.lc] = makeCanvas(VIEW_W, VIEW_H);
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
      this.art = renderRoom(g.room.grid, g.run.area, (g.run.seed ^ (g.run.area * 7919 + g.run.room * 104729)) >>> 0);
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
    for (const k2 of g.pickups) drawPickup(c, k2, t);

    // ---- enemies
    for (const e of g.enemies) {
      if (e.x + e.w < cx - 40 || e.x > cx + VIEW_W + 40) continue;
      if (e.type === 'boss') this.outlineBig.draw(c, e.x + e.w / 2, e.y + e.h / 2 - (e.boss === 'matka' ? 6 : 0), '#020308', (cc) => drawBoss(cc, e, t));
      else this.outline.draw(c, e.x + e.w / 2, e.y + e.h / 2, '#020308', (cc) => drawEnemy(cc, e, area, t));
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
      c.globalAlpha = 0.35 * (1 - tr.t / 0.22);
      c.globalCompositeOperation = 'lighter';
      rect(c, tr.x + 1, tr.y + 2, p.w - 2, p.h - 4, col);
      c.restore();
    }
    const chargeK = p.chargeT > 0.12 && g.input.down('attack') ? Math.min(1, p.chargeT / g.chargeTime()) : 0;
    drawSlash(c, p, g.cosmetic, g.weapon, g.reach());
    this.outline.draw(c, p.x + p.w / 2, p.y + p.h / 2 - 4, '#020308', (cc) => drawPlayer(cc, p, g.cosmetic, g.weapon, t, chargeK));

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
      } else rect(c, q.x - s / 2, q.y - s / 2, s, s, q.color);
      c.restore();
    }
    c.restore();

    // ---- lighting
    this.lighting(g, art, cx, cy, t);

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
      c.fillStyle = `rgba(255,40,70,${g.flash * 0.35})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
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

export const weaponLabel = (id: keyof typeof WEAPONS) => WEAPONS[id].name;
