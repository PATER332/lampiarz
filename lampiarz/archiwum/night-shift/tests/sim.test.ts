import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Sim, type SimEvent } from '../src/game/sim';
import { newState } from '../src/game/state';
import { DOC_BY_ID, DOCS } from '../src/game/story';
import { DOOR, FLOOR, Level, propBox, SOLID } from '../src/world/level';
import { CAMERAS, CELL, DOORS, LIGHTS, PICKUPS, PLAYER_START, PROPS, VENTS } from '../src/world/map';

const still = { fwd: 0, side: 0, sprint: false, crouch: false };

function make(seed = 7) {
  const sim = new Sim(newState(seed));
  const events: SimEvent[] = [];
  sim.listeners.push((e) => events.push(e));
  return { sim, events };
}

function run(sim: Sim, seconds: number, c = still) {
  for (let i = 0; i < seconds * 60; i++) sim.update(1 / 60, c);
}

/** Stand next to an interactable, aim at it and press E. */
function use(sim: Sim, id: string, stand?: [number, number]) {
  const it = sim.interactables.find((i) => i.id === id);
  assert.ok(it, `interactable ${id}`);
  if (stand) {
    sim.player.x = stand[0];
    sim.player.z = stand[1];
  } else {
    const b = it!.box;
    // stand 1.1 m in front of the box, on the walkable side
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    let best: [number, number] | null = null;
    for (const [dx, dz] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const x = cx + dx * ((b.x1 - b.x0) / 2 + 0.8);
      const z = cz + dz * ((b.z1 - b.z0) / 2 + 0.8);
      const L = sim.level;
      if (L.cell(Math.floor(x / CELL), Math.floor(z / CELL)) === SOLID) continue;
      if (L.propBoxes.some(({ box }) => x > box.x0 - 0.3 && x < box.x1 + 0.3 && z > box.z0 - 0.3 && z < box.z1 + 0.3)) continue;
      best = [x, z];
      break;
    }
    assert.ok(best, `no standing spot for ${id}`);
    sim.player.x = best![0];
    sim.player.z = best![1];
  }
  sim.update(1 / 60, still);
  assert.ok(sim.aimAt(id), `could aim at ${id} (focus: ${sim.focus?.id})`);
  sim.interact();
  sim.update(1 / 60, still);
}

function noEnemy(sim: Sim) {
  sim.enemy.update = () => undefined;
}

test('map: rooms, doors and objects are consistent', () => {
  const L = new Level();
  for (const d of DOORS) {
    if (d.external) continue;
    const a = d.axis === 'x' ? L.cell(d.cx - 1, d.cz) : L.cell(d.cx, d.cz - 1);
    const b = d.axis === 'x' ? L.cell(d.cx + 1, d.cz) : L.cell(d.cx, d.cz + 1);
    assert.ok(a !== SOLID && b !== SOLID, `door ${d.id} has floor on both sides`);
    const s1 = d.axis === 'x' ? L.cell(d.cx, d.cz - 1) : L.cell(d.cx - 1, d.cz);
    const s2 = d.axis === 'x' ? L.cell(d.cx, d.cz + 1) : L.cell(d.cx + 1, d.cz);
    assert.ok(s1 === SOLID && s2 === SOLID, `door ${d.id} sits in a wall`);
  }
  const onFloor = (x: number, z: number, what: string) => assert.ok(L.cell(Math.floor(x / CELL), Math.floor(z / CELL)) !== SOLID, `${what} at ${x},${z} is inside a wall`);
  for (const p of PROPS) {
    const b = propBox(p);
    for (const [x, z] of [
      [b.x0 + 0.01, b.z0 + 0.01],
      [b.x1 - 0.01, b.z1 - 0.01],
      [b.x0 + 0.01, b.z1 - 0.01],
      [b.x1 - 0.01, b.z0 + 0.01],
    ])
      onFloor(x, z, `prop ${p.kind}${p.id ? ' ' + p.id : ''}`);
  }
  for (const p of PICKUPS) onFloor(p.x, p.z, `pickup ${p.id}`);
  for (const l of LIGHTS) onFloor(l.x, l.z, `light ${l.kind}`);
  for (const v of VENTS) onFloor(v.x, v.z, 'vent');
  for (const c of CAMERAS) onFloor(c.pos[0], c.pos[2], `camera ${c.id}`);
  onFloor(PLAYER_START.x, PLAYER_START.z, 'start');
  // every doc used by pickups exists
  for (const p of PICKUPS) if (p.kind === 'doc') assert.ok(DOC_BY_ID[p.ref], p.ref);
  assert.ok(DOCS.length >= 12);
});

