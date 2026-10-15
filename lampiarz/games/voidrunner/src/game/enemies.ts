// Regular enemies. Every dangerous attack has a telegraph (wind-up + flash + sound) and contact
// damage only exists while an attack is actually happening.

import { GRAVITY, MAX_FALL, TILE } from '../core/consts';
import type { PlacedEnemy } from '../world/expedition';
import { moveBody, overlap, solidAt, tileAt } from '../world/physics';
import { T_PLATFORM } from '../world/tiles';
import type { Game } from './game';
import type { Enemy } from './types';

export const ENEMY_NAMES = {
  drone: 'Dron serwisowy',
  hunter: 'Łowca',
  turret: 'Wieżyczka',
  stalker: 'Prześladowca',
  void: 'Istota Pustki',
  larva: 'Larwa',
  shield: 'Tarczownik',
  boss: '',
} as const;

const DIMS: Record<string, [number, number, number, number]> = {
  // w, h, hp, eliteHp
  drone: [14, 12, 22, 55],
  hunter: [14, 20, 34, 85],
  turret: [14, 12, 30, 70],
  stalker: [14, 22, 48, 115],
  void: [16, 16, 40, 95],
  larva: [10, 8, 12, 12],
  shield: [16, 22, 60, 140],
};

export function makeEnemy(g: Game, type: Enemy['type'], x: number, y: number, elite: boolean): Enemy {
  const [w, h, hp, ehp] = DIMS[type] ?? [14, 14, 30, 60];
  const scale = 1 + g.run.area * 0.18;
  const max = Math.round((elite ? ehp : hp) * scale);
  return {
    id: g.id(),
    type,
    elite,
    x,
    y,
    w,
    h,
    vx: 0,
    vy: 0,
    onGround: false,
    hitWall: 0,
    hitCeiling: false,
    hp: max,
    maxHp: max,
    facing: -1,
    state: 'idle',
    stateT: Math.random(),
    cd: 0.6 + Math.random() * 0.8,
    flash: 0,
    stun: 0,
    dead: false,
    deathT: 0,
    homeX: x,
    homeY: y,
    phase: 0,
    seed: Math.random() * 100,
    hurtful: 0,
    n: 0,
    m: 0,
  };
}

export function spawnEnemy(g: Game, pe: PlacedEnemy): Enemy {
  const [w, h] = DIMS[pe.type];
  const air = pe.type === 'drone' || pe.type === 'void';
  const x = pe.x * TILE + (TILE - w) / 2;
  let y = (pe.y + 1) * TILE - h;
  if (air) y = pe.y * TILE + (TILE - h) / 2;
  if (pe.type === 'turret' && pe.ceiling) y = pe.y * TILE;
  const e = makeEnemy(g, pe.type, x, y, pe.elite);
  e.ceiling = pe.ceiling;
  if (pe.type === 'shield') e.guard = true;
  return e;
}

const dmgScale = (g: Game, e: Enemy) => (e.elite ? 1.3 : 1) * (1 + g.run.area * 0.08);

function setState(e: Enemy, s: string) {
  e.state = s;
  e.stateT = 0;
}

/** Ground creatures do not walk off ledges or into hazards on purpose. */
function safeAhead(g: Game, e: Enemy, dir: number) {
  const fx = dir > 0 ? e.x + e.w + 2 : e.x - 2;
  const tx = Math.floor(fx / TILE);
  const below = Math.floor((e.y + e.h + 2) / TILE);
  const t = tileAt(g.grid, tx, below);
  const wall = solidAt(g.grid, tx, Math.floor((e.y + e.h - 4) / TILE));
  return !wall && (t === 1 || t === 4 || t === T_PLATFORM);
}

function groundPhysics(g: Game, e: Enemy, dt: number) {
  e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
  moveBody(e, dt, g.grid);
  if (e.onGround) e.vx *= Math.pow(0.0001, dt * (e.stun > 0 ? 0.6 : 0.25));
}

