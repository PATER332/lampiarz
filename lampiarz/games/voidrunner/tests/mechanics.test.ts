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
          assert.ok(pr.x > 0 && pr.x < gr.w - 1 && pr.y >= (pr.kind === 'faller' ? 0 : 1) && pr.y < gr.h - 1, `inside room (${pr.kind})`);
          if (pr.kind === 'crumble') {
            for (let i = 0; i < (pr.w ?? 0); i++) assert.equal(at(pr.x + i, pr.y), T_PLATFORM, 'crumble over platform tiles');
          } else if (pr.kind === 'faller') {
            assert.equal(at(pr.x, pr.y), T_SOLID, 'faller hangs from a solid ceiling');
            assert.equal(at(pr.x, pr.y + 1), T_EMPTY, 'with open space below');
          } else if (pr.kind === 'mover') {
            assert.ok((pr.x1 ?? 0) > pr.x, 'mover has a track');
            for (let x = pr.x; x <= (pr.x1 ?? pr.x) + 2; x++) assert.notEqual(at(x, pr.y), T_SOLID, 'mover track is open');
          } else if (pr.kind === 'saw') {
            assert.ok((pr.x1 ?? 0) > pr.x, 'saw has a track');
            for (let x = pr.x; x <= (pr.x1 ?? pr.x); x++) {
              assert.equal(at(x, pr.y), T_EMPTY, 'saw track open');
              assert.equal(at(x, pr.y + 1), T_SOLID, 'saw track on solid floor');
            }
            assert.ok(Math.abs(pr.x - plan.spawn.x) > 3 || Math.abs(pr.y - plan.spawn.y) > 3, 'no saw at the spawn');
          } else if (pr.kind === 'flame') {
            assert.equal(at(pr.x - (pr.dir ?? 1), pr.y), T_SOLID, 'flame comes out of a wall');
          } else {
            assert.equal(at(pr.x, pr.y), T_EMPTY, `${pr.kind} cell is open`);
            assert.ok([T_SOLID, T_PLATFORM].includes(at(pr.x, pr.y + 1)), `${pr.kind} stands on a floor`);
            if (pr.kind === 'spiketrap') assert.ok(Math.abs(pr.x - plan.spawn.x) > 4 || Math.abs(pr.y - plan.spawn.y) > 3 || plan.template !== 'sluza', 'no spikes at the spawn');
          }
          if (pr.kind === 'pad') for (let k = 1; k <= 6; k++) assert.notEqual(at(pr.x, pr.y - k), T_SOLID, 'pad has headroom');
        }
      }
  assert.ok(total > 300, `props placed (${total})`);
});

test('saw: runs along its track, bounces at the ends and cuts the player', () => {
  const { g } = makeGame(18);
  const { floor } = box(g);
  const p = g.player;
  const saw = prop(g, 'saw', 10 * TILE, floor - 15, 16, 16, { hp: 0, ax: 10 * TILE, bx: 16 * TILE, dir: 1, state: 'on' });
  p.x = 2 * TILE;
  run(g, 0.5);
  assert.ok(saw.x > 10 * TILE + 20, 'moves right');
  run(g, 3);
  assert.ok(saw.x >= 10 * TILE && saw.x <= 16 * TILE, 'stays on the track');
  let turned = false;
  let last = saw.x;
  run(g, 4, () => {
    if (saw.x < last) turned = true;
    last = saw.x;
  });
  assert.ok(turned, 'turns around at the end');
  // put the player in its way
  p.iframes = 0;
  p.x = saw.x;
  const hp0 = p.hp;
  run(g, 0.05);
  assert.ok(p.hp < hp0, 'saw hurts');
});

