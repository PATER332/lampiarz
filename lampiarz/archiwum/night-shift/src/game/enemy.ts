// "Przestój" — the facility's only inhabitant besides the player.
// A deterministic state machine driven by sight, hearing, light and the story phase.
// It never appears out of thin air: it travels through ventilation shafts and the
// vents rattle before it climbs out.
import { clamp, dist2d, Rng, wrapAngle } from '../engine/math';
import { CELL, VENTS, type DoorDef } from '../world/map';
import { pushOut, type Level } from '../world/level';

export type EnemyState = 'hidden' | 'emerging' | 'patrol' | 'investigate' | 'notice' | 'chase' | 'search' | 'lost' | 'retreat' | 'scripted' | 'lockerHunt';

export interface EnemyHost {
  level: Level;
  time: number;
  /** 0 = inactive, 1 = rare patrols, 2 = hunting, 3 = final sequence */
  phase(): number;
  player: { x: number; z: number; yaw: number; pitch: number; hidden: boolean; crouch: boolean; sprinting: boolean; lockerX: number; lockerZ: number };
  flashlightOn(): boolean;
  /** brightness of fixed lighting at a point, 0..1 */
  lit(x: number, z: number): number;
  doorPassable(d: DoorDef): boolean;
  doorOpen(d: DoorDef): boolean;
  openDoor(d: DoorDef): void;
  closedDoorAt(cx: number, cz: number): boolean;
  propBoxes: { x0: number; x1: number; z0: number; z1: number }[];
  enemySfx(name: 'enemyStep' | 'ventRattle' | 'ventExit' | 'ventEnter' | 'notice' | 'screech' | 'lockerRip', x: number, z: number): void;
  onChaseStart(): void;
  onBurn(): void;
  catchPlayer(): void;
}

const PARAMS = [
  { hide: [9999, 9999], roam: 0, walk: 0, chase: 0 },
  { hide: [38, 70], roam: 45, walk: 1.15, chase: 3.2 },
  { hide: [18, 36], roam: 60, walk: 1.35, chase: 3.55 },
  { hide: [3, 6], roam: 999, walk: 1.6, chase: 3.8 },
];

export class Enemy {
  x = -100;
  z = -100;
  yaw = 0;
  state: EnemyState = 'hidden';
  stateT = 0;
  hiddenFor = 20;
  path: [number, number][] = [];
  repathT = 0;
  lastKnown: [number, number] = [0, 0];
  alert = 0;
  burn = 0;
  chaseLightT = 0;
  stepAcc = 0;
  anim = 0;
  speed = 0;
  roamT = 0;
  doorWait = 0;
  stuckT = 0;
  lastPos: [number, number] = [0, 0];
  sawLocker = false;
  scripted: [number, number][] = [];
  noiseQueue: { x: number; z: number; r: number }[] = [];
  /** for the renderer: 0..1 how "twitchy" the pose is */
  twitch = 0;

  constructor(public rng: Rng) {}

  get visible() {
    return this.state !== 'hidden' && this.state !== 'emerging';
  }
  get hunting() {
    return this.state === 'chase' || this.state === 'notice' || this.state === 'lockerHunt';
  }

  set(s: EnemyState) {
    this.state = s;
    this.stateT = 0;
  }

  hear(x: number, z: number, r: number) {
    this.noiseQueue.push({ x, z, r });
  }

  /** Scripted first appearance: walk a fixed route, then vanish into a vent. */
  playScript(route: [number, number][]) {
    this.x = route[0][0];
    this.z = route[0][1];
    this.scripted = route.slice(1);
    this.set('scripted');
  }

  /** Force a quick emergence near the player (final sequences). */
  summon(host: EnemyHost) {
    if (this.visible) {
      if (!this.hunting) this.goTo(host, host.player.x, host.player.z, 'investigate');
      return;
    }
    this.hiddenFor = Math.min(this.hiddenFor, this.stateT + 2);
  }

  reset() {
    this.x = this.z = -100;
    this.path = [];
    this.alert = 0;
    this.set('hidden');
    this.hiddenFor = 20;
  }

