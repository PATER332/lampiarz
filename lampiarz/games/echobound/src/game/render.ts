import { TILE } from './constants';
import type { Game } from './game';
import { mulberry32 } from './rng';
import {
  ANCHOR_PAL, DECOR_PAL, ECHO_PAL, PLAYER_PAL, REFLECT_PAL, WEAVER_PAL, WHITE_PAL, buildTileset, drawAnchorRing, drawCage, drawCharacter, drawCheckpoint, drawCrystal, drawDecor, drawDevourer, drawDoor,
  drawBoss, drawBossProjectile, drawExit, drawGuardian, drawKeyItem, drawLever, drawLift, drawMover, drawPlate, drawPortal, drawPrism, drawShadow, drawShrine, drawSign, drawSnapper,
  drawSpikeMover, drawSpring, drawVeil, drawWraith, type Tileset,
} from './sprites';
import { T_AIR, T_BRICK, T_CRUMBLE, T_DOOR, T_GEYSER, T_HIDDEN, T_ONEWAY, T_ROCK, T_SPIKE, T_SPRING, T_UPDRAFT, T_VEIL_ECHO, T_VEIL_LIFE, T_WATER, type LevelState } from './state';
import type { Theme } from './types';

interface Light { x: number; y: number; r: number; s: number; color?: string }

const SKY: Record<Theme, [string, string, string]> = {
  cave: ['#070a18', '#0b1026', '#05060d'],
  ruins: ['#0a0c1c', '#111633', '#06070f'],
  archive: ['#05101a', '#0a1e30', '#04090f'],
  gardens: ['#061410', '#0b2a1f', '#040a08'],
  forge: ['#160a08', '#2a120c', '#0a0504'],
  spire: ['#0a0a1c', '#141538', '#06060f'],
  heart: ['#12071a', '#1f0b2e', '#08040c'],
  abyss: ['#04070d', '#071427', '#02040a'],
  mire: ['#0a120a', '#12220e', '#050a05'],
  citadel: ['#080d18', '#111c30', '#040710'],
  rift: ['#140620', '#240a36', '#09020f'],
};
const SIL: Record<Theme, [string, string]> = {
  cave: ['#0f1430', '#0a0d21'],
  ruins: ['#161b3a', '#0e1128'],
  archive: ['#0c2236', '#071624'],
  gardens: ['#0f2e24', '#081c16'],
  forge: ['#301612', '#1c0c0a'],
  spire: ['#1a1b3e', '#0f1028'],
  heart: ['#24103a', '#160a24'],
  abyss: ['#0a1526', '#060c16'],
  mire: ['#13240f', '#0b1408'],
  citadel: ['#152138', '#0b1220'],
  rift: ['#2c0d3c', '#170520'],
};
const DARK: Record<Theme, string> = {
  cave: 'rgba(3,4,14,0.66)',
  ruins: 'rgba(4,5,16,0.62)',
  archive: 'rgba(2,6,14,0.68)',
  gardens: 'rgba(2,10,8,0.6)',
  forge: 'rgba(12,4,2,0.66)',
  spire: 'rgba(4,4,16,0.66)',
  heart: 'rgba(8,2,14,0.64)',
  abyss: 'rgba(1,3,10,0.7)',
  mire: 'rgba(3,10,3,0.66)',
  citadel: 'rgba(2,5,14,0.68)',
  rift: 'rgba(10,2,16,0.7)',
};
const GLOW: Record<Theme, string> = {
  cave: '120,240,255', ruins: '140,230,255', archive: '110,220,255', gardens: '120,255,180',
  forge: '255,150,70', spire: '170,160,255', heart: '255,150,245',
  abyss: '90,150,255', mire: '150,255,110', citadel: '120,190,255', rift: '255,110,220',
};

export class Renderer {
  private tilesets = new Map<Theme, Tileset>();
  private tileset!: Tileset;
  private masks = new Uint8Array(0);
  private variants = new Uint8Array(0);
  private light: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private vignette: HTMLCanvasElement | null = null;
  private bg = new Map<Theme, { far: HTMLCanvasElement; mid: HTMLCanvasElement }>();
  private fog: HTMLCanvasElement;
  private w = 640;
  private h = 360;
  private level: LevelState | null = null;

  constructor(private game: Game) {
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d')!;
    this.fog = document.createElement('canvas');
    this.fog.width = 160; this.fog.height = 80;
    const fc = this.fog.getContext('2d')!;
    const g = fc.createRadialGradient(80, 40, 4, 80, 40, 80);
    g.addColorStop(0, 'rgba(170,200,255,0.10)');
    g.addColorStop(0.6, 'rgba(170,200,255,0.04)');
    g.addColorStop(1, 'rgba(170,200,255,0)');
    fc.fillStyle = g;
    fc.fillRect(0, 0, 160, 80);
  }

  resize(w: number, h: number) {
    this.w = w; this.h = h;
    this.light.width = w; this.light.height = h;
    const v = document.createElement('canvas');
    v.width = w; v.height = h;
    const vc = v.getContext('2d')!;
    const g = vc.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    vc.fillStyle = g;
    vc.fillRect(0, 0, w, h);
    this.vignette = v;
  }

