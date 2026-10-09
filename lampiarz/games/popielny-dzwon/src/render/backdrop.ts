// Procedural parallax backdrops. Each location gets three silhouette layers that
// tile horizontally, generated once per location and cached as canvases.
import { LOCATIONS, type LocationId } from '../data/content';
import { glow, makeCanvas, mix, rgba, srand, type Ctx } from './paint';

export type Scene = LocationId | 'krypta';

export interface Backdrop {
  scene: Scene;
  sky: [string, string, string];
  fog: string;
  light: string;
  layers: { canvas: HTMLCanvasElement; factor: number; y: number }[];
  /** rays of light for interior scenes */
  rays: boolean;
}

const LW = 1536; // layer width (tiles horizontally)
const LH = 544;

export const KRYPTA_PALETTE = {
  sky: ['#060404', '#170d0a', '#2a1710'] as [string, string, string],
  far: '#1c110d',
  mid: '#140c09',
  near: '#0a0605',
  tile: '#2b211c',
  tileHi: '#5b4433',
  tileLo: '#150f0c',
  rim: '#e39a5a',
  light: '#ff9a4a',
  accent: '#e8a050',
  fog: '#3a2218',
};

export function paletteOf(scene: Scene) {
  return scene === 'krypta' ? KRYPTA_PALETTE : LOCATIONS[scene].palette;
}

/** Draw something at x and its horizontal wrap so layers tile seamlessly. */
function wrap(x: number, w: number, draw: (x: number, rr: () => number) => void) {
  // each copy gets an identical random stream so the seam matches
  const seed = Math.floor(x * 977) + 7;
  draw(x, srand(seed));
  if (x + w > LW) draw(x - LW, srand(seed));
  if (x < 0) draw(x + LW, srand(seed));
}

function gable(g: Ctx, x: number, base: number, w: number, h: number, roof: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, base);
  g.lineTo(x, base - h);
  g.lineTo(x + w / 2, base - h - roof);
  g.lineTo(x + w, base - h);
  g.lineTo(x + w, base);
  g.closePath();
  g.fill();
}

function spire(g: Ctx, x: number, base: number, w: number, h: number, sp: number, color: string) {
  g.fillStyle = color;
  g.fillRect(x, base - h, w, h);
  g.beginPath();
  g.moveTo(x - 3, base - h);
  g.lineTo(x + w / 2, base - h - sp);
  g.lineTo(x + w + 3, base - h);
  g.fill();
}

function windows(g: Ctx, x: number, y: number, w: number, h: number, r: () => number, lit: string, chance: number) {
  for (let wy = y + 10; wy < y + h - 14; wy += 22)
    for (let wx = x + 6; wx < x + w - 10; wx += 16) {
      if (r() > chance) continue;
      g.fillStyle = rgba(lit, 0.35 + r() * 0.5);
      g.fillRect(wx, wy, 5, 8);
      glow(g, wx + 2.5, wy + 4, 14, lit, 0.15);
    }
}

function gothicWindow(g: Ctx, x: number, top: number, w: number, h: number, glass: string, frame: string) {
  g.save();
  g.beginPath();
  g.moveTo(x, top + h);
  g.lineTo(x, top + w * 0.6);
  g.quadraticCurveTo(x, top, x + w / 2, top - w * 0.15);
  g.quadraticCurveTo(x + w, top, x + w, top + w * 0.6);
  g.lineTo(x + w, top + h);
  g.closePath();
  const grd = g.createLinearGradient(0, top, 0, top + h);
  grd.addColorStop(0, rgba(glass, 0.55));
  grd.addColorStop(1, rgba(glass, 0.12));
  g.fillStyle = grd;
  g.fill();
  g.clip();
  // leading of the stained glass
  g.strokeStyle = frame;
  g.lineWidth = 2;
  for (let i = 1; i < 3; i++) {
    g.beginPath();
    g.moveTo(x + (w * i) / 3, top);
    g.lineTo(x + (w * i) / 3, top + h);
    g.stroke();
  }
  for (let yy = top + 20; yy < top + h; yy += 26) {
    g.beginPath();
    g.moveTo(x, yy);
    g.lineTo(x + w, yy);
    g.stroke();
  }
  g.restore();
}