test('moving platform: carries the player across and the player can jump off it', () => {
  const { g, input } = makeGame(19);
  const { floor } = box(g);
  const p = g.player;
  const top = floor - 5 * TILE;
  const m = prop(g, 'mover', 6 * TILE, top, 48, 6, { hp: 0, ax: 6 * TILE, bx: 14 * TILE, state: 'on', dx: 0, t: 0 });
  p.x = m.x + 16;
  p.y = top - p.h - 6;
  p.vy = 0;
  run(g, 0.3);
  assert.equal(p.ride, m.id, 'landed on the platform');
  assert.equal(p.y + p.h, m.y, 'feet on its top');
  const relX = p.x - m.x;
  run(g, 1.5);
  assert.ok(m.x > 6 * TILE + 20, 'platform moved');
  assert.ok(Math.abs(p.x - m.x - relX) < 1.5, 'player moved with it');
  assert.equal(p.ride, m.id, 'still riding');
  input.press('jump');
  g.step();
  input.release('jump');
  assert.ok(p.vy < -200, 'can jump off a moving platform');
  assert.equal(p.ride, -1);
});

test('floor spikes: harmless while retracted, hurt when raised, telegraphed first', () => {
  const { g } = makeGame(20);
  const { floor } = box(g);
  const p = g.player;
  const sp = prop(g, 'spiketrap', 12 * TILE, floor - 12, 16, 12, { hp: 0, phase: 3.2, t: 0 });
  p.x = 12 * TILE + 2;
  run(g, 0.3);
  p.iframes = 0;
  const hp0 = p.hp;
  run(g, 1.4); // still idle
  assert.equal(sp.state, 'idle');
  assert.equal(p.hp, hp0, 'no damage while retracted');
  run(g, 0.3);
  assert.equal(sp.state, 'warn', 'warning before the spikes rise');
  assert.equal(p.hp, hp0);
  run(g, 0.65);
  assert.equal(sp.state, 'on');
  assert.ok(p.hp < hp0, 'raised spikes hurt');
});

test('flame jet: warns, then burns everything in front of the nozzle', () => {
  const { g } = makeGame(21);
  const { floor } = box(g);
  const p = g.player;
  const fl = prop(g, 'flame', TILE, floor - 22, 56, 12, { hp: 0, phase: 3.0, t: 0, dir: 1, ax: TILE });
  p.x = TILE + 20;
  run(g, 0.3);
  p.iframes = 0;
  const hp0 = p.hp;
  run(g, 0.8);
  assert.equal(fl.state, 'idle');
  run(g, 0.2);
  assert.equal(fl.state, 'warn');
  assert.equal(p.hp, hp0, 'warning does not hurt');
  run(g, 0.9);
  assert.ok(p.hp < hp0, 'flame burns');
});

test('falling debris: shakes when you walk under it, falls, breaks and grows back', () => {
  const { g } = makeGame(22);
  const { floor } = box(g);
  const p = g.player;
  const ceil = floor - 7 * TILE;
  const f = prop(g, 'faller', 15 * TILE + 3, ceil, 10, 14, { hp: 0, ax: 15 * TILE + 3, ay: ceil, vy: 0 });
  p.x = 3 * TILE;
  run(g, 0.5);
  assert.equal(f.state, 'idle', 'nothing happens far away');
  p.x = 15 * TILE;
  p.iframes = 0;
  const hp0 = p.hp;
  run(g, 0.1);
  assert.equal(f.state, 'shake', 'warning shake');
  run(g, 1.2);
  assert.equal(f.state, 'gone', 'fell and broke');
  assert.ok(p.hp < hp0, 'player standing under it got hit');
  run(g, 5.5);
  assert.equal(f.state, 'idle', 'grows back');
  assert.equal(f.y, ceil);
});

test('pogo works on saws (bounce instead of damage)', () => {
  const { g, input } = makeGame(23);
  const { floor } = box(g);
  const p = g.player;
  const saw = prop(g, 'saw', 12 * TILE, floor - 15, 16, 16, { hp: 0, ax: 12 * TILE, bx: 12 * TILE, dir: 1, state: 'on' });
  p.x = saw.x;
  p.y = saw.y - p.h - 8;
  p.vy = 0;
  const hp0 = p.hp;
  input.press('down');
  input.press('attack');
  g.step();
  input.release('attack');
  let minVy = 0;
  run(g, 0.2, () => (minVy = Math.min(minVy, p.vy)));
  input.release('down');
  assert.ok(minVy < -250, 'bounced off the saw');
  assert.equal(p.hp, hp0, 'no damage');
});

