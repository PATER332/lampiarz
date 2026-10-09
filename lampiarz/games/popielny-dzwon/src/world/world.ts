// The play session: entities, hit resolution, interactions, camera and events.
import { BOSSES, LOCATIONS, LORE, RELICS, type LocationId, type RelicId } from '../data/content';
import type { Input } from '../core/input';
import { clamp, hashString, overlap, Rng, sign, type Rect } from '../core/util';
import { createBoss, Dzwon, type Boss, type BossWorld } from '../entities/bosses';
import { Enemy } from '../entities/enemies';
import { P, Player } from '../entities/player';
import type { SaveData, Settings } from '../save';
import { Fx } from './fx';
import { updateHazard, type Hazard } from './hazards';
import { buildHub, buildLevel, Level, T, touchesSpikes, type Spawn } from './level';
import type { AttackInstance, Hitbox, Light, Projectile, SfxName } from './types';

export type InteractKind = 'shrine' | 'chest' | 'lore' | 'hint' | 'event' | 'station' | 'portal' | 'statue' | 'lantern' | 'cage';

export interface Interactable {
  id: string;
  kind: InteractKind;
  x: number;
  y: number; // feet
  used: boolean;
  data: string;
  secret?: boolean;
  anim: number;
}

export type WorldEvent =
  | { type: 'interact'; it: Interactable }
  | { type: 'died' }
  | { type: 'bossIntro'; name: string; title: string }
  | { type: 'bossDefeated'; boss: Boss }
  | { type: 'announce'; text: string; sub?: string }
  | { type: 'loot'; text: string; sub?: string }
  | { type: 'save' }
  | { type: 'music'; mood: 'explore' | 'tension' | 'boss' | 'hub' | 'silence' | 'victory' };

export const HINTS: Record<string, string> = {
  '1': 'A / D — ruch. Spacja — skok; przytrzymaj, by skoczyć wyżej.',
  '2': 'Na kładki wskoczysz od spodu. S + Spacja — zeskok. Skrzynie i kapliczki: E.',
  '3': 'Lewy przycisk / J — lekki atak; kolejne wciśnięcia łączą serię. Prawy / K — ciężki; przytrzymaj, by naładować.',
  '4': 'Biały błysk zapowiada cios, który zablokujesz (Q). Wciśnij blok tuż przed trafieniem, by sparować — wróg zachwieje się, a riposta zada potrójne obrażenia.',
  '5': 'Czerwony błysk — tego nie zablokujesz. Shift / L — przewrót: w jego trakcie ciosy przez ciebie przenikają.',
  '6': 'F — Łza Wosku leczy, ale na chwilę unieruchamia. Trafienia i parowania ładują Rezonans; R uwalnia Głos Serca.',
};

export const STATION_LABEL: Record<string, string> = {
  h: 'Porozmawiaj z Halszką',
  a: 'Kowadło — ulepsz broń',
  S: 'Palenisko — odpocznij',
  m: 'Mumrot — handel',
  t: 'Stół z mapą — wyrusz',
};

let pid = 1;
let auid = 1;

export class World implements BossWorld {
  level!: Level;
  location: LocationId | 'krypta' = 'krypta';
  player!: Player;
  enemies: Enemy[] = [];
  boss: Boss | null = null;
  projectiles: Projectile[] = [];
  hazards: Hazard[] = [];
  interactables: Interactable[] = [];
  hitboxes: Hitbox[] = [];
  lights: Light[] = [];
  lostAsh: { x: number; y: number; amount: number } | null = null;
  fx = new Fx();
  rng = new Rng(1);
  time = 0;
  camX = 0;
  camY = 0;
  shakeT = 0;
  shakePow = 0;
  hitstopT = 0;
  slowT = 0;
  slowScale = 1;
  darkOverride: number | null = null;
  bossStarted = false;
  bossSpawn: Spawn | null = null;
  deadT = 0;
  windupMul = 1;
  arena = { left: 0, right: 0, floor: 0, top: 0 };
  /** nearest interactable the player can use right now */
  focus: Interactable | null = null;
  hint: string | null = null;
  tension = 0;
  run = { kills: 0, zuzel: 0, items: [] as string[], time: 0, deaths: 0 };
  listeners: ((e: WorldEvent) => void)[] = [];
  viewW = 960;
  viewH = 544;
  sfxHook: (name: SfxName, pan: number, vol: number) => void = () => undefined;

  constructor(
    public save: SaveData,
    public settings: Settings,
    public input: Input,
  ) {}

  emit(e: WorldEvent) {
    for (const l of this.listeners) l(e);
  }

