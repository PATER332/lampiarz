// Builds the render geometry of H-27 from the logical map: static batches per
// material plus the movable pieces (doors, drawers, lift, fixtures, signs, pickups).
import { Rng } from '../engine/math';
import { MeshBuilder } from '../engine/mesh';
import type { MaterialName } from '../engine/textures';
import { FLOOR, Level, PROP_SIZE, rotYaw, SOLID } from './level';
import { CELL, DOORS, GRID_H, GRID_W, H, LIGHTS, PICKUPS, PROPS, VENTS, type DoorDef, type PropDef, type ZoneId } from './map';

/** Render materials: texture + surface response. */
export interface MatDef {
  tex: MaterialName;
  tint: [number, number, number];
  rough: number;
  spec: number;
}

export const MATS = {
  wall: { tex: 'wall', tint: [1, 1, 1], rough: 0.8, spec: 0.08 },
  wallWarm: { tex: 'wall', tint: [1.08, 0.98, 0.86], rough: 0.8, spec: 0.08 },
  wallLab: { tex: 'wallLab', tint: [1, 1, 1], rough: 0.25, spec: 0.5 },
  concrete: { tex: 'concrete', tint: [1, 1, 1], rough: 0.9, spec: 0.05 },
  metalWall: { tex: 'metalWall', tint: [0.9, 0.95, 1], rough: 0.45, spec: 0.35 },
  floorTile: { tex: 'floorTile', tint: [1, 1, 1], rough: 0.5, spec: 0.25 },
  floorRubber: { tex: 'floorRubber', tint: [1, 1, 1], rough: 0.7, spec: 0.12 },
  floorConcrete: { tex: 'floorConcrete', tint: [1, 1, 1], rough: 0.85, spec: 0.08 },
  ceiling: { tex: 'ceiling', tint: [1, 1, 1], rough: 0.95, spec: 0.02 },
  darkMetal: { tex: 'darkMetal', tint: [1, 1, 1], rough: 0.5, spec: 0.35 },
  steel: { tex: 'steel', tint: [1, 1, 1], rough: 0.3, spec: 0.7 },
  wood: { tex: 'wood', tint: [1, 1, 1], rough: 0.6, spec: 0.15 },
  plastic: { tex: 'plastic', tint: [1, 1, 1], rough: 0.5, spec: 0.2 },
  plasticDark: { tex: 'plastic', tint: [0.32, 0.33, 0.35], rough: 0.5, spec: 0.2 },
  hazard: { tex: 'hazard', tint: [1, 1, 1], rough: 0.6, spec: 0.15 },
  rust: { tex: 'rust', tint: [1, 1, 1], rough: 0.7, spec: 0.2 },
  fabric: { tex: 'fabric', tint: [1, 1, 1], rough: 0.95, spec: 0.02 },
  foam: { tex: 'fabric', tint: [0.55, 0.55, 0.62], rough: 1, spec: 0 },
  paper: { tex: 'paper', tint: [1, 1, 1], rough: 0.9, spec: 0.03 },
  cork: { tex: 'wood', tint: [1.25, 1.0, 0.7], rough: 0.95, spec: 0.02 },
} satisfies Record<string, MatDef>;
export type MatKey = keyof typeof MATS;

const ZONE_SURF: Record<ZoneId, { wall: MatKey; floor: MatKey; ceil: MatKey; floorUV: number; ceilUV: number }> = {
  recepcja: { wall: 'wall', floor: 'floorTile', ceil: 'ceiling', floorUV: 0.5, ceilUV: 1 / 2.4 },
  monitoring: { wall: 'wall', floor: 'floorTile', ceil: 'ceiling', floorUV: 0.5, ceilUV: 1 / 2.4 },
  korytarz: { wall: 'wall', floor: 'floorRubber', ceil: 'ceiling', floorUV: 0.5, ceilUV: 1 / 2.4 },
  laboratorium: { wall: 'wallLab', floor: 'floorTile', ceil: 'ceiling', floorUV: 0.5, ceilUV: 1 / 2.4 },
  archiwum: { wall: 'wall', floor: 'floorTile', ceil: 'ceiling', floorUV: 0.5, ceilUV: 1 / 2.4 },
  pokoj0: { wall: 'wallWarm', floor: 'floorTile', ceil: 'ceiling', floorUV: 0.5, ceilUV: 1 / 2.4 },
  techniczne: { wall: 'concrete', floor: 'floorConcrete', ceil: 'concrete', floorUV: 0.33, ceilUV: 0.33 },
  serwis: { wall: 'concrete', floor: 'floorConcrete', ceil: 'concrete', floorUV: 0.33, ceilUV: 0.33 },
  awaryjna: { wall: 'concrete', floor: 'floorConcrete', ceil: 'concrete', floorUV: 0.33, ceilUV: 0.33 },
  sektorc: { wall: 'metalWall', floor: 'floorConcrete', ceil: 'metalWall', floorUV: 0.33, ceilUV: 0.5 },
  komora: { wall: 'foam', floor: 'steel', ceil: 'foam', floorUV: 0.5, ceilUV: 1 },
};

