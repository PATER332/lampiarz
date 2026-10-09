import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BossId, LocationId } from '../src/data/content';
import { ATTACKS, Enemy } from '../src/entities/enemies';
import { newSave } from '../src/save';
import { T } from '../src/world/level';
import { makeSim, type Sim } from './sim';

const FLOOR = 15 * T;

/** Remove level enemies and put one right in front of the player. */
function duel(sim: Sim, kind: Enemy['kind'], dist = 40): Enemy {
  const w = sim.world;
  w.enemies = [];
  const p = w.player;
  p.face = 1;
  const e = new Enemy(kind, p.cx + dist, FLOOR, false, { hp: 1, dmg: 1 }, 'test');
  e.face = -1;
  e.aggro = true;
  e.cooldown = 99; // only attacks we trigger by hand
  w.enemies.push(e);
  sim.step(2);
  return e;
}

function runUntil(sim: Sim, cond: () => boolean, maxSeconds: number) {
  for (let i = 0; i < maxSeconds * 60 && !cond(); i++) sim.step();
}

test('the hub loads with all five stations and runs without errors', () => {
  const sim = makeSim();
  const kinds = sim.world.interactables.filter((i) => i.kind === 'station').map((i) => i.data).sort();
  assert.deepEqual(kinds, ['S', 'a', 'h', 'm', 't'].sort());
  sim.seconds(5);
  assert.equal(sim.world.player.dead, false);
});

test('light attacks kill an enemy and pay out żużel', () => {
  const sim = makeSim({ location: 'rynek' });
  const e = duel(sim, 'wyrwany');
  for (let i = 0; i < 40 && !e.dead; i++) {
    sim.input.tap('light');
    sim.seconds(0.3);
  }
  assert.ok(e.dead, 'enemy died');
  assert.ok(sim.save.zuzel > 0, 'żużel granted');
  assert.equal(sim.world.run.kills, 1);
});

test('a well-timed block parries a white attack and opens a triple-damage riposte', () => {
  const sim = makeSim({ location: 'rynek' });
  const w = sim.world;
  const e = duel(sim, 'wyrwany');
  const zamach = ATTACKS.wyrwany.find((a) => a.id === 'zamach')!;
  e.startAttack(zamach, w);
  runUntil(sim, () => e.stateT >= zamach.windup - 0.07, 2);
  sim.input.press('block');
  sim.seconds(0.35);
  sim.input.release('block');
  assert.equal(w.player.hp, w.player.maxHp, 'no damage taken');
  assert.equal(sim.save.stats.parries, 1);
  assert.equal(e.state, 'parried');
  const before = e.hp;
  sim.step(2);
  sim.input.tap('light');
  sim.seconds(0.3);
  const dealt = before - e.hp;
  const normal = 16 * w.player.stats.dmgMul;
  assert.ok(dealt >= normal * 2.9, `riposte dealt ${dealt}, normal hit ${normal}`);
});

test('red attacks pass through a block', () => {
  const sim = makeSim({ location: 'katedra' });
  const w = sim.world;
  const e = duel(sim, 'straznik', 50);
  sim.input.press('block');
  sim.step(5);
  assert.equal(w.player.state, 'block');
  e.startAttack(ATTACKS.straznik.find((a) => a.id === 'dzwon')!, w);
  sim.seconds(1.6);
  assert.ok(w.player.hp < w.player.maxHp, 'red blow is unblockable');
});

test('rolling through a blow avoids damage and counts as a perfect dodge', () => {
  const sim = makeSim({ location: 'rynek' });
  const w = sim.world;
  const e = duel(sim, 'wyrwany');
  const zamach = ATTACKS.wyrwany.find((a) => a.id === 'zamach')!;
  e.startAttack(zamach, w);
  runUntil(sim, () => e.stateT >= zamach.windup - 0.08, 2);
  sim.input.press('right');
  sim.input.tap('roll');
  sim.seconds(0.6);
  sim.input.release('right');
  assert.equal(w.player.hp, w.player.maxHp);
  assert.equal(sim.save.stats.perfectDodges, 1);
});

test('the Strażnik shield stops light attacks from the front but not heavy ones', () => {
  const sim = makeSim({ location: 'katedra' });
  const w = sim.world;
  const e = duel(sim, 'straznik', 46);
  const hp0 = e.hp;
  sim.input.tap('light');
  sim.seconds(0.5);
  assert.equal(e.hp, hp0, 'light blocked');
  assert.equal(w.player.state === 'bounced' || w.player.stateT >= 0, true);
  sim.seconds(0.6);
  sim.input.press('heavy');
  sim.seconds(0.5);
  sim.input.release('heavy');
  sim.seconds(0.9);
  assert.ok(e.hp < hp0, 'heavy breaks through');
});

