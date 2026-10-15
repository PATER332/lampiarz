import type { CharId } from './constants';
import type { AnimName } from './sprites';
import type { BossDef, BossKind, LevelDef } from './types';

export const T_AIR = 0, T_ROCK = 1, T_BRICK = 2, T_ONEWAY = 3, T_SPIKE = 4, T_CRUMBLE = 5, T_HIDDEN = 6, T_WATER = 7, T_DOOR = 8;
export const T_VEIL_ECHO = 9, T_VEIL_LIFE = 10, T_SPRING = 11, T_UPDRAFT = 12, T_PRISM = 13, T_GEYSER = 14;

export interface Actor {
  x: number; y: number; w: number; h: number; vx: number; vy: number;
  onGround: boolean; facing: 1 | -1;
}

export interface PlayerState extends Actor {
  hp: number; invuln: number; hurtT: number; coyote: number; jumpBuffer: number;
  anim: AnimName; animT: number; dead: boolean; deathT: number;
  onMover: Mover | null; dropThrough: number; wasOnGround: boolean; prevBottom: number;
  bounceT: number; portalCd: number; inUpdraft: boolean;
  landT: number; actT: number;
  // Weaver-only movement state
  dashT: number; dashCd: number; dashesLeft: number; dashDir: 1 | -1;
  wallSide: -1 | 0 | 1; wallCoyote: number; wallLock: number; clinging: boolean; blinkT: number;
}

/** A Shadow Anchor: the Weaver's stationary double. Holds plates, lures devourers, and is a blink target. */
export interface Anchor {
  id: number; x: number; y: number; w: number; h: number; facing: 1 | -1;
  life: number; lifeMax: number; age: number; state: 'live' | 'fading'; fade: number;
}
/** A fading afterimage left behind by dashes and blinks. */
export interface Ghost { x: number; y: number; facing: 1 | -1; anim: AnimName; t: number; life: number; max: number }
/** A caged character waiting to be freed. */
export interface Captive { x: number; y: number; char: CharId; open: number; freed: boolean }

export interface Crystal { id: string; x: number; y: number; value: number; taken: boolean; takenT: number }
export interface Plate {
  x: number; y: number; target: string; pressed: boolean; pressedBy: 'player' | 'echo' | null;
  noEcho: boolean; anim: number; deniedT: number;
  /** Tylko echa i kotwice cienia potrafią przytrzymać tę płytę. */
  echoOnly?: boolean;
  /** Przez ile sekund po zwolnieniu płyta pozostaje wciśnięta. */
  timed?: number;
  hold?: number;
}
export interface Lever { x: number; y: number; target: string; on: boolean; timed: number; timer: number; noEcho: boolean; key: string; deniedT: number }
export interface Door {
  id: string; tiles: Array<{ x: number; y: number }>; x: number; y: number; tilesHigh: number; open: boolean; latch: boolean; latched: boolean;
  anim: number; blocked: boolean; timedLeft: number; lockId?: string;
}
export interface Mover {
  x: number; y: number; w: number; h: number; x0: number; y0: number; x1: number; y1: number; prog: number; len: number; dir: number; speed: number;
  vx: number; vy: number; prevY: number; pause: number; when?: string; spikes: boolean; phase: number; active: boolean;
}
export interface Crumble { x: number; y: number; state: 0 | 1 | 2; timer: number }
export interface Checkpoint { x: number; y: number; active: boolean }
export interface Sign { x: number; y: number; text: string }
export interface Shrine { x: number; y: number }
export interface ExitPortal { x: number; y: number }
export interface HiddenRegion { id: string; tiles: number[]; revealed: boolean; revealT: number }
export interface Spring { x: number; y: number; squash: number }
export interface Prism { x: number; y: number; idx: number; charge: number }
export interface KeyItem { id: string; x: number; y: number; taken: boolean }
export interface Portal { id: string; x: number; y: number; partner: Portal | null; pulse: number }