export function updateEnemy(g: Game, e: Enemy, dt: number) {
  e.stateT += dt;
  e.flash = Math.max(0, e.flash - dt);
  e.hurtful = Math.max(0, e.hurtful - dt);
  e.cd = Math.max(0, e.cd - dt);
  const p = g.player;
  const pc = g.playerCenter();
  const ex = e.x + e.w / 2;
  const ey = e.y + e.h / 2;
  if (e.stun > 0) {
    e.stun -= dt;
    if (e.type === 'drone' || e.type === 'void') {
      e.vx *= 1 - dt * 4;
      e.vy *= 1 - dt * 4;
      moveBody(e, dt, g.grid);
    } else if (e.type !== 'turret') groundPhysics(g, e, dt);
    if (e.state === 'windup' || e.state === 'tell' || e.state === 'cast') setState(e, e.type === 'stalker' ? 'rest' : 'recover');
    return;
  }
  switch (e.type) {
    case 'drone':
      drone(g, e, dt, pc, ex, ey);
      break;
    case 'hunter':
    case 'larva':
      hunter(g, e, dt, pc, ex, ey);
      break;
    case 'turret':
      turret(g, e, dt, pc, ex, ey);
      break;
    case 'stalker':
      stalker(g, e, dt, pc, ex, ey);
      break;
    case 'void':
      voidCreature(g, e, dt, pc, ex, ey);
      break;
    case 'shield':
      shieldBearer(g, e, dt, pc, ex, ey);
      break;
  }
  // contact damage only during real attacks
  if (e.hurtful > 0 && !p.dead && overlap(e, { x: p.x + 1, y: p.y + 2, w: p.w - 2, h: p.h - 2 })) {
    const base = e.type === 'stalker' ? 18 : e.type === 'shield' ? 16 : e.type === 'drone' ? 12 : e.type === 'larva' ? 8 : 12;
    g.damagePlayer(base * dmgScale(g, e), ex, false, { kind: 'melee', enemy: e });
  }
}

type V = { x: number; y: number };

function drone(g: Game, e: Enemy, dt: number, pc: V, ex: number, ey: number) {
  const sees = g.sees(e, 200);
  switch (e.state) {
    case 'idle':
    case 'chase': {
      const tx = sees ? pc.x + (ex < pc.x ? -54 : 54) : e.homeX + Math.sin(g.time * 0.7 + e.seed) * 20;
      const ty = sees ? pc.y - 42 : e.homeY + Math.sin(g.time * 1.3 + e.seed) * 6;
      e.vx += Math.sign(tx - ex) * Math.min(Math.abs(tx - ex), 220 * dt);
      e.vy += Math.sign(ty - ey) * Math.min(Math.abs(ty - ey), 220 * dt);
      e.vx = Math.max(-75, Math.min(75, e.vx));
      e.vy = Math.max(-60, Math.min(60, e.vy));
      e.facing = pc.x < ex ? -1 : 1;
      if (sees && e.cd <= 0 && Math.hypot(pc.x - ex, pc.y - ey) < 130) {
        setState(e, 'windup');
        g.audio.play('telegraph');
      }
      break;
    }
    case 'windup':
      e.vx *= 0.85;
      e.vy *= 0.85;
      e.aimX = pc.x;
      e.aimY = pc.y;
      if (e.stateT > (e.elite ? 0.42 : 0.55)) {
        const d = Math.hypot(e.aimX - ex, e.aimY - ey) || 1;
        e.vx = ((e.aimX - ex) / d) * 235;
        e.vy = ((e.aimY - ey) / d) * 235;
        setState(e, 'swoop');
      }
      break;
    case 'swoop':
      e.hurtful = 0.05;
      if (e.stateT > 0.45 || e.hitWall || e.hitCeiling) {
        setState(e, 'recover');
        if (e.elite) {
          for (const a of [-0.3, 0, 0.3]) {
            const base = Math.atan2(pc.y - ey, pc.x - ex) + a;
            g.addProjectile({ x: ex, y: ey, vx: Math.cos(base) * 150, vy: Math.sin(base) * 150, r: 3, dmg: 9 * dmgScale(g, e), owner: 'enemy', kind: 'bolt', life: 2, pierce: false, gravity: 0 });
          }
          g.audio.play('enemyShot');
        }
      }
      break;
    case 'recover':
      e.vx *= 0.9;
      e.vy = e.vy * 0.9 - 30 * dt;
      if (e.stateT > 0.7) {
        e.cd = 1.4 + Math.random();
        setState(e, 'chase');
      }
      break;
  }
  moveBody(e, dt, g.grid);
}

