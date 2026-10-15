// The game simulation. Pure logic: movement and collisions, interactions, missions,
// power, scripted events, the enemy and endings. It knows nothing about WebGL or
// the DOM; the renderer, audio and UI read its state and listen to its events.
import { clamp, dist2d, forward, Rng, wrapAngle } from '../engine/math';
import { Box, DOOR, Level, pushOut, propBox } from '../world/level';
import { CAMERAS, CELL, CONSUMERS, DOORS, H, ITEM_NAMES, LIGHTS, PICKUPS, PROPS, ZONE_NAMES, type Consumer, type DoorDef, type ItemId, type LightDef, type PickupDef, type PropDef, type ZoneId } from '../world/map';
import { Enemy, type EnemyHost } from './enemy';
import type { GameState } from './state';
import { CLOCK_0317, DOC_BY_ID, LINES, MISSIONS, type EndingId, type Line } from './story';

export type SimEvent =
  | { type: 'say'; lines: Line[] }
  | { type: 'message'; text: string; tone?: 'info' | 'deny' | 'good' }
  | { type: 'pickup'; text: string }
  | { type: 'doc'; id: string }
  | { type: 'mission'; index: number }
  | { type: 'ui'; screen: 'terminal' | 'cctv' | 'panel' | 'keypad' | 'radio' | 'chamber' | 'map'; ref?: string }
  | { type: 'sfx'; name: string; x?: number; y?: number; z?: number; vol?: number }
  | { type: 'death' }
  | { type: 'ending'; id: EndingId }
  | { type: 'checkpoint' }
  | { type: 'power' }
  | { type: 'scare'; kind: string };

export interface Controls {
  fwd: number;
  side: number;
  sprint: boolean;
  crouch: boolean;
}

export interface Interactable {
  id: string;
  box: Box;
  label: () => string | null;
  act: () => void;
}

export interface Apparition {
  x: number;
  z: number;
  yaw: number;
  until: number;
  cameraOnly: boolean;
  camera?: number;
}

const EYE = 1.62;
const EYE_CROUCH = 1.05;
const RADIUS = 0.3;

export class Sim implements EnemyHost {
  level = new Level();
  time = 0;
  listeners: ((e: SimEvent) => void)[] = [];
  rng: Rng;
  enemy: Enemy;
  // player runtime
  player = { x: 0, z: 0, yaw: 0, pitch: 0, hidden: false, crouch: false, sprinting: false, lockerX: 0, lockerZ: 0, lockerId: '' };
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
  /** 0..1 open amount per door (animated) */
  doorAnim: Record<string, number> = {};
  liftOpen = 0;
  /** CCTV session */
  cctv: { cam: number; viewT: number } | null = null;
  apparitions: Apparition[] = [];
  /** light ids that are forced off until a time (scripted flicker) */
  lightOverride = new Map<number, number>();
  signOverride: { id: string; text: string; until: number } | null = null;
  /** final countdown */
  final: { kind: 'lift' | 'tx' | 'stop'; t: number; need: number; zone: ZoneId; done: boolean } | null = null;
  zone: ZoneId | null = null;
  visited = new Set<ZoneId>();
  timers: { at: number; fn: () => void }[] = [];
  litCells = new Float32Array(0);
  fear = 0;
  enemyDist = 99;
  charging = 0;
  tensionT = 25;
  private scheduledOutage = false;

  constructor(public state: GameState) {
    this.rng = new Rng(state.seed);
    this.enemy = new Enemy(new Rng(state.seed ^ 0x5eed));
    this.player.x = state.player.x;
    this.player.z = state.player.z;
    this.player.yaw = state.player.yaw;
    this.player.pitch = state.player.pitch;
    for (const d of DOORS) this.doorAnim[d.id] = state.doors[d.id].open ? 1 : 0;
    this.buildInteractables();
    this.computeLit();
    this.zone = this.level.zoneAt(this.player.x, this.player.z);
    if (this.zone) this.visited.add(this.zone);
    // a save taken during the final sequence resumes before it
    if (state.mission >= 7 && this.has('truth')) this.enemy.hiddenFor = 8;
  }

  emit(e: SimEvent) {
    for (const l of this.listeners) l(e);
  }
  say(key: string) {
    const lines = LINES[key];
    if (lines) this.emit({ type: 'say', lines });
  }
  msg(text: string, tone: 'info' | 'deny' | 'good' = 'info') {
    this.emit({ type: 'message', text, tone });
  }
  sfx(name: string, x?: number, z?: number, vol = 1, y = 1.2) {
    this.emit({ type: 'sfx', name, x, z, y, vol });
  }
  later(sec: number, fn: () => void) {
    this.timers.push({ at: this.time + sec, fn });
  }

  // ------------------------------------------------------------------ flags & items
  has(flag: string) {
    return this.state.flags.includes(flag);
  }
  setFlag(flag: string) {
    if (!this.has(flag)) this.state.flags.push(flag);
  }
  hasItem(i: ItemId) {
    return this.state.inventory.includes(i);
  }
  fired(id: string) {
    return this.state.events.includes(id);
  }
  fire(id: string) {
    if (this.fired(id)) return false;
    this.state.events.push(id);
    return true;
  }
  get batteries() {
    return this.state.inventory.filter((i) => i.startsWith('battery')).length;
  }

