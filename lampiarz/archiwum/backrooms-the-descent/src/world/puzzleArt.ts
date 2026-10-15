// Images that carry the puzzle: clock faces, the roster board, tally marks in the
// cage, the UV writing, the lying paint, the symbol plate of the armory door.
// Symbols are drawn as paths so they never depend on font coverage.
import { canvas } from '../engine/textures';
import type { Puzzle } from '../game/puzzle';
import type { Sym } from './map';

export function drawSymbol(g: CanvasRenderingContext2D, s: Sym, x: number, y: number, size: number, color: string, width = size * 0.12) {
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const r = size / 2;
  g.beginPath();
  switch (s) {
    case 'circle':
      g.arc(x, y, r * 0.85, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'triangle':
      g.moveTo(x, y - r * 0.9);
      g.lineTo(x + r * 0.9, y + r * 0.75);
      g.lineTo(x - r * 0.9, y + r * 0.75);
      g.closePath();
      g.stroke();
      break;
    case 'square':
      g.rect(x - r * 0.78, y - r * 0.78, r * 1.56, r * 1.56);
      g.stroke();
      break;
    case 'cross':
      g.moveTo(x - r * 0.75, y - r * 0.75);
      g.lineTo(x + r * 0.75, y + r * 0.75);
      g.moveTo(x + r * 0.75, y - r * 0.75);
      g.lineTo(x - r * 0.75, y + r * 0.75);
      g.stroke();
      break;
    case 'eye':
      g.moveTo(x - r * 0.95, y);
      g.quadraticCurveTo(x, y - r * 0.95, x + r * 0.95, y);
      g.quadraticCurveTo(x, y + r * 0.95, x - r * 0.95, y);
      g.stroke();
      g.beginPath();
      g.arc(x, y, r * 0.28, 0, Math.PI * 2);
      g.fill();
      break;
  }
  g.restore();
}

/** Clock face; the hands are drawn separately for the live clock (it moves). */
export function clockFace(h: number | null, m: number | null): HTMLCanvasElement {
  const [c, g] = canvas(256);
  g.fillStyle = '#e8e2cf';
  g.beginPath();
  g.arc(128, 128, 122, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = '#2b2620';
  g.stroke();
  g.fillStyle = '#2b2620';
  g.font = 'bold 30px "BD Sans", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    g.fillText(String(i), 128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
  }
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r0 = i % 5 === 0 ? 106 : 112;
    g.lineWidth = i % 5 === 0 ? 3 : 1.5;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0);
    g.lineTo(128 + Math.cos(a) * 117, 128 + Math.sin(a) * 117);
    g.stroke();
  }
  // stain and a crack in the glass
  g.fillStyle = 'rgba(120,90,40,0.18)';
  g.beginPath();
  g.ellipse(170, 90, 50, 30, 0.6, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(60, 40);
  g.lineTo(100, 110);
  g.lineTo(90, 170);
  g.stroke();
  if (h !== null && m !== null) drawHands(g, h, m, null);
  return c;
}

export function drawHands(g: CanvasRenderingContext2D, h: number, m: number, s: number | null) {
  const ha = ((h % 12) + m / 60) / 12 * Math.PI * 2 - Math.PI / 2;
  const ma = (m / 60) * Math.PI * 2 - Math.PI / 2;
  g.strokeStyle = '#141210';
  g.lineCap = 'round';
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(128, 128);
  g.lineTo(128 + Math.cos(ha) * 58, 128 + Math.sin(ha) * 58);
  g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(128, 128);
  g.lineTo(128 + Math.cos(ma) * 88, 128 + Math.sin(ma) * 88);
  g.stroke();
  if (s !== null) {
    const sa = (s / 60) * Math.PI * 2 - Math.PI / 2;
    g.strokeStyle = '#a01810';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(128 - Math.cos(sa) * 18, 128 - Math.sin(sa) * 18);
    g.lineTo(128 + Math.cos(sa) * 100, 128 + Math.sin(sa) * 100);
    g.stroke();
  }
  g.fillStyle = '#141210';
  g.beginPath();
  g.arc(128, 128, 7, 0, Math.PI * 2);
  g.fill();
}

