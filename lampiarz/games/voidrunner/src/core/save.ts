// Local saves: permanent progress (meta) and the current expedition snapshot (run).

import type { CosmeticId, PermId, UpgradeId, WeaponId } from '../game/data';
import { DEFAULT_KEYS, type Action, type KeyMap } from './input';

export const META_KEY = 'voidrunner.meta.v1';
export const RUN_KEY = 'voidrunner.run.v1';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  ambient: number;
  shake: boolean;
  damageNumbers: boolean;
  /** bloom, scanlines and foreground silhouettes */
  effects: boolean;
  touch: 'auto' | 'on' | 'off';
}

export interface Meta {
  version: 1;
  fragments: number;
  totalFragments: number;
  perm: Partial<Record<PermId, number>>;
  weapons: WeaponId[];
  weapon: WeaponId;
  cosmetics: CosmeticId[];
  cosmetic: CosmeticId;
  stats: { runs: number; wins: number; deaths: number; kills: number; bosses: number; bestArea: number; bestTime: number };
  settings: Settings;
  keys: KeyMap;
  /** 2 = defaults include R and mouse buttons */
  keysVersion?: number;
  tutorialDone: boolean;
}

export interface RunSave {
  version: 1;
  seed: number;
  area: number;
  room: number;
  hp: number;
  healCharges: number;
  upgrades: Partial<Record<UpgradeId, number>>;
  weapon: WeaponId;
  cosmetic: CosmeticId;
  fragments: number; // collected during this expedition
  kills: number;
  bosses: number;
  time: number;
  savedAt: number;
}

export const defaultSettings = (): Settings => ({ master: 0.8, music: 0.5, sfx: 0.8, ambient: 0.8, shake: true, damageNumbers: true, effects: true, touch: 'auto' });

export function newMeta(): Meta {
  return {
    version: 1,
    fragments: 0,
    totalFragments: 0,
    perm: {},
    weapons: ['blade'],
    weapon: 'blade',
    cosmetics: ['standard'],
    cosmetic: 'standard',
    stats: { runs: 0, wins: 0, deaths: 0, kills: 0, bosses: 0, bestArea: 0, bestTime: 0 },
    settings: defaultSettings(),
    keys: JSON.parse(JSON.stringify(DEFAULT_KEYS)),
    keysVersion: 2,
    tutorialDone: false,
  };
}

/** Storage that survives private mode / blocked storage (falls back to memory). */
const mem = new Map<string, string>();
const store = {
  get(k: string): string | null {
    try {
      return globalThis.localStorage ? globalThis.localStorage.getItem(k) : mem.get(k) ?? null;
    } catch {
      return mem.get(k) ?? null;
    }
  },
  set(k: string, v: string) {
    try {
      if (globalThis.localStorage) globalThis.localStorage.setItem(k, v);
      else mem.set(k, v);
    } catch {
      mem.set(k, v);
    }
  },
  del(k: string) {
    try {
      if (globalThis.localStorage) globalThis.localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
    mem.delete(k);
  },
};

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function loadMeta(): Meta {
  const base = newMeta();
  const raw = store.get(META_KEY);
  if (!raw) return base;
  try {
    const p = JSON.parse(raw) as Partial<Meta>;
    if (!p || p.version !== 1) return base;
    const keys = { ...base.keys };
    if (p.keys && typeof p.keys === 'object')
      for (const a of Object.keys(keys) as Action[]) {
        const v = (p.keys as KeyMap)[a];
        if (Array.isArray(v) && v.every((x) => typeof x === 'string')) keys[a] = v;
      }
    if ((p.keysVersion ?? 1) < 2) {
      // older saves: add the new default bindings (R, left / right mouse button) if they are free
      const used = new Set(Object.values(keys).flat());
      for (const [a, code] of [['attack', 'KeyR'], ['attack', 'Mouse0'], ['special', 'Mouse2']] as [Action, string][])
        if (!used.has(code)) {
          keys[a] = [...keys[a], code];
          used.add(code);
        }
    }
    return {
      ...base,
      fragments: Math.max(0, num(p.fragments, 0)),
      totalFragments: Math.max(0, num(p.totalFragments, 0)),
      perm: p.perm && typeof p.perm === 'object' ? p.perm : {},
      weapons: Array.isArray(p.weapons) && p.weapons.length ? p.weapons : base.weapons,
      weapon: p.weapon && (p.weapons ?? []).includes(p.weapon) ? p.weapon : 'blade',
      cosmetics: Array.isArray(p.cosmetics) && p.cosmetics.length ? p.cosmetics : base.cosmetics,
      cosmetic: p.cosmetic && (p.cosmetics ?? []).includes(p.cosmetic) ? p.cosmetic : 'standard',
      stats: { ...base.stats, ...(p.stats ?? {}) },
      settings: { ...base.settings, ...(p.settings ?? {}) },
      keys,
      keysVersion: 2,
      tutorialDone: !!p.tutorialDone,
    };
  } catch {
    return base;
  }
}

export function saveMeta(m: Meta) {
  store.set(META_KEY, JSON.stringify(m));
}

export function loadRun(): RunSave | null {
  const raw = store.get(RUN_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as RunSave;
    if (!p || p.version !== 1 || typeof p.seed !== 'number' || typeof p.area !== 'number' || typeof p.room !== 'number') return null;
    if (p.area < 0 || p.area > 4 || p.room < 0 || p.room > 10) return null;
    return p;
  } catch {
    return null;
  }
}

export function saveRun(r: RunSave) {
  store.set(RUN_KEY, JSON.stringify(r));
}

export function clearRun() {
  store.del(RUN_KEY);
}
