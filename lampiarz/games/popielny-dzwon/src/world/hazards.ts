// Environmental and boss hazards. Each produces hitboxes while dangerous and
// draws its own telegraph so the player always sees what is coming.
import type { AttackInstance, Team, WorldApi } from './types';

export type Hazard = Pendulum | FirePatch | Molten | Ring | Shock;

interface Base {
  dead: boolean;
  t: number;
}

export interface Pendulum extends Base {
  kind: 'pendulum';
  ax: number;
  ay: number;
  len: number;
  amp: number;
  speed: number;
  phase: number;
  angle: number;
  inst: AttackInstance;
  lastPass: number;
}

export interface FirePatch extends Base {
  kind: 'fire';
  x: number;
  y: number; // floor y
  w: number;
  life: number;
  tick: number;
  inst: AttackInstance;
}

export interface Molten extends Base {
  kind: 'molten';
  x: number;
  top: number;
  floor: number;
  w: number;
  warn: number;
  life: number;
  dmg: number;
  inst: AttackInstance;
}

export interface Ring extends Base {
  kind: 'ring';
  x: number;
  y: number;
  r: number;
  speed: number;
  max: number;
  band: number;
  dmg: number;
  inst: AttackInstance;
}

export interface Shock extends Base {
  kind: 'shock';
  x: number;
  y: number; // floor
  dir: 1 | -1;
  speed: number;
  life: number;
  dmg: number;
  team: Team;
  inst: AttackInstance;
}

export function updateHazard(h: Hazard, dt: number, w: WorldApi, playerPos: { x: number; y: number }) {
  h.t += dt;
  switch (h.kind) {
    case 'pendulum': {
      h.angle = Math.sin(h.t * h.speed + h.phase) * h.amp;
      const bx = h.ax + Math.sin(h.angle) * h.len;
      const by = h.ay + Math.cos(h.angle) * h.len;
      // whoosh at the bottom of each swing when the player is close
      const vel = Math.cos(h.t * h.speed + h.phase);
      if (Math.abs(h.angle) < 0.08 && h.t - h.lastPass > 0.4 && Math.abs(playerPos.x - h.ax) < 420) {
        h.lastPass = h.t;
        w.sfx('pendulum', h.ax, 0.5);
        h.inst = w.newAttack();
      }
      void vel;
      w.addHitbox({ team: 'enemy', rect: { x: bx - 26, y: by - 14, w: 52, h: 30 }, dmg: 26, poise: 40, knock: 360, parryable: false, unblockable: true, attack: h.inst, source: null, fromX: h.ax - Math.sign(Math.cos(h.t * h.speed + h.phase)) * 100, tag: 'hazard' });
      break;
    }
    case 'fire': {
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = 0.5;
        h.inst = w.newAttack();
      }
      w.addHitbox({ team: 'enemy', rect: { x: h.x - h.w / 2, y: h.y - 26, w: h.w, h: 26 }, dmg: 7, poise: 0, knock: 60, parryable: false, unblockable: true, attack: h.inst, source: null, fromX: h.x, tag: 'hazard' });
      if (h.t >= h.life) h.dead = true;
      break;
    }
    case 'molten': {
      if (h.t >= h.warn && h.t < h.warn + h.life) {
        if (h.t - dt < h.warn) {
          w.sfx('fire', h.x, 0.8);
          w.shake(3, 0.15);
        }
        w.addHitbox({ team: 'enemy', rect: { x: h.x - h.w / 2, y: h.top, w: h.w, h: h.floor - h.top }, dmg: h.dmg, poise: 40, knock: 260, parryable: false, unblockable: true, attack: h.inst, source: null, fromX: h.x, tag: 'hazard' });
      }
      if (h.t >= h.warn + h.life + 0.4) h.dead = true;
      break;
    }
    case 'ring': {
      h.r += h.speed * dt;
      if (h.r >= h.max) h.dead = true;
      // the band is approximated by the player's distance check in the world (circle vs point)
      break;
    }
    case 'shock': {
      h.x += h.dir * h.speed * dt;
      w.addHitbox({ team: h.team, rect: { x: h.x - 18, y: h.y - 28, w: 36, h: 28 }, dmg: h.dmg, poise: 30, knock: 220, parryable: false, unblockable: true, attack: h.inst, source: null, fromX: h.x - h.dir * 50, tag: 'shock', breaksWalls: h.team === 'player' });
      if (h.t >= h.life || w.level.solidAt(Math.floor((h.x + h.dir * 18) / 32), Math.floor((h.y - 10) / 32)) || !w.level.groundBelow(h.x, h.y - 1)) h.dead = true;
      break;
    }
  }
}