function hunter(g: Game, e: Enemy, dt: number, pc: V, ex: number, ey: number) {
  const larva = e.type === 'larva';
  const sees = g.sees(e, larva ? 400 : 190);
  const speed = larva ? 55 : e.elite ? 112 : 88;
  switch (e.state) {
    case 'idle':
    case 'patrol': {
      if (sees) {
        setState(e, 'chase');
        break;
      }
      const dir = e.facing;
      if (!safeAhead(g, e, dir) || Math.abs(e.x - e.homeX) > 48 || e.hitWall) e.facing = -e.facing as 1 | -1;
      e.vx = e.facing * 30;
      break;
    }
    case 'chase': {
      e.facing = pc.x < ex ? -1 : 1;
      const dx = Math.abs(pc.x - ex);
      if (!sees && e.stateT > 2) {
        setState(e, 'patrol');
        break;
      }
      if (larva) {
        e.hurtful = 0.05;
        if (safeAhead(g, e, e.facing)) e.vx = e.facing * speed;
        else e.vx = 0;
        break;
      }
      if (dx < 26 && Math.abs(pc.y - ey) < 26 && e.cd <= 0) {
        setState(e, 'windup');
        e.vx = 0;
        g.audio.play('telegraph');
        break;
      }
      if (dx > 18 && safeAhead(g, e, e.facing)) e.vx = e.facing * speed;
      else e.vx *= 0.8;
      if (e.hitWall && e.onGround && pc.y < ey - 10) e.vy = -330;
      break;
    }
    case 'windup':
      e.vx = 0;
      if (e.stateT > (e.elite ? 0.3 : 0.38)) {
        setState(e, 'slash');
        e.vx = e.facing * 120;
        g.audio.play('swing');
      }
      break;
    case 'slash': {
      const box = { x: e.facing > 0 ? e.x + e.w - 2 : e.x - 22, y: e.y + 2, w: 24, h: e.h - 2 };
      const p = g.player;
      if (e.stateT > 0.04 && e.stateT < 0.16 && !e.n && overlap(box, p)) {
        e.n = 1;
        g.damagePlayer(14 * dmgScale(g, e), ex, false, { kind: 'melee', enemy: e });
      }
      if (e.stateT > 0.22) {
        e.n = 0;
        if (e.elite && !e.m) {
          e.m = 1;
          e.facing = pc.x < ex ? -1 : 1;
          setState(e, 'windup');
          e.stateT = 0.12;
        } else {
          e.m = 0;
          e.cd = 0.7 + Math.random() * 0.4;
          setState(e, 'recover');
        }
      }
      break;
    }
    case 'recover':
      e.vx *= 0.85;
      if (e.stateT > 0.5) setState(e, 'chase');
      break;
  }
  groundPhysics(g, e, dt);
}

