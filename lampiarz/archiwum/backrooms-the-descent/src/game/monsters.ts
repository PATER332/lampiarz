// The three kinds of things that live in the Backrooms. One state machine with
// per-kind parameters and behaviour hooks. They perceive only through sight
// (field of view, distance, light, line of sight) and hearing (noise events),
// travel along grid paths, open only ordinary doors, and enter or leave the
// play area through ventilation shafts that the player can see and hear.
import { clamp, dist2d, Rng, wrapAngle } from '../engine/math';
import { pushOut, type Level } from '../world/level';
import { CELL, VENTS, type DoorDef, type ZoneId } from '../world/map';
import type { DiffParams } from './story';

export type MonsterType = 'stalker' | 'crawler' | 'echo';
export type MState =
  | 'dormant'
  | 'emerge'
  | 'exit'
  | 'patrol'
  | 'listen'
  | 'investigate'
  | 'search'
  | 'checkHide'
  | 'notice'
  | 'chase'
  | 'attack'
  | 'rest'
  | 'stagger'
  | 'retreat'
  | 'lure'
  | 'reveal'
  | 'flee'
  | 'scripted'
  | 'dead';

export interface PlayerView {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  hide: { id: string; kind: 'locker' | 'table' | 'alcove'; x: number; z: number } | null;
  crouch: boolean;
  sprinting: boolean;
  moving: number;
  flashlight: boolean;
}

export interface HideSpot {
  id: string;
  kind: 'locker' | 'table' | 'alcove';
  x: number;
  z: number;
  /** where a monster stands to check it */
  fx: number;
  fz: number;
}

export interface MonsterHost {
  level: Level;
  time: number;
  diff: DiffParams;
  player: PlayerView;
  lit(x: number, z: number): number;
  doorOpen(d: DoorDef): boolean;
  openDoor(d: DoorDef, by: Monster): void;
  closedDoorAt(cx: number, cz: number): boolean;
  propBoxes: { x0: number; x1: number; z0: number; z1: number }[];
  hideSpots: HideSpot[];
  sfx(name: string, x: number, z: number, y?: number, vol?: number): void;
  say(m: Monster, text: string): void;
  hurtPlayer(amount: number, m: Monster): void;
  ripHide(id: string, m: Monster): void;
  onChase(m: Monster): void;
  onKilled(m: Monster): void;
  /** a vent grate near (x, z) bangs open */
  ventUsed(x: number, z: number): void;
}

interface Kind {
  walk: number;
  run: number;
  sight: number;
  fov: number;
  hearing: number;
  reach: number;
  damage: number;
  attackTime: number;
  hitAt: number;
  hp: number;
  radius: number;
  canOpenDoors: boolean;
  hide: [number, number];
}

export const KINDS: Record<MonsterType, Kind> = {
  stalker: { walk: 1.3, run: 3.85, sight: 17, fov: 1.95, hearing: 1, reach: 1.45, damage: 42, attackTime: 1.05, hitAt: 0.55, hp: 100, radius: 0.38, canOpenDoors: true, hide: [35, 70] },
  crawler: { walk: 1.7, run: 5.0, sight: 9, fov: 2.6, hearing: 1.45, reach: 1.05, damage: 20, attackTime: 0.7, hitAt: 0.32, hp: 60, radius: 0.34, canOpenDoors: false, hide: [14, 30] },
  echo: { walk: 1.05, run: 3.45, sight: 12, fov: 1.8, hearing: 0.9, reach: 1.25, damage: 32, attackTime: 0.9, hitAt: 0.45, hp: 110, radius: 0.34, canOpenDoors: true, hide: [30, 60] },
};

export class Monster {
  x = -100;
  z = -100;
  yaw = 0;
  state: MState = 'dormant';
  stateT = 0;
  hp: number;
  maxHp: number;
  path: [number, number][] = [];
  repathT = 0;
  speed = 0;
  alert = 0;
  lastKnown: [number, number] = [0, 0];
  sawHide: string | null = null;
  checking: HideSpot | null = null;
  checked = new Set<string>();
  dormantFor: number;
  stepAcc = 0;
  anim = 0;
  attackT = -1;
  attacked = false;
  hitT = 0;
  deathT = 0;
  noticeT = 0;
  chaseT = 0;
  burn = 0;
  callT = 0;
  doorWait = 0;
  pauseT = 0;
  roamT = 0;
  stuckT = 0;
  lastPos: [number, number] = [0, 0];
  scripted: [number, number][] = [];
  headYaw = 0;
  /** crawling through a vent: from (gx, gz) inside the grate to (fx, fz) in the room */
  gx = 0;
  gz = 0;
  fx = 0;
  fz = 0;
  /** relative shake of the pose (0..1), for the renderer */
  twitch = 0;
  enraged = false;
  active = false;
  K: Kind;

