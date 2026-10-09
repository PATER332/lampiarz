// Procedural rigs for the player, regular enemies and bosses. Everything is drawn
// in local space: origin at the feet, +x = facing direction, -y = up.
import { WEAPONS, type WeaponId } from '../data/content';
import { clamp, easeInOut, easeOut, lerp } from '../core/util';
import type { Boss } from '../entities/bosses';
import { Dzwon, Pasterz } from '../entities/bosses';
import type { Enemy } from '../entities/enemies';
import { P, type Player } from '../entities/player';
import { circle, glow, limb, limb2, mix, poly, rgba, star, type Ctx } from './paint';

// ------------------------------------------------------------------ shared helpers
interface Phase {
  windup: number;
  active: number;
  recover: number;
}

/** Weapon angle through the windup → strike → recovery of an attack. */
function swingAngle(t: number, d: Phase, rest: number, raise: number, strike: number) {
  if (t < d.windup) return { a: lerp(rest, raise, easeOut(t / d.windup)), active: false, k: t / d.windup };
  if (t < d.windup + d.active) return { a: lerp(raise, strike, easeOut((t - d.windup) / d.active)), active: true, k: (t - d.windup) / d.active };
  const k = clamp((t - d.windup - d.active) / Math.max(0.01, d.recover), 0, 1);
  return { a: lerp(strike, rest, easeInOut(k)), active: false, k };
}

/** Pose for state-machine attacks (enemies/bosses use separate states per phase). */
function statePose(state: string, t: number, d: Phase | null, rest: number, raise: number, strike: number, windMul = 1) {
  if (!d) return { a: rest, active: false, wk: 0 };
  if (state === 'windup') {
    const k = clamp(t / (d.windup * windMul), 0, 1);
    return { a: lerp(rest, raise, easeOut(k)), active: false, wk: k };
  }
  if (state === 'active') return { a: lerp(raise, strike, easeOut(clamp(t / Math.max(0.05, d.active), 0, 1))), active: true, wk: 1 };
  if (state === 'recover') return { a: lerp(strike, rest, easeInOut(clamp(t / Math.max(0.05, d.recover), 0, 1))), active: false, wk: 0 };
  return { a: rest, active: false, wk: 0 };
}

/** Crescent swing trail between two angles. */
function trail(g: Ctx, ox: number, oy: number, r0: number, r1: number, a0: number, a1: number, color: string, alpha: number) {
  if (Math.abs(a1 - a0) < 0.05 || alpha <= 0) return;
  const ccw = a1 < a0;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const s = a0 + ((a1 - a0) * i) / steps;
    const e = a0 + ((a1 - a0) * (i + 1)) / steps;
    g.fillStyle = rgba(color, alpha * ((i + 1) / steps) * 0.55);
    g.beginPath();
    g.arc(ox, oy, r1, s, e, ccw);
    g.arc(ox, oy, r0 + (r1 - r0) * (1 - (i + 1) / steps) * 0.6, e, s, !ccw);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** Telegraph glint: white = parry/block, red = roll/jump. */
export function telegraphGlint(g: Ctx, x: number, y: number, kind: 'white' | 'red', k: number, time: number, size = 1) {
  const col = kind === 'red' ? '#ff3a2a' : '#fff6dc';
  const r = (10 + 16 * easeOut(k)) * size;
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, x, y, r * 2.6, col, 0.55 + 0.3 * k);
  star(g, x, y, r, col, 0.95, time * 2);
  star(g, x, y, r * 0.55, '#ffffff', 0.9, -time * 3 + 0.4);
  g.restore();
}

/** Golden swirl above a reeling enemy: riposte now! */
function vulnerableMark(g: Ctx, x: number, y: number, time: number) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const a = time * 5 + (i / 3) * Math.PI * 2;
    star(g, x + Math.cos(a) * 12, y + Math.sin(a) * 4, 4.5, '#ffd27a', 0.9, a);
  }
  g.restore();
}

function healthPip(g: Ctx, x: number, y: number, w: number, frac: number, elite: boolean) {
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
  g.fillStyle = elite ? '#b48cff' : '#b3261e';
  g.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), 3);
}

