import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/core/consts';
import { makeEnemy } from '../src/game/enemies';
import { Game } from '../src/game/game';
import { spawnBoss } from '../src/game/bosses';
import { UPGRADES } from '../src/game/data';
import { makeGame, run } from './helpers';
import { silentAudio } from '../src/core/audio';

const clearRoom = (g: ReturnType<typeof makeGame>['g']) => {
  g.enemies = [];
  g.hazards = [];
  g.projectiles = [];
};

test('movement: run, jump, double jump, landing on the floor (feet on the ground)', () => {
  const { g, input } = makeGame(5);
  clearRoom(g);
  const p = g.player;
  run(g, 0.5);
  assert.equal(p.onGround, true);
  assert.equal((p.y + p.h) % TILE, 0, 'feet exactly on the tile edge');
  const x0 = p.x;
  input.press('right');
  run(g, 0.5);
  input.release('right');
  assert.ok(p.x - x0 > 40, 'runs right');
  // single jump height
  run(g, 0.4);
  const ground = p.y;
  input.press('jump');
  let top = p.y;
  run(g, 0.6, () => (top = Math.min(top, p.y)));
  input.release('jump');
  const single = ground - top;
  assert.ok(single > 36 && single < 56, `single jump ~3 tiles (${single.toFixed(1)})`);
  run(g, 0.8);
  // double jump goes clearly higher
  input.press('jump');
  run(g, 0.25);
  input.release('jump');
  g.step();
  input.press('jump');
  top = p.y;
  run(g, 0.6, () => (top = Math.min(top, p.y)));
  input.release('jump');
  assert.ok(ground - top > single + 20, `double jump higher (${(ground - top).toFixed(1)})`);
  run(g, 1);
  assert.equal(p.onGround, true);
});

test('dash: fast, gives invulnerability, one air dash per jump', () => {
  const { g, input } = makeGame(6);
  clearRoom(g);
  const p = g.player;
  run(g, 0.3);
  const x0 = p.x;
  input.press('dash');
  g.step();
  input.release('dash');
  assert.ok(p.iframes > 0, 'i-frames during the dash');
  run(g, 0.2);
  assert.ok(p.x - x0 > 40, 'dash covers ground quickly');
  // a projectile passes through the dashing player
  run(g, 0.5);
  input.press('jump');
  g.step();
  input.release('jump');
  input.press('dash');
  g.step();
  input.release('dash');
  assert.equal(p.airDashes, 0);
  run(g, 0.5);
  input.press('dash');
  g.step();
  input.release('dash');
  assert.ok(p.dashT <= 0 || p.onGround, 'no second air dash without the permanent upgrade');
});

test('combat: combo kills a hunter, enemies drop Fragments of the Void, damage feedback', () => {
  const { g, input } = makeGame(7);
  clearRoom(g);
  run(g, 0.3);
  const p = g.player;
  const e = makeEnemy(g, 'hunter', p.x + 20, p.y + p.h - 20, false);
  e.state = 'recover';
  g.enemies.push(e);
  const hp0 = e.hp;
  input.press('attack');
  g.step();
  input.release('attack');
  run(g, 0.2);
  assert.ok(e.hp < hp0, 'first hit lands');
  assert.ok(e.flash >= 0 && g.particles.length > 0, 'hit sparks');
  for (let i = 0; i < 12 && !e.dead; i++) {
    input.press('attack');
    g.step();
    input.release('attack');
    run(g, 0.25);
  }
  assert.ok(e.dead, 'hunter defeated');
  assert.equal(g.run.kills, 1);
  run(g, 2.5);
  assert.ok(g.run.fragments > 0, 'fragments collected (they fly to the player)');
});

test('charged attack and special ability work and cost energy', () => {
  const { g, input } = makeGame(8);
  clearRoom(g);
  run(g, 0.3);
  const p = g.player;
  const e = makeEnemy(g, 'stalker', p.x + 24, p.y + p.h - 22, false);
  e.state = 'rest';
  g.enemies.push(e);
  const hp0 = e.hp;
  input.press('attack');
  run(g, 0.7);
  input.release('attack');
  run(g, 0.5);
  assert.ok(hp0 - e.hp >= 30, `charged hit is strong (${hp0 - e.hp})`);
  const en = p.energy;
  input.press('special');
  g.step();
  input.release('special');
  assert.ok(p.energy < en, 'special uses energy');
  assert.ok(g.projectiles.some((pr) => pr.kind === 'wave'), 'blade special fires a wave');
});

