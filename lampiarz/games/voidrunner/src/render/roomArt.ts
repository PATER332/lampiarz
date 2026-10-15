// Pre-renders a room: back wall, detailed tiles and props. Returns the static light sources.

import { TILE } from '../core/consts';
import { AREAS } from '../world/areas';
import type { RoomGrid } from '../world/tiles';
import { T_BREAK, T_EMPTY, T_HAZARD, T_PLATFORM, T_SOLID } from '../world/tiles';
import { line, makeCanvas, mix, px, rect, rgba, seeded, shade, type Ctx } from './pixel';

export interface Light {
  x: number;
  y: number;
  r: number;
  color: string;
  flicker: number; // 0 = steady
  a: number;
}

/** Small animated details layered over the pre-rendered room every frame. */
export interface Anim {
  kind: 'shaft' | 'drip' | 'led' | 'fan' | 'neon' | 'screen' | 'arc' | 'bulb' | 'steam' | 'bubble' | 'pulse' | 'wisp';
  x: number;
  y: number;
  h: number; // shaft length / drip fall distance / size
  color: string;
  ph: number; // phase offset
}

export interface RoomArt {
  back: HTMLCanvasElement; // drawn behind entities
  front: HTMLCanvasElement; // tiles
  lights: Light[];
  hazards: { x: number; y: number }[]; // animated hazard tiles (pixels, top-left)
  anims: Anim[];
}

let anims: Anim[] = [];

