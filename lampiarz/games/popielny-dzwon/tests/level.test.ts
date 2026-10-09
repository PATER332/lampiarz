import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANTE, ARENAS, ENTRY, HUB, POOL, ROOM_H, SHRINE_ROOM, TUTORIAL, type RoomTemplate } from '../src/data/rooms';
import { buildLevel, chooseRooms, Level, LEDGE, SOLID, BREAKABLE, SPIKES, AIR } from '../src/world/level';
import { LOCATIONS, LOCATION_ORDER } from '../src/data/content';

const ALL: RoomTemplate[] = [ENTRY, SHRINE_ROOM, ANTE, ...Object.values(ARENAS), ...TUTORIAL, ...Object.values(POOL)];

test('room templates have consistent size and connectable edges', () => {
  for (const r of ALL) {
    assert.equal(r.rows.length, ROOM_H, r.id);
    const w = r.rows[0].length;
    for (const row of r.rows) assert.equal(row.length, w, `${r.id} row width`);
    assert.ok(r.rows[15][0] === '#' && r.rows[15][w - 1] === '#', `${r.id} floor at edges`);
    const leftOpen = r.id !== 'wejscie';
    const rightOpen = !r.id.startsWith('arena');
    for (let y = 11; y <= 14; y++) {
      if (leftOpen) assert.ok('.0123456789'.includes(r.rows[y][0]) || r.rows[y][0] === 'G', `${r.id} left edge row ${y}`);
      if (rightOpen) assert.equal(r.rows[y][w - 1], '.', `${r.id} right edge row ${y}`);
    }
  }
  assert.ok(HUB.rows.length === ROOM_H);
});

/** Coarse reachability model: 2-tile tall body, jump up to 3 tiles high / 4 wide. */
function traversable(level: Level, fromX: number, toX: number): boolean {
  const solid = (x: number, y: number) => {
    const t = level.tile(x, y);
    return t === SOLID || t === BREAKABLE;
  };
  const standable = (x: number, y: number) => {
    if (y < 1 || y >= level.h) return false;
    if (solid(x, y) || solid(x, y - 1)) return false;
    const below = level.tile(x, y + 1);
    return below === SOLID || below === LEDGE || below === BREAKABLE || (below === SPIKES);
  };
  const key = (x: number, y: number) => y * level.w + x;
  const start: [number, number][] = [];
  for (let y = 0; y < level.h; y++) if (standable(fromX, y)) start.push([fromX, y]);
  const seen = new Set(start.map(([x, y]) => key(x, y)));
  const q = [...start];
  while (q.length) {
    const [x, y] = q.shift()!;
    if (x >= toX) return true;
    const push = (nx: number, ny: number) => {
      if (nx < 0 || nx >= level.w || !standable(nx, ny) || seen.has(key(nx, ny))) return;
      seen.add(key(nx, ny));
      q.push([nx, ny]);
    };
    // jumps / walks / drops within reach
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -3; dy <= 12; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!standable(nx, ny)) continue;
        // head room for upward jumps above the take-off column
        let ok = true;
        const top = Math.min(y, ny) - (dy < 0 ? 1 : 0);
        for (let yy = y - 1; yy >= top - 1 && yy >= 0; yy--) if (solid(x, yy)) ok = false;
        if (dy > 4 && Math.abs(dx) > 3) ok = false;
        if (ok) push(nx, ny);
      }
    }
  }
  return false;
}

test('every generated expedition can be crossed from entry to boss arena', () => {
  for (const loc of LOCATION_ORDER) {
    for (let seed = 1; seed <= 60; seed++) {
      const lv = buildLevel(loc, seed * 7919, { tutorial: loc === 'rynek' && seed % 2 === 0 });
      assert.ok(lv.arenaStart > 0 && lv.gateCol > 0, 'arena present');
      assert.ok(traversable(lv, 2, lv.w - 3), `${loc} seed ${seed} not traversable (${lv.rooms.map((r) => r.id).join(',')})`);
      assert.equal(lv.spawns.filter((s) => s.ch === 'S').length, 3, 'three shrines');
      assert.equal(lv.spawns.filter((s) => s.ch === 'B').length, 1, 'one boss');
      assert.ok(lv.spawns.some((s) => s.ch === 'c'), 'secret chest');
      for (const s of lv.spawns) if ('EHRUwo'.includes(s.ch) && s.enemy) assert.ok(s.enemy in { wyrwany: 1, ogar: 1, straznik: 1, cmiara: 1, spiewak: 1 });
    }
  }
});

test('room choice is deterministic and varied', () => {
  const a = chooseRooms('ogrod', 42, { tutorial: false }).map((r) => r.id);
  const b = chooseRooms('ogrod', 42, { tutorial: false }).map((r) => r.id);
  assert.deepEqual(a, b);
  const variants = new Set<string>();
  for (let s = 0; s < 30; s++) variants.add(chooseRooms('rynek', s, { tutorial: false }).map((r) => r.id).join());
  assert.ok(variants.size > 10);
  assert.equal(LOCATIONS.rynek.boss, 'kat');
  void AIR;
});
