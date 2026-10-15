// Builds the static geometry of the level (batched per material), the static
// decals (batched per image) and the list of dynamic objects the renderer animates.
import { compose, Rng } from '../engine/math';
import { MeshBuilder } from '../engine/mesh';
import type { DecalName } from '../engine/textures';
import { JAMB } from '../game/sim';
import { buildLayout } from './layout';
import { CRATE, DOOR, FLOOR, Level, PILLAR, SHELF, SOLID, WET } from './level';
import { CELL, DOORS, GRID_H, GRID_W, H, PICKUPS, PROPS, type DoorDef, type LightDef, type PropDef, type ZoneId } from './map';
import type { MatKey } from './materials';
import { buildProp, crateStack, PartSet, shelfUnit, ventGrate } from './props';

type V3 = [number, number, number];

export interface DynDef {
  kind: 'door' | 'lever' | 'clock' | 'board' | 'plate' | 'keypadLed' | 'screen' | 'core' | 'pickup' | 'genLamp' | 'uvInk' | 'button' | 'vent';
  key: string;
  ref?: string;
  parts: { mat: MatKey; mb: MeshBuilder }[];
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** door: 'swing' around the hinge or 'slide' sideways (local +X) */
  anim?: 'swing' | 'slide' | 'rise';
  slide?: number;
  hingeSide?: number;
  index?: number;
}

export interface DecalDef {
  name: DecalName | 'tally' | 'paint' | 'scribble_count' | 'scribble_arrow' | 'scribble_nie' | 'scribble_help' | 'scribble_eye' | 'scribble_run';
  p: V3;
  n: V3;
  w: number;
  h: number;
  rot: number;
}

export interface SceneData {
  statics: Map<MatKey, MeshBuilder>;
  decals: DecalDef[];
  dyn: DynDef[];
}

const OPEN = (t: number) => t === FLOOR || t === WET || t === DOOR || t === SHELF || t === CRATE;

function wallMat(z: ZoneId | null): MatKey {
  switch (z) {
    case 'maze':
    case 'start':
      return 'wallMaze';
    case 'secret':
      return 'wallDirty';
    case 'armory':
    case 'lift':
    case 'anchor':
      return 'wallMetal';
    case 'dark':
    case 'cage':
      return 'wallDark';
    case 'storage':
      return 'wallStore';
    case 'red':
      return 'wallRed';
    case 'descent':
      return 'wallDeep';
    default:
      return 'wallDark';
  }
}
function floorMat(z: ZoneId | null, wet: boolean): MatKey {
  switch (z) {
    case 'maze':
    case 'start':
    case 'secret':
      return wet ? 'floorCarpetWet' : 'floorCarpet';
    case 'descent':
      return wet ? 'floorWet' : 'floorConcrete';
    case 'anchor':
    case 'lift':
      return 'floorGrate';
    default:
      return 'floorConcrete';
  }
}
function ceilMat(z: ZoneId | null): MatKey {
  switch (z) {
    case 'maze':
    case 'start':
    case 'secret':
      return 'ceilTile';
    case 'armory':
    case 'lift':
    case 'anchor':
      return 'ceilMetal';
    default:
      return 'ceilConcrete';
  }
}

