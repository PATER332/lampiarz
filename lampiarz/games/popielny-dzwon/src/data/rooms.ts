// Hand-designed room segments. Each expedition chains a seeded selection of them.
//
// Legend
//   #  solid stone            =  one-way ledge          ^  spikes
//   X  breakable (secret) wall .  air                    S  shrine (checkpoint)
//   C  chest                  c  secret chest            K  lore page (or chest)   k  secret lore
//   E  melee enemy slot       H  heavy/elite slot        R  flying slot            U  support slot
//   w  forced Wyrwany         o  forced Ogar
//   L  lantern / candles      P  pendulum (cathedral) or hanging cage elsewhere
//   M  statue / big prop      V  random encounter        B  boss spawn             G  boss gate column
//   1-6 tutorial hint stones
//
// Rooms are 17 rows tall. Rows 11–14 of the first and last column must be open and
// rows 15–16 solid, so any two rooms connect at floor level.

export const ROOM_H = 17;

export interface RoomTemplate {
  id: string;
  rows: string[];
}

type Op = (g: string[][]) => void;

function build(id: string, w: number, ...ops: Op[]): RoomTemplate {
  const g: string[][] = Array.from({ length: ROOM_H }, (_, y) => Array.from({ length: w }, () => (y >= 15 ? '#' : '.')));
  for (const op of ops) op(g);
  return { id, rows: g.map((r) => r.join('')) };
}

/** Fill an inclusive rectangle (x1..x2, y1..y2). */
const rect =
  (x1: number, y1: number, x2: number, y2: number, ch = '#'): Op =>
  (g) => {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) g[y][x] = ch;
  };
const at =
  (x: number, y: number, ch: string): Op =>
  (g) => {
    g[y][x] = ch;
  };
const ledge = (x1: number, x2: number, y: number) => rect(x1, y, x2, y, '=');

// ------------------------------------------------------------------ fixed rooms
export const ENTRY = build('wejscie', 26, rect(0, 0, 0, 14), at(6, 14, 'S'), at(6, 10, 'L'), at(18, 14, 'M'), at(13, 9, 'L'));

export const SHRINE_ROOM = build('kapliczka', 32, at(16, 14, 'S'), at(16, 10, 'L'), at(26, 14, 'K'), at(6, 14, 'C'), at(9, 9, 'L'));

export const ANTE = build('przedsionek', 30, at(8, 14, 'S'), at(8, 10, 'L'), at(19, 14, 'M'), at(24, 9, 'L'), rect(27, 0, 29, 8));

export const ARENAS: Record<'kat' | 'pasterz' | 'dzwon', RoomTemplate> = {
  kat: build('arena-kat', 44, at(1, 0, 'G'), rect(43, 0, 43, 14), at(30, 14, 'B'), at(6, 9, 'L'), at(37, 9, 'L'), at(21, 6, 'L')),
  pasterz: build(
    'arena-pasterz',
    46,
    at(1, 0, 'G'),
    rect(45, 0, 45, 14),
    at(34, 6, 'B'),
    ledge(7, 12, 11),
    ledge(33, 38, 11),
    ledge(20, 25, 8),
    at(9, 7, 'L'),
    at(36, 7, 'L'),
    at(22, 4, 'L'),
  ),
  dzwon: build('arena-dzwon', 48, rect(47, 0, 47, 14), rect(0, 0, 47, 1), at(1, 2, 'G'), at(24, 3, 'B'), at(6, 9, 'L'), at(41, 9, 'L')),
};

// ------------------------------------------------------------------ tutorial (first visit to Rynek)
export const TUTORIAL: RoomTemplate[] = [
  build('nauka-ruch', 32, at(3, 14, '1'), rect(12, 13, 13, 14), at(19, 14, '2'), ledge(18, 25, 11), at(22, 10, 'C'), at(8, 9, 'L'), at(28, 9, 'L')),
  build('nauka-walka', 34, at(3, 14, '3'), at(13, 14, '4'), at(24, 14, 'w'), at(10, 9, 'L'), at(28, 9, 'L')),
  build('nauka-unik', 34, at(3, 14, '5'), at(14, 14, '6'), at(26, 14, 'o'), at(9, 9, 'L'), at(30, 9, 'L')),
];

