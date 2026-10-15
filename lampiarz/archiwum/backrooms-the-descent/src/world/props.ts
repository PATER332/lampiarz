// Furniture and machinery modelled from simple solids. Every model is built in
// local space: origin on the floor at the centre of the footprint, front facing -Z.
import { MeshBuilder } from '../engine/mesh';
import { Rng } from '../engine/math';
import type { PropKind } from './map';
import type { MatKey } from './materials';

export type Parts = Map<MatKey, MeshBuilder>;

export class PartSet {
  parts: Parts = new Map();
  get(m: MatKey) {
    let b = this.parts.get(m);
    if (!b) {
      b = new MeshBuilder();
      this.parts.set(m, b);
    }
    return b;
  }
}

const box = (s: PartSet, mat: MatKey, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, uv = 1, rotY = 0) => s.get(mat).box(cx, cy, cz, sx, sy, sz, { uv, rotY });

function chair(s: PartSet, x: number, y: number, z: number, rot: number, tilt = 0) {
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  const P = (lx: number, lz: number): [number, number] => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  const [sx, sz] = P(0, 0);
  box(s, 'plasticDark', sx, y + 0.45, sz, 0.46, 0.04, 0.44, 1, rot);
  const [bx, bz] = P(0, 0.2 + tilt * 0.1);
  box(s, 'plasticDark', bx, y + 0.72, bz, 0.44, 0.42, 0.04, 1, rot);
  for (const [lx, lz] of [
    [-0.2, -0.19],
    [0.2, -0.19],
    [-0.2, 0.19],
    [0.2, 0.19],
  ]) {
    const [px, pz] = P(lx, lz);
    s.get('steel').cylinder(px, y + 0.22, pz, 0.014, 0.44, 'y', 6);
  }
}