export function buildScene(level: Level, lights: LightDef[]): SceneData {
  const statics = new Map<MatKey, MeshBuilder>();
  const S = (m: MatKey) => {
    let b = statics.get(m);
    if (!b) {
      b = new MeshBuilder();
      statics.set(m, b);
    }
    return b;
  };
  const L = buildLayout();
  const rng = new Rng(4711);
  const decals: DecalDef[] = [];
  const dyn: DynDef[] = [];

  const zoneOf = (x: number, z: number) => level.zoneOfCell(x, z) ?? L.zones[z]?.[x] ?? null;
  const solidLike = (x: number, z: number) => {
    const t = level.cell(x, z);
    return t === SOLID || t === PILLAR;
  };

  // ---------------------------------------------------------------- floors, ceilings, walls
  for (let cz = 0; cz < GRID_H; cz++)
    for (let cx = 0; cx < GRID_W; cx++) {
      const t = level.cell(cx, cz);
      if (!OPEN(t)) continue;
      const zone = zoneOf(cx, cz);
      const x0 = cx * CELL;
      const z0 = cz * CELL;
      const x1 = x0 + CELL;
      const z1 = z0 + CELL;
      // floor (uv in metres / 2 m tile)
      S(floorMat(zone, t === WET)).quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0], [1, 0, 0], [
        [x0 / 2, z1 / 2],
        [x1 / 2, z1 / 2],
        [x1 / 2, z0 / 2],
        [x0 / 2, z0 / 2],
      ]);
      S(ceilMat(zone)).quad([x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1], [0, -1, 0], [1, 0, 0], [
        [x0 / 1.2, z0 / 1.2],
        [x1 / 1.2, z0 / 1.2],
        [x1 / 1.2, z1 / 1.2],
        [x0 / 1.2, z1 / 1.2],
      ]);
      const wm = wallMat(zone);
      const skirting = zone === 'maze' || zone === 'start' || zone === 'secret';
      // wall faces towards this cell (v spans the whole wall height: grime sits at the bottom)
      const wall = (a: V3, b: V3, n: V3, tan: V3, u0: number, u1: number) => {
        S(wm).quad([a[0], 0, a[2]], [b[0], 0, b[2]], [b[0], H, b[2]], [a[0], H, a[2]], n, tan, [
          [u0, 1],
          [u1, 1],
          [u1, 0],
          [u0, 0],
        ]);
        if (skirting) {
          const mx = (a[0] + b[0]) / 2 + n[0] * 0.012;
          const mz = (a[2] + b[2]) / 2 + n[2] * 0.012;
          S('skirting').box(mx, 0.05, mz, Math.abs(b[0] - a[0]) + Math.abs(n[0]) * 0.024, 0.1, Math.abs(b[2] - a[2]) + Math.abs(n[2]) * 0.024, { uv: 1 });
        }
      };
      if (solidLike(cx, cz - 1)) wall([x0, 0, z0], [x1, 0, z0], [0, 0, 1], [1, 0, 0], x0 / 2, x1 / 2);
      if (solidLike(cx, cz + 1)) wall([x1, 0, z1], [x0, 0, z1], [0, 0, -1], [-1, 0, 0], -x1 / 2, -x0 / 2);
      if (solidLike(cx - 1, cz)) wall([x0, 0, z1], [x0, 0, z0], [1, 0, 0], [0, 0, -1], -z1 / 2, -z0 / 2);
      if (solidLike(cx + 1, cz)) wall([x1, 0, z0], [x1, 0, z1], [-1, 0, 0], [0, 0, 1], z0 / 2, z1 / 2);

      // pipes and conduits along the walls of the industrial zones
      if ((zone === 'dark' || zone === 'red' || zone === 'descent' || zone === 'storage') && t !== DOOR) {
        if (solidLike(cx, cz - 1)) {
          S(zone === 'storage' ? 'darkMetal' : 'rust').cylinder(x0 + 1, H - 0.2, z0 + 0.16, 0.07, CELL, 'x', 10, { caps: false });
          S('darkMetal').cylinder(x0 + 1, H - 0.42, z0 + 0.06, 0.025, CELL, 'x', 6, { caps: false });
          if ((cx + cz) % 3 === 0) S('darkMetal').box(x0 + 1, H - 0.1, z0 + 0.16, 0.06, 0.2, 0.06, {});
        }
        if (solidLike(cx - 1, cz) && zone !== 'storage') S('rust').cylinder(x0 + 0.14, H - 0.3, z0 + 1, 0.05, CELL, 'z', 8, { caps: false });
      }

      // contents of the cell
      if (t === SHELF) {
        const ps = new PartSet();
        shelfUnit(ps, x0 + 1, z0 + 1, cx * 31 + cz * 7);
        for (const [m, mb] of ps.parts) S(m).merge(mb);
      } else if (t === CRATE) {
        const ps = new PartSet();
        crateStack(ps, x0 + 1, z0 + 1, cx * 13 + cz * 17, zone === 'red');
        for (const [m, mb] of ps.parts) S(m).merge(mb);
      }
    }

  // pillars: the faces are generated as walls of the neighbouring cells; add a skirting cap look-alike
  // ---------------------------------------------------------------- doorways
  for (const d of DOORS) {
    const x0 = d.cx * CELL;
    const z0 = d.cz * CELL;
    const zone = zoneOf(d.cx, d.cz);
    const wm = wallMat(zone);
    const other = d.axis === 'x' ? zoneOf(d.cx + 1, d.cz) : zoneOf(d.cx, d.cz + 1);
    const wm2 = wallMat(other ?? zone);
    const DH = 2.2;
    if (d.kind === 'hidden') {
      // no visible doorway: the panel is the wall itself (drawn as a dynamic object)
    }
    if (d.axis === 'x') {
      S(wm).box(x0 + 0.5, H / 2, z0 + JAMB / 2, 1, H, JAMB, { uv: 0.5 });
      S(wm2).box(x0 + 1.5, H / 2, z0 + JAMB / 2, 1, H, JAMB, { uv: 0.5 });
      S(wm).box(x0 + 0.5, H / 2, z0 + CELL - JAMB / 2, 1, H, JAMB, { uv: 0.5 });
      S(wm2).box(x0 + 1.5, H / 2, z0 + CELL - JAMB / 2, 1, H, JAMB, { uv: 0.5 });
      S(wm).box(x0 + 0.5, (DH + H) / 2, z0 + 1, 1, H - DH, CELL - 2 * JAMB, { uv: 0.5 });
      S(wm2).box(x0 + 1.5, (DH + H) / 2, z0 + 1, 1, H - DH, CELL - 2 * JAMB, { uv: 0.5 });
      // frame
      S('darkMetal').box(x0 + 1, DH + 0.03, z0 + 1, 0.2, 0.06, CELL - 2 * JAMB + 0.06, {});
      S('darkMetal').box(x0 + 1, DH / 2, z0 + JAMB - 0.01, 0.2, DH, 0.05, {});
      S('darkMetal').box(x0 + 1, DH / 2, z0 + CELL - JAMB + 0.01, 0.2, DH, 0.05, {});
    } else {
      S(wm).box(x0 + JAMB / 2, H / 2, z0 + 0.5, JAMB, H, 1, { uv: 0.5 });
      S(wm2).box(x0 + JAMB / 2, H / 2, z0 + 1.5, JAMB, H, 1, { uv: 0.5 });
      S(wm).box(x0 + CELL - JAMB / 2, H / 2, z0 + 0.5, JAMB, H, 1, { uv: 0.5 });
      S(wm2).box(x0 + CELL - JAMB / 2, H / 2, z0 + 1.5, JAMB, H, 1, { uv: 0.5 });
      S(wm).box(x0 + 1, (DH + H) / 2, z0 + 0.5, CELL - 2 * JAMB, H - DH, 1, { uv: 0.5 });
      S(wm2).box(x0 + 1, (DH + H) / 2, z0 + 1.5, CELL - 2 * JAMB, H - DH, 1, { uv: 0.5 });
      S('darkMetal').box(x0 + 1, DH + 0.03, z0 + 1, CELL - 2 * JAMB + 0.06, 0.06, 0.2, {});
      S('darkMetal').box(x0 + JAMB - 0.01, DH / 2, z0 + 1, 0.05, DH, 0.2, {});
      S('darkMetal').box(x0 + CELL - JAMB + 0.01, DH / 2, z0 + 1, 0.05, DH, 0.2, {});
    }
    dyn.push(doorLeaf(d));
  }

  // ---------------------------------------------------------------- light fixtures (the glowing part is drawn per frame)
  lights.forEach((l) => {
    if (l.panel) {
      S('darkMetal').box(l.x, H - 0.01, l.z, 1.3, 0.02, 0.7, {});
      S('diffuser').quad([l.x - 0.6, H - 0.025, l.z - 0.3], [l.x + 0.6, H - 0.025, l.z - 0.3], [l.x + 0.6, H - 0.025, l.z + 0.3], [l.x - 0.6, H - 0.025, l.z + 0.3], [0, -1, 0], [1, 0, 0], [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]);
    } else if (l.kind === 'bulb' || l.kind === 'red' || l.kind === 'lamp') {
      S('darkMetal').cylinder(l.x, H - 0.06, l.z, 0.1, 0.12, 'y', 10);
      S('darkMetal').cylinder(l.x, (H + l.y) / 2, l.z, 0.012, H - l.y, 'y', 5);
      // wire cage
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        S('darkMetal').box(l.x + Math.cos(a) * 0.08, l.y, l.z + Math.sin(a) * 0.08, 0.012, 0.18, 0.012, {});
      }
    } else if (l.kind === 'uv') {
      S('darkMetal').box(l.x, H - 0.05, l.z, 1.6, 0.08, 0.25, {});
    }
  });

  // ---------------------------------------------------------------- props
  PROPS.forEach((p, i) => {
    const ps = buildProp(p.kind, i * 97 + 13);
    const yaw = (p.rot * Math.PI) / 2;
    const m = compose([p.x, 0, p.z], yaw);
    for (const [mat, mb] of ps.parts) S(mat).mergeTransformed(mb, m);
    addPropDyn(p, dyn);
  });

  // ---------------------------------------------------------------- dressing
  // pipes and conduits under the ceiling of the service levels, litter on the
  // floors, gaps in the ceiling tiles of the maze, sockets on its walls
  const PIPE: Partial<Record<ZoneId, MatKey>> = { dark: 'rust', descent: 'darkMetal', storage: 'steel', red: 'rust', anchor: 'steel', lift: 'darkMetal' };
  const camAt = (cx: number, cz: number) => PROPS.some((p) => p.kind === 'camera' && Math.floor(p.x / CELL) === cx && Math.floor(p.z / CELL) === cz);
  const dr = new Rng(9001);
  for (let cz = 1; cz < GRID_H - 1; cz++)
    for (let cx = 1; cx < GRID_W - 1; cx++) {
      const t = level.cell(cx, cz);
      if (t !== FLOOR && t !== WET) continue;
      const zone = zoneOf(cx, cz);
      if (!zone) continue;
      const x0 = cx * CELL;
      const z0 = cz * CELL;
      const pm = PIPE[zone];
      if (pm && !camAt(cx, cz)) {
        if (solidLike(cx, cz - 1)) {
          S(pm).cylinder(x0 + 1, H - 0.2, z0 + 0.16, 0.075, CELL, 'x', 10, { caps: false });
          S('darkMetal').cylinder(x0 + 1, H - 0.42, z0 + 0.12, 0.032, CELL, 'x', 8, { caps: false });
          if (cx % 2 === 0) S('darkMetal').box(x0 + 0.25, H - 0.28, z0 + 0.06, 0.05, 0.36, 0.12, {});
        }
        if (solidLike(cx - 1, cz)) {
          S(pm).cylinder(x0 + 0.16, H - 0.2, z0 + 1, 0.075, CELL, 'z', 10, { caps: false });
          S('darkMetal').cylinder(x0 + 0.12, H - 0.42, z0 + 1, 0.032, CELL, 'z', 8, { caps: false });
          if (cz % 2 === 0) S('darkMetal').box(x0 + 0.06, H - 0.28, z0 + 0.25, 0.12, 0.36, 0.05, {});
        }
      }
      // litter: loose sheets of paper, chips of concrete
      const r = dr.next();
      if ((zone === 'maze' || zone === 'storage' || zone === 'red' || zone === 'dark' || zone === 'secret') && r < 0.16) {
        const n = 1 + Math.floor(dr.next() * 3);
        for (let i = 0; i < n; i++)
          S('paper').box(x0 + dr.range(0.3, 1.7), 0.004 + i * 0.002, z0 + dr.range(0.3, 1.7), 0.21, 0.003, 0.297, { rotY: dr.range(0, Math.PI) });
      }
      if ((zone === 'red' || zone === 'descent' || zone === 'dark') && dr.next() < 0.2) {
        const n = 2 + Math.floor(dr.next() * 4);
        for (let i = 0; i < n; i++) {
          const sz = dr.range(0.05, 0.16);
          S('wallDark').box(x0 + dr.range(0.2, 1.8), sz * 0.4, z0 + dr.range(0.2, 1.8), sz, sz * 0.8, sz * 1.2, { rotY: dr.range(0, 3) });
        }
      }
      if (zone === 'maze' || zone === 'secret') {
        // a missing ceiling tile now and then, a socket low on a wall
        if (dr.next() < 0.035) {
          const tx = x0 + 0.5 + Math.floor(dr.next() * 2) * 0.6;
          const tz = z0 + 0.5 + Math.floor(dr.next() * 2) * 0.6;
          S('black').box(tx, H - 0.004, tz, 0.6, 0.006, 0.6, {});
          // a cable hanging from the hole
          S('black').box(tx + 0.1, H - 0.35, tz, 0.012, 0.7, 0.012, {});
        }
        if (dr.next() < 0.06 && solidLike(cx, cz - 1)) S('plastic').box(x0 + dr.range(0.4, 1.6), 0.32, z0 + 0.012, 0.08, 0.12, 0.02, {});
      }
    }

  // ---------------------------------------------------------------- pickups
  for (const pk of PICKUPS) {
    const ps = pickupModel(pk.kind === 'doc' ? 'doc' : pk.ref);
    dyn.push({ kind: 'pickup', key: pk.id, ref: pk.id, parts: [...ps.parts].map(([mat, mb]) => ({ mat, mb })), x: pk.x, y: pk.y, z: pk.z, yaw: rng.range(-Math.PI, Math.PI) });
  }

  // ---------------------------------------------------------------- decals
  const D = (name: DecalDef['name'], p: V3, n: V3, w: number, h: number, rot = 0) => decals.push({ name, p, n, w, h, rot });
  const floorD = (name: DecalDef['name'], x: number, z: number, s: number, rot = rng.range(0, 6.28)) => D(name, [x, 0.006 + decals.length * 0.00002, z], [0, 1, 0], s, s, rot);
  // water stains high on random maze walls, mould in the dark
  for (let cz = 1; cz < GRID_H - 1; cz++)
    for (let cx = 1; cx < GRID_W - 1; cx++) {
      const t = level.cell(cx, cz);
      if (t !== FLOOR && t !== WET) continue;
      const zone = zoneOf(cx, cz);
      const r = rng.next();
      const dirs: [number, number, V3][] = [
        [0, -1, [0, 0, 1]],
        [0, 1, [0, 0, -1]],
        [-1, 0, [1, 0, 0]],
        [1, 0, [-1, 0, 0]],
      ];
      for (const [dx, dz, n] of dirs) {
        if (!solidLike(cx + dx, cz + dz)) continue;
        const wx = cx * CELL + 1 + dx * (1 - 0.004);
        const wz = cz * CELL + 1 + dz * (1 - 0.004);
        if ((zone === 'maze' || zone === 'start') && r < 0.12) D('stain', [wx, 2.0, wz], n, 1.4 + rng.next(), 1.4, rng.range(-0.3, 0.3));
        if ((zone === 'dark' || zone === 'descent') && r < 0.15) D('mold', [wx, 2.3, wz], n, 1.5, 1.0, rng.range(-1, 1));
        if (zone === 'red' && r < 0.06) D('bloodSmear', [wx, 1.1, wz], n, 1.4, 0.7, rng.range(-0.2, 0.2));
        break;
      }
      if (t === WET && r < 0.5) floorD('puddle', cx * CELL + 1 + rng.range(-0.4, 0.4), cz * CELL + 1 + rng.range(-0.4, 0.4), 1.4 + rng.next());
    }
  // the battlefield of the red sector and the bodies
  for (const p of PROPS.filter((q) => q.kind === 'body')) {
    floorD('blood', p.x + rng.range(-0.3, 0.3), p.z + rng.range(-0.3, 0.3), 2.2);
    floorD('splat', p.x + 1.2, p.z - 0.4, 0.9);
  }
  D('drag', [12.5, 0.008, 22], [0, 1, 0], 0.7, 5, 0.4);
  D('drag', [36, 0.008, 95], [0, 1, 0], 0.7, 6, 1.4);
  D('hand', [16.05, 1.2, 15.0], [1, 0, 0], 0.45, 0.45, 0.2);
  D('hand', [16.05, 1.0, 15.6], [1, 0, 0], 0.45, 0.45, -0.3);
  D('hand', [29.95, 1.3, 13.2], [-1, 0, 0], 0.45, 0.45, 0.1);
  D('bloodSmear', [2.03, 1.1, 24], [1, 0, 0], 1.6, 0.8, -0.2);
  D('hand', [50.05, 1.25, 104], [1, 0, 0], 0.45, 0.45, 0.4);
  D('blood', [52.3, 0.008, 22], [0, 1, 0], 1.4, 1.4, 1);
  floorD('splat', 49, 93, 1.2);
  floorD('blood', 88, 100, 1.8);
  // writings
  D('scribble_arrow', [48.03, 1.4, 58.4], [-1, 0, 0], 1.4, 0.7);
  D('scribble_run', [10.04, 1.6, 66], [1, 0, 0], 1.6, 0.8, 0.05);
  D('scribble_help', [2.03, 1.6, 30], [1, 0, 0], 1.8, 0.9, -0.04);
  D('scribble_nie', [33.97, 1.5, 21.5], [-1, 0, 0], 1.8, 0.9, 0.03);
  D('scribble_count', [48.97, 1.3, 34], [-1, 0, 0], 1.4, 0.7);
  D('scribble_eye', [13.97, 1.9, 46], [-1, 0, 0], 1.0, 0.5);
  // puzzle markings
  D('tally', [104.06, 1.4, 31.6], [1, 0, 0], 2.4, 1.8);
  D('paint', [58, 1.45, 35.97], [0, 0, -1], 2.0, 1.0, 0.02);
  dyn.push({ kind: 'uvInk', key: 'uvInk', parts: [], x: 52.03, y: 1.5, z: 30, yaw: Math.PI / 2 });

  return { statics, decals, dyn };
}

