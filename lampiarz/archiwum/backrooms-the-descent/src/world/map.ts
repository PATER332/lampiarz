// Gameplay data placed on the layout: doors, lights, props, hiding places, items,
// cameras, vents and puzzle objects. World units are metres; cell (cx, cz)
// spans [2cx, 2cx+2] × [2cz, 2cz+2].
import { buildLayout, CELL, H, type ZoneId } from './layout';

export { CELL, H, GRID_W, GRID_H, ZONE_NAMES, type ZoneId } from './layout';

/** Centre of a cell coordinate. */
export const c = (n: number) => n * CELL + CELL / 2;

export type Difficulty = 'story' | 'normal' | 'nightmare' | 'nomercy';
export const DIFFS: Difficulty[] = ['story', 'normal', 'nightmare', 'nomercy'];

// ------------------------------------------------------------------ doors
export interface DoorDef {
  id: string;
  cx: number;
  cz: number;
  /** passage axis: movement through the door happens along this axis */
  axis: 'x' | 'z';
  name: string;
  kind: 'normal' | 'keypad' | 'power' | 'card' | 'oneway' | 'hidden' | 'stabilizers' | 'exit';
  /** oneway: side (sign along the axis) from which it can be unlocked */
  side?: 1 | -1;
  startOpen?: boolean;
  /** metal (heavier sound, different look) */
  metal?: boolean;
}

export const DOORS: DoorDef[] = [
  { id: 'start', cx: 5, cz: 36, axis: 'x', name: 'Drzwi schowka', kind: 'normal' },
  { id: 'clock', cx: 4, cz: 26, axis: 'z', name: 'Pokój zegarów', kind: 'normal' },
  { id: 'armory', cx: 25, cz: 24, axis: 'x', name: 'Zbrojownia', kind: 'keypad', metal: true },
  { id: 'mzdark', cx: 33, cz: 29, axis: 'x', name: 'Ciemne Korytarze', kind: 'normal', metal: true },
  { id: 'radio', cx: 39, cz: 22, axis: 'z', name: 'Radiostacja', kind: 'normal' },
  { id: 'gen', cx: 51, cz: 30, axis: 'z', name: 'Agregat', kind: 'normal', metal: true },
  { id: 'darkstore', cx: 45, cz: 19, axis: 'z', name: 'Kompleks Magazynowy', kind: 'normal', metal: true },
  { id: 'cam', cx: 32, cz: 3, axis: 'x', name: 'Pokój kamer', kind: 'normal' },
  { id: 'chem', cx: 32, cz: 14, axis: 'x', name: 'Magazyn chemiczny', kind: 'normal' },
  { id: 'power', cx: 25, cz: 9, axis: 'x', name: 'Śluza towarowa', kind: 'power', metal: true },
  { id: 'lift', cx: 4, cz: 6, axis: 'z', name: 'Winda towarowa', kind: 'card', metal: true },
  { id: 'camp', cx: 11, cz: 7, axis: 'z', name: 'Obóz Zwiadu 4', kind: 'normal' },
  { id: 'tapes', cx: 20, cz: 6, axis: 'z', name: 'Pokój nagrań', kind: 'normal' },
  { id: 'secret', cx: 21, cz: 19, axis: 'z', name: 'Ściana', kind: 'hidden' },
  { id: 'jam', cx: 6, cz: 19, axis: 'z', name: 'Zaklinowane drzwi', kind: 'oneway', side: -1 },
  { id: 'dlift', cx: 5, cz: 43, axis: 'x', name: 'Wyjście z windy', kind: 'normal', metal: true, startOpen: true },
  { id: 'anchor', cx: 44, cz: 48, axis: 'x', name: 'Komora Kotwicy', kind: 'stabilizers', metal: true },
  { id: 'exit', cx: 56, cz: 48, axis: 'x', name: 'Drzwi bez klamki', kind: 'exit', metal: true },
];

// ------------------------------------------------------------------ lights
export type LightKind = 'fluo' | 'cold' | 'red' | 'lamp' | 'uv' | 'core' | 'bulb';
export interface LightDef {
  x: number;
  y: number;
  z: number;
  kind: LightKind;
  intensity: number;
  range: number;
  flicker?: number;
  /** needs the generator */
  gen?: boolean;
  /** never lights (a dead fixture, still rendered) */
  dead?: boolean;
  id?: string;
  /** recessed ceiling panel rendered for this light */
  panel?: boolean;
}