  constructor(
    public id: string,
    public type: MonsterType,
    public zones: ZoneId[],
    public rng: Rng,
    hpMul = 1,
  ) {
    this.K = KINDS[type];
    this.maxHp = this.hp = this.K.hp * hpMul;
    this.dormantFor = rng.range(8, 20);
  }

  get visible() {
    // the grate rattles and swings open a moment before anything shows
    return this.state !== 'dormant' && !(this.state === 'emerge' && this.stateT < 0.45) && !(this.state === 'dead' && this.deathT > 30);
  }
  get alive() {
    return this.state !== 'dead';
  }
  get hunting() {
    return this.state === 'chase' || this.state === 'notice' || this.state === 'attack';
  }
  set(s: MState) {
    this.state = s;
    this.stateT = 0;
    this.pauseT = 0;
  }
  /** pose phase for the renderer */
  get moving() {
    if ((this.state === 'emerge' || this.state === 'exit') && this.type !== 'crawler') return false;
    return this.speed > 0.05 && !['listen', 'notice', 'attack', 'stagger', 'dead', 'rest', 'lure', 'reveal', 'checkHide'].includes(this.state);
  }

  private noise: { x: number; z: number; r: number }[] = [];
  hear(x: number, z: number, r: number) {
    this.noise.push({ x, z, r });
  }

  // ------------------------------------------------------------------ external events
  playScript(route: [number, number][]) {
    this.x = route[0][0];
    this.z = route[0][1];
    this.scripted = route.slice(1);
    this.set('scripted');
  }

  takeDamage(h: MonsterHost, amount: number) {
    if (!this.alive || !this.visible) return;
    this.hp -= amount;
    this.hitT = 0.35;
    this.twitch = 1;
    this.alert = 1.2;
    this.lastKnown = [h.player.x, h.player.z];
    if (this.hp <= 0) {
      if (this.type === 'stalker') {
        // it cannot be killed: it reels, then withdraws to recover
        this.set('stagger');
        h.sfx('stalkerHurt', this.x, this.z, 2.2);
        this.hp = this.maxHp;
      } else {
        this.set('dead');
        this.deathT = 0;
        this.speed = 0;
        this.path = [];
        h.sfx(this.type === 'crawler' ? 'crawlerDie' : 'echoDie', this.x, this.z, 0.6);
        h.onKilled(this);
      }
      return;
    }
    h.sfx(this.type === 'stalker' ? 'stalkerHurt' : this.type === 'crawler' ? 'crawlerHurt' : 'echoHurt', this.x, this.z, this.type === 'crawler' ? 0.4 : 1.8);
    if (this.state === 'emerge' || this.state === 'exit') return;
    if (this.type === 'echo' && !this.hunting) this.flee(h);
    else if (!this.hunting) this.startChase(h);
  }

  /** Make the monster appear soon through a vent near (but out of sight of) the player. */
  summon(h: MonsterHost, soon = 3) {
    if (!this.alive) return;
    if (this.visible) {
      if (!this.hunting) this.goTo(h, h.player.x, h.player.z, 'investigate');
      return;
    }
    this.dormantFor = Math.min(this.dormantFor, this.stateT + soon);
  }

  despawn() {
    this.x = this.z = -100;
    this.path = [];
    this.set('dormant');
    this.dormantFor = 1e9;
    this.active = false;
  }