// ---------------------------------------------------------------- door leaves
function doorLeaf(d: DoorDef): DynDef {
  const x = d.cx * CELL + CELL / 2;
  const z = d.cz * CELL + CELL / 2;
  // local: the leaf spans local X across the opening, thickness along Z; yaw turns it into place
  const yaw = d.axis === 'x' ? Math.PI / 2 : 0;
  const w = CELL - 2 * JAMB;
  const ps = new PartSet();
  const metal = d.metal || d.kind === 'keypad';
  if (d.kind === 'hidden') {
    // a slab of the maze wall, wallpaper on the maze side
    ps.get('wallMaze').box(0, 1.1, 0, w + 0.06, 2.2, 0.12, { uv: 0.5 });
    return { kind: 'door', key: d.id, ref: d.id, parts: [...ps.parts].map(([mat, mb]) => ({ mat, mb })), x, y: 0, z, yaw, anim: 'slide', slide: w * 0.95 };
  }
  if (metal) {
    ps.get(d.kind === 'keypad' ? 'steel' : 'wallMetal').box(0, 1.1, 0, w, 2.2, 0.1, { uv: 0.5 });
    ps.get('darkMetal').box(0, 1.1, -0.055, w * 0.8, 1.9, 0.01, {});
    if (d.kind === 'keypad') {
      // vault bolts and a wheel
      for (const yy of [0.5, 1.1, 1.7]) ps.get('steel').cylinder(w / 2 - 0.08, yy, -0.07, 0.04, 0.05, 'z', 10);
      ps.get('darkMetal').cylinder(0, 1.1, -0.08, 0.22, 0.05, 'z', 18);
    }
    if (d.kind === 'stabilizers' || d.kind === 'exit' || d.kind === 'power') ps.get('hazard').box(0, 0.12, -0.06, w, 0.2, 0.01, {});
    return { kind: 'door', key: d.id, ref: d.id, parts: [...ps.parts].map(([mat, mb]) => ({ mat, mb })), x, y: 0, z, yaw, anim: 'slide', slide: w * 0.95 };
  }
  // wooden door hanging on a hinge at local -X
  const leaf = new MeshBuilder();
  leaf.box(w / 2, 1.1, 0, w - 0.02, 2.18, 0.05, { uv: 1 });
  ps.get('wood').merge(leaf);
  ps.get('steel').cylinder(w - 0.12, 1.05, -0.05, 0.025, 0.08, 'z', 8);
  ps.get('steel').cylinder(w - 0.12, 1.05, 0.05, 0.025, 0.08, 'z', 8);
  return { kind: 'door', key: d.id, ref: d.id, parts: [...ps.parts].map(([mat, mb]) => ({ mat, mb })), x, y: 0, z, yaw, anim: 'swing', hingeSide: -w / 2 };
}

