// The physical world of one round: solid blocks (static, moving, crumbling,
// springs), zones (lava, fans, speed pads, buttons…), loose objects (balls,
// bombs, anvils) and the event queue that the renderer and audio consume.
//
// The simulation runs at a fixed step (see STEP). Bodies never move more than a
// few pixels per step, and every solid is at least 16 px thick, so nothing can
// tunnel through the floor.
import { clamp, type Rect, Rng } from '../engine/math';

export const STEP = 1 / 120;

export type SolidStyle = 'ground' | 'platform' | 'wall' | 'tile' | 'metal' | 'crate' | 'spring' | 'gate' | 'pillar';

export interface SolidOpts {
  oneway?: boolean;
  style?: SolidStyle;
  /** palette slot used by the theme (0..3) */
  tint?: number;
  /** spring: launch speed when landed on */
  spring?: number;
  /** crumbles this many seconds after someone stands on it */
  crumble?: number;
  /** comes back after this many seconds (crumbling and vanishing blocks) */
  respawn?: number;
  /** moving block: position as a function of round time */
  path?: (t: number) => [number, number];
  slippery?: boolean;
  tag?: string;
}

export type CrumbleState = 'idle' | 'warn' | 'fall' | 'gone';

export class Solid implements Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
  /** displacement during the last step (moving blocks carry what stands on them) */
  dx = 0;
  dy = 0;
  oneway: boolean;
  style: SolidStyle;
  tint: number;
  spring: number;
  crumble: number;
  respawn: number;
  path?: (t: number) => [number, number];
  slippery: boolean;
  tag: string;
  state: CrumbleState = 'idle';
  stateT = 0;
  /** render helpers */
  alpha = 1;
  shake = 0;
  squash = 0;
  fallV = 0;
  /** collidable at all (gates, vanished blocks) */
  active = true;
  /** someone touched it this step */
  touched = false;
  /** colour key for the "floor is lava" colour calls */
  color = -1;

  constructor(x: number, y: number, w: number, h: number, o: SolidOpts = {}) {
    this.x = this.ox = x;
    this.y = this.oy = y;
    this.w = w;
    this.h = h;
    this.oneway = !!o.oneway;
    this.style = o.style ?? (o.oneway ? 'platform' : 'ground');
    this.tint = o.tint ?? 0;
    this.spring = o.spring ?? 0;
    this.crumble = o.crumble ?? 0;
    this.respawn = o.respawn ?? 0;
    this.path = o.path;
    this.slippery = !!o.slippery;
    this.tag = o.tag ?? '';
  }
  get solid() {
    return this.active && (this.state === 'idle' || this.state === 'warn');
  }
  /** start crumbling (once) */
  trigger(delay = this.crumble) {
    if (this.state !== 'idle' || !this.active) return;
    this.state = 'warn';
    this.stateT = 0;
    this.crumble = delay;
  }
  /** make it vanish now (and come back after `respawn`, if set) */
  drop() {
    if (this.state === 'fall' || this.state === 'gone') return;
    this.state = 'fall';
    this.stateT = 0;
    this.fallV = 0;
  }
}

export type ZoneKind = 'lava' | 'spikes' | 'laser' | 'fan' | 'pad' | 'button' | 'goal' | 'hill' | 'water';

export class Zone implements Rect {
  active = true;
  /** for buttons: pressed this step / ever */
  pressed = false;
  /** for lasers & telegraphed hazards: 0..1 warning before it turns active */
  warn = 0;
  t = 0;
  constructor(
    public x: number,
    public y: number,
    public w: number,
    public h: number,
    public kind: ZoneKind,
    /** fans: acceleration (px/s²) along dir; pads: speed boost */
    public power = 0,
    /** direction: fans [dx, dy] unit vector; pads [±1, 0] */
    public dir: [number, number] = [0, -1],
    public tag = '',
  ) {}
}

export type PropKind = 'ball' | 'bomb' | 'anvil' | 'boulder' | 'spikeball' | 'crate';

