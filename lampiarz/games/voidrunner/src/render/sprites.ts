// Procedural pixel-art sprites. Everything is drawn with whole-pixel rectangles on the
// low-resolution buffer, anchored at the body's feet so sprites always stand on the ground.

import { COSMETICS, type CosmeticId, type WeaponId } from '../game/data';
import type { Enemy, Player, Projectile, WorldObject, Pickup } from '../game/types';
import { AREAS } from '../world/areas';
import { line, px, rect, rgba, shade, type Ctx, glow } from './pixel';

// ================================================================== player
export function drawPlayer(c: Ctx, p: Player, cos: CosmeticId, weapon: WeaponId, t: number, chargeK: number) {
  const C = COSMETICS[cos];
  const fx = Math.round(p.x + p.w / 2);
  const fy = Math.round(p.y + p.h);
  const a = p.anim;
  const at = p.animT;
  c.save();
  c.translate(fx, fy);
  if (p.facing < 0) c.scale(-1, 1);
  if (p.iframes > 0 && p.hurtT <= 0 && p.dashT <= 0 && Math.floor(t * 20) % 2 === 0) c.globalAlpha = 0.45;

  if (a === 'dead') {
    // collapsed on the ground, glow fading out
    const k = Math.min(1, at * 3);
    c.globalAlpha = Math.max(0.2, 1 - at * 0.4);
    rect(c, -10, -4, 20, 4, C.armor);
    rect(c, -10, -4, 20, 1, C.armorHi);
    rect(c, 8, -6, 5, 5, C.armor);
    px(c, 10, -4, rgba(C.visor, 1 - k * 0.8));
    c.restore();
    return;
  }

  // ---- pose parameters
  let bob = 0;
  let lean = 0;
  let legA = 0; // leg swing (-1..1)
  let legLift = 0;
  let armAng = 0.9; // radians, 0 = forward, positive = down
  let squash = 0;
  let tuck = false;
  if (a === 'idle') bob = Math.sin(t * 3) > 0.6 ? 1 : 0;
  else if (a === 'run') {
    legA = Math.sin(at * 15);
    bob = Math.abs(Math.cos(at * 15)) > 0.7 ? -1 : 0;
    lean = 1;
    armAng = 0.6 + Math.sin(at * 15) * 0.3;
  } else if (a === 'jump') {
    tuck = true;
    armAng = -0.2;
  } else if (a === 'fall') {
    legA = 0.4;
    armAng = -0.6;
  } else if (a === 'land') {
    squash = 2;
    armAng = 1.2;
  } else if (a === 'dash') {
    lean = 3;
    legA = -0.8;
    armAng = 2.6;
  } else if (a === 'hurt') {
    lean = -2;
    armAng = -1.2;
  } else if (a === 'charge') {
    armAng = -2.4 + Math.sin(t * 30) * 0.05;
    squash = 1;
  } else if (a === 'interact') armAng = 0;
  else if (a === 'heal') {
    squash = 3;
    armAng = 0.3;
  } else if (a === 'victory') armAng = -1.6;
  if (a === 'attack' && p.attack) {
    const k = Math.min(1, p.attack.t / Math.max(0.01, p.attack.dur * 0.55));
    if (weapon === 'cannon') armAng = 0;
    else if (p.attack.step === 1) armAng = 1.6 - k * 3.4; // upward swing
    else armAng = -1.9 + k * 3.3; // downward swing
    lean = 1;
  }
  if (a === 'chargeAtk' && p.attack) {
    const k = Math.min(1, p.attack.t / 0.25);
    armAng = weapon === 'blade' ? -1.5 + k * 6.6 : weapon === 'heavy' ? -2.3 + k * 3.6 : 0;
    squash = weapon === 'heavy' ? Math.round(k * 2) : 0;
  }
  if (a === 'special') armAng = weapon === 'heavy' ? 1.4 : -0.1;

  const y0 = bob + squash;
  // ---- scarf (flows behind, gives the silhouette its shape)
  const sway = Math.sin(t * 6) * 1.5;
  const trail = Math.min(6, Math.abs(p.vx) / 30 + (a === 'dash' ? 4 : 0));
  for (let i = 0; i < 6 + trail; i++) {
    const sx = -3 - i;
    const sy = -18 + y0 + Math.round(Math.sin(t * 8 - i * 0.7) * (0.5 + i * 0.12) + (i > 3 ? sway * 0.3 : 0)) + (p.vy < -50 ? Math.round(i * 0.3) : p.vy > 60 ? -Math.round(i * 0.3) : 0);
    px(c, sx, sy, i < 2 ? C.glow : shade(C.glow, -40 - i * 8));
    if (i < 4) px(c, sx, sy + 1, shade(C.glow, -70));
  }

  // ---- legs
  const legCol = shade(C.armor, -10);
  const drawLeg = (dx: number, swing: number, back: boolean) => {
    const col = back ? shade(legCol, -14) : legCol;
    if (tuck) {
      rect(c, dx - 1, -9 + y0, 3, 4, col);
      rect(c, dx + 1, -6 + y0, 3, 3, col);
      return;
    }
    const off = Math.round(swing * 3);
    const lift = swing > 0.3 ? 1 : 0;
    rect(c, dx - 1, -9 + y0, 3, 4, col); // thigh
    rect(c, dx - 1 + Math.round(off * 0.5), -5 + y0 - lift, 3, 4, col); // shin
    rect(c, dx - 1 + off, -2 - lift - legLift, 4, 2, shade(col, -20)); // boot
    px(c, dx + 2 + off, -1 - lift - legLift, rgba(C.glow, 0.7));
    px(c, dx + Math.round(off * 0.5), -5 + y0 - lift, C.armorHi); // knee pad
  };
  drawLeg(-2, -legA, true);
  // ---- back arm
  rect(c, -5 + lean, -16 + y0, 2, 6, shade(C.armor, -24));
  // ---- backpack thruster
  rect(c, -7 + lean, -17 + y0, 3, 7, '#1c2130');
  rect(c, -7 + lean, -17 + y0, 3, 1, shade(C.armor, 10));
  px(c, -6 + lean, -11 + y0, C.glow);
  if (a === 'jump' || a === 'dash' || p.airJumps < 1) px(c, -6 + lean, -10 + y0, '#ffffff');
  // ---- torso: lit from the upper left
  rect(c, -4 + lean, -17 + y0, 8, 9, C.armor);
  rect(c, -4 + lean, -17 + y0, 8, 1, C.armorHi);
  rect(c, -4 + lean, -16 + y0, 2, 5, shade(C.armor, 18));
  rect(c, 2 + lean, -16 + y0, 2, 6, shade(C.armor, -22));
  rect(c, -1 + lean, -12 + y0, 4, 1, shade(C.armor, -14)); // abdominal plate seam
  rect(c, -4 + lean, -10 + y0, 8, 2, '#1c2130'); // belt
  px(c, 0 + lean, -10 + y0, C.glow); // buckle light
  // energy line and core
  rect(c, -2 + lean, -14 + y0, 1, 3, rgba(C.glow, 0.85));
  rect(c, 1 + lean, -15 + y0, 2, 2, C.glow);
  px(c, 1 + lean, -15 + y0, '#ffffff');
  drawLeg(1, legA, false);
  // ---- head / helmet with a crest and a wrap-around visor
  rect(c, -3 + lean, -23 + y0, 7, 6, shade(C.armor, 8));
  rect(c, -3 + lean, -23 + y0, 7, 1, C.armorHi);
  rect(c, -3 + lean, -22 + y0, 1, 4, shade(C.armor, 22));
  rect(c, -4 + lean, -21 + y0, 1, 3, shade(C.armor, -12));
  rect(c, -2 + lean, -25 + y0, 3, 2, shade(C.armorHi, -10)); // crest
  px(c, -2 + lean, -25 + y0, C.glow);
  rect(c, 0 + lean, -21 + y0, 4, 2, C.visor); // visor
  px(c, -1 + lean, -21 + y0, shade(C.visor, -60));
  px(c, 3 + lean, -21 + y0, '#ffffff');
  rect(c, -2 + lean, -18 + y0, 5, 1, shade(C.armor, -18)); // jaw guard
  // ---- shoulder pad
  rect(c, -5 + lean, -18 + y0, 4, 3, C.armorHi);
  px(c, -5 + lean, -18 + y0, '#ffffff');
  rect(c, -5 + lean, -16 + y0, 4, 1, shade(C.armor, -10));
  rect(c, -4 + lean, -17 + y0, 2, 1, rgba(C.glow, 0.7));

  // ---- front arm + weapon
  const sx = 2 + lean;
  const sy = -15 + y0;
  const ax = Math.round(sx + Math.cos(armAng) * 5);
  const ay = Math.round(sy + Math.sin(armAng) * 5);
  line(c, sx, sy, ax, ay, C.armor);
  line(c, sx, sy + 1, ax, ay + 1, shade(C.armor, -10));
  rect(c, ax - 1, ay - 1, 2, 2, shade(C.armorHi, -10)); // fist
  if (weapon === 'cannon') {
    const bx = ax;
    const by = ay;
    rect(c, bx - 1, by - 2, 8, 4, '#2a3040');
    rect(c, bx - 1, by - 2, 8, 1, '#4a5470');
    rect(c, bx + 6, by - 1, 2, 2, C.glow);
    if (chargeK > 0) glow(c, bx + 8, by, 4 + chargeK * 6, C.glow, 0.3 + chargeK * 0.4);
  } else {
    const len = weapon === 'heavy' ? 15 : 12;
    const bx = Math.round(ax + Math.cos(armAng) * len);
    const by = Math.round(ay + Math.sin(armAng) * len);
    // hilt
    line(c, ax, ay, Math.round(ax - Math.cos(armAng) * 2), Math.round(ay - Math.sin(armAng) * 2), '#1a1d28');
    // blade: glowing edge with a white core
    line(c, ax, ay, bx, by, C.glow);
    if (weapon === 'heavy') {
      line(c, ax + 1, ay, bx + 1, by, shade(C.glow, -40));
      line(c, ax, ay + 1, bx, by + 1, shade(C.glow, -60));
    }
    const mx = Math.round((ax + bx) / 2);
    const my = Math.round((ay + by) / 2);
    line(c, ax, ay, mx, my, '#ffffff');
    if (chargeK > 0) {
      glow(c, bx, by, 4 + chargeK * 8, C.glow, 0.25 + chargeK * 0.45);
      if (chargeK >= 1 && Math.floor(t * 16) % 2 === 0) line(c, ax, ay, bx, by, '#ffffff');
    }
  }
  if (a === 'heal') glow(c, 0, -10, 14, '#5dff9b', 0.35);
  c.restore();
  // hurt flash outline
  if (p.hurtT > 0) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    glow(c, fx, fy - 11, 14, '#ff4a5a', 0.35);
    c.restore();
  }
}

