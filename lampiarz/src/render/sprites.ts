// Procedural vector sprites. All functions draw centred at (cx, cy) with a tile size `s`.
// Kept separate from the renderer so the codex can reuse them for portraits.

import type { ClassId, EnemyType, ItemKind, LampKind } from '../game/types';

type C = CanvasRenderingContext2D;

const TAU = Math.PI * 2;

export const CLASS_CLOAK: Record<ClassId, [string, string]> = {
  lampiarz: ['#2f5552', '#1c3533'],
  kowalka: ['#7a3f24', '#4a2414'],
  alchemik: ['#5a3a6b', '#36223f'],
};

function ellipse(c: C, x: number, y: number, rx: number, ry: number) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
}

export function drawShadowBlob(c: C, cx: number, cy: number, s: number, alpha = 0.35) {
  c.fillStyle = `rgba(0,0,0,${alpha})`;
  ellipse(c, cx, cy + s * 0.32, s * 0.28, s * 0.09);
  c.fill();
}

// ------------------------------------------------------------------ player
export function drawPlayer(c: C, cx: number, cy: number, s: number, cls: ClassId, face: number, t: number, flash = 0) {
  const [cloak, cloakDark] = CLASS_CLOAK[cls];
  const bob = Math.sin(t * 2.2) * s * 0.012;
  drawShadowBlob(c, cx, cy, s);
  c.save();
  c.translate(cx, cy + bob);
  if (face < 0) c.scale(-1, 1);

  // pole with lantern behind (drawn first, lantern glass emissive drawn by renderer)
  c.strokeStyle = '#3b2a1c';
  c.lineWidth = s * 0.045;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(s * 0.12, s * 0.26);
  c.lineTo(s * 0.26, -s * 0.34);
  c.stroke();
  c.beginPath();
  c.moveTo(s * 0.26, -s * 0.34);
  c.quadraticCurveTo(s * 0.36, -s * 0.38, s * 0.36, -s * 0.28);
  c.stroke();

  // cloak body
  const g = c.createLinearGradient(-s * 0.2, -s * 0.2, s * 0.2, s * 0.3);
  g.addColorStop(0, cloak);
  g.addColorStop(1, cloakDark);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-s * 0.05, -s * 0.3);
  c.quadraticCurveTo(-s * 0.24, -s * 0.05, -s * 0.22, s * 0.3);
  c.quadraticCurveTo(0, s * 0.36, s * 0.2, s * 0.3);
  c.quadraticCurveTo(s * 0.2, -s * 0.05, s * 0.06, -s * 0.3);
  c.closePath();
  c.fill();
  // cloak fold
  c.strokeStyle = 'rgba(0,0,0,0.25)';
  c.lineWidth = s * 0.02;
  c.beginPath();
  c.moveTo(-s * 0.02, -s * 0.12);
  c.quadraticCurveTo(-s * 0.06, s * 0.1, -s * 0.08, s * 0.3);
  c.stroke();

  // hood
  c.fillStyle = cloakDark;
  ellipse(c, 0, -s * 0.28, s * 0.13, s * 0.14);
  c.fill();
  c.fillStyle = cloak;
  c.beginPath();
  c.moveTo(-s * 0.13, -s * 0.24);
  c.quadraticCurveTo(-s * 0.1, -s * 0.47, s * 0.04, -s * 0.44);
  c.quadraticCurveTo(s * 0.16, -s * 0.4, s * 0.13, -s * 0.22);
  c.quadraticCurveTo(0, -s * 0.3, -s * 0.13, -s * 0.24);
  c.fill();
  // face shadow & glint
  c.fillStyle = '#120d0b';
  ellipse(c, s * 0.04, -s * 0.27, s * 0.07, s * 0.075);
  c.fill();
  c.fillStyle = '#f2d39a';
  c.fillRect(s * 0.06, -s * 0.285, s * 0.022, s * 0.016);

  // class detail
  if (cls === 'kowalka') {
    c.fillStyle = '#5b5550';
    c.fillRect(-s * 0.28, -s * 0.02, s * 0.12, s * 0.09);
    c.strokeStyle = '#3b2a1c';
    c.lineWidth = s * 0.035;
    c.beginPath();
    c.moveTo(-s * 0.22, s * 0.06);
    c.lineTo(-s * 0.18, s * 0.26);
    c.stroke();
  } else if (cls === 'alchemik') {
    for (let i = 0; i < 3; i++) {
      c.fillStyle = ['#8fd18b', '#e07a3f', '#7fb7e0'][i];
      ellipse(c, -s * 0.1 + i * s * 0.07, s * 0.1, s * 0.025, s * 0.035);
      c.fill();
    }
    c.strokeStyle = '#2a1a1f';
    c.lineWidth = s * 0.02;
    c.beginPath();
    c.moveTo(-s * 0.18, s * 0.07);
    c.lineTo(s * 0.1, s * 0.07);
    c.stroke();
  } else {
    c.strokeStyle = '#c69a52';
    c.lineWidth = s * 0.018;
    c.beginPath();
    c.moveTo(-s * 0.16, s * 0.04);
    c.lineTo(s * 0.15, s * 0.04);
    c.stroke();
  }

  // lantern frame
  c.fillStyle = '#2a1f17';
  c.fillRect(s * 0.3, -s * 0.28, s * 0.12, s * 0.03);
  c.fillRect(s * 0.3, -s * 0.12, s * 0.12, s * 0.03);
  c.restore();

  if (flash > 0) {
    c.save();
    c.globalAlpha = Math.min(1, flash) * 0.6;
    c.fillStyle = '#ff5a4a';
    ellipse(c, cx, cy - s * 0.02, s * 0.24, s * 0.36);
    c.fill();
    c.restore();
  }
}

