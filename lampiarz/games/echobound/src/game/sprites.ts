import type { BossKind, Theme } from './types';

export type AnimName =
  | 'idle' | 'run' | 'turn' | 'jump' | 'apex' | 'fall' | 'land' | 'launch' | 'float' | 'interact' | 'hurt' | 'dead'
  | 'dash' | 'wall' | 'blink';
type Ctx = CanvasRenderingContext2D;
type Shape = [number, number, number, number, string];

export interface CharPalette {
  outline: string;
  hood: string; hoodLight: string; hoodDark: string;
  skin: string; skinShade: string; eye: string;
  cloak: string; cloakLight: string; cloakDark: string;
  boots: string; bootsLight: string;
  gem: string; gemCore: string;
  scarf: string; scarfDark: string;
  belt: string;
}

export const PLAYER_PAL: CharPalette = {
  outline: '#0d0a1c',
  hood: '#2f2859', hoodLight: '#4c4490', hoodDark: '#1d1838',
  skin: '#f4cda4', skinShade: '#c08f63', eye: '#8ff9ff',
  cloak: '#362d66', cloakLight: '#544a9f', cloakDark: '#211b43',
  boots: '#191530', bootsLight: '#2d2755',
  gem: '#7fe9ff', gemCore: '#ffffff',
  scarf: '#4fe3ff', scarfDark: '#1f8fc4',
  belt: '#9a7338',
};
export const ECHO_PAL: CharPalette = {
  outline: '#073445',
  hood: '#1d7f9e', hoodLight: '#3bbde2', hoodDark: '#12596f',
  skin: '#a6f2ff', skinShade: '#5cc4e0', eye: '#ffffff',
  cloak: '#1a6b8b', cloakLight: '#3298bc', cloakDark: '#104c66',
  boots: '#0d4257', bootsLight: '#17627d',
  gem: '#e8ffff', gemCore: '#ffffff',
  scarf: '#c8fbff', scarfDark: '#6fd4ea',
  belt: '#7fd9ef',
};
export const WHITE_PAL: CharPalette = {
  outline: '#ffffff',
  hood: '#ffffff', hoodLight: '#ffffff', hoodDark: '#ffffff',
  skin: '#ffffff', skinShade: '#ffffff', eye: '#ffffff',
  cloak: '#ffffff', cloakLight: '#ffffff', cloakDark: '#ffffff',
  boots: '#ffffff', bootsLight: '#ffffff',
  gem: '#ffffff', gemCore: '#ffffff',
  scarf: '#ffffff', scarfDark: '#ffffff',
  belt: '#ffffff',
};

function fillShapes(ctx: Ctx, shapes: Shape[], outline: string | null) {
  if (outline) {
    ctx.fillStyle = outline;
    for (const [x, y, w, h] of shapes) ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  }
  for (const [x, y, w, h, c] of shapes) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  }
}

/** Pixel-snapped rectangle (keeps sub-pixel motion readable without blurring). */
function rct(list: Shape[], x: number, y: number, w: number, h: number, c: string) {
  const x0 = Math.round(x), y0 = Math.round(y);
  const x1 = Math.round(x + w), y1 = Math.round(y + h);
  list.push([x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0), c]);
}

/** Rasterises a thick line between two joints — used for every limb segment. */
function limb(list: Shape[], x0: number, y0: number, x1: number, y1: number, w: number, c: string) {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const vertical = Math.abs(dy) >= Math.abs(dx);
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const x = x0 + dx * f, y = y0 + dy * f;
    if (vertical) rct(list, x - w / 2, y, w, 1, c);
    else rct(list, x, y - w / 2, 1, w, c);
  }
}

/* ------------------------------------------------------------------ */
/*  Hero / Echo — joint-driven rig                                      */
/*  Origin is at the feet; negative Y points up.                        */
/* ------------------------------------------------------------------ */
interface Pose {
  hipY: number; shoulderY: number; headY: number; lean: number; headTilt: number;
  footF: [number, number]; footB: [number, number]; kneeF: number; kneeB: number;
  handF: [number, number]; handB: [number, number]; elbowF: number; elbowB: number;
  capeFlare: number; capeWave: number; capeLift: number; capeLen: number;
  scarfRise: number; scarfWave: number; scarfBack: number;
  squint: number;
}

function basePose(): Pose {
  return {
    hipY: -6, shoulderY: -11, headY: -16.2, lean: 0, headTilt: 0,
    footF: [1.9, 0], footB: [-2.3, 0], kneeF: 0.5, kneeB: 0.3,
    handF: [2.7, -7.4], handB: [-2.7, -7.4], elbowF: 0.9, elbowB: -0.9,
    capeFlare: 0.3, capeWave: 0.9, capeLift: 0, capeLen: 0.9,
    scarfRise: 0, scarfWave: 1, scarfBack: 0, squint: 0,
  };
}

function poseFor(anim: AnimName, t: number): Pose {
  const P = basePose();
  switch (anim) {
    case 'run': {
      const th = t * 0.33;
      const s = Math.sin(th), c = Math.cos(th);
      const bounce = Math.abs(Math.cos(th));
      P.hipY += 0.5 - bounce * 1.4;
      P.shoulderY += 0.5 - bounce * 1.6;
      P.headY += 0.4 - bounce * 1.6;
      P.lean = 1.7;
      P.footF = [c * 3.9, -Math.max(0, s) * 2.9];
      P.footB = [-c * 3.9, -Math.max(0, -s) * 2.9];
      P.kneeF = 0.7 + Math.max(0, s) * 1.9;
      P.kneeB = 0.7 + Math.max(0, -s) * 1.9;
      P.handF = [2.3 - c * 2.8, -7.7 - Math.max(0, -s) * 0.9];
      P.handB = [-2.3 + c * 2.8, -7.7 - Math.max(0, s) * 0.9];
      P.elbowF = 1.5; P.elbowB = -1.5;
      P.capeFlare = 2.7; P.capeWave = 2.3; P.capeLift = -1.3; P.capeLen = 1.7;
      P.scarfWave = 2.5; P.scarfBack = 1.9; P.scarfRise = -0.9;
      break;
    }
    case 'turn': {
      const k = Math.min(1, t / 5);
      P.lean = -2.3 * k;
      P.hipY += 1.1 * k; P.shoulderY += 0.9 * k; P.headY += 0.7 * k;
      P.footF = [3.5, 0]; P.footB = [-2.7, 0];
      P.kneeF = 1.7; P.kneeB = -0.7;
      P.handF = [3.5, -9.6]; P.handB = [-3.7, -8.6];
      P.elbowF = 1.7; P.elbowB = -1.9;
      P.capeFlare = 3.5 * k; P.capeWave = 2.7; P.capeLen = 1.5;
      P.scarfBack = -1.3 * k; P.scarfRise = -1.5; P.scarfWave = 2.7;
      P.squint = 1;
      break;
    }
    case 'jump': {
      const k = Math.min(1, t / 5);
      P.headY -= 0.9; P.shoulderY -= 0.7;
      P.lean = 0.9;
      P.footF = [2.2, -3.5 * k]; P.footB = [-1.7, -1.7 * k];
      P.kneeF = 2.3; P.kneeB = 1.1;
      P.handF = [2.2, -12.8]; P.handB = [-2.5, -11.9];
      P.elbowF = 1.2; P.elbowB = -1.2;
      P.capeFlare = 1.7; P.capeLift = -2.7; P.capeWave = 2.1; P.capeLen = 1.9;
      P.scarfRise = -2.5; P.scarfWave = 2.3; P.scarfBack = 1.5;
      break;
    }
    case 'apex': {
      const fl = Math.sin(t * 0.22);
      P.lean = 0.4;
      P.footF = [2.7, -2.3]; P.footB = [-2.5, -1.1];
      P.kneeF = 1.7; P.kneeB = 0.9;
      P.handF = [3.5, -10.5 + fl * 0.3]; P.handB = [-3.5, -10.1 - fl * 0.3];
      P.elbowF = 1.4; P.elbowB = -1.4;
      P.capeLift = -1.9; P.capeFlare = 1.3; P.capeWave = 1.9; P.capeLen = 1.8;
      P.scarfRise = -1.9; P.scarfWave = 2.1;
      break;
    }
    case 'fall': {
      const fl = Math.sin(t * 0.3);
      P.lean = -0.7;
      P.footF = [1.7, -0.7]; P.footB = [-2.9, -2.1];
      P.kneeF = 0.9; P.kneeB = 1.5;
      P.handF = [3.7, -11.7 + fl * 0.5]; P.handB = [-3.5, -12.3 - fl * 0.5];
      P.elbowF = 1.7; P.elbowB = -1.7;
      P.capeLift = -3.5; P.capeFlare = 0.9; P.capeWave = 2.7; P.capeLen = 2.1;
      P.scarfRise = -3.1; P.scarfWave = 2.7;
      break;
    }
    case 'land': {
      const k = Math.max(0, 1 - t / 9), k2 = k * k;
      P.hipY += 2.5 * k2; P.shoulderY += 3.0 * k2; P.headY += 3.2 * k2;
      P.lean = 1.3 * k;
      P.footF = [2.6 + k, 0]; P.footB = [-2.8 - k, 0];
      P.kneeF = 1.3 + 1.7 * k; P.kneeB = 1.1 + 1.5 * k;
      P.handF = [3.2 + k, -6.5 + 1.7 * k]; P.handB = [-3.2 - k, -6.7 + 1.7 * k];
      P.elbowF = 1.4; P.elbowB = -1.4;
      P.capeFlare = 1.3 * k; P.capeWave = 2.5; P.capeLen = 1.2 + 0.7 * k;
      P.scarfRise = -1.3 * k; P.scarfWave = 2.3;
      P.squint = k > 0.5 ? 1 : 0;
      break;
    }
    case 'launch': {
      P.headY -= 1.9; P.shoulderY -= 1.5; P.hipY -= 0.7;
      P.footF = [0.9, 0.7]; P.footB = [-1.0, 1.0];
      P.kneeF = 0.1; P.kneeB = -0.1;
      P.handF = [1.5, -14.6]; P.handB = [-1.7, -14.1];
      P.elbowF = 0.4; P.elbowB = -0.4;
      P.capeLift = -4.1; P.capeFlare = 0.5; P.capeWave = 1.7; P.capeLen = 2.3;
      P.scarfRise = -3.7; P.scarfWave = 2.1;
      break;
    }
    case 'float': {
      const w = Math.sin(t * 0.08), w2 = Math.sin(t * 0.08 - 0.9);
      P.headY += w2 * 0.7; P.shoulderY += w * 0.6; P.hipY += w * 0.45;
      P.lean = w * 0.7;
      P.footF = [2.5 + w * 0.6, -1.3]; P.footB = [-2.4 + w * 0.5, -0.5];
      P.kneeF = 1.1; P.kneeB = 0.9;
      P.handF = [3.1, -13.7 + w * 0.6]; P.handB = [-3.1, -13.2 - w * 0.6];
      P.elbowF = 1.3; P.elbowB = -1.3;
      P.capeLift = -3.7; P.capeWave = 2.9; P.capeLen = 2.2; P.capeFlare = 0.7;
      P.scarfRise = -3.3; P.scarfWave = 3.1;
      break;
    }
    case 'interact': {
      const k = Math.sin(Math.min(1, t / 10) * Math.PI);
      P.lean = 0.9 * k;
      P.handF = [3.3 + k * 2.7, -9.7 - k * 0.9];
      P.elbowF = 0.4;
      P.handB = [-2.6, -7.3];
      P.footF = [2.1, 0]; P.footB = [-2.5, 0];
      P.shoulderY -= 0.3 * k;
      P.capeFlare = 0.7 + k * 0.5; P.capeWave = 1.3;
      P.scarfWave = 1.4;
      break;
    }
    case 'hurt': {
      const k = Math.max(0, 1 - t / 18);
      P.lean = -2.7 * k - 0.4;
      P.headY += 0.7 * k; P.headTilt = -1.3 * k;
      P.shoulderY += 0.5 * k;
      P.footF = [3.1, 0]; P.footB = [-2.1, -0.9 * k];
      P.kneeF = 1.1; P.kneeB = 1.3;
      P.handF = [2.1, -12.7 - k]; P.handB = [-3.5, -11.9 - k];
      P.elbowF = 1.8; P.elbowB = -1.8;
      P.capeFlare = 2.3 * k; P.capeWave = 2.7; P.capeLift = -1.5 * k;
      P.scarfRise = -2.1 * k; P.scarfWave = 3.1;
      P.squint = 1;
      break;
    }
    case 'dead': {
      const settle = Math.min(1, t / 14);
      P.hipY = -2.2 - (1 - settle) * 2.5;
      P.shoulderY = -3.7 - (1 - settle) * 3;
      P.headY = -6.6 - (1 - settle) * 3;
      P.lean = -2.5 * settle; P.headTilt = -1.7 * settle;
      P.footF = [4.3 * settle + 1, 0]; P.footB = [-3.7 * settle - 1, 0];
      P.kneeF = 0.6; P.kneeB = -0.9;
      P.handF = [4.5 * settle + 1, -1.7]; P.handB = [-4.7 * settle - 1, -2.1];
      P.elbowF = 0.6; P.elbowB = -0.6;
      P.capeFlare = 3.1 * settle; P.capeWave = 0.6; P.capeLen = 0.6;
      P.scarfBack = 2.7 * settle; P.scarfRise = 2.3 * settle; P.scarfWave = 0.4;
      P.squint = 1;
      break;
    }
    case 'dash': {
      const fl = Math.sin(t * 0.6);
      P.lean = 3.8; P.hipY += 0.8; P.shoulderY += 2.6; P.headY += 3.4;
      P.footF = [-0.6, -1.0]; P.footB = [-5.2, -2.8 + fl * 0.3];
      P.kneeF = 0.3; P.kneeB = 1.6;
      P.handF = [-2.4, -8.0]; P.handB = [-5.4, -8.6];
      P.elbowF = -0.9; P.elbowB = -1.3;
      P.capeFlare = 3.6; P.capeLift = 0.6; P.capeWave = 0.7 + fl * 0.1; P.capeLen = 2.4;
      P.scarfBack = 3.6; P.scarfRise = 0.6; P.scarfWave = 0.5;
      P.squint = 1;
      break;
    }
    case 'wall': {
      const sl = Math.sin(t * 0.18);
      P.lean = 1.2; P.hipY += 0.3; P.shoulderY += 0.3; P.headY += 0.2;
      P.footF = [2.7, -3.6]; P.footB = [1.0, -0.8];
      P.kneeF = 2.1; P.kneeB = 1.5;
      P.handF = [4.1, -13.4 + sl * 0.3]; P.handB = [3.3, -10.3];
      P.elbowF = 1.1; P.elbowB = 1.0;
      P.capeLift = -1.8; P.capeFlare = 0.9; P.capeWave = 1.6; P.capeLen = 1.5;
      P.scarfRise = -1.4; P.scarfWave = 1.6;
      break;
    }
    case 'blink': {
      const k = Math.max(0, 1 - t / 10);
      P.hipY += 1.8 * k; P.shoulderY += 2.2 * k; P.headY += 2.4 * k;
      P.lean = 0.8 * k;
      P.footF = [3.0 + k * 1.2, 0]; P.footB = [-3.1 - k * 1.2, 0];
      P.kneeF = 1.2 + 1.6 * k; P.kneeB = 1.0 + 1.5 * k;
      P.handF = [4.4, -11.6 + k * 1.5]; P.handB = [-4.4, -11.2 + k * 1.5];
      P.elbowF = 1.2; P.elbowB = -1.2;
      P.capeFlare = 3.8 * k; P.capeLift = -1.6 * k; P.capeWave = 2.6; P.capeLen = 1.0 + 1.0 * k;
      P.scarfRise = -1.8 * k; P.scarfWave = 2.6;
      break;
    }
    case 'idle':
    default: {
      const br = Math.sin(t * 0.055), br2 = Math.sin(t * 0.055 - 0.7);
      const shift = Math.sin(t * 0.016);          // slow weight shift between the feet
      P.shoulderY -= br * 0.5;
      P.headY -= br2 * 0.65;
      P.hipY -= br * 0.15 + Math.abs(shift) * 0.25;
      P.headTilt = Math.sin(t * 0.012) * 0.6;
      P.footF = [1.9 + shift * 0.45, 0];
      P.footB = [-2.3 + shift * 0.35, 0];
      P.lean = shift * 0.3;
      P.handF = [2.7 + br2 * 0.2, -7.2 + br2 * 0.35];
      P.handB = [-2.7, -7.4 + br * 0.35];
      P.capeWave = 0.9; P.capeFlare = 0.25;
      P.scarfWave = 1.1;
      break;
    }
  }
  return P;
}

export type CharVariant = 'hero' | 'weaver';

