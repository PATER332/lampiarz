// Three bosses with entrances, phases, readable telegraphs and proper deaths.
import { BOSSES, type BossId } from '../data/content';
import { approach, sign, type Rect } from '../core/util';
import { moveBody, type Body } from '../world/level';
import type { Hazard } from '../world/hazards';
import type { AttackInstance, Damageable } from '../world/types';
import type { Enemy, EnemyWorld } from './enemies';

export interface BossWorld extends EnemyWorld {
  spawnHazard(h: Hazard): void;
  spawnMinion(x: number, y: number): Enemy;
  arena: { left: number; right: number; floor: number; top: number };
  setDark(v: number | null): void;
  announce(text: string, sub?: string): void;
}

export interface BossMove {
  id: string;
  windup: number;
  active: number;
  recover: number;
  red: boolean;
  dmg: number;
}

export type BState = 'intro' | 'idle' | 'move' | 'windup' | 'active' | 'recover' | 'stagger' | 'parried' | 'phase' | 'grounded' | 'rise' | 'dying' | 'dead' | 'hidden';

let bid = 5000;

export abstract class Boss implements Damageable {
  id = bid++;
  body: Body;
  face: 1 | -1 = -1;
  hp: number;
  maxHp: number;
  poise: number;
  maxPoise: number;
  dead = false;
  state: BState = 'intro';
  stateT = 0;
  phase = 1;
  move: BossMove | null = null;
  inst: AttackInstance | null = null;
  cooldown = 1.2;
  hitFlash = 0;
  anim = 0;
  name: string;
  title: string;
  defeated = false; // death animation finished
  rewarded = false;
  /** 0..1 progress of the cinematic intro */
  introLen = 2.6;
  lastMoves: string[] = [];

  constructor(
    public bossId: BossId,
    x: number,
    footY: number,
    w: number,
    h: number,
    scale: number,
  ) {
    const def = BOSSES[bossId];
    this.name = def.name;
    this.title = def.title;
    this.maxHp = Math.round(def.hp * scale);
    this.hp = this.maxHp;
    this.maxPoise = def.poise;
    this.poise = def.poise;
    this.body = { x: x - w / 2, y: footY - h, w, h, vx: 0, vy: 0, onGround: false, dropTimer: 0, hitWall: 0 };
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
    return this.state === 'stagger' || this.state === 'parried' || this.state === 'grounded';
  }
  get invulnerable() {
    return this.state === 'intro' || this.state === 'phase' || this.state === 'dying' || this.state === 'dead' || this.state === 'hidden';
  }
  get telegraph(): 'white' | 'red' | null {
    if (this.state !== 'windup' || !this.move) return null;
    return this.move.red ? 'red' : 'white';
  }

  setState(s: BState) {
    this.state = s;
    this.stateT = 0;
  }

  startMove(m: BossMove, w: BossWorld) {
    this.move = m;
    this.inst = w.newAttack();
    this.setState('windup');
    this.lastMoves.push(m.id);
    if (this.lastMoves.length > 3) this.lastMoves.shift();
    w.sfx(m.red ? 'telegraphRed' : 'telegraphWhite', this.cx, 0.9);
  }

  /** choose among candidates, avoiding repeating the same move three times */
  pick<T extends { id: string }>(w: BossWorld, list: [T, number][]): T {
    const filtered = list.filter(([m]) => !(this.lastMoves.length >= 2 && this.lastMoves.slice(-2).every((x) => x === m.id)));
    const use = filtered.length ? filtered : list;
    const total = use.reduce((s, [, wgt]) => s + wgt, 0);
    let r = w.rng.next() * total;
    for (const [m, wgt] of use) {
      r -= wgt;
      if (r <= 0) return m;
    }
    return use[0][0];
  }

  hitbox(w: BossWorld, rect: Rect, dmg: number, opts: { red?: boolean; knock?: number; poise?: number } = {}) {
    const red = opts.red ?? this.move?.red ?? false;
    w.addHitbox({
      team: 'enemy',
      rect,
      dmg,
      poise: opts.poise ?? 40,
      knock: opts.knock ?? 320,
      parryable: !red,
      unblockable: red,
      attack: this.inst ?? w.newAttack(),
      source: this,
      fromX: this.cx,
      tag: 'light',
    });
  }