test('enemy attacks are telegraphed and hurt; i-frames prevent double hits', () => {
  const { g } = makeGame(9);
  clearRoom(g);
  run(g, 0.3);
  const p = g.player;
  const e = makeEnemy(g, 'hunter', p.x + 18, p.y + p.h - 20, false);
  e.state = 'chase';
  e.cd = 0;
  g.enemies.push(e);
  const states: string[] = [];
  const hp0 = p.hp;
  run(g, 1.5, () => states.push(e.state));
  assert.ok(states.includes('windup'), 'wind-up before the slash');
  assert.ok(states.indexOf('windup') < states.indexOf('slash'));
  assert.ok(p.hp < hp0, 'slash connects');
  const hits = Math.round((hp0 - p.hp) / 14);
  assert.ok(hits <= 2, 'invulnerability window limits hits');
});

test('turret charges before firing; the bolt damages the player', () => {
  const { g } = makeGame(10);
  clearRoom(g);
  run(g, 0.3);
  const p = g.player;
  const t = makeEnemy(g, 'turret', p.x + 120, p.y + p.h - 12, false);
  t.cd = 0;
  g.enemies.push(t);
  const hp0 = p.hp;
  let charged = false;
  run(g, 3, () => (charged ||= t.state === 'charge'));
  assert.ok(charged);
  assert.ok(p.hp < hp0, 'turret bolt hit');
});

test('upgrades: altar offers 3 different choices, choosing applies the effect', () => {
  const { g } = makeGame(11);
  g.offerChoice(3, 'test');
  assert.ok(g.pendingChoice);
  const opts = g.pendingChoice!.options;
  assert.equal(opts.length, 3);
  assert.equal(new Set(opts).size, 3);
  const t0 = g.time;
  g.step();
  assert.equal(g.time, t0, 'game waits while choosing');
  g.pendingChoice = { options: ['plating', 'nanoregen', 'crit'], reason: 'x' };
  const max0 = g.player.maxHp;
  g.choose('plating');
  assert.equal(g.up('plating'), 1);
  assert.equal(g.maxHp(), max0 + 20);
  assert.equal(g.pendingChoice, null);
  // maxed upgrades are never offered
  for (const id of Object.keys(UPGRADES) as (keyof typeof UPGRADES)[]) g.run.upgrades[id] = UPGRADES[id].max;
  assert.equal(g.rollUpgrades(3).length, 0);
});

test('nanoregen heals on kills, lightning chains to other enemies', () => {
  const { g } = makeGame(12);
  clearRoom(g);
  g.run.upgrades.nanoregen = 2;
  g.run.upgrades.lightning = 3;
  const p = g.player;
  p.hp = 50;
  const a = makeEnemy(g, 'drone', p.x + 30, p.y, false);
  const b = makeEnemy(g, 'drone', p.x + 60, p.y, false);
  g.enemies.push(a, b);
  let chained = false;
  for (let i = 0; i < 20 && !a.dead; i++) {
    g.hitEnemy(a, 6, 1, 10, 'melee');
    if (b.hp < b.maxHp) chained = true;
  }
  assert.ok(a.dead);
  assert.ok(p.hp >= 56, 'healed on kill');
  assert.ok(chained, 'lightning jumped to the second drone');
});

test('cracked walls break when hit and open hidden passages', () => {
  const { g } = makeGame(13, { tutorial: true });
  assert.equal(g.room.template, 'samouczek');
  const idx = g.grid.tiles.findIndex((t) => t === 4);
  assert.ok(idx >= 0);
  const tx = idx % g.grid.w;
  const ty = Math.floor(idx / g.grid.w);
  assert.ok(g.breakTilesIn({ x: tx * TILE + 2, y: ty * TILE + 2, w: 4, h: 4 }));
  assert.equal(g.grid.tiles[idx], 0);
  assert.equal(g.room.grid.tiles[idx], 4, 'the template itself stays intact for the next expedition');
});