/** Lantern glass position relative to the player centre. */
export function lanternOffset(s: number, face: number) {
  return { x: face < 0 ? -s * 0.36 : s * 0.36, y: -s * 0.2 };
}

export function drawLanternGlow(c: C, x: number, y: number, s: number, t: number, power: number) {
  const fl = 0.85 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.05;
  const r = s * 0.11;
  c.fillStyle = power > 0 ? `rgba(255, 214, 140, ${0.95 * fl})` : 'rgba(120, 90, 60, 0.6)';
  c.fillRect(x - r * 0.6, y - r, r * 1.2, r * 1.6);
  if (power > 0) {
    const g = c.createRadialGradient(x, y, 0, x, y, s * 0.5);
    g.addColorStop(0, `rgba(255,190,100,${0.45 * fl})`);
    g.addColorStop(1, 'rgba(255,150,60,0)');
    c.fillStyle = g;
    c.fillRect(x - s * 0.5, y - s * 0.5, s, s);
  }
}

// ------------------------------------------------------------------ enemies
const EYE: Record<EnemyType, string> = {
  cien: '#cfe8ff',
  smigacz: '#ffe27a',
  gasiciel: '#c8a4ff',
  smolnik: '#b6e07a',
  lowca: '#ff6a5a',
  matka: '#ffffff',
};
export const ENEMY_EYE = EYE;

function wisp(c: C, cx: number, cy: number, s: number, t: number, seed: number, scale: number, col: string) {
  c.fillStyle = col;
  c.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const wob = 1 + Math.sin(a * 3 + t * 3 + seed) * 0.08 + Math.sin(a * 5 - t * 4.1 + seed * 2) * 0.05;
    const rx = s * 0.26 * scale * wob;
    const ry = s * 0.3 * scale * wob;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry * (Math.sin(a) > 0 ? 1.15 : 1);
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
  c.fill();
}