// ------------------------------------------------------------------ props
export type PropKind =
  | 'locker'
  | 'table'
  | 'desk'
  | 'chair'
  | 'chairStack'
  | 'cabinet'
  | 'clock'
  | 'radio'
  | 'console'
  | 'generator'
  | 'genPanel'
  | 'uvSwitch'
  | 'board'
  | 'keypad'
  | 'gunTable'
  | 'ammoCrate'
  | 'lever'
  | 'anchor'
  | 'terminal'
  | 'liftPanel'
  | 'tapeDeck'
  | 'mattress'
  | 'sleepingBag'
  | 'barrel'
  | 'crate'
  | 'body'
  | 'camera'
  | 'vent'
  | 'backpack'
  | 'wallPanel'
  | 'rack'
  | 'boxes';

export interface PropDef {
  kind: PropKind;
  x: number;
  z: number;
  /** 0: front faces -Z, 1: -X, 2: +Z, 3: +X */
  rot: number;
  id?: string;
  y?: number;
}

/** footprint & height; collide = blocks movement */
export const PROP_SIZE: Record<PropKind, { w: number; h: number; d: number; y0?: number; collide: boolean }> = {
  locker: { w: 0.9, h: 2.0, d: 0.6, collide: true },
  table: { w: 1.8, h: 0.78, d: 0.9, collide: false },
  desk: { w: 1.5, h: 0.78, d: 0.75, collide: true },
  chair: { w: 0.5, h: 0.9, d: 0.5, collide: false },
  chairStack: { w: 1.4, h: 2.1, d: 1.2, collide: true },
  cabinet: { w: 1.0, h: 1.3, d: 0.5, collide: true },
  clock: { w: 0.42, h: 0.42, d: 0.08, y0: 1.65, collide: false },
  radio: { w: 0.8, h: 0.4, d: 0.4, y0: 0.78, collide: false },
  console: { w: 2.2, h: 1.1, d: 0.8, collide: true },
  generator: { w: 2.6, h: 1.6, d: 1.4, collide: true },
  genPanel: { w: 1.1, h: 0.8, d: 0.15, y0: 0.9, collide: false },
  uvSwitch: { w: 0.25, h: 0.35, d: 0.1, y0: 1.2, collide: false },
  board: { w: 2.2, h: 1.3, d: 0.06, y0: 0.9, collide: false },
  keypad: { w: 0.3, h: 0.45, d: 0.08, y0: 1.15, collide: false },
  gunTable: { w: 1.8, h: 0.85, d: 0.9, collide: true },
  ammoCrate: { w: 0.7, h: 0.4, d: 0.45, collide: false },
  lever: { w: 0.6, h: 1.2, d: 0.3, y0: 0.5, collide: false },
  anchor: { w: 3.2, h: 2.6, d: 3.2, collide: true },
  terminal: { w: 0.9, h: 1.35, d: 0.6, collide: true },
  liftPanel: { w: 0.35, h: 0.55, d: 0.08, y0: 1.1, collide: false },
  tapeDeck: { w: 0.7, h: 0.3, d: 0.4, y0: 0.78, collide: false },
  mattress: { w: 1.0, h: 0.22, d: 2.0, collide: false },
  sleepingBag: { w: 0.8, h: 0.18, d: 1.9, collide: false },
  barrel: { w: 0.6, h: 0.9, d: 0.6, collide: true },
  crate: { w: 1.0, h: 0.8, d: 1.0, collide: true },
  body: { w: 0.8, h: 0.35, d: 1.8, collide: false },
  camera: { w: 0.3, h: 0.2, d: 0.35, y0: 2.4, collide: false },
  vent: { w: 0.8, h: 0.6, d: 0.06, y0: 0.15, collide: false },
  backpack: { w: 0.45, h: 0.55, d: 0.3, collide: false },
  wallPanel: { w: 1.6, h: 2.2, d: 0.05, collide: false },
  rack: { w: 1.6, h: 1.9, d: 0.5, collide: true },
  boxes: { w: 0.95, h: 1.0, d: 0.55, collide: true },
};

