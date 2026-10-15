// Three bosses. Every pattern is telegraphed; the attack set grows with each phase.

import { GRAVITY, MAX_FALL, TILE } from '../core/consts';
import type { BossType } from '../world/areas';
import { moveBody } from '../world/physics';
import { makeEnemy } from './enemies';
import type { Game } from './game';
import type { Enemy } from './types';

const SPEC: Record<BossType, { w: number; h: number; hp: number }> = {
  matka: { w: 46, h: 34, hp: 620 },
  straznik: { w: 40, h: 40, hp: 950 },
  serce: { w: 56, h: 56, hp: 1350 },
};

export function spawnBoss(g: Game, kind: BossType, x: number, footY: number): Enemy {
  const s = SPEC[kind];
  const e = makeEnemy(g, 'larva', x - s.w / 2, footY - s.h, false);
  e.type = 'boss';
  e.boss = kind;
  e.w = s.w;
  e.h = s.h;
  e.hp = e.maxHp = s.hp;
  e.state = 'idle';
  e.cd = 1.2;
  e.phase = 1;
  if (kind !== 'matka') {
    e.y = 3 * TILE;
    e.homeY = e.y;
    e.x = (g.grid.w * TILE) / 2 - s.w / 2;
    e.homeX = e.x;
  }
  return e;
}

const floorY = (g: Game) => (g.grid.h - 2) * TILE;

function setState(e: Enemy, s: string) {
  e.state = s;
  e.stateT = 0;
}

export function updateBoss(g: Game, e: Enemy, dt: number) {
  e.stateT += dt;
  e.flash = Math.max(0, e.flash - dt);
  e.hurtful = Math.max(0, e.hurtful - dt);
  e.cd = Math.max(0, e.cd - dt);
  const frac = e.hp / e.maxHp;
  const newPhase = e.boss === 'straznik' || e.boss === 'serce' ? (frac > 0.62 ? 1 : frac > 0.3 ? 2 : 3) : frac > 0.5 ? 1 : 2;
  if (newPhase > e.phase) {
    e.phase = newPhase;
    g.audio.play('bossRoar');
    g.shake = 10;
    g.ring(e.x + e.w / 2, e.y + e.h / 2, '#ff4a5a', 60);
    g.events.push({ type: 'toast', text: 'Strażnik wpada w szał!', color: '#ff4a5a' });
    setState(e, e.boss === 'matka' ? 'idle' : 'hover');
    e.cd = 0.8;
  }
  if (e.boss === 'matka') matka(g, e, dt);
  else if (e.boss === 'straznik') straznik(g, e, dt);
  else serce(g, e, dt);
  const p = g.player;
  if (e.hurtful > 0 && !p.dead && p.x < e.x + e.w - 4 && p.x + p.w > e.x + 4 && p.y < e.y + e.h - 2 && p.y + p.h > e.y + 4) g.damagePlayer(e.boss === 'matka' ? 22 : 20, e.x + e.w / 2);
}