function tree(g: Ctx, x: number, base: number, h: number, color: string, r: () => number) {
  g.fillStyle = color;
  g.fillRect(x - 3, base - h * 0.5, 6, h * 0.5);
  // cypress-like flame shape
  g.beginPath();
  g.moveTo(x, base - h);
  g.quadraticCurveTo(x + h * 0.16, base - h * 0.55, x + h * 0.1, base - h * 0.18);
  g.lineTo(x - h * 0.1, base - h * 0.18);
  g.quadraticCurveTo(x - h * 0.16, base - h * 0.55, x, base - h);
  g.fill();
  if (r() < 0.5) {
    g.beginPath();
    g.arc(x + (r() - 0.5) * 20, base - h * 0.7, h * 0.12, 0, Math.PI * 2);
    g.fill();
  }
}

function monk(g: Ctx, x: number, base: number, s: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x - 16 * s, base);
  g.quadraticCurveTo(x - 18 * s, base - 30 * s, x - 6 * s, base - 40 * s);
  g.arc(x, base - 44 * s, 8 * s, Math.PI * 0.9, Math.PI * 0.1);
  g.quadraticCurveTo(x + 18 * s, base - 30 * s, x + 18 * s, base);
  g.closePath();
  g.fill();
}

function column(g: Ctx, x: number, w: number, color: string, hi: string) {
  g.fillStyle = color;
  g.fillRect(x, 0, w, LH);
  g.fillStyle = hi;
  g.fillRect(x + w * 0.15, 0, 2, LH);
  // capital
  g.fillStyle = color;
  g.fillRect(x - 8, 90, w + 16, 14);
  g.fillRect(x - 6, LH - 80, w + 12, 12);
}

function arch(g: Ctx, x: number, w: number, top: number, color: string, thick: number) {
  g.strokeStyle = color;
  g.lineWidth = thick;
  g.beginPath();
  g.moveTo(x, top + w * 0.7);
  g.quadraticCurveTo(x, top, x + w / 2, top - w * 0.12);
  g.quadraticCurveTo(x + w, top, x + w, top + w * 0.7);
  g.stroke();
}

function chain(g: Ctx, x: number, len: number, color: string) {
  g.strokeStyle = color;
  g.lineWidth = 2;
  for (let y = 0; y < len; y += 9) {
    g.beginPath();
    g.ellipse(x, y + 4, 2.5, 4.5, 0, 0, Math.PI * 2);
    g.stroke();
  }
}

// ------------------------------------------------------------------ builders
function buildRynek(pal: ReturnType<typeof paletteOf>) {
  const r = srand(11);
  const [far, gf] = makeCanvas(LW, LH);
  // distant city: gables and church spires
  const base = 400;
  for (let x = -40; x < LW; x += 40 + r() * 50) {
    const w = 50 + r() * 60;
    wrap(x, w, (xx, rr) => gable(gf, xx, base + 40, w, 70 + rr() * 90, 20 + rr() * 40, pal.far));
  }
  for (let i = 0; i < 4; i++) {
    const x = 120 + i * 380 + r() * 120;
    wrap(x, 30, (xx, rr) => spire(gf, xx, base, 26 + rr() * 10, 150 + rr() * 70, 90 + rr() * 50, pal.far));
  }
  // the bell tower, slightly brighter rim
  wrap(700, 70, (xx) => {
    spire(gf, xx, base + 10, 70, 290, 130, mix(pal.far, '#000', 0.1));
    gf.fillStyle = rgba(pal.light, 0.22);
    gf.fillRect(xx + 22, base - 250, 26, 34);
    glow(gf, xx + 35, base - 233, 70, pal.light, 0.2);
  });
  gf.fillStyle = pal.far;
  gf.fillRect(0, base + 30, LW, LH);

  const [mid, gm] = makeCanvas(LW, LH);
  for (let x = -60; x < LW; x += 90 + r() * 80) {
    const w = 80 + r() * 70;
    const h = 120 + r() * 120;
    wrap(x, w, (xx, rr) => {
      gable(gm, xx, 470, w, h, 30 + rr() * 30, pal.mid);
      // chimney
      gm.fillStyle = pal.mid;
      if (rr() < 0.6) gm.fillRect(xx + w * 0.7, 470 - h - 40, 12, 40);
      windows(gm, xx, 470 - h, w, h, rr, pal.light, 0.28);
    });
  }
  gm.fillStyle = pal.mid;
  gm.fillRect(0, 460, LW, LH);

  const [near, gn] = makeCanvas(LW, LH);
  for (let x = 0; x < LW; x += 260 + r() * 200) {
    const kind = r();
    wrap(x, 140, (xx) => {
      gn.fillStyle = pal.near;
      if (kind < 0.35) {
        // gallows
        gn.fillRect(xx, 330, 10, 200);
        gn.fillRect(xx, 330, 90, 9);
        gn.fillRect(xx + 6, 360, 30, 6);
        gn.strokeStyle = pal.near;
        gn.lineWidth = 2;
        gn.beginPath();
        gn.moveTo(xx + 78, 338);
        gn.lineTo(xx + 78, 380);
        gn.stroke();
      } else if (kind < 0.7) {
        // broken cart
        gn.beginPath();
        gn.arc(xx + 30, 500, 26, 0, Math.PI * 2);
        gn.fill();
        gn.fillRect(xx, 470, 120, 14);
        gn.fillRect(xx + 100, 440, 8, 40);
      } else {
        // a leaning lamp post
        gn.save();
        gn.translate(xx + 20, 540);
        gn.rotate(-0.08);
        gn.fillRect(-4, -200, 8, 200);
        gn.fillRect(-18, -205, 36, 8);
        gn.restore();
      }
    });
  }
  return [
    { canvas: far, factor: 0.12, y: 0 },
    { canvas: mid, factor: 0.3, y: 20 },
    { canvas: near, factor: 0.55, y: 60 },
  ];
}