/** Arc of a sword slash (drawn during the active part of a melee swing). */
export function drawSlash(c: Ctx, p: Player, cos: CosmeticId, weapon: WeaponId, reach: number) {
  const a = p.attack;
  if (!a || weapon === 'cannon') return;
  const C = COSMETICS[cos];
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2 - 2;
  c.save();
  c.globalCompositeOperation = 'lighter';
  if (a.kind === 'charged' && weapon === 'blade') {
    const k = Math.min(1, a.t / 0.3);
    const R = 40 * reach;
    c.strokeStyle = rgba(C.glow, 0.7 * (1 - k * 0.6));
    c.lineWidth = 4;
    c.beginPath();
    c.arc(cx, cy, R * (0.6 + k * 0.4), k * Math.PI * 2 - 1.5, k * Math.PI * 2 + 1.5);
    c.stroke();
    c.strokeStyle = rgba('#ffffff', 0.6 * (1 - k));
    c.lineWidth = 1;
    c.stroke();
  } else {
    const k = Math.min(1, a.t / Math.max(0.01, a.dur * 0.6));
    const R = (weapon === 'heavy' ? 30 : 22) * reach * (a.kind === 'charged' ? 1.5 : 1);
    const dir = p.facing;
    const start = a.step === 1 ? 1.4 : -1.6;
    const end = a.step === 1 ? -1.4 : 1.2;
    const ang = start + (end - start) * k;
    const alpha = Math.max(0, 1 - k * 1.1);
    c.translate(cx, cy);
    c.scale(dir, 1);
    c.strokeStyle = rgba(C.glow, 0.75 * alpha);
    c.lineWidth = weapon === 'heavy' ? 5 : 3;
    c.beginPath();
    if (start < end) c.arc(2, 0, R, start, ang);
    else c.arc(2, 0, R, ang, start);
    c.stroke();
    c.strokeStyle = rgba('#ffffff', 0.8 * alpha);
    c.lineWidth = 1;
    c.stroke();
  }
  c.restore();
}