  // ---------------------------------------------------------------- WorldApi
  addHitbox(h: Hitbox) {
    this.hitboxes.push(h);
  }
  newAttack(): AttackInstance {
    return { uid: auid++, hit: new Set(), dodged: false };
  }
  sfx(name: SfxName, x?: number, vol = 1) {
    const pan = x === undefined ? 0 : clamp((x - (this.camX + this.viewW / 2)) / (this.viewW / 2), -1, 1);
    const dist = x === undefined ? 0 : Math.abs(x - this.player?.cx || 0);
    const att = dist > 900 ? 0 : dist > 500 ? 0.5 : 1;
    if (att > 0) this.sfxHook(name, pan, vol * att);
  }
  shake(power: number, time = 0.25) {
    if (!this.settings.shake || this.settings.reduced) return;
    this.shakePow = Math.max(this.shakePow, power);
    this.shakeT = Math.max(this.shakeT, time);
  }
  hitstop(t: number) {
    this.hitstopT = Math.max(this.hitstopT, t);
  }
  slowmo(t: number, scale: number) {
    this.slowT = t;
    this.slowScale = scale;
  }
  spawnShock(x: number, footY: number, dir: 1 | -1, dmg: number, team: 'player' | 'enemy') {
    this.hazards.push({ kind: 'shock', dead: false, t: 0, x, y: footY, dir, speed: 430, life: 1.1, dmg, team, inst: this.newAttack() });
  }
  spawnProjectile(p: Omit<Projectile, 'id' | 'attack' | 'reflected' | 'dead'>) {
    this.projectiles.push({ ...p, id: pid++, attack: this.newAttack(), reflected: false, dead: false });
  }
  spawnHazard(h: Hazard) {
    this.hazards.push(h);
  }
  spawnMinion(x: number, y: number): Enemy {
    const e = new Enemy('cma', x, y + 20, false, { hp: 1, dmg: 1.3 }, `minion:${pid++}`);
    e.body.y = y - 8;
    e.aggro = true;
    e.minion = true;
    e.setState('spawn');
    this.enemies.push(e);
    this.fx.emit('soul', x, y, 14, { color: '#cfe8ff', speed: 90 });
    return e;
  }
  setDark(v: number | null) {
    this.darkOverride = v;
  }
  announce(text: string, sub?: string) {
    this.emit({ type: 'announce', text, sub });
  }

  // ---------------------------------------------------------------- loading
  loadHub() {
    this.location = 'krypta';
    this.level = buildHub();
    this.reset();
    const fire = this.level.spawns.find((s) => s.ch === 'S')!;
    this.player = new Player(fire.x - 60, fire.y, this.save);
    this.player.restoreAll();
    this.populate();
    this.snapCamera();
    this.emit({ type: 'music', mood: 'hub' });
  }

  loadExpedition() {
    const ex = this.save.expedition!;
    this.location = ex.location;
    this.level = buildLevel(ex.location, ex.seed, { tutorial: ex.location === 'rynek' && !this.save.tutorialDone });
    this.level.applyBroken(ex.walls);
    this.reset();
    const spawnShrine = this.level.spawns.find((s) => s.id === ex.shrine) ?? this.level.spawns.find((s) => s.ch === 'S')!;
    this.player = new Player(spawnShrine.x + 40, spawnShrine.y, this.save);
    this.player.restoreAll();
    this.populate();
    this.snapCamera();
    const lost = this.save.lost;
    if (lost && lost.location === ex.location && lost.seed === ex.seed) this.lostAsh = { x: lost.x, y: lost.y, amount: lost.amount };
    this.emit({ type: 'music', mood: 'explore' });
  }

  reset() {
    this.enemies = [];
    this.boss = null;
    this.projectiles = [];
    this.hazards = [];
    this.interactables = [];
    this.lostAsh = null;
    this.bossStarted = false;
    this.darkOverride = null;
    this.deadT = 0;
    this.fx.clear();
    this.rng = new Rng(this.level.seed ^ 0xabc);
    const floorY = 15 * T;
    if (this.level.arenaStart >= 0) {
      const room = this.level.rooms.find((r) => r.start === this.level.arenaStart)!;
      this.arena = { left: (room.start + 2) * T, right: (room.start + room.w - 1) * T, floor: floorY, top: (this.location === 'katedra' ? 2 : 0) * T };
    }
  }

  /** Create entities from spawn markers. Enemies are recreated on every rest. */
  populate() {
    const ex = this.save.expedition;
    const loc = this.location;
    const unfoundLore = loc === 'krypta' ? [] : LORE.filter((l) => l.location === loc && !this.save.lore.includes(l.id)).map((l) => l.id);
    let eventIdx = 0;
    for (const s of this.level.spawns) {
      const used = (list?: string[]) => !!list?.includes(s.id);
      switch (s.ch) {
        case 'S':
          this.interactables.push({ id: s.id, kind: loc === 'krypta' ? 'station' : 'shrine', x: s.x, y: s.y, used: used(ex?.shrines), data: loc === 'krypta' ? 'S' : '', anim: 0 });
          break;
        case 'C':
        case 'c':
          this.interactables.push({ id: s.id, kind: 'chest', x: s.x, y: s.y, used: used(ex?.chests), data: s.room === this.level.rooms.findIndex((r) => r.id === 'kapliczka') ? 'seed' : '', secret: s.ch === 'c', anim: 0 });
          break;
        case 'K':
        case 'k': {
          const lore = unfoundLore.shift();
          if (lore) this.interactables.push({ id: s.id, kind: 'lore', x: s.x, y: s.y, used: false, data: lore, secret: s.ch === 'k', anim: 0 });
          else this.interactables.push({ id: s.id, kind: 'chest', x: s.x, y: s.y, used: used(ex?.chests), data: '', secret: s.ch === 'k', anim: 0 });
          break;
        }
        case 'L':
          this.interactables.push({ id: s.id, kind: 'lantern', x: s.x, y: s.ty * T, used: false, data: '', anim: Math.random() * 6 });
          break;
        case 'P':
          if (loc === 'katedra')
            this.hazards.push({ kind: 'pendulum', dead: false, t: 0, ax: s.x, ay: s.ty * T, len: 230, amp: 1.05, speed: 1.6, phase: (s.tx % 7) * 0.9, angle: 0, inst: this.newAttack(), lastPass: 0 });
          else this.interactables.push({ id: s.id, kind: 'cage', x: s.x, y: s.ty * T, used: false, data: '', anim: Math.random() * 6 });
          break;
        case 'M':
          this.interactables.push({ id: s.id, kind: 'statue', x: s.x, y: s.y, used: false, data: '', anim: 0 });
          break;
        case 'V': {
          const kinds = ['duch', 'oltarz', 'mumrot'];
          const k = kinds[(hashString(`${this.level.seed}:${s.id}`) + eventIdx++) % kinds.length];
          this.interactables.push({ id: s.id, kind: 'event', x: s.x, y: s.y, used: used(ex?.events), data: k, anim: 0 });
          break;
        }
        case 'B':
          this.bossSpawn = s;
          break;
        case 'h':
        case 'a':
        case 'm':
        case 't':
          this.interactables.push({ id: s.id, kind: 'station', x: s.x, y: s.y, used: false, data: s.ch, anim: 0 });
          break;
        default:
          if ('123456'.includes(s.ch)) this.interactables.push({ id: s.id, kind: 'hint', x: s.x, y: s.y, used: false, data: s.ch, anim: 0 });
      }
    }
    this.spawnEnemies();
    // a defeated boss leaves an open way home
    if (loc !== 'krypta' && this.save.bosses[LOCATIONS[loc].boss] && this.bossSpawn) {
      this.interactables.push({ id: 'portal', kind: 'portal', x: this.bossSpawn.x, y: 15 * T, used: false, data: '', anim: 0 });
    }
  }