  takeHit(dmg: number, poiseDmg: number, _knock: number, _fromX: number, _heavy: boolean): 'hit' | 'stagger' | 'kill' | 'blocked' {
    if (this.invulnerable || this.dead) return 'blocked';
    const mul = this.state === 'stagger' || this.state === 'parried' ? 1.5 : 1;
    this.hp -= dmg * mul;
    this.hitFlash = 1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.setState('dying');
      return 'kill';
    }
    if (this.state !== 'stagger' && this.state !== 'grounded') {
      this.poise -= poiseDmg;
      if (this.poise <= 0) {
        this.poise = this.maxPoise;
        this.move = null;
        this.setState('stagger');
        return 'stagger';
      }
    }
    return 'hit';
  }

  onParried(w: BossWorld) {
    this.poise -= 55;
    if (this.poise <= 0) {
      this.poise = this.maxPoise;
      this.move = null;
      this.setState('stagger');
      w.sfx('guardBreak', this.cx);
      return;
    }
    this.move = null;
    this.setState('parried');
  }

  baseUpdate(dt: number) {
    this.anim += dt;
    this.stateT += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.cooldown -= dt;
    if (this.state !== 'stagger' && this.state !== 'grounded') this.poise = Math.min(this.maxPoise, this.poise + this.maxPoise * 0.06 * dt);
  }

  abstract update(dt: number, w: BossWorld): void;
  /** Called once when the HP crosses the phase threshold. */
  checkPhase(w: BossWorld, threshold: number) {
    if (this.phase === 1 && this.hp <= this.maxHp * threshold && this.state !== 'dying') {
      this.phase = 2;
      this.move = null;
      this.setState('phase');
      w.sfx('bossRoar', this.cx);
      w.shake(12, 0.8);
      return true;
    }
    return false;
  }

  ground(dt: number, w: BossWorld) {
    const b = this.body;
    b.vy = Math.min(1000, b.vy + 2200 * dt);
    moveBody(w.level, b, dt);
  }
}

// ======================================================================== KAT
const KAT = {
  cios: { id: 'cios', windup: 0.95, active: 0.15, recover: 0.85, red: false, dmg: 36 },
  zamach: { id: 'zamach', windup: 0.78, active: 0.22, recover: 0.7, red: true, dmg: 28 },
  szarza: { id: 'szarza', windup: 0.7, active: 1.0, recover: 0.5, red: true, dmg: 30 },
  trzy1: { id: 'trzy1', windup: 0.55, active: 0.13, recover: 0.15, red: false, dmg: 26 },
  trzy2: { id: 'trzy2', windup: 0.42, active: 0.2, recover: 0.15, red: true, dmg: 24 },
  trzy3: { id: 'trzy3', windup: 0.6, active: 0.15, recover: 0.9, red: false, dmg: 34 },
} satisfies Record<string, BossMove>;

export class Kat extends Boss {
  constructor(x: number, footY: number, scale: number) {
    super('kat', x, footY, 54, 112, scale);
  }