function turret(g: Game, e: Enemy, dt: number, pc: V, ex: number, ey: number) {
  const sees = g.sees(e, 270);
  switch (e.state) {
    case 'idle':
      if (sees && e.cd <= 0) {
        setState(e, 'charge');
        g.audio.play('telegraph');
      }
      break;
    case 'charge':
      if (e.stateT < 0.55) {
        e.aimX = pc.x;
        e.aimY = pc.y;
      }
      if (e.stateT > 0.75) {
        const base = Math.atan2((e.aimY ?? pc.y) - ey, (e.aimX ?? pc.x) - ex);
        const spread = e.elite ? [-0.22, 0, 0.22] : [0];
        for (const a of spread) g.addProjectile({ x: ex, y: ey, vx: Math.cos(base + a) * 175, vy: Math.sin(base + a) * 175, r: 3, dmg: 10 * dmgScale(g, e), owner: 'enemy', kind: 'bolt', life: 2.4, pierce: false, gravity: 0 });
        g.audio.play('enemyShot');
        e.cd = e.elite ? 1.2 : 1.6;
        setState(e, 'idle');
      }
      break;
  }
  e.facing = pc.x < ex ? -1 : 1;
  e.vx = 0;
}

function stalker(g: Game, e: Enemy, dt: number, pc: V, ex: number, ey: number) {
  const sees = g.sees(e, 230);
  switch (e.state) {
    case 'idle':
    case 'lurk':
      e.state = 'lurk';
      if (sees) {
        e.facing = pc.x < ex ? -1 : 1;
        if (safeAhead(g, e, e.facing) && Math.abs(pc.x - ex) > 60) e.vx = e.facing * 40;
        else e.vx *= 0.8;
        if (Math.abs(pc.x - ex) < 115 && Math.abs(pc.y - ey) < 40 && e.cd <= 0) {
          setState(e, 'tell');
          e.vx = 0;
          g.audio.play('telegraph');
        }
      } else e.vx *= 0.8;
      break;
    case 'tell':
      e.vx = 0;
      e.facing = pc.x < ex ? -1 : 1;
      if (e.stateT > (e.elite ? 0.42 : 0.55)) {
        setState(e, 'lunge');
        g.audio.play('dash');
      }
      break;
    case 'lunge':
      e.hurtful = 0.05;
      e.vx = e.facing * 310;
      if (!safeAhead(g, e, e.facing) && e.onGround) e.vx = 0;
      if (e.stateT > 0.3 || e.hitWall) {
        if (e.elite && !e.m) {
          e.m = 1;
          setState(e, 'tell');
          e.stateT = 0.25;
        } else {
          e.m = 0;
          setState(e, 'rest');
        }
      }
      break;
    case 'rest':
      e.vx *= 0.8;
      if (e.stateT > 0.75) {
        e.cd = 0.6;
        setState(e, 'lurk');
      }
      break;
  }
  groundPhysics(g, e, dt);
}

