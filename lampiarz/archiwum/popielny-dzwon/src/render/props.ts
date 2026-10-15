// Interactables, hazards and projectiles.
import { clamp } from '../core/util';
import type { Hazard } from '../world/hazards';
import { T, type Level } from '../world/level';
import type { Projectile } from '../world/types';
import type { Interactable } from '../world/world';
import { drawMoth } from './actors';
import type { Scene } from './backdrop';
import { circle, glow, limb, mix, poly, rgba, star, type Ctx } from './paint';

function ceilingAbove(level: Level, x: number, y: number) {
  const tx = Math.floor(x / T);
  for (let ty = Math.floor(y / T) - 1; ty >= 0; ty--) if (level.solidAt(tx, ty)) return (ty + 1) * T;
  return Math.max(0, y - 140);
}

function hangChain(g: Ctx, x: number, y0: number, y1: number) {
  g.strokeStyle = '#2a2523';
  g.lineWidth = 1.5;
  for (let y = y0; y < y1; y += 7) {
    g.beginPath();
    g.ellipse(x, y + 3.5, 2, 3.5, 0, 0, Math.PI * 2);
    g.stroke();
  }
}

function flame(g: Ctx, x: number, y: number, s: number, time: number, color = '#ffb766') {
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const f = Math.sin(time * (9 + i * 3) + i) * 0.15;
    const h = s * (1 - i * 0.25) * (1 + f);
    g.fillStyle = i === 2 ? 'rgba(255,250,220,0.9)' : rgba(color, 0.55 + i * 0.15);
    g.beginPath();
    g.moveTo(x - s * 0.32 * (1 - i * 0.25), y);
    g.quadraticCurveTo(x - s * 0.3, y - h * 0.6, x + f * 4, y - h);
    g.quadraticCurveTo(x + s * 0.3, y - h * 0.6, x + s * 0.32 * (1 - i * 0.25), y);
    g.closePath();
    g.fill();
  }
  g.restore();
}

export interface PropCtx {
  level: Level;
  scene: Scene;
  time: number;
  reveal: boolean;
  halszkaNew: boolean;
  bossDefeated: boolean;
}

