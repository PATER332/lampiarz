// Procedural, tileable material textures (albedo + normal map) and decal images,
// painted on canvases at load time. No image files are used.

export interface TexPair {
  albedo: HTMLCanvasElement;
  normal: HTMLCanvasElement;
}

function hash(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value-noise fbm (0..1). */
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

export function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!] as const;
}

function normalFromHeight(h: Float32Array, size: number, strength: number): HTMLCanvasElement {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

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

const C = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const S = 512;
const M = 256;

export type MaterialName =
  | 'wallpaper'
  | 'wallpaperDirty'
  | 'carpet'
  | 'ceilingTile'
  | 'concrete'
  | 'concreteRed'
  | 'floorConcrete'
  | 'floorWet'
  | 'metalPanel'
  | 'grating'
  | 'paint'
  | 'wood'
  | 'darkMetal'
  | 'steel'
  | 'rust'
  | 'cardboard'
  | 'fabric'
  | 'orange'
  | 'paper'
  | 'skinPale'
  | 'skinGrey'
  | 'mask'
  | 'gunMetal'
  | 'gunGrip'
  | 'plastic'
  | 'hazard'
  | 'diffuser';

export const GENERATORS: Record<MaterialName, () => TexPair> = {
  // yellow backrooms wallpaper: faint vertical pattern, seams every 53 cm, water stains from above, grime at the skirting
  wallpaper: () => {
    const n = fbm(S, 4, 5, 11);
    const st = fbm(S, 2, 4, 12);
    const f = fbm(S, 64, 2, 13);
    const h = new Float32Array(S * S);
    const alb = paint(S, (x, y, i) => {
      const v = y / S; // 0 top of the wall .. 1 floor
      const u = x / S;
      // a faint chevron/damask print, barely there
      const motif = Math.sin(u * Math.PI * 2 * 12 + Math.abs(Math.sin(v * Math.PI * 2 * 9)) * 2.2) > 0.75 ? 1 : 0;
      const seam = (x % (S / 4)) < 1 ? 1 : 0;
      const stain = Math.max(0, st[i] - 0.55 + (1 - v) * 0.1) * 2.2 * (st[(i + 777) % (S * S)] > 0.45 ? 1 : 0.35);
      const grime = Math.max(0, v - 0.85) * 4 * (0.6 + n[i] * 0.6);
      const peel = f[i] > 0.88 && st[i] > 0.58 ? 1 : 0;
      h[i] = motif * 0.06 - seam * 0.25 + f[i] * 0.05 - peel * 0.4;
      const k = 0.9 + n[i] * 0.12 + motif * 0.035 - seam * 0.06 - grime * 0.3;
      const r = 188 * k - stain * 44 - peel * 30;
      const g = 174 * k - stain * 52 - peel * 34;
      const b = 112 * k - stain * 36 - peel * 12;
      return [C(r), C(g), C(b)];
    });
    return { albedo: alb, normal: normalFromHeight(h, S, 2.5) };
  },
  wallpaperDirty: () => {
    const n = fbm(S, 4, 5, 21);
    const st = fbm(S, 3, 5, 22);
    const h = new Float32Array(S * S);
    const alb = paint(S, (x, y, i) => {
      const v = y / S;
      const seam = (x % (S / 4)) < 2 ? 1 : 0;
      const stain = Math.max(0, st[i] - 0.4) * 2;
      const mold = Math.max(0, st[(i * 7) % (S * S)] - 0.68) * 3 * (v > 0.5 ? 1 : 0.4);
      h[i] = n[i] * 0.2 - seam * 0.4 - mold * 0.2;
      const k = 0.7 + n[i] * 0.25 - Math.max(0, v - 0.78) * 1.2;
      return [C(150 * k - stain * 50 - mold * 60), C(138 * k - stain * 55 - mold * 40), C(92 * k - stain * 35 - mold * 50)];
    });
    return { albedo: alb, normal: normalFromHeight(h, S, 3) };
  },
  // damp low-pile carpet with dark patches
  carpet: () => {
    const n = fbm(S, 4, 5, 31);
    const w = fbm(S, 3, 4, 32);
    const h = new Float32Array(S * S);
    const alb = paint(S, (x, y, i) => {
      const pile = hash(x, y, 33) * 0.6 + hash(x >> 1, y >> 1, 34) * 0.4;
      const wet = Math.max(0, w[i] - 0.56) * 2.4;
      h[i] = pile * 0.3 + n[i] * 0.08;
      const k = 0.74 + pile * 0.16 + n[i] * 0.16 - wet * 0.32;
      return [C(140 * k), C(128 * k), C(88 * k - wet * 8)];
    });
    return { albedo: alb, normal: normalFromHeight(h, S, 1.6) };
  },
  ceilingTile: () => {
    const n = fbm(M, 16, 3, 41);
    const s = fbm(M, 2, 4, 42);
    const h = new Float32Array(M * M);
    const t = M / 2;
    const alb = paint(M, (x, y, i) => {
      const grid = x % t < 3 || y % t < 3;
      const stain = Math.max(0, s[i] - 0.6) * 2.8;
      h[i] = grid ? 0.9 : 0.3 + n[i] * 0.25;
      const k = grid ? 0.6 : 0.8 + n[i] * 0.2 - stain * 0.35;
      return [C(196 * k - stain * 10), C(184 * k - stain * 24), C(146 * k - stain * 40)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 3) };
  },
  concrete: () => {
    const n = fbm(S, 4, 6, 51);
    const p = fbm(S, 32, 3, 52);
    const h = new Float32Array(S * S);
    const alb = paint(S, (_x, y, i) => {
      const v = y / S;
      const line = y % (S / 2) < 2 ? 1 : 0;
      const pit = p[i] > 0.72 ? (p[i] - 0.72) * 4 : 0;
      const damp = Math.max(0, v - 0.7) * 1.5 * n[i];
      h[i] = n[i] * 0.5 - pit * 0.6 - line * 0.4;
      const k = 0.62 + n[i] * 0.4 - pit * 0.4 - line * 0.25 - damp * 0.4;
      return [C(96 * k), C(96 * k), C(92 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, S, 4) };
  },
  concreteRed: () => {
    const n = fbm(S, 4, 6, 61);
    const pe = fbm(S, 6, 4, 62);
    const h = new Float32Array(S * S);
    const alb = paint(S, (_x, y, i) => {
      const v = y / S;
      const painted = v > 0.48;
      const peel = painted && pe[i] > 0.62 ? 1 : 0;
      const stripe = v > 0.46 && v < 0.49 ? 1 : 0;
      h[i] = n[i] * 0.4 + (painted && !peel ? 0.1 : 0);
      const k = 0.65 + n[i] * 0.35;
      if (stripe) return [C(40 * k), C(36 * k), C(32 * k)];
      if (painted && !peel) return [C(118 * k), C(34 * k), C(28 * k)];
      return [C(88 * k), C(84 * k), C(80 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, S, 4) };
  },
  floorConcrete: () => {
    const n = fbm(S, 4, 6, 71);
    const c = fbm(S, 16, 3, 72);
    const h = new Float32Array(S * S);
    const alb = paint(S, (_x, _y, i) => {
      const crack = Math.abs(c[i] - 0.5) < 0.006 ? 1 : 0;
      const stain = Math.max(0, n[i] - 0.62) * 2;
      h[i] = n[i] * 0.3 - crack * 0.8;
      const k = 0.62 + n[i] * 0.4 - crack * 0.4 - stain * 0.35;
      return [C(92 * k), C(90 * k), C(86 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, S, 4) };
  },
  floorWet: () => {
    const n = fbm(S, 4, 6, 81);
    const w = fbm(S, 2, 4, 82);
    const h = new Float32Array(S * S);
    const t = S / 4;
    const alb = paint(S, (x, y, i) => {
      const grout = x % t < 3 || y % t < 3;
      const puddle = w[i] > 0.52 ? 1 : 0;
      h[i] = grout ? 0 : 0.5 + n[i] * 0.05 - puddle * 0.2;
      const k = (grout ? 0.4 : 0.6 + n[i] * 0.25) - puddle * 0.2;
      return [C(80 * k), C(92 * k), C(94 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, S, 3) };
  },
  metalPanel: () => {
    const n = fbm(S, 4, 5, 91);
    const s = fbm(S, 2, 3, 92);
    const h = new Float32Array(S * S);
    const pan = S / 2;
    const alb = paint(S, (x, y, i) => {
      const lx = x % pan;
      const ly = y % pan;
      const seam = lx < 3 || ly < 3 ? 1 : 0;
      const rivet = [10, pan - 10].some((a) => [10, pan - 10].some((b) => Math.hypot(lx - a, ly - b) < 4)) ? 1 : 0;
      const streak = Math.max(0, s[i] - 0.5) * 2 * (ly / pan);
      h[i] = 0.5 - seam * 0.5 + rivet * 0.5 + n[i] * 0.1;
      const k = 0.7 + n[i] * 0.2 - seam * 0.3 + rivet * 0.25;
      return [C(78 * k + streak * 50), C(80 * k + streak * 22), C(82 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, S, 5) };
  },
  grating: () => {
    const h = new Float32Array(M * M);
    const n = fbm(M, 8, 3, 101);
    const alb = paint(M, (x, y, i) => {
      const bar = x % 16 < 4 || y % 32 < 3;
      h[i] = bar ? 0.8 : 0;
      const k = bar ? 0.8 + n[i] * 0.3 : 0.12;
      return [C(80 * k), C(78 * k), C(74 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 4) };
  },
  // painted steel (lockers, cabinets): green-grey with chips and rust
  paint: () => {
    const n = fbm(M, 8, 4, 111);
    const r = fbm(M, 16, 3, 112);
    const h = new Float32Array(M * M);
    const alb = paint(M, (_x, _y, i) => {
      const chip = r[i] > 0.74 ? 1 : 0;
      h[i] = chip ? -0.3 : n[i] * 0.05;
      const k = 0.8 + n[i] * 0.2;
      if (chip) return [C(100 * k), C(62 * k), C(40 * k)];
      return [C(92 * k), C(104 * k), C(92 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 3) };
  },
  wood: () => {
    const n = fbm(M, 4, 4, 121);
    const h = new Float32Array(M * M);
    const alb = paint(M, (_x, y, i) => {
      const ring = Math.sin((y / M) * 50 + n[i] * 12) * 0.5 + 0.5;
      h[i] = ring * 0.2;
      const k = 0.62 + ring * 0.25 + n[i] * 0.2;
      return [C(112 * k), C(80 * k), C(52 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 1.5) };
  },
  darkMetal: () => {
    const n = fbm(M, 4, 5, 131);
    const h = new Float32Array(M * M);
    const alb = paint(M, (x, y, i) => {
      const scratch = hash(x >> 2, y, 3) > 0.985 ? 1 : 0;
      h[i] = n[i] * 0.2 - scratch * 0.2;
      const k = 0.7 + n[i] * 0.3 + scratch * 0.4;
      return [C(50 * k), C(52 * k), C(56 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 2) };
  },
  steel: () => {
    const n = fbm(M, 4, 4, 141);
    const h = new Float32Array(M * M);
    const alb = paint(M, (_x, y, i) => {
      const row = hash(0, y, 7);
      h[i] = row * 0.15;
      const k = 0.78 + row * 0.15 + n[i] * 0.15;
      return [C(140 * k), C(142 * k), C(146 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 2) };
  },
  rust: () => {
    const n = fbm(M, 4, 6, 151);
    const m = fbm(M, 16, 3, 152);
    const h = new Float32Array(M * M);
    const alb = paint(M, (_x, _y, i) => {
      const r = Math.max(0, m[i] - 0.4) * 2;
      h[i] = n[i] * 0.4 + r * 0.2;
      const k = 0.55 + n[i] * 0.5;
      return [C((76 + r * 80) * k), C((66 + r * 20) * k), C((60 - r * 30) * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 3) };
  },
  cardboard: () => {
    const n = fbm(M, 8, 4, 161);
    const h = new Float32Array(M * M);
    const alb = paint(M, (x, y, i) => {
      const tape = Math.abs(x - M / 2) < 14 ? 1 : 0;
      const flute = Math.sin(y * 0.9) * 0.5 + 0.5;
      h[i] = flute * 0.05 + tape * 0.1;
      const k = 0.78 + n[i] * 0.25;
      if (tape) return [C(170 * k), C(150 * k), C(110 * k)];
      return [C(150 * k), C(112 * k), C(70 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 1.5) };
  },
  fabric: () => {
    const h = new Float32Array(M * M);
    const alb = paint(M, (x, y, i) => {
      const weave = ((x >> 1) + (y >> 1)) % 2;
      h[i] = weave * 0.2;
      const k = 0.8 + weave * 0.1 + hash(x, y, 9) * 0.1;
      return [C(56 * k), C(58 * k), C(52 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 2) };
  },
  orange: () => {
    const n = fbm(M, 8, 4, 171);
    const h = new Float32Array(M * M);
    const alb = paint(M, (x, y, i) => {
      const quilt = (y % 48) < 3 ? 1 : 0;
      const dirt = Math.max(0, n[i] - 0.6) * 2;
      h[i] = -quilt * 0.4 + hash(x, y, 4) * 0.05;
      const k = 0.85 + n[i] * 0.15 - quilt * 0.25 - dirt * 0.35;
      return [C(196 * k), C(86 * k), C(26 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 3) };
  },
  paper: () => {
    const n = fbm(M, 16, 3, 181);
    const h = new Float32Array(M * M);
    const alb = paint(M, (_x, y, i) => {
      const line = y % 14 < 1 && y > 30 ? 1 : 0;
      h[i] = n[i] * 0.05;
      const k = 0.9 + n[i] * 0.1 - line * 0.3;
      return [C(226 * k), C(220 * k), C(200 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 1) };
  },
  // creature skins: veins, ribs and wet sheen come from the normal maps
  skinPale: () => {
    const n = fbm(M, 4, 5, 191);
    const v = fbm(M, 8, 4, 192);
    const m = fbm(M, 16, 3, 193);
    const h = new Float32Array(M * M);
    const alb = paint(M, (x, _y, i) => {
      const vein = Math.abs(v[i] - 0.5) < 0.014 ? 1 : 0;
      const wrinkle = Math.sin((x + n[i] * 40) * 0.35) * 0.5 + 0.5;
      const blotch = Math.max(0, m[i] - 0.55) * 2;
      h[i] = n[i] * 0.35 + wrinkle * 0.08 - vein * 0.25;
      const k = 0.7 + n[i] * 0.3 - blotch * 0.25;
      return [C(168 * k - vein * 70 + blotch * 10), C(162 * k - vein * 60 - blotch * 8), C(156 * k - vein * 30 - blotch * 12)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 4) };
  },
  skinGrey: () => {
    const n = fbm(M, 6, 5, 201);
    const s = fbm(M, 24, 3, 202);
    const h = new Float32Array(M * M);
    const alb = paint(M, (_x, _y, i) => {
      const scab = s[i] > 0.66 ? 1 : 0;
      h[i] = n[i] * 0.4 + scab * 0.3;
      const k = 0.55 + n[i] * 0.35;
      return [C(96 * k + scab * 30), C(90 * k - scab * 10), C(86 * k - scab * 10)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 5) };
  },
  mask: () => {
    const n = fbm(M, 8, 3, 211);
    const h = new Float32Array(M * M);
    const alb = paint(M, (_x, _y, i) => {
      h[i] = n[i] * 0.04;
      const k = 0.92 + n[i] * 0.08;
      return [C(214 * k), C(206 * k), C(196 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 1) };
  },
  gunMetal: () => {
    const n = fbm(M, 8, 4, 221);
    const h = new Float32Array(M * M);
    const alb = paint(M, (x, y, i) => {
      const wear = Math.max(0, n[i] - 0.64) * 2;
      h[i] = n[i] * 0.06;
      const k = 0.8 + n[i] * 0.2;
      return [C(42 * k + wear * 90), C(44 * k + wear * 90), C(52 * k + wear * 90) + hash(x, y, 1) * 4];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 1) };
  },
  gunGrip: () => {
    const n = fbm(M, 4, 4, 231);
    const h = new Float32Array(M * M);
    const alb = paint(M, (x, y, i) => {
      const check = ((x >> 3) + (y >> 3)) % 2 === 0 ? 1 : 0;
      h[i] = check * 0.3;
      const ring = Math.sin(y * 0.2 + n[i] * 10) * 0.5 + 0.5;
      const k = 0.6 + ring * 0.2 + n[i] * 0.2 - check * 0.1;
      return [C(98 * k), C(56 * k), C(34 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 3) };
  },
  plastic: () => {
    const n = fbm(M, 16, 3, 241);
    const h = new Float32Array(M * M);
    const alb = paint(M, (_x, _y, i) => {
      h[i] = n[i] * 0.05;
      const k = 0.88 + n[i] * 0.12;
      return [C(170 * k), C(164 * k), C(150 * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 1) };
  },
  hazard: () => {
    const n = fbm(M, 8, 4, 251);
    const h = new Float32Array(M * M);
    const alb = paint(M, (x, y, i) => {
      const stripe = Math.floor((x + y) / (M / 8)) % 2 === 0;
      const wear = Math.max(0, n[i] - 0.6) * 2;
      h[i] = n[i] * 0.1;
      const c = stripe ? [190, 150, 30] : [30, 30, 30];
      const k = 0.85 + n[i] * 0.2 - wear * 0.5;
      return [C(c[0] * k), C(c[1] * k), C(c[2] * k)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 1) };
  },
  // the prismatic diffuser of a ceiling light panel
  diffuser: () => {
    const h = new Float32Array(M * M);
    const alb = paint(M, (x, y, i) => {
      const cell = (x % 8 < 1 || y % 8 < 1) ? 0.82 : 1;
      const edge = x < 10 || y < 10 || x > M - 10 || y > M - 10 ? 0.5 : 1;
      h[i] = cell * 0.1;
      const v = 235 * cell * edge;
      return [C(v), C(v * 0.97), C(v * 0.86)];
    });
    return { albedo: alb, normal: normalFromHeight(h, M, 1) };
  },
};

// ------------------------------------------------------------------ decals (RGBA, drawn with transparency)
export type DecalName = 'blood' | 'bloodSmear' | 'hand' | 'splat' | 'hole' | 'stain' | 'puddle' | 'drag' | 'mold' | 'scorch';

function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, n = 18) {
  g.fillStyle = col;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.7 + Math.random() * 0.45);
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.fill();
}

export const DECALS: Record<DecalName, () => HTMLCanvasElement> = {
  blood: () => {
    const [c, g] = canvas(256);
    blob(g, 128, 128, 70, 'rgba(70,4,4,0.92)', 26);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 70 + Math.random() * 50;
      blob(g, 128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 3 + Math.random() * 10, 'rgba(80,6,6,0.85)', 8);
    }
    blob(g, 115, 120, 30, 'rgba(110,10,8,0.6)', 14);
    return c;
  },
  splat: () => {
    const [c, g] = canvas(128);
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 50;
      blob(g, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + Math.random() * 9, 'rgba(90,6,6,0.85)', 8);
    }
    return c;
  },
  bloodSmear: () => {
    const [c, g] = canvas(256, 128);
    for (let k = 0; k < 4; k++) {
      g.strokeStyle = `rgba(${70 + k * 10},5,5,${0.5 + Math.random() * 0.3})`;
      g.lineWidth = 6 + Math.random() * 10;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(20, 40 + k * 14 + Math.random() * 6);
      g.bezierCurveTo(90, 30 + k * 16, 160, 70 + k * 10, 236, 50 + k * 14);
      g.stroke();
    }
    for (let i = 0; i < 12; i++) blob(g, 30 + Math.random() * 200, 100 + Math.random() * 25, 2 + Math.random() * 4, 'rgba(80,5,5,0.8)', 6);
    return c;
  },
  drag: () => {
    const [c, g] = canvas(128, 512);
    for (let y = 0; y < 512; y += 2) {
      const w = 34 + Math.sin(y * 0.03) * 8 + Math.random() * 6;
      g.fillStyle = `rgba(${60 + Math.random() * 20},4,4,${0.25 + 0.5 * (1 - y / 600) * Math.random()})`;
      g.fillRect(64 - w / 2 + Math.random() * 4, y, w, 2);
    }
    return c;
  },
  hand: () => {
    const [c, g] = canvas(128);
    g.fillStyle = 'rgba(90,6,6,0.85)';
    g.beginPath();
    g.ellipse(64, 78, 24, 28, 0, 0, Math.PI * 2);
    g.fill();
    for (const [x, y, a] of [
      [40, 40, -0.4],
      [54, 30, -0.15],
      [68, 28, 0],
      [82, 34, 0.18],
      [96, 62, 0.8],
    ]) {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillRect(-5, -18, 10, 36);
      g.restore();
    }
    for (let i = 0; i < 6; i++) g.fillRect(50 + i * 6, 100, 3, 10 + Math.random() * 18);
    return c;
  },
  hole: () => {
    const [c, g] = canvas(64);
    const r = g.createRadialGradient(32, 32, 1, 32, 32, 30);
    r.addColorStop(0, 'rgba(0,0,0,1)');
    r.addColorStop(0.18, 'rgba(10,8,6,0.95)');
    r.addColorStop(0.35, 'rgba(40,34,26,0.5)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return c;
  },
  stain: () => {
    const [c, g] = canvas(256);
    const r = g.createRadialGradient(128, 70, 10, 128, 128, 128);
    r.addColorStop(0, 'rgba(80,60,20,0.45)');
    r.addColorStop(0.7, 'rgba(90,70,30,0.25)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(70,50,20,0.35)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(128, 128, 110, 0, Math.PI * 2);
    g.stroke();
    return c;
  },
  puddle: () => {
    const [c, g] = canvas(256);
    blob(g, 128, 128, 110, 'rgba(20,24,24,0.55)', 30);
    blob(g, 128, 128, 80, 'rgba(10,14,14,0.5)', 22);
    return c;
  },
  mold: () => {
    const [c, g] = canvas(256);
    for (let i = 0; i < 400; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.pow(Math.random(), 0.7) * 120;
      g.fillStyle = `rgba(${30 + Math.random() * 20},${36 + Math.random() * 20},${18},${0.15 + Math.random() * 0.3})`;
      g.beginPath();
      g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 2 + Math.random() * 7, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  },
  scorch: () => {
    const [c, g] = canvas(128);
    const r = g.createRadialGradient(64, 64, 2, 64, 64, 60);
    r.addColorStop(0, 'rgba(10,8,6,0.85)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    return c;
  },
};

/** Text/markings painted on a wall (RGBA). */
export function writingCanvas(lines: string[], o: { color?: string; font?: string; w?: number; h?: number; glow?: string } = {}) {
  const w = o.w ?? 512;
  const h = o.h ?? 256;
  const [c, g] = canvas(w, h);
  g.fillStyle = o.color ?? 'rgba(30,20,16,0.85)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = o.font ?? `bold ${Math.round(h / (lines.length + 1.2))}px "BD Hand", "Comic Sans MS", cursive`;
  if (o.glow) {
    g.shadowColor = o.glow;
    g.shadowBlur = 18;
  }
  lines.forEach((l, i) => g.fillText(l, w / 2 + (Math.random() - 0.5) * 8, (h / (lines.length + 1)) * (i + 1), w - 20));
  return c;
}

/** Plaque or sign with a background. */
export function signCanvas(text: string, sub = '', opts: { bg?: string; fg?: string; w?: number; h?: number } = {}): HTMLCanvasElement {
  const w = opts.w ?? 512;
  const h = opts.h ?? 128;
  const [c, g] = canvas(w, h);
  g.fillStyle = opts.bg ?? '#1c1a14';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 4;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = opts.fg ?? '#e6dfcf';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(h * (sub ? 0.36 : 0.46))}px "BD Display", "Arial Narrow", sans-serif`;
  g.fillText(text, w / 2, sub ? h * 0.4 : h / 2, w - 30);
  if (sub) {
    g.font = `${Math.round(h * 0.2)}px "BD Sans", sans-serif`;
    g.globalAlpha = 0.7;
    g.fillText(sub, w / 2, h * 0.76, w - 30);
  }
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  return c;
}