  spawnEnemies() {
    if (this.location === 'krypta') return;
    const scale = LOCATIONS[this.location].scale;
    this.enemies = [];
    for (const s of this.level.spawns) {
      if (!s.enemy) continue;
      const e = new Enemy(s.enemy, s.x, s.y, !!s.elite, scale, s.id);
      if (this.player) e.face = this.player.cx < e.cx ? -1 : 1;
      this.enemies.push(e);
    }
  }

  snapCamera() {
    this.camX = clamp(this.player.cx - this.viewW / 2, 0, Math.max(0, this.level.w * T - this.viewW));
    this.camY = this.cameraY();
  }

  /** Vertical framing: keep the player slightly below the centre. */
  cameraY() {
    const maxY = Math.max(0, this.level.h * T - this.viewH);
    return clamp(this.player.cy - this.viewH * 0.56, 0, maxY);
  }

  // ---------------------------------------------------------------- step
  step(dt: number) {
    this.fx.update(dt);
    if (this.hitstopT > 0) {
      this.hitstopT -= dt;
      return;
    }
    let sdt = dt;
    if (this.slowT > 0) {
      this.slowT -= dt;
      sdt = dt * this.slowScale;
    }
    this.time += sdt;
    this.run.time += sdt;
    this.windupMul = this.player.stats.enemyWindupMul;
    this.hitboxes = [];
    const p = this.player;

    this.input.tick(sdt);
    p.update(sdt, this.input, this);

    // pits & spikes
    if (p.state !== 'dead') {
      if (p.body.y > this.level.h * T + 60) {
        this.hurtPlayerRaw(28, 'Upadek');
        if (!p.dead) {
          p.body.x = p.lastSafe.x - p.body.w / 2;
          p.body.y = p.lastSafe.y - p.body.h - 4;
          p.body.vx = 0;
          p.body.vy = 0;
          p.invuln = 1;
        }
      } else if (touchesSpikes(this.level, p.body) && p.invuln <= 0 && !p.iframes) {
        this.hurtPlayerRaw(18, 'Kolce');
        p.body.vy = -520;
      }
    }

    // enemies
    for (const e of this.enemies) {
      if (e.kind === 'cma') this.updateMoth(e, sdt);
      else e.update(sdt, this);
    }
    // boss
    if (this.boss) {
      this.boss.update(sdt, this);
      if (this.boss.defeated && this.boss.dead && !this.boss.rewarded) this.finishBoss();
    }
    this.checkBossTrigger();

    // hazards & projectiles
    for (const h of this.hazards) updateHazard(h, sdt, this, { x: p.cx, y: p.cy });
    this.hazards = this.hazards.filter((h) => !h.dead);
    this.updateProjectiles(sdt);
    this.resolveHits();
    this.ringHits();

    // remove dead enemies after their death animation
    this.enemies = this.enemies.filter((e) => !(e.dead && e.deathT > 1.2));

    // lost ash
    if (this.lostAsh && Math.abs(p.cx - this.lostAsh.x) < 26 && Math.abs(p.feet - this.lostAsh.y) < 50) {
      this.save.zuzel += this.lostAsh.amount;
      this.fx.emit('soul', this.lostAsh.x, this.lostAsh.y - 20, 30, { color: '#ffd38a', speed: 160 });
      this.emit({ type: 'loot', text: `Odzyskany popiół: +${this.lostAsh.amount}`, sub: 'żużel' });
      this.sfx('pickup', this.lostAsh.x);
      this.lostAsh = null;
      this.save.lost = null;
      this.emit({ type: 'save' });
    }

    this.updateInteract();
    this.updateTension(sdt);
    this.updateCamera(dt);
    this.collectLights();

    // death
    if (p.state === 'dead') {
      this.deadT += dt;
      if (this.deadT > 2.2 && this.deadT - dt <= 2.2) this.emit({ type: 'died' });
    }
  }

