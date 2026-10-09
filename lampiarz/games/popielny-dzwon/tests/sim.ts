// Headless simulation harness: a scripted input device driving the real World.
import type { Action, Input } from '../src/core/input';
import type { LocationId } from '../src/data/content';
import { DEFAULT_SETTINGS, newSave, type SaveData } from '../src/save';
import { World } from '../src/world/world';

export class FakeInput {
  down = new Set<Action>();
  pressedAt = new Map<Action, number>();
  time = 0;
  enabled = true;
  usingPad = false;
  press(a: Action) {
    if (!this.down.has(a)) this.pressedAt.set(a, this.time);
    this.down.add(a);
  }
  release(a: Action) {
    this.down.delete(a);
  }
  tap(a: Action) {
    this.press(a);
    this.down.delete(a);
  }
  held(a: Action) {
    return this.down.has(a);
  }
  buffered(a: Action, window = 0.15) {
    const t = this.pressedAt.get(a);
    return t !== undefined && this.time - t <= window;
  }
  consume(a: Action) {
    this.pressedAt.delete(a);
  }
  axis() {
    return (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
  }
  tick(dt: number) {
    this.time += dt;
  }
  flush() {
    this.pressedAt.clear();
  }
}

export interface Sim {
  world: World;
  input: FakeInput;
  save: SaveData;
  events: string[];
  step(n?: number): void;
  seconds(s: number): void;
}

export function makeSim(opts: { location?: LocationId; seed?: number; save?: SaveData; tutorialDone?: boolean } = {}): Sim {
  const save = opts.save ?? newSave();
  save.tutorialDone = opts.tutorialDone ?? true;
  const input = new FakeInput();
  const world = new World(save, { ...DEFAULT_SETTINGS }, input as unknown as Input);
  const events: string[] = [];
  world.listeners.push((e) => events.push(e.type === 'music' ? `music:${e.mood}` : e.type));
  if (opts.location) {
    save.expedition = { location: opts.location, seed: opts.seed ?? 1234, shrine: null, shrines: [], chests: [], walls: [], events: [], flaskPenalty: 0 };
    save.inHub = false;
    world.loadExpedition();
  } else world.loadHub();
  const sim: Sim = {
    world,
    input,
    save,
    events,
    step(n = 1) {
      for (let i = 0; i < n; i++) world.step(1 / 60);
    },
    seconds(s: number) {
      sim.step(Math.round(s * 60));
    },
  };
  return sim;
}