  // ------------------------------------------------------------------ main update
  update(dt: number, h: MonsterHost) {
    this.stateT += dt;
    this.anim += dt * (0.4 + this.speed * 0.9);
    this.hitT = Math.max(0, this.hitT - dt);
    this.twitch = Math.max(0, this.twitch - dt * 1.5);
    if (this.state === 'dead') {
      this.deathT += dt;
      this.noise = [];
      return;
    }
    if (!this.active) {
      this.noise = [];
      return;
    }
    const p = h.player;
    const D = h.diff;
    const d = dist2d(this.x, this.z, p.x, p.z);

    if (this.state === 'scripted') {
      this.speed = this.K.walk * 1.1;
      if (!this.follow(dt, h, this.scripted)) this.enterVent(h);
      return;
    }
    if (this.state === 'dormant') {
      this.noise = [];
      if (this.stateT >= this.dormantFor) this.chooseVent(h);
      return;
    }
    if (this.state === 'exit') {
      // squeezing back into the duct
      const k = clamp(this.stateT / 1.1, 0, 1);
      const e = k * k * (3 - 2 * k);
      this.speed = 1.2;
      this.x = this.fx + (this.gx - this.fx) * e;
      this.z = this.fz + (this.gz - this.fz) * e;
      if (k >= 1) this.vanish(h);
      return;
    }
    if (this.state === 'emerge') {
      // out of the grate, low to the floor, then it rises
      const k = clamp((this.stateT - 0.45) / 1.75, 0, 1);
      const e = k * k * (3 - 2 * k);
      this.speed = this.type === 'crawler' ? 1.2 : 0;
      this.x = this.gx + (this.fx - this.gx) * e;
      this.z = this.gz + (this.fz - this.gz) * e;
      if (Math.hypot(this.fx - this.gx, this.fz - this.gz) > 0.05) this.yaw = Math.atan2(-(this.fx - this.gx), -(this.fz - this.gz));
      if (this.stateT > 2.2) {
        this.speed = 0;
        h.sfx('ventOut', this.x, this.z, this.type === 'crawler' ? 0.5 : 2.4);
        if (this.type === 'echo') this.startLure(h);
        else this.pickPatrol(h);
      }
      return;
    }
    if (this.state === 'stagger') {
      this.speed = 0;
      if (this.stateT > 1.8) this.retreat(h);
      return;
    }

    // ---------------------------------------------------------------- perception
    const sees = this.canSee(h, d);
    if (sees) {
      this.lastKnown = [p.x, p.z];
      const rate = (d < 4 ? 3.2 : d < 9 ? 1.6 : 0.85) * D.reaction * (this.enraged ? 1.6 : 1);
      this.alert = clamp(this.alert + dt * rate, 0, 1.3);
    } else this.alert = Math.max(0, this.alert - dt * 0.22);

    for (const n of this.noise) {
      const blocked = !h.level.lineClear(this.x, this.z, n.x, n.z, (cx, cz) => h.closedDoorAt(cx, cz));
      const r = n.r * D.hearing * this.K.hearing * (blocked ? 0.6 : 1);
      const nd = dist2d(this.x, this.z, n.x, n.z);
      if (nd > r || this.hunting) continue;
      // committed to leaving (or busy tearing a hiding place open): sounds do not turn it around
      if (this.state === 'retreat' || this.state === 'flee' || this.state === 'checkHide') continue;
      this.lastKnown = [n.x, n.z];
      if (nd < r * 0.35) this.alert = Math.min(1.1, this.alert + 0.3);
      if (this.type === 'echo' && this.state === 'lure') continue;
      if (this.state !== 'investigate' && this.state !== 'listen') {
        this.set('listen');
        this.face(n.x, n.z, 10);
        if (this.type === 'stalker') h.sfx('stalkerListen', this.x, this.z, 2.4, 0.6);
      } else if (this.state === 'investigate') this.goTo(h, n.x, n.z, 'investigate', false);
    }
    this.noise = [];

    // the Echo hates a flashlight held on its face
    if (this.type === 'echo' && this.inBeam(h, d) && this.state !== 'flee') {
      this.burn += dt;
      this.twitch = 0.6;
      if (this.burn > 1.0) {
        this.burn = 0;
        h.sfx('echoScreech', this.x, this.z, 1.8);
        this.flee(h);
        return;
      }
    } else this.burn = Math.max(0, this.burn - dt);

    if (!this.hunting && this.alert >= 1 && sees && this.state !== 'flee' && this.state !== 'retreat' && this.state !== 'checkHide') {
      if (this.type === 'echo' && this.state === 'lure') this.set('reveal');
      else {
        this.set('notice');
        this.noticeT = 0;
        h.sfx(this.type === 'stalker' ? 'stalkerNotice' : this.type === 'crawler' ? 'crawlerNotice' : 'echoNotice', this.x, this.z, this.type === 'crawler' ? 0.5 : 2);
      }
      this.twitch = 1;
    }

    // ---------------------------------------------------------------- behaviour
    switch (this.state) {
      case 'notice':
      case 'reveal':
        this.speed = 0;
        this.face(p.x, p.z, dt * 7);
        if (this.stateT > (this.state === 'reveal' ? 0.9 : 0.6) / D.reaction) this.startChase(h);
        break;
      case 'chase':
        this.doChase(dt, h, d, sees);
        break;
      case 'attack':
        this.doAttack(dt, h, d);
        break;
      case 'rest':
        this.speed = 0;
        if (this.stateT > 2.2) {
          if (sees && d < 10) this.startChase(h);
          else this.goTo(h, this.lastKnown[0], this.lastKnown[1], 'search');
        }
        break;
      case 'listen':
        this.speed = 0;
        if (this.stateT > 1.4 / D.reaction) this.goTo(h, this.lastKnown[0], this.lastKnown[1], 'investigate');
        break;
      case 'investigate':
      case 'patrol':
        this.speed = (this.state === 'investigate' ? this.K.walk * 1.4 : this.K.walk) * D.enemySpeed * (this.enraged ? 1.25 : 1);
        this.roamT += dt;
        if (this.pauseT > 0) {
          // stops at the end of a leg and looks around
          this.pauseT -= dt;
          this.speed = 0;
          this.yaw = wrapAngle(this.yaw + Math.sin(this.stateT * 1.3) * dt * 0.9);
          if (this.pauseT <= 0) {
            if (this.roamT > 50 && this.rng.next() < 0.5) {
              this.roamT = 0;
              this.leave(h);
            } else this.pickPatrol(h);
          }
          break;
        }
        if (!this.follow(dt, h, this.path)) {
          if (this.state === 'investigate') this.set('search');
          else this.pauseT = this.rng.range(1.2, 3.5);
        }
        break;
      case 'search':
        this.doSearch(dt, h);
        break;
      case 'checkHide':
        this.doCheckHide(dt, h);
        break;
      case 'lure':
        this.doLure(dt, h, d);
        break;
      case 'retreat':
      case 'flee':
        this.speed = this.K.run * 0.85 * D.enemySpeed;
        if (!this.follow(dt, h, this.path)) this.enterVent(h);
        break;
    }
    this.separate(h);
    this.checkStuck(dt, h);
  }

