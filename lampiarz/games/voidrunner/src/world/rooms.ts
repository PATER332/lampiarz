// Handcrafted room templates. Every room is authored with a tiny builder (rectangles in tile
// coordinates); the expedition builder later fills the slots (enemies, objects) per area.
// All layouts are checked by tests/rooms.test.ts: the exit and every slot must be reachable.

import type { Mark, MarkAt, RoomGrid, TrapAt } from './tiles';
import { T_BREAK, T_EMPTY, T_HAZARD, T_PLATFORM, T_SOLID } from './tiles';

export type RoomKind = 'start' | 'combat' | 'platform' | 'vertical' | 'arena' | 'boss' | 'treasure';

export interface RoomTemplate {
  id: string;
  kind: RoomKind;
  w: number;
  h: number;
  /** areas (0-based) this template may appear in; omitted = all */
  areas?: number[];
  build: (b: Builder) => void;
}

export class Builder {
  tiles: Uint8Array;
  marks: MarkAt[] = [];
  traps: TrapAt[] = [];
  constructor(
    public w: number,
    public h: number,
  ) {
    this.tiles = new Uint8Array(w * h);
    // border + 2-tile thick floor
    this.fill(0, 0, w - 1, 0, T_SOLID);
    this.fill(0, 0, 0, h - 1, T_SOLID);
    this.fill(w - 1, 0, w - 1, h - 1, T_SOLID);
    this.fill(0, h - 2, w - 1, h - 1, T_SOLID);
  }
  fill(x0: number, y0: number, x1: number, y1: number, t: number) {
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) this.tiles[y * this.w + x] = t;
    return this;
  }
  solid(x0: number, y0: number, x1: number, y1: number) {
    return this.fill(x0, y0, x1, y1, T_SOLID);
  }
  clear(x0: number, y0: number, x1: number, y1: number) {
    return this.fill(x0, y0, x1, y1, T_EMPTY);
  }
  plat(x0: number, x1: number, y: number) {
    return this.fill(x0, y, x1, y, T_PLATFORM);
  }
  /** hazard strip set into the floor at row y (replaces the top floor row) */
  haz(x0: number, x1: number, y: number) {
    return this.fill(x0, y, x1, y, T_HAZARD);
  }
  crack(x0: number, y0: number, x1: number, y1: number) {
    return this.fill(x0, y0, x1, y1, T_BREAK);
  }
  m(m: Mark, x: number, y: number, text?: string) {
    this.marks.push({ m, x, y, text });
    return this;
  }
  /** a circular saw running along the floor of standing row y between tiles x0 and x1 */
  saw(x0: number, x1: number, y: number) {
    this.traps.push({ kind: 'saw', x: x0, y, x1 });
    return this;
  }
  /** a moving platform (3 tiles wide) gliding between tiles x0 and x1 on row y (its top) */
  mover(x0: number, x1: number, y: number) {
    this.traps.push({ kind: 'mover', x: x0, y, x1 });
    return this;
  }
  /** retractable floor spikes under standing cell (x, y) */
  spikes(x: number, y: number) {
    this.traps.push({ kind: 'spiketrap', x, y });
    return this;
  }
  /** a flame jet from a wall at standing cell (x, y), blowing in direction dir */
  flame(x: number, y: number, dir: 1 | -1) {
    this.traps.push({ kind: 'flame', x, y, dir });
    return this;
  }
  /** a stalactite / loose debris hanging under the ceiling tile above column x (y = ceiling row) */
  faller(x: number, y: number) {
    this.traps.push({ kind: 'faller', x, y });
    return this;
  }
  /** standard spawn on the left and exit on the right, standing on row y */
  ends(spawnY = this.h - 3, exitY = this.h - 3) {
    this.m('P', 2, spawnY);
    this.m('X', this.w - 2, exitY);
    return this;
  }
  grid(): RoomGrid {
    return { w: this.w, h: this.h, tiles: this.tiles, marks: this.marks, traps: this.traps };
  }
}

const H = 17; // standard room height: fits the screen exactly
const F = H - 3; // standing row on the floor (14)

