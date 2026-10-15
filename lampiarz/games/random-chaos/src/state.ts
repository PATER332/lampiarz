// Settings and statistics, kept in localStorage (validated on load: a broken
// or old value never stops the game from starting).
import { GAME_IDS, type GameId } from './sim/games/registry';
import { MODS, type ModId } from './sim/modifiers';
import type { ModFrequency } from './sim/tournament';

export const SETTINGS_KEY = 'randomchaos.settings.v1';
export const STATS_KEY = 'randomchaos.stats.v1';

export type LengthId = 'short' | 'normal' | 'long';
export const LENGTH: Record<LengthId, { label: string; k: number }> = {
  short: { label: 'Krótkie', k: 0.75 },
  normal: { label: 'Normalne', k: 1 },
  long: { label: 'Długie', k: 1.35 },
};

export interface Settings {
  music: number;
  sfx: number;
  length: LengthId;
  modFreq: ModFrequency;
  mods: ModId[];
  games: GameId[];
  target: number;
  names: [string, string];
  /** screen shake strength 0..1 */
  shake: number;
  reduced: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  music: 0.6,
  sfx: 0.85,
  length: 'normal',
  modFreq: 'sometimes',
  mods: MODS.map((m) => m.id),
  games: [...GAME_IDS],
  target: 5,
  names: ['Bąbel', 'Pieprz'],
  shake: 1,
  reduced: false,
};

export interface Stats {
  matches: number;
  /** matches won by P1 / P2 */
  wins: [number, number];
  rounds: [number, number];
  draws: number;
  perGame: Partial<Record<GameId, [number, number]>>;
}
export const EMPTY_STATS: Stats = { matches: 0, wins: [0, 0], rounds: [0, 0], draws: 0, perGame: {} };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const num = (v: unknown, a: number, b: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
const cleanName = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 12) : d);

export function loadSettings(): Settings {
  const s = { ...DEFAULT_SETTINGS, names: [...DEFAULT_SETTINGS.names] as [string, string] };
  try {
    const raw = storage()?.getItem(SETTINGS_KEY);
    if (!raw) return s;
    const v = JSON.parse(raw) as Partial<Settings>;
    if (!v || typeof v !== 'object') return s;
    s.music = num(v.music, 0, 1, s.music);
    s.sfx = num(v.sfx, 0, 1, s.sfx);
    s.shake = num(v.shake, 0, 1, s.shake);
    if (v.length && v.length in LENGTH) s.length = v.length;
    if (v.modFreq === 'off' || v.modFreq === 'sometimes' || v.modFreq === 'always') s.modFreq = v.modFreq;
    if (Array.isArray(v.mods)) s.mods = MODS.map((m) => m.id).filter((id) => (v.mods as string[]).includes(id));
    if (Array.isArray(v.games)) {
      const g = GAME_IDS.filter((id) => (v.games as string[]).includes(id));
      if (g.length) s.games = g;
    }
    if ([3, 5, 7, 10].includes(v.target as number)) s.target = v.target as number;
    if (Array.isArray(v.names)) s.names = [cleanName(v.names[0], s.names[0]), cleanName(v.names[1], s.names[1])];
    s.reduced = !!v.reduced;
  } catch {
    /* corrupt: defaults */
  }
  return s;
}
export function saveSettings(s: Settings) {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* full or blocked */
  }
}

export function loadStats(): Stats {
  try {
    const raw = storage()?.getItem(STATS_KEY);
    if (!raw) return structuredClone(EMPTY_STATS);
    const v = JSON.parse(raw) as Partial<Stats>;
    const pair = (p: unknown): [number, number] => (Array.isArray(p) ? [num(p[0], 0, 1e6, 0), num(p[1], 0, 1e6, 0)] : [0, 0]);
    const per: Stats['perGame'] = {};
    if (v.perGame && typeof v.perGame === 'object') for (const id of GAME_IDS) if ((v.perGame as Record<string, unknown>)[id]) per[id] = pair((v.perGame as Record<string, unknown>)[id]);
    return { matches: num(v.matches, 0, 1e6, 0), wins: pair(v.wins), rounds: pair(v.rounds), draws: num(v.draws, 0, 1e6, 0), perGame: per };
  } catch {
    return structuredClone(EMPTY_STATS);
  }
}
export function saveStats(s: Stats) {
  try {
    storage()?.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
