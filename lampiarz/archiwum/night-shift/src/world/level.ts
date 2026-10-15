// Logical level: the cell grid, zones, door cells and prop colliders.
// Pure data + geometry queries — no rendering here, so it runs in tests too.
import { CELL, DOORS, GRID_H, GRID_W, PROPS, ROOMS, type DoorDef, type PropDef, type PropKind, type ZoneId } from './map';

export const SOLID = 0;
export const FLOOR = 1;
export const DOOR = 2;

export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
}

/** Footprint (w × d, before rotation), height and whether the prop blocks movement. */
export const PROP_SIZE: Record<PropKind, { w: number; h: number; d: number; y0?: number; collide: boolean }> = {
  desk: { w: 1.6, h: 0.78, d: 0.8, collide: true },
  chair: { w: 0.5, h: 0.95, d: 0.5, collide: true },
  terminal: { w: 0.55, h: 0.45, d: 0.45, y0: 0.78, collide: false },
  monitorWall: { w: 3.4, h: 2.3, d: 0.5, collide: true },
  shelf: { w: 1.8, h: 2.2, d: 0.5, collide: true },
  labTable: { w: 2.2, h: 0.92, d: 1.0, collide: true },
  cabinet: { w: 0.9, h: 1.9, d: 0.5, collide: true },
  locker: { w: 0.9, h: 2.0, d: 0.6, collide: true },
  generator: { w: 3.0, h: 1.8, d: 1.8, collide: true },
  powerPanel: { w: 1.4, h: 2.0, d: 0.35, collide: true },
  crate: { w: 1.0, h: 0.9, d: 1.0, collide: true },
  barrel: { w: 0.62, h: 0.95, d: 0.62, collide: true },
  board: { w: 1.6, h: 1.0, d: 0.06, y0: 1.05, collide: false },
  radio: { w: 1.4, h: 1.15, d: 0.6, collide: true },
  lift: { w: 2.4, h: 2.7, d: 0.3, collide: true },
  chamberRig: { w: 2.6, h: 3.0, d: 2.6, collide: true },
  switch: { w: 0.5, h: 0.7, d: 0.18, y0: 1.0, collide: false },
  charger: { w: 0.6, h: 0.5, d: 0.25, y0: 1.0, collide: false },
  filing: { w: 0.55, h: 1.3, d: 0.65, collide: true },
  bench: { w: 1.8, h: 0.46, d: 0.45, collide: true },
  counter: { w: 3.0, h: 1.05, d: 0.8, collide: true },
};

export function propBox(p: PropDef): Box {
  const s = PROP_SIZE[p.kind];
  const odd = p.rot % 2 === 1;
  const w = odd ? s.d : s.w;
  const d = odd ? s.w : s.d;
  const y0 = s.y0 ?? 0;
  return { x0: p.x - w / 2, x1: p.x + w / 2, z0: p.z - d / 2, z1: p.z + d / 2, y0, y1: y0 + s.h };
}

/** Yaw for a prop rotation: rot 0 faces -Z, 1 faces -X, 2 faces +Z, 3 faces +X. */
export const rotYaw = (rot: number) => (rot * Math.PI) / 2;

export class Level {
  grid = new Uint8Array(GRID_W * GRID_H);
  zones: (ZoneId | null)[] = new Array(GRID_W * GRID_H).fill(null);
  doorCells = new Map<number, DoorDef>();
  propBoxes: { box: Box; prop: PropDef }[] = [];

  constructor() {
    for (const r of ROOMS)
      for (let z = r.z0; z <= r.z1; z++)
        for (let x = r.x0; x <= r.x1; x++) {
          const i = this.idx(x, z);
          this.grid[i] = r.solid ? SOLID : FLOOR;
          this.zones[i] = r.solid ? null : r.zone;
        }
    for (const d of DOORS) {
      const i = this.idx(d.cx, d.cz);
      this.grid[i] = DOOR;
      this.doorCells.set(i, d);
      // a door belongs to the zone on its "inner" side for lighting purposes
      const a = d.axis === 'x' ? this.zoneOfCell(d.cx - 1, d.cz) : this.zoneOfCell(d.cx, d.cz - 1);
      const b = d.axis === 'x' ? this.zoneOfCell(d.cx + 1, d.cz) : this.zoneOfCell(d.cx, d.cz + 1);
      this.zones[i] = a === 'korytarz' ? b ?? a : a ?? b;
    }
    for (const p of PROPS) if (PROP_SIZE[p.kind].collide) this.propBoxes.push({ box: propBox(p), prop: p });
  }

