// Geometry builder: boxes, quads and cylinders with world-scaled UVs and tangents,
// batched into one mesh per material.
import { createMesh, type GL, type Mesh } from './gl';

type V3 = [number, number, number];

export class MeshBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  tan: number[] = [];
  idx: number[] = [];

  get vertexCount() {
    return this.pos.length / 3;
  }

  /** Quad from 4 corners (counter-clockwise seen from the front). */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, t: V3, uvs: [number, number][]) {
    const base = this.vertexCount;
    for (const [i, p] of [a, b, c, d].entries()) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.tan.push(t[0], t[1], t[2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /**
   * Axis-aligned box (optionally rotated around Y about its centre). UVs are in
   * metres × uvScale so textures keep their density whatever the box size.
   * `skip` omits faces: 'px','nx','py','ny','pz','nz'.
   */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, o: { uv?: number; rotY?: number; skip?: string[]; uvOff?: [number, number] } = {}) {
    const k = o.uv ?? 1;
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const r = o.rotY ?? 0;
    const cr = Math.cos(r);
    const sr = Math.sin(r);
    const off = o.uvOff ?? [0, 0];
    // local -> world (rotation about Y: x' = x cos + z sin, z' = -x sin + z cos)
    const P = (x: number, y: number, z: number): V3 => [cx + x * cr + z * sr, cy + y, cz - x * sr + z * cr];
    const D = (x: number, y: number, z: number): V3 => [x * cr + z * sr, y, -x * sr + z * cr];
    const skip = o.skip ?? [];
    const uvw = (u: number, v: number): [number, number] => [u * k + off[0], v * k + off[1]];
    if (!skip.includes('pz'))
      this.quad(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), D(0, 0, 1), D(1, 0, 0), [uvw(0, sy), uvw(sx, sy), uvw(sx, 0), uvw(0, 0)]);
    if (!skip.includes('nz'))
      this.quad(P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), D(0, 0, -1), D(-1, 0, 0), [uvw(0, sy), uvw(sx, sy), uvw(sx, 0), uvw(0, 0)]);
    if (!skip.includes('px'))
      this.quad(P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), D(1, 0, 0), D(0, 0, -1), [uvw(0, sy), uvw(sz, sy), uvw(sz, 0), uvw(0, 0)]);
    if (!skip.includes('nx'))
      this.quad(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), D(-1, 0, 0), D(0, 0, 1), [uvw(0, sy), uvw(sz, sy), uvw(sz, 0), uvw(0, 0)]);
    if (!skip.includes('py'))
      this.quad(P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), D(0, 1, 0), D(1, 0, 0), [uvw(0, sz), uvw(sx, sz), uvw(sx, 0), uvw(0, 0)]);
    if (!skip.includes('ny'))
      this.quad(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), D(0, -1, 0), D(1, 0, 0), [uvw(0, 0), uvw(sx, 0), uvw(sx, sz), uvw(0, sz)]);
  }

  /** Cylinder along an axis. */
  cylinder(cx: number, cy: number, cz: number, r: number, len: number, axis: 'x' | 'y' | 'z', seg = 12, o: { uv?: number; caps?: boolean } = {}) {
    const k = o.uv ?? 1;
    const map = (a: number, b: number, c: number): V3 => (axis === 'y' ? [a, c, b] : axis === 'x' ? [c, a, b] : [a, b, c]);
    const h = len / 2;
    const circ = 2 * Math.PI * r;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const p = (c: number, s: number, t: number): V3 => {
        const v = map(c * r, s * r, t);
        return [cx + v[0], cy + v[1], cz + v[2]];
      };
      const nn = (c: number, s: number) => map(c, s, 0);
      const am = (c0 + c1) / 2;
      const sm = (s0 + s1) / 2;
      const tg = map(-sm, am, 0);
      const u0 = (i / seg) * circ * k;
      const u1 = ((i + 1) / seg) * circ * k;
      const base = this.vertexCount;
      for (const [pt, n, uv] of [
        [p(c0, s0, -h), nn(c0, s0), [u0, len * k]],
        [p(c1, s1, -h), nn(c1, s1), [u1, len * k]],
        [p(c1, s1, h), nn(c1, s1), [u1, 0]],
        [p(c0, s0, h), nn(c0, s0), [u0, 0]],
      ] as [V3, V3, [number, number]][]) {
        this.pos.push(...pt);
        this.nrm.push(...n);
        this.tan.push(...tg);
        this.uv.push(...uv);
      }
      // winding so the outside is front-facing
      this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      if (o.caps !== false) {
        for (const side of [-1, 1]) {
          const cb = this.vertexCount;
          const n = map(0, 0, side);
          const t = map(1, 0, 0);
          for (const [c, s] of [
            [0, 0],
            [c0, s0],
            [c1, s1],
          ]) {
            this.pos.push(...p(c, s, side * h));
            this.nrm.push(...n);
            this.tan.push(...t);
            this.uv.push(c * r * k, s * r * k);
          }
          if (side > 0) this.idx.push(cb, cb + 1, cb + 2);
          else this.idx.push(cb, cb + 2, cb + 1);
        }
      }
    }
  }

  merge(o: MeshBuilder) {
    const base = this.vertexCount;
    this.pos.push(...o.pos);
    this.nrm.push(...o.nrm);
    this.uv.push(...o.uv);
    this.tan.push(...o.tan);
    for (const i of o.idx) this.idx.push(i + base);
  }

  build(gl: GL): Mesh {
    const big = this.vertexCount > 65000;
    return createMesh(gl, new Float32Array(this.pos), new Float32Array(this.nrm), new Float32Array(this.uv), new Float32Array(this.tan), big ? new Uint32Array(this.idx) : new Uint16Array(this.idx));
  }
}
