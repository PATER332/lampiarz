// Layered parallax backgrounds, one set per sector, drawn once into tileable canvases.

import { VIEW_H, VIEW_W } from '../core/consts';
import { AREAS } from '../world/areas';
import { makeCanvas, rect, rgba, seeded, shade, type Ctx, glow, line, px } from './pixel';

export interface BgSet {
  sky: HTMLCanvasElement;
  layers: { cv: HTMLCanvasElement; factor: number; y: number }[];
}

const LW = 960; // layer width (tiles horizontally)
const LH = 360;

const cache = new Map<number, BgSet>();

export function background(area: number): BgSet {
  let s = cache.get(area);
  if (!s) {
    s = build(area);
    cache.set(area, s);
  }
  return s;
}

function build(area: number): BgSet {
  const pal = AREAS[area].palette;
  const [sky, sc] = makeCanvas(VIEW_W, VIEW_H);
  const g = sc.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, pal.sky[0]);
  g.addColorStop(1, pal.sky[1]);
  sc.fillStyle = g;
  sc.fillRect(0, 0, VIEW_W, VIEW_H);
  const r = seeded(area * 991 + 7);
  // faint distant dots (stars / far lights / spores)
  for (let i = 0; i < 90; i++) px(sc, r() * VIEW_W, r() * VIEW_H * 0.8, rgba(area === 4 ? '#e0b3ff' : pal.accent, 0.08 + r() * 0.25));
  if (area === 4) {
    // the rift itself: a swirl of violet light behind everything
    for (let k = 0; k < 5; k++) glow(sc, VIEW_W * (0.3 + k * 0.12), VIEW_H * 0.35 + Math.sin(k) * 30, 60 + k * 10, k % 2 ? '#c45cff' : '#3a0f4a', 0.25);
  }
  const far = makeCanvas(LW, LH);
  const mid = makeCanvas(LW, LH);
  const near = makeCanvas(LW, LH);
  [farLayer, farLayer, farLayer, farLayer, farLayer][area](far[1], area, r);
  midLayer(mid[1], area, r);
  nearLayer(near[1], area, r);
  return {
    sky,
    layers: [
      { cv: far[0], factor: 0.12, y: 0 },
      { cv: mid[0], factor: 0.3, y: 0 },
      { cv: near[0], factor: 0.55, y: 0 },
    ],
  };
}

