// v2 features: barrels, weather, Kominiarz, endless mode, mastery, save migration.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BALANCE } from '../src/game/balance';
import { barrelAt, choosePath, gateOpen, lanternBurnEvery, mrokRate, newRun, openWorkshop, playerAct, spawnScripted, workshopAct } from '../src/game/engine';
import { DIRS4 } from '../src/game/grid';
import { lanternRadius } from '../src/game/light';
import { generateDistrict } from '../src/game/mapgen';
import { ashFor, buyMastery, newProfile } from '../src/game/meta';
import type { Run } from '../src/game/types';
import { TILE_WALL } from '../src/game/types';
import { playRun } from './helpers';

const free = (r: Run, x: number, y: number) =>
  r.district.tiles[y * r.district.w + x] !== TILE_WALL &&
  !r.district.lamps.some((l) => l.x === x && l.y === y) &&
  !barrelAt(r.district, x, y) &&
  !r.district.enemies.some((e) => e.x === x && e.y === y) &&
  !(r.player.x === x && r.player.y === y);

function clean(seed = 11, cls: 'lampiarz' | 'kowalka' | 'alchemik' = 'lampiarz') {
  const r = newRun({ cls, night: 1, seed, daily: null });
  r.district.enemies = [];
  r.district.barrels = [];
  r.district.weather = 'jasna';
  return r;
}

test('barrels: bumping explodes (fire, hurts enemies, never the player)', () => {
  const r = clean(9);
  const p = r.player;
  const dir = DIRS4.find((d) => free(r, p.x + d.x, p.y + d.y) && free(r, p.x + d.x * 2, p.y + d.y * 2))!;
  r.district.barrels = [{ id: 900, x: p.x + dir.x, y: p.y + dir.y }];
  spawnScripted(r, 'cien', { x: p.x + dir.x * 2, y: p.y + dir.y * 2 });
  const hp = p.hp;
  playerAct(r, { type: 'move', dx: dir.x, dy: dir.y });
  assert.equal(r.district.barrels.length, 0);
  assert.equal(p.hp, hp, 'the player is not hurt by the blast');
  assert.equal(r.district.enemies.length, 0, 'the shadow next to it is gone');
  assert.ok(r.district.burning.length > 0);
});

test('weather: deterministic per seed, fog shrinks the lantern, moon speeds Mrok, rain snuffs lamps', () => {
  const g = (seed: number) => generateDistrict({ depth: 2, theme: 'port', seed, night: 1, hasMapRelic: false }).weather;
  assert.equal(g(77), g(77));
  const kinds = new Set(Array.from({ length: 60 }, (_, i) => g(i)));
  assert.ok(kinds.size >= 3, 'several kinds of weather occur');
  const r = clean(4);
  const base = lanternRadius(r);
  const m0 = mrokRate(r);
  r.district.weather = 'mgla';
  assert.ok(lanternRadius(r) < base);
  r.district.weather = 'pelnia';
  assert.ok(mrokRate(r) > m0);
  r.district.weather = 'deszcz';
  for (const l of r.district.lamps) if (l.kind === 'lamp') l.lit = true;
  const lit = () => r.district.lamps.filter((l) => l.kind === 'lamp' && l.lit).length;
  const before = lit();
  for (let i = 0; i < BALANCE.weather.rainEvery; i++) playerAct(r, { type: 'wait' });
  assert.equal(lit(), before - 1);
});

test('Kominiarz comes with the second brazier in district 3 and drops a relic', () => {
  const r = newRun({ cls: 'kowalka', night: 1, seed: 44, daily: null });
  r.depth = 2;
  r.phase = 'path';
  r.pathOptions = [{ theme: 'port', name: 'Port', danger: 2 }];
  choosePath(r, 'port');
  assert.equal(r.depth, 3);
  const d = r.district;
  d.enemies = [];
  const bz = d.lamps.filter((l) => l.kind === 'brazier');
  bz[0].lit = true;
  r.player.oil = 9;
  const b = bz[1];
  const spot = DIRS4.map((q) => ({ x: b.x + q.x, y: b.y + q.y })).find((q) => free(r, q.x, q.y))!;
  r.player.x = spot.x;
  r.player.y = spot.y;
  playerAct(r, { type: 'move', dx: b.x - spot.x, dy: b.y - spot.y });
  const k = d.enemies.find((e) => e.type === 'kominiarz');
  assert.ok(k, 'Kominiarz spawned');
  assert.equal(k!.elite, false);
  const relics = r.player.relics.length;
  while (d.enemies.includes(k!)) {
    // hit him until he falls (test shortcut: put him next to the player)
    const q = DIRS4.find((dd) => free(r, r.player.x + dd.x, r.player.y + dd.y))!;
    k!.x = r.player.x + q.x;
    k!.y = r.player.y + q.y;
    r.player.hp = r.player.maxHp;
    playerAct(r, { type: 'move', dx: q.x, dy: q.y });
  }
  assert.equal(r.player.relics.length, relics + 1, 'relic dropped');
  assert.equal(r.stats.minibossSlain, 1);
});

