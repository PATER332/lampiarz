// Turns a seed into an expedition: for every sector a sequence of handcrafted rooms in a
// varied order, with enemies, objects and rewards filled into the template slots.

import { Rng } from '../core/rng';
import { AREAS, type EnemyType } from './areas';
import { buildGrid, TEMPLATES, templateById, type RoomTemplate } from './rooms';
import type { RoomGrid } from './tiles';
import { T_EMPTY, T_HAZARD, T_PLATFORM, T_SOLID } from './tiles';

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
  /** interactive scenery: crates, explosive barrels, jump pads, steam vents, crumbling walkways */
  props: PlacedProp[];
  boss: string | null;
  /** doors stay locked until every enemy in the room is defeated */
  lockDoor: boolean;
}

export type PropKind = 'crate' | 'barrel' | 'pad' | 'vent' | 'crumble' | 'saw' | 'mover' | 'spiketrap' | 'flame' | 'faller';
/** Props in tile coordinates. saw / mover: x..x1 is the track; flame: dir; faller: y = ceiling row. */
export interface PlacedProp {
  kind: PropKind;
  x: number;
  y: number;
  w?: number;
  x1?: number;
  dir?: 1 | -1;
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
    props: [],
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
  placeProps(plan, rng);
  return plan;
}

/** Free floor cells (two empty tiles above solid ground), away from doors, objects and slots. */
function floorCells(plan: RoomPlan, headroom = 2) {
  const g = plan.grid;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? T_SOLID : g.tiles[y * g.w + x]);
  const taken = (x: number, y: number) =>
    Math.abs(x - plan.spawn.x) < 4 && Math.abs(y - plan.spawn.y) < 3 ||
    Math.abs(x - plan.exit.x) < 3 && Math.abs(y - plan.exit.y) < 3 ||
    plan.objects.some((o) => Math.abs(o.x - x) < 2 && Math.abs(o.y - y) < 2) ||
    g.marks.some((m) => m.x === x && m.y === y);
  const out: { x: number; y: number }[] = [];
  for (let y = 1; y < g.h - 1; y++)
    for (let x = 2; x < g.w - 2; x++) {
      if (at(x, y + 1) !== T_SOLID) continue;
      let ok = true;
      for (let k = 0; k < headroom; k++) if (at(x, y - k) !== T_EMPTY) ok = false;
      if (ok && !taken(x, y)) out.push({ x, y });
    }
  return out;
}

function placeProps(plan: RoomPlan, rng: Rng) {
  if (plan.role === 'boss') return;
  const area = plan.area;
  // obstacles authored in the template come first
  for (const t of plan.grid.traps ?? []) plan.props.push({ kind: t.kind, x: t.x, y: t.y, x1: t.x1, dir: t.dir });
  const used = new Set<string>();
  const take = (cells: { x: number; y: number }[]) => {
    for (let i = 0; i < 12 && cells.length; i++) {
      const c = cells[rng.int(0, cells.length - 1)];
      const key = `${c.x},${c.y}`;
      if ([...used].some((u) => {
        const [ux, uy] = u.split(',').map(Number);
        return Math.abs(ux - c.x) < 3 && uy === c.y;
      })) continue;
      used.add(key);
      return c;
    }
    return null;
  };
  const cells = floorCells(plan);
  const nCrates = plan.role === 'start' ? 1 : rng.int(1, 3);
  for (let i = 0; i < nCrates; i++) {
    const c = take(cells);
    if (c) plan.props.push({ kind: 'crate', x: c.x, y: c.y });
  }
  if (plan.role !== 'start') {
    const nBarrels = plan.role === 'treasure' ? 0 : rng.int(0, 2);
    for (let i = 0; i < nBarrels; i++) {
      const c = take(cells);
      if (c) plan.props.push({ kind: 'barrel', x: c.x, y: c.y });
    }
  }
  if (area === 0 || area === 3) {
    const n = plan.role === 'start' ? 0 : rng.int(1, 2);
    for (let i = 0; i < n; i++) {
      const c = take(floorCells(plan, 4));
      if (c) plan.props.push({ kind: 'vent', x: c.x, y: c.y });
    }
  }
  if (area === 1 || area === 4) {
    const c = take(floorCells(plan, 8));
    if (c && plan.role !== 'start') plan.props.push({ kind: 'pad', x: c.x, y: c.y });
  }
  if (area === 2) {
    // a few walkways crumble under your feet (and come back a moment later)
    const g = plan.grid;
    const runs: { x: number; y: number; w: number }[] = [];
    for (let y = 1; y < g.h - 2; y++) {
      let x = 1;
      while (x < g.w - 1) {
        if (g.tiles[y * g.w + x] === T_PLATFORM) {
          const x0 = x;
          while (x < g.w - 1 && g.tiles[y * g.w + x] === T_PLATFORM) x++;
          if (x - x0 >= 3) runs.push({ x: x0, y, w: x - x0 });
        } else x++;
      }
    }
    rng.shuffle(runs);
    for (const r of runs.slice(0, 2)) plan.props.push({ kind: 'crumble', x: r.x, y: r.y, w: r.w });
  }
  placeTraps(plan, rng);
}