function farLayer(c: Ctx, area: number, r: () => number) {
  const pal = AREAS[area].palette;
  const base = pal.far;
  if (area === 0 || area === 3) {
    // megastructure: tall blocks with antenna and rows of tiny lights
    let x = 0;
    while (x < LW) {
      const w = 30 + r() * 60;
      const h = 120 + r() * 170;
      const top = LH - h;
      rect(c, x, top, w, h, base);
      rect(c, x, top, w, 2, shade(base, 10));
      if (r() < 0.6) rect(c, x + w / 2, top - 20 - r() * 20, 1, 30, base);
      for (let yy = top + 8; yy < LH - 10; yy += 6 + Math.floor(r() * 4))
        for (let xx = x + 3; xx < x + w - 3; xx += 4) if (r() < 0.12) px(c, xx, yy, rgba(area === 3 ? pal.accent : '#9fb4ff', 0.35 + r() * 0.3));
      if (area === 3 && r() < 0.4) {
        // reactor rings
        const cx = x + w / 2;
        const cy = top + 30;
        c.strokeStyle = rgba(pal.accent, 0.25);
        c.beginPath();
        c.ellipse(cx, cy, w * 0.7, 6, 0, 0, Math.PI * 2);
        c.stroke();
      }
      x += w + 4 + r() * 20;
    }
  } else if (area === 1) {
    // giant organic stalks and pods
    for (let i = 0; i < 14; i++) {
      const x = r() * LW;
      const w = 10 + r() * 22;
      c.fillStyle = base;
      c.beginPath();
      c.moveTo(x - w, LH);
      c.bezierCurveTo(x - w * 0.4, LH * 0.6, x + w * 0.9, LH * 0.4, x + (r() - 0.5) * 40, 40 + r() * 80);
      c.bezierCurveTo(x + w * 1.2, LH * 0.4, x + w * 0.6, LH * 0.6, x + w, LH);
      c.fill();
      for (let k = 0; k < 3; k++) {
        const py = 80 + r() * (LH - 120);
        rect(c, x - 4 + (r() - 0.5) * 10, py, 7, 9, shade(base, 14));
        px(c, x - 1, py + 3, rgba(pal.accent, 0.6));
      }
    }
  } else if (area === 2) {
    // skyline of the underground city with neon signs
    let x = 0;
    while (x < LW) {
      const w = 26 + r() * 50;
      const h = 90 + r() * 200;
      const top = LH - h;
      rect(c, x, top, w, h, base);
      if (r() < 0.5) rect(c, x + 4, top - 8, w - 8, 8, base);
      for (let yy = top + 6; yy < LH - 8; yy += 7)
        for (let xx = x + 3; xx < x + w - 4; xx += 5) if (r() < 0.22) rect(c, xx, yy, 2, 3, rgba(r() < 0.7 ? '#ffcf8a' : '#9fb4ff', 0.25 + r() * 0.3));
      if (r() < 0.45) {
        const sx = x + 4 + r() * (w - 16);
        const sy = top + 12 + r() * 40;
        rect(c, sx, sy, 12, 5, rgba(r() < 0.5 ? pal.accent : pal.accent2, 0.55));
      }
      x += w + 2 + r() * 10;
    }
  } else {
    // the rift: floating rocks and crystals
    for (let i = 0; i < 26; i++) {
      const x = r() * LW;
      const y = 40 + r() * (LH - 120);
      const s = 6 + r() * 26;
      c.fillStyle = base;
      c.beginPath();
      c.moveTo(x - s, y);
      c.lineTo(x - s * 0.4, y - s * 0.5);
      c.lineTo(x + s * 0.6, y - s * 0.4);
      c.lineTo(x + s, y + s * 0.1);
      c.lineTo(x + s * 0.2, y + s * 1.2);
      c.closePath();
      c.fill();
      if (r() < 0.5) line(c, x, y + s * 1.2, x + (r() - 0.5) * 6, y + s * 1.2 + 10 + r() * 20, rgba(pal.accent, 0.3));
    }
  }
}

