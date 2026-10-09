// Core data model. Everything here is plain JSON so a run can be saved verbatim.

export type ClassId = 'lampiarz' | 'kowalka' | 'alchemik';
export type EnemyType = 'cien' | 'smigacz' | 'gasiciel' | 'smolnik' | 'lowca' | 'matka';
export type ThemeId = 'stare' | 'port' | 'cmentarz' | 'fabryka' | 'ogrod' | 'latarnia';
export type LampKind = 'lamp' | 'brazier' | 'lighthouse';
export type ItemKind = 'oil' | 'embers' | 'event' | 'shrine';

export const TILE_FLOOR = 0;
export const TILE_WALL = 1;

export interface Point {
  x: number;
  y: number;
}

export interface Lamp {
  id: number;
  x: number;
  y: number;
  kind: LampKind;
  lit: boolean;
}

export interface Item {
  id: number;
  x: number;
  y: number;
  kind: ItemKind;
  amount: number;
  eventId?: string;
}

export interface Enemy {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  elite: boolean;
  /** Łowca: direction of a telegraphed charge. */
  aim?: Point | null;
  /** Gasiciel: snuffing progress on its target lamp. */
  snuff?: number;
  snuffTarget?: number | null;
  /** Matka Mroku: turns until the eclipse pulse / spawn. */
  pulse?: number;
  brood?: number;
}

export interface Burning {
  x: number;
  y: number;
  t: number;
}

export interface Player {
  x: number;
  y: number;
  facing: Point;
  hp: number;
  maxHp: number;
  oil: number;
  maxOil: number;
  embers: number;
  relics: string[];
  lanternTimer: number;
}

export interface DistrictMods {
  oilBonus: number;
  emberMult: number;
  extraEnemies: number;
  mrokMult: number;
  lampRadiusBonus: number;
  weights: Partial<Record<EnemyType, number>>;
  eventGuaranteed: boolean;
}

export interface District {
  depth: number;
  theme: ThemeId;
  name: string;
  seed: number;
  w: number;
  h: number;
  tiles: number[];
  explored: number[];
  /** Decorative variation per tile (0..255), purely cosmetic but stable. */
  deco: number[];
  lamps: Lamp[];
  items: Item[];
  enemies: Enemy[];
  burning: Burning[];
  gate: Point;
  start: Point;
  mrok: number;
  turn: number;
  nextId: number;
  tookDamage: boolean;
  cloakUsed: boolean;
  heartUsed: boolean;
  fullLight: boolean;
  lampsLitHere: number;
  freeLampCounter: number;
  rest: number;
  killCounter: number;
  mods: DistrictMods;
  revealed: boolean;
}

export interface PathOption {
  theme: ThemeId;
  name: string;
  danger: number;
}

export interface WorkshopOffer {
  relic: string;
  price: number;
  sold: boolean;
}

export interface Workshop {
  offers: WorkshopOffer[];
  rerollCost: number;
  healCost: number;
  oilCost: number;
  freePick: boolean;
}

export type Phase = 'play' | 'event' | 'summary' | 'workshop' | 'path' | 'victory' | 'defeat';

export interface RunStats {
  kills: number;
  lampsLit: number;
  embersGained: number;
  turns: number;
  damageTaken: number;
  districts: number;
  oilUsed: number;
  flawlessDistricts: number;
  zeroOilFinish: boolean;
}

export interface Run {
  version: number;
  seed: number;
  rngState: number;
  cls: ClassId;
  night: number;
  daily: string | null;
  depth: number;
  district: District;
  player: Player;
  stats: RunStats;
  phase: Phase;
  workshop: Workshop | null;
  pathOptions: PathOption[] | null;
  pendingEvent: { id: string; itemId: number } | null;
  log: { text: string; tone: Tone; turn: number }[];
  phoenixUsed: boolean;
  shrineFound: boolean;
  bossSlain: boolean;
  killedBy: string | null;
  score: number;
  startedAt: number;
  seenEnemies: EnemyType[];
  seenRelics: string[];
  summary: DistrictSummary | null;
}

export interface DistrictSummary {
  name: string;
  turns: number;
  kills: number;
  lamps: number;
  totalLamps: number;
  fullLight: boolean;
  flawless: boolean;
  embers: number;
}

export type Tone = 'info' | 'good' | 'bad' | 'warn' | 'lore';

export type Action =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'wait' }
  | { type: 'ability' }
  | { type: 'interact' };

/** Visual / audio events produced by the engine, consumed by renderer and audio. */
export type Fx =
  | { k: 'step' }
  | { k: 'bump'; x: number; y: number; dx: number; dy: number }
  | { k: 'attack'; from: number; x: number; y: number; dx: number; dy: number }
  | { k: 'hit'; x: number; y: number; amount: number; target: 'enemy' | 'player' }
  | { k: 'death'; x: number; y: number; type: EnemyType }
  | { k: 'light'; x: number; y: number; kind: LampKind }
  | { k: 'snuff'; x: number; y: number }
  | { k: 'pickup'; x: number; y: number; kind: ItemKind; amount: number }
  | { k: 'flare'; x: number; y: number; r: number; color: string }
  | { k: 'burn'; x: number; y: number }
  | { k: 'spawn'; x: number; y: number; visible: boolean }
  | { k: 'gate'; open: boolean }
  | { k: 'text'; x: number; y: number; text: string; color: string }
  | { k: 'lunge'; x: number; y: number }
  | { k: 'pulse'; x: number; y: number; r: number }
  | { k: 'heal'; amount: number }
  | { k: 'drain'; x: number; y: number }
  | { k: 'deny' }
  | { k: 'complete' }
  | { k: 'victory' }
  | { k: 'defeat' }
  | { k: 'shake'; power: number };