  // ------------------------------------------------------------------ power
  get capacity() {
    return this.state.power.main ? 7 : 2;
  }
  get used() {
    return CONSUMERS.filter((c) => this.state.power.on.includes(c.id)).reduce((s, c) => s + c.cost, 0);
  }
  powered(c: Consumer) {
    return this.state.power.on.includes(c);
  }
  setConsumer(id: Consumer, on: boolean): boolean {
    const p = this.state.power;
    if (on === p.on.includes(id)) return true;
    if (on) {
      const cost = CONSUMERS.find((c) => c.id === id)!.cost;
      if (this.used + cost > this.capacity) {
        this.msg('Za mało mocy. Najpierw wyłącz inny obwód.', 'deny');
        this.sfx('deny');
        return false;
      }
      p.on.push(id);
      this.sfx('relayOn');
    } else {
      p.on = p.on.filter((c) => c !== id);
      this.sfx('relayOff');
    }
    if (id === 'cameras' && !on && this.cctv) this.cctv = null;
    this.computeLit();
    this.emit({ type: 'power' });
    return true;
  }
  lightActive(l: LightDef, i: number) {
    if (l.circuit && !this.powered(l.circuit)) return false;
    const o = this.lightOverride.get(i);
    if (o !== undefined && o > this.time) return false;
    return true;
  }
  /** Brightness of the fixed lighting around a point (fluorescent fixtures only). */
  lit(x: number, z: number) {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    if (!this.level.inside(cx, cz)) return 0;
    return this.litCells[this.level.idx(cx, cz)] ?? 0;
  }
  computeLit() {
    const L = this.level;
    const out = new Float32Array(L.grid.length);
    LIGHTS.forEach((l, i) => {
      if (l.kind === 'red' || l.kind === 'screen') return;
      if (!this.lightActive(l, i)) return;
      const strength = l.kind === 'lamp' ? 0.6 : 1;
      for (let dz = -3; dz <= 3; dz++)
        for (let dx = -3; dx <= 3; dx++) {
          const cx = Math.floor(l.x / CELL) + dx;
          const cz = Math.floor(l.z / CELL) + dz;
          if (!L.inside(cx, cz) || L.isSolid(cx, cz)) continue;
          const [px, pz] = L.cellCenter(cx, cz);
          const d = dist2d(px, pz, l.x, l.z);
          const v = strength * clamp(1 - d / (l.range * 0.55), 0, 1);
          if (v > 0 && L.lineClear(l.x, l.z, px, pz, (ax, az) => this.closedDoorAt(ax, az))) out[L.idx(cx, cz)] = Math.max(out[L.idx(cx, cz)], v);
        }
    });
    this.litCells = out;
  }

  // ------------------------------------------------------------------ doors
  doorDef(id: string) {
    return DOORS.find((d) => d.id === id)!;
  }
  doorOpen(d: DoorDef) {
    return this.state.doors[d.id].open;
  }
  closedDoorAt(cx: number, cz: number) {
    const d = this.level.doorAtCell(cx, cz);
    return !!d && (this.doorAnim[d.id] ?? 0) < 0.8;
  }
  doorPowered(d: DoorDef) {
    return !d.power || d.power.every((c) => this.powered(c));
  }
  /** Can Przestój pass this door (opening it if needed)? */
  doorPassable(d: DoorDef) {
    const s = this.state.doors[d.id];
    if (s.open) return true;
    if (d.external || d.secret) return false;
    return s.unlocked && this.doorPowered(d);
  }
  openDoor(d: DoorDef) {
    this.setDoor(d.id, true, true);
  }
  setDoor(id: string, open: boolean, byEnemy = false) {
    const s = this.state.doors[id];
    if (s.open === open) return;
    s.open = open;
    const d = this.doorDef(id);
    const [x, z] = this.level.cellCenter(d.cx, d.cz);
    this.sfx(d.secret ? 'shelfSlide' : byEnemy ? 'doorForce' : open ? 'doorOpen' : 'doorClose', x, z);
    if (!byEnemy) this.enemy.hear(x, z, 9);
    this.later(0.9, () => this.computeLit());
  }

  useDoor(d: DoorDef) {
    const s = this.state.doors[d.id];
    const [x, z] = this.level.cellCenter(d.cx, d.cz);
    if (d.external) {
      this.msg('Drzwi zewnętrzne. Zamek czasowy: otwarcie o 06:00.', 'deny');
      this.sfx('deny', x, z);
      return;
    }
    if (!this.doorPowered(d)) {
      const missing = d.power!.filter((c) => !this.powered(c)).map((c) => CONSUMERS.find((k) => k.id === c)!.name);
      this.msg(`Brak zasilania: ${missing.join(', ')}.`, 'deny');
      this.sfx('deny', x, z);
      return;
    }
    if (!s.unlocked) {
      if (d.flag && !this.has(d.flag)) {
        this.msg(d.flagMsg ?? 'Zamknięte.', 'deny');
        this.sfx('deny', x, z);
        return;
      }
      if (d.oneWay) {
        const side = Math.sign((d.axis === 'x' ? this.player.x - x : this.player.z - z) || 1);
        if (side !== d.oneWay) {
          this.msg('Zablokowane od drugiej strony.', 'deny');
          this.sfx('deny', x, z);
          return;
        }
        s.unlocked = true;
        this.msg('Zasuwa odblokowana. Masz nowy skrót.', 'good');
      } else if (d.card) {
        if (!this.hasItem('card3')) {
          this.msg('Czytnik: wymagana karta poziomu 3.', 'deny');
          this.sfx('deny', x, z);
          return;
        }
        s.unlocked = true;
        this.sfx('card', x, z);
      } else if (d.code) {
        this.emit({ type: 'ui', screen: 'keypad', ref: d.id });
        return;
      } else s.unlocked = true;
    }
    this.setDoor(d.id, !s.open);
  }

  /** Called by the keypad UI. */
  enterCode(doorId: string, code: string): boolean {
    const d = this.doorDef(doorId);
    const [x, z] = this.level.cellCenter(d.cx, d.cz);
    this.enemy.hear(x, z, 5);
    if (code === d.code) {
      this.state.doors[d.id].unlocked = true;
      this.sfx('codeOk', x, z);
      this.setDoor(d.id, true);
      if (d.id === 'as') this.msg('Regał odsuwa się na prowadnicach.', 'good');
      return true;
    }
    this.sfx('codeBad', x, z);
    return false;
  }