export function renderRoom(grid: RoomGrid, area: number, seed: number, skip: Set<number> = new Set()): RoomArt {
  const pal = AREAS[area].palette;
  const W = grid.w * TILE;
  const H = grid.h * TILE;
  const [back, bc] = makeCanvas(W, H);
  const [front, c] = makeCanvas(W, H);
  const r = seeded(seed);
  const lights: Light[] = [];
  const hazards: { x: number; y: number }[] = [];
  const t = (x: number, y: number) => (x < 0 || y < 0 || x >= grid.w || y >= grid.h ? T_SOLID : skip.has(y * grid.w + x) ? T_EMPTY : grid.tiles[y * grid.w + x]);
  const solid = (x: number, y: number) => t(x, y) === T_SOLID || t(x, y) === T_BREAK;
  anims = [];
  /** distance (px) from a point down to the next floor */
  const fallTo = (px0: number, py0: number) => {
    const tx = Math.floor(px0 / TILE);
    for (let ty = Math.floor(py0 / TILE) + 1; ty < grid.h; ty++) if (t(tx, ty) !== T_EMPTY) return ty * TILE - py0;
    return H - py0;
  };

  // ---------------------------------------------------------------- back wall (behind everything)
  backWall(bc, grid, area, r, lights);
  // wall fans and status LEDs on the back wall
  for (let i = 0; i < Math.max(1, grid.w / 18); i++) {
    const x = 2 + Math.floor(r() * (grid.w - 4));
    const y = 2 + Math.floor(r() * (grid.h - 5));
    if (t(x, y) !== T_EMPTY || t(x + 1, y) !== T_EMPTY || t(x, y + 1) !== T_EMPTY) continue;
    if (area === 1 || area === 4) continue;
    const X = x * TILE + 8;
    const Y = y * TILE + 8;
    bc.fillStyle = '#10131c';
    bc.beginPath();
    bc.arc(X, Y, 8, 0, Math.PI * 2);
    bc.fill();
    bc.strokeStyle = '#3a4256';
    bc.lineWidth = 1;
    bc.stroke();
    anims.push({ kind: 'fan', x: X, y: Y, h: 7, color: '#3a4256', ph: r() * 6 });
  }
  for (let i = 0; i < grid.w / 6; i++) {
    const x = Math.floor(r() * grid.w);
    const y = Math.floor(r() * grid.h);
    if (t(x, y) !== T_EMPTY) continue;
    const X = x * TILE + Math.floor(r() * 12) + 2;
    const Y = y * TILE + Math.floor(r() * 12) + 2;
    rect(bc, X - 1, Y - 1, 4, 3, '#151924');
    anims.push({ kind: 'led', x: X, y: Y, h: 2, color: r() < 0.6 ? (area === 1 ? '#7dff4a' : area === 4 ? pal.accent : '#ff4a5a') : '#5dff9b', ph: r() * 10 });
  }

  // ---------------------------------------------------------------- big set pieces standing on floors
  {
    const spots: { x: number; y: number }[] = [];
    for (let y = 3; y < grid.h - 1; y++)
      for (let x = 2; x < grid.w - 5; x++) {
        if (!solid(x, y + 1) || !solid(x + 3, y + 1)) continue;
        let free = true;
        for (let yy = y - 4; yy <= y && free; yy++) for (let xx = x; xx <= x + 3; xx++) if (t(xx, yy) !== T_EMPTY) free = false;
        if (free) spots.push({ x, y });
      }
    const n = Math.max(1, Math.floor(grid.w / 16));
    const placed: { x: number; y: number }[] = [];
    for (let i = 0; i < n * 3 && placed.length < n && spots.length; i++) {
      const sp = spots[Math.floor(r() * spots.length)];
      if (placed.some((q) => Math.abs(q.x - sp.x) < 7 && Math.abs(q.y - sp.y) < 4)) continue;
      placed.push(sp);
      setPiece(bc, sp.x * TILE, (sp.y + 1) * TILE, area, r, lights);
    }
  }

  // ---------------------------------------------------------------- tiles
  for (let y = 0; y < grid.h; y++)
    for (let x = 0; x < grid.w; x++) {
      const k = t(x, y);
      const X = x * TILE;
      const Y = y * TILE;
      if (k === T_SOLID || k === T_BREAK) solidTile(c, x, y, X, Y, area, k === T_BREAK, solid, r);
      else if (k === T_PLATFORM) platformTile(c, X, Y, area, t(x - 1, y) !== T_PLATFORM, t(x + 1, y) !== T_PLATFORM, solid(x, y + 1));
      else if (k === T_HAZARD) hazards.push({ x: X, y: Y });
    }

  // ---------------------------------------------------------------- crisp outline around every walkable shape
  for (let y = 0; y < grid.h; y++)
    for (let x = 0; x < grid.w; x++) {
      if (solid(x, y)) continue;
      const X = x * TILE;
      const Y = y * TILE;
      const ink = 'rgba(2,3,8,0.9)';
      if (solid(x, y + 1)) rect(c, X, Y + TILE - 1, TILE, 1, ink);
      if (solid(x, y - 1)) rect(c, X, Y, TILE, 1, ink);
      if (solid(x - 1, y)) rect(c, X, Y, 1, TILE, ink);
      if (solid(x + 1, y)) rect(c, X + TILE - 1, Y, 1, TILE, ink);
      if (t(x, y) === T_PLATFORM) {
        rect(c, X, Y + 5, TILE, 1, ink);
        if (t(x, y - 1) === T_EMPTY) rect(c, X, Y - 1, TILE, 1, ink);
      }
    }

  // ---------------------------------------------------------------- ambient occlusion on the back wall:
  // open cells right under a ceiling or next to a wall get a soft shadow, which gives the room depth
  for (let y = 0; y < grid.h; y++)
    for (let x = 0; x < grid.w; x++) {
      if (t(x, y) === T_SOLID || t(x, y) === T_BREAK) continue;
      const X = x * TILE;
      const Y = y * TILE;
      if (solid(x, y - 1)) {
        const g0 = bc.createLinearGradient(0, Y, 0, Y + 12);
        g0.addColorStop(0, 'rgba(0,0,0,0.45)');
        g0.addColorStop(1, 'rgba(0,0,0,0)');
        bc.fillStyle = g0;
        bc.fillRect(X, Y, TILE, 12);
      }
      if (solid(x - 1, y)) {
        const g1 = bc.createLinearGradient(X, 0, X + 8, 0);
        g1.addColorStop(0, 'rgba(0,0,0,0.35)');
        g1.addColorStop(1, 'rgba(0,0,0,0)');
        bc.fillStyle = g1;
        bc.fillRect(X, Y, 8, TILE);
      }
      if (solid(x + 1, y)) {
        const g2 = bc.createLinearGradient(X + TILE, 0, X + TILE - 8, 0);
        g2.addColorStop(0, 'rgba(0,0,0,0.35)');
        g2.addColorStop(1, 'rgba(0,0,0,0)');
        bc.fillStyle = g2;
        bc.fillRect(X + TILE - 8, Y, 8, TILE);
      }
      if (solid(x, y + 1) && t(x, y) === T_EMPTY) {
        // floor contact shadow + small rubble on top of the floor edge
        rect(bc, X, Y + TILE - 2, TILE, 2, 'rgba(0,0,0,0.25)');
        if (r() < 0.35) {
          const n = 1 + Math.floor(r() * 3);
          for (let k = 0; k < n; k++) {
            const rx = X + Math.floor(r() * 14);
            const rw = 1 + Math.floor(r() * 2);
            rect(c, rx, Y + TILE - rw, rw, rw, shade(pal.wallHi, r() < 0.5 ? -10 : 15));
          }
        }
        if (area === 2 && r() < 0.06) {
          // puddle reflecting the neon
          rect(c, X + 2, Y + TILE - 1, 10, 1, rgba(pal.accent, 0.35));
          rect(c, X + 4, Y + TILE - 1, 3, 1, rgba('#ffffff', 0.25));
        }
      }
      // cobwebs / roots in upper inner corners
      if (solid(x, y - 1) && (solid(x - 1, y) || solid(x + 1, y)) && r() < 0.5) {
        const left = solid(x - 1, y);
        const ox = left ? X : X + TILE;
        const d = left ? 1 : -1;
        const wc = area === 1 ? 'rgba(63,143,74,0.45)' : area === 4 ? 'rgba(196,92,255,0.25)' : 'rgba(200,210,230,0.18)';
        for (let k = 0; k < 4; k++) line(bc, ox, Y + k * 3, ox + d * (10 - k * 2), Y, wc);
        line(bc, ox, Y + 9, ox + d * 9, Y, wc);
      }
    }

  // ---------------------------------------------------------------- props on floors, walls and ceilings
  for (let y = 1; y < grid.h - 1; y++)
    for (let x = 1; x < grid.w - 1; x++) {
      if (t(x, y) !== T_EMPTY) continue;
      const floor = solid(x, y + 1) && t(x, y + 1) !== T_BREAK;
      const ceil = solid(x, y - 1);
      if (floor && t(x, y - 1) === T_EMPTY && r() < 0.16) floorProp(bc, x * TILE, (y + 1) * TILE, area, r, lights);
      if (ceil && r() < 0.14) ceilingProp(bc, x * TILE, y * TILE, area, r, lights);
      if (!floor && !ceil && (solid(x - 1, y) || solid(x + 1, y)) && r() < 0.05) wallProp(bc, x * TILE, y * TILE, area, solid(x - 1, y) ? -1 : 1, r, lights);
    }

  // a soft colour wash so tiles near the floor pick up the ambient tint
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgba(pal.fog, 0));
  g.addColorStop(1, rgba(pal.fog, 0.12));
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'source-over';
  // drips fall from stalactites / growths to the floor below; shafts reach the floor
  for (const a of anims) if (a.kind === 'drip' || a.kind === 'shaft') a.h = Math.min(a.kind === 'shaft' ? 120 : 400, fallTo(a.x, a.y));
  return { back, front, lights, hazards, anims };
}

