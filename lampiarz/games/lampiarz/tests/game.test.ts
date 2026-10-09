import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENEMIES, PATH_THEMES } from '../src/game/content';
import { bfs } from '../src/game/grid';
import { computeLight } from '../src/game/light';
import { generateDistrict } from '../src/game/mapgen';
import { abandonRun, newRun, playerAct } from '../src/game/engine';
import { checkAchievements, finalizeRun, newProfile } from '../src/game/meta';
import { Rng, codeToSeed, seedToCode } from '../src/game/rng';
import { validateRun } from '../src/save/storage';
import type { Run, ThemeId } from '../src/game/types';
import { TILE_WALL } from '../src/game/types';
import { botAction, playRun } from './helpers';

const THEMES_ALL: ThemeId[] = [...PATH_THEMES, 'latarnia'];

test('mapgen: every district is connected and complete (500 layouts)', () => {
  for (let s = 0; s < 500; s++) {
    const theme = THEMES_ALL[s % THEMES_ALL.length];
    const depth = theme === 'latarnia' ? 6 : 1 + (s % 5);
    const d = generateDistrict({ depth, theme, seed: s * 977 + 13, night: 1 + (s % 5), hasMapRelic: false });
    const blocked = (x: number, y: number) => d.tiles[y * d.w + x] === TILE_WALL || d.lamps.some((l) => l.x === x && l.y === y);
    const map = bfs(d.w, d.h, [d.start], (x, y) => !blocked(x, y));
    // all open tiles reachable
    for (let y = 0; y < d.h; y++)
      for (let x = 0; x < d.w; x++) if (!blocked(x, y)) assert.ok(map[y * d.w + x] >= 0, `unreachable tile seed ${s}`);
    assert.equal(d.lamps.filter((l) => l.kind === 'brazier').length, 3);
    assert.ok(d.lamps.filter((l) => l.kind === 'lamp').length >= 5);
    if (theme === 'latarnia') {
      assert.equal(d.lamps.filter((l) => l.kind === 'lighthouse').length, 1);
      assert.ok(d.enemies.some((e) => e.type === 'matka'));
    } else assert.ok(map[d.gate.y * d.w + d.gate.x] >= 14);
    // each lamp must be approachable
    for (const l of d.lamps) {
      const ok = [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => map[(l.y + dy) * d.w + l.x + dx] >= 0);
      assert.ok(ok, 'lamp not reachable');
    }
    for (const it of d.items) assert.ok(!blocked(it.x, it.y));
    for (const e of d.enemies) assert.ok(!blocked(e.x, e.y));
    // border is solid
    for (let x = 0; x < d.w; x++) assert.equal(d.tiles[x], TILE_WALL);
  }
});

test('mapgen and runs are deterministic for a seed', () => {
  const a = generateDistrict({ depth: 3, theme: 'port', seed: 4242, night: 1, hasMapRelic: false });
  const b = generateDistrict({ depth: 3, theme: 'port', seed: 4242, night: 1, hasMapRelic: false });
  assert.deepEqual(a, b);
  const r1 = newRun({ cls: 'lampiarz', night: 1, seed: 99, daily: null });
  const r2 = newRun({ cls: 'lampiarz', night: 1, seed: 99, daily: null });
  r1.startedAt = r2.startedAt = 0;
  playRun(r1, 7, new Set(), 400);
  playRun(r2, 7, new Set(), 400);
  assert.deepEqual(r1, r2);
});

test('save/load mid-run reproduces the same future', () => {
  const a = newRun({ cls: 'alchemik', night: 2, seed: 1234, daily: null });
  a.startedAt = 0;
  const rng = new Rng(5);
  for (let i = 0; i < 60 && a.phase === 'play'; i++) playerAct(a, botAction(a, rng));
  const json = JSON.stringify(a);
  const b = JSON.parse(json) as Run;
  assert.ok(validateRun(b));
  const rngA = new Rng(77);
  const rngB = new Rng(77);
  for (let i = 0; i < 80 && a.phase === 'play'; i++) {
    playerAct(a, botAction(a, rngA));
    playerAct(b, botAction(b, rngB));
  }
  assert.deepEqual(a, b);
});