  update(dt: number, w: BossWorld) {
    this.baseUpdate(dt);
    const b = this.body;
    const p = w.player;
    const dx = p.cx - this.cx;
    const dist = Math.abs(dx);
    const speedMul = this.phase === 2 ? 0.85 : 1;
    switch (this.state) {
      case 'intro':
        b.vx = 0;
        if (this.stateT > this.introLen) this.setState('idle');
        break;
      case 'phase':
        b.vx = 0;
        if (this.stateT > 0.5 && this.stateT - dt <= 0.5) {
          // the roar blows the player back and lights the axe
          w.announce('Topór płonie');
          for (let i = -2; i <= 2; i++) w.spawnHazard({ kind: 'fire', dead: false, t: 0, x: this.cx + i * 60, y: this.feet, w: 50, life: 2, tick: 0, inst: w.newAttack() });
        }
        if (this.stateT > 1.7) this.setState('idle');
        break;
      case 'idle':
      case 'move': {
        if (this.checkPhase(w, 0.5)) break;
        this.face = dx >= 0 ? 1 : -1;
        if (this.cooldown <= 0) {
          const moves: [BossMove, number][] = [];
          if (dist < 105) moves.push([KAT.cios, 3]);
          if (dist < 155) moves.push([KAT.zamach, 2.5]);
          if (dist > 200) moves.push([KAT.szarza, 2]);
          if (this.phase === 2 && dist < 130) moves.push([KAT.trzy1, 3]);
          if (moves.length) {
            this.startMove(this.pick(w, moves), w);
            break;
          }
        }
        const want = dist > 110 ? sign(dx) : 0;
        b.vx = approach(b.vx, want * (this.phase === 2 ? 115 : 88), 600 * dt);
        this.state = want ? 'move' : 'idle';
        break;
      }
      case 'windup': {
        const m = this.move!;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (m.id !== 'szarza') this.face = dx >= 0 ? 1 : -1;
        if (this.stateT >= m.windup * speedMul * w.windupMul) this.setState('active');
        break;
      }
      case 'active': {
        const m = this.move!;
        const f = this.face;
        if (m.id === 'cios' || m.id === 'trzy1' || m.id === 'trzy3') {
          if (this.stateT < 0.05) b.vx = f * 200;
          else b.vx = approach(b.vx, 0, 1600 * dt);
          this.hitbox(w, { x: f > 0 ? this.cx : this.cx - 100, y: b.y - 10, w: 100, h: b.h + 10 }, m.dmg);
          if (this.stateT < dt * 1.5) {
            w.shake(6, 0.2);
            w.sfx('swingHeavy', this.cx);
          }
        } else if (m.id === 'zamach' || m.id === 'trzy2') {
          b.vx = f * 60;
          // low sweep: jump over it or roll through it
          this.hitbox(w, { x: f > 0 ? this.cx - 20 : this.cx - 150, y: this.feet - 40, w: 170, h: 40 }, m.dmg);
          if (this.stateT < dt * 1.5) w.sfx('swingHeavy', this.cx);
          if (this.phase === 2 && this.stateT < dt * 1.5) {
            for (let i = 1; i <= 3; i++) w.spawnHazard({ kind: 'fire', dead: false, t: 0, x: this.cx + f * i * 46, y: this.feet, w: 44, life: 3.2, tick: 0, inst: w.newAttack() });
            w.sfx('fire', this.cx);
          }
        } else if (m.id === 'szarza') {
          b.vx = f * 500;
          this.hitbox(w, { x: b.x - 6, y: b.y + 10, w: b.w + 12, h: b.h - 10 }, m.dmg, { knock: 420 });
          if (b.hitWall !== 0) {
            w.shake(10, 0.4);
            w.sfx('hitArmor', this.cx);
            w.announce('Kat zachwiał się');
            this.move = null;
            this.setState('stagger');
            break;
          }
        }
        if (this.stateT >= m.active) this.setState('recover');
        break;
      }
      case 'recover': {
        const m = this.move!;
        b.vx = approach(b.vx, 0, 1200 * dt);
        const next = m.id === 'trzy1' ? KAT.trzy2 : m.id === 'trzy2' ? KAT.trzy3 : null;
        if (this.stateT >= m.recover) {
          if (next) {
            this.face = dx >= 0 ? 1 : -1;
            this.startMove(next, w);
          } else {
            this.move = null;
            this.cooldown = (this.phase === 2 ? 0.35 : 0.6) + w.rng.next() * 0.5;
            this.setState('idle');
          }
        }
        break;
      }
      case 'stagger':
        b.vx = approach(b.vx, 0, 1000 * dt);
        if (this.stateT > 1.8) this.setState('idle');
        break;
      case 'parried':
        b.vx = approach(b.vx, 0, 1000 * dt);
        if (this.stateT > 0.75) this.setState('idle');
        break;
      case 'dying':
        b.vx = 0;
        if (this.stateT > 2.4) {
          this.dead = true;
          this.defeated = true;
        }
        break;
    }
    this.ground(dt, w);
  }
}