// ------------------------------------------------------------------ pool
export const POOL: Record<string, RoomTemplate> = {
  ulica: build('ulica', 36, at(26, 7, 'L'), ledge(11, 15, 9), rect(25, 12, 28, 14), at(6, 12, 'L'), at(10, 14, 'E'), at(32, 14, 'E'), at(13, 8, 'U')),
  schody: build('schody', 36, rect(14, 9, 21, 10), rect(11, 11, 24, 12), rect(8, 13, 27, 14), at(17, 8, 'E'), at(31, 14, 'E'), at(12, 10, 'U'), at(17, 5, 'L'), at(3, 9, 'L')),
  kladki: build(
    'kladki',
    38,
    rect(6, 14, 33, 14, '^'),
    ledge(6, 10, 12),
    ledge(14, 18, 12),
    ledge(22, 26, 12),
    ledge(30, 33, 12),
    at(20, 6, 'R'),
    at(3, 8, 'L'),
    at(36, 8, 'L'),
    at(16, 11, 'C'),
  ),
  plac: build('plac', 40, ledge(3, 7, 11), ledge(32, 36, 11), at(3, 8, 'L'), at(36, 8, 'L'), at(9, 14, 'E'), at(20, 14, 'V'), at(30, 14, 'E'), at(34, 10, 'H'), at(20, 7, 'R')),
  ukryta: build(
    'ukryta',
    36,
    rect(21, 6, 31, 6),
    rect(21, 7, 21, 8, 'X'),
    rect(31, 7, 31, 9),
    rect(21, 9, 31, 9),
    ledge(10, 20, 9),
    ledge(4, 8, 12),
    at(29, 8, 'k'),
    at(25, 8, 'c'),
    at(14, 14, 'E'),
    at(33, 14, 'E'),
    at(26, 14, 'U'),
    at(16, 5, 'L'),
  ),
  studnia: build('studnia', 36, rect(14, 15, 21, 16, '.'), ledge(15, 19, 12), at(18, 5, 'R'), at(6, 14, 'E'), at(29, 14, 'H'), at(10, 9, 'L'), at(26, 9, 'L')),
  korytarz: build(
    'korytarz',
    36,
    rect(0, 0, 35, 4),
    rect(8, 5, 8, 9),
    rect(28, 5, 28, 9),
    at(18, 5, 'P'),
    at(6, 14, 'E'),
    at(24, 14, 'H'),
    at(13, 7, 'L'),
    at(23, 7, 'L'),
  ),
  wieza: build(
    'wieza',
    34,
    ledge(3, 7, 12),
    ledge(9, 13, 9),
    ledge(15, 19, 6),
    ledge(21, 25, 9),
    ledge(27, 31, 12),
    at(17, 5, 'C'),
    at(10, 14, 'E'),
    at(24, 14, 'E'),
    at(28, 4, 'R'),
    at(17, 2, 'L'),
  ),
  nawa: build('nawa', 38, rect(0, 0, 37, 2), at(12, 3, 'P'), at(26, 3, 'P'), at(5, 14, 'E'), at(19, 14, 'H'), at(33, 14, 'U'), at(19, 6, 'L'), rect(18, 3, 20, 3)),
  mnisi: build('mnisi', 38, at(8, 14, 'M'), at(17, 14, 'M'), rect(22, 15, 25, 16, '.'), at(30, 14, 'M'), at(23, 6, 'R'), at(12, 14, 'E'), at(34, 14, 'U'), at(4, 9, 'L'), at(28, 9, 'L'), ledge(21, 26, 12)),
};

export const LOCATION_POOLS: Record<'rynek' | 'ogrod' | 'katedra', string[]> = {
  rynek: ['ulica', 'schody', 'kladki', 'plac', 'studnia', 'wieza'],
  ogrod: ['ulica', 'schody', 'kladki', 'plac', 'studnia', 'wieza', 'mnisi'],
  katedra: ['schody', 'kladki', 'plac', 'korytarz', 'wieza', 'nawa'],
};

/** The hub: Krypta Odlewników. Stations are placed by id letters. */
export const HUB = build(
  'krypta',
  40,
  rect(0, 0, 0, 14),
  rect(39, 0, 39, 14),
  rect(0, 0, 39, 2),
  at(7, 14, 'h'), // Halszka (story, level up)
  at(14, 14, 'a'), // anvil (weapon upgrades)
  at(21, 14, 'S'), // hearth (rest, equip)
  at(28, 14, 'm'), // Mumrot (shop)
  at(34, 14, 't'), // map table (travel)
  at(11, 8, 'L'),
  at(21, 8, 'L'),
  at(31, 8, 'L'),
);