  // ------------------------------------------------------------------ interactables
  buildInteractables() {
    const list: Interactable[] = [];
    const L = this.level;
    // doors
    for (const d of DOORS) {
      const [x, z] = L.cellCenter(d.cx, d.cz);
      const half = d.axis === 'x' ? [0.35, 1] : [1, 0.35];
      list.push({
        id: `door:${d.id}`,
        box: { x0: x - half[0], x1: x + half[0], z0: z - half[1], z1: z + half[1], y0: 0, y1: 2.5 },
        label: () => {
          const s = this.state.doors[d.id];
          if (d.secret && !s.open) return this.has('knowsRoom0') ? 'Szukaj zamka za regałem' : 'Przyjrzyj się regałowi';
          if (d.secret) return null;
          if (d.external) return `${d.name}`;
          const verb = s.open ? 'Zamknij' : 'Otwórz';
          const lock = !s.unlocked ? (d.card ? ' [karta]' : d.code ? ' [kod]' : d.oneWay ? ' [zasuwa]' : ' [zablokowane]') : !this.doorPowered(d) ? ' [brak zasilania]' : '';
          return `${verb}: ${d.name}${lock}`;
        },
        act: () => this.useDoor(d),
      });
    }
    // props
    for (const p of PROPS) {
      if (!p.id) continue;
      const box = propBox(p);
      const pad = { ...box, x0: box.x0 - 0.05, x1: box.x1 + 0.05, z0: box.z0 - 0.05, z1: box.z1 + 0.05, y1: Math.max(box.y1, 1.2) };
      const it = this.propInteraction(p, pad);
      if (it) list.push(it);
    }
    // pickups
    for (const pk of PICKUPS) {
      list.push({
        id: `pick:${pk.id}`,
        box: { x0: pk.x - 0.25, x1: pk.x + 0.25, z0: pk.z - 0.25, z1: pk.z + 0.25, y0: pk.y - 0.15, y1: pk.y + 0.25 },
        label: () => (this.pickupAvailable(pk) ? (pk.kind === 'doc' ? `Czytaj: ${DOC_BY_ID[pk.ref].title}` : `Weź: ${ITEM_NAMES[pk.ref as ItemId]}`) : null),
        act: () => this.takePickup(pk),
      });
    }
    this.interactables = list;
  }

  pickupAvailable(pk: PickupDef) {
    if (this.state.pickedUp.includes(pk.id)) return false;
    if (pk.inside && !this.state.opened.includes(pk.inside)) return false;
    return true;
  }

  takePickup(pk: PickupDef) {
    if (!this.pickupAvailable(pk)) return;
    this.state.pickedUp.push(pk.id);
    this.enemy.hear(pk.x, pk.z, 3);
    if (pk.kind === 'doc') {
      this.readDoc(pk.ref);
      return;
    }
    const item = pk.ref as ItemId;
    this.state.inventory.push(item);
    this.sfx('pickup', pk.x, pk.z);
    this.emit({ type: 'pickup', text: ITEM_NAMES[item] });
    if ((item === 'fuseA' || item === 'fuseB') && this.fire('firstFuse')) this.later(1.5, () => this.say('firstFuse'));
    if (item === 'tape' || item === 'key') this.checkpoint();
  }

  readDoc(id: string) {
    if (!this.state.docs.includes(id)) this.state.docs.push(id);
    this.sfx('paper');
    this.emit({ type: 'doc', id });
    if (id === 'd11' || id === 'd12') this.setFlag('knowsKey');
  }

  propInteraction(p: PropDef, box: Box): Interactable | null {
    const id = p.id!;
    const mk = (label: () => string | null, act: () => void): Interactable => ({ id: `prop:${id}`, box, label, act });
    if (id.startsWith('locker')) {
      return mk(
        () => (this.player.hidden ? 'Wyjdź z szafki' : 'Schowaj się w szafce'),
        () => this.toggleLocker(p),
      );
    }
    switch (id) {
      case 'term_reception':
        return mk(
          () => (this.has('loggedIn') ? 'Terminal recepcji' : 'Zaloguj się w terminalu'),
          () => this.emit({ type: 'ui', screen: 'terminal', ref: 'reception' }),
        );
      case 'term_lab':
        return mk(() => 'Terminal laboratorium', () => this.emit({ type: 'ui', screen: 'terminal', ref: 'lab' }));
      case 'cctv':
        return mk(
          () => 'Konsola monitoringu',
          () => {
            if (!this.powered('cameras')) {
              this.msg('Konsola martwa. Monitoring nie ma zasilania.', 'deny');
              this.sfx('deny');
              return;
            }
            this.cctv = { cam: this.cctv?.cam ?? 0, viewT: 0 };
            this.sfx('cctvOn');
            this.emit({ type: 'ui', screen: 'cctv' });
          },
        );
      case 'radio':
        return mk(() => 'Konsola radiowa', () => this.emit({ type: 'ui', screen: 'radio' }));
      case 'charger':
        return mk(
          () => (this.batteries > 0 || this.state.battery < 0.999 ? 'Naładuj latarkę' : 'Ładowarka (latarka pełna)'),
          () => {
            if (!this.powered('cameras')) {
              this.msg('Ładowarka wisi na obwodzie monitoringu. Brak zasilania.', 'deny');
              this.sfx('deny');
              return;
            }
            this.charging = 3.5;
            this.sfx('charge', p.x, p.z);
          },
        );
      case 'cab_lab':
      case 'drawer_archive':
        return mk(
          () => (this.state.opened.includes(id) ? null : id === 'cab_lab' ? 'Otwórz szafkę' : 'Otwórz szufladę'),
          () => {
            this.state.opened.push(id);
            this.sfx(id === 'cab_lab' ? 'cabinet' : 'drawer', p.x, p.z);
            this.enemy.hear(p.x, p.z, 5);
          },
        );
      case 'panel':
        return mk(() => 'Panel zasilania', () => this.emit({ type: 'ui', screen: 'panel' }));
      case 'switch_emergency':
        return mk(
          () => (this.has('emergencyUnlocked') ? 'Przełącznik awaryjny (zwolniony)' : 'Przełącznik awaryjny'),
          () => this.useEmergencySwitch(p),
        );
      case 'lift':
        return mk(() => this.liftLabel(), () => this.useLift());
      case 'term_chamber':
        return mk(() => 'Terminal testowy K-1', () => this.emit({ type: 'ui', screen: 'chamber' }));
      case 'board_reception':
        return mk(
          () => 'Plan ewakuacyjny',
          () => {
            this.setFlag('hasMap');
            this.emit({ type: 'ui', screen: 'map' });
          },
        );
      case 'generator':
        return mk(
          () => 'Generator',
          () => this.msg(this.state.power.main ? 'Generator pracuje równo. Moc: 7 jednostek.' : 'Generator na rezerwie. Moc: 2 jednostki.'),
        );
      case 'rig':
        return mk(
          () => 'Rejestrator komory',
          () => this.msg('Membrany rejestratora drżą, choć w komorze panuje cisza.'),
        );
      default:
        return null;
    }
  }

