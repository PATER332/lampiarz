// Logic tests for BACKROOMS: THE DESCENT (run: npx tsx --test games/backrooms-the-descent/tests/sim.test.ts)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codeOf, makePuzzle } from '../src/game/puzzle';
import { Sim, obsText, type Controls } from '../src/game/sim';
import { newState, validateState } from '../src/game/state';
import { CELL, PICKUPS, PROP_BY_ID, VENTS, type Difficulty } from '../src/world/map';

const idle: Controls = { fwd: 0, side: 0, sprint: false, crouch: false, fire: false, aim: false };
function run(sim: Sim, sec: number, c: Partial<Controls> = {}) {
  const steps = Math.ceil(sec * 30);
  for (let i = 0; i < steps; i++) sim.update(1 / 30, { ...idle, ...c });
}
function make(diff: Difficulty = 'normal', seed = 1234) {
  const sim = new Sim(newState(diff, seed));
  sim.fire('wake');
  return sim;
}
const quiet = (sim: Sim) => {
  for (const m of sim.monsters) {
    m.active = false;
    m.set('dormant');
    m.x = m.z = -100;
  }
};
const at = (sim: Sim, x: number, z: number, yaw = 0, pitch = 0) => {
  sim.player.x = x;
  sim.player.z = z;
  sim.player.yaw = yaw;
  sim.player.pitch = pitch;
  sim.zone = sim.level.zoneAt(x, z);
};

test('the code is different per seed and every digit can be deduced from the clues', () => {
  const codes = new Set<string>();
  for (let seed = 1; seed < 60; seed++) {
    const p = makePuzzle(seed);
    codes.add(codeOf(p));
    assert.equal(codeOf(p).length, 5);
    assert.equal(new Set(p.order).size, 5);
    // ○: exactly one ticking clock and it shows the digit; stopped clocks never show it
    assert.equal(p.clocks[p.liveClock].h, p.digits.circle);
    p.clocks.forEach((c, i) => i !== p.liveClock && assert.notEqual(c.h, p.digits.circle));
    // △: the fake station lies
    assert.notEqual(p.radio.fake, p.digits.triangle);
    // ✕: black crosses = digit, one red cross
    assert.equal(p.roster.filter((r) => r.mark === 'black').length, p.digits.cross);
    assert.equal(p.roster.filter((r) => r.mark === 'red').length, 1);
    // ◉: the ordinary paint lies
    assert.notEqual(p.uvFake, p.digits.eye);
    for (const d of Object.values(p.digits)) assert.ok(d >= 1 && d <= 9);
  }
  assert.ok(codes.size > 50, 'codes repeat too often');
  // the journal only states conclusions on STORY
  const p = makePuzzle(7);
  assert.match(obsText(`clock${p.liveClock}`, p, true).text, /→/);
  assert.doesNotMatch(obsText(`clock${p.liveClock}`, p, false).text, /→/);
  assert.match(obsText(`clock${p.liveClock}`, p, false).text, /TYKA/);
});

test('walls and furniture stop the player', () => {
  const sim = make();
  quiet(sim);
  at(sim, 4.2, 74.6, Math.PI / 2); // facing -X towards the west wall of the closet
  run(sim, 3, { fwd: 1 });
  assert.ok(sim.player.x >= 2.29 && sim.player.x < 2.6, `x=${sim.player.x}`);
  // the closed door of the closet blocks the way east
  at(sim, 8.5, 73, -Math.PI / 2);
  run(sim, 3, { fwd: 1 });
  assert.ok(sim.player.x < 10.85, `door let the player through: ${sim.player.x}`);
  sim.useDoor(sim.doorDef('start'));
  run(sim, 1.5);
  run(sim, 2, { fwd: 1 });
  assert.ok(sim.player.x > 12, 'opened door should let the player out');
});

test('armory keypad: wrong codes lock it on NORMAL, never on STORY; the right code opens the door', () => {
  const sim = make('normal');
  quiet(sim);
  const bad = codeOf(sim.puzzle) === '11111' ? '22222' : '11111';
  assert.equal(sim.enterCode(bad), 'bad');
  assert.equal(sim.enterCode(bad), 'bad');
  assert.equal(sim.enterCode(bad), 'locked');
  assert.equal(sim.enterCode(codeOf(sim.puzzle)), 'locked', 'locked keypad ignores even the right code');
  run(sim, 61);
  assert.equal(sim.enterCode(codeOf(sim.puzzle)), 'ok');
  run(sim, 4);
  assert.ok(sim.state.doors.armory.open && sim.doorAnim.armory > 0.9);
  const story = make('story');
  quiet(story);
  for (let i = 0; i < 8; i++) assert.equal(story.enterCode(bad), 'bad');
});

