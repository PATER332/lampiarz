// Turns a seed into an expedition: for every sector a sequence of handcrafted rooms in a
// varied order, with enemies, objects and rewards filled into the template slots.

import { Rng } from '../core/rng';
import { AREAS, type EnemyType } from './areas';
import { buildGrid, TEMPLATES, templateById, type RoomTemplate } from './rooms';
import type { RoomGrid } from './tiles';
import { T_EMPTY, T_SOLID } from './tiles';

export type ObjectKind = 'altar' | 'chest' | 'terminal' | 'checkpoint' | 'sign' | 'secret' | 'medstation';
export type RoomRole = 'start' | 'combat' | 'upgrade' | 'explore' | 'treasure' | 'elite' | 'boss';

export interface PlacedObject {
  kind: ObjectKind;
  x: number; // tile coords (standing tile)
  y: number;
  text?: string;
}
export interface PlacedEnemy {
  type: EnemyType;
  x: number;
  y: number;
  elite: boolean;
  ceiling?: boolean;
}

export interface RoomPlan {
  area: number;
  index: number;
  template: string;
  role: RoomRole;
  grid: RoomGrid;
  spawn: { x: number; y: number };
  exit: { x: number; y: number };
  objects: PlacedObject[];
  enemies: PlacedEnemy[];
  pickups: { x: number; y: number; value: number }[];
  lasers: { x: number; y0: number; y1: number; phase: number }[];
  boss: string | null;
  /** doors stay locked until every enemy in the room is defeated */
  lockDoor: boolean;
}

export const ROOMS_PER_AREA = 6;

/** Which templates a role may use. */
function poolFor(role: RoomRole, area: number): RoomTemplate[] {
  const ok = (t: RoomTemplate) => !t.areas || t.areas.includes(area);
  switch (role) {
    case 'combat':
    case 'upgrade':
      return TEMPLATES.filter((t) => t.kind === 'combat' && ok(t));
    case 'explore':
      return TEMPLATES.filter((t) => (t.kind === 'platform' || t.kind === 'vertical') && ok(t));
    case 'treasure':
      return TEMPLATES.filter((t) => (t.kind === 'treasure' || t.kind === 'platform') && ok(t));
    default:
      return [];
  }
}

export function planArea(seed: number, area: number, tutorial = false): RoomPlan[] {
  const rng = new Rng(seed ^ ((area + 1) * 0x51ed27));
  const def = AREAS[area];
  // varied order of the middle rooms (the start and the finale are fixed)
  const middle: RoomRole[] = rng.shuffle(['combat', 'upgrade', 'explore', 'treasure'] as RoomRole[]);
  // never two vertical rooms in a row would matter, but keep templates unique inside a sector
  const used = new Set<string>();
  const roles: RoomRole[] = ['start', ...middle, def.boss ? 'boss' : 'elite'];
  const plans: RoomPlan[] = [];
  const terminals = rng.shuffle([...def.terminals]);
  roles.forEach((role, index) => {
    let tpl: RoomTemplate;
    if (role === 'start') tpl = templateById(tutorial ? 'samouczek' : 'sluza');
    else if (role === 'boss') tpl = templateById('boss');
    else if (role === 'elite') tpl = templateById('arena');
    else {
      const pool = poolFor(role, area).filter((t) => !used.has(t.id));
      tpl = rng.pick(pool.length ? pool : poolFor(role, area));
    }
    used.add(tpl.id);
    plans.push(fillRoom(tpl, role, area, index, rng, terminals));
  });
  return plans;
}

