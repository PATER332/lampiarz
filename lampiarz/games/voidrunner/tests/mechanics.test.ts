// Tests for the 2.0 mechanics: wall slide / wall jump, pogo (down slash), perfect dodge + counter,
// hit combo, the shield bearer and the interactive props (crate, barrel, pad, vent, crumbling walkway).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/core/consts';
import { makeEnemy } from '../src/game/enemies';
import type { Game } from '../src/game/game';
import type { Prop } from '../src/game/types';
import { planArea } from '../src/world/expedition';
import { T_EMPTY, T_PLATFORM, T_SOLID } from '../src/world/tiles';
import { makeGame, run } from './helpers';

/** Turns the current room into an empty box: solid border, open inside, nothing else in it. */
function box(g: Game) {
  const { w, h } = g.grid;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g.grid.tiles[y * w + x] = x === 0 || y === 0 || x === w - 1 || y === h - 1 ? T_SOLID : T_EMPTY;
  g.enemies = [];
  g.hazards = [];
  g.projectiles = [];
  g.props = [];
  g.objects = [];
  g.pickups = [];
  const p = g.player;
  p.x = 8 * TILE;
  p.y = (h - 1) * TILE - p.h;
  p.vx = 0;
  p.vy = 0;
  p.iframes = 0;
  run(g, 0.2);
  return { floor: (h - 1) * TILE };
}

test('wall slide slows the fall and a jump kicks away from the wall', () => {
  const { g, input } = makeGame(11);
  box(g);
  const p = g.player;
  const wallX = (g.grid.w - 1) * TILE;
  p.x = wallX - p.w - 0.5;
  p.y = 3 * TILE;
  p.vy = 120;
  input.press('right');
  let maxVy = 0;
  let slideFrames = 0;
  let slid = false;
  run(g, 0.4, () => {
    if (p.sliding) slid = true;
    // the cap applies from the frame after the slide starts
    if (p.sliding && ++slideFrames > 1) maxVy = Math.max(maxVy, p.vy);
  });
  assert.ok(slid, 'slides when pressing into the wall while falling');
  assert.ok(maxVy <= 70.5, `slide speed capped (${maxVy.toFixed(1)})`);
  assert.equal(p.anim, 'wall');
  assert.equal(p.facing, -1, 'faces away from the wall');
  input.press('jump');
  g.step();
  input.release('jump');
  input.release('right');
  assert.ok(p.vy < -250, `wall jump goes up (${p.vy.toFixed(0)})`);
  assert.ok(p.vx < -100, `and away from the wall (${p.vx.toFixed(0)})`);
  run(g, 0.1);
  assert.ok(p.x < wallX - p.w - 10, 'actually leaves the wall');
});

test('pogo: a downward slash on an enemy bounces the player and restores air moves', () => {
  const { g, input, meta } = makeGame(12);
  meta.settings.damageNumbers = true;
  const { floor } = box(g);
  const p = g.player;
  const e = makeEnemy(g, 'hunter', 10 * TILE, 0, false);
  e.y = floor - e.h;
  e.onGround = true;
  g.enemies.push(e);
  p.x = e.x + e.w / 2 - p.w / 2;
  p.y = e.y - p.h - 6;
  p.vy = 0;
  p.airJumps = 0;
  p.airDashes = 0;
  input.press('down');
  input.press('attack');
  g.step();
  input.release('attack');
  let minVy = 0;
  run(g, 0.25, () => (minVy = Math.min(minVy, p.vy)));
  input.release('down');
  assert.ok(e.hp < e.maxHp, 'enemy takes damage');
  assert.ok(minVy < -250, `bounces up (${minVy.toFixed(0)})`);
  assert.ok(p.airJumps > 0, 'air jump restored');
  assert.ok(p.airDashes > 0, 'air dash restored');
});