export function drawEnemy(c: C, type: EnemyType, cx: number, cy: number, s: number, t: number, id: number, elite: boolean, flash = 0) {
  const seed = id * 1.7;
  const hover = Math.sin(t * 2.5 + seed) * s * 0.03;
  c.save();
  if (type !== 'smolnik') drawShadowBlob(c, cx, cy, s, 0.4);
  const rim = elite ? 'rgba(190,120,255,0.9)' : 'rgba(150,175,220,0.55)';
  switch (type) {
    case 'cien': {
      const y = cy - s * 0.06 + hover;
      c.shadowColor = rim;
      c.shadowBlur = s * 0.12;
      wisp(c, cx, y, s, t, seed, 1, '#0b0d16');
      c.shadowBlur = 0;
      wisp(c, cx, y + s * 0.03, s, t * 1.3, seed + 1, 0.75, '#161a28');
      // tail wisps
      c.fillStyle = 'rgba(11,13,22,0.8)';
      for (let i = 0; i < 3; i++) {
        const tx = cx + (i - 1) * s * 0.12 + Math.sin(t * 3 + i + seed) * s * 0.03;
        ellipse(c, tx, y + s * 0.3, s * 0.05, s * 0.1);
        c.fill();
      }
      break;
    }
    case 'smigacz': {
      const y = cy - s * 0.04 + hover;
      c.shadowColor = rim;
      c.shadowBlur = s * 0.12;
      c.fillStyle = '#0a0c14';
      c.beginPath();
      c.moveTo(cx + s * 0.28, y - s * 0.08);
      c.quadraticCurveTo(cx + s * 0.05, y - s * 0.32, cx - s * 0.18, y - s * 0.12);
      c.quadraticCurveTo(cx - s * 0.46 + Math.sin(t * 8) * s * 0.04, y, cx - s * 0.36, y + s * 0.14);
      c.quadraticCurveTo(cx - s * 0.05, y + s * 0.28, cx + s * 0.28, y - s * 0.08);
      c.fill();
      c.shadowBlur = 0;
      c.strokeStyle = 'rgba(30,34,52,0.9)';
      c.lineWidth = s * 0.03;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(cx - s * 0.2, y - s * 0.05 + i * s * 0.07);
        c.lineTo(cx - s * 0.42 - i * s * 0.03, y - s * 0.02 + i * s * 0.09);
        c.stroke();
      }
      break;
    }
    case 'gasiciel': {
      const y = cy + hover * 0.5;
      c.shadowColor = rim;
      c.shadowBlur = s * 0.1;
      c.fillStyle = '#0d0b14';
      c.beginPath();
      c.moveTo(cx - s * 0.2, y + s * 0.32);
      c.quadraticCurveTo(cx - s * 0.2, y - s * 0.1, cx - s * 0.06, y - s * 0.18);
      c.lineTo(cx + s * 0.06, y - s * 0.18);
      c.quadraticCurveTo(cx + s * 0.2, y - s * 0.1, cx + s * 0.2, y + s * 0.32);
      c.closePath();
      c.fill();
      // snuffer cone hat
      c.fillStyle = '#1b1626';
      c.beginPath();
      c.moveTo(cx - s * 0.16, y - s * 0.16);
      c.lineTo(cx + s * 0.02, y - s * 0.52);
      c.lineTo(cx + s * 0.16, y - s * 0.16);
      c.closePath();
      c.fill();
      c.shadowBlur = 0;
      // long arm with snuffer
      c.strokeStyle = '#0d0b14';
      c.lineWidth = s * 0.045;
      c.beginPath();
      c.moveTo(cx + s * 0.12, y);
      c.quadraticCurveTo(cx + s * 0.32, y - s * 0.1 + Math.sin(t * 2 + seed) * s * 0.04, cx + s * 0.36, y - s * 0.26);
      c.stroke();
      c.fillStyle = '#2a2236';
      c.beginPath();
      c.moveTo(cx + s * 0.3, y - s * 0.24);
      c.lineTo(cx + s * 0.42, y - s * 0.24);
      c.lineTo(cx + s * 0.36, y - s * 0.34);
      c.fill();
      break;
    }
    case 'smolnik': {
      const y = cy + s * 0.12;
      const pulse = 1 + Math.sin(t * 2 + seed) * 0.05;
      c.shadowColor = rim;
      c.shadowBlur = s * 0.1;
      c.fillStyle = '#0c0f0a';
      ellipse(c, cx, y + s * 0.1, s * 0.36 * pulse, s * 0.14);
      c.fill();
      c.beginPath();
      c.moveTo(cx - s * 0.26, y + s * 0.1);
      c.quadraticCurveTo(cx - s * 0.22, y - s * 0.28 * pulse, cx, y - s * 0.3 * pulse);
      c.quadraticCurveTo(cx + s * 0.22, y - s * 0.28 * pulse, cx + s * 0.26, y + s * 0.1);
      c.fill();
      c.shadowBlur = 0;
      // glossy highlight
      c.fillStyle = 'rgba(160,190,140,0.18)';
      ellipse(c, cx - s * 0.08, y - s * 0.16, s * 0.07, s * 0.04);
      c.fill();
      // drips
      c.fillStyle = '#0c0f0a';
      for (let i = 0; i < 3; i++) {
        const dx = cx + (i - 1) * s * 0.2;
        const len = (Math.sin(t * 1.5 + i * 2 + seed) * 0.5 + 0.5) * s * 0.08;
        ellipse(c, dx, y + s * 0.2 + len, s * 0.025, s * 0.03 + len * 0.3);
        c.fill();
      }
      break;
    }
    case 'lowca': {
      const y = cy + hover * 0.4;
      c.shadowColor = elite ? rim : 'rgba(255,90,80,0.45)';
      c.shadowBlur = s * 0.12;
      c.fillStyle = '#0d090b';
      c.beginPath();
      const spikes = 7;
      for (let i = 0; i <= spikes * 2; i++) {
        const a = Math.PI + (i / (spikes * 2)) * Math.PI;
        const r = i % 2 === 0 ? s * 0.34 : s * 0.2;
        const x = cx + Math.cos(a) * r;
        const yy = y + s * 0.12 + Math.sin(a) * r * 0.9;
        if (i === 0) c.moveTo(x, yy);
        else c.lineTo(x, yy);
      }
      c.lineTo(cx + s * 0.3, y + s * 0.28);
      c.lineTo(cx - s * 0.3, y + s * 0.28);
      c.closePath();
      c.fill();
      c.shadowBlur = 0;
      // claws
      c.strokeStyle = '#2a1416';
      c.lineWidth = s * 0.03;
      for (const sx of [-1, 1]) {
        c.beginPath();
        c.moveTo(cx + sx * s * 0.22, y + s * 0.2);
        c.lineTo(cx + sx * s * 0.34, y + s * 0.34);
        c.stroke();
      }
      break;
    }
    case 'matka': {
      const y = cy - s * 0.1;
      const S = s * 1.5;
      c.shadowColor = 'rgba(160,120,255,0.6)';
      c.shadowBlur = s * 0.3;
      wisp(c, cx, y, S, t * 0.7, seed, 1, '#07070d');
      c.shadowBlur = 0;
      wisp(c, cx, y + S * 0.04, S, t, seed + 3, 0.8, '#10101c');
      // tendrils
      c.strokeStyle = 'rgba(8,8,14,0.95)';
      c.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + t * 0.4;
        c.lineWidth = s * 0.06;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * S * 0.2, y + Math.sin(a) * S * 0.2);
        c.quadraticCurveTo(
          cx + Math.cos(a + 0.4) * S * 0.45,
          y + Math.sin(a + 0.4) * S * 0.45,
          cx + Math.cos(a + Math.sin(t + i) * 0.5) * S * 0.6,
          y + Math.sin(a + Math.sin(t + i) * 0.5) * S * 0.55,
        );
        c.stroke();
      }
      break;
    }
  }
  if (flash > 0) {
    c.globalAlpha = Math.min(1, flash) * 0.75;
    c.fillStyle = '#fff4dc';
    ellipse(c, cx, cy - s * 0.04, s * (type === 'matka' ? 0.5 : 0.26), s * (type === 'matka' ? 0.5 : 0.3));
    c.fill();
  }
  c.restore();
}