  updateMoth(e: Enemy, dt: number) {
    e.anim += dt;
    e.stateT += dt;
    e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
    if (e.dead) {
      e.deathT += dt;
      return;
    }
    const p = this.player;
    if (e.state === 'spawn' && e.stateT < 0.6) return;
    const dx = p.cx - e.cx;
    const dy = p.cy - 8 - e.cy;
    const d = Math.hypot(dx, dy) || 1;
    e.body.vx += (dx / d) * 260 * dt;
    e.body.vy += (dy / d) * 260 * dt + Math.sin(e.anim * 9) * 40 * dt;
    const sp = Math.hypot(e.body.vx, e.body.vy);
    if (sp > 130) {
      e.body.vx *= 130 / sp;
      e.body.vy *= 130 / sp;
    }
    e.body.x += e.body.vx * dt;
    e.body.y += e.body.vy * dt;
    e.face = e.body.vx >= 0 ? 1 : -1;
    if (!e.inst) e.inst = this.newAttack();
    this.addHitbox({ team: 'enemy', rect: { x: e.body.x, y: e.body.y, w: e.body.w, h: e.body.h }, dmg: 10, poise: 5, knock: 140, parryable: true, unblockable: false, attack: e.inst, source: e, fromX: e.cx, tag: 'contact' });
  }

