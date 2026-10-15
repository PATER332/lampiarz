// RANDOM CHAOS logic tests: physics feel, collisions, every minigame's win
// condition, bots finishing every minigame, the tournament, the modifiers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bot } from '../src/sim/bot';
import type { Coins } from '../src/sim/games/coins';
import type { Colors } from '../src/sim/games/colors';
import type { Dodge } from '../src/sim/games/dodge';
import type { King } from '../src/sim/games/king';
import type { Knockout } from '../src/sim/games/knockout';
import type { Race } from '../src/sim/games/race';
import { GAME_BY_ID, GAME_IDS, type GameId } from '../src/sim/games/registry';
import { MODS, type ModId } from '../src/sim/modifiers';
import { NO_INPUT, type PadInput } from '../src/sim/player';
import { Round } from '../src/sim/round';
import { Match } from '../src/sim/tournament';
import { STEP } from '../src/sim/world';

function round(game: GameId, mod: ModId | null = null, seed = 7) {
  const r = new Round({ game, mod, seed, length: 1, names: ['A', 'B'] });
  // skip the countdown
  while (r.phase === 'countdown') r.step();
  return r;
}
function run(r: Round, sec: number, a: Partial<PadInput> = {}, b: Partial<PadInput> = {}) {
  for (let i = 0; i < sec / STEP; i++) {
    r.inputs = [
      { ...NO_INPUT, ...a },
      { ...NO_INPUT, ...b },
    ];
    r.step();
    r.world.events.length = 0;
  }
}
/** a flat place to try the controls: Knockout's stage */
function stage() {
  const r = round('knockout');
  return r;
}

test('jump height, coyote time and jump buffering', () => {
  const r = stage();
  const p = r.players[0];
  r.players[1].place(1000, 520);
  p.place(500, 520);
  run(r, 0.2);
  assert.ok(p.grounded);
  let top = p.bottom;
  for (let i = 0; i < 90; i++) {
    run(r, STEP, { jump: true });
    top = Math.min(top, p.bottom);
  }
  const h = 520 - top;
  assert.ok(h > 140 && h < 180, `held jump ${h.toFixed(0)} px`);
  run(r, 1);
  // a tap is lower than a held jump
  const base = p.bottom;
  run(r, 0.05, { jump: true });
  let tap = p.bottom;
  for (let i = 0; i < 90; i++) {
    run(r, STEP);
    tap = Math.min(tap, p.bottom);
  }
  assert.ok(base - tap < h * 0.75, 'variable jump height');
  // coyote time: walk off the edge and jump just after
  p.place(1010, 520, 1);
  run(r, 0.3);
  let t = 0;
  while (p.grounded && t < 2) {
    run(r, STEP, { right: true });
    t += STEP;
  }
  run(r, 0.06, { right: true });
  run(r, 0.05, { right: true, jump: true });
  assert.ok(p.vy < -500, 'jump within coyote time works');
  run(r, 3);
});

test('jump buffering: pressing just before landing still jumps', () => {
  const r = stage();
  const p = r.players[0];
  r.players[1].place(1000, 520);
  p.place(640, 380);
  // fall, press jump about 0.08 s before touching the stage
  let pressed = false;
  for (let i = 0; i < 240 && !pressed; i++) {
    const tLand = (520 - p.bottom) / Math.max(1, p.vy);
    if (p.vy > 0 && tLand < 0.08) pressed = true;
    run(r, STEP, { jump: pressed });
  }
  run(r, 0.1, { jump: true });
  assert.ok(p.vy < -300 || p.bottom < 500, 'buffered jump fired on landing');
});

test('no tunnelling through thin tiles at full falling speed', () => {
  const r = round('lastStanding');
  const p = r.players[0];
  p.place(400, -800);
  run(r, 2.5);
  assert.ok(p.alive && p.bottom <= 581 && p.bottom > 300, `stopped on a tile, bottom=${p.bottom}`);
});

