// Walkability, collisions, line of sight and path finding on the 2 m grid.
import { buildLayout, CELL, GRID_H, GRID_W, type ZoneId } from './layout';
import { DOORS, PROPS, PROP_SIZE, type DoorDef, type PropDef } from './map';

/** furniture occupancy grid: cells per metre */
const OCC = 4;
const OW = 60 * 2 * OCC;
const OH = 56 * 2 * OCC;

export const SOLID = 0;
export const FLOOR = 1;
export const DOOR = 2;
export const WET = 3;
export const SHELF = 4;
export const CRATE = 5;
export const PILLAR = 6;

export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0?: number;
  y1?: number;
}

export const rotYaw = (rot: number) => (rot * Math.PI) / 2;

/** World-space footprint of a prop (rotation in quarter turns, fractional allowed for free props). */
export function propBox(p: PropDef): Box & { y0: number; y1: number } {
  const s = PROP_SIZE[p.kind];
  const q = Math.round(p.rot) % 2 !== 0;
  const hw = (q ? s.d : s.w) / 2;
  const hd = (q ? s.w : s.d) / 2;
  const y0 = p.y ?? s.y0 ?? 0;
  return { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd, y0, y1: y0 + s.h };
}

export class Level {
  grid = new Uint8Array(GRID_W * GRID_H);
  zones: (ZoneId | null)[] = new Array(GRID_W * GRID_H).fill(null);
  doorCells = new Map<number, DoorDef>();
  propBoxes: { box: Box; prop: PropDef }[] = [];

