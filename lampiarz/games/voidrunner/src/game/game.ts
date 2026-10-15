// The simulation: player, combat, rooms, expedition flow. No DOM here — the renderer and the UI
// read the state, the tests drive it directly.

import type { AudioLike } from '../core/audio';
import { GRAVITY, MAX_FALL, PLAYER, STEP, TILE } from '../core/consts';
import type { Input } from '../core/input';
import { Rng } from '../core/rng';
import type { Meta, RunSave } from '../core/save';
import { AREAS, BOSS_INFO } from '../world/areas';
import { planArea, type RoomPlan } from '../world/expedition';
import { lineOfSight, moveBody, overlap, solidAt, tileAt, touchesHazard } from '../world/physics';
import type { RoomGrid } from '../world/tiles';
import { T_BREAK, T_EMPTY, T_PLATFORM } from '../world/tiles';
import { spawnBoss, trackBeams, updateBoss } from './bosses';
import { pickWeather, WEATHER_INFO, type WeatherKind } from './weather';
import { COSMETICS, UPGRADES, WEAPONS, type CosmeticId, type UpgradeId, type WeaponId } from './data';
import { spawnEnemy, updateEnemy, ENEMY_NAMES } from './enemies';
import type { Bolt, Enemy, Floater, GameEvent, Hazard, Particle, Pickup, Player, Projectile, Prop, RunState, WorldObject } from './types';

export interface Beam {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  max: number;
  color: string;
  width: number;
}