// ------------------------------------------------------------------ Matka Roju
function matka(g: Game, e: Enemy, dt: number) {
  const pc = g.playerCenter();
  const ex = e.x + e.w / 2;
  const fast = e.phase >= 2 ? 0.75 : 1;
  switch (e.state) {
    case 'idle': {
      e.facing = pc.x < ex ? -1 : 1;
      if (e.onGround) e.vx = e.facing * 38;
      if (e.cd <= 0) {
        const larvae = g.enemies.filter((o) => o.type === 'larva' && !o.dead).length;
        const r = Math.random();
        if (r < 0.2 && larvae < 3) setState(e, 'spawn');
        else if (r < 0.6) setState(e, 'spitTell');
        else setState(e, 'leapTell');
        g.audio.play('telegraph');
      }
      break;
    }
    case 'spitTell':
      e.vx *= 0.8;
      if (e.stateT > 0.65 * fast) {
        const n = e.phase >= 2 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const tx = pc.x + (i - (n - 1) / 2) * 34;
          const t = 0.9 + Math.random() * 0.2;
          const sx = ex + e.facing * 12;
          const sy = e.y + 8;
          g.addProjectile({ x: sx, y: sy, vx: (tx - sx) / t, vy: (floorY(g) - sy) / t - (GRAVITY * 0.55 * t) / 2, r: 5, dmg: 14, owner: 'enemy', kind: 'acid', life: 3, pierce: false, gravity: GRAVITY * 0.55 });
        }
        g.audio.play('enemyShot');
        setState(e, 'rest');
      }
      break;
    case 'leapTell':
      e.vx *= 0.7;
      if (e.stateT > 0.7 * fast) {
        const t = 0.85;
        e.vy = -520;
        e.vx = Math.max(-280, Math.min(280, (pc.x - ex) / t));
        e.onGround = false;
        setState(e, 'leap');
        g.audio.play('jump');
      }
      break;
    case 'leap':
      e.hurtful = 0.05;
      if (e.onGround && e.stateT > 0.15) {
        g.shake = 9;
        g.audio.play('hitHeavy');
        for (const d of [-1, 1])
          g.hazards.push({ kind: 'shockwave', x: ex + d * 10 - 8, y: floorY(g) - 12, w: 16, h: 12, t: 0, warn: 0, active: 1.6, dmg: 14, vx: d * 210 });
        g.burst(ex, floorY(g), 20, '#7dff4a', 'debris', 200);
        if (e.phase >= 2 && !e.m) {
          e.m = 1;
          setState(e, 'leapTell');
          e.stateT = 0.3;
        } else {
          e.m = 0;
          setState(e, 'rest');
        }
      }
      break;
    case 'spawn':
      e.vx *= 0.8;
      if (e.stateT > 0.8) {
        for (const d of [-1, 1]) {
          const l = makeEnemy(g, 'larva', ex + d * 26, e.y + e.h - 8, false);
          l.state = 'chase';
          l.vx = d * 120;
          l.vy = -200;
          g.enemies.push(l);
        }
        g.audio.play('enemyDie');
        setState(e, 'rest');
      }
      break;
    case 'rest':
      e.vx *= 0.85;
      if (e.stateT > 0.9 * fast) {
        e.cd = 0.7 * fast;
        setState(e, 'idle');
      }
      break;
  }
  e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
  moveBody(e, dt, g.grid);
}