  // ------------------------------------------------------------------ states
  startChase(h: MonsterHost) {
    this.set('chase');
    this.chaseT = 0;
    this.repathT = 0;
    h.onChase(this);
  }

  private doChase(dt: number, h: MonsterHost, d: number, sees: boolean) {
    const p = h.player;
    const D = h.diff;
    this.chaseT += dt;
    this.speed = this.K.run * D.enemySpeed * (this.enraged ? 1.15 : 1);
    // the crawler's sprint is short
    if (this.type === 'crawler' && this.chaseT > 5.5) {
      this.set('rest');
      h.sfx('crawlerPant', this.x, this.z, 0.4);
      return;
    }
    // the crawler shies away from bright lamps
    if (this.type === 'crawler' && h.lit(this.x, this.z) > 0.75 && !this.enraged) {
      this.retreat(h);
      return;
    }
    if (p.hide && !sees) {
      // it lost sight of you; did it see where you went?
      if (this.sawHide === p.hide.id || (this.type === 'crawler' && p.hide.kind === 'table' && d < 5)) {
        const spot = h.hideSpots.find((s) => s.id === p.hide!.id);
        if (spot) {
          this.checking = spot;
          this.goTo(h, spot.fx, spot.fz, 'checkHide');
          return;
        }
      }
      this.goTo(h, this.lastKnown[0], this.lastKnown[1], 'search');
      return;
    }
    if (d < this.K.reach && sees) {
      this.set('attack');
      this.attackT = 0;
      this.attacked = false;
      h.sfx(this.type === 'stalker' ? 'stalkerAttack' : this.type === 'crawler' ? 'crawlerAttack' : 'echoAttack', this.x, this.z, 1.6);
      return;
    }
    this.repathT -= dt;
    if (sees && d < 7 && h.level.lineClear(this.x, this.z, p.x, p.z, (cx, cz) => h.closedDoorAt(cx, cz), false)) this.path = [[p.x, p.z]];
    else if (this.repathT <= 0) {
      this.repathT = 0.4;
      const [tx, tz] = sees ? [p.x, p.z] : this.lastKnown;
      this.path = this.findPath(h, tx, tz) ?? [];
    }
    const moving = this.follow(dt, h, this.path);
    if (!sees && (!moving || dist2d(this.x, this.z, this.lastKnown[0], this.lastKnown[1]) < 1.2) && this.stateT > 1) this.set('search');
    // the echo does not keep up a long chase out of the dark
    if (this.type === 'echo' && this.chaseT > 9 && !sees) this.flee(h);
  }

