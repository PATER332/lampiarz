// A player character: a platformer controller (acceleration, friction, coyote
// time, jump buffering, variable jump height, faster falling), the special
// action (a dash-shove on the ground, a slam in the air), collisions with the
// world, and the bumps, shoves and stomps between the two players.
import { approach, clamp, overlaps, type Rect } from '../engine/math';
import { STEP, type Solid, type World } from './world';

export interface PadInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  action: boolean;
}
export const NO_INPUT: PadInput = { left: false, right: false, jump: false, action: false };

export interface Tuning {
  maxSpeed: number;
  accel: number;
  airAccel: number;
  friction: number;
  airFriction: number;
  jumpV: number;
  gravityMul: number;
  fallMul: number;
  scale: number;
  /** multiplier for knockback dealt and received */
  knock: number;
  slippery: boolean;
  reversed: boolean;
}

export const BASE_TUNING: Tuning = {
  maxSpeed: 360,
  accel: 3000,
  airAccel: 1900,
  friction: 2800,
  airFriction: 700,
  jumpV: 860,
  gravityMul: 1,
  fallMul: 1.45,
  scale: 1,
  knock: 1,
  slippery: false,
  reversed: false,
};

export const BODY_W = 36;
export const BODY_H = 50;
const COYOTE = 0.11;
const BUFFER = 0.13;
const ACTION_BUFFER = 0.16;
const MAX_FALL = 1250;
const DASH_TIME = 0.16;
const DASH_SPEED = 780;

export class Player implements Rect {
  x = 0;
  y = 0;
  w = BODY_W;
  h = BODY_H;
  vx = 0;
  vy = 0;
  prevX = 0;
  prevY = 0;
  grounded = false;
  ground: Solid | null = null;
  coyote = 0;
  buffer = 0;
  jumpCut = false;
  facing: 1 | -1 = 1;
  stun = 0;
  invuln = 0;
  actionCd = 0;
  /** an action pressed a moment too early (cooldown, stun) still fires when it becomes possible */
  actionBuf = 0;
  dashT = 0;
  dashHit = false;
  slamming = false;
  airT = 0;
  /** still in the round (elimination games set it false) */
  alive = true;
  /** controls ignored (countdown, round over) */
  frozen = false;
  /** render state */
  runPhase = 0;
  landT = 0;
  jumpT = 0;
  hitT = 0;
  idleT = 0;
  blinkT = 2;
  winT = 0;
  lastHitBy = -1;
  lastHitAt = -99;
  /** seconds without real movement while pushing (unstick) */
  stuckT = 0;
  private prevIn: PadInput = { ...NO_INPUT };
  /** last input after reversal, for the renderer and tests */
  dir = 0;

  constructor(
    public id: 0 | 1,
    public name: string,
  ) {}

  get cx() {
    return this.x + this.w / 2;
  }
  get cy() {
    return this.y + this.h / 2;
  }
  get bottom() {
    return this.y + this.h;
  }

  /** Put the feet at (x, y). */
  place(x: number, feetY: number, facing: 1 | -1 = this.facing) {
    this.x = x - this.w / 2;
    this.y = feetY - this.h;
    this.vx = this.vy = 0;
    this.prevX = this.x;
    this.prevY = this.y;
    this.facing = facing;
    this.grounded = false;
    this.ground = null;
    this.stun = 0;
    this.dashT = 0;
    this.slamming = false;
    this.stuckT = 0;
  }

  /** Change the body size (giant / tiny) around the feet. */
  resize(scale: number) {
    const cx = this.cx;
    const b = this.bottom;
    this.w = BODY_W * scale;
    this.h = BODY_H * scale;
    this.x = cx - this.w / 2;
    this.y = b - this.h;
  }