function midLayer(c: Ctx, area: number, r: () => number) {
  const pal = AREAS[area].palette;
  const base = pal.mid;
  if (area === 0) {
    // catwalks, girders and slow fans
    for (let y = 70; y < LH; y += 90 + Math.floor(r() * 40)) {
      rect(c, 0, y, LW, 3, base);
      for (let x = 0; x < LW; x += 12) line(c, x, y + 3, x + 6, y + 9, base);
      rect(c, 0, y + 9, LW, 1, base);
    }
    for (let i = 0; i < 6; i++) {
      const x = r() * LW;
      const y = 60 + r() * 200;
      const s = 14 + r() * 10;
      c.strokeStyle = base;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, s, 0, Math.PI * 2);
      c.stroke();
      for (let k = 0; k < 4; k++) line(c, x, y, x + Math.cos(k * 1.57 + i) * s, y + Math.sin(k * 1.57 + i) * s, base);
    }
    for (let i = 0; i < 18; i++) {
      const x = r() * LW;
      const len = 20 + r() * 80;
      for (let yy = 0; yy < len; yy++) px(c, x + Math.sin(yy / 9) * 3, yy, base);
    }
  } else if (area === 1) {
    // lab tanks with something floating inside, vines
    for (let i = 0; i < 9; i++) {
      const x = r() * LW;
      const w = 18 + r() * 10;
      const h = 50 + r() * 40;
      const y = LH - h - 20 - r() * 120;
      rect(c, x, y, w, h, shade(base, 4));
      rect(c, x + 2, y + 4, w - 4, h - 8, rgba(pal.accent, 0.12));
      rect(c, x - 2, y, w + 4, 4, base);
      rect(c, x - 2, y + h - 4, w + 4, 4, base);
      rect(c, x + w / 2 - 3, y + h / 2 - 6, 6, 10, rgba('#0b1416', 0.7));
    }
    for (let i = 0; i < 30; i++) {
      const x = r() * LW;
      const len = 30 + r() * 120;
      for (let yy = 0; yy < len; yy++) px(c, x + Math.sin(yy / 7 + i) * 4, yy, base);
    }
  } else if (area === 2) {
    // closer buildings with balconies, pipes and kanji-like neon
    let x = 0;
    while (x < LW) {
      const w = 40 + r() * 70;
      const h = 70 + r() * 170;
      const top = LH - h;
      rect(c, x, top, w, h, base);
      for (let yy = top + 10; yy < LH; yy += 22) rect(c, x - 3, yy, w + 6, 2, shade(base, 8));
      for (let yy = top + 14; yy < LH; yy += 22)
        for (let xx = x + 5; xx < x + w - 8; xx += 10) rect(c, xx, yy, 5, 6, r() < 0.3 ? rgba('#ffcf8a', 0.3) : shade(base, -8));
      if (r() < 0.6) {
        const sx = x + w - 6;
        const sy = top + 20 + r() * 40;
        rect(c, sx, sy, 5, 22, rgba(r() < 0.5 ? pal.accent : pal.accent2, 0.6));
      }
      x += w + 6 + r() * 30;
    }
  } else if (area === 3) {
    // conduits carrying energy
    for (let i = 0; i < 7; i++) {
      const y = 40 + r() * (LH - 80);
      rect(c, 0, y, LW, 6, base);
      rect(c, 0, y + 2, LW, 1, rgba(pal.accent, 0.25));
      for (let x = r() * 40; x < LW; x += 40 + r() * 40) rect(c, x, y - 2, 4, 10, shade(base, 10));
    }
    for (let i = 0; i < 8; i++) {
      const x = r() * LW;
      rect(c, x, 0, 8, LH, base);
      for (let y = 0; y < LH; y += 16) rect(c, x, y, 8, 1, shade(base, 10));
    }
  } else {
    // crystal spires and tendrils
    for (let i = 0; i < 16; i++) {
      const x = r() * LW;
      const h = 60 + r() * 160;
      const w = 6 + r() * 10;
      c.fillStyle = base;
      c.beginPath();
      c.moveTo(x - w, LH);
      c.lineTo(x, LH - h);
      c.lineTo(x + w, LH);
      c.fill();
      line(c, x, LH - h + 4, x, LH - h + h * 0.4, rgba(pal.accent, 0.35));
    }
  }
}

function nearLayer(c: Ctx, area: number, r: () => number) {
  // foreground-ish silhouettes at the bottom of the background (very dark), plus hanging cables
  const pal = AREAS[area].palette;
  const col = shade(pal.wallLo, 6);
  for (let i = 0; i < 12; i++) {
    const x = r() * LW;
    const w = 20 + r() * 50;
    const h = 20 + r() * 60;
    rect(c, x, LH - h, w, h, col);
    if (area === 2 && r() < 0.5) rect(c, x + 4, LH - h + 6, w - 8, 2, rgba(pal.accent, 0.25));
    if (area === 3 && r() < 0.5) rect(c, x + 2, LH - h + 3, 2, h - 6, rgba(pal.accent, 0.2));
  }
  for (let i = 0; i < 10; i++) {
    const x0 = r() * LW;
    const x1 = x0 + 30 + r() * 80;
    const sag = 10 + r() * 30;
    for (let x = x0; x < x1; x++) {
      const t = (x - x0) / (x1 - x0);
      px(c, x, 4 * t * (1 - t) * sag + 2, col);
    }
  }
}