// ================================================================== enemies
export function drawEnemy(c: Ctx, e: Enemy, area: number, t: number) {
  const fx = Math.round(e.x + e.w / 2);
  const fy = Math.round(e.y + e.h);
  c.save();
  if (e.dead) {
    c.globalAlpha = Math.max(0, 1 - e.deathT * 2.5);
  }
  c.translate(fx, fy);
  if (e.facing < 0) c.scale(-1, 1);
  const flash = e.flash > 0;
  const tele = e.state === 'windup' || e.state === 'tell' || e.state === 'charge' || e.state === 'cast' || e.state === 'blinkIn';
  const blink = tele && Math.floor(t * 14) % 2 === 0;
  const eyeCol = e.elite ? '#ff3d5e' : tele ? '#ffffff' : '#ff6a3a';
  if (e.elite) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    glow(c, 0, -e.h / 2, e.w + 4, '#ff3d5e', 0.25 + Math.sin(t * 5) * 0.08);
    c.restore();
  }
  switch (e.type) {
    case 'drone': {
      const by = -6 + Math.round(Math.sin(t * 6 + e.seed) * 1);
      const body = e.elite ? '#7a3a4a' : '#5a6680';
      // rotor
      const rw = Math.abs(Math.round(Math.cos(t * 40) * 7));
      rect(c, -rw, by - 7, rw * 2 + 1, 1, '#8a93ad');
      rect(c, 0, by - 6, 1, 2, '#2a3040');
      // body
      rect(c, -6, by - 4, 13, 8, body);
      rect(c, -6, by - 4, 13, 1, shade(body, 30));
      rect(c, -7, by - 1, 1, 3, shade(body, -10));
      rect(c, 7, by - 1, 1, 3, shade(body, -10));
      rect(c, -4, by + 4, 9, 1, shade(body, -20));
      // eye
      rect(c, 1, by - 2, 4, 3, '#0a0c14');
      rect(c, 2, by - 1, 2, 1, blink ? '#ffffff' : eyeCol);
      if (tele) glow(c, 3, by - 1, 10, '#ff4a5a', 0.35);
      if (e.elite) rect(c, -6, by + 1, 13, 1, '#ff3d5e');
      break;
    }
    case 'hunter':
    case 'larva': {
      if (e.type === 'larva') {
        for (let i = 0; i < 4; i++) rect(c, -5 + i * 3, -6 + Math.round(Math.sin(t * 12 + i) * 1), 3, 5, i % 2 ? '#3a5a2a' : '#4a6a34');
        px(c, 5, -4, '#ff4a5a');
        break;
      }
      const skin = area === 1 ? '#5a7a5a' : area === 4 ? '#5a4a74' : '#74585a';
      const metal = e.elite ? '#8a3a4a' : '#5a6680';
      const step = e.state === 'chase' ? Math.sin(t * 16) : 0;
      // backward-jointed legs
      rect(c, -4 + Math.round(step * 2), -6, 2, 6, shade(skin, -10));
      rect(c, 2 - Math.round(step * 2), -6, 2, 6, skin);
      rect(c, -5 + Math.round(step * 2), -1, 3, 1, '#1a1a1a');
      rect(c, 2 - Math.round(step * 2), -1, 3, 1, '#1a1a1a');
      // hunched torso
      rect(c, -5, -15, 10, 9, skin);
      rect(c, -5, -15, 10, 2, metal);
      rect(c, -6, -13, 2, 4, metal);
      for (let i = 0; i < 3; i++) px(c, -3 + i * 2, -10, shade(skin, 20));
      // head low and forward
      rect(c, 3, -17, 6, 5, metal);
      rect(c, 6, -15, 2, 1, blink ? '#ffffff' : eyeCol);
      // claw arm
      const raised = e.state === 'windup';
      const strike = e.state === 'slash';
      if (raised) {
        line(c, 2, -14, 1, -22, skin);
        line(c, 1, -22, 6, -24, '#c8d2e6');
        line(c, 1, -22, 7, -21, '#c8d2e6');
        glow(c, 4, -22, 8, '#ff4a5a', 0.4);
      } else if (strike) {
        line(c, 2, -12, 12, -8, skin);
        line(c, 12, -8, 18, -10, '#ffffff');
        line(c, 12, -8, 18, -6, '#ffffff');
      } else {
        line(c, 2, -12, 7, -6, skin);
        line(c, 7, -6, 10, -4, '#8a93ad');
      }
      if (e.elite) rect(c, -5, -15, 10, 1, '#ff3d5e');
      break;
    }
    case 'turret': {
      c.save();
      if (e.ceiling) {
        c.scale(1, -1);
        c.translate(0, e.h);
      }
      rect(c, -7, -4, 14, 4, '#2a3040');
      rect(c, -7, -4, 14, 1, '#4a5470');
      rect(c, -5, -9, 10, 5, e.elite ? '#7a3a4a' : '#5a6680');
      rect(c, -5, -9, 10, 1, '#5a6480');
      c.restore();
      // barrel aims at the target (in world space, so undo the flip)
      const ang = Math.atan2((e.aimY ?? fy) - (e.y + e.h / 2), ((e.aimX ?? fx) - fx) * (e.facing < 0 ? -1 : 1));
      const cy = e.ceiling ? -e.h + 7 : -7;
      line(c, 0, cy, Math.round(Math.cos(ang) * 8), Math.round(cy + Math.sin(ang) * 8), '#8a93ad');
      rect(c, -1, cy - 1, 3, 3, e.state === 'charge' ? (blink ? '#ffffff' : '#ff4a5a') : '#ff6a3a');
      if (e.state === 'charge') glow(c, 0, cy, 6 + e.stateT * 10, '#ff4a5a', 0.4);
      break;
    }
    case 'stalker': {
      const lurk = e.state === 'lurk' || e.state === 'idle';
      c.globalAlpha *= lurk ? 0.35 + Math.abs(Math.sin(t * 2 + e.seed)) * 0.25 : 1;
      const body = e.elite ? '#5a2a3a' : '#3a3450';
      const stretch = e.state === 'lunge' ? 4 : 0;
      const crouch = e.state === 'tell' ? 3 : 0;
      // long thin legs
      rect(c, -3, -9 + crouch, 1, 9 - crouch, body);
      rect(c, 2, -9 + crouch, 1, 9 - crouch, body);
      // body
      rect(c, -3 - stretch, -20 + crouch, 7 + stretch, 11, body);
      rect(c, -3 - stretch, -20 + crouch, 7 + stretch, 1, shade(body, 30));
      // blade limbs
      line(c, 3, -17 + crouch, 10 + stretch * 2, -12 + crouch, '#9aa7c4');
      line(c, -3, -17 + crouch, -8, -10 + crouch, '#6a7896');
      // head and eyes
      rect(c, 1, -23 + crouch, 5, 4, body);
      const eye = e.state === 'tell' ? (blink ? '#ffffff' : '#ff3d5e') : e.elite ? '#ff3d5e' : '#c45cff';
      px(c, 4, -22 + crouch, eye);
      px(c, 2, -22 + crouch, eye);
      if (e.state === 'tell') glow(c, 3, -21 + crouch, 12, '#ff3d5e', 0.45);
      break;
    }
    case 'void': {
      const by = -8;
      const fade = e.state === 'blinkOut' ? 1 - e.stateT / 0.35 : e.state === 'blinkIn' ? Math.min(1, e.stateT / 0.3) : 1;
      c.globalAlpha *= Math.max(0.1, fade);
      c.save();
      c.globalCompositeOperation = 'lighter';
      glow(c, 0, by, 14, '#c45cff', 0.3);
      c.restore();
      // tentacles
      for (let i = 0; i < 4; i++) {
        let x = -4 + i * 3;
        let y = by + 4;
        for (let k = 0; k < 7; k++) {
          x += Math.sin(t * 5 + i + k * 0.7) * 0.8;
          y += 1;
          px(c, x, y, k < 3 ? '#5a2a78' : '#3a1a4a');
        }
      }
      // orb body
      c.fillStyle = e.elite ? '#4a1030' : '#2a1035';
      c.beginPath();
      c.arc(0, by, 7, 0, Math.PI * 2);
      c.fill();
      rect(c, -5, by - 6, 10, 1, '#6a3a8a');
      // eye
      rect(c, -2, by - 2, 5, 4, '#e0b3ff');
      rect(c, 0 + Math.round(Math.sin(t) * 1), by - 1, 2, 2, e.state === 'cast' && blink ? '#ffffff' : '#1a0520');
      if (e.state === 'cast') glow(c, 0, by, 6 + e.stateT * 16, '#c45cff', 0.5);
      break;
    }
  }
  if (flash) {
    c.globalCompositeOperation = 'lighter';
    glow(c, 0, -e.h / 2, e.w, '#ffffff', 0.6);
  }
  c.restore();
}