/** Emissive eyes — drawn above the darkness layer so they glimmer in the dark. */
export function drawEnemyEyes(c: C, type: EnemyType, cx: number, cy: number, s: number, t: number, id: number, alpha = 1) {
  const seed = id * 1.7;
  const hover = Math.sin(t * 2.5 + seed) * s * 0.03;
  const blink = Math.sin(t * 0.9 + seed * 3) > 0.985 ? 0.15 : 1;
  const col = EYE[type];
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = col;
  c.shadowColor = col;
  c.shadowBlur = s * 0.15;
  const pair = (x: number, y: number, sp: number, r: number) => {
    ellipse(c, x - sp, y, r, r * blink);
    c.fill();
    ellipse(c, x + sp, y, r, r * blink);
    c.fill();
  };
  switch (type) {
    case 'cien':
      pair(cx, cy - s * 0.12 + hover, s * 0.07, s * 0.035);
      break;
    case 'smigacz':
      pair(cx + s * 0.12, cy - s * 0.14 + hover, s * 0.05, s * 0.028);
      break;
    case 'gasiciel':
      pair(cx, cy - s * 0.06 + hover * 0.5, s * 0.06, s * 0.03);
      break;
    case 'smolnik':
      pair(cx, cy + s * 0.0, s * 0.08, s * 0.03);
      break;
    case 'lowca':
      pair(cx, cy - s * 0.0 + hover * 0.4, s * 0.09, s * 0.038);
      ellipse(c, cx, cy - s * 0.08, s * 0.025, s * 0.025);
      c.fill();
      break;
    case 'matka': {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + Math.sin(t * 0.3) * 0.2;
        const r = s * (0.22 + (i % 2) * 0.12);
        const ex = cx + Math.cos(a) * r;
        const ey = cy - s * 0.12 + Math.sin(a) * r * 0.8;
        const bl = Math.sin(t * 1.3 + i * 2.1) > 0.9 ? 0.2 : 1;
        ellipse(c, ex, ey, s * 0.045, s * 0.045 * bl);
        c.fill();
      }
      break;
    }
  }
  c.restore();
}

