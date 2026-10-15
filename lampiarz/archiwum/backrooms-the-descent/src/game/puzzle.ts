// The five-symbol code of the armory. Everything is derived from the save's seed,
// so every new game has a different code, but each digit can always be deduced
// from what the world shows:
//   ○ circle   — the hour on the only clock that still ticks (clock room)
//   △ triangle — the number read by the real radio station; the fake one (the
//                Mimic) has no static before its voice (radio room)
//   □ square   — tally marks on the wall of the sealed cage, seen on camera 3
//   ✕ cross    — black crosses on the Zwiad 4 roster; red ones were added by "IT"
//   ◉ eye      — dots written in UV paint; the number painted in ordinary paint lies
// The order of the symbols is engraved on the armory door.
import { Rng } from '../engine/math';
import { SYMBOLS, type Sym } from '../world/map';

export interface Puzzle {
  digits: Record<Sym, number>;
  order: Sym[];
  /** index of the ticking clock (0..4) and the times shown by all five */
  liveClock: number;
  clocks: { h: number; m: number }[];
  radio: { real: 'A' | 'B'; freqA: number; freqB: number; fake: number };
  uvFake: number;
  roster: { name: string; mark: 'black' | 'red' | null }[];
}

export const ROSTER_NAMES = ['Hanna Wilk', 'Marek Sobczak', 'Iga Rudnicka', 'Tomasz Bieda', 'Ola Kern', 'Jan Lis', 'Piotr Gaj', 'Ewa Dudek', 'Kamil Zając'];
/** owners of the five dog tags — the members of Zwiad 4 who never left */
export const TAG_OWNERS = ['Hanna Wilk', 'Tomasz Bieda', 'Jan Lis', 'Ewa Dudek', 'Kamil Zając'];

export function makePuzzle(seed: number): Puzzle {
  const r = new Rng(seed ^ 0x51ab1e);
  const digits = {
    circle: r.int(1, 9),
    triangle: r.int(1, 9),
    square: r.int(2, 9),
    cross: r.int(2, 7),
    eye: r.int(2, 9),
  } as Record<Sym, number>;
  const order = [...SYMBOLS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const liveClock = r.int(0, 4);
  const clocks = Array.from({ length: 5 }, (_, i) => {
    if (i === liveClock) return { h: digits.circle, m: r.int(0, 11) * 5 };
    let h = r.int(1, 12);
    while (h === digits.circle) h = r.int(1, 12);
    return { h, m: r.int(0, 11) * 5 };
  });
  const other = (d: number) => {
    let v = r.int(1, 9);
    while (v === d) v = r.int(1, 9);
    return v;
  };
  const radio = { real: r.next() < 0.5 ? ('A' as const) : ('B' as const), freqA: 3.17, freqB: 4.02, fake: other(digits.triangle) };
  const uvFake = other(digits.eye);
  // roster: exactly digits.cross black crosses and one red cross
  const idx = ROSTER_NAMES.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const marks: ('black' | 'red' | null)[] = ROSTER_NAMES.map(() => null);
  for (let k = 0; k < digits.cross; k++) marks[idx[k]] = 'black';
  marks[idx[digits.cross]] = 'red';
  const roster = ROSTER_NAMES.map((name, i) => ({ name, mark: marks[i] }));
  return { digits, order, liveClock, clocks, radio, uvFake, roster };
}

export function codeOf(p: Puzzle) {
  return p.order.map((s) => String(p.digits[s])).join('');
}