  private doAttack(dt: number, h: MonsterHost, d: number) {
    const p = h.player;
    this.speed = 0;
    this.attackT += dt;
    this.face(p.x, p.z, dt * 8);
    if (!this.attacked && this.attackT >= this.K.hitAt) {
      this.attacked = true;
      if (d < this.K.reach + 0.5 && (!p.hide || p.hide.kind === 'alcove')) h.hurtPlayer(this.K.damage * h.diff.damage * (this.enraged ? 1.2 : 1), this);
      else h.sfx('whoosh', this.x, this.z, 1.4);
    }
    if (this.attackT >= this.K.attackTime) {
      this.attackT = -1;
      if (this.type === 'crawler') {
        // hit and run: on the lower difficulties it bites once and vanishes into the ducts
        if (h.diff.reaction <= 1 && this.rng.next() < (h.diff.reaction < 1 ? 0.85 : 0.55)) this.retreat(h);
        else this.set('rest');
      } else this.startChase(h);
    }
  }

  private doSearch(dt: number, h: MonsterHost) {
    this.speed = this.K.walk * 1.15 * h.diff.enemySpeed;
    if (this.follow(dt, h, this.path)) return;
    // look into the hiding places near where the player was last noticed
    if (this.type === 'stalker' && this.stateT < 20) {
      const near = h.hideSpots.filter((s) => s.kind !== 'table' && !this.checked.has(s.id) && dist2d(s.x, s.z, this.lastKnown[0], this.lastKnown[1]) < 7.5);
      for (const s of near) {
        this.checked.add(s.id);
        if (this.sawHide === s.id || this.rng.next() < h.diff.lockerSuspicion) {
          this.checking = s;
          this.goTo(h, s.fx, s.fz, 'checkHide');
          return;
        }
      }
    }
    if (this.stateT > 14) {
      this.checked.clear();
      this.sawHide = null;
      if (this.rng.next() < 0.4) this.leave(h);
      else this.pickPatrol(h);
      return;
    }
    // sweep the area around the last sighting: a few reachable spots, each followed by a look around
    if (this.pauseT > 0) {
      this.pauseT -= dt;
      this.speed = 0;
      this.yaw = wrapAngle(this.yaw + Math.sin(this.stateT * 2.1) * dt * 1.6);
      return;
    }
    for (let i = 0; i < 8; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(2, 7);
      const tx = this.lastKnown[0] + Math.cos(a) * r;
      const tz = this.lastKnown[1] + Math.sin(a) * r;
      if (h.level.isSolid(Math.floor(tx / CELL), Math.floor(tz / CELL))) continue;
      const path = this.findPath(h, tx, tz);
      if (path && path.length) {
        this.path = path;
        this.pauseT = this.rng.range(0.6, 1.6);
        return;
      }
    }
    this.pickPatrol(h);
  }

  private doCheckHide(dt: number, h: MonsterHost) {
    const s = this.checking;
    if (!s) return this.set('search');
    this.speed = this.K.walk * 1.3 * h.diff.enemySpeed;
    if (this.follow(dt, h, this.path)) return;
    this.speed = 0;
    this.face(s.x, s.z, dt * 6);
    if (this.stateT > 0.9 && this.attackT < 0) {
      const p = h.player;
      if (p.hide && p.hide.id === s.id) {
        h.sfx(s.kind === 'locker' ? 'lockerRip' : 'tableShove', s.x, s.z, 1);
        h.ripHide(s.id, this);
        this.set('attack');
        this.attackT = 0;
        this.attacked = false;
        return;
      }
      h.sfx(s.kind === 'locker' ? 'lockerBang' : 'sniff', s.x, s.z, 1, 0.8);
      this.checking = null;
      this.set('search');
      this.stateT = 8;
    }
  }

  // ---- the Echo: stand in the dark and call
  private startLure(h: MonsterHost) {
    const p = h.player;
    const cells = h.level.cellsOf(this.zones).filter(([x, z]) => {
      const dd = dist2d(x, z, p.x, p.z);
      return dd > 9 && dd < 24 && h.lit(x, z) < 0.35;
    });
    if (!cells.length) return this.pickPatrol(h);
    const [tx, tz] = this.rng.pick(cells);
    this.goTo(h, tx, tz, 'lure');
    this.callT = this.rng.range(2, 5);
  }

