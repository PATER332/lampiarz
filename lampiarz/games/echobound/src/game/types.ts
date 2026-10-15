import type { CharId, UpgradeLevels } from './constants';

export type LegendEntry =
  | { type: 'sign'; text: string }
  | { type: 'plate'; target: string; noEcho?: boolean; echoOnly?: boolean; timed?: number }
  | { type: 'lever'; target: string; timed?: number; noEcho?: boolean }
  | { type: 'door'; id: string; latch?: boolean }
  | { type: 'mover'; dx: number; dy: number; speed: number; w: number; when?: string; spikes?: boolean; phase?: number }
  | { type: 'key'; id: string }
  | { type: 'lock'; id: string }
  | { type: 'portal'; id: string }
  | { type: 'shadow'; range?: number }
  | { type: 'guardian'; range?: number; sleepWhen?: string }
  | { type: 'devourer'; range?: number }
  | { type: 'wraith'; range?: number }
  | { type: 'snapper' }
  | { type: 'captive'; char: CharId };

export type Theme =
  | 'cave' | 'ruins' | 'archive' | 'gardens' | 'forge' | 'spire' | 'heart'
  | 'abyss' | 'mire' | 'citadel' | 'rift';

export type BossKind = 'rootMatriarch' | 'forgeBehemoth' | 'glassWarden' | 'heartCore';

export interface BossDef {
  kind: BossKind;
  name: string;
  title: string;
  x: number;
  floorY: number;
  arena: [left: number, right: number, top: number, bottom: number];
  hp: number;
}

export interface LevelDef {
  id: Theme;
  name: string;
  subtitle: string;
  theme: Theme;
  map: string[];
  legend: Record<string, LegendEntry>;
  next: Theme | null;
  boss?: BossDef;
}

export interface HudState {
  hp: number;
  maxHp: number;
  crystals: number;
  energy: number;
  maxEnergy: number;
  recording: boolean;
  recTime: number;
  recMax: number;
  echoes: number;
  maxEchoes: number;
  area: string;
  message: string | null;
  prompt: string | null;
  sign: string | null;
  memory: boolean;
  hasMemory: boolean;
  lowEnergy: boolean;
  /** Numer aktu fabularnego (1 albo 2) — pokazywany w HUD obok nazwy obszaru. */
  act: number;
  keys: number;
  reflections: number;
  character: CharId;
  charsUnlocked: number;
  dashes: number;
  maxDashes: number;
  /** Remaining life of the Shadow Anchor (0..1), or -1 when none is placed. */
  anchor: number;
  boss: null | { name: string; title: string; hp: number; maxHp: number; phase: number; vulnerable: boolean };
}

export interface VictoryStats {
  crystals: number;
  deaths: number;
  secrets: number;
  secretsTotal: number;
  time: number;
}

export type GameEvent =
  | { type: 'intro'; active: boolean }
  | { type: 'pause' }
  | { type: 'death' }
  | { type: 'victory'; stats: VictoryStats }
  | { type: 'shop' }
  | { type: 'levelStart'; name: string; subtitle: string; id: string }
  | { type: 'saved' }
  | { type: 'unlock'; char: CharId };

export interface SaveData {
  version: number;
  crystals: number;
  totalCrystals: number;
  upgrades: UpgradeLevels;
  unlocked: string[];
  checkpoint: { level: Theme; x: number; y: number } | null;
  solved: string[];
  collected: string[];
  secrets: string[];
  deaths: number;
  playtime: number;
  completed: boolean;
  savedAt: number;
  areaName: string;
  characters: CharId[];
  character: CharId;
}

export interface Settings {
  master: number;
  sfx: number;
  ambient: number;
  music: number;
  muted: boolean;
  touch: 'auto' | 'on' | 'off';
  shake: boolean;
}