  /**
   * One fixed step. `onAction` lets a minigame replace the special action;
   * it returns true if it handled the press.
   */
  step(dt: number, raw: PadInput, world: World, T: Tuning, onAction?: (p: Player) => boolean) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.stun = Math.max(0, this.stun - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.actionCd = Math.max(0, this.actionCd - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.jumpT = Math.max(0, this.jumpT - dt);
    this.hitT = Math.max(0, this.hitT - dt);
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 1.5 + ((this.id * 7 + world.time * 13) % 3);
    if (!this.alive) return;

    const input = this.frozen ? NO_INPUT : raw;
    const left = T.reversed ? input.right : input.left;
    const right = T.reversed ? input.left : input.right;
    const jumpPressed = input.jump && !this.prevIn.jump;
    const actionPressed = input.action && !this.prevIn.action;
    this.prevIn = { ...input };
    const canAct = this.stun <= 0;
    let dir = canAct ? (right ? 1 : 0) - (left ? 1 : 0) : 0;
    this.dir = dir;
    if (dir) this.facing = dir > 0 ? 1 : -1;

    // ride moving platforms
    if (this.grounded && this.ground && this.ground.solid) {
      this.x += this.ground.dx;
      this.y += this.ground.dy;
    }

    // horizontal control
    const slippery = T.slippery || !!(this.ground && this.ground.slippery && this.grounded);
    const accel = this.grounded ? T.accel : T.airAccel;
    const decel = this.grounded ? (slippery ? T.friction * 0.08 : T.friction) : T.airFriction;
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.facing * DASH_SPEED * (0.7 + 0.3 * T.scale);
      dir = 0;
      if (this.dashT <= 0) this.vx *= 0.45;
    } else if (dir !== 0) {
      const target = dir * T.maxSpeed;
      // knocked faster than you can run in your own direction: keep the momentum
      if (Math.sign(this.vx) === dir && Math.abs(this.vx) > T.maxSpeed) this.vx = approach(this.vx, target, decel * 0.5 * dt);
      else this.vx = approach(this.vx, target, (slippery ? accel * 0.35 : accel) * (Math.sign(this.vx) === -dir ? 1.6 : 1) * dt);
    } else {
      this.vx = approach(this.vx, 0, decel * dt);
    }
    this.vx += world.wind * (this.grounded ? 0.35 : 1) * dt;

    // jumping
    this.coyote = this.grounded ? COYOTE : this.coyote - dt;
    this.buffer = jumpPressed ? BUFFER : this.buffer - dt;
    if (this.buffer > 0 && this.coyote > 0 && canAct) {
      this.vy = -T.jumpV;
      this.grounded = false;
      this.ground = null;
      this.coyote = 0;
      this.buffer = 0;
      this.jumpCut = false;
      this.jumpT = 0.18;
      world.emit({ type: 'jump', p: this.id, x: this.cx, y: this.bottom });
    }
    if (!input.jump && this.vy < -120 && !this.jumpCut && !this.slamming) {
      this.vy *= 0.5;
      this.jumpCut = true;
    }

    // special action
    this.actionBuf = actionPressed ? ACTION_BUFFER : this.actionBuf - dt;
    if (this.actionBuf > 0 && canAct && this.actionCd <= 0) {
      this.actionBuf = 0;
      if (onAction?.(this)) {
        /* the minigame used it */
      } else if (this.grounded || this.airT < 0.18 || this.vy < -150) {
        this.dashT = DASH_TIME;
        this.dashHit = false;
        this.actionCd = 0.75;
        if (this.grounded) this.vy = -140;
        world.emit({ type: 'dash', p: this.id, x: this.cx, y: this.cy });
      } else {
        this.slamming = true;
        this.vy = 1150;
        this.vx *= 0.25;
        this.actionCd = 0.85;
        world.emit({ type: 'dash', p: this.id, x: this.cx, y: this.cy, power: -1 });
      }
    }

    // gravity
    const g = world.gravity * T.gravityMul * (this.vy > 0 ? T.fallMul : input.jump ? 1 : 1.2);
    if (this.dashT <= 0 || !this.grounded) this.vy += g * dt * (this.dashT > 0 ? 0.35 : 1);
    this.vy = Math.min(this.vy, this.slamming ? 1500 : MAX_FALL);

    // fans
    for (const z of world.zones) {
      if (!z.active || z.kind !== 'fan' || !overlaps(this, z)) continue;
      this.vx += z.dir[0] * z.power * dt;
      this.vy += z.dir[1] * z.power * dt;
      if (z.dir[1] < 0) this.vy = Math.max(this.vy, -900);
    }

    const wasGrounded = this.grounded;
    const impact = this.vy;
    this.moveX(dt, world);
    this.moveY(dt, world, T);
    this.unstick(world, dt);

    // walls of the arena
    const B = world.bounds;
    if (!B.openSides) {
      if (this.x < B.x) {
        this.x = B.x;
        if (this.vx < 0) this.vx = -this.vx * 0.3;
      } else if (this.x + this.w > B.x + B.w) {
        this.x = B.x + B.w - this.w;
        if (this.vx > 0) this.vx = -this.vx * 0.3;
      }
    }

    if (this.grounded) {
      this.airT = 0;
      if (!wasGrounded) {
        this.landT = 0.16;
        const power = clamp(impact / 1100, 0, 1);
        world.emit({ type: 'land', p: this.id, x: this.cx, y: this.bottom, power });
        if (this.slamming) world.emit({ type: 'slam', p: this.id, x: this.cx, y: this.bottom, power: 1 });
        this.slamming = false;
      }
      // pads
      for (const z of world.zones) {
        if (z.active && z.kind === 'pad' && overlaps(this, z)) this.vx = z.dir[0] * Math.max(Math.abs(this.vx), z.power);
      }
    } else this.airT += dt;

    // animation
    if (this.grounded && Math.abs(this.vx) > 20) this.runPhase += Math.abs(this.vx) * dt * 0.045;
    this.idleT = this.grounded && Math.abs(this.vx) < 20 ? this.idleT + dt : 0;
  }