// ------------------------------------------------------------------ weapons
export function drawWeapon(g: Ctx, id: WeaponId, x: number, y: number, a: number, flash: number, glowK = 0, plus = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const iron = mix('#6f6b66', '#ffffff', flash);
  const hi = mix('#c9c2b4', '#ffffff', flash);
  const bronze = mix(plus > 0 ? '#c4914c' : '#9a7340', '#fff', flash);
  if (id === 'klucz') {
    limb(g, -3, 0, 34, 0, 4, iron);
    g.strokeStyle = iron;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(-7, 0, 4.5, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = iron;
    g.fillRect(27, 1, 3, 8);
    g.fillRect(32, 1, 3, 10);
    g.fillRect(27, 7, 8, 3);
    g.fillStyle = hi;
    g.fillRect(0, -1.5, 32, 1);
  } else if (id === 'sierpy') {
    limb(g, -2, 0, 9, 0, 3.5, '#4a3222');
    g.fillStyle = iron;
    g.beginPath();
    g.moveTo(8, -1);
    g.quadraticCurveTo(24, -16, 32, 4);
    g.quadraticCurveTo(24, -8, 10, 3);
    g.closePath();
    g.fill();
    g.strokeStyle = hi;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(10, -2);
    g.quadraticCurveTo(24, -15, 31, 3);
    g.stroke();
  } else {
    limb(g, -6, 0, 38, 0, 4, '#4a3222');
    g.fillStyle = bronze;
    g.fillRect(32, -12, 14, 24);
    g.fillStyle = mix(bronze, '#000', 0.35);
    g.fillRect(32, -12, 3, 24);
    g.fillStyle = hi;
    g.globalAlpha = 0.5;
    g.fillRect(43, -11, 2, 22);
    g.globalAlpha = 1;
  }
  if (glowK > 0) {
    g.globalCompositeOperation = 'lighter';
    glow(g, id === 'mlot' ? 40 : 30, 0, 26 + glowK * 20, '#ffd38a', glowK * 0.8);
  }
  g.restore();
}

const WEAPON_LEN: Record<WeaponId, number> = { klucz: 36, sierpy: 30, mlot: 46 };

// ------------------------------------------------------------------ player
export function drawPlayer(g: Ctx, p: Player, time: number) {
  const b = p.body;
  const cx = p.cx;
  const fy = b.y + b.h;
  const f = p.face;
  const flash = Math.max(p.hurtFlash * p.hurtFlash * 0.55, p.state === 'parry' ? 0.5 * (1 - p.stateT / 0.28) : 0);
  const cloak = mix('#1f1b25', '#fff', flash);
  const cloakHi = mix('#4d4560', '#fff', flash);
  const skin = mix('#c8b49c', '#fff', flash);
  const dead = p.state === 'dead';
  const fade = dead ? clamp(1 - (p.stateT - 1.4) / 1.2, 0, 1) : 1;
  if (fade <= 0) return;

  // ---- perfect-dodge afterglow
  if (p.perfectT > 0) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, cx, b.y + 20, 50, '#b9a8ff', p.perfectT * 1.2);
    g.restore();
  }

  // ---- cape (world-space verlet chain), drawn behind the body
  g.save();
  g.globalAlpha = fade;
  if (!dead || p.stateT < 0.4) {
    const pts = p.cape;
    g.fillStyle = mix('#14111a', '#fff', flash * 0.6);
    g.beginPath();
    g.moveTo(pts[0].x + f * 4, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const w = 2 + i * 1.3;
      g.lineTo(pts[i].x + f * w * 0.5, pts[i].y);
    }
    for (let i = pts.length - 1; i >= 1; i--) {
      const w = 2 + i * 1.3;
      g.lineTo(pts[i].x - f * w * 0.9 + Math.sin(time * 9 + i) * 0.6, pts[i].y + 1);
    }
    g.lineTo(pts[0].x - f * 4, pts[0].y);
    g.closePath();
    g.fill();
  }

  g.translate(cx, fy);
  g.scale(f, 1);

  // ---- roll: a tumbling ball of cloth
  if (p.state === 'roll') {
    const k = p.stateT / P.rollTime;
    g.save();
    g.translate(0, -14);
    g.rotate(k * Math.PI * 2);
    circle(g, 0, 0, 14, cloak);
    g.strokeStyle = cloakHi;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, 13, -0.4, 1.3);
    g.stroke();
    circle(g, 7, -6, 6, '#0b0a0e');
    g.restore();
    if (p.iframes) {
      g.globalCompositeOperation = 'lighter';
      glow(g, 0, -14, 30, '#9f8cff', 0.25);
    }
    g.restore();
    return;
  }

  let lean = 0;
  let crouch = 0;
  if (dead) {
    const k = easeOut(clamp(p.stateT * 2.5, 0, 1));
    g.rotate(-k * Math.PI * 0.5);
    g.translate(0, k * 4);
  } else if (p.state === 'hurt') lean = -0.25 * (1 - p.stateT / 0.32);
  else if (p.state === 'guardBroken') {
    crouch = 10;
    lean = 0.35;
  } else if (p.state === 'run') lean = 0.12;
  else if (p.state === 'block' || p.state === 'charge') crouch = 3;
  else if (p.state === 'heal') crouch = 2;
  if (p.landT > 0) crouch += p.landT * 25;

  // ---- legs
  const ph = p.runPhase;
  let f1x = -4;
  let f1y = 0;
  let f2x = 5;
  let f2y = 0;
  if (p.state === 'run') {
    f1x = Math.sin(ph) * 10;
    f1y = -Math.max(0, Math.cos(ph)) * 6;
    f2x = Math.sin(ph + Math.PI) * 10;
    f2y = -Math.max(0, Math.cos(ph + Math.PI)) * 6;
  } else if (p.state === 'air') {
    f1x = -5;
    f1y = -6;
    f2x = 6;
    f2y = -10;
  } else if (p.state === 'block' || p.state === 'charge' || p.state === 'attack' || p.state === 'heavy') {
    f1x = -8;
    f2x = 9;
  }
  const hipY = -19 + crouch;
  limb2(g, -1, hipY, f1x, f1y, -3, 5, mix('#16131b', '#fff', flash));
  limb2(g, 1, hipY, f2x, f2y, -3, 5, mix('#1c1822', '#fff', flash));
  // boots
  g.fillStyle = '#0d0b10';
  g.fillRect(f1x - 3, f1y - 3, 7, 3);
  g.fillRect(f2x - 3, f2y - 3, 7, 3);

  g.save();
  g.translate(0, hipY);
  g.rotate(lean);
  // ---- torso (long coat)
  poly(g, [-7, 2, 8, 2, 7, -14, 5, -13, -5, -13, -6, -14], cloak);
  poly(g, [-6, 4, 9, 4, 10, 10, -8, 10], mix('#17141c', '#fff', flash));
  g.fillStyle = cloakHi;
  g.fillRect(5, -12, 1.5, 14);
  // belt and the little brass bell
  g.fillStyle = '#3b2a1c';
  g.fillRect(-7, -1, 15, 3);
  const bellGlow = p.pips / Math.max(1, p.stats.pips);
  g.fillStyle = mix('#9a7340', '#ffe2a0', bellGlow);
  g.beginPath();
  g.moveTo(-5, 2);
  g.quadraticCurveTo(-5, -3, -2, -3);
  g.quadraticCurveTo(1, -3, 1, 2);
  g.closePath();
  g.fill();
  if (bellGlow > 0) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, -2, 0, 12 + bellGlow * 10, '#ffcf7a', 0.35 * bellGlow + p.skillFlash * 0.6);
    g.restore();
  }

  // ---- head (hood)
  const headY = -19;
  const nod = p.state === 'heal' ? 0.25 : p.state === 'idle' ? Math.sin(time * 2) * 0.03 : 0;
  g.save();
  g.translate(1, headY);
  g.rotate(nod);
  poly(g, [-8, 2, -11, -4, -6, -12, 3, -13, 8, -7, 8, 1, 3, 4], cloak);
  g.fillStyle = '#060508';
  g.beginPath();
  g.ellipse(3.5, -4, 4, 5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(5.5, -3, 2, 3.4, 0, -1.2, 1.6);
  g.fill();
  circle(g, 5.6, -5, 0.9, '#ffcf7a');
  g.strokeStyle = cloakHi;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-6, -12);
  g.lineTo(3, -13);
  g.lineTo(8, -7);
  g.stroke();
  g.restore();

  // ---- weapon arm
  const sx = 2;
  const sy = -12;
  const wid = p.save.weapon;
  const wdef = WEAPONS[wid];
  let a = 0.62 + Math.sin(time * 2) * 0.04;
  let trailInfo: { a0: number; a1: number; alpha: number } | null = null;
  let glowK = 0;
  let offA = 1.5; // off-hand
  if (p.state === 'run') a = 0.45 + Math.sin(ph) * 0.15;
  else if (p.state === 'air') a = -0.4;
  else if (p.state === 'block' || p.state === 'parry') {
    a = -1.25;
    offA = -0.9;
  } else if (p.state === 'charge') {
    const k = clamp(p.stateT / wdef.heavy.chargeMax, 0, 1);
    a = -2.5 + Math.sin(time * 60) * 0.03 * k;
    glowK = k;
  } else if (p.state === 'heal') {
    offA = -2.2;
  } else if (p.state === 'skill') {
    a = -0.6;
    offA = -2.6;
  } else if (p.state === 'hurt' || p.state === 'guardBroken' || p.state === 'bounced') a = 1.9;
  else if ((p.state === 'attack' || p.state === 'heavy') && p.swing) {
    const s = p.swing;
    const d = s.def;
    const finisher = !s.heavy && s.index === wdef.combo.length - 1;
    let rest = 0.62;
    let raise = -2.1;
    let strike = 1.05;
    if (s.heavy) {
      raise = -2.6;
      strike = 1.35;
    } else if (finisher) {
      raise = -2.7;
      strike = 1.3;
    } else if (s.index % 2 === 1) {
      raise = 1.8;
      strike = -1.3;
      rest = 0.6;
    }
    if (s.heavy && wdef.heavy.spin) {
      const t = p.stateT;
      if (t < d.windup) a = lerp(1.1, -0.5, t / d.windup);
      else if (t < d.windup + d.active) {
        const k = (t - d.windup) / d.active;
        a = -0.5 + k * Math.PI * 2 * wdef.heavy.spin;
        trailInfo = { a0: a - 1.6, a1: a, alpha: 0.9 };
      } else a = 1.1;
    } else {
      const sw = swingAngle(p.stateT, d, rest, raise, strike);
      a = sw.a;
      if (sw.active) trailInfo = { a0: raise + (strike - raise) * 0.1, a1: a, alpha: s.heavy ? 1 : 0.8 };
      else if (p.stateT >= d.windup + d.active && p.stateT < d.windup + d.active + 0.07) trailInfo = { a0: raise + (strike - raise) * 0.4, a1: strike, alpha: 0.5 * (1 - (p.stateT - d.windup - d.active) / 0.07) };
      if (s.heavy) glowK = s.charge * (p.stateT < d.windup + d.active ? 1 : 0.3);
    }
  }
  const armLen = 11;
  const hx = sx + Math.cos(a) * armLen;
  const hy = sy + Math.sin(a) * armLen;
  // off-hand (second sickle for the twin blades)
  const ox = sx - 4 + Math.cos(offA) * 10;
  const oy = sy + Math.sin(offA) * 10;
  limb(g, sx - 4, sy, ox, oy, 4, mix('#15121a', '#fff', flash));
  if (wid === 'sierpy') drawWeapon(g, 'sierpy', ox, oy, offA - 0.4, flash);
  if (p.state === 'heal') {
    // a wax tear held to the lips
    const k = clamp(p.stateT / p.stats.flaskTime, 0, 1);
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, ox + 2, oy - 2, 26, '#ffcf7a', 0.8 * (1 - k * 0.5));
    g.restore();
    g.fillStyle = '#f0e2c0';
    g.fillRect(ox, oy - 6, 3, 6);
  }
  if (trailInfo) {
    const len = armLen + WEAPON_LEN[wid];
    trail(g, sx, sy, len * 0.45, len + 6, trailInfo.a0, trailInfo.a1, p.swing?.heavy ? '#ffd9a0' : '#e8e2ff', trailInfo.alpha);
  }
  limb(g, sx, sy, hx, hy, 4.5, mix('#221d29', '#fff', flash));
  drawWeapon(g, wid, hx, hy, a, flash, glowK, p.save.weapons[wid] ?? 0);
  g.restore(); // torso transform

  if (p.state === 'guardBroken') vulnerableMark(g, 0, -50, time);
  g.restore();

  // ---- skill shock ring (world space)
  if (p.skillFlash > 0) {
    const k = 1 - p.skillFlash;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = rgba('#ffd38a', p.skillFlash * 0.9);
    g.lineWidth = 10 * p.skillFlash + 2;
    g.beginPath();
    g.arc(cx, p.cy, 20 + k * 150, 0, Math.PI * 2);
    g.stroke();
    glow(g, cx, p.cy, 120, '#ffcf7a', p.skillFlash * 0.5);
    g.restore();
  }
  // riposte ready: the weapon hand glows
  if (p.riposteT > 0) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, cx + f * 14, p.cy - 6, 30, '#ffd27a', 0.5 * (p.riposteT / P.riposte));
    g.restore();
  }
}