export class Game {
  // ---- persistent references
  meta: Meta;
  audio: AudioLike;
  input: Input;
  // ---- expedition
  run!: RunState;
  weapon: WeaponId = 'blade';
  cosmetic: CosmeticId = 'standard';
  tutorial = false;
  private plans = new Map<number, RoomPlan[]>();
  room!: RoomPlan;
  grid!: RoomGrid;
  // ---- entities
  player!: Player;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  hazards: Hazard[] = [];
  objects: WorldObject[] = [];
  pickups: Pickup[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  bolts: Bolt[] = [];
  beams: Beam[] = [];
  props: Prop[] = [];
  /** weather of the current room (visual + audio; storm wind, slippery snow and fog sight are gameplay) */
  weather: WeatherKind = 'clear';
  /** current horizontal wind (px/s), storms only */
  wind = 0;
  private windTarget = 0;
  private windT = 0;
  /** lightning flash 0..1 (storm / void storm) */
  lightning = 0;
  /** where the last bolt hit (x in room pixels) */
  lightningX = 0;
  private lightningT = 4;
  /** bullet-time after a perfect dodge */
  slowmo = 0;
  // ---- flow
  events: GameEvent[] = [];
  time = 0;
  roomTime = 0;
  hitstop = 0;
  shake = 0;
  flash = 0;
  doorLocked = false;
  doorT = 0;
  bossId = -1;
  bossIntroT = 0;
  transition: { t: number; phase: 'out' | 'in'; next: (() => void) | null } | null = null;
  pendingChoice: { options: UpgradeId[]; reason: string } | null = null;
  over: 'dead' | 'victory' | null = null;
  activeSign: string | null = null;
  rng = new Rng(1);
  private nextId = 1;

  constructor(meta: Meta, audio: AudioLike, input: Input) {
    this.meta = meta;
    this.audio = audio;
    this.input = input;
  }

  id() {
    return this.nextId++;
  }

  // ================================================================== expedition
  newRun(seed = (Math.random() * 2 ** 31) | 0) {
    this.weapon = this.meta.weapon;
    this.cosmetic = this.meta.cosmetic;
    this.tutorial = !this.meta.tutorialDone;
    this.run = { seed, area: 0, room: 0, upgrades: {}, fragments: 0, kills: 0, bosses: 0, time: 0, damageDealt: 0, combo: 0, comboT: 0, bestCombo: 0, perfect: 0, parries: 0, blocks: 0 };
    this.plans.clear();
    this.rng = new Rng(seed ^ 0xabcdef);
    this.over = null;
    this.settled = false;
    this.player = this.makePlayer();
    this.player.hp = this.player.maxHp;
    this.player.healCharges = this.maxHealCharges();
    this.enterRoom(0, 0, true);
    const start = this.meta.perm.startup ?? 0;
    if (start > 0) this.offerChoice(start >= 2 ? 2 : 1, 'Moduł Startowy: wybierz ulepszenie');
  }

  continueRun(s: RunSave) {
    this.weapon = s.weapon;
    this.cosmetic = s.cosmetic;
    this.tutorial = false;
    this.run = { seed: s.seed, area: s.area, room: s.room, upgrades: { ...s.upgrades }, fragments: s.fragments, kills: s.kills, bosses: s.bosses, time: s.time, damageDealt: 0, combo: 0, comboT: 0, bestCombo: 0, perfect: 0, parries: 0, blocks: 0 };
    this.plans.clear();
    this.rng = new Rng(s.seed ^ (s.area * 977 + s.room * 131 + 7));
    this.over = null;
    this.settled = false;
    this.player = this.makePlayer();
    this.player.hp = Math.min(this.player.maxHp, Math.max(1, s.hp));
    this.player.healCharges = s.healCharges;
    this.enterRoom(s.area, s.room, true);
  }

  plansFor(area: number) {
    let p = this.plans.get(area);
    if (!p) {
      p = planArea(this.run.seed, area, this.tutorial && area === 0);
      this.plans.set(area, p);
    }
    return p;
  }

  snapshot(): RunSave {
    return {
      version: 1,
      seed: this.run.seed,
      area: this.run.area,
      room: this.run.room,
      hp: Math.ceil(this.player.hp),
      healCharges: this.player.healCharges,
      upgrades: { ...this.run.upgrades },
      weapon: this.weapon,
      cosmetic: this.cosmetic,
      fragments: this.run.fragments,
      kills: this.run.kills,
      bosses: this.run.bosses,
      time: this.run.time,
      savedAt: Date.now(),
    };
  }

  // ================================================================== derived stats
  up(id: UpgradeId) {
    return this.run?.upgrades[id] ?? 0;
  }
  perm(id: keyof Meta['perm']) {
    return this.meta.perm[id] ?? 0;
  }
  maxHp() {
    return 100 + this.perm('hp') * 15 + this.up('plating') * 20;
  }
  maxEnergy() {
    return 100 + this.perm('energy') * 20;
  }
  maxHealCharges() {
    return 1 + this.perm('heal');
  }
  lowHp() {
    return this.player.hp <= this.player.maxHp * 0.35;
  }
  dmgMult() {
    let m = 1 + this.perm('dmg') * 0.08;
    if (this.up('reactor') && this.lowHp()) m *= 1.25;
    return m;
  }
  reach() {
    return 1 + this.up('energyblade') * 0.2;
  }
  speedMult() {
    return this.up('reactor') && this.lowHp() ? 1.35 : 1;
  }
  chargeTime() {
    return PLAYER.chargeTime * Math.pow(0.85, this.up('overload'));
  }

  private makePlayer(): Player {
    const maxHp = this.maxHp();
    return {
      x: 0,
      y: 0,
      w: PLAYER.w,
      h: PLAYER.h,
      vx: 0,
      vy: 0,
      onGround: false,
      hitWall: 0,
      hitCeiling: false,
      facing: 1,
      hp: maxHp,
      maxHp,
      energy: this.maxEnergy(),
      maxEnergy: this.maxEnergy(),
      healCharges: 1,
      airJumps: 1,
      airDashes: 1,
      coyote: 0,
      jumpBuffer: 0,
      dashT: 0,
      dashCd: 0,
      iframes: 0,
      hurtT: 0,
      attack: null,
      comboStep: 0,
      comboWindow: 0,
      chargeT: 0,
      shotCd: 0,
      dropT: 0,
      anim: 'idle',
      animT: 0,
      landT: 0,
      healT: 0,
      interactT: 0,
      dead: false,
      deathT: 0,
      wasOnGround: false,
      fallSpeed: 0,
      stepT: 0,
      reactorFx: 0,
      wallDir: 0,
      wallCoyote: 0,
      wallLock: 0,
      sliding: false,
      dashGrace: 0,
      dodgeUsed: false,
      counterT: 0,
      ride: -1,
      blocking: false,
      blockT: 0,
      blockCd: 0,
      blockFx: 0,
      parryFx: 0,
    };
  }

  // ================================================================== rooms
  enterRoom(area: number, index: number, fresh = false) {
    const plans = this.plansFor(area);
    const plan = plans[index];
    const newArea = area !== this.run.area || fresh;
    this.run.area = area;
    this.run.room = index;
    this.room = plan;
    // tiles are mutated (cracked walls): work on a copy
    this.grid = { w: plan.grid.w, h: plan.grid.h, tiles: new Uint8Array(plan.grid.tiles), marks: plan.grid.marks };
    this.enemies = [];
    this.projectiles = [];
    this.hazards = [];
    this.pickups = [];
    this.bolts = [];
    this.beams = [];
    this.objects = plan.objects.map((o) => ({ id: this.id(), kind: o.kind, x: o.x * TILE + TILE / 2, y: (o.y + 1) * TILE, used: false, text: o.text, t: 0 }));
    for (const pe of plan.enemies) this.enemies.push(spawnEnemy(this, pe));
    for (const pk of plan.pickups) this.pickups.push({ id: this.id(), x: pk.x * TILE + TILE / 2, y: pk.y * TILE + TILE / 2, vx: 0, vy: 0, value: pk.value, kind: 'fragment', t: Math.random() * 6, grounded: true });
    this.props = plan.props.map((pp) => {
      const X = pp.x * TILE;
      const Y = (pp.y + 1) * TILE;
      if (pp.kind === 'crate') return { id: this.id(), kind: 'crate', x: X + 2, y: Y - 12, w: 12, h: 12, hp: 1, t: 0, state: 'idle', phase: 0 } as Prop;
      if (pp.kind === 'barrel') return { id: this.id(), kind: 'barrel', x: X + 3, y: Y - 14, w: 10, h: 14, hp: 1, t: 0, state: 'idle', phase: 0 } as Prop;
      if (pp.kind === 'pad') return { id: this.id(), kind: 'pad', x: X + 1, y: Y - 4, w: 14, h: 4, hp: 0, t: 0, state: 'idle', phase: 0 } as Prop;
      if (pp.kind === 'vent') return { id: this.id(), kind: 'vent', x: X + 3, y: Y - 2, w: 10, h: 2, hp: 0, t: Math.random() * 3, state: 'idle', phase: 3.4 } as Prop;
      if (pp.kind === 'saw') {
        const ax = pp.x * TILE;
        const bx = (pp.x1 ?? pp.x + 6) * TILE;
        return { id: this.id(), kind: 'saw', x: ax, y: Y - 15, w: 16, h: 16, hp: 0, t: Math.random() * 6, state: 'on', phase: 0, ax, bx, dir: 1 } as Prop;
      }
      if (pp.kind === 'mover') {
        const ax = pp.x * TILE;
        const bx = (pp.x1 ?? pp.x + 6) * TILE;
        return { id: this.id(), kind: 'mover', x: ax, y: pp.y * TILE, w: 48, h: 6, hp: 0, t: Math.random() * 4, state: 'on', phase: 0, ax, bx, dx: 0, dy: 0 } as Prop;
      }
      if (pp.kind === 'spiketrap') return { id: this.id(), kind: 'spiketrap', x: X, y: Y - 12, w: 16, h: 12, hp: 0, t: (pp.x % 3) * 0.45 + Math.random() * 0.2, state: 'idle', phase: 3.2 } as Prop;
      if (pp.kind === 'flame') {
        const dir = pp.dir ?? 1;
        // emitter flush with the wall; the jet covers 3.5 tiles in front of it
        const ex = dir > 0 ? X : X + TILE;
        return { id: this.id(), kind: 'flame', x: dir > 0 ? ex : ex - 56, y: Y - 22, w: 56, h: 12, hp: 0, t: Math.random() * 3, state: 'idle', phase: 3.0, dir, ax: ex } as Prop;
      }
      if (pp.kind === 'faller') {
        const fy = (pp.y + 1) * TILE;
        return { id: this.id(), kind: 'faller', x: X + 3, y: fy, w: 10, h: 14, hp: 0, t: 0, state: 'idle', phase: 0, ax: X + 3, ay: fy, vy: 0 } as Prop;
      }
      const tiles: number[] = [];
      for (let i = 0; i < (pp.w ?? 3); i++) tiles.push(pp.y * this.grid.w + pp.x + i);
      return { id: this.id(), kind: 'crumble', x: X, y: pp.y * TILE, w: (pp.w ?? 3) * TILE, h: 4, hp: 0, t: 0, state: 'idle', phase: 0, tiles } as Prop;
    });
    for (const l of plan.lasers)
      this.hazards.push({ kind: 'laser', x: l.x * TILE + 5, y: l.y0 * TILE, w: 6, h: (l.y1 - l.y0 + 1) * TILE, t: l.phase, warn: 0.9, active: 0.55, dmg: 18, period: 3.4 });
    const p = this.player;
    p.x = plan.spawn.x * TILE + (TILE - p.w) / 2;
    p.y = (plan.spawn.y + 1) * TILE - p.h;
    p.vx = 0;
    p.vy = 0;
    p.facing = 1;
    p.attack = null;
    p.dashT = 0;
    p.chargeT = 0;
    p.ride = -1;
    p.airJumps = this.airJumpsMax();
    p.airDashes = this.airDashesMax();
    this.roomTime = 0;
    this.weather = pickWeather(this.run.seed, area, index, plan.boss, plan.template === 'samouczek');
    this.wind = 0;
    this.windTarget = 0;
    this.lightning = 0;
    this.lightningT = 3 + Math.random() * 4;
    this.audio.setAmbience(area, this.weather);
    this.bossId = -1;
    this.bossIntroT = plan.boss ? 1.4 : 0;
    this.doorLocked = plan.lockDoor;
    this.doorT = 0;
    this.activeSign = null;
    if (newArea) {
      this.audio.startMusic(area);
      this.events.push({ type: 'areaEnter', area });
      if (index === 0) this.events.push({ type: 'dialog', speaker: 'ARIA', text: AREAS[area].intro, duration: 7 });
    }
    this.events.push({ type: 'roomEnter', area, room: index });
    if (plan.boss) this.events.push({ type: 'dialog', speaker: 'ARIA', text: BOSS_INFO[plan.boss as keyof typeof BOSS_INFO].intro, duration: 5 });
  }

  airJumpsMax() {
    return 1 + this.up('triplejump');
  }
  airDashesMax() {
    return 1 + (this.perm('airdash') ? 1 : 0);
  }

  exitRect() {
    const e = this.room.exit;
    return { x: e.x * TILE + 1, y: (e.y - 2) * TILE, w: TILE - 2, h: TILE * 3 };
  }

  private goNext() {
    if (this.tutorial && this.run.area === 0 && this.run.room === 0) this.meta.tutorialDone = true;
    const plans = this.plansFor(this.run.area);
    if (this.run.room + 1 < plans.length) {
      this.fade(() => this.enterRoom(this.run.area, this.run.room + 1));
    } else if (this.run.area + 1 < AREAS.length) {
      this.events.push({ type: 'toast', text: 'Poziom ukończony', color: '#5dff9b' });
      this.fade(() => this.enterRoom(this.run.area + 1, 0));
    } else {
      this.win();
    }
  }

  private fade(next: () => void) {
    if (this.transition) return;
    this.audio.play('door');
    this.transition = { t: 0, phase: 'out', next };
  }

  // ================================================================== main step
  step(dt = STEP) {
    if (this.pendingChoice || this.over === 'victory') {
      this.updateParticles(dt);
      return;
    }
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      dt *= 0.35;
    }
    this.time += dt;
    if (this.transition) {
      const tr = this.transition;
      tr.t += dt;
      if (tr.phase === 'out' && tr.t >= 0.28) {
        tr.next?.();
        tr.phase = 'in';
        tr.t = 0;
      } else if (tr.phase === 'in' && tr.t >= 0.28) this.transition = null;
      this.updateParticles(dt);
      if (this.transition?.phase === 'out') return;
    }
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.updateParticles(dt * 0.25);
      return;
    }
    if (!this.over) this.run.time += dt;
    this.roomTime += dt;
    if (this.run.comboT > 0) {
      this.run.comboT -= dt;
      if (this.run.comboT <= 0) this.run.combo = 0;
    }
    this.shake = Math.max(0, this.shake - dt * 30);
    this.updateWeather(dt);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.bossIntroT > 0) {
      this.bossIntroT -= dt;
      if (this.bossIntroT <= 0 && this.room.boss) this.startBoss();
    }
    this.updateMovers(dt);
    this.updatePlayer(dt);
    for (const e of this.enemies) {
      if (e.dead) {
        e.deathT += dt;
        continue;
      }
      if (e.type === 'boss') updateBoss(this, e, dt);
      else updateEnemy(this, e, dt);
    }
    this.enemies = this.enemies.filter((e) => !e.dead || e.deathT < 1.2);
    trackBeams(this, dt);
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.updateProps(dt);
    this.updatePickups(dt);
    this.updateObjects(dt);
    this.updateDoor(dt);
    this.updateParticles(dt);
    this.input.endStep();
  }

  // ================================================================== player
  private updatePlayer(dt: number) {
    const p = this.player;
    const inp = this.input;
    p.animT += dt;
    if (p.dead) {
      p.deathT += dt;
      p.vx *= 0.9;
      p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
      moveBody(p, dt, this.grid);
      if (p.deathT > 1.7 && !this.over) this.die();
      return;
    }
    p.maxHp = this.maxHp();
    p.maxEnergy = this.maxEnergy();
    p.iframes = Math.max(0, p.iframes - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.comboWindow = Math.max(0, p.comboWindow - dt);
    p.shotCd = Math.max(0, p.shotCd - dt);
    p.landT = Math.max(0, p.landT - dt);
    p.healT = Math.max(0, p.healT - dt);
    p.interactT = Math.max(0, p.interactT - dt);
    p.dropT = Math.max(0, p.dropT - dt);
    p.wallCoyote = Math.max(0, p.wallCoyote - dt);
    p.wallLock = Math.max(0, p.wallLock - dt);
    p.dashGrace = Math.max(0, p.dashGrace - dt);
    p.counterT = Math.max(0, p.counterT - dt);
    p.blockCd = Math.max(0, p.blockCd - dt);
    p.blockFx = Math.max(0, p.blockFx - dt);
    p.parryFx = Math.max(0, p.parryFx - dt);
    // ---- guard: hold the block key (not while dashing, attacking or healing)
    const wantBlock = inp.down('block') && p.blockCd <= 0 && p.dashT <= 0 && p.healT <= 0 && (!p.attack || p.attack.kind === 'shot');
    if (wantBlock) {
      if (!p.blocking) {
        p.blocking = true;
        p.blockT = 0;
        p.attack = null;
        p.chargeT = 0;
        this.audio.play('guard');
      } else p.blockT += dt;
    } else p.blocking = false;
    p.energy = Math.min(p.maxEnergy, p.energy + PLAYER.energyRegen * (1 + this.up('cell') * 0.4) * (1 + this.perm('energy') * 0.15) * dt);
    const left = inp.down('left');
    const right = inp.down('right');
    const rawDir = (right ? 1 : 0) - (left ? 1 : 0);
    // right after a wall jump the stick toward the wall is ignored for a moment
    const dir = p.wallLock > 0 && rawDir === p.wallDir ? 0 : rawDir;

    // ---- dash / dodge
    if (inp.hit('dash') && p.dashCd <= 0 && p.dashT <= 0 && (p.onGround || p.airDashes > 0)) {
      if (!p.onGround) p.airDashes--;
      if (dir !== 0) p.facing = dir as 1 | -1;
      p.dashT = PLAYER.dashTime;
      p.dashCd = PLAYER.dashCooldown;
      p.iframes = Math.max(p.iframes, PLAYER.dashIframes);
      p.attack = null;
      p.chargeT = 0;
      p.dodgeUsed = false;
      p.sliding = false;
      this.audio.play('dash');
      for (let i = 0; i < 8; i++) this.part(p.x + p.w / 2, p.y + p.h - 4, -p.facing * (40 + Math.random() * 80), -Math.random() * 40, 0.35, '#9ff6ff', 2, 0, 'dust');
      if (this.up('voidshadow'))
        this.hazards.push({ kind: 'mine', x: p.x + p.w / 2, y: p.y + p.h / 2, w: 0, h: 0, t: 0, warn: 0.35, active: 0.12, dmg: 18 + this.up('voidshadow') * 8, owner: -1 });
    }
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.facing * PLAYER.dashSpeed * this.speedMult();
      p.vy = 0;
      if (Math.random() < 0.8) this.part(p.x + p.w / 2, p.y + p.h / 2 + (Math.random() - 0.5) * 14, 0, 0, 0.25, COSMETICS[this.cosmetic].glow, 3, 0, 'glow');
      const feet0 = p.y + p.h;
      moveBody(p, dt, this.grid);
      this.landOnMovers(feet0);
      if (p.dashT <= 0) {
        p.vx *= 0.4;
        p.dashGrace = 0.08;
      }
      this.checkHazardTiles();
      this.setAnim('dash');
      return;
    }

    // ---- horizontal movement
    const attacking = !!p.attack && p.attack.kind !== 'shot';
    const charging = p.chargeT > 0.12 && inp.down('attack') && !p.attack;
    let speed = PLAYER.runSpeed * this.speedMult();
    if (attacking) speed *= p.onGround ? 0.3 : 0.7;
    if (charging) speed *= 0.45;
    if (p.healT > 0) speed *= 0.3;
    if (p.blocking) speed *= 0.35;
    const target = dir * speed;
    const slippery = this.weather === 'snow' && p.onGround;
    const acc = (p.onGround ? PLAYER.accelGround : PLAYER.accelAir) * (slippery ? 0.45 : 1);
    if (dir !== 0) {
      p.vx += Math.sign(target - p.vx) * Math.min(Math.abs(target - p.vx), acc * dt);
      if (!attacking) p.facing = dir as 1 | -1;
    } else if (p.onGround) {
      p.vx -= Math.sign(p.vx) * Math.min(Math.abs(p.vx), PLAYER.friction * (slippery ? 0.18 : 1) * dt);
    } else p.vx *= 1 - dt * 1.5;
    // storm gusts push you while airborne
    if (!p.onGround && this.wind !== 0) p.vx += this.wind * dt * 2.2;

    // ---- jumping
    if (p.onGround) {
      p.coyote = PLAYER.coyote;
      p.airJumps = this.airJumpsMax();
      p.airDashes = this.airDashesMax();
    } else p.coyote = Math.max(0, p.coyote - dt);
    if (inp.hit('jump')) p.jumpBuffer = PLAYER.jumpBuffer;
    else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
    if (p.jumpBuffer > 0) {
      const onPlatform = p.onGround && this.standingOnPlatform();
      if (inp.down('down') && onPlatform) {
        p.dropT = 0.25;
        p.jumpBuffer = 0;
        p.y += 2;
      } else if (p.coyote > 0) {
        p.vy = -PLAYER.jumpSpeed;
        p.coyote = 0;
        p.jumpBuffer = 0;
        p.onGround = false;
        this.audio.play('jump');
        for (let i = 0; i < 5; i++) this.part(p.x + p.w / 2, p.y + p.h, (Math.random() - 0.5) * 80, -Math.random() * 30, 0.3, '#8a93ad', 2, 60, 'dust');
      } else if (p.wallCoyote > 0 && p.wallDir !== 0) {
        // wall jump: kick off the wall, keep the double jump
        p.vy = -PLAYER.jumpSpeed * 0.95;
        p.vx = -p.wallDir * 175;
        p.facing = -p.wallDir as 1 | -1;
        p.wallLock = 0.16;
        p.wallCoyote = 0;
        p.jumpBuffer = 0;
        p.airDashes = this.airDashesMax();
        p.sliding = false;
        this.audio.play('jump');
        for (let i = 0; i < 6; i++) this.part(p.x + (p.wallDir > 0 ? p.w : 0), p.y + p.h / 2, -p.wallDir * Math.random() * 90, (Math.random() - 0.5) * 60, 0.3, '#c8d2e6', 2, 60, 'dust');
      } else if (p.airJumps > 0) {
        p.airJumps--;
        p.vy = -PLAYER.doubleJumpSpeed;
        p.jumpBuffer = 0;
        this.audio.play('djump');
        this.ring(p.x + p.w / 2, p.y + p.h, COSMETICS[this.cosmetic].glow, 14);
      }
    }
    if (inp.up('jump') && p.vy < -60) p.vy *= PLAYER.jumpCut;
    p.vy = Math.min(p.sliding ? 70 : MAX_FALL, p.vy + GRAVITY * dt * (p.vy > 0 ? 1.15 : 1));
    p.wasOnGround = p.onGround;
    const vyBefore = p.vy;
    const feet0 = p.y + p.h;
    moveBody(p, dt, this.grid, p.dropT > 0);
    this.landOnMovers(feet0);
    // ---- wall slide: pressing toward a wall while falling
    p.sliding = false;
    if (!p.onGround && rawDir !== 0 && p.vy > 0) {
      const sx = rawDir > 0 ? p.x + p.w + 1 : p.x - 1;
      const tx = Math.floor(sx / TILE);
      const y0 = Math.floor((p.y + 4) / TILE);
      const y1 = Math.floor((p.y + p.h - 4) / TILE);
      let wall = true;
      for (let ty = y0; ty <= y1; ty++) if (!solidAt(this.grid, tx, ty)) wall = false;
      if (wall) {
        p.sliding = true;
        p.wallDir = rawDir as 1 | -1;
        p.wallCoyote = 0.12;
        p.facing = -rawDir as 1 | -1;
        if (Math.random() < 0.4) this.part(rawDir > 0 ? p.x + p.w : p.x, p.y + p.h - 4, -rawDir * 20, -10, 0.25, '#ffcf8a', 1, 0, 'spark');
      }
    }
    if (!p.wasOnGround && p.onGround && vyBefore > 120) {
      p.landT = 0.12;
      this.audio.play('land');
      for (let i = 0; i < 6; i++) this.part(p.x + p.w / 2 + (Math.random() - 0.5) * 8, p.y + p.h, (Math.random() - 0.5) * 120, -Math.random() * 50, 0.35, '#8a93ad', 2, 80, 'dust');
    }
    if (p.onGround && Math.abs(p.vx) > 40) {
      p.stepT -= dt;
      if (p.stepT <= 0) {
        p.stepT = 0.28;
        this.audio.play('step');
      }
    }
    if (p.y > this.grid.h * TILE + 40) this.damagePlayer(25, p.x - p.facing * 10, true);
    this.checkHazardTiles();

    // ---- combat
    this.updatePlayerAttack(dt);

    // ---- healing
    if (inp.hit('heal') && p.healCharges > 0 && p.hp < p.maxHp && p.healT <= 0) {
      p.healCharges--;
      p.healT = 0.55;
      const amount = Math.round(p.maxHp * 0.4);
      p.hp = Math.min(p.maxHp, p.hp + amount);
      this.floater(p.x + p.w / 2, p.y - 6, `+${amount}`, '#5dff9b');
      this.audio.play('heal');
      for (let i = 0; i < 18; i++) this.part(p.x + Math.random() * p.w, p.y + p.h - Math.random() * p.h, (Math.random() - 0.5) * 30, -40 - Math.random() * 60, 0.8, '#5dff9b', 2, -20, 'glow');
    } else if (inp.hit('heal') && p.healCharges <= 0) this.events.push({ type: 'toast', text: 'Brak nanoapteczek', color: '#ff4a5a' });

    if (this.up('reactor') && this.lowHp()) {
      p.reactorFx -= dt;
      if (p.reactorFx <= 0) {
        p.reactorFx = 0.06;
        this.part(p.x + Math.random() * p.w, p.y + p.h - 2, 0, -30, 0.4, '#ff4a5a', 2, -40, 'glow');
      }
    }

    // ---- animation state
    if (p.hurtT > 0) this.setAnim('hurt');
    else if (p.attack?.kind === 'charged') this.setAnim('chargeAtk');
    else if (p.attack?.kind === 'special') this.setAnim('special');
    else if (p.attack) this.setAnim('attack');
    else if (charging) this.setAnim('charge');
    else if (p.healT > 0) this.setAnim('heal');
    else if (p.blocking) this.setAnim('block');
    else if (p.interactT > 0) this.setAnim('interact');
    else if (p.sliding) this.setAnim('wall');
    else if (!p.onGround) this.setAnim(p.vy < 0 ? 'jump' : 'fall');
    else if (p.landT > 0) this.setAnim('land');
    else if (Math.abs(p.vx) > 12) this.setAnim('run');
    else this.setAnim('idle');
  }

  private standingOnPlatform() {
    const p = this.player;
    if (p.ride >= 0) return true; // moving platforms are one-way too
    const ty = Math.floor((p.y + p.h + 1) / TILE);
    const x0 = Math.floor(p.x / TILE);
    const x1 = Math.floor((p.x + p.w - 0.01) / TILE);
    let plat = false;
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(this.grid, tx, ty);
      if (t === 1 || t === T_BREAK) return false;
      if (t === 2) plat = true;
    }
    return plat;
  }

  private setAnim(a: Player['anim']) {
    const p = this.player;
    if (p.anim !== a) {
      p.anim = a;
      p.animT = 0;
    }
  }

  private checkHazardTiles() {
    const p = this.player;
    if (touchesHazard(p, this.grid)) {
      if (p.iframes <= 0) {
        this.damagePlayer(15, p.x + p.w / 2 - p.facing * 8, true);
        p.vy = -330;
      } else if (p.vy > 0 && p.dashT <= 0) p.vy = -260; // bounce out even while invulnerable
    }
  }

  // ---------------------------------------------------------------- attacks
  private updatePlayerAttack(dt: number) {
    const p = this.player;
    const inp = this.input;
    const w = WEAPONS[this.weapon];
    // charge while holding attack
    if (inp.down('attack')) {
      const before = p.chargeT;
      p.chargeT += dt;
      if (before < this.chargeTime() && p.chargeT >= this.chargeTime()) {
        this.audio.play('charge');
        this.ring(p.x + p.w / 2, p.y + p.h / 2, COSMETICS[this.cosmetic].glow, 18);
      }
    }
    if (inp.up('attack')) {
      if (p.chargeT >= this.chargeTime()) this.startCharged();
      p.chargeT = 0;
    }
    if (inp.hit('attack') && p.healT <= 0 && !p.blocking) {
      p.chargeT = 0.0001;
      if (w.shot) {
        if (p.shotCd <= 0) this.fireShot();
      } else if (!p.attack && !p.onGround && inp.down('down')) {
        // downward slash: bounce off enemies, crates, barrels and spikes (pogo)
        p.attack = { kind: 'down', step: 0, t: 0, dur: 0.3, hit: new Set() };
        this.audio.play('swing');
      } else if (!p.attack && inp.down('up')) {
        p.attack = { kind: 'up', step: 0, t: 0, dur: 0.28, hit: new Set() };
        this.audio.play('swing');
      } else if (!p.attack || (p.attack.kind === 'combo' && p.attack.t > p.attack.dur * 0.6)) {
        const step = p.comboWindow > 0 ? (p.comboStep + 1) % w.combo.length : 0;
        this.startCombo(step);
      }
    }
    if (inp.hit('special') && !p.attack && p.healT <= 0 && !p.blocking) {
      if (p.energy >= w.special.cost) this.startSpecial();
      else this.events.push({ type: 'toast', text: 'Za mało energii', color: '#7f9bff' });
    }
    // run the current attack
    const a = p.attack;
    if (!a) return;
    a.t += dt;
    if (a.kind === 'combo') {
      const hit = w.combo[a.step];
      if (a.t < 0.06 && p.onGround) p.vx = p.facing * hit.lunge;
      if (a.t >= hit.active[0] && a.t <= hit.active[1]) {
        const reach = hit.reach * this.reach();
        const box = { x: p.facing > 0 ? p.x + p.w - 4 : p.x + 4 - reach, y: p.y + p.h / 2 - hit.height / 2 - 2, w: reach, h: hit.height };
        this.meleeHits(box, hit.dmg * (1 + this.up('energyblade') * 0.15), hit.knock, a, this.weapon === 'heavy');
      }
    } else if (a.kind === 'down' || a.kind === 'up') {
      if (a.t > 0.03 && a.t < 0.2) {
        const r = this.reach();
        const box =
          a.kind === 'down'
            ? { x: p.x - 7 * r, y: p.y + p.h - 4, w: p.w + 14 * r, h: 22 * r }
            : { x: p.x - 8 * r, y: p.y - 22 * r, w: p.w + 16 * r, h: 24 * r };
        const dmg = w.combo[0].dmg * 1.25 * (1 + this.up('energyblade') * 0.15);
        const hits = this.meleeHits(box, dmg, 140, a, this.weapon === 'heavy', a.kind === 'down' ? 'down' : 'up');
        const spikes =
          a.kind === 'down' &&
          (touchesHazard({ x: box.x, y: box.y, w: box.w, h: box.h - 8 }, this.grid) ||
            this.props.some((pp) => (pp.kind === 'saw' || (pp.kind === 'spiketrap' && pp.state === 'on')) && overlap(box, pp)));
        if (a.kind === 'down' && (hits || spikes) && !a.hit.has(-60)) {
          a.hit.add(-60);
          p.vy = -330;
          p.airJumps = this.airJumpsMax();
          p.airDashes = this.airDashesMax();
          p.iframes = Math.max(p.iframes, 0.12);
          this.audio.play('djump');
          this.ring(p.x + p.w / 2, p.y + p.h + 6, '#ffffff', 16);
        }
      }
    } else if (a.kind === 'charged') {
      if (this.weapon === 'blade' && a.t > 0.06 && a.t < 0.32) {
        const r = 42 * this.reach();
        this.meleeHits({ x: p.x + p.w / 2 - r, y: p.y - 10, w: r * 2, h: p.h + 16 }, w.charged.dmg * (1 + this.up('overload') * 0.5), 260, a, true, 'charged');
      } else if (this.weapon === 'heavy' && a.t > 0.22 && a.t < 0.36) {
        const r = 48 * this.reach();
        const box = { x: p.facing > 0 ? p.x + p.w - 6 : p.x + 6 - r, y: p.y - 18, w: r, h: p.h + 22 };
        this.meleeHits(box, w.charged.dmg * (1 + this.up('overload') * 0.5), 360, a, true, 'charged');
        if (!a.hit.has(-99)) {
          a.hit.add(-99);
          this.shake = Math.max(this.shake, 7);
          this.audio.play('hitHeavy');
          for (const d of [-1, 1]) this.addProjectile({ x: p.x + p.w / 2, y: p.y + p.h - 6, vx: d * 230, vy: 0, r: 7, dmg: 18 * this.chargedMult(), owner: 'player', kind: 'shock', life: 0.7, pierce: true, gravity: 0 });
        }
      }
    } else if (a.kind === 'special') {
      if (this.weapon === 'heavy' && a.t > 0.18 && !a.hit.has(-98)) {
        a.hit.add(-98);
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h;
        this.ring(cx, cy - 4, '#ffb23e', 64);
        this.shake = Math.max(this.shake, 8);
        this.audio.play('explosion');
        for (const e of this.enemies)
          if (!e.dead && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < 70 + e.w / 2) this.hitEnemy(e, w.special.dmg * this.dmgMult(), Math.sign(e.x + e.w / 2 - cx) || 1, 300, 'special');
        this.breakTilesIn({ x: cx - 40, y: cy - 30, w: 80, h: 30 });
      }
    }
    if (a.t >= a.dur) {
      if (a.kind === 'combo') {
        p.comboStep = a.step;
        p.comboWindow = 0.32;
      }
      p.attack = null;
    }
  }

  private chargedMult() {
    return this.dmgMult() * (1 + this.up('overload') * 0.5);
  }

  private startCombo(step: number) {
    const p = this.player;
    const hit = WEAPONS[this.weapon].combo[step];
    p.attack = { kind: 'combo', step, t: 0, dur: hit.dur, hit: new Set() };
    this.audio.play(this.weapon === 'heavy' ? 'swingHeavy' : 'swing');
  }

  private startCharged() {
    const p = this.player;
    const w = WEAPONS[this.weapon];
    p.attack = { kind: 'charged', step: 0, t: 0, dur: this.weapon === 'heavy' ? 0.6 : this.weapon === 'cannon' ? 0.3 : 0.4, hit: new Set() };
    this.audio.play('chargeRelease');
    if (this.weapon === 'cannon') {
      // piercing beam across the room
      const y = p.y + 9;
      let x = p.x + p.w / 2;
      const x0 = x;
      while (!solidAt(this.grid, Math.floor(x / TILE), Math.floor(y / TILE)) && Math.abs(x - x0) < 640) x += p.facing * 4;
      const band = { x: Math.min(x0, x), y: y - 7, w: Math.abs(x - x0), h: 14 };
      for (const e of this.enemies) if (!e.dead && overlap(band, e)) this.hitEnemy(e, w.charged.dmg * this.chargedMult(), p.facing, 200, 'charged');
      this.breakTilesIn({ x: p.facing > 0 ? x - 2 : x - 14, y: y - 6, w: 16, h: 12 });
      this.beams.push({ x0, y0: y, x1: x, y1: y, t: 0, max: 0.35, color: COSMETICS[this.cosmetic].glow, width: 7 });
      p.vx = -p.facing * 120;
      this.shake = Math.max(this.shake, 5);
    } else if (this.weapon === 'blade') {
      this.ring(p.x + p.w / 2, p.y + p.h / 2, COSMETICS[this.cosmetic].glow, 44);
    }
  }

  private startSpecial() {
    const p = this.player;
    const w = WEAPONS[this.weapon];
    p.energy -= w.special.cost;
    p.attack = { kind: 'special', step: 0, t: 0, dur: this.weapon === 'heavy' ? 0.42 : 0.3, hit: new Set() };
    this.audio.play('special');
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2 - 2;
    if (this.weapon === 'blade') this.addProjectile({ x: cx + p.facing * 10, y: cy, vx: p.facing * 290, vy: 0, r: 11, dmg: w.special.dmg * this.dmgMult(), owner: 'player', kind: 'wave', life: 0.9, pierce: true, gravity: 0 });
    else if (this.weapon === 'cannon') this.addProjectile({ x: cx + p.facing * 8, y: cy - 2, vx: p.facing * 210, vy: -230, r: 5, dmg: w.special.dmg * this.dmgMult(), owner: 'player', kind: 'grenade', life: 2.5, pierce: false, gravity: 720 });
    else if (this.weapon === 'heavy') {
      p.vy = Math.min(p.vy, 40);
    }
    const shards = this.up('split');
    if (shards) {
      const n = 3 + shards * 2;
      for (let i = 0; i < n; i++) {
        const ang = -Math.PI / 2 + (i - (n - 1) / 2) * 0.35 + (p.facing > 0 ? 0.5 : -0.5);
        this.addProjectile({ x: cx, y: cy, vx: Math.cos(ang) * 240, vy: Math.sin(ang) * 240, r: 3, dmg: 9 * this.dmgMult(), owner: 'player', kind: 'shard', life: 0.8, pierce: false, gravity: 250 });
      }
    }
  }

  private fireShot() {
    const p = this.player;
    const s = WEAPONS.cannon.shot!;
    p.shotCd = s.cooldown;
    p.attack = { kind: 'shot', step: 0, t: 0, dur: 0.12, hit: new Set() };
    const dmg = s.dmg * this.dmgMult() * (1 + this.up('energyblade') * 0.15);
    const upAim = this.input.down('up');
    const downAim = this.input.down('down') && !p.onGround;
    if (upAim || downAim) {
      const d = upAim ? -1 : 1;
      this.addProjectile({ x: p.x + p.w / 2, y: p.y + (upAim ? 0 : p.h), vx: (Math.random() - 0.5) * 16, vy: d * s.speed, r: 3, dmg, owner: 'player', kind: 'bolt', life: 0.7, pierce: false, gravity: 0 });
      if (downAim) p.vy = Math.min(p.vy, -150); // recoil keeps you in the air
    } else this.addProjectile({ x: p.x + p.w / 2 + p.facing * 10, y: p.y + 9, vx: p.facing * s.speed, vy: (Math.random() - 0.5) * 16, r: 3, dmg, owner: 'player', kind: 'bolt', life: 0.7, pierce: false, gravity: 0 });
    this.audio.play('shot');
    this.part(p.x + p.w / 2 + p.facing * 12, p.y + 9, p.facing * 60, 0, 0.12, COSMETICS[this.cosmetic].glow, 3, 0, 'glow');
  }

  private meleeHits(box: { x: number; y: number; w: number; h: number }, dmg: number, knock: number, a: { hit: Set<number> }, heavy: boolean, src?: 'down' | 'up' | 'charged') {
    const p = this.player;
    let hits = 0;
    for (const e of this.enemies) {
      if (e.dead || a.hit.has(e.id) || !overlap(box, e)) continue;
      a.hit.add(e.id);
      hits++;
      this.hitEnemy(e, dmg * this.dmgMult(), (Math.sign(e.x + e.w / 2 - (p.x + p.w / 2)) || p.facing) as number, knock, src ?? (heavy ? 'heavy' : 'melee'));
    }
    for (const pr of this.props) {
      if ((pr.kind !== 'crate' && pr.kind !== 'barrel') || pr.state === 'gone' || a.hit.has(pr.id) || !overlap(box, pr)) continue;
      a.hit.add(pr.id);
      hits++;
      this.hitProp(pr);
    }
    // enemy bullets can be cut out of the air
    for (const pr of this.projectiles) if (pr.owner === 'enemy' && pr.kind !== 'beam' && overlap(box, { x: pr.x - pr.r, y: pr.y - pr.r, w: pr.r * 2, h: pr.r * 2 })) {
      pr.life = 0;
      this.burst(pr.x, pr.y, 6, '#ffffff', 'spark', 120);
    }
    if (!a.hit.has(-50) && this.breakTilesIn(box)) a.hit.add(-50);
    return hits;
  }

  /** Breaks cracked walls touched by an attack; returns true if something broke. */
  breakTilesIn(box: { x: number; y: number; w: number; h: number }) {
    let broke = false;
    const x0 = Math.floor(box.x / TILE);
    const x1 = Math.floor((box.x + box.w) / TILE);
    const y0 = Math.floor(box.y / TILE);
    const y1 = Math.floor((box.y + box.h) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (tileAt(this.grid, tx, ty) === T_BREAK) {
          // a cracked wall breaks as a whole column
          let y = ty;
          while (tileAt(this.grid, tx, y - 1) === T_BREAK) y--;
          while (tileAt(this.grid, tx, y) === T_BREAK) {
            this.grid.tiles[y * this.grid.w + tx] = T_EMPTY;
            for (let i = 0; i < 6; i++) this.part(tx * TILE + Math.random() * TILE, y * TILE + Math.random() * TILE, (Math.random() - 0.5) * 160, -Math.random() * 160, 0.9, AREAS[this.run.area].palette.wallHi, 3, 500, 'debris');
            y++;
          }
          broke = true;
        }
    if (broke) {
      this.audio.play('hitHeavy');
      this.shake = Math.max(this.shake, 5);
      this.events.push({ type: 'toast', text: 'Ukryte przejście!', color: '#c45cff' });
    }
    return broke;
  }

  // ---------------------------------------------------------------- damage
  hitEnemy(e: Enemy, dmg: number, dir: number, knock: number, src: 'melee' | 'heavy' | 'charged' | 'special' | 'shot' | 'chain' | 'mine' | 'down' | 'up') {
    if (e.dead) return;
    // shield bearers block light hits from the front; heavy hits break the guard
    if (e.type === 'shield' && e.guard && src !== 'chain' && src !== 'mine') {
      const fromFront = Math.sign(this.player.x + this.player.w / 2 - (e.x + e.w / 2)) === e.facing;
      if (fromFront) {
        if (src === 'melee' || src === 'shot' || src === 'up') {
          e.flash = 0.06;
          this.burst(e.x + e.w / 2 + e.facing * 8, e.y + e.h / 2, 8, '#ffe066', 'spark', 180);
          this.audio.play('hit');
          if (src !== 'shot') this.player.vx = e.facing * 160;
          if (this.meta.settings.damageNumbers) this.floater(e.x + e.w / 2, e.y - 4, 'BLOK', '#9aa7c4');
          return;
        }
        e.guard = false;
        e.stun = Math.max(e.stun, 1.1);
        e.state = 'recover';
        e.stateT = 0;
        this.events.push({ type: 'toast', text: 'Gardę przełamano!', color: '#ffe066' });
      }
    }
    if (this.player.counterT > 0 && (src === 'melee' || src === 'heavy' || src === 'charged' || src === 'down' || src === 'up' || src === 'shot')) {
      dmg *= 1.6;
      this.player.counterT = 0;
      this.floater(this.player.x + this.player.w / 2, this.player.y - 14, 'KONTRA!', '#3ee6ff');
    }
    let crit = false;
    if (src !== 'chain' && Math.random() < this.up('crit') * 0.12) {
      dmg *= 2;
      crit = true;
    }
    if (e.type === 'boss' && e.state === 'shield') dmg *= 0.25;
    dmg = Math.round(dmg);
    e.hp -= dmg;
    this.run.damageDealt += dmg;
    e.flash = 0.12;
    const resist = e.type === 'boss' ? 0.08 : e.type === 'turret' ? 0 : e.elite ? 0.45 : 1;
    e.vx += dir * knock * resist;
    if (e.type !== 'boss' && e.type !== 'turret' && knock > 150) e.stun = Math.max(e.stun, e.elite ? 0.12 : 0.3);
    if (this.meta.settings.damageNumbers) this.floater(e.x + e.w / 2, e.y - 4, String(dmg), crit ? '#ffe066' : src === 'chain' ? '#8ef6ff' : '#ffffff');
    this.burst(e.x + e.w / 2 - dir * 4, e.y + e.h / 2, crit ? 12 : 7, crit ? '#ffe066' : '#ffffff', 'spark', 200);
    this.audio.play(src === 'heavy' || src === 'charged' ? 'hitHeavy' : 'hit');
    if (src !== 'chain' && src !== 'mine') {
      // combo counter: keep hitting without getting hit
      this.run.combo++;
      this.run.comboT = 2.4;
      this.run.bestCombo = Math.max(this.run.bestCombo, this.run.combo);
      if (this.run.combo % 10 === 0) {
        this.dropFragments(e.x + e.w / 2, e.y, Math.min(10, this.run.combo / 5));
        this.events.push({ type: 'toast', text: `Seria ×${this.run.combo}!`, color: '#ffe066' });
        this.audio.play('pickup');
      }
      this.hitstop = Math.max(this.hitstop, src === 'heavy' || src === 'charged' ? 0.07 : 0.035);
      this.shake = Math.max(this.shake, src === 'heavy' || src === 'charged' ? 5 : 2);
      this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + 3 + this.up('cell') * 2);
    }
    if (src !== 'chain' && this.up('lightning') && Math.random() < 0.2 + this.up('lightning') * 0.1) this.chainLightning(e);
    if (e.hp <= 0) this.killEnemy(e);
  }

  private chainLightning(from: Enemy) {
    const targets = this.enemies
      .filter((o) => o !== from && !o.dead && Math.hypot(o.x - from.x, o.y - from.y) < 110)
      .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))
      .slice(0, 2);
    let prev = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
    this.audio.play('lightning');
    for (const t of targets) {
      const to = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
      const pts = [prev];
      for (let i = 1; i < 6; i++) pts.push({ x: prev.x + ((to.x - prev.x) * i) / 6 + (Math.random() - 0.5) * 12, y: prev.y + ((to.y - prev.y) * i) / 6 + (Math.random() - 0.5) * 12 });
      pts.push(to);
      this.bolts.push({ pts, t: 0 });
      this.hitEnemy(t, 12, Math.sign(to.x - prev.x) || 1, 40, 'chain');
      prev = to;
    }
    if (!targets.length) this.bolts.push({ pts: [prev, { x: prev.x + (Math.random() - 0.5) * 30, y: prev.y - 20 }], t: 0 });
  }

  killEnemy(e: Enemy) {
    e.dead = true;
    e.deathT = 0;
    e.hp = 0;
    this.run.kills++;
    this.audio.play(e.type === 'boss' ? 'bossDie' : 'enemyDie');
    const col = e.type === 'void' ? '#c45cff' : e.type === 'boss' ? '#ffffff' : AREAS[this.run.area].palette.accent;
    this.burst(e.x + e.w / 2, e.y + e.h / 2, e.type === 'boss' ? 60 : 18, col, 'spark', 260);
    this.burst(e.x + e.w / 2, e.y + e.h / 2, 8, '#2a2f3d', 'debris', 180);
    // the body dissolves into rising specks of light
    const n = e.type === 'boss' ? 60 : 16;
    for (let i = 0; i < n; i++) this.part(e.x + Math.random() * e.w, e.y + Math.random() * e.h, (Math.random() - 0.5) * 30, -20 - Math.random() * 50, 0.6 + Math.random() * 0.7, i % 3 ? col : '#ffffff', i % 4 ? 1 : 2, -60, 'glow');
    this.ring(e.x + e.w / 2, e.y + e.h / 2, col, e.type === 'boss' ? 70 : 22);
    if (this.up('nanoregen')) {
      const heal = 3 * this.up('nanoregen');
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
    }
    if (e.type === 'boss') {
      this.bossDefeated(e);
      return;
    }
    const base = e.type === 'larva' ? 0 : e.elite ? 6 : e.type === 'turret' ? 2 : 1 + Math.floor(this.run.area / 2);
    const value = Math.round(base * (1 + this.up('magnet') * 0.25));
    this.dropFragments(e.x + e.w / 2, e.y + e.h / 2, value);
    if (e.elite && Math.random() < 0.35) this.pickups.push({ id: this.id(), x: e.x + e.w / 2, y: e.y, vx: 0, vy: -150, value: 20, kind: 'health', t: 0, grounded: false });
  }

  /** Window at the start of a block in which a hit is parried instead of blocked. */
  static PARRY_WINDOW = 0.2;

  /** Resolves a hit against a raised guard. Returns true when the hit is fully stopped. */
  private guard(dmg: number, srcX: number, src: { kind: 'melee' | 'projectile' | 'blast' | 'beam'; enemy?: Enemy; proj?: Projectile }) {
    const p = this.player;
    const pc = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const parry = p.blockT <= Game.PARRY_WINDOW && src.kind !== 'beam';
    if (parry) {
      // parry: no cost, the attacker is stunned, bullets fly back, time slows for a moment
      this.run.parries++;
      p.parryFx = 0.35;
      p.blockFx = 0.3;
      p.iframes = Math.max(p.iframes, 0.35);
      p.energy = Math.min(p.maxEnergy, p.energy + 15);
      p.counterT = 1.2;
      this.slowmo = Math.max(this.slowmo, 0.3);
      this.hitstop = Math.max(this.hitstop, 0.06);
      this.shake = Math.max(this.shake, 4);
      this.audio.play('parry');
      this.ring(pc + p.facing * 8, cy, '#ffffff', 26);
      this.burst(pc + p.facing * 8, cy, 14, '#ffe066', 'spark', 260);
      if (this.meta.settings.damageNumbers) this.floater(pc, p.y - 14, 'PAROWANIE!', '#ffe066');
      if (src.enemy && !src.enemy.dead && src.enemy.type !== 'boss') {
        const e = src.enemy;
        e.stun = Math.max(e.stun, 1.3);
        e.state = e.type === 'shield' ? 'recover' : e.state;
        if (e.type === 'shield') e.guard = false;
        e.hurtful = 0;
        e.vx = p.facing * 160;
        e.flash = 0.15;
      }
      if (src.proj) {
        // reflect the bullet back at whoever fired it, stronger
        const pr = src.proj;
        pr.owner = 'player';
        pr.vx = -pr.vx * 1.3 || p.facing * 260;
        pr.vy = -pr.vy * 0.5;
        pr.dmg = Math.round(pr.dmg * 1.5);
        pr.life = Math.max(pr.life, 0.8);
        pr.hit = new Set();
      }
      return true;
    }
    // regular block: the shield soaks the hit and costs energy; empty energy breaks the guard
    const cost = Math.ceil(dmg * 0.6);
    p.blockFx = 0.2;
    if (src.proj) src.proj.life = 0;
    if (p.energy >= cost) {
      p.energy -= cost;
      this.run.blocks++;
      p.iframes = Math.max(p.iframes, 0.25);
      p.vx = -p.facing * 90;
      this.audio.play('block');
      this.burst(pc + p.facing * 8, cy, 8, '#9fd8ff', 'spark', 180);
      if (this.meta.settings.damageNumbers) this.floater(pc, p.y - 10, 'BLOK', '#9fd8ff');
      return true;
    }
    // guard break: half the damage goes through and the guard is down for a second
    p.blocking = false;
    p.blockCd = 1.0;
    this.events.push({ type: 'toast', text: 'Garda przełamana — brak energii', color: '#ff8a5a' });
    this.audio.play('guardBreak');
    this.damagePlayer(Math.max(1, Math.round(dmg * 0.5)), srcX, false);
    return true;
  }

  dropFragments(x: number, y: number, total: number) {
    let left = total;
    while (left > 0) {
      const v = left >= 10 ? 5 : 1;
      left -= v;
      this.pickups.push({ id: this.id(), x, y, vx: (Math.random() - 0.5) * 180, vy: -120 - Math.random() * 140, value: v, kind: 'fragment', t: 0, grounded: false });
    }
  }

  /**
   * Hurts the player. `src` says what hit: enemy blows, projectiles, blasts and boss beams can be
   * blocked from the front (Q); traps, hazard tiles and floor attacks cannot.
   */
  damagePlayer(dmg: number, srcX: number, unavoidable = false, src?: { kind: 'melee' | 'projectile' | 'blast' | 'beam'; enemy?: Enemy; proj?: Projectile }) {
    const p = this.player;
    if (p.dead || this.over) return;
    if (!unavoidable && src && p.blocking && p.iframes <= 0) {
      const pc = p.x + p.w / 2;
      const front = Math.abs(srcX - pc) < 3 || Math.sign(srcX - pc) === p.facing;
      if (front && this.guard(dmg, srcX, src)) return;
    }
    // perfect dodge: a hit that lands during a dash triggers bullet-time and a counter window
    if (!unavoidable && (p.dashT > 0 || p.dashGrace > 0)) {
      if (!p.dodgeUsed) {
        p.dodgeUsed = true;
        this.slowmo = 0.55;
        p.energy = Math.min(p.maxEnergy, p.energy + 30);
        p.counterT = 1.2;
        p.iframes = Math.max(p.iframes, 0.5);
        this.run.perfect++;
        this.audio.play('charge');
        this.ring(p.x + p.w / 2, p.y + p.h / 2, '#3ee6ff', 34);
        this.events.push({ type: 'toast', text: 'Perfekcyjny unik!', color: '#3ee6ff' });
      }
      return;
    }
    if (p.iframes > 0 && !unavoidable) return;
    if (p.iframes > 0 && unavoidable && p.y < this.grid.h * TILE) return;
    dmg = Math.round(dmg * (1 - this.up('kinetic') * 0.15) * (1 + this.run.area * 0.06));
    p.hp -= dmg;
    this.run.combo = 0;
    this.run.comboT = 0;
    p.iframes = PLAYER.hurtIframes;
    p.hurtT = 0.22;
    p.attack = null;
    p.chargeT = 0;
    const dir = Math.sign(p.x + p.w / 2 - srcX) || -p.facing;
    p.vx = dir * 170;
    p.vy = -190;
    this.shake = Math.max(this.shake, 6);
    this.flash = 0.35;
    this.hitstop = 0.06;
    this.audio.play('hurt');
    this.floater(p.x + p.w / 2, p.y - 6, `-${dmg}`, '#ff4a5a');
    this.burst(p.x + p.w / 2, p.y + p.h / 2, 10, '#ff4a5a', 'spark', 180);
    if (p.y > this.grid.h * TILE) {
      // fell out of the map: put the player back at the room entrance
      p.x = this.room.spawn.x * TILE + 3;
      p.y = (this.room.spawn.y + 1) * TILE - p.h;
      p.vx = 0;
      p.vy = 0;
    }
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      p.deathT = 0;
      p.anim = 'dead';
      p.animT = 0;
      this.audio.play('death');
      this.burst(p.x + p.w / 2, p.y + p.h / 2, 30, COSMETICS[this.cosmetic].glow, 'spark', 220);
    }
  }

  // ================================================================== projectiles, hazards
  addProjectile(p: Omit<Projectile, 'id' | 'hit'>) {
    const pr: Projectile = { ...p, id: this.id(), hit: new Set() };
    this.projectiles.push(pr);
    return pr;
  }

  private updateProjectiles(dt: number) {
    const p = this.player;
    for (const pr of this.projectiles) {
      pr.life -= dt;
      if (pr.homing && pr.owner === 'enemy') {
        const dx = p.x + p.w / 2 - pr.x;
        const dy = p.y + p.h / 2 - pr.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = Math.hypot(pr.vx, pr.vy);
        pr.vx += ((dx / d) * sp - pr.vx) * pr.homing * dt;
        pr.vy += ((dy / d) * sp - pr.vy) * pr.homing * dt;
      }
      pr.vy += pr.gravity * dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (pr.kind === 'wave' || pr.kind === 'orb' || pr.kind === 'spore') if (Math.random() < 0.5) this.part(pr.x, pr.y, 0, 0, 0.25, pr.owner === 'player' ? COSMETICS[this.cosmetic].glow : pr.kind === 'spore' ? '#7dff4a' : '#c45cff', 2, 0, 'glow');
      // walls
      const inWall = solidAt(this.grid, Math.floor(pr.x / TILE), Math.floor(pr.y / TILE));
      if (inWall) {
        if (pr.kind === 'shock') {
          pr.life = 0;
        } else if (pr.kind === 'grenade') {
          this.explode(pr.x, pr.y, 46, pr.dmg, 'player');
          pr.life = 0;
        } else if (pr.kind === 'acid') {
          this.hazards.push({ kind: 'acidPool', x: pr.x - 14, y: Math.floor(pr.y / TILE) * TILE - 4, w: 28, h: 5, t: 0, warn: 0, active: 3, dmg: 10 });
          pr.life = 0;
        } else {
          if (pr.owner === 'player' && (pr.kind === 'bolt' || pr.kind === 'wave')) this.breakTilesIn({ x: pr.x - 3, y: pr.y - 3, w: 6, h: 6 });
          pr.life = 0;
        }
        if (pr.life <= 0) this.burst(pr.x, pr.y, 5, pr.owner === 'player' ? '#9ff6ff' : '#ff6a7a', 'spark', 100);
        continue;
      }
      for (const pp of this.props) {
        if ((pp.kind !== 'crate' && pp.kind !== 'barrel') || pp.state !== 'idle' || pr.hit.has(pp.id)) continue;
        if (pr.x + pr.r > pp.x && pr.x - pr.r < pp.x + pp.w && pr.y + pr.r > pp.y && pr.y - pr.r < pp.y + pp.h) {
          pr.hit.add(pp.id);
          this.hitProp(pp);
          if (!pr.pierce && pr.kind !== 'grenade') pr.life = 0;
        }
      }
      if (pr.life <= 0) continue;
      if (pr.owner === 'player') {
        for (const e of this.enemies) {
          if (e.dead || pr.hit.has(e.id)) continue;
          if (pr.x + pr.r > e.x && pr.x - pr.r < e.x + e.w && pr.y + pr.r > e.y && pr.y - pr.r < e.y + e.h) {
            pr.hit.add(e.id);
            if (pr.kind === 'grenade') {
              this.explode(pr.x, pr.y, 46, pr.dmg, 'player');
              pr.life = 0;
              break;
            }
            this.hitEnemy(e, pr.dmg, Math.sign(pr.vx) || 1, pr.kind === 'wave' ? 160 : pr.kind === 'shock' ? 200 : 60, pr.kind === 'bolt' ? 'shot' : 'special');
            if (!pr.pierce) {
              pr.life = 0;
              break;
            }
          }
        }
      } else if (!p.dead) {
        const hb = { x: p.x + 1, y: p.y + 2, w: p.w - 2, h: p.h - 3 };
        if (pr.x + pr.r > hb.x && pr.x - pr.r < hb.x + hb.w && pr.y + pr.r > hb.y && pr.y - pr.r < hb.y + hb.h) {
          if (p.iframes <= 0) {
            const before = pr.owner;
            this.damagePlayer(pr.dmg, pr.x - pr.vx * 0.1, false, { kind: 'projectile', proj: pr });
            if (pr.owner === before) pr.life = 0; // not reflected
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.life > 0);
  }

  explode(x: number, y: number, r: number, dmg: number, owner: 'player' | 'enemy') {
    this.audio.play('explosion');
    this.shake = Math.max(this.shake, 6);
    this.ring(x, y, owner === 'player' ? '#ffb23e' : '#ff4a5a', r);
    this.burst(x, y, 22, owner === 'player' ? '#ffb23e' : '#ff4a5a', 'spark', 260);
    this.burst(x, y, 6, '#40384a', 'smoke', 60);
    for (const pp of this.props) if ((pp.kind === 'crate' || pp.kind === 'barrel') && pp.state === 'idle' && Math.hypot(pp.x + pp.w / 2 - x, pp.y + pp.h / 2 - y) < r + 8) this.hitProp(pp);
    if (owner === 'player') {
      for (const e of this.enemies) if (!e.dead && Math.hypot(e.x + e.w / 2 - x, e.y + e.h / 2 - y) < r + e.w / 2) this.hitEnemy(e, dmg, Math.sign(e.x + e.w / 2 - x) || 1, 220, 'special');
      this.breakTilesIn({ x: x - r / 2, y: y - r / 2, w: r, h: r });
    } else {
      const p = this.player;
      if (Math.hypot(p.x + p.w / 2 - x, p.y + p.h / 2 - y) < r + 6) this.damagePlayer(dmg, x, false, { kind: 'blast' });
    }
  }

  private updateHazards(dt: number) {
    const p = this.player;
    for (const h of this.hazards) {
      h.t += dt;
      switch (h.kind) {
        case 'laser': {
          const cyc = h.t % (h.period ?? 3);
          const firing = cyc > h.warn && cyc < h.warn + h.active;
          if (cyc < dt * 1.5 && Math.abs(h.x - p.x) < 260) this.audio.play('telegraph');
          if (firing && cyc - h.warn < dt * 1.5 && Math.abs(h.x - p.x) < 300) this.audio.play('laser');
          if (firing && overlap(h, p)) this.damagePlayer(h.dmg, h.x);
          break;
        }
        case 'acidPool':
          if (h.t > h.active) h.t = 1e9;
          else if (overlap(h, p) && p.onGround) this.damagePlayer(h.dmg, h.x + h.w / 2);
          break;
        case 'mine':
          if (h.t >= h.warn && !h.hitDone) {
            h.hitDone = true;
            this.explode(h.x, h.y, 34, h.dmg, 'player');
          }
          if (h.t > h.warn + 0.2) h.t = 1e9;
          break;
        case 'marker':
          if (h.t > h.warn + 0.3) h.t = 1e9;
          break;
        case 'beam':
        case 'hline':
        case 'spikes':
        case 'shockwave': {
          // generic telegraphed boss hazards: rectangle (or rotated beam) that hurts after `warn`
          if (h.t > h.warn && h.t < h.warn + h.active) {
            if (h.kind === 'beam' && h.len !== undefined && h.angle !== undefined) {
              if (segmentHitsBox(h.x, h.y, h.x + Math.cos(h.angle) * h.len, h.y + Math.sin(h.angle) * h.len, (h.w || 10) / 2, p)) this.damagePlayer(h.dmg, h.x, false, { kind: 'beam' });
            } else if (overlap(h, p)) this.damagePlayer(h.dmg, h.x + h.w / 2, false, h.kind === 'hline' ? { kind: 'beam' } : undefined);
          }
          if (h.kind === 'shockwave' && h.vx && h.t > h.warn) {
            h.x += h.vx * dt;
            if (solidAt(this.grid, Math.floor((h.x + (h.vx > 0 ? h.w : 0)) / TILE), Math.floor((h.y + h.h / 2) / TILE))) h.t = 1e9;
          }
          if (h.t > h.warn + h.active) h.t = 1e9;
          break;
        }
      }
    }
    this.hazards = this.hazards.filter((h) => h.t < 1e8);
  }

  // ================================================================== interactive scenery
  hitProp(pr: Prop) {
    if (pr.state === 'gone') return;
    if (pr.kind === 'crate') {
      pr.state = 'gone';
      this.audio.play('hit');
      const cx = pr.x + pr.w / 2;
      const cy = pr.y + pr.h / 2;
      for (let i = 0; i < 10; i++) this.part(cx, cy, (Math.random() - 0.5) * 220, -60 - Math.random() * 180, 0.9, i % 2 ? '#5a4a34' : '#7a6444', 3, 600, 'debris');
      if (Math.random() < 0.25) this.pickups.push({ id: this.id(), x: cx, y: cy, vx: 0, vy: -140, value: 15, kind: 'health', t: 0, grounded: false });
      else this.dropFragments(cx, cy, 2 + Math.floor(Math.random() * 3));
    } else if (pr.kind === 'barrel' && pr.state === 'idle') {
      // a short fuse gives everyone a moment to react
      pr.state = 'lit';
      pr.t = 0;
      this.audio.play('telegraph');
    }
  }

  private updateWeather(dt: number) {
    this.lightning = Math.max(0, this.lightning - dt * 3);
    if (this.weather === 'storm') {
      // gusts: the wind picks a new strength every few seconds and eases towards it
      this.windT -= dt;
      if (this.windT <= 0) {
        this.windT = 2.5 + Math.random() * 3;
        this.windTarget = (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 45);
      }
      this.wind += (this.windTarget - this.wind) * Math.min(1, dt * 1.5);
    } else this.wind *= 1 - Math.min(1, dt * 3);
    if (this.weather === 'storm' || this.weather === 'voidstorm') {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = 4 + Math.random() * 6;
        this.lightning = 1;
        this.lightningX = this.player.x + (Math.random() - 0.5) * 400;
        this.audio.play('thunder');
      }
    }
  }

  weatherName() {
    return WEATHER_INFO[this.weather].name;
  }

  /** Moving platforms move first and carry whoever stands on them. */
  private updateMovers(dt: number) {
    const p = this.player;
    for (const pr of this.props) {
      if (pr.kind !== 'mover') continue;
      pr.t += dt;
      const span = (pr.bx ?? pr.x) - (pr.ax ?? pr.x);
      // smooth back-and-forth (sine), ~45 px/s in the middle, slowing down at the ends
      const period = Math.max(3, (span / 45) * Math.PI);
      const e = 0.5 - 0.5 * Math.cos((pr.t / period) * Math.PI * 2);
      const nx = (pr.ax ?? pr.x) + span * e;
      pr.dx = nx - pr.x;
      pr.x = nx;
      if (p.ride === pr.id && !p.dead) {
        const onTop = Math.abs(p.y + p.h - pr.y) < 2 && p.x + p.w > pr.x - 2 && p.x < pr.x + pr.w + 2;
        if (onTop) {
          // carry the rider sideways unless a wall is in the way
          const tx = Math.floor((pr.dx > 0 ? p.x + p.w + pr.dx : p.x + pr.dx) / TILE);
          const y0 = Math.floor(p.y / TILE);
          const y1 = Math.floor((p.y + p.h - 0.01) / TILE);
          let blocked = false;
          for (let ty = y0; ty <= y1; ty++) if (solidAt(this.grid, tx, ty)) blocked = true;
          if (!blocked) p.x += pr.dx;
        } else p.ride = -1;
      }
    }
  }

  /** Lands the player on top of a moving platform (one-way, like a ledge). */
  private landOnMovers(feet0: number) {
    const p = this.player;
    p.ride = -1;
    if (p.vy < 0 || p.dropT > 0 || p.dead) return;
    for (const pr of this.props) {
      if (pr.kind !== 'mover') continue;
      if (p.x + p.w <= pr.x + 1 || p.x >= pr.x + pr.w - 1) continue;
      const feet = p.y + p.h;
      if (feet0 <= pr.y + 3 && feet >= pr.y - 0.5 && feet <= pr.y + 12) {
        p.y = pr.y - p.h;
        p.vy = 0;
        p.onGround = true;
        p.ride = pr.id;
        return;
      }
    }
  }

  private updateProps(dt: number) {
    const p = this.player;
    const pbox = { x: p.x + 2, y: p.y + 2, w: p.w - 4, h: p.h - 2 };
    const hurtEnemies = (box: { x: number; y: number; w: number; h: number }, dmg: number, rate: number) => {
      for (const e of this.enemies) if (!e.dead && e.type !== 'boss' && overlap(box, e) && Math.random() < dt * rate) this.hitEnemy(e, dmg, Math.sign(e.x + e.w / 2 - (box.x + box.w / 2)) || 1, 120, 'mine');
    };
    for (const pr of this.props) {
      if (pr.kind === 'mover') continue;
      pr.t += dt;
      switch (pr.kind) {
        case 'saw': {
          // runs along its track and bounces at the ends
          const sp = 62 + this.run.area * 6;
          pr.x += (pr.dir ?? 1) * sp * dt;
          if (pr.x >= (pr.bx ?? pr.x)) {
            pr.x = pr.bx ?? pr.x;
            pr.dir = -1;
          } else if (pr.x <= (pr.ax ?? pr.x)) {
            pr.x = pr.ax ?? pr.x;
            pr.dir = 1;
          }
          const cx = pr.x + 8;
          const cy = pr.y + 8;
          if (Math.random() < 0.5) this.part(cx - (pr.dir ?? 1) * 4, pr.y + 15, -(pr.dir ?? 1) * (40 + Math.random() * 80), -40 - Math.random() * 60, 0.25, '#ffcf8a', 1, 300, 'spark');
          if (!p.dead && Math.hypot(Math.max(p.x, Math.min(cx, p.x + p.w)) - cx, Math.max(p.y, Math.min(cy, p.y + p.h)) - cy) < 7) this.damagePlayer(14, cx);
          hurtEnemies({ x: cx - 7, y: cy - 7, w: 14, h: 14 }, 10, 4);
          break;
        }
        case 'spiketrap': {
          const cyc = pr.t % pr.phase;
          const prev = pr.state;
          pr.state = cyc < 1.9 ? 'idle' : cyc < 2.5 ? 'warn' : 'on';
          if (pr.state === 'warn' && prev === 'idle' && Math.abs(pr.x - p.x) < 140) this.audio.play('telegraph');
          if (pr.state === 'on' && prev === 'warn') {
            for (let i = 0; i < 4; i++) this.part(pr.x + Math.random() * 16, pr.y + 11, (Math.random() - 0.5) * 40, -30, 0.3, '#8a93ad', 2, 80, 'dust');
          }
          if (pr.state === 'on') {
            const box = { x: pr.x + 2, y: pr.y + 2, w: 12, h: 10 };
            if (overlap(box, pbox)) this.damagePlayer(16, pr.x + 8);
            hurtEnemies(box, 12, 3);
          }
          break;
        }
        case 'flame': {
          const cyc = pr.t % pr.phase;
          const prev = pr.state;
          pr.state = cyc < 1.2 ? 'idle' : cyc < 1.9 ? 'warn' : 'on';
          if (pr.state === 'warn' && prev === 'idle' && Math.abs(pr.x - p.x) < 180) this.audio.play('telegraph');
          if (pr.state === 'on') {
            const k = Math.min(1, (cyc - 1.9) / 0.15);
            const len = pr.w * k;
            const box = pr.dir! > 0 ? { x: pr.ax!, y: pr.y, w: len, h: pr.h } : { x: pr.ax! - len, y: pr.y, w: len, h: pr.h };
            if (overlap(box, pbox)) this.damagePlayer(12, pr.ax!);
            hurtEnemies(box, 8, 4);
            if (Math.random() < 0.9) this.part(pr.ax! + pr.dir! * Math.random() * len, pr.y + 6 + (Math.random() - 0.5) * 8, pr.dir! * 60, -20 - Math.random() * 30, 0.35, Math.random() < 0.5 ? '#ffb23e' : '#ff5a2a', 2, -60, 'glow');
          } else if (pr.state === 'warn' && Math.random() < 0.4) this.part(pr.ax! + pr.dir! * 3, pr.y + 6, pr.dir! * 20, -10, 0.2, '#ffe066', 1, 0, 'spark');
          break;
        }
        case 'faller': {
          if (pr.state === 'idle') {
            const under = Math.abs(p.x + p.w / 2 - (pr.x + 5)) < 16 && p.y > pr.y && p.y - pr.y < 11 * TILE && !p.dead;
            if (under && lineOfSight(this.grid, pr.x + 5, pr.y + 4, p.x + p.w / 2, p.y + 4)) {
              pr.state = 'shake';
              pr.t = 0;
              this.audio.play('telegraph');
            }
          } else if (pr.state === 'shake') {
            if (Math.random() < 0.3) this.part(pr.x + Math.random() * 10, pr.y, 0, 20, 0.4, '#5a5068', 1, 200, 'debris');
            if (pr.t > 0.5) {
              pr.state = 'fall';
              pr.vy = 0;
            }
          } else if (pr.state === 'fall') {
            pr.vy = Math.min(520, (pr.vy ?? 0) + 900 * dt);
            pr.y += pr.vy * dt;
            const box = { x: pr.x, y: pr.y, w: pr.w, h: pr.h };
            let hit = false;
            if (overlap(box, pbox)) {
              this.damagePlayer(18, pr.x + 5);
              hit = true;
            }
            for (const e of this.enemies) if (!e.dead && e.type !== 'boss' && overlap(box, e)) {
              this.hitEnemy(e, 30, 0, 0, 'mine');
              hit = true;
            }
            const tx = Math.floor((pr.x + 5) / TILE);
            const ty = Math.floor((pr.y + pr.h) / TILE);
            if (hit || solidAt(this.grid, tx, ty) || tileAt(this.grid, tx, ty) === T_PLATFORM || pr.y > this.grid.h * TILE) {
              pr.state = 'gone';
              pr.t = 0;
              this.shake = Math.max(this.shake, 3);
              this.audio.play('land');
              for (let i = 0; i < 10; i++) this.part(pr.x + 5, pr.y + pr.h, (Math.random() - 0.5) * 160, -Math.random() * 120, 0.7, i % 2 ? '#6a5a7a' : '#3a3048', 2, 500, 'debris');
            }
          } else if (pr.state === 'gone' && pr.t > 5) {
            // grows back slowly
            pr.state = 'idle';
            pr.t = 0;
            pr.x = pr.ax ?? pr.x;
            pr.y = pr.ay ?? pr.y;
          }
          break;
        }
        case 'barrel':
          if (pr.state === 'lit' && pr.t > 0.45) {
            pr.state = 'gone';
            const cx = pr.x + pr.w / 2;
            const cy = pr.y + pr.h / 2;
            this.explode(cx, cy, 50, 45, 'player');
            // the blast also reaches the player — stay clear of barrels you set off
            if (Math.hypot(p.x + p.w / 2 - cx, p.y + p.h / 2 - cy) < 42) this.damagePlayer(16, cx);
          }
          break;
        case 'pad':
          if (!p.dead && p.vy >= 0 && p.x + p.w > pr.x + 2 && p.x < pr.x + pr.w - 2 && Math.abs(p.y + p.h - pr.y - pr.h) < 6) {
            p.vy = -560;
            p.onGround = false;
            p.airJumps = this.airJumpsMax();
            p.airDashes = this.airDashesMax();
            pr.t = 0;
            this.audio.play('djump');
            this.ring(pr.x + pr.w / 2, pr.y, AREAS[this.run.area].palette.accent, 18);
          }
          break;
        case 'vent': {
          const cyc = pr.t % pr.phase;
          const warn = 0.9;
          const active = cyc > warn && cyc < warn + 0.7;
          if (cyc < dt * 1.5 && Math.abs(pr.x - p.x) < 220) this.audio.play('telegraph');
          const col = { x: pr.x - 2, y: pr.y - 46, w: pr.w + 4, h: 46 };
          if (active) {
            if (Math.random() < 0.9) this.part(pr.x + Math.random() * pr.w, pr.y, (Math.random() - 0.5) * 20, -120 - Math.random() * 80, 0.5, '#c8d2e6', 3, -40, 'smoke');
            if (overlap(col, p)) {
              p.vy = Math.min(p.vy, -260);
              this.damagePlayer(8, pr.x + pr.w / 2);
            }
            for (const e of this.enemies) if (!e.dead && e.type !== 'boss' && overlap(col, e) && Math.random() < dt * 3) this.hitEnemy(e, 6, 0, 0, 'mine');
          } else if (cyc < warn && Math.random() < 0.3) this.part(pr.x + Math.random() * pr.w, pr.y, 0, -30, 0.3, '#9aa7c4', 2, -20, 'smoke');
          break;
        }
        case 'crumble': {
          const tiles = pr.tiles ?? [];
          if (pr.state === 'idle' || pr.state === 'shake') {
            const on = !p.dead && p.onGround && Math.abs(p.y + p.h - pr.y) < 2 && p.x + p.w > pr.x && p.x < pr.x + pr.w;
            if (on && pr.state === 'idle') {
              pr.state = 'shake';
              pr.t = 0;
              this.audio.play('telegraph');
            }
            if (pr.state === 'shake' && pr.t > 0.5) {
              pr.state = 'gone';
              pr.t = 0;
              for (const i of tiles) this.grid.tiles[i] = T_EMPTY;
              for (let i = 0; i < 12; i++) this.part(pr.x + Math.random() * pr.w, pr.y + 2, (Math.random() - 0.5) * 60, Math.random() * 40, 0.8, '#5a4a6a', 2, 500, 'debris');
              this.audio.play('land');
            }
          } else if (pr.state === 'gone' && pr.t > 2.6 && !overlap({ x: pr.x, y: pr.y - 2, w: pr.w, h: 8 }, p)) {
            pr.state = 'idle';
            pr.t = 0;
            for (const i of tiles) this.grid.tiles[i] = 2;
          }
          break;
        }
      }
    }
  }

  // ================================================================== pickups & objects
  private updatePickups(dt: number) {
    const p = this.player;
    // once a room is cleared every fragment flies to the player — no tedious collecting
    const cleared = !this.enemies.some((e) => !e.dead);
    const pr = cleared ? 1e9 : 28 + this.up('magnet') * 30;
    for (const k of this.pickups) {
      k.t += dt;
      const dx = p.x + p.w / 2 - k.x;
      const dy = p.y + p.h / 2 - k.y;
      const d = Math.hypot(dx, dy);
      if (!p.dead && d < pr && k.t > (cleared ? 0.8 : 0.35)) {
        k.vx += (dx / d) * 1400 * dt;
        k.vy += (dy / d) * 1400 * dt;
        k.vx *= 0.9;
        k.vy *= 0.9;
        k.x += k.vx * dt;
        k.y += k.vy * dt;
        k.grounded = false;
      } else if (!k.grounded) {
        k.vy = Math.min(300, k.vy + 700 * dt);
        k.vx *= 1 - dt * 2;
        const nx = k.x + k.vx * dt;
        if (!solidAt(this.grid, Math.floor(nx / TILE), Math.floor(k.y / TILE))) k.x = nx;
        else k.vx *= -0.5;
        const ny = k.y + k.vy * dt;
        const t = tileAt(this.grid, Math.floor(k.x / TILE), Math.floor((ny + 3) / TILE));
        if (t === 1 || t === T_BREAK || (t === 2 && k.vy > 0)) {
          k.vy *= -0.35;
          if (Math.abs(k.vy) < 30) k.grounded = true;
        } else k.y = ny;
      }
      if (!p.dead && d < 10) {
        k.t = -1;
        if (k.kind === 'fragment') {
          this.run.fragments += k.value;
          this.audio.play('pickup');
          this.part(k.x, k.y, 0, -30, 0.4, '#e0b3ff', 3, 0, 'glow');
        } else {
          const heal = Math.min(p.maxHp - p.hp, k.value);
          p.hp += heal;
          this.audio.play('heal');
          this.floater(p.x + p.w / 2, p.y - 6, `+${Math.round(k.value)}`, '#5dff9b');
        }
      }
    }
    this.pickups = this.pickups.filter((k) => k.t >= 0 && k.y < this.grid.h * TILE + 40);
  }

  /** The object the player can interact with right now (for the prompt). */
  nearObject(): WorldObject | null {
    const p = this.player;
    let best: WorldObject | null = null;
    let bd = 26;
    for (const o of this.objects) {
      if (o.kind === 'sign' || o.kind === 'checkpoint') continue;
      if (o.used && o.kind !== 'terminal') continue;
      const d = Math.hypot(o.x - (p.x + p.w / 2), o.y - (p.y + p.h));
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  private updateObjects(dt: number) {
    const p = this.player;
    let sign: string | null = null;
    for (const o of this.objects) {
      o.t += dt;
      const near = Math.abs(o.x - (p.x + p.w / 2)) < 20 && Math.abs(o.y - (p.y + p.h)) < 26;
      if (o.kind === 'sign' && Math.abs(o.x - (p.x + p.w / 2)) < 40 && Math.abs(o.y - (p.y + p.h)) < 40) sign = o.text ?? null;
      if (o.kind === 'checkpoint' && near && !o.used && !p.dead) {
        o.used = true;
        p.energy = p.maxEnergy;
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
        this.audio.play('checkpoint');
        this.ring(o.x, o.y - 14, '#5dff9b', 30);
        this.events.push({ type: 'checkpoint' });
      }
    }
    if (sign !== this.activeSign) {
      this.activeSign = sign;
      if (sign) this.events.push({ type: 'sign', text: sign });
    }
    if (this.input.hit('interact') && !p.dead) {
      const o = this.nearObject();
      if (o) this.interact(o);
    }
  }

  interact(o: WorldObject) {
    const p = this.player;
    p.interactT = 0.3;
    switch (o.kind) {
      case 'terminal':
        o.used = true;
        this.audio.play('terminal');
        this.events.push({ type: 'dialog', speaker: 'TERMINAL', text: o.text ?? '', duration: 8 });
        break;
      case 'chest': {
        o.used = true;
        this.audio.play('door');
        const v = 8 + this.run.area * 3 + Math.floor(Math.random() * 6);
        this.dropFragments(o.x, o.y - 12, Math.round(v * (1 + this.up('magnet') * 0.25)));
        if (Math.random() < 0.35 && p.healCharges < this.maxHealCharges() + 1) {
          p.healCharges++;
          this.events.push({ type: 'toast', text: '+1 nanoapteczka', color: '#5dff9b' });
        }
        this.ring(o.x, o.y - 8, '#e0b3ff', 24);
        break;
      }
      case 'secret': {
        o.used = true;
        this.audio.play('upgrade');
        this.dropFragments(o.x, o.y - 12, 15 + this.run.area * 4);
        this.events.push({ type: 'toast', text: 'Skrytka! Fragmenty Pustki', color: '#e0b3ff' });
        break;
      }
      case 'medstation':
        o.used = true;
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5);
        this.audio.play('heal');
        this.ring(o.x, o.y - 12, '#5dff9b', 26);
        this.events.push({ type: 'toast', text: 'Stacja medyczna: +50% zdrowia', color: '#5dff9b' });
        break;
      case 'altar':
        o.used = true;
        this.offerChoice(3, 'Ołtarz ulepszeń');
        break;
    }
  }

  // ================================================================== upgrades
  /** Random distinct upgrades the player can still take. */
  rollUpgrades(n: number): UpgradeId[] {
    const pool = (Object.keys(UPGRADES) as UpgradeId[]).filter((id) => this.up(id) < UPGRADES[id].max);
    const out: UpgradeId[] = [];
    while (out.length < n && pool.length) {
      const total = pool.reduce((s, id) => s + UPGRADES[id].weight, 0);
      let r = this.rng.next() * total;
      let i = 0;
      for (; i < pool.length - 1; i++) {
        r -= UPGRADES[pool[i]].weight;
        if (r <= 0) break;
      }
      out.push(pool[i]);
      pool.splice(i, 1);
    }
    return out;
  }

  offerChoice(n: number, reason: string) {
    const options = this.rollUpgrades(Math.max(2, n === 1 ? 2 : 3));
    if (!options.length) {
      this.dropFragments(this.player.x, this.player.y, 10);
      return;
    }
    this.pendingChoice = { options, reason };
    this.audio.play('upgrade');
    this.events.push({ type: 'choice', options, reason });
  }

  choose(id: UpgradeId) {
    if (!this.pendingChoice || !this.pendingChoice.options.includes(id)) return;
    this.run.upgrades[id] = this.up(id) + 1;
    if (id === 'plating') {
      this.player.maxHp = this.maxHp();
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
    }
    if (id === 'triplejump') this.player.airJumps = this.airJumpsMax();
    this.pendingChoice = null;
    this.input.clear();
    this.audio.play('ui');
    this.events.push({ type: 'toast', text: `${UPGRADES[id].name}`, color: UPGRADES[id].color });
    this.ring(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, UPGRADES[id].color, 30);
  }

  // ================================================================== door, boss, end
  private updateDoor(dt: number) {
    const alive = this.enemies.some((e) => !e.dead && e.type !== 'larva');
    if (this.doorLocked && !alive && !(this.room.boss && this.bossIntroT > 0) && !(this.room.boss && this.bossId < 0)) {
      this.doorLocked = false;
      this.doorT = 0;
      this.audio.play('door');
      this.events.push({ type: 'doorUnlocked' });
      this.onRoomCleared();
    }
    this.doorT += dt;
    if (!this.doorLocked && !this.player.dead && !this.transition && overlap(this.exitRect(), this.player)) this.goNext();
  }

  private startBoss() {
    const kind = this.room.boss as 'matka' | 'straznik' | 'serce';
    const k = this.room.grid.marks.find((m) => m.m === 'K')!;
    const boss = spawnBoss(this, kind, k.x * TILE, (k.y + 1) * TILE);
    this.enemies.push(boss);
    this.bossId = boss.id;
    this.audio.play('bossRoar');
    this.shake = 8;
    this.events.push({ type: 'bossStart', name: BOSS_INFO[kind].name, title: BOSS_INFO[kind].title });
  }

  boss(): Enemy | null {
    return this.enemies.find((e) => e.id === this.bossId) ?? null;
  }

  private bossDefeated(e: Enemy) {
    const kind = e.boss!;
    this.run.bosses++;
    this.shake = 14;
    this.flash = 0.6;
    this.hazards = [];
    this.projectiles = this.projectiles.filter((p) => p.owner === 'player');
    for (const o of this.enemies) if (!o.dead && o !== e) this.killEnemy(o);
    this.dropFragments(e.x + e.w / 2, e.y + e.h / 2, [0, 40, 0, 60, 100][this.run.area] ?? 40);
    this.events.push({ type: 'bossDefeated', name: BOSS_INFO[kind].name });
    this.events.push({ type: 'dialog', speaker: 'ARIA', text: BOSS_INFO[kind].outro, duration: 6 });
    const p = this.player;
    p.hp = p.maxHp;
    p.healCharges = Math.max(p.healCharges, this.maxHealCharges());
    if (kind !== 'serce') this.offerChoice(3, 'Nagroda za pokonanie strażnika');
  }

  /** Elite arena cleared → reward. */
  onRoomCleared() {
    if (this.room.role === 'elite') {
      this.dropFragments(this.player.x + 20, this.player.y, 15);
      this.offerChoice(3, 'Nagroda za arenę elit');
    }
  }

  /** Ends the expedition: fragments and statistics go to the permanent profile (once). */
  settled = false;
  settle() {
    if (this.settled) return;
    this.settled = true;
    const m = this.meta;
    m.fragments += this.run.fragments;
    m.totalFragments += this.run.fragments;
    m.stats.runs++;
    m.tutorialDone = true; // the tutorial room only opens the very first expedition
    m.stats.kills += this.run.kills;
    m.stats.bosses += this.run.bosses;
    m.stats.bestArea = Math.max(m.stats.bestArea, this.run.area + 1);
    if (this.over === 'victory') {
      m.stats.wins++;
      if (!m.stats.bestTime || this.run.time < m.stats.bestTime) m.stats.bestTime = Math.round(this.run.time);
    } else m.stats.deaths++;
  }

  private die() {
    this.over = 'dead';
    this.events.push({ type: 'death' });
  }

  private win() {
    this.over = 'victory';
    this.run.fragments += 50;
    this.player.anim = 'victory';
    this.events.push({ type: 'victory' });
  }

  // ================================================================== fx helpers
  part(x: number, y: number, vx: number, vy: number, life: number, color: string, size: number, g: number, kind: Particle['kind']) {
    if (this.particles.length > 700) return;
    this.particles.push({ x, y, vx, vy, life, max: life, color, size, g, kind });
  }
  burst(x: number, y: number, n: number, color: string, kind: Particle['kind'], speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.part(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.4, color, kind === 'debris' ? 3 : 2, kind === 'debris' ? 500 : kind === 'smoke' ? -30 : 150, kind);
    }
  }
  ring(x: number, y: number, color: string, r: number) {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, color, size: r, g: 0, kind: 'ring' });
  }
  floater(x: number, y: number, text: string, color: string) {
    this.floaters.push({ x, y, text, color, t: 0 });
  }

  private updateParticles(dt: number) {
    for (const q of this.particles) {
      q.life -= dt;
      q.vy += q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.kind === 'debris' && solidAt(this.grid, Math.floor(q.x / TILE), Math.floor(q.y / TILE))) {
        q.vy *= -0.3;
        q.vx *= 0.6;
        q.y -= 2;
      }
    }
    this.particles = this.particles.filter((q) => q.life > 0);
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < 0.9);
    for (const b of this.bolts) b.t += dt;
    this.bolts = this.bolts.filter((b) => b.t < 0.18);
    for (const b of this.beams) b.t += dt;
    this.beams = this.beams.filter((b) => b.t < b.max);
  }

  // ---- helpers for enemy AI
  playerCenter() {
    const p = this.player;
    return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
  }
  sees(e: Enemy, range: number) {
    const c = this.playerCenter();
    const ex = e.x + e.w / 2;
    const ey = e.y + e.h / 2;
    // fog shortens everyone's sight
    const r = this.weather === 'fog' ? range * 0.7 : range;
    return !this.player.dead && Math.hypot(c.x - ex, c.y - ey) < r && lineOfSight(this.grid, ex, ey, c.x, c.y);
  }
  enemyName(e: Enemy) {
    return ENEMY_NAMES[e.type as keyof typeof ENEMY_NAMES] ?? '';
  }
}

function segmentHitsBox(x0: number, y0: number, x1: number, y1: number, r: number, b: { x: number; y: number; w: number; h: number }) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / len2));
  const px = x0 + dx * t;
  const py = y0 + dy * t;
  return Math.abs(px - cx) < b.w / 2 + r && Math.abs(py - cy) < b.h / 2 + r;
}
