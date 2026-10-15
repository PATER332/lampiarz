// The game simulation: pure logic without WebGL or DOM. The renderer, audio and
// UI read its state and listen to its events.
import { clamp, dist2d, forward, Rng, wrapAngle } from '../engine/math';
import { DOOR, FLOOR as FLOOR_CELL, Level, pushOut, propBox, WET as WET_CELL, type Box } from '../world/level';
import { buildLights } from '../world/lights';
import {
  ALCOVES,
  CELL,
  DESCENT_START,
  DOORS,
  ITEM_NAMES,
  PICKUPS,
  PROP_BY_ID,
  PROPS,
  SYM_GLYPH,
  SYM_NAME,
  SYMBOLS,
  VENTS,
  ZONE_NAMES,
  type DoorDef,
  type ItemId,
  type LightDef,
  type PickupDef,
  type PropDef,
  type Sym,
  type ZoneId,
} from '../world/map';
import { Monster, type HideSpot, type MonsterHost, type PlayerView } from './monsters';
import { codeOf, makePuzzle, type Puzzle } from './puzzle';
import type { GameState } from './state';
import { DIFF, DOC_BY_ID, ECHO_CALLS, LINES, type DiffParams, type EndingId, type Line } from './story';

export type SimEvent =
  | { type: 'say'; lines: Line[] }
  | { type: 'message'; text: string; tone?: 'info' | 'deny' | 'good' }
  | { type: 'pickup'; text: string }
  | { type: 'doc'; id: string }
  | { type: 'ui'; screen: 'keypad' | 'generator' | 'radio' | 'cctv' | 'roster' | 'terminal' | 'clock' | 'note'; ref?: string }
  | { type: 'sfx'; name: string; x?: number; y?: number; z?: number; vol?: number }
  | { type: 'echoCall'; text: string; x: number; z: number }
  | { type: 'shot'; hit: boolean; x: number; y: number; z: number; monster?: string; head?: boolean; blood?: 'red' | 'black' }
  | { type: 'hurt'; amount: number; by: string }
  | { type: 'death'; by: string }
  | { type: 'ending'; id: EndingId }
  | { type: 'checkpoint'; key: string }
  | { type: 'observe'; id: string }
  | { type: 'scare'; kind: string; strength: number }
  | { type: 'lift'; phase: 'start' | 'arrive' }
  | { type: 'power' };

export interface Controls {
  fwd: number;
  side: number;
  sprint: boolean;
  crouch: boolean;
  fire: boolean;
  aim: boolean;
}

export interface Interactable {
  id: string;
  box: Box & { y0: number; y1: number };
  label: () => string | null;
  act: () => void;
}

export interface Apparition {
  type: 'stalker' | 'echo';
  x: number;
  z: number;
  yaw: number;
  until: number;
}

export interface Decal {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  size: number;
  kind: 'hole' | 'blood' | 'splat';
  t: number;
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  kind: 'blood' | 'black' | 'spark' | 'dust';
}

const EYE = 1.62;
const EYE_CROUCH = 0.98;
const RADIUS = 0.3;
const MAX_HP = 100;
/** width of the wall on each side of a doorway (the opening is 2 − 2·JAMB m) */
export const JAMB = 0.45;

export class Sim implements MonsterHost {
  level = new Level();
  lights: LightDef[] = buildLights();
  puzzle: Puzzle;
  diff: DiffParams;
  time = 0;
  listeners: ((e: SimEvent) => void)[] = [];
  rng: Rng;
  monsters: Monster[] = [];
  player: PlayerView & { lockX: number; lockZ: number };
  vx = 0;
  vz = 0;
  eye = EYE;
  stamina = 1;
  exhausted = false;
  bob = 0;
  stepAcc = 0;
  moving = 0;
  flashlight = false;
  dead = false;
  ended: EndingId | null = null;
  focus: Interactable | null = null;
  interactables: Interactable[] = [];
  doorAnim: Record<string, number> = {};
  /** 0..1 how far the player is into a hiding pose */
  hideT = 0;
  hideFrom: [number, number] = [0, 0];
  zone: ZoneId | null = null;
  timers: { at: number; fn: () => void }[] = [];
  litCells = new Float32Array(0);
  lightOff = new Map<number, number>();
  blackout = 0;
  fear = 0;
  hurtFlash = 0;
  apparitions: Apparition[] = [];
  decals: Decal[] = [];
  particles: Particle[] = [];
  // weapon
  drawn = false;
  drawT = 0;
  aimT = 0;
  fireCd = 0;
  recoil = 0;
  reloadT = 0;
  flashT = 0;
  healT = 0;
  // lift ride and final sequence
  lift: { t: number } | null = null;
  collapse: { t: number; need: number } | null = null;
  calling: { t: number } | null = null;
  genCd = 0;
  cctv: { cam: number; viewT: number } | null = null;
  radioFreq = 3.0;
  radioListenT = 0;
  private lastChase = 0;
  private wasFire = false;

  constructor(public state: GameState) {
    this.rng = new Rng(state.seed ^ 0xbac4);
    this.puzzle = makePuzzle(state.seed);
    this.diff = DIFF[state.difficulty];
    this.player = { x: state.player.x, z: state.player.z, yaw: state.player.yaw, pitch: state.player.pitch, hide: null, crouch: false, sprinting: false, moving: 0, flashlight: false, lockX: 0, lockZ: 0 };
    for (const d of DOORS) this.doorAnim[d.id] = state.doors[d.id].open ? 1 : 0;
    this.drawn = false;
    this.buildMonsters();
    this.buildInteractables();
    this.computeLit();
    this.zone = this.level.zoneAt(this.player.x, this.player.z);
  }

  // ------------------------------------------------------------------ plumbing
  emit(e: SimEvent) {
    for (const l of this.listeners) l(e);
  }
  say(key: string): void;
  say(m: Monster, text: string): void;
  say(a: string | Monster, _text?: string) {
    if (typeof a === 'string') {
      const lines = LINES[a];
      if (lines) this.emit({ type: 'say', lines });
      return;
    }
    // the Echo calls out in a borrowed voice
    const text = this.rng.pick(ECHO_CALLS);
    this.emit({ type: 'echoCall', text, x: a.x, z: a.z });
    this.sfx('echoVoice', a.x, a.z, 1.6, 1);
  }
  msg(text: string, tone: 'info' | 'deny' | 'good' = 'info') {
    this.emit({ type: 'message', text, tone });
  }
  sfx(name: string, x?: number, z?: number, y = 1.2, vol = 1) {
    this.emit({ type: 'sfx', name, x, z, y, vol });
  }
  later(sec: number, fn: () => void) {
    this.timers.push({ at: this.time + sec, fn });
  }
  has(flag: string) {
    return this.state.flags.includes(flag);
  }
  setFlag(flag: string) {
    if (!this.has(flag)) this.state.flags.push(flag);
  }
  fired(id: string) {
    return this.state.events.includes(id);
  }
  fire(id: string) {
    if (this.fired(id)) return false;
    this.state.events.push(id);
    return true;
  }
  /** loud events wake everything that can hear them */
  noise(x: number, z: number, r: number) {
    for (const m of this.monsters) if (m.active && m.alive) m.hear(x, z, r);
  }
  checkpoint(key: string) {
    if (this.state.difficulty === 'nomercy' && !['armory', 'descent'].includes(key)) return;
    this.emit({ type: 'checkpoint', key });
  }

  // ------------------------------------------------------------------ monsters
  buildMonsters() {
    const st = this.state;
    const hp = this.diff.enemyHp;
    const r = (k: number) => new Rng(st.seed ^ (0x1000 * k));
    if (st.area === 'upper') {
      this.monsters = [
        new Monster('stalker', 'stalker', ['maze', 'dark', 'storage', 'red'], r(1), hp),
        new Monster('crawlerA', 'crawler', ['dark'], r(2), hp),
        new Monster('crawlerB', 'crawler', ['storage'], r(3), hp),
        new Monster('echo', 'echo', ['red', 'storage'], r(4), hp),
      ];
    } else {
      this.monsters = [
        new Monster('stalkerD', 'stalker', ['descent', 'anchor'], r(5), hp),
        new Monster('crawlerD1', 'crawler', ['descent'], r(6), hp),
        new Monster('crawlerD2', 'crawler', ['descent'], r(7), hp),
        new Monster('echoD', 'echo', ['descent'], r(8), hp),
      ];
      for (const m of this.monsters) m.dormantFor = m.rng.range(25, 60);
    }
    for (const m of this.monsters) {
      m.setOthers(this.monsters);
      if (st.killed.includes(m.id)) {
        m.state = 'dead';
        m.deathT = 999;
      }
    }
    this.activateByProgress();
  }

  /** Which monsters are in play depends on how far the player has come. */
  activateByProgress() {
    const st = this.state;
    const on = (id: string, cond: boolean) => {
      const m = this.monsters.find((x) => x.id === id);
      if (m && cond && !m.active && m.alive) m.active = true;
    };
    if (st.area === 'upper') {
      on('stalker', this.fired('firstContact'));
      on('crawlerA', this.fired('enterDark'));
      on('crawlerB', st.gen.on);
      on('echo', this.fired('enterRed'));
    } else {
      on('stalkerD', this.fired('descentStalker'));
      on('crawlerD1', true);
      on('crawlerD2', st.stabilizers.length >= 1);
      on('echoD', st.stabilizers.length >= 2);
    }
  }

  monster(id: string) {
    return this.monsters.find((m) => m.id === id);
  }

