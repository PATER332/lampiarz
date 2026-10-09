// Level assembly (seeded chain of room templates) and tile physics.

import { LOCATIONS, type EnemyKind, type LocationId } from '../data/content';
import { ANTE, ARENAS, ENTRY, HUB, LOCATION_POOLS, POOL, ROOM_H, SHRINE_ROOM, TUTORIAL, type RoomTemplate } from '../data/rooms';
import { Rng, type Rect } from '../core/util';

export const T = 32; // tile size in world pixels

export const AIR = 0;
export const SOLID = 1;
export const LEDGE = 2;
export const SPIKES = 3;
export const BREAKABLE = 4;
export const GATE = 5;

export interface Spawn {
  id: string;
  ch: string;
  room: number;
  tx: number;
  ty: number;
  x: number; // world centre x
  y: number; // world bottom y (feet)
  enemy?: EnemyKind;
  elite?: boolean;
}

export interface RoomInfo {
  id: string;
  start: number; // first tile column
  w: number;
}

export class Level {
  w: number;
  h = ROOM_H;
  tiles: Uint8Array;
  /** cosmetic variation per tile (0..255) */
  deco: Uint8Array;
  rooms: RoomInfo[] = [];
  spawns: Spawn[] = [];
  gateCol = -1;
  arenaStart = -1;
  version = 0; // bumps when tiles change (for re-rendering)

  constructor(
    public location: LocationId | 'krypta',
    public seed: number,
    templates: RoomTemplate[],
    resolve: (s: Spawn, rng: Rng) => void,
  ) {
    const rng = new Rng(seed ^ 0x51ed);
    this.w = templates.reduce((s, r) => s + r.rows[0].length, 0);
    this.tiles = new Uint8Array(this.w * this.h);
    this.deco = new Uint8Array(this.w * this.h);
    let col = 0;
    templates.forEach((tpl, ri) => {
      const w = tpl.rows[0].length;
      this.rooms.push({ id: tpl.id, start: col, w });
      if (tpl.id.startsWith('arena')) this.arenaStart = col;
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < w; x++) {
          const ch = tpl.rows[y][x];
          const gx = col + x;
          const i = y * this.w + gx;
          this.deco[i] = rng.int(0, 255);
          switch (ch) {
            case '#':
              this.tiles[i] = SOLID;
              break;
            case '=':
              this.tiles[i] = LEDGE;
              break;
            case '^':
              this.tiles[i] = SPIKES;
              break;
            case 'X':
              this.tiles[i] = BREAKABLE;
              break;
            case '.':
              break;
            case 'G':
              this.gateCol = gx;
              break;
            default: {
              const s: Spawn = { id: `${ri}:${x}:${y}`, ch, room: ri, tx: gx, ty: y, x: gx * T + T / 2, y: (y + 1) * T };
              resolve(s, rng);
              this.spawns.push(s);
            }
          }
        }
      }
      col += w;
    });
  }

  idx(tx: number, ty: number) {
    return ty * this.w + tx;
  }

  tile(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.w) return SOLID; // world edges are walls
    if (ty < 0) return AIR;
    if (ty >= this.h) return AIR; // pits fall out of the world
    return this.tiles[ty * this.w + tx];
  }

  solidAt(tx: number, ty: number) {
    const t = this.tile(tx, ty);
    return t === SOLID || t === BREAKABLE || t === GATE;
  }

  /** Is there something to stand on directly below this world point? */
  groundBelow(x: number, footY: number) {
    const tx = Math.floor(x / T);
    const ty = Math.floor((footY + 2) / T);
    const t = this.tile(tx, ty);
    return t === SOLID || t === LEDGE || t === BREAKABLE || t === GATE;
  }

  roomAt(x: number): number {
    const tx = Math.floor(x / T);
    for (let i = this.rooms.length - 1; i >= 0; i--) if (tx >= this.rooms[i].start) return i;
    return 0;
  }

  setGate(closed: boolean) {
    if (this.gateCol < 0) return;
    for (let y = 0; y < 15; y++) this.tiles[y * this.w + this.gateCol] = closed ? GATE : AIR;
    this.version++;
  }

  /** Break a breakable wall and every breakable tile connected to it. */
  breakAt(tx: number, ty: number): string | null {
    if (this.tile(tx, ty) !== BREAKABLE) return null;
    const stack = [[tx, ty]];
    let minx = tx;
    let miny = ty;
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (this.tile(x, y) !== BREAKABLE) continue;
      this.tiles[y * this.w + x] = AIR;
      minx = Math.min(minx, x);
      miny = Math.min(miny, y);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    this.version++;
    return `wall:${minx}:${miny}`;
  }

  /** Restore broken walls listed in a save (ids from breakAt). */
  applyBroken(ids: string[]) {
    for (const id of ids) {
      const m = /^wall:(\d+):(\d+)$/.exec(id);
      if (m) this.breakAt(Number(m[1]), Number(m[2]));
    }
  }

  lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (T / 2));
    for (let i = 1; i < steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      if (this.solidAt(Math.floor(x / T), Math.floor(y / T))) return false;
    }
    return true;
  }
}