  liftLabel() {
    if (this.final?.kind === 'lift') return this.final.done ? 'Wsiądź do windy' : 'Winda w drodze…';
    return 'Przywołaj windę ewakuacyjną';
  }

  // ------------------------------------------------------------------ actions
  toggleLocker(p: PropDef) {
    const pl = this.player;
    if (pl.hidden) {
      pl.hidden = false;
      const yaw = (p.rot * Math.PI) / 2;
      const f = forward(yaw, 0);
      pl.x = p.x + f[0] * 0.85;
      pl.z = p.z + f[2] * 0.85;
      this.sfx('lockerOut', p.x, p.z);
      this.enemy.hear(p.x, p.z, 4);
      return;
    }
    pl.hidden = true;
    pl.lockerId = p.id!;
    pl.lockerX = p.x;
    pl.lockerZ = p.z;
    pl.x = p.x;
    pl.z = p.z;
    pl.yaw = (p.rot * Math.PI) / 2;
    pl.pitch = 0;
    this.vx = this.vz = 0;
    this.sfx('lockerIn', p.x, p.z);
    this.enemy.playerHid(this);
  }

  useEmergencySwitch(p: PropDef) {
    if (this.has('emergencyUnlocked')) {
      this.msg('Blokada ewakuacyjna jest zwolniona.');
      return;
    }
    if (!this.has('truth')) {
      this.msg('Przełącznik zaplombowany. Komunikat: „Zwolnienie wyłącznie na polecenie NADZORCY”.', 'deny');
      this.sfx('deny', p.x, p.z);
      return;
    }
    this.setFlag('emergencyUnlocked');
    for (const id of ['ec', 'pe']) this.state.doors[id].unlocked = true;
    this.sfx('lever', p.x, p.z);
    this.sfx('alarm', 48, 32, 0.7);
    this.enemy.hear(p.x, p.z, 14);
    this.msg('Strefa ewakuacyjna odblokowana. Winda potrzebuje 3 jednostek mocy.', 'good');
    this.checkpoint();
  }

  useLift() {
    if (this.final?.kind === 'lift') {
      if (this.final.done) this.finish('ewakuacja');
      else this.msg('Winda jeszcze jedzie. Nie odchodź.', 'deny');
      return;
    }
    if (!this.powered('evac')) {
      this.msg('Panel windy jest ciemny. Winda ewakuacyjna wymaga 3 jednostek mocy.', 'deny');
      this.sfx('deny', 53, 32);
      return;
    }
    if (this.final) {
      this.msg('Najpierw dokończ to, co zacząłeś.', 'deny');
      return;
    }
    this.startFinal('lift', 40, 'awaryjna');
    this.say('liftCalled');
    this.sfx('liftCall', 53, 32);
  }

  /** Radio console: transmission of the evidence. */
  canTransmit() {
    return this.hasItem('tape') && this.powered('transmitter') && this.has('truth') && !this.final;
  }
  transmit() {
    if (!this.canTransmit()) return false;
    this.startFinal('tx', 45, 'monitoring');
    this.say('transmit');
    this.sfx('txStart', 11.6, 16.6);
    return true;
  }

  /** Chamber terminal actions. */
  chamberRead() {
    if (this.state.mission < 6) return;
    if (this.fire('truthRead')) {
      this.setFlag('truth');
      this.setFlag('knowsRoom0');
      if (!this.state.docs.includes('d08')) this.state.docs.push('d08');
      this.later(0.5, () => this.lockdown());
    }
  }
  canStop() {
    return this.hasItem('key') && this.powered('sector_c') && this.has('truth') && !this.final;
  }
  stopContinuity() {
    if (!this.canStop()) return false;
    this.startFinal('stop', 25, 'komora');
    this.say('stopLoop');
    this.sfx('keyTurn', 67.5, 24.6);
    return true;
  }
  runTest() {
    if (this.state.mission < 6 || this.final) return false;
    this.sfx('testStart', 70, 21);
    this.finish('test');
    return true;
  }

  insertFuses() {
    const fuses = this.state.inventory.filter((i) => i === 'fuseA' || i === 'fuseB');
    if (!fuses.length) return 0;
    this.state.inventory = this.state.inventory.filter((i) => i !== 'fuseA' && i !== 'fuseB');
    this.state.power.fuses = Math.min(2, this.state.power.fuses + fuses.length);
    this.sfx('fuse', 35.6, 28.5);
    this.enemy.hear(35.6, 28.5, 8);
    return fuses.length;
  }
  switchMain() {
    if (this.state.power.fuses < 2 || this.state.power.main) return false;
    this.state.power.main = true;
    this.sfx('powerUp');
    this.computeLit();
    this.emit({ type: 'power' });
    return true;
  }

  serviceDoorRelease() {
    if (this.has('serviceUnlocked')) return false;
    if (!this.powered('doors')) {
      this.msg('Brak zasilania zamków elektrycznych.', 'deny');
      return false;
    }
    this.setFlag('serviceUnlocked');
    this.state.doors.mv.unlocked = true;
    this.sfx('relayOn', 14, 22);
    this.msg('Drzwi serwisowe monitoringu zwolnione — masz skrót do korytarza.', 'good');
    return true;
  }

  login() {
    if (this.has('loggedIn')) return;
    this.setFlag('loggedIn');
    this.state.doors.rm.unlocked = true;
    if (!this.state.docs.includes('d01')) this.state.docs.push('d01');
    this.sfx('beep', 11.2, 30.5);
    this.say('loggedIn');
    this.advance(1);
  }