// ------------------------------------------------------------------ back wall
function backWall(c: Ctx, grid: RoomGrid, area: number, r: () => number, lights: Light[]) {
  const pal = AREAS[area].palette;
  const W = grid.w * TILE;
  const H = grid.h * TILE;
  const col = mix(pal.wallLo, pal.far, 0.5);
  c.globalAlpha = 0.5;
  // structural columns and beams, with gaps so the parallax shows through
  for (let x = 4 + Math.floor(r() * 6); x < grid.w - 2; x += 11 + Math.floor(r() * 9)) {
    const X = x * TILE;
    const w = 10 + Math.floor(r() * 10);
    rect(c, X, 0, w, H, col);
    rect(c, X, 0, 1, H, shade(col, 10));
    rect(c, X + w - 1, 0, 1, H, shade(col, -8));
    for (let y = 8; y < H; y += 24) {
      rect(c, X + 2, y, w - 4, 1, shade(col, -10));
      px(c, X + 2, y + 3, shade(col, 18));
      px(c, X + w - 3, y + 3, shade(col, 18));
    }
    if (area === 3 && r() < 0.6) {
      rect(c, X + w / 2 - 1, 0, 2, H, rgba(pal.accent, 0.18));
      lights.push({ x: X + w / 2, y: H / 2, r: 50, color: pal.accent, flicker: 0.2, a: 0.25 });
    }
  }
  for (let y = 3 + Math.floor(r() * 3); y < grid.h - 3; y += 8 + Math.floor(r() * 6)) {
    const Y = y * TILE;
    rect(c, 0, Y, W, 4, col);
    rect(c, 0, Y, W, 1, shade(col, 12));
  }
  c.globalAlpha = 1;
  // pipes running along the back wall
  for (let i = 0; i < 2; i++) {
    const Y = (2 + Math.floor(r() * (grid.h - 5))) * TILE + 6;
    const pc = area === 1 ? '#22393b' : area === 2 ? '#3a2f45' : '#2a3247';
    rect(c, 0, Y, W, 4, pc);
    rect(c, 0, Y, W, 1, shade(pc, 20));
    for (let x = Math.floor(r() * 30); x < W; x += 30 + Math.floor(r() * 30)) rect(c, x, Y - 1, 3, 6, shade(pc, -10));
  }
  // area-specific back detail
  for (let i = 0; i < grid.w / 3; i++) {
    const X = r() * W;
    const Y = r() * H;
    if (area === 1) {
      // veins of organic growth over the walls
      let x = X;
      let y = Y;
      for (let k = 0; k < 40; k++) {
        x += (r() - 0.5) * 3;
        y += r() * 2;
        px(c, x, y, rgba('#2d5a3a', 0.6));
      }
    } else if (area === 2 && r() < 0.5) {
      // windows of abandoned flats
      rect(c, X, Y, 10, 8, rgba('#000000', 0.18));
      rect(c, X, Y + 3, 10, 1, rgba(col, 0.5));
      if (r() < 0.25) {
        rect(c, X + 1, Y + 1, 8, 6, rgba('#ffcf8a', 0.22));
        lights.push({ x: X + 5, y: Y + 4, r: 22, color: '#ffcf8a', flicker: 0.05, a: 0.2 });
      }
    } else if (area === 4 && r() < 0.5) {
      px(c, X, Y, rgba('#e0b3ff', 0.5));
      px(c, X + 1, Y, rgba('#e0b3ff', 0.25));
    }
  }
}