/** Timed and moving obstacles added on top of the template, depending on the sector and room. */
function placeTraps(plan: RoomPlan, rng: Rng) {
  if (plan.role === 'start' || plan.role === 'boss') return;
  const g = plan.grid;
  const area = plan.area;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? T_SOLID : g.tiles[y * g.w + x]);
  const nearDoor = (x: number, y: number) => (Math.abs(x - plan.spawn.x) < 6 && Math.abs(y - plan.spawn.y) < 4) || (Math.abs(x - plan.exit.x) < 4 && Math.abs(y - plan.exit.y) < 4);
  const nearObj = (x: number, y: number) => plan.objects.some((o) => Math.abs(o.x - x) < 3 && Math.abs(o.y - y) < 3);
  const busy = (x: number, y: number) => plan.props.some((p) => Math.abs(p.x - x) < 3 && Math.abs(p.y - y) < 2 && p.kind !== 'mover' && p.kind !== 'faller');
  const calm = plan.role === 'treasure';
  const early = area === 0 && plan.index <= 1;
  const hasKind = (k: PropKind) => plan.props.some((p) => p.kind === k);

  // retractable floor spikes (all sectors), often in pairs
  const nSpikes = calm || early ? rng.int(0, 1) : rng.int(1, 3);
  const floors = floorCells(plan, 3).filter((c) => !nearDoor(c.x, c.y) && !nearObj(c.x, c.y));
  for (let i = 0; i < nSpikes && floors.length; i++) {
    const c = floors[rng.int(0, floors.length - 1)];
    if (busy(c.x, c.y) || at(c.x - 1, c.y + 1) === T_HAZARD || at(c.x + 1, c.y + 1) === T_HAZARD) continue;
    plan.props.push({ kind: 'spiketrap', x: c.x, y: c.y });
    if (rng.chance(0.6) && at(c.x + 1, c.y + 1) === T_SOLID && at(c.x + 1, c.y) === T_EMPTY && !busy(c.x + 1, c.y)) plan.props.push({ kind: 'spiketrap', x: c.x + 1, y: c.y });
  }

  // saws along long, flat floor runs (industrial sectors)
  if ((area === 0 || area === 2 || area === 3 || area === 4) && !calm && !early && !hasKind('saw') && rng.chance(0.65)) {
    const runs: { x0: number; x1: number; y: number }[] = [];
    for (let y = 2; y < g.h - 1; y++) {
      let x = 1;
      while (x < g.w - 1) {
        const ok = (xx: number) => at(xx, y + 1) === T_SOLID && at(xx, y) === T_EMPTY && at(xx, y - 1) === T_EMPTY && at(xx, y - 2) === T_EMPTY && !nearDoor(xx, y) && !nearObj(xx, y);
        if (ok(x)) {
          const x0 = x;
          while (x < g.w - 1 && ok(x)) x++;
          if (x - x0 >= 8) runs.push({ x0: x0 + 1, x1: x - 2, y });
        } else x++;
      }
    }
    if (runs.length) {
      const r = rng.pick(runs);
      const len = Math.min(r.x1 - r.x0, rng.int(7, 12));
      const x0 = r.x0 + rng.int(0, r.x1 - r.x0 - len);
      plan.props.push({ kind: 'saw', x: x0, y: r.y, x1: x0 + len });
    }
  }

  // flame jets out of walls (complex, city, core)
  if ((area === 0 || area === 2 || area === 3) && !calm && !early && !hasKind('flame') && rng.chance(0.55)) {
    const spots: PlacedProp[] = [];
    for (let y = 2; y < g.h - 1; y++)
      for (let x = 2; x < g.w - 2; x++) {
        if (at(x, y) !== T_EMPTY || at(x, y + 1) !== T_SOLID || nearDoor(x, y) || nearObj(x, y)) continue;
        for (const dir of [1, -1] as const) {
          if (at(x - dir, y) !== T_SOLID || at(x - dir, y - 1) !== T_SOLID) continue;
          let open = true;
          for (let k = 0; k < 4; k++) if (at(x + dir * k, y) !== T_EMPTY || at(x + dir * k, y - 1) !== T_EMPTY) open = false;
          if (open) spots.push({ kind: 'flame', x, y, dir });
        }
      }
    if (spots.length) plan.props.push(rng.pick(spots));
  }

  // stalactites / loose debris (bio zone, city, rift)
  if ((area === 1 || area === 2 || area === 4) && !early) {
    const n = calm ? rng.int(0, 1) : rng.int(1, 3);
    const cols: { x: number; y: number }[] = [];
    for (let x = 3; x < g.w - 3; x++)
      for (let y = 1; y < g.h - 4; y++) {
        if (at(x, y) !== T_SOLID || at(x, y + 1) !== T_EMPTY) continue;
        // a free drop of 3-10 tiles onto a floor, with headroom for the player underneath
        let d = 1;
        while (y + d < g.h && at(x, y + d) === T_EMPTY) d++;
        if (d >= 4 && d <= 11 && !nearDoor(x, y + d - 1)) cols.push({ x, y });
      }
    for (let i = 0; i < n && cols.length; i++) {
      const c = cols[rng.int(0, cols.length - 1)];
      if (plan.props.some((p) => p.kind === 'faller' && Math.abs(p.x - c.x) < 4)) continue;
      plan.props.push({ kind: 'faller', x: c.x, y: c.y });
    }
  }

  // moving platforms over long hazard pits: a ride across the acid / wires / void
  if (!hasKind('mover')) {
    for (let y = 2; y < g.h - 1; y++) {
      let x = 1;
      while (x < g.w - 1) {
        if (at(x, y) === T_HAZARD) {
          const x0 = x;
          while (x < g.w - 1 && at(x, y) === T_HAZARD) x++;
          const len = x - x0;
          if (len >= 8)
            for (const row of [y - 4, y - 3, y - 6, y - 7]) {
              if (row <= 2) continue;
              let free = true;
              for (let xx = x0; xx < x; xx++) for (let yy = row - 2; yy <= row; yy++) if (at(xx, yy) !== T_EMPTY) free = false;
              if (free && rng.chance(0.8)) {
                plan.props.push({ kind: 'mover', x: x0, y: row, x1: x - 3 });
                return;
              }
            }
        } else x++;
      }
    }
  }
}

export function planExpedition(seed: number, tutorial = false) {
  return AREAS.map((_, a) => planArea(seed, a, tutorial && a === 0));
}