  // MonsterHost
  doorOpen(d: DoorDef) {
    return this.state.doors[d.id].open;
  }
  openDoor(d: DoorDef, by: Monster) {
    this.setDoor(d.id, true, by.type === 'stalker' ? 'doorForce' : 'doorOpenSlow');
  }
  closedDoorAt(cx: number, cz: number) {
    const d = this.level.doorAtCell(cx, cz);
    return !!d && (this.doorAnim[d.id] ?? 0) < 0.7;
  }
  get propBoxes() {
    return this.level.propBoxes.map((p) => p.box);
  }
  hurtPlayer(amount: number, m: Monster) {
    if (this.dead || this.ended) return;
    this.state.health = Math.max(0, this.state.health - amount);
    this.hurtFlash = 1;
    this.emit({ type: 'hurt', amount, by: m.type });
    this.sfx('playerHurt');
    const a = Math.atan2(this.player.x - m.x, this.player.z - m.z);
    // the blow knocks you back a step
    this.vx += Math.sin(a) * 3.5;
    this.vz += Math.cos(a) * 3.5;
    this.addDecal(this.player.x + this.rng.range(-0.4, 0.4), 0.01, this.player.z + this.rng.range(-0.4, 0.4), 0, 1, 0, 0.5 + amount / 80, 'blood');
    if (this.state.health <= 0) this.die(m.type);
    else if (this.state.health < 35 && this.fire('hurtLine')) this.later(1.2, () => this.say('hurt'));
  }
  ripHide(id: string, _m: Monster) {
    if (id.startsWith('locker') && !this.state.destroyed.includes(id)) this.state.destroyed.push(id);
    this.leaveHide(true);
  }
  onChase(m: Monster) {
    if (this.time - this.lastChase > 20) this.emit({ type: 'scare', kind: 'chase', strength: m.type === 'crawler' ? 0.5 : 0.7 });
    this.lastChase = this.time;
  }
  /** when each vent grate last banged open (sim time), for the renderer */
  ventBang: Record<string, number> = {};
  ventUsed(x: number, z: number) {
    let best: string | null = null;
    let bd = 2.5;
    for (const v of VENTS) {
      const d = dist2d(x, z, v.gx, v.gz);
      if (d < bd) {
        bd = d;
        best = v.id;
      }
    }
    if (best) this.ventBang[best] = this.time;
  }
  /** how far a vent grate stands open (0..1) */
  ventOpen(id: string) {
    const t0 = this.ventBang[id];
    if (t0 === undefined) return 0;
    const t = this.time - t0;
    if (t < 0) return 0;
    if (t < 0.15) return t / 0.15;
    if (t < 3.2) return 1;
    return Math.max(0, 1 - (t - 3.2) / 0.5);
  }
  onKilled(m: Monster) {
    if (!this.state.killed.includes(m.id)) this.state.killed.push(m.id);
    this.state.stats.kills++;
    if (m.type === 'crawler' && this.diff.journal !== 'none') this.msg('Pełzacz nie żyje.', 'good');
  }

  die(by: string) {
    if (this.dead) return;
    this.dead = true;
    this.state.deaths++;
    this.flashlight = false;
    this.drawn = false;
    this.sfx('death');
    this.emit({ type: 'death', by });
  }

