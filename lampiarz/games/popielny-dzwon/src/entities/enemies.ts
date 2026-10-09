// Regular enemies: data-driven attacks with readable telegraphs.
//   white glint  -> can be blocked and parried
//   red glint    -> cannot be blocked: roll or jump
import { ENEMIES, type EnemyDef, type EnemyKind } from '../data/content';
import { approach, sign, type Rect, Rng } from '../core/util';
import { moveBody, T, type Body } from '../world/level';
import type { AttackInstance, Damageable, Projectile, WorldApi } from '../world/types';

export interface EAttack {
  id: string;
  windup: number;
  active: number;
  recover: number;
  dmg: number;
  poise: number;
  reach: number;
  top: number;
  height: number;
  red: boolean;
  range: [number, number];
  cd: number;
  weight: number;
  lunge?: number;
  leap?: { vx: number; vy: number };
  charge?: number;
  dive?: boolean;
  projectile?: { kind: Projectile['kind']; count: number; speed: number; spread: number; homing?: number };
  chain?: string;
  lament?: boolean;
  elite?: boolean;
}

const A = (o: Partial<EAttack> & Pick<EAttack, 'id' | 'windup' | 'active' | 'recover' | 'dmg' | 'range'>): EAttack => ({
  poise: 10,
  reach: 46,
  top: 4,
  height: 34,
  red: false,
  cd: 0.8,
  weight: 1,
  ...o,
});

export const ATTACKS: Record<EnemyKind, EAttack[]> = {
  wyrwany: [
    A({ id: 'zamach', windup: 0.6, active: 0.12, recover: 0.6, dmg: 14, range: [0, 52], reach: 46, lunge: 70, weight: 2 }),
    A({ id: 'dwa', windup: 0.5, active: 0.1, recover: 0.2, dmg: 11, range: [0, 50], reach: 44, lunge: 60, chain: 'dwa2' }),
    A({ id: 'dwa2', windup: 0.3, active: 0.12, recover: 0.7, dmg: 13, range: [0, 0], reach: 48, lunge: 90, weight: 0 }),
    A({ id: 'rzut', windup: 0.7, active: 0.1, recover: 0.5, dmg: 12, range: [120, 300], projectile: { kind: 'ash', count: 1, speed: 260, spread: 0 }, elite: true, cd: 2 }),
  ],
  ogar: [
    A({ id: 'skok', windup: 0.5, active: 0.55, recover: 0.5, dmg: 18, range: [90, 250], red: true, leap: { vx: 410, vy: -300 }, reach: 40, top: 0, height: 26, cd: 1.4, weight: 2 }),
    A({ id: 'ugryz', windup: 0.32, active: 0.1, recover: 0.45, dmg: 10, range: [0, 50], reach: 34, top: 4, height: 22, lunge: 120 }),
  ],
  straznik: [
    A({ id: 'tarcza', windup: 0.6, active: 0.14, recover: 0.6, dmg: 18, poise: 30, range: [0, 62], reach: 50, lunge: 140, weight: 2 }),
    A({ id: 'dzwon', windup: 1.05, active: 0.16, recover: 0.9, dmg: 36, poise: 50, range: [0, 76], reach: 64, top: -20, height: 70, red: true, cd: 1.6 }),
    A({ id: 'szarza', windup: 0.75, active: 0.85, recover: 0.6, dmg: 26, range: [140, 380], red: true, charge: 330, reach: 30, top: 6, height: 50, elite: true, cd: 3 }),
  ],
  cmiara: [
    A({ id: 'pyl', windup: 0.8, active: 0.1, recover: 0.7, dmg: 12, range: [120, 460], projectile: { kind: 'dust', count: 3, speed: 210, spread: 0.32, homing: 0.6 }, cd: 2.2, weight: 3 }),
    A({ id: 'nurek', windup: 0.65, active: 0.6, recover: 0.6, dmg: 14, range: [0, 220], red: true, dive: true, reach: 30, top: 0, height: 36, cd: 2.5 }),
  ],
  spiewak: [
    A({ id: 'lament', windup: 1.7, active: 0.1, recover: 0.6, dmg: 0, range: [0, 600], lament: true, cd: 7, weight: 3 }),
    A({ id: 'pchniecie', windup: 0.42, active: 0.1, recover: 0.5, dmg: 7, poise: 30, range: [0, 44], reach: 40 }),
  ],
  cma: [A({ id: 'kontakt', windup: 0.01, active: 0.1, recover: 0.1, dmg: 10, range: [0, 0] })],
};