test('map: every room is reachable when all doors are open', () => {
  const L = new Level();
  let floor = 0;
  let reached = 0;
  for (let i = 0; i < L.grid.length; i++) if (L.grid[i] !== SOLID) floor++;
  const seen = new Set<number>();
  const q = [L.idx(Math.floor(PLAYER_START.x / CELL), Math.floor(PLAYER_START.z / CELL))];
  seen.add(q[0]);
  while (q.length) {
    const c = q.pop()!;
    reached++;
    const cx = c % 38;
    const cz = Math.floor(c / 38);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = L.idx(cx + dx, cz + dz);
      if (!L.inside(cx + dx, cz + dz) || seen.has(n) || L.grid[n] === SOLID) continue;
      const door = L.doorAtCell(cx + dx, cz + dz);
      if (door?.external) continue;
      seen.add(n);
      q.push(n);
    }
  }
  assert.equal(reached, floor - 1, 'all walkable cells except the external door are connected');
  assert.ok(L.grid.some((g) => g === DOOR) && L.grid.some((g) => g === FLOOR));
});

test('collisions stop the player at walls, closed doors and furniture', () => {
  const { sim } = make();
  noEnemy(sim);
  sim.player.x = 9;
  sim.player.z = 34;
  sim.player.yaw = Math.PI / 2; // facing -X, toward the west wall of reception at x = 4
  run(sim, 4, { fwd: 1, side: 0, sprint: false, crouch: false });
  assert.ok(sim.player.x >= 4 + 0.29 && sim.player.x < 6, `stopped at the wall: x=${sim.player.x}`);
  // closed monitoring door (z = 28 line) from reception, walking north
  sim.player.x = 9;
  sim.player.z = 30;
  sim.player.yaw = 0;
  run(sim, 4, { fwd: 1, side: 0, sprint: false, crouch: false });
  assert.ok(sim.player.z > 27, `closed door blocks: z=${sim.player.z}`);
  // reception counter
  sim.player.x = 10.5;
  sim.player.z = 33;
  run(sim, 3, { fwd: 1, side: 0, sprint: false, crouch: false });
  assert.ok(sim.player.z > 30.9, `counter blocks: z=${sim.player.z}`);
});

test('missions progress from login to the power cut and the fuses', () => {
  const { sim, events } = make();
  noEnemy(sim);
  assert.equal(sim.state.mission, 0);
  sim.login();
  assert.equal(sim.state.mission, 1);
  assert.ok(sim.state.doors.rm.unlocked);
  // monitoring door now opens
  use(sim, 'door:rm');
  run(sim, 1);
  assert.ok(sim.state.doors.rm.open);
  // cameras
  use(sim, 'prop:cctv');
  assert.ok(sim.cctv);
  for (let i = 0; i < 6; i++) {
    sim.cctv!.cam = i;
    sim.cctv!.viewT = 0;
    run(sim, 1.4);
  }
  assert.equal(sim.state.camerasSeen.length, 6);
  assert.ok(sim.apparitions.length > 0 || sim.fired('cam4'), 'camera 4 showed the figure');
  run(sim, 4);
  assert.equal(sim.state.mission, 2, 'outage after the camera round');
  assert.equal(sim.state.power.main, false);
  assert.ok(!sim.powered('lights_corridor'));
  assert.ok(events.some((e) => e.type === 'scare' && e.kind === 'outage'));
  // walk into the technical room
  sim.player.x = 30;
  sim.player.z = 30;
  run(sim, 0.2);
  assert.equal(sim.state.mission, 3);
});

test('archive code door and the secret shelf need the right code', () => {
  const { sim, events } = make();
  noEnemy(sim);
  use(sim, 'door:ac');
  assert.ok(events.some((e) => e.type === 'ui' && e.screen === 'keypad' && e.ref === 'ac'));
  assert.equal(sim.enterCode('ac', '0000'), false);
  assert.equal(sim.state.doors.ac.open, false);
  assert.equal(sim.enterCode('ac', '1411'), true);
  assert.ok(sim.state.doors.ac.open);
  // the shelf is just a shelf until you know about room 0
  events.length = 0;
  use(sim, 'door:as');
  assert.ok(events.some((e) => e.type === 'message'));
  assert.ok(!events.some((e) => e.type === 'ui'));
});