// ---------------------------------------------------------------- dynamic parts of props
function addPropDyn(p: PropDef, dyn: DynDef[]) {
  const yaw = (p.rot * Math.PI) / 2;
  const quad = (w: number, h: number, y: number, z: number, mat: MatKey = 'paper') => {
    const mb = new MeshBuilder();
    mb.quad([-w / 2, y - h / 2, z], [w / 2, y - h / 2, z], [w / 2, y + h / 2, z], [-w / 2, y + h / 2, z], [0, 0, -1], [1, 0, 0], [
      [1, 1],
      [0, 1],
      [0, 0],
      [1, 0],
    ]);
    // front faces -Z: flip u so the image reads correctly from the front
    return { mat, mb };
  };
  switch (p.kind) {
    case 'vent': {
      const g = ventGrate();
      dyn.push({ kind: 'vent', key: p.id!, ref: p.id, parts: [...g.parts].map(([mat, mb]) => ({ mat, mb })), x: p.x, y: 0.74, z: p.z, yaw });
      break;
    }
    case 'clock':
      dyn.push({ kind: 'clock', key: p.id!, ref: p.id, parts: [quad(0.4, 0.4, 1.86, -0.037)], x: p.x, y: 0, z: p.z, yaw });
      break;
    case 'board':
      dyn.push({ kind: 'board', key: p.id!, ref: p.id, parts: [quad(2.1, 1.23, 1.55, -0.012)], x: p.x, y: 0, z: p.z, yaw });
      break;
    case 'keypad': {
      dyn.push({ kind: 'keypadLed', key: 'keypadLed', parts: [quad(0.2, 0.06, 1.52, -0.032, 'plastic')], x: p.x, y: 0, z: p.z, yaw });
      // the plate with the order of the symbols, above the door
      dyn.push({ kind: 'plate', key: 'plate', parts: [quad(1.2, 0.3, 2.45, 0, 'steel')], x: 49.97, y: 0, z: 49, yaw: (1 * Math.PI) / 2 });
      break;
    }
    case 'console':
      for (let i = 0; i < 3; i++) dyn.push({ kind: 'screen', key: `console${i}`, ref: 'console', index: i, parts: [quad(0.54, 0.4, 1.06, -0.082)], x: p.x + Math.cos(yaw) * (i - 1) * 0.7, y: 0, z: p.z - Math.sin(yaw) * (i - 1) * 0.7, yaw });
      break;
    case 'terminal':
      dyn.push({ kind: 'screen', key: 'terminal', ref: 'terminal', parts: [quad(0.7, 0.28, 1.2, -0.177)], x: p.x, y: 0, z: p.z, yaw });
      break;
    case 'radio':
      dyn.push({ kind: 'screen', key: 'radio', ref: 'radio', parts: [quad(0.3, 0.1, 0.78 + 0.33, -0.212)], x: p.x + Math.cos(yaw) * -0.2, y: 0, z: p.z - Math.sin(yaw) * -0.2, yaw });
      break;
    case 'genPanel':
      for (let i = 0; i < 3; i++) {
        const mb = new MeshBuilder();
        mb.cylinder(-0.35 + i * 0.35, 1.55, -0.07, 0.03, 0.03, 'z', 10);
        dyn.push({ kind: 'genLamp', key: `gen${i}`, index: i, parts: [{ mat: 'plastic', mb }], x: p.x, y: 0, z: p.z, yaw });
      }
      break;
    case 'lever': {
      const mb = new MeshBuilder();
      mb.box(0, 0.25, 0, 0.06, 0.5, 0.06, {});
      mb.cylinder(0, 0.52, 0, 0.05, 0.16, 'x', 10);
      const ps = new MeshBuilder();
      ps.box(0, 0.52, 0, 0.18, 0.06, 0.06, {});
      dyn.push({
        kind: 'lever',
        key: p.id!,
        ref: p.id,
        parts: [
          { mat: 'steel', mb },
          { mat: 'plasticRed', mb: ps },
        ],
        x: p.x,
        y: 1.0,
        z: p.z,
        yaw,
      });
      break;
    }
    case 'anchor': {
      const core = new MeshBuilder();
      core.ellipsoid([0, 0, 0], 0.55, 0.85, 0.55, 18, 12);
      const ring = new MeshBuilder();
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        ring.box(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95, 0.32, 0.06, 0.06, { rotY: -a + Math.PI / 2 });
      }
      dyn.push({ kind: 'core', key: 'core', parts: [{ mat: 'mask', mb: core }], x: p.x, y: 1.6, z: p.z, yaw: 0 });
      dyn.push({ kind: 'core', key: 'ring', index: 1, parts: [{ mat: 'steel', mb: ring }], x: p.x, y: 1.6, z: p.z, yaw: 0 });
      break;
    }
    case 'liftPanel':
    case 'uvSwitch': {
      const mb = new MeshBuilder();
      mb.box(0, p.kind === 'liftPanel' ? 1.3 : 1.47, -0.035, 0.06, 0.06, 0.02, {});
      dyn.push({ kind: 'button', key: p.id!, ref: p.id, parts: [{ mat: 'plastic', mb }], x: p.x, y: 0, z: p.z, yaw });
      break;
    }
  }
}

