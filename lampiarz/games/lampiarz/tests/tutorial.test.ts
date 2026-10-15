import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choosePath, gateOpen, newRun, objective, playerAct, spawnScripted } from '../src/game/engine';
import { DIRS4 } from '../src/game/grid';
import { deathTip } from '../src/game/tips';
import { currentObjective, newTutorialRun, TUTORIAL_STEPS, tutorialAdvance } from '../src/game/tutorial';
import { tutorialBotAction } from './helpers';
import type { Run } from '../src/game/types';
import { TILE_WALL } from '../src/game/types';

/** Plays the tutorial the way a player following the on-screen instructions would. */
function followInstructions(run: Run, maxTurns = 400): string[] {
  const reached: string[] = [];
  for (let n = 0; n < maxTurns && run.phase === 'play'; n++) {
    const step = run.tutorial!.step;
    playerAct(run, tutorialBotAction(run));
    tutorialAdvance(run);
    if (run.tutorial!.step !== step) reached.push(TUTORIAL_STEPS[run.tutorial!.step]?.title ?? 'DONE');
  }
  return reached;
}

test('tutorial: every step is reachable and it ends through the gate', () => {
  const run = newTutorialRun();
  assert.equal(run.tutorial!.step, 0);
  assert.equal(run.district.scripted, true);
  const reached = followInstructions(run);
  assert.deepEqual(reached, [...TUTORIAL_STEPS.slice(1).map((s) => s.title), 'DONE']);
  assert.equal(run.tutorial!.done, true);
  assert.equal(run.phase, 'summary');
  assert.ok(run.player.hp > 0);
});

test('tutorial: no Mrok spawns, no lantern burn while waiting', () => {
  const run = newTutorialRun();
  const oil = run.player.oil;
  for (let i = 0; i < 60; i++) playerAct(run, { type: 'wait' });
  assert.equal(run.district.enemies.length, 0);
  assert.equal(run.player.oil, oil);
  assert.equal(run.tutorial!.step, 0, 'waiting does not skip steps');
});

test('tutorial: objective follows the current step', () => {
  const run = newTutorialRun();
  const o = currentObjective(run);
  assert.match(o.title, /Krok 1\/10/);
  assert.equal(o.targets.length, 1);
});

test('objective: braziers first, then the gate; gasiciel warning is urgent', () => {
  const run = newRun({ cls: 'lampiarz', night: 1, seed: 2024, daily: null });
  run.player.oil = 6;
  let o = objective(run);
  assert.match(o.title, /Zapal znicze 0\/3/);
  assert.equal(o.targets.length, 3);
  run.player.oil = 0;
  assert.match(objective(run).title, /Brakuje oleju/);
  for (const l of run.district.lamps) if (l.kind === 'brazier') l.lit = true;
  o = objective(run);
  assert.equal(o.title, 'Brama otwarta!');
  assert.deepEqual(o.targets[0], run.district.gate);
});

test('gasiciel: needs 2 turns for a lamp, and the gate stays open once unlocked', () => {
  const run = newRun({ cls: 'kowalka', night: 1, seed: 77, daily: null });
  const d = run.district;
  d.enemies = [];
  // light the three braziers through the engine so the gate unlocks for good
  for (const b of d.lamps.filter((l) => l.kind === 'brazier')) {
    run.player.oil = 9;
    const spot = DIRS4.map((q) => ({ x: b.x + q.x, y: b.y + q.y })).find(
      (q) => d.tiles[q.y * d.w + q.x] !== TILE_WALL && !d.lamps.some((l) => l.x === q.x && l.y === q.y),
    )!;
    run.player.x = spot.x;
    run.player.y = spot.y;
    playerAct(run, { type: 'move', dx: b.x - spot.x, dy: b.y - spot.y });
    assert.ok(b.lit);
  }
  assert.equal(d.gateUnlocked, true);
  // snuff one brazier: the gate does not close any more
  d.lamps.find((l) => l.kind === 'brazier')!.lit = false;
  assert.equal(gateOpen(d), true);

  // a gasiciel next to a lit lamp takes two enemy turns to put it out
  const lamp = d.lamps.find((l) => l.kind === 'lamp')!;
  lamp.lit = true;
  const spot = DIRS4.map((q) => ({ x: lamp.x + q.x, y: lamp.y + q.y })).find(
    (q) => d.tiles[q.y * d.w + q.x] !== TILE_WALL && !d.lamps.some((l) => l.x === q.x && l.y === q.y),
  )!;
  // park the player far away so nothing interrupts
  run.player.x = d.start.x;
  run.player.y = d.start.y;
  d.enemies = [];
  spawnScripted(run, 'gasiciel', spot);
  assert.equal(d.enemies.length, 1);
  const g = d.enemies[0];
  assert.equal(Math.abs(g.x - lamp.x) + Math.abs(g.y - lamp.y), 1);
  playerAct(run, { type: 'wait' });
  assert.equal(lamp.lit, true, 'still burning after the first turn');
  playerAct(run, { type: 'wait' });
  assert.equal(lamp.lit, false, 'out after the second turn');
});

test('final district: Matka sleeps until the first brazier is lit; arrival heals', () => {
  const run = newRun({ cls: 'lampiarz', night: 1, seed: 31, daily: null });
  run.depth = 5;
  run.phase = 'path';
  run.pathOptions = [{ theme: 'latarnia', name: 'Cypel', danger: 4 }];
  run.player.hp = 1;
  choosePath(run, 'latarnia');
  assert.equal(run.player.hp, run.player.maxHp);
  const m = run.district.enemies.find((e) => e.type === 'matka')!;
  assert.equal(m.dormant, true);
  const pos = { x: m.x, y: m.y };
  for (let i = 0; i < 6; i++) playerAct(run, { type: 'wait' });
  if ((run.phase as string) === 'play') {
    const still = run.district.enemies.find((e) => e.type === 'matka')!;
    assert.deepEqual({ x: still.x, y: still.y }, pos, 'a sleeping Matka does not move');
  }
});

test('death tips are specific', () => {
  const run = newRun({ cls: 'lampiarz', night: 1, seed: 5, daily: null });
  run.killedBy = 'Łowca (elita)';
  assert.match(deathTip(run), /czerwona linia/);
  run.killedBy = 'Zaćmienie';
  assert.match(deathTip(run), /ZAĆMIENIE/);
});