// ------------------------------------------------------------------ physics
export interface Body extends Rect {
  vx: number;
  vy: number;
  onGround: boolean;
  dropTimer: number;
  hitWall: number; // -1 / 0 / 1 for the last horizontal collision
}

/** Axis-separated tile collision. One-way ledges only stop downward motion from above. */
export function moveBody(level: Level, b: Body, dt: number, flying = false) {
  b.hitWall = 0;
  // ---- X
  let nx = b.x + b.vx * dt;
  const y0 = Math.floor(b.y / T);
  const y1 = Math.floor((b.y + b.h - 0.01) / T);
  if (b.vx > 0) {
    const tx = Math.floor((nx + b.w) / T);
    for (let ty = y0; ty <= y1; ty++)
      if (level.solidAt(tx, ty)) {
        nx = tx * T - b.w - 0.01;
        b.vx = 0;
        b.hitWall = 1;
        break;
      }
  } else if (b.vx < 0) {
    const tx = Math.floor(nx / T);
    for (let ty = y0; ty <= y1; ty++)
      if (level.solidAt(tx, ty)) {
        nx = (tx + 1) * T + 0.01;
        b.vx = 0;
        b.hitWall = -1;
        break;
      }
  }
  b.x = nx;
  // ---- Y
  const prevBottom = b.y + b.h;
  let ny = b.y + b.vy * dt;
  const x0 = Math.floor(b.x / T);
  const x1 = Math.floor((b.x + b.w - 0.01) / T);
  b.onGround = false;
  if (b.vy > 0) {
    const ty = Math.floor((ny + b.h) / T);
    for (let tx = x0; tx <= x1; tx++) {
      const t = level.tile(tx, ty);
      const solid = t === SOLID || t === BREAKABLE || t === GATE;
      const ledge = !flying && t === LEDGE && prevBottom <= ty * T + 1 && b.dropTimer <= 0;
      if (solid || ledge) {
        ny = ty * T - b.h;
        b.vy = 0;
        b.onGround = true;
        break;
      }
    }
  } else if (b.vy < 0) {
    const ty = Math.floor(ny / T);
    for (let tx = x0; tx <= x1; tx++)
      if (level.solidAt(tx, ty)) {
        ny = (ty + 1) * T + 0.01;
        b.vy = 0;
        break;
      }
  }
  b.y = ny;
  if (b.dropTimer > 0) b.dropTimer -= dt;
  // resting exactly on ground: keep the flag stable
  if (!b.onGround && b.vy >= 0 && !flying) {
    const ty = Math.floor((b.y + b.h + 1) / T);
    for (let tx = x0; tx <= x1; tx++) {
      const t = level.tile(tx, ty);
      if (((t === SOLID || t === BREAKABLE || t === GATE) || (t === LEDGE && b.dropTimer <= 0)) && Math.abs(b.y + b.h - ty * T) < 1.5) {
        b.onGround = true;
        break;
      }
    }
  }
}

export function touchesSpikes(level: Level, b: Rect): boolean {
  const ty = Math.floor((b.y + b.h - 6) / T);
  for (let tx = Math.floor((b.x + 3) / T); tx <= Math.floor((b.x + b.w - 3) / T); tx++) if (level.tile(tx, ty) === SPIKES) return true;
  return false;
}

// ------------------------------------------------------------------ assembly
export interface LevelOptions {
  tutorial: boolean;
}

export function chooseRooms(location: LocationId, seed: number, opts: LevelOptions): RoomTemplate[] {
  const def = LOCATIONS[location];
  const rng = new Rng(seed);
  const pool = rng.shuffle([...LOCATION_POOLS[location]]);
  const need = def.roomsBefore + def.roomsAfter - 1; // one slot is the secret room
  const picked = pool.slice(0, need).map((id) => POOL[id]);
  const secretAt = rng.int(0, picked.length);
  picked.splice(secretAt, 0, POOL.ukryta);
  const before = picked.slice(0, def.roomsBefore);
  const after = picked.slice(def.roomsBefore);
  return [ENTRY, ...(opts.tutorial ? TUTORIAL : []), ...before, SHRINE_ROOM, ...after, ANTE, ARENAS[def.boss]];
}

export function buildLevel(location: LocationId, seed: number, opts: LevelOptions): Level {
  const def = LOCATIONS[location];
  const eliteChance = location === 'katedra' ? 0.25 : location === 'ogrod' ? 0.12 : 0;
  return new Level(location, seed, chooseRooms(location, seed, opts), (s, rng) => {
    switch (s.ch) {
      case 'E':
        s.enemy = rng.pick(def.enemies.melee);
        s.elite = rng.chance(eliteChance);
        break;
      case 'H':
        s.enemy = def.enemies.heavy;
        s.elite = def.enemies.heavy !== 'straznik' || rng.chance(0.35);
        break;
      case 'R':
        if (def.enemies.ranged) s.enemy = def.enemies.ranged;
        s.elite = rng.chance(eliteChance);
        break;
      case 'U':
        if (def.enemies.support) s.enemy = def.enemies.support;
        break;
      case 'w':
        s.enemy = 'wyrwany';
        break;
      case 'o':
        s.enemy = 'ogar';
        break;
    }
  });
}

export function buildHub(): Level {
  return new Level('krypta', 1, [HUB], () => undefined);
}