export function drawInteractable(g: Ctx, it: Interactable, c: PropCtx) {
  const { time } = c;
  const x = it.x;
  const y = it.y;
  switch (it.kind) {
    case 'lantern': {
      const top = ceilingAbove(c.level, x, y + 1);
      hangChain(g, x, top, y + 4);
      g.fillStyle = '#1e1a18';
      poly(g, [x - 7, y + 4, x + 7, y + 4, x + 5, y + 22, x - 5, y + 22], '#1e1a18');
      g.fillStyle = 'rgba(255,200,120,0.6)';
      g.fillRect(x - 4, y + 7, 8, 12);
      flame(g, x, y + 18, 9, time + it.anim);
      break;
    }
    case 'cage': {
      const top = ceilingAbove(c.level, x, y + 1);
      const sway = Math.sin(time * 0.8 + it.anim) * 0.06;
      g.save();
      g.translate(x, top);
      g.rotate(sway);
      hangChain(g, 0, 0, y - top + 20);
      const cy = y - top + 20;
      g.strokeStyle = '#2c2624';
      g.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(i * 6, cy);
        g.lineTo(i * 7, cy + 40);
        g.stroke();
      }
      g.beginPath();
      g.ellipse(0, cy, 13, 4, 0, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#2c2624';
      g.fillRect(-15, cy + 38, 30, 4);
      // a skeleton slumped inside, and a guttering candle
      circle(g, -3, cy + 14, 4, '#a89f8c');
      limb(g, -3, cy + 18, 2, cy + 34, 2, '#a89f8c');
      g.fillStyle = '#e6d8b8';
      g.fillRect(5, cy + 30, 3, 8);
      flame(g, 6.5, cy + 30, 7, time + it.anim);
      g.restore();
      break;
    }
    case 'statue': {
      g.fillStyle = '#26262a';
      g.fillRect(x - 22, y - 16, 44, 16);
      g.fillStyle = mix('#3b3a3f', '#556', 0.2);
      if (c.scene === 'ogrod') {
        // kneeling moss-covered monk
        g.beginPath();
        g.moveTo(x - 16, y - 16);
        g.quadraticCurveTo(x - 20, y - 50, x - 4, y - 62);
        g.arc(x + 2, y - 66, 10, Math.PI * 0.9, Math.PI * 0.1);
        g.quadraticCurveTo(x + 22, y - 48, x + 18, y - 16);
        g.fill();
        g.fillStyle = 'rgba(70,110,60,0.5)';
        g.fillRect(x - 12, y - 60, 20, 6);
      } else if (c.scene === 'katedra') {
        // a saint holding a bell
        poly(g, [x - 12, y - 16, x - 10, y - 80, x, y - 92, x + 10, y - 80, x + 12, y - 16], '#3a3236');
        circle(g, x, y - 98, 8, '#3a3236');
        g.fillStyle = '#6b4c2a';
        g.beginPath();
        g.moveTo(x + 6, y - 56);
        g.quadraticCurveTo(x + 12, y - 70, x + 18, y - 56);
        g.fill();
      } else {
        // town crier with a broken arm
        poly(g, [x - 10, y - 16, x - 12, y - 70, x + 12, y - 70, x + 10, y - 16], '#38373c');
        circle(g, x, y - 78, 8, '#38373c');
        limb(g, x + 10, y - 64, x + 24, y - 80, 5, '#38373c');
      }
      g.fillStyle = 'rgba(200,200,220,0.08)';
      g.fillRect(x - 12, y - 90, 2, 74);
      break;
    }
    case 'shrine': {
      // stone wayside shrine with a candle niche
      poly(g, [x - 10, y, x - 8, y - 46, x + 8, y - 46, x + 10, y], '#3a3836');
      poly(g, [x - 16, y - 44, x, y - 62, x + 16, y - 44], '#2a2624');
      g.fillStyle = '#0c0a09';
      g.fillRect(x - 5, y - 38, 10, 14);
      g.fillStyle = '#4b4743';
      g.fillRect(x - 12, y - 4, 24, 4);
      // a tiny iron bell on top
      g.fillStyle = '#7a5a30';
      g.beginPath();
      g.moveTo(x - 4, y - 60);
      g.quadraticCurveTo(x, y - 70, x + 4, y - 60);
      g.fill();
      if (it.used) {
        flame(g, x, y - 26, 12, time);
        g.save();
        g.globalCompositeOperation = 'lighter';
        glow(g, x, y - 30, 60, '#ffcf7a', 0.5);
        g.restore();
      } else {
        g.save();
        g.globalCompositeOperation = 'lighter';
        glow(g, x, y - 28, 14, '#ff8a3a', 0.4 + Math.sin(time * 3) * 0.15);
        g.restore();
      }
      break;
    }
    case 'chest': {
      const tint = it.secret ? '#4a3a5a' : '#4a3424';
      poly(g, [x - 14, y, x - 14, y - 16, x + 14, y - 16, x + 14, y], tint);
      g.fillStyle = '#9a7340';
      g.fillRect(x - 14, y - 9, 28, 2);
      g.fillRect(x - 2, y - 12, 4, 6);
      if (it.used) {
        poly(g, [x - 14, y - 16, x - 18, y - 30, x + 10, y - 32, x + 14, y - 16], mix(tint, '#000', 0.3));
      } else {
        poly(g, [x - 15, y - 16, x - 12, y - 24, x + 12, y - 24, x + 15, y - 16], mix(tint, '#fff', 0.1));
        g.save();
        g.globalCompositeOperation = 'lighter';
        glow(g, x, y - 14, 30, it.secret ? '#c9a6ff' : '#ffcf7a', 0.3 + Math.sin(time * 3 + x) * 0.1);
        if (Math.sin(time * 2 + x) > 0.85) star(g, x + 8, y - 22, 4, '#fff6dc', 0.9, time);
        g.restore();
      }
      break;
    }
    case 'lore': {
      // lectern with an open chronicle
      g.fillStyle = '#2e241c';
      g.fillRect(x - 3, y - 30, 6, 30);
      g.fillRect(x - 10, y - 3, 20, 3);
      poly(g, [x - 14, y - 30, x + 14, y - 36, x + 14, y - 30, x - 14, y - 24], '#3a2c20');
      if (!it.used) {
        poly(g, [x - 12, y - 31, x, y - 36, x + 12, y - 38, x + 12, y - 35, x, y - 33, x - 12, y - 28], '#e8dcc0');
        g.save();
        g.globalCompositeOperation = 'lighter';
        glow(g, x, y - 34, 34, '#ffe2a8', 0.45 + Math.sin(time * 2.5) * 0.1);
        g.restore();
      }
      break;
    }
    case 'hint': {
      poly(g, [x - 9, y, x - 8, y - 22, x - 3, y - 27, x + 4, y - 27, x + 9, y - 21, x + 9, y], '#34323a');
      g.save();
      g.globalCompositeOperation = 'lighter';
      // carved rune
      g.strokeStyle = 'rgba(255,214,140,0.85)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, y - 20);
      g.lineTo(x + 5, y - 14);
      g.lineTo(x, y - 8);
      g.lineTo(x - 5, y - 14);
      g.closePath();
      g.moveTo(x - 4, y - 4);
      g.lineTo(x, y - 8);
      g.lineTo(x + 4, y - 4);
      g.stroke();
      glow(g, x, y - 13, 18, '#ffcf7a', 0.35 + Math.sin(time * 3) * 0.1);
      g.restore();
      break;
    }
    case 'event':
      drawEvent(g, it, time);
      break;
    case 'station':
      drawStation(g, it, c);
      break;
    case 'portal': {
      const h = 110;
      g.save();
      g.globalCompositeOperation = 'lighter';
      glow(g, x, y - h / 2, 110, '#cfc6ff', 0.4);
      const grd = g.createLinearGradient(x - 22, 0, x + 22, 0);
      grd.addColorStop(0, 'rgba(160,140,255,0)');
      grd.addColorStop(0.5, 'rgba(230,225,255,0.85)');
      grd.addColorStop(1, 'rgba(160,140,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(x, y - h / 2, 22 + Math.sin(time * 3) * 2, h / 2, 0, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 6; i++) {
        const a = time * 1.5 + i;
        star(g, x + Math.sin(a) * 18, y - ((time * 40 + i * 20) % h), 3, '#ffffff', 0.7, a);
      }
      g.restore();
      break;
    }
  }
}