test('power: capacity limits circuits and electric doors need power', () => {
  const { sim } = make();
  noEnemy(sim);
  sim.outage();
  assert.equal(sim.capacity, 2);
  assert.equal(sim.setConsumer('lights_corridor', true), false, 'not enough power on backup');
  sim.state.inventory.push('fuseA', 'fuseB');
  assert.equal(sim.insertFuses(), 2);
  assert.ok(sim.switchMain());
  assert.equal(sim.capacity, 7);
  assert.ok(sim.setConsumer('sector_c', true));
  assert.ok(sim.setConsumer('lights_corridor', true));
  assert.ok(sim.setConsumer('cameras', true));
  assert.equal(sim.used, 7);
  assert.equal(sim.setConsumer('evac', true), false);
  // Sector C door: card + power
  sim.setConsumer('doors', false);
  use(sim, 'door:kc');
  assert.equal(sim.state.doors.kc.open, false);
  sim.setConsumer('cameras', false);
  sim.setConsumer('doors', true);
  use(sim, 'door:kc');
  assert.equal(sim.state.doors.kc.open, false, 'no card yet');
  sim.state.inventory.push('card3');
  use(sim, 'door:kc');
  assert.ok(sim.state.doors.kc.open);
});

function toDecision(seed = 11) {
  const { sim, events } = make(seed);
  noEnemy(sim);
  sim.login();
  sim.state.camerasSeen = [1, 2, 3, 4, 5, 6];
  run(sim, 5);
  sim.player.x = 30;
  sim.player.z = 30;
  run(sim, 0.1);
  // fuses: lab cabinet + archive drawer
  use(sim, 'prop:cab_lab');
  use(sim, 'pick:p_fuseA');
  sim.enterCode('ac', '1411');
  use(sim, 'prop:drawer_archive');
  use(sim, 'pick:p_fuseB');
  use(sim, 'pick:p_card3');
  assert.equal(sim.insertFuses(), 2);
  assert.ok(sim.switchMain());
  run(sim, 0.1);
  assert.equal(sim.state.mission, 5);
  sim.setConsumer('cameras', false);
  sim.setConsumer('lights_corridor', false);
  assert.ok(sim.setConsumer('sector_c', true));
  use(sim, 'door:kc');
  assert.ok(sim.state.doors.kc.open);
  sim.player.x = 60;
  sim.player.z = 20;
  run(sim, 0.1);
  assert.equal(sim.state.mission, 6);
  use(sim, 'door:kk');
  sim.chamberRead();
  run(sim, 1);
  assert.equal(sim.state.mission, 7);
  assert.ok(sim.has('knowsRoom0'));
  return { sim, events };
}

test('ending: escape by the evacuation lift', () => {
  const { sim, events } = toDecision();
  use(sim, 'prop:switch_emergency');
  assert.ok(sim.has('emergencyUnlocked'));
  sim.setConsumer('sector_c', false);
  assert.ok(sim.setConsumer('evac', true));
  use(sim, 'door:ec');
  assert.ok(sim.state.doors.ec.open);
  use(sim, 'prop:lift');
  assert.equal(sim.final?.kind, 'lift');
  sim.player.x = 50;
  sim.player.z = 32;
  run(sim, 41);
  assert.ok(sim.final!.done);
  use(sim, 'prop:lift');
  assert.equal(sim.ended, 'ewakuacja');
  assert.ok(events.some((e) => e.type === 'ending' && e.id === 'ewakuacja'));
});

test('ending: transmit the truth from the radio', () => {
  const { sim } = toDecision();
  // room 0 behind the shelf
  sim.enterCode('ac', '1411');
  assert.ok(sim.enterCode('as', '0317'));
  use(sim, 'pick:p_tape');
  use(sim, 'pick:p_d11');
  assert.ok(sim.hasItem('tape'));
  sim.setConsumer('sector_c', false);
  assert.ok(sim.setConsumer('transmitter', true));
  assert.ok(sim.transmit());
  // leaving the room pauses the transmission
  sim.player.x = 9;
  sim.player.z = 32;
  run(sim, 10);
  assert.ok(sim.final!.t < 0.5, 'paused outside monitoring');
  sim.player.x = 9;
  sim.player.z = 21;
  run(sim, 46);
  assert.equal(sim.ended, 'sygnal');
});

test('ending: stop the continuity in the chamber', () => {
  const { sim } = toDecision();
  sim.enterCode('ac', '1411');
  sim.enterCode('as', '0317');
  use(sim, 'pick:p_key');
  assert.ok(sim.canStop());
  assert.ok(sim.stopContinuity());
  sim.player.x = 70;
  sim.player.z = 18;
  run(sim, 26);
  assert.equal(sim.ended, 'cisza');
});