/** against a wall: the prop's back touches the wall on the given side of a cell */
const wallN = (cx: number, cz: number, dx: number, d: number) => ({ x: c(cx) + dx, z: cz * CELL + d / 2 + 0.02, rot: 2 });
const wallS = (cx: number, cz: number, dx: number, d: number) => ({ x: c(cx) + dx, z: cz * CELL + CELL - d / 2 - 0.02, rot: 0 });
const wallW = (cx: number, cz: number, dz: number, d: number) => ({ x: cx * CELL + d / 2 + 0.02, z: c(cz) + dz, rot: 3 });
const wallE = (cx: number, cz: number, dz: number, d: number) => ({ x: cx * CELL + CELL - d / 2 - 0.02, z: c(cz) + dz, rot: 1 });
const P = (kind: PropKind, at: { x: number; z: number; rot: number }, id?: string, y?: number): PropDef => ({ kind, ...at, id, y });
const free = (x: number, z: number, rot = 0) => ({ x, z, rot });

export const PROPS: PropDef[] = [
  // ---------------- start closet
  P('mattress', free(4, 76.5, 0)),
  P('backpack', free(6.6, 77.6, 0.3)),
  P('locker', wallW(1, 34, 0, 0.6), 'locker_start'),
  // ---------------- clock room: five clocks, one of them still ticking
  P('clock', wallW(1, 22, 0, 0.08), 'clock0'),
  P('clock', wallW(1, 24, 0.4, 0.08), 'clock1'),
  P('clock', wallN(2, 20, 0, 0.08), 'clock2'),
  P('clock', wallN(4, 20, 0.5, 0.08), 'clock3'),
  P('clock', wallE(7, 23, 0, 0.08), 'clock4'),
  P('table', free(9, 47, 0), 'table_clock'),
  P('chair', free(8.3, 45.6, 2)),
  P('chair', free(10.4, 48.6, 0.4)),
  // ---------------- maze
  P('chairStack', free(38.5, 52.5, 0.2)),
  P('table', free(43, 45, 1), 'table_hub'),
  P('chair', free(41.6, 45.2, 1)),
  P('sleepingBag', free(17, 61, 1)),
  P('backpack', free(20.3, 60.2, 0)),
  P('locker', wallN(15, 31, 0, 0.6), 'locker_pillar1'),
  P('locker', wallN(23, 31, 0, 0.6), 'locker_pillar2'),
  P('locker', wallS(9, 25, 0, 0.6), 'locker_maze'),
  P('table', free(29, 67, 0), 'table_pillar'),
  P('keypad', { x: 49.92, z: 51.0, rot: 1 }, 'armory_keypad'),
  P('camera', { x: 48.6, z: 41.0, rot: 3 }, 'cam_hub'),
  P('vent', wallS(2, 32, -0.4, 0.06), 'vent_maze1'),
  P('vent', wallN(22, 20, 0, 0.06), 'vent_maze2'),
  P('wallPanel', { x: 43, z: 40.04, rot: 2 }, 'secret_panel'),
  // ---------------- armory
  P('gunTable', free(58, 48.5, 0), 'guntable'),
  P('ammoCrate', free(54.2, 54.6, 0.2)),
  P('rack', wallE(31, 22, 0, 0.5), 'rack'),
  P('locker', wallN(27, 21, 0, 0.6), 'locker_armory'),
  P('cabinet', wallS(29, 27, 0, 0.5)),
  // ---------------- dark corridors
  P('desk', wallN(40, 23, 0, 0.75), 'desk_radio'),
  P('radio', { x: c(40), z: 46.4, rot: 2 }, 'radio'),
  P('chair', free(80.6, 48.2, 2)),
  P('locker', wallE(42, 26, 0, 0.6), 'locker_radio'),
  P('generator', free(104, 67.5, 0), 'generator'),
  P('genPanel', wallN(49, 31, 0, 0.15), 'genpanel'),
  P('locker', wallS(54, 35, 0, 0.6), 'locker_gen'),
  P('barrel', free(95.5, 70.5, 0)),
  P('barrel', free(96.4, 71.2, 0)),
  P('locker', wallE(56, 26, 0.4, 0.6), 'locker_closet'),
  P('vent', wallS(40, 35, 0, 0.06), 'vent_dark1'),
  P('vent', wallN(56, 21, 0, 0.06), 'vent_dark2'),
  P('vent', wallW(34, 36, 0, 0.06), 'vent_dark3'),
  P('camera', { x: 70.6, z: 59.6, rot: 3 }, 'cam_dark'),
  // ---------------- storage complex
  P('console', wallN(28, 1, 0.6, 0.8), 'console'),
  P('chair', free(57.6, 5.6, 2)),
  P('locker', wallS(26, 5, 0, 0.6), 'locker_cam'),
  P('uvSwitch', { x: 63.92, z: 31.2, rot: 1 }, 'uvswitch'),
  P('barrel', free(55, 26.2, 0)),
  P('barrel', free(56, 26.4, 0)),
  P('cabinet', wallS(28, 17, 0, 0.5)),
  P('table', free(80, 18.9, 0), 'table_store1'),
  P('table', free(100, 10.9, 0), 'table_store2'),
  P('crate', free(70.4, 4.2, 0)),
  P('crate', free(70.6, 5.4, 0.2)),
  P('crate', free(92, 30.8, 0)),
  P('locker', wallW(33, 6, 0, 0.6), 'locker_store1'),
  P('locker', wallN(50, 1, 0, 0.6), 'locker_store2'),
  P('locker', wallS(44, 18, 0.4, 0.6), 'locker_store3'),
  P('camera', { x: 67.4, z: 2.6, rot: 3 }, 'cam_store'),
  P('camera', { x: 115.4, z: 31.5, rot: 1 }, 'cam_cage'),
  P('body', free(110.5, 33.6, 1.1)),
  P('chair', free(112.3, 30.2, 1)),
  P('vent', wallS(48, 18, 0, 0.06), 'vent_store1'),
  P('vent', wallN(40, 1, 0, 0.06), 'vent_store2'),
  // ---------------- red sector
  P('liftPanel', { x: 6.2, z: 2.05, rot: 2 }, 'liftpanel'),
  P('board', wallN(11, 1, 0.3, 0.06), 'roster'),
  P('sleepingBag', free(18.5, 9.5, 0.1)),
  P('sleepingBag', free(26.5, 9.5, -0.2)),
  P('crate', free(28.2, 4, 0)),
  P('backpack', free(21, 12.2, 0.4)),
  P('desk', wallN(21, 1, 0, 0.75), 'desk_tapes'),
  P('tapeDeck', { x: c(21), z: 2.5, rot: 2 }, 'tapedeck'),
  P('locker', wallE(24, 4, 0, 0.6), 'locker_tapes'),
  P('body', free(10.5, 24.5, 0.6)),
  P('body', free(15.2, 27.6, 2.4)),
  P('locker', wallW(1, 12, 0, 0.6), 'locker_red1'),
  P('locker', wallS(22, 12, 0, 0.6), 'locker_red2'),
  P('vent', wallW(1, 17, 0, 0.06), 'vent_red1'),
  P('vent', wallN(18, 7, 0, 0.06), 'vent_red2'),
  P('chair', free(42, 31.5, 2), 'secret_chair'),
  P('table', free(46, 34, 1), 'table_secret'),
  // ---------------- the descent
  P('liftPanel', { x: 9.9, z: 85.2, rot: 1 }, 'liftpanel_down'),
  P('lever', wallS(11, 54, 0, 0.3), 'lever_a'),
  P('lever', wallN(33, 41, 0, 0.3), 'lever_b'),
  P('lever', wallS(39, 54, 0, 0.3), 'lever_c'),
  P('anchor', free(101, 97, 0), 'anchor'),
  P('terminal', free(96.5, 92.5, 2.4), 'anchor_terminal'),
  P('locker', wallW(30, 50, 0, 0.6), 'locker_d1'),
  P('locker', wallN(13, 42, 0, 0.6), 'locker_d2'),
  P('locker', wallE(41, 51, 0, 0.6), 'locker_d3'),
  P('table', free(22.5, 106.5, 0), 'table_d1'),
  P('body', free(36, 91.5, 1.6)),
  P('body', free(76, 106.4, 0.3)),
  P('vent', wallW(8, 49, 0, 0.06), 'vent_d1'),
  P('vent', wallS(25, 44, 0, 0.06), 'vent_d2'),
  P('vent', wallE(41, 49, 0, 0.06), 'vent_d3'),
  P('vent', wallN(50, 43, 0, 0.06), 'vent_d4'),
];