test('doors stay locked until the room is cleared, then lead to the next room', () => {
  const { g } = makeGame(14);
  // walk to a combat room
  g.enterRoom(0, 1);
  const locked = g.room.lockDoor;
  run(g, 0.1);
  if (locked && g.enemies.length) assert.equal(g.doorLocked, true);
  for (const e of g.enemies) g.killEnemy(e);
  run(g, 0.1);
  assert.equal(g.doorLocked, false);
  const ex = g.exitRect();
  g.player.x = ex.x;
  g.player.y = ex.y + ex.h - g.player.h;
  run(g, 1);
  assert.equal(g.run.room, 2, 'moved to the next room');
});

test('bosses: health, phases and defeat reward', () => {
  for (const [area, kind] of [
    [1, 'matka'],
    [3, 'straznik'],
    [4, 'serce'],
  ] as const) {
    const { g } = makeGame(20 + area);
    g.enterRoom(area, 5);
    assert.equal(g.room.boss, kind);
    run(g, 2);
    const b = g.boss();
    assert.ok(b, `${kind} spawned after the intro`);
    assert.equal(b!.phase, 1);
    // survive a while with god mode to see the patterns run without errors
    const seen = new Set<string>();
    run(g, 20, () => {
      g.player.iframes = 1;
      g.player.hp = g.player.maxHp;
      seen.add(b!.state);
    });
    assert.ok(seen.size >= 3, `${kind} uses several patterns: ${[...seen].join(',')}`);
    b!.hp = b!.maxHp * 0.25;
    run(g, 0.5, () => (g.player.iframes = 1));
    assert.ok(b!.phase >= 2, `${kind} enters a later phase`);
    const frags = g.run.fragments;
    g.killEnemy(b!);
    assert.equal(g.run.bosses, 1);
    run(g, 3, () => (g.player.iframes = 1));
    if (kind !== 'serce') assert.ok(g.pendingChoice, 'boss reward: upgrade choice');
    else g.pendingChoice = null;
    g.pendingChoice = null;
    run(g, 3);
    assert.ok(g.run.fragments > frags, 'boss drops fragments');
    assert.equal(g.doorLocked, false, 'door opens after the boss');
  }
  // spawnBoss is the same API the room uses
  const { g } = makeGame(30);
  assert.equal(spawnBoss(g, 'matka', 100, 200).boss, 'matka');
});

test('death ends the expedition: fragments go to the permanent profile once', () => {
  const { g, meta } = makeGame(15);
  g.run.fragments = 37;
  g.player.hp = 1;
  g.damagePlayer(50, 0, true);
  assert.equal(g.player.dead, true);
  run(g, 2.5);
  assert.equal(g.over, 'dead');
  assert.ok(g.events.some((e) => e.type === 'death'));
  g.settle();
  g.settle();
  assert.equal(meta.fragments, 37);
  assert.equal(meta.stats.deaths, 1);
  assert.equal(meta.stats.runs, 1);
});

test('checkpoint snapshot and continue restore the expedition', () => {
  const { g, meta, input } = makeGame(16);
  g.enterRoom(2, 0);
  g.run.upgrades.crit = 2;
  g.run.fragments = 12;
  g.player.hp = 40;
  const snap = g.snapshot();
  assert.equal(snap.area, 2);
  const g2 = new Game(meta, silentAudio as never, input);
  g2.continueRun(snap);
  assert.equal(g2.run.area, 2);
  assert.equal(g2.room.template, g.plansFor(2)[0].template, 'same room layout from the seed');
  assert.equal(g2.up('crit'), 2);
  assert.equal(g2.player.hp, 40);
  assert.equal(g2.run.fragments, 12);
});

test('permanent upgrades change the starting stats', () => {
  const { g, meta } = makeGame(17);
  const base = g.maxHp();
  meta.perm.hp = 2;
  meta.perm.heal = 1;
  meta.perm.airdash = 1;
  g.newRun(17);
  assert.equal(g.maxHp(), base + 30);
  assert.equal(g.player.healCharges, 2);
  assert.equal(g.airDashesMax(), 2);
});

test('heal uses a charge and restores health', () => {
  const { g, input } = makeGame(18);
  clearRoom(g);
  g.player.hp = 30;
  input.press('heal');
  g.step();
  input.release('heal');
  assert.ok(g.player.hp > 60);
  assert.equal(g.player.healCharges, 0);
});

