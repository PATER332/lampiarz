// The Bell-ringer: movement, stamina-based combat, rolls, block/parry, flasks, skill.
import { BASE, WEAPONS, type MeleeHit, type WeaponDef } from '../data/content';
import type { Input } from '../core/input';
import { approach, clamp } from '../core/util';
import type { SaveData } from '../save';
import { computeStats, type Stats } from '../stats';
import { moveBody, type Body } from '../world/level';
import type { AttackInstance, Damageable, WorldApi } from '../world/types';

export type PState = 'idle' | 'run' | 'air' | 'roll' | 'attack' | 'charge' | 'heavy' | 'block' | 'parry' | 'hurt' | 'guardBroken' | 'bounced' | 'heal' | 'skill' | 'dead' | 'rest';

export const P = {
  run: 225,
  accGround: 2600,
  accAir: 1500,
  gravity: 2200,
  jump: 690,
  maxFall: 900,
  roll: 390,
  rollTime: 0.42,
  rollIStart: 0.04,
  rollIEnd: 0.34,
  rollCost: 22,
  coyote: 0.1,
  riposte: 1.25,
  skillCost: 2,
};

interface Swing {
  def: MeleeHit;
  index: number;
  heavy: boolean;
  charge: number; // 0..1
  inst: AttackInstance;
  spinIndex: number;
  air: boolean;
  shockDone: boolean;
}

interface CapePoint {
  x: number;
  y: number;
  px: number;
  py: number;
}

export class Player implements Damageable {
  id = 1;
  body: Body;
  face: 1 | -1 = 1;
  hp: number;
  maxHp = 0;
  stamina: number;
  staminaDelay = 0;
  staminaFlash = 0;
  state: PState = 'idle';
  stateT = 0;
  dead = false;
  stats!: Stats;
  weapon!: WeaponDef;
  swing: Swing | null = null;
  comboNext = 0;
  invuln = 0;
  blockStart = 0;
  blockHeld = false;
  resonance = 0;
  flasks: number;
  flaskMax: number;
  healApplied = false;
  riposteT = 0;
  dodgeBuffT = 0;
  coyote = 0;
  jumpCut = false;
  runPhase = 0;
  stepAcc = 0;
  landT = 0;
  hurtFlash = 0;
  lastSafe = { x: 0, y: 0 };
  cape: CapePoint[] = [];
  skillFlash = 0;
  /** set by the world when a roll passes through an attack */
  perfectT = 0;

  constructor(
    x: number,
    footY: number,
    public save: SaveData,
  ) {
    this.body = { x: x - 9, y: footY - 42, w: 18, h: 42, vx: 0, vy: 0, onGround: false, dropTimer: 0, hitWall: 0 };
    this.refreshStats();
    this.hp = this.maxHp;
    this.stamina = this.stats.maxStamina;
    this.flaskMax = this.stats.flasks;
    this.flasks = this.flaskMax;
    this.lastSafe = { x, y: footY };
    for (let i = 0; i < 7; i++) this.cape.push({ x, y: footY - 34 + i * 4, px: x, py: footY - 34 + i * 4 });
  }