test('moving platforms carry the player', () => {
  const r = round('knockout');
  const p = r.players[0];
  // the left lift moves up and down at x 90..210
  const lift = r.world.solids.find((s) => s.path && s.x < 200)!;
  p.place(lift.x + lift.w / 2, lift.y, 1);
  run(r, 0.1);
  const y0 = p.bottom;
  run(r, 1.2);
  assert.ok(p.grounded && p.ground === lift, 'still standing on the lift');
  assert.ok(Math.abs(p.bottom - lift.y) < 1 && Math.abs(p.bottom - y0) > 20, 'moved with it');
});

test('both players move and jump at the same time, independently', () => {
  const r = stage();
  const [a, b] = r.players;
  a.place(450, 520);
  b.place(830, 520);
  run(r, 0.2);
  run(r, 0.4, { right: true, jump: true }, { left: true });
  assert.ok(a.cx > 470 && a.bottom < 500, 'P1 ran right and jumped');
  assert.ok(b.cx < 810 && b.grounded, 'P2 ran left on the ground');
});

test('shoves knock back and stun, stomps bounce', () => {
  const r = stage();
  const [a, b] = r.players;
  a.place(560, 520, 1);
  b.place(620, 520, -1);
  run(r, 0.2);
  run(r, 0.25, { action: true });
  assert.ok(b.stun > 0 || b.vx > 300, 'shove landed');
  run(r, 1.5);
  a.place(640, 380);
  b.place(640, 520);
  let stomped = false;
  for (let i = 0; i < 120; i++) {
    run(r, STEP);
    if (a.vy < -500 && b.stun > 0) stomped = true;
  }
  assert.ok(stomped, 'landing on the head bounces and stuns');
});

test('every minigame can be won (bots play every game to a result)', () => {
  for (const g of GAME_IDS) {
    let decided = 0;
    for (const seed of [1, 2, 3]) {
      const r = new Round({ game: g, mod: null, seed, length: 1, names: ['A', 'B'] });
      const bots = [new Bot(0, 0.9), new Bot(1, 0.6)];
      let t = 0;
      while (!r.result && t < 200) {
        for (const b of bots) b.think(r, 1 / 60, r.inputs[b.id]);
        r.update(1 / 60);
        r.world.events.length = 0;
        t += 1 / 60;
      }
      assert.ok(r.result, `${g} seed ${seed} ended`);
      if (r.result!.winner >= 0) decided++;
      assert.ok(r.t <= r.limit + 0.1, `${g}: ended within its time (+overtime)`);
    }
    assert.ok(decided >= 1, `${g}: bots won at least one of three rounds`);
  }
});

test('one result per round; no scoring after the end', () => {
  const r = round('coins');
  const c = r.game as Coins;
  c.score = [3, 1];
  assert.ok(r.finish(0, 'test'));
  assert.equal(r.finish(1, 'again'), false);
  assert.equal(r.result!.winner, 0);
  const before = [...c.score];
  // keep playing after the end: coins, hits and spike balls change nothing
  const bots = [new Bot(0), new Bot(1)];
  for (let i = 0; i < 600; i++) {
    for (const b of bots) b.think(r, 1 / 60, r.inputs[b.id]);
    r.update(1 / 60);
  }
  assert.deepEqual(c.score, before);
  assert.equal(r.result!.winner, 0);
});