function fillRoom(tpl: RoomTemplate, role: RoomRole, area: number, index: number, rng: Rng, terminals: string[]): RoomPlan {
  const grid = buildGrid(tpl);
  const def = AREAS[area];
  const plan: RoomPlan = {
    area,
    index,
    template: tpl.id,
    role,
    grid,
    spawn: { x: 2, y: grid.h - 3 },
    exit: { x: grid.w - 2, y: grid.h - 3 },
    objects: [],
    enemies: [],
    pickups: [],
    lasers: [],
    boss: role === 'boss' ? def.boss : null,
    lockDoor: role === 'combat' || role === 'upgrade' || role === 'elite' || role === 'boss',
  };
  const difficulty = area + index / ROOMS_PER_AREA;
  for (const mk of grid.marks) {
    switch (mk.m) {
      case 'P':
        plan.spawn = { x: mk.x, y: mk.y };
        break;
      case 'X':
        plan.exit = { x: mk.x, y: mk.y };
        break;
      case 'C':
        plan.objects.push({ kind: 'checkpoint', x: mk.x, y: mk.y });
        break;
      case 'T':
        plan.objects.push({ kind: 'sign', x: mk.x, y: mk.y, text: mk.text });
        break;
      case 'S':
        plan.objects.push({ kind: 'secret', x: mk.x, y: mk.y });
        break;
      case '$':
        plan.pickups.push({ x: mk.x, y: mk.y, value: 1 + Math.floor(area / 2) });
        break;
      case 'O': {
        const kind: ObjectKind | null =
          role === 'upgrade' ? 'altar' : role === 'treasure' ? 'chest' : role === 'start' ? 'terminal' : role === 'explore' ? (rng.chance(0.5) ? 'terminal' : 'medstation') : rng.chance(0.35) ? 'chest' : null;
        if (kind === 'terminal') plan.objects.push({ kind, x: mk.x, y: mk.y, text: role === 'start' ? def.intro : terminals.pop() ?? def.terminals[0] });
        else if (kind) plan.objects.push({ kind, x: mk.x, y: mk.y });
        break;
      }
      case 'g':
      case 'E': {
        if (role === 'start' && area === 0 && tpl.id === 'samouczek') {
          plan.enemies.push({ type: 'hunter', x: mk.x, y: mk.y, elite: false });
          break;
        }
        // a few slots stay empty in calm rooms so every room feels different
        if (mk.m === 'g' && (role === 'treasure' || role === 'explore') && rng.chance(0.3)) break;
        const elite = mk.m === 'E' || rng.chance(def.eliteChance + (role === 'elite' ? 0.2 : 0));
        const type = mk.m === 'E' ? rng.pick(def.elite) : rng.pick(def.ground);
        plan.enemies.push({ type, x: mk.x, y: mk.y, elite });
        break;
      }
      case 'a': {
        if (role === 'start' && area > 0 && rng.chance(0.5)) break;
        const type = rng.pick(def.air);
        plan.enemies.push({ type, x: mk.x, y: mk.y, elite: rng.chance(def.eliteChance) });
        break;
      }
      case 't': {
        if (area === 0 && index <= 1) break; // turrets appear after the first rooms
        const ceiling = grid.tiles[(mk.y - 1) * grid.w + mk.x] === T_SOLID;
        plan.enemies.push({ type: 'turret', x: mk.x, y: mk.y, elite: rng.chance(def.eliteChance), ceiling });
        break;
      }
      case 'K':
        break;
    }
  }
  // a second wave of difficulty: later rooms of a sector get one more enemy
  if ((role === 'combat' || role === 'upgrade') && difficulty >= 1.5) {
    const spots = plan.pickups.length ? plan.pickups : [{ x: Math.floor(grid.w / 2), y: grid.h - 3 }];
    const s = rng.pick(spots);
    plan.enemies.push({ type: rng.pick(def.air), x: s.x, y: Math.max(2, s.y - 3), elite: false });
  }
  // the energy core: security lasers in open columns
  if (area === 3 && (role === 'combat' || role === 'explore' || role === 'upgrade') && grid.h <= 20) {
    const n = rng.int(1, 2);
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = rng.int(8, grid.w - 9);
        let y0 = 1;
        while (y0 < grid.h && grid.tiles[y0 * grid.w + x] !== T_EMPTY) y0++;
        let y1 = y0;
        while (y1 < grid.h - 1 && grid.tiles[(y1 + 1) * grid.w + x] === T_EMPTY) y1++;
        if (y1 - y0 < 6 || Math.abs(x - plan.spawn.x) < 6 || Math.abs(x - plan.exit.x) < 4) continue;
        if (plan.lasers.some((l) => Math.abs(l.x - x) < 6)) continue;
        plan.lasers.push({ x, y0, y1, phase: rng.next() * 3 });
        break;
      }
    }
  }
  return plan;
}

export function planExpedition(seed: number, tutorial = false) {
  return AREAS.map((_, a) => planArea(seed, a, tutorial && a === 0));
}