  // ------------------------------------------------------------------ update
  update(dt: number, h: EnemyHost) {
    this.stateT += dt;
    this.anim += dt;
    this.twitch = Math.max(0, this.twitch - dt);
    const ph = h.phase();
    const P = PARAMS[ph];
    const p = h.player;
    const d = dist2d(this.x, this.z, p.x, p.z);

    if (this.state === 'scripted') {
      this.speed = 1.5;
      if (!this.follow(dt, h, this.scripted)) {
        this.enterVent(h);
      }
      return;
    }

    if (ph === 0) {
      if (this.visible) this.enterVent(h);
      this.noiseQueue = [];
      return;
    }

    switch (this.state) {
      case 'hidden':
        this.noiseQueue = [];
        if (this.stateT >= this.hiddenFor) this.chooseVent(h);
        return;
      case 'emerging':
        if (this.stateT > 2.4) {
          h.enemySfx('ventExit', this.x, this.z);
          this.roamT = ph === 3 ? 999 : P.roam;
          this.goTo(h, p.x + this.rng.range(-8, 8), p.z + this.rng.range(-8, 8), ph >= 2 ? 'investigate' : 'patrol');
        }
        return;
    }

    // ---- perception
    const sees = this.canSee(h, d);
    if (sees) {
      this.lastKnown = [p.x, p.z];
      const rate = d < 5 ? 3 : d < 10 ? 1.4 : 0.8;
      this.alert = clamp(this.alert + dt * rate * (ph === 3 ? 2 : 1), 0, 1.2);
    } else this.alert = Math.max(0, this.alert - dt * 0.25);

    // hearing
    for (const n of this.noiseQueue) {
      const nd = dist2d(this.x, this.z, n.x, n.z);
      if (nd < n.r && !this.hunting) {
        this.lastKnown = [n.x, n.z];
        this.goTo(h, n.x, n.z, 'investigate');
        if (nd < n.r * 0.4) this.alert = Math.min(1, this.alert + 0.35);
      }
    }
    this.noiseQueue = [];

    // flashlight held on it makes it recoil
    if (this.inBeam(h, d)) {
      this.burn += dt;
      this.twitch = 0.3;
      if (this.burn > 1.1) {
        this.burn = 0;
        h.onBurn();
        h.enemySfx('screech', this.x, this.z);
        this.alert = 0;
        this.retreat(h);
        return;
      }
    } else this.burn = Math.max(0, this.burn - dt * 0.5);

    if (!this.hunting && this.alert >= 1 && !p.hidden) {
      this.set('notice');
      h.enemySfx('notice', this.x, this.z);
      this.twitch = 0.8;
    }

    switch (this.state) {
      case 'notice':
        this.face(p.x, p.z, dt * 6);
        if (this.stateT > 0.7) {
          this.set('chase');
          this.chaseLightT = 0;
          this.repathT = 0;
          h.onChaseStart();
        }
        break;
      case 'chase': {
        this.speed = P.chase;
        if (p.hidden) {
          // it saw where you went
          if (this.sawLocker) {
            this.set('lockerHunt');
            this.path = h.level.path(this.x, this.z, p.lockerX, p.lockerZ, (dd) => h.doorPassable(dd)) ?? [];
            break;
          }
          this.goTo(h, this.lastKnown[0], this.lastKnown[1], 'search');
          break;
        }
        if (h.lit(this.x, this.z) > 0.55 && ph < 3) {
          this.chaseLightT += dt;
          this.speed *= 0.7;
          if (this.chaseLightT > 3.2) {
            this.retreat(h);
            break;
          }
        }
        if (d < 0.95) {
          h.catchPlayer();
          this.set('lost');
          break;
        }
        this.repathT -= dt;
        if (sees && d < 6 && h.level.lineClear(this.x, this.z, p.x, p.z, (cx, cz) => h.closedDoorAt(cx, cz))) {
          this.path = [[p.x, p.z]];
        } else if (this.repathT <= 0) {
          this.repathT = 0.45;
          const tx = sees ? p.x : this.lastKnown[0];
          const tz = sees ? p.z : this.lastKnown[1];
          this.path = h.level.path(this.x, this.z, tx, tz, (dd) => h.doorPassable(dd)) ?? [];
          if (this.path.length) this.path[this.path.length - 1] = [tx, tz];
        }
        if (!this.follow(dt, h, this.path) && !sees) this.set('search');
        if (!sees && this.stateT > 1 && dist2d(this.x, this.z, this.lastKnown[0], this.lastKnown[1]) < 1.2) this.set('search');
        break;
      }
      case 'lockerHunt':
        this.speed = P.chase * 0.8;
        if (!p.hidden) {
          this.set('chase');
          break;
        }
        if (!this.follow(dt, h, this.path) || dist2d(this.x, this.z, p.lockerX, p.lockerZ) < 1.3) {
          h.enemySfx('lockerRip', p.lockerX, p.lockerZ);
          h.catchPlayer();
          this.set('lost');
        }
        break;
      case 'investigate':
      case 'patrol':
        this.speed = this.state === 'investigate' ? P.walk * 1.35 : P.walk;
        this.roamT -= dt;
        if (!this.follow(dt, h, this.path, true)) {
          if (this.state === 'investigate') this.set('search');
          else if (this.roamT <= 0) this.leave(h);
          else this.pickPatrol(h);
        }
        if (this.roamT <= 0 && this.state === 'patrol' && ph < 3) this.leave(h);
        break;
      case 'search':
        this.speed = P.walk;
        if (!this.follow(dt, h, this.path, true)) {
          if (this.stateT > (ph === 3 ? 12 : 9)) {
            if (ph === 3) this.goTo(h, p.x, p.z, 'investigate');
            else this.leave(h);
          } else {
            const a = this.rng.range(0, Math.PI * 2);
            this.goTo(h, this.lastKnown[0] + Math.cos(a) * 4, this.lastKnown[1] + Math.sin(a) * 4, 'search', false);
          }
        }
        break;
      case 'lost':
      case 'retreat':
        this.speed = this.state === 'retreat' ? P.chase : P.walk;
        if (!this.follow(dt, h, this.path)) this.enterVent(h);
        break;
    }
    this.checkStuck(dt, h);
  }