// ------------------------------------------------------------------ solid tiles
function solidTile(c: Ctx, tx: number, ty: number, X: number, Y: number, area: number, cracked: boolean, solid: (x: number, y: number) => boolean, r: () => number) {
  const pal = AREAS[area].palette;
  const top = !solid(tx, ty - 1);
  const bottom = !solid(tx, ty + 1);
  const left = !solid(tx - 1, ty);
  const right = !solid(tx + 1, ty);
  // distance to the nearest open cell: the rock gets darker the deeper it goes, so walkable
  // surfaces stand out clearly against the background
  let depth = 3;
  for (let d = 1; d <= 3 && depth === 3; d++)
    for (let oy = -d; oy <= d && depth === 3; oy++)
      for (let ox = -d; ox <= d; ox++)
        if (!solid(tx + ox, ty + oy)) {
          depth = d - 1;
          break;
        }
  // surface tiles are clearly lighter than the deep rock and the back wall: the playable shape reads at a glance
  const base = depth === 0 ? mix(pal.wallHi, pal.trim, 0.4) : depth === 1 ? pal.wallHi : depth === 2 ? pal.wall : pal.wallLo;
  rect(c, X, Y, TILE, TILE, base);
  if (depth >= 2) {
    if (r() < 0.25) px(c, X + r() * 16, Y + r() * 16, shade(base, 10));
    if (cracked) {
      line(c, X + 3, Y + 1, X + 8, Y + 7, shade(base, -30));
      line(c, X + 8, Y + 7, X + 5, Y + 14, shade(base, -30));
    }
    return;
  }
  // panel seams and texture
  if (area === 4) {
    // rock with violet veins
    for (let i = 0; i < 6; i++) px(c, X + r() * 16, Y + r() * 16, shade(base, r() < 0.5 ? -10 : 8));
    if (r() < 0.25) line(c, X + r() * 16, Y + r() * 16, X + r() * 16, Y + r() * 16, rgba(pal.accent, 0.35));
  } else if (area === 1) {
    for (let i = 0; i < 5; i++) px(c, X + r() * 16, Y + r() * 16, shade(base, r() < 0.5 ? -10 : 8));
    if ((tx + ty) % 2 === 0) rect(c, X, Y + 15, TILE, 1, shade(base, -10));
  } else if (area === 2) {
    // concrete blocks
    rect(c, X, Y + 7, TILE, 1, shade(base, -10));
    rect(c, X + ((ty % 2) * 8), Y, 1, 7, shade(base, -10));
    rect(c, X + (((ty + 1) % 2) * 8), Y + 8, 1, 8, shade(base, -10));
    for (let i = 0; i < 3; i++) px(c, X + r() * 16, Y + r() * 16, shade(base, 10));
  } else {
    // metal plates with rivets
    if ((tx + ty * 3) % 2 === 0) {
      rect(c, X, Y, TILE, 1, shade(base, 8));
      rect(c, X, Y, 1, TILE, shade(base, 6));
      rect(c, X + 15, Y, 1, TILE, shade(base, -10));
      rect(c, X, Y + 15, TILE, 1, shade(base, -10));
      px(c, X + 2, Y + 2, shade(base, 22));
      px(c, X + 13, Y + 2, shade(base, 22));
      px(c, X + 2, Y + 13, shade(base, 22));
      px(c, X + 13, Y + 13, shade(base, 22));
    } else if (r() < 0.2) {
      // vent
      for (let k = 0; k < 4; k++) rect(c, X + 3, Y + 4 + k * 3, 10, 1, shade(base, -16));
    }
    if (area === 3 && depth > 0 && r() < 0.12) rect(c, X + 7, Y, 2, TILE, rgba(pal.accent, 0.4));
  }
  if (cracked) {
    rect(c, X, Y, TILE, TILE, rgba('#000000', 0.15));
    line(c, X + 3, Y + 1, X + 8, Y + 7, shade(base, -30));
    line(c, X + 8, Y + 7, X + 5, Y + 14, shade(base, -30));
    line(c, X + 8, Y + 7, X + 13, Y + 10, shade(base, -30));
    px(c, X + 9, Y + 6, shade(base, 30));
  }
  // exposed edges
  if (top) {
    rect(c, X, Y, TILE, 3, shade(pal.trim, 12));
    rect(c, X, Y, TILE, 1, mix(shade(pal.trim, 60), pal.accent, 0.25));
    rect(c, X, Y + 3, TILE, 1, shade(base, -18));
    if (area === 0 && r() < 0.12) for (let k = 0; k < 4; k++) rect(c, X + k * 4, Y + 1, 2, 2, k % 2 ? '#1a1a1a' : '#d9b03a');
    if (area === 1) {
      // moss and drips over the edge
      for (let k = 0; k < 16; k++) if (r() < 0.55) px(c, X + k, Y - (r() < 0.4 ? 1 : 0), r() < 0.5 ? '#3f8f4a' : '#2d6a3a');
      if (r() < 0.3) rect(c, X + r() * 14, Y + 3, 1, 2 + r() * 4, '#3f8f4a');
    }
    if (area === 2 && r() < 0.15) rect(c, X + 2, Y + 1, 12, 1, rgba(pal.accent, 0.6));
    if (area === 3) rect(c, X, Y + 1, TILE, 1, rgba(pal.accent, 0.35));
    if (area === 4 && r() < 0.3) {
      const cx = X + 3 + r() * 10;
      line(c, cx, Y, cx + 1, Y - 3 - r() * 4, rgba(pal.accent, 0.7));
    }
  }
  if (bottom) {
    rect(c, X, Y + TILE - 2, TILE, 2, shade(base, -20));
    if (area === 1 && r() < 0.3) for (let k = 0; k < 3; k++) rect(c, X + r() * 15, Y + TILE, 1, 2 + r() * 5, '#2d6a3a');
  }
  if (left) {
    rect(c, X, Y, 1, TILE, shade(pal.trim, 20));
    rect(c, X + 1, Y, 1, TILE, shade(base, 8));
  }
  if (right) {
    rect(c, X + TILE - 1, Y, 1, TILE, shade(base, -24));
  }
}