/** A movable/animated piece of geometry, built in local space. */
export interface DynDef {
  key: string;
  kind: 'door' | 'doorSecret' | 'container' | 'lift' | 'fixture' | 'led' | 'sign' | 'screen' | 'pickup' | 'lever';
  mat: MatKey;
  mb: MeshBuilder;
  /** pivot in world space */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** extra data for animation */
  ref?: string;
  index?: number;
  axis?: 'x' | 'z';
  slide?: [number, number, number];
  screen?: string;
  sign?: { text: string; sub?: string };
}

export interface SceneData {
  statics: Map<MatKey, MeshBuilder>;
  dyn: DynDef[];
}

class Batches {
  map = new Map<MatKey, MeshBuilder>();
  get(k: MatKey) {
    let b = this.map.get(k);
    if (!b) {
      b = new MeshBuilder();
      this.map.set(k, b);
    }
    return b;
  }
}

/** Place a box given in a prop's local frame (front = -Z). */
function placer(b: Batches, p: { x: number; z: number; rot: number }) {
  const yaw = rotYaw(p.rot);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (mat: MatKey, lx: number, y: number, lz: number, sx: number, sy: number, sz: number, uv = 1) => {
    b.get(mat).box(p.x + lx * c + lz * s, y, p.z - lx * s + lz * c, sx, sy, sz, { rotY: yaw, uv });
  };
}