export const PROP_BY_ID: Record<string, PropDef> = Object.fromEntries(PROPS.filter((p) => p.id).map((p) => [p.id!, p]));

// ------------------------------------------------------------------ hiding places
export type HideKind = 'locker' | 'table' | 'alcove';
/** alcove cells: crouching here in the dark hides you from the Stalker */
export const ALCOVES: { cx: number; cz: number }[] = [
  { cx: 35, cz: 25 },
  { cx: 35, cz: 26 },
  { cx: 35, cz: 27 },
  { cx: 1, cz: 21 },
  { cx: 44, cz: 33 },
  { cx: 41, cz: 52 },
];

// ------------------------------------------------------------------ items
export type ItemId = 'battery' | 'medkit' | 'ammo' | 'revolver' | 'liftcard' | 'tag';
export const ITEM_NAMES: Record<ItemId, string> = {
  battery: 'Bateria do latarki',
  medkit: 'Apteczka',
  ammo: 'Naboje .38 (6 szt.)',
  revolver: 'Rewolwer .38',
  liftcard: 'Karta windy towarowej',
  tag: 'Nieśmiertelnik',
};

export interface PickupDef {
  id: string;
  kind: 'item' | 'doc';
  ref: string;
  x: number;
  y: number;
  z: number;
  /** difficulties on which this pickup exists (all when undefined) */
  only?: Difficulty[];
}