  useBattery() {
    const i = this.state.inventory.findIndex((x) => x.startsWith('battery'));
    if (i < 0) {
      this.msg('Nie masz zapasowego akumulatora.', 'deny');
      return;
    }
    if (this.state.battery > 0.95) {
      this.msg('Latarka jest naładowana.');
      return;
    }
    this.state.inventory.splice(i, 1);
    this.state.battery = 1;
    this.sfx('battery');
    this.msg('Akumulator wymieniony.', 'good');
  }

  toggleFlashlight() {
    if (this.player.hidden) return;
    if (!this.flashlight && this.state.battery <= 0.005) {
      this.msg('Latarka: akumulator wyczerpany. R — wymiana.', 'deny');
      this.sfx('clickDead');
      return;
    }
    this.flashlight = !this.flashlight;
    this.sfx('flashlight');
  }

  interact() {
    if (this.dead || this.ended) return;
    if (this.player.hidden) {
      const p = PROPS.find((x) => x.id === this.player.lockerId);
      if (p) this.toggleLocker(p);
      return;
    }
    const f = this.focus;
    if (f && f.label()) f.act();
  }

  look(dx: number, dy: number) {
    const p = this.player;
    if (p.hidden) {
      // a little peeking through the slats
      const base = PROPS.find((x) => x.id === p.lockerId);
      const by = base ? (base.rot * Math.PI) / 2 : p.yaw;
      p.yaw = by + clamp(wrapAngle(p.yaw + dx - by), -0.35, 0.35);
      p.pitch = clamp(p.pitch + dy, -0.25, 0.2);
      return;
    }
    p.yaw = wrapAngle(p.yaw + dx);
    p.pitch = clamp(p.pitch + dy, -1.45, 1.45);
  }

  // ------------------------------------------------------------------ missions
  advance(to: number) {
    if (this.state.mission >= to) return;
    this.state.mission = to;
    this.emit({ type: 'mission', index: to });
    this.checkpoint();
  }
  objective(): string {
    const m = MISSIONS[Math.min(this.state.mission, MISSIONS.length - 1)];
    if (this.final) {
      const pct = Math.floor((this.final.t / this.final.need) * 100);
      if (this.final.kind === 'lift') return this.final.done ? 'Winda przyjechała — wsiądź!' : `Przetrwaj w strefie ewakuacyjnej, aż przyjedzie winda (${pct}%).`;
      if (this.final.kind === 'tx') return `Transmisja nagrania (${pct}%). Zostań w pokoju monitoringu.`;
      return `Wyłączanie ciągłości (${pct}%). Nie wychodź z komory.`;
    }
    let text = m.objective;
    if (m.id === 'kamery') text = text.replace('{n}', String(this.state.camerasSeen.length));
    if (m.id === 'bezpieczniki') text = text.replace('{n}', String(this.state.power.fuses + this.state.inventory.filter((i) => i === 'fuseA' || i === 'fuseB').length));
    return text;
  }
  /** Sub-goals of the final decision, for the tablet. */
  decisionGoals() {
    return [
      {
        title: 'Ucieczka — winda ewakuacyjna',
        steps: [
          { text: 'Zwolnij blokadę przełącznikiem w technice', done: this.has('emergencyUnlocked') },
          { text: 'Zasil windę (3 jednostki)', done: this.powered('evac') },
          { text: 'Przywołaj windę i przetrwaj do jej przyjazdu', done: false },
        ],
      },
      {
        title: 'Prawda — nadajnik',
        steps: [
          { text: 'Zabierz taśmę z Pokoju 0 (regał w archiwum, kod: godzina)', done: this.hasItem('tape') },
          { text: 'Zasil nadajnik (2 jednostki)', done: this.powered('transmitter') },
          { text: 'Nadaj nagranie z konsoli radiowej w monitoringu', done: false },
        ],
      },
      {
        title: 'Cisza — klucz ciągłości',
        steps: [
          { text: 'Zabierz klucz z Pokoju 0', done: this.hasItem('key') },
          { text: 'Zasil Sektor C (2 jednostki)', done: this.powered('sector_c') },
          { text: 'Przekręć klucz w terminalu komory i zostań w środku', done: false },
        ],
      },
    ];
  }

  checkMissions() {
    const st = this.state;
    if (st.mission === 1 && st.camerasSeen.length >= 6 && !this.scheduledOutage && !this.fired('outage')) {
      this.scheduledOutage = true;
      this.later(3.5, () => this.outage());
    }
    if (st.mission === 2 && this.zone === 'techniczne') {
      this.advance(3);
      if (this.fire('panelLines')) this.say('panel');
    }
    if (st.mission === 3 && st.power.fuses >= 2) this.advance(4);
    if (st.mission === 4 && st.power.main) {
      this.advance(5);
      if (this.fire('powerOnLines')) this.say('powerOn');
    }
    if (st.mission === 5 && this.zone === 'sektorc') {
      this.advance(6);
      if (this.fire('sectorLines')) this.say('sectorC');
    }
    if (st.mission === 6 && this.has('truth')) this.advance(7);
  }

  outage() {
    if (!this.fire('outage')) return;
    const p = this.state.power;
    p.main = false;
    p.on = ['lights_rooms', 'doors'];
    this.cctv = null;
    this.sfx('powerDown');
    this.sfx('bang', 50, 22, 0.8);
    this.computeLit();
    this.emit({ type: 'power' });
    this.emit({ type: 'scare', kind: 'outage' });
    this.say('outage');
    this.advance(2);
    this.later(6, () => this.msg('Latarka: F. Zapasowe akumulatory: R.'));
  }

  lockdown() {
    this.say('truth');
    // NADZORCA cuts the corridor lights to herd the technician back to the chamber
    if (this.powered('lights_corridor')) this.setConsumer('lights_corridor', false);
    this.sfx('alarm', undefined, undefined, 0.6);
    this.emit({ type: 'scare', kind: 'lockdown' });
    this.later(70, () => this.fire('ewaLate') && this.say('ewaLate'));
    this.enemy.summon(this);
  }