// ================================================================== bosses
export function drawBoss(c: Ctx, e: Enemy, t: number) {
  const cx = Math.round(e.x + e.w / 2);
  const cy = Math.round(e.y + e.h / 2);
  c.save();
  if (e.dead) c.globalAlpha = Math.max(0, 1 - e.deathT);
  const tele = ['spitTell', 'leapTell', 'orbTell', 'dashTell', 'spawn', 'tentacles', 'sweep', 'summon'].includes(e.state) && e.stateT < 0.9;
  const blink = tele && Math.floor(t * 12) % 2 === 0;
  if (e.boss === 'matka') {
    c.translate(cx, Math.round(e.y + e.h));
    if (e.facing < 0) c.scale(-1, 1);
    const crouch = e.state === 'leapTell' ? 4 : 0;
    const swell = e.state === 'spitTell' ? Math.round(e.stateT * 6) : 0;
    const flesh = e.phase >= 2 ? '#7a3a48' : '#56704a';
    // legs
    for (let i = 0; i < 3; i++) {
      const lx = -16 + i * 10;
      const k = Math.sin(t * 6 + i) * 2;
      line(c, lx, -12 + crouch, lx - 6, -4, '#2a2a22');
      line(c, lx - 6, -4, lx - 4 + k, 0, '#2a2a22');
      line(c, lx + 8, -12 + crouch, lx + 14, -4, '#2a2a22');
      line(c, lx + 14, -4, lx + 12 - k, 0, '#2a2a22');
    }
    // abdomen with egg sacs
    c.fillStyle = flesh;
    c.beginPath();
    c.ellipse(-8, -18 + crouch, 16 + swell * 0.4, 12 + swell * 0.3, 0, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < 5; i++) {
      const ex = -18 + i * 5;
      const ey = -20 + crouch + (i % 2) * 5;
      rect(c, ex, ey, 4, 4, '#7dff4a');
      px(c, ex + 1, ey + 1, '#d8ffe6');
    }
    if (e.phase >= 2) for (let i = 0; i < 4; i++) line(c, -20 + i * 7, -28 + crouch, -16 + i * 7, -12 + crouch, '#ff4a5a');
    // head
    c.fillStyle = shade(flesh, 10);
    c.beginPath();
    c.ellipse(12, -20 + crouch, 10, 8, 0.2, 0, Math.PI * 2);
    c.fill();
    // mandibles
    line(c, 18, -16 + crouch, 24, -12 + crouch, '#c8d2e6');
    line(c, 18, -22 + crouch, 25, -24 + crouch, '#c8d2e6');
    // eyes
    for (let i = 0; i < 3; i++) rect(c, 12 + i * 3, -24 + crouch, 2, 2, blink ? '#ffffff' : '#ff4a5a');
    if (swell) glow(c, 20, -18, 6 + swell * 2, '#7dff4a', 0.5);
  } else if (e.boss === 'straznik') {
    c.translate(cx, cy);
    const rot = t * (e.phase >= 2 ? 1.6 : 0.8);
    // thruster glow
    c.save();
    c.globalCompositeOperation = 'lighter';
    glow(c, 0, 18, 14, '#3ee6ff', 0.35 + Math.sin(t * 20) * 0.1);
    c.restore();
    // rotating armour ring
    for (let i = 0; i < 8; i++) {
      const a = rot + (i / 8) * Math.PI * 2;
      const x = Math.cos(a) * 19;
      const y = Math.sin(a) * 19;
      rect(c, x - 3, y - 3, 6, 6, i % 2 ? '#2a3a5a' : '#3a4a6a');
      px(c, x, y, i % 2 ? '#3ee6ff' : '#ff4a5a');
    }
    // core sphere
    c.fillStyle = '#1a2236';
    c.beginPath();
    c.arc(0, 0, 14, 0, Math.PI * 2);
    c.fill();
    rect(c, -12, -3, 24, 6, '#2a3450');
    rect(c, -12, -3, 24, 1, '#4a5a80');
    // eye lens tracks the player
    const look = e.aimX !== undefined ? Math.sign((e.aimX ?? 0) - cx) * 3 : 0;
    rect(c, -5 + look, -5, 10, 10, '#0a0c14');
    const lens = e.state === 'laser' ? '#ff4a5a' : blink ? '#ffffff' : e.phase >= 3 ? '#ff4a5a' : '#3ee6ff';
    rect(c, -3 + look, -3, 6, 6, lens);
    px(c, -2 + look, -2, '#ffffff');
    c.save();
    c.globalCompositeOperation = 'lighter';
    glow(c, look, 0, 18, lens, 0.35);
    c.restore();
  } else {
    // Serce Pustki — a pulsing crystal heart wrapped in veins, with orbiting shards
    c.translate(cx, cy);
    const beat = 1 + Math.max(0, Math.sin(t * (e.phase >= 3 ? 7 : 4))) * 0.08;
    c.save();
    c.globalCompositeOperation = 'lighter';
    glow(c, 0, 0, 44 * beat, '#c45cff', 0.35);
    glow(c, 0, 0, 20, '#ff4aff', 0.3);
    c.restore();
    for (let i = 0; i < 7; i++) {
      const a = t * 0.9 + (i / 7) * Math.PI * 2;
      const r = 30 + Math.sin(t * 2 + i) * 3;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * 0.6;
      c.fillStyle = i % 2 ? '#5a2a78' : '#3ee6ff';
      c.beginPath();
      c.moveTo(x, y - 4);
      c.lineTo(x + 2, y);
      c.lineTo(x, y + 4);
      c.lineTo(x - 2, y);
      c.fill();
    }
    c.scale(beat, beat);
    c.fillStyle = '#2a0b35';
    c.beginPath();
    c.moveTo(0, -24);
    c.lineTo(18, -8);
    c.lineTo(14, 14);
    c.lineTo(0, 26);
    c.lineTo(-14, 14);
    c.lineTo(-18, -8);
    c.closePath();
    c.fill();
    c.fillStyle = '#5a1a78';
    c.beginPath();
    c.moveTo(0, -18);
    c.lineTo(11, -6);
    c.lineTo(8, 10);
    c.lineTo(0, 18);
    c.lineTo(-8, 10);
    c.lineTo(-11, -6);
    c.closePath();
    c.fill();
    for (let i = 0; i < 6; i++) line(c, 0, 0, Math.cos(i) * 16, Math.sin(i * 1.3) * 18, '#c45cff');
    rect(c, -3, -4, 6, 8, blink ? '#ffffff' : e.state === 'tired' ? '#ffe066' : '#ff8aff');
    px(c, -1, -2, '#ffffff');
  }
  if (e.flash > 0) {
    c.globalCompositeOperation = 'lighter';
    glow(c, 0, e.boss === 'matka' ? -18 : 0, 34, '#ffffff', 0.45);
  }
  c.restore();
}

