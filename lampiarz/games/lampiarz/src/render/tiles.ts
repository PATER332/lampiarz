// Pre-renders the static part of a district (streets, houses, props) into an
// offscreen canvas once per district / resize. Everything here is drawn once,
// so it can afford a lot of detail without costing any frame time.

import { THEMES } from '../game/content';
import type { District, ThemeId } from '../game/types';
import { TILE_WALL } from '../game/types';

export interface Prerendered {
  canvas: HTMLCanvasElement;
  /** lit / unlit windows in CSS pixels relative to the map origin */
  windows: { x: number; y: number; w: number; h: number; lit: boolean; phase: number; small?: boolean; arch?: boolean }[];
  /** chimney tops (tile units) — the renderer lets them smoke */
  chimneys: { x: number; y: number }[];
  tile: number;
}

type Ctx = CanvasRenderingContext2D;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex: string, amt: number): string {
  const [r, g, b] = rgb(hex);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function mix(a: string, b: string, k: number, amt = 0): string {
  const A = rgb(a);
  const B = rgb(b);
  const f = (i: number) => Math.max(0, Math.min(255, Math.round(A[i] + (B[i] - A[i]) * k + amt)));
  return `rgb(${f(0)},${f(1)},${f(2)})`;
}
function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}
function hash(a: number, b: number, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 1000;
}
function ell(c: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

/** Roof colours per theme: each house picks one. */
const ROOFS: Record<ThemeId, string[]> = {
  stare: ['#6a3328', '#7a3d2c', '#5c2f2a', '#6e4a36', '#4f3a33'],
  port: ['#2a3a48', '#3c4a5c', '#5a3a32', '#46505e', '#22303c'],
  cmentarz: ['#3f4244', '#4a4b4b', '#36393b', '#444036'],
  fabryka: ['#5a3624', '#4a3c34', '#6a4028', '#3e3632'],
  ogrod: ['#2d4a33', '#3a5236', '#4a4a2c', '#2a3f2e'],
  latarnia: ['#2a3550', '#3c4a62', '#5a3a36', '#45475a'],
};
/** Facade plaster colours per theme. */
const PLASTER: Record<ThemeId, string[]> = {
  stare: ['#7a6450', '#856c55', '#6e5a4a', '#8a7358', '#735548'],
  port: ['#4a5a60', '#53636a', '#5b5b55', '#46555b'],
  cmentarz: ['#5a5c58', '#64655f', '#55574f'],
  fabryka: ['#6a4634', '#5e3e30', '#71503a'],
  ogrod: ['#5d6a50', '#66704f', '#576449'],
  latarnia: ['#4e5668', '#596173', '#4a5162'],
};

const LEAVES: Record<ThemeId, string[]> = {
  stare: ['#8a5a2a', '#a0672c', '#6f4a26', '#9a7a3a'],
  port: ['#5b6a5a', '#4a5a4a'],
  cmentarz: ['#7a5a2a', '#8a4a26', '#6a6a30', '#9a6a2c'],
  fabryka: ['#5a4630', '#4a3a2a'],
  ogrod: ['#8aa04a', '#a0b05a', '#c7b56a', '#b05a6a'],
  latarnia: ['#6a6a5a'],
};

export function prerender(d: District, tile: number, dpr: number): Prerendered {
  const theme = d.theme;
  const pal = THEMES[theme].palette;
  const T = Math.round(tile * dpr);
  const canvas = document.createElement('canvas');
  canvas.width = d.w * T;
  canvas.height = d.h * T;
  const c = canvas.getContext('2d')!;
  const wall = (x: number, y: number) => x < 0 || y < 0 || x >= d.w || y >= d.h || d.tiles[y * d.w + x] === TILE_WALL;
  const isPillar = (x: number, y: number) => wall(x, y) && !wall(x, y - 1) && !wall(x, y + 1) && !wall(x - 1, y) && !wall(x + 1, y);
  const windows: Prerendered['windows'] = [];
  const chimneys: Prerendered['chimneys'] = [];
  const lw = (k: number) => Math.max(1, T * k);

  c.fillStyle = pal.joint;
  c.fillRect(0, 0, canvas.width, canvas.height);

  // ======================================================== streets
  for (let y = 0; y < d.h; y++) {
    for (let x = 0; x < d.w; x++) {
      const pillar = isPillar(x, y);
      if (wall(x, y) && !pillar) continue;
      const px = x * T;
      const py = y * T;
      const deco = d.deco[y * d.w + x];
      const r = rand(deco * 7919 + x * 31 + y * 17 + 1);
      const underFacade = wall(x, y - 1) && !isPillar(x, y - 1);
      drawGround(c, theme, pal, px, py, T, r, x, y, deco);

      // pavement along house fronts: flat slabs and a kerb
      if (underFacade && theme !== 'ogrod' && theme !== 'cmentarz') {
        const sh = T * 0.24;
        c.fillStyle = shade(pal.floorAlt, 6);
        c.fillRect(px, py, T, sh);
        c.strokeStyle = 'rgba(0,0,0,0.3)';
        c.lineWidth = lw(0.012);
        for (let k = 0; k < 3; k++) {
          const sx = px + ((k + (x % 2) * 0.5) * T) / 2.5;
          c.beginPath();
          c.moveTo(sx, py);
          c.lineTo(sx, py + sh);
          c.stroke();
        }
        c.fillStyle = 'rgba(255,255,255,0.06)';
        c.fillRect(px, py + sh - T * 0.045, T, T * 0.02);
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(px, py + sh - T * 0.02, T, T * 0.03);
        // drain grate in the gutter
        if (deco % 13 === 5) {
          const gx = px + T * 0.3;
          const gy = py + sh + T * 0.01;
          c.fillStyle = '#15161a';
          c.fillRect(gx, gy, T * 0.4, T * 0.1);
          c.fillStyle = '#3a3c42';
          for (let k = 0; k < 6; k++) c.fillRect(gx + T * 0.02 + k * T * 0.064, gy + T * 0.015, T * 0.025, T * 0.07);
        }
      }

      // manhole cover
      if (deco % 47 === 13 && !underFacade && !wall(x, y + 1) && theme !== 'ogrod' && theme !== 'cmentarz') {
        const mx = px + T * 0.5;
        const my = py + T * 0.55;
        ell(c, mx, my, T * 0.24, T * 0.16);
        c.fillStyle = '#1e1f23';
        c.fill();
        ell(c, mx, my, T * 0.2, T * 0.13);
        c.fillStyle = '#34363c';
        c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.5)';
        c.lineWidth = lw(0.012);
        for (let k = -2; k <= 2; k++) {
          c.beginPath();
          c.moveTo(mx - T * 0.16, my + k * T * 0.045);
          c.lineTo(mx + T * 0.16, my + k * T * 0.045);
          c.stroke();
        }
        c.fillStyle = 'rgba(255,255,255,0.08)';
        ell(c, mx - T * 0.05, my - T * 0.06, T * 0.08, T * 0.025);
        c.fill();
      }

      // puddles: dark mirror with a cold sky reflection and a rim
      if (deco % 29 === 3 && theme !== 'ogrod') {
        const pxm = px + T * (0.35 + r() * 0.3);
        const pym = py + T * (0.5 + r() * 0.2);
        const rx = T * (0.22 + r() * 0.14);
        const ry = rx * 0.45;
        ell(c, pxm, pym, rx * 1.08, ry * 1.15);
        c.fillStyle = 'rgba(0,0,0,0.28)';
        c.fill();
        const g = c.createLinearGradient(pxm, pym - ry, pxm, pym + ry);
        g.addColorStop(0, 'rgba(70,86,120,0.75)');
        g.addColorStop(1, 'rgba(18,22,34,0.85)');
        ell(c, pxm, pym, rx, ry);
        c.fillStyle = g;
        c.fill();
        c.fillStyle = 'rgba(190,205,235,0.22)';
        ell(c, pxm - rx * 0.3, pym - ry * 0.35, rx * 0.4, ry * 0.18);
        c.fill();
      }

      drawLitter(c, theme, px, py, T, r, deco, underFacade);

      // ambient occlusion along walls
      if (wall(x, y - 1)) {
        const g = c.createLinearGradient(0, py, 0, py + T * 0.5);
        g.addColorStop(0, 'rgba(0,0,0,0.55)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(px, py, T, T * 0.5);
      }
      if (wall(x - 1, y)) {
        const g = c.createLinearGradient(px, 0, px + T * 0.3, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.4)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(px, py, T * 0.3, T);
      }
      if (wall(x + 1, y)) {
        const g = c.createLinearGradient(px + T, 0, px + T * 0.7, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.4)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(px + T * 0.7, py, T * 0.3, T);
      }
      if (wall(x, y + 1) && !isPillar(x, y + 1)) {
        // the roof edge of the house below throws a little shade
        const g = c.createLinearGradient(0, py + T, 0, py + T * 0.82);
        g.addColorStop(0, 'rgba(0,0,0,0.3)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(px, py + T * 0.82, T, T * 0.18);
      }
    }
  }

  // ======================================================== houses
  // vertical extent of each wall run (for pitched roofs with a ridge in the middle)
  const runTop = new Int16Array(d.w * d.h);
  const runBot = new Int16Array(d.w * d.h);
  for (let x = 0; x < d.w; x++) {
    let y = 0;
    while (y < d.h) {
      if (!wall(x, y) || isPillar(x, y)) {
        y++;
        continue;
      }
      const y0 = y;
      while (y < d.h && wall(x, y) && !isPillar(x, y)) y++;
      for (let k = y0; k < y; k++) {
        runTop[k * d.w + x] = y0;
        runBot[k * d.w + x] = y - 1;
      }
    }
  }
  // houses: horizontal splits every 2–4 tiles, stable per wall run
  const splitAt = (x: number, y: number) => x % 4 === 0 || hash(x, runTop[y * d.w + x], d.seed) % 3 === 0;
  const houseStart = (x: number, y: number) => {
    let sx = x;
    while (sx > 0 && !splitAt(sx, y) && wall(sx - 1, y) && !isPillar(sx - 1, y)) sx--;
    return sx;
  };
  const houseId = (x: number, y: number) => hash(houseStart(x, y), runTop[y * d.w + x], d.seed + 7);
  const boundaryLeft = (x: number, y: number) => x > 0 && wall(x - 1, y) && !isPillar(x - 1, y) && splitAt(x, y);

  for (let y = 0; y < d.h; y++) {
    for (let x = 0; x < d.w; x++) {
      if (!wall(x, y)) continue;
      const px = x * T;
      const py = y * T;
      const deco = d.deco[y * d.w + x];
      const r = rand(deco * 104729 + x * 13 + y * 7 + 3);
      if (isPillar(x, y)) {
        drawProp(c, theme, pal, px, py, T, r, deco);
        continue;
      }
      const hid = houseId(x, y);
      const roofCol = ROOFS[theme][hid % ROOFS[theme].length];
      const plaster = PLASTER[theme][(hid >> 3) % PLASTER[theme].length];
      const facade = !wall(x, y + 1) && y + 1 < d.h;
      const top = runTop[y * d.w + x];
      const bot = runBot[y * d.w + x];
      const ridge = (top + bot + 1) / 2; // tile units
      const roofH = facade ? T * 0.4 : T;
      // ---- roof: two slopes meeting at the ridge
      const north = (yy: number) => yy / T < ridge; // pixel row in tile units
      for (let band = 0; band < 2; band++) {
        const y0 = band === 0 ? py : Math.max(py, Math.min(py + roofH, ridge * T));
        const y1 = band === 0 ? Math.min(py + roofH, Math.max(py, ridge * T)) : py + roofH;
        if (y1 <= y0) continue;
        const isNorth = band === 0;
        const g = c.createLinearGradient(0, isNorth ? top * T : ridge * T, 0, isNorth ? ridge * T : (bot + 1) * T);
        if (isNorth) {
          g.addColorStop(0, shade(roofCol, -18));
          g.addColorStop(1, shade(roofCol, 26));
        } else {
          g.addColorStop(0, shade(roofCol, 0));
          g.addColorStop(1, shade(roofCol, -30));
        }
        c.fillStyle = g;
        c.fillRect(px, y0, T, y1 - y0);
      }
      // shingles / slates / metal sheets
      const metal = theme === 'fabryka' && hid % 3 === 0;
      const thatch = theme === 'ogrod' && hid % 3 === 0;
      if (metal) {
        c.strokeStyle = 'rgba(0,0,0,0.3)';
        c.lineWidth = lw(0.014);
        for (let k = 0; k < 6; k++) {
          const xx = px + (k + 0.5) * (T / 6);
          c.beginPath();
          c.moveTo(xx, py);
          c.lineTo(xx, py + roofH);
          c.stroke();
        }
        c.fillStyle = 'rgba(255,255,255,0.05)';
        for (let k = 0; k < 6; k++) c.fillRect(px + k * (T / 6) + T * 0.02, py, T * 0.02, roofH);
        if (deco % 5 === 0) {
          c.fillStyle = 'rgba(150,70,30,0.35)';
          ell(c, px + T * (0.2 + r() * 0.6), py + roofH * (0.3 + r() * 0.4), T * 0.14, T * 0.08);
          c.fill();
        }
      } else if (thatch) {
        c.strokeStyle = 'rgba(30,24,10,0.35)';
        c.lineWidth = lw(0.012);
        for (let k = 0; k < 26; k++) {
          const xx = px + r() * T;
          const yy = py + r() * roofH;
          c.beginPath();
          c.moveTo(xx, yy);
          c.lineTo(xx + T * 0.02, yy + T * 0.1);
          c.stroke();
        }
      } else {
        const rowH = T * (theme === 'stare' || theme === 'fabryka' ? 0.125 : 0.1);
        const sw = T * (theme === 'stare' ? 0.125 : 0.11);
        let row = 0;
        for (let yy = py - ((py / rowH) % 1) * rowH; yy < py + roofH; yy += rowH, row++) {
          const absRow = Math.round(yy / rowH);
          const off = absRow % 2 ? sw / 2 : 0;
          const nr = north(yy + rowH / 2);
          for (let xx = px - sw + off; xx < px + T; xx += sw) {
            const h = hash(Math.round(xx / sw), absRow, hid);
            const v = (h % 18) - 9;
            const x0 = Math.max(px, xx + T * 0.008);
            const x1 = Math.min(px + T, xx + sw - T * 0.008);
            const yA = Math.max(py, yy);
            const yB = Math.min(py + roofH, yy + rowH);
            if (x1 <= x0 || yB <= yA) continue;
            c.fillStyle = h % 97 === 0 ? 'rgba(10,8,8,0.3)' : `rgba(${v > 0 ? 255 : 0},${v > 0 ? 240 : 0},${v > 0 ? 220 : 0},${Math.abs(v) / 120})`;
            c.fillRect(x0, yA, x1 - x0, yB - yA);
            // rounded lower edge (scalloped tiles) on the clay roofs
            if (theme === 'stare' && yB - yA > rowH * 0.6) {
              c.fillStyle = 'rgba(0,0,0,0.18)';
              c.fillRect(x0, yB - T * 0.02, x1 - x0, T * 0.02);
            }
          }
          // course line: shadow on the sunny slope is below, on the far slope above
          c.fillStyle = nr ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.38)';
          if (yy > py) c.fillRect(px, yy - lw(0.01), T, lw(0.022));
          c.fillStyle = 'rgba(255,255,255,0.045)';
          if (yy + lw(0.016) > py && yy + lw(0.016) < py + roofH) c.fillRect(px, yy + lw(0.01), T, lw(0.01));
          // vertical joints (faint: roofs read as rows, streets as setts)
          c.fillStyle = theme === 'stare' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)';
          for (let xx = px - sw + off; xx < px + T; xx += sw) {
            const yA = Math.max(py, yy);
            const yB = Math.min(py + roofH, yy + rowH);
            if (xx > px && xx < px + T && yB > yA) c.fillRect(xx, yA, lw(0.01), yB - yA);
          }
        }
      }
      // ridge cap
      if (ridge * T > py && ridge * T < py + roofH && bot > top) {
        const ry = ridge * T;
        c.fillStyle = shade(roofCol, -34);
        c.fillRect(px, ry - T * 0.035, T, T * 0.07);
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.fillRect(px, ry - T * 0.035, T, T * 0.015);
        if (theme === 'stare' || theme === 'fabryka') {
          c.fillStyle = 'rgba(0,0,0,0.25)';
          for (let k = 0; k < 5; k++) c.fillRect(px + k * T * 0.2 + T * 0.18, ry - T * 0.035, lw(0.012), T * 0.07);
        }
      }
      // moss patches and lichen on old roofs
      if (deco % 7 === 0 && !metal) {
        for (let k = 0; k < 5; k++) {
          c.fillStyle = `rgba(${70 + Math.floor(r() * 30)},${95 + Math.floor(r() * 30)},${55 + Math.floor(r() * 15)},0.3)`;
          ell(c, px + T * (0.15 + r() * 0.7), py + roofH * (0.2 + r() * 0.7), T * (0.05 + r() * 0.08), T * (0.03 + r() * 0.03));
          c.fill();
        }
      }
      // party walls between houses: a raised parapet with a lit top
      if (boundaryLeft(x, y)) {
        c.fillStyle = shade(pal.wallTrim, 10);
        c.fillRect(px - T * 0.035, py, T * 0.07, roofH);
        c.fillStyle = 'rgba(255,255,255,0.1)';
        c.fillRect(px - T * 0.035, py, T * 0.025, roofH);
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(px + T * 0.035, py, T * 0.05, roofH);
      }
      // roof furniture on interior tiles: chimneys, dormers, skylights, vents
      if (!facade && y > top) {
        const f = hash(x, y, d.seed + 3) % 100;
        const onSouth = (y + 0.5) > ridge;
        if (f < 9) {
          drawChimney(c, pal, px, py, T, r, theme);
          chimneys.push({ x: x + 0.62, y: y + 0.08 });
        } else if (f < 15 && onSouth && theme !== 'fabryka') {
          // dormer window facing the street side
          const dx = px + T * 0.28;
          const dy = py + T * 0.22;
          c.fillStyle = 'rgba(0,0,0,0.3)';
          c.fillRect(dx - T * 0.02, dy + T * 0.42, T * 0.5, T * 0.06);
          c.fillStyle = shade(plaster, -10);
          c.fillRect(dx, dy + T * 0.12, T * 0.44, T * 0.32);
          c.fillStyle = shade(roofCol, -10);
          c.beginPath();
          c.moveTo(dx - T * 0.05, dy + T * 0.14);
          c.lineTo(dx + T * 0.22, dy - T * 0.04);
          c.lineTo(dx + T * 0.49, dy + T * 0.14);
          c.closePath();
          c.fill();
          c.fillStyle = '#0d0f16';
          c.fillRect(dx + T * 0.12, dy + T * 0.18, T * 0.2, T * 0.2);
          windows.push({ x: (dx + T * 0.12) / dpr, y: (dy + T * 0.18) / dpr, w: (T * 0.2) / dpr, h: (T * 0.2) / dpr, lit: deco % 3 === 0, phase: (deco % 13) * 0.5, small: true });
        } else if (f < 20 && !onSouth) {
          // skylight
          c.fillStyle = '#1a1f2c';
          c.fillRect(px + T * 0.3, py + T * 0.3, T * 0.36, T * 0.26);
          c.fillStyle = 'rgba(150,170,210,0.22)';
          c.fillRect(px + T * 0.32, py + T * 0.32, T * 0.12, T * 0.22);
          c.strokeStyle = shade(pal.wallTrim, 6);
          c.lineWidth = lw(0.025);
          c.strokeRect(px + T * 0.3, py + T * 0.3, T * 0.36, T * 0.26);
          c.beginPath();
          c.moveTo(px + T * 0.48, py + T * 0.3);
          c.lineTo(px + T * 0.48, py + T * 0.56);
          c.stroke();
        } else if (f < 24) {
          // vent pipe with a little hat
          c.fillStyle = 'rgba(0,0,0,0.35)';
          ell(c, px + T * 0.58, py + T * 0.62, T * 0.1, T * 0.04);
          c.fill();
          c.fillStyle = '#4a4d55';
          c.fillRect(px + T * 0.52, py + T * 0.38, T * 0.1, T * 0.24);
          c.fillStyle = '#5c606a';
          c.fillRect(px + T * 0.48, py + T * 0.34, T * 0.18, T * 0.05);
        } else if (f < 26 && theme !== 'fabryka') {
          // a sleeping cat on the roof
          c.fillStyle = '#121216';
          ell(c, px + T * 0.5, py + T * 0.55, T * 0.13, T * 0.07);
          c.fill();
          ell(c, px + T * 0.38, py + T * 0.5, T * 0.06, T * 0.055);
          c.fill();
          c.beginPath();
          c.moveTo(px + T * 0.34, py + T * 0.47);
          c.lineTo(px + T * 0.35, py + T * 0.42);
          c.lineTo(px + T * 0.38, py + T * 0.46);
          c.moveTo(px + T * 0.39, py + T * 0.46);
          c.lineTo(px + T * 0.42, py + T * 0.42);
          c.lineTo(px + T * 0.43, py + T * 0.48);
          c.fill();
          c.strokeStyle = '#121216';
          c.lineWidth = lw(0.025);
          c.beginPath();
          c.moveTo(px + T * 0.62, py + T * 0.57);
          c.quadraticCurveTo(px + T * 0.72, py + T * 0.62, px + T * 0.7, py + T * 0.5);
          c.stroke();
        }
      }
      // roof edges against the street
      if (!wall(x, y - 1)) {
        c.fillStyle = shade(pal.wallTrim, 4);
        c.fillRect(px, py, T, T * 0.06);
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.fillRect(px, py, T, T * 0.015);
      }
      if (!wall(x - 1, y)) {
        c.fillStyle = shade(pal.wallTrim, 4);
        c.fillRect(px, py, T * 0.06, roofH);
        c.fillStyle = 'rgba(255,255,255,0.07)';
        c.fillRect(px, py, T * 0.015, roofH);
      }
      if (!wall(x + 1, y)) {
        c.fillStyle = shade(pal.wallTrim, -4);
        c.fillRect(px + T * 0.94, py, T * 0.06, roofH);
      }

      if (facade) drawFacade(c, theme, pal, plaster, px, py + roofH, T, T - roofH, r, deco, hid, boundaryLeft(x, y), windows, dpr);
    }
  }
  return { canvas, windows, chimneys, tile };
}