function platformTile(c: Ctx, X: number, Y: number, area: number, leftEnd: boolean, rightEnd: boolean, onSolid: boolean) {
  const pal = AREAS[area].palette;
  const col = area === 1 ? '#3a6a58' : area === 4 ? '#563e6e' : '#4e5c80';
  rect(c, X, Y, TILE, 4, col);
  rect(c, X, Y, TILE, 1, mix(shade(col, 70), pal.accent, 0.3));
  for (let k = 1; k < TILE; k += 3) px(c, X + k, Y + 2, shade(col, -25));
  rect(c, X, Y + 4, TILE, 1, shade(col, -30));
  if (!onSolid) {
    if (leftEnd) {
      line(c, X + 1, Y + 5, X + 5, Y + 10, shade(col, -10));
      rect(c, X, Y + 4, 2, 3, shade(col, 10));
    }
    if (rightEnd) {
      line(c, X + 14, Y + 5, X + 10, Y + 10, shade(col, -10));
      rect(c, X + 14, Y + 4, 2, 3, shade(col, 10));
    }
  }
  if (area === 3) rect(c, X + 2, Y + 1, 12, 1, rgba(pal.accent, 0.35));
  if (area === 2 && leftEnd) rect(c, X, Y + 1, 2, 2, rgba(pal.accent2, 0.8));
}

// ------------------------------------------------------------------ props
function floorProp(c: Ctx, X: number, Y: number, area: number, r: () => number, lights: Light[]) {
  const pal = AREAS[area].palette;
  const k = r();
  const metal = '#2c3448';
  if (area === 0) {
    if (k < 0.3) {
      // crates
      rect(c, X + 1, Y - 10, 12, 10, '#3a3426');
      rect(c, X + 1, Y - 10, 12, 1, '#5a5038');
      line(c, X + 2, Y - 9, X + 12, Y - 1, '#2a2418');
      line(c, X + 12, Y - 9, X + 2, Y - 1, '#2a2418');
      if (r() < 0.5) {
        rect(c, X + 4, Y - 17, 8, 7, '#3e3829');
        rect(c, X + 4, Y - 17, 8, 1, '#5a5038');
      }
    } else if (k < 0.55) {
      // console with a glowing screen
      rect(c, X + 2, Y - 14, 12, 14, metal);
      rect(c, X + 2, Y - 14, 12, 1, shade(metal, 30));
      rect(c, X + 4, Y - 12, 8, 5, rgba(pal.accent, 0.7));
      for (let i = 0; i < 3; i++) rect(c, X + 5, Y - 11 + i * 2 - 0, 2 + r() * 5, 1, rgba('#ffffff', 0.6));
      rect(c, X + 4, Y - 5, 2, 1, '#ff4a5a');
      rect(c, X + 8, Y - 5, 2, 1, '#5dff9b');
      lights.push({ x: X + 8, y: Y - 10, r: 26, color: pal.accent, flicker: 0.15, a: 0.35 });
      anims.push({ kind: 'screen', x: X + 4, y: Y - 12, h: 5, color: pal.accent, ph: r() * 10 });
    } else if (k < 0.75) {
      // broken robot arm / debris
      rect(c, X + 2, Y - 4, 10, 4, metal);
      line(c, X + 6, Y - 4, X + 10, Y - 12, shade(metal, 20));
      line(c, X + 10, Y - 12, X + 14, Y - 10, shade(metal, 20));
      px(c, X + 14, Y - 9, '#ff4a5a');
    } else {
      // barrels
      rect(c, X + 3, Y - 12, 9, 12, '#3a2a30');
      rect(c, X + 3, Y - 9, 9, 1, '#1d1418');
      rect(c, X + 3, Y - 4, 9, 1, '#1d1418');
      rect(c, X + 4, Y - 12, 1, 12, '#5a4048');
    }
  } else if (area === 1) {
    if (k < 0.4) {
      // glowing bio pod
      c.fillStyle = '#1f3a32';
      c.beginPath();
      c.ellipse(X + 8, Y - 7, 6, 7, 0, 0, Math.PI * 2);
      c.fill();
      rect(c, X + 5, Y - 10, 6, 5, rgba(pal.accent, 0.45));
      px(c, X + 7, Y - 9, '#d8ffe6');
      lights.push({ x: X + 8, y: Y - 8, r: 24, color: pal.accent, flicker: 0.3, a: 0.35 });
    } else if (k < 0.7) {
      // fungus cluster
      for (let i = 0; i < 4; i++) {
        const fx = X + 2 + i * 3 + r() * 2;
        const h = 3 + r() * 6;
        rect(c, fx, Y - h, 1, h, '#3a5a48');
        rect(c, fx - 1, Y - h - 1, 3, 2, i % 2 ? '#d23a6a' : '#7dff4a');
      }
    } else {
      // broken specimen jar
      rect(c, X + 3, Y - 13, 10, 13, '#2a3a3a');
      rect(c, X + 4, Y - 12, 8, 7, rgba('#7dff4a', 0.25));
      rect(c, X + 3, Y - 13, 10, 1, '#4a6a6a');
      line(c, X + 5, Y - 12, X + 9, Y - 6, '#d8ffe6');
    }
  } else if (area === 2) {
    if (k < 0.3) {
      // street lamp
      rect(c, X + 7, Y - 30, 2, 30, '#2a2236');
      rect(c, X + 4, Y - 32, 8, 3, '#3a3048');
      rect(c, X + 5, Y - 29, 6, 1, '#ffcf8a');
      lights.push({ x: X + 8, y: Y - 26, r: 48, color: '#ffcf8a', flicker: 0.08, a: 0.45 });
    } else if (k < 0.5) {
      // vending machine
      rect(c, X + 1, Y - 22, 14, 22, '#3a2236');
      rect(c, X + 3, Y - 20, 8, 12, rgba(pal.accent, 0.55));
      for (let i = 0; i < 4; i++) rect(c, X + 4, Y - 19 + i * 3, 6, 1, rgba('#ffffff', 0.4));
      rect(c, X + 12, Y - 18, 2, 6, '#1a1220');
      lights.push({ x: X + 8, y: Y - 14, r: 30, color: pal.accent, flicker: 0.1, a: 0.4 });
      anims.push({ kind: 'screen', x: X + 3, y: Y - 20, h: 12, color: pal.accent, ph: r() * 10 });
    } else if (k < 0.75) {
      // trash and a bench
      rect(c, X + 1, Y - 6, 14, 2, '#3a3048');
      rect(c, X + 2, Y - 4, 1, 4, '#3a3048');
      rect(c, X + 13, Y - 4, 1, 4, '#3a3048');
    } else {
      rect(c, X + 4, Y - 9, 8, 9, '#2a3a2a');
      rect(c, X + 3, Y - 10, 10, 2, '#3a4a3a');
    }
  } else if (area === 3) {
    if (k < 0.45) {
      // energy coil
      rect(c, X + 4, Y - 18, 8, 18, metal);
      for (let i = 0; i < 6; i++) rect(c, X + 3, Y - 16 + i * 3, 10, 1, '#b07a3a');
      rect(c, X + 6, Y - 22, 4, 4, rgba(pal.accent, 0.9));
      lights.push({ x: X + 8, y: Y - 20, r: 34, color: pal.accent, flicker: 0.25, a: 0.5 });
      anims.push({ kind: 'arc', x: X + 8, y: Y - 20, h: 10, color: pal.accent, ph: r() * 10 });
    } else if (k < 0.7) {
      // warning sign
      rect(c, X + 7, Y - 14, 2, 14, metal);
      c.fillStyle = '#d9b03a';
      c.beginPath();
      c.moveTo(X + 8, Y - 22);
      c.lineTo(X + 14, Y - 13);
      c.lineTo(X + 2, Y - 13);
      c.fill();
      rect(c, X + 7, Y - 19, 2, 3, '#1a1a1a');
      px(c, X + 7, Y - 15, '#1a1a1a');
    } else {
      // cable bundle on the floor
      for (let i = 0; i < 3; i++) line(c, X, Y - 1 - i, X + 16, Y - 2 + i, ['#2a3a5a', '#3a2a2a', '#2a4a3a'][i]);
    }
  } else {
    if (k < 0.5) {
      // void crystals
      for (let i = 0; i < 3; i++) {
        const cx = X + 3 + i * 4;
        const h = 5 + r() * 12;
        c.fillStyle = i === 1 ? pal.accent : shade(pal.accent, -60);
        c.beginPath();
        c.moveTo(cx - 2, Y);
        c.lineTo(cx, Y - h);
        c.lineTo(cx + 2, Y);
        c.fill();
      }
      lights.push({ x: X + 8, y: Y - 8, r: 30, color: pal.accent, flicker: 0.4, a: 0.45 });
    } else {
      // tendril growth
      for (let i = 0; i < 3; i++) {
        let x = X + 4 + i * 4;
        for (let y = 0; y < 8 + r() * 10; y++) {
          x += (r() - 0.5) * 1.5;
          px(c, x, Y - y, '#2a1a35');
        }
      }
    }
  }
}