test('death drops carried ash, respawn keeps it in the world and it can be recovered', () => {
  const sim = makeSim({ location: 'rynek' });
  const w = sim.world;
  w.enemies = [];
  sim.save.zuzel = 250;
  w.player.hp = 1;
  w.hurtPlayerRaw(50, 'test');
  assert.equal(w.player.dead, true);
  sim.seconds(3.5);
  assert.ok(sim.events.includes('died'));
  w.respawn();
  assert.equal(sim.save.zuzel, 0);
  assert.equal(sim.save.lost?.amount, 250);
  assert.ok(w.lostAsh, 'ash placed in the world');
  w.enemies = [];
  const p = w.player;
  p.body.x = w.lostAsh!.x - p.body.w / 2;
  p.body.y = w.lostAsh!.y - p.body.h - 1;
  sim.step(3);
  assert.equal(sim.save.zuzel, 250);
  assert.equal(sim.save.lost, null);
});

test('resting at a shrine restores the player and records the respawn point', () => {
  const sim = makeSim({ location: 'rynek' });
  const w = sim.world;
  const shrine = w.interactables.find((i) => i.kind === 'shrine')!;
  w.player.hp = 10;
  w.player.flasks = 0;
  w.rest(shrine);
  assert.equal(w.player.hp, w.player.maxHp);
  assert.equal(w.player.flasks, w.player.flaskMax);
  assert.equal(sim.save.expedition?.shrine, shrine.id);
  assert.ok(sim.events.includes('save'));
});

test('chest loot is deterministic per expedition and recorded', () => {
  const a = makeSim({ location: 'ogrod', seed: 77 });
  const b = makeSim({ location: 'ogrod', seed: 77 });
  const ca = a.world.interactables.filter((i) => i.kind === 'chest');
  const cb = b.world.interactables.filter((i) => i.kind === 'chest');
  assert.ok(ca.length >= 2, 'several chests');
  assert.deepEqual(ca.map((c) => c.id), cb.map((c) => c.id));
  const ta = a.world.openChest(ca[0]);
  const tb = b.world.openChest(cb[0]);
  assert.equal(ta, tb);
  assert.ok(a.save.expedition!.chests.includes(ca[0].id));
  // the shrine-room chest always holds a wax seed on the first visit
  const seed = a.world.interactables.find((i) => i.kind === 'chest' && i.data === 'seed')!;
  assert.match(a.world.openChest(seed), /Woskowe Ziarno/);
  assert.ok(a.save.flaskSeeds.includes('ogrod'));
});

test('breaking a secret wall persists in the expedition', () => {
  const sim = makeSim({ location: 'rynek', seed: 5 });
  const w = sim.world;
  let wall: [number, number] | null = null;
  for (let x = 0; x < w.level.w && !wall; x++) for (let y = 0; y < w.level.h; y++) if (w.level.tile(x, y) === 4) wall = [x, y];
  assert.ok(wall, 'level has a secret wall');
  w.breakWalls({ x: wall![0] * T + 4, y: wall![1] * T + 4, w: 8, h: 8 });
  assert.equal(w.level.tile(wall![0], wall![1]), 0);
  assert.equal(sim.save.expedition!.walls.length, 1);
  w.loadExpedition();
  assert.equal(w.level.tile(wall![0], wall![1]), 0, 'stays broken after reload');
});

// ------------------------------------------------------------------ boss fights with a scripted player
interface BotResult {
  won: boolean;
  phase2: boolean;
  time: number;
  dmgTaken: number;
  flasks: number;
}

