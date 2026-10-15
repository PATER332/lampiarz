// The level layout, carved from rectangles on a 2 m grid. Kept separate from the
// gameplay data in map.ts so that it can be printed and checked on its own.
//
//  '#' wall          '.' floor        '~' wet floor (louder steps)
//  '=' shelf unit    'c' crates/container   'o' pillar
//  'D' door cell (see DOORS in map.ts)

export const CELL = 2;
export const H = 2.75;
export const GRID_W = 60;
export const GRID_H = 56;

export type ZoneId = 'maze' | 'dark' | 'storage' | 'red' | 'armory' | 'descent' | 'anchor' | 'secret' | 'cage' | 'lift' | 'start';

export const ZONE_NAMES: Record<ZoneId, string> = {
  start: 'Żółty Labirynt — schowek',
  maze: 'Żółty Labirynt',
  dark: 'Ciemne Korytarze',
  storage: 'Kompleks Magazynowy',
  red: 'Czerwony Sektor',
  armory: 'Zbrojownia',
  descent: 'Zejście',
  anchor: 'Komora Kotwicy',
  secret: 'Pokój bez numeru',
  cage: 'Klatka',
  lift: 'Winda towarowa',
};

export interface Layout {
  chars: string[][];
  zones: (ZoneId | null)[][];
}