export function buildScene(level: Level): SceneData {
  const b = new Batches();
  const dyn: DynDef[] = [];
  const rng = new Rng(1717);

  // ---------------------------------------------------------------- floors, ceilings, walls
  for (let cz = 0; cz < GRID_H; cz++)
    for (let cx = 0; cx < GRID_W; cx++) {
      const t = level.cell(cx, cz);
      if (t === SOLID) continue;
      const zone = level.zoneOfCell(cx, cz) ?? 'korytarz';
      const S = ZONE_SURF[zone];
      const x0 = cx * CELL;
      const z0 = cz * CELL;
      const x1 = x0 + CELL;
      const z1 = z0 + CELL;
      const fu = S.floorUV;
      b.get(S.floor).quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0], [1, 0, 0], [
        [x0 * fu, z1 * fu],
        [x1 * fu, z1 * fu],
        [x1 * fu, z0 * fu],
        [x0 * fu, z0 * fu],
      ]);
      const cu = S.ceilUV;
      b.get(S.ceil).quad([x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1], [0, -1, 0], [1, 0, 0], [
        [x0 * cu, z0 * cu],
        [x1 * cu, z0 * cu],
        [x1 * cu, z1 * cu],
        [x0 * cu, z1 * cu],
      ]);
      // walls toward solid neighbours
      const wallMat = S.wall;
      const wu = 0.5;
      const wv = 1 / H;
      const wall = (a: [number, number], c: [number, number], n: [number, number, number], along: number) => {
        // a -> c along the wall seen from inside the cell
        const t3: [number, number, number] = [c[0] - a[0], 0, c[1] - a[1]];
        const l = Math.hypot(t3[0], t3[2]);
        t3[0] /= l;
        t3[2] /= l;
        b.get(wallMat).quad([a[0], 0, a[1]], [c[0], 0, c[1]], [c[0], H, c[1]], [a[0], H, a[1]], n, t3, [
          [along * wu, 1],
          [(along + l) * wu, 1],
          [(along + l) * wu, 0],
          [along * wu, 0],
        ]);
        void wv;
        // skirting board
        const mx = (a[0] + c[0]) / 2 + n[0] * 0.015;
        const mz = (a[1] + c[1]) / 2 + n[2] * 0.015;
        const sx = Math.abs(c[0] - a[0]) || 0.03;
        const sz = Math.abs(c[1] - a[1]) || 0.03;
        if (zone !== 'komora') b.get('darkMetal').box(mx, 0.06, mz, sx, 0.12, sz);
      };
      // tangent = up × normal, so the normal map's green channel points up on every wall
      if (level.cell(cx, cz - 1) === SOLID) wall([x0, z0], [x1, z0], [0, 0, 1], x0);
      if (level.cell(cx, cz + 1) === SOLID) wall([x1, z1], [x0, z1], [0, 0, -1], -x1);
      if (level.cell(cx - 1, cz) === SOLID) wall([x0, z1], [x0, z0], [1, 0, 0], -z1);
      if (level.cell(cx + 1, cz) === SOLID) wall([x1, z0], [x1, z1], [-1, 0, 0], z0);
      // the anechoic chamber: foam wedges on every wall
      if (zone === 'komora') foamWalls(b, level, cx, cz, rng);
    }

  // ---------------------------------------------------------------- doors
  for (const d of DOORS) buildDoor(b, dyn, d, level);

  // ---------------------------------------------------------------- corridor dressing: pipes, cable trays, vents
  // pipes along the north wall of the main corridor
  b.get('rust').cylinder(36, 2.92, 20.22, 0.07, 40, 'x', 10, { uv: 1, caps: false });
  b.get('steel').cylinder(36, 2.72, 20.18, 0.045, 40, 'x', 8, { uv: 1, caps: false });
  b.get('darkMetal').box(36, 3.02, 23.4, 40, 0.04, 0.35);
  b.get('rust').cylinder(18.2, 2.95, 28, 0.06, 16, 'z', 10, { caps: false });
  b.get('steel').cylinder(66, 2.9, 12.25, 0.08, 16, 'x', 10, { caps: false });
  for (let x = 17; x < 56; x += 4) b.get('darkMetal').box(x, 2.97, 20.2, 0.05, 0.12, 0.14);
  // technical room ducts
  b.get('steel').box(30, 2.75, 26.6, 12, 0.5, 0.7);
  b.get('steel').cylinder(34.6, 1.6, 26.4, 0.12, 3.2, 'y', 10);
  for (const v of VENTS) {
    b.get('darkMetal').box(v.x, H - 0.015, v.z, 0.7, 0.03, 0.7);
    for (let i = -2; i <= 2; i++) b.get('steel').box(v.x + i * 0.12, H - 0.04, v.z, 0.03, 0.03, 0.6);
  }
  // hazard stripes on the floor before Sector C and the lift
  b.get('hazard').box(55.2, 0.006, 22, 1.2, 0.012, 4, { uv: 1 });
  b.get('hazard').box(51.6, 0.006, 32, 1.4, 0.012, 3.4, { uv: 1 });
  // anechoic chamber floor grid
  for (let z = 16.5; z < 26; z += 1) b.get('steel').box(70, 0.04, z, 8, 0.03, 0.04);

  // ---------------------------------------------------------------- props
  for (const p of PROPS) buildProp(b, dyn, p, rng);

  // ---------------------------------------------------------------- light fixtures
  LIGHTS.forEach((l, i) => {
    const mb = new MeshBuilder();
    if (l.kind === 'fluo' || l.kind === 'cold') {
      mb.box(0, 0, 0, 1.25, 0.06, 0.3);
      dyn.push({ key: `fix${i}`, kind: 'fixture', mat: 'plastic', mb, x: l.x, y: H - 0.04, z: l.z, yaw: 0, index: i });
      b.get('darkMetal').box(l.x, H - 0.08, l.z, 1.32, 0.05, 0.36);
    } else if (l.kind === 'red') {
      mb.box(0, 0, 0, 0.16, 0.1, 0.16);
      dyn.push({ key: `fix${i}`, kind: 'fixture', mat: 'plastic', mb, x: l.x, y: l.y + 0.2, z: l.z, yaw: 0, index: i });
    } else if (l.kind === 'lamp') {
      // desk lamp: base, arm, shade
      b.get('darkMetal').box(l.x, l.y - 0.43, l.z, 0.16, 0.03, 0.16);
      b.get('steel').box(l.x, l.y - 0.22, l.z, 0.02, 0.42, 0.02);
      mb.box(0, 0, 0, 0.16, 0.08, 0.16);
      dyn.push({ key: `fix${i}`, kind: 'fixture', mat: 'plastic', mb, x: l.x, y: l.y, z: l.z, yaw: 0, index: i });
    }
  });

  // ---------------------------------------------------------------- pickups
  for (const pk of PICKUPS) {
    const mb = new MeshBuilder();
    let mat: MatKey = 'paper';
    if (pk.kind === 'doc') mb.box(0, 0.002, 0, 0.21, 0.004, 0.29);
    else if (pk.ref.startsWith('fuse')) {
      mb.cylinder(0, 0.025, 0, 0.022, 0.13, 'x', 10);
      mat = 'plastic';
    } else if (pk.ref === 'card3') {
      mb.box(0, 0.002, 0, 0.086, 0.004, 0.055);
      mat = 'hazard';
    } else if (pk.ref === 'tape') {
      mb.box(0, 0.015, 0, 0.19, 0.03, 0.12);
      mat = 'plasticDark';
    } else if (pk.ref === 'key') {
      mb.box(0, 0.01, 0, 0.12, 0.012, 0.025);
      mb.box(-0.07, 0.01, 0, 0.04, 0.014, 0.05);
      mat = 'steel';
    } else {
      mb.box(0, 0.04, 0, 0.07, 0.08, 0.05);
      mat = 'hazard';
    }
    dyn.push({ key: `pick:${pk.id}`, kind: 'pickup', mat, mb, x: pk.x, y: pk.y, z: pk.z, yaw: rng.range(-0.4, 0.4), ref: pk.id });
  }

  // ---------------------------------------------------------------- signs above doors
  const SIGN: Record<string, [string, string]> = {
    rm: ['MONITORING', 'tylko personel'],
    rv: ['KORYTARZ GŁÓWNY', 'sektory A–C'],
    mv: ['SERWIS', ''],
    lc: ['LABORATORIUM 2', 'akustyka'],
    ac: ['ARCHIWUM', 'dostęp na kod'],
    tc: ['TECHNIKA', 'zasilanie • wentylacja'],
    ec: ['EWAKUACJA', 'winda E-1'],
    kc: ['SEKTOR C', 'wstęp tylko na polecenie'],
    kk: ['KOMORA K-1', 'cisza bezwzględna'],
    te: ['PRZEJŚCIE TECHNICZNE', ''],
  };
  for (const d of DOORS) {
    const s = SIGN[d.id];
    if (!s) continue;
    for (const side of [-1, 1]) {
      const [cx, cz] = level.cellCenter(d.cx, d.cz);
      const off = side * 0.2;
      const x = d.axis === 'x' ? cx + off : cx;
      const z = d.axis === 'z' ? cz + off : cz;
      const mb = new MeshBuilder();
      // plaque facing along the passage axis
      mb.box(0, 0, 0, 0.9, 0.22, 0.02);
      const yaw = d.axis === 'x' ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : side > 0 ? 0 : Math.PI;
      dyn.push({ key: `sign:${d.id}:${side}`, kind: 'sign', mat: 'plastic', mb, x, y: 2.78, z, yaw, ref: d.id, sign: { text: s[0], sub: s[1] } });
    }
  }
  // exit signs in reception
  {
    const mb = new MeshBuilder();
    mb.box(0, 0, 0, 0.6, 0.2, 0.04);
    dyn.push({ key: 'sign:exit', kind: 'sign', mat: 'plastic', mb, x: 4.08, y: 2.6, z: 32.6, yaw: -Math.PI / 2, ref: 'exitSign', sign: { text: 'WYJŚCIE', sub: '' } });
  }
  return { statics: b.map, dyn };
}

