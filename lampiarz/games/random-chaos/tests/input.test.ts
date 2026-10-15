// Controls reliability: quick taps are never lost, player 2 has ghosting-safe
// alternative keys, an action pressed a moment too early still fires.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Input } from '../src/engine/input';
import { NO_INPUT, type PadInput } from '../src/sim/player';
import { Round } from '../src/sim/round';
import { STEP } from '../src/sim/world';

type Handler = (e: unknown) => void;
function fakeWindow() {
  const h: Record<string, Handler> = {};
  (globalThis as unknown as { document: unknown }).document = { addEventListener() {}, removeEventListener() {}, hidden: false };
  const target = {
    addEventListener: (t: string, f: Handler) => (h[t] = f),
    removeEventListener() {},
  } as unknown as Window;
  const key = (type: 'keydown' | 'keyup', code: string, repeat = false) =>
    h[type]({ code, repeat, target: null, defaultPrevented: false, preventDefault() {} });
  return { target, key, blur: () => h.blur({}) };
}

test('a key tapped and released within one frame still counts for that frame', () => {
  const w = fakeWindow();
  const inp = new Input(w.target);
  w.key('keydown', 'KeyW');
  w.key('keyup', 'KeyW');
  assert.equal(inp.pad(0).jump, true, 'tap visible to the game');
  inp.endFrame();
  assert.equal(inp.pad(0).jump, false, 'and gone on the next frame');
  // a held key stays down across frames
  w.key('keydown', 'ArrowLeft');
  inp.endFrame();
  assert.equal(inp.pad(1).left, true);
  w.key('keyup', 'ArrowLeft');
  assert.equal(inp.pad(1).left, false);
});

test('player 2 alternative keys (IJKL, numpad) and no cross-talk between players', () => {
  const w = fakeWindow();
  const inp = new Input(w.target);
  for (const c of ['KeyI', 'KeyJ', 'KeyK', 'KeyL']) w.key('keydown', c);
  assert.deepEqual(inp.pad(1), { left: true, right: true, jump: true, action: true });
  assert.deepEqual(inp.pad(0), NO_INPUT);
  inp.releaseAll();
  w.key('keydown', 'Numpad8');
  w.key('keydown', 'Numpad5');
  const p = inp.pad(1);
  assert.equal(p.jump && p.action, true);
  // blur releases everything (no stuck keys after Alt+Tab)
  w.blur();
  assert.deepEqual(inp.pad(1), NO_INPUT);
});

test('an action pressed during the cooldown fires as soon as it is ready', () => {
  const r = new Round({ game: 'knockout', mod: null, seed: 7, length: 1, names: ['A', 'B'] });
  while (r.phase === 'countdown') r.step();
  const p = r.players[0];
  r.players[1].place(1100, 520);
  p.place(400, 520);
  const step = (a: Partial<PadInput>, sec: number) => {
    for (let i = 0; i < sec / STEP; i++) {
      r.inputs = [{ ...NO_INPUT, ...a }, { ...NO_INPUT }];
      r.step();
      r.world.events.length = 0;
    }
  };
  step({}, 0.3);
  step({ action: true }, STEP * 2);
  step({}, 0.05);
  assert.ok(p.actionCd > 0, 'first dash used');
  // wait until just before the cooldown ends, tap again
  while (p.actionCd > 0.08) step({}, STEP);
  step({ action: true }, STEP * 2);
  step({}, STEP);
  assert.ok(p.actionCd > 0 && p.actionCd < 0.08, 'still cooling down while the tap is held in the buffer');
  step({}, 0.12);
  assert.ok(p.actionCd > 0.5, 'buffered action fired by itself');
});

test('gamepads: pad 1 drives player 1, pad 2 drives player 2, Start pauses', () => {
  const w = fakeWindow();
  const inp = new Input(w.target);
  const btns = (on: number[]) => Array.from({ length: 17 }, (_, i) => ({ pressed: on.includes(i), value: on.includes(i) ? 1 : 0 }));
  const pads = [
    { connected: true, axes: [-0.9, 0], buttons: btns([0]) }, // stick left + A
    { connected: true, axes: [0, 0], buttons: btns([15, 2, 9]) }, // d-pad right + X + Start
  ];
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => pads }, configurable: true });
  try {
    assert.deepEqual(inp.pad(0), { left: true, right: false, jump: true, action: false });
    assert.deepEqual(inp.pad(1), { left: false, right: true, jump: false, action: true });
    assert.equal(inp.gamepadCount(), 2);
    assert.deepEqual(inp.take(), ['Escape'], 'Start = pause');
    assert.deepEqual(inp.take(), [], 'held Start does not repeat');
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });
  }
});