// ------------------------------------------------------------------ lamps
export function drawLampBase(c: C, kind: LampKind, lit: boolean, cx: number, cy: number, s: number) {
  if (kind === 'lamp') {
    drawShadowBlob(c, cx, cy + s * 0.04, s * 0.7, 0.4);
    // post
    c.fillStyle = '#1d1f24';
    c.fillRect(cx - s * 0.035, cy - s * 0.3, s * 0.07, s * 0.62);
    c.fillStyle = '#2b2e35';
    c.fillRect(cx - s * 0.08, cy + s * 0.26, s * 0.16, s * 0.08);
    c.fillRect(cx - s * 0.06, cy - s * 0.02, s * 0.12, s * 0.04);
    // head cage
    c.fillStyle = '#2b2e35';
    c.beginPath();
    c.moveTo(cx - s * 0.12, cy - s * 0.32);
    c.lineTo(cx + s * 0.12, cy - s * 0.32);
    c.lineTo(cx + s * 0.08, cy - s * 0.52);
    c.lineTo(cx - s * 0.08, cy - s * 0.52);
    c.closePath();
    c.fill();
    c.fillStyle = lit ? 'rgba(255,214,140,0.95)' : 'rgba(70,78,92,0.9)';
    c.fillRect(cx - s * 0.07, cy - s * 0.49, s * 0.14, s * 0.15);
    c.fillStyle = '#1d1f24';
    c.fillRect(cx - s * 0.13, cy - s * 0.56, s * 0.26, s * 0.05);
    c.fillRect(cx - s * 0.008, cy - s * 0.49, s * 0.016, s * 0.15);
  } else if (kind === 'brazier') {
    drawShadowBlob(c, cx, cy + s * 0.04, s * 1.1, 0.45);
    c.fillStyle = '#4b4640';
    c.fillRect(cx - s * 0.18, cy + s * 0.1, s * 0.36, s * 0.2);
    c.fillStyle = '#3a3631';
    c.fillRect(cx - s * 0.22, cy + s * 0.26, s * 0.44, s * 0.08);
    // bowl
    const g = c.createLinearGradient(cx, cy - s * 0.15, cx, cy + s * 0.12);
    g.addColorStop(0, '#6d5a3f');
    g.addColorStop(1, '#3a2c1d');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(cx - s * 0.32, cy - s * 0.12);
    c.lineTo(cx + s * 0.32, cy - s * 0.12);
    c.quadraticCurveTo(cx + s * 0.26, cy + s * 0.14, cx, cy + s * 0.14);
    c.quadraticCurveTo(cx - s * 0.26, cy + s * 0.14, cx - s * 0.32, cy - s * 0.12);
    c.fill();
    c.fillStyle = lit ? '#ffb45a' : '#191512';
    ellipse(c, cx, cy - s * 0.12, s * 0.3, s * 0.07);
    c.fill();
    c.strokeStyle = '#8a7350';
    c.lineWidth = s * 0.025;
    ellipse(c, cx, cy - s * 0.12, s * 0.32, s * 0.08);
    c.stroke();
  } else {
    // lighthouse: stone tower
    drawShadowBlob(c, cx, cy + s * 0.08, s * 1.6, 0.5);
    const g = c.createLinearGradient(cx - s * 0.3, 0, cx + s * 0.3, 0);
    g.addColorStop(0, '#5d5a62');
    g.addColorStop(0.5, '#8a8590');
    g.addColorStop(1, '#4a4750');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(cx - s * 0.36, cy + s * 0.34);
    c.lineTo(cx - s * 0.22, cy - s * 0.9);
    c.lineTo(cx + s * 0.22, cy - s * 0.9);
    c.lineTo(cx + s * 0.36, cy + s * 0.34);
    c.closePath();
    c.fill();
    c.fillStyle = '#8e3b31';
    for (const k of [0.05, -0.45]) {
      c.beginPath();
      c.moveTo(cx - s * (0.33 - (0.05 - k) * 0.12), cy + s * k);
      c.lineTo(cx + s * (0.33 - (0.05 - k) * 0.12), cy + s * k);
      c.lineTo(cx + s * (0.3 - (0.05 - k) * 0.12), cy + s * (k - 0.18));
      c.lineTo(cx - s * (0.3 - (0.05 - k) * 0.12), cy + s * (k - 0.18));
      c.closePath();
      c.fill();
    }
    c.fillStyle = '#25232a';
    c.fillRect(cx - s * 0.28, cy - s * 0.98, s * 0.56, s * 0.08);
    c.fillStyle = lit ? '#ffe6a8' : '#2e3442';
    c.fillRect(cx - s * 0.16, cy - s * 1.22, s * 0.32, s * 0.24);
    c.fillStyle = '#25232a';
    c.beginPath();
    c.moveTo(cx - s * 0.22, cy - s * 1.22);
    c.lineTo(cx, cy - s * 1.42);
    c.lineTo(cx + s * 0.22, cy - s * 1.22);
    c.closePath();
    c.fill();
    c.fillStyle = '#3a2b20';
    c.fillRect(cx - s * 0.08, cy + s * 0.12, s * 0.16, s * 0.22);
  }
}