test('win conditions of each minigame', () => {
  // A. falling into the void
  let r = round('lastStanding');
  r.players[1].place(60, 700);
  run(r, 1);
  assert.equal(r.result?.winner, 0);
  // B. the lava
  r = round('lavaRush');
  (r.game as unknown as { lava: number }).lava = 640;
  const first = r.world.solids.find((s) => s.oneway && Math.round(s.y) === 560)!;
  r.players[1].place(1100, 680);
  r.players[0].place(first.x + first.w / 2, 560);
  run(r, 0.3);
  assert.equal(r.result?.winner, 0);
  // C. three falls
  r = round('knockout');
  const ko = r.game as Knockout;
  for (let k = 0; k < 3; k++) {
    if (r.result) break;
    r.players[1].place(-600, 900);
    run(r, 0.1);
    assert.ok(ko.stocks[1] === 2 - k);
    run(r, 1.5);
  }
  assert.equal(r.result?.winner, 0, 'out of lives');
  // D. the flag
  r = round('race');
  const race = r.game as Race;
  r.players[1].place(race.goal.x + 20, 600);
  run(r, 0.1);
  assert.equal(r.result?.winner, 1);
  // E. more coins at the end, a tie goes to the last big coin
  r = round('coins');
  (r.game as Coins).score = [4, 4];
  r.t = r.limit;
  run(r, STEP);
  assert.equal(r.result, null, 'tie: sudden death');
  const big = (r.game as Coins).coins.find((c) => c.v === 5)!;
  assert.ok(big, 'the last big coin appears');
  r.players[0].place(big.x, big.y + 30);
  run(r, 0.2);
  assert.equal(r.result?.winner, 0);
  // F. the colours: whoever ends up in the lava loses
  r = round('colors');
  r.players[0].place(300, 700);
  run(r, 0.2);
  assert.equal(r.result?.winner, 1);
  // G. three hits
  r = round('dodge');
  const d = r.game as Dodge;
  for (let k = 0; k < 3; k++) {
    r.players[0].invuln = 0;
    (d as unknown as { damage: (p: unknown, x: number) => void }).damage(r.players[0], 0);
  }
  assert.equal(r.result?.winner, 1);
  // H. the crown: alone in the zone long enough
  r = round('king');
  const k = r.game as King;
  r.players[1].place(1150, 620);
  // the zone moves every ~10 s: follow it
  for (let i = 0; i < (k.target + 1) * 4 && !r.result; i++) {
    const z = k.zone;
    const p0 = r.players[0];
    if (!(p0.cx > z.x && p0.cx < z.x + z.w && p0.bottom <= z.y + z.h + 1 && p0.grounded)) p0.place(z.x + z.w / 2, z.y + z.h);
    run(r, 0.25);
  }
  assert.equal(r.result?.winner, 0);
  // two in the zone: nobody scores
  r = round('king', null, 9);
  const k2 = r.game as King;
  const z2 = k2.zone;
  r.players[0].place(z2.x + 40, 380);
  r.players[1].place(z2.x + z2.w - 40, 380);
  run(r, 3);
  assert.equal(k2.score[0] + k2.score[1], 0);
});

test('the race can be finished from the start by running and jumping', () => {
  const r = new Round({ game: 'race', mod: null, seed: 4, length: 1, names: ['A', 'B'] });
  const bot = new Bot(0, 1);
  for (let i = 0; i < 120 * 60 && !r.result; i++) {
    bot.think(r, 1 / 60, r.inputs[0]);
    r.inputs[1] = { ...NO_INPUT };
    r.update(1 / 60);
    r.world.events.length = 0;
  }
  assert.equal(r.result?.winner, 0, 'reached the flag');
});

test('tournament: points, draws, no repeats, disabled games, rematch', () => {
  const m = new Match({ target: 3, games: ['coins', 'king', 'dodge'], modFreq: 'off', mods: [], length: 1, names: ['A', 'B'], seed: 1 });
  let prev: GameId | null = null;
  let rounds = 0;
  while (!m.over && rounds < 50) {
    const c = m.next()!;
    assert.ok(['coins', 'king', 'dodge'].includes(c.game), 'only enabled games');
    assert.notEqual(c.game, prev, 'no game twice in a row');
    assert.equal(c.mod, null, 'modifiers off');
    prev = c.game;
    m.record({ winner: rounds === 1 ? -1 : 0, reason: '' });
    assert.equal(m.record({ winner: 1, reason: '' }), false, 'a round is recorded once');
    rounds++;
  }
  assert.ok(m.over && m.winner === 0 && m.score[0] === 3 && m.score[1] === 0);
  assert.equal(m.history.filter((h) => h.result.winner < 0).length, 1, 'the draw gave no point');
  assert.equal(m.next(), null, 'no rounds after the end');
  const re = m.rematch(5);
  assert.deepEqual(re.score, [0, 0]);
  assert.equal(re.over, false);
  // always: every round gets an allowed modifier
  const m2 = new Match({ target: 5, games: ['lastStanding', 'colors'], modFreq: 'always', mods: MODS.map((x) => x.id), length: 1, names: ['A', 'B'], seed: 3 });
  for (let i = 0; i < 20; i++) {
    const c = m2.next()!;
    assert.ok(c.mod, 'a modifier every round');
    assert.ok(!(GAME_BY_ID[c.game].noMods ?? []).includes(c.mod!), 'never a modifier the game excludes');
    m2.record({ winner: -1, reason: '' });
  }
});