// ---------------------------------------------------------------- ground
function drawGround(c: Ctx, theme: ThemeId, pal: { floor: string; floorAlt: string; joint: string }, px: number, py: number, T: number, r: () => number, x: number, y: number, deco: number) {
  const lw = (k: number) => Math.max(1, T * k);
  const flag = theme === 'cmentarz' || theme === 'latarnia' || (theme === 'ogrod' && deco % 3 === 0);
  const gravel = theme === 'ogrod' && !flag;
  const planks = theme === 'port' && deco < 46;
  if (planks) {
    // weathered boardwalk
    const n = 4;
    for (let k = 0; k < n; k++) {
      const v = Math.floor(r() * 16) - 8;
      c.fillStyle = mix('#3a3026', '#2e3638', 0.4, v);
      c.fillRect(px, py + (k * T) / n + T * 0.01, T, T / n - T * 0.02);
      c.fillStyle = 'rgba(255,255,255,0.05)';
      c.fillRect(px, py + (k * T) / n + T * 0.01, T, T * 0.012);
      c.fillStyle = 'rgba(0,0,0,0.25)';
      const seam = px + ((hash(x, y, k) % 100) / 100) * T;
      c.fillRect(seam, py + (k * T) / n, lw(0.012), T / n);
      // nails
      c.fillStyle = 'rgba(20,20,22,0.7)';
      c.fillRect(seam + T * 0.03, py + (k * T) / n + T * 0.05, lw(0.016), lw(0.016));
      c.fillRect(seam + T * 0.03, py + ((k + 1) * T) / n - T * 0.07, lw(0.016), lw(0.016));
      // grain
      c.strokeStyle = 'rgba(0,0,0,0.12)';
      c.lineWidth = lw(0.008);
      c.beginPath();
      c.moveTo(px, py + (k + 0.5) * (T / n));
      c.bezierCurveTo(px + T * 0.3, py + (k + 0.4) * (T / n), px + T * 0.6, py + (k + 0.6) * (T / n), px + T, py + (k + 0.5) * (T / n));
      c.stroke();
    }
    return;
  }
  if (gravel) {
    c.fillStyle = shade(pal.floorAlt, 10);
    c.fillRect(px, py, T, T);
    for (let k = 0; k < 40; k++) {
      const v = Math.floor(r() * 50) - 25;
      c.fillStyle = shade(pal.floorAlt, v + 12);
      ell(c, px + r() * T, py + r() * T, T * (0.012 + r() * 0.02), T * (0.01 + r() * 0.014));
      c.fill();
    }
    // grass edges
    for (let k = 0; k < 10; k++) {
      c.fillStyle = `rgba(${70 + Math.floor(r() * 30)},${110 + Math.floor(r() * 40)},60,0.6)`;
      const gx = px + r() * T;
      const gy = py + (r() < 0.5 ? r() * T * 0.12 : T - r() * T * 0.12);
      c.fillRect(gx, gy - T * 0.05, lw(0.016), T * 0.06);
    }
    return;
  }
  if (flag) {
    // large irregular flagstones
    const cuts = [0, 0.38 + (hash(x, y) % 20) / 100, 1];
    const vcut = 0.45 + (hash(y, x) % 20) / 100;
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        const x0 = px + (j === 0 ? 0 : vcut * T) + T * 0.025;
        const x1 = px + (j === 0 ? vcut * T : T) - T * 0.025;
        const y0 = py + cuts[i] * T + T * 0.025;
        const y1 = py + cuts[i + 1] * T - T * 0.025;
        const v = Math.floor(r() * 16) - 8;
        c.fillStyle = shade(r() < 0.5 ? pal.floor : pal.floorAlt, v + 4);
        c.beginPath();
        c.roundRect(x0, y0, x1 - x0, y1 - y0, T * 0.04);
        c.fill();
        const g = c.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(255,255,255,0.08)');
        g.addColorStop(0.5, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.2)');
        c.fillStyle = g;
        c.beginPath();
        c.roundRect(x0, y0, x1 - x0, y1 - y0, T * 0.04);
        c.fill();
        for (let k = 0; k < 5; k++) {
          c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.04)';
          c.fillRect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), lw(0.02), lw(0.02));
        }
      }
    // grass in the joints
    const grassy = theme !== 'latarnia' || deco % 3 === 0;
    if (grassy)
      for (let k = 0; k < 7; k++) {
        c.fillStyle = `rgba(${60 + Math.floor(r() * 30)},${90 + Math.floor(r() * 40)},${45 + Math.floor(r() * 20)},0.6)`;
        const onV = r() < 0.5;
        const gx = onV ? px + vcut * T + (r() - 0.5) * T * 0.04 : px + r() * T;
        const gy = onV ? py + r() * T : py + cuts[1] * T + (r() - 0.5) * T * 0.04;
        c.fillRect(gx, gy - T * 0.04, lw(0.014), T * 0.05);
      }
    if (theme === 'latarnia' && deco % 4 === 1) {
      // sand drifts
      c.fillStyle = 'rgba(170,150,110,0.18)';
      ell(c, px + T * 0.5, py + T * 0.6, T * 0.4, T * 0.15, 0.3);
      c.fill();
    }
    return;
  }
  // cobbles: four staggered rows of rounded setts
  const rows = 4;
  const sh = T / rows;
  for (let row = 0; row < rows; row++) {
    const off = (row + y) % 2 ? sh * 0.5 : 0;
    for (let col = -1; col <= rows; col++) {
      const sx = px + col * sh + off;
      const sy = py + row * sh;
      const v = Math.floor(r() * 14) - 7;
      const missing = deco % 53 === 7 && row === 2 && col === 1;
      const inset = T * 0.022;
      const x0 = Math.max(px, sx + inset);
      const x1 = Math.min(px + T, sx + sh - inset);
      if (x1 <= x0) continue;
      const yTop = sy + inset;
      const hh = sh - inset * 2;
      if (missing) {
        c.fillStyle = 'rgba(40,30,22,0.9)';
        c.beginPath();
        c.roundRect(x0, yTop, x1 - x0, hh, T * 0.04);
        c.fill();
        continue;
      }
      c.fillStyle = shade(r() < 0.5 ? pal.floor : pal.floorAlt, v);
      c.beginPath();
      c.roundRect(x0, yTop, x1 - x0, hh, T * 0.05);
      c.fill();
      // domed top: light from the moon (upper left), shade lower right
      const cx = (x0 + x1) / 2;
      const g = c.createRadialGradient(cx - (x1 - x0) * 0.18, yTop + hh * 0.3, 0, cx, yTop + hh * 0.5, (x1 - x0) * 0.75);
      g.addColorStop(0, 'rgba(255,255,255,0.11)');
      g.addColorStop(0.55, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.24)');
      c.fillStyle = g;
      c.beginPath();
      c.roundRect(x0, yTop, x1 - x0, hh, T * 0.05);
      c.fill();
      if (r() < 0.25) {
        c.fillStyle = 'rgba(0,0,0,0.14)';
        c.fillRect(x0 + r() * (x1 - x0 - 2), yTop + r() * (hh - 2), lw(0.018), lw(0.018));
      }
    }
  }
  // moss in the joints
  if (deco % 9 === 0) {
    for (let k = 0; k < 6; k++) {
      c.fillStyle = `rgba(${60 + Math.floor(r() * 30)},${90 + Math.floor(r() * 40)},${50 + Math.floor(r() * 20)},0.5)`;
      ell(c, px + r() * T, py + Math.floor(r() * 4) * sh, T * (0.04 + r() * 0.05), T * 0.016);
      c.fill();
    }
  }
  // cracks
  if (deco > 240) {
    c.strokeStyle = 'rgba(0,0,0,0.4)';
    c.lineWidth = lw(0.014);
    c.beginPath();
    c.moveTo(px + T * 0.1, py + T * 0.6);
    c.lineTo(px + T * 0.35, py + T * 0.52);
    c.lineTo(px + T * 0.5, py + T * 0.7);
    c.lineTo(px + T * 0.72, py + T * 0.66);
    c.stroke();
  }
  // factory: rails, oil stains and iron plates
  if (theme === 'fabryka') {
    if (y % 6 === 2) {
      c.fillStyle = 'rgba(30,24,20,0.6)';
      for (let k = 0; k < 4; k++) c.fillRect(px + k * T * 0.25 + T * 0.06, py + T * 0.3, T * 0.12, T * 0.4);
      c.fillStyle = '#5a5550';
      c.fillRect(px, py + T * 0.36, T, T * 0.04);
      c.fillRect(px, py + T * 0.6, T, T * 0.04);
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(px, py + T * 0.36, T, T * 0.012);
      c.fillRect(px, py + T * 0.6, T, T * 0.012);
    } else if (deco % 6 === 1) {
      const g = c.createRadialGradient(px + T * 0.55, py + T * 0.6, 0, px + T * 0.55, py + T * 0.6, T * 0.3);
      g.addColorStop(0, 'rgba(10,8,12,0.55)');
      g.addColorStop(0.7, 'rgba(60,40,80,0.18)');
      g.addColorStop(1, 'rgba(10,8,12,0)');
      c.fillStyle = g;
      ell(c, px + T * 0.55, py + T * 0.6, T * 0.3, T * 0.17);
      c.fill();
    } else if (deco % 17 === 4) {
      c.fillStyle = '#3d3a38';
      c.fillRect(px + T * 0.2, py + T * 0.25, T * 0.6, T * 0.5);
      c.fillStyle = 'rgba(255,255,255,0.06)';
      for (let k = 0; k < 6; k++) c.fillRect(px + T * (0.25 + (k % 3) * 0.2), py + T * (0.32 + Math.floor(k / 3) * 0.3), T * 0.12, T * 0.03);
      c.fillStyle = '#25221f';
      for (const [a, b] of [[0.24, 0.29], [0.74, 0.29], [0.24, 0.69], [0.74, 0.69]]) c.fillRect(px + T * a, py + T * b, lw(0.03), lw(0.03));
    }
  }
}

