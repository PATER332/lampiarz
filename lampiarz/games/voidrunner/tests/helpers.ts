import type { RoomGrid } from '../src/world/tiles';
import { T_BREAK, T_HAZARD, T_PLATFORM, T_SOLID } from '../src/world/tiles';
import { Input } from '../src/core/input';
import { newMeta } from '../src/core/save';
import { silentAudio } from '../src/core/audio';
import { Game } from '../src/game/game';

const at = (g: RoomGrid, x: number, y: number) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? T_SOLID : g.tiles[y * g.w + x]);

/**
 * Conservative movement graph over "standing cells": a jump reaches at most 4 tiles up and
 * 5 tiles sideways (the real double jump does ~5 up and ~7 across), so anything reachable here
 * is comfortably reachable in the game. Cracked walls count as open (the player can break them).
 */
export function reachable(g: RoomGrid, sx: number, sy: number): Set<number> {
  const open = (x: number, y: number) => {
    const t = at(g, x, y);
    return t !== T_SOLID;
  };
  const stand = (x: number, y: number) => {
    const t = at(g, x, y);
    if (t === T_SOLID || t === T_HAZARD || t === T_PLATFORM) return false;
    if (!open(x, y - 1) || at(g, x, y - 1) === T_PLATFORM) return false;
    const b = at(g, x, y + 1);
    return b === T_SOLID || b === T_PLATFORM || b === T_BREAK;
  };
  const clear = (x0: number, y0: number, x1: number, y1: number) => {
    // a body two tiles tall must fit along the arc: check the straight line and the cell above
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 3 + 1;
    const peak = Math.min(y0, y1) - 1;
    for (let i = 0; i <= n; i++) {
      const fx = x0 + ((x1 - x0) * i) / n;
      const fy = Math.min(y0 + ((y1 - y0) * i) / n, peak + (Math.abs(i - n / 2) / (n / 2)) * (Math.max(y0, y1) - peak));
      const cx = Math.round(fx);
      const cy = Math.round(fy);
      const t = at(g, cx, cy);
      if (t === T_SOLID) return false;
    }
    return true;
  };
  const key = (x: number, y: number) => y * g.w + x;
  const seen = new Set<number>([key(sx, sy)]);
  const q: [number, number][] = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift()!;
    const push = (nx: number, ny: number) => {
      const k = key(nx, ny);
      if (!seen.has(k) && stand(nx, ny)) {
        seen.add(k);
        q.push([nx, ny]);
      }
    };
    for (const d of [-1, 1]) {
      if (stand(x + d, y)) push(x + d, y);
      // walking off a ledge: fall straight down
      if (open(x + d, y) && open(x + d, y - 1) && !stand(x + d, y)) {
        let fy = y;
        while (fy < g.h - 1 && !stand(x + d, fy) && open(x + d, fy + 1)) fy++;
        if (stand(x + d, fy)) push(x + d, fy);
      }
    }
    // jumps (including dropping through platforms: any lower cell nearby)
    for (let dy = -4; dy <= 8; dy++)
      for (let dx = -5; dx <= 5; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!stand(nx, ny) || seen.has(key(nx, ny))) continue;
        if (clear(x, y, nx, ny)) push(nx, ny);
      }
  }
  return seen;
}

export function makeGame(seed = 1234, opts: { tutorial?: boolean } = {}) {
  const meta = newMeta();
  meta.tutorialDone = !opts.tutorial;
  const input = new Input();
  const g = new Game(meta, silentAudio as never, input);
  g.newRun(seed);
  return { g, input, meta };
}

export function run(g: Game, seconds: number, each?: () => void) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    each?.();
    g.step();
  }
}
