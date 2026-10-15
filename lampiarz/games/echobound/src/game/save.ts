import { emptyUpgrades } from './constants';
import type { SaveData, Settings } from './types';

const SAVE_KEY = 'echobound.save.v1';
const SETTINGS_KEY = 'echobound.settings.v1';

export function newSave(): SaveData {
  return {
    version: 1,
    crystals: 0,
    totalCrystals: 0,
    upgrades: emptyUpgrades(),
    unlocked: ['cave'],
    characters: ['echo'],
    character: 'echo',
    checkpoint: null,
    solved: [],
    collected: [],
    secrets: [],
    deaths: 0,
    playtime: 0,
    completed: false,
    savedAt: Date.now(),
    areaName: 'Zapomniana Jaskinia',
  };
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (!parsed || parsed.version !== 1) return null;
    const base = newSave();
    const merged: SaveData = { ...base, ...parsed, upgrades: { ...base.upgrades, ...(parsed.upgrades ?? {}) } };
    // older saves know nothing about characters — make sure the roster is always valid
    const roster = (Array.isArray(merged.characters) ? merged.characters : []).filter((c) => c === 'echo' || c === 'weaver');
    if (!roster.includes('echo')) roster.unshift('echo');
    merged.characters = roster;
    if (!roster.includes(merged.character)) merged.character = 'echo';
    return merged;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData) {
  try {
    data.savedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function defaultSettings(): Settings {
  return { master: 0.8, sfx: 0.9, ambient: 0.6, music: 0.7, muted: false, touch: 'auto', shake: true };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    return { ...defaultSettings(), ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return defaultSettings();
  }
}

export function writeSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function formatTime(sec: number): string {
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
