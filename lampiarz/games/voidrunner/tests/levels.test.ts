// Every room layout is checked with the real player physics (see levelsim.ts): the exit, every
// object, every pickup and every static enemy must be reachable from the spawn without touching
// hazard tiles. Then every planned room of many expeditions is checked for broken placements.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/core/consts';
import { planArea } from '../src/world/expedition';
import { buildGrid, TEMPLATES } from '../src/world/rooms';
import { T_EMPTY, T_HAZARD, T_SOLID } from '../src/world/tiles';
import { near, simulateRoom, touches } from './levelsim';

const results = new Map<string, ReturnType<typeof simulateRoom>>();
const sim = (id: string) => {
  if (!results.has(id)) {
    const t = TEMPLATES.find((x) => x.id === id)!;
    const g = buildGrid(t);
    const P = g.marks.find((m) => m.m === 'P')!;
    results.set(id, simulateRoom(g, P.x, P.y));
  }
  return results.get(id)!;
};

for (const t of TEMPLATES) {
  test(`room "${t.id}": exit, objects, pickups and turrets reachable with real physics`, () => {
    const g = buildGrid(t);
    const r = sim(t.id);
    assert.ok(r.stand.size > 5, `${t.id}: player can move around (${r.stand.size} cells)`);
    const X = g.marks.find((m) => m.m === 'X')!;
    const door = { x: X.x * TILE + 1, y: (X.y - 2) * TILE, w: TILE - 2, h: TILE * 3 };
    assert.ok(touches(r.path, door), `${t.id}: exit door at (${X.x},${X.y}) can be reached`);
    for (const m of g.marks) {
      const cx = m.x * TILE + TILE / 2;
      const cy = m.y * TILE + TILE / 2;
      if (m.m === '$') assert.ok(near(r.path, cx, cy, 8), `${t.id}: pickup $ at (${m.x},${m.y}) reachable`);
      if (['O', 'C', 'S', 'T'].includes(m.m)) assert.ok(near(r.path, cx, cy, 14), `${t.id}: ${m.m} at (${m.x},${m.y}) reachable`);
      if (m.m === 't') {
        // turrets do not move: an attack (forward cut or upward cut) must be able to reach them
        const ceiling = g.tiles[(m.y - 1) * g.w + m.x] === T_SOLID;
        const box = { x: m.x * TILE, y: ceiling ? m.y * TILE : m.y * TILE + 4, w: TILE, h: 12 };
        const reach = r.path.some(
          (b) =>
            // forward cut ~24 px either side at body height, upward cut 22 px above the head
            (box.x < b.x + b.w + 24 && box.x + box.w > b.x - 24 && box.y < b.y + b.h - 4 && box.y + box.h > b.y + 4) ||
            (box.x < b.x + b.w + 8 && box.x + box.w > b.x - 8 && box.y < b.y + 2 && box.y + box.h > b.y - 22),
        );
        assert.ok(reach, `${t.id}: turret at (${m.x},${m.y}) can be hit`);
      }
      if (m.m === 'g' || m.m === 'E') assert.ok(near(r.path, cx, cy, 40), `${t.id}: ground enemy slot (${m.x},${m.y}) within reach`);
    }
  });
}