// ---------------------------------------------------------------- litter
function drawLitter(c: Ctx, theme: ThemeId, px: number, py: number, T: number, r: () => number, deco: number, underFacade: boolean) {
  const lw = (k: number) => Math.max(1, T * k);
  // fallen leaves
  if (deco % 5 === 2 || (theme === 'ogrod' && deco % 3 === 0) || (theme === 'cmentarz' && deco % 3 === 1)) {
    const cols = LEAVES[theme];
    const n = 2 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const lx = px + T * (0.1 + r() * 0.8);
      const ly = py + T * (0.15 + r() * 0.75);
      const a = r() * Math.PI;
      c.fillStyle = cols[Math.floor(r() * cols.length)];
      ell(c, lx, ly, T * 0.045, T * 0.022, a);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.3)';
      c.lineWidth = lw(0.006);
      c.beginPath();
      c.moveTo(lx - Math.cos(a) * T * 0.04, ly - Math.sin(a) * T * 0.04);
      c.lineTo(lx + Math.cos(a) * T * 0.04, ly + Math.sin(a) * T * 0.04);
      c.stroke();
    }
  }
  // crumpled paper / posters blown off the walls
  if (deco % 23 === 9 && theme !== 'ogrod') {
    const lx = px + T * (0.2 + r() * 0.6);
    const ly = py + T * (0.3 + r() * 0.5);
    c.fillStyle = 'rgba(205,195,170,0.55)';
    c.beginPath();
    c.moveTo(lx, ly);
    c.lineTo(lx + T * 0.1, ly - T * 0.02);
    c.lineTo(lx + T * 0.12, ly + T * 0.06);
    c.lineTo(lx + T * 0.01, ly + T * 0.08);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(40,30,20,0.4)';
    c.fillRect(lx + T * 0.02, ly + T * 0.015, T * 0.07, lw(0.008));
    c.fillRect(lx + T * 0.025, ly + T * 0.035, T * 0.06, lw(0.008));
  }
  // theme bits
  if (theme === 'stare' && deco % 19 === 4) {
    // cabbage leaf and straw from the market
    c.fillStyle = 'rgba(110,140,70,0.6)';
    ell(c, px + T * 0.4, py + T * 0.6, T * 0.07, T * 0.045, 0.4);
    c.fill();
    c.strokeStyle = 'rgba(200,170,90,0.55)';
    c.lineWidth = lw(0.008);
    for (let k = 0; k < 6; k++) {
      const sx = px + T * (0.4 + r() * 0.3);
      const sy = py + T * (0.5 + r() * 0.3);
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(sx + (r() - 0.5) * T * 0.14, sy + (r() - 0.5) * T * 0.06);
      c.stroke();
    }
  } else if (theme === 'port' && deco % 17 === 6) {
    // coil of rope
    c.strokeStyle = '#8a7350';
    c.lineWidth = lw(0.025);
    for (let k = 0; k < 3; k++) {
      ell(c, px + T * 0.55, py + T * 0.6, T * (0.08 + k * 0.045), T * (0.05 + k * 0.025));
      c.stroke();
    }
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = lw(0.008);
    ell(c, px + T * 0.55, py + T * 0.6, T * 0.19, T * 0.11);
    c.stroke();
  } else if (theme === 'fabryka' && deco % 11 === 3) {
    // coal lumps
    for (let k = 0; k < 7; k++) {
      c.fillStyle = r() < 0.3 ? '#2a2826' : '#141312';
      ell(c, px + T * (0.4 + r() * 0.25), py + T * (0.55 + r() * 0.15), T * 0.035, T * 0.025);
      c.fill();
    }
  } else if (theme === 'cmentarz' && deco % 13 === 2) {
    // grave candle (unlit), wilted flowers
    c.fillStyle = '#7a2a26';
    c.fillRect(px + T * 0.45, py + T * 0.5, T * 0.07, T * 0.1);
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.fillRect(px + T * 0.45, py + T * 0.5, T * 0.02, T * 0.1);
    c.fillStyle = 'rgba(160,80,110,0.5)';
    for (let k = 0; k < 4; k++) {
      ell(c, px + T * (0.58 + k * 0.04), py + T * (0.6 + (k % 2) * 0.03), T * 0.02, T * 0.02);
      c.fill();
    }
  } else if (theme === 'ogrod' && deco % 7 === 5) {
    // flowers
    const cols = ['#d9a441', '#c97a8d', '#e8e0d0', '#8e5aa8'];
    for (let k = 0; k < 6; k++) {
      const fx = px + T * (0.15 + r() * 0.7);
      const fy = py + T * (0.2 + r() * 0.65);
      c.fillStyle = 'rgba(70,110,60,0.7)';
      c.fillRect(fx, fy, lw(0.012), T * 0.06);
      c.fillStyle = cols[Math.floor(r() * cols.length)];
      ell(c, fx, fy, T * 0.022, T * 0.022);
      c.fill();
    }
  }
  // broken glass glint
  if (deco % 37 === 21 && !underFacade) {
    c.fillStyle = 'rgba(200,220,230,0.35)';
    for (let k = 0; k < 3; k++) {
      const gx = px + T * (0.3 + r() * 0.4);
      const gy = py + T * (0.4 + r() * 0.3);
      c.beginPath();
      c.moveTo(gx, gy);
      c.lineTo(gx + T * 0.03, gy + T * 0.01);
      c.lineTo(gx + T * 0.01, gy + T * 0.03);
      c.closePath();
      c.fill();
    }
  }
}

