// A simple computer player. It drives the menu's attract mode and the tests
// that check every minigame can be won. It only presses the same four buttons
// a human has.
import type { PadInput, Player } from './player';
import type { Round } from './round';
import type { Coins } from './games/coins';
import type { Colors } from './games/colors';
import type { King } from './games/king';
import type { Race } from './games/race';
import { overlaps } from '../engine/math';

export class Bot {
  private jumpHold = 0;
  private actT = 0;
  private wanderX = 640;
  private wanderT = 0;
  private stuckT = 0;
  private lastX = 0;
  private goal: import('./world').Solid | null = null;
  private goalT = 0;
  /** 0..1: how sharp the bot plays */
  constructor(
    public id: 0 | 1,
    public skill = 0.8,
  ) {}

  think(r: Round, dt: number, out: PadInput) {
    const me = r.players[this.id];
    const them = r.players[1 - this.id];
    out.left = out.right = out.action = false;
    if (!me.alive) {
      out.jump = false;
      return;
    }
    const g = r.cfg.game;
    const W = r.world;
    this.wanderT -= dt;
    let tx = me.cx;
    let wantUp = false;
    let force = false;
    const rng = r.rng;
    if (g === 'race') {
      tx = me.cx + 400;
      const race = r.game as Race;
      // wait for the piston to rise, wait at the gate for the button
      const pi = race.piston;
      if (me.cx < pi.x && me.cx > pi.x - 160 && (pi.y + pi.h > 470 || pi.dy > 0)) tx = pi.x - 120;
      if (race.gate && me.cx < race.gate.x && me.cx > race.gate.x - 300 && race.gate.y > 300) tx = race.button.x + 35;
    } else if (g === 'coins') {
      const c = (r.game as Coins).coins.filter((c) => c.alive && c.t >= 0).sort((a, b) => Math.hypot(a.x - me.cx, a.y - me.cy) - Math.hypot(b.x - me.cx, b.y - me.cy))[0];
      if (c) {
        tx = c.x;
        wantUp = c.y < me.y - 10;
      }
    } else if (g === 'king') {
      const z = (r.game as King).zone;
      tx = z.x + z.w / 2;
      wantUp = me.bottom > z.y + z.h + 4;
    } else if (g === 'colors') {
      const col = r.game as Colors;
      const safe = W.solids.filter((s) => s.solid && s.color >= 0 && (col.called < 0 || s.color === col.called));
      const best = safe.sort((a, b) => Math.abs(a.x + a.w / 2 - me.cx) + Math.abs(a.y - me.bottom) * 1.5 - (Math.abs(b.x + b.w / 2 - me.cx) + Math.abs(b.y - me.bottom) * 1.5))[0];
      if (best) {
        tx = best.x + best.w / 2;
        wantUp = best.y < me.bottom - 4;
      }
    } else if (g === 'lavaRush') {
      // commit to a platform above (chosen while standing), keep it until reached
      if (me.grounded && (!this.goal || !this.goal.solid || this.goal.y >= me.bottom - 4 || this.goalT <= 0)) {
        const above = W.solids.filter((s) => s.solid && s.y < me.bottom - 30 && s.y > me.bottom - 145);
        this.goal = above.sort((a, b) => Math.abs(a.x + a.w / 2 - me.cx) - Math.abs(b.x + b.w / 2 - me.cx))[0] ?? null;
        this.goalT = 2.5;
      }
      this.goalT -= dt;
      if (this.goal) {
        const gx = Math.max(this.goal.x + 20, Math.min(this.goal.x + this.goal.w - 20, me.cx));
        tx = Math.abs(gx - me.cx) < 1 ? this.goal.x + this.goal.w / 2 : gx;
        wantUp = this.goal.y < me.bottom - 4;
      }
    } else if (g === 'lastStanding') {
      // keep moving to solid tiles on this row (towards the rival), never stand still
      const row = W.solids.filter((s) => s.state === 'idle' && Math.abs(s.y - me.bottom) < 6);
      const want = them.alive ? them.cx : 640;
      const pick = row.sort((a, b) => Math.abs(a.x + a.w / 2 - want) - Math.abs(b.x + b.w / 2 - want)).find((s) => Math.abs(s.x + s.w / 2 - me.cx) > 30) ?? row[0];
      tx = pick ? pick.x + pick.w / 2 : 640;
      if (!pick) {
        const below = W.solids.filter((s) => s.state === 'idle' && s.y > me.bottom);
        if (below[0]) tx = below[0].x + below[0].w / 2;
      }
    } else if (g === 'knockout') {
      // go for the rival, but stay on the stage
      tx = them.alive ? them.cx : 640;
      if (tx < 300) tx = 300;
      if (tx > 980) tx = 980;
    } else if (g === 'dodge') {
      if (this.wanderT <= 0) {
        this.wanderT = rng.range(0.8, 1.6);
        this.wanderX = rng.range(200, 1080);
      }
      tx = this.wanderX;
      // jump over boulders and waves, away from lasers
      for (const pr of W.props) if (pr.alive && pr.kind === 'boulder' && Math.abs(pr.x - me.cx) < 170 && Math.abs(pr.y - me.cy) < 80) force = true;
      for (const z of W.zones) if (z.kind === 'laser' && (z.active || z.warn > 0) && z.tag === 'wave' && Math.abs(z.x - me.cx) < 120) force = true;
    }
    // drive
    const dx = tx - me.cx;
    if (Math.abs(dx) > 14 * (2 - this.skill)) {
      if (dx > 0) out.right = true;
      else out.left = true;
    }
    // jumping: walls, gaps, targets above, and a hold for height
    const ahead = { x: me.facing > 0 ? me.x + me.w + 2 : me.x - 24, y: me.y + 6, w: 22, h: me.h - 12 };
    const wall = W.solids.some((s) => s.solid && !s.oneway && overlaps(ahead, s));
    const footX = me.facing > 0 ? me.x + me.w + 26 : me.x - 26;
    const gap = me.grounded && (out.left || out.right) && W.groundBelow(footX, me.bottom - 2, 140) === null;
    this.stuckT = Math.abs(me.cx - this.lastX) < 0.5 && (out.left || out.right) ? this.stuckT + dt : 0;
    this.lastX = me.cx;
    const wantJump = wall || gap || force || (wantUp && Math.abs(dx) < 260) || this.stuckT > 0.5;
    if (this.jumpHold > 0) {
      this.jumpHold -= dt;
      out.jump = true;
    } else if (out.jump) out.jump = false;
    else if (wantJump && me.grounded) {
      out.jump = true;
      this.jumpHold = 0.3;
      this.stuckT = 0;
    }
    // shove when close
    this.actT -= dt;
    if (them.alive && this.actT <= 0 && Math.abs(them.cx - me.cx) < 90 && Math.abs(them.cy - me.cy) < 50 && rng.chance(this.skill)) {
      if (Math.sign(them.cx - me.cx) === me.facing) {
        out.action = true;
        this.actT = 0.9;
      }
    }
  }
}

/** Convenience for tests: who is who. */
export function botPlayer(p: Player) {
  return new Bot(p.id);
}