// ------------------------------------------------------------------ Strażnik Rdzenia
function straznik(g: Game, e: Enemy, dt: number) {
  const pc = g.playerCenter();
  const ex = e.x + e.w / 2;
  const ey = e.y + e.h / 2;
  const speedK = e.phase === 3 ? 0.7 : e.phase === 2 ? 0.85 : 1;
  switch (e.state) {
    case 'idle':
    case 'hover': {
      e.state = 'hover';
      const tx = pc.x + Math.sin(g.time * 0.6) * 90;
      const ty = e.homeY + Math.sin(g.time * 1.4) * 10;
      e.vx += (tx - ex) * dt * 1.2;
      e.vy += (ty - ey) * dt * 2;
      e.vx *= 1 - dt * 1.6;
      e.vy *= 1 - dt * 2;
      e.vx = Math.max(-140, Math.min(140, e.vx));
      if (e.cd <= 0) {
        const r = Math.random();
        if (r < 0.42) {
          setState(e, 'laser');
          beam(g, e, 0);
          if (e.phase >= 2) beam(g, e, e.phase === 3 ? 0.5 : 0.9);
        } else if (r < 0.75) {
          setState(e, 'orbTell');
          g.audio.play('telegraph');
        } else {
          setState(e, 'dashMove');
        }
      }
      break;
    }
    case 'laser':
      e.vx *= 0.9;
      e.vy *= 0.9;
      if (e.stateT > 1.9) {
        e.cd = 1.1 * speedK;
        setState(e, 'hover');
      }
      break;
    case 'orbTell':
      e.vx *= 0.9;
      e.vy *= 0.9;
      if (e.stateT > 0.6 * speedK) {
        const n = e.phase === 1 ? 10 : 14;
        const off = Math.random();
        for (let i = 0; i < n; i++) {
          const a = ((i + off) / n) * Math.PI * 2;
          g.addProjectile({ x: ex, y: ey, vx: Math.cos(a) * 105, vy: Math.sin(a) * 105, r: 5, dmg: 13, owner: 'enemy', kind: 'orb', life: 4, pierce: false, gravity: 0 });
        }
        g.audio.play('enemyShot');
        if (e.phase === 3 && !e.m) {
          e.m = 1;
          setState(e, 'orbTell');
          e.stateT = 0.2;
        } else {
          e.m = 0;
          e.cd = 1.2 * speedK;
          setState(e, 'hover');
        }
      }
      break;
    case 'dashMove': {
      // drop to the player's height on one side of the arena, then charge across
      const side = pc.x < (g.grid.w * TILE) / 2 ? 1 : -1;
      e.n = side;
      const tx = side > 0 ? g.grid.w * TILE - 3 * TILE - e.w / 2 : 3 * TILE + e.w / 2;
      const ty = Math.min(floorY(g) - e.h / 2 - 2, pc.y);
      e.vx = (tx - ex) * 4;
      e.vy = (ty - ey) * 4;
      if (e.stateT > 0.55) {
        setState(e, 'dashTell');
        g.audio.play('telegraph');
      }
      break;
    }
    case 'dashTell':
      e.vx = 0;
      e.vy = 0;
      if (e.stateT > 0.75 * speedK) {
        setState(e, 'dash');
        g.audio.play('dash');
      }
      break;
    case 'dash':
      e.hurtful = 0.05;
      e.vx = -e.n * 340;
      e.vy = 0;
      if (e.hitWall || e.stateT > 1.6) {
        g.shake = 8;
        g.audio.play('hitHeavy');
        e.cd = 0.9 * speedK;
        setState(e, 'rise');
      }
      break;
    case 'rise':
      e.vx *= 0.9;
      e.vy = (e.homeY - e.y) * 3;
      if (e.stateT > 0.8) setState(e, 'hover');
      break;
  }
  moveBody(e, dt, g.grid, true);
}

/** A tracking laser: follows the player during the telegraph, locks, then fires. */
function beam(g: Game, e: Enemy, delay: number) {
  const pc = g.playerCenter();
  g.hazards.push({
    kind: 'beam',
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    w: 10,
    h: 0,
    t: -delay,
    warn: 1.25,
    active: 0.45,
    dmg: 24,
    angle: Math.atan2(pc.y - (e.y + e.h / 2), pc.x - (e.x + e.w / 2)) + (delay ? 0.5 : 0),
    len: 560,
    owner: e.id,
  });
  g.audio.play('laser');
}

/** Called by the game each step: lasers follow their owner and track during the first part of the telegraph. */
export function trackBeams(g: Game, dt: number) {
  for (const h of g.hazards) {
    if (h.kind !== 'beam' || h.owner === undefined) continue;
    const o = g.enemies.find((e) => e.id === h.owner);
    if (!o || o.dead) {
      h.t = 1e9;
      continue;
    }
    h.x = o.x + o.w / 2;
    h.y = o.y + o.h / 2;
    if (h.t < h.warn - 0.3) {
      const pc = g.playerCenter();
      const target = Math.atan2(pc.y - h.y, pc.x - h.x);
      let d = target - (h.angle ?? 0);
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      h.angle = (h.angle ?? 0) + d * Math.min(1, dt * 4);
    }
  }
}