// ---------------------------------------------------------------- chimney
function drawChimney(c: Ctx, pal: { wallTrim: string; wallFace: string }, px: number, py: number, T: number, r: () => number, theme: ThemeId) {
  const cx = px + T * 0.52;
  const cy = py + T * 0.1;
  const w = T * 0.22;
  const h = T * 0.4;
  // shadow on the roof
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath();
  c.moveTo(cx + w, cy + h * 0.3);
  c.lineTo(cx + w + T * 0.16, cy + h + T * 0.04);
  c.lineTo(cx + w, cy + h);
  c.closePath();
  c.fill();
  const brick = theme === 'fabryka' ? '#6a3a26' : theme === 'port' || theme === 'latarnia' ? '#4a4f58' : '#6a4032';
  c.fillStyle = brick;
  c.fillRect(cx, cy, w, h);
  c.fillStyle = 'rgba(255,255,255,0.08)';
  c.fillRect(cx, cy, w * 0.3, h);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.fillRect(cx + w * 0.7, cy, w * 0.3, h);
  c.strokeStyle = 'rgba(0,0,0,0.3)';
  c.lineWidth = Math.max(1, T * 0.008);
  for (let k = 1; k < 5; k++) {
    c.beginPath();
    c.moveTo(cx, cy + (h * k) / 5);
    c.lineTo(cx + w, cy + (h * k) / 5);
    c.stroke();
    const off = k % 2 ? w * 0.5 : w * 0.25;
    c.beginPath();
    c.moveTo(cx + off, cy + (h * (k - 1)) / 5);
    c.lineTo(cx + off, cy + (h * k) / 5);
    c.stroke();
  }
  // cap and flue
  c.fillStyle = shade(pal.wallTrim, 18);
  c.fillRect(cx - T * 0.025, cy - T * 0.02, w + T * 0.05, T * 0.05);
  c.fillStyle = '#121214';
  c.fillRect(cx + w * 0.2, cy - T * 0.06, w * 0.6, T * 0.05);
  c.fillStyle = 'rgba(20,16,14,0.6)';
  ell(c, cx + w * 0.5, cy - T * 0.06, w * 0.3, T * 0.015);
  c.fill();
  void r;
}