  // ------------------------------------------------------------------ lights
  lightActive(l: LightDef, i: number) {
    if (l.dead) return false;
    if (l.gen && !this.state.gen.on) return false;
    if (l.id === 'armory' && !this.state.doors.armory.unlocked) return false;
    if (l.id === 'uv' && !this.state.uvOn) return false;
    if (l.id === 'exit_light' && !this.state.doors.exit.open) return false;
    const o = this.lightOff.get(i);
    if (o !== undefined && o > this.time) return false;
    if (this.blackout > 0 && l.kind !== 'red' && l.kind !== 'core') return false;
    if (this.collapse && l.kind !== 'red' && l.kind !== 'core' && Math.sin(this.time * 9 + i) > 0.3) return false;
    return true;
  }
  lit(x: number, z: number) {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    if (!this.level.inside(cx, cz)) return 0;
    return this.litCells[this.level.idx(cx, cz)] ?? 0;
  }
  computeLit() {
    const L = this.level;
    const out = new Float32Array(L.grid.length);
    this.lights.forEach((l, i) => {
      if (l.kind === 'uv' || !this.lightActive(l, i)) return;
      const strength = l.kind === 'red' ? 0.45 : l.kind === 'bulb' || l.kind === 'lamp' ? 0.7 : 1;
      const R = Math.ceil(l.range / CELL);
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          const cx = Math.floor(l.x / CELL) + dx;
          const cz = Math.floor(l.z / CELL) + dz;
          if (!L.inside(cx, cz) || L.isSolid(cx, cz)) continue;
          const [px, pz] = L.cellCenter(cx, cz);
          const v = strength * clamp(1 - dist2d(px, pz, l.x, l.z) / (l.range * 0.6), 0, 1);
          if (v > out[L.idx(cx, cz)] && L.lineClear(l.x, l.z, px, pz, (ax, az) => this.closedDoorAt(ax, az))) out[L.idx(cx, cz)] = v;
        }
    });
    this.litCells = out;
  }
  flickerNear(x: number, z: number, dur: number, radius = 9) {
    this.lights.forEach((l, i) => {
      if (dist2d(l.x, l.z, x, z) < radius && l.kind !== 'red' && l.kind !== 'core') this.lightOff.set(i, this.time + dur * (0.4 + Math.random() * 0.6));
    });
    this.computeLit();
    this.later(dur + 0.1, () => this.computeLit());
  }

  // ------------------------------------------------------------------ doors
  doorDef(id: string) {
    return DOORS.find((d) => d.id === id)!;
  }
  setDoor(id: string, open: boolean, sound?: string) {
    const s = this.state.doors[id];
    if (s.open === open) return;
    s.open = open;
    const d = this.doorDef(id);
    const [x, z] = this.level.cellCenter(d.cx, d.cz);
    this.sfx(sound ?? (d.kind === 'hidden' ? 'panelSlide' : d.metal ? (open ? 'metalOpen' : 'metalClose') : open ? 'doorOpen' : 'doorClose'), x, z);
    this.noise(x, z, d.metal ? 14 : 9);
    this.later(0.8, () => this.computeLit());
  }
  useDoor(d: DoorDef) {
    const s = this.state.doors[d.id];
    const [x, z] = this.level.cellCenter(d.cx, d.cz);
    const deny = (text: string) => {
      this.msg(text, 'deny');
      this.sfx('deny', x, z);
    };
    if (!s.unlocked) {
      switch (d.kind) {
        case 'keypad':
          this.emit({ type: 'ui', screen: 'keypad', ref: d.id });
          return;
        case 'power':
          if (!this.state.gen.on) return deny('Śluza bez zasilania. Agregat stoi.');
          s.unlocked = true;
          break;
        case 'card':
          if (!this.state.liftcard) return deny('Czytnik karty: brak dostępu. Karta windy — zbrojownia.');
          s.unlocked = true;
          this.sfx('card', x, z);
          break;
        case 'oneway': {
          const side = Math.sign((d.axis === 'x' ? this.player.x - x : this.player.z - z) || 1);
          if (side !== d.side) return deny('Zaklinowane. Coś blokuje je od drugiej strony.');
          s.unlocked = true;
          this.msg('Wybijasz klin. Masz skrót do Pokoju zegarów.', 'good');
          break;
        }
        case 'hidden':
          s.unlocked = true;
          if (this.fire('secretFound')) this.later(1.2, () => this.say('secretFound'));
          break;
        case 'stabilizers':
          return deny(`Komora Kotwicy zamknięta. Stabilizatory: ${this.state.stabilizers.length}/3.`);
        case 'exit':
          return deny('Drzwi bez klamki. Otwiera je tylko terminal Kotwicy.');
        default:
          s.unlocked = true;
      }
    }
    if (d.id === 'lift' && this.lift) return;
    this.setDoor(d.id, !s.open);
  }

  /** Keypad of the armory. Returns 'ok' | 'bad' | 'locked'. */
  enterCode(code: string): 'ok' | 'bad' | 'locked' {
    const st = this.state;
    const d = this.doorDef('armory');
    const [x, z] = this.level.cellCenter(d.cx, d.cz);
    if (st.lockUntil > st.playTime) return 'locked';
    if (code === codeOf(this.puzzle)) {
      st.doors.armory.unlocked = true;
      this.sfx('codeOk', x, z);
      this.later(0.6, () => this.sfx('bolts', x, z));
      this.later(1.6, () => {
        this.setDoor('armory', true, 'vaultOpen');
        this.computeLit();
      });
      if (this.fire('armoryOpen')) this.later(2.6, () => this.say('armoryOpen'));
      this.checkpoint('armory');
      return 'ok';
    }
    st.codeTries++;
    this.sfx('codeBad', x, z, 1.2, 1.4);
    this.noise(x, z, this.state.difficulty === 'story' ? 10 : 26);
    const D = this.diff;
    if (D.codeTries > 0 && st.codeTries >= D.codeTries) {
      st.codeTries = 0;
      st.lockUntil = st.playTime + D.lockSeconds;
      this.sfx('alarm', x, z, 2, 1);
      this.noise(x, z, 60);
      this.monster('stalker')?.summon(this, 4);
      this.msg(`Zamek zablokowany na ${D.lockSeconds} s. Alarm słychać w całym labiryncie.`, 'deny');
      return 'locked';
    }
    return 'bad';
  }

  // ------------------------------------------------------------------ puzzle devices
  genAction(a: 'pump' | 'choke' | 'start'): 'ok' | 'flood' | 'cooldown' | 'on' {
    const g = this.state.gen;
    if (g.on) return 'on';
    if (this.genCd > this.time) return 'cooldown';
    const expected = ['pump', 'choke', 'start'][g.step];
    const [x, z] = [104, 67.5];
    if (a !== expected) {
      g.step = 0;
      this.genCd = this.time + 5;
      this.sfx('genFlood', x, z, 1, 1.4);
      this.noise(x, z, 45);
      if (this.fire('genFloodLine')) this.later(0.8, () => this.say('genFlooded'));
      return 'flood';
    }
    g.step++;
    this.sfx(a === 'pump' ? 'genPump' : a === 'choke' ? 'genChoke' : 'genStart', x, z);
    if (g.step >= 3) {
      g.on = true;
      this.noise(x, z, 50);
      this.computeLit();
      this.emit({ type: 'power' });
      this.later(1.5, () => this.say('genOn'));
      this.activateByProgress();
      this.monster('stalker')?.summon(this, 12);
      this.checkpoint('gen');
    }
    return 'ok';
  }

  /** The station (if any) audible at a radio frequency. */
  stationAt(f: number): 'A' | 'B' | null {
    const r = this.puzzle.radio;
    if (Math.abs(f - r.freqA) < 0.025) return 'A';
    if (Math.abs(f - r.freqB) < 0.025) return 'B';
    return null;
  }
  observe(id: string) {
    if (this.state.obs.includes(id)) return;
    this.state.obs.push(id);
    this.emit({ type: 'observe', id });
    const sym = OBS_SYM[id];
    if (sym && !this.fired(`cp_${sym}`)) {
      this.fire(`cp_${sym}`);
      this.checkpoint(`sym_${sym}`);
    }
  }
  toggleUv() {
    if (!this.state.gen.on) {
      this.msg('Włącznik nie reaguje. Brak zasilania.', 'deny');
      this.sfx('switchDead', 63.9, 31.2);
      return;
    }
    this.state.uvOn = !this.state.uvOn;
    this.sfx('switch', 63.9, 31.2);
    this.sfx(this.state.uvOn ? 'uvOn' : 'uvOff', 58, 30, 2.6);
  }

  pullLever(id: string) {
    if (this.state.stabilizers.includes(id)) return;
    this.state.stabilizers.push(id);
    const p = PROP_BY_ID[id];
    this.sfx('lever', p.x, p.z);
    this.noise(p.x, p.z, 30);
    this.say('stabilizer');
    this.activateByProgress();
    if (this.state.stabilizers.length >= 3) {
      this.state.doors.anchor.unlocked = true;
      this.later(1.5, () => {
        this.setDoor('anchor', true, 'vaultOpen');
        this.say('stabilizersDone');
      });
      for (const m of this.monsters) m.summon(this, 6);
    }
    this.checkpoint(`lever_${id}`);
  }

  /** Anchor terminal choices. */
  anchorChoice(c: 'destroy' | 'open' | 'call') {
    if (this.collapse || this.calling || this.ended) return false;
    if (c === 'call' && this.state.inv.tags < 5) return false;
    if (c === 'destroy') {
      this.collapse = { t: 0, need: this.state.difficulty === 'story' ? 75 : this.state.difficulty === 'nomercy' ? 45 : 60 };
      this.setFlag('choice_destroy');
      this.setDoor('exit', true, 'vaultOpen');
      this.say('collapse');
      this.sfx('anchorDown', 101, 97, 1.6, 1.5);
      this.emit({ type: 'scare', kind: 'collapse', strength: 1 });
      for (const m of this.monsters) {
        m.enraged = true;
        m.active = m.alive;
        m.summon(this, 2);
      }
    } else if (c === 'open') {
      this.setFlag('choice_open');
      this.setDoor('exit', true, 'vaultOpen');
      this.say('exitOpen');
    } else {
      this.setFlag('choice_call');
      this.calling = { t: 0 };
      this.say('callTeam');
      this.sfx('anchorDown', 101, 97, 1.6, 1);
      for (const m of this.monsters) m.summon(this, 4);
    }
    this.computeLit();
    return true;
  }

  rideLift() {
    if (this.lift || this.state.area !== 'upper') return;
    const p = this.player;
    if (!(p.x > 2 && p.x < 14 && p.z > 2 && p.z < 12)) return;
    if (this.state.doors.lift.open) this.setDoor('lift', false, 'liftDoor');
    this.lift = { t: 0 };
    this.emit({ type: 'lift', phase: 'start' });
    this.sfx('liftStart', 6, 7);
  }

  private finishLift() {
    const st = this.state;
    st.area = 'descent';
    for (const m of this.monsters) m.despawn();
    this.player.x = DESCENT_START.x;
    this.player.z = DESCENT_START.z;
    this.player.yaw = DESCENT_START.yaw;
    this.vx = this.vz = 0;
    this.lift = null;
    this.buildMonsters();
    this.computeLit();
    this.emit({ type: 'lift', phase: 'arrive' });
    this.later(1.2, () => this.say('liftDown'));
    this.checkpoint('descent');
  }

  // ------------------------------------------------------------------ interactables
  buildInteractables() {
    const list: Interactable[] = [];
    const L = this.level;
    for (const d of DOORS) {
      const [x, z] = L.cellCenter(d.cx, d.cz);
      const half = d.axis === 'x' ? [0.4, 1] : [1, 0.4];
      list.push({
        id: `door:${d.id}`,
        box: { x0: x - half[0], x1: x + half[0], z0: z - half[1], z1: z + half[1], y0: 0, y1: 2.3 },
        label: () => this.doorLabel(d),
        act: () => this.useDoor(d),
      });
    }
    for (const p of PROPS) {
      if (!p.id) continue;
      const b = propBox(p);
      const pad = { ...b, x0: b.x0 - 0.06, x1: b.x1 + 0.06, z0: b.z0 - 0.06, z1: b.z1 + 0.06, y0: b.y0, y1: Math.max(b.y1, b.y0 + 0.5) };
      const it = this.propInteraction(p, pad);
      if (it) list.push(it);
    }
    // the writing on the walls of the chemical store
    list.push({
      id: 'wall:uv',
      box: { x0: 52, x1: 52.25, z0: 27, z1: 33, y0: 0.6, y1: 2.2 },
      label: () => (this.state.uvOn && this.state.gen.on ? 'Przyjrzyj się świecącym znakom' : null),
      act: () => {
        this.observe('uv');
        this.emit({ type: 'ui', screen: 'note', ref: 'uv' });
      },
    });
    list.push({
      id: 'wall:paint',
      box: { x0: 54, x1: 62, z0: 35.75, z1: 36, y0: 0.6, y1: 2.2 },
      label: () => 'Przeczytaj napis farbą',
      act: () => {
        this.observe('uvfake');
        this.emit({ type: 'ui', screen: 'note', ref: 'paint' });
      },
    });
    list.push({
      id: 'wall:door',
      box: { x0: 49.7, x1: 50.1, z0: 48.3, z1: 49.7, y0: 2.2, y1: 2.7 },
      label: () => 'Symbole nad zamkiem',
      act: () => {
        this.observe('order');
        this.emit({ type: 'ui', screen: 'note', ref: 'order' });
      },
    });
    for (const pk of PICKUPS) {
      if (pk.only && !pk.only.includes(this.state.difficulty)) continue;
      list.push({
        id: `pick:${pk.id}`,
        box: { x0: pk.x - 0.28, x1: pk.x + 0.28, z0: pk.z - 0.28, z1: pk.z + 0.28, y0: pk.y - 0.12, y1: pk.y + 0.3 },
        label: () => (this.pickupAvailable(pk) ? (pk.kind === 'doc' ? `Czytaj: ${DOC_BY_ID[pk.ref].title}` : `Weź: ${ITEM_NAMES[pk.ref as ItemId]}`) : null),
        act: () => this.takePickup(pk),
      });
    }
    this.interactables = list;
  }

  doorLabel(d: DoorDef): string | null {
    const s = this.state.doors[d.id];
    if (d.kind === 'hidden') return s.unlocked ? (s.open ? null : 'Odsuń panel') : this.has('knowsSecret') || dist2d(this.player.x, this.player.z, 43, 41) < 1.8 ? 'Ściana brzmi pusto — naciśnij' : null;
    if (d.kind === 'keypad' && !s.unlocked) {
      const left = Math.ceil(this.state.lockUntil - this.state.playTime);
      return left > 0 ? `Zamek zablokowany (${left} s)` : 'Wprowadź kod zbrojowni';
    }
    if (d.kind === 'exit' && !s.open) return 'Drzwi bez klamki';
    const verb = s.open ? 'Zamknij' : 'Otwórz';
    const lock = !s.unlocked ? (d.kind === 'card' ? ' [karta]' : d.kind === 'power' ? ' [zasilanie]' : d.kind === 'oneway' ? ' [zaklinowane]' : d.kind === 'stabilizers' ? ' [stabilizatory]' : '') : '';
    return `${verb}: ${d.name}${lock}`;
  }

  pickupAvailable(pk: PickupDef) {
    if (this.state.pickedUp.includes(pk.id)) return false;
    if (pk.only && !pk.only.includes(this.state.difficulty)) return false;
    if (pk.id === 'p_revolver' || pk.id === 'p_liftcard' || pk.id === 'p_d10' || pk.id === 'p_d11' || pk.id === 'p_med2' || pk.id === 'p_ammo2' || pk.id === 'p_ammo1') return this.state.doors.armory.unlocked;
    return true;
  }

  takePickup(pk: PickupDef) {
    if (!this.pickupAvailable(pk)) return;
    const st = this.state;
    st.pickedUp.push(pk.id);
    if (pk.kind === 'doc') {
      this.readDoc(pk.ref);
      return;
    }
    const item = pk.ref as ItemId;
    let text = ITEM_NAMES[item];
    switch (item) {
      case 'battery':
        st.inv.battery++;
        break;
      case 'medkit':
        st.inv.medkit++;
        break;
      case 'ammo':
        st.inv.ammo += 6;
        break;
      case 'tag': {
        st.inv.tags++;
        text = `${text} (${st.inv.tags}/5)`;
        break;
      }
      case 'revolver':
        st.revolver = true;
        st.loaded = 6;
        this.drawn = true;
        this.drawT = 0;
        this.checkpoint('revolver');
        break;
      case 'liftcard':
        st.liftcard = true;
        break;
    }
    this.sfx(item === 'revolver' ? 'gunPickup' : item === 'ammo' ? 'ammoPickup' : 'pickup', pk.x, pk.z);
    this.noise(pk.x, pk.z, 3);
    this.emit({ type: 'pickup', text });
  }

  readDoc(id: string) {
    if (!this.state.docs.includes(id)) this.state.docs.push(id);
    this.sfx('paper');
    this.emit({ type: 'doc', id });
    if (id === 'd14') this.setFlag('knowsTags');
    if (id === 'd02' && !this.fired('firstContactArmed')) this.fire('firstContactArmed');
  }

  hideSpotsCache: HideSpot[] | null = null;
  get hideSpots(): HideSpot[] {
    if (this.hideSpotsCache) return this.hideSpotsCache.filter((s) => !this.state.destroyed.includes(s.id));
    const out: HideSpot[] = [];
    for (const p of PROPS) {
      if (!p.id) continue;
      if (p.kind === 'locker') {
        const f = forward((Math.round(p.rot) * Math.PI) / 2, 0);
        out.push({ id: p.id, kind: 'locker', x: p.x, z: p.z, fx: p.x + f[0] * 1.0, fz: p.z + f[2] * 1.0 });
      } else if (p.kind === 'table') {
        out.push({ id: p.id, kind: 'table', x: p.x, z: p.z, fx: p.x + 1.1, fz: p.z });
      }
    }
    for (const a of ALCOVES) {
      const [x, z] = this.level.cellCenter(a.cx, a.cz);
      out.push({ id: `alcove_${a.cx}_${a.cz}`, kind: 'alcove', x, z, fx: x, fz: z });
    }
    this.hideSpotsCache = out;
    return out;
  }

  propInteraction(p: PropDef, box: Box & { y0: number; y1: number }): Interactable | null {
    const id = p.id!;
    const mk = (label: () => string | null, act: () => void): Interactable => ({ id: `prop:${id}`, box, label, act });
    const st = this.state;
    switch (p.kind) {
      case 'locker':
        return mk(
          () => (st.destroyed.includes(id) ? 'Szafka wyrwana — bezużyteczna' : this.player.hide ? null : 'Schowaj się w szafce'),
          () => {
            if (st.destroyed.includes(id)) return;
            this.enterHide(id, 'locker');
          },
        );
      case 'table':
        return mk(
          () => (this.player.hide ? null : 'Schowaj się pod stołem'),
          () => this.enterHide(id, 'table'),
        );
      case 'clock': {
        const i = Number(id.slice(5));
        return mk(
          () => 'Przyjrzyj się zegarowi',
          () => {
            this.observe(`clock${i}`);
            this.emit({ type: 'ui', screen: 'clock', ref: String(i) });
          },
        );
      }
      case 'radio':
        return mk(
          () => 'Odbiornik krótkofalowy',
          () => {
            if (!st.gen.on) {
              this.msg('Odbiornik martwy. Brak zasilania z agregatu.', 'deny');
              this.sfx('switchDead', p.x, p.z);
              return;
            }
            this.emit({ type: 'ui', screen: 'radio' });
          },
        );
      case 'console':
        return mk(
          () => 'Konsola kamer',
          () => {
            if (!st.gen.on) {
              this.msg('Monitory są czarne. Brak zasilania.', 'deny');
              this.sfx('switchDead', p.x, p.z);
              return;
            }
            this.cctv = { cam: this.cctv?.cam ?? 0, viewT: 0 };
            this.sfx('cctvOn', p.x, p.z);
            this.emit({ type: 'ui', screen: 'cctv' });
          },
        );
      case 'genPanel':
        return mk(() => (st.gen.on ? 'Agregat pracuje' : 'Panel agregatu'), () => this.emit({ type: 'ui', screen: 'generator' }));
      case 'generator':
        return mk(() => (st.gen.on ? 'Agregat pracuje równo' : 'Agregat (stoi)'), () => this.msg(st.gen.on ? 'Agregat dudni. Zapach spalin.' : 'Silnik zimny. Panel sterowania wisi na ścianie.'));
      case 'uvSwitch':
        return mk(() => (st.uvOn ? 'Wyłącz lampę UV' : 'Włącz lampę UV'), () => this.toggleUv());
      case 'board':
        return mk(
          () => 'Lista Zwiadu 4',
          () => {
            this.observe('roster');
            this.emit({ type: 'ui', screen: 'roster' });
          },
        );
      case 'keypad':
        return mk(
          () => (st.doors.armory.unlocked ? null : this.doorLabel(this.doorDef('armory'))),
          () => this.emit({ type: 'ui', screen: 'keypad', ref: 'armory' }),
        );
      case 'lever':
        return mk(() => (st.stabilizers.includes(id) ? null : 'Przestaw stabilizator'), () => this.pullLever(id));
      case 'terminal':
        return mk(() => 'Terminal Kotwicy', () => this.emit({ type: 'ui', screen: 'terminal' }));
      case 'liftPanel':
        if (id === 'liftpanel_down') return mk(() => 'Panel windy (martwy)', () => this.msg('Jest tylko jeden przycisk: w dół. Już na dole.'));
        return mk(
          () => (st.area !== 'upper' ? null : 'Panel windy: w dół'),
          () => {
            if (!st.doors.lift.unlocked) {
              this.msg('Najpierw otwórz windę kartą.', 'deny');
              return;
            }
            this.rideLift();
          },
        );
      case 'tapeDeck':
        return mk(
          () => 'Magnetofon',
          () => {
            this.sfx('tape', p.x, p.z);
            this.readDoc('d09');
          },
        );
      case 'wallPanel':
        return null;
      case 'camera':
      case 'vent':
        return null;
      default:
        return null;
    }
  }

  // ------------------------------------------------------------------ hiding
  enterHide(id: string, kind: 'locker' | 'table') {
    const p = this.player;
    if (p.hide || this.lift) return;
    const prop = PROP_BY_ID[id];
    this.hideFrom = [p.x, p.z];
    p.hide = { id, kind, x: prop.x, z: prop.z };
    p.lockX = prop.x;
    p.lockZ = prop.z;
    this.hideT = 0;
    this.vx = this.vz = 0;
    this.flashlight = false;
    this.drawn = false;
    this.state.stats.hidden++;
    if (kind === 'locker') p.yaw = (Math.round(prop.rot) * Math.PI) / 2;
    p.pitch = kind === 'table' ? -0.05 : 0;
    this.sfx(kind === 'locker' ? 'lockerIn' : 'tableIn', prop.x, prop.z);
    this.noise(prop.x, prop.z, kind === 'locker' ? 4 : 2);
    for (const m of this.monsters) m.playerHid(this, id);
  }
  leaveHide(forced = false) {
    const p = this.player;
    if (!p.hide) return;
    const h = p.hide;
    const prop = PROP_BY_ID[h.id];
    p.hide = null;
    if (prop) {
      if (h.kind === 'locker') {
        const f = forward((Math.round(prop.rot) * Math.PI) / 2, 0);
        p.x = prop.x + f[0] * 0.75;
        p.z = prop.z + f[2] * 0.75;
      } else {
        p.x = this.hideFrom[0];
        p.z = this.hideFrom[1];
      }
      this.collide();
      if (!forced) this.sfx(h.kind === 'locker' ? 'lockerOut' : 'tableOut', prop.x, prop.z);
      this.noise(prop.x, prop.z, h.kind === 'locker' ? 4 : 2);
    }
    this.hideT = 0;
  }

  // ------------------------------------------------------------------ actions
  interact() {
    if (this.dead || this.ended || this.lift) return;
    if (this.player.hide && this.player.hide.kind !== 'alcove') {
      this.leaveHide();
      return;
    }
    const f = this.focus;
    if (f && f.label()) f.act();
  }

  toggleFlashlight() {
    if (this.player.hide && this.player.hide.kind !== 'alcove') return;
    if (!this.flashlight && this.state.battery <= 0.003) {
      this.msg('Bateria latarki wyczerpana. B — wymiana.', 'deny');
      this.sfx('clickDead');
      return;
    }
    this.flashlight = !this.flashlight;
    this.sfx('flashlight');
    this.noise(this.player.x, this.player.z, 1.5);
  }
  useBattery() {
    const st = this.state;
    if (st.inv.battery <= 0) return this.msg('Nie masz zapasowej baterii.', 'deny');
    if (st.battery > 0.9) return this.msg('Bateria jest prawie pełna.');
    st.inv.battery--;
    st.battery = 1;
    this.sfx('battery');
    this.msg('Bateria wymieniona.', 'good');
  }
  useMedkit() {
    const st = this.state;
    if (st.inv.medkit <= 0) return this.msg('Nie masz apteczki.', 'deny');
    if (st.health >= MAX_HP) return this.msg('Nie jesteś ranny.');
    if (this.healT > 0) return;
    st.inv.medkit--;
    this.healT = 1.6;
    this.sfx('medkit');
  }
  toggleWeapon() {
    if (!this.state.revolver || this.player.hide) return;
    this.drawn = !this.drawn;
    this.drawT = 0;
    this.reloadT = 0;
    this.sfx(this.drawn ? 'gunDraw' : 'gunHolster');
  }
  reload() {
    const st = this.state;
    if (!this.drawn || this.reloadT > 0 || st.loaded >= 6) return;
    if (st.inv.ammo <= 0) return this.msg('Brak amunicji.', 'deny');
    this.reloadT = 2.3;
    this.sfx('reload');
    this.noise(this.player.x, this.player.z, 3);
  }

  look(dx: number, dy: number) {
    const p = this.player;
    if (this.lift && this.lift.t > 0.5) dx *= 0.6;
    if (p.hide && p.hide.kind === 'locker') {
      const prop = PROP_BY_ID[p.hide.id];
      const by = prop ? (Math.round(prop.rot) * Math.PI) / 2 : p.yaw;
      p.yaw = by + clamp(wrapAngle(p.yaw + dx - by), -0.3, 0.3);
      p.pitch = clamp(p.pitch + dy, -0.25, 0.2);
      return;
    }
    if (p.hide && p.hide.kind === 'table') {
      p.yaw = wrapAngle(p.yaw + dx);
      p.pitch = clamp(p.pitch + dy, -0.3, 0.15);
      return;
    }
    p.yaw = wrapAngle(p.yaw + dx);
    p.pitch = clamp(p.pitch + dy, -1.45, 1.45);
  }

  // ------------------------------------------------------------------ shooting
  shoot(aim: boolean) {
    const st = this.state;
    if (!this.drawn || this.drawT < 0.45 || this.reloadT > 0 || this.fireCd > 0 || this.player.hide) return;
    if (st.loaded <= 0) {
      this.fireCd = 0.35;
      this.sfx('dryFire');
      if (st.inv.ammo > 0) this.msg('Pusty bęben. R — przeładuj.');
      return;
    }
    st.loaded--;
    st.stats.shots++;
    this.fireCd = 0.5;
    this.recoil = 1;
    this.flashT = 0.07;
    const p = this.player;
    this.sfx('gunshot', p.x, p.z, this.eye, 1);
    this.noise(p.x, p.z, 42);
    const spread = (aim ? 0.008 : 0.028) + (this.moving > 0.4 ? 0.02 : 0);
    const yaw = p.yaw + (this.rng.next() - 0.5) * spread * 2;
    const pitch = p.pitch + (this.rng.next() - 0.5) * spread * 2;
    const dir = forward(yaw, pitch);
    const o: [number, number, number] = [p.x, this.eye, p.z];
    const wall = this.rayWall(o, dir, 40);
    let best: { m: Monster; t: number; head: boolean } | null = null;
    for (const m of this.monsters) {
      if (!m.visible || !m.alive) continue;
      for (const s of hitSpheres(m)) {
        const t = raySphere(o, dir, s);
        if (t !== null && t < wall.t && (!best || t < best.t)) best = { m, t, head: s.head };
      }
    }
    // the panic of a missed shot makes the pitch jump
    p.pitch = clamp(p.pitch + 0.045, -1.45, 1.45);
    if (best) {
      const dmg = 34 * (best.head ? 2 : 1);
      st.stats.hits++;
      const hx = o[0] + dir[0] * best.t;
      const hy = o[1] + dir[1] * best.t;
      const hz = o[2] + dir[2] * best.t;
      const blood = best.m.type === 'crawler' ? 'black' : 'red';
      this.emit({ type: 'shot', hit: true, x: hx, y: hy, z: hz, monster: best.m.id, head: best.head, blood });
      this.spray(hx, hy, hz, dir, blood === 'black' ? 'black' : 'blood', 16);
      // blood on the floor behind it
      const fx = hx + dir[0] * 0.8;
      const fz = hz + dir[2] * 0.8;
      if (!this.level.isSolid(Math.floor(fx / CELL), Math.floor(fz / CELL))) this.addDecal(fx, 0.012, fz, 0, 1, 0, 0.6, 'splat');
      best.m.takeDamage(this, dmg);
    } else {
      const hx = o[0] + dir[0] * wall.t;
      const hy = o[1] + dir[1] * wall.t;
      const hz = o[2] + dir[2] * wall.t;
      this.emit({ type: 'shot', hit: false, x: hx, y: hy, z: hz });
      if (wall.t < 40) {
        this.addDecal(hx - wall.n[0] * -0.005, hy, hz - wall.n[2] * -0.005, wall.n[0], wall.n[1], wall.n[2], 0.08, 'hole');
        this.spray(hx, hy, hz, [wall.n[0], wall.n[1], wall.n[2]], 'spark', 8);
        this.sfx('ricochet', hx, hz, hy, 0.6);
      }
    }
  }

  /** Distance to the first wall, closed door, floor or ceiling along a ray. */
  rayWall(o: [number, number, number], d: [number, number, number], max: number): { t: number; n: [number, number, number] } {
    const step = 0.05;
    let px = o[0];
    let pz = o[2];
    for (let t = step; t < max; t += step) {
      const x = o[0] + d[0] * t;
      const y = o[1] + d[1] * t;
      const z = o[2] + d[2] * t;
      if (y <= 0) return { t, n: [0, 1, 0] };
      if (y >= 2.75) return { t, n: [0, -1, 0] };
      const cx = Math.floor(x / CELL);
      const cz = Math.floor(z / CELL);
      const blocked = this.level.isSolid(cx, cz) || (this.level.cell(cx, cz) === DOOR && this.closedDoorAt(cx, cz));
      if (blocked) {
        const pcx = Math.floor(px / CELL);
        const pcz = Math.floor(pz / CELL);
        const n: [number, number, number] = pcx !== cx ? [Math.sign(pcx - cx), 0, 0] : pcz !== cz ? [0, 0, Math.sign(pcz - cz)] : [0, 1, 0];
        // snap to the wall plane
        let tt = t;
        if (n[0] !== 0) tt = ((n[0] > 0 ? (cx + 1) * CELL : cx * CELL) - o[0]) / d[0];
        else if (n[2] !== 0) tt = ((n[2] > 0 ? (cz + 1) * CELL : cz * CELL) - o[2]) / d[2];
        return { t: Math.max(0, Math.min(t, tt)), n };
      }
      for (const { box } of this.level.propBoxes) {
        if (x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1 && y > (box.y0 ?? 0) && y < (box.y1 ?? 2)) return { t, n: [-d[0], 0, -d[2]] };
      }
      px = x;
      pz = z;
    }
    return { t: max, n: [0, 1, 0] };
  }

  spray(x: number, y: number, z: number, n: number[], kind: Particle['kind'], count: number) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        z,
        vx: n[0] * 2 + (Math.random() - 0.5) * 2.5,
        vy: n[1] * 2 + Math.random() * 2,
        vz: n[2] * 2 + (Math.random() - 0.5) * 2.5,
        life: 0.5 + Math.random() * 0.6,
        kind,
      });
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }
  addDecal(x: number, y: number, z: number, nx: number, ny: number, nz: number, size: number, kind: Decal['kind']) {
    this.decals.push({ x, y, z, nx, ny, nz, size, kind, t: this.time });
    if (this.decals.length > 120) this.decals.shift();
  }

  // ------------------------------------------------------------------ objectives
  objective(): string {
    const st = this.state;
    if (this.collapse) return `Kotwica się zapada! Uciekaj przez Drzwi bez klamki (${Math.max(0, Math.ceil(this.collapse.need - this.collapse.t))} s).`;
    if (this.calling) return this.calling.t < 20 ? 'Wytrzymaj, aż Zwiad 4 dotrze do Kotwicy.' : 'Przejdź przez Drzwi Wyjściowe razem ze Zwiadem.';
    if (st.area === 'descent') {
      if (st.stabilizers.length < 3) return `Przestaw stabilizatory na poziomie Kotwicy (${st.stabilizers.length}/3).`;
      if (!st.flags.some((f) => f.startsWith('choice_'))) return 'Wejdź do Komory Kotwicy i podejdź do terminala.';
      return 'Przejdź przez Drzwi bez klamki.';
    }
    if (!this.fired('leftStart')) return 'Wyjdź ze schowka. Rozejrzyj się.';
    if (!st.doors.armory.unlocked) {
      const n = this.symbolsKnown().length;
      if (!this.fired('armorySeen')) return 'Znajdź zbrojownię na wschodnim krańcu labiryntu.';
      return `Ustal pięć znaków kodu do zbrojowni (wskazówki: ${n}/5). Tab — dziennik.`;
    }
    if (!st.revolver) return 'Weź rewolwer ze stołu w zbrojowni.';
    if (!st.liftcard) return 'Zabierz kartę windy ze stojaka w zbrojowni.';
    if (!this.fired('enterRed')) return st.gen.on ? 'Dostań się do Czerwonego Sektora przez śluzę towarową.' : 'Uruchom agregat — śluza do Czerwonego Sektora nie ma prądu.';
    return 'Zjedź windą towarową w północno-zachodnim narożniku Czerwonego Sektora.';
  }

  /** Symbols for which the player has seen the key evidence. */
  symbolsKnown(): Sym[] {
    const o = this.state.obs;
    const out: Sym[] = [];
    if (o.includes(`clock${this.puzzle.liveClock}`)) out.push('circle');
    if (o.includes(`radio_${this.puzzle.radio.real}`)) out.push('triangle');
    if (o.includes('cam3')) out.push('square');
    if (o.includes('roster')) out.push('cross');
    if (o.includes('uv')) out.push('eye');
    return out;
  }

  // ------------------------------------------------------------------ save support
  syncState() {
    const s = this.state;
    s.player = { x: this.player.x, z: this.player.z, yaw: this.player.yaw, pitch: this.player.pitch };
  }
  inDanger() {
    return this.monsters.some((m) => m.alive && m.visible && (m.hunting || m.state === 'checkHide') && dist2d(m.x, m.z, this.player.x, this.player.z) < 30);
  }
  canSave() {
    return !this.dead && !this.ended && !this.lift && !this.collapse && !this.calling && !this.player.hide && !this.inDanger();
  }
  inSafeRoom() {
    const z = this.zone;
    return z === 'start' || z === 'armory' || z === 'lift' || z === 'secret';
  }
  manualSaveAllowed(): { ok: boolean; reason: string } {
    const m = this.diff.manualSave;
    if (m === 'none') return { ok: false, reason: 'NO MERCY: tylko zapis automatyczny' };
    if (!this.canSave()) return { ok: false, reason: this.player.hide ? 'wyjdź z kryjówki' : this.inDanger() ? 'coś cię ściga' : 'teraz nie można' };
    if (m === 'safe' && !this.inSafeRoom()) return { ok: false, reason: 'tylko w bezpiecznym pokoju' };
    return { ok: true, reason: '' };
  }

  // ------------------------------------------------------------------ scripted events
  runEvents(dt: number) {
    const st = this.state;
    const p = this.player;
    if (this.time > 1.2 && this.fire('wake')) this.say('wake');
    if (this.zone && this.zone !== 'start' && this.zone !== 'lift' && st.area === 'upper' && this.fire('leftStart')) this.checkpoint('start');
    if (this.zone === 'dark' && this.fire('enterDark')) this.activateByProgress();
    if (this.zone === 'red' && this.fire('enterRed')) {
      this.activateByProgress();
      this.checkpoint('red');
    }
    // the armory door seen for the first time
    if (!this.fired('armorySeen') && dist2d(p.x, p.z, 49, 49) < 6) {
      const f = forward(p.yaw, 0);
      if (f[0] > 0.6) {
        this.fire('armorySeen');
        this.say('armorySeen');
      }
    }
    // FIRST CONTACT: the Stalker crosses the far end of a long corridor, then is gone
    if (st.area === 'upper' && !this.fired('firstContact') && (this.fired('firstContactArmed') || st.playTime > 160 || st.obs.length >= 2) && this.zone === 'maze' && p.z > 44 && p.z < 62 && p.x > 22) {
      const m = this.monster('stalker')!;
      this.fire('firstContact');
      const variant = this.rng.next() < 0.5;
      // along the maze corridor south of the armory, away from the player
      const route: [number, number][] = variant
        ? [
            [64, 59],
            [52, 59],
            [44, 59],
            [36.5, 59],
            [36.5, 62.5],
          ]
        : [
            [36, 41],
            [36, 45],
            [36, 49.5],
            [30, 49.5],
            [23.5, 41.5],
          ];
      m.active = true;
      m.playScript(route);
      this.sfx('stalkerBreath', route[0][0], route[0][1], 2.4, 1);
      this.later(2.5, () => this.fire('firstContactLine') && this.say('firstStalker'));
      this.emit({ type: 'scare', kind: 'glimpse', strength: 0.4 });
    }
    // THE PILLAR HALL: the lamps die; something stands between the pillars
    if (st.area === 'upper' && this.fired('firstContact') && !this.fired('pillarScare') && this.zone === 'maze' && p.x > 28 && p.z > 63) {
      this.fire('pillarScare');
      this.lights.forEach((l, i) => {
        if (l.x > 26 && l.z > 60 && l.z < 80 && l.x < 52) this.lightOff.set(i, this.time + 3.8);
      });
      this.computeLit();
      this.sfx('powerSag', 38, 70, 2.6, 1);
      const far = p.x < 38 ? 46 : 31;
      this.later(1.2, () => {
        this.apparitions.push({ type: 'stalker', x: far, z: 72, yaw: Math.atan2(-(p.x - far), -(p.z - 72)), until: this.time + 2.4 });
        this.sfx('sting', far, 72, 2, 0.9);
      });
      this.later(3.9, () => this.computeLit());
      this.emit({ type: 'scare', kind: 'dark', strength: 0.7 });
    }
    // THE VENT: a crawler drops out of the duct as you pass
    const cA = this.monster('crawlerA');
    if (cA && cA.active && cA.alive && !this.fired('ventScare') && cA.state === 'dormant' && this.zone === 'dark' && dist2d(p.x, p.z, 69.4, 73) < 9 && dist2d(p.x, p.z, 69.4, 73) > 3.5) {
      this.fire('ventScare');
      cA.emergeAt(this, 69.6, 73, 0.9);
      this.sfx('ventBurst', 68.2, 73, 0.5, 1.2);
      this.emit({ type: 'scare', kind: 'vent', strength: 0.8 });
    }
    // THE BODIES: in the red sector one of the "bodies" is the Echo
    const echo = this.monster('echo');
    if (echo && echo.active && echo.alive && echo.state === 'dormant' && !this.fired('bodyScare') && this.zone === 'red' && dist2d(p.x, p.z, 15.2, 27.6) < 5.5) {
      this.fire('bodyScare');
      echo.x = 15.2;
      echo.z = 27.6;
      echo.yaw = Math.atan2(-(p.x - 15.2), -(p.z - 27.6));
      echo.set('reveal');
      echo.alert = 1.2;
      this.sfx('echoNotice', 15.2, 27.6, 0.6, 1.4);
      this.emit({ type: 'scare', kind: 'body', strength: 1 });
    }
    // DESCENT: the Stalker is already down here, at the end of the long corridor
    if (st.area === 'descent' && !this.fired('descentStalker') && p.x > 12 && this.zone === 'descent') {
      this.fire('descentStalker');
      const m = this.monster('stalkerD')!;
      m.active = true;
      m.playScript([
        [58, 85],
        [66, 85],
        [67, 83.4],
      ]);
      this.sfx('stalkerBreath', 58, 85, 2.4, 1);
      this.later(2, () => this.say('enteredDescent'));
    }
    // the monsters in the ducts are not silent
    for (const m of this.monsters) {
      if (m.active && m.state === 'dormant' && m.stateT > m.dormantFor - 6 && m.stateT < m.dormantFor - 5.9 + dt) {
        const vs = this.rng.next();
        if (vs < 0.6) {
          const near = this.nearestVentOf(m);
          if (near) this.sfx(m.type === 'crawler' ? 'ventScratch' : 'ventKnock', near.x, near.z, 2.6, 0.7);
        }
      }
      // lights falter around the Stalker
      if (m.type === 'stalker' && m.visible && m.alive && Math.random() < dt * 0.25) this.flickerNear(m.x, m.z, 0.5, 6);
    }
    this.apparitions = this.apparitions.filter((a) => a.until > this.time);
    this.ambientDread(dt);
  }

  /** Long quiet stretches get something to listen to: footsteps two rooms away, a
   *  slammed door, a knock in the ducts, the lights giving out for a moment. None of
   *  it moves a monster; it only keeps the silence from becoming safe. */
  private dreadT = 50;
  private ambientDread(dt: number) {
    const p = this.player;
    const hunted = this.monsters.some((m) => m.alive && m.visible && (m.hunting || dist2d(m.x, m.z, p.x, p.z) < 14));
    if (hunted || this.collapse || this.calling || this.lift || this.inSafeRoom() || this.zone === 'secret') {
      this.dreadT = Math.max(this.dreadT, 25);
      return;
    }
    this.dreadT -= dt;
    if (this.dreadT > 0) return;
    this.dreadT = this.rng.range(45, 95) / Math.max(0.7, this.diff.reaction);
    // somewhere 12–24 m away, out of sight
    let spot: [number, number] | null = null;
    for (let i = 0; i < 20 && !spot; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(12, 24);
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      const t = this.level.cell(Math.floor(x / CELL), Math.floor(z / CELL));
      if ((t === FLOOR_CELL || t === WET_CELL) && !this.level.lineClear(p.x, p.z, x, z)) spot = [x, z];
    }
    if (!spot) return;
    const [x, z] = spot;
    const k = this.rng.next();
    if (k < 0.4) {
      // something walks, stops, walks again
      const kind = this.state.area === 'descent' || this.rng.next() < 0.6 ? 'stalkerStep' : 'echoStep';
      for (let i = 0; i < 5; i++) this.later(i * 0.75 + (i > 2 ? 1.6 : 0), () => this.sfx(kind, x + i * 0.4, z, 0.1, 0.8));
    } else if (k < 0.6) this.sfx('doorForce', x, z, 1.2, 0.9);
    else if (k < 0.8) this.sfx('ventKnock', x, z, 2.6, 0.8);
    else {
      this.flickerNear(p.x, p.z, this.rng.range(0.6, 1.4), 10);
      this.sfx('powerSag', p.x, p.z, 2.6, 0.6);
    }
  }

  nearestVentOf(m: Monster) {
    let best: { x: number; z: number } | null = null;
    let bd = Infinity;
    for (const p of PROPS) {
      if (p.kind !== 'vent') continue;
      const z = this.level.zoneAt(p.x, p.z);
      if (!z || !m.zones.includes(z)) continue;
      const d = dist2d(p.x, p.z, this.player.x, this.player.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return bd < 30 ? best : null;
  }

  // ------------------------------------------------------------------ main update
  update(dt: number, c: Controls) {
    this.time += dt;
    this.doorsAnim(dt);
    this.updateParticles(dt);
    if (this.dead || this.ended) return;
    const st = this.state;
    st.playTime += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      this.timers = this.timers.filter((t) => t.at > this.time);
      for (const t of due) t.fn();
    }
    if (this.lift) {
      this.lift.t += dt;
      if (this.lift.t > 2 && this.lift.t < 2 + dt) this.sfx('liftBang', 6, 7, 3, 1);
      if (this.lift.t > 3.5 && this.lift.t < 3.5 + dt) this.emit({ type: 'scare', kind: 'lift', strength: 0.8 });
      if (this.lift.t > 4.6 && this.lift.t < 4.6 + dt) this.sfx('liftBang', 6, 7, 3, 1.3);
      if (this.lift.t >= 8) this.finishLift();
      this.updateFocus();
      return;
    }
    this.movePlayer(dt, c);
    // weapon
    this.drawT += dt;
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.recoil = Math.max(0, this.recoil - dt * 5);
    this.flashT = Math.max(0, this.flashT - dt);
    this.aimT += ((c.aim && this.drawn && !this.player.hide ? 1 : 0) - this.aimT) * Math.min(1, dt * 10);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = 6 - st.loaded;
        const take = Math.min(need, st.inv.ammo);
        st.inv.ammo -= take;
        st.loaded += take;
      }
    }
    if (c.fire && !this.wasFire) this.shoot(c.aim);
    this.wasFire = c.fire;
    if (this.healT > 0) {
      this.healT -= dt;
      st.health = Math.min(MAX_HP, st.health + (50 / 1.6) * dt);
    }
    if (this.diff.regen && st.health < 60) st.health = Math.min(60, st.health + dt * 0.6);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.4);
    // zone
    const z = this.level.zoneAt(this.player.x, this.player.z);
    if (z && z !== this.zone) this.zone = z;
    // flashlight
    if (this.flashlight) {
      st.battery = Math.max(0, st.battery - (dt / 300) * this.diff.batteryDrain);
      if (st.battery <= 0) {
        this.flashlight = false;
        this.sfx('clickDead');
        this.msg('Bateria latarki wyczerpana.', 'deny');
      }
    }
    // CCTV observation
    if (this.cctv) {
      if (!st.gen.on) this.cctv = null;
      else {
        this.cctv.viewT += dt;
        if (this.cctv.cam === 2 && this.cctv.viewT > 1.5) this.observe('cam3');
      }
    }
    // monsters
    this.player.flashlight = this.flashlight;
    this.player.moving = this.moving;
    this.player.crouch = this.player.crouch || false;
    this.updateAlcove();
    for (const m of this.monsters) m.update(dt, this);
    let nearest = 99;
    for (const m of this.monsters) if (m.visible && m.alive) nearest = Math.min(nearest, dist2d(m.x, m.z, this.player.x, this.player.z));
    const hunted = this.monsters.some((m) => m.hunting && m.alive);
    const target = hunted ? 1 : nearest < 18 ? clamp(1 - nearest / 18, 0, 0.7) : this.collapse ? 0.5 : 0;
    this.fear += (target - this.fear) * Math.min(1, dt * 1.5);
    this.runEvents(dt);
    this.updateFinal(dt);
    if (this.blackout > 0) {
      this.blackout = Math.max(0, this.blackout - dt);
      if (this.blackout === 0) this.computeLit();
    }
    this.updateFocus();
  }

  updateAlcove() {
    const p = this.player;
    if (p.hide && p.hide.kind !== 'alcove') return;
    const cx = Math.floor(p.x / CELL);
    const cz = Math.floor(p.z / CELL);
    const inAlcove = ALCOVES.some((a) => a.cx === cx && a.cz === cz);
    if (inAlcove && p.crouch && !this.flashlight && this.moving < 0.2 && this.lit(p.x, p.z) < 0.4) {
      if (!p.hide) {
        p.hide = { id: `alcove_${cx}_${cz}`, kind: 'alcove', x: p.x, z: p.z };
        for (const m of this.monsters) m.playerHid(this, p.hide.id);
      }
    } else if (p.hide?.kind === 'alcove') p.hide = null;
  }

  updateFinal(dt: number) {
    const p = this.player;
    if (this.collapse) {
      this.collapse.t += dt;
      if (Math.random() < dt * 0.8) {
        this.emit({ type: 'scare', kind: 'quake', strength: 0.4 });
        this.sfx('rumble', p.x + this.rng.range(-8, 8), p.z + this.rng.range(-8, 8), 2.5, 1);
      }
      if (this.collapse.t >= this.collapse.need) {
        this.die('collapse');
        return;
      }
    }
    if (this.calling) {
      this.calling.t += dt;
      if (this.calling.t >= 20 && !this.state.doors.exit.open) {
        this.setDoor('exit', true, 'vaultOpen');
        this.msg('Drzwi Wyjściowe się otwierają. Słychać kroki — wiele kroków.', 'good');
      }
    }
    // stepping through the exit door ends the game
    if (this.state.doors.exit.open && p.x > 113.2 && this.state.area === 'descent') {
      const id: EndingId = this.has('choice_call') ? 'zwiad' : this.has('choice_destroy') ? 'przebudzenie' : 'zejscie';
      this.finish(id);
    }
  }

  finish(id: EndingId) {
    if (this.ended) return;
    this.ended = id;
    this.collapse = null;
    this.emit({ type: 'ending', id });
  }

  doorsAnim(dt: number) {
    for (const d of DOORS) {
      const target = this.state.doors[d.id].open ? 1 : 0;
      const speed = d.kind === 'keypad' || d.kind === 'stabilizers' || d.kind === 'exit' ? 0.5 : d.kind === 'hidden' ? 0.6 : 1.7;
      this.doorAnim[d.id] += Math.sign(target - this.doorAnim[d.id]) * Math.min(Math.abs(target - this.doorAnim[d.id]), dt * speed);
    }
  }

  updateParticles(dt: number) {
    for (const p of this.particles) {
      p.vy -= 9 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.01) {
        p.y = 0.01;
        p.vx *= 0.3;
        p.vz *= 0.3;
        p.vy = 0;
      }
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  // ------------------------------------------------------------------ player movement
  movePlayer(dt: number, c: Controls) {
    const p = this.player;
    if (p.hide && p.hide.kind !== 'alcove') {
      this.moving = 0;
      p.sprinting = false;
      this.hideT = Math.min(1, this.hideT + dt * 2.2);
      // ease into the hiding pose rather than snapping
      const tx = p.hide.x;
      const tz = p.hide.z;
      p.x += (tx - p.x) * Math.min(1, dt * 6);
      p.z += (tz - p.z) * Math.min(1, dt * 6);
      const eyeT = p.hide.kind === 'table' ? 0.48 : 1.58;
      this.eye += (eyeT - this.eye) * Math.min(1, dt * 6);
      return;
    }
    p.crouch = c.crouch;
    const wantSprint = c.sprint && !p.crouch && c.fwd > 0 && !this.exhausted && this.aimT < 0.5;
    const hurtSlow = this.state.health < 25 ? 0.82 : 1;
    const speed = (p.crouch ? 1.3 : wantSprint ? 4.3 : this.aimT > 0.5 ? 1.7 : 2.4) * hurtSlow;
    const len = Math.hypot(c.fwd, c.side);
    const fx = len > 0 ? c.fwd / len : 0;
    const sx = len > 0 ? c.side / len : 0;
    const f = forward(p.yaw, 0);
    const r = [-f[2], 0, f[0]];
    const tx = (f[0] * fx + r[0] * sx) * speed;
    const tz = (f[2] * fx + r[2] * sx) * speed;
    const acc = len > 0 ? 11 : 9;
    this.vx += (tx - this.vx) * Math.min(1, dt * acc);
    this.vz += (tz - this.vz) * Math.min(1, dt * acc);
    const sp = Math.hypot(this.vx, this.vz);
    p.sprinting = wantSprint && sp > 3;
    if (p.sprinting) {
      this.stamina -= dt / 6.5;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
        this.sfx('breath');
      }
    } else {
      this.stamina = Math.min(1, this.stamina + dt / 7);
      if (this.exhausted && this.stamina > 0.35) this.exhausted = false;
    }
    const steps = Math.ceil((sp * dt) / 0.15) || 1;
    for (let i = 0; i < steps; i++) {
      p.x += (this.vx * dt) / steps;
      this.collide();
      p.z += (this.vz * dt) / steps;
      this.collide();
    }
    const eyeT = p.crouch ? EYE_CROUCH : EYE;
    this.eye += (eyeT - this.eye) * Math.min(1, dt * 8);
    this.moving = clamp(sp / 4.3, 0, 1);
    this.bob += sp * dt * (p.sprinting ? 2.1 : 2.6);
    this.stepAcc += sp * dt;
    const stride = p.sprinting ? 2.0 : p.crouch ? 1.0 : 1.5;
    if (this.stepAcc > stride) {
      this.stepAcc = 0;
      const wet = this.level.isWet(p.x, p.z);
      this.sfx(wet ? (p.sprinting ? 'splashRun' : 'splash') : p.sprinting ? 'stepRun' : p.crouch ? 'stepSoft' : 'step', p.x, p.z, 0.1, p.crouch ? 0.5 : 1);
      const n = (p.sprinting ? 14 : p.crouch ? 1.4 : 4.5) * (wet ? 1.6 : 1);
      this.noise(p.x, p.z, n);
    }
  }

  collide() {
    const p = this.player;
    const L = this.level;
    const cx = Math.floor(p.x / CELL);
    const cz = Math.floor(p.z / CELL);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        const t = L.cell(x, z);
        if (t === DOOR) {
          for (const b of this.doorBoxes(x, z)) {
            const o = pushOut(p.x, p.z, RADIUS, b);
            if (o) [p.x, p.z] = o;
          }
          continue;
        }
        if (!L.isSolid(x, z)) continue;
        const o = pushOut(p.x, p.z, RADIUS, { x0: x * CELL, x1: x * CELL + CELL, z0: z * CELL, z1: z * CELL + CELL });
        if (o) [p.x, p.z] = o;
      }
    for (const { box } of L.propBoxes) {
      if (box.x1 < p.x - 2 || box.x0 > p.x + 2 || box.z1 < p.z - 2 || box.z0 > p.z + 2) continue;
      const o = pushOut(p.x, p.z, RADIUS, box);
      if (o) [p.x, p.z] = o;
    }
  }

  /** Collision of a door cell: the jambs (the wall continues 0.45 m on each side) and, while closed, the leaf. */
  doorBoxes(cx: number, cz: number) {
    const d = this.level.doorAtCell(cx, cz)!;
    const x0 = cx * CELL;
    const z0 = cz * CELL;
    const open = this.doorAnim[d.id] ?? 0;
    const t = 0.08;
    const j = JAMB;
    const out: { x0: number; x1: number; z0: number; z1: number }[] = [];
    const closed = open < 0.75;
    if (d.axis === 'x') {
      const xc = x0 + CELL / 2;
      out.push({ x0, x1: x0 + CELL, z0, z1: z0 + j }, { x0, x1: x0 + CELL, z0: z0 + CELL - j, z1: z0 + CELL });
      if (closed) out.push({ x0: xc - t, x1: xc + t, z0, z1: z0 + CELL });
    } else {
      const zc = z0 + CELL / 2;
      out.push({ x0, x1: x0 + j, z0, z1: z0 + CELL }, { x0: x0 + CELL - j, x1: x0 + CELL, z0, z1: z0 + CELL });
      if (closed) out.push({ x0, x1: x0 + CELL, z0: zc - t, z1: zc + t });
    }
    return out;
  }

  // ------------------------------------------------------------------ aiming
  eyePos(): [number, number, number] {
    return [this.player.x, this.eye, this.player.z];
  }
  updateFocus() {
    const p = this.player;
    if (p.hide && p.hide.kind !== 'alcove') {
      this.focus = { id: 'hide', box: { x0: 0, x1: 0, z0: 0, z1: 0, y0: 0, y1: 0 }, label: () => (p.hide?.kind === 'table' ? 'Wyjdź spod stołu' : 'Wyjdź z szafki'), act: () => this.leaveHide() };
      return;
    }
    const o = this.eyePos();
    const dir = forward(p.yaw, p.pitch);
    let best: Interactable | null = null;
    let bt = 2.2;
    for (const it of this.interactables) {
      const b = it.box;
      if (Math.abs((b.x0 + b.x1) / 2 - o[0]) > 4 || Math.abs((b.z0 + b.z1) / 2 - o[2]) > 4) continue;
      const t = rayBox(o, dir, b);
      if (t !== null && t < bt && it.label()) {
        const hx = o[0] + dir[0] * Math.max(0, t - 0.3);
        const hz = o[2] + dir[2] * Math.max(0, t - 0.3);
        if (!this.level.lineClear(o[0], o[2], hx, hz, (cx, cz) => this.closedDoorAt(cx, cz) && !it.id.startsWith('door:'), false)) continue;
        bt = t;
        best = it;
      }
    }
    this.focus = best;
  }

  aimAt(id: string) {
    const it = this.interactables.find((i) => i.id === id);
    if (!it) return false;
    const b = it.box;
    const tx = (b.x0 + b.x1) / 2;
    const ty = (b.y0 + Math.min(b.y1, Math.max(2, b.y0 + 0.3))) / 2;
    const tz = (b.z0 + b.z1) / 2;
    const p = this.player;
    p.yaw = Math.atan2(-(tx - p.x), -(tz - p.z));
    p.pitch = Math.atan2(ty - this.eye, Math.hypot(tx - p.x, tz - p.z));
    this.updateFocus();
    return this.focus?.id === id;
  }

  zoneName() {
    return this.zone ? ZONE_NAMES[this.zone] : '';
  }
}

