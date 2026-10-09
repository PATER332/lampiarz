// Local, per-browser user data (no accounts, no sync): favourites and recently played.
import { useSyncExternalStore } from 'react';
import { findGame } from './catalog';

const FAV_KEY = 'evgames.favorites.v1';
const RECENT_KEY = 'evgames.recent.v1';
const RECENT_MAX = 8;

export interface RecentEntry {
  slug: string;
  at: number;
}

function read<T>(key: string, fallback: T, valid: (v: unknown) => v is T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const v: unknown = JSON.parse(raw);
    return valid(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isRecent = (v: unknown): v is RecentEntry[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'object' && x !== null && typeof (x as RecentEntry).slug === 'string' && typeof (x as RecentEntry).at === 'number');

interface State {
  favorites: string[];
  recent: RecentEntry[];
}

// only keep entries for games that still exist
let state: State = {
  favorites: read(FAV_KEY, [], isStringArray).filter((s) => !!findGame(s)),
  recent: read(RECENT_KEY, [], isRecent).filter((r) => !!findGame(r.slug)),
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function set(next: Partial<State>) {
  state = { ...state, ...next };
  if (next.favorites) write(FAV_KEY, state.favorites);
  if (next.recent) write(RECENT_KEY, state.recent);
  emit();
}

// keep tabs in sync
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === FAV_KEY) state = { ...state, favorites: read(FAV_KEY, [], isStringArray) };
    else if (e.key === RECENT_KEY) state = { ...state, recent: read(RECENT_KEY, [], isRecent) };
    else return;
    emit();
  });
}

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export function toggleFavorite(slug: string): boolean {
  const on = !state.favorites.includes(slug);
  set({ favorites: on ? [slug, ...state.favorites] : state.favorites.filter((s) => s !== slug) });
  return on;
}

export function markPlayed(slug: string) {
  const recent = [{ slug, at: Date.now() }, ...state.recent.filter((r) => r.slug !== slug)].slice(0, RECENT_MAX);
  set({ recent });
}

export function clearRecent() {
  set({ recent: [] });
}

export function storageWorks(): boolean {
  try {
    const k = '__evgames_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
