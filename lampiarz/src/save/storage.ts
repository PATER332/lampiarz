// Local persistence with validation. Corrupted data never crashes the game:
// it is backed up under a separate key and replaced with a fresh state.

import { BALANCE } from '../game/balance';
import { CLASSES, THEMES } from '../game/content';
import { RUN_VERSION } from '../game/engine';
import { DEFAULT_SETTINGS, newProfile, PROFILE_VERSION, type Profile } from '../game/meta';
import type { Run } from '../game/types';

const PROFILE_KEY = 'lampiarz.profile.v1';
const RUN_KEY = 'lampiarz.run.v1';

export interface LoadResult<T> {
  value: T;
  warning: string | null;
}

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__lampiarz_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export const storageAvailable = () => storage() !== null;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumArr = (v: unknown, len?: number) =>
  Array.isArray(v) && (len === undefined || v.length === len) && v.every((x) => isNum(x));

function backupCorrupt(key: string, raw: string) {
  const s = storage();
  try {
    s?.setItem(key + '.corrupt', raw.slice(0, 200000));
  } catch {
    /* ignore quota errors */
  }
}

// ------------------------------------------------------------------ profile
export function validateProfile(v: unknown): v is Profile {
  if (!isObj(v) || v.version !== PROFILE_VERSION) return false;
  if (!isObj(v.achievements) || !isObj(v.stats) || !isObj(v.settings)) return false;
  const st = v.stats as Record<string, unknown>;
  for (const k of ['runs', 'wins', 'deaths', 'kills', 'lamps', 'embers', 'turns', 'bestScore', 'deepest', 'maxNightWon'])
    if (!isNum(st[k])) return false;
  if (!isObj(st.winsByClass)) return false;
  if (!isNum(v.nightUnlocked) || v.nightUnlocked < 1 || v.nightUnlocked > 5) return false;
  if (!Array.isArray(v.seenEnemies) || !Array.isArray(v.seenRelics) || !Array.isArray(v.history)) return false;
  if (!isObj(v.daily)) return false;
  return true;
}

export function loadProfile(): LoadResult<Profile> {
  const s = storage();
  if (!s) return { value: newProfile(), warning: 'Przeglądarka blokuje zapis lokalny — postęp nie zostanie zapamiętany.' };
  const raw = s.getItem(PROFILE_KEY);
  if (!raw) return { value: newProfile(), warning: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!validateProfile(parsed)) throw new Error('invalid profile');
    // fill settings added in later versions
    parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
    parsed.stats.winsByClass = Object.assign({ lampiarz: 0, kowalka: 0, alchemik: 0 }, parsed.stats.winsByClass);
    if (typeof parsed.tutorialSeen !== 'boolean') parsed.tutorialSeen = true;
    return { value: parsed, warning: null };
  } catch {
    backupCorrupt(PROFILE_KEY, raw);
    s.removeItem(PROFILE_KEY);
    return { value: newProfile(), warning: 'Zapis profilu był uszkodzony. Utworzono nowy profil (kopia starego została zachowana).' };
  }
}

export function saveProfile(p: Profile): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(PROFILE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ run
export function validateRun(v: unknown): v is Run {
  if (!isObj(v) || v.version !== RUN_VERSION) return false;
  if (!isNum(v.seed) || !isNum(v.rngState) || !isNum(v.night) || !isNum(v.depth)) return false;
  if (typeof v.cls !== 'string' || !(v.cls in CLASSES)) return false;
  if (v.depth < 1 || v.depth > BALANCE.totalDepth) return false;
  const phases = ['play', 'event', 'summary', 'workshop', 'path'];
  if (typeof v.phase !== 'string' || !phases.includes(v.phase)) return false;
  const p = v.player;
  if (!isObj(p)) return false;
  for (const k of ['x', 'y', 'hp', 'maxHp', 'oil', 'maxOil', 'embers', 'lanternTimer']) if (!isNum(p[k])) return false;
  if (!Array.isArray(p.relics) || !isObj(p.facing)) return false;
  if ((p.hp as number) <= 0) return false;
  const d = v.district;
  if (!isObj(d)) return false;
  if (!isNum(d.w) || !isNum(d.h) || (d.w as number) < 5 || (d.h as number) < 5) return false;
  const n = (d.w as number) * (d.h as number);
  if (!isNumArr(d.tiles, n) || !isNumArr(d.explored, n) || !isNumArr(d.deco, n)) return false;
  if (typeof d.theme !== 'string' || !(d.theme in THEMES)) return false;
  for (const k of ['lamps', 'items', 'enemies', 'burning']) if (!Array.isArray(d[k])) return false;
  for (const e of d.enemies as unknown[]) if (!isObj(e) || !isNum(e.x) || !isNum(e.y) || !isNum(e.hp)) return false;
  for (const l of d.lamps as unknown[]) if (!isObj(l) || !isNum(l.x) || !isNum(l.y)) return false;
  if (!isObj(d.gate) || !isObj(d.start) || !isObj(d.mods) || !isNum(d.mrok) || !isNum(d.turn)) return false;
  if (!isObj(v.stats) || !Array.isArray(v.log)) return false;
  const px = p.x as number;
  const py = p.y as number;
  if (px < 0 || py < 0 || px >= (d.w as number) || py >= (d.h as number)) return false;
  return true;
}

export function loadRun(): LoadResult<Run | null> {
  const s = storage();
  if (!s) return { value: null, warning: null };
  const raw = s.getItem(RUN_KEY);
  if (!raw) return { value: null, warning: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!validateRun(parsed)) throw new Error('invalid run');
    return { value: parsed, warning: null };
  } catch {
    backupCorrupt(RUN_KEY, raw);
    s.removeItem(RUN_KEY);
    return { value: null, warning: 'Zapis bieżącej nocy był uszkodzony lub pochodził ze starszej wersji gry i został pominięty.' };
  }
}

export function saveRun(run: Run): boolean {
  const s = storage();
  if (!s) return false;
  if (run.phase === 'victory' || run.phase === 'defeat') {
    s.removeItem(RUN_KEY);
    return true;
  }
  try {
    s.setItem(RUN_KEY, JSON.stringify(run));
    return true;
  } catch {
    return false;
  }
}

export function clearRun() {
  storage()?.removeItem(RUN_KEY);
}

export function hasSavedRun(): boolean {
  return !!storage()?.getItem(RUN_KEY);
}

export function resetAll() {
  const s = storage();
  s?.removeItem(RUN_KEY);
  s?.removeItem(PROFILE_KEY);
}