// ======================================================================== PASTERZ CIEM
const PAS = {
  roj: { id: 'roj', windup: 0.85, active: 0.1, recover: 0.8, red: false, dmg: 12 },
  nurek: { id: 'nurek', windup: 0.95, active: 0.9, recover: 0.2, red: true, dmg: 34 },
  wezwanie: { id: 'wezwanie', windup: 0.8, active: 0.1, recover: 0.7, red: false, dmg: 0 },
  pierscien: { id: 'pierscien', windup: 0.9, active: 0.1, recover: 0.9, red: true, dmg: 20 },
} satisfies Record<string, BossMove>;

export class Pasterz extends Boss {
  hoverY: number;
  minions: Enemy[] = [];
  teleportT = 0;

  constructor(x: number, footY: number, scale: number) {
    super('pasterz', x, footY - 170, 48, 92, scale);
    this.hoverY = footY - 230;
    this.introLen = 2.8;
  }

  update(dt: number, w: BossWorld) {
    this.baseUpdate(dt);
    const b = this.body;
    const p = w.player;
    const dx = p.cx - this.cx;
    const A = w.arena;
    const fly = () => {
      const ty = this.hoverY + Math.sin(this.anim * 1.4) * 14;
      b.vy = approach(b.vy, (ty - b.y) * 3, 900 * dt);
      moveBody(w.level, b, dt, true);
    };
    this.minions = this.minions.filter((m) => !m.dead);
    switch (this.state) {
      case 'intro':
        b.vx = 0;
        fly();
        if (this.stateT > this.introLen) this.setState('idle');
        return;
      case 'phase':
        b.vx = 0;
        fly();
        if (this.stateT > 0.6 && this.stateT - dt <= 0.6) {
          w.setDark(0.82);
          w.announce('Ćmy gaszą światło');
        }
        if (this.stateT > 1.8) this.setState('idle');
        return;
      case 'idle':
      case 'move': {
        if (this.checkPhase(w, 0.5)) return;
        this.face = dx >= 0 ? 1 : -1;
        // drift to keep a hovering distance from the player
        const side = this.cx < p.cx ? -1 : 1;
        const tx = Math.max(A.left + 80, Math.min(A.right - 80, p.cx + side * 190));
        b.vx = approach(b.vx, Math.max(-150, Math.min(150, (tx - this.cx) * 1.2)), 400 * dt);
        if (this.cooldown <= 0) {
          const list: [BossMove, number][] = [
            [PAS.roj, 3],
            [PAS.nurek, 2.5],
          ];
          if (this.minions.length < (this.phase === 2 ? 3 : 2)) list.push([PAS.wezwanie, 1.4]);
          if (this.phase === 2) list.push([PAS.pierscien, 2.2]);
          this.startMove(this.pick(w, list), w);
          // phase 2: blink to the other side before some attacks
          if (this.phase === 2 && w.rng.next() < 0.45 && this.move?.id !== 'nurek') {
            w.sfx('teleport', this.cx);
            const nx = p.cx > (A.left + A.right) / 2 ? A.left + 140 : A.right - 140;
            b.x = nx - b.w / 2;
            w.sfx('teleport', this.cx);
          }
        }
        fly();
        return;
      }
      case 'windup': {
        const m = this.move!;
        this.face = dx >= 0 ? 1 : -1;
        if (m.id === 'nurek') {
          // glide above the player; a shadow marks the landing spot
          b.vx = approach(b.vx, Math.max(-420, Math.min(420, (p.cx - this.cx) * 4)), 1600 * dt);
        } else b.vx = approach(b.vx, 0, 600 * dt);
        fly();
        if (this.stateT >= m.windup * w.windupMul * (this.phase === 2 ? 0.85 : 1)) {
          this.setState('active');
          this.beginActive(w);
        }
        return;
      }
      case 'active': {
        const m = this.move!;
        if (m.id === 'nurek') {
          b.vx = 0;
          b.vy = Math.min(1100, b.vy + 4200 * dt);
          moveBody(w.level, b, dt);
          this.hitbox(w, { x: b.x - 8, y: b.y, w: b.w + 16, h: b.h }, m.dmg, { knock: 380 });
          if (b.onGround) {
            w.shake(10, 0.35);
            w.sfx('bellDrop', this.cx, 0.7);
            this.hitbox(w, { x: this.cx - 70, y: this.feet - 30, w: 140, h: 30 }, m.dmg * 0.6, { knock: 300 });
            this.move = null;
            this.setState('grounded');
          } else if (this.stateT > m.active) {
            this.setState('recover');
          }
          return;
        }
        fly();
        if (this.stateT >= m.active) this.setState('recover');
        return;
      }
      case 'recover': {
        b.vx = approach(b.vx, 0, 600 * dt);
        fly();
        if (this.stateT >= (this.move?.recover ?? 0.6)) {
          this.move = null;
          this.cooldown = (this.phase === 2 ? 0.5 : 0.9) + w.rng.next() * 0.6;
          this.setState('idle');
        }
        return;
      }
      case 'grounded':
        b.vx = approach(b.vx, 0, 900 * dt);
        this.ground(dt, w);
        if (this.stateT > 1.7) this.setState('rise');
        return;
      case 'rise':
        b.vy = -260;
        moveBody(w.level, b, dt, true);
        if (b.y <= this.hoverY + 10 || this.stateT > 1) {
          this.cooldown = 0.6;
          this.setState('idle');
        }
        return;
      case 'stagger':
        b.vx = approach(b.vx, 0, 600 * dt);
        this.ground(dt, w);
        if (this.stateT > 2) this.setState('rise');
        return;
      case 'parried':
        b.vx = approach(b.vx, 0, 600 * dt);
        fly();
        if (this.stateT > 0.7) this.setState('idle');
        return;
      case 'dying':
        b.vx = 0;
        this.ground(dt, w);
        if (this.stateT > 2.6) {
          this.dead = true;
          this.defeated = true;
          w.setDark(null);
        }
        return;
    }
  }

