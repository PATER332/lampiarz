// Serializable game state, settings and meta progress. The world is rebuilt from
// this logical state; nothing from the renderer is ever stored.
import { DOORS, PLAYER_START, SYMBOLS, type Difficulty, type Sym } from '../world/map';
import type { EndingId } from './story';

export const SAVE_KEY = 'backroomsthedescent.save.v1';
export const SETTINGS_KEY = 'backroomsthedescent.settings.v1';
export const META_KEY = 'backroomsthedescent.meta.v1';
export const SAVE_VERSION = 1;

export interface DoorState {
  open: boolean;
  unlocked: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  difficulty: Difficulty;
  area: 'upper' | 'descent';
  flags: string[];
  events: string[];
  pickedUp: string[];
  docs: string[];
  /** journal observations (ids, rendered from the puzzle) */
  obs: string[];
  hypotheses: Record<Sym, string>;
  notes: string;
  doors: Record<string, DoorState>;
  health: number;
  battery: number;
  inv: { battery: number; medkit: number; ammo: number; tags: number };
  revolver: boolean;
  loaded: number;
  liftcard: boolean;
  gen: { on: boolean; step: number };
  uvOn: boolean;
  codeTries: number;
  lockUntil: number;
  stabilizers: string[];
  destroyed: string[];
  killed: string[];
  player: { x: number; z: number; yaw: number; pitch: number };
  playTime: number;
  deaths: number;
  stats: { shots: number; hits: number; kills: number; hidden: number };
}

export interface Settings {
  music: number;
  sfx: number;
  ambient: number;
  sensitivity: number;
  invertY: boolean;
  quality: 'low' | 'medium' | 'high';
  renderScale: number;
  reduced: boolean;
  headBob: boolean;
  gore: boolean;
  voice: boolean;
  /** picture brightness (exposure multiplier) */
  brightness: number;
}

export interface Meta {
  endings: EndingId[];
  bestTime: number | null;
  warned: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  music: 0.7,
  sfx: 0.85,
  ambient: 0.8,
  sensitivity: 1,
  invertY: false,
  quality: 'medium',
  renderScale: 1,
  reduced: false,
  headBob: true,
  gore: true,
  voice: true,
  brightness: 1,
};

export function newState(difficulty: Difficulty, seed = (Math.random() * 0x7fffffff) | 0): GameState {
  const doors: Record<string, DoorState> = {};
  for (const d of DOORS) doors[d.id] = { open: !!d.startOpen, unlocked: d.kind === 'normal' };
  return {
    version: SAVE_VERSION,
    seed,
    difficulty,
    area: 'upper',
    flags: [],
    events: [],
    pickedUp: [],
    docs: [],
    obs: [],
    hypotheses: Object.fromEntries(SYMBOLS.map((s) => [s, ''])) as Record<Sym, string>,
    notes: '',
    doors,
    health: 100,
    battery: 1,
    inv: { battery: difficulty === 'story' ? 2 : difficulty === 'nomercy' ? 0 : 1, medkit: difficulty === 'story' ? 1 : 0, ammo: 0, tags: 0 },
    revolver: false,
    loaded: 0,
    liftcard: false,
    gen: { on: false, step: 0 },
    uvOn: false,
    codeTries: 0,
    lockUntil: 0,
    stabilizers: [],
    destroyed: [],
    killed: [],
    player: { x: PLAYER_START.x, z: PLAYER_START.z, yaw: PLAYER_START.yaw, pitch: -0.1 },
    playTime: 0,
    deaths: 0,
    stats: { shots: 0, hits: 0, kills: 0, hidden: 0 },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const strArr = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');

export function validateState(v: unknown): v is GameState {
  if (!isObj(v) || v.version !== SAVE_VERSION) return false;
  if (!['story', 'normal', 'nightmare', 'nomercy'].includes(v.difficulty as string)) return false;
  if (v.area !== 'upper' && v.area !== 'descent') return false;
  for (const k of ['seed', 'health', 'battery', 'loaded', 'codeTries', 'lockUntil', 'playTime', 'deaths']) if (!num(v[k])) return false;
  for (const k of ['flags', 'events', 'pickedUp', 'docs', 'obs', 'stabilizers', 'destroyed', 'killed']) if (!strArr(v[k])) return false;
  if (typeof v.revolver !== 'boolean' || typeof v.liftcard !== 'boolean' || typeof v.uvOn !== 'boolean' || typeof v.notes !== 'string') return false;
  if (!isObj(v.inv) || !isObj(v.gen) || !isObj(v.player) || !isObj(v.doors) || !isObj(v.hypotheses) || !isObj(v.stats)) return false;
  const inv = v.inv as Record<string, unknown>;
  if (!['battery', 'medkit', 'ammo', 'tags'].every((k) => num(inv[k]))) return false;
  const p = v.player as Record<string, unknown>;
  if (!num(p.x) || !num(p.z) || !num(p.yaw)) return false;
  const g = v.gen as Record<string, unknown>;
  if (typeof g.on !== 'boolean' || !num(g.step)) return false;
  for (const d of DOORS) {
    const s = (v.doors as Record<string, unknown>)[d.id];
    if (!isObj(s) || typeof s.open !== 'boolean' || typeof s.unlocked !== 'boolean') return false;
  }
  if ((v.health as number) <= 0 || (v.health as number) > 100) return false;
  return true;
}

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    s.setItem('__bd_probe__', '1');
    s.removeItem('__bd_probe__');
    return s;
  } catch {
    return null;
  }
}

