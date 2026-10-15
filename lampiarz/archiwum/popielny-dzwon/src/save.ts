// Versioned save data. Written only at safe moments (shrines, bosses, items, hub),
// never per frame. Keys are namespaced so they never collide with other EVGAMES titles.

import type { AttrId, BossId, EndingId, LocationId, RelicId, WeaponId } from './data/content';

export const SAVE_KEY = 'popielnydzwon.save.v1';
export const SETTINGS_KEY = 'popielnydzwon.settings.v1';
export const SAVE_VERSION = 1;

export interface Expedition {
  location: LocationId;
  seed: number;
  /** spawn id of the last shrine rested at (respawn point) */
  shrine: string | null;
  shrines: string[];
  chests: string[];
  walls: string[];
  events: string[];
  /** flasks burnt by encounters during this expedition */
  flaskPenalty: number;
}

export interface LostAsh {
  location: LocationId;
  seed: number;
  x: number;
  y: number;
  amount: number;
}

export interface SaveData {
  version: number;
  created: number;
  playTime: number;
  level: number;
  attrs: Record<AttrId, number>;
  zuzel: number;
  shards: number;
  lost: LostAsh | null;
  weapons: Partial<Record<WeaponId, number>>; // owned weapons -> upgrade level
  weapon: WeaponId;
  relics: RelicId[];
  equipped: RelicId[];
  relicSlots: number;
  flaskSeeds: LocationId[];
  bosses: Partial<Record<BossId, boolean>>;
  lore: string[];
  expedition: Expedition | null;
  inHub: boolean;
  tutorialDone: boolean;
  ending: EndingId | null;
  endingsSeen: EndingId[];
  stats: { deaths: number; kills: number; expeditions: number; parries: number; perfectDodges: number };
  halszkaTalked: number;
}

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  shake: boolean;
  reduced: boolean;
  numbers: boolean;
}

export const DEFAULT_SETTINGS: Settings = { master: 0.85, music: 0.6, sfx: 0.85, muted: false, shake: true, reduced: false, numbers: true };

export function newSave(): SaveData {
  return {
    version: SAVE_VERSION,
    created: Date.now(),
    playTime: 0,
    level: 1,
    attrs: { wigor: 0, wytrwalosc: 0, sila: 0, rezonans: 0 },
    zuzel: 0,
    shards: 0,
    lost: null,
    weapons: { klucz: 0 },
    weapon: 'klucz',
    relics: [],
    equipped: [],
    relicSlots: 2,
    flaskSeeds: [],
    bosses: {},
    lore: [],
    expedition: null,
    inHub: true,
    tutorialDone: false,
    ending: null,
    endingsSeen: [],
    stats: { deaths: 0, kills: 0, expeditions: 0, parries: 0, perfectDodges: 0 },
    halszkaTalked: -1,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

export function validateSave(v: unknown): v is SaveData {
  if (!isObj(v) || v.version !== SAVE_VERSION) return false;
  if (!num(v.level) || !num(v.zuzel) || !num(v.shards) || !num(v.relicSlots)) return false;
  if (!isObj(v.attrs) || !isObj(v.weapons) || !isObj(v.bosses) || !isObj(v.stats)) return false;
  for (const k of ['wigor', 'wytrwalosc', 'sila', 'rezonans']) if (!num((v.attrs as Record<string, unknown>)[k])) return false;
  if (typeof v.weapon !== 'string' || !(v.weapon in (v.weapons as object))) return false;
  if (!Array.isArray(v.relics) || !Array.isArray(v.equipped) || !Array.isArray(v.lore) || !Array.isArray(v.flaskSeeds)) return false;
  if (v.expedition !== null) {
    const e = v.expedition;
    if (!isObj(e) || typeof e.location !== 'string' || !num(e.seed) || !Array.isArray(e.chests) || !Array.isArray(e.walls)) return false;
  }
  return true;
}

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    s.setItem('__pd_probe__', '1');
    s.removeItem('__pd_probe__');
    return s;
  } catch {
    return null;
  }
}

export function loadSave(): { save: SaveData | null; warning: string | null } {
  const s = storage();
  if (!s) return { save: null, warning: 'Przeglądarka blokuje zapis — postęp nie zostanie zapamiętany.' };
  const raw = s.getItem(SAVE_KEY);
  if (!raw) return { save: null, warning: null };
  try {
    const v: unknown = JSON.parse(raw);
    if (!validateSave(v)) throw new Error('invalid');
    // fill fields added in later minor revisions
    v.endingsSeen ??= [];
    v.stats = Object.assign({ deaths: 0, kills: 0, expeditions: 0, parries: 0, perfectDodges: 0 }, v.stats);
    return { save: v, warning: null };
  } catch {
    try {
      s.setItem(SAVE_KEY + '.corrupt', raw.slice(0, 100000));
    } catch {
      /* quota */
    }
    s.removeItem(SAVE_KEY);
    return { save: null, warning: 'Zapis był uszkodzony. Kopia została odłożona na bok — możesz zacząć od nowa.' };
  }
}

export function writeSave(save: SaveData): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function deleteSave() {
  storage()?.removeItem(SAVE_KEY);
}

export function hasSave(): boolean {
  return !!storage()?.getItem(SAVE_KEY);
}

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const v = JSON.parse(raw);
    return isObj(v) ? { ...DEFAULT_SETTINGS, ...(v as Partial<Settings>) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