  private moveX(dt: number, world: World) {
    this.x += this.vx * dt;
    for (const s of world.solids) {
      if (!s.solid || s.oneway || !overlaps(this, s)) continue;
      const sPrevX = s.x - s.dx;
      // a low ledge (a spring, a curb): step up onto it instead of stopping
      if (this.grounded && s.y >= this.y + this.h - 18 && s.y < this.y + this.h) {
        const oy = this.y;
        this.y = s.y - this.h;
        if (!world.solids.some((o) => o !== s && o.solid && !o.oneway && overlaps(this, o))) continue;
        this.y = oy;
      }
      if (this.prevX + this.w <= sPrevX + 0.6) {
        this.x = s.x - this.w;
        if (this.vx > 0) this.vx = 0;
      } else if (this.prevX >= sPrevX + s.w - 0.6) {
        this.x = s.x + s.w;
        if (this.vx < 0) this.vx = 0;
      }
    }
  }

  private moveY(dt: number, world: World, T: Tuning) {
    this.y += this.vy * dt;
    this.grounded = false;
    this.ground = null;
    for (const s of world.solids) {
      if (!s.solid || !overlaps(this, s)) continue;
      const sPrevY = s.y - s.dy;
      const prevBottom = this.prevY + this.h;
      if (prevBottom <= sPrevY + 0.6 + Math.max(0, s.dy) && this.vy >= -1) {
        this.y = s.y - this.h;
        this.land(s, world, T);
      } else if (!s.oneway && this.prevY >= sPrevY + s.h - 0.6 && this.vy < 0) {
        this.y = s.y + s.h;
        this.vy = 0;
      }
    }
    // stay glued to the floor (moving platforms going down, 1 px gaps)
    if (!this.grounded && this.vy >= 0) {
      for (const s of world.solids) {
        if (!s.solid) continue;
        if (this.x + this.w <= s.x || this.x >= s.x + s.w) continue;
        const gap = s.y - (this.y + this.h);
        if (gap >= -0.5 && gap <= 2.5 + Math.max(0, s.dy)) {
          this.y = s.y - this.h;
          this.land(s, world, T);
          break;
        }
      }
    }
  }

  private land(s: Solid, world: World, _T: Tuning) {
    if (s.spring > 0 && this.vy >= 0) {
      this.vy = -s.spring;
      this.jumpCut = true;
      this.slamming = false;
      s.squash = 1;
      world.emit({ type: 'spring', p: this.id, x: this.cx, y: s.y, power: s.spring });
      return;
    }
    this.vy = 0;
    this.grounded = true;
    this.ground = s;
    s.touched = true;
    if (s.crumble > 0 && s.state === 'idle' && !this.frozen) s.trigger();
  }

  /** Out of any solid it got pushed into (moving walls, respawning blocks).
   *  Tries the shortest way out that does not end inside another block. */
  private unstick(world: World, dt: number) {
    let stuck = false;
    for (const s of world.solids) {
      if (!s.solid || s.oneway || !overlaps(this, s)) continue;
      stuck = true;
      const cands: [number, number, number][] = [
        [this.y + this.h - s.y, this.x, s.y - this.h],
        [this.x + this.w - s.x, s.x - this.w, this.y],
        [s.x + s.w - this.x, s.x + s.w, this.y],
        [s.y + s.h - this.y, this.x, s.y + s.h],
      ];
      cands.sort((a, b) => a[0] - b[0]);
      const ox = this.x;
      const oy = this.y;
      let done = false;
      for (const [, nx, ny] of cands) {
        this.x = nx;
        this.y = ny;
        if (!world.solids.some((o) => o !== s && o.solid && !o.oneway && overlaps(this, o))) {
          done = true;
          break;
        }
      }
      if (!done) {
        this.x = ox;
        this.y = oy;
      } else if (this.y < oy) this.vy = Math.min(this.vy, 0);
    }
    if (stuck && world.solids.some((s) => s.solid && !s.oneway && overlaps(this, s))) {
      this.stuckT += dt;
      if (this.stuckT > 0.25) this.y -= 4;
    } else this.stuckT = 0;
  }