// ---------------------------------------------------------------- pickup models (local, lying on a surface)
export function pickupModel(kind: string): PartSet {
  const s = new PartSet();
  switch (kind) {
    case 'doc':
      s.get('paper').box(0, 0.002, 0, 0.21, 0.004, 0.297, { uv: 1 });
      s.get('paper').box(0.03, 0.006, 0.02, 0.21, 0.004, 0.297, { uv: 1, rotY: 0.2 });
      break;
    case 'battery':
      s.get('plasticDark').cylinder(0, 0.035, 0, 0.034, 0.12, 'x', 12);
      s.get('orange').cylinder(0.03, 0.035, 0, 0.035, 0.05, 'x', 12, { caps: false });
      s.get('steel').cylinder(0.065, 0.035, 0, 0.012, 0.012, 'x', 8);
      break;
    case 'medkit':
      s.get('plastic').box(0, 0.07, 0, 0.32, 0.14, 0.22, {});
      s.get('plasticRed').box(0, 0.141, 0, 0.16, 0.004, 0.05, {});
      s.get('plasticRed').box(0, 0.141, 0, 0.05, 0.004, 0.16, {});
      break;
    case 'ammo':
      s.get('cardboard').box(0, 0.045, 0, 0.16, 0.09, 0.1, {});
      for (let i = 0; i < 3; i++) s.get('steel').cylinder(-0.04 + i * 0.04, 0.1, 0, 0.009, 0.03, 'y', 6);
      break;
    case 'revolver': {
      const g = revolverParts(0.9);
      for (const [m, mb] of g.parts) {
        const out = s.get(m);
        // lying on its side
        out.mergeTransformed(mb, compose([0, 0.02, 0], 0, 0, Math.PI / 2));
      }
      break;
    }
    case 'liftcard':
      s.get('plastic').box(0, 0.002, 0, 0.086, 0.004, 0.054, {});
      s.get('plasticRed').box(0.02, 0.005, 0, 0.03, 0.002, 0.054, {});
      break;
    case 'tag':
      s.get('steel').box(0, 0.003, 0, 0.05, 0.004, 0.028, {});
      for (let i = 0; i < 10; i++) s.get('steel').cylinder(-0.03 - i * 0.012, 0.003, Math.sin(i) * 0.01, 0.003, 0.006, 'x', 4);
      break;
  }
  return s;
}