export type EState = 'idle' | 'chase' | 'windup' | 'active' | 'recover' | 'flinch' | 'stagger' | 'parried' | 'dead' | 'retreat' | 'spawn';

export interface EnemyWorld extends WorldApi {
  player: Damageable & { cx: number; cy: number; feet: number; iframes: boolean };
  enemies: Enemy[];
  spawnProjectile(p: Omit<Projectile, 'id' | 'attack' | 'reflected' | 'dead'>): void;
  windupMul: number;
  rng: Rng;
}

let nextId = 100;

export class Enemy implements Damageable {
  id = nextId++;
  def: EnemyDef;
  body: Body;
  face: 1 | -1 = -1;
  hp: number;
  maxHp: number;
  poise: number;
  maxPoise: number;
  dmgMul: number;
  state: EState = 'idle';
  stateT = 0;
  attack: EAttack | null = null;
  inst: AttackInstance | null = null;
  cooldown = 0.6;
  aggro = false;
  dead = false;
  deathT = 0;
  hitFlash = 0;
  buffT = 0;
  anim = Math.random() * 10;
  home: { x: number; y: number };
  wanderT = 0;
  wanderDir = 0;
  diveTarget = { x: 0, y: 0 };
  hoverPhase = Math.random() * 6;
  /** set by bosses for summoned minions */
  minion = false;
  rewarded = false;

  constructor(
    public kind: EnemyKind,
    x: number,
    footY: number,
    public elite: boolean,
    scale: { hp: number; dmg: number },
    public spawnId: string,
  ) {
    this.def = ENEMIES[kind];
    const eliteMul = elite ? 1.7 : 1;
    this.maxHp = Math.round(this.def.hp * scale.hp * eliteMul);
    this.hp = this.maxHp;
    this.maxPoise = this.def.poise * (elite ? 1.5 : 1);
    this.poise = this.maxPoise;
    this.dmgMul = scale.dmg * (elite ? 1.25 : 1);
    const w = this.def.w;
    const h = this.def.h;
    this.body = { x: x - w / 2, y: this.def.flying ? footY - h - 90 : footY - h, w, h, vx: 0, vy: 0, onGround: false, dropTimer: 0, hitWall: 0 };
    this.home = { x, y: this.body.y };
  }

  get cx() {
    return this.body.x + this.body.w / 2;
  }
  get cy() {
    return this.body.y + this.body.h / 2;
  }
  get feet() {
    return this.body.y + this.body.h;
  }
  get vulnerable() {
    return this.state === 'stagger' || this.state === 'parried';
  }
  /** true while a strike is being prepared — used by the renderer for the glint */
  get telegraph(): 'white' | 'red' | null {
    if (this.state !== 'windup' || !this.attack || this.attack.lament) return null;
    return this.attack.red ? 'red' : 'white';
  }

  setState(s: EState) {
    this.state = s;
    this.stateT = 0;
  }