// ================================================================== projectiles
export function drawProjectile(c: Ctx, p: Projectile, glowCol: string, t: number) {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  switch (p.kind) {
    case 'bolt':
      if (p.owner === 'player') {
        rect(c, x - 3, y, 6, 1, glowCol);
        px(c, x, y, '#ffffff');
        glow(c, x, y, 6, glowCol, 0.5);
      } else {
        rect(c, x - 1, y - 1, 3, 3, '#ff4a5a');
        px(c, x, y, '#ffe0e0');
        glow(c, x, y, 6, '#ff4a5a', 0.5);
      }
      break;
    case 'wave': {
      const d = Math.sign(p.vx);
      for (let i = -9; i <= 9; i++) {
        const xx = x + Math.round(d * (4 - (i * i) / 18));
        px(c, xx, y + i, glowCol);
        px(c, xx - d, y + i, '#ffffff');
      }
      glow(c, x, y, 14, glowCol, 0.35);
      break;
    }
    case 'shock':
      rect(c, x - 4, y - 3 + Math.round(Math.sin(t * 40) * 1), 8, 6, '#ffb23e');
      glow(c, x, y, 10, '#ffb23e', 0.4);
      break;
    case 'grenade':
      rect(c, x - 2, y - 2, 4, 4, '#3a3048');
      px(c, x, y - 2, Math.floor(t * 12) % 2 ? '#ff4a5a' : '#ffb23e');
      break;
    case 'shard':
      px(c, x, y, '#ff7ad9');
      px(c, x - Math.sign(p.vx), y - Math.sign(p.vy), '#ffd6f2');
      break;
    case 'orb':
      c.fillStyle = '#c45cff';
      c.beginPath();
      c.arc(x, y, p.r, 0, Math.PI * 2);
      c.fill();
      rect(c, x - 1, y - 1, 2, 2, '#ffffff');
      glow(c, x, y, p.r * 3, '#c45cff', 0.4);
      break;
    case 'acid':
      c.fillStyle = '#7dff4a';
      c.beginPath();
      c.arc(x, y, p.r, 0, Math.PI * 2);
      c.fill();
      px(c, x - 1, y - 2, '#d8ffe6');
      glow(c, x, y, 10, '#7dff4a', 0.35);
      break;
    default:
      rect(c, x - 1, y - 1, 3, 3, '#ffffff');
  }
}