  beginActive(w: BossWorld) {
    const m = this.move!;
    const p = w.player;
    if (m.id === 'roj') {
      const n = this.phase === 2 ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.4 + (p.cx < this.cx ? 0 : 0);
        w.spawnProjectile({ kind: 'moth', x: this.cx, y: this.cy - 10, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: 9, team: 'enemy', dmg: m.dmg, parryable: true, life: 4, homing: 1.4 });
      }
      w.sfx('cast', this.cx);
    } else if (m.id === 'wezwanie') {
      for (let i = 0; i < 2; i++) this.minions.push(w.spawnMinion(this.cx + (i ? 40 : -40), this.cy));
      w.sfx('cast', this.cx);
    } else if (m.id === 'pierscien') {
      w.spawnHazard({ kind: 'ring', dead: false, t: 0, x: this.cx, y: this.cy, r: 20, speed: 260, max: 330, band: 26, dmg: m.dmg, inst: w.newAttack() });
      w.sfx('bellToll', this.cx, 0.6);
    } else if (m.id === 'nurek') {
      this.body.vy = 200;
      w.sfx('swingHeavy', this.cx);
    }
  }
}

// ======================================================================== ECHO DZWONU
const BELL = {
  spadek: { id: 'spadek', windup: 1.05, active: 1.2, recover: 0.2, red: true, dmg: 46 },
  ton: { id: 'ton', windup: 0.8, active: 0.1, recover: 1.0, red: true, dmg: 22 },
  wahadlo: { id: 'wahadlo', windup: 0.9, active: 1.4, recover: 0.6, red: true, dmg: 30 },
} satisfies Record<string, BossMove>;

const SMITH = {
  mlot: { id: 'mlot', windup: 0.72, active: 0.14, recover: 0.75, red: false, dmg: 34 },
  lancuch: { id: 'lancuch', windup: 0.68, active: 0.2, recover: 0.7, red: true, dmg: 28 },
  odlew: { id: 'odlew', windup: 0.6, active: 0.1, recover: 1.0, red: false, dmg: 30 },
  skok: { id: 'skok', windup: 0.55, active: 0.7, recover: 0.6, red: true, dmg: 32 },
} satisfies Record<string, BossMove>;

