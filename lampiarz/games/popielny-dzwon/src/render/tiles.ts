// Tile art: the level is pre-rendered into 512px wide chunks the first time they
// come into view, and re-rendered when the level changes (broken walls, gate).
import { AIR, BREAKABLE, GATE, LEDGE, SOLID, SPIKES, T, type Level } from '../world/level';
import { paletteOf, type Scene } from './backdrop';
import { makeCanvas, mix, rgba, srand, type Ctx } from './paint';

const CHUNK = 16; // tiles per chunk

export class TileLayer {
  chunks = new Map<number, HTMLCanvasElement>();
  version = -1;
  level: Level | null = null;

  sync(level: Level) {
    if (level !== this.level || level.version !== this.version) {
      this.chunks.clear();
      this.level = level;
      this.version = level.version;
    }
  }

  draw(g: Ctx, camX: number, viewW: number, scene: Scene) {
    const lv = this.level;
    if (!lv) return;
    const first = Math.floor(camX / (CHUNK * T));
    const last = Math.floor((camX + viewW) / (CHUNK * T));
    for (let c = first; c <= last; c++) {
      if (c < 0 || c * CHUNK >= lv.w) continue;
      let cv = this.chunks.get(c);
      if (!cv) {
        cv = renderChunk(lv, c, scene);
        this.chunks.set(c, cv);
      }
      g.drawImage(cv, c * CHUNK * T, 0);
    }
  }
}

function solidish(t: number) {
  return t === SOLID || t === BREAKABLE;
}

function renderChunk(lv: Level, c: number, scene: Scene): HTMLCanvasElement {
  const pal = paletteOf(scene);
  const [cv, g] = makeCanvas(CHUNK * T, lv.h * T);
  const x0 = c * CHUNK;
  for (let ty = 0; ty < lv.h; ty++)
    for (let i = 0; i < CHUNK; i++) {
      const tx = x0 + i;
      if (tx >= lv.w) continue;
      const t = lv.tiles[ty * lv.w + tx];
      if (t === AIR) continue;
      const px = i * T;
      const py = ty * T;
      const d = lv.deco[ty * lv.w + tx];
      if (solidish(t)) solidTile(g, lv, tx, ty, px, py, d, pal, scene, t === BREAKABLE);
      else if (t === LEDGE) ledgeTile(g, px, py, d, pal, scene);
      else if (t === SPIKES) spikeTile(g, px, py, pal);
      else if (t === GATE) gateTile(g, px, py, pal);
    }
  // decorations on top of exposed floors
  for (let ty = 1; ty < lv.h; ty++)
    for (let i = 0; i < CHUNK; i++) {
      const tx = x0 + i;
      if (tx >= lv.w) continue;
      const t = lv.tiles[ty * lv.w + tx];
      const above = lv.tile(tx, ty - 1);
      if (solidish(t) && above === AIR) floorDeco(g, i * T, ty * T, lv.deco[ty * lv.w + tx], pal, scene);
      const below = lv.tile(tx, ty + 1);
      if (solidish(t) && below === AIR && ty + 1 < lv.h) ceilingDeco(g, i * T, (ty + 1) * T, lv.deco[ty * lv.w + tx], pal, scene);
    }
  return cv;
}

type Pal = ReturnType<typeof paletteOf>;