export function flamePoint(kind: LampKind, cx: number, cy: number, s: number) {
  if (kind === 'lamp') return { x: cx, y: cy - s * 0.42, size: s * 0.18 };
  if (kind === 'brazier') return { x: cx, y: cy - s * 0.14, size: s * 0.42 };
  return { x: cx, y: cy - s * 1.1, size: s * 0.5 };
}

export function drawFlame(c: C, x: number, y: number, size: number, t: number, seed = 0, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  const layers: [string, number][] = [
    ['rgba(255,110,40,0.85)', 1],
    ['rgba(255,170,70,0.9)', 0.72],
    ['rgba(255,236,170,0.95)', 0.42],
  ];
  for (const [col, k] of layers) {
    const h = size * 1.3 * k * (1 + Math.sin(t * 11 + seed) * 0.08 + Math.sin(t * 17.3 + seed * 2) * 0.05);
    const w = size * 0.5 * k;
    const sway = Math.sin(t * 6 + seed) * size * 0.08 * k;
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x - w, y);
    c.quadraticCurveTo(x - w * 0.9, y - h * 0.5, x + sway, y - h);
    c.quadraticCurveTo(x + w * 0.9, y - h * 0.5, x + w, y);
    c.quadraticCurveTo(x, y + w * 0.6, x - w, y);
    c.fill();
  }
  c.restore();
}