// ================================================================== objects, pickups, door
export function drawObject(c: Ctx, o: WorldObject, area: number, t: number, near: boolean) {
  const pal = AREAS[area].palette;
  const x = Math.round(o.x);
  const y = Math.round(o.y);
  switch (o.kind) {
    case 'checkpoint': {
      rect(c, x - 6, y - 4, 12, 4, '#2a3040');
      rect(c, x - 6, y - 4, 12, 1, '#4a5470');
      rect(c, x - 2, y - 26, 4, 22, '#2a3040');
      rect(c, x - 1, y - 24, 2, 18, o.used ? '#5dff9b' : '#3a4256');
      rect(c, x - 4, y - 30, 8, 4, '#3a4256');
      const col = o.used ? '#5dff9b' : '#ff4a5a';
      rect(c, x - 2, y - 29, 4, 2, col);
      if (o.used) glow(c, x, y - 28, 10 + Math.sin(t * 3) * 2, '#5dff9b', 0.45);
      break;
    }
    case 'altar': {
      rect(c, x - 10, y - 6, 20, 6, '#2a2236');
      rect(c, x - 10, y - 6, 20, 1, '#5a4a78');
      rect(c, x - 7, y - 12, 14, 6, '#3a2a4a');
      if (!o.used) {
        const fy = y - 20 + Math.sin(t * 2) * 2;
        c.fillStyle = '#ffe066';
        c.beginPath();
        c.moveTo(x, fy - 5);
        c.lineTo(x + 4, fy);
        c.lineTo(x, fy + 5);
        c.lineTo(x - 4, fy);
        c.fill();
        px(c, x - 1, fy - 2, '#ffffff');
        glow(c, x, fy, 18, '#ffe066', 0.45);
      }
      break;
    }
    case 'chest': {
      const open = o.used;
      rect(c, x - 9, y - 9, 18, 9, '#3a3048');
      rect(c, x - 9, y - 9, 18, 1, '#5a4a6a');
      rect(c, x - 9, y - 5, 18, 1, '#2a2236');
      if (open) {
        rect(c, x - 9, y - 14, 18, 3, '#4a3a5a');
        glow(c, x, y - 9, 10, '#e0b3ff', 0.3);
      } else {
        rect(c, x - 9, y - 12, 18, 3, '#4a3a5a');
        rect(c, x - 1, y - 9, 2, 3, '#e0b3ff');
        glow(c, x, y - 7, 8, '#e0b3ff', 0.25 + Math.sin(t * 3) * 0.1);
      }
      break;
    }
    case 'terminal': {
      rect(c, x - 6, y - 18, 12, 18, '#2a3040');
      rect(c, x - 6, y - 18, 12, 1, '#4a5470');
      rect(c, x - 4, y - 16, 8, 7, rgba(pal.accent, 0.75));
      for (let i = 0; i < 3; i++) rect(c, x - 3, y - 15 + i * 2, 2 + ((i * 3 + Math.floor(t * 2)) % 5), 1, '#ffffff');
      if (!o.used && Math.floor(t * 2) % 2 === 0) px(c, x + 3, y - 6, '#ffe066');
      break;
    }
    case 'medstation': {
      rect(c, x - 6, y - 20, 12, 20, '#2a3a36');
      rect(c, x - 6, y - 20, 12, 1, '#4a6a60');
      const col = o.used ? '#3a4a46' : '#5dff9b';
      rect(c, x - 1, y - 16, 2, 8, col);
      rect(c, x - 4, y - 13, 8, 2, col);
      if (!o.used) glow(c, x, y - 12, 12, '#5dff9b', 0.35);
      break;
    }
    case 'secret': {
      if (!o.used) {
        rect(c, x - 6, y - 8, 12, 8, '#2a1a35');
        rect(c, x - 6, y - 8, 12, 1, '#5a2a78');
        for (let i = 0; i < 3; i++) px(c, x - 3 + i * 3, y - 5, '#e0b3ff');
        glow(c, x, y - 6, 14, '#c45cff', 0.4 + Math.sin(t * 4) * 0.1);
      }
      break;
    }
    case 'sign': {
      rect(c, x - 1, y - 14, 2, 14, '#2a3040');
      rect(c, x - 7, y - 20, 14, 8, '#1a1d28');
      rect(c, x - 6, y - 19, 12, 6, rgba(pal.accent, 0.35));
      rect(c, x - 5, y - 17, 6, 1, rgba('#ffffff', 0.7));
      rect(c, x - 5, y - 15, 9, 1, rgba('#ffffff', 0.5));
      break;
    }
  }
  if (near && o.kind !== 'sign' && o.kind !== 'checkpoint') {
    // floating "E" prompt
    const by = y - 34 + Math.sin(t * 4) * 1.5;
    rect(c, x - 4, by, 9, 9, '#0a0c14');
    rect(c, x - 4, by, 9, 1, pal.accent);
    rect(c, x - 2, by + 2, 1, 5, '#ffffff');
    rect(c, x - 2, by + 2, 4, 1, '#ffffff');
    rect(c, x - 2, by + 4, 3, 1, '#ffffff');
    rect(c, x - 2, by + 6, 4, 1, '#ffffff');
  }
}