/** The revolver, built along -Z (barrel forward), grip down. Shared by the view model and the pickup. */
export function revolverParts(scale = 1): PartSet {
  const s = new PartSet();
  const k = scale;
  const B = (m: MatKey, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0) => {
    const mb = new MeshBuilder();
    mb.box(0, 0, 0, sx * k, sy * k, sz * k, {});
    s.get(m).mergeTransformed(mb, compose([x * k, y * k, z * k], 0, rx));
  };
  // barrel and frame
  const barrel = new MeshBuilder();
  barrel.cylinder(0, 0, 0, 0.011 * k, 0.16 * k, 'z', 12);
  s.get('gunMetal').mergeTransformed(barrel, compose([0, 0.035 * k, -0.15 * k]));
  B('gunMetal', 0, 0.044, -0.15, 0.012, 0.012, 0.16);
  B('gunMetal', 0, 0.02, -0.02, 0.026, 0.06, 0.1);
  // cylinder
  const cyl = new MeshBuilder();
  cyl.cylinder(0, 0, 0, 0.022 * k, 0.05 * k, 'z', 6);
  s.get('gunMetal').mergeTransformed(cyl, compose([0, 0.03 * k, -0.045 * k]));
  // hammer, trigger guard, trigger
  B('gunMetal', 0, 0.058, 0.03, 0.008, 0.02, 0.025, -0.4);
  B('gunMetal', 0, -0.02, -0.01, 0.006, 0.006, 0.05);
  B('steel', 0, -0.008, -0.01, 0.004, 0.022, 0.006, 0.3);
  // grip (wood)
  B('gunGrip', 0, -0.045, 0.04, 0.03, 0.09, 0.04, 0.35);
  // front sight
  B('steel', 0, 0.052, -0.225, 0.004, 0.008, 0.006);
  return s;
}