  // ------------------------------------------------------------------ senses
  canSee(h: EnemyHost, d: number): boolean {
    const p = h.player;
    if (p.hidden) return false;
    let range = 13;
    if (h.flashlightOn()) range += 8;
    const lit = h.lit(p.x, p.z);
    range += lit * 6;
    if (p.crouch && !h.flashlightOn() && lit < 0.3) range = 4.5;
    if (h.phase() === 3) range += 4;
    if (d > range) return false;
    const ang = Math.atan2(-(p.x - this.x), -(p.z - this.z));
    const fov = d < 3 ? Math.PI : this.hunting ? Math.PI * 0.9 : Math.PI * 0.6;
    if (Math.abs(wrapAngle(ang - this.yaw)) > fov / 2) return false;
    return h.level.lineClear(this.x, this.z, p.x, p.z, (cx, cz) => h.closedDoorAt(cx, cz));
  }

  inBeam(h: EnemyHost, d: number) {
    const p = h.player;
    if (!h.flashlightOn() || d > 8.5 || p.hidden) return false;
    const ang = Math.atan2(-(this.x - p.x), -(this.z - p.z));
    if (Math.abs(wrapAngle(ang - p.yaw)) > 0.26) return false;
    if (Math.abs(p.pitch) > 0.6) return false;
    return h.level.lineClear(p.x, p.z, this.x, this.z, (cx, cz) => h.closedDoorAt(cx, cz));
  }

  // ------------------------------------------------------------------ movement
  face(tx: number, tz: number, k: number) {
    const target = Math.atan2(-(tx - this.x), -(tz - this.z));
    this.yaw += clamp(wrapAngle(target - this.yaw), -k, k);
  }

  goTo(h: EnemyHost, tx: number, tz: number, state: EnemyState, reset = true) {
    const cx = Math.floor(tx / CELL);
    const cz = Math.floor(tz / CELL);
    if (h.level.isSolid(cx, cz)) {
      tx = this.lastKnown[0];
      tz = this.lastKnown[1];
    }
    const path = h.level.path(this.x, this.z, tx, tz, (d) => h.doorPassable(d));
    if (reset || this.state !== state) this.set(state);
    this.path = path ?? [];
  }

  pickPatrol(h: EnemyHost) {
    const p = h.player;
    for (let i = 0; i < 8; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(6, 16);
      const tx = p.x + Math.cos(a) * r;
      const tz = p.z + Math.sin(a) * r;
      if (h.level.isSolid(Math.floor(tx / CELL), Math.floor(tz / CELL))) continue;
      if (h.lit(tx, tz) > 0.6 && h.phase() < 3) continue;
      this.goTo(h, tx, tz, 'patrol', false);
      if (this.path.length) return;
    }
    this.leave(h);
  }

