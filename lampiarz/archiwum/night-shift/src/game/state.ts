// Serializable game state, settings and their persistence. Nothing from the
// renderer is ever saved — the world is rebuilt from this logical state.
import { DOORS, PLAYER_START, type Consumer, type ItemId } from '../world/map';
import type { EndingId } from './story';

export const SAVE_KEY = 'nightshift.save.v1';
export const SETTINGS_KEY = 'nightshift.settings.v1';
export const META_KEY = 'nightshift.meta.v1';
export const SAVE_VERSION = 1;

export interface DoorState {
  open: boolean;
  unlocked: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  mission: number;
  flags: string[];
  inventory: ItemId[];
  pickedUp: string[];
  opened: string[];
  docs: string[];
  doors: Record<string, DoorState>;
  camerasSeen: number[];
  power: { main: boolean; fuses: number; on: Consumer[] };
  battery: number;
  clock: number;
  player: { x: number; z: number; yaw: number; pitch: number };
  playTime: number;
  deaths: number;
  events: string[];
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
}

export interface Meta {
  endings: EndingId[];
  bestTime: number | null;
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
};

export function newState(seed = (Math.random() * 0x7fffffff) | 0): GameState {
  const doors: Record<string, DoorState> = {};
  for (const d of DOORS) doors[d.id] = { open: !!d.startOpen, unlocked: !d.card && !d.code && !d.flag && !d.oneWay && !d.external };
  return {
    version: SAVE_VERSION,
    seed,
    mission: 0,
    flags: [],
    inventory: [],
    pickedUp: [],
    opened: [],
    docs: [],
    doors,
    camerasSeen: [],
    power: { main: true, fuses: 0, on: ['lights_corridor', 'lights_rooms', 'cameras', 'doors'] },
    battery: 1,
    clock: 0,
    player: { x: PLAYER_START.x, z: PLAYER_START.z, yaw: PLAYER_START.yaw, pitch: 0 },
    playTime: 0,
    deaths: 0,
    events: [],
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const strArr = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');

export function validateState(v: unknown): v is GameState {
  if (!isObj(v) || v.version !== SAVE_VERSION) return false;
  if (!num(v.mission) || !num(v.battery) || !num(v.clock) || !num(v.playTime) || !num(v.seed)) return false;
  if ((v.mission as number) < 0 || (v.mission as number) > 8) return false;
  for (const k of ['flags', 'inventory', 'pickedUp', 'opened', 'docs', 'events']) if (!strArr(v[k])) return false;
  if (!Array.isArray(v.camerasSeen) || !v.camerasSeen.every(num)) return false;
  if (!isObj(v.doors) || !isObj(v.power) || !isObj(v.player)) return false;
  const p = v.player as Record<string, unknown>;
  if (!num(p.x) || !num(p.z) || !num(p.yaw)) return false;
  const pw = v.power as Record<string, unknown>;
  if (typeof pw.main !== 'boolean' || !num(pw.fuses) || !strArr(pw.on)) return false;
  for (const d of DOORS) {
    const s = (v.doors as Record<string, unknown>)[d.id];
    if (!isObj(s) || typeof s.open !== 'boolean' || typeof s.unlocked !== 'boolean') return false;
  }
  return true;
}

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    s.setItem('__ns_probe__', '1');
    s.removeItem('__ns_probe__');
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
    v.deaths = num(v.deaths) ? v.deaths : 0;
    return { state: v, warning: null };
  } catch {
    try {
      s.setItem(SAVE_KEY + '.corrupt', raw.slice(0, 100000));
    } catch {
      /* quota */
    }
    s.removeItem(SAVE_KEY);
    return { state: null, warning: 'Zapis był uszkodzony i został odłożony. Możesz rozpocząć nową zmianę.' };
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

export function hasState() {
  return !!storage()?.getItem(SAVE_KEY);
}

export function clearState() {
  storage()?.removeItem(SAVE_KEY);
}

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
    if (isObj(v) && strArr(v.endings)) return { endings: v.endings as EndingId[], bestTime: num(v.bestTime) ? (v.bestTime as number) : null };
  } catch {
    /* fall through */
  }
  return { endings: [], bestTime: null };
}

export function saveMeta(m: Meta) {
  try {
    storage()?.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}
