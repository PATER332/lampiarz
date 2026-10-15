import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGrid, TEMPLATES } from '../src/world/rooms';
import { planArea, planExpedition, ROOMS_PER_AREA } from '../src/world/expedition';
import { AREAS } from '../src/world/areas';
import { reachable } from './helpers';

test('every room template: exit, objects and pickups are reachable from the spawn', () => {
  for (const t of TEMPLATES) {
    const g = buildGrid(t);
    const p = g.marks.find((m) => m.m === 'P')!;
    const x = g.marks.find((m) => m.m === 'X')!;
    assert.ok(p && x, `${t.id}: spawn and exit`);
    for (let r = 0; r < g.h; r++) assert.equal(g.tiles.slice(r * g.w, r * g.w + g.w).length, g.w);
    const seen = reachable(g, p.x, p.y);
    const ok = (mx: number, my: number) => seen.has(my * g.w + mx);
    assert.ok(ok(x.x, x.y), `${t.id}: exit (${x.x},${x.y}) unreachable`);
    // the exit door needs a 3-tile opening
    for (let k = 0; k < 3; k++) assert.equal(g.tiles[(x.y - k) * g.w + x.x], 0, `${t.id}: door blocked`);
    for (const m of g.marks) {
      if (m.m === '$') {
        // floating pickups: reachable if the player can stand within a jump below them
        let near = false;
        for (let dy = 0; dy <= 4; dy++) for (let dx = -1; dx <= 1; dx++) if (ok(m.x + dx, m.y + dy)) near = true;
        assert.ok(near, `${t.id}: $ at ${m.x},${m.y} out of reach`);
      } else if (['O', 'C', 'S', 'T'].includes(m.m)) assert.ok(ok(m.x, m.y) || ok(m.x, m.y + 1) || ok(m.x - 1, m.y) || ok(m.x + 1, m.y), `${t.id}: ${m.m} at ${m.x},${m.y} unreachable`);
    }
  }
});

test('expeditions: 5 sectors × 6 rooms, start → … → finale, valid for many seeds', () => {
  for (let seed = 1; seed < 120; seed++) {
    const exp = planExpedition(seed, seed % 3 === 0);
    assert.equal(exp.length, AREAS.length);
    exp.forEach((rooms, a) => {
      assert.equal(rooms.length, ROOMS_PER_AREA);
      assert.equal(rooms[0].role, 'start');
      assert.equal(rooms[rooms.length - 1].role, AREAS[a].boss ? 'boss' : 'elite');
      const ids = rooms.map((r) => r.template);
      assert.equal(new Set(ids.slice(1, -1)).size, ids.length - 2, 'no template repeats inside a sector');
      for (const r of rooms) {
        assert.ok(r.objects.some((o) => o.kind === 'checkpoint') || r.role !== 'start', 'start room has a checkpoint');
        if (r.role === 'upgrade') assert.ok(r.objects.some((o) => o.kind === 'altar'), 'upgrade room has an altar');
        for (const e of r.enemies) assert.notEqual(r.grid.tiles[e.y * r.grid.w + e.x], 1, 'enemy not inside a wall');
        for (const l of r.lasers) assert.ok(Math.abs(l.x - r.spawn.x) >= 6 && l.y1 > l.y0);
      }
    });
  }
});

test('the same seed always gives the same expedition, different seeds differ', () => {
  const a = planArea(77, 2).map((r) => r.template + r.enemies.length);
  const b = planArea(77, 2).map((r) => r.template + r.enemies.length);
  assert.deepEqual(a, b);
  const variants = new Set<string>();
  for (let s = 0; s < 30; s++) variants.add(planArea(s, 2).map((r) => r.template).join(','));
  assert.ok(variants.size > 5, 'room order varies between expeditions');
});
