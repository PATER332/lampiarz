// Creature models: a bone hierarchy with a smooth, tapered mesh per bone (rigid
// skinning) and procedural animation driven by the monster's AI state.
// Limbs are modelled hanging along -Y from their joint; a positive X rotation
// swings a limb forward (towards -Z, the direction the creature faces).
import { compose, multiply, type Mat4 } from '../engine/math';
import { MeshBuilder } from '../engine/mesh';
import type { Monster, MonsterType } from '../game/monsters';
import type { MatKey } from './materials';

type V3 = [number, number, number];

export interface BoneDef {
  name: string;
  parent: number;
  offset: V3;
  parts: { mat: MatKey; mb: MeshBuilder }[];
  /** rest rotation (x, y, z) */
  rest?: V3;
}

export interface RigDef {
  type: MonsterType;
  bones: BoneDef[];
  /** bones that point up from their joint (spine, chest, neck, head): their X rotation is
   *  mirrored so that a positive value always means "lean forward", like for hanging limbs */
  up?: string[];
  /** joints that touch the floor, and how far the mesh reaches below each joint */
  contacts: { bone: string; clear: number }[];
}

class RB {
  bones: BoneDef[] = [];
  add(name: string, parent: string | null, offset: V3, rest?: V3) {
    const p = parent === null ? -1 : this.bones.findIndex((b) => b.name === parent);
    if (parent !== null && p < 0) throw new Error(`no bone ${parent}`);
    this.bones.push({ name, parent: p, offset, parts: [], rest });
    return this;
  }
  part(bone: string, mat: MatKey, build: (mb: MeshBuilder) => void, xf?: Mat4) {
    const b = this.bones.find((x) => x.name === bone)!;
    const mb = new MeshBuilder();
    build(mb);
    if (xf) {
      const t = new MeshBuilder();
      t.mergeTransformed(mb, xf);
      b.parts.push({ mat, mb: t });
    } else b.parts.push({ mat, mb });
    return this;
  }
}

/** limb pointing up (+Y) instead of down */
const UP = compose([0, 0, 0], 0, Math.PI);