function drawEvent(g: Ctx, it: Interactable, time: number) {
  const x = it.x;
  const y = it.y;
  if (it.data === 'duch') {
    if (it.used) return;
    g.save();
    g.globalAlpha = 0.55 + Math.sin(time * 2) * 0.15;
    g.globalCompositeOperation = 'lighter';
    glow(g, x, y - 30, 50, '#a8c6ff', 0.5);
    g.fillStyle = 'rgba(180,210,255,0.55)';
    g.beginPath();
    g.moveTo(x - 10, y - 4);
    g.quadraticCurveTo(x - 14, y - 34, x - 2, y - 42);
    g.arc(x + 2, y - 46, 7, Math.PI, 0);
    g.quadraticCurveTo(x + 14, y - 30, x + 10, y - 4 + Math.sin(time * 4) * 3);
    g.closePath();
    g.fill();
    g.restore();
  } else if (it.data === 'oltarz') {
    poly(g, [x - 22, y, x - 20, y - 24, x + 20, y - 24, x + 22, y], '#2f2a2a');
    g.fillStyle = '#5a1414';
    g.fillRect(x - 20, y - 24, 40, 4);
    g.fillStyle = '#6b5a40';
    g.beginPath();
    g.ellipse(x, y - 27, 9, 3, 0, 0, Math.PI * 2);
    g.fill();
    if (!it.used) {
      for (const dx of [-15, 15]) {
        g.fillStyle = '#e6d8b8';
        g.fillRect(x + dx - 1.5, y - 34, 3, 10);
        flame(g, x + dx, y - 34, 7, time + dx);
      }
      g.save();
      g.globalCompositeOperation = 'lighter';
      glow(g, x, y - 30, 40, '#ff5a3a', 0.35);
      g.restore();
    }
  } else {
    // Mumrot's wandering stall
    if (it.used) return;
    g.fillStyle = '#3a2c20';
    g.fillRect(x + 6, y - 10, 26, 10);
    circle(g, x + 10, y - 2, 4, '#1c140e');
    circle(g, x + 28, y - 2, 4, '#1c140e');
    poly(g, [x - 10, y, x - 12, y - 26, x - 4, y - 36, x + 4, y - 28, x + 4, y], '#2a2622');
    circle(g, x - 2, y - 34, 6, '#2a2622');
    circle(g, x + 0.5, y - 33, 1, '#ffcf7a');
    g.fillStyle = '#5a4a30';
    g.beginPath();
    g.ellipse(x + 18, y - 18, 10, 9, 0, 0, Math.PI * 2);
    g.fill();
    flame(g, x - 12, y - 30, 6, time);
  }
}