// ------------------------------------------------------------------ items
export function drawItem(c: C, kind: ItemKind, cx: number, cy: number, s: number, t: number) {
  const bob = Math.sin(t * 2.4 + cx * 0.1) * s * 0.025;
  switch (kind) {
    case 'oil': {
      drawShadowBlob(c, cx, cy, s * 0.7);
      const y = cy + bob;
      c.fillStyle = '#6b4a22';
      c.beginPath();
      c.moveTo(cx - s * 0.15, y + s * 0.22);
      c.lineTo(cx - s * 0.15, y - s * 0.08);
      c.lineTo(cx - s * 0.06, y - s * 0.18);
      c.lineTo(cx + s * 0.15, y - s * 0.18);
      c.lineTo(cx + s * 0.15, y + s * 0.22);
      c.closePath();
      c.fill();
      c.fillStyle = '#8c6430';
      c.fillRect(cx - s * 0.15, y - s * 0.02, s * 0.3, s * 0.05);
      c.fillStyle = '#3e2a12';
      c.fillRect(cx + s * 0.02, y - s * 0.26, s * 0.08, s * 0.08);
      c.strokeStyle = '#3e2a12';
      c.lineWidth = s * 0.03;
      c.beginPath();
      c.moveTo(cx - s * 0.08, y - s * 0.18);
      c.quadraticCurveTo(cx - s * 0.02, y - s * 0.3, cx + s * 0.04, y - s * 0.18);
      c.stroke();
      c.fillStyle = '#e8b04b';
      ellipse(c, cx, y + s * 0.09, s * 0.05, s * 0.065);
      c.fill();
      break;
    }
    case 'embers': {
      drawShadowBlob(c, cx, cy, s * 0.6);
      c.fillStyle = '#2a1d16';
      ellipse(c, cx, cy + s * 0.14, s * 0.2, s * 0.08);
      c.fill();
      break;
    }
    case 'event': {
      drawShadowBlob(c, cx, cy, s * 0.6);
      c.fillStyle = '#3a3027';
      c.fillRect(cx - s * 0.16, cy - s * 0.05, s * 0.32, s * 0.28);
      c.fillStyle = '#5a4936';
      c.fillRect(cx - s * 0.2, cy - s * 0.1, s * 0.4, s * 0.07);
      break;
    }
    case 'shrine': {
      drawShadowBlob(c, cx, cy, s * 0.6);
      c.fillStyle = '#4b4842';
      c.beginPath();
      c.moveTo(cx - s * 0.16, cy + s * 0.28);
      c.lineTo(cx - s * 0.16, cy - s * 0.12);
      c.lineTo(cx, cy - s * 0.3);
      c.lineTo(cx + s * 0.16, cy - s * 0.12);
      c.lineTo(cx + s * 0.16, cy + s * 0.28);
      c.closePath();
      c.fill();
      c.fillStyle = '#1b1915';
      c.fillRect(cx - s * 0.07, cy - s * 0.08, s * 0.14, s * 0.16);
      break;
    }
  }
}