function ceilingProp(c: Ctx, X: number, Y: number, area: number, r: () => number, lights: Light[]) {
  const pal = AREAS[area].palette;
  const k = r();
  if (k < 0.35) {
    // hanging cable
    const len = 6 + r() * 26;
    const sway = (r() - 0.5) * 6;
    for (let y = 0; y < len; y++) px(c, X + 8 + sway * (y / len) * (y / len), Y + y, area === 1 ? '#2d5a3a' : '#1a1d28');
    if (area !== 1 && r() < 0.3) {
      px(c, X + 8 + sway, Y + len, '#ffe066');
      lights.push({ x: X + 8 + sway, y: Y + len, r: 14, color: '#ffe066', flicker: 0.6, a: 0.35 });
      anims.push({ kind: 'bulb', x: X + 8 + sway, y: Y + len, h: 1, color: '#ffe066', ph: r() * 10 });
    }
  } else if (k < 0.6) {
    // ceiling lamp
    rect(c, X + 3, Y, 10, 3, '#2a3040');
    rect(c, X + 4, Y + 3, 8, 1, area === 2 ? '#ffcf8a' : area === 4 ? pal.accent : '#cfe8ff');
    const lampCol = area === 2 ? '#ffcf8a' : area === 4 ? pal.accent : '#9fd8ff';
    const flick = r() < 0.25 ? 0.5 : 0.04;
    lights.push({ x: X + 8, y: Y + 6, r: 52, color: lampCol, flicker: flick, a: 0.5 });
    anims.push({ kind: 'shaft', x: X + 8, y: Y + 4, h: 100, color: lampCol, ph: flick > 0.1 ? 1 + r() * 10 : 0 });
  } else if (area === 1 || area === 4) {
    // dripping growth / stalactites
    for (let i = 0; i < 3; i++) {
      const h = 3 + r() * 9;
      rect(c, X + 3 + i * 4, Y, 2, h, area === 1 ? '#2d5a3a' : '#2a1a35');
      px(c, X + 3 + i * 4, Y + h, area === 1 ? pal.accent : pal.accent);
      if (i === 1 || r() < 0.3) anims.push({ kind: 'drip', x: X + 3 + i * 4, y: Y + h + 1, h: 100, color: pal.accent, ph: r() * 10 });
    }
  } else {
    // pipe bracket
    rect(c, X, Y + 2, TILE, 3, '#2a3247');
    rect(c, X, Y + 2, TILE, 1, '#3e4864');
  }
}