test('weather: deterministic per room, every kind appears, bosses get their own', async () => {
  const { pickWeather } = await import('../src/game/weather');
  assert.equal(pickWeather(5, 2, 3, null), pickWeather(5, 2, 3, null));
  const seen = new Set<string>();
  for (let s = 1; s < 300; s++) for (let a = 0; a < 5; a++) for (let r = 1; r < 5; r++) seen.add(pickWeather(s, a, r, null));
  for (const k of ['clear', 'rain', 'storm', 'fog', 'snow', 'ash', 'voidstorm']) assert.ok(seen.has(k), `${k} appears`);
  assert.equal(pickWeather(1, 1, 5, 'matka'), 'storm');
  assert.equal(pickWeather(1, 3, 5, 'straznik'), 'snow');
  assert.equal(pickWeather(1, 4, 5, 'serce'), 'voidstorm');
  assert.equal(pickWeather(1, 0, 0, null, true), 'rain', 'the tutorial starts in the rain');
  const { g } = makeGame(30);
  assert.ok(['clear', 'rain', 'storm', 'fog', 'snow', 'ash', 'voidstorm'].includes(g.weather), 'room has a weather');
  assert.ok(g.weatherName().length > 2);
});

test('weather: storm wind pushes you in the air and lightning strikes', () => {
  const { g, input } = makeGame(31);
  box(g);
  const p = g.player;
  g.weather = 'storm';
  run(g, 12);
  assert.ok(Math.abs(g.wind) > 10, `wind blows (${g.wind.toFixed(1)})`);
  // jump straight up: the gust moves you sideways
  const x0 = p.x;
  const dir = Math.sign(g.wind);
  input.press('jump');
  run(g, 0.5);
  input.release('jump');
  assert.ok((p.x - x0) * dir > 3, `drifted with the wind (${(p.x - x0).toFixed(1)})`);
  let flashed = false;
  run(g, 12, () => {
    if (g.lightning > 0.9) flashed = true;
  });
  assert.ok(flashed, 'lightning struck at least once in 12 s');
});

test('weather: coolant snow makes the floor slippery, fog shortens enemy sight', () => {
  const stopDistance = (weather: 'clear' | 'snow') => {
    const { g, input } = makeGame(32);
    box(g);
    g.weather = weather;
    const p = g.player;
    input.press('right');
    run(g, 0.6);
    input.release('right');
    const x0 = p.x;
    run(g, 1);
    return p.x - x0;
  };
  const dry = stopDistance('clear');
  const icy = stopDistance('snow');
  assert.ok(icy > dry * 2, `slides further on snow (${dry.toFixed(1)} vs ${icy.toFixed(1)})`);
  const { g } = makeGame(33);
  const { floor } = box(g);
  const e = makeEnemy(g, 'hunter', g.player.x + 150, floor - 20, false);
  g.enemies.push(e);
  g.weather = 'clear';
  assert.equal(g.sees(e, 180), true, 'sees the player at 150 px in clear air');
  g.weather = 'fog';
  assert.equal(g.sees(e, 180), false, 'but not in the fog');
});

test('block (Q): stops blows from the front for energy; back hits and traps still hurt', () => {
  const { g, input } = makeGame(40);
  const { floor } = box(g);
  const p = g.player;
  p.facing = 1;
  const e = makeEnemy(g, 'hunter', p.x + 20, floor - 20, false);
  g.enemies.push(e);
  input.press('block');
  run(g, 0.4); // past the parry window
  assert.equal(p.blocking, true);
  assert.equal(p.anim, 'block');
  const hp0 = p.hp;
  const en0 = p.energy;
  g.damagePlayer(20, e.x + e.w / 2, false, { kind: 'melee', enemy: e });
  assert.equal(p.hp, hp0, 'front blow blocked');
  assert.ok(p.energy < en0, 'block costs energy');
  assert.equal(g.run.blocks, 1);
  // from behind
  p.iframes = 0;
  g.damagePlayer(20, p.x - 40, false, { kind: 'melee', enemy: e });
  assert.ok(p.hp < hp0, 'hit from behind goes through');
  // traps / hazards are not blockable
  p.iframes = 0;
  const hp1 = p.hp;
  g.damagePlayer(14, p.x + 30);
  assert.ok(p.hp < hp1, 'saws, spikes and hazards ignore the guard');
  input.release('block');
  run(g, 0.2);
  assert.equal(p.blocking, false, 'guard lowered when Q is released');
});