  refreshStats() {
    const prevMax = this.maxHp ?? 0;
    this.stats = computeStats(this.save);
    this.weapon = WEAPONS[this.save.weapon];
    this.maxHp = this.stats.maxHp;
    if (prevMax && this.hp > this.maxHp) this.hp = this.maxHp;
    if (this.stamina > this.stats.maxStamina) this.stamina = this.stats.maxStamina;
    this.flaskMax = this.stats.flasks;
    if (this.flasks > this.flaskMax) this.flasks = this.flaskMax;
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
  get pips() {
    return Math.floor(this.resonance);
  }
  get rolling() {
    return this.state === 'roll';
  }
  get iframes() {
    return this.state === 'roll' && this.stateT >= P.rollIStart && this.stateT <= P.rollIEnd;
  }
  get blocking() {
    return this.state === 'block';
  }
  get hyperArmor() {
    if (!this.weapon.hyperArmor || !this.swing) return false;
    const d = this.swing.def;
    return (this.state === 'attack' || this.state === 'heavy') && this.stateT < d.windup + d.active;
  }
  /** parry is possible only during the first moments of a fresh block */
  parryWindow(world: WorldApi) {
    return this.state === 'block' && world.time - this.blockStart <= this.weapon.parryWindow * this.stats.parryMul;
  }

  setState(s: PState) {
    this.state = s;
    this.stateT = 0;
  }

  spend(stamina: number): boolean {
    if (this.stamina <= 0) {
      this.staminaFlash = 0.4;
      return false;
    }
    this.stamina -= stamina;
    this.staminaDelay = BASE.staminaDelay;
    return true;
  }

  addResonance(v: number) {
    this.resonance = Math.min(this.stats.pips, this.resonance + v * this.stats.resonanceGain);
  }

  heal(v: number) {
    this.hp = Math.min(this.maxHp, this.hp + v);
  }

  restoreAll() {
    this.refreshStats();
    this.hp = this.maxHp;
    this.stamina = this.stats.maxStamina;
    this.flasks = Math.max(0, this.flaskMax - (this.save.expedition?.flaskPenalty ?? 0));
  }

  // ---------------------------------------------------------------- update
  update(dt: number, input: Input, world: WorldApi) {
    this.stateT += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.riposteT = Math.max(0, this.riposteT - dt);
    this.dodgeBuffT = Math.max(0, this.dodgeBuffT - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    this.staminaFlash = Math.max(0, this.staminaFlash - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.skillFlash = Math.max(0, this.skillFlash - dt * 2);
    this.perfectT = Math.max(0, this.perfectT - dt);
    const b = this.body;
    const wasGround = b.onGround;

    if (this.state === 'dead' || this.state === 'rest') {
      b.vx = approach(b.vx, 0, P.accGround * dt);
      b.vy = Math.min(P.maxFall, b.vy + P.gravity * dt);
      moveBody(world.level, b, dt);
      this.updateCape(dt);
      return;
    }

    // stamina
    if (this.staminaDelay > 0) this.staminaDelay -= dt;
    else if (this.state !== 'roll' && this.state !== 'attack' && this.state !== 'heavy' && this.state !== 'charge') {
      const rate = this.state === 'block' ? 0.35 : this.state === 'guardBroken' ? 0 : 1;
      this.stamina = Math.min(this.stats.maxStamina, this.stamina + this.stats.staminaRegen * rate * dt);
    }

    if (b.onGround) this.coyote = P.coyote;
    else this.coyote -= dt;

    const ax = input.axis();
    const free = this.state === 'idle' || this.state === 'run' || this.state === 'air';

    switch (this.state) {
      case 'idle':
      case 'run':
      case 'air': {
        const acc = b.onGround ? P.accGround : P.accAir;
        b.vx = approach(b.vx, ax * P.run, acc * dt);
        if (ax !== 0) this.face = ax > 0 ? 1 : -1;
        this.state = !b.onGround ? 'air' : Math.abs(b.vx) > 20 ? 'run' : 'idle';
        break;
      }
      case 'roll': {
        const k = this.stateT / P.rollTime;
        b.vx = this.face * P.roll * (k < 0.75 ? 1 : 1 - (k - 0.75) * 3);
        if (this.stateT >= P.rollTime) this.setState(b.onGround ? 'idle' : 'air');
        break;
      }
      case 'attack':
      case 'heavy':
        this.updateSwing(dt, input, world);
        break;
      case 'charge': {
        b.vx = approach(b.vx, 0, P.accGround * dt);
        const max = this.weapon.heavy.chargeMax;
        if (!input.held('heavy') || this.stateT >= max + 0.35) {
          this.startSwing(world, true, Math.min(1, this.stateT / max));
        } else if (this.stateT >= max && this.stateT - dt < max) {
          world.sfx('charge', this.cx);
        }
        break;
      }
      case 'block': {
        b.vx = approach(b.vx, ax * 55, P.accGround * dt);
        if (!input.held('block')) this.setState('idle');
        break;
      }
      case 'parry':
        b.vx = approach(b.vx, 0, P.accGround * dt);
        if (this.stateT > 0.28) this.setState(input.held('block') ? 'block' : 'idle');
        break;
      case 'hurt':
        b.vx = approach(b.vx, 0, 900 * dt);
        if (this.stateT > 0.32) this.setState('idle');
        break;
      case 'bounced':
        b.vx = approach(b.vx, 0, 900 * dt);
        if (this.stateT > 0.38) this.setState('idle');
        break;
      case 'guardBroken':
        b.vx = approach(b.vx, 0, 900 * dt);
        if (this.stateT > 0.9) this.setState('idle');
        break;
      case 'heal': {
        b.vx = approach(b.vx, 0, P.accGround * dt);
        const t = this.stats.flaskTime;
        if (!this.healApplied && this.stateT >= t * 0.55) {
          this.healApplied = true;
          this.heal(this.maxHp * this.stats.flaskHeal);
          world.sfx('heal', this.cx);
        }
        if (this.stateT >= t) this.setState('idle');
        break;
      }
      case 'skill': {
        b.vx = approach(b.vx, 0, P.accGround * dt);
        if (this.stateT >= 0.24 && this.stateT - dt < 0.24) this.releaseSkill(world);
        if (this.stateT >= 0.6) this.setState('idle');
        break;
      }
    }

    // ---- actions available from free movement (input buffered)
    if (free || this.canCancel()) {
      if (input.buffered('roll') && this.stamina > 0 && (free || this.canCancel())) {
        input.consume('roll');
        if (this.spend(P.rollCost)) this.startRoll(ax, world);
      } else if (free) {
        if (input.buffered('jump') && (b.onGround || this.coyote > 0)) {
          input.consume('jump');
          if (input.held('down') && this.onLedge(world)) {
            b.dropTimer = 0.25;
            b.y += 2;
          } else {
            b.vy = -P.jump;
            this.coyote = 0;
            this.jumpCut = false;
            world.sfx('jump', this.cx, 0.6);
          }
        } else if (input.buffered('light')) {
          input.consume('light');
          if (this.stamina > 0) this.startSwing(world, false, 0, 0);
          else this.staminaFlash = 0.4;
        } else if (input.held('heavy') && b.onGround) {
          if (this.stamina > 0) {
            input.consume('heavy');
            this.setState('charge');
          } else this.staminaFlash = 0.4;
        } else if (input.held('block') && b.onGround) {
          this.setState('block');
          this.blockStart = world.time;
        } else if (input.buffered('heal') && b.onGround) {
          input.consume('heal');
          if (this.flasks > 0) {
            this.flasks--;
            this.healApplied = false;
            this.setState('heal');
            world.sfx('interact', this.cx, 0.5);
          } else world.sfx('deny', this.cx);
        } else if (input.buffered('skill')) {
          input.consume('skill');
          if (this.pips >= P.skillCost) {
            this.resonance -= P.skillCost;
            this.setState('skill');
            world.sfx('charge', this.cx, 0.7);
          } else world.sfx('deny', this.cx);
        }
      }
    }
    // a fresh press of block while already blocking restarts the parry window
    if (this.state === 'block' && input.buffered('block', 0.05) && world.time - this.blockStart > 0.3) {
      this.blockStart = world.time;
      input.consume('block');
    }

    // variable jump height
    if (this.state === 'air' && b.vy < 0 && !input.held('jump') && !this.jumpCut) {
      b.vy *= 0.45;
      this.jumpCut = true;
    }

    // gravity & movement
    const grav = this.state === 'attack' && this.swing?.air ? P.gravity * 0.55 : P.gravity;
    b.vy = Math.min(P.maxFall, b.vy + grav * dt);
    moveBody(world.level, b, dt);

    if (b.onGround && !wasGround) {
      this.landT = 0.18;
      world.sfx('land', this.cx, 0.5);
    }
    if (b.onGround) {
      // remember solid footing for pit recovery
      if (world.level.groundBelow(b.x + 2, this.feet) && world.level.groundBelow(b.x + b.w - 2, this.feet)) this.lastSafe = { x: this.cx, y: this.feet };
    }

    // animation phase & footsteps
    if (this.state === 'run') {
      this.runPhase += (Math.abs(b.vx) / P.run) * dt * 11;
      this.stepAcc += Math.abs(b.vx) * dt;
      if (this.stepAcc > 52) {
        this.stepAcc = 0;
        world.sfx('step', this.cx, 0.45);
      }
    } else this.runPhase += dt * 2;

    this.updateCape(dt);
  }

  onLedge(world: WorldApi) {
    const ty = Math.floor((this.feet + 2) / 32);
    const tx = Math.floor(this.cx / 32);
    return world.level.tile(tx, ty) === 2;
  }

  canCancel(): boolean {
    if ((this.state === 'attack' || this.state === 'heavy') && this.swing) {
      const d = this.swing.def;
      const into = this.stateT - d.windup - d.active;
      return into >= d.recover * d.rollCancel;
    }
    return false;
  }

  startRoll(ax: number, world: WorldApi) {
    if (ax !== 0) this.face = ax > 0 ? 1 : -1;
    this.swing = null;
    this.setState('roll');
    world.sfx('roll', this.cx);
  }

  startSwing(world: WorldApi, heavy: boolean, charge: number, index = 0) {
    const w = this.weapon;
    const def = heavy ? w.heavy : w.combo[index];
    const cost = def.stamina + (heavy ? this.stats.heavyStamina : 0);
    if (!heavy && !this.spend(cost)) return;
    if (heavy) this.spend(cost);
    this.swing = { def, index, heavy, charge, inst: world.newAttack(), spinIndex: 0, air: !this.body.onGround, shockDone: false };
    this.comboNext = (index + 1) % w.combo.length;
    this.setState(heavy ? 'heavy' : 'attack');
  }

  updateSwing(dt: number, input: Input, world: WorldApi) {
    const s = this.swing;
    const b = this.body;
    if (!s) {
      this.setState('idle');
      return;
    }
    const d = s.def;
    const t = this.stateT;
    const end = d.windup + d.active + d.recover;
    // movement: small lunge into the blow
    if (!s.air) {
      if (t < d.windup) b.vx = approach(b.vx, 0, P.accGround * dt);
      else if (t < d.windup + d.active) b.vx = this.face * d.lunge;
      else b.vx = approach(b.vx, 0, P.accGround * dt * 0.8);
    }
    if (t >= d.windup && t - dt < d.windup) {
      world.sfx(d.sound === 'heavy' ? 'swingHeavy' : d.sound === 'blade' ? 'swingBlade' : 'swing', this.cx);
    }
    // active frames: emit hitbox every step
    if (t >= d.windup && t < d.windup + d.active) {
      const spin = (d as WeaponDef['heavy']).spin;
      if (s.heavy && spin) {
        const seg = Math.min(spin - 1, Math.floor(((t - d.windup) / d.active) * spin));
        if (seg !== s.spinIndex) {
          s.spinIndex = seg;
          s.inst = world.newAttack();
          world.sfx('swingBlade', this.cx, 0.7);
        }
      }
      const reach = d.reach;
      const x = spin && s.heavy ? this.cx - reach : this.face > 0 ? this.cx + 2 : this.cx - 2 - reach;
      const w = spin && s.heavy ? reach * 2 : reach;
      let dmg = d.dmg * this.stats.dmgMul;
      let poise = d.poise;
      if (s.heavy) {
        const bonus = 1 + (this.weapon.heavy.chargeBonus * s.charge);
        dmg *= bonus * this.stats.heavyMul;
        poise *= bonus * (this.stats.heavyMul > 1 ? 1.25 : 1);
      }
      if (this.stats.lowHpBonus && this.hp < this.maxHp * 0.35) dmg *= 1 + this.stats.lowHpBonus;
      if (this.dodgeBuffT > 0) dmg *= 1 + this.stats.dodgeBuff;
      world.addHitbox({
        team: 'player',
        rect: { x, y: b.y + d.top, w, h: d.height },
        dmg,
        poise,
        knock: s.heavy ? 260 : 120,
        parryable: false,
        unblockable: false,
        attack: s.inst,
        source: this,
        fromX: this.cx,
        tag: s.heavy ? 'heavy' : 'light',
        breaksWalls: true,
      });
      // hammer: charged slam sends a ground wave
      if (s.heavy && this.weapon.heavy.shockwave && !s.shockDone && s.charge >= 0.45 && t >= d.windup + d.active * 0.5) {
        s.shockDone = true;
        world.spawnShock(this.cx + this.face * 40, this.feet, this.face, dmg * 0.6, 'player');
        world.shake(7, 0.25);
      }
    }
    // combo chaining
    if (!s.heavy && t >= d.windup + d.active && input.buffered('light', 0.35)) {
      const minT = d.windup + d.active + d.recover * 0.25;
      if (t >= minT) {
        input.consume('light');
        if (this.stamina > 0) {
          this.startSwing(world, false, 0, this.comboNext);
          return;
        }
      }
    }
    if (t >= end) {
      this.swing = null;
      this.setState(b.onGround ? 'idle' : 'air');
    }
  }

  releaseSkill(world: WorldApi) {
    const radius = 150;
    const dmg = BASE.pipDamage * 0.8 * this.stats.skillMul * (1 + this.save.attrs.sila * 0.02);
    world.addHitbox({
      team: 'player',
      rect: { x: this.cx - radius, y: this.cy - 90, w: radius * 2, h: 160 },
      dmg,
      poise: 70,
      knock: 380,
      parryable: false,
      unblockable: true,
      attack: world.newAttack(),
      source: this,
      fromX: this.cx,
      tag: 'skill',
      breaksWalls: true,
    });
    this.skillFlash = 1;
    world.sfx('skill', this.cx);
    world.shake(9, 0.3);
    world.hitstop(0.05);
  }

  updateCape(dt: number) {
    const b = this.body;
    const lean = this.state === 'run' ? 3 : 0;
    const ax = this.cx - this.face * (3 + lean);
    const ay = b.y + (this.state === 'roll' ? 22 : 9);
    const pts = this.cape;
    pts[0].x = ax;
    pts[0].y = ay;
    const seg = this.state === 'roll' ? 3 : 5.2;
    const sub = 2;
    for (let s = 0; s < sub; s++) {
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * 0.9;
        const vy = (p.y - p.py) * 0.9;
        p.px = p.x;
        p.py = p.y;
        p.x += vx - this.face * 0.6 * (dt * 60) / sub;
        p.y += vy + 0.9 * (dt * 60) / sub;
      }
      for (let k = 0; k < 3; k++) {
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const p = pts[i];
          const dx = p.x - a.x;
          const dy = p.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          const diff = (d - seg) / d;
          p.x -= dx * diff;
          p.y -= dy * diff;
        }
      }
    }
    // keep cape from passing through the floor
    const floor = b.y + b.h + 2;
    for (const p of pts) p.y = clamp(p.y, b.y - 20, floor);
  }
}
