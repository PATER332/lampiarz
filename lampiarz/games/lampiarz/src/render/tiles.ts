// Pre-renders the static part of a district (cobbles, buildings, decorations)
// into an offscreen canvas once per district / resize.

import { THEMES } from '../game/content';
import type { District } from '../game/types';
import { TILE_WALL } from '../game/types';

export interface Prerendered {
  canvas: HTMLCanvasElement;
  windows: { x: number; y: number; w: number; h: number; lit: boolean; phase: number }[];
  tile: number;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
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

export function prerender(d: District, tile: number, dpr: number): Prerendered {
  const pal = THEMES[d.theme].palette;
  const T = Math.round(tile * dpr);
  const canvas = document.createElement('canvas');
  canvas.width = d.w * T;
  canvas.height = d.h * T;
  const c = canvas.getContext('2d')!;
  const wall = (x: number, y: number) => x < 0 || y < 0 || x >= d.w || y >= d.h || d.tiles[y * d.w + x] === TILE_WALL;
  const windows: Prerendered['windows'] = [];

  c.fillStyle = pal.joint;
  c.fillRect(0, 0, canvas.width, canvas.height);

  // ---------------- floors
  for (let y = 0; y < d.h; y++) {
    for (let x = 0; x < d.w; x++) {
      const isWall = wall(x, y);
      const pillar = isWall && !wall(x, y - 1) && !wall(x, y + 1) && !wall(x - 1, y) && !wall(x + 1, y);
      if (isWall && !pillar) continue;
      const px = x * T;
      const py = y * T;
      const r = rand(d.deco[y * d.w + x] * 7919 + x * 31 + y * 17 + 1);
      // cobbles: offset rows
      const rows = 3;
      const sh = T / rows;
      for (let row = 0; row < rows; row++) {
        const off = (row + y) % 2 ? sh * 0.5 : 0;
        for (let col = -1; col < rows; col++) {
          const sx = px + col * sh + off;
          const sy = py + row * sh;
          const v = Math.floor(r() * 18) - 9;
          c.fillStyle = shade(r() < 0.5 ? pal.floor : pal.floorAlt, v);
          const inset = T * 0.03;
          const x0 = Math.max(px, sx + inset);
          const x1 = Math.min(px + T, sx + sh - inset);
          if (x1 <= x0) continue;
          c.beginPath();
          const rr = T * 0.05;
          c.roundRect(x0, sy + inset, x1 - x0, sh - inset * 2, rr);
          c.fill();
          // top highlight
          c.fillStyle = 'rgba(255,255,255,0.035)';
          c.fillRect(x0, sy + inset, x1 - x0, T * 0.025);
        }
      }
      const deco = d.deco[y * d.w + x];
      // theme decorations
      if (d.theme === 'port' && deco < 40) {
        c.fillStyle = 'rgba(70,110,130,0.35)';
        c.beginPath();
        c.ellipse(px + T * (0.3 + r() * 0.4), py + T * (0.4 + r() * 0.3), T * (0.18 + r() * 0.15), T * 0.09, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(160,200,220,0.12)';
        c.fillRect(px + T * 0.35, py + T * 0.5, T * 0.15, T * 0.015);
      } else if ((d.theme === 'ogrod' || d.theme === 'cmentarz') && deco < 70) {
        for (let k = 0; k < 6; k++) {
          c.fillStyle = d.theme === 'ogrod' ? `rgba(90,${120 + Math.floor(r() * 40)},70,0.5)` : 'rgba(80,95,60,0.45)';
          c.fillRect(px + r() * T, py + r() * T, T * 0.03, T * (0.06 + r() * 0.06));
        }
      } else if (d.theme === 'fabryka' && deco < 30) {
        c.strokeStyle = 'rgba(20,14,10,0.6)';
        c.lineWidth = T * 0.02;
        c.beginPath();
        c.moveTo(px + T * 0.2, py + T * 0.3);
        c.lineTo(px + T * 0.5, py + T * 0.45);
        c.lineTo(px + T * 0.7, py + T * 0.4);
        c.stroke();
        c.fillStyle = 'rgba(120,70,40,0.18)';
        c.beginPath();
        c.ellipse(px + T * 0.6, py + T * 0.65, T * 0.2, T * 0.1, 0, 0, Math.PI * 2);
        c.fill();
      } else if (deco > 245) {
        c.strokeStyle = 'rgba(0,0,0,0.35)';
        c.lineWidth = T * 0.015;
        c.beginPath();
        c.moveTo(px + T * 0.1, py + T * 0.6);
        c.lineTo(px + T * 0.4, py + T * 0.55);
        c.lineTo(px + T * 0.55, py + T * 0.75);
        c.stroke();
      }
      // ambient occlusion under walls (north) and beside walls
      if (wall(x, y - 1)) {
        const g = c.createLinearGradient(0, py, 0, py + T * 0.45);
        g.addColorStop(0, 'rgba(0,0,0,0.55)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(px, py, T, T * 0.45);
      }
      if (wall(x - 1, y)) {
        const g = c.createLinearGradient(px, 0, px + T * 0.25, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.35)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(px, py, T * 0.25, T);
      }
      if (wall(x + 1, y)) {
        const g = c.createLinearGradient(px + T, 0, px + T * 0.75, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.35)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(px + T * 0.75, py, T * 0.25, T);
      }
    }
  }

  // ---------------- walls
  for (let y = 0; y < d.h; y++) {
    for (let x = 0; x < d.w; x++) {
      if (!wall(x, y)) continue;
      const px = x * T;
      const py = y * T;
      const deco = d.deco[y * d.w + x];
      const r = rand(deco * 104729 + x * 13 + y * 7 + 3);
      const pillar = !wall(x, y - 1) && !wall(x, y + 1) && !wall(x - 1, y) && !wall(x + 1, y);
      if (pillar) {
        drawPillar(c, d.theme, px, py, T, r, pal);
        continue;
      }
      const facade = !wall(x, y + 1) && y + 1 < d.h;
      const roofH = facade ? T * 0.42 : T;
      // roof: shingles with a gradient so building masses read clearly
      const rg = c.createLinearGradient(0, py, 0, py + roofH);
      rg.addColorStop(0, shade(pal.wallTop, 6 + Math.floor(r() * 6)));
      rg.addColorStop(1, shade(pal.wallTop, -14));
      c.fillStyle = rg;
      c.fillRect(px, py, T, roofH);
      c.strokeStyle = 'rgba(0,0,0,0.28)';
      c.lineWidth = Math.max(1, T * 0.018);
      const rowH = T * 0.17;
      for (let k = 1, yy = py + rowH; yy < py + roofH - 1; k++, yy += rowH) {
        c.beginPath();
        c.moveTo(px, yy);
        c.lineTo(px + T, yy);
        c.stroke();
        for (let xx = px + ((k + y) % 2 ? T * 0.17 : 0); xx < px + T; xx += T * 0.34) {
          c.beginPath();
          c.moveTo(xx, yy - rowH);
          c.lineTo(xx, yy);
          c.stroke();
        }
      }
      c.fillStyle = 'rgba(255,255,255,0.05)';
      c.fillRect(px, py, T, Math.max(1, T * 0.03));
      // chimney occasionally
      if (!facade && deco % 23 === 0) {
        c.fillStyle = shade(pal.wallTrim, 10);
        c.fillRect(px + T * 0.55, py + T * 0.2, T * 0.18, T * 0.26);
        c.fillStyle = 'rgba(0,0,0,0.4)';
        c.fillRect(px + T * 0.55, py + T * 0.2, T * 0.18, T * 0.04);
      }
      // eaves against open ground
      c.fillStyle = pal.wallTrim;
      if (!wall(x, y - 1)) c.fillRect(px, py, T, T * 0.06);
      if (!wall(x - 1, y)) c.fillRect(px, py, T * 0.05, roofH);
      if (!wall(x + 1, y)) c.fillRect(px + T * 0.95, py, T * 0.05, roofH);
      if (facade) {
        const fy = py + roofH;
        const fh = T - roofH;
        c.fillStyle = pal.wallTrim;
        c.fillRect(px, fy, T, T * 0.05);
        c.fillStyle = shade(pal.wallFace, Math.floor(r() * 12) - 6);
        c.fillRect(px, fy + T * 0.05, T, fh - T * 0.05);
        // bricks
        c.strokeStyle = 'rgba(0,0,0,0.18)';
        c.lineWidth = Math.max(1, T * 0.012);
        const bh = T * 0.09;
        for (let yy = fy + T * 0.05 + bh, i = 0; yy < py + T; yy += bh, i++) {
          c.beginPath();
          c.moveTo(px, yy);
          c.lineTo(px + T, yy);
          c.stroke();
          for (let xx = px + (i % 2 ? T * 0.12 : T * 0.25); xx < px + T; xx += T * 0.25) {
            c.beginPath();
            c.moveTo(xx, yy - bh);
            c.lineTo(xx, yy);
            c.stroke();
          }
        }
        // window or door
        if (deco % 3 !== 1) {
          const wx = px + T * 0.33;
          const wy = fy + T * 0.13;
          const ww = T * 0.34;
          const wh = fh * 0.55;
          c.fillStyle = pal.wallTrim;
          c.fillRect(wx - T * 0.03, wy - T * 0.03, ww + T * 0.06, wh + T * 0.06);
          c.fillStyle = '#0d0f16';
          c.fillRect(wx, wy, ww, wh);
          c.fillStyle = pal.wallTrim;
          c.fillRect(wx + ww / 2 - T * 0.012, wy, T * 0.024, wh);
          c.fillRect(wx, wy + wh / 2 - T * 0.012, ww, T * 0.024);
          windows.push({ x: wx / dpr, y: wy / dpr, w: ww / dpr, h: wh / dpr, lit: deco % 5 === 0, phase: (deco % 17) * 0.37 });
        } else {
          c.fillStyle = '#1a120c';
          c.fillRect(px + T * 0.32, fy + fh * 0.25, T * 0.36, fh * 0.75);
          c.fillStyle = 'rgba(255,255,255,0.05)';
          c.fillRect(px + T * 0.32, fy + fh * 0.25, T * 0.36, T * 0.02);
        }
        // shadow at base
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(px, py + T - T * 0.05, T, T * 0.05);
      }
    }
  }
  return { canvas, windows, tile };
}

function drawPillar(
  c: CanvasRenderingContext2D,
  theme: string,
  px: number,
  py: number,
  T: number,
  r: () => number,
  pal: { wallTop: string; wallFace: string; wallTrim: string },
) {
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath();
  c.ellipse(px + T * 0.5, py + T * 0.86, T * 0.36, T * 0.1, 0, 0, Math.PI * 2);
  c.fill();
  if (theme === 'ogrod') {
    // hedge bush
    for (let i = 0; i < 6; i++) {
      c.fillStyle = `rgb(${30 + Math.floor(r() * 20)},${60 + Math.floor(r() * 30)},${36 + Math.floor(r() * 15)})`;
      c.beginPath();
      c.arc(px + T * (0.25 + r() * 0.5), py + T * (0.3 + r() * 0.4), T * (0.18 + r() * 0.1), 0, Math.PI * 2);
      c.fill();
    }
    return;
  }
  if (theme === 'cmentarz') {
    // gravestone or cross
    c.fillStyle = shade(pal.wallFace, 10);
    if (r() < 0.5) {
      c.beginPath();
      c.moveTo(px + T * 0.25, py + T * 0.85);
      c.lineTo(px + T * 0.25, py + T * 0.35);
      c.quadraticCurveTo(px + T * 0.5, py + T * 0.08, px + T * 0.75, py + T * 0.35);
      c.lineTo(px + T * 0.75, py + T * 0.85);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(px + T * 0.38, py + T * 0.42, T * 0.24, T * 0.03);
      c.fillRect(px + T * 0.38, py + T * 0.5, T * 0.24, T * 0.03);
    } else {
      c.fillRect(px + T * 0.44, py + T * 0.12, T * 0.12, T * 0.74);
      c.fillRect(px + T * 0.26, py + T * 0.3, T * 0.48, T * 0.12);
    }
    return;
  }
  // stone column / crates
  c.fillStyle = shade(pal.wallFace, 0);
  c.fillRect(px + T * 0.18, py + T * 0.2, T * 0.64, T * 0.66);
  c.fillStyle = shade(pal.wallTop, 10);
  c.fillRect(px + T * 0.14, py + T * 0.12, T * 0.72, T * 0.14);
  c.strokeStyle = 'rgba(0,0,0,0.3)';
  c.lineWidth = T * 0.02;
  c.strokeRect(px + T * 0.18, py + T * 0.2, T * 0.64, T * 0.66);
}