function drawStation(g: Ctx, it: Interactable, c: PropCtx) {
  const x = it.x;
  const y = it.y;
  const time = c.time;
  switch (it.data) {
    case 'h': {
      // Halszka the bellfounder, beside a small mould
      poly(g, [x - 10, y, x - 9, y - 40, x - 4, y - 48, x + 6, y - 48, x + 10, y - 40, x + 11, y], '#3b3036');
      poly(g, [x - 8, y - 30, x + 9, y - 30, x + 10, y, x - 9, y], '#4a3424');
      circle(g, x + 1, y - 54, 7, '#b8a48c');
      poly(g, [x - 8, y - 52, x - 6, y - 62, x + 8, y - 62, x + 9, y - 52, x + 3, y - 58], '#2e2830');
      limb(g, x + 6, y - 40, x + 18, y - 30, 3.5, '#3b3036');
      g.fillStyle = '#5a4a3a';
      g.beginPath();
      g.moveTo(x + 18, y);
      g.quadraticCurveTo(x + 20, y - 20, x + 26, y - 22);
      g.quadraticCurveTo(x + 32, y - 20, x + 34, y);
      g.fill();
      if (c.halszkaNew) {
        const by = y - 80 + Math.sin(time * 3) * 3;
        g.save();
        g.globalCompositeOperation = 'lighter';
        glow(g, x + 1, by, 18, '#ffcf7a', 0.8);
        star(g, x + 1, by, 6, '#fff6dc', 1, time);
        g.restore();
      }
      break;
    }
    case 'a': {
      // anvil on a stump
      g.fillStyle = '#3a2a1e';
      g.fillRect(x - 10, y - 18, 20, 18);
      poly(g, [x - 18, y - 18, x + 22, y - 18, x + 16, y - 26, x + 30, y - 30, x - 14, y - 30], '#3d3d44');
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(x - 14, y - 30, 40, 1.5);
      // tongs and a glowing ingot
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(255,140,60,0.9)';
      g.fillRect(x - 4, y - 34, 12, 4);
      glow(g, x + 2, y - 32, 26, '#ff8a3a', 0.5 + Math.sin(time * 5) * 0.1);
      g.restore();
      break;
    }
    case 'S': {
      // the great hearth
      poly(g, [x - 30, y, x - 26, y - 22, x + 26, y - 22, x + 30, y], '#2e2622');
      g.fillStyle = '#120c09';
      g.fillRect(x - 20, y - 20, 40, 18);
      flame(g, x - 8, y - 4, 26, time);
      flame(g, x + 8, y - 4, 22, time + 1.3);
      flame(g, x, y - 4, 32, time + 2.1);
      g.save();
      g.globalCompositeOperation = 'lighter';
      glow(g, x, y - 24, 90, '#ff9a4a', 0.5);
      g.restore();
      break;
    }
    case 'm': {
      // Mumrot's stall: crates, a hanging lamp and a huge sack
      g.fillStyle = '#3a2c20';
      g.fillRect(x + 4, y - 18, 22, 18);
      g.fillRect(x + 8, y - 30, 16, 12);
      g.fillStyle = '#5a4a30';
      g.beginPath();
      g.ellipse(x - 18, y - 14, 13, 14, 0, 0, Math.PI * 2);
      g.fill();
      poly(g, [x - 8, y, x - 10, y - 30, x - 2, y - 42, x + 6, y - 32, x + 6, y], '#2a2622');
      circle(g, x - 1, y - 40, 7, '#2a2622');
      circle(g, x + 2, y - 39, 1.2, '#ffcf7a');
      flame(g, x + 16, y - 32, 7, time);
      break;
    }
    case 't': {
      // map table
      g.fillStyle = '#3a2a1e';
      g.fillRect(x - 24, y - 24, 48, 5);
      g.fillRect(x - 20, y - 20, 4, 20);
      g.fillRect(x + 16, y - 20, 4, 20);
      g.fillStyle = '#d9c9a4';
      poly(g, [x - 20, y - 25, x + 18, y - 27, x + 20, y - 24, x - 18, y - 23], '#d9c9a4');
      g.fillStyle = '#7a1a1a';
      circle(g, x - 6, y - 25, 1.5, '#7a1a1a');
      circle(g, x + 4, y - 25.5, 1.5, c.bossDefeated ? '#c9a6ff' : '#7a1a1a');
      g.fillStyle = '#e6d8b8';
      g.fillRect(x + 12, y - 34, 3, 9);
      flame(g, x + 13.5, y - 34, 7, time);
      break;
    }
  }
}