test('validateRun rejects corrupted data', () => {
  const r = newRun({ cls: 'kowalka', night: 1, seed: 5, daily: null });
  assert.ok(validateRun(JSON.parse(JSON.stringify(r))));
  assert.equal(validateRun(null), false);
  assert.equal(validateRun({}), false);
  const bad1 = JSON.parse(JSON.stringify(r));
  bad1.district.tiles = bad1.district.tiles.slice(3);
  assert.equal(validateRun(bad1), false);
  const bad2 = JSON.parse(JSON.stringify(r));
  bad2.player.hp = 'lots';
  assert.equal(validateRun(bad2), false);
  const bad3 = JSON.parse(JSON.stringify(r));
  bad3.version = 0;
  assert.equal(validateRun(bad3), false);
  const bad4 = JSON.parse(JSON.stringify(r));
  bad4.cls = 'hacker';
  assert.equal(validateRun(bad4), false);
});

test('engine invariants hold across many bot runs', () => {
  for (let s = 0; s < 60; s++) {
    const cls = (['lampiarz', 'kowalka', 'alchemik'] as const)[s % 3];
    const run = newRun({ cls, night: 1 + (s % 5), seed: 1000 + s, daily: null });
    const rng = new Rng(s);
    for (let step = 0; step < 2500 && run.phase !== 'victory' && run.phase !== 'defeat'; step++) {
      if (run.phase === 'play') {
        playerAct(run, botAction(run, rng));
        const d = run.district;
        const p = run.player;
        assert.ok(p.hp <= p.maxHp, 'hp over max');
        assert.ok(p.oil >= 0 && p.oil <= p.maxOil, `oil out of range ${p.oil}/${p.maxOil}`);
        assert.ok(d.tiles[p.y * d.w + p.x] !== TILE_WALL, 'player in wall');
        const light = computeLight(run);
        const seen = new Set<string>();
        for (const e of d.enemies) {
          const key = `${e.x},${e.y}`;
          assert.ok(!seen.has(key), 'two enemies stacked');
          seen.add(key);
          assert.ok(!(e.x === p.x && e.y === p.y), 'enemy on player');
          assert.ok(d.tiles[e.y * d.w + e.x] !== TILE_WALL, 'enemy in wall');
          assert.ok(!d.lamps.some((l) => l.x === e.x && l.y === e.y), 'enemy on lamp');
          assert.ok(e.hp > 0, 'dead enemy alive');
          if (!ENEMIES[e.type].holyImmune && run.phase === 'play') {
            assert.ok(!light.holy[e.y * d.w + e.x], `${e.type} standing in holy light`);
          }
        }
      } else {
        // reuse the full bot loop for non-play phases
        playRun(run, s, new Set(), 1);
      }
    }
  }
});

test('balance: a naive bot progresses but cannot trivially win', () => {
  let wins = 0;
  let depthSum = 0;
  const N = 120;
  for (let s = 0; s < N; s++) {
    const run = newRun({ cls: (['lampiarz', 'kowalka', 'alchemik'] as const)[s % 3], night: 1, seed: 5000 + s, daily: null });
    playRun(run, s * 3 + 1);
    if (run.phase === 'victory') wins++;
    depthSum += run.depth;
  }
  console.log(`bot: ${wins}/${N} wins, avg depth ${(depthSum / N).toFixed(2)}`);
  assert.ok(wins < N, 'game too easy for a naive bot');
  assert.ok(depthSum / N > 2.2, 'game too hard: bot rarely reaches district 3');
});

