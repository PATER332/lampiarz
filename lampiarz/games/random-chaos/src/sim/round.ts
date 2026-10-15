// One round: a world, two players, one minigame and maybe one chaos modifier.
// Runs at a fixed step; the countdown, the play phase and the end of the round
// (which can only ever produce one result) live here.
import { clamp, overlaps, type Rect, Rng } from '../engine/math';
import { MOD_BY_ID, ModState, type ModId } from './modifiers';
import { BASE_TUNING, interact, NO_INPUT, type PadInput, Player, slamWave, type Tuning } from './player';
import { STEP, World, type SimEvent } from './world';
import type { GameId } from './games/registry';
import { createGame, type Minigame } from './games/registry';

export interface RoundConfig {
  game: GameId;
  mod: ModId | null;
  seed: number;
  /** round length multiplier (0.75 short, 1 normal, 1.35 long) */
  length: number;
  names: [string, string];
}

export type Phase = 'countdown' | 'play' | 'over';

export interface RoundResult {
  /** 0 or 1, or -1 for a draw */
  winner: -1 | 0 | 1;
  reason: string;
}

export const COUNTDOWN = 3.2;

export class Round {
  world: World;
  players: [Player, Player];
  game: Minigame;
  mod: ModState;
  tuning: [Tuning, Tuning];
  phase: Phase = 'countdown';
  countdown = COUNTDOWN;
  /** seconds of play */
  t = 0;
  /** time limit of the play phase (the minigame may add overtime) */
  limit: number;
  overtime = false;
  result: RoundResult | null = null;
  /** seconds since the result (slow motion, then the results screen) */
  overT = 0;
  inputs: [PadInput, PadInput] = [{ ...NO_INPUT }, { ...NO_INPUT }];
  /** knockback received multiplier per player (Knockout damage) */
  knockScale: [number, number] = [1, 1];
  rng: Rng;
  /** hazard rate multiplier (DOUBLE TROUBLE) */
  trouble = 1;
  private acc = 0;
  /** the last step's hits, for the minigame */
  shakeOnHit = 0;

  constructor(public cfg: RoundConfig) {
    this.rng = new Rng(cfg.seed);
    this.mod = new ModState(cfg.mod);
    this.trouble = cfg.mod === 'doubleTrouble' ? 1.8 : 1;
    const t: Tuning = { ...BASE_TUNING };
    if (cfg.mod) MOD_BY_ID[cfg.mod].tune?.(t);
    this.tuning = [{ ...t }, { ...t }];
    this.players = [new Player(0, cfg.names[0]), new Player(1, cfg.names[1])];
    this.world = new World({ x: 0, y: 0, w: 1280, h: 720, killY: 900 }, new Rng(cfg.seed ^ 0x9e3779b9));
    this.game = createGame(cfg.game, this);
    this.limit = this.game.def.time * cfg.length;
    this.game.build();
    for (const p of this.players) {
      p.resize(this.tuning[p.id].scale);
      const [x, y] = this.game.spawnPoint(p.id);
      p.place(x, y, p.id === 0 ? 1 : -1);
      p.frozen = true;
    }
    if (cfg.mod === 'disappearing') {
      for (const s of this.world.solids) if (s.oneway && s.crumble === 0 && !s.spring && s.style === 'platform') ((s.crumble = 0.9), (s.respawn = 2.6));
    }
    this.shakeOnHit = cfg.mod === 'screenShake' ? 1 : 0.35;
  }

  get w() {
    return this.world;
  }
  emit(e: SimEvent) {
    this.world.emit(e);
  }
  get timeLeft() {
    return Math.max(0, this.limit - this.t);
  }