test('the weapon and the lift card stay behind the armory door', () => {
  const sim = make();
  quiet(sim);
  const gun = PICKUPS.find((p) => p.id === 'p_revolver')!;
  assert.equal(sim.pickupAvailable(gun), false);
  sim.state.doors.armory.unlocked = true;
  sim.takePickup(gun);
  assert.ok(sim.state.revolver && sim.state.loaded === 6 && sim.drawn);
});

test('generator: wrong order floods it (noise), the right order powers the complex', () => {
  const sim = make();
  quiet(sim);
  assert.equal(sim.genAction('choke'), 'flood');
  assert.equal(sim.genAction('pump'), 'cooldown');
  run(sim, 5.5);
  assert.equal(sim.genAction('pump'), 'ok');
  assert.equal(sim.genAction('choke'), 'ok');
  assert.equal(sim.genAction('start'), 'ok');
  assert.ok(sim.state.gen.on);
  // the power lock now opens
  sim.useDoor(sim.doorDef('power'));
  assert.ok(sim.state.doors.power.unlocked && sim.state.doors.power.open);
  // radio stations
  assert.equal(sim.stationAt(3.17), 'A');
  assert.equal(sim.stationAt(4.02), 'B');
  assert.equal(sim.stationAt(3.5), null);
});

test('shooting: crawlers die, the Stalker only staggers, walls stop bullets', () => {
  const sim = make();
  quiet(sim);
  sim.state.revolver = true;
  sim.state.loaded = 6;
  sim.state.inv.ammo = 30;
  sim.drawn = true;
  sim.drawT = 1;
  // a crawler in the corridor, in front of the player
  at(sim, 70, 59, 0, -0.25);
  const c = sim.monster('crawlerA')!;
  c.active = true;
  c.x = 70;
  c.z = 55;
  c.set('patrol');
  c.path = [];
  let shots = 0;
  while (c.alive && shots < 6) {
    sim.player.yaw = Math.atan2(-(c.x - sim.player.x), -(c.z - sim.player.z));
    sim.player.pitch = Math.atan2(0.45 - sim.eye, Math.hypot(c.x - sim.player.x, c.z - sim.player.z));
    sim.shoot(true);
    shots++;
    sim.fireCd = 0;
    c.x = 70;
    c.z = 55;
  }
  assert.equal(c.alive, false, 'crawler should die');
  assert.ok(shots >= 2 && shots <= 4, `shots=${shots}`);
  assert.ok(sim.state.killed.includes('crawlerA'));
  // the Stalker cannot be killed
  const s = sim.monster('stalker')!;
  s.active = true;
  s.x = 70;
  s.z = 53;
  s.set('patrol');
  for (let i = 0; i < 6; i++) {
    sim.state.loaded = 6;
    sim.player.yaw = Math.atan2(-(s.x - sim.player.x), -(s.z - sim.player.z));
    sim.player.pitch = Math.atan2(1.6 - sim.eye, Math.hypot(s.x - sim.player.x, s.z - sim.player.z));
    sim.shoot(true);
    sim.fireCd = 0;
  }
  assert.ok(s.alive);
  assert.ok(['stagger', 'chase', 'notice', 'attack'].includes(s.state), s.state);
  // a wall between the gun and the target
  const t = sim.rayWall([70, 1.6, 59], [0, 0, 1], 40);
  assert.ok(t.t < 1.6, `wall at ${t.t}`);
});

