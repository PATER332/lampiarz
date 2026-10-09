import { BALANCE } from './balance';
import { ENEMIES, THEMES } from './content';
import { bfs, DIRS4, DIRS8, inBounds, manhattan } from './grid';
import { Rng } from './rng';
import type { District, Enemy, EnemyType, Item, Lamp, Point, ThemeId } from './types';
import { TILE_FLOOR, TILE_WALL } from './types';

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

const center = (r: Room): Point => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

export interface GenOptions {
  depth: number;
  theme: ThemeId;
  seed: number;
  night: number;
  hasMapRelic: boolean;
}

/** Build a complete, connected district. Retries with derived seeds if a layout is unusable. */
export function generateDistrict(opts: GenOptions): District {
  for (let attempt = 0; attempt < 40; attempt++) {
    const d = tryGenerate(opts, (opts.seed + attempt * 7919) >>> 0);
    if (d) return d;
  }
  throw new Error('Nie udało się wygenerować dzielnicy');
}

function tryGenerate(opts: GenOptions, seed: number): District | null {
  const { w, h } = BALANCE.map;
  const rng = new Rng(seed);
  const theme = THEMES[opts.theme];
  const final = opts.theme === 'latarnia';
  const tiles = new Array<number>(w * h).fill(TILE_WALL);
  const set = (x: number, y: number, v: number) => {
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) tiles[y * w + x] = v;
  };
  const get = (x: number, y: number) => (inBounds(w, h, x, y) ? tiles[y * w + x] : TILE_WALL);

  // ---- rooms (plazas)
  const rooms: Room[] = [];
  if (final) {
    rooms.push({ x: Math.floor(w / 2) - 4, y: Math.floor(h / 2) - 3, w: 9, h: 7 });
  }
  const roomTarget = final ? 7 : rng.int(7, 10);
  for (let tries = 0; rooms.length < roomTarget && tries < 300; tries++) {
    const rw = rng.int(3, 6);
    const rh = rng.int(3, 5);
    const r = { x: rng.int(1, w - rw - 1), y: rng.int(1, h - rh - 1), w: rw, h: rh };
    const overlaps = rooms.some(
      (o) => r.x < o.x + o.w + 1 && r.x + r.w + 1 > o.x && r.y < o.y + o.h + 1 && r.y + r.h + 1 > o.y,
    );
    if (overlaps) continue;
    rooms.push(r);
  }
  if (rooms.length < 5) return null;
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, TILE_FLOOR);

  // ---- streets: connect rooms in a chain sorted by x, then a few extra loops
  const carveL = (a: Point, b: Point, wide: boolean) => {
    const horizFirst = rng.chance(0.5);
    const mid = horizFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    for (const [p, q] of [
      [a, mid],
      [mid, b],
    ] as const) {
      const sx = Math.sign(q.x - p.x);
      const sy = Math.sign(q.y - p.y);
      let x = p.x;
      let y = p.y;
      for (;;) {
        set(x, y, TILE_FLOOR);
        if (wide) set(x + (sy !== 0 ? 1 : 0), y + (sx !== 0 ? 1 : 0), TILE_FLOOR);
        if (x === q.x && y === q.y) break;
        x += sx;
        y += sy;
      }
    }
  };
  const sorted = [...rooms].sort((a, b) => center(a).x - center(b).x);
  for (let i = 1; i < sorted.length; i++) carveL(center(sorted[i - 1]), center(sorted[i]), rng.chance(0.25));
  const loops = rng.int(2, 4);
  for (let i = 0; i < loops; i++) {
    const a = rng.pick(rooms);
    const b = rng.pick(rooms);
    if (a !== b) carveL(center(a), center(b), false);
  }

  // ---- alleys: short random walks that create nooks and dead ends
  const alleys = rng.int(3, 6);
  for (let i = 0; i < alleys; i++) {
    let p = center(rng.pick(rooms));
    let dir = rng.pick(DIRS4);
    const len = rng.int(3, 7);
    for (let s = 0; s < len; s++) {
      p = { x: p.x + dir.x, y: p.y + dir.y };
      if (p.x < 1 || p.y < 1 || p.x > w - 2 || p.y > h - 2) break;
      set(p.x, p.y, TILE_FLOOR);
      if (rng.chance(0.25)) dir = rng.pick(DIRS4);
    }
  }

  // ---- cemetery: scatter gravestones (single wall pillars) in plazas
  if (opts.theme === 'cmentarz' || opts.theme === 'ogrod') {
    for (const r of rooms) {
      if (r.w < 4 || r.h < 4) continue;
      for (let y = r.y + 1; y < r.y + r.h - 1; y += 2)
        for (let x = r.x + 1; x < r.x + r.w - 1; x += 2) if (rng.chance(0.35)) set(x, y, TILE_WALL);
    }
  }

  // ---- connectivity: keep the region containing the first room
  const startRoom = final ? sorted[0] === rooms[0] ? sorted[1] : sorted[0] : sorted[0];
  let start = center(startRoom);
  if (get(start.x, start.y) !== TILE_FLOOR) return null;
  const reach = bfs(w, h, [start], (x, y) => get(x, y) === TILE_FLOOR);
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === TILE_FLOOR && reach[i] < 0) tiles[i] = TILE_WALL;
  const floorCount = tiles.filter((t) => t === TILE_FLOOR).length;
  if (floorCount < 110) return null;

  // Pull start to the leftmost floor tile of its room for a nicer opening.
  {
    let best = start;
    for (let y = startRoom.y; y < startRoom.y + startRoom.h; y++)
      for (let x = startRoom.x; x < startRoom.x + startRoom.w; x++)
        if (get(x, y) === TILE_FLOOR && x < best.x) best = { x, y };
    start = best;
  }

  // ---- blocked set (lamps/braziers) with connectivity guard
  const blocked = new Set<number>();
  const isOpen = (x: number, y: number) => get(x, y) === TILE_FLOOR && !blocked.has(y * w + x);
  const stillConnected = (): boolean => {
    const d = bfs(w, h, [start], isOpen);
    let open = 0;
    let reached = 0;
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === TILE_FLOOR && !blocked.has(i)) {
        open++;
        if (d[i] >= 0) reached++;
      }
    }
    return open === reached;
  };
  const tryBlock = (p: Point): boolean => {
    const i = p.y * w + p.x;
    if (blocked.has(i) || !isOpen(p.x, p.y)) return false;
    blocked.add(i);
    if (!stillConnected()) {
      blocked.delete(i);
      return false;
    }
    return true;
  };

  let distStart = bfs(w, h, [start], isOpen);
  const floors: Point[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (get(x, y) === TILE_FLOOR) floors.push({ x, y });

  // ---- gate: farthest reachable tile
  let gate: Point = { x: -1, y: -1 };
  if (!final) {
    let best = -1;
    for (const p of floors) {
      const dd = distStart[p.y * w + p.x];
      if (dd > best) {
        best = dd;
        gate = p;
      }
    }
    if (best < 14) return null;
  }

  const lamps: Lamp[] = [];
  let nextId = 1;
  const reserved = new Set<number>([start.y * w + start.x, gate.y * w + gate.x]);
  const occupied = (p: Point) => reserved.has(p.y * w + p.x) || blocked.has(p.y * w + p.x);
  const openNeighbours8 = (p: Point) => DIRS8.filter((d) => get(p.x + d.x, p.y + d.y) === TILE_FLOOR).length;

  // ---- lighthouse (final)
  if (final) {
    const c = center(rooms[0]);
    if (!tryBlock(c)) return null;
    lamps.push({ id: nextId++, x: c.x, y: c.y, kind: 'lighthouse', lit: false });
    distStart = bfs(w, h, [start], isOpen);
  }

  // ---- braziers: spread out, in open areas, away from start
  const anchorPts: Point[] = [start];
  if (!final) anchorPts.push(gate);
  else anchorPts.push({ x: lamps[0].x, y: lamps[0].y });
  for (let b = 0; b < 3; b++) {
    const cands = floors.filter((p) => {
      const dd = distStart[p.y * w + p.x];
      return dd >= 5 && !occupied(p) && openNeighbours8(p) >= 5;
    });
    if (!cands.length) return null;
    cands.sort((a, c) => minSep(c, anchorPts) - minSep(a, anchorPts) || rng.next() - 0.5);
    let placed = false;
    for (const p of cands.slice(0, 12)) {
      if (tryBlock(p)) {
        lamps.push({ id: nextId++, x: p.x, y: p.y, kind: 'brazier', lit: false });
        anchorPts.push(p);
        placed = true;
        break;
      }
    }
    if (!placed) return null;
  }

  // ---- street lamps: along walls, spaced
  const lampTarget = rng.int(BALANCE.items.lampsMin, BALANCE.items.lampsMax) + (final ? 1 : 0);
  const lampCands = rng.shuffle(
    floors.filter((p) => DIRS4.some((d) => get(p.x + d.x, p.y + d.y) === TILE_WALL) && !occupied(p) && manhattan(p, start) > 1),
  );
  for (const p of lampCands) {
    if (lamps.filter((l) => l.kind === 'lamp').length >= lampTarget) break;
    if (lamps.some((l) => manhattan(l, p) < 4)) continue;
    if (manhattan(p, gate) < 2) continue;
    if (tryBlock(p)) lamps.push({ id: nextId++, x: p.x, y: p.y, kind: 'lamp', lit: false });
  }
  if (lamps.filter((l) => l.kind === 'lamp').length < 5) return null;

  distStart = bfs(w, h, [start], isOpen);

  // ---- items
  const items: Item[] = [];
  const freeTiles = () =>
    floors.filter((p) => !occupied(p) && !items.some((it) => it.x === p.x && it.y === p.y) && distStart[p.y * w + p.x] > 2);
  const placeSpread = (kind: Item['kind'], count: number, amount: () => number, minSpacing: number) => {
    for (let i = 0; i < count; i++) {
      const cands = rng.shuffle(freeTiles()).filter((p) => !items.some((it) => manhattan(it, p) < minSpacing));
      const p = cands[0] ?? rng.shuffle(freeTiles())[0];
      if (!p) return;
      items.push({ id: nextId++, x: p.x, y: p.y, kind, amount: amount() });
    }
  };
  const mods = theme.mods;
  const oilCount = Math.max(2, rng.int(BALANCE.items.oilMin, BALANCE.items.oilMax) + mods.oilBonus);
  placeSpread('oil', oilCount, () => BALANCE.items.oilCan, 5);
  placeSpread('embers', rng.int(BALANCE.items.emberPilesMin, BALANCE.items.emberPilesMax), () => rng.int(BALANCE.items.emberMin, BALANCE.items.emberMax), 4);
  if (!final && (mods.eventGuaranteed || rng.chance(BALANCE.items.eventChance))) {
    placeSpread('event', 1, () => 0, 3);
  }
  // shrine in a dead end, far from start
  if (!final && rng.chance(BALANCE.items.shrineChance + opts.depth * 0.02)) {
    const deadEnds = freeTiles().filter(
      (p) => DIRS4.filter((d) => get(p.x + d.x, p.y + d.y) === TILE_FLOOR).length === 1 && distStart[p.y * w + p.x] > 8,
    );
    if (deadEnds.length) {
      const p = rng.pick(deadEnds);
      items.push({ id: nextId++, x: p.x, y: p.y, kind: 'shrine', amount: 0 });
    }
  }
  // assign event ids later (engine chooses unseen ones)

  // ---- enemies
  const enemies: Enemy[] = [];
  const nightExtra = opts.night >= 2 ? 1 : 0;
  const count = Math.max(1, BALANCE.enemies.startBase + opts.depth - 1 + mods.extraEnemies + nightExtra + (final ? -1 : 0));
  const enemyCands = rng.shuffle(
    floors.filter((p) => !occupied(p) && distStart[p.y * w + p.x] >= 9 && !items.some((it) => it.x === p.x && it.y === p.y)),
  );
  for (const p of enemyCands) {
    if (enemies.length >= count) break;
    if (enemies.some((e) => manhattan(e, p) < 3)) continue;
    const type = rollEnemyType(rng, opts.depth, mods.weights);
    enemies.push(makeEnemy(nextId++, type, p, rng, opts.depth));
  }
  if (final) {
    const far = floors
      .filter((p) => !occupied(p) && !enemies.some((e) => e.x === p.x && e.y === p.y))
      .sort((a, b) => distStart[b.y * w + b.x] - distStart[a.y * w + a.x])[0];
    const hp = BALANCE.boss.hp + (opts.night - 1) * BALANCE.boss.hpPerNight + (opts.night >= 5 ? 4 : 0);
    enemies.push({
      id: nextId++,
      type: 'matka',
      x: far.x,
      y: far.y,
      hp,
      maxHp: hp,
      elite: false,
      pulse: BALANCE.boss.pulseEvery + 2,
      brood: BALANCE.boss.broodEvery,
    });
  }

  const deco = Array.from({ length: w * h }, () => rng.int(0, 255));
  const explored = new Array<number>(w * h).fill(0);

  return {
    depth: opts.depth,
    theme: opts.theme,
    name: theme.name,
    seed,
    w,
    h,
    tiles,
    explored,
    deco,
    lamps,
    items,
    enemies,
    burning: [],
    gate,
    start,
    mrok: 0,
    turn: 0,
    nextId,
    tookDamage: false,
    cloakUsed: false,
    heartUsed: false,
    fullLight: false,
    lampsLitHere: 0,
    freeLampCounter: 0,
    rest: 0,
    killCounter: 0,
    mods: { ...mods, weights: { ...mods.weights } },
    revealed: opts.hasMapRelic,
  };
}

function minSep(p: Point, pts: Point[]): number {
  let m = Infinity;
  for (const q of pts) m = Math.min(m, manhattan(p, q));
  return m;
}

export function rollEnemyType(rng: Rng, depth: number, extraWeights: Partial<Record<EnemyType, number>>): EnemyType {
  const entries: [EnemyType, number][] = [];
  for (const def of Object.values(ENEMIES)) {
    if (def.weight <= 0 || def.minDepth > depth) continue;
    entries.push([def.type, extraWeights[def.type] ?? def.weight]);
  }
  return rng.weighted(entries);
}

export function makeEnemy(id: number, type: EnemyType, p: Point, rng: Rng, depth: number): Enemy {
  const def = ENEMIES[type];
  const elite =
    depth >= BALANCE.enemies.eliteFromDepth && rng.chance(BALANCE.enemies.eliteChancePerDepth * (depth - BALANCE.enemies.eliteFromDepth + 1));
  const hp = def.hp + (elite ? 1 : 0);
  return { id, type, x: p.x, y: p.y, hp, maxHp: hp, elite, aim: null, snuff: 0, snuffTarget: null };
}