// ------------------------------------------------------------------ enemies
export function drawEnemy(g: Ctx, e: Enemy, time: number, windupMul: number) {
  const b = e.body;
  const fade = e.dead ? clamp(1 - e.deathT / 1.1, 0, 1) : e.state === 'spawn' ? clamp(e.stateT / 0.6, 0, 1) : 1;
  if (fade <= 0) return;
  const flash = e.hitFlash * 0.85;
  g.save();
  g.globalAlpha = fade;
  // elite / buffed aura
  if ((e.elite || e.buffT > 0) && !e.dead) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, e.cx, e.cy, 46, e.buffT > 0 ? '#b0a0ff' : '#9c6cff', 0.22 + Math.sin(time * 4) * 0.05);
    g.restore();
  }
  g.translate(e.cx, b.y + b.h);
  g.scale(e.face, 1);
  if (e.dead) {
    g.rotate(-clamp(e.deathT * 3, 0, 1) * (e.def.flying ? 0.6 : 1.3));
  }
  const d = e.attack;
  const eye = e.elite ? '#c8a6ff' : '#ff8a3a';
  let tip: [number, number] | null = null;
  switch (e.kind) {
    case 'wyrwany':
      tip = drawWyrwany(g, e, d, flash, eye, time, windupMul);
      break;
    case 'ogar':
      tip = drawOgar(g, e, flash, eye, time, windupMul);
      break;
    case 'straznik':
      tip = drawStraznik(g, e, d, flash, time, windupMul);
      break;
    case 'cmiara':
      tip = drawCmiara(g, e, flash, time, windupMul);
      break;
    case 'spiewak':
      tip = drawSpiewak(g, e, flash, time, windupMul);
      break;
    case 'cma':
      drawMoth(g, 0, -b.h / 2, 1, time + e.anim, flash, '#cfe8ff');
      break;
  }
  // telegraph glint
  const tg = e.telegraph;
  if (tg && tip && d) {
    const k = clamp(e.stateT / (d.windup * windupMul), 0, 1);
    telegraphGlint(g, tip[0], tip[1], tg, k, time, 0.8);
  }
  g.restore();
  if (!e.dead && e.kind !== 'cma') {
    if (e.vulnerable) vulnerableMark(g, e.cx, b.y - 10, time);
    if (e.hp < e.maxHp) healthPip(g, e.cx, b.y - 8, Math.max(26, b.w + 6), e.hp / e.maxHp, e.elite);
  }
}