function solidTile(g: Ctx, lv: Level, tx: number, ty: number, px: number, py: number, d: number, pal: Pal, scene: Scene, breakable: boolean) {
  const up = solidish(lv.tile(tx, ty - 1)) || ty === 0;
  const down = solidish(lv.tile(tx, ty + 1)) || ty >= lv.h - 1;
  const left = solidish(lv.tile(tx - 1, ty));
  const right = solidish(lv.tile(tx + 1, ty));
  // depth: how far from an open face (dark interior reads as mass)
  let depth = 0;
  for (let k = 1; k <= 3; k++) if (solidish(lv.tile(tx, ty - k)) || ty - k < 0) depth++;
  const interior = up && down && left && right;
  const base = mix(pal.tile, pal.tileLo, interior ? 0.35 + depth * 0.12 : depth * 0.15);
  g.fillStyle = base;
  g.fillRect(px, py, T, T);

  // masonry pattern
  const r = srand(d * 7919 + tx * 31 + ty);
  g.fillStyle = mix(base, '#000', 0.35);
  if (scene === 'ogrod') {
    // irregular field stones
    g.fillRect(px, py + 15, T, 1);
    g.fillRect(px + 6 + (d % 14), py, 1, 15);
    g.fillRect(px + 2 + ((d >> 3) % 20), py + 16, 1, 16);
  } else if (scene === 'katedra') {
    // large ashlar blocks
    g.fillRect(px, py + (ty % 2 ? 0 : 31), T, 1);
    if ((tx + ty) % 2 === 0) g.fillRect(px, py, 1, T);
  } else {
    // brick courses
    const off = ty % 2 ? 0 : 16;
    g.fillRect(px, py + 10, T, 1);
    g.fillRect(px, py + 21, T, 1);
    g.fillRect(px + off, py, 1, 10);
    g.fillRect(px + ((off + 8) % 32), py + 11, 1, 10);
    g.fillRect(px + ((off + 24) % 32), py + 22, 1, 10);
  }
  // subtle per-block tint noise
  for (let k = 0; k < 3; k++) {
    g.fillStyle = rgba(r() < 0.5 ? '#000000' : pal.tileHi, 0.06 + r() * 0.06);
    g.fillRect(px + r() * 26, py + r() * 26, 4 + r() * 8, 3 + r() * 6);
  }
  if (breakable) {
    // hairline cracks — readable to an attentive eye
    g.strokeStyle = rgba('#000000', 0.55);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(px + 6, py + 4);
    g.lineTo(px + 14, py + 14);
    g.lineTo(px + 11, py + 22);
    g.lineTo(px + 20, py + 30);
    g.moveTo(px + 14, py + 14);
    g.lineTo(px + 25, py + 10);
    g.stroke();
  }
  // exposed faces: rim light on top, shade on the sides and below
  if (!up) {
    const cap = g.createLinearGradient(0, py, 0, py + 10);
    cap.addColorStop(0, pal.tileHi);
    cap.addColorStop(1, rgba(pal.tileHi, 0));
    g.fillStyle = cap;
    g.fillRect(px, py, T, 10);
    g.fillStyle = rgba(pal.rim, 0.55);
    g.fillRect(px, py, T, 1.5);
  }
  if (!left) {
    g.fillStyle = rgba(pal.rim, 0.18);
    g.fillRect(px, py, 2, T);
  }
  if (!right) {
    g.fillStyle = rgba('#000000', 0.35);
    g.fillRect(px + T - 3, py, 3, T);
  }
  if (!down) {
    g.fillStyle = rgba('#000000', 0.45);
    g.fillRect(px, py + T - 4, T, 4);
  }
}

function ledgeTile(g: Ctx, px: number, py: number, d: number, pal: Pal, scene: Scene) {
  if (scene === 'katedra' || scene === 'krypta') {
    // wooden planks with iron bands
    g.fillStyle = mix('#3a2618', pal.tile, 0.3);
    g.fillRect(px, py, T, 8);
    g.fillStyle = rgba('#000000', 0.4);
    g.fillRect(px + (d % 2 ? 15 : 0), py, 1, 8);
    g.fillStyle = rgba(pal.rim, 0.35);
    g.fillRect(px, py, T, 1);
    g.fillStyle = '#1a1210';
    g.fillRect(px + 4, py + 8, 3, 6);
    g.fillRect(px + T - 7, py + 8, 3, 6);
  } else {
    // stone slab on brackets
    g.fillStyle = pal.tile;
    g.fillRect(px, py, T, 9);
    g.fillStyle = rgba(pal.rim, 0.5);
    g.fillRect(px, py, T, 1.5);
    g.fillStyle = rgba('#000000', 0.4);
    g.fillRect(px, py + 7, T, 2);
    if (d % 3 === 0) {
      g.fillStyle = pal.tileLo;
      g.beginPath();
      g.moveTo(px + 10, py + 9);
      g.lineTo(px + 22, py + 9);
      g.lineTo(px + 16, py + 18);
      g.fill();
    }
  }
}

function spikeTile(g: Ctx, px: number, py: number, pal: Pal) {
  g.fillStyle = mix(pal.tileLo, '#000', 0.3);
  g.fillRect(px, py + 26, T, 6);
  for (let i = 0; i < 4; i++) {
    const x = px + 4 + i * 8;
    g.fillStyle = '#4a4a50';
    g.beginPath();
    g.moveTo(x - 3, py + 27);
    g.lineTo(x, py + 10 + (i % 2) * 4);
    g.lineTo(x + 3, py + 27);
    g.fill();
    g.fillStyle = 'rgba(200,190,180,0.6)';
    g.fillRect(x - 0.5, py + 12 + (i % 2) * 4, 1, 8);
  }
  g.fillStyle = 'rgba(120,20,20,0.5)';
  g.fillRect(px + 10, py + 18, 2, 4);
}