export class Dzwon extends Boss {
  /** rail height of the hanging bell (top of body) */
  railY: number;
  homeX: number;
  swingT = 0;
  tollT = 6;
  /** phase 2: the bellfounder fights; the cracked bell stays at the back */
  crackedX = 0;

  constructor(x: number, footY: number, scale: number) {
    super('dzwon', x, footY, 118, 132, scale);
    this.railY = footY - 132 - 190;
    this.body.y = this.railY;
    this.homeX = x;
    this.introLen = 3.2;
    this.name = 'Gromnica';
  }

  get isBell() {
    return this.phase === 1;
  }

  update(dt: number, w: BossWorld) {
    this.baseUpdate(dt);
    if (this.phase === 1) this.updateBell(dt, w);
    else this.updateSmith(dt, w);
  }

  updateBell(dt: number, w: BossWorld) {
    const b = this.body;
    const p = w.player;
    const A = w.arena;
    const hang = () => {
      b.vy = approach(b.vy, (this.railY - b.y) * 4, 1200 * dt);
      b.y += b.vy * dt;
      b.x += b.vx * dt;
      b.x = Math.max(A.left + 30, Math.min(A.right - 30 - b.w, b.x));
    };
    switch (this.state) {
      case 'intro':
        hang();
        if (this.stateT > this.introLen) this.setState('idle');
        return;
      case 'idle':
      case 'move': {
        if (this.hp <= this.maxHp * 0.55) {
          this.toSmith(w);
          return;
        }
        b.vx = approach(b.vx, (this.homeX - this.cx) * 0.8, 200 * dt);
        if (this.cooldown <= 0) {
          this.startMove(this.pick(w, [[BELL.spadek, 3], [BELL.ton, 2], [BELL.wahadlo, 2]]), w);
        }
        hang();
        return;
      }
      case 'windup': {
        const m = this.move!;
        if (m.id === 'spadek') b.vx = approach(b.vx, Math.max(-520, Math.min(520, (p.cx - this.cx) * 5)), 2400 * dt);
        else if (m.id === 'wahadlo') b.vx = approach(b.vx, ((p.cx > this.cx ? A.left + 60 : A.right - 60) - this.cx) * 3, 1400 * dt);
        else b.vx = approach(b.vx, 0, 600 * dt);
        hang();
        if (this.stateT >= m.windup * w.windupMul) {
          this.setState('active');
          if (m.id === 'ton') {
            w.spawnHazard({ kind: 'ring', dead: false, t: 0, x: this.cx, y: this.cy, r: 30, speed: 300, max: 760, band: 28, dmg: m.dmg, inst: w.newAttack() });
            w.sfx('bellToll', this.cx);
            w.shake(6, 0.4);
          } else if (m.id === 'spadek') {
            b.vx = 0;
            b.vy = 300;
            w.sfx('swingHeavy', this.cx);
          } else {
            this.swingT = 0;
            this.swingDir = this.cx < (A.left + A.right) / 2 ? 1 : -1;
            w.sfx('pendulum', this.cx, 1);
          }
        }
        return;
      }
      case 'active': {
        const m = this.move!;
        if (m.id === 'spadek') {
          b.vy = Math.min(1500, b.vy + 5200 * dt);
          b.y += b.vy * dt;
          this.hitbox(w, { x: b.x + 6, y: b.y + 20, w: b.w - 12, h: b.h - 20 }, m.dmg, { knock: 420 });
          if (b.y + b.h >= A.floor) {
            b.y = A.floor - b.h;
            b.vy = 0;
            w.shake(14, 0.5);
            w.sfx('bellDrop', this.cx);
            w.spawnShock(this.cx - 70, A.floor, -1, 16, 'enemy');
            w.spawnShock(this.cx + 70, A.floor, 1, 16, 'enemy');
            this.move = null;
            this.setState('grounded');
          }
          return;
        }
        if (m.id === 'wahadlo') {
          // one low pass across the arena: roll through it
          this.swingT += dt;
          const k = Math.min(1, this.swingT / m.active);
          const from = this.swingDir > 0 ? A.left + 60 : A.right - 60;
          const to = this.swingDir > 0 ? A.right - 60 : A.left + 60;
          const x = from + (to - from) * (0.5 - Math.cos(k * Math.PI) / 2);
          const dip = Math.sin(k * Math.PI);
          b.x = x - b.w / 2;
          b.y = this.railY + dip * (A.floor - 6 - b.h - this.railY);
          this.hitbox(w, { x: b.x + 10, y: b.y + 30, w: b.w - 20, h: b.h - 30 }, m.dmg, { knock: 380 });
          if (k >= 1) this.setState('recover');
          return;
        }
        hang();
        if (this.stateT >= m.active) this.setState('recover');
        return;
      }
      case 'grounded':
        b.vx = 0;
        if (this.stateT > 2.5) {
          this.setState('rise');
          w.sfx('pendulum', this.cx, 0.6);
        }
        return;
      case 'rise':
        b.vy = -220;
        b.y += b.vy * dt;
        if (b.y <= this.railY) {
          b.y = this.railY;
          this.cooldown = 0.8;
          this.setState('idle');
        }
        return;
      case 'recover':
        b.vx = approach(b.vx, 0, 600 * dt);
        hang();
        if (this.stateT >= (this.move?.recover ?? 0.6)) {
          this.move = null;
          this.cooldown = 0.7 + w.rng.next() * 0.6;
          this.setState('idle');
        }
        return;
      case 'stagger':
      case 'parried':
        hang();
        if (this.stateT > 1.2) this.setState('idle');
        return;
      case 'phase':
        // the bell falls and cracks; Mikołaj climbs out
        b.vy = Math.min(1500, b.vy + 3000 * dt);
        b.y = Math.min(A.floor - b.h, b.y + b.vy * dt);
        if (this.stateT > 0.6 && this.stateT - dt <= 0.6) {
          w.shake(16, 0.7);
          w.sfx('bellDrop', this.cx);
        }
        if (this.stateT > 2.6) {
          this.crackedX = this.cx;
          this.phase = 2;
          this.name = 'Mikołaj';
          this.title = 'Odlewnik w Spiżu';
          const fx = this.cx;
          this.body = { x: fx - 20, y: A.floor - 100, w: 40, h: 100, vx: 0, vy: 0, onGround: true, dropTimer: 0, hitWall: 0 };
          this.maxPoise = 150;
          this.poise = 150;
          this.cooldown = 1;
          this.tollT = 7;
          this.setState('idle');
          w.announce('Mikołaj', 'Odlewnik w Spiżu');
        }
        return;
      case 'dying':
        if (this.stateT > 2.6) {
          this.dead = true;
          this.defeated = true;
        }
        return;
    }
  }