test('perfect dodge: a hit during a dash triggers slow motion, energy and a stronger counter', () => {
  const { g, input } = makeGame(13);
  box(g);
  const p = g.player;
  const hp0 = p.hp;
  p.energy = 0;
  input.press('dash');
  g.step();
  input.release('dash');
  g.damagePlayer(20, p.x + 30);
  assert.equal(p.hp, hp0, 'no damage');
  assert.ok(g.slowmo > 0, 'slow motion');
  assert.ok(p.energy >= 30, 'energy bonus');
  assert.ok(p.counterT > 0, 'counter window open');
  assert.equal(g.run.perfect, 1);
  assert.ok(g.events.some((ev) => ev.type === 'toast' && ev.text.includes('Perfekcyjny')));
  // only once per dash
  g.damagePlayer(20, p.x + 30);
  assert.equal(g.run.perfect, 1);
  // counter: next melee hit deals ×1.6
  const e = makeEnemy(g, 'hunter', p.x + 20, p.y, false);
  e.maxHp = e.hp = 500;
  g.enemies.push(e);
  g.hitEnemy(e, 10, 1, 0, 'melee');
  assert.equal(e.maxHp - e.hp, 16, 'counter hit ×1.6');
  assert.equal(p.counterT, 0, 'counter consumed');
  g.hitEnemy(e, 10, 1, 0, 'melee');
  assert.equal(e.maxHp - e.hp, 26, 'normal damage afterwards');
});

test('combo: consecutive hits build a series with a bonus every 10; getting hit resets it', () => {
  const { g } = makeGame(14);
  box(g);
  const p = g.player;
  const e = makeEnemy(g, 'hunter', p.x + 20, p.y, false);
  e.maxHp = e.hp = 5000;
  g.enemies.push(e);
  const pickups0 = g.pickups.length;
  for (let i = 0; i < 10; i++) g.hitEnemy(e, 5, 1, 0, 'melee');
  assert.equal(g.run.combo, 10);
  assert.equal(g.run.bestCombo, 10);
  assert.ok(g.pickups.length > pickups0, 'bonus Fragments dropped at ×10');
  assert.ok(g.events.some((ev) => ev.type === 'toast' && ev.text === 'Seria ×10!'));
  // the series fades without hits
  run(g, 1);
  assert.equal(g.run.combo, 10, 'still alive after 1 s');
  p.iframes = 0;
  p.dashT = 0;
  p.dashGrace = 0;
  g.damagePlayer(5, p.x + 30);
  assert.equal(g.run.combo, 0, 'reset on damage');
  for (let i = 0; i < 3; i++) g.hitEnemy(e, 5, 1, 0, 'melee');
  run(g, 3);
  assert.equal(g.run.combo, 0, 'expires after the timer');
});

test('shield bearer blocks light hits from the front; heavy hits break the guard; the back is open', () => {
  const { g } = makeGame(15);
  const { floor } = box(g);
  const p = g.player;
  const e = makeEnemy(g, 'shield', p.x + 40, floor - 22, false);
  e.facing = -1; // facing the player
  e.guard = true;
  g.enemies.push(e);
  const hp0 = e.hp;
  g.hitEnemy(e, 20, 1, 0, 'melee');
  assert.equal(e.hp, hp0, 'front melee blocked');
  g.hitEnemy(e, 20, 1, 0, 'shot');
  assert.equal(e.hp, hp0, 'front shot blocked');
  g.hitEnemy(e, 20, 1, 0, 'charged');
  assert.ok(e.hp < hp0, 'charged attack goes through');
  assert.equal(e.guard, false, 'guard broken');
  assert.ok(e.stun > 0, 'stunned');
  // from behind
  const b = makeEnemy(g, 'shield', p.x + 40, floor - 22, false);
  b.facing = 1; // back turned to the player
  b.guard = true;
  g.enemies.push(b);
  const hb = b.hp;
  g.hitEnemy(b, 20, 1, 0, 'melee');
  assert.ok(b.hp < hb, 'hit from behind lands');
});

function prop(g: Game, kind: Prop['kind'], x: number, y: number, w: number, h: number, extra: Partial<Prop> = {}): Prop {
  const pr: Prop = { id: g.id(), kind, x, y, w, h, hp: 1, t: 0, state: 'idle', phase: kind === 'vent' ? 3.4 : 0, ...extra };
  g.props.push(pr);
  return pr;
}

