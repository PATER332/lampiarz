// The H-27 facility: rooms, doors, lights, cameras, props and pickups.
// Grid cells are 2 m; world units are metres. Cell (cx, cz) spans
// x ∈ [2cx, 2cx+2], z ∈ [2cz, 2cz+2]. Ceiling height is H.

export const CELL = 2;
export const H = 3.2;
export const GRID_W = 38;
export const GRID_H = 20;

export type ZoneId = 'recepcja' | 'monitoring' | 'korytarz' | 'laboratorium' | 'archiwum' | 'pokoj0' | 'techniczne' | 'awaryjna' | 'sektorc' | 'komora' | 'serwis';

export const ZONE_NAMES: Record<ZoneId, string> = {
  recepcja: 'Recepcja i punkt ochrony',
  monitoring: 'Pokój monitoringu',
  korytarz: 'Korytarz główny',
  laboratorium: 'Laboratorium akustyczne',
  archiwum: 'Archiwum',
  pokoj0: 'Pokój 0',
  techniczne: 'Pomieszczenie techniczne',
  awaryjna: 'Strefa ewakuacyjna',
  sektorc: 'Sektor C',
  komora: 'Komora K-1',
  serwis: 'Przejście serwisowe',
};

export interface RoomDef {
  zone: ZoneId;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Carved in order; later entries may re-solidify cells with `solid: true`. */
export const ROOMS: (RoomDef & { solid?: boolean })[] = [
  { zone: 'recepcja', x0: 2, z0: 14, x1: 6, z1: 18 },
  { zone: 'monitoring', x0: 2, z0: 8, x1: 6, z1: 12 },
  { zone: 'korytarz', x0: 8, z0: 10, x1: 9, z1: 17 },
  { zone: 'korytarz', x0: 8, z0: 10, x1: 27, z1: 11 },
  { zone: 'laboratorium', x0: 10, z0: 4, x1: 15, z1: 8 },
  { zone: 'serwis', x0: 17, z0: 6, x1: 17, z1: 6 },
  { zone: 'archiwum', x0: 18, z0: 4, x1: 22, z1: 8 },
  { zone: 'pokoj0', x0: 18, z0: 1, x1: 22, z1: 2 },
  { zone: 'techniczne', x0: 12, z0: 13, x1: 17, z1: 17 },
  { zone: 'serwis', x0: 19, z0: 15, x1: 20, z1: 15 },
  { zone: 'awaryjna', x0: 22, z0: 13, x1: 26, z1: 18 },
  { zone: 'sektorc', x0: 29, z0: 6, x1: 36, z1: 15 },
  // the chamber walls inside Sector C
  { zone: 'sektorc', x0: 32, z0: 7, x1: 36, z1: 13, solid: true },
  { zone: 'komora', x0: 33, z0: 8, x1: 36, z1: 12 },
];

export type Consumer = 'lights_corridor' | 'lights_rooms' | 'cameras' | 'doors' | 'sector_c' | 'transmitter' | 'evac';

export const CONSUMERS: { id: Consumer; name: string; cost: number; desc: string }[] = [
  { id: 'lights_corridor', name: 'Oświetlenie korytarzy', cost: 2, desc: 'Światło w korytarzach. Przestój unika jasnych miejsc.' },
  { id: 'lights_rooms', name: 'Oświetlenie pomieszczeń', cost: 1, desc: 'Recepcja, monitoring, laboratorium, archiwum, technika, strefa ewakuacyjna.' },
  { id: 'cameras', name: 'Monitoring', cost: 1, desc: 'Kamery i konsola w pokoju monitoringu, ładowarka latarki.' },
  { id: 'doors', name: 'Zamki elektryczne', cost: 1, desc: 'Drzwi sterowane elektrycznie (serwisowe, Sektor C, przejście techniczne).' },
  { id: 'sector_c', name: 'Sektor C', cost: 2, desc: 'Śluza i aparatura Komory K-1.' },
  { id: 'transmitter', name: 'Nadajnik', cost: 2, desc: 'Antena łączności zewnętrznej (konsola radiowa w monitoringu).' },
  { id: 'evac', name: 'Winda ewakuacyjna', cost: 3, desc: 'Winda w strefie ewakuacyjnej.' },
];

export interface DoorDef {
  id: string;
  cx: number;
  cz: number;
  /** passage axis: the door blocks movement along this axis */
  axis: 'x' | 'z';
  name: string;
  card?: number;
  code?: string;
  /** electric: needs these circuits powered to move */
  power?: Consumer[];
  flag?: string;
  flagMsg?: string;
  /** can only be unlocked from the + or - side of the axis */
  oneWay?: 1 | -1;
  external?: boolean;
  secret?: boolean;
  startOpen?: boolean;
}

export const DOORS: DoorDef[] = [
  { id: 'exit', cx: 1, cz: 16, axis: 'x', name: 'Wyjście zewnętrzne', external: true },
  { id: 'rm', cx: 4, cz: 13, axis: 'z', name: 'Monitoring', flag: 'loggedIn', flagMsg: 'Zamek monitoringu: zaloguj się w terminalu recepcji.' },
  { id: 'rv', cx: 7, cz: 16, axis: 'x', name: 'Korytarz', startOpen: true },
  { id: 'mv', cx: 7, cz: 11, axis: 'x', name: 'Drzwi serwisowe', flag: 'serviceUnlocked', flagMsg: 'Drzwi serwisowe. Zwalnia je konsola w pokoju monitoringu.', power: ['doors'] },
  { id: 'lc', cx: 12, cz: 9, axis: 'z', name: 'Laboratorium' },
  { id: 'ac', cx: 20, cz: 9, axis: 'z', name: 'Archiwum', code: '1411' },
  { id: 'la', cx: 16, cz: 6, axis: 'x', name: 'Przejście do archiwum', oneWay: 1 },
  { id: 'as', cx: 20, cz: 3, axis: 'z', name: 'Regał', code: '0317', secret: true, flag: 'knowsRoom0', flagMsg: 'Zwykły regał z segregatorami. Zza niego dochodzi ciche buczenie.' },
  { id: 'tc', cx: 14, cz: 12, axis: 'z', name: 'Pomieszczenie techniczne' },
  { id: 'te', cx: 18, cz: 15, axis: 'x', name: 'Przejście techniczne', power: ['doors'] },
  { id: 'pe', cx: 21, cz: 15, axis: 'x', name: 'Strefa ewakuacyjna (zaplecze)', flag: 'emergencyUnlocked', flagMsg: 'Blokada ewakuacyjna. Zwalnia ją przełącznik w pomieszczeniu technicznym.' },
  { id: 'ec', cx: 24, cz: 12, axis: 'z', name: 'Strefa ewakuacyjna', flag: 'emergencyUnlocked', flagMsg: 'Blokada ewakuacyjna. Zwalnia ją przełącznik w pomieszczeniu technicznym.' },
  { id: 'kc', cx: 28, cz: 10, axis: 'x', name: 'Sektor C', card: 3, power: ['doors', 'sector_c'] },
  { id: 'kk', cx: 32, cz: 10, axis: 'x', name: 'Komora K-1', power: ['sector_c'] },
];

export type LightKind = 'fluo' | 'warm' | 'red' | 'cold' | 'lamp' | 'screen';

export interface LightDef {
  x: number;
  y: number;
  z: number;
  kind: LightKind;
  /** circuit; undefined = always on (battery / emergency) */
  circuit?: Consumer;
  intensity: number;
  range: number;
  flicker?: number;
  /** id used by scripted events */
  id?: string;
}

const fl = (x: number, z: number, circuit: Consumer, flicker = 0, id?: string): LightDef => ({ x, y: H - 0.25, z, kind: 'fluo', circuit, intensity: 1.15, range: 9, flicker, id });
const red = (x: number, z: number): LightDef => ({ x, y: H - 0.4, z, kind: 'red', intensity: 0.55, range: 6.5 });

export const LIGHTS: LightDef[] = [
  // reception
  fl(8, 31, 'lights_rooms'),
  fl(12, 35, 'lights_rooms', 0.25),
  { x: 11.4, y: 1.25, z: 30.4, kind: 'lamp', intensity: 0.7, range: 4.5 },
  red(4.5, 37),
  // monitoring
  fl(8, 19, 'lights_rooms'),
  { x: 5.5, y: 1.7, z: 17.4, kind: 'screen', circuit: 'cameras', intensity: 0.8, range: 5 },
  red(13, 25),
  // corridors
  fl(18, 34, 'lights_corridor', 0, 'v2'),
  fl(18, 27, 'lights_corridor', 0.15, 'v1'),
  fl(22, 22, 'lights_corridor', 0, 'c1'),
  fl(29, 22, 'lights_corridor', 0.35, 'c2'),
  fl(36, 22, 'lights_corridor', 0, 'c3'),
  fl(43, 22, 'lights_corridor', 0.2, 'c4'),
  fl(50, 22, 'lights_corridor', 0, 'c5'),
  fl(55, 22, 'lights_corridor', 0.5, 'c6'),
  red(17, 21),
  red(33, 23.6),
  red(47, 20.4),
  red(19.6, 31),
  // laboratory
  fl(23.5, 11.5, 'lights_rooms', 0.2),
  fl(29, 15, 'lights_rooms'),
  { x: 30.5, y: 1.2, z: 9.2, kind: 'screen', circuit: 'lights_rooms', intensity: 0.5, range: 3.5 },
  red(21, 17.4),
  // archive
  fl(39, 12, 'lights_rooms', 0.1),
  fl(44, 15.5, 'lights_rooms'),
  red(45.5, 9),
  // room 0 — a desk lamp nobody switched off
  { x: 43.6, y: 1.15, z: 3.2, kind: 'lamp', intensity: 0.95, range: 6 },
  // technical
  fl(27, 29, 'lights_rooms'),
  fl(33, 33.5, 'lights_rooms', 0.3),
  red(25, 35.5),
  red(38.5, 30.5),
  // evacuation
  fl(46, 29, 'lights_rooms'),
  fl(51, 35, 'lights_rooms'),
  { x: 53, y: 2.8, z: 31, kind: 'red', circuit: 'evac', intensity: 1.2, range: 9, id: 'beacon' },
  red(44, 37),
  // sector C
  { x: 60, y: H - 0.25, z: 14, kind: 'cold', circuit: 'sector_c', intensity: 1.1, range: 10 },
  { x: 60, y: H - 0.25, z: 27, kind: 'cold', circuit: 'sector_c', intensity: 1.0, range: 10, flicker: 0.3 },
  { x: 69, y: H - 0.25, z: 13.2, kind: 'cold', circuit: 'sector_c', intensity: 0.9, range: 9 },
  { x: 69, y: H - 0.25, z: 29.5, kind: 'cold', circuit: 'sector_c', intensity: 0.9, range: 9 },
  red(58.6, 21),
  red(73, 30.5),
  // the chamber
  { x: 70, y: H - 0.5, z: 21, kind: 'cold', circuit: 'sector_c', intensity: 1.3, range: 8, id: 'chamber' },
  red(67, 17),
];

export interface CameraDef {
  id: number;
  name: string;
  pos: [number, number, number];
  target: [number, number, number];
}

export const CAMERAS: CameraDef[] = [
  { id: 1, name: 'KAM 01  RECEPCJA', pos: [13.6, 2.95, 37.6], target: [6, 0.8, 29.5] },
  { id: 2, name: 'KAM 02  KORYTARZ ZACHÓD', pos: [16.4, 2.95, 20.4], target: [40, 0.8, 23] },
  { id: 3, name: 'KAM 03  LABORATORIUM', pos: [31.6, 2.95, 8.4], target: [21, 0.6, 17] },
  { id: 4, name: 'KAM 04  KORYTARZ WSCHÓD', pos: [55.6, 2.95, 23.6], target: [30, 0.8, 21] },
  { id: 5, name: 'KAM 05  TECHNIKA', pos: [35.6, 2.95, 35.6], target: [25, 0.6, 27] },
  { id: 6, name: 'KAM 06  [BRAK W REJESTRZE]', pos: [45.6, 2.9, 2.4], target: [37, 0.5, 6] },
];

export type PropKind =
  | 'desk'
  | 'chair'
  | 'terminal'
  | 'monitorWall'
  | 'shelf'
  | 'labTable'
  | 'cabinet'
  | 'locker'
  | 'generator'
  | 'powerPanel'
  | 'crate'
  | 'barrel'
  | 'board'
  | 'radio'
  | 'lift'
  | 'chamberRig'
  | 'switch'
  | 'charger'
  | 'filing'
  | 'bench'
  | 'counter';

export interface PropDef {
  kind: PropKind;
  x: number;
  z: number;
  /** rotation in quarter turns (0 = facing -Z) */
  rot: 0 | 1 | 2 | 3;
  id?: string;
}

export const PROPS: PropDef[] = [
  // reception
  { kind: 'counter', x: 10.5, z: 30.5, rot: 0 },
  { kind: 'terminal', x: 11.2, z: 30.5, rot: 2, id: 'term_reception' },
  { kind: 'chair', x: 11.2, z: 29.3, rot: 2 },
  { kind: 'bench', x: 4.8, z: 34, rot: 3 },
  { kind: 'bench', x: 4.8, z: 30, rot: 3 },
  { kind: 'board', x: 13.75, z: 34, rot: 1, id: 'board_reception' },
  { kind: 'filing', x: 13.5, z: 29, rot: 1 },
  { kind: 'crate', x: 5, z: 37.2, rot: 0 },
  // monitoring
  { kind: 'monitorWall', x: 6, z: 16.6, rot: 2 },
  { kind: 'desk', x: 6, z: 18.4, rot: 0, id: 'cctv' },
  { kind: 'chair', x: 6, z: 19.6, rot: 0 },
  { kind: 'radio', x: 11.6, z: 16.6, rot: 2, id: 'radio' },
  { kind: 'charger', x: 13.6, z: 22.5, rot: 1, id: 'charger' },
  { kind: 'filing', x: 4.6, z: 25.2, rot: 0 },
  
  // corridors
  { kind: 'locker', x: 27, z: 20.35, rot: 2, id: 'locker_c1' },
  { kind: 'locker', x: 46, z: 20.35, rot: 2, id: 'locker_c2' },
  { kind: 'locker', x: 16.35, z: 30.5, rot: 3, id: 'locker_v' },
  { kind: 'board', x: 33, z: 23.75, rot: 0, id: 'board_corridor' },
  { kind: 'crate', x: 52.5, z: 20.6, rot: 0 },
  { kind: 'barrel', x: 39, z: 23.4, rot: 0 },
  // laboratory
  { kind: 'labTable', x: 24, z: 12.5, rot: 0 },
  { kind: 'labTable', x: 29, z: 12.5, rot: 0 },
  { kind: 'labTable', x: 26.5, z: 16, rot: 1 },
  { kind: 'cabinet', x: 31.6, z: 16.5, rot: 1, id: 'cab_lab' },
  { kind: 'locker', x: 20.35, z: 10, rot: 3, id: 'locker_lab' },
  { kind: 'shelf', x: 25, z: 8.35, rot: 2 },
  { kind: 'terminal', x: 30.5, z: 8.8, rot: 2, id: 'term_lab' },
  { kind: 'desk', x: 30.5, z: 8.8, rot: 2 },
  // archive
  { kind: 'shelf', x: 37.2, z: 11, rot: 3 },
  { kind: 'shelf', x: 37.2, z: 15, rot: 3 },
  { kind: 'shelf', x: 41, z: 12.5, rot: 0 },
  { kind: 'shelf', x: 44.5, z: 12.5, rot: 0 },
  { kind: 'desk', x: 43.5, z: 16.6, rot: 0, id: 'desk_archive' },
  { kind: 'filing', x: 45.6, z: 9.6, rot: 1, id: 'drawer_archive' },
  // room 0
  { kind: 'desk', x: 43.6, z: 3.6, rot: 2, id: 'desk_room0' },
  { kind: 'chair', x: 43.6, z: 4.8, rot: 0 },
  { kind: 'filing', x: 37, z: 2.6, rot: 3 },
  { kind: 'crate', x: 39.5, z: 2.6, rot: 0 },
  // technical
  { kind: 'generator', x: 28, z: 32, rot: 0, id: 'generator' },
  { kind: 'powerPanel', x: 35.65, z: 28.5, rot: 1, id: 'panel' },
  { kind: 'switch', x: 35.65, z: 33.6, rot: 1, id: 'switch_emergency' },
  { kind: 'locker', x: 24.35, z: 34.5, rot: 3, id: 'locker_tech' },
  { kind: 'shelf', x: 30.5, z: 35.65, rot: 0, id: 'shelf_tech' },
  { kind: 'barrel', x: 25, z: 27, rot: 0 },
  { kind: 'barrel', x: 25.8, z: 27.6, rot: 0 },
  // service passage
  { kind: 'crate', x: 39, z: 30.6, rot: 0 },
  // evacuation
  { kind: 'lift', x: 53.4, z: 32, rot: 1, id: 'lift' },
  { kind: 'locker', x: 44.35, z: 28, rot: 3, id: 'locker_evac' },
  { kind: 'bench', x: 48, z: 37.4, rot: 0 },
  { kind: 'crate', x: 45, z: 36.8, rot: 0 },
  // sector C
  { kind: 'labTable', x: 61, z: 18, rot: 1 },
  { kind: 'labTable', x: 61, z: 24, rot: 1 },
  { kind: 'locker', x: 58.35, z: 26.5, rot: 3, id: 'locker_c' },
  { kind: 'shelf', x: 72, z: 30.65, rot: 0 },
  { kind: 'crate', x: 70, z: 12.8, rot: 0 },
  { kind: 'board', x: 63.75, z: 21, rot: 1, id: 'board_sector' },
  // chamber
  { kind: 'chamberRig', x: 71, z: 21, rot: 0, id: 'rig' },
  { kind: 'terminal', x: 67.5, z: 24.6, rot: 0, id: 'term_chamber' },
  { kind: 'desk', x: 67.5, z: 24.9, rot: 0 },
];

export type ItemId = 'fuseA' | 'fuseB' | 'card3' | 'tape' | 'key' | 'battery1' | 'battery2' | 'battery3' | 'battery4';

export const ITEM_NAMES: Record<ItemId, string> = {
  fuseA: 'Bezpiecznik 63 A',
  fuseB: 'Bezpiecznik 63 A',
  card3: 'Karta dostępu — poziom 3',
  tape: 'Taśma „K-1 / 14.11.1997”',
  key: 'Klucz ciągłości',
  battery1: 'Akumulator do latarki',
  battery2: 'Akumulator do latarki',
  battery3: 'Akumulator do latarki',
  battery4: 'Akumulator do latarki',
};

export interface PickupDef {
  id: string;
  kind: 'item' | 'doc';
  ref: string;
  x: number;
  y: number;
  z: number;
  /** pickup hidden inside a container prop: only reachable when that prop is opened */
  inside?: string;
}

export const PICKUPS: PickupDef[] = [
  { id: 'p_fuseA', kind: 'item', ref: 'fuseA', x: 31.5, y: 1.0, z: 16.5, inside: 'cab_lab' },
  { id: 'p_fuseB', kind: 'item', ref: 'fuseB', x: 45.5, y: 0.9, z: 9.6, inside: 'drawer_archive' },
  { id: 'p_card3', kind: 'item', ref: 'card3', x: 43.2, y: 0.8, z: 16.4 },
  { id: 'p_tape', kind: 'item', ref: 'tape', x: 44.1, y: 0.8, z: 3.4 },
  { id: 'p_key', kind: 'item', ref: 'key', x: 43.0, y: 0.8, z: 3.5 },
  { id: 'p_bat1', kind: 'item', ref: 'battery1', x: 12.6, y: 1.08, z: 30.6 },
  { id: 'p_bat2', kind: 'item', ref: 'battery2', x: 30.4, y: 1.55, z: 35.6 },
  { id: 'p_bat3', kind: 'item', ref: 'battery3', x: 61, y: 0.95, z: 24.2 },
  { id: 'p_bat4', kind: 'item', ref: 'battery4', x: 45.2, y: 0.55, z: 36.8 },
  // documents
  { id: 'p_d02', kind: 'doc', ref: 'd02', x: 6.6, y: 0.8, z: 18.65 },
  { id: 'p_d03', kind: 'doc', ref: 'd03', x: 29.2, y: 1.02, z: 30.2 },
  { id: 'p_d04', kind: 'doc', ref: 'd04', x: 28.8, y: 0.96, z: 12.4 },
  { id: 'p_d05', kind: 'doc', ref: 'd05', x: 34.8, y: 1.3, z: 28.5 },
  { id: 'p_d06', kind: 'doc', ref: 'd06', x: 43.9, y: 0.81, z: 16.7 },
  { id: 'p_d07', kind: 'doc', ref: 'd07', x: 33, y: 1.5, z: 23.6 },
  { id: 'p_d08', kind: 'doc', ref: 'd08', x: 61.2, y: 0.96, z: 17.8 },
  { id: 'p_d10', kind: 'doc', ref: 'd10', x: 71.6, y: 1.25, z: 30.4 },
  { id: 'p_d11', kind: 'doc', ref: 'd11', x: 44.3, y: 0.81, z: 3.9 },
  { id: 'p_d12', kind: 'doc', ref: 'd12', x: 67.2, y: 0.81, z: 25.1 },
];

/** Ventilation shafts: where Przestój leaves and enters the rooms. */
export const VENTS: { x: number; z: number; zone: ZoneId }[] = [
  { x: 19, z: 21, zone: 'korytarz' },
  { x: 41, z: 23, zone: 'korytarz' },
  { x: 22, z: 9.2, zone: 'laboratorium' },
  { x: 33, z: 35, zone: 'techniczne' },
  { x: 59, z: 30.5, zone: 'sektorc' },
  { x: 51, z: 37, zone: 'awaryjna' },
  { x: 17, z: 35, zone: 'korytarz' },
];

export const PLAYER_START = { x: 9, z: 35.5, yaw: 0 };