export class Prop {
  vx = 0;
  vy = 0;
  rot = 0;
  spin = 0;
  alive = true;
  t = 0;
  /** seconds until it explodes / disappears (0 = never) */
  ttl = 0;
  grounded = false;
  constructor(
    public kind: PropKind,
    public x: number,
    public y: number,
    public r: number,
    /** bounciness 0..1 */
    public bounce = 0.4,
    /** hurts players on contact (anvils, spike balls, boulders) */
    public hurts = false,
    public gravity = 1,
  ) {}
}

export type SimEvent =
  | { type: 'jump' | 'land' | 'spring' | 'shove' | 'slam' | 'whiff' | 'respawn' | 'fall' | 'stun' | 'dash'; p: number; x: number; y: number; power?: number }
  | { type: 'hit' | 'stomp'; p: number; by: number; x: number; y: number; power: number }
  | { type: 'crumble' | 'vanish' | 'appear'; x: number; y: number; w: number; h: number }
  | { type: 'explode' | 'impact' | 'thud' | 'warn' | 'blast'; x: number; y: number; power: number }
  | { type: 'coin' | 'coinDrop'; p: number; x: number; y: number; n: number }
  | { type: 'button' | 'gate'; x: number; y: number; on: boolean }
  | { type: 'score'; p: number; x: number; y: number; text: string }
  | { type: 'hurt'; p: number; x: number; y: number }
  | { type: 'sfx'; name: string; x?: number; y?: number; vol?: number }
  | { type: 'shake'; power: number }
  | { type: 'text'; text: string; x: number; y: number; color?: string };

export interface WorldBounds {
  /** playable area (the camera stays inside) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** below this a body has fallen out */
  killY: number;
  /** left/right walls of the arena (bodies cannot leave sideways) unless open */
  openSides?: boolean;
}

export class World {
  solids: Solid[] = [];
  zones: Zone[] = [];
  props: Prop[] = [];
  events: SimEvent[] = [];
  /** events of the current fixed step only */
  fresh: SimEvent[] = [];
  time = 0;
  gravity = 2300;
  /** global wind (modifier) in px/s² */
  wind = 0;
  constructor(
    public bounds: WorldBounds,
    public rng: Rng,
  ) {}

  add(s: Solid) {
    this.solids.push(s);
    return s;
  }
  block(x: number, y: number, w: number, h: number, o: SolidOpts = {}) {
    return this.add(new Solid(x, y, w, h, o));
  }
  zone(z: Zone) {
    this.zones.push(z);
    return z;
  }
  prop(p: Prop) {
    this.props.push(p);
    return p;
  }
  emit(e: SimEvent) {
    this.fresh.push(e);
    // the queue is drained every rendered frame; this guards a stalled tab
    if (this.events.length < 400) this.events.push(e);
  }

  /** Move solids along their paths, run crumbling and respawning. */
  stepSolids(dt: number, occupied: (r: Rect) => boolean) {
    for (const s of this.solids) {
      s.dx = s.dy = 0;
      s.shake = Math.max(0, s.shake - dt * 3);
      s.squash = Math.max(0, s.squash - dt * 4);
      if (s.path && s.active) {
        const [nx, ny] = s.path(this.time);
        s.dx = nx - s.x;
        s.dy = ny - s.y;
        s.x = nx;
        s.y = ny;
      }
      if (s.state === 'warn') {
        s.stateT += dt;
        s.shake = Math.min(1, s.stateT / Math.max(0.05, s.crumble));
        if (s.stateT >= s.crumble) {
          s.state = 'fall';
          s.stateT = 0;
          s.fallV = 0;
          this.emit({ type: 'crumble', x: s.x, y: s.y, w: s.w, h: s.h });
        }
      } else if (s.state === 'fall') {
        s.stateT += dt;
        s.fallV += this.gravity * 0.6 * dt;
        s.y += s.fallV * dt;
        s.alpha = Math.max(0, 1 - s.stateT / 0.9);
        if (s.stateT > 0.9) {
          s.state = 'gone';
          s.stateT = 0;
        }
      } else if (s.state === 'gone') {
        s.stateT += dt;
        if (s.respawn > 0 && s.stateT >= s.respawn) {
          const back = { x: s.ox, y: s.oy, w: s.w, h: s.h };
          if (!occupied(back)) {
            s.x = s.ox;
            s.y = s.oy;
            s.state = 'idle';
            s.alpha = 1;
            this.emit({ type: 'appear', x: s.x, y: s.y, w: s.w, h: s.h });
          }
        }
      }
    }
    for (const z of this.zones) z.t += dt;
  }

