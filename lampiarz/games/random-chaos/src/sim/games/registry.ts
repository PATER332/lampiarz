// All minigames in one place. Adding a game: write a Minigame subclass with its
// GameDef and add one line here.
import type { Round } from '../round';
import type { GameDef, Minigame } from './base';
import { Coins, COINS } from './coins';
import { Colors, COLORS } from './colors';
import { Dodge, DODGE } from './dodge';
import { King, KING } from './king';
import { Knockout, KNOCKOUT } from './knockout';
import { LAST_STANDING, LastStanding } from './lastStanding';
import { LAVA_RUSH, LavaRush } from './lavaRush';
import { Race, RACE } from './race';

export type GameId = 'lastStanding' | 'lavaRush' | 'knockout' | 'race' | 'coins' | 'colors' | 'dodge' | 'king';

const MAKERS: Record<GameId, (r: Round) => Minigame> = {
  lastStanding: (r) => new LastStanding(r),
  lavaRush: (r) => new LavaRush(r),
  knockout: (r) => new Knockout(r),
  race: (r) => new Race(r),
  coins: (r) => new Coins(r),
  colors: (r) => new Colors(r),
  dodge: (r) => new Dodge(r),
  king: (r) => new King(r),
};

export const GAMES: GameDef[] = [LAST_STANDING, LAVA_RUSH, KNOCKOUT, RACE, COINS, COLORS, DODGE, KING];
export const GAME_IDS = GAMES.map((g) => g.id as GameId);
export const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<GameId, GameDef>;

export function createGame(id: GameId, r: Round): Minigame {
  return MAKERS[id](r);
}
export type { Minigame };