  updateProjectiles(dt: number) {
    const p = this.player;
    for (const pr of this.projectiles) {
      pr.life -= dt;
      if (pr.homing > 0 && pr.team === 'enemy') {
        const a = Math.atan2(p.cy - 6 - pr.y, p.cx - pr.x);
        const cur = Math.atan2(pr.vy, pr.vx);
        let diff = a - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const sp = Math.hypot(pr.vx, pr.vy);
        const na = cur + clamp(diff, -pr.homing * dt, pr.homing * dt);
        pr.vx = Math.cos(na) * sp;
        pr.vy = Math.sin(na) * sp;
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (this.level.solidAt(Math.floor(pr.x / T), Math.floor(pr.y / T)) || pr.life <= 0) {
        pr.dead = true;
        this.fx.emit('dust', pr.x, pr.y, 8, { color: pr.kind === 'moth' ? '#cfe8ff' : '#b9a68a', speed: 80 });
        continue;
      }
      if (Math.random() < 0.5) this.fx.emit(pr.kind === 'moth' ? 'soul' : 'ember', pr.x, pr.y, 1, { color: pr.kind === 'moth' ? '#cfe8ff' : pr.reflected ? '#ffd38a' : '#c9b18c', speed: 20, life: 0.5, size: 1.6 });
      this.addHitbox({
        team: pr.team,
        rect: { x: pr.x - pr.r, y: pr.y - pr.r, w: pr.r * 2, h: pr.r * 2 },
        dmg: pr.dmg,
        poise: pr.reflected ? 30 : 8,
        knock: 140,
        parryable: pr.parryable,
        unblockable: false,
        attack: pr.attack,
        source: null,
        fromX: pr.x - Math.sign(pr.vx) * 20,
        tag: 'projectile',
        projectile: pr,
      });
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);
  }

  // ---------------------------------------------------------------- combat
  resolveHits() {
    const p = this.player;
    for (const h of this.hitboxes) {
      if (h.projectile?.dead) continue;
      if (h.team === 'enemy') {
        if (p.state === 'dead' || h.attack.hit.has(p.id)) continue;
        if (overlap(h.rect, p.body)) this.hurtPlayer(h);
      } else {
        for (const e of this.enemies) {
          if (e.dead || h.attack.hit.has(e.id) || !overlap(h.rect, e.body)) continue;
          this.hurtEnemy(e, h);
          if (h.projectile) break;
        }
        const boss = this.boss;
        if (boss && !boss.dead && !h.attack.hit.has(boss.id) && overlap(h.rect, boss.body)) this.hurtBoss(boss, h);
        // projectiles are cancelled by the skill shockwave
        if (h.tag === 'skill') for (const pr of this.projectiles) if (pr.team === 'enemy' && overlap(h.rect, { x: pr.x - pr.r, y: pr.y - pr.r, w: pr.r * 2, h: pr.r * 2 })) pr.dead = true;
        if (h.breaksWalls) this.breakWalls(h.rect);
      }
    }
  }

  ringHits() {
    const p = this.player;
    for (const h of this.hazards) {
      if (h.kind !== 'ring' || h.inst.hit.has(p.id) || p.state === 'dead') continue;
      const d = Math.hypot(p.cx - h.x, p.cy - h.y);
      if (Math.abs(d - h.r) < h.band / 2 + 10) {
        this.hurtPlayer({ team: 'enemy', rect: p.body, dmg: h.dmg, poise: 30, knock: 260, parryable: false, unblockable: true, attack: h.inst, source: null, fromX: h.x, tag: 'hazard' });
      }
    }
  }

  breakWalls(r: Rect) {
    const lv = this.level;
    for (let ty = Math.floor(r.y / T); ty <= Math.floor((r.y + r.h) / T); ty++)
      for (let tx = Math.floor(r.x / T); tx <= Math.floor((r.x + r.w) / T); tx++) {
        const id = lv.breakAt(tx, ty);
        if (id) {
          this.save.expedition?.walls.push(id);
          this.fx.emit('dust', tx * T + 16, ty * T + 16, 40, { color: '#8e8678', speed: 220, g: 600, life: 1, size: 3 });
          this.sfx('wallBreak', tx * T);
          this.shake(6, 0.3);
          this.announce('Ukryte przejście');
          this.emit({ type: 'save' });
        }
      }
  }

  /** The heart of combat: dodge > parry > block > hit. */
  hurtPlayer(h: Hitbox) {
    const p = this.player;
    h.attack.hit.add(p.id);
    // i-frames of a roll: a "perfect dodge" when it passes through a real attack
    if (p.iframes) {
      if (!h.attack.dodged && h.tag !== 'hazard') {
        h.attack.dodged = true;
        p.perfectT = 0.4;
        p.dodgeBuffT = p.stats.dodgeBuff ? 1.5 : 0;
        p.addResonance(0.5);
        this.save.stats.perfectDodges++;
        this.slowmo(0.22, 0.35);
        this.sfx('perfectDodge', p.cx);
        this.fx.emit('ash', p.cx, p.cy, 14, { color: '#cfc6ff', speed: 90, life: 0.6 });
      }
      return;
    }
    if (p.invuln > 0) return;
    const facing = sign(h.fromX - p.cx) === p.face || Math.abs(h.fromX - p.cx) < 6;
    if (p.blocking && facing && !h.unblockable) {
      if (h.parryable && p.parryWindow(this)) {
        this.parry(h);
        return;
      }
      // regular block: chip damage and stamina
      const leak = Math.min(0.9, p.weapon.blockLeak * p.stats.blockLeakMul);
      p.stamina -= h.dmg * 1.15;
      p.staminaDelay = 0.6;
      p.body.vx = -p.face * 150;
      this.sfx('block', p.cx);
      this.fx.emit('spark', p.cx + p.face * 12, p.cy - 6, 8, { color: '#ffe1a8', speed: 160, dir: p.face > 0 ? 0 : Math.PI, spread: 1.6 });
      if (p.stamina <= 0) {
        p.stamina = 0;
        p.setState('guardBroken');
        this.sfx('guardBreak', p.cx);
        this.applyPlayerDamage(h.dmg * 0.8, h);
      } else this.applyPlayerDamage(h.dmg * leak, h, true);
      return;
    }
    // a parryable projectile can also be parried by a fresh block even if not "facing"
    this.applyPlayerDamage(h.dmg, h);
  }

  parry(h: Hitbox) {
    const p = this.player;
    p.setState('parry');
    p.riposteT = P.riposte;
    p.addResonance(1);
    this.save.stats.parries++;
    this.sfx('parry', p.cx);
    this.hitstop(0.11);
    this.shake(5, 0.15);
    this.fx.emit('spark', p.cx + p.face * 14, p.cy - 8, 22, { color: '#fff2c4', speed: 260, size: 2.4 });
    this.fx.emit('ring', p.cx + p.face * 14, p.cy - 8, 1, { color: '#fff2c4', speed: 0, life: 0.3, size: 26 });
    this.fx.screenFlash('255,240,200', 0.12);
    if (h.projectile) {
      const pr = h.projectile;
      pr.team = 'player';
      pr.reflected = true;
      pr.vx = -pr.vx * 1.4;
      pr.vy = -pr.vy * 1.2;
      pr.homing = 0;
      pr.dmg *= 2.5;
      pr.attack = this.newAttack();
      pr.life = 3;
      return;
    }
    const src = h.source;
    if (src instanceof Enemy) src.onParried();
    else if (src && 'bossId' in src) (src as Boss).onParried(this);
  }

  applyPlayerDamage(dmg: number, h: Hitbox, blocked = false) {
    const p = this.player;
    if (dmg <= 0) return;
    p.hp -= dmg;
    p.hurtFlash = 1;
    this.fx.screenFlash(blocked ? '255,220,180' : '170,20,20', blocked ? 0.06 : 0.22);
    if (!blocked) {
      this.sfx('hitPlayer', p.cx);
      this.hitstop(0.07);
      this.shake(6 + Math.min(10, dmg / 4), 0.25);
      this.fx.emit('ichor', p.cx, p.cy - 6, 14, { color: '#7a1414', speed: 180, g: 700, add: false });
      if (this.settings.numbers) this.fx.text(p.cx, p.body.y - 10, `-${Math.round(dmg)}`, '#ff8f80');
      const healing = p.state === 'heal' && p.stats.flaskUninterruptible;
      if (!p.hyperArmor && !healing) {
        p.swing = null;
        p.setState('hurt');
        p.body.vx = sign(p.cx - h.fromX) * h.knock * 0.7;
        p.body.vy = -170;
      }
      p.invuln = 0.4;
    }
    if (p.hp <= 0) {
      p.hp = 0;
      p.setState('dead');
      p.dead = true;
      this.save.stats.deaths++;
      this.run.deaths++;
      this.sfx('death', p.cx);
      this.slowmo(0.8, 0.4);
      this.fx.emit('ash', p.cx, p.cy, 40, { color: '#9c948a', speed: 120, life: 1.4 });
      this.emit({ type: 'music', mood: 'silence' });
    }
  }

  hurtPlayerRaw(dmg: number, _why: string) {
    const p = this.player;
    this.applyPlayerDamage(dmg, { team: 'enemy', rect: p.body, dmg, poise: 0, knock: 200, parryable: false, unblockable: true, attack: this.newAttack(), source: null, fromX: p.cx - p.face * 10, tag: 'hazard' });
  }

  playerDamageMul(h: Hitbox, target: { vulnerable: boolean }) {
    const p = this.player;
    let mul = 1;
    let riposte = false;
    if (target.vulnerable && (h.tag === 'light' || h.tag === 'heavy') && p.riposteT > 0) {
      mul *= 3;
      riposte = true;
      p.riposteT = 0;
    } else if (target.vulnerable) mul *= 1.25;
    if (p.dodgeBuffT > 0 && (h.tag === 'light' || h.tag === 'heavy')) p.dodgeBuffT = 0;
    return { mul, riposte };
  }

  hurtEnemy(e: Enemy, h: Hitbox) {
    h.attack.hit.add(e.id);
    const p = this.player;
    const { mul, riposte } = this.playerDamageMul(h, e);
    const dmg = h.dmg * mul;
    const heavy = h.tag !== 'light' || riposte;
    const res = e.takeHit(dmg, h.poise * (riposte ? 2 : 1), h.knock, h.fromX, heavy);
    if (h.projectile) h.projectile.dead = true;
    const mat = e.def.material;
    if (res === 'blocked') {
      this.sfx('hitArmor', e.cx);
      this.fx.emit('spark', e.cx - e.face * -12, e.cy - 10, 12, { color: '#ffe1a8', speed: 200 });
      if (h.tag === 'light' && h.source === p) {
        p.swing = null;
        p.setState('bounced');
        p.body.vx = -p.face * 160;
        p.stamina -= 10;
      }
      return;
    }
    this.sfx(mat === 'armor' ? 'hitArmor' : mat === 'spirit' ? 'hitSpirit' : 'hitFlesh', e.cx);
    this.hitstop(riposte ? 0.16 : h.tag === 'heavy' ? 0.08 : 0.045);
    this.shake(riposte ? 8 : h.tag === 'heavy' ? 5 : 2, 0.15);
    this.fx.emit(mat === 'spirit' ? 'soul' : 'ichor', e.cx, e.cy - 6, riposte ? 20 : 9, { color: mat === 'spirit' ? '#cfe8ff' : mat === 'armor' ? '#ffd38a' : '#3a1010', speed: 170, g: mat === 'spirit' ? 0 : 700, add: mat !== 'flesh' });
    if (mat === 'armor') this.fx.emit('spark', e.cx, e.cy - 10, 8, { color: '#ffe1a8', speed: 220 });
    if (this.settings.numbers) this.fx.text(e.cx, e.body.y - 6, `${Math.round(dmg)}`, riposte ? '#ffd27a' : '#e9e2d2', riposte);
    if (riposte) this.announceSmall('Riposta');
    p.addResonance(dmg / 70);
    if (res === 'kill') this.onEnemyKilled(e);
  }

  announceSmall(text: string) {
    this.fx.text(this.player.cx, this.player.body.y - 34, text, '#ffd27a', true);
  }

  onEnemyKilled(e: Enemy) {
    const p = this.player;
    this.sfx('enemyDeath', e.cx);
    this.fx.emit('ash', e.cx, e.cy, 30, { color: '#8a8076', speed: 120, life: 1.2, g: -30 });
    this.fx.emit('ember', e.cx, e.cy, 10, { color: '#ffb766', speed: 80, life: 0.8 });
    if (!e.minion && this.location !== 'krypta') {
      const amount = Math.round(e.def.zuzel * LOCATIONS[this.location].scale.zuzel * (e.elite ? 2 : 1));
      this.save.zuzel += amount;
      this.run.zuzel += amount;
      if (this.settings.numbers) this.fx.text(e.cx, e.body.y - 22, `+${amount}`, '#d9b26a');
    }
    this.save.stats.kills++;
    this.run.kills++;
    if (p.stats.killHeal) p.heal(p.stats.killHeal);
  }

  hurtBoss(b: Boss, h: Hitbox) {
    h.attack.hit.add(b.id);
    if (h.projectile) h.projectile.dead = true;
    const { mul, riposte } = this.playerDamageMul(h, b);
    const dmg = h.dmg * mul * (riposte ? 0.6 : 1); // bosses resist full ripostes
    const res = b.takeHit(dmg, h.poise * (riposte ? 1.5 : 1), h.knock, h.fromX, h.tag !== 'light');
    if (res === 'blocked') {
      this.fx.emit('spark', b.cx, b.cy, 6, { color: '#999', speed: 120 });
      return;
    }
    const metal = b.bossId === 'dzwon';
    this.sfx(metal ? 'hitArmor' : b.bossId === 'pasterz' ? 'hitSpirit' : 'hitFlesh', b.cx);
    this.hitstop(riposte ? 0.14 : h.tag === 'heavy' ? 0.08 : 0.04);
    this.shake(riposte ? 7 : h.tag === 'heavy' ? 4 : 2, 0.12);
    this.fx.emit(metal ? 'spark' : 'ichor', h.rect.x + h.rect.w / 2, b.cy - 10, 10, { color: metal ? '#ffd38a' : '#2a0c0c', speed: 200, g: metal ? 300 : 700, add: metal });
    if (this.settings.numbers) this.fx.text(b.cx + (Math.random() - 0.5) * 30, b.body.y - 8, `${Math.round(dmg)}`, riposte ? '#ffd27a' : '#e9e2d2', riposte);
    if (res === 'stagger') this.announce(`${b.name} traci równowagę`);
    this.player.addResonance(dmg / 70);
    if (res === 'kill') {
      this.sfx('bossRoar', b.cx, 0.8);
      this.slowmo(1.4, 0.3);
      this.shake(14, 1);
      this.emit({ type: 'music', mood: 'silence' });
      for (const e of this.enemies) if (e.minion && !e.dead) e.takeHit(999, 99, 0, e.cx, true);
      this.hazards = this.hazards.filter((x) => x.kind === 'pendulum');
      this.projectiles = [];
    }
  }

  // ---------------------------------------------------------------- boss flow
  checkBossTrigger() {
    if (this.bossStarted || !this.bossSpawn || this.location === 'krypta') return;
    const bossId = LOCATIONS[this.location].boss;
    if (this.save.bosses[bossId]) return;
    if (this.player.cx > (this.level.gateCol + 4) * T) {
      this.bossStarted = true;
      this.level.setGate(true);
      const s = this.bossSpawn;
        this.boss = createBoss(bossId, s.x, 15 * T, 1);
      this.boss.face = -1;
      this.emit({ type: 'bossIntro', name: this.boss.name, title: this.boss.title });
      this.emit({ type: 'music', mood: 'boss' });
      this.sfx('bossIntro');
    }
  }

  finishBoss() {
    const b = this.boss!;
    b.rewarded = true;
    const id = b.bossId;
    this.save.bosses[id] = true;
    this.save.zuzel += BOSSES[id].zuzel;
    this.run.zuzel += BOSSES[id].zuzel;
    if (id === 'kat') {
      this.save.weapons.sierpy ??= 0;
      this.save.shards += 3;
      if (!this.save.relics.includes('zalobny_welon')) this.save.relics.push('zalobny_welon');
    } else if (id === 'pasterz') {
      this.save.weapons.mlot ??= 0;
      this.save.shards += 3;
      this.save.relicSlots = 3;
    }
    this.fx.emit('soul', b.cx, b.cy, 80, { color: '#ffd38a', speed: 200, life: 2 });
    this.level.setGate(false);
    this.interactables.push({ id: 'portal', kind: 'portal', x: b.cx, y: 15 * T, used: false, data: '', anim: 0 });
    this.emit({ type: 'bossDefeated', boss: b });
    this.emit({ type: 'music', mood: 'victory' });
    this.emit({ type: 'save' });
  }

  // ---------------------------------------------------------------- interaction
  updateInteract() {
    const p = this.player;
    this.focus = null;
    this.hint = null;
    let best = 60;
    for (const it of this.interactables) {
      it.anim += 1 / 60;
      const d = Math.abs(it.x - p.cx);
      if (Math.abs(it.y - p.feet) > 70) continue;
      if (it.kind === 'hint' && d < 90) this.hint = HINTS[it.data] ?? null;
      if (it.kind === 'lantern' || it.kind === 'cage' || it.kind === 'statue' || it.kind === 'hint') continue;
      if ((it.kind === 'chest' || it.kind === 'event' || it.kind === 'lore') && it.used) continue;
      if (d < best) {
        best = d;
        this.focus = it;
      }
    }
    if (this.focus && p.state !== 'dead' && (this.input.buffered('interact') || this.input.buffered('up'))) {
      this.input.consume('interact');
      this.input.consume('up');
      this.emit({ type: 'interact', it: this.focus });
    }
  }

  updateTension(dt: number) {
    const p = this.player;
    if (this.location === 'krypta' || this.bossStarted) return;
    const near = this.enemies.some((e) => !e.dead && e.aggro && Math.abs(e.cx - p.cx) < 520);
    const prev = this.tension;
    this.tension = Math.max(0, Math.min(1, this.tension + (near ? dt * 1.5 : -dt * 0.35)));
    if (prev < 0.5 && this.tension >= 0.5) this.emit({ type: 'music', mood: 'tension' });
    if (prev >= 0.2 && this.tension < 0.2) this.emit({ type: 'music', mood: 'explore' });
  }

  updateCamera(dt: number) {
    const p = this.player;
    const look = p.face * 70;
    let target = p.cx + look - this.viewW / 2;
    const b = this.boss;
    if (b && this.bossStarted && !b.dead) {
      if (b.state === 'intro') target = b.cx - this.viewW / 2;
      else {
        // frame both fighters, but never lose the player
        const mid = p.cx * 0.6 + b.cx * 0.4 - this.viewW / 2;
        target = clamp(mid, p.cx - this.viewW + 90, p.cx - 90);
      }
    }
    const maxX = Math.max(0, this.level.w * T - this.viewW);
    // keep the boss arena framed once the fight is on
    if (this.bossStarted && this.boss && !this.boss.dead) target = clamp(target, this.arena.left - 2 * T, this.arena.right + T - this.viewW);
    target = clamp(target, 0, maxX);
    this.camX += (target - this.camX) * Math.min(1, dt * 5);
    this.camY += (this.cameraY() - this.camY) * Math.min(1, dt * 4);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT <= 0) this.shakePow = 0;
  }

