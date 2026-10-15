// Arena looks: one palette and one parallax background per theme, all drawn
// with canvas paths (no image files).
import { Rng } from '../engine/math';
import type { ThemeId } from '../sim/games/base';

export interface Theme {
  sky: [string, string];
  /** far / mid / near silhouettes */
  layers: [string, string, string];
  ground: { top: string; body: string; edge: string };
  /** four platform tints */
  tints: [string, string, string, string];
  platformEdge: string;
  lava: [string, string];
  accent: string;
  /** how dark the arena is (0 = bright day) */
  dark: number;
  /** soft light colour for glows */
  glow: string;
  text: string;
}

export const THEMES: Record<ThemeId, Theme> = {
  candy: {
    sky: ['#ff9ccb', '#ffe1ee'],
    layers: ['#ffc3dd', '#9fe6db', '#6fd3c4'],
    ground: { top: '#ff6fa8', body: '#e2558f', edge: '#a83266' },
    tints: ['#ff6fa8', '#5fd0ff', '#ffd25f', '#a48cff'],
    platformEdge: '#7a2a55',
    lava: ['#ff4d6d', '#ffb3c1'],
    accent: '#ffffff',
    dark: 0,
    glow: '#ffffff',
    text: '#5a1f3d',
  },
  volcano: {
    sky: ['#120403', '#4d1007'],
    layers: ['#2b0b07', '#3a120b', '#1d0805'],
    ground: { top: '#6d4a3f', body: '#3f2a24', edge: '#1a0f0c' },
    tints: ['#9a7464', '#d4733c', '#8590b4', '#a8907f'],
    platformEdge: '#1a0f0c',
    lava: ['#ff5a1f', '#ffd23f'],
    accent: '#ffb21f',
    dark: 0.35,
    glow: '#ff7a1a',
    text: '#ffe6cf',
  },
  dojo: {
    sky: ['#120a2e', '#3b1366'],
    layers: ['#1d0f45', '#28125a', '#160a33'],
    ground: { top: '#3a2c66', body: '#241a45', edge: '#34f5ff' },
    tints: ['#3a2c66', '#4b2f7a', '#2e3f7a', '#5a2a66'],
    platformEdge: '#ff3fb4',
    lava: ['#ff3fb4', '#34f5ff'],
    accent: '#34f5ff',
    dark: 0.2,
    glow: '#ff3fb4',
    text: '#e8f6ff',
  },
  factory: {
    sky: ['#2a2f3d', '#59606f'],
    layers: ['#3a404f', '#474e5f', '#2c313d'],
    ground: { top: '#7b8396', body: '#4f5566', edge: '#ffcf33' },
    tints: ['#7b8396', '#c9893b', '#5f9ad6', '#9aa3b5'],
    platformEdge: '#262a33',
    lava: ['#2a2f3d', '#59606f'],
    accent: '#ffcf33',
    dark: 0.1,
    glow: '#ffe28a',
    text: '#f4f1e8',
  },
  vault: {
    sky: ['#0b2a1f', '#1e5a42'],
    layers: ['#114032', '#1a5240', '#0c3326'],
    ground: { top: '#efe6cc', body: '#c9bd96', edge: '#d4a72c' },
    tints: ['#efe6cc', '#e8d9a8', '#d9c98f', '#f4eedb'],
    platformEdge: '#8a6b16',
    lava: ['#ffd23f', '#fff1b0'],
    accent: '#ffd23f',
    dark: 0.12,
    glow: '#ffd23f',
    text: '#fff6da',
  },
  disco: {
    sky: ['#09050f', '#2a0833'],
    layers: ['#160a22', '#22102f', '#100616'],
    ground: { top: '#2b1a38', body: '#1a0f24', edge: '#ff4fa3' },
    tints: ['#ff4fa3', '#2fe0d0', '#ffd23f', '#9b6bff'],
    platformEdge: '#0a0510',
    lava: ['#ff2e63', '#ff9a3c'],
    accent: '#ff4fa3',
    dark: 0.4,
    glow: '#ff4fa3',
    text: '#fff0fa',
  },
  lab: {
    sky: ['#0b1626', '#18375a'],
    layers: ['#12253d', '#173050', '#0d1b2e'],
    ground: { top: '#dfe9f7', body: '#9fb2cc', edge: '#3ad1ff' },
    tints: ['#dfe9f7', '#c6d6ec', '#b4c8e4', '#e9f1fb'],
    platformEdge: '#2b4566',
    lava: ['#ff3b3b', '#ffb3b3'],
    accent: '#3ad1ff',
    dark: 0.15,
    glow: '#3ad1ff',
    text: '#eaf6ff',
  },
  sunset: {
    sky: ['#ff8a5c', '#ffd27a'],
    layers: ['#c4687a', '#8f4f8a', '#5d3a6e'],
    ground: { top: '#7cc95a', body: '#8b5a3c', edge: '#4f3324' },
    tints: ['#7cc95a', '#d98a4a', '#e0b35a', '#9bd16e'],
    platformEdge: '#4f3324',
    lava: ['#ff5a1f', '#ffd23f'],
    accent: '#ffe066',
    dark: 0,
    glow: '#fff1c2',
    text: '#3b1f2b',
  },
};

