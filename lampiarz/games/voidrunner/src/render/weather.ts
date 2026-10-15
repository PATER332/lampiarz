// Weather effects: rain with splashes and puddles, storms with wind and lightning, fog banks and
// ground mist, coolant snow that settles on ledges, ash with glowing embers, the void storm.
// Pure presentation — the game state only says which weather it is, how strong the wind blows
// and when lightning strikes.

import { TILE, VIEW_H, VIEW_W } from '../core/consts';
import type { Game } from '../game/game';
import type { WeatherKind } from '../game/weather';
import { glow, line, makeCanvas, px, rect, rgba, type Ctx } from './pixel';

interface Drop {
  x: number;
  y: number;
  v: number;
  len: number;
  air: boolean; // has been in open air (so it splashes on the next surface)
  z: number; // 0.5 = far, 1 = near
}
interface Splash {
  x: number;
  y: number;
  t: number;
  big: boolean;
}
interface Puddle {
  x: number;
  y: number;
  w: number;
  ph: number;
}

const solidT = (k: number) => k === 1 || k === 4;

export class WeatherFX {
  private key = '';
  private kind: WeatherKind = 'clear';
  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  private puddles: Puddle[] = [];
  private caps: HTMLCanvasElement | null = null; // snow on ledges / wet sheen
  private mist: HTMLCanvasElement | null = null; // ground mist along floors
  private bolt: { x: number; y: number }[] = [];
  private boltBranch: { x: number; y: number }[] = [];
  private lastLightning = 0;