const easy: Difficulty[] = ['story', 'normal'];
const notHard: Difficulty[] = ['story', 'normal', 'nightmare'];
const storyOnly: Difficulty[] = ['story'];

export const PICKUPS: PickupDef[] = [
  // documents
  { id: 'p_d01', kind: 'doc', ref: 'd01', x: 5.2, y: 0.25, z: 75.6 },
  { id: 'p_d02', kind: 'doc', ref: 'd02', x: 9.2, y: 0.8, z: 46.8 },
  { id: 'p_d03', kind: 'doc', ref: 'd03', x: 19.6, y: 0.2, z: 61.4 },
  { id: 'p_d04', kind: 'doc', ref: 'd04', x: 79.2, y: 0.8, z: 46.6 },
  { id: 'p_d05', kind: 'doc', ref: 'd05', x: 98.2, y: 0.03, z: 64.4 },
  { id: 'p_d06', kind: 'doc', ref: 'd06', x: 60.4, y: 1.12, z: 3.3 },
  { id: 'p_d07', kind: 'doc', ref: 'd07', x: 54.6, y: 0.92, z: 26.3 },
  { id: 'p_d08', kind: 'doc', ref: 'd08', x: 20.5, y: 0.2, z: 9.6 },
  { id: 'p_d09', kind: 'doc', ref: 'd09', x: 41.6, y: 0.8, z: 2.6 },
  { id: 'p_d10', kind: 'doc', ref: 'd10', x: 59.2, y: 0.87, z: 48.3 },
  { id: 'p_d11', kind: 'doc', ref: 'd11', x: 56.6, y: 0.87, z: 48.7 },
  { id: 'p_d12', kind: 'doc', ref: 'd12', x: 11.5, y: 0.2, z: 10.4 },
  { id: 'p_d13', kind: 'doc', ref: 'd13', x: 24, y: 0.8, z: 106.3 },
  { id: 'p_d14', kind: 'doc', ref: 'd14', x: 46, y: 0.8, z: 34.3 },
  { id: 'p_d15', kind: 'doc', ref: 'd15', x: 104.8, y: 0.2, z: 55.2 },
  // the weapon and the lift card
  { id: 'p_revolver', kind: 'item', ref: 'revolver', x: 58, y: 0.88, z: 48.5 },
  { id: 'p_liftcard', kind: 'item', ref: 'liftcard', x: 62.5, y: 1.35, z: 44 },
  // ammunition
  { id: 'p_ammo1', kind: 'item', ref: 'ammo', x: 54.2, y: 0.42, z: 54.6 },
  { id: 'p_ammo2', kind: 'item', ref: 'ammo', x: 57.2, y: 0.88, z: 48.9, only: notHard },
  { id: 'p_ammo3', kind: 'item', ref: 'ammo', x: 22.2, y: 0.15, z: 11.6 },
  { id: 'p_ammo4', kind: 'item', ref: 'ammo', x: 47.3, y: 0.8, z: 33.6 },
  { id: 'p_ammo5', kind: 'item', ref: 'ammo', x: 22.5, y: 0.8, z: 106.6, only: notHard },
  { id: 'p_ammo6', kind: 'item', ref: 'ammo', x: 66.5, y: 0.15, z: 84.2 },
  { id: 'p_ammo7', kind: 'item', ref: 'ammo', x: 100.4, y: 0.8, z: 11.1, only: easy },
  { id: 'p_ammo8', kind: 'item', ref: 'ammo', x: 76.5, y: 0.15, z: 108.4, only: storyOnly },
  // batteries
  { id: 'p_bat1', kind: 'item', ref: 'battery', x: 7.1, y: 0.3, z: 77.8 },
  { id: 'p_bat2', kind: 'item', ref: 'battery', x: 43.3, y: 0.8, z: 45.2 },
  { id: 'p_bat3', kind: 'item', ref: 'battery', x: 112.2, y: 0.15, z: 55.4 },
  { id: 'p_bat4', kind: 'item', ref: 'battery', x: 80.2, y: 0.8, z: 19.1, only: notHard },
  { id: 'p_bat5', kind: 'item', ref: 'battery', x: 29.5, y: 0.15, z: 3.4 },
  { id: 'p_bat6', kind: 'item', ref: 'battery', x: 33.5, y: 0.15, z: 89.5, only: easy },
  { id: 'p_bat7', kind: 'item', ref: 'battery', x: 29.2, y: 0.8, z: 67.2, only: storyOnly },
  // medkits
  { id: 'p_med1', kind: 'item', ref: 'medkit', x: 113.2, y: 0.15, z: 54.4 },
  { id: 'p_med2', kind: 'item', ref: 'medkit', x: 58.8, y: 0.88, z: 48.2 },
  { id: 'p_med3', kind: 'item', ref: 'medkit', x: 20.2, y: 0.2, z: 9.0, only: notHard },
  { id: 'p_med4', kind: 'item', ref: 'medkit', x: 106.5, y: 0.15, z: 71.2, only: easy },
  { id: 'p_med5', kind: 'item', ref: 'medkit', x: 26.6, y: 0.15, z: 108.8 },
  { id: 'p_med6', kind: 'item', ref: 'medkit', x: 9.4, y: 0.8, z: 47.3, only: storyOnly },
  // the five dog tags of Zwiad 4 (secret ending)
  { id: 'p_tag1', kind: 'item', ref: 'tag', x: 21.3, y: 0.2, z: 60.6 },
  { id: 'p_tag2', kind: 'item', ref: 'tag', x: 110.4, y: 0.2, z: 64.6 },
  { id: 'p_tag3', kind: 'item', ref: 'tag', x: 10.9, y: 0.36, z: 24.6 },
  { id: 'p_tag4', kind: 'item', ref: 'tag', x: 42.4, y: 0.95, z: 31.8 },
  { id: 'p_tag5', kind: 'item', ref: 'tag', x: 75.6, y: 0.36, z: 106.5 },
];