test('endless mode never reaches the Cape and keeps going', () => {
  const r = newRun({ cls: 'kowalka', night: 1, seed: 5, daily: null, mode: 'endless' });
  r.depth = 5;
  r.phase = 'summary';
  openWorkshop(r, new Set());
  workshopAct(r, { type: 'leave' }, new Set());
  assert.ok(r.pathOptions!.every((o) => o.theme !== 'latarnia'));
  choosePath(r, r.pathOptions![0].theme);
  assert.equal(r.depth, 6);
  assert.notEqual(r.district.theme, 'latarnia');
  playRun(r, 3, new Set(), 1500);
  assert.ok((r.phase as string) !== 'victory', 'there is no victory in endless mode');
});

test('mastery: buying upgrades, applying them at the start, never in the daily night', () => {
  const prof = newProfile();
  prof.ash = 200;
  assert.equal(buyMastery(prof, 'zapas'), null);
  for (let i = 0; i < 3; i++) assert.equal(buyMastery(prof, 'kieszen'), null);
  assert.equal(buyMastery(prof, 'knot'), null);
  assert.equal(buyMastery(prof, 'hart'), null);
  assert.equal(buyMastery(prof, 'kieszen'), 'To ulepszenie ma już najwyższy poziom.');
  const r = newRun({ cls: 'lampiarz', night: 1, seed: 8, daily: null, mastery: prof.mastery });
  assert.equal(r.player.embers, 12);
  assert.equal(r.player.maxOil, 9);
  assert.equal(r.player.maxHp, 5);
  assert.equal(lanternBurnEvery(r), BALANCE.lantern.burnEvery + 3);
  const daily = newRun({ cls: 'lampiarz', night: 1, seed: 8, daily: '2026-10-15', mastery: prof.mastery });
  assert.equal(daily.player.embers, 0);
  assert.equal(daily.player.maxHp, 4);
  const poor = newProfile();
  assert.equal(buyMastery(poor, 'zapas'), 'Za mało popiołu.');
});

test('popiół is earned for every finished night', () => {
  const r = newRun({ cls: 'lampiarz', night: 1, seed: 12, daily: null });
  playRun(r, 2);
  assert.ok(ashFor(r) > 0);
});

test('generated districts: barrels never cut the map apart', () => {
  for (let s = 0; s < 150; s++) {
    const d = generateDistrict({ depth: 1 + (s % 5), theme: (['stare', 'port', 'cmentarz', 'fabryka', 'ogrod'] as const)[s % 5], seed: 300 + s, night: 1, hasMapRelic: false });
    for (const b of d.barrels ?? []) assert.ok(d.tiles[b.y * d.w + b.x] !== TILE_WALL);
    // the gate is still reachable from the start through barrels-free floor
    const blocked = (x: number, y: number) => d.tiles[y * d.w + x] === TILE_WALL || d.lamps.some((l) => l.x === x && l.y === y) || (d.barrels ?? []).some((b) => b.x === x && b.y === y);
    const seen = new Set<number>([d.start.y * d.w + d.start.x]);
    const q = [d.start];
    while (q.length) {
      const c = q.pop()!;
      for (const dd of DIRS4) {
        const x = c.x + dd.x;
        const y = c.y + dd.y;
        const k = y * d.w + x;
        if (x < 0 || y < 0 || x >= d.w || y >= d.h || seen.has(k) || blocked(x, y)) continue;
        seen.add(k);
        q.push({ x, y });
      }
    }
    assert.ok(seen.has(d.gate.y * d.w + d.gate.x), `seed ${300 + s}: gate unreachable`);
    for (const b of d.lamps.filter((l) => l.kind === 'brazier'))
      assert.ok(DIRS4.some((dd) => seen.has((b.y + dd.y) * d.w + b.x + dd.x)), 'brazier reachable');
    assert.equal(gateOpen(d), false);
  }
});

test('Kominiarz soot puts out the nearest burning street lamp in range', () => {
  const r = clean(61);
  const d = r.district;
  const lamp = d.lamps.find((l) => l.kind === 'lamp')!;
  lamp.lit = true;
  const spot = DIRS4.map((q) => ({ x: lamp.x + q.x * 2, y: lamp.y + q.y * 2 })).find((q) => q.x > 0 && q.y > 0 && q.x < d.w && q.y < d.h && free(r, q.x, q.y))!;
  // park the player far away so he only throws soot
  r.player.x = d.start.x;
  r.player.y = d.start.y;
  spawnScripted(r, 'kominiarz', spot);
  const k = d.enemies.find((e) => e.type === 'kominiarz')!;
  k.soot = 1;
  k.x = spot.x;
  k.y = spot.y;
  playerAct(r, { type: 'wait' });
  assert.equal(lamp.lit, false);
});