  constructor() {
    const L = buildLayout();
    for (let z = 0; z < GRID_H; z++)
      for (let x = 0; x < GRID_W; x++) {
        const ch = L.chars[z][x];
        const i = this.idx(x, z);
        this.grid[i] = ch === '.' ? FLOOR : ch === '~' ? WET : ch === 'D' ? DOOR : ch === '=' ? SHELF : ch === 'c' ? CRATE : ch === 'o' ? PILLAR : SOLID;
        this.zones[i] = L.zones[z][x];
      }
    for (const d of DOORS) {
      const i = this.idx(d.cx, d.cz);
      if (this.grid[i] !== DOOR) throw new Error(`door ${d.id} not on a door cell`);
      this.doorCells.set(i, d);
      // a door belongs to the zone it leads into (the non-corridor side)
      const a = d.axis === 'x' ? this.zoneOfCell(d.cx - 1, d.cz) : this.zoneOfCell(d.cx, d.cz - 1);
      const b = d.axis === 'x' ? this.zoneOfCell(d.cx + 1, d.cz) : this.zoneOfCell(d.cx, d.cz + 1);
      this.zones[i] = a ?? b;
    }
    for (const p of PROPS) if (PROP_SIZE[p.kind].collide) this.propBoxes.push({ box: propBox(p), prop: p });
    // furniture on a fine grid (0.25 m), so paths can steer around it
    for (const { box } of this.propBoxes)
      for (let z = Math.floor(box.z0 * OCC); z < Math.ceil(box.z1 * OCC); z++)
        for (let x = Math.floor(box.x0 * OCC); x < Math.ceil(box.x1 * OCC); x++) if (x >= 0 && z >= 0 && x < OW && z < OH) this.occ[z * OW + x] = 1;
    // cells whose middle is taken by furniture: walkable around it, but costly for paths
    for (let z = 0; z < GRID_H; z++)
      for (let x = 0; x < GRID_W; x++) {
        const cx = x * CELL + CELL / 2;
        const cz = z * CELL + CELL / 2;
        if (this.propBoxes.some(({ box }) => cx > box.x0 - 0.25 && cx < box.x1 + 0.25 && cz > box.z0 - 0.25 && cz < box.z1 + 0.25)) this.cluttered[this.idx(x, z)] = 1;
      }
  }
  private occ = new Uint8Array(OW * OH);
  readonly cluttered = new Uint8Array(GRID_W * GRID_H);
  /** a point inside a piece of furniture that blocks movement */
  occupied(x: number, z: number) {
    const ix = Math.floor(x * OCC);
    const iz = Math.floor(z * OCC);
    return ix >= 0 && iz >= 0 && ix < OW && iz < OH && this.occ[iz * OW + ix] === 1;
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
    const t = this.cell(cx, cz);
    return t === SOLID || t === SHELF || t === CRATE || t === PILLAR;
  }
  /** does this cell block sight (shelves are packed full; crates are chest-high and do not) */
  blocksSight(cx: number, cz: number) {
    const t = this.cell(cx, cz);
    return t === SOLID || t === SHELF || t === PILLAR;
  }
  isWet(x: number, z: number) {
    return this.cell(Math.floor(x / CELL), Math.floor(z / CELL)) === WET;
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

  /** Grid walk along a segment; false at the first blocking cell. */
  lineClear(ax: number, az: number, bx: number, bz: number, blocked?: (cx: number, cz: number) => boolean, sight = true): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / 0.2));
    let lcx = -1;
    let lcz = -1;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cx = Math.floor((ax + (bx - ax) * t) / CELL);
      const cz = Math.floor((az + (bz - az) * t) / CELL);
      if (cx === lcx && cz === lcz) continue;
      lcx = cx;
      lcz = cz;
      if (sight ? this.blocksSight(cx, cz) : this.isSolid(cx, cz)) return false;
      if (blocked && blocked(cx, cz)) {
        // a closed door blocks only where the line actually crosses its leaf, so
        // someone standing in the doorway recess in front of it is still in view
        const door = this.doorAtCell(cx, cz);
        if (!door) return false;
        const plane = (door.axis === 'x' ? cx : cz) * CELL + CELL / 2;
        const a0 = door.axis === 'x' ? ax : az;
        const a1 = door.axis === 'x' ? bx : bz;
        if (a1 === a0) continue;
        const k = (plane - a0) / (a1 - a0);
        if (k < 0 || k > 1) continue;
        const other = door.axis === 'x' ? az + (bz - az) * k : ax + (bx - ax) * k;
        const lo = (door.axis === 'x' ? cz : cx) * CELL;
        if (other >= lo - 0.05 && other <= lo + CELL + 0.05) return false;
      }
    }
    return true;
  }

  /** A* over walkable cells (4-neighbour, then string-pulled). `pass` decides about door cells. */
  path(fromX: number, fromZ: number, toX: number, toZ: number, pass: (d: DoorDef) => boolean, maxNodes = 2600): [number, number][] | null {
    const sx = Math.floor(fromX / CELL);
    const sz = Math.floor(fromZ / CELL);
    const tx = Math.floor(toX / CELL);
    const tz = Math.floor(toZ / CELL);
    if (this.isSolid(tx, tz) || !this.inside(sx, sz)) return null;
    const N = GRID_W * GRID_H;
    const g = new Float32Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const start = this.idx(sx, sz);
    const goal = this.idx(tx, tz);
    g[start] = 0;
    prev[start] = start;
    // binary heap of [f, idx]
    const heap: number[] = [];
    const hf: number[] = [];
    const push = (i: number, f: number) => {
      heap.push(i);
      hf.push(f);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (hf[p] <= hf[k]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        [hf[p], hf[k]] = [hf[k], hf[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const lastI = heap.pop()!;
      const lastF = hf.pop()!;
      if (heap.length) {
        heap[0] = lastI;
        hf[0] = lastF;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && hf[l] < hf[m]) m = l;
          if (r < heap.length && hf[r] < hf[m]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          [hf[m], hf[k]] = [hf[k], hf[m]];
          k = m;
        }
      }
      return top;
    };
    push(start, 0);
    let expanded = 0;
    while (heap.length) {
      const cur = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) break;
      if (++expanded > maxNodes) return null;
      const cx = cur % GRID_W;
      const cz = (cur / GRID_W) | 0;
      const here = this.doorCells.get(cur);
      for (let k = 0; k < 4; k++) {
        const dx = k === 0 ? 1 : k === 1 ? -1 : 0;
        const dz = k === 2 ? 1 : k === 3 ? -1 : 0;
        const nx = cx + dx;
        const nz = cz + dz;
        if (!this.inside(nx, nz)) continue;
        const n = this.idx(nx, nz);
        if (closed[n] || this.isSolid(nx, nz)) continue;
        const door = this.doorCells.get(n);
        if (door) {
          if ((door.axis === 'x' && dz !== 0) || (door.axis === 'z' && dx !== 0)) continue;
          if (!pass(door)) continue;
        }
        if (here && ((here.axis === 'x' && dz !== 0) || (here.axis === 'z' && dx !== 0))) continue;
        const ng = g[cur] + (this.cluttered[n] && n !== goal ? 6 : 1);
        if (ng < g[n]) {
          g[n] = ng;
          prev[n] = cur;
          push(n, ng + Math.abs(nx - tx) + Math.abs(nz - tz));
        }
      }
    }
    if (prev[goal] === -1) return null;
    const cells: number[] = [];
    for (let k = goal; k !== start; k = prev[k]) cells.push(k);
    cells.reverse();
    const pts = cells.map((k) => this.freePoint(k % GRID_W, (k / GRID_W) | 0));
    return this.smooth([fromX, fromZ], pts);
  }

  /** The cell's centre, or the free spot nearest to it when furniture stands there. */
  freePoint(cx: number, cz: number): [number, number] {
    const [mx, mz] = this.cellCenter(cx, cz);
    if (!this.cluttered[this.idx(cx, cz)]) return [mx, mz];
    let best: [number, number] = [mx, mz];
    let bd = Infinity;
    for (let z = cz * CELL + 0.375; z < cz * CELL + CELL; z += 0.25)
      for (let x = cx * CELL + 0.375; x < cx * CELL + CELL; x += 0.25) {
        let free = true;
        for (const [dx, dz] of [[0, 0], [0.38, 0], [-0.38, 0], [0, 0.38], [0, -0.38]]) if (this.occupied(x + dx, z + dz) || this.isSolid(Math.floor((x + dx) / CELL), Math.floor((z + dz) / CELL))) free = false;
        const d = Math.hypot(x - mx, z - mz);
        if (free && d < bd) {
          bd = d;
          best = [x, z];
        }
      }
    return best;
  }

  /** Drop waypoints that can be skipped in a straight, door-free line. */
  private smooth(from: [number, number], pts: [number, number][]): [number, number][] {
    if (pts.length < 3) return pts;
    const out: [number, number][] = [];
    let anchor = from;
    let i = 0;
    while (i < pts.length) {
      let j = i;
      while (j + 1 < pts.length && this.wideClear(anchor[0], anchor[1], pts[j + 1][0], pts[j + 1][1])) j++;
      out.push(pts[j]);
      anchor = pts[j];
      i = j + 1;
    }
    return out;
  }

  /** a corridor of ±0.35 m around the segment is free of solid cells and doors */
  private wideClear(ax: number, az: number, bx: number, bz: number) {
    const d = Math.hypot(bx - ax, bz - az);
    if (d < 0.01) return true;
    const nx = -(bz - az) / d;
    const nz = (bx - ax) / d;
    for (const o of [-0.38, 0, 0.38]) {
      const steps = Math.ceil(d / 0.25);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = ax + (bx - ax) * t + nx * o;
        const z = az + (bz - az) * t + nz * o;
        const cx = Math.floor(x / CELL);
        const cz = Math.floor(z / CELL);
        if (this.isSolid(cx, cz) || this.doorCells.has(this.idx(cx, cz)) || this.occupied(x, z)) return false;
      }
    }
    return true;
  }

  /** Walkable cell centres of the given zones. */
  cellsOf(zones: ZoneId[]): [number, number][] {
    const out: [number, number][] = [];
    for (let z = 0; z < GRID_H; z++)
      for (let x = 0; x < GRID_W; x++) {
        const i = this.idx(x, z);
        const t = this.grid[i];
        if ((t === FLOOR || t === WET) && this.zones[i] && zones.includes(this.zones[i]!)) out.push(this.cellCenter(x, z));
      }
    return out;
  }
}

/** Push a circle out of an axis-aligned box; null when they do not overlap. */
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