/** Static silhouettes for a theme, generated once (seeded). */
interface Sil {
  pts: [number, number][];
}

const cache = new Map<string, Sil[]>();
function silhouettes(theme: ThemeId, layer: number, kind: 'hills' | 'blocks' | 'spikes'): Sil[] {
  const key = `${theme}:${layer}:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = new Rng(theme.length * 997 + layer * 31);
  const out: Sil[] = [];
  const span = 4000;
  if (kind === 'hills') {
    const pts: [number, number][] = [[-span, 400]];
    for (let x = -span; x <= span; x += 120) pts.push([x, 120 + Math.sin(x * 0.0021 + layer) * 70 + r.range(-30, 30)]);
    pts.push([span, 400]);
    out.push({ pts });
  } else if (kind === 'blocks') {
    for (let x = -span; x < span; ) {
      const w = r.range(60, 160);
      const h = r.range(120, 340);
      out.push({
        pts: [
          [x, 400],
          [x, 400 - h],
          [x + w, 400 - h],
          [x + w, 400],
        ],
      });
      x += w + r.range(10, 60);
    }
  } else {
    const pts: [number, number][] = [[-span, 400]];
    for (let x = -span; x <= span; x += r.range(140, 260)) {
      pts.push([x, 300 + r.range(-20, 20)]);
      pts.push([x + r.range(60, 110), 60 + r.range(-40, 80)]);
    }
    pts.push([span, 400]);
    out.push({ pts });
  }
  cache.set(key, out);
  return out;
}

/**
 * Background in screen space. (cx, cy) is the camera centre in world units, z
 * the camera zoom, (W, H) the canvas size in pixels.
 */
export function drawBackground(g: CanvasRenderingContext2D, theme: ThemeId, cx: number, cy: number, _z: number, W: number, H: number, time: number) {
  const T = THEMES[theme];
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, T.sky[0]);
  sky.addColorStop(1, T.sky[1]);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const s = Math.min(W / 1280, H / 720);

  // something in the sky
  g.save();
  if (theme === 'sunset' || theme === 'candy') {
    const sx = W * 0.72 - cx * 0.02 * s;
    const sy = H * 0.3 - cy * 0.02 * s;
    const sun = g.createRadialGradient(sx, sy, 10 * s, sx, sy, 260 * s);
    sun.addColorStop(0, theme === 'sunset' ? 'rgba(255,250,220,0.95)' : 'rgba(255,255,255,0.9)');
    sun.addColorStop(0.25, theme === 'sunset' ? 'rgba(255,220,140,0.6)' : 'rgba(255,240,250,0.5)');
    sun.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, W, H);
    // drifting clouds
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 380 + time * (12 + i * 3) - cx * 0.08) % (W / s + 400)) * s - 200 * s;
      const y = (60 + ((i * 97) % 220)) * s - cy * 0.05 * s;
      cloud(g, x, y, (60 + (i % 3) * 25) * s);
    }
  } else if (theme === 'disco') {
    // sweeping spotlights
    for (let i = 0; i < 4; i++) {
      const a = Math.sin(time * (0.6 + i * 0.17) + i) * 0.5;
      const x0 = W * (0.15 + i * 0.23);
      g.save();
      g.translate(x0, -20);
      g.rotate(a);
      const beam = g.createLinearGradient(0, 0, 0, H);
      const col = ['255,79,163', '47,224,208', '255,210,63', '155,107,255'][i];
      beam.addColorStop(0, `rgba(${col},0.35)`);
      beam.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(-10 * s, 0);
      g.lineTo(10 * s, 0);
      g.lineTo(180 * s, H * 1.2);
      g.lineTo(-180 * s, H * 1.2);
      g.fill();
      g.restore();
    }
    // the mirror ball
    const bx = W / 2 - cx * 0.03 * s;
    const by = 70 * s - cy * 0.03 * s;
    g.fillStyle = '#cfcfe0';
    g.beginPath();
    g.arc(bx, by, 34 * s, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 18; i++) {
      g.fillStyle = (i + Math.floor(time * 6)) % 3 === 0 ? '#ffffff' : '#8e8eb0';
      const a = (i / 18) * Math.PI * 2 + time;
      g.fillRect(bx + Math.cos(a) * 20 * s - 4 * s, by + Math.sin(a * 2) * 18 * s - 4 * s, 8 * s, 8 * s);
    }
  } else if (theme === 'volcano') {
    // embers drifting up
    for (let i = 0; i < 40; i++) {
      const x = ((i * 173.3 + Math.sin(time + i) * 30) % 1400) * s;
      const y = (H / s - ((time * (30 + (i % 7) * 9) + i * 91) % (H / s + 50))) * s;
      g.fillStyle = `rgba(255,${120 + (i % 5) * 25},40,${0.5 + (i % 3) * 0.15})`;
      g.fillRect(x, y, 3 * s, 3 * s);
    }
  } else if (theme === 'dojo' || theme === 'lab' || theme === 'vault' || theme === 'factory') {
    // a few stars / distant lights
    for (let i = 0; i < 50; i++) {
      const x = ((i * 211.7) % 1280) * s - cx * 0.02 * s;
      const y = ((i * 97.3) % 300) * s - cy * 0.02 * s;
      g.fillStyle = `rgba(255,255,255,${0.15 + 0.25 * Math.abs(Math.sin(time * 0.7 + i))})`;
      g.fillRect(((x % W) + W) % W, y, 2 * s, 2 * s);
    }
  }
  g.restore();

  // three parallax layers
  const kinds: Record<ThemeId, ['hills' | 'blocks' | 'spikes', 'hills' | 'blocks' | 'spikes', 'hills' | 'blocks' | 'spikes']> = {
    candy: ['hills', 'hills', 'hills'],
    volcano: ['spikes', 'spikes', 'hills'],
    dojo: ['blocks', 'blocks', 'blocks'],
    factory: ['blocks', 'blocks', 'blocks'],
    vault: ['hills', 'blocks', 'hills'],
    disco: ['blocks', 'blocks', 'hills'],
    lab: ['blocks', 'blocks', 'blocks'],
    sunset: ['spikes', 'spikes', 'hills'],
  };
  const fac = [0.15, 0.3, 0.5];
  for (let l = 0; l < 3; l++) {
    const f = fac[l];
    const base = H - (180 - l * 40) * s;
    g.fillStyle = T.layers[l];
    for (const sil of silhouettes(theme, l, kinds[theme][l])) {
      g.beginPath();
      sil.pts.forEach(([x, y], i) => {
        const X = W / 2 + (x - (cx - 640) * f) * s * (0.6 + l * 0.15);
        const Y = base + (y - 400) * s * (0.55 + l * 0.2) - (cy - 360) * f * s * 0.3;
        if (i === 0) g.moveTo(X, H + 10);
        g.lineTo(X, Y);
      });
      g.lineTo(W + 4000, H + 10);
      g.closePath();
      g.fill();
    }
    // windows on city blocks
    if ((theme === 'dojo' || theme === 'lab') && l === 1) {
      for (let i = 0; i < 70; i++) {
        const x = W / 2 + ((i * 87.1) % 2600) * s * 0.75 - 1300 * s * 0.75 - (cx - 640) * f * s * 0.75;
        const y = base - ((i * 53.7) % 200) * s * 0.85 - 40 * s - (cy - 360) * f * s * 0.3;
        const on = Math.sin(i * 12.9 + Math.floor(time * 0.3 + i)) > 0.2;
        if (!on) continue;
        g.fillStyle = theme === 'dojo' ? (i % 3 ? 'rgba(52,245,255,0.55)' : 'rgba(255,63,180,0.6)') : 'rgba(150,220,255,0.45)';
        g.fillRect(x, y, 7 * s, 10 * s);
      }
    }
  }
  // factory: turning gears
  if (theme === 'factory') {
    for (let i = 0; i < 4; i++) {
      const gx = W * (0.12 + i * 0.27) - (cx * 0.25 * s) % (W * 1.08);
      gear(g, ((gx % W) + W) % W, H * (0.3 + (i % 2) * 0.16), (34 + (i % 3) * 16) * s, time * (i % 2 ? 0.4 : -0.3), 'rgba(20,24,32,0.3)');
    }
  }
  if (theme === 'vault') {
    // the vault door
    const vx = W * 0.5 - cx * 0.1 * s + 640 * 0.1 * s;
    const vy = H * 0.42 - cy * 0.05 * s;
    g.strokeStyle = 'rgba(212,167,44,0.35)';
    g.lineWidth = 10 * s;
    g.beginPath();
    g.arc(vx, vy, 190 * s, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 6 * s;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + time * 0.1;
      g.beginPath();
      g.moveTo(vx, vy);
      g.lineTo(vx + Math.cos(a) * 110 * s, vy + Math.sin(a) * 110 * s);
      g.stroke();
    }
  }
}

function cloud(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r * 0.6, 0, Math.PI * 2);
  g.arc(x + r * 0.55, y - r * 0.2, r * 0.5, 0, Math.PI * 2);
  g.arc(x + r * 1.1, y, r * 0.45, 0, Math.PI * 2);
  g.arc(x + r * 0.5, y + r * 0.15, r * 0.5, 0, Math.PI * 2);
  g.fill();
}

export function gear(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, col: string) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = col;
  g.beginPath();
  const teeth = 10;
  for (let i = 0; i < teeth * 2; i++) {
    const rr = i % 2 ? r : r * 1.18;
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    g.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
  }
  g.closePath();
  g.arc(0, 0, r * 0.35, 0, Math.PI * 2, true);
  g.fill('evenodd');
  g.restore();
}
