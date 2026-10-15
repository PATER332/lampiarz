// Fixed lighting of the level, generated deterministically from the layout and
// zone rules (with a few hand-placed lamps). Dead fixtures are kept so that
// they are still drawn as dark panels on the ceiling.
import { buildLayout, CELL, GRID_H, GRID_W, H } from './layout';
import type { LightDef } from './map';

function hash(x: number, z: number, s: number) {
  let h = (x * 374761393 + z * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const Y = H - 0.05;

export function buildLights(): LightDef[] {
  const L = buildLayout();
  const out: LightDef[] = [];
  const walk = (x: number, z: number) => {
    const ch = L.chars[z]?.[x];
    return ch === '.' || ch === '~';
  };
  const cx = (x: number) => x * CELL + CELL / 2;
  for (let z = 1; z < GRID_H - 1; z++)
    for (let x = 1; x < GRID_W - 1; x++) {
      if (!walk(x, z)) continue;
      const zone = L.zones[z][x];
      const r = hash(x, z, 7);
      const r2 = hash(x, z, 13);
      switch (zone) {
        case 'maze':
        case 'armory':
        case 'secret': {
          if (x % 2 !== 0 || z % 2 !== 0) break;
          // the pillar hall is mostly dead; the rest of the maze buzzes on
          const pillarHall = x >= 14 && z >= 31 && z <= 38;
          const dead = zone === 'armory' ? false : pillarHall ? r < 0.55 : r < 0.12;
          out.push({ x: cx(x), y: Y, z: cx(z), kind: zone === 'armory' ? 'cold' : 'fluo', intensity: zone === 'secret' ? 0.55 : 0.95, range: 6.8, flicker: !dead && r2 < 0.12 ? 0.35 + r2 * 2 : undefined, dead, panel: true });
          break;
        }
        case 'dark': {
          if ((x * 7 + z * 3) % 6 !== 0) break;
          const dead = r < 0.55;
          out.push({ x: cx(x), y: Y - 0.15, z: cx(z), kind: 'bulb', intensity: 0.55, range: 5.2, flicker: !dead && r2 < 0.35 ? 0.5 : undefined, dead });
          break;
        }
        case 'storage': {
          if (x % 3 !== 0 || z % 3 !== 1) break;
          out.push({ x: cx(x), y: Y, z: cx(z), kind: 'cold', intensity: 1.05, range: 8.5, gen: true, flicker: r2 < 0.1 ? 0.3 : undefined, dead: r < 0.08, panel: true });
          break;
        }
        case 'red': {
          if (x % 4 !== 1 || z % 4 !== 1) break;
          out.push({ x: cx(x), y: Y - 0.2, z: cx(z), kind: 'red', intensity: 0.75, range: 7, flicker: r2 < 0.25 ? 0.4 : undefined });
          break;
        }
        case 'descent': {
          if ((x * 5 + z * 2) % 7 !== 0) break;
          const dead = r < 0.45;
          out.push({ x: cx(x), y: Y - 0.1, z: cx(z), kind: r2 < 0.3 ? 'red' : 'cold', intensity: 0.6, range: 6, flicker: !dead && r2 > 0.6 ? 0.45 : undefined, dead, panel: r2 >= 0.3 });
          break;
        }
        case 'anchor': {
          if (x % 3 !== 0 || z % 3 !== 0) break;
          out.push({ x: cx(x), y: Y, z: cx(z), kind: 'cold', intensity: 0.55, range: 7, dead: r < 0.3, panel: true });
          break;
        }
        default:
          break;
      }
    }
  // hand-placed lamps
  out.push(
    { x: 6, y: Y - 0.2, z: 7, kind: 'bulb', intensity: 0.8, range: 7, id: 'lift_top', flicker: 0.2 },
    { x: 6, y: Y - 0.2, z: 86.5, kind: 'bulb', intensity: 0.8, range: 6, id: 'lift_bottom' },
    { x: 104, y: Y - 0.3, z: 66, kind: 'red', intensity: 0.7, range: 7, id: 'gen_alarm' },
    { x: 104, y: Y - 0.1, z: 69, kind: 'cold', intensity: 1.0, range: 8, id: 'gen_room', gen: true, panel: true },
    { x: 80, y: Y - 0.3, z: 50, kind: 'lamp', intensity: 0.75, range: 6, id: 'radio_lamp', gen: true },
    { x: 58, y: Y - 0.1, z: 6, kind: 'cold', intensity: 0.7, range: 6, id: 'cam_room', gen: true, panel: true },
    { x: 58, y: Y - 0.05, z: 30, kind: 'uv', intensity: 1.4, range: 9, id: 'uv', gen: true },
    { x: 106.6, y: Y - 0.3, z: 29.4, kind: 'bulb', intensity: 1.5, range: 9, id: 'cage', gen: true },
    { x: 101, y: 1.6, z: 97, kind: 'core', intensity: 1.6, range: 11, id: 'core' },
    { x: 115, y: Y - 0.2, z: 97, kind: 'cold', intensity: 1.2, range: 6, id: 'exit_light' },
    { x: 44, y: Y - 0.3, z: 33, kind: 'lamp', intensity: 0.6, range: 6, id: 'secret_lamp' },
    { x: 4.2, y: Y - 0.1, z: 72, kind: 'fluo', intensity: 0.9, range: 6, id: 'start_lamp', flicker: 0.55, panel: true },
  );
  // armory lights only work once the door code has been entered
  for (const l of out) if (l.x > 52 && l.x < 64 && l.z > 42 && l.z < 56 && !l.id) l.id = 'armory';
  return out;
}