export function drawPickup(c: Ctx, k: Pickup, t: number) {
  const x = Math.round(k.x);
  const y = Math.round(k.y + (k.grounded ? Math.sin(t * 4 + k.id) * 1.5 - 2 : 0));
  if (k.kind === 'health') {
    rect(c, x - 1, y - 3, 3, 7, '#5dff9b');
    rect(c, x - 3, y - 1, 7, 3, '#5dff9b');
    glow(c, x, y, 8, '#5dff9b', 0.4);
    return;
  }
  const big = k.value >= 5;
  c.fillStyle = big ? '#e0b3ff' : '#c45cff';
  c.beginPath();
  const s = big ? 4 : 3;
  c.moveTo(x, y - s);
  c.lineTo(x + s - 1, y);
  c.lineTo(x, y + s);
  c.lineTo(x - s + 1, y);
  c.fill();
  px(c, x, y - 1, '#ffffff');
  glow(c, x, y, big ? 9 : 6, '#c45cff', 0.4);
}

export function drawDoor(c: Ctx, x: number, y: number, locked: boolean, area: number, t: number, entry = false) {
  const pal = AREAS[area].palette;
  // frame
  rect(c, x - 3, y - 2, 22, 52, '#1a1d28');
  rect(c, x - 3, y - 2, 22, 2, pal.trim);
  rect(c, x - 3, y - 2, 2, 52, shade(pal.trim, -10));
  rect(c, x + 17, y - 2, 2, 52, shade(pal.trim, -20));
  if (locked || entry) {
    // closed shutter with stripes
    rect(c, x, y, 16, 48, '#2a3040');
    for (let i = 0; i < 8; i++) rect(c, x, y + i * 6, 16, 1, '#1a1d28');
    const col = entry ? '#3a4256' : '#ff3d5e';
    rect(c, x + 6, y + 20, 4, 6, col);
    if (!entry) glow(c, x + 8, y + 23, 10 + Math.sin(t * 6) * 2, '#ff3d5e', 0.4);
  } else {
    // open: a lit passage
    rect(c, x, y, 16, 48, '#05060a');
    const g = c.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, rgba(pal.accent, 0.05));
    g.addColorStop(1, rgba(pal.accent, 0.35));
    c.fillStyle = g;
    c.fillRect(x, y, 16, 48);
    rect(c, x, y - 1, 16, 1, '#5dff9b');
    for (let i = 0; i < 3; i++) {
      const ay = y + 18 + i * 6;
      const ox = Math.round((t * 12 + i * 3) % 8);
      line(c, x + 3 + ox, ay, x + 6 + ox, ay + 3, '#5dff9b');
      line(c, x + 6 + ox, ay + 3, x + 3 + ox, ay + 6, '#5dff9b');
    }
  }
}