/** Emissive parts of items (glowing coals, event lantern). */
export function drawItemGlow(c: C, kind: ItemKind, cx: number, cy: number, s: number, t: number) {
  if (kind === 'embers') {
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      const x = cx + Math.cos(a) * s * 0.1;
      const y = cy + s * 0.12 + Math.sin(a) * s * 0.035;
      const fl = 0.6 + Math.sin(t * 5 + i * 2) * 0.4;
      c.fillStyle = `rgba(255,${120 + i * 15},50,${fl})`;
      ellipse(c, x, y, s * 0.04, s * 0.03);
      c.fill();
    }
    const g = c.createRadialGradient(cx, cy + s * 0.12, 0, cx, cy + s * 0.12, s * 0.35);
    g.addColorStop(0, 'rgba(255,120,40,0.35)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    c.fillStyle = g;
    c.fillRect(cx - s * 0.4, cy - s * 0.3, s * 0.8, s * 0.8);
  } else if (kind === 'event') {
    const fl = 0.7 + Math.sin(t * 3) * 0.3;
    c.fillStyle = `rgba(240,196,108,${fl})`;
    c.font = `600 ${Math.round(s * 0.34)}px Lora, Georgia, serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('?', cx, cy - s * 0.32 + Math.sin(t * 2) * s * 0.03);
  } else if (kind === 'shrine') {
    drawFlame(c, cx, cy + s * 0.06, s * 0.1, t, 3, 0.9);
  } else if (kind === 'oil') {
    const fl = 0.25 + Math.sin(t * 3 + cx) * 0.15;
    c.fillStyle = `rgba(232,176,75,${fl})`;
    ellipse(c, cx, cy + s * 0.09, s * 0.08, s * 0.1);
    c.fill();
  }
}

export function drawGate(c: C, cx: number, cy: number, s: number, open: boolean, t: number) {
  const x0 = cx - s * 0.46;
  const y0 = cy - s * 0.5;
  c.fillStyle = '#26221e';
  c.fillRect(x0, y0, s * 0.12, s);
  c.fillRect(cx + s * 0.34, y0, s * 0.12, s);
  c.beginPath();
  c.moveTo(x0, y0 + s * 0.1);
  c.quadraticCurveTo(cx, y0 - s * 0.25, cx + s * 0.46, y0 + s * 0.1);
  c.lineTo(cx + s * 0.46, y0 + s * 0.2);
  c.quadraticCurveTo(cx, y0 - s * 0.12, x0, y0 + s * 0.2);
  c.fill();
  const lift = open ? s * 0.7 : 0;
  c.strokeStyle = open ? '#6e5a3c' : '#4a4038';
  c.lineWidth = s * 0.035;
  for (let i = 0; i < 5; i++) {
    const x = cx - s * 0.26 + i * s * 0.13;
    c.beginPath();
    c.moveTo(x, y0 + s * 0.08);
    c.lineTo(x, y0 + s * 0.98 - lift);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(cx - s * 0.32, y0 + s * 0.55 - lift * 0.6);
  c.lineTo(cx + s * 0.32, y0 + s * 0.55 - lift * 0.6);
  c.stroke();
  if (open) {
    const fl = 0.55 + Math.sin(t * 2) * 0.15;
    const g = c.createLinearGradient(cx, y0 + s, cx, y0);
    g.addColorStop(0, `rgba(255,214,140,${0.45 * fl})`);
    g.addColorStop(1, 'rgba(255,214,140,0)');
    c.fillStyle = g;
    c.fillRect(cx - s * 0.32, y0 + s * 0.1, s * 0.64, s * 0.9);
  }
}