export function drawCharacter(ctx: Ctx, cx: number, bottom: number, facing: 1 | -1, anim: AnimName, t: number, pal: CharPalette, variant: CharVariant = 'hero') {
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(bottom));
  if (facing < 0) ctx.scale(-1, 1);

  const P = poseFor(anim, t);
  const B: Shape[] = []; // silhouette (receives the outline pass)
  const D: Shape[] = []; // details painted on top

  /* ---- cape (behind everything) ---- */
  const capeTop = P.shoulderY + 0.5;
  const capeBot = P.hipY + 1.8 + P.capeLen * 2.0;
  const capeRows = Math.max(2, Math.round(capeBot - capeTop));
  for (let i = 0; variant === 'hero' && i <= capeRows; i++) {
    const f = i / capeRows;
    const y = capeTop + i + P.capeLift * f * f;
    const back = -(0.6 + f * (1.4 + P.capeFlare));
    const wave = Math.sin(t * 0.16 - f * 2.1) * P.capeWave * f;
    const half = 3.3 - f * 1.5;
    rct(B, back + wave - half, y, half * 2, 1, f < 0.4 ? pal.cloak : f < 0.75 ? pal.cloakDark : pal.outline);
  }

  /* ---- the weaver trades the cape for a bushy fox tail ---- */
  if (variant === 'weaver') {
    const bx = -2.2 + P.lean * 0.2, by = P.hipY - 0.8;
    for (let i = 0; i <= 7; i++) {
      const f = i / 7;
      const x = bx - f * (4.8 + P.capeFlare * 1.1 + P.scarfBack * 0.5);
      const y = by + f * 1.5 + P.capeLift * 0.75 * f + Math.sin(t * 0.13 - f * 2.4) * (0.7 + P.capeWave * 0.45) * f;
      const th = 3.6 - f * 1.9;
      rct(B, x, y - th / 2, 1.8, th, i >= 6 ? pal.scarf : i >= 4 ? pal.cloakLight : pal.cloak);
    }
  }

  /* ---- scarf tail (behind the body) ---- */
  for (let i = 1; variant === 'hero' && i <= 4; i++) {
    const f = i / 4;
    const sx = -2.6 - f * 4.4 - P.scarfBack;
    const sy = P.shoulderY + 0.4 + Math.sin(t * 0.21 - f * 2.3) * (1.1 + P.scarfWave) * f + P.scarfRise * f;
    rct(B, sx, sy, 2.2, 1, i < 3 ? pal.scarf : pal.scarfDark);
  }

  /* ---- back limbs ---- */
  const hipFX = P.lean * 0.15, hipBX = -0.6 + P.lean * 0.15;
  const shF = 1.6 + P.lean * 0.85, shB = -1.9 + P.lean * 0.85;
  const shY = P.shoulderY + 1.1;
  const drawLeg = (fx: number, fy: number, hipX: number, knee: number, thigh: string, boot: string) => {
    const kx = (hipX + fx) / 2 + knee, ky = (P.hipY + fy) / 2 + 0.6;
    limb(B, hipX, P.hipY, kx, ky, 3, thigh);
    limb(B, kx, ky, fx, fy - 1.2, 2, thigh);
    rct(B, fx - 1.6, fy - 1.2, 3.2, 1.2, boot);
  };
  const drawArm = (hx: number, hy: number, shx: number, elbow: number, sleeve: string, hand: string) => {
    const ex = (shx + hx) / 2 + elbow, ey = (shY + hy) / 2;
    limb(B, shx, shY, ex, ey, 2, sleeve);
    limb(B, ex, ey, hx, hy, 2, sleeve);
    rct(B, hx - 1, hy - 0.4, 2, 2, hand);
  };
  drawLeg(P.footB[0], P.footB[1], hipBX, P.kneeB, pal.cloakDark, pal.boots);
  drawArm(P.handB[0], P.handB[1], shB, P.elbowB, pal.cloakDark, pal.skinShade);

  /* ---- torso ---- */
  const tTop = P.shoulderY, tBot = P.hipY;
  const tRows = Math.max(1, Math.round(tBot - tTop));
  for (let i = 0; i <= tRows; i++) {
    const f = i / tRows;
    const y = tTop + i;
    const half = 3.4 - f * 1.0;
    const off = P.lean * (1 - f) * 0.9;
    rct(B, off - half, y, half * 2, 1, pal.cloak);
    if (i > 0 && i < tRows) rct(D, off + half - 1, y, 1, 1, pal.cloakLight);
    if (i === 0) rct(D, off - half, y, 1.2, 1, pal.cloakDark);
  }
  rct(D, P.lean * 0.1 - 3.1, tBot - 0.9, 6.2, 1, pal.belt);
  rct(D, P.lean * 0.1 + 0.6, tBot - 0.9, 1, 1, pal.gem);

  /* ---- chest gem (behind the front arm so a swing can pass over it) ---- */
  const gemY = tTop + (tBot - tTop) * 0.38;
  const gemX = P.lean * 0.5 + 0.1;
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.09);
  rct(B, gemX - 1, gemY, 2.2, 2.2, pulse > 0.55 ? pal.gemCore : pal.gem);

  /* ---- front limbs ---- */
  drawLeg(P.footF[0], P.footF[1], hipFX, P.kneeF, pal.cloak, pal.bootsLight);
  drawArm(P.handF[0], P.handF[1], shF, P.elbowF, pal.cloakLight, pal.skin);

  /* ---- scarf knot ---- */
  const knotY = P.shoulderY + 0.1;
  rct(B, P.lean * 0.8 - 3.2, knotY, 6.6, 1.6, pal.scarf);
  rct(D, P.lean * 0.8 - 3.2, knotY + 1, 6.6, 0.8, pal.scarfDark);

  /* ---- head ---- */
  const hx = P.lean * 1.25 + P.headTilt;
  const hy = P.headY;
  if (variant === 'weaver') {
    const wBlink = ((t + 47) % 150) < 7 || P.squint > 0;
    // ponytail streaming behind
    for (let i = 0; i < 5; i++) {
      const f = (i + 1) / 5;
      const px = hx - 3.2 - f * 5.2 - P.scarfBack * 0.5;
      const py = hy + 2.2 + f * 1.4 + Math.sin(t * 0.2 - f * 2.2) * (0.8 + P.scarfWave * 0.5) * f + P.scarfRise * 0.55 * f;
      rct(B, px, py, 2.2, 1.8 - f * 0.4, i % 2 ? pal.hood : pal.hoodLight);
    }
    // pointed ears
    rct(B, hx - 2.5, hy - 1.7, 1.2, 1.2, pal.hood);
    rct(B, hx - 3.0, hy - 0.6, 2.2, 1.4, pal.hood);
    rct(B, hx + 0.9, hy - 1.9, 1.2, 1.3, pal.hood);
    rct(B, hx + 0.5, hy - 0.7, 2.2, 1.5, pal.hood);
    rct(D, hx + 1.2, hy - 0.9, 0.8, 0.9, pal.hoodLight);
    // hair and face
    rct(B, hx - 3.4, hy + 0.7, 6.8, 4.0, pal.hood);
    rct(B, hx - 2.8, hy + 4.4, 5.6, 1.2, pal.hood);
    rct(D, hx - 3.4, hy + 0.8, 1.4, 3.6, pal.hoodDark);
    rct(D, hx - 1.6, hy + 0.9, 4.0, 0.9, pal.hoodLight);
    rct(D, hx - 0.2, hy + 2.0, 3.3, 3.3, pal.skin);
    rct(D, hx - 0.2, hy + 1.8, 3.6, 1.2, pal.hood);
    rct(D, hx + 2.0, hy + 2.8, 1.2, 1.0, pal.hood);
    rct(D, hx - 0.2, hy + 4.2, 2.6, 1.0, pal.skinShade);
    if (wBlink) rct(D, hx + 0.9, hy + 3.4, 1.6, 0.8, pal.skinShade);
    else {
      rct(D, hx + 0.9, hy + 3.0, 1.7, 1.3, pal.eye);
      rct(D, hx + 1.0, hy + 3.0, 0.7, 0.7, pal.gemCore);
    }
  } else {
  rct(B, hx - 4.9, hy + 1.4, 2.3, 2.4, pal.hoodDark);            // hood volume trailing back
  rct(B, hx - 4.2, hy + 3.4, 1.6, 1.2, pal.hoodDark);            // …tapering to a point
  rct(B, hx - 2.4, hy, 5, 1.2, pal.hoodLight);                   // crown
  rct(B, hx - 3.2, hy + 1, 6.4, 3.6, pal.hood);                  // hood shell
  rct(B, hx - 2.7, hy + 4.4, 5.4, 1.2, pal.hood);                // jaw line
  rct(D, hx - 3.2, hy + 1, 1.1, 3.4, pal.hoodDark);              // back shade
  rct(D, hx - 0.4, hy + 2.0, 3.2, 3.2, pal.skin);                // face opening
  rct(D, hx - 0.4, hy + 2.0, 3.2, 1.0, pal.hoodDark);            // brow shadow
  rct(D, hx - 0.4, hy + 4.1, 2.4, 1.0, pal.skinShade);           // chin shade
  const blink = ((t + 31) % 176) < 7 || P.squint > 0;
  if (blink) rct(D, hx + 0.9, hy + 3.3, 1.6, 0.8, pal.skinShade);
  else {
    rct(D, hx + 0.9, hy + 2.9, 1.6, 1.2, pal.eye);
    rct(D, hx + 0.9, hy + 2.9, 0.8, 0.8, pal.gemCore);
  }
  rct(D, hx + 1.6, hy + 1, 1.4, 1.2, pal.hoodLight);             // lit hood rim above the brow
  }

  fillShapes(ctx, B, pal.outline);
  fillShapes(ctx, D, null);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Chapter bosses                                                     */
