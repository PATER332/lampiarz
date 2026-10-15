// Axis-separated AABB movement against the tile grid, with one-way platforms.

import { TILE } from '../core/consts';
import type { RoomGrid } from './tiles';
import { T_HAZARD, T_PLATFORM, isSolid } from './tiles';

export interface Body {
  x: number; // top-left, pixels
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  hitWall: -1 | 0 | 1;
  hitCeiling: boolean;
}

export const tileAt = (g: RoomGrid, tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h ? 1 : g.tiles[ty * g.w + tx]);
export const solidAt = (g: RoomGrid, tx: number, ty: number) => isSolid(tileAt(g, tx, ty));

/** Moves a body by its velocity; `dropThrough` lets it fall through one-way platforms. */
export function moveBody(b: Body, dt: number, g: RoomGrid, dropThrough = false) {
  b.hitWall = 0;
  b.hitCeiling = false;
  // --- horizontal
  let dx = b.vx * dt;
  const stepX = Math.sign(dx);
  while (dx !== 0) {
    const d = Math.abs(dx) > 4 ? 4 * stepX : dx;
    const nx = b.x + d;
    const y0 = Math.floor(b.y / TILE);
    const y1 = Math.floor((b.y + b.h - 0.01) / TILE);
    const edge = d > 0 ? Math.floor((nx + b.w - 0.01) / TILE) : Math.floor(nx / TILE);
    let blocked = false;
    for (let ty = y0; ty <= y1; ty++) if (solidAt(g, edge, ty)) blocked = true;
    if (blocked) {
      b.x = d > 0 ? edge * TILE - b.w : (edge + 1) * TILE;
      b.vx = 0;
      b.hitWall = d > 0 ? 1 : -1;
      break;
    }
    b.x = nx;
    dx -= d;
  }
  // --- vertical
  const wasBottom = b.y + b.h;
  let dy = b.vy * dt;
  b.onGround = false;
  const stepY = Math.sign(dy);
  while (dy !== 0) {
    const d = Math.abs(dy) > 4 ? 4 * stepY : dy;
    const ny = b.y + d;
    const x0 = Math.floor(b.x / TILE);
    const x1 = Math.floor((b.x + b.w - 0.01) / TILE);
    if (d > 0) {
      const edge = Math.floor((ny + b.h - 0.01) / TILE);
      let land = false;
      for (let tx = x0; tx <= x1; tx++) {
        const t = tileAt(g, tx, edge);
        if (isSolid(t)) land = true;
        else if (t === T_PLATFORM && !dropThrough && wasBottom <= edge * TILE + 0.5) land = true;
      }
      if (land) {
        b.y = edge * TILE - b.h;
        b.vy = 0;
        b.onGround = true;
        break;
      }
    } else {
      const edge = Math.floor(ny / TILE);
      let hit = false;
      for (let tx = x0; tx <= x1; tx++) if (solidAt(g, tx, edge)) hit = true;
      if (hit) {
        b.y = (edge + 1) * TILE;
        b.vy = 0;
        b.hitCeiling = true;
        break;
      }
    }
    b.y = ny;
    dy -= d;
  }
  // standing still on the ground: check the tile right below
  if (!b.onGround && b.vy >= 0) {
    const below = Math.floor((b.y + b.h + 0.5) / TILE);
    const x0 = Math.floor(b.x / TILE);
    const x1 = Math.floor((b.x + b.w - 0.01) / TILE);
    if (Math.abs(b.y + b.h - below * TILE) < 0.6)
      for (let tx = x0; tx <= x1; tx++) {
        const t = tileAt(g, tx, below);
        if (isSolid(t) || (t === T_PLATFORM && !dropThrough)) b.onGround = true;
      }
  }
}

/** True when the body touches a hazard tile. */
export function touchesHazard(b: { x: number; y: number; w: number; h: number }, g: RoomGrid) {
  const x0 = Math.floor((b.x + 2) / TILE);
  const x1 = Math.floor((b.x + b.w - 2) / TILE);
  const y0 = Math.floor((b.y + 4) / TILE);
  const y1 = Math.floor((b.y + b.h + 1) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (tileAt(g, tx, ty) === T_HAZARD) return true;
  return false;
}

/** Line of sight between two points (pixels), blocked by solid tiles. */
export function lineOfSight(g: RoomGrid, ax: number, ay: number, bx: number, by: number) {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 6);
  for (let i = 1; i < steps; i++) {
    const x = ax + ((bx - ax) * i) / steps;
    const y = ay + ((by - ay) * i) / steps;
    if (solidAt(g, Math.floor(x / TILE), Math.floor(y / TILE))) return false;
  }
  return true;
}

export const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