  /** Rebuilds per-room data when the room or the weather changes. */
  private prepare(g: Game) {
    const key = `${g.run.seed}:${g.run.area}:${g.run.room}:${g.weather}`;
    if (key === this.key) return;
    this.key = key;
    this.kind = g.weather;
    this.drops = [];
    this.splashes = [];
    this.puddles = [];
    this.caps = null;
    this.mist = null;
    const gr = g.grid;
    const W = gr.w * TILE;
    const H = gr.h * TILE;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= gr.w || y >= gr.h ? 1 : gr.tiles[y * gr.w + x]);
    // surfaces: open cells standing on rock or a walkway
    const surf: { x: number; y: number; plat: boolean }[] = [];
    for (let y = 0; y < gr.h - 1; y++)
      for (let x = 0; x < gr.w; x++) if (at(x, y) === 0 && (solidT(at(x, y + 1)) || at(x, y + 1) === 2)) surf.push({ x, y: (y + 1) * TILE, plat: at(x, y + 1) === 2 });
    let seed = (g.run.seed ^ (g.run.room * 7919)) >>> 0 || 1;
    const rnd = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return ((seed >>> 0) % 10000) / 10000;
    };
    const n = this.kind === 'storm' ? 260 : this.kind === 'rain' ? 170 : this.kind === 'snow' ? 150 : this.kind === 'ash' ? 110 : this.kind === 'voidstorm' ? 120 : 0;
    for (let i = 0; i < n; i++) this.drops.push(this.newDrop(g, Math.random() * VIEW_H * 1.2 - 20, true));
    if (this.kind === 'rain' || this.kind === 'storm') {
      for (const s of surf) if (!s.plat && rnd() < 0.18) this.puddles.push({ x: s.x * TILE + 2 + rnd() * 4, y: s.y, w: 6 + Math.floor(rnd() * 10), ph: rnd() * 10 });
    }
    if (this.kind === 'snow' || this.kind === 'rain' || this.kind === 'storm') {
      // snow settles on every ledge; rain leaves a wet shine on the edges
      const [cv, c] = makeCanvas(W, H);
      for (const s of surf) {
        const X = s.x * TILE;
        for (let i = 0; i < TILE; i++) {
          if (this.kind === 'snow') {
            const h = 1 + (rnd() < 0.45 ? 1 : 0) + (rnd() < 0.12 ? 1 : 0);
            rect(c, X + i, s.y - h + 1, 1, h, rnd() < 0.2 ? '#cfe4ff' : '#eef6ff');
          } else if (rnd() < 0.5) px(c, X + i, s.y, rgba('#bcd8ff', 0.35));
        }
        // icicles under the ledges
        if (this.kind === 'snow' && at(s.x, s.y / TILE + 1) !== 0 && rnd() < 0.08) {
          const below = s.y / TILE + 1;
          if (at(s.x, below + 1) === 0) {
            const ix = X + 3 + rnd() * 10;
            const len = 3 + rnd() * 6;
            for (let k = 0; k < len; k++) px(c, ix, (below + 1) * TILE + k, rgba('#dff0ff', 0.9 - k / len));
          }
        }
      }
      this.caps = cv;
    }
    if (this.kind === 'fog' || this.kind === 'voidstorm') {
      const [cv, c] = makeCanvas(W, H);
      for (const s of surf)
        if (rnd() < 0.35) {
          const X = s.x * TILE + 8;
          const gg = c.createRadialGradient(X, s.y - 4, 0, X, s.y - 4, 34);
          const col = this.kind === 'voidstorm' ? '#c45cff' : '#c8d6e8';
          gg.addColorStop(0, rgba(col, this.kind === 'voidstorm' ? 0.07 : 0.11));
          gg.addColorStop(1, rgba(col, 0));
          c.fillStyle = gg;
          c.fillRect(X - 34, s.y - 38, 68, 46);
        }
      this.mist = cv;
    }
  }

  private newDrop(_g: Game, y: number, scatter = false): Drop {
    const z = 0.5 + Math.random() * 0.6;
    const k = this.kind;
    const v =
      k === 'snow' ? 14 + Math.random() * 22 : k === 'ash' ? (Math.random() < 0.4 ? -18 - Math.random() * 20 : 10 + Math.random() * 16) : k === 'voidstorm' ? -(90 + Math.random() * 120) : 330 + Math.random() * 180 + (k === 'storm' ? 120 : 0);
    return { x: Math.random() * (VIEW_W + 120) - 60, y: scatter ? y : k === 'voidstorm' || (k === 'ash' && v < 0) ? VIEW_H + 10 : -10 - Math.random() * 30, v, len: k === 'storm' ? 11 : 8, air: false, z };
  }

  /** Behind the tiles (world transform active): rain, snow, ash and void streaks. */
  drawBack(c: Ctx, g: Game, cx: number, cy: number, dt: number, t: number) {
    this.prepare(g);
    const k = this.kind;
    if (!this.drops.length) return;
    const gr = g.grid;
    const tile = (x: number, y: number) => {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      return tx < 0 || ty < 0 || tx >= gr.w || ty >= gr.h ? 1 : gr.tiles[ty * gr.w + tx];
    };
    const wind = g.wind + (k === 'storm' ? 40 : k === 'rain' ? 12 : 0);
    // drops live in screen space; convert to world for collisions
    if (k === 'rain' || k === 'storm') {
      c.save();
      c.strokeStyle = k === 'storm' ? 'rgba(185,210,245,0.55)' : 'rgba(185,210,245,0.5)';
      c.lineWidth = 1;
      c.beginPath();
      for (const d of this.drops) {
        d.y += d.v * d.z * dt;
        d.x += wind * d.z * dt;
        const wx = cx + d.x;
        const wy = cy + d.y;
        const tk = tile(wx, wy);
        if (tk === 0) d.air = true;
        else if (d.air && (solidT(tk) || tk === 2)) {
          // hit a surface: splash on its top edge
          if (this.splashes.length < 120) this.splashes.push({ x: wx, y: Math.floor(wy / TILE) * TILE, t: 0, big: d.z > 0.9 });
          Object.assign(d, this.newDrop(g, 0));
          continue;
        }
        if (d.y > VIEW_H + 10 || d.x < -70 || d.x > VIEW_W + 70) {
          Object.assign(d, this.newDrop(g, 0));
          continue;
        }
        const sl = (wind / (d.v || 1)) * d.len * d.z;
        c.moveTo(Math.round(wx), Math.round(wy));
        c.lineTo(Math.round(wx - sl), Math.round(wy - d.len * d.z));
      }
      c.stroke();
      c.restore();
    } else if (k === 'snow') {
      for (const d of this.drops) {
        d.y += d.v * d.z * dt;
        d.x += (Math.sin(t * 1.3 + d.len * 7 + d.z * 11) * 14 + 6) * d.z * dt;
        const wx = cx + d.x;
        const wy = cy + d.y;
        const tk = tile(wx, wy);
        if (tk === 0) d.air = true;
        else if (d.air) {
          Object.assign(d, this.newDrop(g, 0));
          continue;
        }
        if (d.y > VIEW_H + 6) Object.assign(d, this.newDrop(g, 0));
        if (d.x < -64) d.x += VIEW_W + 120;
        if (d.x > VIEW_W + 64) d.x -= VIEW_W + 120;
        const a = 0.45 + d.z * 0.45;
        c.fillStyle = `rgba(235,245,255,${a})`;
        c.fillRect(Math.round(wx), Math.round(wy), d.z > 0.9 ? 2 : 1, d.z > 0.9 ? 2 : 1);
      }
    } else if (k === 'ash') {
      for (const d of this.drops) {
        d.y += d.v * d.z * dt;
        d.x += (Math.sin(t * 2 + d.z * 13) * 10) * dt;
        if (d.y > VIEW_H + 10 || d.y < -20) Object.assign(d, this.newDrop(g, 0));
        if (d.x < -64) d.x += VIEW_W + 120;
        if (d.x > VIEW_W + 64) d.x -= VIEW_W + 120;
        const wx = cx + d.x;
        const wy = cy + d.y;
        if (d.v < 0) {
          // embers rise and flicker
          const f = 0.5 + 0.5 * Math.sin(t * 20 + d.z * 40);
          c.fillStyle = `rgba(255,${140 + Math.round(f * 80)},60,${0.5 + f * 0.5})`;
          c.fillRect(Math.round(wx), Math.round(wy), 1, 1);
        } else {
          c.fillStyle = `rgba(120,115,125,${0.35 + d.z * 0.3})`;
          c.fillRect(Math.round(wx), Math.round(wy), d.z > 0.9 ? 2 : 1, 1);
        }
      }
    } else if (k === 'voidstorm') {
      c.save();
      c.strokeStyle = 'rgba(214,120,255,0.35)';
      c.beginPath();
      for (const d of this.drops) {
        d.y += d.v * d.z * dt;
        d.x += 30 * d.z * dt;
        if (d.y < -20) Object.assign(d, this.newDrop(g, 0));
        const wx = cx + d.x;
        const wy = cy + d.y;
        c.moveTo(Math.round(wx), Math.round(wy));
        c.lineTo(Math.round(wx - 3 * d.z), Math.round(wy + 7 * d.z));
      }
      c.stroke();
      c.restore();
    }
  }

  /** In front of the tiles (world transform active): splashes, puddles, settled snow, mist. */
  drawFront(c: Ctx, g: Game, cx: number, cy: number, dt: number, t: number) {
    const k = this.kind;
    if (this.caps) c.drawImage(this.caps, 0, 0);
    if (k === 'rain' || k === 'storm') {
      // puddles with ripples from the rain
      for (const p of this.puddles) {
        if (p.x + p.w < cx || p.x > cx + VIEW_W || p.y < cy || p.y > cy + VIEW_H + 4) continue;
        rect(c, p.x, p.y - 1, p.w, 1, 'rgba(120,160,220,0.35)');
        const sh = (t * 0.8 + p.ph) % 1;
        px(c, p.x + Math.floor(sh * p.w), p.y - 1, 'rgba(230,240,255,0.7)');
        if (Math.sin(t * 7 + p.ph * 5) > 0.92) {
          px(c, p.x + p.w / 2 - 2, p.y - 2, 'rgba(200,220,255,0.6)');
          px(c, p.x + p.w / 2 + 2, p.y - 2, 'rgba(200,220,255,0.6)');
        }
      }
      for (const s of this.splashes) {
        s.t += dt;
        const a = 1 - s.t / 0.22;
        if (a <= 0) continue;
        const r = 1 + s.t * 18;
        c.fillStyle = `rgba(200,225,255,${0.7 * a})`;
        c.fillRect(Math.round(s.x - r), Math.round(s.y - 1 - s.t * 20), 1, 1);
        c.fillRect(Math.round(s.x + r), Math.round(s.y - 1 - s.t * 20), 1, 1);
        if (s.big) c.fillRect(Math.round(s.x), Math.round(s.y - 2 - s.t * 30), 1, 1);
        c.fillRect(Math.round(s.x - r), Math.round(s.y - 1), Math.round(r * 2), 1);
      }
      this.splashes = this.splashes.filter((s) => s.t < 0.22);
    }
    if (this.mist) {
      c.save();
      c.globalAlpha = 0.75 + Math.sin(t * 0.5) * 0.25;
      c.drawImage(this.mist, Math.round(Math.sin(t * 0.17) * 12), 0);
      c.restore();
    }
  }

  /** Lightning bolt in the distance, drawn over the backdrop (screen space, before the room). */
  drawSky(c: Ctx, g: Game, cx: number) {
    const L = g.lightning;
    if (L > 0.95 && this.lastLightning < 0.95) {
      // new strike: build a jagged bolt with one branch
      this.bolt = [];
      let x = g.lightningX - cx * 0.3;
      x = ((x % VIEW_W) + VIEW_W) % VIEW_W;
      let y = 0;
      while (y < VIEW_H * 0.75) {
        this.bolt.push({ x, y });
        x += (Math.random() - 0.5) * 26;
        y += 8 + Math.random() * 14;
      }
      const b0 = this.bolt[Math.floor(this.bolt.length / 3)];
      this.boltBranch = [b0];
      let bx = b0.x;
      let by = b0.y;
      for (let i = 0; i < 5; i++) {
        bx += 6 + Math.random() * 12;
        by += 6 + Math.random() * 10;
        this.boltBranch.push({ x: bx, y: by });
      }
    }
    this.lastLightning = L;
    if (L <= 0 || !this.bolt.length) return;
    const col = g.weather === 'voidstorm' ? '#e8a8ff' : '#e8f2ff';
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = Math.min(1, L * 1.4);
    for (const pts of [this.bolt, this.boltBranch])
      for (let i = 1; i < pts.length; i++) {
        line(c, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, col);
        line(c, pts[i - 1].x + 1, pts[i - 1].y, pts[i].x + 1, pts[i].y, rgba(col, 0.5));
      }
    glow(c, this.bolt[0].x, VIEW_H * 0.3, 140, g.weather === 'voidstorm' ? '#c45cff' : '#9fc8ff', 0.25 * L);
    c.restore();
  }

  /** After lighting: colour grade of the weather, flashes, heavy fog banks (screen space). */
  drawScreen(c: Ctx, g: Game, t: number) {
    const k = this.kind;
    const tint: Partial<Record<WeatherKind, string>> = {
      rain: 'rgba(40,60,95,0.10)',
      storm: 'rgba(18,28,60,0.18)',
      fog: 'rgba(150,165,185,0.10)',
      snow: 'rgba(170,200,235,0.08)',
      ash: 'rgba(255,110,40,0.07)',
      voidstorm: 'rgba(110,30,150,0.13)',
    };
    if (tint[k]) {
      c.fillStyle = tint[k]!;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (k === 'fog') {
      c.save();
      for (let i = 0; i < 5; i++) {
        const fx = ((t * (5 + i * 2) + i * 170) % (VIEW_W + 300)) - 150;
        glow(c, fx, VIEW_H * (0.25 + i * 0.15), 150, '#b8c6d8', 0.13);
      }
      c.restore();
    }
    if (k === 'ash') {
      const gg = c.createLinearGradient(0, VIEW_H * 0.6, 0, VIEW_H);
      gg.addColorStop(0, 'rgba(255,90,30,0)');
      gg.addColorStop(1, 'rgba(255,90,30,0.10)');
      c.fillStyle = gg;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (g.lightning > 0) {
      c.fillStyle = g.weather === 'voidstorm' ? `rgba(200,120,255,${g.lightning * 0.28})` : `rgba(225,235,255,${g.lightning * 0.32})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }
}