  swingDir: 1 | -1 = 1;

  toSmith(w: BossWorld) {
    this.move = null;
    this.setState('phase');
    w.sfx('bossRoar', this.cx);
    w.shake(10, 0.6);
    w.announce('Spiż pęka');
  }

  updateSmith(dt: number, w: BossWorld) {
    const b = this.body;
    const p = w.player;
    const A = w.arena;
    const dx = p.cx - this.cx;
    const dist = Math.abs(dx);
    // the cracked bell keeps tolling from the back of the arena
    if (this.state !== 'dying' && this.state !== 'dead') {
      this.tollT -= dt;
      if (this.tollT <= 0) {
        this.tollT = 9;
        w.spawnHazard({ kind: 'ring', dead: false, t: 0, x: this.crackedX, y: A.floor - 60, r: 30, speed: 280, max: 760, band: 26, dmg: 18, inst: w.newAttack() });
        w.sfx('bellToll', this.crackedX, 0.9);
      }
    }
    switch (this.state) {
      case 'idle':
      case 'move': {
        this.face = dx >= 0 ? 1 : -1;
        if (this.cooldown <= 0) {
          const list: [BossMove, number][] = [];
          if (dist < 95) list.push([SMITH.mlot, 3]);
          if (dist < 240) list.push([SMITH.lancuch, 2.4]);
          if (dist > 160) list.push([SMITH.skok, 2]);
          list.push([SMITH.odlew, 1.4]);
          this.startMove(this.pick(w, list), w);
          break;
        }
        const want = dist > 90 ? sign(dx) : 0;
        b.vx = approach(b.vx, want * 140, 900 * dt);
        break;
      }
      case 'windup': {
        const m = this.move!;
        if (m.id !== 'skok') this.face = dx >= 0 ? 1 : -1;
        b.vx = approach(b.vx, 0, 1000 * dt);
        if (this.stateT >= m.windup * w.windupMul) {
          this.setState('active');
          if (m.id === 'odlew') {
            for (const off of [0, -150, 150]) {
              const x = Math.max(A.left + 40, Math.min(A.right - 40, p.cx + off));
              w.spawnHazard({ kind: 'molten', dead: false, t: 0, x, top: A.top, floor: A.floor, w: 52, warn: 1.0 + Math.abs(off) / 600, life: 0.55, dmg: m.dmg, inst: w.newAttack() });
            }
            w.sfx('cast', this.cx);
          } else if (m.id === 'skok') {
            b.vx = this.face * Math.min(520, dist * 1.4);
            b.vy = -620;
            w.sfx('jump', this.cx, 1);
          } else w.sfx('swingHeavy', this.cx);
        }
        break;
      }
      case 'active': {
        const m = this.move!;
        const f = this.face;
        if (m.id === 'mlot') {
          this.hitbox(w, { x: f > 0 ? this.cx : this.cx - 92, y: b.y - 6, w: 92, h: b.h + 6 }, m.dmg);
          if (this.stateT < dt * 1.5) w.shake(7, 0.25);
        } else if (m.id === 'lancuch') {
          this.hitbox(w, { x: f > 0 ? this.cx : this.cx - 240, y: b.y + 30, w: 240, h: 30 }, m.dmg, { knock: 260 });
        } else if (m.id === 'skok') {
          this.hitbox(w, { x: b.x - 6, y: b.y, w: b.w + 12, h: b.h }, m.dmg, { knock: 360 });
          if (this.stateT > 0.12 && b.onGround) {
            w.shake(10, 0.3);
            w.sfx('bellDrop', this.cx, 0.6);
            w.spawnShock(this.cx - 40, this.feet, -1, 16, 'enemy');
            w.spawnShock(this.cx + 40, this.feet, 1, 16, 'enemy');
            this.setState('recover');
            break;
          }
        }
        if (m.id !== 'skok' && this.stateT >= m.active) this.setState('recover');
        if (m.id === 'skok' && this.stateT > 1.6) this.setState('recover');
        break;
      }
      case 'recover': {
        b.vx = approach(b.vx, 0, 1200 * dt);
        if (this.stateT >= (this.move?.recover ?? 0.6)) {
          this.move = null;
          this.cooldown = 0.35 + w.rng.next() * 0.45;
          this.setState('idle');
        }
        break;
      }
      case 'stagger':
        b.vx = approach(b.vx, 0, 1000 * dt);
        if (this.stateT > 1.8) this.setState('idle');
        break;
      case 'parried':
        b.vx = approach(b.vx, 0, 1000 * dt);
        if (this.stateT > 0.7) this.setState('idle');
        break;
      case 'dying':
        b.vx = 0;
        if (this.stateT > 2.8) {
          this.dead = true;
          this.defeated = true;
        }
        break;
    }
    this.ground(dt, w);
  }

  get telegraph(): 'white' | 'red' | null {
    if (this.state !== 'windup' || !this.move) return null;
    return this.move.red ? 'red' : 'white';
  }
}

export function createBoss(id: BossId, x: number, footY: number, scale: number): Boss {
  if (id === 'kat') return new Kat(x, footY, scale);
  if (id === 'pasterz') return new Pasterz(x, footY, scale);
  return new Dzwon(x, footY, scale);
}