// ------------------------------------------------------------------ cameras (CCTV console in the storage complex)
export interface CameraDef {
  id: number;
  name: string;
  pos: [number, number, number];
  target: [number, number, number];
  /** vertical field of view (radians); zoomed lenses for distant details */
  fov?: number;
}
export const CAMERAS: CameraDef[] = [
  { id: 1, name: 'KAM 1 · HALA MAGAZYNOWA', pos: [67.4, 2.5, 2.6], target: [92, 0.6, 22] },
  { id: 2, name: 'KAM 2 · LABIRYNT, DRZWI ZBROJOWNI', pos: [48.6, 2.5, 41.0], target: [50, 0.9, 51] },
  { id: 3, name: 'KAM 3 · KLATKA', pos: [115.4, 2.5, 31.5], target: [104.2, 1.25, 31.6], fov: 0.5 },
  { id: 4, name: 'KAM 4 · CIEMNE KORYTARZE', pos: [70.6, 2.5, 59.6], target: [96, 0.5, 59] },
];

// ------------------------------------------------------------------ enemy entry points (ventilation and crawl spaces)
export interface VentDef {
  id: string;
  /** the walkable point in front of the grate */
  x: number;
  z: number;
  /** the grate itself (in the wall) */
  gx: number;
  gz: number;
  zone: ZoneId;
}
export const VENTS: VentDef[] = PROPS.filter((p) => p.kind === 'vent').map((p) => {
  // the walkable point in front of the grate
  const f = [[0, -1], [-1, 0], [0, 1], [1, 0]][p.rot];
  return { id: p.id!, x: p.x + f[0] * 0.7, z: p.z + f[1] * 0.7, gx: p.x - f[0] * 0.25, gz: p.z - f[1] * 0.25, zone: zoneOfVent(p.id!) };
});
function zoneOfVent(id: string): ZoneId {
  if (id.startsWith('vent_maze')) return 'maze';
  if (id.startsWith('vent_dark')) return 'dark';
  if (id.startsWith('vent_store')) return 'storage';
  if (id.startsWith('vent_red')) return 'red';
  return 'descent';
}