// ------------------------------------------------------------------ THE STALKER (Wysoki)
function stalker(): RigDef {
  const r = new RB();
  r.add('root', null, [0, 0, 0]);
  r.add('hips', 'root', [0, 1.3, 0]);
  r.add('spine', 'hips', [0, 0.1, 0]);
  r.add('chest', 'spine', [0, 0.36, 0]);
  r.add('neck', 'chest', [0, 0.36, -0.03]);
  r.add('head', 'neck', [0, 0.24, -0.02]);
  r.add('jaw', 'head', [0, 0.02, -0.08]);
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    r.add(`arm${side}`, 'chest', [s * 0.26, 0.28, 0.02]);
    r.add(`fore${side}`, `arm${side}`, [0, -0.62, 0]);
    r.add(`hand${side}`, `fore${side}`, [0, -0.64, 0]);
    r.add(`thigh${side}`, 'hips', [s * 0.12, -0.02, 0]);
    r.add(`shin${side}`, `thigh${side}`, [0, -0.62, 0]);
    r.add(`foot${side}`, `shin${side}`, [0, -0.64, 0]);
    r.part(`arm${side}`, 'skinPale', (m) => m.limb(0.62, 0.075, 0.048, 12, { bulge: 0.02 }));
    r.part(`fore${side}`, 'skinPale', (m) => m.limb(0.64, 0.052, 0.03, 12, { bulge: 0.012 }));
    r.part(`hand${side}`, 'skinPale', (m) => m.ellipsoid([0, -0.06, 0], 0.035, 0.08, 0.02, 10, 8));
    for (let f = 0; f < 3; f++) {
      r.part(`hand${side}`, 'skinPale', (m) => m.limb(0.3, 0.014, 0.006, 6), compose([(f - 1) * 0.028, -0.12, 0], 0, 0.15, (f - 1) * 0.18));
    }
    r.part(`thigh${side}`, 'skinPale', (m) => m.limb(0.62, 0.1, 0.06, 12, { bulge: 0.02 }));
    r.part(`shin${side}`, 'skinPale', (m) => m.limb(0.64, 0.062, 0.034, 12, { bulge: 0.01 }));
    r.part(`foot${side}`, 'skinPale', (m) => m.ellipsoid([0, -0.03, -0.08], 0.04, 0.03, 0.14, 10, 6));
  }
  r.part('hips', 'skinPale', (m) => m.ellipsoid([0, 0.02, 0], 0.19, 0.14, 0.13, 16, 10));
  r.part('spine', 'skinPale', (m) => m.ellipsoid([0, 0.2, 0.01], 0.14, 0.28, 0.1, 16, 12));
  // ribcage with ribs pressing through the skin
  r.part('chest', 'skinPale', (m) =>
    m.lathe(
      [
        [-0.08, 0.12],
        [0.04, 0.19],
        [0.16, 0.23],
        [0.27, 0.23],
        [0.35, 0.17],
        [0.42, 0.001],
      ],
      20,
      { sx: 1.15, sz: 0.62, noise: (a, y) => Math.sin(y * 70) * 0.04 * (Math.sin(a) < 0 ? 1 : 0.3) },
    ),
  );
  r.part('chest', 'skinPale', (m) => m.ellipsoid([0, 0.3, 0.06], 0.3, 0.06, 0.1, 12, 6));
  r.part('neck', 'skinPale', (m) => m.limb(0.26, 0.05, 0.065, 10), UP);
  // an elongated head with no face — a dark vertical split where a face should be
  r.part('head', 'skinPale', (m) => m.ellipsoid([0, 0.17, -0.02], 0.12, 0.25, 0.15, 18, 14));
  r.part('head', 'skinPale', (m) => m.ellipsoid([0, 0.25, 0.1], 0.1, 0.17, 0.16, 14, 10));
  r.part('head', 'black', (m) => m.box(0, 0.12, -0.168, 0.02, 0.26, 0.02, {}));
  r.part('head', 'black', (m) => m.ellipsoid([0, 0.0, -0.15], 0.03, 0.05, 0.02, 8, 6));
  r.part('jaw', 'skinPale', (m) => m.ellipsoid([0, -0.02, -0.02], 0.075, 0.05, 0.08, 12, 6));
  return {
    type: 'stalker',
    bones: r.bones,
    up: ['spine', 'chest', 'neck', 'head'],
    contacts: [
      { bone: 'footL', clear: 0.06 },
      { bone: 'footR', clear: 0.06 },
      { bone: 'shinL', clear: 0.07 },
      { bone: 'shinR', clear: 0.07 },
      { bone: 'handL', clear: 0.16 },
      { bone: 'handR', clear: 0.16 },
    ],
  };
}