export function buildProp(kind: PropKind, seed = 1): PartSet {
  const s = new PartSet();
  const r = new Rng(seed);
  switch (kind) {
    case 'locker': {
      box(s, 'paint', 0, 1.0, 0.03, 0.9, 2.0, 0.54);
      box(s, 'paint', 0, 1.0, -0.255, 0.84, 1.92, 0.03);
      box(s, 'darkMetal', 0, 1.0, -0.272, 0.02, 1.9, 0.01);
      for (let i = 0; i < 5; i++) {
        box(s, 'black', -0.22, 1.55 + i * 0.06, -0.272, 0.24, 0.018, 0.01);
        box(s, 'black', 0.22, 1.55 + i * 0.06, -0.272, 0.24, 0.018, 0.01);
      }
      box(s, 'steel', -0.06, 1.05, -0.285, 0.03, 0.16, 0.03);
      box(s, 'steel', 0.06, 1.05, -0.285, 0.03, 0.16, 0.03);
      break;
    }
    case 'table': {
      box(s, 'wood', 0, 0.76, 0, 1.8, 0.05, 0.9);
      for (const [x, z] of [
        [-0.84, -0.38],
        [0.84, -0.38],
        [-0.84, 0.38],
        [0.84, 0.38],
      ])
        box(s, 'steel', x, 0.37, z, 0.05, 0.74, 0.05);
      box(s, 'steel', 0, 0.68, 0.4, 1.6, 0.06, 0.02);
      break;
    }
    case 'desk': {
      box(s, 'wood', 0, 0.76, 0, 1.5, 0.04, 0.75);
      box(s, 'wood', -0.72, 0.37, 0, 0.04, 0.74, 0.72);
      box(s, 'wood', 0.72, 0.37, 0, 0.04, 0.74, 0.72);
      box(s, 'wood', 0, 0.4, 0.34, 1.42, 0.5, 0.02);
      box(s, 'wood', 0.45, 0.6, -0.1, 0.4, 0.2, 0.55);
      box(s, 'steel', 0.45, 0.6, -0.38, 0.12, 0.02, 0.02);
      break;
    }
    case 'chair':
      chair(s, 0, 0, 0, 0);
      break;
    case 'chairStack': {
      // a tower of chairs, the kind of thing you only find here
      for (let i = 0; i < 7; i++) chair(s, r.range(-0.2, 0.2), i * 0.3, r.range(-0.15, 0.15), r.range(-0.6, 0.6) + (i % 2) * Math.PI, r.next());
      break;
    }
    case 'cabinet': {
      box(s, 'paint', 0, 0.65, 0, 1.0, 1.3, 0.5);
      for (let i = 0; i < 3; i++) {
        box(s, 'darkMetal', 0, 0.3 + i * 0.4, -0.252, 0.92, 0.01, 0.01);
        box(s, 'steel', 0, 0.45 + i * 0.4, -0.27, 0.16, 0.025, 0.03);
      }
      break;
    }
    case 'clock': {
      const y = 1.86;
      s.get('darkMetal').cylinder(0, y, -0.0, 0.215, 0.07, 'z', 24);
      break;
    }
    case 'radio': {
      const y = 0.78;
      box(s, 'darkMetal', 0, y + 0.2, 0, 0.8, 0.4, 0.4);
      box(s, 'black', -0.2, y + 0.2, -0.205, 0.32, 0.3, 0.01);
      s.get('steel').cylinder(0.22, y + 0.24, -0.215, 0.06, 0.04, 'z', 14);
      s.get('steel').cylinder(0.32, y + 0.1, -0.215, 0.03, 0.04, 'z', 10);
      s.get('steel').cylinder(0.3, y + 0.62, 0.1, 0.008, 0.45, 'y', 5);
      break;
    }
    case 'console': {
      box(s, 'darkMetal', 0, 0.38, 0.05, 2.2, 0.76, 0.7);
      box(s, 'plasticDark', 0, 0.78, -0.05, 2.0, 0.04, 0.6);
      for (const x of [-0.7, 0, 0.7]) {
        box(s, 'plasticDark', x, 1.06, 0.12, 0.62, 0.48, 0.38);
        box(s, 'black', x, 1.06, -0.075, 0.54, 0.4, 0.01);
      }
      box(s, 'plasticDark', 0.0, 0.81, -0.25, 0.5, 0.03, 0.18);
      break;
    }
    case 'generator': {
      box(s, 'rust', 0, 0.12, 0, 2.6, 0.24, 1.4);
      box(s, 'darkMetal', -0.35, 0.75, 0, 1.6, 1.0, 1.1);
      s.get('rust').cylinder(0.85, 0.7, 0, 0.42, 1.1, 'z', 18);
      s.get('darkMetal').cylinder(-0.6, 1.45, 0.3, 0.07, 1.2, 'y', 10);
      box(s, 'hazard', -0.35, 1.27, -0.56, 1.5, 0.04, 0.02);
      for (let i = 0; i < 6; i++) box(s, 'steel', -0.9 + i * 0.22, 0.75, -0.56, 0.05, 0.8, 0.02);
      break;
    }
    case 'genPanel': {
      box(s, 'darkMetal', 0, 1.3, 0, 1.1, 0.8, 0.12);
      // pump lever, choke knob, starter button
      box(s, 'steel', -0.35, 1.3, -0.1, 0.06, 0.28, 0.06);
      s.get('steel').cylinder(0, 1.3, -0.09, 0.07, 0.06, 'z', 14);
      s.get('plasticRed').cylinder(0.35, 1.3, -0.09, 0.07, 0.06, 'z', 14);
      box(s, 'hazard', 0, 1.66, -0.065, 1.0, 0.05, 0.01);
      break;
    }
    case 'uvSwitch': {
      box(s, 'plastic', 0, 1.37, 0, 0.18, 0.28, 0.05);
      box(s, 'plasticDark', 0, 1.39, -0.035, 0.05, 0.1, 0.03);
      break;
    }
    case 'board': {
      box(s, 'wood', 0, 1.55, 0.01, 2.26, 1.36, 0.04);
      break;
    }
    case 'keypad': {
      box(s, 'darkMetal', 0, 1.38, 0, 0.3, 0.45, 0.06);
      for (let i = 0; i < 12; i++) box(s, 'steel', -0.07 + (i % 3) * 0.07, 1.3 - Math.floor(i / 3) * 0.06 + 0.06, -0.035, 0.05, 0.04, 0.02);
      break;
    }
    case 'gunTable': {
      box(s, 'steel', 0, 0.83, 0, 1.8, 0.04, 0.9);
      box(s, 'fabric', 0, 0.855, 0, 1.6, 0.01, 0.7);
      for (const [x, z] of [
        [-0.84, -0.4],
        [0.84, -0.4],
        [-0.84, 0.4],
        [0.84, 0.4],
      ])
        box(s, 'darkMetal', x, 0.41, z, 0.06, 0.82, 0.06);
      box(s, 'darkMetal', 0, 0.2, 0, 1.7, 0.03, 0.8);
      break;
    }
    case 'ammoCrate': {
      box(s, 'rust', 0, 0.2, 0, 0.7, 0.4, 0.45);
      box(s, 'darkMetal', 0, 0.41, 0, 0.72, 0.03, 0.47);
      box(s, 'steel', 0, 0.3, -0.23, 0.2, 0.06, 0.02);
      break;
    }
    case 'lever': {
      box(s, 'darkMetal', 0, 1.0, 0.05, 0.6, 1.0, 0.2);
      box(s, 'hazard', 0, 1.55, -0.06, 0.6, 0.08, 0.02);
      break;
    }
    case 'anchor': {
      // the machine: a base, three rings and pylons; the core is drawn separately
      s.get('darkMetal').cylinder(0, 0.15, 0, 1.6, 0.3, 'y', 32);
      s.get('rust').cylinder(0, 0.4, 0, 1.2, 0.2, 'y', 32);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        box(s, 'darkMetal', Math.cos(a) * 1.35, 1.3, Math.sin(a) * 1.35, 0.18, 2.4, 0.18, 1, -a);
      }
      for (const y of [1.0, 2.2]) {
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          box(s, 'steel', Math.cos(a) * 1.35, y, Math.sin(a) * 1.35, 0.4, 0.08, 0.08, 1, -a + Math.PI / 2);
        }
      }
      s.get('black').cylinder(0, 2.6, 0, 0.5, 0.3, 'y', 20);
      break;
    }
    case 'terminal': {
      box(s, 'darkMetal', 0, 0.55, 0.05, 0.9, 1.1, 0.5);
      box(s, 'plasticDark', 0, 1.2, 0.05, 0.86, 0.36, 0.42);
      box(s, 'black', 0, 1.2, -0.17, 0.7, 0.28, 0.01);
      box(s, 'plasticDark', 0, 0.95, -0.25, 0.7, 0.04, 0.2);
      break;
    }
    case 'liftPanel': {
      box(s, 'steel', 0, 1.37, 0, 0.35, 0.55, 0.05);
      break;
    }
    case 'tapeDeck': {
      const y = 0.78;
      box(s, 'darkMetal', 0, y + 0.12, 0, 0.7, 0.24, 0.4);
      for (const x of [-0.17, 0.17]) s.get('plasticDark').cylinder(x, y + 0.25, -0.02, 0.11, 0.02, 'y', 18);
      box(s, 'steel', 0, y + 0.1, -0.205, 0.5, 0.06, 0.01);
      break;
    }
    case 'mattress': {
      box(s, 'fabric', 0, 0.11, 0, 1.0, 0.22, 2.0);
      box(s, 'plastic', 0, 0.25, 0.75, 0.6, 0.1, 0.35);
      break;
    }
    case 'sleepingBag': {
      s.get('orange').lathe(
        [
          [-0.95, 0.001],
          [-0.9, 0.12],
          [-0.6, 0.16],
          [0.6, 0.16],
          [0.85, 0.12],
          [0.95, 0.001],
        ],
        14,
        { sx: 2.4, sz: 0.55, off: [0, 0.09, 0] },
      );
      break;
    }
    case 'barrel': {
      s.get('rust').cylinder(0, 0.45, 0, 0.3, 0.9, 'y', 18);
      for (const y of [0.25, 0.65]) s.get('darkMetal').cylinder(0, y, 0, 0.31, 0.04, 'y', 18, { caps: false });
      break;
    }
    case 'boxes': {
      // a leaning stack of taped cardboard boxes
      let y = 0;
      const n = 2 + Math.floor(r.next() * 2);
      for (let i = 0; i < n; i++) {
        const w = 0.9 - i * 0.12 - r.next() * 0.1;
        const h = 0.3 + r.next() * 0.12;
        const ox = r.range(-0.05, 0.05);
        box(s, 'cardboard', ox, y + h / 2, 0, w, h, 0.5 - i * 0.04, 1, r.range(-0.12, 0.12));
        box(s, 'paper', ox, y + h + 0.002, 0, 0.06, 0.004, 0.5 - i * 0.04 + 0.004);
        y += h;
      }
      break;
    }
    case 'crate': {
      box(s, 'cardboard', 0, 0.4, 0, 1.0, 0.8, 1.0);
      box(s, 'cardboard', r.range(-0.1, 0.1), 1.0, r.range(-0.1, 0.1), 0.6, 0.4, 0.6, 1, r.range(-0.3, 0.3));
      break;
    }
    case 'body': {
      // a figure under a tarp, one hand out
      s.get('fabric').lathe(
        [
          [-0.9, 0.001],
          [-0.82, 0.14],
          [-0.4, 0.17],
          [0.1, 0.24],
          [0.45, 0.2],
          [0.62, 0.14],
          [0.8, 0.16],
          [0.92, 0.001],
        ],
        12,
        { sx: 1, sz: 1.6, off: [0, 0.1, 0], noise: (a, y) => Math.sin(a * 3 + y * 7) * 0.08 },
      );
      const hand = new MeshBuilder();
      hand.limb(0.45, 0.05, 0.035, 8);
      const m = new Float32Array([0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0.32, 0.08, 0.2, 1]);
      s.get('skinHand').mergeTransformed(hand, m);
      break;
    }
    case 'camera': {
      box(s, 'plastic', 0, 2.4, 0, 0.2, 0.16, 0.32);
      s.get('black').cylinder(0, 2.4, -0.18, 0.05, 0.06, 'z', 12);
      box(s, 'darkMetal', 0, 2.55, 0.12, 0.05, 0.2, 0.05);
      break;
    }
    case 'vent': {
      // the dark duct mouth and the frame; the grate itself is a moving part (ventGrate)
      box(s, 'black', 0, 0.45, 0.02, 0.76, 0.56, 0.02);
      box(s, 'darkMetal', -0.38, 0.45, -0.0, 0.03, 0.6, 0.05);
      box(s, 'darkMetal', 0.38, 0.45, -0.0, 0.03, 0.6, 0.05);
      box(s, 'darkMetal', 0, 0.76, -0.0, 0.79, 0.03, 0.05);
      break;
    }
    case 'backpack': {
      s.get('orange').lathe(
        [
          [0, 0.001],
          [0.03, 0.18],
          [0.35, 0.2],
          [0.52, 0.12],
          [0.56, 0.001],
        ],
        12,
        { sx: 1.1, sz: 0.7 },
      );
      break;
    }
    case 'rack': {
      for (const x of [-0.75, 0.75]) box(s, 'steel', x, 0.95, 0, 0.05, 1.9, 0.45);
      for (const y of [0.4, 0.95, 1.5]) box(s, 'steel', 0, y, 0, 1.5, 0.03, 0.45);
      box(s, 'rust', -0.3, 0.55, 0, 0.5, 0.28, 0.35);
      box(s, 'darkMetal', 0.35, 1.1, 0, 0.4, 0.28, 0.3);
      break;
    }
    case 'wallPanel':
      break;
  }
  return s;
}