export const TEMPLATES: RoomTemplate[] = [
  // ------------------------------------------------------------------ start rooms
  {
    id: 'sluza',
    kind: 'start',
    w: 40,
    h: H,
    build: (b) => {
      b.ends();
      b.solid(14, 12, 17, 14); // a block to jump over
      b.plat(22, 27, 10);
      b.m('C', 6, F);
      b.m('O', 24, 9); // terminal / lore
      b.m('$', 15, 11).m('$', 25, 9);
      b.m('g', 31, F);
    },
  },
  {
    id: 'samouczek',
    kind: 'start',
    w: 76,
    h: H,
    areas: [0],
    build: (b) => {
      b.ends();
      b.m('C', 5, F);
      b.m('T', 9, F, 'A / D — ruch, SPACJA — skok. W powietrzu naciśnij SPACJĘ jeszcze raz: podwójny skok.');
      b.solid(14, 12, 16, 14);
      b.solid(20, 10, 23, 14);
      b.m('$', 21, 9);
      b.m('T', 27, F, 'SHIFT — zryw. Daje chwilę nietykalności: przemknij przez pociski i ataki. Działa też w powietrzu.');
      b.haz(31, 34, 15);
      b.m('T', 40, F, 'J, R albo lewy przycisk myszy — atak. Przytrzymaj i puść: atak naładowany. K albo prawy przycisk myszy — umiejętność (zużywa energię).');
      b.m('g', 47, F);
      b.m('T', 52, F, 'Q — nanoapteczka (leczenie). E — interakcja z terminalami. I — ekwipunek. ESC — pauza.');
      b.m('T', 55, F, 'Pęknięte ściany kryją przejścia. Uderz w nie. Uważaj na pułapki: piły, wysuwane kolce, ogień ze ścian i spadający gruz zawsze najpierw ostrzegają.');
      b.crack(58, 12, 58, 14);
      b.solid(58, 11, 62, 11);
      b.m('S', 60, F);
      b.solid(63, 11, 63, 14);
      b.m('a', 68, 6);
    },
  },
  // ------------------------------------------------------------------ combat rooms
  {
    id: 'hala',
    kind: 'combat',
    w: 46,
    h: H,
    build: (b) => {
      b.ends();
      b.plat(8, 13, 11);
      b.plat(16, 22, 8);
      b.plat(32, 37, 11);
      b.haz(24, 25, 15);
      b.m('g', 15, F).m('g', 30, F).m('a', 19, 4);
      b.m('O', 19, 7);
      b.m('$', 10, 10).m('$', 35, 10);
    },
  },
  {
    id: 'schody',
    kind: 'combat',
    w: 50,
    h: H,
    build: (b) => {
      b.ends(F, 8);
      b.solid(12, 12, 50, 14);
      b.solid(24, 9, 50, 11);
      b.solid(38, 9, 48, 9);
      b.plat(6, 10, 11);
      b.plat(18, 22, 9);
      b.m('g', 18, 11).m('g', 31, 8).m('a', 40, 3).m('t', 20, 1);
      b.m('O', 44, 8);
      b.m('$', 8, 10).m('$', 20, 8);
    },
  },
  {
    id: 'magazyn',
    kind: 'combat',
    w: 48,
    h: H,
    build: (b) => {
      b.ends();
      b.solid(12, 13, 14, 14);
      b.solid(13, 11, 14, 12);
      b.solid(26, 12, 29, 14);
      b.solid(38, 13, 39, 14);
      b.plat(18, 23, 10);
      b.plat(31, 35, 9);
      b.m('t', 21, 1).m('g', 20, F).m('g', 34, F).m('a', 28, 5);
      b.m('O', 33, 8);
      b.m('$', 13, 10).m('$', 27, 11);
    },
  },
  {
    id: 'pulapka',
    kind: 'combat',
    w: 52,
    h: H,
    build: (b) => {
      b.ends();
      b.solid(10, 1, 22, 8); // low ceiling corridor
      b.solid(30, 1, 40, 7);
      b.haz(24, 27, 15);
      b.plat(23, 28, 11);
      b.m('t', 16, F).m('t', 35, 8).m('g', 44, F).m('a', 26, 4);
      b.m('O', 46, F);
      b.m('$', 25, 10).m('$', 16, 12);
    },
  },
  {
    id: 'laboratorium',
    kind: 'combat',
    w: 54,
    h: H,
    build: (b) => {
      b.ends();
      b.plat(6, 12, 11);
      b.solid(16, 9, 22, 9);
      b.plat(26, 31, 11);
      b.solid(35, 9, 41, 9);
      b.plat(45, 49, 11);
      b.m('g', 14, F).m('g', 33, F).m('a', 20, 4).m('a', 38, 4);
      b.m('O', 19, 8);
      b.m('$', 9, 10).m('$', 38, 8).m('$', 47, 10);
    },
  },
  // ------------------------------------------------------------------ platforming rooms
  {
    id: 'przepasc',
    kind: 'platform',
    w: 52,
    h: H,
    build: (b) => {
      b.ends();
      b.haz(12, 39, 15);
      b.plat(13, 16, 12);
      b.solid(20, 11, 22, 11);
      b.plat(26, 29, 10);
      b.solid(33, 12, 35, 12);
      b.plat(37, 40, 11);
      b.m('a', 24, 5).m('a', 36, 6).m('g', 45, F);
      b.m('$', 21, 10).m('$', 27, 9).m('$', 34, 11);
      b.m('O', 47, F);
    },
  },
  {
    id: 'most',
    kind: 'platform',
    w: 56,
    h: H,
    build: (b) => {
      b.ends();
      // upper bridge over a hazard pit, a hidden pocket in the lower right
      b.haz(14, 41, 15);
      b.solid(10, 11, 12, 14);
      b.plat(13, 20, 10);
      b.plat(24, 31, 9);
      b.plat(35, 42, 10);
      b.solid(43, 11, 45, 14);
      b.crack(50, 11, 50, 14);
      b.solid(50, 1, 54, 10);
      b.clear(51, 11, 53, 14);
      b.m('S', 52, F);
      b.m('X', 48, F);
      b.m('a', 28, 4).m('g', 47, F).m('a', 18, 5);
      b.m('O', 27, 8);
      b.m('$', 16, 9).m('$', 38, 9);
    },
  },
  {
    id: 'szyb',
    kind: 'vertical',
    w: 30,
    h: 34,
    build: (b) => {
      b.m('P', 2, 31);
      b.solid(20, 6, 28, 6);
      b.m('X', 27, 5);
      b.plat(6, 11, 28);
      b.plat(14, 19, 24);
      b.plat(22, 27, 20);
      b.plat(13, 18, 16);
      b.plat(4, 9, 12);
      b.plat(11, 16, 8);
      b.solid(1, 25, 3, 25);
      b.m('g', 15, 31).m('a', 9, 22).m('a', 21, 12).m('t', 2, 26);
      b.m('O', 24, 19);
      b.m('$', 8, 27).m('$', 16, 15).m('$', 6, 11);
    },
  },
  {
    id: 'studnia',
    kind: 'vertical',
    w: 26,
    h: 32,
    build: (b) => {
      b.m('P', 2, 29);
      b.solid(1, 7, 6, 7);
      b.m('X', 2, 6);
      b.plat(8, 13, 26);
      b.plat(17, 22, 22);
      b.solid(21, 18, 24, 18);
      b.plat(12, 16, 18);
      b.plat(4, 9, 14);
      b.plat(9, 14, 10);
      b.m('a', 15, 20).m('a', 8, 9).m('g', 18, 29);
      b.m('O', 22, 17);
      b.m('$', 10, 25).m('$', 14, 17).m('$', 6, 13);
    },
  },
  {
    id: 'tartak',
    kind: 'combat',
    w: 58,
    h: H,
    areas: [0, 2, 3, 4],
    build: (b) => {
      // the saw mill: blades run along the floor between raised blocks
      b.ends();
      b.solid(14, 12, 15, 14);
      b.solid(30, 11, 32, 14);
      b.solid(44, 12, 45, 14);
      b.plat(18, 26, 10);
      b.plat(34, 41, 9);
      b.plat(47, 52, 11);
      b.saw(17, 28, F).saw(34, 42, F);
      b.spikes(8, F).spikes(9, F);
      b.m('g', 24, F).m('g', 38, F).m('a', 25, 4).m('t', 36, 1);
      b.m('O', 38, 8);
      b.m('$', 22, 9).m('$', 31, 10).m('$', 50, 10);
    },
  },
  {
    id: 'korytarz',
    kind: 'combat',
    w: 56,
    h: H,
    build: (b) => {
      // a low service corridor: retracting floor spikes and loose debris over your head
      b.ends();
      b.solid(1, 1, 54, 5);
      b.solid(20, 12, 21, 14);
      b.plat(28, 33, 11);
      b.solid(40, 6, 46, 6);
      b.spikes(12, F).spikes(13, F).spikes(25, F).spikes(36, F).spikes(37, F);
      b.faller(17, 5).faller(31, 5).faller(43, 6);
      b.m('g', 16, F).m('g', 34, F).m('a', 26, 8).m('a', 48, 8);
      b.m('O', 40, F);
      b.m('$', 21, 10).m('$', 30, 10);
    },
  },
  {
    id: 'kanaly',
    kind: 'platform',
    w: 62,
    h: H,
    build: (b) => {
      // a long pit: stepping stones below, a moving platform above with the better loot
      b.ends();
      b.haz(10, 51, 15);
      b.solid(14, 12, 15, 12);
      b.solid(20, 10, 21, 10);
      b.solid(26, 12, 27, 12);
      b.solid(32, 10, 33, 10);
      b.solid(38, 12, 39, 12);
      b.solid(44, 10, 45, 10);
      b.solid(50, 12, 51, 12);
      b.mover(12, 47, 6);
      b.faller(26, 0).faller(38, 0);
      b.m('a', 18, 4).m('a', 40, 4).m('g', 56, F);
      b.m('O', 54, F);
      b.m('$', 32, 5).m('$', 45, 5).m('$', 21, 8);
    },
  },
  {
    id: 'wieza',
    kind: 'vertical',
    w: 28,
    h: 38,
    build: (b) => {
      // a tall climb with flame jets from the walls
      b.m('P', 2, 35);
      b.solid(18, 6, 26, 6);
      b.m('X', 25, 5);
      b.plat(6, 11, 32);
      b.plat(14, 19, 28);
      b.plat(21, 26, 24);
      b.plat(12, 17, 20);
      b.plat(3, 8, 16);
      b.plat(10, 15, 12);
      b.plat(12, 16, 9);
      b.flame(26, 23, -1).flame(1, 15, 1);
      b.spikes(17, 27);
      b.m('g', 15, 35).m('a', 10, 22).m('a', 18, 14);
      b.m('O', 7, 31);
      b.m('$', 9, 30).m('$', 13, 18).m('$', 5, 14);
    },
  },
  // ------------------------------------------------------------------ treasure / secret rooms
  {
    id: 'skarbiec',
    kind: 'treasure',
    w: 40,
    h: H,
    build: (b) => {
      b.ends();
      b.solid(14, 10, 26, 10);
      b.solid(14, 11, 14, 14);
      b.crack(26, 11, 26, 14);
      b.m('S', 20, F);
      b.plat(8, 12, 12);
      b.m('O', 20, 9);
      b.m('g', 32, F).m('a', 8, 5);
      b.m('$', 10, 11).m('$', 30, 12);
    },
  },
  // ------------------------------------------------------------------ arenas
  {
    id: 'arena',
    kind: 'arena',
    w: 42,
    h: H,
    build: (b) => {
      b.ends();
      b.plat(6, 11, 11);
      b.plat(30, 35, 11);
      b.plat(17, 24, 8);
      b.m('E', 21, F).m('g', 12, F).m('a', 28, 4);
    },
  },
  {
    id: 'boss',
    kind: 'boss',
    w: 40,
    h: H,
    build: (b) => {
      b.ends();
      b.plat(5, 10, 11);
      b.plat(29, 34, 11);
      b.plat(15, 24, 7);
      b.m('K', 26, F);
    },
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id)!;

export function buildGrid(t: RoomTemplate): RoomGrid {
  const b = new Builder(t.w, t.h);
  t.build(b);
  // de-duplicate exits (a template may move the default exit)
  const exits = b.marks.filter((m) => m.m === 'X');
  if (exits.length > 1) {
    const keep = exits[exits.length - 1];
    b.marks = b.marks.filter((m) => m.m !== 'X' || m === keep);
  }
  return b.grid();
}