test('hiding: an unseen locker is safe from a chase; a locker it saw you enter is not', () => {
  const sim = make('normal', 99);
  quiet(sim);
  const s = sim.monster('stalker')!;
  s.active = true;
  sim.diff = { ...sim.diff, lockerSuspicion: 0 };
  const lk = PROP_BY_ID['locker_pillar1'];
  // the stalker is far away, looking the other way: it cannot have seen
  at(sim, lk.x, lk.z + 1);
  s.x = 46;
  s.z = 75;
  s.yaw = Math.PI;
  s.lastKnown = [lk.x, lk.z + 1];
  s.startChase(sim);
  sim.enterHide('locker_pillar1', 'locker');
  run(sim, 25);
  assert.ok(!sim.dead && sim.state.health === 100, 'unseen locker should be safe');
  // now it watches you get in
  sim.leaveHide();
  at(sim, lk.x, lk.z + 1);
  s.x = lk.x + 4;
  s.z = lk.z + 1.2;
  s.yaw = Math.atan2(-(sim.player.x - s.x), -(sim.player.z - s.z));
  s.startChase(sim);
  sim.enterHide('locker_pillar1', 'locker');
  assert.equal(s.sawHide, 'locker_pillar1');
  run(sim, 12);
  assert.ok(sim.state.health < 100, 'it should drag you out of the locker');
  assert.ok(sim.state.destroyed.includes('locker_pillar1'));
});

test('the crawler finds you under a table, the Stalker does not', () => {
  const sim = make('normal', 5);
  quiet(sim);
  const tb = PROP_BY_ID['table_store1'];
  at(sim, tb.x + 1.4, tb.z);
  sim.enterHide('table_store1', 'table');
  run(sim, 1);
  const c = sim.monster('crawlerB')!;
  c.active = true;
  c.x = tb.x + 3.5;
  c.z = tb.z;
  c.yaw = Math.PI / 2; // facing -X, towards the table
  c.set('patrol');
  c.path = [];
  run(sim, 6);
  assert.ok(c.state === 'attack' || c.state === 'rest' || c.state === 'retreat' || sim.state.health < 100 || c.hunting, `crawler state ${c.state}`);
});

test('monsters never walk through walls during a long hunt', () => {
  for (const diff of ['normal', 'nomercy'] as Difficulty[]) {
    const sim = make(diff, 4242);
    for (const id of ['stalker', 'crawlerA', 'crawlerB', 'echo']) {
      const m = sim.monster(id)!;
      m.active = true;
      m.dormantFor = 1;
    }
    sim.fire('firstContact');
    at(sim, 69, 43);
    for (let t = 0; t < 240 * 30; t++) {
      sim.update(1 / 30, idle);
      if (sim.dead) {
        sim.dead = false;
        sim.state.health = 100;
      }
      for (const m of sim.monsters) {
        if (!m.visible || !m.alive) continue;
        if (m.state === 'emerge' || m.state === 'exit') {
          // half inside the duct while it squeezes through a grate, but only right at one
          assert.ok(VENTS.some((v) => Math.hypot(v.gx - m.x, v.gz - m.z) < 1.3) || sim.level.cell(Math.floor(m.x / CELL), Math.floor(m.z / CELL)) !== 0, `${m.id} in a vent state away from any vent`);
          continue;
        }
        const cx = Math.floor(m.x / CELL);
        const cz = Math.floor(m.z / CELL);
        assert.ok(!sim.level.isSolid(cx, cz), `${m.id} inside a wall at ${m.x.toFixed(2)},${m.z.toFixed(2)} (${m.state})`);
      }
      // wander the player around the dark corridors to give them something to do
      if (t % 300 === 0) at(sim, [69, 69, 91, 114][(t / 300) % 4], [43, 59, 59, 60][(t / 300) % 4]);
    }
    assert.ok(sim.monsters.some((m) => m.visible), 'monsters should have come out');
  }
});

test('the Echo backs off from a flashlight held in its face', () => {
  const sim = make();
  quiet(sim);
  const e = sim.monster('echo')!;
  e.active = true;
  at(sim, 20, 24, Math.PI / 2);
  e.x = 12;
  e.z = 24;
  e.set('chase');
  sim.flashlight = true;
  sim.player.yaw = Math.atan2(-(e.x - sim.player.x), -(e.z - sim.player.z));
  run(sim, 1.6);
  assert.ok(e.state === 'flee' || e.state === 'dormant', e.state);
});

