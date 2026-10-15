// Procedural, tileable material textures (albedo + normal map) painted on canvases.
// Everything is generated at load time — no image files.

export interface TexPair {
  albedo: HTMLCanvasElement;
  normal: HTMLCanvasElement;
}

const SIZE = 512;

function hash(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value-noise fbm into a Float32Array (0..1). */
export function fbm(size: number, base: number, octaves: number, seed: number, gain = 0.5): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = base << o;
    const step = size / cells;
    for (let y = 0; y < size; y++) {
      const fy = y / step;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = x / step;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = hash(x0 % cells, y0 % cells, seed + o);
        const b = hash((x0 + 1) % cells, y0 % cells, seed + o);
        const c = hash(x0 % cells, (y0 + 1) % cells, seed + o);
        const d = hash((x0 + 1) % cells, (y0 + 1) % cells, seed + o);
        out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function canvas(size = SIZE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d', { willReadFrequently: true })!] as const;
}

/** Normal map from a height field (tangent space, green = up in the image). */
function normalFromHeight(h: Float32Array, size: number, strength: number): HTMLCanvasElement {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx;
      let ny = dy;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

/** Combine a base colour with noise into an albedo canvas. */
function paint(size: number, fn: (x: number, y: number, i: number) => [number, number, number]): HTMLCanvasElement {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const [r, gg, b] = fn(x, y, i);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = gg;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

export type MaterialName =
  | 'wall'
  | 'wallLab'
  | 'concrete'
  | 'metalWall'
  | 'floorTile'
  | 'floorRubber'
  | 'floorConcrete'
  | 'ceiling'
  | 'darkMetal'
  | 'steel'
  | 'wood'
  | 'plastic'
  | 'hazard'
  | 'rust'
  | 'fabric'
  | 'paper';

/** Every material texture generator. Each runs in ~10–60 ms. */
export const GENERATORS: Record<MaterialName, () => TexPair> = {
  // painted plaster over concrete: pale grey-green, darker lower band, grime near the floor
  wall: () => {
    const n = fbm(SIZE, 4, 5, 11);
    const fine = fbm(SIZE, 64, 2, 12);
    const h = new Float32Array(SIZE * SIZE);
    const alb = paint(SIZE, (_x, y, i) => {
      // texture spans 2 m horizontally and 2 m vertically; lower 1/2.. band
      const v = y / SIZE;
      const band = v > 0.62 ? 1 : 0;
      const seam = v > 0.615 && v < 0.63 ? 1 : 0;
      const grime = Math.max(0, (v - 0.75) * 3) * n[i];
      h[i] = n[i] * 0.4 + fine[i] * 0.15 - seam * 0.6;
      const base = band ? [74, 86, 84] : [128, 134, 130];
      const k = 0.82 + n[i] * 0.3 + fine[i] * 0.06 - grime * 0.5 - seam * 0.35;
      return [clamp255(base[0] * k), clamp255(base[1] * k), clamp255(base[2] * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 3) };
  },
  wallLab: () => {
    // glazed tiles, 20 cm
    const n = fbm(SIZE, 8, 4, 21);
    const h = new Float32Array(SIZE * SIZE);
    const tile = SIZE / 10;
    const alb = paint(SIZE, (x, y, i) => {
      const gx = x % tile < 2 || y % tile < 2;
      const cracked = hash(Math.floor(x / tile), Math.floor(y / tile), 3) > 0.93;
      h[i] = gx ? 0 : 0.6 + n[i] * 0.05;
      const k = gx ? 0.55 : 0.92 + n[i] * 0.12 - (cracked ? 0.15 : 0);
      return [clamp255(178 * k), clamp255(190 * k), clamp255(186 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 6) };
  },
  concrete: () => {
    const n = fbm(SIZE, 4, 6, 31);
    const p = fbm(SIZE, 32, 3, 32);
    const h = new Float32Array(SIZE * SIZE);
    const alb = paint(SIZE, (_x, y, i) => {
      // form-work lines every metre
      const line = y % (SIZE / 2) < 2 ? 1 : 0;
      const pit = p[i] > 0.72 ? (p[i] - 0.72) * 4 : 0;
      h[i] = n[i] * 0.5 - pit * 0.6 - line * 0.4;
      const k = 0.7 + n[i] * 0.45 - pit * 0.4 - line * 0.25;
      return [clamp255(112 * k), clamp255(112 * k), clamp255(110 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 4) };
  },
  metalWall: () => {
    // riveted steel panels 1 × 1 m
    const n = fbm(SIZE, 4, 5, 41);
    const s = fbm(SIZE, 2, 3, 42);
    const h = new Float32Array(SIZE * SIZE);
    const pan = SIZE / 2;
    const alb = paint(SIZE, (x, y, i) => {
      const lx = x % pan;
      const ly = y % pan;
      const seam = lx < 3 || ly < 3 ? 1 : 0;
      const rivet = [10, pan - 10].some((a) => [10, pan - 10].some((b) => Math.hypot(lx - a, ly - b) < 4)) ? 1 : 0;
      const streak = Math.max(0, s[i] - 0.55) * 2 * (ly / pan);
      h[i] = 0.5 - seam * 0.5 + rivet * 0.5 + n[i] * 0.1;
      const k = 0.75 + n[i] * 0.2 - seam * 0.3 + rivet * 0.25;
      return [clamp255(86 * k + streak * 40), clamp255(92 * k + streak * 18), clamp255(98 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 5) };
  },
  floorTile: () => {
    // worn vinyl tiles 50 cm, two tones
    const n = fbm(SIZE, 4, 5, 51);
    const w = fbm(SIZE, 8, 3, 52);
    const h = new Float32Array(SIZE * SIZE);
    const t = SIZE / 4;
    const alb = paint(SIZE, (x, y, i) => {
      const gx = x % t < 2 || y % t < 2;
      const alt = (Math.floor(x / t) + Math.floor(y / t)) % 2;
      const wear = Math.max(0, w[i] - 0.5) * 1.5;
      h[i] = gx ? 0.2 : 0.5 + n[i] * 0.05;
      const base = alt ? [96, 100, 96] : [128, 128, 120];
      const k = (gx ? 0.5 : 0.85 + n[i] * 0.25) - wear * 0.25;
      return [clamp255(base[0] * k), clamp255(base[1] * k), clamp255(base[2] * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 3) };
  },
  floorRubber: () => {
    // studded rubber, dark
    const n = fbm(SIZE, 4, 5, 61);
    const h = new Float32Array(SIZE * SIZE);
    const st = SIZE / 16;
    const alb = paint(SIZE, (x, y, i) => {
      const dx = (x % st) - st / 2;
      const dy = (y % st) - st / 2;
      const stud = Math.hypot(dx, dy) < st * 0.3 ? 1 : 0;
      h[i] = stud * 0.6 + n[i] * 0.15;
      const k = 0.6 + n[i] * 0.35 + stud * 0.08;
      return [clamp255(58 * k), clamp255(62 * k), clamp255(64 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 4) };
  },
  floorConcrete: () => {
    const n = fbm(SIZE, 4, 6, 71);
    const c = fbm(SIZE, 16, 3, 72);
    const h = new Float32Array(SIZE * SIZE);
    const alb = paint(SIZE, (_x, _y, i) => {
      const crack = Math.abs(c[i] - 0.5) < 0.006 ? 1 : 0;
      const stain = Math.max(0, n[i] - 0.62) * 2;
      h[i] = n[i] * 0.3 - crack * 0.8;
      const k = 0.68 + n[i] * 0.4 - crack * 0.4 - stain * 0.3;
      return [clamp255(98 * k), clamp255(96 * k), clamp255(92 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 4) };
  },
  ceiling: () => {
    // suspended acoustic tiles 60 cm with grid
    const n = fbm(SIZE, 32, 3, 81);
    const s = fbm(SIZE, 4, 4, 82);
    const h = new Float32Array(SIZE * SIZE);
    const t = SIZE / 4;
    const alb = paint(SIZE, (x, y, i) => {
      const grid = x % t < 4 || y % t < 4;
      const stain = Math.max(0, s[i] - 0.6) * 2.5;
      h[i] = grid ? 0.8 : 0.3 + n[i] * 0.2;
      const k = grid ? 0.55 : 0.78 + n[i] * 0.2 - stain * 0.4;
      return [clamp255(150 * k), clamp255(148 * k + (grid ? 0 : -stain * 20)), clamp255(140 * k - stain * 25)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 3) };
  },
  darkMetal: () => {
    const n = fbm(SIZE, 4, 5, 91);
    const b = fbm(SIZE, 128, 1, 92);
    const h = new Float32Array(SIZE * SIZE);
    const alb = paint(SIZE, (_x, _y, i) => {
      const scratch = b[i] > 0.92 ? 1 : 0;
      h[i] = n[i] * 0.2 - scratch * 0.2;
      const k = 0.7 + n[i] * 0.3 + scratch * 0.4;
      return [clamp255(52 * k), clamp255(56 * k), clamp255(60 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 2) };
  },
  steel: () => {
    // brushed steel: horizontal streaks
    const n = fbm(SIZE, 4, 4, 101);
    const h = new Float32Array(SIZE * SIZE);
    const rows = new Float32Array(SIZE);
    for (let y = 0; y < SIZE; y++) rows[y] = hash(0, y, 7);
    const alb = paint(SIZE, (_x, y, i) => {
      h[i] = rows[y] * 0.15;
      const k = 0.8 + rows[y] * 0.15 + n[i] * 0.15;
      return [clamp255(140 * k), clamp255(144 * k), clamp255(148 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 2) };
  },
  wood: () => {
    const n = fbm(SIZE, 4, 4, 111);
    const h = new Float32Array(SIZE * SIZE);
    const alb = paint(SIZE, (x, y, i) => {
      const ring = Math.sin((y / SIZE) * 60 + n[i] * 12) * 0.5 + 0.5;
      h[i] = ring * 0.2;
      const k = 0.65 + ring * 0.25 + n[i] * 0.2;
      void x;
      return [clamp255(98 * k), clamp255(70 * k), clamp255(48 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 1.5) };
  },
  plastic: () => {
    const n = fbm(SIZE, 16, 3, 121);
    const h = new Float32Array(SIZE * SIZE);
    const alb = paint(SIZE, (_x, _y, i) => {
      h[i] = n[i] * 0.05;
      const k = 0.88 + n[i] * 0.12;
      return [clamp255(168 * k), clamp255(160 * k), clamp255(140 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 1) };
  },
  hazard: () => {
    const n = fbm(SIZE, 8, 4, 131);
    const h = new Float32Array(SIZE * SIZE);
    const alb = paint(SIZE, (x, y, i) => {
      const stripe = Math.floor((x + y) / (SIZE / 8)) % 2 === 0;
      const wear = Math.max(0, n[i] - 0.6) * 2;
      h[i] = n[i] * 0.1;
      const c = stripe ? [190, 150, 30] : [30, 30, 30];
      const k = 0.85 + n[i] * 0.2 - wear * 0.5;
      return [clamp255(c[0] * k), clamp255(c[1] * k), clamp255(c[2] * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 1) };
  },
  rust: () => {
    const n = fbm(SIZE, 4, 6, 141);
    const m = fbm(SIZE, 16, 3, 142);
    const h = new Float32Array(SIZE * SIZE);
    const alb = paint(SIZE, (_x, _y, i) => {
      const r = Math.max(0, m[i] - 0.45) * 2;
      h[i] = n[i] * 0.4 + r * 0.2;
      const k = 0.6 + n[i] * 0.5;
      return [clamp255((70 + r * 70) * k), clamp255((72 + r * 20) * k), clamp255((74 - r * 30) * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 3) };
  },
  fabric: () => {
    const h = new Float32Array(SIZE * SIZE);
    const alb = paint(SIZE, (x, y, i) => {
      const weave = ((x >> 1) + (y >> 1)) % 2;
      h[i] = weave * 0.2;
      const k = 0.8 + weave * 0.1 + hash(x, y, 9) * 0.1;
      return [clamp255(46 * k), clamp255(48 * k), clamp255(56 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 2) };
  },
  paper: () => {
    const n = fbm(SIZE, 16, 3, 151);
    const h = new Float32Array(SIZE * SIZE);
    const alb = paint(SIZE, (_x, y, i) => {
      const line = y % 24 < 2 && y > 60 ? 1 : 0;
      h[i] = n[i] * 0.05;
      const k = 0.9 + n[i] * 0.1 - line * 0.35;
      return [clamp255(222 * k), clamp255(216 * k), clamp255(196 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, SIZE, 1) };
  },
};

/** Text plaque (door signs, labels). */
export function signCanvas(text: string, sub = '', opts: { bg?: string; fg?: string; w?: number; h?: number } = {}): HTMLCanvasElement {
  const w = opts.w ?? 512;
  const h = opts.h ?? 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = opts.bg ?? '#1c2a2a';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 4;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = opts.fg ?? '#dfe6df';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(h * (sub ? 0.36 : 0.46))}px "NS Display", "Arial Narrow", sans-serif`;
  g.fillText(text, w / 2, sub ? h * 0.4 : h / 2, w - 30);
  if (sub) {
    g.font = `${Math.round(h * 0.2)}px "NS Sans", sans-serif`;
    g.globalAlpha = 0.7;
    g.fillText(sub, w / 2, h * 0.76, w - 30);
  }
  // grime
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  return c;
}