test('every planned room of 60 expeditions: sane spawn, exit, enemies and obstacles', () => {
  let rooms = 0;
  for (let seed = 1; seed <= 60; seed++)
    for (let area = 0; area < 5; area++)
      for (const plan of planArea(seed * 977, area, seed % 7 === 0)) {
        rooms++;
        const g = plan.grid;
        const at = (x: number, y: number) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? T_SOLID : g.tiles[y * g.w + x]);
        const where = `seed ${seed * 977}, area ${area}, room ${plan.index} (${plan.template})`;
        // spawn: open, on the floor, no obstacle on top of it
        assert.equal(at(plan.spawn.x, plan.spawn.y), T_EMPTY, `${where}: spawn open`);
        assert.equal(at(plan.spawn.x, plan.spawn.y - 1), T_EMPTY, `${where}: spawn headroom`);
        assert.ok([1, 2].includes(at(plan.spawn.x, plan.spawn.y + 1)), `${where}: spawn on a floor`);
        for (const pr of plan.props) {
          if (pr.kind === 'mover' || pr.kind === 'faller' || pr.kind === 'crumble') continue;
          const x1 = pr.kind === 'saw' ? (pr.x1 ?? pr.x) + 1 : pr.x;
          const onSpawn = pr.y === plan.spawn.y && plan.spawn.x >= pr.x - 1 && plan.spawn.x <= x1 + 1;
          assert.ok(!onSpawn || pr.kind === 'crate', `${where}: ${pr.kind} placed on the spawn`);
          const onExit = pr.y === plan.exit.y && plan.exit.x >= pr.x - 1 && plan.exit.x <= x1 + 1;
          assert.ok(!onExit || pr.kind === 'crate', `${where}: ${pr.kind} blocks the exit`);
        }
        // exit door opening
        for (let k = 0; k < 3; k++) assert.equal(at(plan.exit.x, plan.exit.y - k), T_EMPTY, `${where}: exit opening`);
        // enemies inside open space, never in a wall or in a hazard
        for (const e of plan.enemies) {
          assert.notEqual(at(e.x, e.y), T_SOLID, `${where}: ${e.type} inside a wall`);
          assert.notEqual(at(e.x, e.y), T_HAZARD, `${where}: ${e.type} in a hazard`);
        }
        // a boss room always has its boss; combat rooms lock their door until cleared
        if (plan.role === 'boss') assert.ok(plan.boss, `${where}: boss present`);
        if (plan.lockDoor && plan.role !== 'boss') assert.ok(plan.enemies.length > 0, `${where}: locked door but no enemies to clear`);
      }
  assert.ok(rooms >= 1800, `checked ${rooms} rooms`);
});

test('the checker itself fails on a blocked room (sanity check of the simulator)', () => {
  const t = TEMPLATES.find((x) => x.id === 'hala')!;
  const g = buildGrid(t);
  // wall the room in two, floor to ceiling
  for (let y = 0; y < g.h; y++) g.tiles[y * g.w + 30] = T_SOLID;
  const r = simulateRoom(g, 2, g.h - 3);
  const X = g.marks.find((m) => m.m === 'X')!;
  assert.equal(touches(r.path, { x: X.x * TILE + 1, y: (X.y - 2) * TILE, w: TILE - 2, h: TILE * 3 }), false);
});

for (const [area, boss] of [[1, 'Matka Roju'], [3, 'Strażnik Rdzenia'], [4, 'Serce Pustki']] as const) {
  test(`boss "${boss}" can be beaten by a bot using real inputs (walk, double jump, attack)`, async () => {
    const { makeGame } = await import('./helpers');
    const { g, input } = makeGame(7 + area);
    const plans = planArea(g.run.seed, area);
    g.enterRoom(area, plans.findIndex((p) => p.role === 'boss'));
    const held = new Set<string>();
    const setHeld = (acts: string[]) => {
      for (const a of [...held]) if (!acts.includes(a)) {
        input.release(a as never);
        held.delete(a);
      }
      for (const a of acts) if (!held.has(a)) {
        input.press(a as never);
        held.add(a);
      }
    };
    let hp0 = -1;
    let minHp = 1e9;
    for (let f = 0; f < 60 * 300 && !g.run.bosses; f++) {
      const p = g.player;
      p.iframes = 1; // god mode: this checks that the boss CAN be hit and killed, not the bot's dodging
      p.hp = p.maxHp;
      const b = g.boss();
      const acts: string[] = [];
      if (b && !b.dead) {
        if (hp0 < 0) hp0 = b.hp;
        minHp = Math.min(minHp, b.hp);
        const bx = b.x + b.w / 2;
        const px = p.x + p.w / 2;
        if (Math.abs(bx - px) > 10) acts.push(bx > px ? 'right' : 'left');
        const above = b.y + b.h < p.y + 4;
        if (above) {
          // full jump, then the double jump near the top, cutting upwards
          const c = f % 56;
          if (c < 18 || (c >= 22 && c < 36)) acts.push('jump');
          acts.push('up');
        }
        if (f % 8 === 0) acts.push('attack');
      }
      setHeld(acts);
      if (g.pendingChoice) g.choose(g.pendingChoice.options[0]);
      g.step();
      input.endStep();
    }
    assert.ok(minHp < hp0, 'the bot managed to hit the boss');
    assert.equal(g.run.bosses, 1, `${boss} defeated within 5 minutes of simulated play (hp left ${Math.round(minHp)} of ${hp0})`);
  });
}