function foamWalls(b: Batches, level: Level, cx: number, cz: number, rng: Rng) {
  const x0 = cx * CELL;
  const z0 = cz * CELL;
  const put = (x: number, z: number, sx: number, sz: number) => {
    for (let y = 0.25; y < H - 0.1; y += 0.5)
      for (let i = 0; i < 4; i++) {
        const d = 0.18 + ((i + Math.round(y * 2)) % 2) * 0.12;
        const along = 0.25 + i * 0.5;
        const px = sx ? x0 + along : x + d / 2 * (x > x0 + 1 ? -1 : 1);
        const pz = sz ? z0 + along : z + d / 2 * (z > z0 + 1 ? -1 : 1);
        b.get('foam').box(px, y, pz, sx ? 0.42 : d, 0.42, sz ? 0.42 : d);
      }
  };
  if (level.cell(cx, cz - 1) === SOLID) put(0, z0, 1, 0);
  if (level.cell(cx, cz + 1) === SOLID) put(0, z0 + CELL, 1, 0);
  if (level.cell(cx - 1, cz) === SOLID) put(x0, 0, 0, 1);
  if (level.cell(cx + 1, cz) === SOLID) put(x0 + CELL, 0, 0, 1);
  void rng;
}

function buildDoor(b: Batches, dyn: DynDef[], d: DoorDef, level: Level) {
  const [cx, cz] = level.cellCenter(d.cx, d.cz);
  const alongX = d.axis === 'z'; // the door leaf spans X when the passage is along Z
  const box = (mat: MatKey, ox: number, y: number, oz: number, w: number, h: number, t: number) =>
    alongX ? b.get(mat).box(cx + ox, y, cz + oz, w, h, t) : b.get(mat).box(cx + oz, y, cz + ox, t, h, w);
  if (d.secret) {
    // a shelf unit that slides sideways
    const mb = new MeshBuilder();
    shelfModel(mb, 1.9, 2.4, 0.4);
    dyn.push({ key: `door:${d.id}`, kind: 'doorSecret', mat: 'steel', mb, x: cx, y: 0, z: cz + 0.75, yaw: 0, ref: d.id, axis: d.axis, slide: [1.75, 0, 0] });
    box('concrete', 0, 2.8, 0, 2, 0.8, 0.3);
    return;
  }
  // lintel and jambs
  const zone = level.zoneOfCell(d.cx, d.cz) ?? 'korytarz';
  const lintelMat: MatKey = zone === 'sektorc' || zone === 'komora' ? 'metalWall' : zone === 'techniczne' || zone === 'awaryjna' ? 'concrete' : 'wall';
  box(lintelMat, 0, 2.82, 0, 2, 0.76, 0.4);
  box('darkMetal', -0.9, 1.22, 0, 0.2, 2.44, 0.42);
  box('darkMetal', 0.9, 1.22, 0, 0.2, 2.44, 0.42);
  box('darkMetal', 0, 2.47, 0, 2, 0.06, 0.42);
  // leaf: slides along the wall into the jamb
  const heavy = d.id === 'kc' || d.id === 'kk' || d.id === 'ec';
  const leaf = new MeshBuilder();
  const w = 1.62;
  if (alongX) leaf.box(0, 1.2, 0, w, 2.4, heavy ? 0.16 : 0.08);
  else leaf.box(0, 1.2, 0, heavy ? 0.16 : 0.08, 2.4, w);
  // small window in normal doors
  dyn.push({
    key: `door:${d.id}`,
    kind: 'door',
    mat: heavy ? 'hazard' : d.external ? 'steel' : 'darkMetal',
    mb: leaf,
    x: cx,
    y: 0,
    z: cz,
    yaw: 0,
    ref: d.id,
    axis: d.axis,
    slide: alongX ? [w * 0.97, 0, 0] : [0, 0, w * 0.97],
  });
  // status LED and card/keypad reader on both sides
  for (const side of [-1, 1]) {
    const mb = new MeshBuilder();
    mb.box(0, 0, 0, 0.05, 0.05, 0.05);
    const ox = 1.12;
    const oz = side * 0.24;
    const x = alongX ? cx + ox : cx + oz;
    const z = alongX ? cz + oz : cz + ox;
    if (d.card || d.code || d.power || d.flag) {
      if (alongX) b.get('plasticDark').box(x, 1.25, z, 0.14, 0.2, 0.05);
      else b.get('plasticDark').box(x, 1.25, z, 0.05, 0.2, 0.14);
    }
    dyn.push({ key: `led:${d.id}:${side}`, kind: 'led', mat: 'plastic', mb, x, y: 1.42, z, yaw: 0, ref: d.id });
  }
}