export function buildLayout(): Layout {
  const chars: string[][] = Array.from({ length: GRID_H }, () => Array(GRID_W).fill('#'));
  const zones: (ZoneId | null)[][] = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(null));
  const room = (zone: ZoneId, x0: number, z0: number, x1: number, z1: number, ch = '.') => {
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        chars[z][x] = ch;
        zones[z][x] = zone;
      }
  };
  const fill = (x0: number, z0: number, x1: number, z1: number, ch: string) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) chars[z][x] = ch;
  };
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        chars[z][x] = '#';
        zones[z][x] = null;
      }
  };
  const put = (x: number, z: number, ch: string) => (chars[z][x] = ch);

  // ================================================================ ZONE 1 — THE YELLOW MAZE (south-west)
  room('maze', 1, 20, 24, 38);
  // start closet in the south-west corner
  wall(1, 33, 5, 33);
  wall(5, 33, 5, 38);
  room('start', 1, 34, 4, 38);
  put(5, 36, 'D');
  // clock room (north-west), door on its south wall
  wall(1, 26, 8, 26);
  wall(8, 20, 8, 26);
  put(4, 26, 'D');
  // central maze partitions
  wall(11, 20, 11, 28);
  put(11, 23, '.');
  put(11, 24, '.');
  wall(5, 29, 11, 29);
  put(8, 29, '.');
  wall(14, 23, 20, 23);
  put(17, 23, '.');
  wall(17, 24, 17, 28);
  put(17, 26, '.');
  // pillar hall (south-east of the maze)
  wall(13, 30, 24, 30);
  put(18, 30, '.');
  put(19, 30, '.');
  wall(13, 30, 13, 38);
  put(13, 34, '.');
  for (const [x, z] of [
    [16, 32],
    [19, 32],
    [22, 32],
    [16, 35],
    [19, 35],
    [22, 35],
  ])
    put(x, z, 'o');
  // pillars in the open part of the maze
  for (const [x, z] of [
    [21, 21],
    [21, 26],
    [14, 26],
    [3, 30],
    [8, 32],
  ])
    put(x, z, 'o');
  // a wet patch of carpet
  fill(6, 30, 10, 31, '~');
  fill(14, 36, 15, 38, '~');

  // ================================================================ ARMORY (centre)
  room('armory', 26, 21, 31, 27);
  put(25, 24, 'D');

  // corridor from the maze to the dark corridors, just south of the armory
  room('maze', 25, 29, 32, 29);
  wall(25, 28, 32, 28);

  // ================================================================ ZONE 2 — THE DARK CORRIDORS (south-east)
  // the region is solid rock carved by one-cell corridors
  room('dark', 34, 21, 57, 21);
  room('dark', 34, 21, 34, 37);
  room('dark', 34, 37, 57, 37);
  room('dark', 57, 21, 57, 37);
  room('dark', 34, 29, 50, 29);
  room('dark', 45, 19, 45, 29);
  room('dark', 40, 30, 40, 35);
  room('dark', 41, 33, 44, 33);
  room('dark', 50, 24, 56, 24);
  room('dark', 52, 25, 52, 27);
  room('dark', 35, 25, 35, 27); // alcove off the west corridor
  room('dark', 35, 33, 37, 33);
  put(33, 29, 'D'); // from the maze corridor
  // radio room
  room('dark', 37, 23, 42, 27);
  put(39, 22, 'D');
  wall(39, 21, 39, 21);
  room('dark', 39, 21, 39, 21);
  // generator room
  room('dark', 47, 31, 55, 35);
  put(51, 30, 'D');
  room('dark', 51, 29, 51, 29);
  // a dead-end maintenance closet with a locker
  room('dark', 54, 26, 56, 27);
  put(54, 25, '#');

  // ================================================================ ZONE 3 — THE STORAGE COMPLEX (north-east)
  room('storage', 33, 1, 58, 18);
  // camera room
  room('storage', 26, 1, 31, 5);
  put(32, 3, 'D');
  // chemical store (UV)
  room('storage', 26, 12, 31, 17);
  put(32, 14, 'D');
  // link corridor from the red sector power door
  room('storage', 26, 8, 32, 9);
  put(25, 9, 'D');
  // shelving rows
  for (const z of [4, 8, 12])
    for (const [a, b] of [
      [36, 43],
      [47, 54],
    ])
      fill(a, z, b, z, '=');
  // containers
  fill(34, 15, 35, 17, 'c');
  fill(38, 15, 39, 16, 'c');
  fill(56, 2, 57, 3, 'c');
  // the sealed cage — seen only through camera 3
  wall(51, 13, 58, 18);
  room('cage', 52, 14, 57, 17);
  // door down to the dark corridors
  put(45, 19, 'D');

  // ================================================================ ZONE 4 — THE RED SECTOR (north-west)
  room('red', 1, 1, 24, 18);
  // freight lift lobby (north-west corner)
  wall(1, 6, 7, 6);
  wall(7, 1, 7, 6);
  room('lift', 1, 1, 6, 5);
  put(4, 6, 'D');
  // expedition camp (roster board)
  wall(8, 7, 15, 7);
  wall(15, 1, 15, 7);
  room('red', 8, 1, 14, 6);
  put(11, 7, 'D');
  // recordings room
  wall(16, 6, 24, 6);
  wall(16, 1, 16, 6);
  room('red', 17, 1, 24, 5);
  put(20, 6, 'D');
  // the room without a number (secret), entered through the hidden panel from the maze
  wall(18, 13, 24, 13);
  wall(18, 13, 18, 18);
  room('secret', 19, 14, 24, 18);
  put(21, 19, 'D');
  // debris and a broken partition in the corridors
  wall(2, 10, 9, 10);
  put(5, 10, '.');
  put(6, 10, '.');
  wall(12, 9, 12, 16);
  put(12, 12, '.');
  fill(14, 9, 15, 10, 'c');
  fill(3, 15, 4, 16, 'c');
  put(9, 14, 'o');
  put(15, 14, 'o');
  // jammed door down into the maze
  put(6, 19, 'D');

  // ================================================================ ZONE 6 — THE DESCENT (deep level, reached by the lift)
  room('lift', 1, 41, 4, 45);
  put(5, 43, 'D');
  room('descent', 6, 42, 30, 44); // long entry corridor
  room('descent', 8, 45, 26, 51, '~'); // flooded hall
  for (const [x, z] of [
    [11, 47],
    [15, 47],
    [19, 47],
    [23, 47],
    [11, 50],
    [15, 50],
    [19, 50],
    [23, 50],
  ])
    put(x, z, 'o');
  // stabilizer rooms
  room('descent', 9, 52, 13, 54); // A (south of the flooded hall)
  put(11, 52, '.');
  room('descent', 31, 41, 35, 44); // B (end of the entry corridor)
  room('descent', 27, 46, 41, 46); // passage east
  room('descent', 41, 46, 41, 52);
  room('descent', 36, 52, 41, 54); // C
  room('descent', 30, 49, 35, 52);
  room('descent', 30, 47, 30, 48);
  // anchor chamber and the exit
  room('anchor', 45, 43, 55, 53);
  put(44, 48, 'D');
  room('descent', 42, 48, 43, 48);
  room('descent', 41, 48, 41, 48);
  put(56, 48, 'D'); // exit door
  room('anchor', 57, 47, 58, 49);
  for (const [x, z] of [
    [47, 45],
    [53, 45],
    [47, 51],
    [53, 51],
  ])
    put(x, z, 'o');

  return { chars, zones };
}

export function layoutToString(l: Layout) {
  return l.chars.map((r) => r.join('')).join('\n');
}