function voidCreature(g: Game, e: Enemy, dt: number, pc: V, ex: number, ey: number) {
  const sees = g.sees(e, 240);
  switch (e.state) {
    case 'idle':
    case 'drift': {
      e.state = 'drift';
      const tx = sees ? pc.x + Math.sin(g.time * 0.9 + e.seed) * 70 : e.homeX;
      const ty = (sees ? pc.y - 36 : e.homeY) + Math.sin(g.time * 2.1 + e.seed) * 14;
      e.vx += (tx - ex) * dt * 1.4;
      e.vy += (ty - ey) * dt * 1.4;
      e.vx *= 1 - dt * 1.8;
      e.vy *= 1 - dt * 1.8;
      e.facing = pc.x < ex ? -1 : 1;
      if (sees && e.cd <= 0) {
        if (Math.random() < 0.45) setState(e, 'blinkOut');
        else {
          setState(e, 'cast');
          g.audio.play('telegraph');
        }
      }
      break;
    }
    case 'blinkOut':
      e.vx *= 0.8;
      e.vy *= 0.8;
      if (e.stateT > 0.35) {
        // reappear somewhere around the player — the glow at the destination is the warning
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = 70 + Math.random() * 40;
          const nx = pc.x + Math.cos(a) * d - e.w / 2;
          const ny = pc.y - Math.abs(Math.sin(a)) * d * 0.7 - e.h / 2;
          const cx = Math.floor((nx + e.w / 2) / TILE);
          const cy = Math.floor((ny + e.h / 2) / TILE);
          if (cx < 1 || cy < 1 || cx >= g.grid.w - 1 || cy >= g.grid.h - 1) continue;
          if (solidAt(g.grid, cx, cy) || solidAt(g.grid, Math.floor(nx / TILE), Math.floor(ny / TILE)) || solidAt(g.grid, Math.floor((nx + e.w) / TILE), Math.floor((ny + e.h) / TILE))) continue;
          e.x = nx;
          e.y = ny;
          break;
        }
        setState(e, 'blinkIn');
        g.audio.play('telegraph');
      }
      break;
    case 'blinkIn':
      e.vx = 0;
      e.vy = 0;
      if (e.stateT > 0.45) setState(e, 'cast');
      break;
    case 'cast':
      e.vx *= 0.9;
      e.vy *= 0.9;
      if (e.stateT > 0.5) {
        const base = Math.atan2(pc.y - ey, pc.x - ex);
        g.addProjectile({ x: ex, y: ey, vx: Math.cos(base) * 115, vy: Math.sin(base) * 115, r: 5, dmg: 12 * dmgScale(g, e), owner: 'enemy', kind: 'orb', life: 3.2, pierce: false, gravity: 0, homing: 1.1 });
        if (e.elite)
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            g.addProjectile({ x: ex, y: ey, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, r: 4, dmg: 9 * dmgScale(g, e), owner: 'enemy', kind: 'orb', life: 2.2, pierce: false, gravity: 0 });
          }
        g.audio.play('enemyShot');
        e.cd = 2.2 + Math.random();
        setState(e, 'drift');
      }
      break;
  }
  moveBody(e, dt, g.grid);
}

/** Tarczownik: walks behind a shield that blocks light hits from the front. It turns slowly —
 * dash past it, hit it from behind, or break the guard with a charged / heavy / special attack. */
function shieldBearer(g: Game, e: Enemy, dt: number, pc: V, ex: number, ey: number) {
  const sees = g.sees(e, 210);
  switch (e.state) {
    case 'idle':
    case 'guard': {
      e.state = 'guard';
      e.guard = true;
      // slow turning: only re-faces the player every so often
      e.n += dt;
      if (e.n > (e.elite ? 0.45 : 0.7)) {
        e.n = 0;
        e.facing = pc.x < ex ? -1 : 1;
      }
      if (sees) {
        const towards = Math.sign(pc.x - ex) === e.facing;
        if (towards && Math.abs(pc.x - ex) > 22 && safeAhead(g, e, e.facing)) e.vx = e.facing * (e.elite ? 42 : 32);
        else e.vx *= 0.8;
        if (towards && Math.abs(pc.x - ex) < 36 && Math.abs(pc.y - ey) < 26 && e.cd <= 0) {
          setState(e, 'bashTell');
          e.vx = 0;
          g.audio.play('telegraph');
        }
      } else e.vx *= 0.8;
      break;
    }
    case 'bashTell':
      e.vx = 0;
      if (e.stateT > (e.elite ? 0.4 : 0.5)) {
        setState(e, 'bash');
        g.audio.play('swingHeavy');
      }
      break;
    case 'bash':
      e.hurtful = 0.05;
      e.vx = e.facing * 230;
      if (!safeAhead(g, e, e.facing)) e.vx = 0;
      if (e.stateT > 0.2 || e.hitWall) {
        setState(e, 'recover');
        e.guard = false; // shield lowered after the bash: the opening
      }
      break;
    case 'recover':
      e.vx *= 0.8;
      if (e.stateT > 0.85) {
        e.cd = 1.2;
        e.guard = true;
        setState(e, 'guard');
      }
      break;
  }
  groundPhysics(g, e, dt);
}