test('achievements and finalize are consistent', () => {
  const prof = newProfile();
  const run = newRun({ cls: 'lampiarz', night: 1, seed: 31337, daily: '2026-10-09' });
  playRun(run, 3);
  if (run.phase !== 'victory' && run.phase !== 'defeat') abandonRun(run);
  const fresh = finalizeRun(prof, run);
  assert.equal(prof.stats.runs, 1);
  assert.ok(prof.stats.lamps >= 0);
  assert.equal(finalizeRun(prof, run).length, 0, 'finalize is idempotent');
  assert.equal(prof.stats.runs, 1);
  for (const id of fresh) assert.ok(prof.achievements[id]);
  assert.deepEqual(checkAchievements(prof, null), []);
});

test('seed codes round-trip', () => {
  for (const s of [0, 1, 42, 123456789, 4294967295]) assert.equal(codeToSeed(seedToCode(s)), s >>> 0);
  assert.equal(typeof codeToSeed('dowolny tekst'), 'number');
});

test('light: lamps create holy light, lantern does not', () => {
  const run = newRun({ cls: 'lampiarz', night: 1, seed: 8, daily: null });
  let light = computeLight(run);
  assert.equal(light.holy.reduce((a, b) => a + b, 0), 0);
  const lamp = run.district.lamps.find((l) => l.kind === 'lamp')!;
  lamp.lit = true;
  light = computeLight(run);
  assert.ok(light.holy[lamp.y * run.district.w + lamp.x] === 1);
  assert.ok(light.visible[run.player.y * run.district.w + run.player.x] === 1);
});

test('final district can be won both ways (lighthouse or boss)', async () => {
  const { choosePath } = await import('../src/game/engine');
  let byLight = 0;
  let byBoss = 0;
  for (let s = 0; s < 40; s++) {
    const run = newRun({ cls: 'kowalka', night: 1, seed: 900 + s, daily: null });
    run.depth = 5;
    run.phase = 'path';
    run.pathOptions = [{ theme: 'latarnia', name: 'Cypel', danger: 4 }];
    choosePath(run, 'latarnia');
    assert.equal(run.district.theme, 'latarnia');
    run.player.maxHp = run.player.hp = 40;
    run.player.maxOil = run.player.oil = 40;
    playRun(run, s);
    if (run.phase === 'victory') {
      if (run.bossSlain) byBoss++;
      else byLight++;
    }
  }
  console.log(`final: lighthouse ${byLight}, boss ${byBoss}`);
  assert.ok(byLight + byBoss > 20, 'final district should be beatable by a strong bot');

  // scripted lighthouse victory
  const run = newRun({ cls: 'lampiarz', night: 1, seed: 77, daily: null });
  run.depth = 5;
  run.phase = 'path';
  run.pathOptions = [{ theme: 'latarnia', name: 'Cypel', danger: 4 }];
  choosePath(run, 'latarnia');
  const d = run.district;
  const lh = d.lamps.find((l) => l.kind === 'lighthouse')!;
  for (const l of d.lamps) if (l.kind === 'brazier') l.lit = true;
  d.enemies = [];
  const spot = [[0, 1], [1, 0], [0, -1], [-1, 0]].find(([dx, dy]) => d.tiles[(lh.y + dy) * d.w + lh.x + dx] === 0 && !d.lamps.some((l) => l.x === lh.x + dx && l.y === lh.y + dy))!;
  run.player.x = lh.x + spot[0];
  run.player.y = lh.y + spot[1];
  run.player.oil = 2;
  playerAct(run, { type: 'move', dx: -spot[0], dy: -spot[1] });
  assert.equal(run.phase, 'play', 'needs 3 oil');
  run.player.oil = 3;
  const fx = playerAct(run, { type: 'move', dx: -spot[0], dy: -spot[1] });
  assert.equal(run.phase, 'victory');
  assert.equal(run.bossSlain, false);
  assert.ok(fx.some((f) => f.k === 'victory'));
});