  startFinal(kind: 'lift' | 'tx' | 'stop', need: number, zone: ZoneId) {
    this.final = { kind, t: 0, need, zone, done: false };
    this.state.clock = Math.max(this.state.clock, CLOCK_0317 - 2);
    this.enemy.summon(this);
    this.emit({ type: 'scare', kind: 'final' });
  }

  finish(id: EndingId) {
    if (this.ended) return;
    this.ended = id;
    this.state.clock = CLOCK_0317;
    this.emit({ type: 'ending', id });
  }

  checkpoint() {
    if (this.enemy.hunting || this.dead || this.final) return;
    this.emit({ type: 'checkpoint' });
  }

  /** Serialize runtime position into the state (before saving). */
  syncState() {
    const s = this.state;
    s.player = { x: this.player.x, z: this.player.z, yaw: this.player.yaw, pitch: this.player.pitch };
  }
  canSave() {
    return !this.enemy.hunting && !this.dead && !this.final && !this.player.hidden && !this.ended;
  }

  // ------------------------------------------------------------------ enemy host
  phase() {
    const m = this.state.mission;
    if (this.final) return 3;
    if (m >= 7 || this.has('truth')) return 2;
    if (m >= 3 && this.fired('enemyIntro')) return 1;
    return 0;
  }
  flashlightOn() {
    return this.flashlight;
  }
  get propBoxes() {
    return this.level.propBoxes.map((p) => p.box);
  }
  enemySfx(name: string, x: number, z: number) {
    this.sfx(name, x, z, 1, name === 'ventRattle' || name === 'ventExit' || name === 'ventEnter' ? 2.9 : 1.4);
  }
  onChaseStart() {
    if (this.fire('firstChase')) this.later(1.2, () => this.say('przestoj'));
    this.emit({ type: 'scare', kind: 'chase' });
  }
  onBurn() {
    this.state.battery = Math.max(0, this.state.battery - 0.1);
    this.msg('Cofnął się przed światłem.', 'good');
  }
  catchPlayer() {
    if (this.dead || this.ended) return;
    this.dead = true;
    this.state.deaths++;
    this.flashlight = false;
    this.sfx('caught');
    this.emit({ type: 'death' });
  }

  // ------------------------------------------------------------------ scripted events
  runEvents(dt: number) {
    const st = this.state;
    const p = this.player;
    if (this.time > 1.5 && this.fire('welcome')) this.say('welcome');
    // the figure on camera 4 / the room on camera 6
    if (this.cctv) {
      const cam = CAMERAS[this.cctv.cam];
      if (cam.id === 4 && st.mission === 1 && this.cctv.viewT > 0.6 && this.fire('cam4')) {
        const variant = this.rng.next() < 0.5 ? 34 : 44;
        this.apparitions.push({ x: variant, z: 21.2, yaw: Math.PI / 2, until: this.time + 3.2, cameraOnly: true, camera: 4 });
        this.sfx('stingSoft');
        this.later(1.5, () => this.say('cam4'));
      }
      if (cam.id === 6 && this.cctv.viewT > 0.8 && this.fire('cam6')) this.later(0.5, () => this.say('cam6'));
    }
    // a silhouette at the end of the corridor on the way to the technical room
    if (st.mission === 2 && this.zone === 'korytarz' && p.x > 20 && p.z < 24 && this.fire('silhouette')) {
      const far = this.rng.next() < 0.5 ? 54 : 50;
      this.apparitions.push({ x: far, z: 22, yaw: Math.PI / 2, until: this.time + 2.4, cameraOnly: false });
      this.sfx('stingLow', far, 22, 0.7);
    }
    // the lab door slams behind the player
    if (st.mission >= 2 && st.mission <= 4 && this.zone === 'laboratorium' && p.z < 16 && this.fire('labSlam')) {
      this.later(0.8, () => {
        this.setDoor('lc', false);
        this.sfx('slam', 25, 19);
        LIGHTS.forEach((l, i) => {
          if (l.x > 20 && l.x < 32 && l.z > 8 && l.z < 18) this.lightOverride.set(i, this.time + 5);
        });
        this.computeLit();
        this.later(5.2, () => this.computeLit());
        this.emit({ type: 'scare', kind: 'slam' });
      });
    }
    // first appearance of Przestój: it crosses the corridor far ahead, then disappears into a vent
    if (st.mission >= 3 && !this.fired('enemyIntro') && !this.enemy.visible && this.zone === 'korytarz' && p.x > 30 && p.x < 48) {
      this.fire('enemyIntro');
      const left = p.x > 39;
      const route: [number, number][] = left
        ? [
            [p.x - 16 < 18 ? 18 : p.x - 16, 23],
            [p.x - 16 < 18 ? 18 : p.x - 16, 21],
            [19, 21],
          ]
        : [
            [Math.min(54, p.x + 16), 21],
            [Math.min(54, p.x + 16), 23],
            [41, 23],
          ];
      this.enemy.playScript(route);
      this.sfx('stingLow', route[0][0], route[0][1], 0.8);
    }
    // a corridor sign lies for a moment when you are not looking
    if (st.mission >= 3 && this.zone === 'korytarz' && Math.abs(p.x - 41) < 3 && p.z < 24 && !this.fired('signLie')) {
      const f = forward(p.yaw, 0);
      if (f[0] > 0.4 && this.fire('signLie')) {
        this.signOverride = { id: 'ac', text: 'POKÓJ 0', until: this.time + 7 };
        this.later(0.3, () => this.sfx('flickerBuzz', 41, 19, 0.5));
      }
    }
    if (this.zone === 'pokoj0' && this.fire('room0')) this.say('roomSeen');
    // ambient tension director
    if (this.phase() >= 1 && !this.enemy.hunting && !this.final) {
      this.tensionT -= dt;
      if (this.tensionT <= 0) {
        this.tensionT = this.rng.range(28, 60);
        const r = this.rng.next();
        const a = this.rng.range(0, Math.PI * 2);
        const sx = p.x + Math.cos(a) * 14;
        const sz = p.z + Math.sin(a) * 14;
        if (r < 0.3) this.sfx('distantBang', sx, sz, 0.6);
        else if (r < 0.55) this.sfx('ventKnock', sx, sz, 0.7, 2.9);
        else if (r < 0.75) this.flickerNear(p.x, p.z, 1.4);
        else this.sfx('whisperStatic', sx, sz, 0.5);
      }
    }
  }