// ------------------------------------------------------------------ journal text
const OBS_SYM: Record<string, Sym> = { cam3: 'square', roster: 'cross', uv: 'eye', radio_A: 'triangle', radio_B: 'triangle' };
for (let i = 0; i < 5; i++) OBS_SYM[`clock${i}`] = 'circle';

/** Journal line for an observation; `full` adds the derived digit (STORY). */
export function obsText(id: string, p: Puzzle, full: boolean): { sym: Sym | null; text: string } {
  const g = (s: Sym) => `${SYM_GLYPH[s]} ${SYM_NAME[s]}`;
  if (id.startsWith('clock')) {
    const i = Number(id.slice(5));
    const c = p.clocks[i];
    const t = `${c.h}:${String(c.m).padStart(2, '0')}`;
    if (i === p.liveClock) return { sym: 'circle', text: `Zegar nr ${i + 1} w Pokoju zegarów TYKA. Wskazuje ${t}.${full ? ` → ${g('circle')} = ${p.digits.circle}` : ''}` };
    return { sym: 'circle', text: `Zegar nr ${i + 1} w Pokoju zegarów stoi na ${t}.` };
  }
  if (id === 'radio_A' || id === 'radio_B') {
    const st = id.slice(6) as 'A' | 'B';
    const f = st === 'A' ? p.radio.freqA : p.radio.freqB;
    const real = p.radio.real === st;
    const n = real ? p.digits.triangle : p.radio.fake;
    return { sym: 'triangle', text: `Stacja ${f.toFixed(2)} MHz: ${real ? 'szum, trzy trzaski, potem głos' : 'cisza, potem głos'}: „Trójkąt. ${n}”.${full ? (real ? ` → ${g('triangle')} = ${n}` : ' → to TO, nie nasza stacja') : ''}` };
  }
  if (id === 'cam3') return { sym: 'square', text: `Kamera 3 (klatka): na ścianie kwadrat i ${p.digits.square} pionowych kresek.${full ? ` → ${g('square')} = ${p.digits.square}` : ''}` };
  if (id === 'roster') {
    const b = p.roster.filter((r) => r.mark === 'black').length;
    return { sym: 'cross', text: `Lista Zwiadu 4: ${b} czarnych krzyżyków i 1 czerwony.${full ? ` → ${g('cross')} = ${b}` : ''}` };
  }
  if (id === 'uv') return { sym: 'eye', text: `W świetle UV: oko i ${p.digits.eye} kropek.${full ? ` → ${g('eye')} = ${p.digits.eye}` : ''}` };
  if (id === 'uvfake') return { sym: 'eye', text: `Napis zwykłą farbą: „OKO = ${p.uvFake}”.${full ? ' → farba w zwykłym świetle kłamie' : ''}` };
  if (id === 'order') return { sym: null, text: `Kolejność na drzwiach zbrojowni: ${p.order.map((s) => SYM_GLYPH[s]).join('  ')}` };
  return { sym: null, text: id };
}