  /** Loose objects: gravity, solids, bounce. */
  stepProps(dt: number) {
    for (const p of this.props) {
      if (!p.alive) continue;
      p.t += dt;
      p.vy += this.gravity * p.gravity * dt;
      p.vx += this.wind * 0.25 * dt;
      p.vx = clamp(p.vx, -1400, 1400);
      p.vy = clamp(p.vy, -1600, 1500);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += (p.spin || p.vx / Math.max(4, p.r)) * dt;
      p.grounded = false;
      for (const s of this.solids) {
        if (!s.solid) continue;
        const cx = clamp(p.x, s.x, s.x + s.w);
        const cy = clamp(p.y, s.y, s.y + s.h);
        const ddx = p.x - cx;
        const ddy = p.y - cy;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= p.r * p.r) continue;
        if (s.oneway && (p.vy < 0 || p.y - s.dy > s.y + 2)) continue;
        let nx: number;
        let ny: number;
        let d = Math.sqrt(d2);
        if (d < 1e-4) {
          // centre inside the block: push out upwards
          nx = 0;
          ny = -1;
          d = 0;
          p.y = s.y - p.r;
        } else {
          nx = ddx / d;
          ny = ddy / d;
          p.x = cx + nx * p.r;
          p.y = cy + ny * p.r;
        }
        const vn = p.vx * nx + p.vy * ny;
        if (vn < 0) {
          if (-vn > 260 && (p.kind === 'anvil' || p.kind === 'boulder' || p.kind === 'crate')) this.emit({ type: 'thud', x: p.x, y: p.y + p.r, power: Math.min(1, -vn / 900) });
          p.vx -= (1 + p.bounce) * vn * nx;
          p.vy -= (1 + p.bounce) * vn * ny;
        }
        if (ny < -0.6) {
          p.grounded = true;
          p.vx *= 1 - Math.min(1, dt * (p.kind === 'ball' ? 0.6 : 2.5));
          p.x += s.dx;
          p.y += s.dy;
        }
      }
      if (p.ttl > 0 && p.t >= p.ttl) {
        p.alive = false;
        if (p.kind === 'bomb') this.emit({ type: 'explode', x: p.x, y: p.y, power: 1 });
      }
      if (p.y > this.bounds.killY + 200) p.alive = false;
      if (!this.bounds.openSides) {
        if (p.x < this.bounds.x + p.r) {
          p.x = this.bounds.x + p.r;
          p.vx = Math.abs(p.vx) * p.bounce;
        } else if (p.x > this.bounds.x + this.bounds.w - p.r) {
          p.x = this.bounds.x + this.bounds.w - p.r;
          p.vx = -Math.abs(p.vx) * p.bounce;
        }
      }
    }
    if (this.props.length > 40) this.props = this.props.filter((p) => p.alive);
  }

  /** A point standing on solid ground? (spawning helpers) */
  groundBelow(x: number, y: number, maxDrop = 2000): number | null {
    let best: number | null = null;
    for (const s of this.solids) {
      if (!s.solid) continue;
      if (x < s.x || x > s.x + s.w) continue;
      if (s.y < y - 1) continue;
      if (s.y - y > maxDrop) continue;
      if (best === null || s.y < best) best = s.y;
    }
    return best;
  }
}