  collectLights() {
    const L: Light[] = [];
    const pal = this.location === 'krypta' ? { light: '#ff9a4a' } : LOCATIONS[this.location].palette;
    const p = this.player;
    L.push({ x: p.cx, y: p.cy - 4, r: 150 + p.resonance * 14, color: '#ffd9a0', a: 0.5 });
    for (const it of this.interactables) {
      if (it.kind === 'lantern') L.push({ x: it.x, y: it.y + 12, r: 210, color: pal.light, a: 0.9 + Math.sin(this.time * 7 + it.anim) * 0.06 });
      else if (it.kind === 'cage') L.push({ x: it.x, y: it.y + 40, r: 150, color: pal.light, a: 0.7 });
      else if (it.kind === 'shrine') L.push({ x: it.x, y: it.y - 30, r: it.used ? 260 : 160, color: '#ffcf7a', a: it.used ? 1 : 0.6 });
      else if (it.kind === 'station') L.push({ x: it.x, y: it.y - 30, r: it.data === 'S' ? 320 : 170, color: it.data === 'h' ? '#bcd7ff' : '#ff9a4a', a: 0.9 });
      else if (it.kind === 'portal') L.push({ x: it.x, y: it.y - 60, r: 260, color: '#cfc6ff', a: 1 });
      else if ((it.kind === 'chest' || it.kind === 'lore') && !it.used) L.push({ x: it.x, y: it.y - 14, r: 90, color: '#ffcf7a', a: 0.45 });
      else if (it.kind === 'event' && !it.used) L.push({ x: it.x, y: it.y - 30, r: 140, color: '#a8c6ff', a: 0.6 });
    }
    for (const pr of this.projectiles) L.push({ x: pr.x, y: pr.y, r: 70, color: pr.kind === 'moth' ? '#cfe8ff' : '#ffcf9a', a: 0.6 });
    for (const h of this.hazards) {
      if (h.kind === 'fire') L.push({ x: h.x, y: h.y - 14, r: 110, color: '#ff8a3a', a: 0.8 });
      if (h.kind === 'molten') L.push({ x: h.x, y: h.floor - 40, r: h.t > h.warn ? 200 : 90, color: '#ff7a2a', a: 0.9 });
    }
    if (this.lostAsh) L.push({ x: this.lostAsh.x, y: this.lostAsh.y - 20, r: 120, color: '#ffd38a', a: 0.9 });
    const b = this.boss;
    if (b && !b.dead) L.push({ x: b.cx, y: b.cy, r: 200, color: b.bossId === 'pasterz' ? '#cfe8ff' : b.bossId === 'kat' && b.phase === 2 ? '#ff7a2a' : '#ffcf7a', a: 0.55 });
    for (const e of this.enemies) if (e.buffT > 0 && !e.dead) L.push({ x: e.cx, y: e.cy, r: 80, color: '#b0a0ff', a: 0.5 });
    this.lights = L;
  }