  update(dt: number, w: EnemyWorld) {
    this.anim += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.buffT = Math.max(0, this.buffT - dt);
    if (this.buffT > 0 && !this.dead) this.hp = Math.min(this.maxHp, this.hp + 3 * dt);
    this.stateT += dt;
    const b = this.body;
    const p = w.player;
    const flying = !!this.def.flying;

    if (this.dead) {
      this.deathT += dt;
      b.vx = approach(b.vx, 0, 600 * dt);
      if (!flying) {
        b.vy = Math.min(900, b.vy + 2200 * dt);
        moveBody(w.level, b, dt);
      } else b.y += 30 * dt;
      return;
    }

    const dx = p.cx - this.cx;
    const dy = p.cy - this.cy;
    const dist = Math.abs(dx);
    // regain poise slowly when not being hit
    if (this.hitFlash === 0) this.poise = Math.min(this.maxPoise, this.poise + this.maxPoise * 0.25 * dt);

    // aggro
    if (!this.aggro && !p.dead) {
      const near = Math.hypot(dx, dy) < this.def.aggro && Math.abs(dy) < 220;
      if (near && w.level.lineOfSight(this.cx, this.cy - 10, p.cx, p.cy - 10)) {
        this.aggro = true;
        if (this.kind === 'ogar') w.sfx('bark', this.cx, 0.7);
      }
    }
    if (this.aggro && (p.dead || Math.hypot(dx, dy) > 1100)) {
      this.aggro = false;
      this.setState('idle');
    }

    this.cooldown -= dt;

    switch (this.state) {
      case 'spawn':
        if (this.stateT > 0.6) this.setState('chase');
        break;
      case 'idle':
        this.wander(dt, w);
        if (this.aggro) this.setState('chase');
        break;
      case 'chase':
        this.chase(dt, w, dx, dist);
        break;
      case 'retreat': {
        const away = -sign(dx);
        if (flying) {
          b.vx = approach(b.vx, away * this.def.speed * 1.4, 600 * dt);
        } else if (w.level.groundBelow(this.cx + away * 20, this.feet)) b.vx = approach(b.vx, away * this.def.speed * 1.1, 900 * dt);
        else b.vx = 0;
        if (this.stateT > 0.6) this.setState('chase');
        break;
      }
      case 'windup': {
        const a = this.attack!;
        if (!a.dive && !a.charge) this.face = dx >= 0 ? 1 : -1;
        b.vx = approach(b.vx, 0, 800 * dt);
        if (flying) this.hover(dt, w, 0.4);
        if (a.dive) this.diveTarget = { x: p.cx, y: p.feet - 14 };
        if (this.stateT >= a.windup * w.windupMul) this.beginActive(w);
        break;
      }
      case 'active':
        this.updateActive(dt, w);
        break;
      case 'recover': {
        const a = this.attack!;
        b.vx = approach(b.vx, 0, 700 * dt);
        if (flying) this.hover(dt, w, 0.6);
        if (this.stateT >= a.recover) {
          const next = a.chain ? ATTACKS[this.kind].find((x) => x.id === a.chain) : null;
          if (next && dist < 90) this.startAttack(next, w);
          else {
            this.attack = null;
            this.cooldown = a.cd * (0.7 + w.rng.next() * 0.6);
            this.setState(this.kind === 'ogar' && a.leap ? 'retreat' : 'chase');
          }
        }
        break;
      }
      case 'flinch':
        b.vx = approach(b.vx, 0, 900 * dt);
        if (this.stateT > 0.2) this.setState('chase');
        break;
      case 'stagger':
        b.vx = approach(b.vx, 0, 700 * dt);
        if (this.stateT > 0.75) {
          this.poise = this.maxPoise;
          this.setState('chase');
        }
        break;
      case 'parried':
        b.vx = approach(b.vx, 0, 700 * dt);
        if (this.stateT > 1.25) {
          this.poise = this.maxPoise;
          this.setState('chase');
        }
        break;
    }

    if (flying) {
      // flyers: no gravity, gentle bob
      if (this.state !== 'active') b.vy = approach(b.vy, 0, 400 * dt);
      moveBody(w.level, b, dt, true);
    } else {
      b.vy = Math.min(900, b.vy + 2200 * dt);
      moveBody(w.level, b, dt);
    }
    // fell out of the world
    if (b.y > w.level.h * T + 200) {
      this.hp = 0;
      this.dead = true;
      this.deathT = 2;
    }
  }