test('modifiers do what they say', () => {
  // tuning
  const lg = round('knockout', 'lowGravity');
  assert.ok(lg.tuning[0].gravityMul < 1);
  const gi = round('knockout', 'giant');
  assert.ok(gi.players[0].h > 60 && gi.players[1].h > 60);
  const ti = round('knockout', 'tiny');
  assert.ok(ti.players[0].h < 40);
  // reversed: announced, then left is right for a few seconds
  const rv = round('knockout', 'reversed');
  const p = rv.players[0];
  rv.players[1].place(1000, 520);
  p.place(640, 520);
  let warned = false;
  for (let i = 0; i < 14 / STEP && rv.mod.revOn <= 0; i++) {
    rv.step();
    if (rv.mod.revWarn > 0) warned = true;
  }
  assert.ok(warned && rv.mod.revOn > 0, 'warning before reversal');
  const x0 = p.cx;
  run(rv, 0.4, { right: true });
  assert.ok(p.cx < x0, 'right moves left while reversed');
  // wind
  const wd = round('coins', 'wind');
  let gust = false;
  for (let i = 0; i < 12 / STEP; i++) {
    wd.step();
    if (wd.world.wind !== 0) gust = true;
  }
  assert.ok(gust);
  // chaos blast knocks people back
  const cb = round('dodge', 'chaosBlast');
  let knocked = false;
  for (let i = 0; i < 12 / STEP; i++) {
    cb.step();
    if (cb.players.some((q) => Math.abs(q.vx) > 300)) knocked = true;
  }
  assert.ok(knocked);
  // disappearing platforms
  const dp = round('coins', 'disappearing');
  assert.ok(dp.world.solids.filter((s) => s.oneway).every((s) => s.crumble > 0 && s.respawn > 0));
  // double trouble
  assert.ok(round('dodge', 'doubleTrouble').trouble > 1);
});

test('a new round starts clean; players wait for the countdown', () => {
  const r = new Round({ game: 'coins', mod: null, seed: 3, length: 1, names: ['A', 'B'] });
  const x0 = r.players[0].cx;
  for (let i = 0; i < 1.5 / STEP; i++) {
    r.inputs[0] = { ...NO_INPUT, right: true };
    r.step();
  }
  assert.equal(r.phase, 'countdown');
  assert.equal(r.players[0].cx, x0, 'frozen during the countdown');
  const r2 = new Round({ game: 'coins', mod: null, seed: 3, length: 1, names: ['A', 'B'] });
  assert.deepEqual((r2.game as Coins).score, [0, 0]);
  assert.equal(r2.result, null);
  assert.equal(r2.t, 0);
});

test('floor is lava: the called colour is always reachable on every row', () => {
  const r = round('colors', null, 11);
  const c = r.game as Colors;
  for (let k = 0; k < 10; k++) {
    (c as unknown as { recolor: () => void }).recolor();
    for (let row = 0; row < 3; row++) {
      const cols = new Set(c.plats.slice(row * 4, row * 4 + 4).map((s) => s.color));
      assert.equal(cols.size, 3, 'each row has every colour');
    }
  }
});

test('lava rush: every row has a platform within a comfortable jump of the last one', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = round('lavaRush', null, seed);
    const plats = r.world.solids.filter((s) => s.y < 670 && !s.path && s.crumble === 0 && !s.spring).sort((a, b) => b.y - a.y);
    const summit = Math.min(...plats.map((s) => s.y));
    assert.ok(summit < -4800, 'a tall shaft');
    let y = 680;
    let ok = true;
    while (y > summit) {
      const next = plats.filter((s) => s.y < y - 20 && s.y > y - 150);
      if (!next.length) {
        ok = false;
        break;
      }
      y = Math.max(...next.map((s) => s.y));
    }
    assert.ok(ok, `seed ${seed}: a climbable column all the way up`);
  }
});