  isClosed(x: number, y: number): boolean {
    const L = this.level;
    if (!L) return true;
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) return true;
    const t = L.tiles[y * L.w + x];
    return t === T_ROCK || t === T_BRICK || t === T_HIDDEN || t === T_DOOR;
  }

  private drawInnerCorners(ctx: CanvasRenderingContext2D, ts: Tileset, tx: number, ty: number, px: number, py: number) {
    const n = this.isClosed(tx, ty - 1);
    const s = this.isClosed(tx, ty + 1);
    const w = this.isClosed(tx - 1, ty);
    const e = this.isClosed(tx + 1, ty);
    // NW inner corner: solid above and left, but diagonal NW is open air
    if (n && w && !this.isClosed(tx - 1, ty - 1)) ctx.drawImage(ts.innerCorner[0], px, py);
    // NE inner corner: solid above and right, but diagonal NE is open air
    if (n && e && !this.isClosed(tx + 1, ty - 1)) ctx.drawImage(ts.innerCorner[1], px, py);
    // SW inner corner: solid below and left, but diagonal SW is open air
    if (s && w && !this.isClosed(tx - 1, ty + 1)) ctx.drawImage(ts.innerCorner[2], px, py);
    // SE inner corner: solid below and right, but diagonal SE is open air
    if (s && e && !this.isClosed(tx + 1, ty + 1)) ctx.drawImage(ts.innerCorner[3], px, py);
  }

  prepare(L: LevelState) {
    this.level = L;
    const theme = L.def.theme;
    let ts = this.tilesets.get(theme);
    if (!ts) { ts = buildTileset(theme); this.tilesets.set(theme, ts); }
    this.tileset = ts;
    if (!this.bg.has(theme)) this.bg.set(theme, this.buildBackground(theme));
    const { w, h } = L;
    this.masks = new Uint8Array(w * h);
    this.variants = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let m = 0;
        if (!this.isClosed(x, y - 1)) m |= 1;
        if (!this.isClosed(x + 1, y)) m |= 2;
        if (!this.isClosed(x, y + 1)) m |= 4;
        if (!this.isClosed(x - 1, y)) m |= 8;
        this.masks[i] = m;
        this.variants[i] = (x * 7 + y * 13 + ((x * y) % 5)) % 3;
      }
    }
  }

  private buildBackground(theme: Theme) {
    const W = 1024, H = 600;
    const mkLayer = (color: string, seed: number, scale: number, glow: boolean) => {
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const c = cv.getContext('2d')!;
      const rnd = mulberry32(seed);
      c.fillStyle = color;
      // stalactites
      let x = 0;
      while (x < W) {
        const wdt = (20 + rnd() * 50) * scale;
        const hgt = (40 + rnd() * 160) * scale;
        c.beginPath();
        c.moveTo(x, 0); c.lineTo(x + wdt, 0); c.lineTo(x + wdt * (0.3 + rnd() * 0.4), hgt); c.closePath(); c.fill();
        x += wdt * (0.6 + rnd() * 0.6);
      }
      // stalagmites / structures
      x = 0;
      while (x < W) {
        const wdt = (30 + rnd() * 70) * scale;
        const hgt = (60 + rnd() * 220) * scale;
        if (theme === 'gardens' && rnd() < 0.6) {
          // giant mushroom trees with curved umbrella caps
          c.fillRect(x + wdt * 0.4, H - hgt, wdt * 0.2, hgt);
          c.beginPath();
          c.arc(x + wdt * 0.5, H - hgt, wdt * 0.45, Math.PI, 0);
          c.closePath(); c.fill();
        } else if (theme === 'forge' && rnd() < 0.55) {
          // industrial chimneys & furnace towers with glowing vents
          c.fillRect(x, H - hgt, wdt * 0.4, hgt);
          c.fillRect(x - 3, H - hgt - 6, wdt * 0.4 + 6, 6);
          c.fillStyle = 'rgba(255,140,50,0.3)';
          c.fillRect(x + 4, H - hgt + 20, wdt * 0.4 - 8, 4);
          c.fillStyle = color;
        } else if (theme === 'spire' && rnd() < 0.6) {
          // pointed gothic cathedral spires & flying buttresses
          c.beginPath();
          c.moveTo(x, H); c.lineTo(x + wdt * 0.2, H - hgt * 0.5); c.lineTo(x + wdt * 0.5, H - hgt);
          c.lineTo(x + wdt * 0.8, H - hgt * 0.5); c.lineTo(x + wdt, H); c.closePath(); c.fill();
          c.fillRect(x + wdt * 0.45, H - hgt - 14, wdt * 0.1, 14);
        } else if (theme === 'ruins' && rnd() < 0.5) {
          // ruined colonnades & pediments
          c.fillRect(x, H - hgt, wdt * 0.25, hgt);
          c.fillRect(x + wdt * 0.75, H - hgt, wdt * 0.25, hgt);
          c.fillRect(x - 4, H - hgt - 10, wdt + 8, 12);
        } else if (theme === 'archive' && rnd() < 0.6) {
          // multi-tier book vaults with reading arches
          c.fillRect(x, H - hgt, wdt, hgt);
          c.fillStyle = SKY[theme][1];
          for (let yy = H - hgt + 14; yy < H; yy += 22) c.fillRect(x + 4, yy, wdt - 8, 3);
          c.fillStyle = color;
        } else {
          // sweeping organic mountain / stalagmite silhouette
          c.beginPath();
          c.moveTo(x, H); c.lineTo(x + wdt, H); c.lineTo(x + wdt * (0.3 + rnd() * 0.4), H - hgt); c.closePath(); c.fill();
        }
        x += wdt * (0.7 + rnd() * 0.5);
      }
      if (glow) {
        for (let i = 0; i < 14; i++) {
          const gx = rnd() * W, gy = 80 + rnd() * (H - 160), r = 20 + rnd() * 50;
          const g = c.createRadialGradient(gx, gy, 0, gx, gy, r);
          g.addColorStop(0, `rgba(${GLOW[theme]},0.18)`);
          g.addColorStop(1, `rgba(${GLOW[theme]},0)`);
          c.fillStyle = g;
          c.fillRect(gx - r, gy - r, r * 2, r * 2);
          c.fillStyle = `rgba(${GLOW[theme]},0.6)`;
          c.fillRect(gx - 1, gy - 3, 2, 6);
          c.fillRect(gx - 3, gy - 1, 6, 2);
          c.fillStyle = color;
        }
      }
      return cv;
    };
    return { far: mkLayer(SIL[theme][0], 101, 1, true), mid: mkLayer(SIL[theme][1], 202, 1.4, false) };
  }

  /* ------------------------------------------------------------------ */
  draw(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    const L = this.level;
    const w = this.w, h = this.h;
    if (!L) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); return; }
    const theme = L.def.theme;
    const t = g.frame;
    const shakeX = g.shake > 0 ? (Math.random() - 0.5) * g.shake * 2 : 0;
    const shakeY = g.shake > 0 ? (Math.random() - 0.5) * g.shake * 2 : 0;
    const camX = Math.round(g.cam.x + shakeX), camY = Math.round(g.cam.y + shakeY);
    ctx.imageSmoothingEnabled = false;
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, SKY[theme][0]); sky.addColorStop(0.55, SKY[theme][1]); sky.addColorStop(1, SKY[theme][2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // parallax
    const bg = this.bg.get(theme)!;
    this.drawLayer(ctx, bg.far, camX, camY, 0.15, 0.1);
    this.drawLayer(ctx, bg.mid, camX, camY, 0.4, 0.25);

    const lights: Light[] = [];
    ctx.save();
    ctx.translate(-camX, -camY);
    const tx1 = Math.max(0, Math.floor(camX / TILE) - 1), tx2 = Math.min(L.w - 1, Math.ceil((camX + w) / TILE) + 1);
    const ty1 = Math.max(0, Math.floor(camY / TILE) - 1), ty2 = Math.min(L.h - 1, Math.ceil((camY + h) / TILE) + 1);
    const ts = this.tileset;

    // --- Pass 1: Subterranean cavern back-wall & depth shadows in open air ---
    for (let ty = ty1; ty <= ty2; ty++) {
      for (let tx = tx1; tx <= tx2; tx++) {
        const i = ty * L.w + tx;
        const tile = L.tiles[i];
        if (tile !== T_AIR && tile !== T_WATER && tile !== T_UPDRAFT && tile !== T_GEYSER) continue;
        const px = tx * TILE, py = ty * TILE;

        // Textured deep cavern back-wall (softly letting distant parallax breathe through)
        const bgIdx = Math.abs(((tx * 5 + ty * 11) ^ (tx * ty)) % ts.bgWall.length);
        ctx.globalAlpha = 0.82;
        ctx.drawImage(ts.bgWall[bgIdx], px, py);
        ctx.globalAlpha = 1;

        // Rich ambient drop-shadow cast by ceiling/overhang above into open cavern
        if (this.isClosed(tx, ty - 1)) {
          ctx.fillStyle = 'rgba(0,0,0,0.52)'; ctx.fillRect(px, py, 16, 2);
          ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.fillRect(px, py + 2, 16, 2);
          ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(px, py + 4, 16, 1);
        }
        // Soft side-cast shadows from adjacent vertical walls
        if (this.isClosed(tx - 1, ty)) {
          ctx.fillStyle = 'rgba(0,0,0,0.40)'; ctx.fillRect(px, py, 2, 16);
          ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(px + 2, py, 1, 16);
        }
        if (this.isClosed(tx + 1, ty)) {
          ctx.fillStyle = 'rgba(0,0,0,0.40)'; ctx.fillRect(px + 14, py, 2, 16);
          ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(px + 13, py, 1, 16);
        }
        // Crevice ambient occlusion in corners of open space
        if (this.isClosed(tx - 1, ty) && this.isClosed(tx, ty - 1)) {
          ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(px + 2, py + 2, 2, 2);
        }
        if (this.isClosed(tx + 1, ty) && this.isClosed(tx, ty - 1)) {
          ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(px + 12, py + 2, 2, 2);
        }
      }
    }

    // --- Pass 2: Foreground solid tiles with rounded outer corners & inner corner bevels ---
    for (let ty = ty1; ty <= ty2; ty++) {
      for (let tx = tx1; tx <= tx2; tx++) {
        const i = ty * L.w + tx;
        const tile = L.tiles[i];
        if (tile === T_AIR || tile === T_WATER || tile === T_DOOR) continue;
        const px = tx * TILE, py = ty * TILE;
        switch (tile) {
          case T_ROCK:
            ctx.drawImage(ts.rock[this.masks[i] * 3 + this.variants[i]], px, py);
            this.drawInnerCorners(ctx, ts, tx, ty, px, py);
            break;
          case T_BRICK:
            ctx.drawImage(ts.brick[this.masks[i]], px, py);
            this.drawInnerCorners(ctx, ts, tx, ty, px, py);
            break;
          case T_ONEWAY: ctx.drawImage(ts.oneway, px, py); break;
          case T_SPIKE: ctx.drawImage(ts.spike, px, py); break;
          case T_CRUMBLE: {
            const c = L.crumbles.get(i)!;
            if (c.state === 2) { ctx.globalAlpha = 0.12; ctx.drawImage(ts.crumble, px, py); ctx.globalAlpha = 1; }
            else if (c.state === 1) ctx.drawImage(ts.crumble, px + Math.round((Math.random() - 0.5) * 2), py + Math.round(Math.random()));
            else ctx.drawImage(ts.crumble, px, py);
            break;
          }
          case T_HIDDEN: {
            const r = L.hiddenAt.get(i);
            const img = ts.rock[this.masks[i] * 3 + this.variants[i]];
            if (r && r.revealed) {
              const a = Math.max(0.18, 1 - r.revealT / 40);
              ctx.globalAlpha = a; ctx.drawImage(img, px, py); ctx.globalAlpha = 1;
            } else ctx.drawImage(img, px, py);
            break;
          }
          case T_VEIL_ECHO:
          case T_VEIL_LIFE: {
            const life = tile === T_VEIL_LIFE;
            const up = ty > 0 ? L.tiles[i - L.w] : T_ROCK, down = ty < L.h - 1 ? L.tiles[i + L.w] : T_ROCK;
            drawVeil(ctx, px, py, t, life, up !== tile, down !== tile);
            if ((ty + tx) % 2 === 0) lights.push({ x: px + 8, y: py + 8, r: 18, s: 0.45, color: life ? '255,170,60' : '80,200,255' });
            break;
          }
          case T_SPRING: {
            const sp = L.springs.get(i);
            drawSpring(ctx, px, py, sp ? sp.squash : 0, t + tx * 7, DECOR_PAL[theme]);
            lights.push({ x: px + 8, y: py + 3, r: 16, s: 0.5, color: '255,211,106' });
            break;
          }
          case T_UPDRAFT: {
            const phase = (t * 2 + tx * 5 + ty * 3) % 16;
            ctx.fillStyle = 'rgba(160,255,210,0.14)';
            ctx.fillRect(px + 3, py + ((16 - phase) % 16), 1, 5);
            ctx.fillRect(px + 11, py + ((24 - phase) % 16), 1, 4);
            ctx.fillStyle = 'rgba(160,255,210,0.05)';
            ctx.fillRect(px, py, 16, 16);
            break;
          }
          case T_GEYSER: { // gejzer: okresowo wyrzuca kolumnę gorącego pyłu
            const phase = (t + tx * 13 + ty * 7) % 190;
            const erupting = phase < 115;
            ctx.fillStyle = 'rgba(16,22,34,0.72)';
            ctx.fillRect(px + 1, py + 11, 14, 5);
            ctx.fillStyle = 'rgba(120,170,210,0.35)';
            ctx.fillRect(px + 3, py + 11, 10, 1);
            if (erupting) {
              const rise = (t * 2 + tx * 7) % 16;
              ctx.fillStyle = 'rgba(150,235,255,0.13)';
              ctx.fillRect(px + 2, py, 12, 16);
              ctx.fillStyle = 'rgba(200,245,255,0.55)';
              ctx.fillRect(px + 4, py + ((16 - rise) % 16), 1, 5);
              ctx.fillRect(px + 8, py + ((24 - rise) % 16), 1, 6);
              ctx.fillRect(px + 11, py + ((30 - rise) % 16), 1, 4);
              if (phase < 24) {
                ctx.fillStyle = 'rgba(255,255,255,0.75)';
                ctx.fillRect(px + 2, py + 9, 12, 3);
              }
              lights.push({ x: px + 8, y: py + 8, r: 17, s: 0.32, color: '150,235,255' });
            }
            break;
          }
        }
      }
    }
    // Sealed boss arena: animated memory glass walls close behind the player.
    if (L.boss?.active && !L.boss.defeated) {
      const [left, right, top, bottom] = L.boss.arena;
      const gate = (gx: number, hue: string, phase: number) => {
        const pulse = 0.55 + 0.25 * Math.sin(t * 0.12 + phase);
        ctx.fillStyle = `rgba(${hue},${0.10 + pulse * 0.09})`;
        ctx.fillRect(gx - 5, top, 10, bottom - top);
        for (let gy = top + 2; gy < bottom - 1; gy += 7) {
          const off = Math.round(Math.sin(t * 0.08 + gy * 0.12 + phase) * 2);
          ctx.fillStyle = `rgba(${hue},${0.42 + pulse * 0.25})`;
          ctx.fillRect(gx - 1 + off, gy, 2, 4);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillRect(gx + off, gy + 1, 1, 1);
        }
        ctx.fillStyle = `rgba(${hue},0.65)`;
        ctx.fillRect(gx - 8, top, 16, 2);
        ctx.fillRect(gx - 8, bottom - 2, 16, 2);
        lights.push({ x: gx, y: (top + bottom) / 2, r: 38, s: 0.45, color: hue });
      };
      const hue = L.boss.kind === 'rootMatriarch' ? '120,255,150' : L.boss.kind === 'forgeBehemoth' ? '255,130,60' : '190,140,255';
      gate(left, hue, 0);
      gate(right, hue, Math.PI);
    }
    // decor
    const dpal = DECOR_PAL[theme];
    for (const d of L.decor) {
      const hanging = d.type === 4 || d.type === 5 || d.type === 9 || d.type === 10 || d.type === 11 || d.type === 17 || d.type === 18 || d.type === 19 || d.type === 20 || d.type === 21;
      // Long ceiling flora can reach several tiles below its attachment point.
      if (d.x < tx1 - 1 || d.x > tx2 + 1 || d.y < ty1 - (hanging ? 6 : 1) || d.y > ty2) continue;
      drawDecor(ctx, d.type, d.x * TILE, d.y * TILE, t, d.variant, dpal);
      if (d.light) {
        const lx = d.x * TILE + 8;
        const ly = d.y * TILE + (d.type === 9 ? 28 : d.type === 10 || d.type === 18 ? 28
          : d.type === 11 || d.type === 17 ? 32 : d.type === 19 ? 12 : d.type === 20 ? 34 : d.type === 21 ? 28
            : d.type === 5 ? 24 : d.type === 4 ? 12
              : d.type === 13 ? 2 : d.type === 12 ? 7 : d.type === 14 || d.type === 16 ? 9 : 12);
        const radius = d.type === 9 || d.type === 19 ? 32 : d.type === 10 || d.type === 18 || d.type === 21 ? 27 : d.type === 11 || d.type === 17 || d.type === 20 ? 24
          : d.type === 13 ? 23 : 18;
        const tint = d.type === 9 || d.type === 4 || d.type === 13 || d.type === 18 || d.type === 19 || d.type === 21 ? GLOW[theme] : undefined;
        lights.push({ x: lx, y: ly, r: radius, s: 0.5, color: tint });
      }
      // Pollen and crystal motes drift lazily from the hanging growth.
      if (hanging && d.light && t % 25 === 0 && ((d.x * 7 + d.y * 11 + t) % 3 === 0)) {
        const isCrystal = d.type === 4 || d.type === 9 || d.type === 19;
        const seedY = d.type === 9 || d.type === 19 ? 14 : d.type === 10 || d.type === 18 ? 27
          : d.type === 11 || d.type === 17 ? 32 : d.type === 20 ? 32 : d.type === 21 ? 26 : 14;
        g.particles.add({
          x: d.x * TILE + 4 + Math.random() * 8,
          y: d.y * TILE + seedY,
          vx: (Math.random() - 0.5) * 0.22,
          vy: 0.12 + Math.random() * 0.2,
          life: 45 + Math.random() * 25,
          max: 70,
          color: isCrystal ? (Math.random() < 0.5 ? dpal.crystalA : '#ffffff') : dpal.glow,
          size: 1,
          g: 0.008,
          drag: 0.995,
          glow: true,
          shrink: true,
        });
      }
    }
    // Water beads form at damp ceiling seams before detaching and falling.
    for (const e of L.dripEmitters) {
      if (e.x < camX - 8 || e.x > camX + w + 8 || e.y < camY - 8 || e.y > camY + h + 8) continue;
      ctx.fillStyle = '#427f95';
      ctx.fillRect(Math.round(e.x), Math.round(e.y) - 1, 1, 1);
      if (e.timer < 19) {
        ctx.fillStyle = '#aee6f4';
        ctx.fillRect(Math.round(e.x), Math.round(e.y), e.timer < 9 ? 2 : 1, e.timer < 7 ? 3 : 2);
        if (e.timer < 6) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.round(e.x), Math.round(e.y), 1, 1);
        }
      }
    }
    for (const drop of L.droplets) {
      if (drop.x < camX - 8 || drop.x > camX + w + 8 || drop.y < camY - 8 || drop.y > camY + h + 8) continue;
      const dx = Math.round(drop.x), dy = Math.round(drop.y);
      ctx.fillStyle = 'rgba(120,210,238,0.35)';
      ctx.fillRect(dx, dy - Math.max(1, Math.round(drop.vy)), 1, Math.max(2, Math.round(drop.vy)));
      ctx.fillStyle = '#8ddbea';
      ctx.fillRect(dx - 1, dy, 3, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(dx, dy, 1, 1);
    }
    // mechanisms
    for (const pl of L.plates) {
      drawPlate(ctx, pl.x * TILE, pl.y * TILE, pl.anim, pl.pressed, pl.noEcho, !!pl.echoOnly, pl.timed ?? 0, pl.hold ?? 0);
      if (pl.pressed) lights.push({ x: pl.x * TILE + 8, y: pl.y * TILE + 12, r: 18, s: 0.7, color: pl.echoOnly ? '201,166,255' : '111,243,255' });
      if (pl.echoOnly) lights.push({ x: pl.x * TILE + 8, y: pl.y * TILE + 12, r: 12, s: 0.3, color: '201,166,255' });
      if (pl.deniedT > 0) { ctx.fillStyle = '#ff4d6d'; ctx.fillRect(pl.x * TILE + 6, pl.y * TILE + 2, 4, 4); }
    }
    for (const lv of L.levers) {
      drawLever(ctx, lv.x * TILE, lv.y * TILE, lv.on, lv.timed > 0, lv.timed > 0 ? lv.timer / (lv.timed * 60) : 0);
      if (lv.on || lv.timer > 0) lights.push({ x: lv.x * TILE + 8, y: lv.y * TILE + 6, r: 16, s: 0.6 });
      if (lv.deniedT > 0) { ctx.fillStyle = '#ff4d6d'; ctx.fillRect(lv.x * TILE + 6, lv.y * TILE - 4, 4, 4); }
    }
    for (const cp of L.checkpoints) {
      drawCheckpoint(ctx, cp.x * TILE, cp.y * TILE, cp.active, t);
      lights.push({ x: cp.x * TILE + 8, y: cp.y * TILE + 3, r: cp.active ? 40 : 12, s: cp.active ? 0.8 : 0.3, color: cp.active ? '111,243,255' : undefined });
    }
    for (const sh of L.shrines) {
      drawShrine(ctx, sh.x * TILE, sh.y * TILE, t, g.nearShrine);
      lights.push({ x: sh.x * TILE + 8, y: sh.y * TILE + 6, r: 34, s: 0.7, color: '193,92,245' });
    }
    for (const s of L.signs) {
      drawSign(ctx, s.x * TILE, s.y * TILE, t, g.sign === s.text);
      lights.push({ x: s.x * TILE + 8, y: s.y * TILE + 4, r: 14, s: 0.5 });
    }
    for (const m of L.movers) {
      // rail hint
      ctx.fillStyle = 'rgba(120,130,170,0.25)';
      if (m.x1 !== m.x0) ctx.fillRect(Math.min(m.x0, m.x1), m.y0 + 3, Math.abs(m.x1 - m.x0) + m.w, 1);
      else ctx.fillRect(m.x0 + m.w / 2, Math.min(m.y0, m.y1), 1, Math.abs(m.y1 - m.y0) + 8);
      if (m.spikes) {
        drawSpikeMover(ctx, Math.round(m.x), Math.round(m.y), m.w, t);
        lights.push({ x: m.x + m.w / 2, y: m.y + 4, r: 14, s: 0.35, color: '255,106,58' });
      } else if (m.when !== undefined) {
        drawLift(ctx, Math.round(m.x), Math.round(m.y), m.w, t, m.active, Math.min(m.y0, m.y1) - 8);
        if (m.active) lights.push({ x: m.x + m.w / 2, y: m.y + 3, r: 22, s: 0.5, color: '111,243,255' });
      } else {
        drawMover(ctx, Math.round(m.x), Math.round(m.y), m.w, t);
      }
    }
    for (const d of L.doors) {
      drawDoor(ctx, d.x * TILE, d.y * TILE, d.tilesHigh, d.anim, d.latch, d.latched, t);
      if (d.lockId && d.anim < 0.9) {
        const kx = d.x * TILE + 6, ky = d.y * TILE + d.tilesHigh * 8 - 4 - Math.round(d.anim * (d.tilesHigh * 16 - 2));
        ctx.fillStyle = d.latched ? '#ffd166' : (Math.floor(t / 14) % 2 ? '#ffd166' : '#8a6a1a');
        ctx.fillRect(kx, ky, 4, 4); ctx.fillRect(kx + 1, ky + 4, 2, 3);
        ctx.fillStyle = '#1a1c2c'; ctx.fillRect(kx + 1, ky + 1, 2, 2);
      }
      const col = d.lockId ? '255,209,102' : '111,243,255';
      lights.push({ x: d.x * TILE + 8, y: d.y * TILE + d.tilesHigh * 8, r: d.open ? 30 : 14, s: d.open ? 0.7 : 0.35, color: d.open || d.lockId ? col : undefined });
    }
    for (const mk of L.markers) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.08 + mk.x);
      const px = mk.x * TILE, py = mk.y * TILE;
      ctx.fillStyle = `rgba(240,200,255,${0.35 + pulse * 0.5})`;
      ctx.fillRect(px + 7, py + 11, 2, 1); ctx.fillRect(px + 5, py + 12, 6, 1); ctx.fillRect(px + 3, py + 13, 10, 1); ctx.fillRect(px + 5, py + 14, 6, 1); ctx.fillRect(px + 7, py + 15, 2, 1);
      ctx.fillStyle = `rgba(255,255,255,${pulse})`; ctx.fillRect(px + 7, py + 13, 2, 1);
      lights.push({ x: px + 8, y: py + 13, r: 14, s: 0.3 + pulse * 0.3, color: '220,120,255' });
    }
    for (const pr of L.prisms) {
      drawPrism(ctx, pr.x * TILE, pr.y * TILE, t, pr.charge);
      lights.push({ x: pr.x * TILE + 8, y: pr.y * TILE + 3, r: 26 + pr.charge * 30, s: 0.6 + pr.charge * 0.4, color: '220,120,255' });
      if (pr.charge > 0) {
        ctx.fillStyle = `rgba(244,194,255,${pr.charge * 0.6})`;
        ctx.fillRect(pr.x * TILE + 7, pr.y * TILE - 40, 2, 56);
      }
    }
    for (const k of L.keys) {
      if (k.taken) continue;
      drawKeyItem(ctx, k.x * TILE + 8, k.y * TILE + 8, t);
      lights.push({ x: k.x * TILE + 8, y: k.y * TILE + 8, r: 24, s: 0.7, color: '255,209,102' });
    }
    for (const po of L.portals) {
      const hue = po.id === 'A' ? 190 : 275;
      drawPortal(ctx, po.x * TILE + 8, po.y * TILE + 8, t + po.x * 3, hue);
      lights.push({ x: po.x * TILE + 8, y: po.y * TILE + 8, r: 30 + po.pulse * 40, s: 0.7 + po.pulse * 0.3, color: hue === 190 ? '111,243,255' : '193,92,245' });
    }
    for (const ex of L.exits) {
      const final = L.def.next === null;
      drawExit(ctx, ex.x * TILE, ex.y * TILE, t, final);
      lights.push({ x: ex.x * TILE + 8, y: ex.y * TILE - (final ? 10 : 0), r: final ? 90 : 56, s: 0.95, color: final ? '255,150,245' : '111,243,255' });
    }
    // caged characters
    for (const cp of L.captives) {
      if (cp.open >= 1) continue;
      drawCage(ctx, cp.x * TILE, cp.y * TILE, cp.open, t);
      lights.push({ x: cp.x * TILE + 8, y: cp.y * TILE, r: 46 + cp.open * 30, s: 0.8, color: '255,179,71' });
      if (!cp.freed && t % 14 === 0) {
        g.particles.add({ x: cp.x * TILE + 4 + Math.random() * 8, y: cp.y * TILE + 12, vx: (Math.random() - 0.5) * 0.2, vy: -0.4, life: 40, max: 40, color: Math.random() < 0.5 ? '#ffb347' : '#c9a6ff', size: 1, g: 0, drag: 1, glow: true, shrink: false });
      }
    }
    // crystals
    for (const c of L.crystals) {
      if (c.taken) continue;
      const bob = Math.sin(t * 0.07 + c.x * 1.3) * 1.5;
      drawCrystal(ctx, c.x * TILE + 8, c.y * TILE + 8 + bob, t + c.x * 3, c.value > 1);
      lights.push({ x: c.x * TILE + 8, y: c.y * TILE + 8 + bob, r: c.value > 1 ? 34 : 22, s: 0.75, color: c.value > 1 ? '220,120,255' : '111,243,255' });
    }
    // recording start marker
    if (g.recording) {
      const r = g.recording;
      const a = 0.4 + 0.3 * Math.sin(t * 0.2);
      ctx.globalAlpha = a;
      drawCharacter(ctx, r.startX + 5, r.startY + 14, g.player.facing, 'idle', t, ECHO_PAL);
      ctx.globalAlpha = 1;
    }
    // echoes
    for (const e of g.echoes) {
      let alpha = 0.6 + 0.08 * Math.sin(t * 0.25);
      if (e.state === 'lingering') alpha = 0.3 + 0.35 * (e.linger / e.lingerMax);
      if (e.state === 'fading') alpha *= e.fade / 30;
      if (e.age < 12) alpha *= e.age / 12;
      const pal = e.reflected ? REFLECT_PAL : ECHO_PAL;
      const tint = e.reflected ? '193,92,245' : '111,243,255';
      for (let i = 0; i < e.trail.length; i++) {
        const tr = e.trail[i];
        ctx.globalAlpha = alpha * 0.08 * (i + 1) / e.trail.length;
        drawCharacter(ctx, tr.x + e.w / 2, tr.y + e.h, e.facing, e.anim, t, pal);
      }
      ctx.globalAlpha = alpha;
      drawCharacter(ctx, e.x + e.w / 2, e.y + e.h, e.facing, e.anim, e.t, pal);
      ctx.globalAlpha = 1;
      if (e.state !== 'fading') {
        const frac = e.state === 'playing' ? 1 : e.linger / e.lingerMax;
        ctx.fillStyle = 'rgba(10,30,45,0.7)'; ctx.fillRect(Math.round(e.x) - 2, Math.round(e.y) - 7, 14, 3);
        ctx.fillStyle = frac < 0.3 ? '#ff7a6b' : (e.reflected ? '#e9c0ff' : '#6ff3ff'); ctx.fillRect(Math.round(e.x) - 1, Math.round(e.y) - 6, Math.max(1, Math.round(12 * frac)), 1);
      }
      if (e.age < 20) {
        ctx.strokeStyle = `rgba(${tint},${1 - e.age / 20})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y + e.h / 2, 4 + e.age * 1.6, 0, Math.PI * 2); ctx.stroke();
      }
      lights.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, r: 46, s: 0.75 * alpha, color: tint });
    }
    // Weaver afterimages (dash & blink)
    for (const gh of g.ghosts) {
      ctx.globalAlpha = (gh.life / gh.max) * 0.5;
      drawCharacter(ctx, gh.x + 5, gh.y + 14, gh.facing, gh.anim, gh.t, ANCHOR_PAL, 'weaver');
    }
    ctx.globalAlpha = 1;
    // Shadow Anchors
    if (g.anchors.length && !g.player.dead) {
      const a0 = g.anchors[0];
      const sx = g.player.x + g.player.w / 2, sy = g.player.y + g.player.h / 2;
      const ex = a0.x + a0.w / 2, ey = a0.y + a0.h / 2;
      const dist = Math.hypot(ex - sx, ey - sy);
      const steps = Math.floor(dist / 6);
      ctx.fillStyle = 'rgba(201,166,255,0.4)';
      for (let k = 0; k < steps; k++) {
        if ((k + Math.floor(t / 4)) % 2) continue;
        const f = k / Math.max(1, steps);
        ctx.fillRect(Math.round(sx + (ex - sx) * f), Math.round(sy + (ey - sy) * f), 1, 1);
      }
    }
    for (const a of g.anchors) {
      let al = 0.62 + 0.14 * Math.sin(t * 0.12);
      if (a.state === 'fading') al *= a.fade / 24;
      if (a.age < 10) al *= a.age / 10;
      const acx = a.x + a.w / 2, aby = a.y + a.h;
      drawAnchorRing(ctx, acx, aby, t, Math.min(1, al * 1.2));
      ctx.globalAlpha = al;
      drawCharacter(ctx, acx, aby, a.facing, 'idle', t + a.id * 13, ANCHOR_PAL, 'weaver');
      ctx.globalAlpha = 1;
      if (a.state === 'live' && Number.isFinite(a.lifeMax)) {
        const frac = a.life / a.lifeMax;
        ctx.fillStyle = 'rgba(20,8,40,0.7)'; ctx.fillRect(Math.round(a.x) - 2, Math.round(a.y) - 8, 14, 3);
        ctx.fillStyle = frac < 0.25 ? '#ff7a6b' : '#c9a6ff'; ctx.fillRect(Math.round(a.x) - 1, Math.round(a.y) - 7, Math.max(1, Math.round(12 * frac)), 1);
      }
      lights.push({ x: acx, y: a.y + 7, r: 46, s: 0.7 * al, color: '185,140,255' });
    }
    // enemies
    for (const en of L.enemies) {
      if (en.x + en.w < camX - 40 || en.x > camX + w + 40) continue;
      if (en.kind === 'shadow') {
        if (en.state === 'dispersed') continue;
        const alpha = en.state === 'reform' ? 1 - en.timer / 50 : 0.92;
        drawShadow(ctx, en.x + en.w / 2, en.y + en.h, en.facing, en.animT, en.alert, alpha);
        lights.push({ x: en.x + en.w / 2, y: en.y + 4, r: 14, s: 0.35, color: en.alert > 0 ? '255,77,109' : '195,91,255' });
      } else if (en.kind === 'guardian') {
        drawGuardian(ctx, en.x + en.w / 2, en.y + en.h, en.facing, en.animT, en.asleep, Math.abs(en.vx) > 0.05);
        if (!en.asleep) lights.push({ x: en.x + en.w / 2, y: en.y + 4, r: 22, s: 0.5, color: '255,154,60' });
      } else if (en.kind === 'wraith') {
        if (en.timer > 0 && Math.floor(t / 3) % 2 === 0) continue;
        drawWraith(ctx, en.x + en.w / 2, en.y + en.h, en.facing, en.animT, en.asleep);
        lights.push({ x: en.x + en.w / 2, y: en.y + 5, r: en.asleep ? 10 : 26, s: en.asleep ? 0.25 : 0.55, color: en.asleep ? undefined : '255,209,102' });
      } else if (en.kind === 'snapper') {
        drawSnapper(ctx, en.x + en.w / 2, en.y + en.h, en.animT, en.state, DECOR_PAL[theme]);
        if (en.state === 'windup' || en.state === 'snap') lights.push({ x: en.x + en.w / 2, y: en.y - 8, r: 18, s: 0.5, color: '255,77,109' });
      } else if (en.kind === 'crawler') {
        // Pełzacz — niski, wijący się stwór z segmentowanym pancerzem.
        const tt = en.animT;
        const step = Math.sin(tt * 0.32) * 2;
        const bob = Math.round(Math.sin(tt * 0.18) * 1);
        const stun = en.timer > 0;
        for (let k = 0; k < 6; k++) {
          const lx = en.x + 2 + k * 2;
          const lift = stun ? 0 : Math.round(Math.sin(tt * 0.32 + k * 0.9) * 1.2);
          ctx.fillStyle = k % 2 ? '#2a4a2c' : '#3f7a3c';
          ctx.fillRect(Math.round(lx + step * 0.2), en.y + 10 + lift, 1, 3 - lift);
        }
        ctx.fillStyle = '#244226';
        ctx.fillRect(en.x, en.y + 4 + bob, 12, 7);
        ctx.fillStyle = '#3c7c3e';
        ctx.fillRect(en.x + 1, en.y + 3 + bob, 10, 5);
        ctx.fillStyle = '#67c45c';
        ctx.fillRect(en.x + 1, en.y + 3 + bob, 10, 1);
        ctx.fillStyle = '#1b2f1c';
        for (let s = 0; s < 3; s++) ctx.fillRect(en.x + 3 + s * 3, en.y + 8 + bob, 2, 1);
        ctx.fillStyle = stun ? '#b9ffd0' : '#eaffb0';
        ctx.fillRect(en.x + 3, en.y + 6 + bob, 2, 1);
        ctx.fillRect(en.x + 7, en.y + 6 + bob, 2, 1);
        ctx.fillStyle = '#1c321d';
        ctx.fillRect(en.x + 4, en.y + 7 + bob, 4, 1);
        if (stun) {
          ctx.fillStyle = '#ffffff';
          const star = Math.floor(tt / 6) % 3;
          ctx.fillRect(en.x + 3 + star * 3, en.y - 1, 2, 1);
        }
        lights.push({ x: en.x + 6, y: en.y + 6, r: 14, s: 0.25, color: '120,220,120' });
      } else if (en.kind === 'floater') {
        // Duszek — płynna, blada forma z wirującymi iskrami.
        const tt = en.animT;
        const cy = en.y + en.h / 2 + Math.sin(tt * 0.06) * 3;
        ctx.fillStyle = 'rgba(120,170,220,0.22)';
        ctx.fillRect(en.x - 3, cy - 10, 18, 20);
        ctx.fillStyle = '#22406e';
        ctx.fillRect(en.x + 1, cy - 7, 10, 14);
        ctx.fillStyle = '#3d6fae';
        ctx.fillRect(en.x + 2, cy - 6, 8, 11);
        ctx.fillStyle = '#7fb4f0';
        ctx.fillRect(en.x + 3, cy - 5, 4, 3);
        ctx.fillStyle = '#eaf6ff';
        ctx.fillRect(en.x + 4 + (en.facing > 0 ? 2 : 0), cy - 4, 2, 2);
        for (let k = 0; k < 5; k++) {
          const a = tt * 0.05 + (k / 5) * Math.PI * 2;
          const px = en.x + 6 + Math.cos(a) * 12;
          const py = cy + Math.sin(a) * 9;
          ctx.fillStyle = k % 2 ? '#9fd0ff' : '#6ff3ff';
          ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
        }
        if (Math.abs(en.vx) + Math.abs(en.vy) > 0.2) {
          ctx.fillStyle = 'rgba(120,190,240,0.35)';
          ctx.fillRect(en.x + 2, cy + 9, 8, 1);
        }
        lights.push({ x: en.x + 6, y: cy, r: 26, s: 0.55, color: '110,190,255' });
      } else if (en.kind === 'sentinel') {
        // Strażnik Otchłani — kamienny kolos z rozżarzoną raną i ciężkimi pięściami.
        const tt = en.animT;
        const warm = en.state === 'windup' ? 0.55 : en.state === 'lunge' ? 0.85 : en.state === 'recover' ? 0.3 : 0.2;
        const stomp = en.state === 'lunge' ? Math.round(Math.sin(tt * 0.45) * 2) : 0;
        ctx.fillStyle = '#20283c';
        ctx.fillRect(en.x, en.y + 2 + stomp, 14, 20);
        ctx.fillStyle = '#32415c';
        ctx.fillRect(en.x + 1, en.y + 3 + stomp, 12, 12);
        ctx.fillStyle = '#44577a';
        ctx.fillRect(en.x + 1, en.y + 3 + stomp, 12, 2);
        ctx.fillStyle = '#141b2c';
        ctx.fillRect(en.x + 4, en.y + 9 + stomp, 6, 5);
        ctx.fillStyle = '#223047';
        ctx.fillRect(en.x - 3, en.y + 8 + stomp, 4, 10);
        ctx.fillRect(en.x + 13, en.y + 8 + stomp, 4, 10);
        ctx.fillStyle = '#4d6289';
        ctx.fillRect(en.x - 3, en.y + 7 + stomp, 5, 3);
        ctx.fillRect(en.x + 12, en.y + 7 + stomp, 5, 3);
        ctx.fillStyle = '#131a29';
        ctx.fillRect(en.x + 2, en.y - 4 + stomp, 10, 7);
        ctx.fillStyle = warm > 0.5 ? '#fff0c2' : '#7fb4f0';
        ctx.fillRect(en.x + 4, en.y - 2 + stomp, 2, 2);
        ctx.fillRect(en.x + 8, en.y - 2 + stomp, 2, 2);
        const flare = Math.round(warm * 5);
        ctx.fillStyle = `rgba(255,${120 + Math.round(120 * warm)},60,${0.35 + warm * 0.5})`;
        ctx.fillRect(en.x + 4 - flare / 2, en.y + 8 + stomp - flare / 2, 6 + flare, 6 + flare);
        if (en.state === 'windup') {
          ctx.fillStyle = 'rgba(255,200,120,0.85)';
          ctx.fillRect(en.x + 4, en.y - 12, 6, 1);
          ctx.fillRect(en.x + 6, en.y - 14, 2, 2);
        }
        lights.push({ x: en.x + 7, y: en.y + 10, r: 30 + warm * 18, s: 0.5 + warm * 0.35, color: '255,150,70' });
      } else {
        drawDevourer(ctx, en.x + en.w / 2, en.y + en.h / 2, en.animT, en.hunting, en.satiated > 0);
        lights.push({ x: en.x + en.w / 2, y: en.y + en.h / 2, r: 36, s: 0.6, color: '200,80,255' });
      }
    }
    // Boss sprites and their attack projectiles.
    const boss = L.boss;
    if (boss && boss.active) {
      if (!boss.defeated || boss.timer > 0) {
        const fade = boss.defeated ? Math.max(0, boss.timer / 120) : 1;
        ctx.globalAlpha = fade;
        drawBoss(ctx, boss.kind, boss.x, boss.y, boss.w, boss.h, t + boss.animT, boss.state, boss.vulnerable, boss.phase, boss.facing);
        ctx.globalAlpha = 1;
        if (!boss.defeated) {
          lights.push({
            x: boss.x + boss.w / 2, y: boss.y + boss.h * 0.46, r: boss.kind === 'heartCore' ? 70 : 42,
            s: boss.vulnerable ? 0.92 : 0.65,
            color: boss.kind === 'rootMatriarch' ? '110,255,130' : boss.kind === 'forgeBehemoth' ? '255,120,55'
              : boss.kind === 'heartCore' ? '255,65,100' : '175,135,255',
          });
          if (boss.state === 'windup') {
            const y = boss.arena[3] - 1;
            const pulse = 0.5 + 0.5 * Math.sin(t * 0.5);
            ctx.globalAlpha = 0.35 + pulse * 0.4;
            ctx.fillStyle = boss.kind === 'forgeBehemoth' ? '#ff7b3e' : '#ff536f';
            const markerX = Math.max(boss.arena[0] + 8, Math.min(boss.arena[1] - 8, boss.targetX));
            ctx.fillRect(markerX - 5, y - 2, 10, 2);
            ctx.globalAlpha = 1;
          }
        }
        for (const shot of boss.projectiles) {
          drawBossProjectile(ctx, shot.x, shot.y, shot.radius, shot.action, t + shot.wobble * 20, boss.kind);
          lights.push({
            x: shot.x, y: shot.y, r: shot.action === 'wave' ? 26 : 17, s: 0.65,
            color: boss.kind === 'forgeBehemoth' ? '255,120,55' : boss.kind === 'rootMatriarch' ? '120,255,150' : '190,140,255',
          });
        }
      }
    }
    // player
    const p = g.player;
    if (!p.dead) {
      // contact shadow — fades with the distance to the ground below
      let drop = -1;
      for (let d = 0; d <= 28; d += 2) {
        const fy = p.y + p.h + d;
        if (g.solid(Math.floor((p.x + 2) / TILE), Math.floor(fy / TILE)) || g.solid(Math.floor((p.x + p.w - 2) / TILE), Math.floor(fy / TILE))) { drop = d; break; }
      }
      if (drop >= 0) {
        const k = 1 - drop / 28;
        const sw = Math.round(4 + 7 * k);
        ctx.globalAlpha = 0.34 * k;
        ctx.fillStyle = '#000000';
        const sy = Math.floor((p.y + p.h + drop) / TILE) * TILE;
        ctx.fillRect(Math.round(p.x + p.w / 2 - sw / 2), sy - 1, sw, 1);
        if (k > 0.55) ctx.fillRect(Math.round(p.x + p.w / 2 - sw / 2) + 1, sy - 2, sw - 2, 1);
        ctx.globalAlpha = 1;
      }
      const blink = p.invuln > 0 && p.hurtT === 0 && Math.floor(t / 4) % 2 === 0;
      if (!blink) {
        const isW = g.save.character === 'weaver';
        const pal = p.hurtT > 0 && Math.floor(t / 3) % 2 === 0 ? WHITE_PAL : isW ? WEAVER_PAL : PLAYER_PAL;
        const waking = g.mode === 'intro' ? Math.min(1, g.introFrame / 100) : 1;
        ctx.globalAlpha = p.dashT > 0 ? 0.82 : waking;
        drawCharacter(ctx, p.x + p.w / 2, p.y + p.h + (1 - waking) * 6, p.facing, p.anim, p.animT, pal, isW ? 'weaver' : 'hero');
        ctx.globalAlpha = 1;
      }
      const waking = g.mode === 'intro' ? Math.min(1, g.introFrame / 100) : 1;
      lights.push({ x: p.x + p.w / 2, y: p.y + p.h / 2, r: 34 + waking * 44, s: 0.25 + waking * 0.67, color: g.save.character === 'weaver' ? '255,180,120' : '140,220,255' });
      if (g.recording) {
        ctx.fillStyle = Math.floor(t / 15) % 2 === 0 ? '#ff4d6d' : '#8a1f33';
        ctx.fillRect(Math.round(p.x) + 3, Math.round(p.y) - 8, 4, 4);
      }
      if (g.prompt) {
        const bx = Math.round(p.x) - 1, by = Math.round(p.y) - 18;
        ctx.fillStyle = 'rgba(8,14,28,0.85)'; ctx.fillRect(bx, by, 12, 10);
        ctx.fillStyle = '#6ff3ff'; ctx.fillRect(bx, by, 12, 1); ctx.fillRect(bx, by + 9, 12, 1);
        ctx.font = '7px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff'; ctx.fillText('E', bx + 6, by + 5.5);
      }
    }
    // particles
    for (const pt of g.particles.list) {
      const a = pt.life / pt.max;
      ctx.globalAlpha = Math.min(1, a * 1.4);
      ctx.fillStyle = pt.color;
      const s = pt.shrink ? Math.max(1, Math.round(pt.size * a)) : pt.size;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), s, s);
      if (pt.glow && pt.size > 0) lights.push({ x: pt.x, y: pt.y, r: 6, s: 0.25 * a });
    }
    ctx.globalAlpha = 1;
    // water
    for (let ty = ty1; ty <= ty2; ty++) {
      for (let tx = tx1; tx <= tx2; tx++) {
        const i = ty * L.w + tx;
        if (L.tiles[i] !== T_WATER) continue;
        const px = tx * TILE, py = ty * TILE;
        const surface = L.tiles[i - L.w] !== T_WATER;
        ctx.fillStyle = surface ? 'rgba(16,68,112,0.78)' : 'rgba(5,20,44,0.9)';
        ctx.fillRect(px, py, TILE, TILE);
        if (surface) {
          const wave1 = Math.round(Math.sin(t * 0.09 + tx * 0.8) * 1.5);
          const wave2 = Math.round(Math.cos(t * 0.12 + tx * 1.1) * 1);
          ctx.fillStyle = 'rgba(160,240,255,0.65)';
          ctx.fillRect(px, py + 1 + wave1, TILE, 1);
          ctx.fillStyle = 'rgba(110,210,255,0.35)';
          ctx.fillRect(px, py + 2 + wave2, TILE, 1);
          if ((tx + Math.floor(t / 14)) % 3 === 0) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(px + 4 + wave1, py + wave1, 3, 1);
          }
        }
        const caustic = Math.sin(t * 0.06 + (tx + ty) * 0.7);
        if (caustic > 0.45) {
          ctx.fillStyle = `rgba(140,230,255,${(caustic - 0.45) * 0.22})`;
          ctx.fillRect(px + 2, py + 3, 12, 2);
        }
      }
    }
    // Each impact leaves a brief expanding ripple or a tiny wet glint on stone.
    for (const ripple of L.dripRipples) {
      if (ripple.x < camX - 14 || ripple.x > camX + w + 14 || ripple.y < camY - 8 || ripple.y > camY + h + 8) continue;
      const progress = 1 - ripple.life / ripple.max;
      const rx = Math.round(ripple.x), ry = Math.round(ripple.y);
      ctx.globalAlpha = (1 - progress) * (ripple.water ? 0.85 : 0.55);
      if (ripple.water) {
        ctx.strokeStyle = '#d3faff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(rx, ry + 2, 1 + progress * 7, 1 + progress * 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const width = 2 + Math.round(progress * 6);
        ctx.fillStyle = '#91cddd';
        ctx.fillRect(rx - Math.floor(width / 2), ry - 1, width, 1);
        if (progress < 0.3) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rx, ry - 2, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
    }
    // door timers (world text)
    ctx.font = '7px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (const d of L.doors) {
      if (d.timedLeft > 0) {
        const txt = d.timedLeft.toFixed(1);
        const x = d.x * TILE + 8, y = d.y * TILE - 6;
        ctx.fillStyle = 'rgba(8,14,28,0.8)'; ctx.fillRect(x - 16, y - 9, 32, 11);
        ctx.fillStyle = d.timedLeft < 1.5 ? '#ff7a6b' : '#ffb347';
        ctx.fillText(txt, x, y);
      }
    }
    for (const lv of L.levers) {
      if (lv.timed > 0 && lv.timer > 0) {
        const x = lv.x * TILE + 8, y = lv.y * TILE - 6;
        ctx.fillStyle = '#ffb347';
        ctx.fillText((lv.timer / 60).toFixed(1), x, y);
      }
    }
    ctx.restore();

    // lighting
    this.drawLights(ctx, lights, camX, camY, theme);
    // fog
    this.drawFog(ctx, camX, camY, t);
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0);
    // flashes & transitions
    if (g.flash > 0) { ctx.fillStyle = `rgba(200,240,255,${(g.flash / 18) * 0.6})`; ctx.fillRect(0, 0, w, h); }
    if (g.mode === 'dying' || g.mode === 'dead') { ctx.fillStyle = `rgba(0,0,0,${Math.min(0.65, g.deathT / 80 * 0.65)})`; ctx.fillRect(0, 0, w, h); }
    if (g.mode === 'transition' && g.transition) {
      const tt = g.transition.t;
      const a = tt < 40 ? tt / 40 : 1 - (tt - 40) / 40;
      ctx.fillStyle = `rgba(2,3,10,${Math.min(1, Math.max(0, a))})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (g.mode === 'victory') { ctx.fillStyle = 'rgba(2,3,10,0.6)'; ctx.fillRect(0, 0, w, h); }
  }

  private drawLayer(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, camX: number, camY: number, fx: number, fy: number) {
    const W = img.width;
    const ox = -((camX * fx) % W);
    const oy = Math.min(0, -(camY * fy) + (this.h - img.height) * 0.5);
    ctx.drawImage(img, Math.round(ox), Math.round(oy));
    ctx.drawImage(img, Math.round(ox + W), Math.round(oy));
    if (ox + W < this.w) ctx.drawImage(img, Math.round(ox + W * 2), Math.round(oy));
  }

  private drawLights(ctx: CanvasRenderingContext2D, lights: Light[], camX: number, camY: number, theme: Theme) {
    const lc = this.lctx;
    const w = this.w, h = this.h;
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, w, h);
    lc.fillStyle = DARK[theme];
    lc.fillRect(0, 0, w, h);
    lc.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const sx = l.x - camX, sy = l.y - camY;
      if (sx < -l.r || sy < -l.r || sx > w + l.r || sy > h + l.r) continue;
      const g = lc.createRadialGradient(sx, sy, 0, sx, sy, l.r);
      g.addColorStop(0, `rgba(0,0,0,${l.s})`);
      g.addColorStop(0.5, `rgba(0,0,0,${l.s * 0.45})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = g;
      lc.fillRect(sx - l.r, sy - l.r, l.r * 2, l.r * 2);
    }
    ctx.drawImage(this.light, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (!l.color) continue;
      const sx = l.x - camX, sy = l.y - camY;
      if (sx < -l.r || sy < -l.r || sx > w + l.r || sy > h + l.r) continue;
      const r = l.r * 0.9;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(${l.color},${0.16 * l.s})`);
      g.addColorStop(1, `rgba(${l.color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawFog(ctx: CanvasRenderingContext2D, camX: number, camY: number, t: number) {
    const w = this.w, h = this.h;
    for (let i = 0; i < 10; i++) {
      const speed = 0.08 + (i % 3) * 0.04;
      const span = w + 200;
      const x = ((i * 157 + t * speed - camX * 0.85) % span + span) % span - 100;
      const y = ((i * 97 + Math.sin(t * 0.004 + i) * 20 - camY * 0.9) % (h + 100) + (h + 100)) % (h + 100) - 50;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 0.01 + i);
      ctx.drawImage(this.fog, Math.round(x), Math.round(y), 240, 120);
    }
    ctx.globalAlpha = 1;
  }
}