export const PLAYER_START = { x: 4.2, z: 74.6, yaw: -Math.PI / 2 };
/** where the lift drops the player in the Descent */
export const DESCENT_START = { x: 6, z: 87, yaw: -Math.PI / 2 };
/** the lift car in the red sector (standing inside the lobby counts as "in the lift") */
export const LIFT_TOP = { x0: 2, x1: 14, z0: 2, z1: 12 };

// ------------------------------------------------------------------ puzzle symbols
export type Sym = 'circle' | 'triangle' | 'square' | 'cross' | 'eye';
export const SYMBOLS: Sym[] = ['circle', 'triangle', 'square', 'cross', 'eye'];
export const SYM_NAME: Record<Sym, string> = { circle: 'Koło', triangle: 'Trójkąt', square: 'Kwadrat', cross: 'Krzyżyk', eye: 'Oko' };
export const SYM_GLYPH: Record<Sym, string> = { circle: '○', triangle: '△', square: '□', cross: '✕', eye: '◉' };

/** where each clue lives (for the journal and for hint text) */
export const SYM_PLACE: Record<Sym, string> = {
  circle: 'Pokój zegarów (Żółty Labirynt)',
  triangle: 'Radiostacja (Ciemne Korytarze)',
  square: 'Pokój kamer, kamera 3 (Kompleks Magazynowy)',
  cross: 'Obóz Zwiadu 4 (Czerwony Sektor)',
  eye: 'Magazyn chemiczny (Kompleks Magazynowy)',
};

// ------------------------------------------------------------------ helper re-exports for lights in map space
export const LIGHT_HEIGHT = H - 0.06;

