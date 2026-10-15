// Long-term progression: profile, statistics, achievements and unlocks.

import { ACHIEVEMENTS, CLASSES, MASTERY_MAP } from './content';
import type { ClassId, EnemyType, Run } from './types';

export const PROFILE_VERSION = 1;

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  shake: boolean;
  reducedMotion: boolean;
  showGrid: boolean;
  /** objective tracker hints, target arrows and first-encounter cards */
  hints: boolean;
  /** rich lighting effects */
  effects: boolean;
}

export interface RunRecord {
  date: number;
  cls: ClassId;
  night: number;
  won: boolean;
  depth: number;
  score: number;
  seed: number;
  daily: string | null;
  killedBy: string | null;
}

export interface Profile {
  version: number;
  achievements: Record<string, number>;
  stats: {
    runs: number;
    wins: number;
    deaths: number;
    kills: number;
    lamps: number;
    embers: number;
    turns: number;
    bestScore: number;
    deepest: number;
    winsByClass: Record<ClassId, number>;
    maxNightWon: number;
    bestEndless?: number;
  };
  nightUnlocked: number;
  seenEnemies: EnemyType[];
  seenRelics: string[];
  daily: Record<string, number>;
  history: RunRecord[];
  settings: Settings;
  tutorialSeen: boolean;
  /** interactive tutorial finished at least once */
  tutorialDone: boolean;
  /** enemy types whose first-encounter card was already shown */
  hintsSeen: string[];
  /** "Popiół" — meta currency earned at the end of every night, spent in the Księga mistrza */
  ash: number;
  /** permanent upgrade levels */
  mastery: Record<string, number>;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.55,
  sfx: 0.8,
  muted: false,
  shake: true,
  reducedMotion: false,
  showGrid: false,
  hints: true,
  effects: true,
};

export function newProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    achievements: {},
    stats: {
      runs: 0,
      wins: 0,
      deaths: 0,
      kills: 0,
      lamps: 0,
      embers: 0,
      turns: 0,
      bestScore: 0,
      deepest: 0,
      winsByClass: { lampiarz: 0, kowalka: 0, alchemik: 0 },
      maxNightWon: 0,
    },
    nightUnlocked: 1,
    seenEnemies: [],
    seenRelics: [],
    daily: {},
    history: [],
    settings: { ...DEFAULT_SETTINGS },
    tutorialSeen: false,
    tutorialDone: false,
    hintsSeen: [],
    ash: 0,
    mastery: {},
  };
}

export function unlockedSet(profile: Profile): Set<string> {
  return new Set(Object.keys(profile.achievements));
}

export function classUnlocked(profile: Profile, cls: ClassId): boolean {
  const req = CLASSES[cls].unlock;
  return req === null || !!profile.achievements[req];
}

/** Achievement conditions. `run` may be in progress; cumulative ones add live run stats. */
function conditions(profile: Profile, run: Run | null): Record<string, boolean> {
  const s = profile.stats;
  const r = run;
  const won = r?.phase === 'victory';
  return {
    pierwsze_swiatlo: !!r && r.stats.lampsLit >= 1,
    pelne_swiatlo: !!r && (r.district?.fullLight ?? false),
    przez_mrok: !!r && r.depth >= 3,
    alchemia: s.lamps + (r && !isCommitted(r) ? r.stats.lampsLit : 0) >= 40,
    bez_skazy: !!r && r.stats.flawlessDistricts >= 1,
    pogromca: s.kills + (r && !isCommitted(r) ? r.stats.kills : 0) >= 100,
    swit: won,
    skarbnik: !!r && r.stats.embersGained >= 60,
    asceta: won && r!.player.relics.length <= 2,
    nocna_zmiana: won && r!.night >= 3,
    piec_nocy: won && r!.night >= 5,
    wszyscy: (Object.keys(CLASSES) as ClassId[]).every((c) => s.winsByClass[c] > 0),
    codzienna: !!r && !!r.daily && (won || (r.phase === 'defeat' && r.depth >= 3)),
    matkobojca: !!r && r.bossSlain,
    na_oparach: !!r && r.stats.zeroOilFinish,
    kapliczka: !!r && r.shrineFound,
    feniks: !!r && r.phoenixUsed,
    kominiarz: !!r && (r.stats.minibossSlain ?? 0) >= 1,
    pirotechnik: !!r && (r.stats.bestBlast ?? 0) >= 3,
    do_switu: !!r && r.mode === 'endless' && r.stats.districts >= 8,
    mistrz: Object.values(profile.mastery ?? {}).reduce((a, b) => a + b, 0) >= 5,
  };
}