function gateTile(g: Ctx, px: number, py: number, pal: Pal) {
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(px, py, T, T);
  g.fillStyle = '#2b2a2e';
  for (let i = 0; i < 3; i++) g.fillRect(px + 4 + i * 10, py, 4, T);
  g.fillRect(px, py + 12, T, 4);
  g.fillStyle = rgba(pal.rim, 0.35);
  for (let i = 0; i < 3; i++) g.fillRect(px + 4 + i * 10, py, 1, T);
}

function floorDeco(g: Ctx, px: number, py: number, d: number, pal: Pal, scene: Scene) {
  const r = srand(d * 131 + px);
  if (scene === 'ogrod') {
    // moss and grass blades
    g.fillStyle = mix('#2f4a2c', pal.tileHi, 0.2);
    g.fillRect(px, py - 1, T, 3);
    for (let i = 0; i < 7; i++) {
      const x = px + r() * T;
      const h = 3 + r() * 8;
      g.fillStyle = r() < 0.5 ? '#3f6a3a' : '#2c4a2a';
      g.beginPath();
      g.moveTo(x - 1.5, py + 1);
      g.lineTo(x + (r() - 0.5) * 4, py - h);
      g.lineTo(x + 1.5, py + 1);
      g.fill();
    }
  } else if (scene === 'rynek') {
    // ash drifts
    g.fillStyle = 'rgba(170,165,160,0.35)';
    g.beginPath();
    g.ellipse(px + 16, py + 1, 16, 3, 0, Math.PI, 0);
    g.fill();
  } else if (scene === 'katedra') {
    g.fillStyle = 'rgba(120,90,70,0.25)';
    g.fillRect(px, py, T, 2);
  }
  // occasional props: bones, skulls, candles, rubble
  const k = d % 23;
  if (k === 0) {
    // skull
    g.fillStyle = '#b7ad98';
    g.beginPath();
    g.arc(px + 12, py - 4, 4.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1b1612';
    g.fillRect(px + 9.5, py - 5, 2, 2);
    g.fillRect(px + 13, py - 5, 2, 2);
  } else if (k === 1) {
    // melted candles
    for (let i = 0; i < 3; i++) {
      const x = px + 6 + i * 7;
      const h = 4 + r() * 8;
      g.fillStyle = '#d9cdb0';
      g.fillRect(x, py - h, 3, h);
      g.fillStyle = 'rgba(255,190,90,0.9)';
      g.fillRect(x + 1, py - h - 3, 1, 3);
    }
  } else if (k === 2 || k === 3) {
    // rubble
    g.fillStyle = pal.tileLo;
    for (let i = 0; i < 4; i++) g.fillRect(px + r() * 26, py - 2 - r() * 3, 3 + r() * 4, 3 + r() * 2);
  } else if (k === 4) {
    // long bone
    g.strokeStyle = '#a99f8a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px + 4, py - 2);
    g.lineTo(px + 20, py - 4);
    g.stroke();
  }
}

function ceilingDeco(g: Ctx, px: number, py: number, d: number, pal: Pal, scene: Scene) {
  const r = srand(d * 977 + px);
  if (scene === 'ogrod') {
    g.strokeStyle = '#2c4a2a';
    g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const x = px + r() * T;
      g.beginPath();
      g.moveTo(x, py);
      g.quadraticCurveTo(x + 3, py + 8, x - 1, py + 6 + r() * 18);
      g.stroke();
    }
  } else if (d % 5 === 0) {
    // cobweb in the corner / dripping wax
    g.strokeStyle = 'rgba(200,200,200,0.12)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + 14, py + 12);
    g.moveTo(px + 6, py);
    g.lineTo(px + 10, py + 14);
    g.stroke();
  } else if (d % 7 === 0 && scene === 'katedra') {
    g.fillStyle = mix(pal.tile, '#d9cdb0', 0.4);
    g.fillRect(px + 12, py, 3, 6 + (d % 5));
  }
}