// ------------------------------------------------------------------ THE CRAWLER (Pełzacz)
function crawler(): RigDef {
  const r = new RB();
  r.add('root', null, [0, 0, 0]);
  r.add('hips', 'root', [0, 0.62, 0.35]);
  r.add('spine', 'hips', [0, 0.02, -0.02]);
  r.add('chest', 'spine', [0, 0.02, -0.62]);
  r.add('neck', 'chest', [0, -0.02, -0.2]);
  r.add('head', 'neck', [0, -0.1, -0.12]);
  r.add('jaw', 'head', [0, 0.04, -0.06]);
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    r.add(`arm${side}`, 'chest', [s * 0.2, -0.02, -0.05]);
    r.add(`fore${side}`, `arm${side}`, [0, -0.42, 0]);
    r.add(`hand${side}`, `fore${side}`, [0, -0.44, 0]);
    r.add(`thigh${side}`, 'hips', [s * 0.16, 0, 0.05]);
    r.add(`shin${side}`, `thigh${side}`, [0, -0.46, 0]);
    r.add(`foot${side}`, `shin${side}`, [0, -0.48, 0]);
    r.part(`arm${side}`, 'skinGrey', (m) => m.limb(0.42, 0.055, 0.04, 9));
    r.part(`fore${side}`, 'skinGrey', (m) => m.limb(0.44, 0.04, 0.026, 9));
    r.part(`hand${side}`, 'skinGrey', (m) => m.ellipsoid([0, -0.03, -0.05], 0.05, 0.02, 0.07, 8, 6));
    for (let f = 0; f < 4; f++) r.part(`hand${side}`, 'skinDark', (m) => m.limb(0.13, 0.01, 0.004, 5), compose([(f - 1.5) * 0.025, -0.03, -0.1], 0, -1.3));
    r.part(`thigh${side}`, 'skinGrey', (m) => m.limb(0.46, 0.07, 0.045, 9, { bulge: 0.01 }));
    r.part(`shin${side}`, 'skinGrey', (m) => m.limb(0.48, 0.045, 0.026, 9));
    r.part(`foot${side}`, 'skinGrey', (m) => m.ellipsoid([0, -0.02, -0.06], 0.04, 0.025, 0.1, 8, 6));
  }
  r.part('hips', 'skinGrey', (m) => m.ellipsoid([0, 0, 0], 0.16, 0.12, 0.13, 12, 8));
  // a long, starved torso, spine ridges along the back
  r.part('spine', 'skinGrey', (m) =>
    m.lathe(
      [
        [-0.66, 0.001],
        [-0.6, 0.15],
        [-0.42, 0.17],
        [-0.2, 0.13],
        [-0.02, 0.15],
        [0.04, 0.001],
      ],
      14,
      { sx: 1, sz: 0.8, noise: (a, y) => (Math.cos(a) > 0.92 ? Math.abs(Math.sin(y * 40)) * 0.25 : 0) },
    ),
    compose([0, 0, 0], 0, Math.PI / 2),
  );
  r.part('chest', 'skinGrey', (m) => m.ellipsoid([0, 0, -0.05], 0.2, 0.14, 0.15, 12, 8));
  r.part('neck', 'skinGrey', (m) => m.limb(0.14, 0.04, 0.045, 8), compose([0, 0, 0], 0, 0.9));
  // the head hangs upside down, mouth open towards you
  r.part('head', 'skinGrey', (m) => m.ellipsoid([0, -0.02, -0.03], 0.1, 0.12, 0.12, 14, 10));
  r.part('head', 'black', (m) => m.ellipsoid([0, 0.07, -0.1], 0.06, 0.03, 0.04, 10, 6));
  r.part('jaw', 'skinDark', (m) => m.ellipsoid([0, 0.04, -0.06], 0.07, 0.03, 0.08, 10, 6));
  for (let i = 0; i < 7; i++) r.part('jaw', 'mask', (m) => m.limb(0.035, 0.007, 0.002, 4), compose([(i - 3) * 0.018, 0.07, -0.1 + Math.abs(i - 3) * 0.008], 0, Math.PI));
  return {
    type: 'crawler',
    bones: r.bones,
    contacts: [
      { bone: 'handL', clear: 0.05 },
      { bone: 'handR', clear: 0.05 },
      { bone: 'footL', clear: 0.045 },
      { bone: 'footR', clear: 0.045 },
    ],
  };
}