const committedRuns = new WeakSet<Run>();
const isCommitted = (r: Run) => committedRuns.has(r);

/** Returns ids of newly earned achievements (and records them on the profile). */
export function checkAchievements(profile: Profile, run: Run | null): string[] {
  const cond = conditions(profile, run);
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.achievements[a.id]) continue;
    if (cond[a.id]) {
      profile.achievements[a.id] = Date.now();
      fresh.push(a.id);
    }
  }
  return fresh;
}

/** Merge discovery lists from a run into the profile (bestiary / reliquary). */
export function syncDiscoveries(profile: Profile, run: Run) {
  for (const e of run.seenEnemies) if (!profile.seenEnemies.includes(e)) profile.seenEnemies.push(e);
  for (const r of run.seenRelics) if (!profile.seenRelics.includes(r)) profile.seenRelics.push(r);
}

/** Commit a finished run to the profile. Idempotent per Run object. */
export function finalizeRun(profile: Profile, run: Run): string[] {
  if (committedRuns.has(run)) return [];
  if (run.phase !== 'victory' && run.phase !== 'defeat') return [];
  // achievements that depend on live stats must be checked before commit
  const early = checkAchievements(profile, run);
  committedRuns.add(run);
  const won = run.phase === 'victory';
  const s = profile.stats;
  s.runs++;
  if (won) {
    s.wins++;
    s.winsByClass[run.cls] = (s.winsByClass[run.cls] ?? 0) + 1;
    s.maxNightWon = Math.max(s.maxNightWon, run.night);
    profile.nightUnlocked = Math.max(profile.nightUnlocked, Math.min(5, run.night + 1));
  } else s.deaths++;
  s.kills += run.stats.kills;
  s.lamps += run.stats.lampsLit;
  s.embers += run.stats.embersGained;
  s.turns += run.stats.turns;
  s.bestScore = Math.max(s.bestScore, run.score);
  s.deepest = Math.max(s.deepest, run.depth);
  if (run.mode === 'endless') s.bestEndless = Math.max(s.bestEndless ?? 0, run.stats.districts);
  profile.ash = (profile.ash ?? 0) + ashFor(run);
  if (run.daily) profile.daily[run.daily] = Math.max(profile.daily[run.daily] ?? 0, run.score);
  // keep only the 30 most recent daily records
  const keys = Object.keys(profile.daily).sort();
  while (keys.length > 30) delete profile.daily[keys.shift()!];
  syncDiscoveries(profile, run);
  profile.history.unshift({
    date: Date.now(),
    cls: run.cls,
    night: run.night,
    won,
    depth: run.depth,
    score: run.score,
    seed: run.seed,
    daily: run.daily,
    killedBy: run.killedBy,
  });
  profile.history = profile.history.slice(0, 12);
  const late = checkAchievements(profile, run);
  return [...early, ...late];
}

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Popiół earned for a finished night. */
export function ashFor(run: Run): number {
  const won = run.phase === 'victory';
  const st = run.stats;
  return Math.round(
    st.embersGained * 0.35 + st.districts * 3 + (won ? 15 : 0) + (st.minibossSlain ?? 0) * 5 + (run.night - 1) * 2,
  );
}

export function masteryLevel(profile: Profile, id: string): number {
  return profile.mastery?.[id] ?? 0;
}

/** Cost of the next level, or null when maxed out. */
export function masteryNextCost(profile: Profile, id: string): number | null {
  const def = MASTERY_MAP[id];
  if (!def) return null;
  const lv = masteryLevel(profile, id);
  return lv < def.costs.length ? def.costs[lv] : null;
}

/** Buy the next level of an upgrade. Returns an error message or null on success. */
export function buyMastery(profile: Profile, id: string): string | null {
  const cost = masteryNextCost(profile, id);
  if (cost === null) return 'To ulepszenie ma już najwyższy poziom.';
  if ((profile.ash ?? 0) < cost) return 'Za mało popiołu.';
  profile.ash -= cost;
  profile.mastery = { ...(profile.mastery ?? {}), [id]: masteryLevel(profile, id) + 1 };
  return null;
}