test('hazard tiles hurt and bounce the player out', () => {
  const { g } = makeGame(19, { tutorial: true });
  clearRoom(g);
  const p = g.player;
  const idx = g.grid.tiles.findIndex((t) => t === 3);
  p.x = (idx % g.grid.w) * TILE + 2;
  p.y = Math.floor(idx / g.grid.w) * TILE - p.h - 2;
  const hp0 = p.hp;
  run(g, 0.4);
  assert.ok(p.hp < hp0);
  run(g, 3);
  assert.ok(!p.dead, 'one dip does not kill');
});

test('a long simulated expedition never throws (bot plays with god mode)', () => {
  const { g, input } = makeGame(99);
  let steps = 0;
  for (let i = 0; i < 60 * 240 && !g.over; i++) {
    g.player.iframes = 1;
    g.player.hp = g.player.maxHp;
    if (g.pendingChoice) g.choose(g.pendingChoice.options[0]);
    // kill the room quickly and walk to the door
    if (i % 30 === 0) for (const e of g.enemies) if (!e.dead && e.type !== 'boss') g.hitEnemy(e, 999, 1, 0, 'special');
    const b = g.boss();
    if (b && !b.dead && i % 20 === 0) g.hitEnemy(b, 120, 1, 0, 'melee');
    if (!g.doorLocked && i % 10 === 0) {
      const ex = g.exitRect();
      g.player.x = ex.x;
      g.player.y = ex.y + ex.h - g.player.h - 1;
    }
    input.endStep();
    g.step();
    steps++;
  }
  assert.equal(g.over, 'victory', `reached the end (area ${g.run.area}, room ${g.run.room})`);
  assert.equal(g.run.bosses, 3);
  assert.ok(steps > 0);
});

test('all three weapons: combo/shot, charged attack and special each damage enemies', () => {
  for (const w of ['blade', 'heavy', 'cannon'] as const) {
    const { g, input, meta } = makeGame(40);
    meta.weapons = ['blade', 'heavy', 'cannon'];
    meta.weapon = w;
    g.newRun(40);
    assert.equal(g.weapon, w);
    clearRoom(g);
    run(g, 0.3);
    const p = g.player;
    const spawn = (dx = 26) => {
      const e = makeEnemy(g, 'hunter', p.x + dx, p.y + p.h - 20, false);
      e.hp = e.maxHp = 500;
      e.state = 'recover';
      e.cd = 99;
      e.stun = 9; // a target dummy: stays where it is
      g.enemies = [e];
      return e;
    };
    let e = spawn();
    for (let i = 0; i < 3; i++) {
      input.press('attack');
      g.step();
      input.release('attack');
      run(g, 0.5);
    }
    assert.ok(e.hp < 500, `${w}: basic attack hits`);
    e = spawn();
    input.press('attack');
    run(g, 0.75);
    input.release('attack');
    run(g, 0.8);
    assert.ok(e.hp < 500, `${w}: charged attack hits`);
    e = spawn(w === 'cannon' ? 110 : 26); // the grenade is lobbed in an arc
    p.energy = p.maxEnergy;
    input.press('special');
    g.step();
    input.release('special');
    run(g, 1.6);
    assert.ok(e.hp < 500, `${w}: special hits`);
  }
});

test('controls: R and mouse buttons are bound by default and added to older saves', async () => {
  const { DEFAULT_KEYS } = await import('../src/core/input');
  assert.ok(DEFAULT_KEYS.attack.includes('KeyR') && DEFAULT_KEYS.attack.includes('Mouse0'));
  assert.ok(DEFAULT_KEYS.special.includes('Mouse2'));
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  const { loadMeta, newMeta } = await import('../src/core/save');
  const old = newMeta() as unknown as Record<string, unknown>;
  delete old.keysVersion;
  (old.keys as Record<string, string[]>).attack = ['KeyJ'];
  (old.keys as Record<string, string[]>).special = ['KeyK'];
  (old.keys as Record<string, string[]>).heal = ['KeyR']; // R already taken by the player
  mem.set('voidrunner.meta.v1', JSON.stringify(old));
  const m = loadMeta();
  assert.deepEqual(m.keys.attack, ['KeyJ', 'Mouse0'], 'R not stolen from another action');
  assert.deepEqual(m.keys.special, ['KeyK', 'Mouse2']);
  assert.deepEqual(m.keys.heal, ['KeyR']);
});