  idx(cx: number, cz: number) {
    return cz * GRID_W + cx;
  }
  inside(cx: number, cz: number) {
    return cx >= 0 && cz >= 0 && cx < GRID_W && cz < GRID_H;
  }
  cell(cx: number, cz: number) {
    return this.inside(cx, cz) ? this.grid[this.idx(cx, cz)] : SOLID;
  }
  isSolid(cx: number, cz: number) {
    return this.cell(cx, cz) === SOLID;
  }
  zoneOfCell(cx: number, cz: number): ZoneId | null {
    return this.inside(cx, cz) ? this.zones[this.idx(cx, cz)] : null;
  }
  zoneAt(x: number, z: number): ZoneId | null {
    return this.zoneOfCell(Math.floor(x / CELL), Math.floor(z / CELL));
  }
  doorAtCell(cx: number, cz: number): DoorDef | undefined {
    return this.doorCells.get(this.idx(cx, cz));
  }
  cellCenter(cx: number, cz: number): [number, number] {
    return [cx * CELL + CELL / 2, cz * CELL + CELL / 2];
  }

  /**
   * Walk the grid along a 2D segment. Returns false as soon as a solid cell (or a
   * cell rejected by `blocked`, e.g. a closed door) lies between the points.
   */
  lineClear(ax: number, az: number, bx: number, bz: number, blocked?: (cx: number, cz: number) => boolean): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / 0.25));
    let lcx = -1;
    let lcz = -1;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cx = Math.floor((ax + (bx - ax) * t) / CELL);
      const cz = Math.floor((az + (bz - az) * t) / CELL);
      if (cx === lcx && cz === lcz) continue;
      lcx = cx;
      lcz = cz;
      if (this.isSolid(cx, cz)) return false;
      if (blocked && blocked(cx, cz)) return false;
    }
    return true;
  }

  /** Breadth-first path over walkable cells; `pass` decides whether a door cell can be crossed. */
  path(fromX: number, fromZ: number, toX: number, toZ: number, pass: (d: DoorDef) => boolean): [number, number][] | null {
    const sx = Math.floor(fromX / CELL);
    const sz = Math.floor(fromZ / CELL);
    const tx = Math.floor(toX / CELL);
    const tz = Math.floor(toZ / CELL);
    if (this.isSolid(tx, tz) || this.isSolid(sx, sz)) return null;
    const prev = new Int32Array(GRID_W * GRID_H).fill(-1);
    const start = this.idx(sx, sz);
    const goal = this.idx(tx, tz);
    prev[start] = start;
    const q = [start];
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (c === goal) break;
      const cx = c % GRID_W;
      const cz = (c / GRID_W) | 0;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (!this.inside(nx, nz)) continue;
        const n = this.idx(nx, nz);
        if (prev[n] !== -1 || this.grid[n] === SOLID) continue;
        const door = this.doorCells.get(n);
        if (door) {
          // doors are crossed only along their axis
          if ((door.axis === 'x' && dz !== 0) || (door.axis === 'z' && dx !== 0)) continue;
          if (!pass(door)) continue;
        }
        const here = this.doorCells.get(c);
        if (here && ((here.axis === 'x' && dz !== 0) || (here.axis === 'z' && dx !== 0))) continue;
        prev[n] = c;
        q.push(n);
      }
    }
    if (prev[goal] === -1) return null;
    const out: [number, number][] = [];
    for (let c = goal; c !== start; c = prev[c]) out.push(this.cellCenter(c % GRID_W, (c / GRID_W) | 0));
    out.reverse();
    return out;
  }

  /** All walkable cell centres of the given zones (used for patrol targets). */
  cellsOf(zones: ZoneId[]): [number, number][] {
    const out: [number, number][] = [];
    for (let z = 0; z < GRID_H; z++)
      for (let x = 0; x < GRID_W; x++) {
        const i = this.idx(x, z);
        if (this.grid[i] === FLOOR && this.zones[i] && zones.includes(this.zones[i]!)) out.push(this.cellCenter(x, z));
      }
    return out;
  }
}

/** Push a circle (x, z, r) out of an axis-aligned box. Returns the corrected position or null if no overlap. */
export function pushOut(x: number, z: number, r: number, b: { x0: number; x1: number; z0: number; z1: number }): [number, number] | null {
  const cx = Math.max(b.x0, Math.min(x, b.x1));
  const cz = Math.max(b.z0, Math.min(z, b.z1));
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return [cx + (dx / d) * r, cz + (dz / d) * r];
  }
  // centre inside the box: leave through the nearest side
  const l = x - b.x0;
  const rr = b.x1 - x;
  const t = z - b.z0;
  const bb = b.z1 - z;
  const m = Math.min(l, rr, t, bb);
  if (m === l) return [b.x0 - r, z];
  if (m === rr) return [b.x1 + r, z];
  if (m === t) return [x, b.z0 - r];
  return [x, b.z1 + r];
}