// ------------------------------------------------------------------ Serce Pustki
function serce(g: Game, e: Enemy, dt: number) {
  const pc = g.playerCenter();
  const ex = e.x + e.w / 2;
  const ey = e.y + e.h / 2;
  const W = g.grid.w * TILE;
  const k = e.phase === 3 ? 0.7 : e.phase === 2 ? 0.85 : 1;
  // slow drift above the arena, sinking a little so it can be reached from the platforms
  const tx = W / 2 + Math.sin(g.time * 0.35) * (W * 0.28);
  const ty = 5 * TILE + Math.sin(g.time * 0.9) * 10 + (e.state === 'tired' ? 2.5 * TILE : 0);
  e.vx = (tx - ex) * 1.2;
  e.vy = (ty - ey) * 2;
  switch (e.state) {
    case 'idle':
    case 'hover':
      e.state = 'hover';
      if (e.cd <= 0) {
        const opts = ['tentacles', 'sweep', 'orbs'];
        if (e.phase >= 2) opts.push('summon');
        const pick = opts[Math.floor(Math.random() * opts.length)];
        const voids = g.enemies.filter((o) => o.type === 'void' && !o.dead).length;
        setState(e, pick === 'summon' && voids >= 2 ? 'orbs' : pick);
        g.audio.play('telegraph');
      }
      break;
    case 'tentacles':
      if (e.stateT < dt * 1.5) {
        const n = e.phase === 3 ? 5 : e.phase === 2 ? 4 : 3;
        const xs = [pc.x];
        for (let i = 1; i < n; i++) xs.push(TILE * 3 + Math.random() * (W - TILE * 6));
        for (const x of xs) g.hazards.push({ kind: 'spikes', x: x - 10, y: floorY(g) - 44, w: 20, h: 44, t: 0, warn: 0.85 * k, active: 0.45, dmg: 20 });
        if (e.phase === 3) sweep(g, Math.random() < 0.5, 0.6);
      }
      if (e.stateT > 1.5 * k) end(e, 1.0 * k);
      break;
    case 'sweep':
      if (e.stateT < dt * 1.5) {
        sweep(g, Math.random() < 0.55, 0);
        if (e.phase >= 2) sweep(g, Math.random() < 0.5, 1.3 * k);
      }
      if (e.stateT > (e.phase >= 2 ? 2.8 : 1.8) * k) end(e, 1.0 * k);
      break;
    case 'orbs':
      if (e.stateT > 0.55 * k && !e.m) {
        e.m = 1;
        const n = e.phase === 3 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const a = Math.atan2(pc.y - ey, pc.x - ex) + (i - (n - 1) / 2) * 0.45;
          g.addProjectile({ x: ex, y: ey, vx: Math.cos(a) * 100, vy: Math.sin(a) * 100, r: 6, dmg: 15, owner: 'enemy', kind: 'orb', life: 4, pierce: false, gravity: 0, homing: 0.8 });
        }
        g.audio.play('enemyShot');
      }
      if (e.stateT > 1.2 * k) {
        e.m = 0;
        // after a volley the heart sags down for a moment: the opening to hit it hard
        setState(e, Math.random() < 0.5 ? 'tired' : 'hover');
        e.cd = 1.0 * k;
      }
      break;
    case 'summon':
      if (e.stateT > 0.8 && !e.m) {
        e.m = 1;
        for (const d of [-1, 1]) {
          const v = makeEnemy(g, 'void', ex + d * 60, ey + 10, false);
          v.homeX = v.x;
          v.homeY = v.y;
          v.cd = 1.5;
          g.enemies.push(v);
        }
        g.audio.play('bossRoar');
      }
      if (e.stateT > 1.4) {
        e.m = 0;
        end(e, 1.1 * k);
      }
      break;
    case 'tired':
      if (e.stateT > 2.2) end(e, 0.8 * k);
      break;
  }
  e.x += e.vx * dt;
  e.y += e.vy * dt;
}

function end(e: Enemy, cd: number) {
  e.cd = cd;
  setState(e, 'hover');
}

/** A horizontal beam: low (jump over it) or high (stay on the ground). */
function sweep(g: Game, low: boolean, delay: number) {
  const fy = floorY(g);
  const y = low ? fy - 14 : fy - 64;
  g.hazards.push({ kind: 'hline', x: TILE, y, w: (g.grid.w - 2) * TILE, h: low ? 12 : 36, t: -delay, warn: 1.05, active: 0.4, dmg: 22 });
}
