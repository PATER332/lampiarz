// Physics-verified reachability: instead of guessing jump distances, this drives the real player
// code (the same updatePlayer the game runs) with scripted inputs — walking, short hops, full jumps,
// double jumps at different moments, air dashes and dropping through walkways — from every place
// the player can stand, and records where the player lands and every point the body passes.
import { TILE } from '../src/core/consts';
import type { Action } from '../src/core/input';
import type { Game } from '../src/game/game';
import type { RoomGrid } from '../src/world/tiles';
import { T_BREAK, T_EMPTY } from '../src/world/tiles';
import { touchesHazard } from '../src/world/physics';
import { makeGame } from './helpers';

export interface SimResult {
  /** standing cells reached (y * w + x) */
  stand: Set<number>;
  /** player boxes along every successful trajectory, sampled every 2 frames */
  path: { x: number; y: number; w: number; h: number }[];
  sims: number;
}

type Script = (f: number) => Action[];

function scripts(onPlatform: boolean): Script[] {
  const out: Script[] = [];
  for (const d of [-1, 1] as const) {
    const dir: Action = d > 0 ? 'right' : 'left';
    // walking off ledges
    for (const n of [10, 22, 40]) out.push((f) => (f < n ? [dir] : []));
    // jumps: hold the direction for some frames, double jump at different moments
    for (const hold of [0, 9, 999])
      for (const dj of [-1, 14, 26]) {
        out.push((f) => {
          const a: Action[] = [];
          if (f < hold) a.push(dir);
          if (f < 18) a.push('jump');
          if (dj > 0 && f >= dj && f < dj + 14) a.push('jump');
          return a;
        });
      }
    // a short hop
    out.push((f) => (f < 5 ? ['jump', dir] : f < 14 ? [dir] : []));
    // full jump + double jump + air dash
    out.push((f) => {
      const a: Action[] = [dir];
      if (f < 18) a.push('jump');
      if (f >= 20 && f < 34) a.push('jump');
      if (f >= 36 && f < 38) a.push('dash');
      return a;
    });
  }
  // straight up (for platforms right above)
  out.push((f) => (f < 18 ? ['jump'] : f >= 22 && f < 36 ? ['jump'] : []));
  if (onPlatform) for (const d of [0, -1, 1]) out.push((f) => (f < 3 ? ['down', 'jump'] : d > 0 ? ['right'] : d < 0 ? ['left'] : []));
  return out;
}

export function simulateRoom(src: RoomGrid, startX: number, startY: number, maxCells = 900): SimResult {
  const { g, input } = makeGame(4242);
  const grid: RoomGrid = { w: src.w, h: src.h, marks: src.marks, tiles: new Uint8Array(src.tiles) };
  // cracked walls can always be broken by the player
  for (let i = 0; i < grid.tiles.length; i++) if (grid.tiles[i] === T_BREAK) grid.tiles[i] = T_EMPTY;
  g.grid = grid;
  g.enemies = [];
  g.props = [];
  g.hazards = [];
  g.objects = [];
  g.pickups = [];
  g.weather = 'clear';
  const G = g as unknown as { updatePlayer(dt: number): void };
  const p = g.player;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= grid.w || y >= grid.h ? 1 : grid.tiles[y * grid.w + x]);
  const canStand = (x: number, y: number) => at(x, y) === T_EMPTY && at(x, y - 1) === T_EMPTY && (at(x, y + 1) === 1 || at(x, y + 1) === 2);
  const stand = new Set<number>();
  const path: SimResult['path'] = [];
  const queue: [number, number][] = [];
  const add = (x: number, y: number) => {
    const k = y * grid.w + x;
    if (!stand.has(k) && canStand(x, y)) {
      stand.add(k);
      queue.push([x, y]);
    }
  };
  add(startX, startY);
  let sims = 0;
  const held = new Set<Action>();
  const setHeld = (acts: Action[]) => {
    for (const a of [...held]) if (!acts.includes(a)) {
      input.release(a);
      held.delete(a);
    }
    for (const a of acts) if (!held.has(a)) {
      input.press(a);
      held.add(a);
    }
  };
  while (queue.length && stand.size < maxCells) {
    const [cx, cy] = queue.shift()!;
    // walking to the neighbouring cell on the same floor
    add(cx - 1, cy);
    add(cx + 1, cy);
    for (const sc of scripts(at(cx, cy + 1) === 2)) {
      sims++;
      input.clear();
      held.clear();
      Object.assign(p, {
        x: cx * TILE + (TILE - p.w) / 2,
        y: (cy + 1) * TILE - p.h,
        vx: 0,
        vy: 0,
        onGround: true,
        airJumps: 1,
        airDashes: 1,
        dashT: 0,
        dashCd: 0,
        iframes: 0,
        hurtT: 0,
        attack: null,
        coyote: 0,
        jumpBuffer: 0,
        dropT: 0,
        wallLock: 0,
        wallCoyote: 0,
        sliding: false,
        blocking: false,
        healT: 0,
        landT: 0,
        ride: -1,
        hp: p.maxHp,
        dead: false,
      });
      g.slowmo = 0;
      g.hitstop = 0;
      const local: SimResult['path'] = [];
      let ok = true;
      let landed: [number, number] | null = null;
      let air = false;
      for (let f = 0; f < 200; f++) {
        setHeld(sc(f));
        G.updatePlayer(1 / 60);
        input.endStep();
        if (touchesHazard(p, grid) || p.y > grid.h * TILE || p.hp < p.maxHp) {
          ok = false;
          break;
        }
        if (f % 2 === 0) local.push({ x: p.x, y: p.y, w: p.w, h: p.h });
        if (!p.onGround) air = true;
        if (f > 4 && p.onGround && Math.abs(p.vy) < 1 && !held.has('jump') && (air || held.size === 0)) {
          landed = [Math.floor((p.x + p.w / 2) / TILE), Math.floor((p.y + p.h - 1) / TILE)];
          break;
        }
      }
      g.particles.length = 0;
      g.floaters.length = 0;
      if (!ok) continue;
      for (const b of local) path.push(b);
      if (landed) add(landed[0], landed[1]);
    }
  }
  setHeld([]);
  return { stand, path, sims };
}

export const near = (path: SimResult['path'], x: number, y: number, r: number) => path.some((b) => Math.abs(b.x + b.w / 2 - x) < r + b.w / 2 && Math.abs(b.y + b.h / 2 - y) < r + b.h / 2);
export const touches = (path: SimResult['path'], box: { x: number; y: number; w: number; h: number }) => path.some((b) => b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y);
export type { Game };