/** A metal shelving unit filling one 2 m cell (storage complex). */
export function shelfUnit(s: PartSet, cx: number, cz: number, seed: number) {
  const r = new Rng(seed);
  const x0 = cx - 0.95;
  const x1 = cx + 0.95;
  for (const x of [x0 + 0.03, x1 - 0.03]) for (const z of [cz - 0.85, cz + 0.85]) box(s, 'steel', x, 1.25, z, 0.05, 2.5, 0.05);
  for (const y of [0.15, 0.85, 1.55, 2.25]) {
    box(s, 'darkMetal', cx, y, cz, 1.9, 0.04, 1.75);
    // boxes on the shelf
    let x = x0 + 0.1;
    while (x < x1 - 0.3) {
      const w = r.range(0.3, 0.6);
      if (r.next() < 0.82) {
        const hgt = r.range(0.25, 0.55);
        const d = r.range(0.5, 1.5);
        box(s, r.next() < 0.85 ? 'cardboard' : 'plastic', x + w / 2, y + 0.02 + hgt / 2, cz + r.range(-0.1, 0.1), w - 0.04, hgt, d, 1, r.range(-0.05, 0.05));
      }
      x += w;
    }
  }
}

/** Stacked crates and pallets filling one cell. */
export function crateStack(s: PartSet, cx: number, cz: number, seed: number, red: boolean) {
  const r = new Rng(seed);
  box(s, 'wood', cx, 0.07, cz, 1.8, 0.14, 1.8);
  const n = r.int(2, 4);
  for (let i = 0; i < n; i++) {
    const w = r.range(0.7, 0.95);
    const hgt = r.range(0.6, 0.9);
    const ox = (i % 2 === 0 ? -0.45 : 0.45) + r.range(-0.05, 0.05);
    const oz = (i < 2 ? -0.45 : 0.45) + r.range(-0.05, 0.05);
    box(s, red ? 'rust' : 'cardboard', cx + ox, 0.14 + hgt / 2, cz + oz, w, hgt, w, 1, r.range(-0.2, 0.2));
    if (r.next() < 0.5) box(s, 'cardboard', cx + ox, 0.14 + hgt + 0.25, cz + oz, w * 0.8, 0.5, w * 0.8, 1, r.range(-0.4, 0.4));
  }
}

/** The louvred grate of a vent, hinged along its top edge (local origin = the hinge). */
export function ventGrate(): PartSet {
  const s = new PartSet();
  for (let i = 0; i < 7; i++) box(s, 'darkMetal', 0, 0.2 + i * 0.075 - 0.74, -0.03, 0.72, 0.02, 0.04);
  box(s, 'darkMetal', -0.35, 0.45 - 0.74, -0.03, 0.025, 0.56, 0.02);
  box(s, 'darkMetal', 0.35, 0.45 - 0.74, -0.03, 0.025, 0.56, 0.02);
  return s;
}