test('block: slower movement, no attacking; empty energy breaks the guard', () => {
  const { g, input } = makeGame(41);
  box(g);
  const p = g.player;
  input.press('right');
  run(g, 0.5);
  const free = Math.abs(p.vx);
  input.press('block');
  run(g, 0.5);
  assert.ok(Math.abs(p.vx) < free * 0.5, 'moves slowly behind the shield');
  input.press('attack');
  g.step();
  input.release('attack');
  assert.equal(p.attack, null, 'cannot attack while guarding');
  input.release('right');
  run(g, 0.3);
  p.facing = 1;
  p.energy = 0;
  p.iframes = 0;
  const hp0 = p.hp;
  g.damagePlayer(20, p.x + 40, false, { kind: 'melee' });
  assert.ok(p.hp < hp0 && hp0 - p.hp < 20, 'half the damage goes through');
  assert.equal(p.blocking, false, 'guard broken');
  assert.ok(p.blockCd > 0);
  g.step();
  assert.equal(p.blocking, false, 'cannot raise it again right away');
  input.release('block');
});

test('parry: pressing Q right before the hit stuns the attacker, refunds energy, opens a counter', () => {
  const { g, input } = makeGame(42);
  const { floor } = box(g);
  const p = g.player;
  p.facing = 1;
  p.energy = 20;
  const e = makeEnemy(g, 'hunter', p.x + 20, floor - 20, false);
  e.hp = e.maxHp = 500;
  g.enemies.push(e);
  input.press('block');
  g.step();
  const hp0 = p.hp;
  g.damagePlayer(20, e.x + e.w / 2, false, { kind: 'melee', enemy: e });
  assert.equal(p.hp, hp0, 'no damage');
  assert.equal(g.run.parries, 1);
  assert.ok(e.stun > 1, 'attacker stunned');
  assert.ok(p.energy >= 35 - 0.5, 'energy refunded (+15)');
  assert.ok(p.counterT > 0, 'counter window');
  assert.ok(g.slowmo > 0, 'slow motion');
  input.release('block');
});

test('parry reflects enemy bullets back, stronger', () => {
  const { g, input } = makeGame(43);
  box(g);
  const p = g.player;
  p.facing = 1;
  g.addProjectile({ x: p.x + p.w + 40, y: p.y + 10, vx: -200, vy: 0, r: 3, dmg: 10, owner: 'enemy', kind: 'orb', life: 2, pierce: false, gravity: 0 });
  const pr = g.projectiles[g.projectiles.length - 1];
  run(g, 0.12);
  input.press('block');
  const hp0 = p.hp;
  run(g, 0.2);
  input.release('block');
  assert.equal(p.hp, hp0, 'not hurt');
  assert.equal(pr.owner, 'player', 'bullet now belongs to the player');
  assert.ok(pr.vx > 0, 'flies back');
  assert.equal(pr.dmg, 15);
});

test('keys v3: Q becomes block and healing moves to F in older saves', async () => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  const { loadMeta, newMeta } = await import('../src/core/save');
  const old = newMeta() as unknown as Record<string, unknown>;
  old.keysVersion = 2;
  const keys = old.keys as Record<string, string[]>;
  delete keys.block;
  keys.heal = ['KeyQ'];
  mem.set('voidrunner.meta.v1', JSON.stringify(old));
  const m = loadMeta();
  assert.deepEqual(m.keys.heal, ['KeyF']);
  assert.deepEqual(m.keys.block, ['KeyQ']);
  (globalThis as { localStorage?: unknown }).localStorage = undefined;
});