  private doLure(dt: number, h: MonsterHost, d: number) {
    this.speed = this.K.walk * h.diff.enemySpeed;
    if (this.follow(dt, h, this.path)) return;
    this.speed = 0;
    // stands with its back to you
    const p = h.player;
    const away = Math.atan2(-(this.x - p.x), -(this.z - p.z));
    this.yaw += clamp(wrapAngle(away - this.yaw), -dt * 2, dt * 2);
    this.callT -= dt;
    if (this.callT <= 0 && d < 30) {
      this.callT = this.rng.range(7, 13);
      h.say(this, '');
    }
    if (d < 6.5 && !p.hide && h.level.lineClear(this.x, this.z, p.x, p.z, (cx, cz) => h.closedDoorAt(cx, cz))) {
      this.set('reveal');
      h.sfx('echoNotice', this.x, this.z, 1.8);
      this.twitch = 1;
      return;
    }
    if (this.stateT > 70) this.startLure(h);
  }

  flee(h: MonsterHost) {
    const v = this.farVent(h);
    this.goTo(h, v.x, v.z, 'flee');
    this.path.push([v.x, v.z]);
    this.alert = 0;
  }

  // ------------------------------------------------------------------ senses
  canSee(h: MonsterHost, d: number): boolean {
    const p = h.player;
    const D = h.diff;
    if (p.hide) {
      if (p.hide.kind === 'locker') return false;
      if (p.hide.kind === 'table') {
        if (this.type !== 'crawler' || d > 5) return false;
        // it moves at floor level and smells: light does not matter under a table
        const a = Math.atan2(-(p.x - this.x), -(p.z - this.z));
        if (Math.abs(wrapAngle(a - this.yaw)) > this.K.fov / 2 && d > 4) return false;
        return h.level.lineClear(this.x, this.z, p.x, p.z, (cx, cz) => h.closedDoorAt(cx, cz));
      } else if (d > (this.type === 'crawler' ? 4 : 2.2)) return false;
    }
    const lit = h.lit(p.x, p.z);
    let range = this.K.sight * D.sight * (0.42 + 0.58 * lit);
    if (p.flashlight) range = Math.max(range, this.K.sight * D.sight * 1.25);
    if (p.crouch && !p.flashlight && lit < 0.3 && p.moving < 0.5) range *= 0.45;
    if (p.sprinting) range *= 1.15;
    if (this.enraged) range *= 1.3;
    if (d > range) return false;
    const ang = Math.atan2(-(p.x - this.x), -(p.z - this.z));
    const fov = d < 2.6 ? Math.PI * 2 : this.hunting ? this.K.fov * 1.4 : this.K.fov;
    if (Math.abs(wrapAngle(ang - this.yaw)) > fov / 2) return false;
    return h.level.lineClear(this.x, this.z, p.x, p.z, (cx, cz) => h.closedDoorAt(cx, cz));
  }

  inBeam(h: MonsterHost, d: number) {
    const p = h.player;
    if (!p.flashlight || d > 12 || p.hide) return false;
    const ang = Math.atan2(-(this.x - p.x), -(this.z - p.z));
    if (Math.abs(wrapAngle(ang - p.yaw)) > 0.24) return false;
    if (Math.abs(p.pitch) > 0.7) return false;
    return h.level.lineClear(p.x, p.z, this.x, this.z, (cx, cz) => h.closedDoorAt(cx, cz));
  }

  /** The player hides: remember the spot if we were looking. */
  playerHid(h: MonsterHost, spotId: string) {
    const p = h.player;
    const d = dist2d(this.x, this.z, p.x, p.z);
    if (!this.visible || !this.alive) return;
    const ang = Math.atan2(-(p.x - this.x), -(p.z - this.z));
    const looking = Math.abs(wrapAngle(ang - this.yaw)) < this.K.fov * 0.7;
    if (this.hunting && d < 9 && looking && h.level.lineClear(this.x, this.z, p.x, p.z, (cx, cz) => h.closedDoorAt(cx, cz))) this.sawHide = spotId;
  }

  // ------------------------------------------------------------------ movement
  face(tx: number, tz: number, k: number) {
    const target = Math.atan2(-(tx - this.x), -(tz - this.z));
    this.yaw = wrapAngle(this.yaw + clamp(wrapAngle(target - this.yaw), -k, k));
  }

  passable(h: MonsterHost, d: DoorDef) {
    if (h.doorOpen(d)) return true;
    if (!this.K.canOpenDoors) return false;
    return d.kind === 'normal';
  }

  findPath(h: MonsterHost, tx: number, tz: number) {
    return h.level.path(this.x, this.z, tx, tz, (d) => this.passable(h, d));
  }