function buildOgrod(pal: ReturnType<typeof paletteOf>) {
  const r = srand(23);
  const [far, gf] = makeCanvas(LW, LH);
  // rolling hills and the monastery
  gf.fillStyle = pal.far;
  gf.beginPath();
  gf.moveTo(0, LH);
  for (let x = 0; x <= LW; x += 16) gf.lineTo(x, 360 + Math.sin((x / LW) * Math.PI * 4) * 30 + Math.sin((x / LW) * Math.PI * 10) * 12);
  gf.lineTo(LW, LH);
  gf.fill();
  wrap(500, 240, (xx, rr) => {
    gf.fillStyle = pal.far;
    gf.fillRect(xx, 230, 240, 160);
    spire(gf, xx + 30, 240, 40, 80, 90, pal.far);
    spire(gf, xx + 170, 240, 34, 60, 70, pal.far);
    windows(gf, xx, 250, 240, 100, rr, pal.light, 0.15);
  });
  for (let x = 0; x < LW; x += 30 + r() * 40) {
    const h = 60 + r() * 60;
    wrap(x, 30, (xx, rr) => tree(gf, xx, 380, h, mix(pal.far, '#000', 0.15), rr));
  }

  const [mid, gm] = makeCanvas(LW, LH);
  for (let x = 0; x < LW; x += 70 + r() * 70) {
    const h = 150 + r() * 150;
    wrap(x, 40, (xx, rr) => tree(gm, xx, 500, h, pal.mid, rr));
  }
  for (let x = 40; x < LW; x += 200 + r() * 160) wrap(x, 40, (xx, rr) => monk(gm, xx, 500, 1.4 + rr() * 0.5, mix(pal.mid, pal.rim, 0.08)));
  gm.fillStyle = pal.mid;
  gm.fillRect(0, 490, LW, LH);

  const [near, gn] = makeCanvas(LW, LH);
  // weeping willow curtains and tall grass
  for (let x = 0; x < LW; x += 300 + r() * 200) {
    wrap(x, 220, (xx, rr) => {
      gn.strokeStyle = pal.near;
      gn.lineWidth = 3;
      for (let i = 0; i < 26; i++) {
        const sx = xx + i * 8;
        gn.beginPath();
        gn.moveTo(sx, 0);
        gn.quadraticCurveTo(sx + 10, 120, sx + (rr() - 0.5) * 20, 160 + rr() * 140);
        gn.stroke();
      }
    });
  }
  gn.fillStyle = pal.near;
  for (let x = 0; x < LW; x += 6) {
    const h = 20 + r() * 50;
    gn.beginPath();
    gn.moveTo(x, LH);
    gn.lineTo(x + 2, LH - h);
    gn.lineTo(x + 5, LH);
    gn.fill();
  }
  return [
    { canvas: far, factor: 0.1, y: 0 },
    { canvas: mid, factor: 0.28, y: 10 },
    { canvas: near, factor: 0.6, y: 40 },
  ];
}

