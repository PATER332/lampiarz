import { BALANCE } from './balance';
import { CLASSES } from './content';
import { inBounds, lineOfSight } from './grid';
import type { Lamp, Run } from './types';
import { TILE_WALL } from './types';

export interface LightSource {
  x: number;
  y: number;
  r: number;
  holy: boolean;
  kind: 'lamp' | 'brazier' | 'lighthouse' | 'fire' | 'lantern';
}

export interface LightState {
  w: number;
  h: number;
  /** Tiles where shadows cannot stand (lamp, brazier or fire light). */
  holy: Uint8Array;
  /** Brightness 0..1 for rendering. */
  level: Float32Array;
  /** Tiles currently visible to the player. */
  visible: Uint8Array;
  sources: LightSource[];
}

export function lampRadius(run: Run, lamp: Lamp): number {
  const d = run.district;
  const bonus = d.mods.lampRadiusBonus + (run.player.relics.includes('zloty_knot') ? 1 : 0);
  switch (lamp.kind) {
    case 'lamp':
      return BALANCE.light.lampRadius + bonus;
    case 'brazier':
      return BALANCE.light.brazierRadius + bonus;
    case 'lighthouse':
      return BALANCE.light.lighthouseRadius;
  }
}

export function lanternRadius(run: Run): number {
  const p = run.player;
  if (p.oil <= 0) return BALANCE.lantern.dryRadius;
  return CLASSES[run.cls].lantern + (p.relics.includes('szeroki_knot') ? 1 : 0);
}

export function lightSources(run: Run): LightSource[] {
  const d = run.district;
  const out: LightSource[] = [];
  for (const l of d.lamps) if (l.lit) out.push({ x: l.x, y: l.y, r: lampRadius(run, l), holy: true, kind: l.kind });
  for (const b of d.burning) out.push({ x: b.x, y: b.y, r: BALANCE.light.burningRadius, holy: true, kind: 'fire' });
  out.push({ x: run.player.x, y: run.player.y, r: lanternRadius(run), holy: false, kind: 'lantern' });
  return out;
}

export function computeLight(run: Run): LightState {
  const d = run.district;
  const { w, h } = d;
  const holy = new Uint8Array(w * h);
  const level = new Float32Array(w * h);
  const visible = new Uint8Array(w * h);
  const opaque = (x: number, y: number) => !inBounds(w, h, x, y) || d.tiles[y * w + x] === TILE_WALL;
  const sources = lightSources(run);

  for (const s of sources) {
    const R = Math.ceil(s.r);
    for (let y = s.y - R; y <= s.y + R; y++) {
      for (let x = s.x - R; x <= s.x + R; x++) {
        if (!inBounds(w, h, x, y)) continue;
        const dd = Math.hypot(x - s.x, y - s.y);
        if (dd > s.r) continue;
        if (!lineOfSight(s.x, s.y, x, y, opaque)) continue;
        const i = y * w + x;
        const lv = 1 - 0.72 * Math.pow(dd / Math.max(0.01, s.r), 1.6);
        if (lv > level[i]) level[i] = lv;
        visible[i] = 1;
        if (s.holy && d.tiles[i] !== TILE_WALL) holy[i] = 1;
      }
    }
  }
  return { w, h, holy, level, visible, sources };
}