// ------------------------------------------------------------------ clutter
// Furniture and junk along the walls of the larger rooms, generated from the
// layout (deterministic). Only against walls, only shallow pieces (<= 0.6 m) so
// that every cell keeps a free passage through its centre, never near doors,
// hiding places, vents, pickups or anything the story uses.
function clutterHash(x: number, z: number, s: number) {
  let h = (x * 374761393 + z * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const CLUTTER: Partial<Record<ZoneId, { p: number; kinds: PropKind[] }>> = {
  maze: { p: 0.035, kinds: ['cabinet', 'boxes', 'cabinet'] },
  storage: { p: 0.24, kinds: ['boxes', 'barrel', 'boxes', 'cabinet', 'barrel'] },
  red: { p: 0.2, kinds: ['barrel', 'boxes', 'cabinet', 'barrel'] },
  dark: { p: 0.22, kinds: ['barrel', 'boxes'] },
  descent: { p: 0.2, kinds: ['barrel', 'boxes', 'barrel', 'cabinet'] },
  anchor: { p: 0.12, kinds: ['barrel'] },
};
function clutter(): PropDef[] {
  const L = buildLayout();
  const walk = (x: number, z: number) => L.chars[z]?.[x] === '.' || L.chars[z]?.[x] === '~';
  const out: PropDef[] = [];
  const near = (x: number, z: number, r: number) =>
    [...PROPS, ...out].some((p) => Math.hypot(p.x - x, p.z - z) < r) ||
    PICKUPS.some((p) => Math.hypot(p.x - x, p.z - z) < 2.2) ||
    VENTS.some((v) => Math.hypot(v.x - x, v.z - z) < 2.4) ||
    CAMERAS.some((c) => Math.hypot(c.pos[0] - x, c.pos[2] - z) < 2.5);
  for (let cz = 1; cz < L.chars.length - 1; cz++)
    for (let cx = 1; cx < L.chars[0].length - 1; cx++) {
      if (!walk(cx, cz)) continue;
      const zone = L.zones[cz][cx];
      const rule = zone ? CLUTTER[zone] : undefined;
      if (!rule || clutterHash(cx, cz, 3) > rule.p) continue;
      // exactly one wall among the four sides (room edge, not a corridor or a corner)
      const sides = [
        [0, -1],
        [-1, 0],
        [0, 1],
        [1, 0],
      ].filter(([dx, dz]) => L.chars[cz + dz][cx + dx] === '#');
      if (sides.length !== 1) continue;
      // nothing that opens or must stay clear around it
      let blocked = false;
      for (let dz = -2; dz <= 2 && !blocked; dz++)
        for (let dx = -2; dx <= 2; dx++) if (L.chars[cz + dz]?.[cx + dx] === 'D' || ALCOVES.some((a) => a.cx === cx + dx && a.cz === cz + dz)) blocked = true;
      for (let dz = -1; dz <= 1 && !blocked; dz++) for (let dx = -1; dx <= 1; dx++) if (!walk(cx + dx, cz + dz) && L.chars[cz + dz][cx + dx] !== '#') blocked = true;
      if (blocked) continue;
      const kind = rule.kinds[Math.floor(clutterHash(cx, cz, 5) * rule.kinds.length)];
      const d = PROP_SIZE[kind].d;
      const off = (clutterHash(cx, cz, 9) - 0.5) * 0.6;
      const [sx, sz] = sides[0];
      const at = sz === -1 ? wallN(cx, cz, off, d) : sz === 1 ? wallS(cx, cz, off, d) : sx === -1 ? wallW(cx, cz, off, d) : wallE(cx, cz, off, d);
      if (near(at.x, at.z, 1.9)) continue;
      out.push(P(kind, at));
    }
  return out;
}
// hand-placed dressing in rooms that had little in them (no gameplay role)
PROPS.push(
  // the clock room was an office once
  P('desk', wallN(6, 20, 0.3, 0.75)),
  P('chair', free(13.3, 41.8, 2)),
  P('cabinet', wallE(7, 25, -0.3, 0.5)),
  P('chairStack', free(3.1, 51.0, 0.3)),
  // the room without a number: somebody lived here
  P('cabinet', wallN(19, 14, 0, 0.5)),
  P('cabinet', wallN(20, 14, 0.1, 0.5)),
  P('mattress', free(48.6, 31.2, 0)),
  P('boxes', wallE(24, 17, 0, 0.55)),
  // the deep level
  P('barrel', free(3.0, 83.2, 0)),
  P('boxes', wallS(2, 45, 0, 0.55)),
  P('cabinet', wallE(35, 42, 0, 0.5)),
  P('boxes', wallS(32, 44, 0, 0.55)),
  P('barrel', free(71.0, 89.0, 0)),
  P('cabinet', wallW(9, 52, 0, 0.5)),
  P('boxes', wallE(13, 53, 0, 0.55)),
  P('cabinet', wallE(41, 53, 0, 0.5)),
  P('boxes', wallN(39, 52, 0, 0.55)),
);
PROPS.push(...clutter());