// ------------------------------------------------------------------ THE ECHO (Mimik)
function echo(): RigDef {
  const r = new RB();
  r.add('root', null, [0, 0, 0]);
  r.add('hips', 'root', [0, 1.02, 0]);
  r.add('spine', 'hips', [0, 0.08, 0]);
  r.add('chest', 'spine', [0, 0.28, 0]);
  r.add('neck', 'chest', [0, 0.32, 0]);
  r.add('head', 'neck', [0, 0.14, 0]);
  r.add('jaw', 'head', [0, 0, 0]);
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    r.add(`arm${side}`, 'chest', [s * 0.22, 0.26, 0]);
    r.add(`fore${side}`, `arm${side}`, [0, -0.46, 0]);
    r.add(`hand${side}`, `fore${side}`, [0, -0.5, 0]);
    r.add(`thigh${side}`, 'hips', [s * 0.11, -0.03, 0]);
    r.add(`shin${side}`, `thigh${side}`, [0, -0.49, 0]);
    r.add(`foot${side}`, `shin${side}`, [0, -0.5, 0]);
    r.part(`arm${side}`, 'orange', (m) => m.limb(0.46, 0.07, 0.055, 10));
    r.part(`fore${side}`, 'orange', (m) => m.limb(0.42, 0.055, 0.05, 10));
    // the hands are too long and too pale
    r.part(`fore${side}`, 'mask', (m) => m.limb(0.12, 0.03, 0.028, 8), compose([0, -0.42, 0]));
    r.part(`hand${side}`, 'mask', (m) => m.ellipsoid([0, -0.07, 0], 0.035, 0.08, 0.018, 8, 6));
    for (let f = 0; f < 4; f++) r.part(`hand${side}`, 'mask', (m) => m.limb(0.2, 0.01, 0.005, 5), compose([(f - 1.5) * 0.018, -0.14, 0], 0, 0.1));
    r.part(`thigh${side}`, 'fabric', (m) => m.limb(0.49, 0.075, 0.055, 10));
    r.part(`shin${side}`, 'fabric', (m) => m.limb(0.5, 0.055, 0.045, 10));
    r.part(`foot${side}`, 'black', (m) => m.ellipsoid([0, -0.03, -0.06], 0.05, 0.04, 0.13, 10, 6));
  }
  r.part('hips', 'fabric', (m) => m.ellipsoid([0, 0, 0], 0.16, 0.1, 0.11, 12, 8));
  // a quilted orange expedition jacket, just like theirs
  r.part('spine', 'orange', (m) =>
    m.lathe(
      [
        [-0.12, 0.17],
        [0.1, 0.17],
        [0.3, 0.2],
      ],
      16,
      { sx: 1.05, sz: 0.72 },
    ),
  );
  r.part('chest', 'orange', (m) =>
    m.lathe(
      [
        [0, 0.2],
        [0.18, 0.22],
        [0.3, 0.2],
        [0.36, 0.08],
        [0.38, 0.001],
      ],
      16,
      { sx: 1.1, sz: 0.72 },
    ),
  );
  r.part('neck', 'mask', (m) => m.limb(0.16, 0.045, 0.05, 8), UP);
  r.part('neck', 'orange', (m) => m.ellipsoid([0, 0.1, 0.07], 0.15, 0.17, 0.13, 12, 8));
  // the face: smooth, without features
  r.part('head', 'mask', (m) => m.ellipsoid([0, 0.12, -0.01], 0.1, 0.14, 0.115, 16, 12));
  // the jacket's hood, pulled up: only the smooth face shows
  r.part('head', 'orange', (m) => m.ellipsoid([0, 0.13, 0.035], 0.128, 0.158, 0.13, 16, 12));
  r.part('head', 'black', (m) => m.box(0, 0.08, -0.124, 0.07, 0.004, 0.006, {}));
  return {
    type: 'echo',
    bones: r.bones,
    up: ['spine', 'chest', 'neck', 'head'],
    contacts: [
      { bone: 'footL', clear: 0.07 },
      { bone: 'footR', clear: 0.07 },
      { bone: 'shinL', clear: 0.08 },
      { bone: 'shinR', clear: 0.08 },
      { bone: 'handL', clear: 0.2 },
      { bone: 'handR', clear: 0.2 },
    ],
  };
}

export const RIGS: Record<MonsterType, RigDef> = { stalker: stalker(), crawler: crawler(), echo: echo() };

// ------------------------------------------------------------------ animation
export type Pose = Record<string, V3>;

const sin = Math.sin;

/** Arm angles above are meant relative to the world's vertical (gravity), not to the
 *  bent torso: add the torso's lean back so a hanging arm hangs straight down. */
function hangArms(pose: Pose) {
  const lean = (pose.spine?.[0] ?? 0) + (pose.chest?.[0] ?? 0);
  for (const a of ['armL', 'armR']) if (pose[a]) pose[a][0] += lean;
}