  // ---------------------------------------------------------------- persistence helpers
  markUsed(it: Interactable, list: 'chests' | 'shrines' | 'events') {
    it.used = true;
    const ex = this.save.expedition;
    if (ex && !ex[list].includes(it.id)) ex[list].push(it.id);
  }

  /** Rest: refill, respawn enemies, remember shrine. */
  rest(it: Interactable) {
    const ex = this.save.expedition;
    if (ex) {
      ex.shrine = it.id;
      if (!ex.shrines.includes(it.id)) ex.shrines.push(it.id);
      // the tutorial ends once the first real shrine is reached
      if (ex.location === 'rynek' && this.level.rooms[Number(it.id.split(':')[0])]?.id === 'kapliczka') this.save.tutorialDone = true;
    }
    it.used = true;
    this.player.restoreAll();
    this.player.resonance = Math.min(this.player.resonance, this.player.stats.pips);
    this.enemies = [];
    this.spawnEnemies();
    this.projectiles = [];
    this.hazards = this.hazards.filter((h) => h.kind === 'pendulum');
    this.fx.emit('ember', it.x, it.y - 30, 30, { color: '#ffcf7a', speed: 80, life: 1.4, g: -60 });
    this.sfx('shrine', it.x);
    this.emit({ type: 'save' });
  }