  goTo(h: MonsterHost, tx: number, tz: number, state: MState, reset = true) {
    if (h.level.isSolid(Math.floor(tx / CELL), Math.floor(tz / CELL))) [tx, tz] = this.lastKnown;
    const path = this.findPath(h, tx, tz);
    if (reset || this.state !== state) this.set(state);
    this.path = path ?? [];
  }

  pickPatrol(h: MonsterHost) {
    const p = h.player;
    const cells = h.level.cellsOf(this.zones);
    for (let i = 0; i < 10; i++) {
      const [tx, tz] = this.rng.pick(cells);
      const dd = dist2d(tx, tz, p.x, p.z);
      if (dd < 6 || dd > 28) continue;
      if (this.type === 'crawler' && h.lit(tx, tz) > 0.6) continue;
      this.goTo(h, tx, tz, 'patrol');
      if (this.path.length) return;
    }
    // nothing near the player: wander anywhere in the zone
    const [tx, tz] = this.rng.pick(cells);
    this.goTo(h, tx, tz, 'patrol');
    if (!this.path.length) this.leave(h);
  }

  follow(dt: number, h: MonsterHost, path: [number, number][]): boolean {
    if (!path.length) return false;
    if (this.doorWait > 0) {
      this.doorWait -= dt;
      return true;
    }
    const [tx, tz] = path[0];
    // a closed door ahead: open it, or give up if it cannot
    const cx = Math.floor(tx / CELL);
    const cz = Math.floor(tz / CELL);
    const door = h.level.doorAtCell(cx, cz);
    if (door && !h.doorOpen(door) && dist2d(this.x, this.z, tx, tz) < 2.3) {
      if (!this.passable(h, door)) {
        path.length = 0;
        return false;
      }
      h.openDoor(door, this);
      this.doorWait = this.type === 'stalker' ? 0.6 : 1.0;
      return true;
    }
    const d = dist2d(this.x, this.z, tx, tz);
    const step = this.speed * dt;
    this.face(tx, tz, dt * (this.type === 'crawler' ? 9 : 5));
    if (d <= Math.max(step, 0.12)) {
      this.x = tx;
      this.z = tz;
      path.shift();
    } else {
      this.x += ((tx - this.x) / d) * step;
      this.z += ((tz - this.z) / d) * step;
    }
    this.collide(h);
    this.stepAcc += step;
    const stride = this.type === 'crawler' ? 0.55 : this.type === 'stalker' ? (this.speed > 2.5 ? 1.6 : 1.25) : this.speed > 2.5 ? 1.3 : 0.95;
    if (this.stepAcc > stride) {
      this.stepAcc = 0;
      h.sfx(this.type === 'stalker' ? 'stalkerStep' : this.type === 'crawler' ? 'crawlerStep' : 'echoStep', this.x, this.z, 0.1, this.speed > 2.5 ? 1 : 0.7);
    }
    return path.length > 0;
  }