// ------------------------------------------------------------------ geometry helpers
export function rayBox(o: [number, number, number], d: [number, number, number], b: Box & { y0: number; y1: number }): number | null {
  let tmin = 0;
  let tmax = 100;
  const lo = [b.x0, b.y0, b.z0];
  const hi = [b.x1, b.y1, b.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
      continue;
    }
    let t1 = (lo[i] - o[i]) / d[i];
    let t2 = (hi[i] - o[i]) / d[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export function raySphere(o: [number, number, number], d: [number, number, number], s: { x: number; y: number; z: number; r: number }): number | null {
  const ox = o[0] - s.x;
  const oy = o[1] - s.y;
  const oz = o[2] - s.z;
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const c = ox * ox + oy * oy + oz * oz - s.r * s.r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}

/** Approximate hit volumes of a monster (local offsets rotated by its yaw). */
export function hitSpheres(m: Monster) {
  const local: [number, number, number, number, boolean][] =
    m.type === 'stalker'
      ? [
          [0, 1.05, 0, 0.36, false],
          [0, 1.65, -0.1, 0.36, false],
          [0, 2.3, -0.32, 0.24, true],
        ]
      : m.type === 'crawler'
        ? [
            [0, 0.45, 0.2, 0.38, false],
            [0, 0.5, -0.35, 0.34, false],
            [0, 0.55, -0.85, 0.22, true],
          ]
        : [
            [0, 1.0, 0, 0.33, false],
            [0, 1.5, 0, 0.32, false],
            [0, 2.02, -0.05, 0.2, true],
          ];
  const c = Math.cos(m.yaw);
  const s = Math.sin(m.yaw);
  return local.map(([x, y, z, r, head]) => ({ x: m.x + x * c + z * s, y, z: m.z - x * s + z * c, r, head }));
}

export { SYMBOLS };