/** Pose of a monster at time t (seconds of renderer time). `look` is the head turn towards the player. */
export function poseOf(m: Monster, t: number, look: number): { pose: Pose; lift: number; pitch: number; roll: number } {
  const pose: Pose = {};
  const set = (b: string, x = 0, y = 0, z = 0) => (pose[b] = [x, y, z]);
  const walk = m.moving ? 1 : 0;
  const ph = m.anim * (m.type === 'crawler' ? 5.2 : m.type === 'stalker' ? 2.5 : 3.1);
  const run = m.speed > 2.5 ? 1 : 0;
  const tw = m.twitch;
  const jit = () => (Math.random() - 0.5) * tw * 0.35;
  let lift = 0;
  let pitch = 0;
  let roll = 0;
  const atk = m.state === 'attack' ? Math.min(1, Math.max(0, m.attackT / m.K.attackTime)) : -1;
  const lookY = Math.max(-1, Math.min(1, look));

  if (m.type === 'stalker') {
    const A = walk * (run ? 0.75 : 0.5);
    // the stoop: it is too tall for the ceiling
    set('spine', 0.16 + run * 0.12 + jit(), 0, sin(ph) * 0.04 * walk);
    set('chest', 0.3 + run * 0.14 + jit(), sin(ph) * 0.08 * walk, 0);
    set('neck', 0.45 + jit(), lookY * 0.4, 0);
    set('head', -0.55 + jit() + (m.state === 'listen' ? -0.25 : 0), lookY * 0.5, (m.state === 'listen' ? 0.55 : 0.12) + tw * 0.3 * sin(t * 37));
    set('jaw', 0.15 + (m.hunting ? 0.25 + 0.15 * sin(t * 9) : 0));
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'L' : 'R';
      const p = ph + (s < 0 ? 0 : Math.PI);
      set(`thigh${side}`, sin(p) * A + 0.1, 0, s * 0.04);
      set(`shin${side}`, -Math.max(0, sin(p + 1.2)) * A * 1.3 - 0.2, 0, 0);
      set(`foot${side}`, 0.1, 0, 0);
      // arms hang long and swing late
      let ax = -sin(p) * A * 0.6 + 0.25;
      let fx = -0.25 - Math.max(0, -sin(p)) * 0.3;
      if (m.hunting && run) {
        ax = 0.9 + sin(p) * 0.4;
        fx = -0.6;
      }
      set(`arm${side}`, ax + jit(), 0, s * (0.12 + tw * 0.2));
      set(`fore${side}`, fx + jit(), 0, 0);
      set(`hand${side}`, 0.2, 0, 0);
    }
    lift = Math.abs(sin(ph)) * 0.05 * walk;
    if (atk >= 0) {
      // arms up, then down hard
      const up = atk < 0.5 ? atk / 0.5 : 1 - (atk - 0.5) / 0.5;
      for (const s of ['L', 'R']) {
        set(`arm${s}`, 2.4 * up + 0.6 * (1 - up), 0, (s === 'L' ? -1 : 1) * 0.25);
        set(`fore${s}`, -0.9 * up, 0, 0);
      }
      set('chest', 0.3 + (1 - up) * 0.5, 0, 0);
      set('jaw', 0.7);
    }
    if (m.state === 'notice') {
      set('head', -0.6, lookY * 0.8, sin(t * 40) * 0.08);
      set('jaw', 0.8);
    }
    if (m.state === 'stagger') {
      set('chest', -0.4 + sin(t * 14) * 0.15, 0, sin(t * 9) * 0.2);
      set('armL', 1.6, 0, -0.6);
      set('armR', 1.2, 0, 0.7);
      set('head', 0.5, 0, 0.4);
    }
    if (m.state === 'checkHide') {
      set('armR', 1.6, 0, 0.1);
      set('foreR', -0.2, 0, 0);
      set('chest', 0.6, 0, 0);
    }
    hangArms(pose);
  } else if (m.type === 'crawler') {
    const A = walk * (run ? 0.7 : 0.45);
    set('spine', sin(ph * 2) * 0.05 * walk + jit(), sin(ph) * 0.1 * walk, sin(ph) * 0.08 * walk);
    set('chest', -0.05, 0, 0);
    set('neck', 0.5, lookY * 0.6, 0);
    // the head is upside down
    set('head', 0.3 + jit(), 0, Math.PI + sin(t * 3) * 0.2 + tw * sin(t * 50) * 0.4);
    set('jaw', -(0.25 + (m.hunting ? 0.5 + 0.2 * sin(t * 18) : 0.1)));
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'L' : 'R';
      const p = ph + (s < 0 ? 0 : Math.PI);
      // arms reach forward to the floor
      set(`arm${side}`, 0.55 + sin(p) * A * 0.6, 0, s * 0.15);
      set(`fore${side}`, -0.75 - Math.max(0, sin(p + 1)) * A * 0.8, 0, 0);
      set(`hand${side}`, 0.4, 0, 0);
      // legs bent like a spider's, knees above the back
      // (small swing: a larger one lifts the hind feet off the floor at a run)
      set(`thigh${side}`, -0.9 + sin(p + Math.PI) * A * 0.5, 0, s * 0.85);
      set(`shin${side}`, 1.9 + Math.max(0, sin(p)) * A * 0.7, 0, -s * 0.35);
      set(`foot${side}`, -0.8, 0, 0);
    }
    lift = Math.abs(sin(ph)) * 0.04 * walk;
    if (atk >= 0) {
      const k = sin(atk * Math.PI);
      set('spine', -0.25 * k, 0, 0);
      set('neck', 0.2 + k * 0.6, lookY, 0);
      set('jaw', -1.0);
      set('armL', 1.4 * k + 0.5, 0, -0.2);
      set('armR', 1.4 * k + 0.5, 0, 0.2);
      lift = 0.15 * k;
    }
    if (m.state === 'rest') set('spine', sin(t * 7) * 0.06, 0, 0);
    if (m.state === 'dead') {
      const d = Math.min(1, m.deathT / 0.7);
      roll = d * 2.6;
      lift = -0.25 * d;
      for (const s of ['L', 'R']) {
        set(`arm${s}`, 1.8 * d, 0, 0);
        set(`fore${s}`, -2.2 * d, 0, 0);
        set(`thigh${s}`, -1.4 * d, 0, (s === 'L' ? -1 : 1) * 0.6);
        set(`shin${s}`, 2.2, 0, 0);
      }
      set('jaw', -1.1);
    }
  } else {
    // the Echo walks like a person who almost remembers how: the third step hitches
    const hitch = sin(ph * 0.5) > 0.85 ? 0.35 : 0;
    const A = walk * (run ? 0.7 : 0.42);
    set('spine', 0.05 + run * 0.15 + jit(), 0, 0);
    set('chest', 0.04 + jit(), sin(ph) * 0.06 * walk, 0);
    set('neck', 0.05, lookY * 0.3, 0);
    let headTilt = m.state === 'lure' ? 0.65 + sin(t * 0.7) * 0.1 : hitch * 0.5;
    if (m.state === 'reveal') headTilt = Math.max(0, 0.6 - m.stateT * 1.5);
    set('head', 0.05 + jit(), lookY * 0.6, headTilt + tw * sin(t * 45) * 0.3);
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'L' : 'R';
      const p = ph + (s < 0 ? 0 : Math.PI) + hitch;
      set(`thigh${side}`, sin(p) * A, 0, s * 0.03);
      set(`shin${side}`, -Math.max(0, sin(p + 1.3)) * A * 1.4, 0, 0);
      set(`foot${side}`, 0.1, 0, 0);
      let ax = -sin(p) * A * 0.7;
      if (m.hunting) ax = 1.3 + sin(p * 1.7) * 0.5;
      if (m.state === 'reveal') ax = Math.min(1.4, m.stateT * 2);
      set(`arm${side}`, ax + jit(), 0, s * 0.08);
      set(`fore${side}`, -0.15 - (m.hunting ? 0.3 : 0), 0, 0);
      set(`hand${side}`, 0, 0, 0);
    }
    lift = Math.abs(sin(ph)) * 0.035 * walk;
    if (atk >= 0) {
      const k = sin(atk * Math.PI);
      for (const s of ['L', 'R']) {
        set(`arm${s}`, 1.5 + k * 0.4, 0, (s === 'L' ? -1 : 1) * (0.3 - k * 0.3));
        set(`fore${s}`, -0.3 * k, 0, 0);
      }
      set('chest', 0.3 * k, 0, 0);
      set('head', 0.4 * k, 0, 0);
    }
    if (m.state === 'dead') {
      const d = Math.min(1, m.deathT / 0.9);
      pitch = -d * 1.45;
      lift = -d * 0.85;
      set('armL', 2 * d, 0, -0.5);
      set('armR', 0.4, 0, 0.8 * d);
      set('head', 0.6 * d, 0, 0.4);
    }
    hangArms(pose);
  }
  // squeezing through a vent: on all fours, rising as it gets clear of the wall
  if ((m.state === 'emerge' || m.state === 'exit') && m.type !== 'crawler') {
    const k = m.state === 'emerge' ? Math.min(1, Math.max(0, (m.stateT - 0.45) / 1.75)) : 1 - Math.min(1, m.stateT / 0.4);
    const c = 1 - Math.min(1, Math.max(0, (k - 0.55) / 0.45));
    const blend = (b: string, x: number, y = 0, z = 0) => {
      const o = pose[b] ?? [0, 0, 0];
      pose[b] = [o[0] * (1 - c) + x * c, o[1] * (1 - c) + y * c, o[2] * (1 - c) + z * c];
    };
    const crawl = sin(t * 6) * 0.25;
    blend('spine', 0.9);
    blend('chest', 0.5);
    blend('neck', 0.1);
    blend('head', -0.9, 0, sin(t * 3) * 0.2);
    for (const [side, s] of [['L', -1], ['R', 1]] as const) {
      blend(`thigh${side}`, 1.5 + s * crawl * 0.4, 0, s * 0.25);
      blend(`shin${side}`, -2.2, 0, 0);
      blend(`foot${side}`, 0.7);
      blend(`arm${side}`, 2.3 + s * crawl, 0, s * 0.15);
      blend(`fore${side}`, -0.5, 0, 0);
      blend(`hand${side}`, 0.6);
    }
  }
  // breathing: never perfectly still
  if (!walk && m.state !== 'dead') {
    const b = sin(t * (m.hunting ? 3.2 : 1.4) + m.x) * (m.hunting ? 0.05 : 0.025);
    pose.chest = [(pose.chest?.[0] ?? 0) + b, pose.chest?.[1] ?? 0, pose.chest?.[2] ?? 0];
    pose.head = [(pose.head?.[0] ?? 0) - b * 0.6, pose.head?.[1] ?? 0, pose.head?.[2] ?? 0];
  }
  if (m.hitT > 0) {
    const k = m.hitT / 0.35;
    pose.chest = [(pose.chest?.[0] ?? 0) - k * 0.5, pose.chest?.[1] ?? 0, (pose.chest?.[2] ?? 0) + k * 0.2];
    pose.head = [(pose.head?.[0] ?? 0) - k * 0.4, pose.head?.[1] ?? 0, pose.head?.[2] ?? 0];
  }
  return { pose, lift, pitch, roll };
}

