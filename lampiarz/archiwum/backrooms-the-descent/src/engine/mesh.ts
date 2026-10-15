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

  /**
   * Surface of revolution around the local Y axis. `profile` lists [y, radius]
   * from bottom to top; `sx`/`sz` squash the cross-section (ellipses).
   * Normals are computed from the profile slope, so organic shapes shade smoothly.
   */
  lathe(profile: [number, number][], seg: number, o: { sx?: number; sz?: number; uv?: number; off?: V3; noise?: (a: number, y: number) => number } = {}) {
    const sx = o.sx ?? 1;
    const sz = o.sz ?? 1;
    const off = o.off ?? [0, 0, 0];
    const k = o.uv ?? 1;
    const base = this.vertexCount;
    const rings = profile.length;
    for (let i = 0; i < rings; i++) {
      const [y, r0] = profile[i];
      const prev = profile[Math.max(0, i - 1)];
      const next = profile[Math.min(rings - 1, i + 1)];
      const dy = next[0] - prev[0];
      const dr = next[1] - prev[1];
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const r = r0 * (o.noise ? 1 + o.noise(a, y) : 1);
        this.pos.push(off[0] + ca * r * sx, off[1] + y, off[2] + sa * r * sz);
        // normal: perpendicular to the profile tangent, then squashed like the shape
        let nx = ca * dy / sx;
        let ny = -dr;
        let nz = sa * dy / sz;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
        this.nrm.push(nx, ny, nz);
        this.tan.push(-sa, 0, ca);
        this.uv.push((j / seg) * k, y * k);
      }
    }
    for (let i = 0; i < rings - 1; i++)
      for (let j = 0; j < seg; j++) {
        const a = base + i * (seg + 1) + j;
        const b = a + seg + 1;
        this.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }

  /** Ellipsoid centred at `c`. */
  ellipsoid(c: V3, rx: number, ry: number, rz: number, seg = 14, rings = 10, uv = 1) {
    const prof: [number, number][] = [];
    for (let i = 0; i <= rings; i++) {
      const t = -Math.PI / 2 + (i / rings) * Math.PI;
      prof.push([Math.sin(t) * ry, Math.max(0.0001, Math.cos(t))]);
    }
    this.lathe(prof, seg, { sx: rx, sz: rz, off: c, uv });
  }

  /**
   * A limb hanging from the origin down -Y: rounded joint at the top, tapering to
   * `r1` at length `len`, rounded at the bottom. Optional bulge (muscle) in the middle.
   */
  limb(len: number, r0: number, r1: number, seg = 10, o: { bulge?: number; sx?: number; sz?: number; uv?: number } = {}) {
    const prof: [number, number][] = [];
    const cap = 4;
    for (let i = 0; i <= cap; i++) {
      const t = (i / cap) * (Math.PI / 2);
      prof.push([-len - r1 * Math.cos(t) + 0, Math.max(0.0001, r1 * Math.sin(t))]);
    }
    const mid = 6;
    for (let i = 1; i < mid; i++) {
      const t = i / mid;
      const r = r1 + (r0 - r1) * t + Math.sin(t * Math.PI) * (o.bulge ?? 0);
      prof.push([-len + len * t, r]);
    }
    for (let i = 0; i <= cap; i++) {
      const t = (i / cap) * (Math.PI / 2);
      prof.push([r0 * Math.sin(t), Math.max(0.0001, r0 * Math.cos(t))]);
    }
    this.lathe(prof, seg, { sx: o.sx, sz: o.sz, uv: o.uv });
  }

  /** Append another builder transformed by a column-major 4×4 matrix (rigid + uniform scale). */
  mergeTransformed(o: MeshBuilder, m: Float32Array) {
    const base = this.vertexCount;
    for (let i = 0; i < o.pos.length; i += 3) {
      const x = o.pos[i];
      const y = o.pos[i + 1];
      const z = o.pos[i + 2];
      this.pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      for (const [src, dst] of [
        [o.nrm, this.nrm],
        [o.tan, this.tan],
      ]) {
        const a = src[i];
        const b = src[i + 1];
        const c = src[i + 2];
        const nx = m[0] * a + m[4] * b + m[8] * c;
        const ny = m[1] * a + m[5] * b + m[9] * c;
        const nz = m[2] * a + m[6] * b + m[10] * c;
        const l = Math.hypot(nx, ny, nz) || 1;
        dst.push(nx / l, ny / l, nz / l);
      }
    }
    for (const u of o.uv) this.uv.push(u);
    for (const i of o.idx) this.idx.push(i + base);
  }

  merge(o: MeshBuilder) {
    const base = this.vertexCount;
    for (const v of o.pos) this.pos.push(v);
    for (const v of o.nrm) this.nrm.push(v);
    for (const v of o.uv) this.uv.push(v);
    for (const v of o.tan) this.tan.push(v);
    for (const i of o.idx) this.idx.push(i + base);
  }

  build(gl: GL): Mesh {
    const big = this.vertexCount > 65000;
    return createMesh(gl, new Float32Array(this.pos), new Float32Array(this.nrm), new Float32Array(this.uv), new Float32Array(this.tan), big ? new Uint32Array(this.idx) : new Uint16Array(this.idx));
  }
}