  /** After death: drop ash, reset the expedition to the last shrine. */
  respawn() {
    const ex = this.save.expedition;
    const p = this.player;
    if (ex && this.save.zuzel > 0) {
      this.save.lost = { location: ex.location, seed: ex.seed, x: p.lastSafe.x, y: p.lastSafe.y, amount: this.save.zuzel };
      this.save.zuzel = 0;
    } else if (ex) this.save.lost = null;
    this.save.expedition = ex;
    this.emit({ type: 'save' });
    this.loadExpedition();
  }

  /** Grant loot from a chest (seeded per expedition + chest id). */
  openChest(it: Interactable): string {
    this.markUsed(it, 'chests');
    const ex = this.save.expedition!;
    const loc = ex.location;
    const rng = new Rng(hashString(`${ex.seed}:${it.id}`));
    const scale = LOCATIONS[loc].scale.zuzel;
    let text = '';
    const chestRelics: RelicId[] = ['woskowe_serce', 'zalobny_welon', 'kosc_dzwonka', 'zelazny_rozaniec'];
    const freeRelic = chestRelics.find((r) => !this.save.relics.includes(r) && rng.next() < 0.9);
    if (it.data === 'seed' && !this.save.flaskSeeds.includes(loc)) {
      this.save.flaskSeeds.push(loc);
      this.player.refreshStats();
      this.player.flasks++;
      text = 'Woskowe Ziarno — +1 Łza Wosku';
    } else if (it.secret && freeRelic) {
      this.save.relics.push(freeRelic);
      text = `Relikt: ${RELICS[freeRelic].name}`;
    } else if (it.secret || rng.next() < 0.3) {
      const n = it.secret ? 2 : 1;
      this.save.shards += n;
      text = `Odłamek spiżu ×${n}`;
    } else if (freeRelic && rng.next() < 0.18) {
      this.save.relics.push(freeRelic);
      text = `Relikt: ${RELICS[freeRelic].name}`;
    } else {
      const amount = Math.round(rng.int(50, 110) * scale);
      this.save.zuzel += amount;
      this.run.zuzel += amount;
      text = `Żużel +${amount}`;
    }
    this.run.items.push(text);
    this.sfx('chest', it.x);
    this.fx.emit('ember', it.x, it.y - 16, 26, { color: '#ffcf7a', speed: 140, life: 1 });
    this.emit({ type: 'save' });
    return text;
  }

  isFinalBoss() {
    return this.boss instanceof Dzwon;
  }
}