  /** Knock the player away (shoves, slams, bombs, blasts). */
  knock(vx: number, vy: number, stun: number, by = -1, time = 0) {
    if (this.invuln > 0 || !this.alive) return false;
    this.vx = vx;
    this.vy = Math.min(this.vy, vy);
    this.stun = Math.max(this.stun, stun);
    this.hitT = 0.3;
    this.grounded = false;
    this.ground = null;
    this.dashT = 0;
    this.slamming = false;
    if (by >= 0) {
      this.lastHitBy = by;
      this.lastHitAt = time;
    }
    return true;
  }
}

/** Bumps, shoves, stomps and slams between the two players. Returns hits for the minigame. */
export function interact(a: Player, b: Player, world: World, T: [Tuning, Tuning], knockScale: [number, number]) {
  const hits: { attacker: number; victim: number; kind: 'shove' | 'stomp' | 'slam'; power: number }[] = [];
  if (!a.alive || !b.alive) return hits;
  const pair: [Player, Player][] = [
    [a, b],
    [b, a],
  ];
  // dash-shoves (a slightly longer reach than the body)
  for (const [p, q] of pair) {
    if (p.dashT <= 0 || p.dashHit) continue;
    const reach = { x: p.x + (p.facing > 0 ? 6 : -14), y: p.y + 4, w: p.w + 8, h: p.h - 8 };
    if (!overlaps(reach, q)) continue;
    p.dashHit = true;
    const k = knockScale[q.id] * T[p.id].knock * (T[p.id].scale > 1.1 ? 1.25 : T[p.id].scale < 0.9 ? 0.8 : 1);
    if (q.knock(p.facing * 640 * k, -420 * Math.min(1.6, k), 0.38, p.id, world.time)) {
      p.vx = -p.facing * 120;
      p.dashT = 0;
      world.emit({ type: 'hit', p: q.id, by: p.id, x: (p.cx + q.cx) / 2, y: q.cy, power: k });
      hits.push({ attacker: p.id, victim: q.id, kind: 'shove', power: k });
    }
  }
  // stomps and bumps
  if (overlaps(a, b)) {
    const top = a.cy < b.cy ? a : b;
    const bot = top === a ? b : a;
    const overlapY = top.y + top.h - bot.y;
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    if (top.vy - bot.vy > 120 && overlapY < 22 && overlapY < overlapX) {
      // landed on the other one's head
      top.y = bot.y - top.h;
      top.vy = top.slamming ? -620 : -760;
      top.jumpCut = true;
      const was = top.slamming;
      top.slamming = false;
      const k = knockScale[bot.id] * (was ? 1.4 : 1);
      if (bot.invuln <= 0) {
        bot.stun = Math.max(bot.stun, was ? 0.6 : 0.3);
        bot.hitT = 0.3;
        bot.lastHitBy = top.id;
        bot.lastHitAt = world.time;
        if (was) bot.knock((bot.cx < top.cx ? -1 : 1) * 380 * k, -300, 0.6, top.id, world.time);
        world.emit({ type: 'stomp', p: bot.id, by: top.id, x: bot.cx, y: bot.y, power: k });
        hits.push({ attacker: top.id, victim: bot.id, kind: 'stomp', power: k });
      }
    } else if (overlapX > 0) {
      // rubbery bump: separate and trade momentum
      const l = a.cx < b.cx ? a : b;
      const r = l === a ? b : a;
      const push = overlapX / 2 + 0.01;
      l.x -= push;
      r.x += push;
      const rel = l.vx - r.vx;
      if (rel > 0) {
        const lv = l.vx;
        l.vx = r.vx * 0.85 - 90;
        r.vx = lv * 0.85 + 90;
        if (rel > 380) world.emit({ type: 'sfx', name: 'bump', x: (l.cx + r.cx) / 2, y: l.cy, vol: Math.min(1, rel / 900) });
      }
    }
  }
  return hits;
}

/** The ground shockwave of a slam: knocks a standing opponent nearby into the air. */
export function slamWave(p: Player, q: Player, world: World, knock: number) {
  if (!q.alive || q.invuln > 0) return false;
  const dx = q.cx - p.cx;
  if (Math.abs(dx) > 150 * Math.max(0.8, p.w / BODY_W) || Math.abs(q.bottom - p.bottom) > 40 || !q.grounded) return false;
  const k = knock * (1 - Math.abs(dx) / 200);
  q.knock(Math.sign(dx || 1) * 420 * k, -560 * k, 0.45, p.id, world.time);
  world.emit({ type: 'hit', p: q.id, by: p.id, x: q.cx, y: q.bottom, power: k });
  return true;
}

export { STEP };