export function drawHazard(g: Ctx, h: Hazard, time: number) {
  switch (h.kind) {
    case 'pendulum': {
      const bx = h.ax + Math.sin(h.angle) * h.len;
      const by = h.ay + Math.cos(h.angle) * h.len;
      g.strokeStyle = '#3a3230';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(h.ax, h.ay);
      g.lineTo(bx, by);
      g.stroke();
      g.save();
      g.translate(bx, by);
      g.rotate(-h.angle);
      g.fillStyle = '#5a5552';
      g.beginPath();
      g.moveTo(-32, -6);
      g.quadraticCurveTo(0, 30, 32, -6);
      g.quadraticCurveTo(0, 12, -32, -6);
      g.fill();
      g.strokeStyle = 'rgba(230,220,200,0.7)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-30, -4);
      g.quadraticCurveTo(0, 28, 30, -4);
      g.stroke();
      g.restore();
      circle(g, h.ax, h.ay, 5, '#2a2422');
      break;
    }
    case 'fire': {
      const k = clamp(Math.min(h.t * 4, (h.life - h.t) * 2), 0, 1);
      for (let i = 0; i < 4; i++) {
        const fx = h.x - h.w / 2 + 6 + (i * (h.w - 12)) / 3;
        flame(g, fx, h.y, (14 + Math.sin(time * 7 + i * 2) * 4) * k, time + i, '#ff7a2a');
      }
      break;
    }
    case 'molten': {
      g.save();
      g.globalCompositeOperation = 'lighter';
      if (h.t < h.warn) {
        const k = h.t / h.warn;
        g.fillStyle = `rgba(255,90,40,${0.15 + k * 0.35 + Math.sin(time * 30) * 0.05})`;
        g.fillRect(h.x - h.w / 2, h.floor - 6, h.w, 6);
        g.fillStyle = `rgba(255,140,60,${0.08 + k * 0.12})`;
        g.fillRect(h.x - 1, h.top, 2, h.floor - h.top);
        glow(g, h.x, h.floor - 4, 30 + k * 20, '#ff5a2a', 0.5);
      } else if (h.t < h.warn + h.life) {
        const grd = g.createLinearGradient(h.x - h.w / 2, 0, h.x + h.w / 2, 0);
        grd.addColorStop(0, 'rgba(255,90,30,0)');
        grd.addColorStop(0.3, 'rgba(255,150,60,0.9)');
        grd.addColorStop(0.5, 'rgba(255,240,200,1)');
        grd.addColorStop(0.7, 'rgba(255,150,60,0.9)');
        grd.addColorStop(1, 'rgba(255,90,30,0)');
        g.fillStyle = grd;
        g.fillRect(h.x - h.w / 2, h.top, h.w, h.floor - h.top);
      } else {
        const k = 1 - (h.t - h.warn - h.life) / 0.4;
        g.fillStyle = `rgba(255,120,50,${0.4 * k})`;
        g.fillRect(h.x - h.w / 4, h.top, h.w / 2, h.floor - h.top);
      }
      g.restore();
      break;
    }
    case 'ring': {
      const k = h.r / h.max;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(255,190,110,${0.75 * (1 - k * 0.6)})`;
      g.lineWidth = h.band;
      g.beginPath();
      g.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = `rgba(255,255,230,${0.6 * (1 - k)})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      g.stroke();
      g.restore();
      break;
    }
    case 'shock': {
      const col = h.team === 'player' ? '#ffd38a' : '#ff6a3a';
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = rgba(col, 0.75);
      g.beginPath();
      g.moveTo(h.x - 22, h.y);
      g.quadraticCurveTo(h.x - h.dir * 4, h.y - 34, h.x + h.dir * 18, h.y);
      g.closePath();
      g.fill();
      glow(g, h.x, h.y - 10, 36, col, 0.5);
      g.restore();
      break;
    }
  }
}