// ---------------------------------------------------------------- facade
function drawFacade(
  c: Ctx,
  theme: ThemeId,
  pal: { wallTrim: string; wallFace: string; accent: string },
  plaster: string,
  px: number,
  fy: number,
  T: number,
  fh: number,
  r: () => number,
  deco: number,
  hid: number,
  leftEdge: boolean,
  windows: Prerendered['windows'],
  dpr: number,
) {
  const lw = (k: number) => Math.max(1, T * k);
  const bottom = fy + fh;
  // gutter under the eaves
  c.fillStyle = '#2a2c30';
  c.fillRect(px, fy - T * 0.01, T, T * 0.04);
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(px, fy - T * 0.01, T, T * 0.01);
  // cornice with dentils
  c.fillStyle = shade(pal.wallTrim, 14);
  c.fillRect(px, fy + T * 0.03, T, T * 0.05);
  c.fillStyle = 'rgba(0,0,0,0.3)';
  for (let k = 0; k < 8; k++) c.fillRect(px + k * T * 0.125 + T * 0.03, fy + T * 0.075, T * 0.06, T * 0.025);
  const wy0 = fy + T * 0.1;
  // wall surface
  const wood = theme === 'port' && hid % 2 === 0;
  const stone = theme === 'cmentarz' || theme === 'latarnia';
  const brickWall = theme === 'fabryka' || (theme === 'stare' && hid % 4 === 1);
  const g = c.createLinearGradient(0, wy0, 0, bottom);
  g.addColorStop(0, shade(wood ? '#4a3a2c' : plaster, 6));
  g.addColorStop(1, shade(wood ? '#4a3a2c' : plaster, -18));
  c.fillStyle = g;
  c.fillRect(px, wy0, T, bottom - wy0);
  c.strokeStyle = 'rgba(0,0,0,0.2)';
  c.lineWidth = lw(0.01);
  if (wood) {
    for (let yy = wy0 + T * 0.07; yy < bottom; yy += T * 0.07) {
      c.beginPath();
      c.moveTo(px, yy);
      c.lineTo(px + T, yy);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.04)';
    for (let yy = wy0 + T * 0.075; yy < bottom; yy += T * 0.07) c.fillRect(px, yy, T, lw(0.008));
  } else if (stone || brickWall) {
    const bh = stone ? T * 0.12 : T * 0.065;
    const bw = stone ? T * 0.3 : T * 0.2;
    for (let yy = wy0, i = 0; yy < bottom; yy += bh, i++) {
      for (let xx = px + (i % 2 ? -bw / 2 : 0); xx < px + T; xx += bw) {
        const v = (hash(Math.round(xx), Math.round(yy)) % 20) - 10;
        c.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 230 : 0},${v > 0 ? 210 : 0},${Math.abs(v) / 160})`;
        c.fillRect(Math.max(px, xx), yy, Math.min(px + T, xx + bw) - Math.max(px, xx), Math.min(bh, bottom - yy));
        if (xx > px) {
          c.beginPath();
          c.moveTo(xx, yy);
          c.lineTo(xx, Math.min(bottom, yy + bh));
          c.stroke();
        }
      }
      c.beginPath();
      c.moveTo(px, yy);
      c.lineTo(px + T, yy);
      c.stroke();
    }
  } else {
    // plaster: blotches, and here and there it has fallen off to show the bricks
    for (let k = 0; k < 6; k++) {
      c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
      ell(c, px + r() * T, wy0 + r() * (bottom - wy0), T * (0.06 + r() * 0.1), T * (0.04 + r() * 0.06));
      c.fill();
    }
    if (deco % 5 === 1) {
      const bx = px + T * (r() < 0.5 ? 0.05 : 0.62);
      const by = wy0 + (bottom - wy0) * 0.45;
      c.fillStyle = 'rgba(110,60,45,0.75)';
      c.beginPath();
      c.moveTo(bx, by);
      c.lineTo(bx + T * 0.28, by - T * 0.02);
      c.lineTo(bx + T * 0.3, by + T * 0.14);
      c.lineTo(bx + T * 0.04, by + T * 0.17);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.moveTo(bx + T * 0.02, by + T * 0.04 * (k + 1));
        c.lineTo(bx + T * 0.28, by + T * 0.04 * (k + 1));
        c.stroke();
      }
    }
    // stains running down from the gutter
    if (deco % 3 === 0) {
      const sx = px + T * (0.1 + r() * 0.8);
      const sg = c.createLinearGradient(0, wy0, 0, wy0 + T * 0.3);
      sg.addColorStop(0, 'rgba(0,0,0,0.18)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sg;
      c.fillRect(sx, wy0, T * 0.06, T * 0.3);
    }
  }
  // stone plinth
  const plinth = T * 0.09;
  c.fillStyle = shade(pal.wallTrim, 22);
  c.fillRect(px, bottom - plinth, T, plinth);
  c.fillStyle = 'rgba(255,255,255,0.08)';
  c.fillRect(px, bottom - plinth, T, lw(0.012));
  c.fillStyle = 'rgba(0,0,0,0.3)';
  for (let k = 1; k < 3; k++) c.fillRect(px + (k * T) / 3 + ((hid % 3) * T) / 9, bottom - plinth, lw(0.01), plinth);
  // ivy climbing up from the plinth
  if ((theme === 'ogrod' || theme === 'cmentarz' || theme === 'stare') && deco % 6 === 4) {
    const ix = px + T * (r() < 0.5 ? 0.12 : 0.78);
    for (let k = 0; k < 22; k++) {
      const hgt = r();
      c.fillStyle = `rgba(${40 + Math.floor(r() * 30)},${80 + Math.floor(r() * 40)},${40 + Math.floor(r() * 15)},0.85)`;
      ell(c, ix + (r() - 0.5) * T * 0.22 * (1 - hgt * 0.5), bottom - plinth - hgt * (bottom - wy0) * 0.9, T * 0.032, T * 0.026, r() * 3);
      c.fill();
    }
  }

  const fhh = bottom - wy0 - plinth;
  const kind = deco % 3 !== 1 ? (theme === 'stare' || theme === 'port') && deco % 11 === 0 ? 'shop' : 'window' : 'door';
  if (kind === 'window') {
    const ww = T * 0.32;
    const wh = fhh * 0.66;
    const wx = px + (T - ww) / 2;
    const wy = wy0 + fhh * 0.13;
    const arched = theme === 'cmentarz' || theme === 'latarnia' || hid % 5 === 2;
    // frame / lintel
    c.fillStyle = shade(pal.wallTrim, 16);
    c.fillRect(wx - T * 0.04, wy - T * 0.045, ww + T * 0.08, T * 0.04);
    c.fillStyle = pal.wallTrim;
    c.fillRect(wx - T * 0.025, wy - T * 0.01, ww + T * 0.05, wh + T * 0.03);
    // glass with a cold reflection
    const gl = c.createLinearGradient(wx, wy, wx + ww, wy + wh);
    gl.addColorStop(0, '#20283a');
    gl.addColorStop(0.5, '#0d1018');
    gl.addColorStop(1, '#151a26');
    c.fillStyle = gl;
    if (arched) {
      c.beginPath();
      c.moveTo(wx, wy + wh);
      c.lineTo(wx, wy + ww / 2);
      c.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
      c.lineTo(wx + ww, wy + wh);
      c.closePath();
      c.fill();
    } else c.fillRect(wx, wy, ww, wh);
    c.fillStyle = 'rgba(170,190,230,0.13)';
    c.beginPath();
    c.moveTo(wx + ww * 0.1, wy + wh * 0.9);
    c.lineTo(wx + ww * 0.45, wy + wh * 0.1);
    c.lineTo(wx + ww * 0.62, wy + wh * 0.1);
    c.lineTo(wx + ww * 0.27, wy + wh * 0.9);
    c.closePath();
    c.fill();
    // curtains in some
    if (hid % 3 === 1) {
      c.fillStyle = theme === 'stare' ? 'rgba(120,40,36,0.75)' : 'rgba(90,80,60,0.7)';
      c.beginPath();
      c.moveTo(wx, wy);
      c.lineTo(wx + ww * 0.32, wy);
      c.quadraticCurveTo(wx + ww * 0.12, wy + wh * 0.5, wx + ww * 0.2, wy + wh);
      c.lineTo(wx, wy + wh);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(wx + ww, wy);
      c.lineTo(wx + ww * 0.68, wy);
      c.quadraticCurveTo(wx + ww * 0.88, wy + wh * 0.5, wx + ww * 0.8, wy + wh);
      c.lineTo(wx + ww, wy + wh);
      c.closePath();
      c.fill();
    }
    // mullions
    c.fillStyle = pal.wallTrim;
    c.fillRect(wx + ww / 2 - T * 0.012, wy, T * 0.024, wh);
    c.fillRect(wx, wy + wh * 0.45, ww, T * 0.022);
    // sill
    c.fillStyle = shade(pal.wallTrim, 26);
    c.fillRect(wx - T * 0.05, wy + wh + T * 0.015, ww + T * 0.1, T * 0.035);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(wx - T * 0.04, wy + wh + T * 0.05, ww + T * 0.08, T * 0.02);
    if (deco % 4 === 0 && !arched) {
      // shutters with slats and hinges
      const sc = theme === 'ogrod' ? '#3a5a3a' : theme === 'port' ? '#2e4a5a' : shade(pal.wallTrim, 4);
      for (const sx of [wx - T * 0.13, wx + ww + T * 0.04]) {
        c.fillStyle = sc;
        c.fillRect(sx, wy - T * 0.01, T * 0.09, wh + T * 0.03);
        c.fillStyle = 'rgba(0,0,0,0.3)';
        for (let k = 1; k < 6; k++) c.fillRect(sx, wy + (wh * k) / 6, T * 0.09, lw(0.01));
        c.fillStyle = 'rgba(255,255,255,0.06)';
        c.fillRect(sx, wy - T * 0.01, lw(0.012), wh + T * 0.03);
      }
    } else if (deco % 7 === 2) {
      // flower box
      c.fillStyle = '#3d2817';
      c.fillRect(wx - T * 0.03, wy + wh + T * 0.03, ww + T * 0.06, T * 0.06);
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.fillRect(wx - T * 0.03, wy + wh + T * 0.03, ww + T * 0.06, lw(0.01));
      for (let k = 0; k < 7; k++) {
        c.fillStyle = 'rgba(60,100,50,0.9)';
        ell(c, wx + (ww * (k + 0.5)) / 7, wy + wh + T * 0.025, T * 0.025, T * 0.02);
        c.fill();
        c.fillStyle = ['#b8463a', '#d9a441', '#8e5aa8', '#c97a8d', '#e8e0d0'][Math.floor(r() * 5)];
        ell(c, wx + (ww * (k + 0.5)) / 7 + (r() - 0.5) * T * 0.02, wy + wh + T * 0.01, T * 0.018, T * 0.018);
        c.fill();
      }
    }
    windows.push({ x: wx / dpr, y: wy / dpr, w: ww / dpr, h: wh / dpr, lit: deco % 5 === 0, phase: (deco % 17) * 0.37, arch: arched });
  } else if (kind === 'shop') {
    // shop front with a striped awning
    const wx = px + T * 0.1;
    const ww = T * 0.8;
    const wy = wy0 + fhh * 0.3;
    const wh = fhh * 0.55;
    c.fillStyle = '#2a1a10';
    c.fillRect(wx - T * 0.02, wy - T * 0.02, ww + T * 0.04, wh + T * 0.04);
    c.fillStyle = '#0f1218';
    c.fillRect(wx, wy, ww, wh);
    c.fillStyle = 'rgba(170,190,230,0.1)';
    c.fillRect(wx + ww * 0.1, wy, ww * 0.15, wh);
    c.fillStyle = '#2a1a10';
    for (let k = 1; k < 3; k++) c.fillRect(wx + (ww * k) / 3 - T * 0.01, wy, T * 0.02, wh);
    // goods on display (silhouettes)
    for (let k = 0; k < 5; k++) {
      c.fillStyle = ['#5a3a20', '#3a4a30', '#6a5030', '#4a3040'][k % 4];
      c.fillRect(wx + T * 0.04 + k * T * 0.15, wy + wh - T * 0.08 - (k % 2) * T * 0.03, T * 0.08, T * 0.08 + (k % 2) * T * 0.03);
    }
    windows.push({ x: wx / dpr, y: wy / dpr, w: ww / dpr, h: wh / dpr, lit: deco % 2 === 0, phase: (deco % 17) * 0.37 });
    // awning
    const ay = wy - T * 0.12;
    const colA = theme === 'port' ? '#2e5a6a' : hid % 2 ? '#7a2a26' : '#2a5a3a';
    for (let k = 0; k < 6; k++) {
      c.fillStyle = k % 2 ? '#d8cdb5' : colA;
      c.beginPath();
      c.moveTo(px + T * 0.05 + (k * T * 0.9) / 6, ay);
      c.lineTo(px + T * 0.05 + ((k + 1) * T * 0.9) / 6, ay);
      c.lineTo(px + T * 0.02 + ((k + 1) * T * 0.96) / 6, ay + T * 0.12);
      c.lineTo(px + T * 0.02 + (k * T * 0.96) / 6, ay + T * 0.12);
      c.closePath();
      c.fill();
    }
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(px + T * 0.02, ay + T * 0.1, T * 0.96, T * 0.025);
    // scalloped edge
    for (let k = 0; k < 8; k++) {
      c.fillStyle = k % 2 ? '#d8cdb5' : colA;
      c.beginPath();
      c.arc(px + T * 0.08 + k * T * 0.12, ay + T * 0.12, T * 0.05, 0, Math.PI);
      c.fill();
    }
  } else {
    // arched wooden door with planks, iron bands, knocker, step and a house number
    const dw = T * 0.36;
    const dh = fhh * 0.84;
    const dx0 = px + (T - dw) / 2;
    const dy0 = bottom - plinth - dh + T * 0.02;
    c.fillStyle = shade(pal.wallTrim, 10);
    c.beginPath();
    c.moveTo(dx0 - T * 0.04, bottom);
    c.lineTo(dx0 - T * 0.04, dy0 + dw * 0.5);
    c.arc(dx0 + dw / 2, dy0 + dw * 0.5, dw / 2 + T * 0.04, Math.PI, 0);
    c.lineTo(dx0 + dw + T * 0.04, bottom);
    c.closePath();
    c.fill();
    // keystone
    c.fillStyle = shade(pal.wallTrim, 30);
    c.fillRect(dx0 + dw / 2 - T * 0.03, dy0 - T * 0.04, T * 0.06, T * 0.06);
    const doorCol = ['#3a2414', '#2a3a2a', '#4a1e1a', '#22303e'][hid % 4];
    const dg = c.createLinearGradient(dx0, 0, dx0 + dw, 0);
    dg.addColorStop(0, shade(doorCol, 10));
    dg.addColorStop(1, shade(doorCol, -10));
    c.fillStyle = dg;
    c.beginPath();
    c.moveTo(dx0, bottom);
    c.lineTo(dx0, dy0 + dw * 0.5);
    c.arc(dx0 + dw / 2, dy0 + dw * 0.5, dw / 2, Math.PI, 0);
    c.lineTo(dx0 + dw, bottom);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.4)';
    c.lineWidth = lw(0.012);
    for (let k = 1; k < 4; k++) {
      c.beginPath();
      c.moveTo(dx0 + (dw * k) / 4, dy0 + dw * 0.12);
      c.lineTo(dx0 + (dw * k) / 4, bottom);
      c.stroke();
    }
    c.fillStyle = '#1a1a1c';
    for (const k of [0.35, 0.75]) c.fillRect(dx0, dy0 + dh * k, dw, T * 0.025);
    c.fillStyle = '#c9a25f';
    ell(c, dx0 + dw * 0.78, dy0 + dh * 0.58, T * 0.02, T * 0.02);
    c.fill();
    c.strokeStyle = '#c9a25f';
    c.lineWidth = lw(0.01);
    c.beginPath();
    c.arc(dx0 + dw * 0.5, dy0 + dh * 0.45, T * 0.03, 0, Math.PI);
    c.stroke();
    // number plate
    c.fillStyle = '#2a3a5a';
    c.fillRect(dx0 + dw + T * 0.06, dy0 + dh * 0.15, T * 0.1, T * 0.07);
    c.fillStyle = '#d8d0bc';
    c.font = `600 ${Math.max(6, Math.round(T * 0.055))}px Georgia, serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String((hid % 47) + 1), dx0 + dw + T * 0.11, dy0 + dh * 0.15 + T * 0.037);
    // step
    c.fillStyle = shade(pal.wallTrim, 30);
    c.fillRect(dx0 - T * 0.06, bottom - T * 0.03, dw + T * 0.12, T * 0.05);
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.fillRect(dx0 - T * 0.06, bottom - T * 0.03, dw + T * 0.12, lw(0.01));
  }
  // posters and notices pasted on the wall
  if (deco % 8 === 3 && kind !== 'shop') {
    const sx = px + T * (kind === 'door' ? 0.04 : r() < 0.5 ? 0.04 : 0.8);
    const sy = wy0 + fhh * 0.3;
    c.save();
    c.translate(sx + T * 0.07, sy + T * 0.09);
    c.rotate((r() - 0.5) * 0.15);
    c.fillStyle = 'rgba(210,198,170,0.85)';
    c.fillRect(-T * 0.07, -T * 0.09, T * 0.14, T * 0.18);
    c.fillStyle = 'rgba(120,40,30,0.8)';
    c.fillRect(-T * 0.055, -T * 0.07, T * 0.11, T * 0.03);
    c.fillStyle = 'rgba(40,30,20,0.55)';
    for (let k = 0; k < 4; k++) c.fillRect(-T * 0.055, -T * 0.025 + k * T * 0.025, T * (0.11 - (k % 2) * 0.03), lw(0.008));
    c.restore();
  }
  // hanging shop sign on an iron bracket
  if (deco % 10 === 6 && kind === 'door') {
    const bx = px + T * 0.12;
    const by = wy0 + fhh * 0.12;
    c.strokeStyle = '#1a1a1c';
    c.lineWidth = lw(0.018);
    c.beginPath();
    c.moveTo(bx - T * 0.05, by);
    c.lineTo(bx + T * 0.16, by);
    c.moveTo(bx - T * 0.05, by + T * 0.08);
    c.lineTo(bx + T * 0.04, by);
    c.stroke();
    c.lineWidth = lw(0.008);
    c.beginPath();
    c.moveTo(bx + T * 0.02, by);
    c.lineTo(bx + T * 0.02, by + T * 0.04);
    c.moveTo(bx + T * 0.14, by);
    c.lineTo(bx + T * 0.14, by + T * 0.04);
    c.stroke();
    c.fillStyle = '#4a3020';
    c.fillRect(bx - T * 0.01, by + T * 0.04, T * 0.18, T * 0.13);
    c.strokeStyle = '#c9a25f';
    c.lineWidth = lw(0.01);
    c.strokeRect(bx, by + T * 0.05, T * 0.16, T * 0.11);
    // emblem: key, cup or anchor
    c.fillStyle = '#c9a25f';
    const ex = bx + T * 0.08;
    const ey = by + T * 0.105;
    const em = hid % 3;
    if (em === 0) {
      ell(c, ex - T * 0.03, ey, T * 0.02, T * 0.02);
      c.fill();
      c.fillRect(ex - T * 0.015, ey - T * 0.006, T * 0.07, T * 0.012);
      c.fillRect(ex + T * 0.04, ey, T * 0.012, T * 0.02);
    } else if (em === 1) {
      c.fillRect(ex - T * 0.025, ey - T * 0.03, T * 0.05, T * 0.045);
      c.fillRect(ex - T * 0.005, ey + T * 0.015, T * 0.01, T * 0.02);
      c.fillRect(ex - T * 0.02, ey + T * 0.03, T * 0.04, T * 0.008);
    } else {
      c.fillRect(ex - T * 0.005, ey - T * 0.035, T * 0.01, T * 0.06);
      c.fillRect(ex - T * 0.025, ey - T * 0.025, T * 0.05, T * 0.008);
      c.strokeStyle = '#c9a25f';
      c.beginPath();
      c.arc(ex, ey + T * 0.005, T * 0.025, 0.2, Math.PI - 0.2);
      c.stroke();
    }
  }
  // factory: a horizontal pipe with a valve wheel
  if (theme === 'fabryka' && deco % 4 === 2) {
    const yy = wy0 + fhh * 0.05;
    c.fillStyle = '#4a4d55';
    c.fillRect(px, yy, T, T * 0.05);
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.fillRect(px, yy, T, lw(0.01));
    c.fillStyle = '#2a2c30';
    c.fillRect(px + T * 0.3, yy - T * 0.01, T * 0.04, T * 0.07);
    c.strokeStyle = '#8a3a2a';
    c.lineWidth = lw(0.014);
    c.beginPath();
    c.arc(px + T * 0.7, yy + T * 0.025, T * 0.04, 0, Math.PI * 2);
    c.moveTo(px + T * 0.66, yy + T * 0.025);
    c.lineTo(px + T * 0.74, yy + T * 0.025);
    c.stroke();
  }
  // port: lifebuoy on wooden walls
  if (theme === 'port' && wood && deco % 5 === 3) {
    const bx = px + T * 0.82;
    const by = wy0 + fhh * 0.35;
    c.lineWidth = T * 0.03;
    for (let k = 0; k < 4; k++) {
      c.strokeStyle = k % 2 ? '#d8d0bc' : '#b33a2a';
      c.beginPath();
      c.arc(bx, by, T * 0.055, (k * Math.PI) / 2, ((k + 1) * Math.PI) / 2);
      c.stroke();
    }
  }
  // drainpipe where two houses meet
  if (leftEdge) {
    const dx = px + T * 0.01;
    c.fillStyle = '#2c2f35';
    c.fillRect(dx, fy - T * 0.01, T * 0.05, bottom - fy - T * 0.01);
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(dx, fy - T * 0.01, T * 0.012, bottom - fy);
    c.fillStyle = '#1c1e22';
    for (let k = 1; k < 4; k++) c.fillRect(dx - T * 0.01, fy + ((bottom - fy) * k) / 4, T * 0.07, T * 0.02);
    // spout and a little wet stain below
    c.fillStyle = '#2c2f35';
    c.fillRect(dx, bottom - T * 0.02, T * 0.09, T * 0.035);
    c.fillStyle = 'rgba(90,110,140,0.25)';
    ell(c, dx + T * 0.1, bottom + T * 0.06, T * 0.08, T * 0.03);
    c.fill();
  }
  // shadow at the foot of the wall
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.fillRect(px, bottom - T * 0.025, T, T * 0.025);
}