/** World matrices of all bones. */
export function boneMatrices(rig: RigDef, root: Mat4, pose: Pose, out: Mat4[] = []): Mat4[] {
  rig.bones.forEach((b, i) => {
    const r = pose[b.name] ?? [0, 0, 0];
    const rest = b.rest ?? [0, 0, 0];
    const sx = rig.up?.includes(b.name) ? -1 : 1;
    const local = compose(b.offset, r[1] + rest[1], sx * r[0] + rest[0], r[2] + rest[2]);
    const parent = b.parent < 0 ? root : out[b.parent];
    out[i] = multiply(parent, local, out[i] ?? new Float32Array(16));
  });
  return out;
}

/**
 * Bone matrices with the body standing on the floor: the lowest contact (a planted
 * foot or hand; any part of the body once it is dead) is put on y = floor. This
 * keeps feet from floating or sinking whatever the gait does.
 */
export function groundedMatrices(rig: RigDef, root: Mat4, pose: Pose, dead: boolean, floor = 0, out: Mat4[] = []): Mat4[] {
  boneMatrices(rig, root, pose, out);
  let min = Infinity;
  if (dead) {
    for (const m of out) min = Math.min(min, m[13] - 0.09);
  } else {
    for (const c of rig.contacts) {
      const i = rig.bones.findIndex((b) => b.name === c.bone);
      min = Math.min(min, out[i][13] - c.clear);
    }
  }
  const dy = floor - min;
  if (Math.abs(dy) > 1e-4) for (const m of out) m[13] += dy;
  return out;
}