test('props: crates break into loot, barrels explode after a fuse and hurt enemies and the player', () => {
  const { g } = makeGame(16);
  const { floor } = box(g);
  const p = g.player;
  const crate = prop(g, 'crate', p.x + 30, floor - 12, 12, 12);
  const n0 = g.pickups.length;
  g.hitProp(crate);
  assert.equal(crate.state, 'gone');
  assert.ok(g.pickups.length > n0, 'crate drops something');
  // barrel next to an enemy, player close by
  const barrel = prop(g, 'barrel', p.x + 30, floor - 14, 10, 14);
  const e = makeEnemy(g, 'hunter', barrel.x + 14, floor - 18, false);
  e.hp = e.maxHp = 200;
  g.enemies.push(e);
  const hp0 = p.hp;
  g.hitProp(barrel);
  assert.equal(barrel.state, 'lit', 'fuse lit');
  run(g, 0.2);
  assert.equal(e.hp, 200, 'no explosion yet');
  run(g, 0.4);
  assert.equal(barrel.state, 'gone', 'exploded');
  assert.ok(e.hp < 200, 'enemy caught in the blast');
  assert.ok(p.hp < hp0, 'player too close gets hurt');
});

test('props: jump pad launches, steam vent pushes and burns, crumbling walkway falls and returns', () => {
  const { g } = makeGame(17);
  const { floor } = box(g);
  const p = g.player;
  // pad under the player
  prop(g, 'pad', p.x - 3, floor - 4, p.w + 6, 4, { hp: 0 });
  let minVy = 0;
  run(g, 0.1, () => (minVy = Math.min(minVy, p.vy)));
  assert.ok(minVy < -500, `pad launch (${minVy.toFixed(0)})`);
  run(g, 2);
  g.props = [];
  // vent in its active phase right under the player
  p.x = 8 * TILE;
  run(g, 0.5);
  p.iframes = 0;
  const hp0 = p.hp;
  prop(g, 'vent', p.x, floor - 2, 10, 2, { hp: 0, t: 1.0 });
  run(g, 0.05);
  assert.ok(p.hp < hp0, 'steam burns');
  assert.ok(p.vy < 0 || !p.onGround, 'and pushes up');
  run(g, 2);
  g.props = [];
  // crumbling walkway
  const ry = g.grid.h - 5;
  const tiles: number[] = [];
  for (let i = 0; i < 3; i++) {
    const idx = ry * g.grid.w + 12 + i;
    g.grid.tiles[idx] = T_PLATFORM;
    tiles.push(idx);
  }
  const cr = prop(g, 'crumble', 12 * TILE, ry * TILE, 3 * TILE, 4, { hp: 0, tiles });
  p.x = 13 * TILE;
  p.y = ry * TILE - p.h - 1;
  p.vx = p.vy = 0;
  run(g, 0.15);
  assert.equal(p.onGround, true, 'standing on the walkway');
  assert.equal(cr.state, 'shake');
  run(g, 0.5);
  assert.equal(cr.state, 'gone');
  assert.ok(tiles.every((i) => g.grid.tiles[i] === T_EMPTY), 'tiles removed');
  run(g, 0.3);
  assert.ok(p.y + p.h > ry * TILE + 4, 'player fell through');
  run(g, 3);
  assert.equal(cr.state, 'idle', 'walkway re-formed');
  assert.ok(tiles.every((i) => g.grid.tiles[i] === T_PLATFORM));
});

test('prop placement: props sit on the floor inside the room, crumble runs are platforms', () => {
  let total = 0;
  for (let seed = 1; seed <= 25; seed++)
    for (let area = 0; area < 5; area++)
      for (const plan of planArea(seed * 7919, area)) {
        const gr = plan.grid;
        const at = (x: number, y: number) => gr.tiles[y * gr.w + x];
        for (const pr of plan.props) {
          total++;
          assert.ok(pr.x > 0 && pr.x < gr.w - 1 && pr.y > 0 && pr.y < gr.h - 1, `inside room (${pr.kind})`);
          if (pr.kind === 'crumble') {
            for (let i = 0; i < (pr.w ?? 0); i++) assert.equal(at(pr.x + i, pr.y), T_PLATFORM, 'crumble over platform tiles');
          } else {
            assert.equal(at(pr.x, pr.y), T_EMPTY, `${pr.kind} cell is open`);
            assert.ok([T_SOLID, T_PLATFORM].includes(at(pr.x, pr.y + 1)), `${pr.kind} stands on a floor`);
          }
          if (pr.kind === 'pad') for (let k = 1; k <= 6; k++) assert.notEqual(at(pr.x, pr.y - k), T_SOLID, 'pad has headroom');
        }
      }
  assert.ok(total > 300, `props placed (${total})`);
});
