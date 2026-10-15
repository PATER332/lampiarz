import type { BossType, EnemyType } from '../world/areas';
import type { ObjectKind } from '../world/expedition';
import type { Body } from '../world/physics';
import type { UpgradeId } from './data';

export type PlayerAnim = 'wall' | 'idle' | 'run' | 'jump' | 'fall' | 'land' | 'attack' | 'charge' | 'chargeAtk' | 'dash' | 'hurt' | 'dead' | 'interact' | 'victory' | 'special' | 'heal';

export interface AttackState {
  kind: 'combo' | 'charged' | 'special' | 'shot' | 'down' | 'up';
  step: number;
  t: number;
  dur: number;
  hit: Set<number>; // entity ids already hit by this swing
}

export interface Player extends Body {
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  healCharges: number;
  airJumps: number;
  airDashes: number;
  coyote: number;
  jumpBuffer: number;
  dashT: number;
  dashCd: number;
  iframes: number;
  hurtT: number;
  attack: AttackState | null;
  comboStep: number;
  comboWindow: number;
  chargeT: number;
  shotCd: number;
  dropT: number;
  anim: PlayerAnim;
  animT: number;
  landT: number;
  healT: number;
  interactT: number;
  dead: boolean;
  deathT: number;
  wasOnGround: boolean;
  fallSpeed: number;
  stepT: number;
  reactorFx: number;
  wallDir: -1 | 0 | 1;
  wallCoyote: number;
  wallLock: number;
  sliding: boolean;
  dashGrace: number;
  dodgeUsed: boolean;
  counterT: number;
  /** id of the moving platform the player stands on, -1 = none */
  ride: number;
}

export interface Enemy extends Body {
  id: number;
  type: EnemyType | 'larva' | 'boss';
  /** shield bearers block hits from the front */
  guard?: boolean;
  boss?: BossType;
  elite: boolean;
  hp: number;
  maxHp: number;
  facing: 1 | -1;
  state: string;
  stateT: number;
  cd: number;
  flash: number;
  stun: number;
  dead: boolean;
  deathT: number;
  homeX: number;
  homeY: number;
  ceiling?: boolean;
  aimX?: number;
  aimY?: number;
  phase: number;
  seed: number;
  /** contact damage is only dealt while this is > 0 (during real attacks) */
  hurtful: number;
  /** extra counters used by bosses */
  n: number;
  m: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  owner: 'player' | 'enemy';
  kind: 'bolt' | 'wave' | 'orb' | 'acid' | 'grenade' | 'shard' | 'beam' | 'shock' | 'spore';
  life: number;
  pierce: boolean;
  gravity: number;
  hit: Set<number>;
  homing?: number;
  crit?: boolean;
}

export interface Hazard {
  kind: 'laser' | 'beam' | 'acidPool' | 'shockwave' | 'spikes' | 'mine' | 'hline' | 'marker';
  x: number;
  y: number;
  w: number;
  h: number;
  t: number;
  warn: number; // telegraph duration
  active: number; // damaging duration after the telegraph
  dmg: number;
  vx?: number;
  angle?: number;
  len?: number;
  owner?: number;
  hitDone?: boolean;
  phase?: number;
  period?: number;
}

export interface WorldObject {
  id: number;
  kind: ObjectKind;
  x: number; // pixels, centre bottom
  y: number;
  used: boolean;
  text?: string;
  t: number;
}

export interface Pickup {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  kind: 'fragment' | 'health';
  t: number;
  grounded: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  g: number;
  kind: 'spark' | 'dust' | 'glow' | 'smoke' | 'ring' | 'line' | 'debris';
  len?: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

export interface Bolt {
  pts: { x: number; y: number }[];
  t: number;
}

export interface Prop {
  id: number;
  kind: 'crate' | 'barrel' | 'pad' | 'vent' | 'crumble' | 'saw' | 'mover' | 'spiketrap' | 'flame' | 'faller';
  x: number; // pixels, top-left
  y: number;
  w: number;
  h: number;
  hp: number;
  t: number;
  state: 'idle' | 'lit' | 'gone' | 'shake' | 'fall' | 'warn' | 'on';
  phase: number;
  tiles?: number[]; // crumble: tile indices
  /** saw / mover: track ends (pixels, left edge); faller: home position */
  ax?: number;
  bx?: number;
  ay?: number;
  /** flame: direction */
  dir?: 1 | -1;
  /** movement in the last step (mover: carries the rider) */
  dx?: number;
  dy?: number;
  vy?: number;
}

export interface RunState {
  seed: number;
  area: number;
  room: number;
  upgrades: Partial<Record<UpgradeId, number>>;
  fragments: number;
  kills: number;
  bosses: number;
  time: number;
  damageDealt: number;
  combo: number;
  comboT: number;
  bestCombo: number;
  perfect: number;
}

export type GameEvent =
  | { type: 'areaEnter'; area: number }
  | { type: 'roomEnter'; area: number; room: number }
  | { type: 'dialog'; text: string; speaker: string; duration?: number }
  | { type: 'sign'; text: string }
  | { type: 'choice'; options: UpgradeId[]; reason: string }
  | { type: 'death' }
  | { type: 'victory' }
  | { type: 'bossStart'; name: string; title: string }
  | { type: 'bossDefeated'; name: string }
  | { type: 'checkpoint' }
  | { type: 'toast'; text: string; color?: string }
  | { type: 'doorUnlocked' };