  /** Advance by real time (fixed steps inside). */
  update(dt: number): number {
    this.acc = Math.min(this.acc + dt, 0.1);
    let n = 0;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step();
      n++;
    }
    return n;
  }

  step() {
    const dt = STEP;
    const W = this.world;
    W.fresh.length = 0;
    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown - 0.2);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown - 0.2);
      if (after !== before && after >= 1) this.emit({ type: 'sfx', name: 'count', vol: 1 });
      if (this.countdown <= 0.2) {
        this.phase = 'play';
        for (const p of this.players) p.frozen = false;
        this.emit({ type: 'sfx', name: 'go', vol: 1 });
      }
    }
    if (this.phase === 'over') {
      this.overT += dt;
      // winners celebrate, nobody acts any more
      for (const p of this.players) p.frozen = true;
    }
    const playing = this.phase === 'play';
    W.time += playing || this.phase === 'over' ? dt : 0;
    if (playing) this.t += dt;

    this.stepMod(dt, playing);
    W.stepSolids(dt, (r: Rect) => this.players.some((p) => p.alive && overlaps(p, r)));
    W.stepProps(dt);

    const [a, b] = this.players;
    for (const p of this.players) {
      const T = this.tuning[p.id];
      T.reversed = this.mod.revOn > 0;
      p.step(dt, this.inputs[p.id], W, T, playing ? (q) => this.game.onAction(q) : () => true);
      if (p.winT > 0 || (this.result && this.result.winner === p.id)) p.winT += dt;
    }
    if (playing) {
      const hits = interact(a, b, W, this.tuning, this.knockScale);
      for (const h of hits) {
        this.game.onHit(h.attacker, h.victim, h.kind);
        if (h.power > 1.2 || this.shakeOnHit >= 1) this.emit({ type: 'shake', power: 0.25 * this.shakeOnHit + 0.1 * h.power });
      }
      for (const e of W.fresh) {
        if (e.type === 'slam') {
          const p = this.players[e.p];
          const q = this.players[1 - e.p];
          this.emit({ type: 'shake', power: 0.3 * Math.max(0.5, this.shakeOnHit) });
          if (slamWave(p, q, W, this.knockScale[q.id] * this.tuning[p.id].knock)) this.game.onHit(p.id, q.id, 'slam');
        }
      }
    }
    // props that hurt
    if (playing) {
      for (const pr of W.props) {
        if (!pr.alive || !pr.hurts) continue;
        for (const p of this.players) {
          if (!p.alive || p.invuln > 0) continue;
          const cx = clamp(pr.x, p.x, p.x + p.w);
          const cy = clamp(pr.y, p.y, p.y + p.h);
          if ((pr.x - cx) ** 2 + (pr.y - cy) ** 2 < pr.r * pr.r) this.game.onProp(p, pr);
        }
      }
    }
    // falling out
    for (const p of this.players) {
      if (!p.alive) continue;
      const B = W.bounds;
      if (p.y > B.killY || (B.openSides && (p.x < B.x - 420 || p.x > B.x + B.w + 420)) || p.y < B.y - 900) {
        W.emit({ type: 'fall', p: p.id, x: clamp(p.cx, B.x, B.x + B.w), y: Math.min(p.y, B.killY) });
        if (playing) this.game.onFall(p);
        else this.respawn(p);
      }
    }
    if (playing || this.phase === 'over') this.game.step(dt, playing);
    if (playing && this.t >= this.limit && !this.result) {
      const r = this.game.timeUp();
      if (r) this.finish(r.winner, r.reason);
    }
  }

  /** The end of the round. Only the first call counts. */
  finish(winner: -1 | 0 | 1, reason: string) {
    if (this.result || this.phase !== 'play') return false;
    this.result = { winner, reason };
    this.phase = 'over';
    this.overT = 0;
    for (const p of this.players) p.frozen = true;
    if (winner >= 0) this.players[winner as 0 | 1].winT = 0.001;
    this.emit({ type: 'sfx', name: winner >= 0 ? 'roundWin' : 'draw', vol: 1 });
    return true;
  }

  /** Back to a safe spot (non-elimination games, stuck players). */
  respawn(p: Player, at?: [number, number]) {
    const [x, y] = at ?? this.game.respawnPoint(p.id);
    p.place(x, y);
    p.invuln = 1.4;
    p.alive = true;
    this.emit({ type: 'respawn', p: p.id, x: p.cx, y: p.cy });
  }

  /** Pause-menu helper: put both players back on safe ground. */
  unstickAll() {
    for (const p of this.players) if (p.alive) this.respawn(p);
  }

  // ---------------------------------------------------------------- modifiers over time
  private stepMod(dt: number, playing: boolean) {
    const M = this.mod;
    const W = this.world;
    W.wind = 0;
    if (!M.id || !playing) {
      M.revOn = 0;
      return;
    }
    if (M.id === 'wind') {
      M.windT -= dt;
      if (M.windLeft > 0) {
        M.windLeft -= dt;
        M.windNow = M.windNext;
        if (M.windLeft <= 0) M.windNow = 0;
      } else if (M.windWarn > 0) {
        M.windWarn -= dt;
        if (M.windWarn <= 0) {
          M.windLeft = 2.2;
          this.emit({ type: 'sfx', name: 'wind', vol: 1 });
        }
      } else if (M.windT <= 0) {
        M.windT = this.rng.range(5, 7.5);
        M.windNext = (this.rng.chance(0.5) ? -1 : 1) * this.rng.range(900, 1300);
        M.windWarn = 1.3;
      }
      W.wind = M.windNow;
    } else if (M.id === 'reversed') {
      if (M.revOn > 0) {
        M.revOn -= dt;
        if (M.revOn <= 0) this.emit({ type: 'sfx', name: 'unreverse', vol: 1 });
      } else if (M.revWarn > 0) {
        M.revWarn -= dt;
        if (M.revWarn <= 0) {
          M.revOn = 4;
          this.emit({ type: 'sfx', name: 'reverse', vol: 1 });
        }
      } else {
        M.revT -= dt;
        if (M.revT <= 0) {
          M.revT = this.rng.range(7, 10);
          M.revWarn = 2;
        }
      }
    } else if (M.id === 'chaosBlast') {
      if (M.blastWarn > 0) {
        M.blastWarn -= dt;
        if (M.blastWarn <= 0 && M.blastAt) {
          const [bx, by] = M.blastAt;
          this.emit({ type: 'blast', x: bx, y: by, power: 1 });
          this.emit({ type: 'shake', power: 0.5 });
          for (const p of this.players) {
            const dx = p.cx - bx;
            const dy = p.cy - by;
            const d = Math.hypot(dx, dy);
            if (d > 330) continue;
            const k = 1 - d / 380;
            p.knock((dx / (d || 1)) * 820 * k, -Math.max(260, (-dy / (d || 1)) * 820 * k), 0.25);
          }
          for (const pr of W.props) {
            const dx = pr.x - bx;
            const dy = pr.y - by;
            const d = Math.hypot(dx, dy);
            if (d < 330) {
              pr.vx += (dx / (d || 1)) * 700;
              pr.vy -= 500;
            }
          }
          M.blastAt = null;
        }
      } else {
        M.blastT -= dt;
        if (M.blastT <= 0) {
          M.blastT = this.rng.range(6, 8.5);
          // between the players, so it is equally bad for both
          const [a, b] = this.players;
          M.blastAt = [(a.cx + b.cx) / 2 + this.rng.range(-80, 80), (a.cy + b.cy) / 2 + this.rng.range(-40, 40)];
          M.blastWarn = 1.4;
          this.emit({ type: 'warn', x: M.blastAt[0], y: M.blastAt[1], power: 1 });
        }
      }
    }
  }
}