function shelfModel(mb: MeshBuilder, w: number, h: number, d: number) {
  for (const sx of [-w / 2 + 0.03, w / 2 - 0.03]) mb.box(sx, h / 2, 0, 0.05, h, d);
  for (let y = 0.1; y < h; y += h / 5) mb.box(0, y, 0, w, 0.03, d);
}

function buildProp(b: Batches, dyn: DynDef[], p: PropDef, rng: Rng) {
  const put = placer(b, p);
  const S = PROP_SIZE[p.kind];
  const yaw = rotYaw(p.rot);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const world = (lx: number, lz: number): [number, number] => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
  const addDyn = (def: Omit<DynDef, 'x' | 'z' | 'yaw'> & { lx: number; lz: number }) => {
    const [x, z] = world(def.lx, def.lz);
    dyn.push({ ...def, x, z, yaw });
  };
  switch (p.kind) {
    case 'desk':
      put('wood', 0, 0.76, 0, S.w, 0.04, S.d);
      for (const [lx, lz] of [
        [-0.75, -0.35],
        [0.75, -0.35],
        [-0.75, 0.35],
        [0.75, 0.35],
      ])
        put('steel', lx, 0.37, lz, 0.04, 0.74, 0.04);
      put('darkMetal', 0.5, 0.45, 0, 0.42, 0.6, 0.7);
      put('darkMetal', 0, 0.45, 0.36, 1.5, 0.5, 0.02);
      break;
    case 'counter':
      put('wood', 0, 1.03, 0, S.w, 0.05, S.d + 0.1);
      put('wall', 0, 0.5, 0.33, S.w, 1.0, 0.1);
      put('darkMetal', 0, 0.74, -0.2, S.w, 0.04, 0.5);
      put('darkMetal', -1.45, 0.5, -0.05, 0.06, 1.0, 0.7);
      put('darkMetal', 1.45, 0.5, -0.05, 0.06, 1.0, 0.7);
      break;
    case 'chair':
      put('fabric', 0, 0.46, 0, 0.46, 0.07, 0.46);
      put('fabric', 0, 0.78, 0.21, 0.44, 0.5, 0.05);
      put('steel', 0, 0.23, 0, 0.04, 0.44, 0.04);
      put('steel', 0, 0.03, 0, 0.5, 0.03, 0.06);
      put('steel', 0, 0.03, 0, 0.06, 0.03, 0.5);
      break;
    case 'terminal': {
      const y0 = 0.78;
      put('plastic', 0, y0 + 0.21, 0.05, 0.42, 0.36, 0.36);
      put('plastic', 0, y0 + 0.21, 0.28, 0.3, 0.28, 0.12);
      put('plasticDark', 0, y0 + 0.02, -0.25, 0.44, 0.03, 0.16);
      const mb = new MeshBuilder();
      mb.box(0, 0, 0, 0.34, 0.27, 0.01);
      addDyn({ key: `screen:${p.id}`, kind: 'screen', mat: 'plastic', mb, lx: 0, lz: -0.135, y: y0 + 0.22, screen: p.id });
      break;
    }
    case 'monitorWall': {
      put('darkMetal', 0, 1.25, 0.1, S.w, 2.3, 0.3);
      put('darkMetal', 0, 0.35, -0.1, S.w, 0.7, 0.4);
      const mb = new MeshBuilder();
      mb.box(0, 0, 0, 3.1, 1.5, 0.01);
      addDyn({ key: 'screen:wall', kind: 'screen', mat: 'plastic', mb, lx: 0, lz: -0.06, y: 1.55, screen: 'wall' });
      const fb = new MeshBuilder();
      fb.box(0, 0, 0, 1.0, 0.58, 0.01);
      addDyn({ key: 'screen:feed', kind: 'screen', mat: 'plastic', mb: fb, lx: 0.95, lz: -0.07, y: 1.17, screen: 'feed' });
      break;
    }
    case 'shelf': {
      for (const sx of [-S.w / 2 + 0.03, S.w / 2 - 0.03]) put('steel', sx, S.h / 2, 0, 0.05, S.h, S.d);
      for (let i = 0; i < 5; i++) {
        const y = 0.1 + i * 0.5;
        put('steel', 0, y, 0, S.w, 0.03, S.d);
        // binders, boxes
        let x = -S.w / 2 + 0.1;
        while (x < S.w / 2 - 0.15 && i < 4) {
          const w = rng.range(0.06, 0.3);
          const hgt = rng.range(0.22, 0.4);
          const mat: MatKey = rng.next() < 0.25 ? 'paper' : rng.next() < 0.5 ? 'plastic' : rng.next() < 0.6 ? 'plasticDark' : 'wood';
          if (rng.next() < 0.85) put(mat, x + w / 2, y + 0.015 + hgt / 2, rng.range(-0.04, 0.04), w * 0.92, hgt, S.d * 0.8);
          x += w + rng.range(0, 0.05);
        }
      }
      break;
    }
    case 'labTable':
      put('plasticDark', 0, 0.9, 0, S.w, 0.04, S.d);
      put('darkMetal', 0, 0.45, 0, S.w - 0.1, 0.8, S.d - 0.1);
      // equipment
      put('plastic', -0.6, 1.07, 0.1, 0.45, 0.3, 0.35);
      put('plasticDark', -0.6, 1.07, -0.08, 0.38, 0.22, 0.01);
      put('steel', 0.3, 0.98, -0.1, 0.5, 0.12, 0.3);
      put('steel', 0.8, 1.1, 0.25, 0.06, 0.36, 0.06);
      put('steel', 0.8, 1.27, 0.12, 0.04, 0.04, 0.3);
      break;
    case 'cabinet': {
      put('darkMetal', 0, S.h / 2, 0.02, S.w, S.h, S.d - 0.04);
      for (let y = 0.4; y < 1.8; y += 0.45) put('steel', 0, y, 0, S.w - 0.08, 0.02, S.d - 0.1);
      const mb = new MeshBuilder();
      mb.box(S.w / 2, 0, 0, S.w, S.h - 0.04, 0.03);
      mb.box(S.w - 0.08, 0.1, -0.03, 0.03, 0.2, 0.03);
      addDyn({ key: `cont:${p.id}`, kind: 'container', mat: 'darkMetal', mb, lx: -S.w / 2, lz: -S.d / 2, y: S.h / 2, ref: p.id });
      break;
    }
    case 'locker':
      put('darkMetal', 0, S.h / 2, 0, S.w, S.h, S.d);
      for (let y = 1.5; y < 1.85; y += 0.06) put('plasticDark', 0, y, -S.d / 2 - 0.005, S.w * 0.6, 0.025, 0.01);
      put('steel', S.w * 0.35, 1.0, -S.d / 2 - 0.02, 0.03, 0.18, 0.03);
      put('darkMetal', 0, S.h + 0.02, 0, S.w + 0.02, 0.04, S.d + 0.02);
      break;
    case 'generator':
      put('darkMetal', 0, 0.9, 0, S.w, 1.6, S.d);
      put('hazard', 0, 0.06, 0, S.w + 0.3, 0.12, S.d + 0.3);
      for (let i = -5; i <= 5; i++) put('steel', i * 0.13, 1.0, -S.d / 2 - 0.03, 0.03, 1.1, 0.04);
      put('rust', 1.1, 1.85, 0.2, 0.25, 0.3, 0.25);
      b.get('rust').cylinder(world(1.1, 0.2)[0], 2.5, world(1.1, 0.2)[1], 0.11, 1.4, 'y', 10);
      put('plastic', -1.0, 1.35, -S.d / 2 - 0.02, 0.5, 0.3, 0.04);
      break;
    case 'powerPanel': {
      put('darkMetal', 0, 1.0, 0.04, S.w, S.h, S.d - 0.08);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) put('plasticDark', -0.48 + k * 0.16, 0.6 + r * 0.22, -S.d / 2 + 0.02, 0.1, 0.16, 0.05);
      put('hazard', 0, 1.82, -S.d / 2 + 0.02, S.w - 0.1, 0.08, 0.03);
      const mb = new MeshBuilder();
      mb.box(0, 0, 0, 0.6, 0.3, 0.01);
      addDyn({ key: 'screen:panel', kind: 'screen', mat: 'plastic', mb, lx: 0, lz: -S.d / 2 + 0.01, y: 1.55, screen: 'panel' });
      break;
    }
    case 'crate':
      put('wood', 0, S.h / 2, 0, S.w, S.h, S.d);
      for (const y of [0.15, 0.75]) put('darkMetal', 0, y, 0, S.w + 0.02, 0.06, S.d + 0.02);
      break;
    case 'barrel':
      b.get('rust').cylinder(p.x, 0.47, p.z, 0.3, 0.94, 'y', 14);
      break;
    case 'board': {
      put('wood', 0, S.y0! + 0.5, 0, S.w + 0.06, 1.06, 0.04);
      put('cork', 0, S.y0! + 0.5, -0.025, S.w, 1.0, 0.02);
      for (let i = 0; i < 5; i++) put('paper', rng.range(-0.6, 0.6), S.y0! + rng.range(0.25, 0.8), -0.04, 0.21, 0.28, 0.005);
      break;
    }
    case 'radio': {
      put('darkMetal', 0, 0.4, 0, S.w, 0.8, S.d);
      put('plasticDark', 0, 0.98, 0.12, S.w - 0.1, 0.36, 0.36);
      for (let i = 0; i < 6; i++) b.get('steel').cylinder(world(-0.5 + i * 0.2, -0.08)[0], 0.88, world(-0.5 + i * 0.2, -0.08)[1], 0.025, 0.04, 'z', 8);
      b.get('steel').cylinder(world(0.55, 0.2)[0], 1.45, world(0.55, 0.2)[1], 0.012, 0.6, 'y', 6);
      const mb = new MeshBuilder();
      mb.box(0, 0, 0, 0.7, 0.2, 0.01);
      addDyn({ key: 'screen:radio', kind: 'screen', mat: 'plastic', mb, lx: -0.1, lz: -0.065, y: 1.02, screen: 'radio' });
      break;
    }
    case 'lift': {
      put('hazard', 0, 2.75, 0.02, S.w + 0.4, 0.14, 0.3);
      put('darkMetal', -S.w / 2 - 0.12, 1.35, 0.02, 0.24, 2.7, 0.3);
      put('darkMetal', S.w / 2 + 0.12, 1.35, 0.02, 0.24, 2.7, 0.3);
      put('darkMetal', 0, 1.35, 0.6, S.w, 2.7, 0.05);
      for (const side of [-1, 1]) {
        const mb = new MeshBuilder();
        mb.box(0, 0, 0, S.w / 2, 2.6, 0.06);
        addDyn({ key: `lift:${side}`, kind: 'lift', mat: 'steel', mb, lx: (side * S.w) / 4, lz: 0, y: 1.3, slide: [side * S.w * 0.48, 0, 0] });
      }
      put('plasticDark', S.w / 2 + 0.45, 1.3, -0.15, 0.2, 0.3, 0.05);
      const mb = new MeshBuilder();
      mb.box(0, 0, 0, 0.12, 0.08, 0.01);
      addDyn({ key: 'screen:lift', kind: 'screen', mat: 'plastic', mb, lx: S.w / 2 + 0.45, lz: -0.18, y: 1.33, screen: 'lift' });
      break;
    }
    case 'chamberRig': {
      b.get('steel').cylinder(p.x, 0.4, p.z, 0.5, 0.8, 'y', 16);
      // a ring of microphones on a frame
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rx = p.x + Math.cos(a) * 1.15;
        const rz = p.z + Math.sin(a) * 1.15;
        b.get('steel').box(rx, 1.6, rz, 0.06, 0.06, 0.06);
        b.get('plasticDark').cylinder(rx - Math.cos(a) * 0.1, 1.6, rz - Math.sin(a) * 0.1, 0.03, 0.18, Math.abs(Math.cos(a)) > 0.7 ? 'x' : 'z', 8);
        const a2 = ((i + 1) / 16) * Math.PI * 2;
        const mx = p.x + ((Math.cos(a) + Math.cos(a2)) / 2) * 1.15;
        const mz = p.z + ((Math.sin(a) + Math.sin(a2)) / 2) * 1.15;
        b.get('steel').box(mx, 1.6, mz, Math.abs(Math.sin((a + a2) / 2)) * 0.45 + 0.04, 0.03, Math.abs(Math.cos((a + a2) / 2)) * 0.45 + 0.04);
      }
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        b.get('steel').box(p.x + dx * 0.6, 1.2, p.z + dz * 0.6, dx ? 1.1 : 0.04, 0.04, dz ? 1.1 : 0.04);
      b.get('steel').cylinder(p.x, 2.4, p.z, 0.03, 1.6, 'y', 6);
      break;
    }
    case 'switch': {
      put('darkMetal', 0, S.y0! + 0.35, 0, S.w, S.h, S.d);
      put('hazard', 0, S.y0! + 0.72, 0, S.w, 0.06, S.d);
      const mb = new MeshBuilder();
      mb.box(0, 0.12, 0, 0.05, 0.25, 0.05);
      addDyn({ key: 'lever', kind: 'lever', mat: 'hazard', mb, lx: 0, lz: -S.d / 2 - 0.03, y: S.y0! + 0.32, ref: p.id });
      break;
    }
    case 'charger': {
      put('plasticDark', 0, S.y0! + 0.25, 0, S.w, S.h, S.d);
      const mb = new MeshBuilder();
      mb.box(0, 0, 0, 0.05, 0.05, 0.02);
      addDyn({ key: 'led:charger', kind: 'led', mat: 'plastic', mb, lx: 0.2, lz: -S.d / 2, y: S.y0! + 0.4, ref: 'charger' });
      break;
    }
    case 'filing': {
      put('darkMetal', 0, S.h / 2, 0.03, S.w, S.h, S.d - 0.06);
      for (let i = 0; i < 4; i++) {
        const y = 0.17 + i * 0.31;
        if (p.id === 'drawer_archive' && i === 2) {
          const mb = new MeshBuilder();
          mb.box(0, 0, 0, S.w - 0.04, 0.28, 0.03);
          mb.box(0, 0, 0.25, S.w - 0.08, 0.2, 0.5);
          mb.box(0, 0.05, -0.03, 0.14, 0.03, 0.03);
          addDyn({ key: `cont:${p.id}`, kind: 'container', mat: 'darkMetal', mb, lx: 0, lz: -S.d / 2, y, ref: p.id, slide: [0, 0, -0.45] });
          continue;
        }
        put('darkMetal', 0, y, -S.d / 2 + 0.015, S.w - 0.04, 0.28, 0.03);
        put('steel', 0, y + 0.05, -S.d / 2, 0.14, 0.03, 0.03);
      }
      break;
    }
    case 'bench':
      put('wood', 0, 0.44, 0, S.w, 0.05, S.d);
      for (const lx of [-0.8, 0.8]) put('steel', lx, 0.21, 0, 0.05, 0.42, S.d - 0.05);
      break;
  }
}

export { FLOOR };