  flickerNear(x: number, z: number, dur: number) {
    LIGHTS.forEach((l, i) => {
      if (dist2d(l.x, l.z, x, z) < 9 && l.kind === 'fluo') this.lightOverride.set(i, this.time + dur * (0.5 + Math.random() * 0.5));
    });
    this.computeLit();
    this.later(dur + 0.1, () => this.computeLit());
    this.sfx('flickerBuzz', x, z, 0.6);
  }

  // ------------------------------------------------------------------ main update
  update(dt: number, c: Controls) {
    if (this.dead || this.ended) {
      this.time += dt;
      this.doorsAnim(dt);
      return;
    }
    this.time += dt;
    this.state.playTime += dt;
    const st = this.state;

    // timers
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      this.timers = this.timers.filter((t) => t.at > this.time);
      for (const t of due) t.fn();
    }

    this.movePlayer(dt, c);
    this.doorsAnim(dt);

    // zone tracking
    const z = this.level.zoneAt(this.player.x, this.player.z);
    if (z && z !== this.zone) {
      this.zone = z;
      if (!this.visited.has(z)) this.visited.add(z);
    }

    // flashlight battery
    if (this.flashlight) {
      st.battery = Math.max(0, st.battery - dt / 260);
      if (st.battery <= 0) {
        this.flashlight = false;
        this.sfx('clickDead');
        this.msg('Akumulator latarki wyczerpany.', 'deny');
      }
    }
    if (this.charging > 0) {
      const d = dist2d(this.player.x, this.player.z, 13.6, 22.5);
      if (d > 2.2 || !this.powered('cameras')) this.charging = 0;
      else {
        this.charging -= dt;
        st.battery = Math.min(1, st.battery + dt / 3.5);
        if (this.charging <= 0) this.msg('Latarka naładowana.', 'good');
      }
    }

    // CCTV time counting
    if (this.cctv) {
      if (!this.powered('cameras')) this.cctv = null;
      else {
        this.cctv.viewT += dt;
        const id = CAMERAS[this.cctv.cam].id;
        if (this.cctv.viewT > 1.2 && !st.camerasSeen.includes(id)) {
          st.camerasSeen.push(id);
          this.sfx('beep');
        }
      }
    }

    // clock
    const m = MISSIONS[Math.min(st.mission, MISSIONS.length - 1)];
    const next = MISSIONS[st.mission + 1]?.clock ?? CLOCK_0317 - 3;
    if (st.clock < m.clock) st.clock = m.clock;
    else if (st.clock < next - 1) st.clock = Math.min(next - 1, st.clock + dt / 9);

    // enemy
    const e = this.enemy;
    e.update(dt, this);
    this.enemyDist = e.visible ? dist2d(e.x, e.z, this.player.x, this.player.z) : 99;
    const target = e.hunting ? 1 : e.visible ? clamp(1 - this.enemyDist / 18, 0, 0.75) : this.final ? 0.35 : 0;
    this.fear += (target - this.fear) * Math.min(1, dt * 1.5);
    // lights falter when it is near
    if (e.visible && this.enemyDist < 14 && Math.random() < dt * 1.2) this.flickerNear(e.x, e.z, 0.4);

    this.apparitions = this.apparitions.filter((a) => a.until > this.time && (a.cameraOnly || dist2d(a.x, a.z, this.player.x, this.player.z) > 9));
    if (this.signOverride && this.signOverride.until < this.time) this.signOverride = null;