/* ------------------------------------------------------------------ */
export function drawBossAlt(
  ctx: Ctx,
  kind: BossKind,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  state: string,
  vulnerable: boolean,
  phase: number,
  facing: 1 | -1,
) {
  ctx.save();
  ctx.translate(Math.round(x + w / 2), Math.round(y + h));
  if (facing < 0) ctx.scale(-1, 1);
  const flash = state === 'recovery' && Math.floor(t / 3) % 2 === 0;
  const blink = Math.floor(t / 8) % 2 === 0;

  if (kind === 'rootMatriarch') {
    const root = flash ? '#ffffff' : '#31553b';
    const bark = flash ? '#ffffff' : '#57372f';
    const cap = phase > 1 ? '#88d84e' : '#4a9956';
    const eye = vulnerable ? '#fff1bd' : '#ff7082';
    // root skirt, each tendril has its own sway
    for (let i = 0; i < 9; i++) {
      const rx = -16 + i * 4;
      const wave = Math.round(Math.sin(t * .1 + i * .72) * (state === 'windup' ? 2 : 1));
      const rh = 8 + (i % 3) * 2;
      ctx.fillStyle = i % 2 ? '#203d2b' : root;
      ctx.fillRect(rx, -rh + wave, 3, rh);
      ctx.fillRect(rx - 1, -3 + wave, 5, 2);
      if (i % 2 === 0) ctx.fillRect(rx - 2, -1 + wave, 2, 1);
    }
    // twisted trunk and bark plates
    ctx.fillStyle = bark;
    ctx.fillRect(-11, -25, 22, 18);
    ctx.fillRect(-14, -22, 28, 11);
    ctx.fillStyle = '#88553a';
    ctx.fillRect(-8, -23, 3, 14); ctx.fillRect(4, -22, 2, 12);
    ctx.fillStyle = '#302339';
    ctx.fillRect(-1, -23, 2, 7); ctx.fillRect(0, -16, 1, 5);
    // crown mushroom cap
    ctx.fillStyle = '#263d34'; ctx.fillRect(-19, -31, 38, 9);
    ctx.fillRect(-15, -35, 30, 6); ctx.fillRect(-9, -38, 18, 4);
    ctx.fillStyle = cap;
    ctx.fillRect(-17, -30, 34, 5); ctx.fillRect(-13, -34, 26, 4); ctx.fillRect(-7, -37, 14, 3);
    ctx.fillStyle = '#c7ff8a';
    ctx.fillRect(-12, -33, 3, 2); ctx.fillRect(-2, -36, 4, 2); ctx.fillRect(9, -31, 3, 2);
    ctx.fillStyle = '#f2ffd4'; ctx.fillRect(-1, -36, 2, 1);
    // eyes and seed-heart, open while recovering
    ctx.fillStyle = '#160d1c'; ctx.fillRect(-8, -25, 16, 8);
    ctx.fillStyle = eye;
    ctx.fillRect(-6, -23, 3, blink ? 1 : 2); ctx.fillRect(3, -23, 3, blink ? 1 : 2);
    ctx.fillStyle = vulnerable ? '#fff7d8' : '#e64f66';
    ctx.fillRect(-3, -15, 6, 4); ctx.fillRect(-2, -17, 4, 2);
    if (vulnerable) { ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -16, 2, 3); }
    // thorny crown branches
    ctx.fillStyle = root;
    ctx.fillRect(-14, -40, 2, 5); ctx.fillRect(-16, -42, 3, 2);
    ctx.fillRect(12, -41, 2, 6); ctx.fillRect(10, -43, 3, 2);
  } else if (kind === 'forgeBehemoth') {
    const iron = flash ? '#ffffff' : '#424253';
    const steel = flash ? '#ffffff' : '#777588';
    const dark = '#211a22';
    const ember = phase > 1 ? '#fff08a' : '#ff7138';
    const step = state === 'charge' ? Math.round(Math.sin(t * .55) * 3) : Math.round(Math.sin(t * .12));
    // hydraulic legs
    ctx.fillStyle = dark;
    ctx.fillRect(-15, -11 - Math.max(0, step), 11, 11 + Math.max(0, step));
    ctx.fillRect(4, -11 - Math.max(0, -step), 11, 11 + Math.max(0, -step));
    ctx.fillStyle = steel;
    ctx.fillRect(-17, -4 - Math.max(0, step), 15, 4);
    ctx.fillRect(2, -4 - Math.max(0, -step), 15, 4);
    ctx.fillStyle = '#18141d';
    ctx.fillRect(-18, -1, 16, 2); ctx.fillRect(2, -1, 16, 2);
    // armored body silhouette
    ctx.fillStyle = iron;
    ctx.fillRect(-17, -30, 34, 22);
    ctx.fillRect(-20, -26, 8, 13); ctx.fillRect(12, -26, 8, 13);
    ctx.fillStyle = steel;
    ctx.fillRect(-18, -31, 36, 4); ctx.fillRect(-19, -25, 4, 12); ctx.fillRect(15, -25, 4, 12);
    // rivets and hammered plate seams
    ctx.fillStyle = '#c2bdac';
    ctx.fillRect(-14, -27, 2, 2); ctx.fillRect(12, -27, 2, 2); ctx.fillRect(-14, -12, 2, 2); ctx.fillRect(12, -12, 2, 2);
    ctx.fillStyle = dark;
    ctx.fillRect(-9, -27, 18, 2); ctx.fillRect(-2, -29, 4, 18);
    // furnace mouth and glowing core
    ctx.fillStyle = '#120b12'; ctx.fillRect(-8, -21, 16, 11);
    ctx.fillStyle = ember; ctx.fillRect(-6, -19, 12, 8); ctx.fillRect(-4, -22, 8, 3);
    ctx.fillStyle = '#fff3b0'; ctx.fillRect(-2, -18, 4, 4); ctx.fillRect(-1, -20, 2, 2);
    // horned helmet and visor
    ctx.fillStyle = iron;
    ctx.fillRect(-12, -39, 24, 9); ctx.fillRect(-9, -43, 18, 5);
    ctx.fillRect(-17, -46, 7, 7); ctx.fillRect(10, -46, 7, 7);
    ctx.fillStyle = steel; ctx.fillRect(-17, -46, 4, 2); ctx.fillRect(13, -46, 4, 2);
    ctx.fillStyle = vulnerable ? '#fff3b0' : ember;
    ctx.fillRect(-7, -37, 4, blink ? 1 : 2); ctx.fillRect(3, -37, 4, blink ? 1 : 2);
  } else if (kind === 'glassWarden') {
    const violet = flash ? '#ffffff' : phase > 1 ? '#ed68cb' : '#8b62dd';
    const pale = '#e4d8ff';
    const glow = vulnerable ? '#fff5db' : '#c68cff';
    const float = Math.round(Math.sin(t * .12) * 2);
    ctx.translate(0, float);
    // orbiting crystal fragments behind the body
    for (let i = 0; i < 5; i++) {
      const a = t * .045 + i * Math.PI * 2 / 5;
      const sx = Math.cos(a) * 23, sy = -26 + Math.sin(a) * 17;
      ctx.fillStyle = i % 2 ? violet : pale;
      ctx.beginPath(); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 4, sy); ctx.lineTo(sx, sy + 5); ctx.lineTo(sx - 4, sy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(sx - 1), Math.round(sy - 2), 1, 2);
    }
    // faceted floating torso
    ctx.fillStyle = '#291b4a';
    ctx.beginPath(); ctx.moveTo(0, -41); ctx.lineTo(16, -31); ctx.lineTo(13, -12); ctx.lineTo(0, -6); ctx.lineTo(-13, -12); ctx.lineTo(-16, -31); ctx.closePath(); ctx.fill();
    ctx.fillStyle = violet;
    ctx.beginPath(); ctx.moveTo(-11, -31); ctx.lineTo(0, -37); ctx.lineTo(10, -30); ctx.lineTo(6, -16); ctx.lineTo(0, -12); ctx.lineTo(-7, -17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = pale; ctx.fillRect(-9, -30, 3, 8); ctx.fillRect(-5, -34, 2, 4);
    // glass heart
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(7, -23); ctx.lineTo(0, -13); ctx.lineTo(-7, -23); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-2, -26, 2, 7);
    // crown and luminous visor
    ctx.fillStyle = '#35235e'; ctx.fillRect(-11, -47, 22, 10); ctx.fillRect(-7, -51, 14, 5);
    ctx.fillStyle = violet; ctx.fillRect(-9, -46, 18, 3);
    ctx.fillStyle = '#100c22'; ctx.fillRect(-8, -42, 16, 4);
    ctx.fillStyle = vulnerable ? '#ffffff' : '#ff9bdd';
    ctx.fillRect(-6, -41, 4, blink ? 1 : 2); ctx.fillRect(2, -41, 4, blink ? 1 : 2);
  } else {
    // The Heart Core: huge living relic wrapped in stone ribs and radiant veins.
    const beat = 1 + Math.sin(t * (phase > 1 ? .22 : .12)) * (phase > 1 ? .1 : .055);
    const shell = flash ? '#ffffff' : '#792950';
    const glow = phase > 1 ? '#ff435f' : '#ed4d86';
    ctx.scale(beat, 1 / beat);
    ctx.fillStyle = '#35162e';
    for (let i = 0; i < 6; i++) {
      const rx = -24 + i * 9;
      ctx.fillRect(rx, -10, 4, 9); ctx.fillRect(rx - 3, -3, 8, 2);
    }
    ctx.strokeStyle = '#60324f'; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.ellipse(0, -26, 17 + i * 6, 15 + i * 3, 0, Math.PI, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.bezierCurveTo(-25, -22, -19, -47, -6, -41);
    ctx.bezierCurveTo(0, -38, 0, -33, 0, -33); ctx.bezierCurveTo(0, -33, 7, -48, 19, -39);
    ctx.bezierCurveTo(33, -28, 19, -15, 0, -10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c43d70';
    ctx.beginPath(); ctx.moveTo(-1, -17); ctx.bezierCurveTo(-17, -28, -10, -40, -3, -34); ctx.lineTo(0, -29); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#170b1b'; ctx.beginPath(); ctx.ellipse(1, -29, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = vulnerable ? '#fff0d0' : glow; ctx.beginPath(); ctx.ellipse(1, -29, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(1, -32, 2, 4);
    ctx.strokeStyle = phase > 1 ? '#ffb0a6' : '#ff91c3'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(-10, -17); ctx.lineTo(-14, -11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -24); ctx.lineTo(11, -20); ctx.lineTo(15, -13); ctx.stroke();
  }

  if (state === 'windup' || vulnerable) {
    const pulse = 0.16 + 0.12 * Math.sin(t * .45);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = state === 'windup' ? '#ffdb72' : '#ffffff';
    ctx.fillRect(-w / 2 - 3, -h + 2, w + 6, h - 2);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export function drawBossProjectileAlt(ctx: Ctx, x: number, y: number, radius: number, action: 'seed' | 'ember' | 'orb' | 'wave', t: number, kind: BossKind) {
  const px = Math.round(x), py = Math.round(y);
  const pulse = 0.65 + 0.35 * Math.sin(t * .35);
  if (action === 'wave') {
    const col = kind === 'forgeBehemoth' ? '#ff7838' : '#ff5f9c';
    ctx.fillStyle = `rgba(255,110,70,${.14 + pulse * .12})`; ctx.fillRect(px - 8, py - 5, 16, 10);
    ctx.fillStyle = col; ctx.fillRect(px - 6, py - 3, 12, 6);
    ctx.fillStyle = '#fff0bd'; ctx.fillRect(px - 3, py - 2, 6, 3);
    return;
  }
  const palette = kind === 'rootMatriarch' ? ['#315d39', '#9aff78', '#edffe2']
    : kind === 'forgeBehemoth' ? ['#782d1d', '#ff7136', '#ffe1a0']
      : kind === 'glassWarden' ? ['#59369a', '#c5a2ff', '#ffffff'] : ['#7b2850', '#ff4a77', '#ffe2d0'];
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,190,120,${(action === 'seed' ? .09 : .12) * pulse})`;
  ctx.beginPath(); ctx.arc(px, py, radius * 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  if (action === 'seed') {
    ctx.fillStyle = palette[0]; ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    ctx.fillStyle = palette[1]; ctx.fillRect(px - 1, py - 1, radius + 1, radius + 1);
    ctx.fillStyle = palette[2]; ctx.fillRect(px - 1, py - 1, 2, 2);
    ctx.fillStyle = '#3b2340'; ctx.fillRect(px - radius, py + radius, radius * 2, 1);
  } else if (action === 'ember') {
    ctx.fillStyle = palette[0]; ctx.fillRect(px - radius - 1, py - radius, radius * 2 + 2, radius * 2);
    ctx.fillStyle = palette[1]; ctx.fillRect(px - radius + 1, py - radius + 1, radius * 2 - 2, radius * 2 - 2);
    ctx.fillStyle = palette[2]; ctx.fillRect(px - 1, py - 1, 2, 2);
  } else {
    ctx.fillStyle = palette[0]; ctx.fillRect(px - radius - 1, py - radius - 1, radius * 2 + 2, radius * 2 + 2);
    ctx.fillStyle = palette[1]; ctx.fillRect(px - radius, py - radius + 1, radius * 2, radius * 2 - 2);
    ctx.fillStyle = palette[2]; ctx.fillRect(px - 1, py - radius + 1, 2, 2);
    ctx.fillStyle = palette[1]; ctx.fillRect(px - 1, py + 1, 2, 1);
  }
  ctx.restore();
}
/* ------------------------------------------------------------------ */
/*  Enemies                                                            */
/* ------------------------------------------------------------------ */
export function drawShadow(ctx: Ctx, cx: number, bottom: number, facing: number, t: number, alert: number, alpha: number) {
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(bottom));
  ctx.globalAlpha = alpha;
  const widths = [6, 10, 12, 12, 12, 10, 8];
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    const ox = Math.round(Math.sin(t * 0.25 + i * 0.7) * 1);
    const y = -14 + i * 2;
    ctx.fillStyle = '#0b0817';
    ctx.fillRect(ox - w / 2, y, w, 2);
    ctx.fillStyle = '#2b1f4d';
    ctx.fillRect(ox - w / 2, y, 1, 2);
    ctx.fillRect(ox + w / 2 - 1, y, 1, 2);
  }
  // tendrils
  ctx.fillStyle = '#1a1233';
  for (let k = 0; k < 3; k++) {
    for (let seg = 0; seg < 4 + k; seg++) {
      const x = -facing * (4 + seg) ;
      const y = -5 + k * 2 + Math.round(Math.sin(t * 0.3 + k + seg * 0.8) * 1.5);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // eyes
  const eye = alert > 0 ? '#ff4d6d' : '#c35bff';
  ctx.fillStyle = eye;
  const ex = facing > 0 ? 0 : -4;
  ctx.fillRect(ex - 2, -9, 2, 2);
  ctx.fillRect(ex + 2, -9, 2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ex - 1, -9, 1, 1);
  ctx.fillRect(ex + 3, -9, 1, 1);
  if (alert > 0) {
    ctx.fillStyle = '#ff4d6d';
    const by = -20 - Math.round(Math.sin(t * 0.4) * 1);
    ctx.fillRect(-1, by - 6, 2, 4);
    ctx.fillRect(-1, by - 1, 2, 2);
  }
  ctx.restore();
}

export function drawGuardian(ctx: Ctx, cx: number, bottom: number, facing: number, t: number, asleep: boolean, walking: boolean) {
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(bottom));
  if (facing < 0) ctx.scale(-1, 1);
  const stone = '#4b4f63', dark = '#33364a', light = '#6a6f88', moss = '#3f7d5c';
  const rune = asleep ? '#4a3222' : (Math.floor(t / 8) % 2 ? '#ffb34a' : '#ff8a2a');
  const slump = asleep ? 2 : 0;
  const bob = walking && !asleep ? Math.floor(t / 16) % 2 : 0;
  const step = walking && !asleep ? Math.round(Math.sin(t * 0.2) * 1) : 0;
  const s: Shape[] = [];
  s.push([-6, -6 - Math.max(0, step), 4, 6 + Math.max(0, step), dark]);
  s.push([2, -6 - Math.max(0, -step), 4, 6 + Math.max(0, -step), dark]);
  s.push([-7, -20 + slump + bob, 14, 14, stone]);
  s.push([-8, -20 + slump + bob, 16, 2, light]);
  s.push([-8, -21 + slump + bob, 5, 2, moss]);
  s.push([-9, -18 + slump + bob + step, 3, 10, dark]);
  s.push([6, -18 + slump + bob - step, 3, 10, dark]);
  s.push([-5, -28 + slump + bob, 10, 8, stone]);
  s.push([-5, -27 + slump + bob, 10, 1, dark]);
  fillShapes(ctx, s, '#15161f');
  // brick lines on body
  ctx.fillStyle = dark;
  for (let y = -16; y <= -8; y += 4) ctx.fillRect(-7, y + slump + bob, 14, 1);
  ctx.fillRect(-2, -19 + slump + bob, 1, 3); ctx.fillRect(3, -15 + slump + bob, 1, 3); ctx.fillRect(-4, -11 + slump + bob, 1, 3);
  // eyes & chest rune
  ctx.fillStyle = rune;
  const eyeH = asleep ? 1 : 2;
  ctx.fillRect(-3, -24 + slump + bob, 2, eyeH);
  ctx.fillRect(1, -24 + slump + bob, 2, eyeH);
  ctx.fillRect(0, -15 + slump + bob, 1, 1); ctx.fillRect(-1, -14 + slump + bob, 3, 1); ctx.fillRect(0, -13 + slump + bob, 1, 1);
  if (asleep) {
    ctx.fillStyle = '#9fb7ff';
    const zy = -32 - ((t / 2) % 10);
    ctx.globalAlpha = 1 - ((t / 2) % 10) / 10;
    ctx.fillRect(4 + ((t / 4) % 3), zy, 3, 1); ctx.fillRect(5 + ((t / 4) % 3), zy + 1, 1, 1); ctx.fillRect(4 + ((t / 4) % 3), zy + 2, 3, 1);
  }
  ctx.restore();
}

export function drawDevourer(ctx: Ctx, cx: number, cy: number, t: number, hunting: boolean, satiated: boolean) {
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy + Math.sin(t * 0.08) * 2));
  if (satiated) ctx.scale(1.2, 1.2);
  const body = '#3b0f52', rim = '#8a2fc2', inner = '#12031c', teeth = '#f3e9ff';
  const widths = [6, 10, 12, 14, 14, 14, 12, 10, 6];
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    const y = -9 + i * 2;
    ctx.fillStyle = body;
    ctx.fillRect(-w / 2, y, w, 2);
    ctx.fillStyle = rim;
    ctx.fillRect(-w / 2, y, 1, 2);
    ctx.fillRect(w / 2 - 1, y, 1, 2);
  }
  ctx.fillStyle = rim;
  ctx.fillRect(-3, -9, 6, 1);
  // mouth
  if (hunting && !satiated) {
    const mw = [8, 10, 10, 8];
    for (let i = 0; i < mw.length; i++) {
      ctx.fillStyle = inner;
      ctx.fillRect(-mw[i] / 2, -1 + i * 2, mw[i], 2);
    }
    ctx.fillStyle = teeth;
    for (let x = -4; x <= 2; x += 2) { ctx.fillRect(x, -1, 1, 2); ctx.fillRect(x + 1, 5, 1, 2); }
  } else {
    ctx.fillStyle = inner;
    ctx.fillRect(-4, 2, 8, 1);
    ctx.fillStyle = teeth;
    ctx.fillRect(-3, 1, 1, 1); ctx.fillRect(0, 1, 1, 1); ctx.fillRect(3, 1, 1, 1);
  }
  // eyes
  ctx.fillStyle = hunting ? '#ffffff' : '#ff7bf0';
  const eh = satiated ? 1 : 2;
  ctx.fillRect(-5, -6, 2, eh); ctx.fillRect(-1, -7, 2, eh); ctx.fillRect(3, -6, 2, eh);
  // tentacles
  for (let k = 0; k < 4; k++) {
    const x0 = -6 + k * 4;
    for (let seg = 0; seg < 5; seg++) {
      ctx.fillStyle = seg % 2 ? rim : body;
      ctx.fillRect(x0 + Math.round(Math.sin(t * 0.15 + k + seg * 0.6) * 1.5), 9 + seg * 2, 2, 2);
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Tiles                                                              */
/* ------------------------------------------------------------------ */
interface RockPal {
  base: string;
  speck: string;
  light: string;
  dark: string;
  deepDark: string;
  edge: string;
  moss: string;
  mossHighlight: string;
  mossDark: string;
  bgWall: string;
  bgWallDark: string;
  strata: string;
}

interface BrickPal {
  base: string;
  mortar: string;
  light: string;
  dark: string;
  edge: string;
  cracked: string;
}

export const ROCK_PAL: Record<Theme, RockPal> = {
  cave: {
    base: '#1a182c', speck: '#262344', light: '#3c3766', dark: '#110f1e', deepDark: '#07060e',
    edge: '#524e84', moss: '#2b8478', mossHighlight: '#6ff3ff', mossDark: '#123d38',
    bgWall: '#0e0c18', bgWallDark: '#080710', strata: '#282448',
  },
  ruins: {
    base: '#222538', speck: '#2c3048', light: '#464c72', dark: '#151728', deepDark: '#090a14',
    edge: '#646c9a', moss: '#3a8a66', mossHighlight: '#7df5b4', mossDark: '#1b4d37',
    bgWall: '#111320', bgWallDark: '#090a12', strata: '#323850',
  },
  archive: {
    base: '#152130', speck: '#1e3044', light: '#305470', dark: '#0c141e', deepDark: '#050a10',
    edge: '#407694', moss: '#2a8a82', mossHighlight: '#7df5ec', mossDark: '#134743',
    bgWall: '#0a121c', bgWallDark: '#050a0f', strata: '#223852',
  },
  gardens: {
    base: '#14261e', speck: '#1d3529', light: '#326046', dark: '#0b1611', deepDark: '#050b08',
    edge: '#52a06e', moss: '#42c07a', mossHighlight: '#a4ffcc', mossDark: '#185433',
    bgWall: '#0b1611', bgWallDark: '#050c09', strata: '#234434',
  },
  forge: {
    base: '#281b18', speck: '#382522', light: '#5c3d36', dark: '#160e0d', deepDark: '#0a0505',
    edge: '#925c44', moss: '#c2562a', mossHighlight: '#ffa24e', mossDark: '#66220e',
    bgWall: '#140c0a', bgWallDark: '#0a0605', strata: '#3e2620',
  },
  spire: {
    base: '#1b1c32', speck: '#262746', light: '#404374', dark: '#0f1020', deepDark: '#070712',
    edge: '#7072b6', moss: '#6e68d8', mossHighlight: '#bab5ff', mossDark: '#363278',
    bgWall: '#0e0e1c', bgWallDark: '#070710', strata: '#2b2c4e',
  },
  heart: {
    base: '#261834', speck: '#342144', light: '#50326c', dark: '#140c1e', deepDark: '#090510',
    edge: '#7c4a9a', moss: '#a62d7c', mossHighlight: '#ff70c8', mossDark: '#5c1243',
    bgWall: '#130c1c', bgWallDark: '#0a0510', strata: '#3a224e',
  },
  abyss: {
    base: '#111c2e', speck: '#182741', light: '#263c5c', dark: '#0a1020', deepDark: '#04070f',
    edge: '#3f6390', moss: '#22406e', mossHighlight: '#6f9fff', mossDark: '#122340',
    bgWall: '#070c17', bgWallDark: '#04070c', strata: '#1a2942',
  },
  mire: {
    base: '#1a2a1c', speck: '#233622', light: '#3a5232', dark: '#0e170f', deepDark: '#060c07',
    edge: '#5c8a45', moss: '#52a03a', mossHighlight: '#b6e866', mossDark: '#2a5420',
    bgWall: '#0c140d', bgWallDark: '#060b07', strata: '#213222',
  },
  citadel: {
    base: '#202838', speck: '#2b3548', light: '#415170', dark: '#131a28', deepDark: '#080c15',
    edge: '#6a86b8', moss: '#3c6a9c', mossHighlight: '#9fd8ff', mossDark: '#1d3854',
    bgWall: '#101520', bgWallDark: '#080c14', strata: '#263246',
  },
  rift: {
    base: '#2a1430', speck: '#382048', light: '#542c62', dark: '#170b1c', deepDark: '#0a0410',
    edge: '#8a4ab0', moss: '#a02a9c', mossHighlight: '#ff7ad6', mossDark: '#4c1450',
    bgWall: '#15081c', bgWallDark: '#0a0410', strata: '#341c42',
  },
};

export const BRICK_PAL: Record<Theme, BrickPal> = {
  cave: { base: '#2b2d46', mortar: '#131422', light: '#46496c', dark: '#1c1e30', edge: '#524e84', cracked: '#0d0e18' },
  ruins: { base: '#323850', mortar: '#151726', light: '#52597a', dark: '#202336', edge: '#646c9a', cracked: '#0e101b' },
  archive: { base: '#203244', mortar: '#0e1620', light: '#38546b', dark: '#15212f', edge: '#407694', cracked: '#0a0f16' },
  gardens: { base: '#224036', mortar: '#0d1a15', light: '#3d6858', dark: '#152a24', edge: '#52a06e', cracked: '#08120e' },
  forge: { base: '#462c26', mortar: '#1b100d', light: '#6b473e', dark: '#2e1a16', edge: '#925c44', cracked: '#120a08' },
  spire: { base: '#2d2e50', mortar: '#121224', light: '#474978', dark: '#1c1d36', edge: '#7072b6', cracked: '#0b0b18' },
  heart: { base: '#362444', mortar: '#150a1c', light: '#56386a', dark: '#22142e', edge: '#7c4a9a', cracked: '#0d0512' },
  abyss: { base: '#1c2a40', mortar: '#0b1220', light: '#2e4462', dark: '#121c2c', edge: '#3f6390', cracked: '#060a12' },
  mire: { base: '#2b3a26', mortar: '#131e0f', light: '#45583a', dark: '#1e2a18', edge: '#5c8a45', cracked: '#0c1408' },
  citadel: { base: '#2a3448', mortar: '#121a28', light: '#445676', dark: '#1c2638', edge: '#6a86b8', cracked: '#0b1018' },
  rift: { base: '#3c1c48', mortar: '#1a0c22', light: '#5c3070', dark: '#281236', edge: '#8a4ab0', cracked: '#120616' },
};

export interface Tileset {
  rock: HTMLCanvasElement[];
  brick: HTMLCanvasElement[];
  bgWall: HTMLCanvasElement[];
  innerCorner: HTMLCanvasElement[];
  oneway: HTMLCanvasElement;
  spike: HTMLCanvasElement;
  crumble: HTMLCanvasElement;
}

function mk(w: number, h: number, fn: (c: Ctx) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  fn(c);
  return cv;
}

export function buildTileset(theme: Theme): Tileset {
  const rp = ROCK_PAL[theme];
  const bp = BRICK_PAL[theme];

  /* ------------------------------------------------------------------ */
  /*  Rock tiles — rounded outer corners, organic moss, strata bands    */
  /* ------------------------------------------------------------------ */
  const rock: HTMLCanvasElement[] = [];
  for (let mask = 0; mask < 16; mask++) {
    for (let v = 0; v < 3; v++) {
      rock.push(mk(16, 16, (c) => {
        const openN = !!(mask & 1);
        const openE = !!(mask & 2);
        const openS = !!(mask & 4);
        const openW = !!(mask & 8);

        // 1. Base stone fill
        c.fillStyle = rp.base;
        c.fillRect(0, 0, 16, 16);

        // 2. Layered geological strata (subtle horizontal sedimentary bands)
        const yOff1 = v % 2;
        c.fillStyle = rp.strata;
        c.fillRect(0, 2 + yOff1, 16, 3);
        c.fillStyle = rp.speck;
        c.fillRect(0, 8 - yOff1, 16, 3);
        c.fillStyle = rp.dark;
        c.fillRect(0, 12, 16, 3);

        // 3. Natural fracture cracks across strata
        c.fillStyle = rp.deepDark;
        const cx1 = 3 + (v * 4) % 9;
        c.fillRect(cx1, 3, 1, 3);
        c.fillRect(cx1 + 1, 5, 1, 3);
        const cx2 = 10 + (v * 3) % 4;
        c.fillRect(cx2, 8, 1, 3);
        c.fillRect(cx2 - 1, 10, 1, 2);

        // 4. Subtle crystal specks embedded inside the stone
        c.fillStyle = rp.mossHighlight;
        c.fillRect((v * 7 + 5) % 13, (v * 5 + 6) % 11, 1, 1);
        if (v === 1) c.fillRect(12, 10, 1, 1);

        // 5. Chamfer/Round outer corners when adjacent edges are open
        // Top-Left outer corner
        if (openN && openW) {
          c.clearRect(0, 0, 3, 1);
          c.clearRect(0, 1, 2, 1);
          c.clearRect(0, 2, 1, 1);
          c.fillStyle = rp.edge;
          c.fillRect(3, 0, 1, 1); c.fillRect(2, 1, 1, 1); c.fillRect(1, 2, 1, 1); c.fillRect(0, 3, 1, 1);
          c.fillStyle = rp.light;
          c.fillRect(3, 1, 1, 1); c.fillRect(2, 2, 1, 1); c.fillRect(1, 3, 1, 1);
        }
        // Top-Right outer corner
        if (openN && openE) {
          c.clearRect(13, 0, 3, 1);
          c.clearRect(14, 1, 2, 1);
          c.clearRect(15, 2, 1, 1);
          c.fillStyle = rp.edge;
          c.fillRect(12, 0, 1, 1); c.fillRect(13, 1, 1, 1); c.fillRect(14, 2, 1, 1); c.fillRect(15, 3, 1, 1);
          c.fillStyle = rp.light;
          c.fillRect(12, 1, 1, 1); c.fillRect(13, 2, 1, 1); c.fillRect(14, 3, 1, 1);
        }
        // Bottom-Left outer corner
        if (openS && openW) {
          c.clearRect(0, 15, 3, 1);
          c.clearRect(0, 14, 2, 1);
          c.clearRect(0, 13, 1, 1);
          c.fillStyle = rp.deepDark;
          c.fillRect(0, 12, 1, 1); c.fillRect(1, 13, 1, 1); c.fillRect(2, 14, 1, 1); c.fillRect(3, 15, 1, 1);
        }
        // Bottom-Right outer corner
        if (openS && openE) {
          c.clearRect(13, 15, 3, 1);
          c.clearRect(14, 14, 2, 1);
          c.clearRect(15, 13, 1, 1);
          c.fillStyle = rp.deepDark;
          c.fillRect(15, 12, 1, 1); c.fillRect(14, 13, 1, 1); c.fillRect(13, 14, 1, 1); c.fillRect(12, 15, 1, 1);
        }

        // 6. Lush organic top surface (openN) — wavy turf with drooping fronds
        if (openN) {
          const xStart = (openN && openW) ? 3 : 0;
          const xEnd = (openN && openE) ? 12 : 15;
          const span = xEnd - xStart + 1;
          // stone rim highlight
          c.fillStyle = rp.edge;
          c.fillRect(xStart, 0, span, 1);
          c.fillStyle = rp.light;
          c.fillRect(xStart, 1, span, 1);

          // lush moss layer across the surface
          c.fillStyle = rp.moss;
          c.fillRect(xStart, 0, span, 1);
          c.fillRect(xStart, 1, span, 1);

          // organic drooping fronds / hanging moss
          const frondPatterns: Array<Array<[number, number, number]>> = [
            [[2, 2, 2], [7, 3, 3], [12, 2, 2]],
            [[1, 3, 2], [6, 2, 3], [11, 3, 2]],
            [[3, 2, 3], [8, 3, 2], [13, 2, 2]],
          ];
          const fronds = frondPatterns[v];
          for (const [fx, fw, fLen] of fronds) {
            if (fx >= xStart && fx + fw - 1 <= xEnd) {
              c.fillStyle = rp.moss;
              c.fillRect(fx, 2, fw, fLen);
              // highlight tip
              c.fillStyle = rp.mossHighlight;
              c.fillRect(fx, 1, fw, 1);
              c.fillRect(fx + Math.floor(fw / 2), 2 + fLen - 1, 1, 1);
              // cast shadow underneath the drooping frond onto the stone
              c.fillStyle = rp.mossDark;
              c.fillRect(fx, 2 + fLen, fw, 1);
            }
          }
          // micro tufts sticking up slightly
          c.fillStyle = rp.mossHighlight;
          if (xStart <= 4 && xEnd >= 4) c.fillRect(4, 0, 1, 1);
          if (xStart <= 9 && xEnd >= 9) c.fillRect(9, 0, 1, 1);
          if (xStart <= 13 && xEnd >= 13) c.fillRect(13, 0, 1, 1);
        }

        // 7. Ceiling underside (openS) — stalactite drips & deep crevices
        if (openS) {
          const xStart = (openS && openW) ? 3 : 0;
          const xEnd = (openS && openE) ? 12 : 15;
          const span = xEnd - xStart + 1;
          c.fillStyle = rp.deepDark;
          c.fillRect(xStart, 14, span, 2);
          c.fillStyle = rp.dark;
          c.fillRect(xStart, 13, span, 1);
          // small jagged stalactite teeth
          const stx1 = Math.max(xStart, 4 + (v % 2) * 2);
          const stx2 = Math.min(xEnd - 1, 10 + (v % 2) * 2);
          c.fillStyle = rp.deepDark;
          c.fillRect(stx1, 15, 2, 1);
          c.fillRect(stx2, 15, 2, 1);
          c.fillStyle = rp.dark;
          c.fillRect(stx1, 14, 2, 1);
        }

        // 8. Left wall edge (openW)
        if (openW) {
          const yStart = (openN && openW) ? 3 : 0;
          const yEnd = (openS && openW) ? 12 : 15;
          const span = yEnd - yStart + 1;
          c.fillStyle = rp.light;
          c.fillRect(0, yStart, 1, span);
          // creeping lichen patches
          c.fillStyle = rp.moss;
          c.fillRect(0, yStart + 2, 2, 2);
          c.fillRect(0, yStart + 6, 1, 3);
          c.fillStyle = rp.mossHighlight;
          c.fillRect(0, yStart + 3, 1, 1);
        }

        // 9. Right wall edge (openE)
        if (openE) {
          const yStart = (openN && openE) ? 3 : 0;
          const yEnd = (openS && openE) ? 12 : 15;
          const span = yEnd - yStart + 1;
          c.fillStyle = rp.deepDark;
          c.fillRect(15, yStart, 1, span);
          c.fillStyle = rp.dark;
          c.fillRect(14, yStart, 1, span);
        }
      }));
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Ancient Masonry Bricks — chiseled ashlar blocks, mortar grooves   */
  /* ------------------------------------------------------------------ */
  const brick: HTMLCanvasElement[] = [];
  for (let mask = 0; mask < 16; mask++) {
    brick.push(mk(16, 16, (c) => {
      const openN = !!(mask & 1);
      const openE = !!(mask & 2);
      const openS = !!(mask & 4);
      const openW = !!(mask & 8);

      // base brick stone
      c.fillStyle = bp.base;
      c.fillRect(0, 0, 16, 16);

      // mortar lines (recessed joints)
      c.fillStyle = bp.mortar;
      c.fillRect(0, 0, 16, 1);
      c.fillRect(0, 8, 16, 1);
      c.fillRect(7, 0, 1, 8);   // row 1 joint
      c.fillRect(3, 8, 1, 8);   // row 2 joint
      c.fillRect(11, 8, 1, 8);  // row 2 joint

      // chiseled highlight on upper edges of blocks
      c.fillStyle = bp.light;
      c.fillRect(1, 1, 6, 1);
      c.fillRect(8, 1, 7, 1);
      c.fillRect(1, 9, 2, 1);
      c.fillRect(4, 9, 7, 1);
      c.fillRect(12, 9, 3, 1);

      // deep shadow along underside of blocks inside mortar
      c.fillStyle = bp.dark;
      c.fillRect(1, 7, 6, 1);
      c.fillRect(8, 7, 7, 1);
      c.fillRect(1, 15, 2, 1);
      c.fillRect(4, 15, 7, 1);
      c.fillRect(12, 15, 3, 1);

      // diagonal stress crack across joints
      c.fillStyle = bp.cracked;
      c.fillRect(5, 4, 1, 2); c.fillRect(6, 6, 1, 2); c.fillRect(7, 8, 1, 1); c.fillRect(8, 9, 1, 2);

      // rounded/chipped outer corners
      if (openN && openW) { c.clearRect(0, 0, 2, 1); c.clearRect(0, 1, 1, 1); }
      if (openN && openE) { c.clearRect(14, 0, 2, 1); c.clearRect(15, 1, 1, 1); }
      if (openS && openW) { c.clearRect(0, 15, 2, 1); c.clearRect(0, 14, 1, 1); }
      if (openS && openE) { c.clearRect(14, 15, 2, 1); c.clearRect(15, 14, 1, 1); }

      // top exposed rim & moss
      if (openN) {
        c.fillStyle = bp.edge;
        c.fillRect(openW ? 2 : 0, 0, (openE ? 14 : 16) - (openW ? 2 : 0), 1);
        c.fillStyle = rp.moss;
        c.fillRect(3, 0, 3, 1); c.fillRect(10, 0, 3, 1);
      }
      if (openS) {
        c.fillStyle = '#000000'; c.globalAlpha = 0.45;
        c.fillRect(openW ? 2 : 0, 15, (openE ? 14 : 16) - (openW ? 2 : 0), 1);
        c.globalAlpha = 1;
      }
      if (openW) { c.fillStyle = bp.light; c.fillRect(0, openN ? 2 : 0, 1, (openS ? 14 : 16) - (openN ? 2 : 0)); }
      if (openE) { c.fillStyle = bp.dark; c.fillRect(15, openN ? 2 : 0, 1, (openS ? 14 : 16) - (openN ? 2 : 0)); }
    }));
  }

  /* ------------------------------------------------------------------ */
  /*  Cavern Background Wall Tiles — deep subterranean atmosphere       */
  /* ------------------------------------------------------------------ */
  const bgWall: HTMLCanvasElement[] = [];
  for (let v = 0; v < 6; v++) {
    bgWall.push(mk(16, 16, (c) => {
      c.fillStyle = rp.bgWall;
      c.fillRect(0, 0, 16, 16);

      // subtle background stone strata
      c.fillStyle = rp.bgWallDark;
      const by = (v * 4) % 12;
      c.fillRect(0, by, 16, 2);
      c.fillRect(0, (by + 7) % 16, 16, 2);

      // faint large-block masonry / natural fissure joint
      if (v % 2 === 0) {
        c.fillStyle = rp.bgWallDark;
        c.fillRect(4 + (v * 3) % 8, by, 1, 7);
      }

      // tiny embedded crystal speck in background
      if (v === 2 || v === 5) {
        c.fillStyle = rp.mossHighlight;
        c.globalAlpha = 0.35;
        c.fillRect(7 + (v * 2) % 6, 8, 1, 1);
        c.globalAlpha = 1;
      }
    }));
  }

  /* ------------------------------------------------------------------ */
  /*  Inner Corner Bevels (NW, NE, SW, SE) — softens inside 90° joints  */
  /* ------------------------------------------------------------------ */
  const innerCorner: HTMLCanvasElement[] = [
    // NW: corner at top-left
    mk(16, 16, (c) => {
      c.fillStyle = rp.deepDark;
      c.fillRect(0, 0, 2, 1); c.fillRect(0, 1, 1, 1);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(2, 0, 1, 1); c.fillRect(1, 1, 1, 1); c.fillRect(0, 2, 1, 1);
    }),
    // NE: corner at top-right
    mk(16, 16, (c) => {
      c.fillStyle = rp.deepDark;
      c.fillRect(14, 0, 2, 1); c.fillRect(15, 1, 1, 1);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(13, 0, 1, 1); c.fillRect(14, 1, 1, 1); c.fillRect(15, 2, 1, 1);
    }),
    // SW: corner at bottom-left
    mk(16, 16, (c) => {
      c.fillStyle = rp.deepDark;
      c.fillRect(0, 15, 2, 1); c.fillRect(0, 14, 1, 1);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(2, 15, 1, 1); c.fillRect(1, 14, 1, 1); c.fillRect(0, 13, 1, 1);
    }),
    // SE: corner at bottom-right
    mk(16, 16, (c) => {
      c.fillStyle = rp.deepDark;
      c.fillRect(14, 15, 2, 1); c.fillRect(15, 14, 1, 1);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(13, 15, 1, 1); c.fillRect(14, 14, 1, 1); c.fillRect(15, 13, 1, 1);
    }),
  ];

  /* ------------------------------------------------------------------ */
  /*  One-Way Platform — ornate ancient suspension beam                 */
  /* ------------------------------------------------------------------ */
  const oneway = mk(16, 16, (c) => {
    // top walking edge
    c.fillStyle = rp.edge; c.fillRect(0, 0, 16, 1);
    c.fillStyle = rp.light; c.fillRect(0, 1, 16, 2);
    // main wood/stone beam body
    c.fillStyle = rp.base; c.fillRect(0, 3, 16, 2);
    c.fillStyle = rp.dark; c.fillRect(0, 5, 16, 1);
    // iron rivets & mounting brackets
    c.fillStyle = '#b8bdd4';
    c.fillRect(2, 2, 2, 2);
    c.fillRect(12, 2, 2, 2);
    c.fillStyle = '#1a1c2c';
    c.fillRect(2, 3, 1, 1);
    c.fillRect(12, 3, 1, 1);
    // hanging rope / trailing ivy fronds drooping down
    c.fillStyle = rp.moss;
    c.fillRect(4, 6, 1, 2); c.fillRect(10, 6, 1, 3); c.fillRect(11, 7, 1, 1);
    c.fillStyle = rp.mossHighlight;
    c.fillRect(4, 8, 1, 1); c.fillRect(10, 9, 1, 1);
    // top moss patches on platform
    c.fillStyle = rp.moss;
    c.fillRect(5, 0, 3, 1); c.fillRect(13, 0, 2, 1);
  });

  /* ------------------------------------------------------------------ */
  /*  Spikes — cluster of jagged mineral stalagmites & needle spikes    */
  /* ------------------------------------------------------------------ */
  const spike = mk(16, 16, (c) => {
    // dark jagged rock base
    c.fillStyle = rp.deepDark; c.fillRect(0, 13, 16, 3);
    c.fillStyle = rp.dark; c.fillRect(0, 12, 16, 2);
    c.fillStyle = rp.strata; c.fillRect(0, 12, 16, 1);

    // 4 needle spikes with 3D faceted shading
    const spikeDefs: Array<[number, number, number]> = [
      [2, 5, 10],   // x, yTop, height
      [6, 3, 12],
      [10, 2, 13],
      [14, 6, 9],
    ];
    for (const [sx, sy, h] of spikeDefs) {
      for (let r = 0; r < h; r++) {
        const y = sy + r;
        const hw = Math.max(0, Math.floor((r / h) * 2));
        // left highlight facet
        c.fillStyle = '#e8eeff';
        c.fillRect(sx - hw, y, 1, 1);
        // center mid-tone
        if (hw > 0) {
          c.fillStyle = '#9aa0bd';
          c.fillRect(sx - hw + 1, y, hw * 2 - 1, 1);
        }
        // right shadow facet
        c.fillStyle = '#4a4f6e';
        c.fillRect(sx + hw, y, 1, 1);
      }
      // sharp gleaming tip
      c.fillStyle = '#ffffff';
      c.fillRect(sx, sy, 1, 1);
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Crumble Block — fractured, weathered stone slab                   */
  /* ------------------------------------------------------------------ */
  const crumble = mk(16, 16, (c) => {
    c.fillStyle = rp.light; c.fillRect(0, 0, 16, 1);
    c.fillStyle = rp.base; c.fillRect(0, 1, 16, 6);
    c.fillStyle = rp.dark; c.fillRect(0, 7, 16, 1);
    // deep fissure cracks
    c.fillStyle = rp.deepDark;
    c.fillRect(3, 1, 1, 3); c.fillRect(4, 3, 1, 3); c.fillRect(5, 5, 1, 2);
    c.fillRect(10, 0, 1, 3); c.fillRect(11, 2, 1, 3); c.fillRect(10, 5, 1, 2);
    c.fillRect(13, 3, 2, 1);
    // chipped corners
    c.fillStyle = rp.dark;
    c.fillRect(0, 0, 1, 1); c.fillRect(15, 0, 1, 1);
    // crumbling pebble fragments underneath
    c.fillStyle = rp.speck;
    c.fillRect(2, 8, 2, 1); c.fillRect(8, 8, 1, 2); c.fillRect(13, 8, 2, 1);
  });

  return { rock, brick, bgWall, innerCorner, oneway, spike, crumble };
}

/* ------------------------------------------------------------------ */
/*  Objects                                                            */
/* ------------------------------------------------------------------ */
export function drawCrystal(ctx: Ctx, cx: number, cy: number, t: number, big: boolean) {
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  const rows = big ? [2, 4, 6, 8, 10, 10, 8, 6, 4, 2] : [2, 4, 6, 6, 6, 4, 2];
  const light = big ? '#f4c2ff' : '#c6fbff';
  const mid = big ? '#c15cf5' : '#4fd8f0';
  const dark = big ? '#6b22a8' : '#1b7fa0';
  const h = rows.length;
  const top = -Math.floor(h / 2);
  for (let i = 0; i < h; i++) {
    const w = rows[i];
    const y = top + i;
    ctx.fillStyle = dark; ctx.fillRect(-w / 2 - 1, y, w + 2, 1);
    ctx.fillStyle = light; ctx.fillRect(-w / 2, y, w / 2, 1);
    ctx.fillStyle = mid; ctx.fillRect(0, y, w / 2, 1);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-1, top + 1, 1, Math.max(1, Math.floor(h / 3)));
  const sp = Math.floor(t / 6) % 8;
  if (sp < 3) ctx.fillRect(-rows[0] / 2 - 2 + sp, top - 1, 1, 1);
  ctx.restore();
}

export function drawPlate(ctx: Ctx, x: number, y: number, anim: number, pressed: boolean, noEcho: boolean, echoOnly = false, timed = 0, hold = 0) {
  const d = Math.round(anim * 2);
  const charge = Math.max(0, Math.min(1, timed > 0 ? hold / (timed * 60) : 0));
  // kamienne obramowanie płyty
  ctx.fillStyle = '#121422'; ctx.fillRect(x, y + 12, 16, 4);
  ctx.fillStyle = '#2a2e42'; ctx.fillRect(x, y + 12, 16, 1);
  ctx.fillStyle = '#3f455c'; ctx.fillRect(x + 1, y + 13, 14, 1);
  // korpus płyty naciskowej
  ctx.fillStyle = '#5a5f7a'; ctx.fillRect(x + 2, y + 11 + d, 12, 3 - d);
  ctx.fillStyle = '#7d839f'; ctx.fillRect(x + 2, y + 11 + d, 12, 1);
  const tint = echoOnly ? '#c9a6ff' : noEcho ? '#ffb347' : '#6ff3ff';
  const dim = echoOnly ? '#4a2f72' : noEcho ? '#5a3a1a' : '#30415e';
  ctx.fillStyle = pressed ? tint : dim;
  ctx.fillRect(x + 4, y + 12 + d, 8, 1);
  ctx.fillRect(x + 7, y + 11 + d, 2, 1);
  if (echoOnly) {
    // symbol echa: biegnąca fala
    ctx.fillStyle = pressed ? '#e9dcff' : '#7754a8';
    ctx.fillRect(x + 5, y + 13 + d, 6, 1);
    ctx.fillRect(x + 6, y + 12 + d, 2, 1);
    if (pressed) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 8, y + 12 + d, 1, 1);
    }
  }
  if (timed > 0) {
    // pierścień czasu: zapala się, gdy płyta trzyma napięcie
    const fill = Math.round(12 * charge);
    ctx.fillStyle = '#24283c'; ctx.fillRect(x + 2, y + 15, 12, 1);
    ctx.fillStyle = charge > 0 ? '#7be2ff' : '#2c3348'; ctx.fillRect(x + 2, y + 15, fill, 1);
    if (charge > 0.25) {
      ctx.fillStyle = `rgba(123,226,255,${0.25 + charge * 0.6})`;
      ctx.fillRect(x + 1, y + 10, 14, 1);
    }
  }
}

export function drawLever(ctx: Ctx, x: number, y: number, on: boolean, timed: boolean, frac: number) {
  ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x + 3, y + 13, 10, 3);
  ctx.fillStyle = '#5a5f7a'; ctx.fillRect(x + 4, y + 12, 8, 2);
  ctx.fillStyle = '#9aa0bd'; ctx.fillRect(x + 7, y + 11, 2, 2);
  const tipX = on ? x + 12 : x + 3;
  const tipY = y + 6;
  const px = x + 7.5, py = y + 12;
  ctx.fillStyle = '#b9bdd4';
  for (let i = 0; i <= 6; i++) {
    const f = i / 6;
    ctx.fillRect(Math.round(px + (tipX - px) * f) , Math.round(py + (tipY - py) * f), 1, 1);
  }
  const active = on || (timed && frac > 0);
  ctx.fillStyle = active ? (timed ? '#ffb347' : '#6ff3ff') : '#6b6f8a';
  ctx.fillRect(tipX - 1, tipY - 1, 3, 3);
  if (timed && frac > 0) {
    ctx.fillStyle = '#2a1a0a'; ctx.fillRect(x + 1, y + 1, 14, 3);
    ctx.fillStyle = frac < 0.3 ? '#ff5a3c' : '#ffb347'; ctx.fillRect(x + 2, y + 2, Math.max(1, Math.round(12 * frac)), 1);
  }
}

export function drawDoor(ctx: Ctx, x: number, y: number, tiles: number, anim: number, latch: boolean, latched: boolean, t: number) {
  const h = tiles * 16;
  ctx.fillStyle = '#3a3f5c'; ctx.fillRect(x, y, 2, h); ctx.fillRect(x + 14, y, 2, h);
  ctx.fillStyle = '#5a6080'; ctx.fillRect(x, y, 1, h); ctx.fillRect(x + 15, y, 1, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(x + 2, y, 12, h); ctx.clip();
  const sy = y - Math.round(anim * (h - 2));
  ctx.fillStyle = '#262a40'; ctx.fillRect(x + 2, sy, 12, h);
  ctx.fillStyle = '#4a5070'; ctx.fillRect(x + 2, sy, 12, 1); ctx.fillRect(x + 2, sy, 1, h); ctx.fillRect(x + 13, sy, 1, h);
  ctx.fillStyle = '#1b1e2f';
  for (let yy = 8; yy < h; yy += 8) ctx.fillRect(x + 3, sy + yy, 10, 1);
  const glow = anim > 0.05 || (Math.floor(t / 20) % 2 === 0);
  ctx.fillStyle = anim > 0.05 ? '#6ff3ff' : (glow ? '#2f93b5' : '#1f6b85');
  ctx.fillRect(x + 7, sy + 2, 2, h - 4);
  for (let k = 1; k <= tiles; k++) {
    const cy = sy + k * 16 - 8;
    ctx.fillRect(x + 6, cy - 1, 4, 1); ctx.fillRect(x + 6, cy + 1, 4, 1); ctx.fillRect(x + 5, cy, 1, 1); ctx.fillRect(x + 10, cy, 1, 1);
  }
  if (latch) {
    ctx.fillStyle = latched ? '#ffd166' : '#8a6a2a';
    ctx.fillRect(x + 5, sy + h - 7, 6, 1); ctx.fillRect(x + 5, sy + h - 3, 6, 1); ctx.fillRect(x + 5, sy + h - 7, 1, 5); ctx.fillRect(x + 10, sy + h - 7, 1, 5);
  }
  ctx.restore();
}

export function drawCheckpoint(ctx: Ctx, x: number, y: number, active: boolean, t: number) {
  ctx.fillStyle = '#2a2e45'; ctx.fillRect(x + 4, y + 14, 8, 2);
  ctx.fillStyle = '#3a3f5a'; ctx.fillRect(x + 6, y + 4, 4, 10);
  ctx.fillStyle = '#555b7d'; ctx.fillRect(x + 6, y + 4, 1, 10);
  ctx.fillStyle = active ? '#6ff3ff' : '#2a3a4a'; ctx.fillRect(x + 7, y + 7, 2, 1); ctx.fillRect(x + 7, y + 10, 2, 1);
  const pulse = active ? (Math.floor(t / 10) % 2 ? '#c6fbff' : '#6ff3ff') : '#2a3a4a';
  ctx.fillStyle = pulse; ctx.fillRect(x + 7, y + 1, 2, 3); ctx.fillRect(x + 6, y + 2, 4, 1);
  if (active) {
    ctx.fillStyle = '#ffffff';
    const a = t * 0.05;
    ctx.fillRect(Math.round(x + 8 + Math.cos(a) * 5), Math.round(y + 7 + Math.sin(a) * 3), 1, 1);
    ctx.fillRect(Math.round(x + 8 + Math.cos(a + 3.1) * 5), Math.round(y + 7 + Math.sin(a + 3.1) * 3), 1, 1);
  }
}

export function drawShrine(ctx: Ctx, x: number, y: number, t: number, near: boolean) {
  ctx.fillStyle = '#23263a'; ctx.fillRect(x + 2, y + 10, 12, 6);
  ctx.fillStyle = '#4a4f6e'; ctx.fillRect(x + 1, y + 9, 14, 2);
  ctx.fillStyle = '#6a7092'; ctx.fillRect(x + 1, y + 9, 14, 1);
  ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x + 4, y + 12, 1, 3); ctx.fillRect(x + 11, y + 12, 1, 3);
  const p = Math.floor(t / 12) % 2;
  ctx.fillStyle = '#c15cf5'; ctx.fillRect(x + 4, y + 5, 1, 4);
  ctx.fillStyle = near || p ? '#9ff9ff' : '#4fd8f0'; ctx.fillRect(x + 7, y + 3, 2, 6);
  ctx.fillStyle = '#4fd8f0'; ctx.fillRect(x + 11, y + 6, 1, 3);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 7, y + 3, 1, 2);
  if (near) {
    ctx.fillStyle = '#9ff9ff';
    ctx.fillRect(x + 8, y - 2 + Math.round(Math.sin(t * 0.1)), 1, 1);
  }
}

export function drawSign(ctx: Ctx, x: number, y: number, t: number, near: boolean) {
  ctx.fillStyle = '#3a3f5a'; ctx.fillRect(x + 4, y + 8, 8, 8);
  ctx.fillStyle = '#555b7d'; ctx.fillRect(x + 4, y + 8, 8, 1); ctx.fillRect(x + 4, y + 8, 1, 8);
  ctx.fillStyle = '#1e2133'; ctx.fillRect(x + 6, y + 10, 4, 1); ctx.fillRect(x + 6, y + 12, 4, 1); ctx.fillRect(x + 6, y + 14, 3, 1);
  const cy = y + 3 + Math.round(Math.sin(t * 0.08));
  ctx.fillStyle = near ? '#9ff9ff' : '#3e8aa8';
  ctx.fillRect(x + 7, cy - 1, 2, 1); ctx.fillRect(x + 6, cy, 4, 1); ctx.fillRect(x + 7, cy + 1, 2, 1);
}

export function drawMover(ctx: Ctx, x: number, y: number, w: number, t: number) {
  ctx.fillStyle = '#6a7092'; ctx.fillRect(x, y, w, 1);
  ctx.fillStyle = '#3f445f'; ctx.fillRect(x, y + 1, w, 5);
  ctx.fillStyle = '#23263a'; ctx.fillRect(x, y + 6, w, 2);
  for (let i = 4; i < w; i += 8) {
    ctx.fillStyle = (Math.floor(t / 15) + i) % 3 === 0 ? '#9ff9ff' : '#2f93b5';
    ctx.fillRect(x + i, y + 3, 2, 1);
  }
}

export function drawExit(ctx: Ctx, x: number, y: number, t: number, final: boolean) {
  if (final) {
    const rows = [2, 4, 6, 8, 10, 12, 14, 14, 14, 12, 12, 10, 8, 6, 4, 2];
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.06);
    const top = y - 28;
    for (let i = 0; i < rows.length; i++) {
      const w = rows[i];
      ctx.fillStyle = '#5a1d8a'; ctx.fillRect(x + 8 - w / 2 - 1, top + i * 2, w + 2, 2);
      ctx.fillStyle = '#ff9bf5'; ctx.fillRect(x + 8 - w / 2, top + i * 2, w / 2, 2);
      ctx.fillStyle = '#c15cf5'; ctx.fillRect(x + 8, top + i * 2, w / 2, 2);
    }
    ctx.fillStyle = `rgba(255,255,255,${0.5 + pulse * 0.5})`;
    ctx.fillRect(x + 6, top + 4, 2, 10);
    ctx.fillStyle = '#ff9bf5'; ctx.fillRect(x - 2, y + 2, 2, 14); ctx.fillRect(x + 16, y - 2, 2, 18);
    ctx.fillStyle = '#5a1d8a'; ctx.fillRect(x - 3, y + 1, 1, 15); ctx.fillRect(x + 18, y - 3, 1, 19);
    return;
  }
  ctx.fillStyle = '#3f445f'; ctx.fillRect(x - 2, y - 16, 3, 32); ctx.fillRect(x + 15, y - 16, 3, 32); ctx.fillRect(x - 2, y - 19, 20, 3);
  ctx.fillStyle = '#6a7092'; ctx.fillRect(x - 2, y - 16, 1, 32); ctx.fillRect(x + 15, y - 16, 1, 32); ctx.fillRect(x - 2, y - 19, 20, 1);
  const g = ctx.createLinearGradient(0, y - 16, 0, y + 16);
  g.addColorStop(0, 'rgba(111,243,255,0.85)');
  g.addColorStop(1, 'rgba(20,60,90,0.6)');
  ctx.fillStyle = g; ctx.fillRect(x + 1, y - 16, 14, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let yy = 0; yy < 32; yy += 4) {
    const off = Math.round(Math.sin(t * 0.12 + yy * 0.5) * 3);
    ctx.fillRect(x + 4 + off, y - 16 + yy, 6, 1);
  }
}

/* ------------------------------------------------------------------ */
/*  Decorations                                                        */
/* ------------------------------------------------------------------ */
export interface DecorPal { plantA: string; plantB: string; glow: string; mush: string; mushStem: string; grass: string; vine: string; crystalA: string; crystalB: string }
export const DECOR_PAL: Record<Theme, DecorPal> = {
  cave: { plantA: '#2fd3b0', plantB: '#1a8a74', glow: '#9ffbe6', mush: '#5fa8ff', mushStem: '#2a5ea8', grass: '#1f4f44', vine: '#2d5a4a', crystalA: '#8ff2ff', crystalB: '#2fa3c9' },
  ruins: { plantA: '#3fe0a0', plantB: '#1f8a60', glow: '#b5ffd9', mush: '#7fb8ff', mushStem: '#3a6ea8', grass: '#235744', vine: '#3a6a4a', crystalA: '#a0f0ff', crystalB: '#3aa0d0' },
  archive: { plantA: '#36c9d9', plantB: '#1b7a90', glow: '#bff7ff', mush: '#5fd0ff', mushStem: '#2a78a8', grass: '#1d4a56', vine: '#2a5a60', crystalA: '#9ff0ff', crystalB: '#2f9ad0' },
  gardens: { plantA: '#5cff9f', plantB: '#1f9a5a', glow: '#d8ffe8', mush: '#ffd36a', mushStem: '#8a6a2a', grass: '#2a6a44', vine: '#3a8a5a', crystalA: '#b8ffe0', crystalB: '#2fcf8a' },
  forge: { plantA: '#ff9a3a', plantB: '#9a3a1a', glow: '#ffd9a8', mush: '#ff6a3a', mushStem: '#6a2a1a', grass: '#5a3a2a', vine: '#6a3a2a', crystalA: '#ffd08a', crystalB: '#e0602a' },
  spire: { plantA: '#9b8cff', plantB: '#5a4ab0', glow: '#e6e0ff', mush: '#c0b4ff', mushStem: '#4a3a8a', grass: '#3a3a6a', vine: '#4a4a8a', crystalA: '#e0dcff', crystalB: '#7d7cf0' },
  heart: { plantA: '#e05cff', plantB: '#8a2fb0', glow: '#ffc8ff', mush: '#ff7bf0', mushStem: '#8a2f8a', grass: '#4a1f5a', vine: '#5a2a6a', crystalA: '#ffb3f7', crystalB: '#c15cf5' },
  abyss: { plantA: '#4a7fff', plantB: '#264a9a', glow: '#9fd0ff', mush: '#4a6fff', mushStem: '#1d3a80', grass: '#1c3358', vine: '#22406e', crystalA: '#a8d8ff', crystalB: '#2d6ab0' },
  mire: { plantA: '#8fd14e', plantB: '#4a7a2a', glow: '#d8ff7a', mush: '#c8d84e', mushStem: '#4a5a20', grass: '#3a6a28', vine: '#2a5420', crystalA: '#d8ff9a', crystalB: '#6aa02a' },
  citadel: { plantA: '#69b8ff', plantB: '#2a5a9a', glow: '#cbe8ff', mush: '#6fa8ff', mushStem: '#26487a', grass: '#2a4a6a', vine: '#2d5c92', crystalA: '#c4e4ff', crystalB: '#3c72b8' },
  rift: { plantA: '#ff6ad0', plantB: '#a02a9c', glow: '#ffc0f0', mush: '#ff5ac8', mushStem: '#7a2080', grass: '#5a2a6a', vine: '#4c1450', crystalA: '#ffb0ee', crystalB: '#a02a9c' },
};

function drawHangingShard(ctx: Ctx, cx: number, top: number, len: number, baseWidth: number, pal: DecorPal, pulse: number) {
  for (let i = 0; i < len; i++) {
    const taper = Math.max(1, Math.round(baseWidth * (1 - i / len)));
    const left = Math.round(cx - taper / 2);
    ctx.fillStyle = pal.vine;
    ctx.fillRect(left - 1, top + i, taper + 2, 1);
    ctx.fillStyle = pal.crystalB;
    ctx.fillRect(left, top + i, taper, 1);
    ctx.fillStyle = pal.crystalA;
    ctx.fillRect(left, top + i, Math.max(1, Math.ceil(taper * 0.4)), 1);
    if (taper >= 4 && i < len * 0.55) {
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillRect(left + 1, top + i, 1, 1);
    }
  }
  if (pulse > 0) {
    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    ctx.fillRect(Math.round(cx), top + Math.max(1, Math.floor(len * 0.52)), 1, 2);
  }
}

function drawHangingLeaves(ctx: Ctx, x: number, y: number, len: number, sway: number, pal: DecorPal, dense = false) {
  ctx.fillStyle = pal.vine;
  ctx.fillRect(x + 7, y, 2, Math.max(2, Math.floor(len * 0.3)));
  const step = dense ? 5 : 7;
  for (let n = step; n < len; n += step) {
    const bend = Math.round(Math.sin(n * 0.18 + sway) * 1.5);
    const side = Math.floor(n / step) % 2 === 0 ? -1 : 1;
    const lx = x + 8 + bend;
    ctx.fillStyle = pal.vine;
    ctx.fillRect(lx, y + n - 1, 1, 3);
    ctx.fillStyle = n % 2 ? pal.plantB : pal.plantA;
    ctx.fillRect(lx + side * 2, y + n, 3, 2);
    ctx.fillRect(lx + side * 3, y + n - 1, 2, 1);
    if (n % (step * 2) === 0) {
      ctx.fillStyle = pal.glow;
      ctx.fillRect(lx + side * 3, y + n, 1, 1);
    }
  }
  ctx.fillStyle = pal.plantB;
  ctx.fillRect(x + 6 + Math.round(Math.sin(len * 0.1 + sway)), y + len - 2, 4, 2);
}

export const WEAVER_PAL: CharPalette = {
  outline: '#1a0a14',
  hood: '#43204a', hoodLight: '#7a4486', hoodDark: '#2a1230',
  skin: '#f7d6b3', skinShade: '#c88f6c', eye: '#ffc857',
  cloak: '#92303f', cloakLight: '#cc4a5d', cloakDark: '#5a1c2b',
  boots: '#26121f', bootsLight: '#432139',
  gem: '#ffb347', gemCore: '#fff2c4',
  scarf: '#ffe2b0', scarfDark: '#e0a860',
  belt: '#e8c36a',
};
export const ANCHOR_PAL: CharPalette = {
  outline: '#12061f',
  hood: '#4b1d7a', hoodLight: '#8a4ad0', hoodDark: '#2a0f4a',
  skin: '#c9a6ff', skinShade: '#8a5ad0', eye: '#ffffff',
  cloak: '#4a2285', cloakLight: '#7a45c8', cloakDark: '#2c1252',
  boots: '#25104a', bootsLight: '#3a1c70',
  gem: '#e8d4ff', gemCore: '#ffffff',
  scarf: '#e0ccff', scarfDark: '#a07ae0',
  belt: '#a07ae0',
};

export const REFLECT_PAL: CharPalette = {
  outline: '#26084a',
  hood: '#7a2fb8', hoodLight: '#b662f5', hoodDark: '#531a86',
  skin: '#edc8ff', skinShade: '#b47ae0', eye: '#ffffff',
  cloak: '#6c2cab', cloakLight: '#9f52de', cloakDark: '#481578',
  boots: '#360d5c', bootsLight: '#521a85',
  gem: '#ffe6ff', gemCore: '#ffffff',
  scarf: '#f0c8ff', scarfDark: '#bb77e8',
  belt: '#c98ae8',
};

/* ------------------------------------------------------------------ */
/*  New mechanics                                                      */
/* ------------------------------------------------------------------ */
/** A cage holding a captive character. (x, y) is the tile the captive stands on; `open` dissolves the bars. */
export function drawCage(ctx: Ctx, x: number, y: number, open: number, t: number) {
  const bx = x - 4, w = 24, top = y - 19, bot = y + 16;
  ctx.save();
  ctx.globalAlpha = 0.6 + 0.4 * open;
  drawCharacter(ctx, x + 8, y + 15, 1, 'idle', t, WEAVER_PAL, 'weaver');
  ctx.restore();
  const a = 1 - open;
  if (a <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = a;
  const shake = open > 0 ? Math.round(Math.sin(t * 1.3) * 1) : 0;
  ctx.translate(shake, 0);
  // bars
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = k % 2 ? '#4a4f6e' : '#6a7092';
    ctx.fillRect(bx + 2 + k * 3, top + 2, 1, bot - top - 4);
  }
  ctx.fillStyle = '#2a2d44'; ctx.fillRect(bx, top, w, 3); ctx.fillRect(bx, bot - 3, w, 3);
  ctx.fillStyle = '#7d839f'; ctx.fillRect(bx, top, w, 1); ctx.fillRect(bx, bot - 3, w, 1);
  ctx.fillStyle = '#1a1c2c'; ctx.fillRect(bx, top + 3, 1, bot - top - 6); ctx.fillRect(bx + w - 1, top + 3, 1, bot - top - 6);
  // chain & lock
  ctx.fillStyle = '#5a6080';
  for (let c = 0; c < 4; c++) ctx.fillRect(x + 7 + (c % 2), top - 8 + c * 2, 1, 2);
  ctx.fillStyle = Math.floor(t / 12) % 2 ? '#ffb347' : '#a86a1a';
  ctx.fillRect(x + 5, y + 4, 6, 5);
  ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x + 7, y + 6, 2, 2);
  ctx.fillStyle = '#ffd9a0'; ctx.fillRect(x + 5, y + 4, 6, 1);
  ctx.restore();
}

/** Faint ring drawn under the Weaver's Shadow Anchor. */
export function drawAnchorRing(ctx: Ctx, cx: number, y: number, t: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#c9a6ff';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(cx, y - 1, 8 + Math.sin(t * 0.1), 2.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#ffb347';
  ctx.beginPath(); ctx.ellipse(cx, y - 1, 5 - Math.sin(t * 0.1), 1.6, 0, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = t * 0.07 + i * Math.PI / 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(cx + Math.cos(a) * 8), Math.round(y - 1 + Math.sin(a) * 2.5), 1, 1);
  }
  ctx.restore();
}

export function drawVeil(ctx: Ctx, x: number, y: number, t: number, life: boolean, top: boolean, bottom: boolean) {
  const main = life ? 'rgba(255,170,60,' : 'rgba(80,200,255,';
  const bright = life ? '#ffd27a' : '#c8fbff';
  ctx.fillStyle = main + '0.22)';
  ctx.fillRect(x + 3, y, 10, 16);
  ctx.fillStyle = main + '0.55)';
  ctx.fillRect(x + 7, y, 2, 16);
  for (let k = 0; k < 3; k++) {
    const yy = (y + ((t * 1.5 + k * 11 + x) % 48)) - 16;
    if (yy >= y && yy < y + 15) { ctx.fillStyle = bright; ctx.fillRect(x + 4, Math.round(yy), 8, 1); }
  }
  ctx.fillStyle = main + '0.8)';
  ctx.fillRect(x + 3, y, 1, 16); ctx.fillRect(x + 12, y, 1, 16);
  if (top) { ctx.fillStyle = '#3a3f5c'; ctx.fillRect(x + 2, y, 12, 2); ctx.fillStyle = bright; ctx.fillRect(x + 7, y + 2, 2, 1); }
  if (bottom) { ctx.fillStyle = '#3a3f5c'; ctx.fillRect(x + 2, y + 14, 12, 2); ctx.fillStyle = bright; ctx.fillRect(x + 7, y + 13, 2, 1); }
}

export function drawSpring(ctx: Ctx, x: number, y: number, squash: number, t: number, pal: DecorPal) {
  const s = Math.round(squash * 4);
  ctx.fillStyle = pal.mushStem; ctx.fillRect(x + 6, y + 6, 4, 10);
  ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x + 5, y + 14, 6, 2);
  ctx.fillStyle = pal.mush;
  ctx.fillRect(x + 1, y + 3 + s, 14, 3); ctx.fillRect(x + 3, y + 1 + s, 10, 2); ctx.fillRect(x + 5, y + s, 6, 1);
  ctx.fillStyle = pal.glow; ctx.fillRect(x + 4, y + 2 + s, 2, 1); ctx.fillRect(x + 9, y + 1 + s, 3, 1);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 6, y + s, 1, 1);
  if (Math.floor(t / 20) % 2 === 0) { ctx.fillStyle = pal.glow; ctx.fillRect(x + 11, y + 4 + s, 1, 1); }
}

export function drawPrism(ctx: Ctx, x: number, y: number, t: number, charge: number) {
  ctx.fillStyle = '#2a2d44'; ctx.fillRect(x + 3, y + 12, 10, 4);
  ctx.fillStyle = '#4a4f6a'; ctx.fillRect(x + 3, y + 12, 10, 1); ctx.fillRect(x + 6, y + 9, 4, 3);
  const a = t * 0.04;
  const cx = x + 8, cy = y + 3 - Math.sin(t * 0.05) * 1;
  const w = Math.abs(Math.cos(a)) * 4 + 1;
  const pal = charge > 0 ? ['#ffffff', '#f4c2ff'] : ['#e9c0ff', '#b05cf0'];
  for (let i = -5; i <= 5; i++) {
    const hw = Math.max(1, Math.round(w * (1 - Math.abs(i) / 6)));
    ctx.fillStyle = i < 0 ? pal[0] : pal[1];
    ctx.fillRect(Math.round(cx - hw / 2), Math.round(cy + i), hw, 1);
  }
  ctx.fillStyle = '#7a2fb8';
  ctx.fillRect(Math.round(cx + w / 2), Math.round(cy - 2), 1, 5);
  if (charge > 0) { ctx.fillStyle = `rgba(255,255,255,${charge})`; ctx.fillRect(x - 2, Math.round(cy), 20, 1); }
}

export function drawKeyItem(ctx: Ctx, cx: number, cy: number, t: number) {
  const bob = Math.round(Math.sin(t * 0.08) * 2);
  const x = Math.round(cx) - 5, y = Math.round(cy) - 3 + bob;
  ctx.fillStyle = '#8a6a1a';
  ctx.fillRect(x, y, 5, 5); ctx.fillRect(x + 5, y + 2, 6, 2); ctx.fillRect(x + 8, y + 4, 1, 2); ctx.fillRect(x + 10, y + 4, 1, 2);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(x + 1, y + 1, 3, 3); ctx.fillRect(x + 5, y + 2, 6, 1); ctx.fillRect(x + 8, y + 4, 1, 1);
  ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x + 2, y + 2, 1, 1);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 1, y + 1, 1, 1);
  if (Math.floor(t / 10) % 4 === 0) { ctx.fillStyle = '#fff6d0'; ctx.fillRect(x + 12, y - 1, 1, 1); }
}

export function drawPortal(ctx: Ctx, cx: number, cy: number, t: number, hue: number) {
  for (let i = 0; i < 14; i++) {
    const a = t * 0.07 + (i / 14) * Math.PI * 2;
    const r = 7 + Math.sin(t * 0.1 + i) * 1.5;
    const px = Math.round(cx + Math.cos(a) * r * 0.8), py = Math.round(cy + Math.sin(a) * r);
    ctx.fillStyle = i % 3 === 0 ? '#ffffff' : `hsl(${hue},90%,${55 + (i % 2) * 20}%)`;
    ctx.fillRect(px, py, 2, 2);
  }
  ctx.fillStyle = `hsla(${hue},90%,60%,0.25)`;
  ctx.fillRect(Math.round(cx) - 4, Math.round(cy) - 7, 8, 14);
  ctx.fillStyle = `hsla(${hue},90%,80%,0.6)`;
  ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 5 + Math.round(Math.sin(t * 0.15) * 3), 2, 4);
}

export function drawSpikeMover(ctx: Ctx, x: number, y: number, w: number, t: number) {
  ctx.fillStyle = '#2a2d44'; ctx.fillRect(x, y, w, 8);
  ctx.fillStyle = '#4a4f6a'; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, 8);
  ctx.fillStyle = '#1b1e2f'; ctx.fillRect(x + w - 1, y, 1, 8); ctx.fillRect(x, y + 7, w, 1);
  for (let sx = 0; sx < w; sx += 4) {
    for (let r = 0; r < 4; r++) {
      const hw = r < 2 ? 1 : 2;
      ctx.fillStyle = '#d2d5e6';
      ctx.fillRect(x + sx + 2 - Math.floor(hw / 2), y - 4 + r, hw, 1);
      ctx.fillRect(x + sx + 2 - Math.floor(hw / 2), y + 11 - r, hw, 1);
    }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + sx + 2, y - 4, 1, 1);
  }
  const g = Math.floor(t / 8) % 2 === 0 ? '#ff6a3a' : '#a63a1a';
  ctx.fillStyle = g; ctx.fillRect(x + Math.floor(w / 2) - 1, y + 3, 2, 2);
}

export function drawLift(ctx: Ctx, x: number, y: number, w: number, t: number, active: boolean, topY: number) {
  ctx.fillStyle = 'rgba(120,130,170,0.35)';
  for (let yy = topY; yy < y; yy += 4) ctx.fillRect(x + Math.floor(w / 2), yy, 1, 2);
  ctx.fillStyle = '#6a7092'; ctx.fillRect(x, y, w, 1);
  ctx.fillStyle = '#3f445f'; ctx.fillRect(x, y + 1, w, 5);
  ctx.fillStyle = '#23263a'; ctx.fillRect(x, y + 6, w, 2);
  ctx.fillStyle = active ? (Math.floor(t / 6) % 2 ? '#c8fbff' : '#6ff3ff') : '#2a4a5a';
  for (let i = 3; i < w - 2; i += 6) ctx.fillRect(x + i, y + 3, 3, 1);
  ctx.fillStyle = active ? '#6ff3ff' : '#3a3f5a'; ctx.fillRect(x + 1, y + 2, 1, 3); ctx.fillRect(x + w - 2, y + 2, 1, 3);
}

export function drawWraith(ctx: Ctx, cx: number, bottom: number, facing: number, t: number, frozen: boolean) {
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(bottom + (frozen ? 0 : Math.sin(t * 0.07) * 2)));
  if (facing < 0) ctx.scale(-1, 1);
  if (frozen && Math.floor(t / 2) % 2 === 0) ctx.translate(1, 0);
  const robe = frozen ? '#4a4f63' : '#1c1838', robeL = frozen ? '#6a6f88' : '#352c66', eye = frozen ? '#9aa0bd' : '#ffd166';
  const s: Shape[] = [];
  const tatter = frozen ? 0 : Math.floor(t / 10) % 2;
  s.push([-6, -14, 12, 10, robe]);
  s.push([-7, -6, 3, 4 + tatter, robe], [-2, -5, 3, 5, robe], [3, -6, 4, 3 + tatter, robe]);
  s.push([-5, -20, 10, 7, robe]);
  s.push([-6, -21, 12, 2, robeL]);
  s.push([5, -13, 1, 8, robeL]);
  s.push([-3, -17, 6, 3, '#07060f']);
  s.push([-2, -16, 2, 1, eye], [1, -16, 2, 1, eye]);
  s.push([-9, -12 + (frozen ? 0 : tatter), 3, 2, robe], [6, -11 - (frozen ? 0 : tatter), 3, 2, robe]);
  fillShapes(ctx, s, frozen ? '#15161f' : '#0a0818');
  if (frozen) {
    ctx.fillStyle = '#2a2d44';
    ctx.fillRect(-1, -12, 1, 4); ctx.fillRect(0, -8, 1, 3); ctx.fillRect(3, -18, 1, 3);
  } else {
    ctx.fillStyle = 'rgba(255,209,102,0.5)';
    ctx.fillRect(-2 + ((Math.floor(t / 3)) % 3), -24, 1, 1);
  }
  ctx.restore();
}

export function drawSnapper(ctx: Ctx, cx: number, bottom: number, t: number, state: string, pal: DecorPal) {
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(bottom));
  const stunned = state === 'stunned';
  const open = state === 'windup' ? 1 : state === 'snap' ? 2 : 0;
  const sway = stunned ? 0 : Math.round(Math.sin(t * 0.06) * 1);
  ctx.fillStyle = pal.vine;
  ctx.fillRect(-6, -2, 12, 2); ctx.fillRect(-8, -1, 3, 1); ctx.fillRect(5, -1, 3, 1);
  const stemH = stunned ? 4 : open === 2 ? 14 : open === 1 ? 10 : 7;
  ctx.fillStyle = pal.plantB; ctx.fillRect(-1 + sway, -stemH - 1, 3, stemH);
  const hy = -stemH - 1;
  const headW = open === 2 ? 14 : 12;
  ctx.fillStyle = stunned ? '#4a5a4a' : pal.plantB;
  ctx.fillRect(-headW / 2 + sway, hy - 6, headW, 6);
  ctx.fillStyle = stunned ? '#5a6a5a' : pal.plantA;
  ctx.fillRect(-headW / 2 + sway, hy - 7, headW, 2);
  if (open > 0 && !stunned) {
    const gap = open === 2 ? 6 : 3;
    ctx.fillStyle = '#12031c'; ctx.fillRect(-headW / 2 + 1 + sway, hy - 3 - gap, headW - 2, gap + 2);
    ctx.fillStyle = '#f3e9ff';
    for (let x = -headW / 2 + 1; x < headW / 2 - 1; x += 3) { ctx.fillRect(x + sway, hy - 3 - gap, 1, 2); ctx.fillRect(x + 1 + sway, hy - 2, 1, 1); }
    ctx.fillStyle = stunned ? '#4a5a4a' : pal.plantB; ctx.fillRect(-headW / 2 + sway, hy - 6 - gap - 2, headW, 3);
    ctx.fillStyle = pal.plantA; ctx.fillRect(-headW / 2 + sway, hy - 7 - gap - 2, headW, 1);
  }
  ctx.fillStyle = stunned ? '#9aa0bd' : (state === 'windup' ? '#ff4d6d' : pal.glow);
  ctx.fillRect(-3 + sway, hy - 5, 1, 1); ctx.fillRect(2 + sway, hy - 5, 1, 1);
  if (stunned) {
    ctx.fillStyle = '#ffd166';
    const a = t * 0.15;
    ctx.fillRect(Math.round(Math.cos(a) * 6), hy - 10 + Math.round(Math.sin(a) * 2), 1, 1);
    ctx.fillRect(Math.round(Math.cos(a + 2.1) * 6), hy - 10 + Math.round(Math.sin(a + 2.1) * 2), 1, 1);
    ctx.fillRect(Math.round(Math.cos(a + 4.2) * 6), hy - 10 + Math.round(Math.sin(a + 4.2) * 2), 1, 1);
  }
  ctx.restore();
}

export function drawDecor(ctx: Ctx, type: number, x: number, y: number, t: number, variant: number, pal: DecorPal) {
  const sway = Math.round(Math.sin(t * 0.05 + x * 0.3) * 1);
  switch (type) {
    case 0: { // fern / cave flora with layered curling fronds
      // central main frond
      const sx = x + 7 + sway;
      ctx.fillStyle = pal.plantB;
      ctx.fillRect(sx, y + 9, 1, 7);
      // side leaves
      ctx.fillRect(sx - 2, y + 12, 2, 1); ctx.fillRect(sx + 1, y + 11, 2, 1);
      ctx.fillRect(sx - 3, y + 9, 2, 1); ctx.fillRect(sx + 1, y + 8, 2, 1);
      ctx.fillStyle = pal.plantA;
      ctx.fillRect(sx - 1, y + 7, 2, 2);
      // side shoots
      ctx.fillStyle = pal.plantB;
      ctx.fillRect(x + 3, y + 13, 2, 3);
      ctx.fillRect(x + 12 + sway, y + 12, 2, 4);
      // glowing spore tip
      ctx.fillStyle = pal.glow;
      ctx.fillRect(sx, y + 6, 1, 1);
      ctx.fillRect(x + 12 + sway, y + 11, 1, 1);
      break;
    }
    case 1: { // bioluminescent mushrooms with layered caps & gills
      // big mushroom
      ctx.fillStyle = pal.mushStem;
      ctx.fillRect(x + 5, y + 10, 2, 6);
      ctx.fillStyle = '#0f1424';
      ctx.fillRect(x + 4, y + 10, 4, 1); // dark underside gills
      ctx.fillStyle = pal.mush;
      ctx.fillRect(x + 2, y + 8, 8, 2);
      ctx.fillRect(x + 3, y + 6, 6, 2);
      ctx.fillRect(x + 5, y + 5, 2, 1);
      // spots
      ctx.fillStyle = pal.glow;
      ctx.fillRect(x + 4, y + 6, 1, 1);
      ctx.fillRect(x + 7, y + 7, 1, 1);
      // small baby mushroom
      ctx.fillStyle = pal.mushStem;
      ctx.fillRect(x + 11, y + 12, 1, 4);
      ctx.fillStyle = pal.mush;
      ctx.fillRect(x + 10, y + 11, 4, 1);
      ctx.fillRect(x + 11, y + 10, 2, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 11, y + 10, 1, 1);
      // drifting spore sparkle
      if (((t + variant * 17) % 60) < 12) {
        ctx.fillStyle = pal.glow;
        ctx.fillRect(x + 5 + Math.round(Math.sin(t * 0.1) * 3), y + 3 - ((t % 60) * 0.2), 1, 1);
      }
      break;
    }
    case 2: { // wild curved grass stalks & clover fronds
      ctx.fillStyle = pal.grass;
      ctx.fillRect(x + 2, y + 12, 1, 4);
      ctx.fillRect(x + 3, y + 11, 1, 2);
      ctx.fillRect(x + 6 + sway, y + 10, 1, 6);
      ctx.fillRect(x + 7 + sway, y + 9, 1, 2);
      ctx.fillRect(x + 10, y + 13, 1, 3);
      ctx.fillRect(x + 13 + sway, y + 11, 1, 5);
      ctx.fillRect(x + 14 + sway, y + 10, 1, 2);
      // seed heads / clover tips
      ctx.fillStyle = pal.plantA;
      ctx.fillRect(x + 3, y + 10, 1, 1);
      ctx.fillRect(x + 7 + sway, y + 8, 1, 1);
      ctx.fillRect(x + 14 + sway, y + 9, 1, 1);
      break;
    }
    case 3: { // floor crystal cluster — multi-faceted gem cluster
      // background shadow facets
      ctx.fillStyle = pal.crystalB;
      ctx.fillRect(x + 2, y + 10, 3, 6);
      ctx.fillRect(x + 6, y + 6, 4, 10);
      ctx.fillRect(x + 11, y + 11, 3, 5);
      // lit front facets
      ctx.fillStyle = pal.crystalA;
      ctx.fillRect(x + 2, y + 10, 2, 5);
      ctx.fillRect(x + 6, y + 6, 2, 9);
      ctx.fillRect(x + 11, y + 11, 2, 4);
      // specular gleam
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 7, y + 6, 1, 3);
      ctx.fillRect(x + 3, y + 10, 1, 2);
      break;
    }
    case 4: { // small, faceted crystal daggers hanging from the roof
      const wobble = Math.sin(t * 0.035 + variant * 1.7);
      ctx.fillStyle = pal.vine;
      ctx.fillRect(x + 4, y, 8, 2);
      ctx.fillRect(x + 6, y + 2, 1, 2);
      ctx.fillRect(x + 10, y + 2, 1, 2);
      drawHangingShard(ctx, x + 5, y + 3, 10 + (variant % 3) * 2, 4, pal, Math.max(0, wobble) * 0.8);
      drawHangingShard(ctx, x + 10, y + 2, 16 + (variant % 2) * 3, 6, pal, Math.max(0, -wobble) * 0.7);
      drawHangingShard(ctx, x + 14, y + 4, 8 + (variant % 3), 3, pal, 0);
      break;
    }
    case 5: { // hanging vines / roots with branching leaves and dew drops
      const l1 = 24 + (variant % 3) * 7;
      const l2 = 36 + (variant % 2) * 9;
      drawHangingLeaves(ctx, x - 1, y, l1, t * 0.055 + variant, pal, false);
      ctx.save();
      ctx.translate(4, 0);
      drawHangingLeaves(ctx, x + 1, y + 2, l2, t * 0.055 + variant + 1.4, pal, true);
      ctx.restore();
      // wet tendril tips catch the crystal light
      ctx.fillStyle = '#ffffff';
      if (Math.floor(t / 16 + variant) % 4 === 0) ctx.fillRect(x + 8 + sway, y + l1 + 2, 1, 2);
      if (Math.floor(t / 19 + variant) % 5 === 0) ctx.fillRect(x + 13 - sway, y + l2 + 1, 1, 2);
      break;
    }
    case 6: { // rubble / ancient carved stone fragment
      ctx.fillStyle = '#222538';
      ctx.fillRect(x + 2, y + 13, 6, 3);
      ctx.fillRect(x + 9, y + 14, 5, 2);
      ctx.fillStyle = '#4a4f6a';
      ctx.fillRect(x + 3, y + 13, 4, 2);
      ctx.fillRect(x + 10, y + 14, 3, 1);
      ctx.fillStyle = '#7a80a2';
      ctx.fillRect(x + 3, y + 13, 1, 1);
      ctx.fillRect(x + 10, y + 14, 1, 1);
      break;
    }
    case 7: { // creeping wall lichen / wall foliage
      ctx.fillStyle = pal.vine;
      ctx.fillRect(x, y + 3, 3, 6);
      ctx.fillRect(x, y + 10, 2, 4);
      ctx.fillStyle = pal.plantB;
      ctx.fillRect(x, y + 4, 2, 4);
      ctx.fillRect(x + 1, y + 7, 2, 1);
      ctx.fillStyle = pal.plantA;
      ctx.fillRect(x, y + 5, 1, 2);
      break;
    }
    case 8: { // ancient carved ruins pillar with capital & base
      // pillar shaft
      ctx.fillStyle = '#1c1f30';
      ctx.fillRect(x + 4, y - 16, 8, 32);
      // fluted vertical grooves
      ctx.fillStyle = '#2d334e';
      ctx.fillRect(x + 5, y - 16, 2, 32);
      ctx.fillRect(x + 9, y - 16, 2, 32);
      // shaft highlight
      ctx.fillStyle = '#444c70';
      ctx.fillRect(x + 5, y - 16, 1, 32);
      // capital & base moldings
      ctx.fillStyle = '#383f60';
      ctx.fillRect(x + 2, y - 18, 12, 3);
      ctx.fillRect(x + 2, y + 13, 12, 3);
      ctx.fillStyle = '#545d88';
      ctx.fillRect(x + 2, y - 18, 12, 1);
      ctx.fillRect(x + 2, y + 13, 12, 1);
      break;
    }
    case 9: { // large quartz chandelier: clustered crystals grow from one ceiling seam
      const pulse = 0.45 + 0.45 * Math.sin(t * 0.045 + variant * 1.3);
      const rootX = x + 8;
      ctx.fillStyle = pal.vine;
      ctx.fillRect(x + 2, y, 12, 2);
      ctx.fillStyle = pal.vine;
      ctx.fillRect(x + 4, y + 2, 8, 2);
      // crystalline branching collar
      ctx.fillStyle = pal.crystalB;
      ctx.fillRect(rootX - 1, y + 3, 3, 3);
      ctx.fillRect(rootX - 4, y + 4, 3, 2);
      ctx.fillRect(rootX + 2, y + 4, 4, 2);
      drawHangingShard(ctx, rootX, y + 5, 28 + (variant % 3) * 5, 9, pal, pulse * 0.8);
      drawHangingShard(ctx, x + 3, y + 6, 16 + (variant % 2) * 5, 6, pal, pulse * 0.45);
      drawHangingShard(ctx, x + 13, y + 6, 20 + (variant % 2) * 4, 7, pal, pulse * 0.6);
      // small side shards make the formation feel naturally grown
      drawHangingShard(ctx, x + 1, y + 9, 9, 3, pal, 0);
      drawHangingShard(ctx, x + 15, y + 8, 12, 4, pal, 0);
      // drifting glitter around the longest tip
      if (Math.floor(t / 9 + variant) % 3 === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(rootX + Math.round(Math.sin(t * 0.03 + variant) * 5), y + 27 + (variant % 5), 1, 1);
      }
      break;
    }
    case 10: { // hanging lantern-flower: broad leaves, braided stem, luminous bell
      const swayX = Math.round(Math.sin(t * 0.045 + variant * 1.2) * 2);
      const stemLen = 19 + (variant % 3) * 6;
      ctx.fillStyle = pal.vine;
      ctx.fillRect(x + 7, y, 2, 4);
      ctx.fillRect(x + 8 + swayX, y + 3, 1, stemLen - 3);
      ctx.fillStyle = pal.plantB;
      for (let n = 8; n < stemLen - 3; n += 8) {
        const side = (Math.floor(n / 8 + variant) % 2) ? 1 : -1;
        const lx = x + 8 + swayX + side * 2;
        ctx.fillRect(lx, y + n, 3, 1);
        ctx.fillRect(lx + side, y + n - 2, 2, 2);
        ctx.fillStyle = pal.plantA;
        ctx.fillRect(lx + side, y + n - 2, 1, 1);
        ctx.fillStyle = pal.plantB;
      }
      // calyx and bell-shaped flower at the tendril tip
      const fy = y + stemLen;
      ctx.fillStyle = pal.plantB;
      ctx.fillRect(x + 4 + swayX, fy - 2, 8, 2);
      ctx.fillStyle = pal.mushStem;
      ctx.fillRect(x + 5 + swayX, fy - 1, 6, 2);
      ctx.fillStyle = pal.mush;
      ctx.fillRect(x + 3 + swayX, fy + 1, 10, 3);
      ctx.fillRect(x + 4 + swayX, fy + 4, 8, 2);
      ctx.fillRect(x + 6 + swayX, fy + 6, 4, 2);
      ctx.fillStyle = pal.glow;
      ctx.fillRect(x + 5 + swayX, fy + 2, 2, 1);
      ctx.fillRect(x + 9 + swayX, fy + 4, 1, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 7 + swayX, fy + 3, 2, 2);
      break;
    }
    case 11: { // dense hanging root curtain with little bioluminescent seed pods
      const swayA = Math.sin(t * 0.04 + variant) * 2;
      const lengths = [34, 52 + (variant % 2) * 8, 42, 27 + (variant % 3) * 6];
      const roots = [2, 6, 10, 14];
      for (let i = 0; i < roots.length; i++) {
        const rx = x + roots[i];
        const len = lengths[i];
        ctx.fillStyle = pal.vine;
        for (let n = 0; n < len; n++) {
          const bend = Math.round(Math.sin(t * 0.035 + variant + n * 0.11 + i) * (1 + n / len));
          const rw = n < 4 ? 2 : n < len - 3 ? 1 : (n % 3 === 0 ? 1 : 0);
          if (rw) ctx.fillRect(rx + bend, y + n, rw, 1);
          // sparse little leaves along alternating roots
          if (n > 7 && n < len - 7 && n % (11 + (variant % 3)) === 0) {
            const side = (i + Math.floor(n / 11)) % 2 ? 1 : -1;
            ctx.fillStyle = pal.plantB;
            ctx.fillRect(rx + bend + side * 2, y + n, 3, 2);
            ctx.fillStyle = pal.plantA;
            ctx.fillRect(rx + bend + side * 3, y + n, 1, 1);
        ctx.fillStyle = pal.vine;
          }
        }
        // tiny glowing seed pod on the tip
        const tipBend = Math.round(Math.sin(t * 0.035 + variant + len * 0.11 + i) * 2);
        if (i % 2 === variant % 2) {
          ctx.fillStyle = pal.plantA;
          ctx.fillRect(rx + tipBend - 1, y + len - 1, 3, 2);
          ctx.fillStyle = pal.glow;
          ctx.fillRect(rx + tipBend, y + len, 1, 1);
        }
      }
      // a few floating pollen motes around the root curtain
      if (Math.floor(t / 8 + variant) % 4 === 0) {
        ctx.fillStyle = pal.glow;
        ctx.fillRect(x + 5 + Math.round(swayA), y + 22 + (variant % 9), 1, 1);
        ctx.fillRect(x + 12 - Math.round(swayA), y + 37 + (variant % 7), 1, 1);
      }
      break;
    }
    case 12: { // broad ground fern, five differently bending fronds
      const wave = Math.sin(t * 0.045 + variant * 0.8);
      ctx.fillStyle = pal.vine;
      ctx.fillRect(x + 6, y + 13, 5, 3);
      for (let k = -2; k <= 2; k++) {
        const length = 11 + (2 - Math.abs(k)) * 3 + ((variant + k + 6) % 3);
        const tipX = x + 8 + k * (3.4 + Math.abs(wave)) + wave * (k === 0 ? 1.5 : 0.7);
        const tipY = y + 15 - length;
        const steps = Math.ceil(length / 2);
        for (let n = 0; n <= steps; n++) {
          const f = n / steps;
          const bx = Math.round(x + 8 + (tipX - x - 8) * f + Math.sin(f * Math.PI) * k * 0.3);
          const by = Math.round(y + 15 + (tipY - y - 15) * f);
          ctx.fillStyle = n < steps * 0.45 ? pal.vine : pal.plantB;
          ctx.fillRect(bx, by, 1, 2);
          if (n > 1 && n < steps - 1 && n % 2 === 0) {
            ctx.fillStyle = pal.plantA;
            ctx.fillRect(bx - 2, by, 2, 1);
            ctx.fillRect(bx + 1, by - 1, 2, 1);
          }
        }
        ctx.fillStyle = pal.glow;
        ctx.fillRect(Math.round(tipX), Math.round(tipY), 1, 1);
      }
      break;
    }
    case 13: { // tall bioluminescent flower with a swaying lantern-bud
      const bend = Math.round(Math.sin(t * 0.044 + variant * 1.4) * 2);
      const flowerX = x + 8 + bend;
      const flowerY = y - 4 - (variant % 3) * 2;
      ctx.fillStyle = pal.vine;
      ctx.fillRect(x + 7, y + 11, 2, 5);
      for (let n = 0; n < 13; n++) {
        const sx = Math.round(x + 8 + bend * (1 - n / 13));
        ctx.fillStyle = n % 3 === 0 ? pal.plantB : pal.vine;
        ctx.fillRect(sx, flowerY + 7 + n, 1, 2);
      }
      ctx.fillStyle = pal.plantB;
      ctx.fillRect(x + 3, y + 9, 4, 2);
      ctx.fillRect(x + 9, y + 7, 4, 2);
      ctx.fillStyle = pal.plantA;
      ctx.fillRect(x + 2, y + 8, 4, 1);
      ctx.fillRect(x + 10, y + 6, 4, 1);
      ctx.fillStyle = pal.mushStem;
      ctx.fillRect(flowerX - 3, flowerY + 2, 7, 5);
      ctx.fillStyle = pal.mush;
      ctx.fillRect(flowerX - 4, flowerY, 9, 3);
      ctx.fillRect(flowerX - 2, flowerY - 2, 5, 2);
      ctx.fillStyle = pal.glow;
      ctx.fillRect(flowerX - 1, flowerY + 2, 3, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(flowerX, flowerY + 2, 1, 2);
      if ((Math.floor(t / 12) + variant) % 4 === 0) ctx.fillRect(flowerX + 5, flowerY - 3, 1, 1);
      break;
    }
    case 14: { // branching cave coral with luminescent spores
      const lean = Math.round(Math.sin(t * 0.035 + variant) * 1.2);
      ctx.fillStyle = pal.vine;
      ctx.fillRect(x + 4, y + 13, 9, 3);
      for (let k = 0; k < 4; k++) {
        const bx = x + 3 + k * 3;
        const bh = 7 + ((variant * 3 + k * 5) % 8);
        ctx.fillStyle = k % 2 ? pal.plantB : pal.vine;
        ctx.fillRect(bx, y + 15 - bh, 2, bh);
        ctx.fillRect(bx + (k % 2 ? 2 : -2), y + 11 - bh / 2, 3, 1);
        ctx.fillStyle = pal.plantA;
        ctx.fillRect(bx + lean, y + 14 - bh, 3, 2);
        ctx.fillStyle = pal.glow;
        ctx.fillRect(bx + 1 + lean, y + 13 - bh, 1, 1);
      }
      break;
    }
    case 15: { // low carpet moss with tiny seedlings and dew (safe near mechanisms)
      ctx.fillStyle = pal.grass;
      ctx.fillRect(x + 1, y + 14, 14, 2);
      ctx.fillStyle = pal.plantB;
      for (let k = 0; k < 5; k++) {
        const sx = x + 2 + k * 3;
        const sh = 2 + (k + variant) % 3;
        ctx.fillRect(sx, y + 15 - sh, 2, sh);
        ctx.fillStyle = pal.plantA;
        ctx.fillRect(sx + (k % 2), y + 14 - sh, 1, 1);
        ctx.fillStyle = pal.plantB;
      }
      if ((Math.floor(t / 22) + variant) % 3 === 0) {
        ctx.fillStyle = pal.glow;
        ctx.fillRect(x + 4 + (variant % 4) * 2, y + 11, 1, 1);
      }
      break;
    }
    case 16: { // multi-height colony of mushrooms on a shared root system
      ctx.fillStyle = pal.vine;
      ctx.fillRect(x + 1, y + 15, 14, 1);
      for (let k = 0; k < 3; k++) {
        const sx = x + 3 + k * 5;
        const h = 6 + ((variant + k * 3) % 8);
        ctx.fillStyle = pal.mushStem;
        ctx.fillRect(sx, y + 15 - h, 2, h);
        ctx.fillStyle = pal.plantB;
        ctx.fillRect(sx - 3, y + 15 - h, 8, 1);
        ctx.fillStyle = pal.mush;
        ctx.fillRect(sx - 3, y + 12 - h, 8, 3);
        ctx.fillRect(sx - 2, y + 11 - h, 6, 1);
        ctx.fillStyle = pal.glow;
        ctx.fillRect(sx - 1, y + 12 - h, 1, 1);
        if (k === 1) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(sx + 2, y + 13 - h, 1, 1);
        }
      }
      break;
    }
    case 17: { // long curtain of hanging ferns, with slow swaying leaflets
      const length = 28 + (variant % 3) * 7;
      for (let stem = 0; stem < 3; stem++) {
        const startX = x + 3 + stem * 5;
        const stemLen = length - stem * 4 + ((variant + stem) % 3) * 3;
        for (let n = 0; n < stemLen; n++) {
          const swayX = Math.round(Math.sin(t * 0.028 + variant + n * 0.055 + stem * 1.2) * (0.6 + n / stemLen * 2));
          const sx = startX + swayX;
          ctx.fillStyle = pal.vine;
          ctx.fillRect(sx, y + n, n < 4 ? 2 : 1, 1);
          if (n > 5 && n < stemLen - 3 && n % 4 === 0) {
            const leafLen = 3 + ((n + stem + variant) % 3);
            ctx.fillStyle = pal.plantB;
            ctx.fillRect(sx - leafLen, y + n, leafLen, 1);
            ctx.fillRect(sx + 1, y + n - 1, leafLen - 1, 1);
            ctx.fillStyle = pal.plantA;
            ctx.fillRect(sx - leafLen + 1, y + n, 1, 1);
            if (n % 12 === 0) {
              ctx.fillStyle = pal.glow;
              ctx.fillRect(sx + leafLen - 1, y + n - 1, 1, 1);
            }
          }
        }
      }
      break;
    }
    case 19: { // świecący kryształ rosnący z sufitu, opleciony pnączem
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.04 + variant);
      const swayX = Math.round(Math.sin(t * 0.03 + variant * 1.1) * 1.5);
      // pnączo mocujące
      ctx.fillStyle = pal.vine;
      ctx.fillRect(x + 6, y, 3, 4);
      ctx.fillRect(x + 4, y + 3, 2, 3);
      ctx.fillRect(x + 10, y + 3, 2, 3);
      // duży środkowy kryształ
      const cy = y + 4;
      ctx.fillStyle = pal.crystalB;
      ctx.fillRect(x + 6 + swayX, cy, 4, 12);
      ctx.fillRect(x + 5 + swayX, cy + 3, 6, 6);
      ctx.fillStyle = pal.crystalA;
      ctx.fillRect(x + 7 + swayX, cy, 2, 11);
      ctx.fillRect(x + 6 + swayX, cy + 3, 2, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 7 + swayX, cy + 2, 1, 3);
      // boczne odrosty
      ctx.fillStyle = pal.crystalB;
      ctx.fillRect(x + 2 + swayX, cy + 2, 3, 8);
      ctx.fillRect(x + 11 + swayX, cy + 1, 3, 9);
      ctx.fillStyle = pal.crystalA;
      ctx.fillRect(x + 3 + swayX, cy + 3, 1, 6);
      ctx.fillRect(x + 12 + swayX, cy + 2, 1, 7);
      // świecące zakończenia
      if (pulse > 0.45) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 3 + swayX, cy + 10, 1, 1);
        ctx.fillRect(x + 12 + swayX, cy + 10, 1, 1);
      }
      break;
    }
    case 20: { // gruby wiszący lianowy splot z liśćmi
      const sway = Math.round(Math.sin(t * 0.035 + variant) * 2);
      for (let k = 0; k < 3; k++) {
        const sx = x + 3 + k * 4 + sway;
        const len = 30 + ((variant + k) % 3) * 8;
        for (let n = 0; n < len; n++) {
          const bend = Math.round(Math.sin(t * 0.05 + n * 0.12 + k) * (1 + n / 18));
          ctx.fillStyle = n % 3 === 0 ? pal.plantB : pal.vine;
          ctx.fillRect(sx + bend, y + n, 2, 1);
          // listki
          if (n % 6 === 0 && n > 6) {
            const side = (n / 6 + k) % 2 ? 1 : -1;
            ctx.fillStyle = pal.plantA;
            ctx.fillRect(sx + bend + side * 2, y + n - 1, 3, 2);
            ctx.fillStyle = pal.plantB;
            ctx.fillRect(sx + bend + side * 4, y + n, 1, 1);
          }
        }
      }
      // świecąca jagoda u końca środkowej liany
      const by = y + 32 + ((variant % 2) * 5);
      ctx.fillStyle = pal.glow;
      ctx.fillRect(x + 7 + sway, by, 3, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 8 + sway, by + 1, 1, 1);
      break;
    }
    case 21: { // wiszący kwiat z rozwiniętymi płatkami
      const sway = Math.round(Math.sin(t * 0.05 + variant * 1.2) * 2);
      const stemLen = 16 + (variant % 3) * 5;
      // łodyga z listkami
      ctx.fillStyle = pal.vine;
      ctx.fillRect(x + 7 + sway, y, 2, stemLen);
      for (let n = 4; n < stemLen; n += 5) {
        const side = (n / 5 + variant) % 2 ? 1 : -1;
        ctx.fillStyle = pal.plantB;
        ctx.fillRect(x + 7 + sway + side * 2, y + n, 3, 1);
      }
      // kielich
      const fy = y + stemLen;
      ctx.fillStyle = pal.plantB;
      ctx.fillRect(x + 5 + sway, fy, 6, 2);
      // rozwinięte płatki
      ctx.fillStyle = pal.mush;
      ctx.fillRect(x + 3 + sway, fy + 2, 10, 3);
      ctx.fillRect(x + 2 + sway, fy + 5, 12, 2);
      ctx.fillRect(x + 4 + sway, fy + 7, 8, 2);
      ctx.fillStyle = pal.mushStem;
      ctx.fillRect(x + 6 + sway, fy + 2, 4, 1);
      // świecący środek
      ctx.fillStyle = pal.glow;
      ctx.fillRect(x + 6 + sway, fy + 4, 4, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 7 + sway, fy + 5, 2, 1);
      break;
    }
    case 18: { // luminous hanging seed-pod framed by little trailing fronds
      const swayX = Math.round(Math.sin(t * 0.047 + variant * 1.5) * 2);
      const len = 22 + (variant % 3) * 5;
      ctx.fillStyle = pal.vine;
      ctx.fillRect(x + 7, y, 2, 5);
      for (let n = 5; n < len; n++) {
        const sx = x + 8 + Math.round(swayX * (n / len));
        ctx.fillStyle = n % 4 === 0 ? pal.plantB : pal.vine;
        ctx.fillRect(sx, y + n, 1, 1);
        if (n % 7 === 0) {
          ctx.fillStyle = pal.plantA;
          ctx.fillRect(sx - 3, y + n, 3, 1);
          ctx.fillRect(sx + 1, y + n - 1, 3, 1);
        }
      }
      const cx = x + 8 + swayX, cy = y + len;
      ctx.fillStyle = pal.plantB;
      ctx.fillRect(cx - 5, cy - 2, 11, 2);
      ctx.fillRect(cx - 4, cy + 4, 9, 2);
      ctx.fillStyle = pal.mush;
      ctx.fillRect(cx - 4, cy, 9, 5);
      ctx.fillStyle = pal.glow;
      ctx.fillRect(cx - 2, cy + 1, 5, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx, cy + 2, 1, 2);
      for (let k = -1; k <= 1; k++) {
        ctx.fillStyle = pal.vine;
        ctx.fillRect(cx + k * 3, cy + 6, 1, 3 + (k + 1));
      }
      break;
    }
  }
}

/** Distinct, hand-drawn pixel-art silhouettes for the four chapter bosses. */
export function drawBoss(
  ctx: Ctx,
  kind: BossKind,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  state: string,
  vulnerable: boolean,
  phase: number,
  facing: 1 | -1,
) {
  ctx.save();
  ctx.translate(Math.round(x + w / 2), Math.round(y + h));
  if (facing < 0) ctx.scale(-1, 1);
  const blink = Math.floor(t / 8) % 2 === 0;
  const hitFlash = state === 'recovery' && Math.floor(t / 3) % 2 === 0;

  if (kind === 'rootMatriarch') {
    // Rooted fungal queen: root skirt, segmented trunk, antlered mushroom crown.
    const root = hitFlash ? '#ffffff' : '#355b3d';
    const bark = hitFlash ? '#ffffff' : '#57372f';
    const leaf = phase > 1 ? '#b2ff78' : '#70d88b';
    for (let k = 0; k < 7; k++) {
      const rx = -15 + k * 5;
      const wave = Math.round(Math.sin(t * 0.11 + k * 0.9) * (state === 'windup' ? 2.2 : 1.3));
      ctx.fillStyle = root;
      ctx.fillRect(rx, -7 + wave, 3, 7);
      ctx.fillRect(rx - 1, -3 + wave, 5, 2);
      if (k % 2 === 0) ctx.fillRect(rx - 2, -1 + wave, 2, 1);
    }
    ctx.fillStyle = bark;
    ctx.fillRect(-10, -22, 20, 16);
    ctx.fillRect(-12, -18, 24, 8);
    ctx.fillStyle = '#8a5a42';
    ctx.fillRect(-7, -20, 3, 12); ctx.fillRect(4, -19, 2, 10);
    ctx.fillStyle = '#2d5335';
    ctx.fillRect(-17, -27, 34, 9);
    ctx.fillRect(-13, -31, 26, 6);
    ctx.fillRect(-8, -34, 16, 4);
    // glowing cap spots
    ctx.fillStyle = leaf;
    ctx.fillRect(-12, -29, 3, 2); ctx.fillRect(-3, -33, 4, 2); ctx.fillRect(8, -29, 3, 2);
    ctx.fillStyle = '#d8ffe8'; ctx.fillRect(-2, -34, 2, 1);
    // face and vulnerable seed-heart
    ctx.fillStyle = '#160e1a'; ctx.fillRect(-7, -24, 14, 7);
    ctx.fillStyle = vulnerable || phase > 1 ? '#ffcf65' : '#ff6f72';
    ctx.fillRect(-5, -22, 3, blink ? 1 : 2); ctx.fillRect(3, -22, 3, blink ? 1 : 2);
    ctx.fillStyle = vulnerable ? '#fff3c4' : '#d94a5f';
    ctx.fillRect(-2, -16, 5, 4); ctx.fillRect(-1, -18, 3, 2);
    if (vulnerable) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -17, 1, 2); }
    // crown tendrils
    ctx.fillStyle = leaf;
    ctx.fillRect(-12, -36, 2, 5); ctx.fillRect(-10, -38, 3, 2);
    ctx.fillRect(10, -37, 2, 6); ctx.fillRect(8, -39, 3, 2);
  } else if (kind === 'forgeBehemoth') {
    // Massive iron furnace beast: riveted plates, piston legs, molten chest core.
    const iron = hitFlash ? '#ffffff' : '#424253';
    const steel = hitFlash ? '#ffffff' : '#747285';
    const dark = '#211a22';
    const ember = phase > 1 ? '#fff08a' : '#ff7438';
    const step = state === 'charge' ? Math.round(Math.sin(t * 0.55) * 2) : Math.round(Math.sin(t * 0.12) * 1);
    ctx.fillStyle = dark;
    ctx.fillRect(-13, -9 - Math.max(0, step), 10, 9 + Math.max(0, step));
    ctx.fillRect(3, -9 - Math.max(0, -step), 10, 9 + Math.max(0, -step));
    ctx.fillStyle = steel;
    ctx.fillRect(-15, -3 - Math.max(0, step), 13, 3); ctx.fillRect(2, -3 - Math.max(0, -step), 13, 3);
    ctx.fillStyle = iron;
    ctx.fillRect(-16, -27, 32, 20);
    ctx.fillRect(-19, -24, 8, 13); ctx.fillRect(11, -24, 8, 13);
    ctx.fillStyle = steel;
    ctx.fillRect(-17, -28, 34, 4); ctx.fillRect(-18, -24, 4, 12); ctx.fillRect(14, -24, 4, 12);
    // rivets and armor seams
    ctx.fillStyle = '#c2bdac';
    ctx.fillRect(-13, -25, 2, 2); ctx.fillRect(11, -25, 2, 2); ctx.fillRect(-13, -11, 2, 2); ctx.fillRect(11, -11, 2, 2);
    ctx.fillStyle = dark;
    ctx.fillRect(-8, -23, 16, 2); ctx.fillRect(-2, -26, 4, 16);
    // furnace mouth / core
    ctx.fillStyle = '#120b12'; ctx.fillRect(-7, -20, 14, 10);
    ctx.fillStyle = ember; ctx.fillRect(-5, -18, 10, 7); ctx.fillRect(-3, -20, 6, 2);
    ctx.fillStyle = '#fff3b0'; ctx.fillRect(-2, -17, 4, 4);
    ctx.fillStyle = '#f8d29c'; ctx.fillRect(-2, -30, 4, 2);
    // horned helmet
    ctx.fillStyle = iron;
    ctx.fillRect(-11, -35, 22, 8); ctx.fillRect(-9, -39, 18, 5);
    ctx.fillRect(-15, -42, 6, 6); ctx.fillRect(9, -42, 6, 6);
    ctx.fillStyle = steel; ctx.fillRect(-15, -42, 4, 2); ctx.fillRect(11, -42, 4, 2);
    ctx.fillStyle = vulnerable ? '#fff3b0' : ember;
    ctx.fillRect(-7, -34, 4, blink ? 1 : 2); ctx.fillRect(3, -34, 4, blink ? 1 : 2);
  } else if (kind === 'glassWarden') {
    // A floating knight assembled from angular amethyst glass shards.
    const gem = hitFlash ? '#ffffff' : '#8b62dd';
    const lite = '#ded3ff';
    const violet = phase > 1 ? '#ff7dc8' : '#b897ff';
    const float = Math.round(Math.sin(t * 0.12) * 2);
    ctx.translate(0, float);
    // levitating shard-skirt
    ctx.fillStyle = '#4d3088';
    ctx.fillRect(-13, -12, 7, 5); ctx.fillRect(-5, -9, 10, 4); ctx.fillRect(7, -13, 7, 6);
    ctx.fillStyle = gem; ctx.fillRect(-11, -12, 3, 3); ctx.fillRect(9, -13, 3, 3);
    // angular chest
    ctx.fillStyle = '#35215f';
    ctx.beginPath(); ctx.moveTo(-12, -31); ctx.lineTo(0, -36); ctx.lineTo(12, -31); ctx.lineTo(10, -13); ctx.lineTo(0, -9); ctx.lineTo(-10, -13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = gem;
    ctx.beginPath(); ctx.moveTo(-9, -29); ctx.lineTo(0, -33); ctx.lineTo(8, -29); ctx.lineTo(6, -17); ctx.lineTo(0, -13); ctx.lineTo(-7, -17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lite; ctx.fillRect(-7, -28, 4, 2); ctx.fillRect(-5, -25, 2, 5);
    // diamond core
    ctx.fillStyle = vulnerable ? '#ffffff' : violet;
    ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(5, -24); ctx.lineTo(0, -17); ctx.lineTo(-5, -24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -26, 2, 5);
    // faceted helmet and visor
    ctx.fillStyle = '#21163b'; ctx.fillRect(-9, -43, 18, 10); ctx.fillRect(-6, -46, 12, 4);
    ctx.fillStyle = gem; ctx.fillRect(-8, -42, 16, 3); ctx.fillRect(-6, -33, 12, 2);
    ctx.fillStyle = '#130d25'; ctx.fillRect(-7, -38, 14, 4);
    ctx.fillStyle = vulnerable ? '#ffffff' : '#ff9bdd';
    ctx.fillRect(-5, -37, 4, blink ? 1 : 2); ctx.fillRect(2, -37, 4, blink ? 1 : 2);
    // orbiting glass shards
    for (let i = 0; i < 4; i++) {
      const a = t * 0.055 + i * Math.PI / 2;
      const sx = Math.cos(a) * 19, sy = -26 + Math.sin(a) * 15;
      ctx.fillStyle = i % 2 ? violet : lite;
      ctx.beginPath(); ctx.moveTo(sx, sy - 4); ctx.lineTo(sx + 3, sy); ctx.lineTo(sx, sy + 4); ctx.lineTo(sx - 3, sy); ctx.closePath(); ctx.fill();
    }
  } else {
    // The Heart Core: a colossal pulsing relic with rib-like rings and a central eye.
    const beat = 1 + Math.sin(t * (phase > 1 ? 0.22 : 0.12)) * (phase > 1 ? 0.1 : 0.055);
    const shell = hitFlash ? '#ffffff' : '#792950';
    const glow = phase > 1 ? '#ff435f' : '#ed4d86';
    ctx.scale(beat, 1 / beat);
    // root cradle
    ctx.fillStyle = '#35162e';
    for (let i = 0; i < 5; i++) {
      const rx = -20 + i * 10;
      ctx.fillRect(rx, -9, 4, 8); ctx.fillRect(rx - 3, -3, 7, 2);
    }
    // ribs arch around the core
    ctx.strokeStyle = '#60324f'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.ellipse(0, -24, 15 + i * 5, 14 + i * 3, 0, Math.PI, Math.PI * 2); ctx.stroke();
    }
    // main heart-shaped silhouette
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.bezierCurveTo(-23, -22, -16, -43, -5, -38);
    ctx.bezierCurveTo(0, -35, 0, -31, 0, -31); ctx.bezierCurveTo(0, -31, 6, -43, 16, -37);
    ctx.bezierCurveTo(29, -29, 16, -15, 0, -10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c43d70';
    ctx.beginPath(); ctx.moveTo(-1, -16); ctx.bezierCurveTo(-16, -25, -9, -37, -3, -32); ctx.lineTo(0, -27); ctx.closePath(); ctx.fill();
    // central iris
    ctx.fillStyle = '#170b1b'; ctx.beginPath(); ctx.ellipse(1, -27, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = vulnerable ? '#fff0d0' : glow;
    ctx.beginPath(); ctx.ellipse(1, -27, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(1, -29, 2, 3);
    // vein lines spreading across the heart
    ctx.strokeStyle = phase > 1 ? '#ffb0a6' : '#ff91c3'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -23); ctx.lineTo(-8, -18); ctx.lineTo(-12, -12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -23); ctx.lineTo(10, -20); ctx.lineTo(13, -13); ctx.stroke();
  }
  // A visible tell pulse appears just before each strike and a pale shimmer during the opening.
  if (state === 'windup' || vulnerable) {
    const alpha = state === 'windup' ? 0.22 + 0.16 * Math.sin(t * 0.45) : 0.16 + 0.12 * Math.sin(t * 0.25);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = state === 'windup' ? '#ffdb72' : '#ffffff';
    ctx.fillRect(-w / 2 - 3, -h + 2, w + 6, h - 2);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export function drawBossProjectile(ctx: Ctx, x: number, y: number, radius: number, action: 'seed' | 'ember' | 'orb' | 'wave', t: number, kind: BossKind) {
  const px = Math.round(x), py = Math.round(y);
  const pulse = 0.65 + 0.35 * Math.sin(t * 0.35);
  if (action === 'wave') {
    const c = kind === 'forgeBehemoth' ? '#ff7838' : '#ff5f9c';
    ctx.fillStyle = `rgba(255,110,70,${0.14 + pulse * 0.12})`; ctx.fillRect(px - 8, py - 5, 16, 10);
    ctx.fillStyle = c; ctx.fillRect(px - 6, py - 3, 12, 6);
    ctx.fillStyle = '#fff0bd'; ctx.fillRect(px - 3, py - 2, 6, 3);
    return;
  }
  const palette = kind === 'rootMatriarch' ? ['#315d39', '#9aff78', '#edffe2']
    : kind === 'forgeBehemoth' ? ['#782d1d', '#ff7136', '#ffe1a0']
      : kind === 'glassWarden' ? ['#59369a', '#c5a2ff', '#ffffff'] : ['#7b2850', '#ff4a77', '#ffe2d0'];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,190,120,${(action === 'seed' ? 0.09 : 0.12) * pulse})`;
  ctx.beginPath(); ctx.arc(px, py, radius * 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  if (action === 'seed') {
    ctx.fillStyle = palette[0]; ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    ctx.fillStyle = palette[1]; ctx.fillRect(px - 1, py - 1, radius + 1, radius + 1);
    ctx.fillStyle = palette[2]; ctx.fillRect(px - 1, py - 1, 2, 2);
    ctx.fillStyle = '#3b2340'; ctx.fillRect(px - radius, py + radius, radius * 2, 1);
  } else if (action === 'ember') {
    ctx.fillStyle = palette[0]; ctx.fillRect(px - radius - 1, py - radius, radius * 2 + 2, radius * 2);
    ctx.fillStyle = palette[1]; ctx.fillRect(px - radius + 1, py - radius + 1, radius * 2 - 2, radius * 2 - 2);
    ctx.fillStyle = palette[2]; ctx.fillRect(px - 1, py - 1, 2, 2);
  } else {
    ctx.fillStyle = palette[0]; ctx.fillRect(px - radius - 1, py - radius - 1, radius * 2 + 2, radius * 2 + 2);
    ctx.fillStyle = palette[1]; ctx.fillRect(px - radius, py - radius + 1, radius * 2, radius * 2 - 2);
    ctx.fillStyle = palette[2]; ctx.fillRect(px - 1, py - radius + 1, 2, 2);
    ctx.fillStyle = palette[1]; ctx.fillRect(px - 1, py + 1, 2, 1);
  }
  ctx.restore();
}