function drawWyrwany(g: Ctx, e: Enemy, d: Enemy['attack'], flash: number, eye: string, time: number, wm: number): [number, number] {
  const rag = mix('#2b2620', '#fff', flash);
  const skin = mix('#6d6359', '#fff', flash);
  const walk = e.state === 'chase' || e.state === 'idle' ? Math.sin(e.anim * 7) * Math.min(1, Math.abs(e.body.vx) / 30) : 0;
  limb2(g, -3, -20, -4 + walk * 6, 0, 3, 5, mix('#1c1915', '#fff', flash));
  limb2(g, 3, -20, 4 - walk * 6, 0, 3, 5, mix('#221e19', '#fff', flash));
  g.save();
  g.translate(0, -20);
  const stag = e.state === 'stagger' || e.state === 'parried';
  g.rotate(0.35 + (stag ? -0.4 : 0) + (e.state === 'flinch' ? -0.2 : 0));
  // ragged torso with torn hem
  poly(g, [-8, 4, -9, -18, 6, -22, 9, -2, 7, 6, 3, 2, 0, 7, -4, 2], rag);
  // drooping head
  circle(g, 6, -24, 6, skin);
  circle(g, 9, -25, 1.3, eye);
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, 9, -25, 7, eye, 0.6);
  g.restore();
  // weapon arm (rusty cleaver)
  const pose = statePose(e.state, e.stateT, d, 1.3, d?.id === 'dwa2' ? 2.2 : -1.9, d?.id === 'dwa2' ? -0.6 : 1.0, wm);
  const a = pose.a + (e.state === 'idle' ? Math.sin(time * 2 + e.anim) * 0.1 : 0);
  const hx = 4 + Math.cos(a) * 14;
  const hy = -16 + Math.sin(a) * 14;
  if (pose.active) trail(g, 4, -16, 10, 34, a - 1.2, a, '#d8d0c0', 0.5);
  limb(g, 4, -16, hx, hy, 4, skin);
  g.save();
  g.translate(hx, hy);
  g.rotate(a);
  g.fillStyle = mix('#4a3a30', '#fff', flash);
  g.fillRect(0, -1.5, 8, 3);
  g.fillStyle = mix('#5a554f', '#fff', flash);
  g.fillRect(7, -4, 13, 9);
  g.restore();
  g.restore();
  // tip in local (unrotated) coords, approximately
  return [6 + Math.cos(a + 0.35) * 26, -20 - 16 + Math.sin(a + 0.35) * 26];
}

function drawOgar(g: Ctx, e: Enemy, flash: number, eye: string, time: number, wm: number): [number, number] {
  const body = mix('#2a211d', '#fff', flash);
  const dark = mix('#18120f', '#fff', flash);
  const run = Math.abs(e.body.vx) > 30;
  const ph = e.anim * (run ? 16 : 3);
  let crouch = 0;
  let stretch = 0;
  if (e.state === 'windup') crouch = 6 * clamp(e.stateT / ((e.attack?.windup ?? 0.5) * wm), 0, 1);
  if (e.state === 'active' && e.attack?.leap) stretch = 1;
  const by = -16 + crouch;
  // legs
  for (let i = 0; i < 4; i++) {
    const x = i < 2 ? 10 + i * 3 : -10 + (i - 2) * 3;
    const sw = stretch ? (i < 2 ? 8 : -8) : run ? Math.sin(ph + i * 1.7) * 6 : 0;
    limb2(g, x, by + 4, x + sw, 0, i < 2 ? 2 : -2, 3.5, i % 2 ? dark : body);
  }
  // body with spiky mane
  g.fillStyle = body;
  g.beginPath();
  g.ellipse(0, by, 17 + stretch * 3, 8, stretch * -0.1, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 6; i++) poly(g, [-10 + i * 4, by - 6, -8 + i * 4, by - 13 - (i % 2) * 3, -6 + i * 4, by - 6], dark);
  // head and jaw
  const open = e.state === 'active' || (e.state === 'windup' && Math.sin(time * 20) > 0) ? 4 : 1;
  poly(g, [12, by - 6, 26, by - 3, 27, by + 1, 14, by + 4], body);
  poly(g, [14, by + 3, 26, by + 2 + open, 16, by + 6 + open], dark);
  poly(g, [13, by - 6, 15, by - 12, 18, by - 5], dark);
  circle(g, 21, by - 2.5, 1.4, eye);
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, 21, by - 2.5, 8, eye, 0.6);
  g.restore();
  // tail
  limb2(g, -16, by - 2, -26, by - 8 + Math.sin(e.anim * 8) * 3, 3, 2.5, dark);
  return [24, by - 4];
}

function drawStraznik(g: Ctx, e: Enemy, d: Enemy['attack'], flash: number, time: number, wm: number): [number, number] {
  const plate = mix('#3a3940', '#fff', flash);
  const dark = mix('#22222a', '#fff', flash);
  const bronze = mix('#8a6236', '#fff', flash);
  const walk = Math.sin(e.anim * 5) * Math.min(1, Math.abs(e.body.vx) / 25);
  limb2(g, -5, -26, -6 + walk * 5, 0, 3, 7, dark);
  limb2(g, 5, -26, 6 - walk * 5, 0, 3, 7, dark);
  g.save();
  g.translate(0, -26);
  if (e.state === 'stagger' || e.state === 'parried') g.rotate(-0.25);
  // torso plate
  poly(g, [-11, 2, -12, -24, 12, -26, 13, 2], plate);
  g.fillStyle = bronze;
  g.fillRect(-12, -3, 25, 3);
  // helm
  poly(g, [-8, -24, -8, -38, 0, -42, 9, -38, 9, -24], plate);
  g.fillStyle = '#0a0a0c';
  g.fillRect(1, -33, 8, 2.5);
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, 6, -32, 9, '#ffb766', 0.5);
  g.restore();
  // clapper-mace arm
  const raise = d?.id === 'dzwon' ? -2.6 : -1.6;
  const pose = statePose(e.state, e.stateT, d?.id === 'tarcza' || d?.id === 'szarza' ? null : d, 1.4, raise, 1.1, wm);
  const a = pose.a;
  const hx = -2 + Math.cos(a) * 14;
  const hy = -18 + Math.sin(a) * 14;
  if (pose.active) trail(g, -2, -18, 12, 44, a - 1.4, a, '#ffd9a0', 0.6);
  limb(g, -2, -18, hx, hy, 6, dark);
  g.save();
  g.translate(hx, hy);
  g.rotate(a);
  g.fillStyle = mix('#4a3222', '#fff', flash);
  g.fillRect(0, -2, 20, 4);
  g.fillStyle = bronze;
  g.beginPath();
  g.ellipse(24, 0, 7, 8, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // the shield: a shard of a bell, always in front
  const bash = d?.id === 'tarcza' && e.state === 'active' ? 8 : d?.id === 'tarcza' && e.state === 'windup' ? -4 : 0;
  const sx = 14 + bash;
  g.fillStyle = bronze;
  g.beginPath();
  g.moveTo(sx - 4, -34);
  g.quadraticCurveTo(sx + 10, -16, sx + 3, 6);
  g.lineTo(sx - 4, 8);
  g.quadraticCurveTo(sx + 2, -14, sx - 10, -32);
  g.closePath();
  g.fill();
  g.strokeStyle = mix('#d9a25a', '#fff', flash);
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = 'rgba(70,120,90,0.35)';
  g.fillRect(sx - 3, -14, 4, 10);
  g.restore();
  void time;
  return d?.id === 'tarcza' || d?.id === 'szarza' ? [sx + 2, -40] : [-2 + Math.cos(a) * 40, -44 + Math.sin(a) * 40];
}

