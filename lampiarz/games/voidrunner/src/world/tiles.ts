export const T_EMPTY = 0;
export const T_SOLID = 1;
export const T_PLATFORM = 2; // one-way, can drop through with ↓ + Space
export const T_HAZARD = 3; // spikes / acid / live wires / void — depends on the area
export const T_BREAK = 4; // cracked wall, breaks when hit (hidden passages)

export type Mark =
  | 'P' // player spawn
  | 'X' // exit door (bottom tile)
  | 'O' // object slot, filled by the expedition builder (altar, chest, terminal…)
  | 'C' // checkpoint
  | '$' // fragment pickup
  | 'S' // secret cache (usually behind a cracked wall)
  | 'g' // ground enemy slot
  | 'a' // air enemy slot
  | 't' // turret slot (floor or ceiling)
  | 'E' // elite slot
  | 'L' // laser emitter (ceiling)
  | 'K' // boss spawn
  | 'T'; // terminal / sign with fixed text (tutorial)

export interface MarkAt {
  m: Mark;
  x: number;
  y: number;
  text?: string;
}

export interface RoomGrid {
  w: number;
  h: number;
  tiles: Uint8Array;
  marks: MarkAt[];
}

export const isSolid = (t: number) => t === T_SOLID || t === T_BREAK;
