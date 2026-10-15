// The shared shape of a minigame. A minigame builds its arena, decides what
// falling out, being hit or touching a hazard means, keeps its own score and
// says who won. Everything else (physics, players, modifiers, the countdown,
// one result per round) is the Round's job.
import type { Rect } from '../../engine/math';
import type { ModId } from '../modifiers';
import type { Player } from '../player';
import type { Round } from '../round';
import type { Prop, SolidOpts } from '../world';

export type ThemeId = 'candy' | 'volcano' | 'dojo' | 'factory' | 'vault' | 'disco' | 'lab' | 'sunset';
export type MusicId = 'bounce' | 'lava' | 'fight' | 'race' | 'funk' | 'disco';

export interface GameDef {
  id: string;
  name: string;
  /** one line for cards */
  tagline: string;
  /** three short rules on the intro card */
  rules: string[];
  theme: ThemeId;
  music: MusicId;
  /** time limit at normal round length (s) */
  time: number;
  /** modifiers that do not make sense here */
  noMods?: ModId[];
  /** what S / ↓ does here */
  action: string;
}

export interface PlayerHud {
  /** big value (score, coins, lives as text) */
  main: string;
  /** small line under it */
  sub?: string;
  /** hearts or stocks drawn as pips */
  pips?: number;
  pipsMax?: number;
  /** 0..1 progress bar */
  bar?: number;
  out?: boolean;
}

export interface HudInfo {
  p: [PlayerHud, PlayerHud];
  /** a message in the middle of the top bar (sudden death, colour call…) */
  banner?: string;
  bannerColor?: string;
}

export abstract class Minigame {
  abstract def: GameDef;
  constructor(public r: Round) {}

  get w() {
    return this.r.world;
  }
  get players() {
    return this.r.players;
  }
  get rng() {
    return this.r.rng;
  }

  /** Lay out the arena. */
  abstract build(): void;
  /** Where each player starts (feet position). */
  abstract spawnPoint(id: 0 | 1): [number, number];
  /** Where a player comes back after falling (non-elimination games). */
  respawnPoint(id: 0 | 1): [number, number] {
    return this.spawnPoint(id);
  }
  /** Per fixed step. `playing` is false once the round is over. */
  abstract step(dt: number, playing: boolean): void;
  /** At the time limit: a result, or null to keep playing (overtime). */
  abstract timeUp(): { winner: -1 | 0 | 1; reason: string } | null;
  abstract hud(): HudInfo;

  /** S / ↓ pressed: return true to replace the default dash / slam. */
  onAction(_p: Player): boolean {
    return false;
  }
  onHit(_attacker: number, _victim: number, _kind: 'shove' | 'stomp' | 'slam') {}
  /** A dangerous loose object touched a player. */
  onProp(p: Player, pr: Prop) {
    this.hurt(p, pr.x);
    if (pr.kind === 'spikeball' || pr.kind === 'bomb') pr.alive = false;
  }
  /** Default: eliminated. */
  onFall(p: Player) {
    this.eliminate(p, 'spadł');
  }
  /** Camera: the region of the world that should be visible. */
  view(): Rect {
    const B = this.w.bounds;
    return { x: B.x, y: B.y, w: B.w, h: B.h };
  }

  // ---------------------------------------------------------------- helpers
  floor(x: number, y: number, w: number, h = 60, o: SolidOpts = {}) {
    return this.w.block(x, y, w, h, { style: 'ground', ...o });
  }
  plat(x: number, y: number, w: number, o: SolidOpts = {}) {
    return this.w.block(x, y, w, 20, { oneway: true, style: 'platform', ...o });
  }
  wall(x: number, y: number, w: number, h: number, o: SolidOpts = {}) {
    return this.w.block(x, y, w, h, { style: 'wall', ...o });
  }
  other(p: Player | number) {
    return this.players[1 - (typeof p === 'number' ? p : p.id)];
  }
  /** Knocked out of an elimination round: the other one wins. */
  eliminate(p: Player, why: string) {
    if (!p.alive) return;
    p.alive = false;
    this.r.emit({ type: 'fall', p: p.id, x: p.cx, y: p.cy });
    const o = this.other(p);
    if (o.alive) this.r.finish(o.id, `${p.name} ${why}`);
    else this.r.finish(-1, 'Oboje odpadli w tej samej chwili');
  }
  /** Generic hurt: knockback away from x, short invulnerability. */
  hurt(p: Player, fromX: number, power = 1) {
    if (p.invuln > 0 || !p.alive) return false;
    p.knock(Math.sign(p.cx - fromX || 1) * 420 * power, -460 * power, 0.4);
    p.invuln = 1.2;
    this.r.emit({ type: 'hurt', p: p.id, x: p.cx, y: p.cy });
    return true;
  }
  /** Both players need to be in the play phase for scoring. */
  get live() {
    return this.r.phase === 'play';
  }
}