  wander(dt: number, w: EnemyWorld) {
    const b = this.body;
    if (this.def.flying) {
      this.hoverPhase += dt;
      b.vx = Math.sin(this.hoverPhase * 0.7) * 30;
      b.vy = Math.sin(this.hoverPhase * 1.3) * 20;
      return;
    }
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = 1 + w.rng.next() * 2;
      this.wanderDir = w.rng.next() < 0.5 ? 0 : w.rng.next() < 0.5 ? -1 : 1;
      if (Math.abs(this.cx - this.home.x) > 70) this.wanderDir = this.cx > this.home.x ? -1 : 1;
    }
    const sp = this.def.speed * 0.35;
    if (this.wanderDir !== 0 && w.level.groundBelow(this.cx + this.wanderDir * 18, this.feet)) {
      b.vx = approach(b.vx, this.wanderDir * sp, 400 * dt);
      this.face = this.wanderDir as 1 | -1;
    } else b.vx = approach(b.vx, 0, 400 * dt);
  }

  hover(dt: number, w: EnemyWorld, k: number) {
    const b = this.body;
    const p = w.player;
    this.hoverPhase += dt;
    const ty = p.feet - 150 + Math.sin(this.hoverPhase * 1.6) * 16;
    b.vy = approach(b.vy, (ty - this.cy) * 2.2 * k, 600 * dt);
  }

  chase(dt: number, w: EnemyWorld, dx: number, dist: number) {
    const b = this.body;
    const p = w.player;
    if (!this.aggro) {
      this.setState('idle');
      return;
    }
    this.face = dx >= 0 ? 1 : -1;
    const flying = !!this.def.flying;
    const list = ATTACKS[this.kind].filter((a) => a.weight > 0 && (!a.elite || this.elite));
    // pick an attack whose range fits
    if (this.cooldown <= 0) {
      const ok = list.filter((a) => dist >= a.range[0] && dist <= a.range[1] && Math.abs(p.feet - this.feet) < (flying ? 320 : 80));
      if (ok.length) {
        const total = ok.reduce((s, a) => s + a.weight, 0);
        let r = w.rng.next() * total;
        let pick = ok[0];
        for (const a of ok) {
          r -= a.weight;
          if (r <= 0) {
            pick = a;
            break;
          }
        }
        if (!pick.projectile || w.level.lineOfSight(this.cx, this.cy, p.cx, p.cy)) {
          this.startAttack(pick, w);
          return;
        }
      }
    }
    // movement towards a preferred distance
    let want = 36;
    if (this.kind === 'cmiara') want = 250;
    else if (this.kind === 'spiewak') want = 200;
    else if (this.kind === 'ogar') want = this.cooldown > 0 ? 150 : 120;
    else if (this.elite && this.kind === 'wyrwany' && this.cooldown <= 0) want = 160;
    const sp = this.def.speed * (this.buffT > 0 ? 1.15 : 1);
    let dir = 0;
    if (dist > want + 10) dir = sign(dx);
    else if (dist < want - 30 && (this.kind === 'cmiara' || this.kind === 'spiewak' || this.kind === 'ogar')) dir = -sign(dx);
    if (flying) {
      const tx = p.cx - sign(dx) * want;
      b.vx = approach(b.vx, Math.max(-sp, Math.min(sp, (tx - this.cx) * 1.5)), 500 * dt);
      this.hover(dt, w, 1);
      return;
    }
    if (dir !== 0 && !w.level.groundBelow(this.cx + dir * (this.body.w / 2 + 6), this.feet)) dir = 0; // don't walk off ledges
    b.vx = approach(b.vx, dir * sp, 900 * dt);
  }

  startAttack(a: EAttack, w: EnemyWorld) {
    this.attack = a;
    this.inst = w.newAttack();
    this.setState('windup');
    if (a.lament) w.sfx('lament', this.cx);
    else w.sfx(a.red ? 'telegraphRed' : 'telegraphWhite', this.cx, 0.6);
  }

  beginActive(w: EnemyWorld) {
    const a = this.attack!;
    const b = this.body;
    const p = w.player;
    this.setState('active');
    if (a.leap) {
      b.vx = this.face * a.leap.vx;
      b.vy = a.leap.vy;
    }
    if (a.lament) {
      for (const e of w.enemies) if (!e.dead && e !== this && Math.hypot(e.cx - this.cx, e.cy - this.cy) < 300) e.buffT = 8;
      this.buffT = 8;
      w.sfx('cast', this.cx);
    }
    if (a.projectile) {
      const pr = a.projectile;
      const ang = Math.atan2(p.cy - 6 - this.cy, p.cx - this.cx);
      for (let i = 0; i < pr.count; i++) {
        const off = pr.count === 1 ? 0 : (i / (pr.count - 1) - 0.5) * 2 * pr.spread;
        w.spawnProjectile({
          kind: pr.kind,
          x: this.cx + this.face * 10,
          y: this.cy - 6,
          vx: Math.cos(ang + off) * pr.speed,
          vy: Math.sin(ang + off) * pr.speed,
          r: pr.kind === 'dust' ? 9 : 8,
          team: 'enemy',
          dmg: a.dmg * this.dmgMul * (this.buffT > 0 ? 1.3 : 1),
          parryable: true,
          life: 3.5,
          homing: pr.homing ?? 0,
        });
      }
      w.sfx('cast', this.cx, 0.8);
    }
    if (!a.projectile && !a.lament) w.sfx('swing', this.cx, 0.7);
  }

  updateActive(_dt: number, w: EnemyWorld) {
    const a = this.attack!;
    const b = this.body;
    if (a.leap) {
      if (this.stateT > 0.08 && b.onGround) {
        this.setState('recover');
        return;
      }
    } else if (a.charge) {
      b.vx = this.face * a.charge;
      if (b.hitWall !== 0) {
        // crashed into a wall: dazed
        w.shake(5, 0.2);
        w.sfx('hitArmor', this.cx);
        this.setState('stagger');
        return;
      }
    } else if (a.dive) {
      const tx = this.diveTarget.x - this.cx;
      const ty = this.diveTarget.y - this.cy;
      const d = Math.hypot(tx, ty) || 1;
      b.vx = (tx / d) * 380;
      b.vy = (ty / d) * 380;
      if (d < 16) {
        b.vx *= 0.3;
        b.vy = -120;
      }
    } else if (a.lunge && this.stateT < a.active) {
      b.vx = this.face * a.lunge;
    }
    if (a.dmg > 0 && !a.projectile && !a.lament) {
      const r: Rect =
        a.leap || a.charge || a.dive
          ? { x: b.x - 4, y: b.y + a.top, w: b.w + 8, h: a.height }
          : { x: this.face > 0 ? this.cx : this.cx - a.reach, y: b.y + a.top, w: a.reach, h: a.height };
      w.addHitbox({
        team: 'enemy',
        rect: r,
        dmg: a.dmg * this.dmgMul * (this.buffT > 0 ? 1.3 : 1),
        poise: a.poise,
        knock: a.red ? 300 : 200,
        parryable: !a.red,
        unblockable: a.red,
        attack: this.inst!,
        source: this,
        fromX: this.cx,
        tag: 'light',
      });
    }
    const len = a.leap ? 1.2 : a.active;
    if (this.stateT >= len) this.setState('recover');
  }

  /** Damage from the player. Returns how the blow landed. */
  takeHit(dmg: number, poiseDmg: number, knock: number, fromX: number, heavy: boolean): 'hit' | 'blocked' | 'stagger' | 'kill' {
    if (this.dead) return 'hit';
    // Strażnik: frontal shield stops light attacks unless he is reeling
    if (this.kind === 'straznik' && !heavy && !this.vulnerable && this.state !== 'active' && sign(fromX - this.cx) === this.face) {
      this.hitFlash = 0.3;
      return 'blocked';
    }
    this.hp -= dmg;
    this.hitFlash = 1;
    this.aggro = true;
    const dir = sign(this.cx - fromX);
    const resist = this.kind === 'straznik' ? 0.35 : 1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.setState('dead');
      this.body.vx = dir * knock * 0.8;
      this.body.vy = this.def.flying ? 0 : -160;
      return 'kill';
    }
    this.poise -= poiseDmg;
    // a lament is interrupted by any hit
    if (this.attack?.lament && this.state === 'windup') {
      this.setState('flinch');
      this.attack = null;
    }
    if (this.poise <= 0) {
      this.poise = this.maxPoise;
      this.attack = null;
      this.setState('stagger');
      this.body.vx = dir * knock * resist;
      if (!this.def.flying) this.body.vy = -120 * resist;
      return 'stagger';
    }
    if (this.state === 'idle' || this.state === 'chase' || this.state === 'retreat') {
      this.setState('flinch');
      this.body.vx = dir * knock * 0.4 * resist;
    }
    return 'hit';
  }

  onParried() {
    this.attack = null;
    this.setState('parried');
    this.body.vx = -this.face * 140;
  }
}