export function drawProjectile(g: Ctx, pr: Projectile, time: number) {
  if (pr.kind === 'moth') {
    drawMoth(g, pr.x, pr.y, 0.9, time + pr.id, 0, pr.reflected ? '#ffd38a' : '#cfe8ff');
    return;
  }
  g.save();
  g.globalCompositeOperation = 'lighter';
  const col = pr.reflected ? '#ffd38a' : pr.kind === 'dust' ? '#c8b8e8' : '#ffb766';
  glow(g, pr.x, pr.y, pr.r * 3, col, 0.6);
  g.restore();
  g.fillStyle = pr.kind === 'dust' ? '#5a5068' : '#2a2220';
  g.beginPath();
  g.arc(pr.x, pr.y, pr.r * 0.75, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = rgba(col, 0.8);
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(pr.x, pr.y, pr.r * 0.9, time * 8, time * 8 + 2);
  g.stroke();
}

export function drawLostAsh(g: Ctx, x: number, y: number, time: number) {
  g.fillStyle = '#5a554f';
  g.beginPath();
  g.ellipse(x, y, 14, 4, 0, Math.PI, 0);
  g.fill();
  flame(g, x, y - 2, 18, time, '#ffd38a');
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, x, y - 16, 50, '#ffd38a', 0.5 + Math.sin(time * 4) * 0.1);
  g.restore();
}

/** Shimmer over secret walls when the Oko Ćmy relic is worn. */
export function drawSecretShimmer(g: Ctx, level: Level, camX: number, viewW: number, time: number) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  const x0 = Math.max(0, Math.floor(camX / T));
  const x1 = Math.min(level.w - 1, Math.ceil((camX + viewW) / T));
  for (let ty = 0; ty < level.h; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (level.tiles[ty * level.w + tx] === 4) {
        const a = 0.12 + Math.sin(time * 3 + tx + ty) * 0.08;
        g.fillStyle = `rgba(200,170,255,${a})`;
        g.fillRect(tx * T, ty * T, T, T);
      }
  g.restore();
}