function drawCmiara(g: Ctx, e: Enemy, flash: number, time: number, wm: number): [number, number] {
  const robe = mix('#2c2a33', '#fff', flash);
  const wing = mix('#3a3640', '#fff', flash);
  const dive = e.state === 'active' && e.attack?.dive;
  const flap = dive ? 0.2 : Math.sin(e.anim * 10) * 0.6;
  const cy = -18;
  // wings of ash
  for (const s of [-1, 1]) {
    g.save();
    g.translate(-2, cy - 6);
    g.rotate((s > 0 ? -0.5 : -2.6) + flap * s);
    g.fillStyle = s > 0 ? wing : mix(wing, '#000', 0.3);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(14, -18, 32, -6);
    g.lineTo(26, 0);
    g.lineTo(30, 6);
    g.lineTo(20, 5);
    g.lineTo(22, 12);
    g.quadraticCurveTo(10, 8, 0, 0);
    g.fill();
    g.restore();
  }
  // robe tapering into smoke
  poly(g, [-7, cy - 10, 7, cy - 10, 9, cy + 8, 2, cy + 20 + Math.sin(time * 6) * 2, -3, cy + 12, -8, cy + 16], robe);
  circle(g, 2, cy - 14, 6, mix('#d6cfc4', '#fff', flash));
  g.fillStyle = '#16131a';
  g.beginPath();
  g.arc(2, cy - 15, 6.5, Math.PI, 0);
  g.fill();
  circle(g, 5, cy - 13, 1.3, '#cfe8ff');
  // casting hand
  const cast = e.state === 'windup' && e.attack?.projectile;
  const k = cast ? clamp(e.stateT / ((e.attack?.windup ?? 0.8) * wm), 0, 1) : 0;
  limb(g, 3, cy - 6, 14, cy - 8 - k * 6, 3, robe);
  if (cast) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, 15, cy - 9 - k * 6, 10 + k * 18, '#cfc6b0', 0.7 * k);
    g.restore();
  }
  return [15, cy - 10];
}

function drawSpiewak(g: Ctx, e: Enemy, flash: number, time: number, wm: number): [number, number] {
  const robe = mix('#2a2430', '#fff', flash);
  const singing = e.state === 'windup' && e.attack?.lament;
  const k = singing ? clamp(e.stateT / ((e.attack?.windup ?? 1.7) * wm), 0, 1) : 0;
  const sway = Math.sin(e.anim * 2) * 0.05;
  g.save();
  g.rotate(sway);
  poly(g, [-8, 0, -6, -30, 0, -40, 6, -30, 9, 0], robe);
  // hood and the open mouth
  poly(g, [-5, -34, 0, -48, 7, -36, 5, -30, -4, -30], mix('#1a1620', '#fff', flash));
  g.fillStyle = mix('#cbbfae', '#fff', flash);
  g.beginPath();
  g.ellipse(3.5, -36, 2.6, 4, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0a0808';
  g.beginPath();
  g.ellipse(4, -34.5, 1.2, 1.4 + k * 1.5, 0, 0, Math.PI * 2);
  g.fill();
  // candle hands raised while singing
  const ha = singing ? -1.9 + Math.sin(time * 6) * 0.1 : 0.9;
  const hx = 2 + Math.cos(ha) * 12;
  const hy = -26 + Math.sin(ha) * 12;
  limb(g, 2, -26, hx, hy, 3, robe);
  g.fillStyle = '#e6d8b8';
  g.fillRect(hx - 1.5, hy - 7, 3, 7);
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, hx, hy - 9, 16 + k * 20, '#ffcf7a', 0.7);
  if (singing) {
    g.strokeStyle = rgba('#c8b8ff', 0.5 * k);
    g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const r = ((time * 40 + i * 20) % 60) + 6;
      g.beginPath();
      g.arc(4, -34, r, -0.8, 0.8);
      g.stroke();
    }
  }
  g.restore();
  g.restore();
  return [hx, hy - 10];
}

