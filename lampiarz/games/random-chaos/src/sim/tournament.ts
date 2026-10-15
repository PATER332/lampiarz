// The match: points to win, the pool of minigames, modifiers, the rounds played
// and who is ahead. Pure logic, no DOM — the UI and the tests drive it.
import { Rng } from '../engine/math';
import { MODS, type ModId } from './modifiers';
import { GAME_BY_ID, GAME_IDS, type GameId } from './games/registry';
import type { RoundResult } from './round';

export type ModFrequency = 'off' | 'sometimes' | 'always';

export interface MatchOptions {
  target: number;
  games: GameId[];
  modFreq: ModFrequency;
  mods: ModId[];
  /** round length multiplier */
  length: number;
  names: [string, string];
  seed: number;
}

export interface RoundRecord {
  game: GameId;
  mod: ModId | null;
  result: RoundResult;
}

export class Match {
  score: [number, number] = [0, 0];
  history: RoundRecord[] = [];
  rng: Rng;
  /** the round being played (or about to be) */
  current: { game: GameId; mod: ModId | null; seed: number } | null = null;
  winner: 0 | 1 | null = null;

  constructor(public opts: MatchOptions) {
    if (!opts.games.length) opts.games = [...GAME_IDS];
    this.rng = new Rng(opts.seed);
  }

  get over() {
    return this.winner !== null;
  }

  /** Pick the next minigame (no immediate repeat when there is a choice) and maybe a modifier. */
  next() {
    if (this.over) return null;
    const last = this.history[this.history.length - 1]?.game;
    const pool = this.opts.games.length > 1 ? this.opts.games.filter((g) => g !== last) : this.opts.games;
    // games played less often in this match are a bit more likely
    const weights = pool.map((g) => 1 / (1 + this.history.filter((h) => h.game === g).length));
    let k = this.rng.next() * weights.reduce((a, b) => a + b, 0);
    let game = pool[0];
    for (let i = 0; i < pool.length; i++) {
      k -= weights[i];
      if (k <= 0) {
        game = pool[i];
        break;
      }
    }
    this.current = { game, mod: this.pickMod(game), seed: (this.rng.next() * 0x7fffffff) | 0 };
    return this.current;
  }

  pickMod(game: GameId): ModId | null {
    const f = this.opts.modFreq;
    if (f === 'off') return null;
    if (f === 'sometimes' && !this.rng.chance(0.45)) return null;
    const no = GAME_BY_ID[game].noMods ?? [];
    const pool = this.opts.mods.filter((m) => !no.includes(m));
    return pool.length ? this.rng.pick(pool) : null;
  }

  /** Record the result of the current round. Returns false if it was already recorded. */
  record(result: RoundResult) {
    if (!this.current || this.over) return false;
    this.history.push({ game: this.current.game, mod: this.current.mod, result });
    if (result.winner >= 0) this.score[result.winner as 0 | 1]++;
    this.current = null;
    for (const p of [0, 1] as const) if (this.score[p] >= this.opts.target) this.winner = p;
    return true;
  }

  /** Same players, same options, from zero. */
  rematch(seed: number) {
    return new Match({ ...this.opts, seed });
  }
}

export const ALL_MODS = MODS.map((m) => m.id);