function buildKatedra(pal: ReturnType<typeof paletteOf>) {
  const r = srand(37);
  const [far, gf] = makeCanvas(LW, LH);
  gf.fillStyle = pal.far;
  gf.fillRect(0, 0, LW, LH);
  for (let x = 40; x < LW; x += 256) {
    wrap(x, 110, (xx) => gothicWindow(gf, xx, 110, 110, 300, '#c2492f', mix(pal.far, '#000', 0.3)));
  }
  // rose window
  wrap(700, 160, (xx) => {
    const cx = xx + 80;
    gf.fillStyle = rgba('#d8813a', 0.35);
    gf.beginPath();
    gf.arc(cx, 60, 70, 0, Math.PI * 2);
    gf.fill();
    gf.strokeStyle = mix(pal.far, '#000', 0.3);
    gf.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      gf.beginPath();
      gf.moveTo(cx, 60);
      gf.lineTo(cx + Math.cos(a) * 70, 60 + Math.sin(a) * 70);
      gf.stroke();
    }
  });
  const [mid, gm] = makeCanvas(LW, LH);
  for (let x = 0; x < LW; x += 192) {
    wrap(x, 60, (xx, rr) => {
      column(gm, xx, 46, pal.mid, mix(pal.mid, pal.rim, 0.15));
      arch(gm, xx + 46, 146, 120, pal.mid, 16);
      // a torn banner
      if (rr() < 0.6) {
        gm.fillStyle = mix(pal.mid, '#5a1010', 0.4);
        gm.beginPath();
        gm.moveTo(xx + 90, 140);
        gm.lineTo(xx + 140, 140);
        gm.lineTo(xx + 140, 260 + rr() * 40);
        gm.lineTo(xx + 115, 240);
        gm.lineTo(xx + 90, 270);
        gm.fill();
      }
    });
  }
  const [near, gn] = makeCanvas(LW, LH);
  for (let x = 0; x < LW; x += 140 + r() * 160) {
    const len = 80 + r() * 260;
    wrap(x, 10, (xx) => chain(gn, xx, len, pal.near));
    if (r() < 0.4)
      wrap(x, 60, (xx) => {
        // candelabrum ring
        gn.fillStyle = pal.near;
        gn.fillRect(xx - 30, len, 60, 5);
        for (let i = -2; i <= 2; i++) gn.fillRect(xx + i * 13 - 1, len - 10, 3, 10);
      });
  }
  return [
    { canvas: far, factor: 0.12, y: 0 },
    { canvas: mid, factor: 0.32, y: 0 },
    { canvas: near, factor: 0.7, y: 0 },
  ];
}

function buildKrypta(pal: ReturnType<typeof paletteOf>) {
  const r = srand(51);
  const [far, gf] = makeCanvas(LW, LH);
  gf.fillStyle = pal.far;
  gf.fillRect(0, 0, LW, LH);
  // brick vault
  gf.fillStyle = mix(pal.far, '#000', 0.25);
  for (let y = 0; y < LH; y += 14)
    for (let x = (y / 14) % 2 ? 0 : 14; x < LW; x += 28) if (r() < 0.5) gf.fillRect(x, y, 26, 1);
  for (let x = 0; x < LW; x += 220) wrap(x, 200, (xx) => arch(gf, xx + 20, 180, 120, mix(pal.far, '#000', 0.4), 22));
  const [mid, gm] = makeCanvas(LW, LH);
  // shelves with bell moulds
  for (let x = 30; x < LW; x += 260) {
    wrap(x, 200, (xx, rr) => {
      gm.fillStyle = pal.mid;
      gm.fillRect(xx, 250, 180, 8);
      gm.fillRect(xx, 330, 180, 8);
      for (let i = 0; i < 4; i++) {
        const bx = xx + 20 + i * 42;
        const s = 0.6 + rr() * 0.5;
        gm.beginPath();
        gm.moveTo(bx - 14 * s, 250);
        gm.quadraticCurveTo(bx - 12 * s, 250 - 34 * s, bx, 250 - 38 * s);
        gm.quadraticCurveTo(bx + 12 * s, 250 - 34 * s, bx + 14 * s, 250);
        gm.fill();
      }
    });
  }
  const [near, gn] = makeCanvas(LW, LH);
  for (let x = 0; x < LW; x += 200 + r() * 200) {
    const len = 60 + r() * 140;
    wrap(x, 10, (xx) => chain(gn, xx, len, pal.near));
  }
  return [
    { canvas: far, factor: 0.15, y: 0 },
    { canvas: mid, factor: 0.35, y: 30 },
    { canvas: near, factor: 0.7, y: 0 },
  ];
}