export function loadState(): { state: GameState | null; warning: string | null } {
  const s = storage();
  if (!s) return { state: null, warning: 'Przeglądarka blokuje zapis — postęp nie zostanie zapamiętany.' };
  const raw = s.getItem(SAVE_KEY);
  if (!raw) return { state: null, warning: null };
  try {
    const v: unknown = JSON.parse(raw);
    if (!validateState(v)) throw new Error('invalid');
    v.player.pitch = num(v.player.pitch) ? v.player.pitch : 0;
    for (const sym of SYMBOLS) if (typeof v.hypotheses[sym] !== 'string') v.hypotheses[sym] = '';
    return { state: v, warning: null };
  } catch {
    try {
      s.setItem(SAVE_KEY + '.corrupt', raw.slice(0, 200000));
    } catch {
      /* quota */
    }
    s.removeItem(SAVE_KEY);
    return { state: null, warning: 'Zapis był uszkodzony i został odłożony na bok. Rozpocznij nową grę.' };
  }
}

export function writeState(st: GameState): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(SAVE_KEY, JSON.stringify(st));
    return true;
  } catch {
    return false;
  }
}
export const hasState = () => !!storage()?.getItem(SAVE_KEY);
export const clearState = () => storage()?.removeItem(SAVE_KEY);

export function loadSettings(): Settings {
  try {
    const raw = storage()?.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const v = JSON.parse(raw);
    if (!isObj(v)) return { ...DEFAULT_SETTINGS };
    const out = { ...DEFAULT_SETTINGS, ...(v as Partial<Settings>) };
    if (!['low', 'medium', 'high'].includes(out.quality)) out.quality = 'medium';
    out.renderScale = Math.min(1, Math.max(0.5, Number(out.renderScale) || 1));
    out.sensitivity = Math.min(3, Math.max(0.2, Number(out.sensitivity) || 1));
    out.brightness = Math.min(1.6, Math.max(0.7, Number(out.brightness) || 1));
    for (const k of ['music', 'sfx', 'ambient'] as const) out[k] = Math.min(1, Math.max(0, Number(out[k]) || 0));
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(s: Settings) {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
export function loadMeta(): Meta {
  try {
    const v = JSON.parse(storage()?.getItem(META_KEY) ?? 'null');
    if (isObj(v) && strArr(v.endings)) return { endings: v.endings as EndingId[], bestTime: num(v.bestTime) ? (v.bestTime as number) : null, warned: v.warned === true };
  } catch {
    /* fall through */
  }
  return { endings: [], bestTime: null, warned: false };
}
export function saveMeta(m: Meta) {
  try {
    storage()?.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}
