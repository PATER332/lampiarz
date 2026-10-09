// Shared runtime types for entities, hitboxes and world services.
import type { Rect } from '../core/util';
import type { Body, Level } from './level';

export type Team = 'player' | 'enemy';

/** One swing / projectile. A target can be hit by the same AttackInstance only once. */
export interface AttackInstance {
  uid: number;
  hit: Set<number>;
  dodged: boolean;
}

export interface Hitbox {
  team: Team;
  rect: Rect;
  dmg: number;
  poise: number;
  knock: number;
  /** white glint: can be blocked and parried */
  parryable: boolean;
  /** red glint: passes through block */
  unblockable: boolean;
  attack: AttackInstance;
  source: Damageable | null;
  /** x position used to decide which side the blow comes from */
  fromX: number;
  tag: 'light' | 'heavy' | 'skill' | 'riposte' | 'projectile' | 'hazard' | 'shock' | 'contact';
  /** projectile that produced it (so a parry can reflect it) */
  projectile?: Projectile;
  breaksWalls?: boolean;
}

export interface Damageable {
  id: number;
  body: Body;
  hp: number;
  maxHp: number;
  dead: boolean;
  face: 1 | -1;
}

export interface Projectile {
  id: number;
  kind: 'dust' | 'ash' | 'moth' | 'ember';
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  team: Team;
  dmg: number;
  parryable: boolean;
  life: number;
  homing: number;
  attack: AttackInstance;
  reflected: boolean;
  dead: boolean;
}

export interface Light {
  x: number;
  y: number;
  r: number;
  color: string;
  a: number;
}

export type SfxName =
  | 'swing'
  | 'swingHeavy'
  | 'swingBlade'
  | 'hitFlesh'
  | 'hitArmor'
  | 'hitSpirit'
  | 'hitPlayer'
  | 'block'
  | 'parry'
  | 'guardBreak'
  | 'roll'
  | 'perfectDodge'
  | 'step'
  | 'jump'
  | 'land'
  | 'heal'
  | 'skill'
  | 'charge'
  | 'telegraphWhite'
  | 'telegraphRed'
  | 'enemyDeath'
  | 'chest'
  | 'pickup'
  | 'interact'
  | 'shrine'
  | 'lore'
  | 'wallBreak'
  | 'cast'
  | 'lament'
  | 'bark'
  | 'pendulum'
  | 'bossRoar'
  | 'bossIntro'
  | 'bellToll'
  | 'bellDrop'
  | 'fire'
  | 'teleport'
  | 'death'
  | 'victory'
  | 'levelUp'
  | 'menu'
  | 'deny'
  | 'travel';

export interface WorldApi {
  level: Level;
  time: number;
  addHitbox(h: Hitbox): void;
  newAttack(): AttackInstance;
  sfx(name: SfxName, x?: number, vol?: number): void;
  shake(power: number, time?: number): void;
  hitstop(t: number): void;
  slowmo(t: number, scale: number): void;
  spawnShock(x: number, footY: number, dir: 1 | -1, dmg: number, team: Team): void;
}