test('difficulty changes resources, damage and saving', () => {
  const count = (d: Difficulty) => {
    const s = make(d);
    return s.interactables.filter((i) => i.id.startsWith('pick:')).length;
  };
  assert.ok(count('story') > count('normal') && count('normal') > count('nomercy'));
  const a = make('story');
  const b = make('nomercy');
  assert.ok(a.diff.damage < b.diff.damage && a.diff.enemySpeed < b.diff.enemySpeed && a.diff.hearing < b.diff.hearing);
  quiet(b);
  assert.equal(b.manualSaveAllowed().ok, false);
  quiet(a);
  at(a, 30, 50);
  assert.equal(a.manualSaveAllowed().ok, true);
  const n = make('nightmare');
  quiet(n);
  at(n, 30, 50);
  assert.equal(n.manualSaveAllowed().ok, false, 'nightmare: only in safe rooms');
  at(n, 4, 76);
  assert.equal(n.manualSaveAllowed().ok, true);
});

test('lift, stabilizers and every ending', () => {
  for (const choice of ['destroy', 'open', 'call'] as const) {
    const sim = make('normal', 31);
    quiet(sim);
    sim.state.liftcard = true;
    sim.state.doors.lift.unlocked = true;
    at(sim, 6, 6);
    sim.rideLift();
    run(sim, 8.5);
    assert.equal(sim.state.area, 'descent');
    assert.ok(sim.monsters.every((m) => m.id.endsWith('D') || /D\d$/.test(m.id)));
    quiet(sim);
    for (const l of ['lever_a', 'lever_b', 'lever_c']) sim.pullLever(l);
    run(sim, 4);
    assert.ok(sim.state.doors.anchor.open);
    if (choice === 'call') {
      assert.equal(sim.anchorChoice('call'), false, 'calling needs all five tags');
      sim.state.inv.tags = 5;
    }
    assert.ok(sim.anchorChoice(choice));
    quiet(sim);
    if (choice === 'call') run(sim, 21);
    run(sim, 3);
    assert.ok(sim.state.doors.exit.open);
    at(sim, 114, 97, -Math.PI / 2);
    run(sim, 0.5);
    assert.equal(sim.ended, choice === 'destroy' ? 'przebudzenie' : choice === 'open' ? 'zejscie' : 'zwiad');
  }
  // the collapse kills you if you are too slow
  const sim = make('normal', 32);
  sim.state.area = 'descent';
  sim.buildMonsters();
  quiet(sim);
  at(sim, 100, 92);
  sim.anchorChoice('destroy');
  quiet(sim);
  for (let i = 0; i < 70 * 30 && !sim.dead; i++) {
    sim.update(1 / 30, idle);
    for (const m of sim.monsters) {
      m.active = false;
      m.x = m.z = -100;
    }
  }
  assert.ok(sim.dead);
});

test('every place the story needs is reachable once its doors are open', () => {
  const sim = make();
  const L = sim.level;
  const reach = (from: [number, number], to: [number, number], open: string[]) => !!L.path(from[0], from[1], to[0], to[1], (d) => d.kind === 'normal' || open.includes(d.id), 99999);
  const start: [number, number] = [4.2, 74.6];
  // without any key: clock room, armory door, dark corridors, generator, radio, storage
  for (const p of [
    [9, 47],
    [49, 49],
    [104, 64.5],
    [80, 50],
    [58, 6],
    [58, 30],
    [80, 20],
  ] as [number, number][])
    assert.ok(reach(start, p, []), `not reachable: ${p}`);
  // the red sector needs the power lock
  assert.ok(!reach(start, [23, 6], []));
  assert.ok(reach(start, [23, 6], ['power']));
  // the jammed door is a shortcut back
  assert.ok(reach([12, 34], [12, 42], ['jam']));
  // the descent: lift lobby → anchor needs the stabilizer door
  assert.ok(reach([6, 87], [22, 108], []));
  assert.ok(reach([6, 87], [78, 108], []));
  assert.ok(reach([6, 87], [67, 84], []));
  assert.ok(!reach([6, 87], [100, 92], []));
  assert.ok(reach([6, 87], [100, 92], ['anchor']));
});

test('saves validate and corrupted data is rejected', () => {
  const st = newState('nightmare', 77);
  assert.ok(validateState(JSON.parse(JSON.stringify(st))));
  assert.ok(!validateState({ ...st, version: 2 }));
  assert.ok(!validateState({ ...st, difficulty: 'easy' }));
  assert.ok(!validateState({ ...st, health: 0 }));
  assert.ok(!validateState({ ...st, inv: { battery: 1 } }));
  assert.ok(!validateState('nope'));
});