    this.runEvents(dt);
    this.checkMissions();
    this.updateFinal(dt);
    this.updateFocus();
  }

  updateFinal(dt: number) {
    const f = this.final;
    if (!f || f.done) return;
    const inZone = this.zone === f.zone;
    if (f.kind === 'tx' && !this.powered('transmitter')) return;
    if (f.kind === 'stop' && !this.powered('sector_c')) return;
    if (f.kind === 'lift' && !this.powered('evac')) return;
    if (!inZone && f.kind !== 'lift') return;
    f.t += dt;
    // every few seconds it gets a fresh fix on where you are
    if (Math.floor(f.t / 9) !== Math.floor((f.t - dt) / 9)) this.enemy.hear(this.player.x, this.player.z, 60);
    if (f.t >= f.need) {
      f.done = true;
      if (f.kind === 'lift') {
        this.sfx('liftArrive', 53, 32);
        this.msg('Winda przyjechała.', 'good');
      } else if (f.kind === 'tx') this.finish('sygnal');
      else this.finish('cisza');
    }
  }

  doorsAnim(dt: number) {
    for (const d of DOORS) {
      const target = this.state.doors[d.id].open ? 1 : 0;
      this.doorAnim[d.id] += Math.sign(target - this.doorAnim[d.id]) * Math.min(Math.abs(target - this.doorAnim[d.id]), dt * (d.secret ? 0.7 : 1.6));
    }
    const want = this.final?.kind === 'lift' && this.final.done ? 1 : 0;
    this.liftOpen += Math.sign(want - this.liftOpen) * Math.min(Math.abs(want - this.liftOpen), dt * 0.8);
  }

  // ------------------------------------------------------------------ player movement
  movePlayer(dt: number, c: Controls) {
    const p = this.player;
    if (p.hidden) {
      this.moving = 0;
      p.sprinting = false;
      return;
    }
    p.crouch = c.crouch;
    const wantSprint = c.sprint && !p.crouch && c.fwd > 0 && !this.exhausted;
    const speed = p.crouch ? 1.35 : wantSprint ? 4.4 : 2.45;
    const len = Math.hypot(c.fwd, c.side);
    const fx = len > 0 ? c.fwd / len : 0;
    const sx = len > 0 ? c.side / len : 0;
    const f = forward(p.yaw, 0);
    const r = [-f[2], 0, f[0]];
    const tx = (f[0] * fx + r[0] * sx) * speed;
    const tz = (f[2] * fx + r[2] * sx) * speed;
    const acc = len > 0 ? 12 : 10;
    this.vx += (tx - this.vx) * Math.min(1, dt * acc);
    this.vz += (tz - this.vz) * Math.min(1, dt * acc);
    const sp = Math.hypot(this.vx, this.vz);
    p.sprinting = wantSprint && sp > 3;
    // stamina
    if (p.sprinting) {
      this.stamina -= dt / 6;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
        this.sfx('breath');
      }
    } else {
      this.stamina = Math.min(1, this.stamina + dt / 7);
      if (this.exhausted && this.stamina > 0.35) this.exhausted = false;
    }
    // move with sub-steps
    const steps = Math.ceil((sp * dt) / 0.15) || 1;
    for (let i = 0; i < steps; i++) {
      p.x += (this.vx * dt) / steps;
      this.collide();
      p.z += (this.vz * dt) / steps;
      this.collide();
    }
    // eye height & head bob
    const eyeT = p.crouch ? EYE_CROUCH : EYE;
    this.eye += (eyeT - this.eye) * Math.min(1, dt * 8);
    this.moving = clamp(sp / 4.4, 0, 1);
    this.bob += sp * dt * (p.sprinting ? 2.1 : 2.6);
    this.stepAcc += sp * dt;
    const stride = p.sprinting ? 2.0 : p.crouch ? 1.1 : 1.55;
    if (this.stepAcc > stride) {
      this.stepAcc = 0;
      const zone = this.level.zoneAt(p.x, p.z);
      this.sfx(p.sprinting ? 'stepRun' : p.crouch ? 'stepSoft' : 'step', p.x, p.z, 1, 0.1);
      const noise = p.sprinting ? 13 : p.crouch ? 1.5 : 4.5;
      this.enemy.hear(p.x, p.z, noise * (zone === 'sektorc' || zone === 'komora' ? 1.3 : 1));
    }
  }

  /** Resolve the player circle against walls, closed doors and furniture. */
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
            const r = pushOut(p.x, p.z, RADIUS, b);
            if (r) [p.x, p.z] = r;
          }
          continue;
        }
        if (t !== 0) continue;
        const r = pushOut(p.x, p.z, RADIUS, { x0: x * CELL, x1: x * CELL + CELL, z0: z * CELL, z1: z * CELL + CELL });
        if (r) [p.x, p.z] = r;
      }
    for (const { box } of L.propBoxes) {
      if (box.x1 < p.x - 2 || box.x0 > p.x + 2 || box.z1 < p.z - 2 || box.z0 > p.z + 2) continue;
      const r = pushOut(p.x, p.z, RADIUS, box);
      if (r) [p.x, p.z] = r;
    }
  }

  /** Collision boxes of a door cell: jambs always, the leaf while (mostly) closed. */
  doorBoxes(cx: number, cz: number) {
    const d = this.level.doorAtCell(cx, cz)!;
    const x0 = cx * CELL;
    const z0 = cz * CELL;
    const open = this.doorAnim[d.id] ?? 0;
    const t = 0.18;
    const out: { x0: number; x1: number; z0: number; z1: number }[] = [];
    if (d.secret) {
      // the shelf sits flush with the archive wall
      if (open < 0.8) out.push({ x0, x1: x0 + CELL, z0: z0 + CELL / 2 + 0.5, z1: z0 + CELL / 2 + 0.98 });
      return out;
    }
    if (d.axis === 'x') {
      const xc = x0 + CELL / 2;
      out.push({ x0: xc - t, x1: xc + t, z0, z1: z0 + 0.22 }, { x0: xc - t, x1: xc + t, z0: z0 + CELL - 0.22, z1: z0 + CELL });
      if (open < 0.8 || d.external) out.push({ x0: xc - t, x1: xc + t, z0, z1: z0 + CELL });
    } else {
      const zc = z0 + CELL / 2;
      out.push({ x0, x1: x0 + 0.22, z0: zc - t, z1: zc + t }, { x0: x0 + CELL - 0.22, x1: x0 + CELL, z0: zc - t, z1: zc + t });
      if (open < 0.8 || d.external) out.push({ x0, x1: x0 + CELL, z0: zc - t, z1: zc + t });
    }
    return out;
  }

  // ------------------------------------------------------------------ aiming
  eyePos(): [number, number, number] {
    return [this.player.x, this.eye + (this.player.hidden ? 0.05 : 0), this.player.z];
  }

  updateFocus() {
    const p = this.player;
    if (p.hidden) {
      this.focus = { id: 'locker', box: { x0: 0, x1: 0, z0: 0, z1: 0, y0: 0, y1: 0 }, label: () => 'Wyjdź z szafki', act: () => this.interact() };
      return;
    }
    const o = this.eyePos();
    const dir = forward(p.yaw, p.pitch);
    let best: Interactable | null = null;
    let bt = 2.3;
    for (const it of this.interactables) {
      const b = it.box;
      if (Math.abs(b.x0 - o[0]) > 4 && Math.abs(b.x1 - o[0]) > 4) continue;
      if (Math.abs(b.z0 - o[2]) > 4 && Math.abs(b.z1 - o[2]) > 4) continue;
      const t = rayBox(o, dir, b);
      if (t !== null && t < bt && it.label()) {
        // nothing solid between the eye and the hit point
        const hx = o[0] + dir[0] * Math.max(0, t - 0.3);
        const hz = o[2] + dir[2] * Math.max(0, t - 0.3);
        if (!this.level.lineClear(o[0], o[2], hx, hz, (cx, cz) => this.closedDoorAt(cx, cz) && !it.id.startsWith('door:'))) continue;
        bt = t;
        best = it;
      }
    }
    this.focus = best;
  }

  /** Debug/test helper: aim at an interactable by id. */
  aimAt(id: string) {
    const it = this.interactables.find((i) => i.id === id);
    if (!it) return false;
    const b = it.box;
    const tx = (b.x0 + b.x1) / 2;
    const ty = (b.y0 + Math.min(b.y1, 2)) / 2;
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

/** Ray vs AABB (slab test). Returns the entry distance or null. */
export function rayBox(o: [number, number, number], d: [number, number, number], b: Box): number | null {
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

export const CEILING = H;