export function drawMoth(g: Ctx, x: number, y: number, s: number, t: number, flash: number, color: string) {
  const flap = Math.abs(Math.sin(t * 22));
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.globalCompositeOperation = 'lighter';
  glow(g, 0, 0, 16, color, 0.5);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = mix('#a9bfd6', '#fff', flash);
  for (const sd of [-1, 1]) {
    g.beginPath();
    g.ellipse(sd * 5 * flap, -2, 6 * flap + 1, 4, sd * 0.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(sd * 4 * flap, 3, 4 * flap + 1, 3, -sd * 0.4, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = mix('#e8f4ff', '#fff', flash);
  g.fillRect(-1, -4, 2, 8);
  g.restore();
}

// ------------------------------------------------------------------ bosses
export function drawBoss(g: Ctx, b: Boss, time: number, windupMul: number, arenaFloor: number, arenaTop: number) {
  const fade = b.dead ? 0 : b.state === 'dying' ? clamp(1 - (b.stateT - 1.2) / 1.4, 0, 1) : 1;
  if (b instanceof Dzwon && b.phase === 2) drawCrackedBell(g, b.crackedX, arenaFloor, time, b.state === 'dying' ? b.stateT : 0);
  if (fade <= 0) return;
  g.save();
  g.globalAlpha = fade;
  if (b.bossId === 'kat') drawKat(g, b, time, windupMul);
  else if (b instanceof Pasterz) drawPasterz(g, b, time, windupMul, arenaFloor);
  else if (b instanceof Dzwon) {
    if (b.phase === 1) drawBell(g, b, time, windupMul, arenaTop);
    else drawMikolaj(g, b, time, windupMul);
  }
  g.restore();
  if (b.vulnerable && b.state !== 'dying') vulnerableMark(g, b.cx, b.body.y - 16, time);
}

function bossFlash(b: Boss) {
  return b.hitFlash * 0.7;
}

function drawKat(g: Ctx, b: Boss, time: number, wm: number) {
  const body = b.body;
  const flash = bossFlash(b);
  const m = b.move;
  const skin = mix('#6c6058', '#fff', flash);
  const leather = mix('#3b2a20', '#fff', flash);
  const hood = mix('#3a0c0c', '#fff', flash);
  const p2 = b.phase === 2;
  g.save();
  g.translate(b.cx, body.y + body.h);
  g.scale(b.face, 1);
  const dying = b.state === 'dying';
  if (dying) {
    const k = clamp(b.stateT / 1.2, 0, 1);
    g.translate(0, k * 30);
    g.rotate(k * 0.5);
  }
  const kneel = b.state === 'stagger' ? 18 : 0;
  const walk = b.state === 'move' ? Math.sin(b.anim * 6) : 0;
  const charge = m?.id === 'szarza' && (b.state === 'active' || b.state === 'windup');
  // legs
  limb2(g, -10, -52 + kneel, -14 + walk * 12, 0, 6, 14, mix('#1b1614', '#fff', flash));
  limb2(g, 10, -52 + kneel, 14 - walk * 12, kneel ? -6 : 0, 6, 14, mix('#221b18', '#fff', flash));
  g.fillStyle = '#0d0a09';
  g.fillRect(-22 + walk * 12, -6, 16, 6);
  g.fillRect(6 - walk * 12, -6, 16, 6);
  g.save();
  g.translate(0, -52 + kneel);
  g.rotate(charge ? 0.35 : b.state === 'parried' ? -0.2 : 0);
  // massive bare torso with straps
  poly(g, [-20, 4, -24, -42, -10, -52, 14, -52, 26, -40, 20, 4], skin);
  g.fillStyle = mix('#5d534b', '#fff', flash);
  g.fillRect(-6, -40, 2, 30);
  g.strokeStyle = leather;
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(-20, -44);
  g.lineTo(20, -4);
  g.stroke();
  g.fillStyle = leather;
  g.fillRect(-22, -4, 44, 10);
  // hood
  poly(g, [-12, -50, -14, -66, 0, -82, 14, -68, 12, -50], hood);
  g.fillStyle = '#050303';
  g.fillRect(2, -66, 10, 4);
  const eyeC = p2 ? '#ffb040' : '#ff5a3a';
  circle(g, 5, -64, 1.6, eyeC);
  circle(g, 10, -64, 1.6, eyeC);
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, 8, -64, 14, eyeC, 0.6);
  g.restore();
  // axe
  let rest = -2.3;
  let raise = -2.3;
  let strike = -2.3;
  if (m && (m.id === 'cios' || m.id === 'trzy1' || m.id === 'trzy3')) {
    raise = -2.8;
    strike = 1.25;
  } else if (m && (m.id === 'zamach' || m.id === 'trzy2')) {
    raise = 2.7;
    strike = 0.15;
  } else if (charge) {
    rest = 0.05;
    raise = 0.05;
    strike = 0.05;
  }
  if (b.state === 'stagger') rest = 1.5;
  const pose = statePose(b.state, b.stateT, m, rest, raise, strike, wm * (p2 ? 0.85 : 1));
  const a = b.state === 'idle' || b.state === 'move' ? rest + Math.sin(time * 1.5) * 0.04 : pose.a;
  const sx = 6;
  const sy = -40;
  const hx = sx + Math.cos(a) * 26;
  const hy = sy + Math.sin(a) * 26;
  if (pose.active && !charge) trail(g, sx, sy, 40, 104, raise + (strike - raise) * 0.15, a, p2 ? '#ffb060' : '#e8e0d0', 0.85);
  limb(g, sx, sy, hx, hy, 11, skin);
  g.save();
  g.translate(hx, hy);
  g.rotate(a);
  g.fillStyle = mix('#3a2a1e', '#fff', flash);
  g.fillRect(-20, -3, 92, 6);
  // the crescent blade
  const steel = p2 ? mix('#a35a28', '#ffd38a', 0.3 + Math.sin(time * 9) * 0.2) : mix('#77726c', '#fff', flash);
  g.fillStyle = steel;
  g.beginPath();
  g.moveTo(58, -4);
  g.quadraticCurveTo(64, -34, 84, -36);
  g.quadraticCurveTo(76, -6, 90, 26);
  g.quadraticCurveTo(66, 22, 58, 4);
  g.closePath();
  g.fill();
  g.strokeStyle = p2 ? '#ffd38a' : '#cfc8bb';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(84, -36);
  g.quadraticCurveTo(76, -6, 90, 26);
  g.stroke();
  if (p2) {
    g.globalCompositeOperation = 'lighter';
    glow(g, 76, -4, 50, '#ff8a3a', 0.6 + Math.sin(time * 11) * 0.15);
  }
  g.restore();
  g.restore();
  // telegraph glint at the blade
  const tg = b.telegraph;
  if (tg && m) {
    const k = clamp(b.stateT / (m.windup * wm * (p2 ? 0.85 : 1)), 0, 1);
    const ta = a;
    telegraphGlint(g, sx + Math.cos(ta) * 100, -52 + kneel + sy + Math.sin(ta) * 100 * 0.9, tg, k, time, 1.3);
  }
  g.restore();
}

function drawPasterz(g: Ctx, b: Pasterz, time: number, wm: number, floor: number) {
  const body = b.body;
  const flash = bossFlash(b);
  const m = b.move;
  const robe = mix('#2a2a33', '#fff', flash);
  const robeHi = mix('#575a70', '#fff', flash);
  const p2 = b.phase === 2;
  // shadow marking the dive landing
  if (m?.id === 'nurek' && (b.state === 'windup' || b.state === 'active')) {
    const k = b.state === 'active' ? 1 : clamp(b.stateT / (m.windup * wm), 0, 1);
    g.fillStyle = `rgba(0,0,0,${0.25 + k * 0.35})`;
    g.beginPath();
    g.ellipse(b.cx, floor - 2, 30 + k * 20, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = rgba('#ff3a2a', 0.5 * k);
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(b.cx, floor - 2, 30 + k * 20, 6, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
  // orbiting moths
  const n = p2 ? 9 : 6;
  for (let i = 0; i < n; i++) {
    const a = time * (1.4 + (i % 3) * 0.3) + (i / n) * Math.PI * 2;
    drawMoth(g, b.cx + Math.cos(a) * (46 + (i % 2) * 14), b.cy + Math.sin(a) * 22 - 10, 0.7, time + i, 0, p2 ? '#e8f4ff' : '#cfe8ff');
  }
  g.save();
  g.translate(b.cx, body.y + body.h);
  g.scale(b.face, 1);
  const grounded = b.state === 'grounded' || b.state === 'stagger' || b.state === 'dying';
  if (grounded) {
    g.translate(0, 0);
    g.scale(1.1, 0.75);
  }
  const diving = m?.id === 'nurek' && b.state === 'active';
  if (diving) g.rotate(0.5);
  // robe: long, ending in wisps
  const sway = Math.sin(time * 2) * 3;
  g.fillStyle = robe;
  g.beginPath();
  g.moveTo(-14, -70);
  g.quadraticCurveTo(-24, -30, -18 + sway, 0);
  for (let i = 0; i < 6; i++) g.lineTo(-14 + i * 6 + sway, i % 2 ? -10 : 4 + Math.sin(time * 5 + i) * 3);
  g.quadraticCurveTo(24, -30, 14, -70);
  g.closePath();
  g.fill();
  g.strokeStyle = robeHi;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(12, -68);
  g.quadraticCurveTo(22, -30, 18 + sway, -2);
  g.stroke();
  // deep hood with two pale lights
  poly(g, [-12, -70, -10, -88, 2, -96, 14, -86, 13, -70], mix('#1c1c24', '#fff', flash));
  g.fillStyle = '#030305';
  g.beginPath();
  g.ellipse(5, -80, 6, 8, 0, 0, Math.PI * 2);
  g.fill();
  const eyeC = p2 ? '#ffffff' : '#cfe8ff';
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, 5, -81, 16, eyeC, 0.8);
  circle(g, 3, -81, 1.4, eyeC);
  circle(g, 7.5, -81, 1.4, eyeC);
  g.restore();
  // the crook and lantern
  const raise = m?.id === 'roj' || m?.id === 'pierscien' || m?.id === 'wezwanie';
  const k = raise && b.state === 'windup' ? clamp(b.stateT / (m!.windup * wm), 0, 1) : raise && b.state === 'active' ? 1 : 0;
  const ang = lerp(-1.25, -1.95, k);
  const hx = 8 + Math.cos(ang) * 16;
  const hy = -62 + Math.sin(ang) * 16;
  limb(g, 8, -62, hx, hy, 5, robe);
  g.strokeStyle = mix('#3e2c1e', '#fff', flash);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(hx - Math.cos(ang) * 40, hy - Math.sin(ang) * 40);
  g.lineTo(hx + Math.cos(ang) * 40, hy + Math.sin(ang) * 40);
  const tx = hx + Math.cos(ang) * 40;
  const ty = hy + Math.sin(ang) * 40;
  g.arc(tx + 8, ty, 8, Math.PI, Math.PI * 2.2);
  g.stroke();
  // lantern full of moths
  const lx = tx + 16;
  const ly = ty + 12;
  g.strokeStyle = '#2a2a2a';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(tx + 15, ty + 2);
  g.lineTo(lx, ly - 6);
  g.stroke();
  g.fillStyle = 'rgba(200,230,255,0.35)';
  g.fillRect(lx - 5, ly - 6, 10, 13);
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, lx, ly, 24 + k * 30, '#cfe8ff', 0.8);
  g.restore();
  g.restore();
  const tg = b.telegraph;
  if (tg && m) {
    const kk = clamp(b.stateT / (m.windup * wm), 0, 1);
    telegraphGlint(g, b.cx + b.face * 6, body.y + body.h - 80, tg, kk, time, 1.2);
  }
}

function bellPath(g: Ctx, w: number, h: number) {
  // origin at bottom centre of the lip
  g.beginPath();
  g.moveTo(-w / 2, 0);
  g.quadraticCurveTo(-w * 0.42, -h * 0.15, -w * 0.36, -h * 0.45);
  g.quadraticCurveTo(-w * 0.32, -h * 0.9, 0, -h);
  g.quadraticCurveTo(w * 0.32, -h * 0.9, w * 0.36, -h * 0.45);
  g.quadraticCurveTo(w * 0.42, -h * 0.15, w / 2, 0);
  g.quadraticCurveTo(0, h * 0.06, -w / 2, 0);
  g.closePath();
}

function bronzeFill(g: Ctx, w: number, h: number, flash: number) {
  const grd = g.createLinearGradient(-w / 2, 0, w / 2, 0);
  grd.addColorStop(0, mix('#3a2410', '#fff', flash));
  grd.addColorStop(0.3, mix('#a67536', '#fff', flash));
  grd.addColorStop(0.45, mix('#e1b46a', '#fff', flash));
  grd.addColorStop(0.7, mix('#7c5426', '#fff', flash));
  grd.addColorStop(1, mix('#2a1a0c', '#fff', flash));
  void h;
  return grd;
}

function drawBell(g: Ctx, b: Dzwon, time: number, wm: number, arenaTop: number) {
  const body = b.body;
  const flash = bossFlash(b);
  const m = b.move;
  const w = body.w;
  const h = body.h;
  let jitter = 0;
  if (b.state === 'windup' && m) jitter = Math.sin(time * 70) * 2 * clamp(b.stateT / (m.windup * wm), 0, 1);
  if (b.state === 'intro') jitter = Math.sin(time * 40) * clamp(1 - b.stateT / b.introLen, 0, 1) * 2;
  const bx = b.cx + jitter;
  const by = body.y + body.h;
  // chain to the beam
  const grounded = b.state === 'grounded' || (b.state === 'active' && m?.id === 'spadek');
  g.strokeStyle = '#2b2622';
  g.lineWidth = 3;
  const chainTop = arenaTop;
  const chainBottom = body.y + 4;
  if (!grounded || b.state === 'active') {
    for (let y = chainTop; y < chainBottom; y += 10) {
      g.beginPath();
      g.ellipse(bx + Math.sin(y * 0.05 + time) * (b.state === 'windup' ? 2 : 0.5), y + 5, 3, 5, 0, 0, Math.PI * 2);
      g.stroke();
    }
  } else {
    // slack chain coiled beside the bell
    g.beginPath();
    g.moveTo(bx, chainTop);
    g.quadraticCurveTo(bx + 60, (chainTop + by) / 2, bx + 10, body.y);
    g.stroke();
  }
  g.save();
  g.translate(bx, by);
  if (b.state === 'active' && m?.id === 'wahadlo') g.rotate(Math.sin(b.swingT * 4) * 0.25 * b.swingDir);
  // yoke
  g.fillStyle = '#2a1e14';
  g.fillRect(-18, -h - 10, 36, 12);
  bellPath(g, w, h);
  g.fillStyle = bronzeFill(g, w, h, flash);
  g.fill();
  g.strokeStyle = rgba('#ffd9a0', 0.35);
  g.lineWidth = 1.5;
  g.stroke();
  // patina streaks
  g.save();
  bellPath(g, w, h);
  g.clip();
  g.fillStyle = 'rgba(70,140,110,0.25)';
  for (let i = 0; i < 6; i++) g.fillRect(-w / 2 + 8 + i * 19, -h * 0.85, 5, h * 0.5 + (i % 3) * 14);
  // inscription band
  g.fillStyle = 'rgba(40,24,10,0.55)';
  g.fillRect(-w / 2, -h * 0.62, w, 10);
  g.fillStyle = 'rgba(255,220,160,0.35)';
  for (let i = 0; i < 14; i++) g.fillRect(-w / 2 + 6 + i * 8, -h * 0.62 + 3, 4, 4);
  // cracks glow as it weakens
  const dmg = 1 - b.hp / b.maxHp;
  if (dmg > 0.1) {
    g.strokeStyle = rgba('#ffb766', 0.4 + dmg);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-10, -h);
    g.lineTo(-4, -h * 0.7);
    g.lineTo(-14, -h * 0.45);
    g.lineTo(-6, -h * 0.2);
    if (dmg > 0.3) {
      g.moveTo(20, -h * 0.8);
      g.lineTo(26, -h * 0.5);
      g.lineTo(18, -h * 0.3);
    }
    g.stroke();
  }
  // tone: the band lights up
  if (b.state === 'windup' && m?.id === 'ton') {
    const k = clamp(b.stateT / (m.windup * wm), 0, 1);
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rgba('#ffcf7a', 0.5 * k);
    g.fillRect(-w / 2, -h * 0.62, w, 10);
  }
  g.restore();
  // heart (clapper) under the lip
  const pulse = 0.6 + Math.sin(time * (grounded ? 8 : 3)) * 0.3;
  circle(g, 0, -10, 10, mix('#5a1a10', '#ff8a5a', pulse * 0.5));
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, 0, -10, grounded ? 70 : 40, '#ff7a3a', grounded ? 0.8 : 0.4 * pulse);
  g.restore();
  g.restore();
  const tg = b.telegraph;
  if (tg && m) {
    const k = clamp(b.stateT / (m.windup * wm), 0, 1);
    telegraphGlint(g, bx, by - 6, tg, k, time, 1.6);
  }
}

function drawCrackedBell(g: Ctx, x: number, floor: number, time: number, dyingT: number) {
  const w = 118;
  const h = 132;
  g.save();
  g.translate(x, floor);
  g.save();
  g.translate(-6, 0);
  g.rotate(-0.06);
  bellPath(g, w, h);
  g.fillStyle = bronzeFill(g, w, h, 0);
  g.fill();
  g.restore();
  // a dark split down the middle with molten light
  g.fillStyle = '#0b0603';
  g.beginPath();
  g.moveTo(-4, -h);
  g.lineTo(6, -h * 0.66);
  g.lineTo(-2, -h * 0.4);
  g.lineTo(10, 0);
  g.lineTo(-10, 0);
  g.lineTo(-12, -h * 0.4);
  g.lineTo(-4, -h * 0.66);
  g.closePath();
  g.fill();
  g.globalCompositeOperation = 'lighter';
  const a = 0.5 + Math.sin(time * 2) * 0.15 + (dyingT > 0 ? Math.min(1, dyingT) : 0);
  glow(g, 0, -h * 0.4, 70, '#ff8a3a', a * 0.6);
  g.restore();
}

function drawMikolaj(g: Ctx, b: Dzwon, time: number, wm: number) {
  const body = b.body;
  const flash = bossFlash(b);
  const m = b.move;
  const skin = mix('#7a6a5c', '#fff', flash);
  const bronze = mix('#b0803e', '#fff', flash);
  const apron = mix('#3a2618', '#fff', flash);
  g.save();
  g.translate(b.cx, body.y + body.h);
  g.scale(b.face, 1);
  if (b.state === 'dying') {
    const k = clamp(b.stateT / 1.4, 0, 1);
    g.translate(0, k * 18);
    g.rotate(-k * 0.3);
  }
  const air = m?.id === 'skok' && b.state === 'active' && !body.onGround;
  const walk = Math.sin(b.anim * 7) * Math.min(1, Math.abs(body.vx) / 40);
  const crouch = m?.id === 'skok' && b.state === 'windup' ? 10 : 0;
  limb2(g, -7, -46 + crouch, air ? -12 : -9 + walk * 9, air ? -12 : 0, 4, 10, mix('#1c1612', '#fff', flash));
  limb2(g, 7, -46 + crouch, air ? 14 : 9 - walk * 9, air ? -6 : 0, 4, 10, mix('#241c16', '#fff', flash));
  g.save();
  g.translate(0, -46 + crouch);
  // torso with the leather apron and bronze-fused flesh
  poly(g, [-15, 2, -17, -38, 0, -46, 17, -38, 15, 2], skin);
  g.fillStyle = bronze;
  g.beginPath();
  g.ellipse(-8, -30, 7, 10, 0.3, 0, Math.PI * 2);
  g.fill();
  poly(g, [-12, -26, 12, -26, 14, 10, -14, 10], apron);
  // head: half a bronze mask
  circle(g, 2, -52, 9, skin);
  g.fillStyle = bronze;
  g.beginPath();
  g.arc(2, -52, 9.5, -Math.PI / 2, Math.PI / 2);
  g.fill();
  g.save();
  g.globalCompositeOperation = 'lighter';
  circle(g, 6, -54, 1.6, '#ffcf7a');
  glow(g, 6, -54, 12, '#ffb766', 0.6);
  g.restore();
  // chain arm
  if (m?.id === 'lancuch' && (b.state === 'windup' || b.state === 'active')) {
    const k = b.state === 'active' ? 1 : clamp(b.stateT / (m.windup * wm), 0, 1);
    const reach = b.state === 'active' ? 240 : 20 * k;
    g.strokeStyle = mix('#5a5650', '#fff', flash);
    g.lineWidth = 3;
    for (let x = 0; x < reach; x += 9) {
      g.beginPath();
      g.ellipse(10 + x, -14 + Math.sin(x * 0.08 + time * 20) * (b.state === 'active' ? 3 : 0), 5, 2.5, 0, 0, Math.PI * 2);
      g.stroke();
    }
    limb(g, 6, -30, 14, -16, 6, bronze);
  } else limb(g, 6, -30, 12, -10, 6, bronze);
  // hammer arm
  let raise = -2.5;
  let strike = 1.2;
  let rest = 1.3;
  if (m?.id === 'odlew') {
    raise = -2.2;
    strike = 1.5;
  }
  if (air) rest = -2.2;
  const pose = statePose(b.state, b.stateT, m?.id === 'mlot' || m?.id === 'odlew' ? m : null, rest, raise, strike, wm);
  const a = pose.a;
  const sx = -4;
  const sy = -32;
  const hx = sx + Math.cos(a) * 18;
  const hy = sy + Math.sin(a) * 18;
  if (pose.active) trail(g, sx, sy, 30, 72, raise + (strike - raise) * 0.2, a, '#ffd9a0', 0.8);
  limb(g, sx, sy, hx, hy, 8, skin);
  g.save();
  g.translate(hx, hy);
  g.rotate(a);
  g.fillStyle = mix('#3a2a1e', '#fff', flash);
  g.fillRect(-6, -3, 48, 6);
  g.fillStyle = bronze;
  g.fillRect(36, -14, 18, 28);
  g.fillStyle = 'rgba(255,230,180,0.4)';
  g.fillRect(50, -13, 2, 26);
  g.restore();
  g.restore();
  const tg = b.telegraph;
  if (tg && m) {
    const k = clamp(b.stateT / (m.windup * wm), 0, 1);
    const ty = m.id === 'lancuch' ? -60 : m.id === 'skok' ? -70 : -46 + sy + Math.sin(a) * 60;
    const tx = m.id === 'lancuch' ? 16 : m.id === 'skok' ? 0 : sx + Math.cos(a) * 60;
    telegraphGlint(g, tx, ty, tg, k, time, 1.3);
  }
  g.restore();
}