// ---------------------------------------------------------------- props (single wall tiles)
function drawProp(c: Ctx, theme: ThemeId, pal: { wallTop: string; wallFace: string; wallTrim: string }, px: number, py: number, T: number, r: () => number, deco: number) {
  const lw = (k: number) => Math.max(1, T * k);
  const cx = px + T * 0.5;
  c.fillStyle = 'rgba(0,0,0,0.38)';
  ell(c, cx + T * 0.04, py + T * 0.84, T * 0.4, T * 0.12);
  c.fill();
  const v = deco % 3;
  if (theme === 'ogrod') {
    if (v === 0) {
      // stone urn with flowers
      c.fillStyle = '#6a6a62';
      c.fillRect(cx - T * 0.12, py + T * 0.62, T * 0.24, T * 0.2);
      c.beginPath();
      c.moveTo(cx - T * 0.24, py + T * 0.4);
      c.lineTo(cx + T * 0.24, py + T * 0.4);
      c.quadraticCurveTo(cx + T * 0.2, py + T * 0.66, cx, py + T * 0.66);
      c.quadraticCurveTo(cx - T * 0.2, py + T * 0.66, cx - T * 0.24, py + T * 0.4);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(cx - T * 0.2, py + T * 0.42, T * 0.06, T * 0.16);
      for (let k = 0; k < 12; k++) {
        c.fillStyle = `rgba(${50 + Math.floor(r() * 30)},${90 + Math.floor(r() * 40)},50,0.95)`;
        ell(c, cx + (r() - 0.5) * T * 0.4, py + T * (0.28 + r() * 0.14), T * 0.05, T * 0.04);
        c.fill();
      }
      for (let k = 0; k < 7; k++) {
        c.fillStyle = ['#c97a8d', '#e8e0d0', '#d9a441'][k % 3];
        ell(c, cx + (r() - 0.5) * T * 0.36, py + T * (0.25 + r() * 0.12), T * 0.025, T * 0.025);
        c.fill();
      }
      return;
    }
    // hedge / topiary
    for (let i = 0; i < 9; i++) {
      const hy = py + T * (0.25 + r() * 0.45);
      c.fillStyle = `rgb(${28 + Math.floor(r() * 20)},${58 + Math.floor(r() * 30)},${34 + Math.floor(r() * 15)})`;
      ell(c, px + T * (0.22 + r() * 0.56), hy, T * (0.16 + r() * 0.08), T * (0.15 + r() * 0.08));
      c.fill();
    }
    for (let i = 0; i < 14; i++) {
      c.fillStyle = 'rgba(140,190,110,0.25)';
      ell(c, px + T * (0.2 + r() * 0.5), py + T * (0.2 + r() * 0.3), T * 0.03, T * 0.02);
      c.fill();
    }
    return;
  }
  if (theme === 'cmentarz') {
    const stoneC = shade(pal.wallFace, 14);
    if (v === 0) {
      // rounded headstone with an inscription and moss
      c.fillStyle = shade(pal.wallFace, -10);
      c.fillRect(cx - T * 0.3, py + T * 0.76, T * 0.6, T * 0.1);
      c.fillStyle = stoneC;
      c.beginPath();
      c.moveTo(cx - T * 0.24, py + T * 0.8);
      c.lineTo(cx - T * 0.24, py + T * 0.32);
      c.quadraticCurveTo(cx, py + T * 0.04, cx + T * 0.24, py + T * 0.32);
      c.lineTo(cx + T * 0.24, py + T * 0.8);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.1)';
      c.fillRect(cx - T * 0.22, py + T * 0.32, T * 0.05, T * 0.46);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(cx - T * 0.04, py + T * 0.2, T * 0.08, T * 0.02);
      c.fillRect(cx - T * 0.01, py + T * 0.16, T * 0.02, T * 0.1);
      for (let k = 0; k < 3; k++) c.fillRect(cx - T * 0.13, py + T * (0.38 + k * 0.08), T * (0.26 - (k % 2) * 0.08), lw(0.016));
      c.fillStyle = 'rgba(90,120,70,0.5)';
      ell(c, cx - T * 0.12, py + T * 0.74, T * 0.1, T * 0.04);
      c.fill();
    } else if (v === 1) {
      // stone cross on a plinth
      c.fillStyle = shade(pal.wallFace, -6);
      c.fillRect(cx - T * 0.2, py + T * 0.7, T * 0.4, T * 0.15);
      c.fillStyle = stoneC;
      c.fillRect(cx - T * 0.06, py + T * 0.08, T * 0.12, T * 0.64);
      c.fillRect(cx - T * 0.24, py + T * 0.24, T * 0.48, T * 0.11);
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(cx - T * 0.06, py + T * 0.08, T * 0.03, T * 0.64);
      c.fillRect(cx - T * 0.24, py + T * 0.24, T * 0.48, T * 0.025);
    } else {
      // little chapel tomb
      c.fillStyle = shade(pal.wallFace, 4);
      c.fillRect(cx - T * 0.3, py + T * 0.35, T * 0.6, T * 0.5);
      c.fillStyle = shade(pal.wallTop, -6);
      c.beginPath();
      c.moveTo(cx - T * 0.36, py + T * 0.38);
      c.lineTo(cx, py + T * 0.1);
      c.lineTo(cx + T * 0.36, py + T * 0.38);
      c.closePath();
      c.fill();
      c.fillStyle = '#121418';
      c.beginPath();
      c.moveTo(cx - T * 0.1, py + T * 0.85);
      c.lineTo(cx - T * 0.1, py + T * 0.55);
      c.arc(cx, py + T * 0.55, T * 0.1, Math.PI, 0);
      c.lineTo(cx + T * 0.1, py + T * 0.85);
      c.fill();
      c.strokeStyle = '#5a5048';
      c.lineWidth = lw(0.012);
      for (let k = -1; k <= 1; k++) {
        c.beginPath();
        c.moveTo(cx + k * T * 0.05, py + T * 0.5);
        c.lineTo(cx + k * T * 0.05, py + T * 0.85);
        c.stroke();
      }
    }
    return;
  }
  if (theme === 'port') {
    if (v === 0) {
      // mooring bollard with rope
      c.fillStyle = '#25272c';
      c.fillRect(cx - T * 0.14, py + T * 0.35, T * 0.28, T * 0.45);
      ell(c, cx, py + T * 0.35, T * 0.2, T * 0.08);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(cx - T * 0.12, py + T * 0.38, T * 0.05, T * 0.4);
      c.strokeStyle = '#8a7350';
      c.lineWidth = lw(0.03);
      c.beginPath();
      c.ellipse(cx, py + T * 0.55, T * 0.17, T * 0.06, 0, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(cx + T * 0.15, py + T * 0.56);
      c.quadraticCurveTo(cx + T * 0.35, py + T * 0.75, cx + T * 0.45, py + T * 0.9);
      c.stroke();
      return;
    }
    if (v === 1) {
      // anchor leaning on a post
      c.strokeStyle = '#3a3d44';
      c.lineWidth = T * 0.05;
      c.beginPath();
      c.moveTo(cx, py + T * 0.15);
      c.lineTo(cx, py + T * 0.75);
      c.moveTo(cx - T * 0.14, py + T * 0.28);
      c.lineTo(cx + T * 0.14, py + T * 0.28);
      c.stroke();
      c.beginPath();
      c.arc(cx, py + T * 0.55, T * 0.22, 0.3, Math.PI - 0.3);
      c.stroke();
      c.lineWidth = T * 0.03;
      c.beginPath();
      c.arc(cx, py + T * 0.1, T * 0.05, 0, Math.PI * 2);
      c.stroke();
      return;
    }
  }
  if (theme === 'stare' && v === 0) {
    // town well with a little roof and a bucket
    c.fillStyle = '#5a5248';
    c.fillRect(cx - T * 0.32, py + T * 0.55, T * 0.64, T * 0.3);
    ell(c, cx, py + T * 0.55, T * 0.32, T * 0.1);
    c.fill();
    c.fillStyle = '#0c0e14';
    ell(c, cx, py + T * 0.55, T * 0.25, T * 0.07);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = lw(0.01);
    for (let k = 1; k < 3; k++) {
      c.beginPath();
      c.moveTo(cx - T * 0.32, py + T * (0.55 + k * 0.1));
      c.lineTo(cx + T * 0.32, py + T * (0.55 + k * 0.1));
      c.stroke();
    }
    c.fillStyle = '#3a2817';
    c.fillRect(cx - T * 0.3, py + T * 0.12, T * 0.05, T * 0.45);
    c.fillRect(cx + T * 0.25, py + T * 0.12, T * 0.05, T * 0.45);
    c.fillStyle = '#6a3328';
    c.beginPath();
    c.moveTo(cx - T * 0.4, py + T * 0.18);
    c.lineTo(cx, py + T * 0.0);
    c.lineTo(cx + T * 0.4, py + T * 0.18);
    c.lineTo(cx + T * 0.36, py + T * 0.22);
    c.lineTo(cx - T * 0.36, py + T * 0.22);
    c.closePath();
    c.fill();
    c.fillStyle = '#3a2817';
    c.fillRect(cx - T * 0.27, py + T * 0.28, T * 0.54, T * 0.035);
    c.strokeStyle = '#8a7350';
    c.lineWidth = lw(0.008);
    c.beginPath();
    c.moveTo(cx, py + T * 0.3);
    c.lineTo(cx, py + T * 0.44);
    c.stroke();
    c.fillStyle = '#5a4030';
    c.fillRect(cx - T * 0.05, py + T * 0.44, T * 0.1, T * 0.08);
    return;
  }
  if (theme === 'fabryka' && v === 0) {
    // gas valve stack
    c.fillStyle = '#4a4d55';
    c.fillRect(cx - T * 0.1, py + T * 0.2, T * 0.2, T * 0.62);
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(cx - T * 0.1, py + T * 0.2, T * 0.04, T * 0.62);
    c.fillStyle = '#2a2c30';
    for (const k of [0.3, 0.55, 0.78]) c.fillRect(cx - T * 0.14, py + T * k, T * 0.28, T * 0.04);
    c.strokeStyle = '#8a3a2a';
    c.lineWidth = T * 0.03;
    c.beginPath();
    c.arc(cx, py + T * 0.18, T * 0.12, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(cx - T * 0.12, py + T * 0.18);
    c.lineTo(cx + T * 0.12, py + T * 0.18);
    c.moveTo(cx, py + T * 0.06);
    c.lineTo(cx, py + T * 0.3);
    c.stroke();
    // pressure gauge
    c.fillStyle = '#d8d0bc';
    ell(c, cx + T * 0.18, py + T * 0.45, T * 0.06, T * 0.06);
    c.fill();
    c.strokeStyle = '#1a1a1c';
    c.lineWidth = lw(0.01);
    c.beginPath();
    c.moveTo(cx + T * 0.18, py + T * 0.45);
    c.lineTo(cx + T * 0.21, py + T * 0.42);
    c.stroke();
    return;
  }
  if (theme === 'latarnia') {
    // weathered rocks
    for (let k = 0; k < 4; k++) {
      const rx = cx + (r() - 0.5) * T * 0.4;
      const ry = py + T * (0.45 + r() * 0.3);
      c.fillStyle = shade('#4a4c52', Math.floor(r() * 20) - 10);
      ell(c, rx, ry, T * (0.14 + r() * 0.1), T * (0.1 + r() * 0.06));
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.1)';
      ell(c, rx - T * 0.04, ry - T * 0.04, T * 0.06, T * 0.025);
      c.fill();
    }
    return;
  }
  // stack of crates (with rope, stencils, a sack)
  const crate = (x0: number, y0: number, w: number, h: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(x0, y0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(x0, y0, w, lw(0.02));
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.lineWidth = lw(0.02);
    c.strokeRect(x0, y0, w, h);
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x0 + w, y0 + h);
    c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.2)';
    c.lineWidth = lw(0.008);
    for (let k = 1; k < 3; k++) {
      c.beginPath();
      c.moveTo(x0, y0 + (h * k) / 3);
      c.lineTo(x0 + w, y0 + (h * k) / 3);
      c.stroke();
    }
  };
  crate(px + T * 0.12, py + T * 0.48, T * 0.4, T * 0.36, '#6a4a2a');
  crate(px + T * 0.5, py + T * 0.52, T * 0.36, T * 0.32, '#5c4026');
  crate(px + T * 0.25, py + T * 0.16, T * 0.36, T * 0.33, '#74522e');
  c.fillStyle = 'rgba(30,20,10,0.5)';
  c.font = `700 ${Math.max(6, Math.round(T * 0.08))}px Georgia, serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(theme === 'port' ? '⚓' : 'XX', px + T * 0.43, py + T * 0.33);
  // a grain sack leaning on the stack
  c.fillStyle = '#8a7a5a';
  c.beginPath();
  c.moveTo(px + T * 0.72, py + T * 0.86);
  c.quadraticCurveTo(px + T * 0.66, py + T * 0.55, px + T * 0.8, py + T * 0.5);
  c.quadraticCurveTo(px + T * 0.94, py + T * 0.55, px + T * 0.9, py + T * 0.86);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.fillRect(px + T * 0.74, py + T * 0.56, T * 0.12, lw(0.012));
}