function fightBoss(location: LocationId, seconds = 300): BotResult {
  const save = newSave();
  // a mid-game character: a few levels and an upgraded weapon
  save.attrs = { wigor: 8, wytrwalosc: 5, sila: 6, rezonans: 3 };
  save.weapons.klucz = 2;
  save.flaskSeeds = ['rynek', 'ogrod'];
  const sim = makeSim({ location, seed: 99, save });
  const w = sim.world;
  const p = w.player;
  const inp = sim.input;
  w.enemies = [];
  p.body.x = (w.level.gateCol + 6) * T;
  p.body.y = FLOOR - p.body.h - 1;
  sim.step(2);
  assert.ok(w.boss, 'boss spawned when entering the arena');
  const b = w.boss!;
  let phase2 = false;
  let dmgTaken = 0;
  let lastHp = p.hp;
  let blockT = 0;
  let t = 0;
  const release = () => ['left', 'right', 'block'].forEach((a) => inp.release(a as never));
  for (; t < seconds * 60 && !b.defeated && !p.dead; t++) {
    if (p.hp < lastHp) dmgTaken += lastHp - p.hp;
    lastHp = p.hp;
    if (b.phase === 2) phase2 = true;
    w.enemies = w.enemies.filter((e) => !e.dead);
    const dx = b.cx - p.cx;
    const dir = dx > 0 ? 'right' : 'left';
    release();
    if (blockT > 0) {
      blockT--;
      inp.press('block');
      sim.step();
      continue;
    }
    const m = b.move;
    const remaining = m ? m.windup * w.windupMul * (b.bossId !== 'dzwon' && b.phase === 2 ? 0.85 : 1) - b.stateT : 99;
    // incoming moths: parry them
    const moth = w.projectiles.find((pr) => pr.team === 'enemy' && Math.hypot(pr.x - p.cx, pr.y - p.cy) < 70);
    const minion = w.enemies.find((e) => Math.abs(e.cx - p.cx) < 50);
    const ring = w.hazards.find((h) => h.kind === 'ring' && Math.hypot(p.cx - h.x, p.cy - h.y) - h.r < 50 && Math.hypot(p.cx - h.x, p.cy - h.y) > h.r);
    const molten = w.hazards.find((h) => (h.kind === 'molten' && h.t < h.warn + h.life && Math.abs(h.x - p.cx) < 50) || (h.kind === 'fire' && Math.abs(h.x - p.cx) < h.w / 2 + 12));
    if (ring && p.stamina > 20) inp.tap('roll');
    else if (molten) {
      inp.press(molten.x > p.cx ? 'left' : 'right');
      if (molten.kind === 'fire' && p.body.onGround && Math.random() < 0.1) inp.tap('jump');
    } else if (moth && p.state !== 'roll') {
      blockT = 8;
      inp.press('block');
    } else if (b.state === 'windup' && m && m.red && remaining < 0.14 && Math.abs(dx) < 260) {
      inp.press(dir);
      inp.tap('roll');
    } else if (b.state === 'windup' && m && !m.red && remaining < 0.1 && Math.abs(dx) < 260 && m.dmg > 0) {
      p.face = dx > 0 ? 1 : -1;
      blockT = 14;
      inp.press('block');
    } else if (p.hp < p.maxHp * 0.4 && p.flasks > 0 && (b.state === 'recover' || b.state === 'grounded' || b.state === 'stagger' || Math.abs(dx) > 200)) {
      inp.tap('heal');
    } else if (p.pips >= 2 && Math.abs(dx) < 120) {
      inp.tap('skill');
    } else if (minion) {
      p.face = minion.cx > p.cx ? 1 : -1;
      inp.tap('light');
    } else {
      const flying = b.bossId === 'pasterz' && !b.vulnerable && b.state !== 'grounded';
      const bellHigh = b.bossId === 'dzwon' && b.phase === 1 && b.state !== 'grounded';
      if (Math.abs(dx) > 55) inp.press(dir);
      else if (flying) {
        if (p.body.onGround) inp.tap('jump');
        else if (p.body.vy > -150) inp.tap('light');
        inp.press('jump');
      } else if (!bellHigh) {
        p.face = dx > 0 ? 1 : -1;
        inp.tap('light');
      }
    }
    sim.step();
  }
  return { won: b.defeated && !!sim.save.bosses[b.bossId as BossId], phase2, time: t / 60, dmgTaken: Math.round(dmgTaken), flasks: p.flasks };
}

for (const loc of ['rynek', 'ogrod', 'katedra'] as LocationId[]) {
  test(`scripted player can defeat the ${loc} boss; both phases occur`, () => {
    const r = fightBoss(loc);
    console.log(`  ${loc}: won=${r.won} phase2=${r.phase2} time=${r.time.toFixed(1)}s damage taken=${r.dmgTaken} flasks left=${r.flasks}`);
    assert.ok(r.phase2, 'second phase reached');
    assert.ok(r.won, 'boss defeated and recorded in the save');
  });
}