export type EnemyKind = 'shadow' | 'guardian' | 'devourer' | 'wraith' | 'snapper' | 'crawler' | 'floater' | 'sentinel';
export interface Enemy extends Actor {
  kind: EnemyKind; spawnX: number; spawnY: number; range: number; state: string; timer: number;
  sleepWhen?: string; asleep: boolean; alert: number; satiated: number; animT: number; stepT: number;
  hunting: boolean; wanderT: number;
}

export interface RecFrame { x: number; y: number; f: 1 | -1; a: AnimName; i: boolean }
export interface Recording { frames: RecFrame[]; startX: number; startY: number }
export interface Echo {
  id: number; frames: RecFrame[]; t: number; x: number; y: number; w: number; h: number; facing: 1 | -1; anim: AnimName;
  state: 'playing' | 'lingering' | 'fading'; linger: number; lingerMax: number; fade: number; trail: Array<{ x: number; y: number }>; age: number;
  prisms: Set<number>; reflected: boolean;
}

export interface Decor { x: number; y: number; type: number; variant: number; light: boolean }
export interface DripEmitter { x: number; y: number; timer: number; interval: number }
export interface Droplet { x: number; y: number; vy: number }
export interface DripRipple { x: number; y: number; life: number; max: number; water: boolean }

export type BossAction = 'seed' | 'ember' | 'orb' | 'wave';
export interface BossProjectile {
  x: number; y: number; vx: number; vy: number; life: number; radius: number;
  action: BossAction; wobble: number;
}
export type BossPhase = 'sleep' | 'intro' | 'idle' | 'windup' | 'charge' | 'recovery' | 'stunned' | 'defeated';
export interface BossState {
  kind: BossKind; name: string; title: string;
  x: number; y: number; w: number; h: number; vx: number; vy: number; facing: 1 | -1;
  spawnX: number; spawnY: number;
  hp: number; maxHp: number; phase: number; state: BossPhase;
  timer: number; cooldown: number; hitLock: number; attacks: number; animT: number;
  targetX: number; vulnerable: boolean; active: boolean; defeated: boolean; arena: [number, number, number, number];
  projectiles: BossProjectile[];
}

export function makeBoss(def: BossDef, defeated: boolean): BossState {
  const size = def.kind === 'rootMatriarch' ? { w: 34, h: 32 }
    : def.kind === 'forgeBehemoth' ? { w: 38, h: 30 }
      : def.kind === 'glassWarden' ? { w: 28, h: 34 }
        : { w: 34, h: 36 };
  return {
    kind: def.kind, name: def.name, title: def.title,
    x: def.x * 16 - size.w / 2, y: def.floorY * 16 - size.h,
    w: size.w, h: size.h, vx: 0, vy: 0, facing: -1,
    spawnX: def.x * 16 - size.w / 2, spawnY: def.floorY * 16 - size.h,
    hp: def.hp, maxHp: def.hp, phase: 1,
    state: defeated ? 'defeated' : 'sleep', timer: 0, cooldown: 100, hitLock: 0, attacks: 0, animT: 0,
    targetX: def.x * 16, vulnerable: false, active: defeated, defeated,
    arena: [def.arena[0] * 16, def.arena[1] * 16, def.arena[2] * 16, def.arena[3] * 16],
    projectiles: [],
  };
}

export interface LevelState {
  def: LevelDef; w: number; h: number; tiles: Uint8Array;
  crystals: Crystal[]; plates: Plate[]; levers: Lever[]; doors: Door[]; doorAt: Map<number, Door>;
  movers: Mover[]; crumbles: Map<number, Crumble>; checkpoints: Checkpoint[]; signs: Sign[];
  shrines: Shrine[]; exits: ExitPortal[]; hidden: HiddenRegion[]; hiddenAt: Map<number, HiddenRegion>;
  enemies: Enemy[]; spawn: { x: number; y: number }; decor: Decor[];
  dripEmitters: DripEmitter[]; droplets: Droplet[]; dripRipples: DripRipple[];
  springs: Map<number, Spring>; prisms: Prism[]; keys: KeyItem[]; portals: Portal[]; updrafts: Array<{ x: number; y: number }>;
  markers: Array<{ x: number; y: number }>;
  captives: Captive[];
  boss: BossState | null;
}

export function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