  /** Follow waypoints. Returns false when the path is exhausted. */
  follow(dt: number, h: EnemyHost, path: [number, number][], avoidLight = false): boolean {
    if (!path.length) return false;
    if (this.doorWait > 0) {
      this.doorWait -= dt;
      return true;
    }
    const [tx, tz] = path[0];
    // closed door on the way: stop, open it (noisily)
    const cx = Math.floor(tx / CELL);
    const cz = Math.floor(tz / CELL);
    const door = h.level.doorAtCell(cx, cz);
    if (door && !h.doorOpen(door) && dist2d(this.x, this.z, tx, tz) < 2.2) {
      if (!h.doorPassable(door)) {
        path.length = 0;
        return false;
      }
      h.openDoor(door);
      this.doorWait = 0.9;
      return true;
    }
    if (avoidLight && h.phase() < 3 && h.lit(tx, tz) > 0.7 && path.length > 1) {
      // it does not linger in bright rooms: turn back
      path.length = 0;
      return false;
    }
    const d = dist2d(this.x, this.z, tx, tz);
    const step = this.speed * dt;
    this.face(tx, tz, dt * 5);
    if (d <= Math.max(step, 0.15)) {
      this.x = tx;
      this.z = tz;
      path.shift();
    } else {
      this.x += ((tx - this.x) / d) * step;
      this.z += ((tz - this.z) / d) * step;
    }
    for (const b of h.propBoxes) {
      const r = pushOut(this.x, this.z, 0.32, b);
      if (r) {
        this.x = r[0];
        this.z = r[1];
      }
    }
    this.stepAcc += step;
    if (this.stepAcc > (this.speed > 2.5 ? 1.05 : 0.8)) {
      this.stepAcc = 0;
      h.enemySfx('enemyStep', this.x, this.z);
    }
    return path.length > 0;
  }

  checkStuck(dt: number, h: EnemyHost) {
    this.stuckT += dt;
    if (this.stuckT < 1.6) return;
    const moved = dist2d(this.x, this.z, this.lastPos[0], this.lastPos[1]);
    this.stuckT = 0;
    this.lastPos = [this.x, this.z];
    if (moved < 0.15 && this.speed > 0 && this.path.length && this.doorWait <= 0) {
      this.path.shift();
      if (!this.path.length && !this.hunting) this.leave(h);
    }
  }

  nearestVent(x: number, z: number) {
    let best = VENTS[0];
    let bd = Infinity;
    for (const v of VENTS) {
      const d = dist2d(x, z, v.x, v.z);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  leave(h: EnemyHost) {
    const v = this.nearestVent(this.x, this.z);
    this.goTo(h, v.x, v.z, 'lost');
    this.path.push([v.x, v.z]);
  }

  retreat(h: EnemyHost) {
    // flee to the vent farthest from the player among the two nearest to the enemy
    const p = h.player;
    const sorted = [...VENTS].sort((a, b) => dist2d(this.x, this.z, a.x, a.z) - dist2d(this.x, this.z, b.x, b.z)).slice(0, 3);
    sorted.sort((a, b) => dist2d(p.x, p.z, b.x, b.z) - dist2d(p.x, p.z, a.x, a.z));
    const v = sorted[0];
    this.goTo(h, v.x, v.z, 'retreat');
    this.path.push([v.x, v.z]);
  }

  enterVent(h: EnemyHost) {
    if (this.visible) h.enemySfx('ventEnter', this.x, this.z);
    const P = PARAMS[Math.max(1, h.phase())];
    this.set('hidden');
    this.hiddenFor = this.rng.range(P.hide[0], P.hide[1]);
    this.x = this.z = -100;
    this.path = [];
    this.alert = 0;
    this.sawLocker = false;
  }

  chooseVent(h: EnemyHost) {
    const p = h.player;
    const ph = h.phase();
    const options = VENTS.filter((v) => {
      const d = dist2d(v.x, v.z, p.x, p.z);
      return d > (ph === 3 ? 9 : 12) && d < (ph === 3 ? 30 : 38);
    });
    const unseen = options.filter((v) => !h.level.lineClear(v.x, v.z, p.x, p.z, (cx, cz) => h.closedDoorAt(cx, cz)));
    const pool = unseen.length ? unseen : options;
    if (!pool.length) {
      this.hiddenFor = this.stateT + 6;
      return;
    }
    const v = ph >= 2 ? pool.sort((a, b) => dist2d(a.x, a.z, p.x, p.z) - dist2d(b.x, b.z, p.x, p.z))[0] : this.rng.pick(pool);
    this.x = v.x;
    this.z = v.z;
    this.lastPos = [v.x, v.z];
    this.lastKnown = [p.x, p.z];
    this.set('emerging');
    h.enemySfx('ventRattle', v.x, v.z);
  }

  /** Called when the player gets into a locker: if it was watching, it remembers. */
  playerHid(h: EnemyHost) {
    const p = h.player;
    const d = dist2d(this.x, this.z, p.x, p.z);
    this.sawLocker = this.hunting && d < 7.5 && h.level.lineClear(this.x, this.z, p.x, p.z, (cx, cz) => h.closedDoorAt(cx, cz));
  }
}