/** The Zwiad 4 roster pinned to a cork board. */
export function rosterCanvas(p: Puzzle): HTMLCanvasElement {
  const [c, g] = canvas(1024, 600);
  g.fillStyle = '#7a5a36';
  g.fillRect(0, 0, 1024, 600);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? 40 : 150},${Math.random() < 0.5 ? 26 : 110},10,0.25)`;
    g.fillRect(Math.random() * 1024, Math.random() * 600, 2, 2);
  }
  g.fillStyle = '#e9e4d6';
  g.save();
  g.translate(512, 300);
  g.rotate(-0.012);
  g.fillRect(-380, -270, 760, 540);
  g.fillStyle = '#1c1a17';
  g.font = 'bold 40px "BD Display", sans-serif';
  g.textAlign = 'left';
  g.fillText('ZWIAD 4 — SKŁAD', -340, -215);
  g.font = '32px "BD Sans", sans-serif';
  p.roster.forEach((r, i) => {
    const y = -150 + i * 50;
    g.fillStyle = '#1c1a17';
    g.fillText(`${i + 1}. ${r.name}`, -320, y);
    if (r.mark) {
      const col = r.mark === 'black' ? 'rgba(15,12,10,0.95)' : 'rgba(190,20,14,0.95)';
      drawSymbol(g, 'cross', 220, y - 11, 40, col, 6);
    }
  });
  g.restore();
  // pins
  for (const [x, y] of [
    [150, 50],
    [870, 52],
    [150, 552],
    [868, 548],
  ]) {
    g.fillStyle = '#b02a20';
    g.beginPath();
    g.arc(x, y, 9, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Square symbol and tally marks drawn on the cage wall. */
export function tallyCanvas(n: number): HTMLCanvasElement {
  const [c, g] = canvas(512, 384);
  // scratched pale paint: has to read through a noisy camera feed
  const col = 'rgba(236,230,214,0.96)';
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 6;
  drawSymbol(g, 'square', 256, 92, 120, col, 18);
  g.strokeStyle = col;
  g.lineWidth = 20;
  g.lineCap = 'round';
  const w = 46;
  const x0 = 256 - ((n - 1) * w) / 2;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * w + (Math.random() - 0.5) * 6;
    g.beginPath();
    g.moveTo(x, 186 + Math.random() * 8);
    g.lineTo(x + (Math.random() - 0.5) * 10, 350 + Math.random() * 10);
    g.stroke();
  }
  return c;
}

/** The writing in UV ink: an eye and dots (glows only under the UV lamp). */
export function uvCanvas(n: number): HTMLCanvasElement {
  const [c, g] = canvas(512, 256);
  g.shadowColor = 'rgba(180,140,255,0.9)';
  g.shadowBlur = 14;
  const col = 'rgba(200,180,255,0.95)';
  drawSymbol(g, 'eye', 120, 128, 150, col, 12);
  g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const x = 240 + (i % 5) * 52;
    const y = 96 + Math.floor(i / 5) * 64;
    g.beginPath();
    g.arc(x, y, 15, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** The lie in ordinary paint. */
export function paintCanvas(n: number): HTMLCanvasElement {
  const [c, g] = canvas(512, 256);
  const col = 'rgba(30,22,18,0.9)';
  drawSymbol(g, 'eye', 110, 128, 130, col, 12);
  g.fillStyle = col;
  g.font = 'bold 150px "BD Display", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`= ${n}`, 330, 136);
  // drips
  g.fillRect(300, 190, 6, 50);
  g.fillRect(380, 196, 5, 36);
  return c;
}

/** Symbol plate above the armory keypad: the order of the code. */
export function plateCanvas(order: Sym[]): HTMLCanvasElement {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#2a2b2c';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = 'rgba(255,255,255,0.3)';
  g.lineWidth = 4;
  g.strokeRect(5, 5, 502, 118);
  order.forEach((s, i) => drawSymbol(g, s, 64 + i * 96, 64, 70, '#d9d2bc', 8));
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`;
    g.fillRect(Math.random() * 512, Math.random() * 128, 3, 3);
  }
  return c;
}

/** Hand-drawn notes and scratches on the walls (atmosphere, not puzzle). */
export function scribbleCanvas(kind: 'count' | 'arrow' | 'nie' | 'help' | 'eye' | 'run'): HTMLCanvasElement {
  const [c, g] = canvas(512, 256);
  const col = kind === 'help' || kind === 'run' ? 'rgba(96,8,6,0.85)' : 'rgba(26,20,16,0.85)';
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = 8;
  g.lineCap = 'round';
  g.font = 'bold 84px "BD Display", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (kind === 'count') {
    for (let k = 0; k < 4; k++)
      for (let i = 0; i < 5; i++) {
        const x = 60 + k * 110 + i * 16;
        g.beginPath();
        g.moveTo(x, 70);
        g.lineTo(x + 2, 180);
        g.stroke();
      }
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.moveTo(50 + k * 110, 160);
      g.lineTo(140 + k * 110, 90);
      g.stroke();
    }
  } else if (kind === 'arrow') {
    g.beginPath();
    g.moveTo(80, 128);
    g.lineTo(430, 128);
    g.lineTo(380, 80);
    g.moveTo(430, 128);
    g.lineTo(380, 176);
    g.stroke();
    g.font = 'bold 40px "BD Display", sans-serif';
    g.fillText('ZBROJOWNIA', 250, 210);
  } else if (kind === 'nie') g.fillText('NIE ODPOWIADAJ', 256, 128, 490);
  else if (kind === 'help') g.fillText('ONO NAŚLADUJE', 256, 128, 490);
  else if (kind === 'run') g.fillText('NIE BIEGNIJ', 256, 128, 490);
  else {
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(80, 128);
    g.quadraticCurveTo(256, 20, 432, 128);
    g.quadraticCurveTo(256, 236, 80, 128);
    g.stroke();
    g.beginPath();
    g.arc(256, 128, 34, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}
