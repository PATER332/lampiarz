// High-resolution darkness map. Every tile is split into SUB×SUB cells; each light
// source lights the cells around it with a smooth radial falloff, and walls cast
// soft shadows (the per-source line-of-sight mask is sampled bilinearly, so shadow
// edges are blurred instead of blocky). Remembered streets stay faintly moonlit.

import { inBounds, lineOfSight } from '../game/grid';
import type { LightState } from '../game/light';
import type { Run } from '../game/types';
import { TILE_WALL } from '../game/types';

export const SUB = 4;

/** Darkness alpha per sub-cell (0 = fully lit, 1 = pitch black). */
export function buildDarkness(run: Run, light: LightState): Float32Array {
  const d = run.district;
  const W = d.w * SUB;
  const H = d.h * SUB;
  const level = new Float32Array(W * H);
  const opaque = (x: number, y: number) => !inBounds(d.w, d.h, x, y) || d.tiles[y * d.w + x] === TILE_WALL;

  for (const s of light.sources) {
    const R = Math.ceil(s.r) + 1;
    // line-of-sight mask for this source, one value per tile around it
    const mw = R * 2 + 1;
    const mask = new Float32Array(mw * mw);
    for (let my = 0; my < mw; my++)
      for (let mx = 0; mx < mw; mx++) {
        const x = s.x - R + mx;
        const y = s.y - R + my;
        if (!inBounds(d.w, d.h, x, y)) continue;
        if (Math.hypot(x - s.x, y - s.y) > s.r + 1.2) continue;
        if (lineOfSight(s.x, s.y, x, y, opaque)) mask[my * mw + mx] = 1;
      }
    const sample = (fx: number, fy: number) => {
      // fx, fy in tile units relative to the mask origin, measured from tile centres
      const gx = fx - 0.5;
      const gy = fy - 0.5;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = gx - x0;
      const ty = gy - y0;
      const at = (x: number, y: number) => (x < 0 || y < 0 || x >= mw || y >= mw ? 0 : mask[y * mw + x]);
      // a lit tile stays fully lit inside itself: only blend across its edge
      const own = at(Math.floor(fx), Math.floor(fy));
      const bl = at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
      return Math.max(bl, own * 0.55);
    };
    const strength = s.kind === 'lantern' ? 0.8 : s.kind === 'fire' ? 0.85 : 1;
    const cx = s.x + 0.5;
    const cy = s.y + 0.5;
    const x0 = Math.max(0, (s.x - R) * SUB);
    const y0 = Math.max(0, (s.y - R) * SUB);
    const x1 = Math.min(W, (s.x + R + 1) * SUB);
    const y1 = Math.min(H, (s.y + R + 1) * SUB);
    for (let sy = y0; sy < y1; sy++) {
      const py = (sy + 0.5) / SUB;
      for (let sx = x0; sx < x1; sx++) {
        const px = (sx + 0.5) / SUB;
        const dd = Math.hypot(px - cx, py - cy);
        if (dd > s.r + 0.5) continue;
        const f = Math.max(0, 1 - dd / (s.r + 0.5));
        // soft core, long gentle tail
        const lv = strength * (f * f * (3 - 2 * f)) ** 0.8;
        if (lv <= level[sy * W + sx]) continue;
        const m = sample(px - (s.x - R), py - (s.y - R));
        const v = lv * m;
        if (v > level[sy * W + sx]) level[sy * W + sx] = v;
      }
    }
  }

  // memory (explored) mask, bilinear too, so remembered streets fade in softly
  const explored = (x: number, y: number) => (x < 0 || y < 0 || x >= d.w || y >= d.h ? 0 : d.explored[y * d.w + x] || light.visible[y * d.w + x] ? 1 : 0);
  const out = new Float32Array(W * H);
  for (let sy = 0; sy < H; sy++) {
    const fy = (sy + 0.5) / SUB - 0.5;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let sx = 0; sx < W; sx++) {
      const fx = (sx + 0.5) / SUB - 0.5;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const mem =
        explored(x0, y0) * (1 - tx) * (1 - ty) + explored(x0 + 1, y0) * tx * (1 - ty) + explored(x0, y0 + 1) * (1 - tx) * ty + explored(x0 + 1, y0 + 1) * tx * ty;
      const base = 0.97 - 0.29 * mem; // unexplored ≈ black, remembered ≈ moonlit
      const lv = level[sy * W + sx];
      out[sy * W + sx] = Math.max(0, Math.min(base, base - lv * 1.05));
    }
  }
  return out;
}