const built = new Map<Scene, Backdrop>();

export function getBackdrop(scene: Scene): Backdrop {
  let b = built.get(scene);
  if (b) return b;
  const pal = paletteOf(scene);
  const layers = scene === 'rynek' ? buildRynek(pal) : scene === 'ogrod' ? buildOgrod(pal) : scene === 'katedra' ? buildKatedra(pal) : buildKrypta(pal);
  // bake the fog that sits in front of each layer into the layer itself
  layers.forEach((L, i) => {
    const lg = L.canvas.getContext('2d')!;
    const fg = lg.createLinearGradient(0, LH * 0.45, 0, LH);
    fg.addColorStop(0, rgba(pal.fog, 0));
    fg.addColorStop(1, rgba(pal.fog, 0.22 + i * 0.05));
    lg.fillStyle = fg;
    lg.fillRect(0, LH * 0.45, LW, LH * 0.55);
  });
  b = { scene, sky: pal.sky, fog: pal.fog, light: pal.light, layers, rays: scene === 'katedra' || scene === 'krypta' };
  built.set(scene, b);
  return b;
}

/** Paint the sky, celestial glow and parallax layers for a camera position. */
const skies = new Map<string, HTMLCanvasElement>();

/** Sky gradient and moon, cached per scene and view size. */
function skyCanvas(b: Backdrop, viewW: number, viewH: number) {
  const key = `${b.scene}:${viewW}x${viewH}`;
  let c = skies.get(key);
  if (c) return c;
  const [cv, g] = makeCanvas(viewW, viewH);
  const sky = g.createLinearGradient(0, 0, 0, viewH);
  sky.addColorStop(0, b.sky[0]);
  sky.addColorStop(0.55, b.sky[1]);
  sky.addColorStop(1, b.sky[2]);
  g.fillStyle = sky;
  g.fillRect(0, 0, viewW, viewH);
  if (b.scene === 'rynek' || b.scene === 'ogrod') {
    // a sick moon behind the haze
    const mx = viewW * 0.72;
    const my = b.scene === 'rynek' ? 110 : 90;
    glow(g, mx, my, 240, b.scene === 'rynek' ? '#c9a77a' : '#9fd6c0', 0.18);
    g.fillStyle = b.scene === 'rynek' ? 'rgba(226,206,170,0.55)' : 'rgba(200,236,220,0.45)';
    g.beginPath();
    g.arc(mx, my, 34, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = b.sky[1];
    g.globalAlpha = 0.5;
    g.beginPath();
    g.arc(mx + 12, my - 6, 30, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  if (skies.size > 12) skies.clear();
  skies.set(key, cv);
  return cv;
}

/** Paint the sky, celestial glow and parallax layers for a camera position. */
export function drawBackdrop(g: Ctx, b: Backdrop, camX: number, viewW: number, viewH: number, time: number, camY = 0, rays = true) {
  g.drawImage(skyCanvas(b, viewW, viewH), 0, 0);
  for (const L of b.layers) {
    let x = -((camX * L.factor) % LW);
    if (x > 0) x -= LW;
    for (; x < viewW; x += LW) g.drawImage(L.canvas, Math.floor(x), Math.round(L.y + 30 - camY * L.factor * 1.2));
  }
  if (b.rays && rays) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = ((i * 420 - camX * 0.25) % (viewW + 600)) + (i % 2 ? 80 : -60);
      const xx = x < -300 ? x + viewW + 600 : x;
      const a = 0.035 + Math.sin(time * 0.4 + i) * 0.015;
      const grd = g.createLinearGradient(xx, 0, xx + 260, viewH);
      grd.addColorStop(0, rgba(b.light, a * 1.6));
      grd.addColorStop(1, rgba(b.light, 0));
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(xx, 0);
      g.lineTo(xx + 70, 0);
      g.lineTo(xx + 330, viewH);
      g.lineTo(xx + 170, viewH);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
}