  /** walls, furniture and other cells: never inside geometry */
  collide(h: MonsterHost) {
    const L = h.level;
    const r = this.K.radius;
    const cx = Math.floor(this.x / CELL);
    const cz = Math.floor(this.z / CELL);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (!L.isSolid(x, z)) continue;
        const o = pushOut(this.x, this.z, r, { x0: x * CELL, x1: x * CELL + CELL, z0: z * CELL, z1: z * CELL + CELL });
        if (o) [this.x, this.z] = o;
      }
    for (const b of h.propBoxes) {
      if (b.x1 < this.x - 2 || b.x0 > this.x + 2 || b.z1 < this.z - 2 || b.z0 > this.z + 2) continue;
      const o = pushOut(this.x, this.z, r, b);
      if (o) [this.x, this.z] = o;
    }
  }

  private others: Monster[] = [];
  setOthers(list: Monster[]) {
    this.others = list.filter((m) => m !== this);
  }
  separate(h: MonsterHost) {
    for (const o of this.others) {
      if (!o.visible || !o.alive) continue;
      const d = dist2d(this.x, this.z, o.x, o.z);
      if (d > 0.01 && d < 0.8) {
        this.x += ((this.x - o.x) / d) * (0.8 - d) * 0.5;
        this.z += ((this.z - o.z) / d) * (0.8 - d) * 0.5;
        this.collide(h);
      }
    }
  }

  checkStuck(dt: number, h: MonsterHost) {
    this.stuckT += dt;
    if (this.stuckT < 1.8) return;
    const moved = dist2d(this.x, this.z, this.lastPos[0], this.lastPos[1]);
    this.stuckT = 0;
    this.lastPos = [this.x, this.z];
    if (moved < 0.15 && this.speed > 0.2 && this.path.length && this.doorWait <= 0) {
      this.path.shift();
      if (!this.path.length && !this.hunting) this.pickPatrol(h);
    }
  }

  // ------------------------------------------------------------------ vents
  private zoneVents() {
    return VENTS.filter((v) => this.zones.includes(v.zone));
  }

  farVent(h: MonsterHost) {
    const p = h.player;
    const vs = this.zoneVents();
    const near = [...vs].sort((a, b) => dist2d(this.x, this.z, a.x, a.z) - dist2d(this.x, this.z, b.x, b.z)).slice(0, 3);
    near.sort((a, b) => dist2d(p.x, p.z, b.x, b.z) - dist2d(p.x, p.z, a.x, a.z));
    return near[0] ?? vs[0];
  }

  leave(h: MonsterHost) {
    const vs = this.zoneVents();
    const v = vs.sort((a, b) => dist2d(this.x, this.z, a.x, a.z) - dist2d(this.x, this.z, b.x, b.z))[0];
    if (!v) return;
    this.goTo(h, v.x, v.z, 'retreat');
    this.path.push([v.x, v.z]);
  }

  retreat(h: MonsterHost) {
    const v = this.farVent(h);
    if (!v) return;
    this.goTo(h, v.x, v.z, 'retreat');
    this.path.push([v.x, v.z]);
  }

  /** The nearest vent to a point (within reach), if any. */
  private ventNear(x: number, z: number) {
    let best: (typeof VENTS)[number] | null = null;
    let bd = 3;
    for (const v of VENTS) {
      const d = dist2d(x, z, v.x, v.z);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  /** Crawl out into the room at (x, z), through the nearest grate. */
  emergeAt(h: MonsterHost, x: number, z: number, t0 = 0) {
    const v = this.ventNear(x, z);
    this.fx = x;
    this.fz = z;
    this.gx = v ? v.gx : x;
    this.gz = v ? v.gz : z;
    this.x = this.gx;
    this.z = this.gz;
    this.lastPos = [x, z];
    this.set('emerge');
    this.stateT = t0;
    h.ventUsed(this.gx, this.gz);
  }

  /** Back into the ducts: walk into the nearest grate (or simply go, if none is near). */
  enterVent(h: MonsterHost) {
    const v = this.visible ? this.ventNear(this.x, this.z) : null;
    if (this.visible) h.sfx('ventIn', this.x, this.z, this.type === 'crawler' ? 0.5 : 2.4);
    if (!v) return this.vanish(h);
    this.retreating = this.state === 'retreat' || this.state === 'flee';
    this.fx = this.x;
    this.fz = this.z;
    this.gx = v.gx;
    this.gz = v.gz;
    this.yaw = Math.atan2(-(v.gx - this.x), -(v.gz - this.z));
    this.path = [];
    this.set('exit');
    h.ventUsed(v.gx, v.gz);
  }

  private retreating = false;
  private vanish(h: MonsterHost) {
    const wasRetreat = this.retreating || this.state === 'retreat' || this.state === 'flee';
    this.retreating = false;
    this.set('dormant');
    this.dormantFor = this.rng.range(this.K.hide[0], this.K.hide[1]) * (wasRetreat && this.type === 'stalker' ? 1.6 : 1) / Math.max(0.6, h.diff.reaction);
    this.x = this.z = -100;
    this.path = [];
    this.alert = 0;
    this.sawHide = null;
    this.checked.clear();
    this.hp = this.maxHp;
  }

  chooseVent(h: MonsterHost) {
    const p = h.player;
    const options = this.zoneVents().filter((v) => {
      const d = dist2d(v.x, v.z, p.x, p.z);
      return d > 11 && d < 40 && !h.level.lineClear(v.x, v.z, p.x, p.z, (cx, cz) => h.closedDoorAt(cx, cz));
    });
    if (!options.length) {
      this.dormantFor = this.stateT + 5;
      return;
    }
    // prefer vents not too far from the player (the hunt is on), but never in sight
    options.sort((a, b) => dist2d(a.x, a.z, p.x, p.z) - dist2d(b.x, b.z, p.x, p.z));
    const v = options[Math.min(options.length - 1, this.rng.int(0, 1))];
    this.lastKnown = [p.x, p.z];
    this.emergeAt(h, v.x, v.z);
    h.sfx('ventRattle', v.x, v.z, this.type === 'crawler' ? 0.4 : 2.4);
  }
}