function wallProp(c: Ctx, X: number, Y: number, area: number, side: number, r: () => number, lights: Light[]) {
  const pal = AREAS[area].palette;
  const wx = side < 0 ? X : X + 10;
  if (area === 2) {
    // neon sign
    const col = r() < 0.5 ? pal.accent : pal.accent2;
    rect(c, wx, Y + 2, 6, 12, '#1a1220');
    for (let i = 0; i < 3; i++) rect(c, wx + 1, Y + 4 + i * 3, 4, 1, col);
    lights.push({ x: wx + 3, y: Y + 8, r: 30, color: col, flicker: 0.12, a: 0.45 });
    anims.push({ kind: 'neon', x: wx + 1, y: Y + 4, h: 3, color: col, ph: r() * 10 });
  } else {
    rect(c, wx, Y + 4, 6, 6, '#2a3040');
    rect(c, wx + 1, Y + 5, 4, 4, rgba(area === 1 ? '#7dff4a' : area === 4 ? pal.accent : '#ff4a5a', 0.85));
    lights.push({ x: wx + 3, y: Y + 7, r: 20, color: area === 1 ? '#7dff4a' : area === 4 ? pal.accent : '#ff4a5a', flicker: 0.5, a: 0.3 });
    anims.push({ kind: 'led', x: wx + 2, y: Y + 6, h: 2, color: area === 1 ? '#7dff4a' : area === 4 ? pal.accent : '#ff4a5a', ph: r() * 10 });
  }
}