test('ending: obey and run the test', () => {
  const { sim } = toDecision();
  assert.ok(sim.runTest());
  assert.equal(sim.ended, 'test');
});

// ------------------------------------------------------------------ AI
function huntSetup() {
  const { sim, events } = make(3);
  sim.state.mission = 7;
  sim.state.flags.push('truth');
  sim.state.events.push('enemyIntro', 'welcome');
  sim.state.power.on = [];
  sim.computeLit();
  return { sim, events };
}

test('AI: Przestój notices a visible player, chases and catches', () => {
  const { sim, events } = huntSetup();
  sim.player.x = 30;
  sim.player.z = 22;
  const e = sim.enemy;
  e.x = 40;
  e.z = 22;
  e.yaw = Math.PI / 2; // facing -X, toward the player
  e.set('patrol');
  e.roamT = 30;
  e.path = [];
  let saw: string[] = [];
  for (let i = 0; i < 60 * 8 && !sim.dead; i++) {
    sim.update(1 / 60, still);
    if (!saw.includes(e.state)) saw.push(e.state);
  }
  assert.ok(saw.includes('notice') && saw.includes('chase'), saw.join(','));
  assert.ok(sim.dead, 'caught the motionless player');
  assert.ok(events.some((x) => x.type === 'death'));
});

test('AI: hiding in a locker unseen makes it lose the trail', () => {
  const { sim } = huntSetup();
  const e = sim.enemy;
  // player already inside the corridor locker, enemy searching nearby
  const locker = sim.interactables.find((i) => i.id === 'prop:locker_c2')!;
  sim.player.x = 46;
  sim.player.z = 21.5;
  sim.player.yaw = 0;
  use(sim, 'prop:locker_c2', [46, 21.5]);
  assert.ok(sim.player.hidden);
  void locker;
  e.x = 36;
  e.z = 22;
  e.set('search');
  e.lastKnown = [46, 22];
  e.path = [];
  run(sim, 20);
  assert.equal(sim.dead, false);
  assert.ok(e.state !== 'chase' && e.state !== 'lockerHunt', e.state);
});

test('AI: if it sees you get into a locker, it rips the door open', () => {
  const { sim } = huntSetup();
  const e = sim.enemy;
  sim.player.x = 46;
  sim.player.z = 21.5;
  e.x = 41;
  e.z = 22;
  e.yaw = -Math.PI / 2; // facing +X toward the player
  e.set('chase');
  use(sim, 'prop:locker_c2', [46, 21.5]);
  assert.ok(sim.player.hidden);
  run(sim, 6);
  assert.ok(sim.dead);
});

test('AI: a flashlight held on it drives it back', () => {
  const { sim } = huntSetup();
  const e = sim.enemy;
  sim.player.x = 30;
  sim.player.z = 22;
  sim.player.yaw = -Math.PI / 2; // facing +X
  sim.player.pitch = 0;
  sim.flashlight = true;
  e.x = 36;
  e.z = 22;
  e.yaw = Math.PI / 2;
  e.set('patrol');
  e.roamT = 30;
  e.path = [];
  const battery = sim.state.battery;
  let retreated = false;
  for (let i = 0; i < 60 * 3; i++) {
    sim.update(1 / 60, still);
    if (e.state === 'retreat') retreated = true;
  }
  assert.ok(retreated, 'retreated');
  assert.ok(sim.state.battery < battery - 0.05, 'cost battery');
  assert.equal(sim.dead, false);
});

test('AI: it emerges from vents only out of sight and announces itself', () => {
  const { sim, events } = huntSetup();
  const e = sim.enemy;
  sim.player.x = 30;
  sim.player.z = 30; // technical room
  e.hiddenFor = 0;
  run(sim, 0.2);
  assert.equal(e.state, 'emerging');
  assert.ok(events.some((x) => x.type === 'sfx' && x.name === 'ventRattle'));
  assert.ok(VENTS.some((v) => v.x === e.x && v.z === e.z));
});

test('save state round-trips the logical world', () => {
  const { sim } = toDecision();
  sim.syncState();
  const copy = JSON.parse(JSON.stringify(sim.state));
  const again = new Sim(copy);
  assert.equal(again.state.mission, 7);
  assert.ok(again.state.doors.kc.open);
  assert.ok(again.has('truth'));
  assert.equal(again.capacity, 7);
});