// ------------------------------------------------------------------ set pieces (64 × up to 80 px)
function setPiece(c: Ctx, X: number, Y: number, area: number, r: () => number, lights: Light[]) {
  const pal = AREAS[area].palette;
  const metal = '#252c3e';
  const k = r();
  if (area === 0) {
    if (k < 0.5) {
      // pressurised tank with bands, gauge and a service ladder
      const h = 52 + Math.floor(r() * 20);
      rect(c, X + 6, Y - h, 30, h, '#2a3246');
      rect(c, X + 6, Y - h, 4, h, '#38425c');
      rect(c, X + 32, Y - h, 4, h, '#1c2232');
      rect(c, X + 8, Y - h - 3, 26, 3, '#38425c');
      for (let yy = Y - h + 10; yy < Y - 4; yy += 14) rect(c, X + 6, yy, 30, 2, '#1a1f2c');
      rect(c, X + 16, Y - h + 16, 8, 8, '#141822');
      px(c, X + 20, Y - h + 19, '#ff4a5a');
      line(c, X + 20, Y - h + 20, X + 22, Y - h + 18, '#c8d2e6');
      for (let yy = Y - h + 4; yy < Y; yy += 4) rect(c, X + 38, yy, 6, 1, '#3a4256');
      rect(c, X + 38, Y - h + 2, 1, h - 2, '#3a4256');
      rect(c, X + 44, Y - h + 2, 1, h - 2, '#3a4256');
      // hazard label
      for (let i = 0; i < 6; i++) rect(c, X + 10 + i * 4, Y - 14, 2, 3, i % 2 ? '#1a1a1a' : '#d9b03a');
      anims.push({ kind: 'steam', x: X + 21, y: Y - h - 3, h: 1, color: '#c8d2e6', ph: r() * 10 });
    } else {
      // server racks with rows of status lights
      for (let i = 0; i < 3; i++) {
        const rx = X + i * 16;
        rect(c, rx, Y - 44, 14, 44, '#1a1f2c');
        rect(c, rx, Y - 44, 14, 1, '#3a4256');
        for (let yy = Y - 40; yy < Y - 4; yy += 5) {
          rect(c, rx + 2, yy, 10, 3, '#0e1119');
          if (r() < 0.6) anims.push({ kind: 'led', x: rx + 3 + Math.floor(r() * 7), y: yy + 1, h: 1, color: r() < 0.7 ? pal.accent : '#5dff9b', ph: r() * 10 });
        }
      }
      lights.push({ x: X + 24, y: Y - 22, r: 34, color: pal.accent, flicker: 0.05, a: 0.25 });
    }
  } else if (area === 1) {
    // specimen tank: glass cylinder, green fluid, something curled up inside
    const h = 50 + Math.floor(r() * 16);
    rect(c, X + 8, Y - 8, 32, 8, metal);
    rect(c, X + 8, Y - h - 6, 32, 6, metal);
    rect(c, X + 8, Y - h - 6, 32, 1, '#4a5a6a');
    rect(c, X + 10, Y - h, 28, h - 8, rgba('#1f6a4a', 0.55));
    rect(c, X + 10, Y - h + 6, 28, 1, rgba('#7dff4a', 0.5));
    // silhouette
    c.fillStyle = 'rgba(8,20,16,0.85)';
    c.beginPath();
    c.ellipse(X + 24, Y - h / 2 - 6, 7, 12, 0.2, 0, Math.PI * 2);
    c.fill();
    rect(c, X + 22, Y - h / 2 - 22, 6, 6, 'rgba(8,20,16,0.85)');
    px(c, X + 26, Y - h / 2 - 20, '#ff4a5a');
    // glass highlights
    rect(c, X + 12, Y - h + 2, 1, h - 12, rgba('#ffffff', 0.25));
    rect(c, X + 35, Y - h + 2, 1, h - 12, rgba('#ffffff', 0.1));
    if (r() < 0.35) {
      // cracked and leaking
      line(c, X + 30, Y - h + 10, X + 34, Y - h + 22, rgba('#d8ffe6', 0.7));
      line(c, X + 34, Y - h + 22, X + 31, Y - h + 30, rgba('#d8ffe6', 0.7));
    }
    anims.push({ kind: 'bubble', x: X + 10, y: Y - 8, h: h - 10, color: '#b8ffd0', ph: r() * 10 });
    lights.push({ x: X + 24, y: Y - h / 2, r: 40, color: pal.accent, flicker: 0.1, a: 0.4 });
  } else if (area === 2) {
    // shop front: shutter, sign board and an air conditioner above
    rect(c, X, Y - 40, 56, 40, '#1d1828');
    rect(c, X, Y - 40, 56, 1, '#3a3048');
    rect(c, X + 4, Y - 26, 30, 26, '#141019');
    for (let yy = Y - 25; yy < Y; yy += 3) rect(c, X + 4, yy, 30, 1, '#241e30');
    const sign = r() < 0.5 ? pal.accent : pal.accent2;
    rect(c, X + 3, Y - 36, 34, 7, '#0e0b14');
    for (let i = 0; i < 6; i++) rect(c, X + 6 + i * 5, Y - 34, 3, 3, rgba(sign, 0.9));
    anims.push({ kind: 'neon', x: X + 6, y: Y - 34, h: 1, color: sign, ph: r() * 10 });
    lights.push({ x: X + 20, y: Y - 32, r: 36, color: sign, flicker: 0.1, a: 0.45 });
    // window with a warm light
    rect(c, X + 40, Y - 30, 12, 14, '#0e0b14');
    if (r() < 0.6) {
      rect(c, X + 41, Y - 29, 10, 12, rgba('#ffcf8a', 0.35));
      lights.push({ x: X + 46, y: Y - 23, r: 20, color: '#ffcf8a', flicker: 0.03, a: 0.25 });
    }
    // AC unit with a fan
    rect(c, X + 38, Y - 54, 16, 12, '#2a2536');
    rect(c, X + 38, Y - 54, 16, 1, '#4a4058');
    anims.push({ kind: 'fan', x: X + 46, y: Y - 48, h: 4, color: '#3a3048', ph: r() * 6 });
    // graffiti
    const gcol = ['#ff3d6e', '#3ee6ff', '#ffd23e', '#8a5cff'][Math.floor(r() * 4)];
    let gx = X + 6;
    let gy = Y - 10 - r() * 8;
    for (let i = 0; i < 22; i++) {
      const nx = gx + 1 + r() * 2;
      const ny = gy + (r() - 0.5) * 6;
      line(c, gx, gy, nx, ny, rgba(gcol, 0.55));
      gx = nx;
      gy = Math.max(Y - 24, Math.min(Y - 3, ny));
    }
  } else if (area === 3) {
    // reactor ring with glowing segments
    const cx = X + 32;
    const cy = Y - 38;
    c.strokeStyle = '#1a2440';
    c.lineWidth = 6;
    c.beginPath();
    c.arc(cx, cy, 26, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = '#2c3a5c';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx, cy, 29, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      rect(c, cx + Math.cos(a) * 26 - 1, cy + Math.sin(a) * 26 - 1, 3, 3, rgba(pal.accent, 0.8));
    }
    rect(c, cx - 3, cy + 26, 6, Y - cy - 26, metal);
    anims.push({ kind: 'pulse', x: cx, y: cy, h: 22, color: pal.accent, ph: r() * 10 });
    lights.push({ x: cx, y: cy, r: 56, color: pal.accent, flicker: 0.15, a: 0.45 });
  } else {
    // floating rift rock with crystal growth
    const fx = X + 10 + r() * 20;
    const fy = Y - 40 - r() * 20;
    c.fillStyle = '#1e1028';
    c.beginPath();
    c.moveTo(fx - 14, fy);
    c.lineTo(fx - 6, fy - 8);
    c.lineTo(fx + 10, fy - 6);
    c.lineTo(fx + 16, fy + 2);
    c.lineTo(fx + 2, fy + 14);
    c.closePath();
    c.fill();
    line(c, fx - 6, fy - 8, fx + 10, fy - 6, rgba(pal.accent, 0.6));
    for (let i = 0; i < 3; i++) {
      c.fillStyle = i === 1 ? pal.accent : shade(pal.accent, -70);
      c.beginPath();
      c.moveTo(fx - 4 + i * 4, fy - 6);
      c.lineTo(fx - 2 + i * 4, fy - 14 - r() * 6);
      c.lineTo(fx + i * 4, fy - 6);
      c.fill();
    }
    anims.push({ kind: 'wisp', x: fx, y: fy + 12, h: 30, color: pal.accent, ph: r() * 10 });
    lights.push({ x: fx, y: fy - 6, r: 30, color: pal.accent, flicker: 0.3, a: 0.4 });
  }
}
