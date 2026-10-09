// In-game HUD drawn on the canvas: vitals, resonance, flasks, currency, boss bar,
// interaction prompt, hint banner, announcements.
import { LOCATIONS } from '../data/content';
import { clamp, easeOut } from '../core/util';
import type { World } from '../world/world';
import { STATION_LABEL } from '../world/world';
import { glow, mix, rgba, star, type Ctx } from './paint';

export const SERIF = 'Pagella, "Palatino Linotype", Palatino, Georgia, serif';
export const DISPLAY = 'Chorus, Pagella, Georgia, serif';

export interface Banner {
  text: string;
  sub?: string;
  t: number;
  dur: number;
  big: boolean;
}

export class HudState {
  hpShown = 100;
  bossShown = 1;
  banners: Banner[] = [];
  toasts: { text: string; sub?: string; t: number }[] = [];

  announce(text: string, sub?: string, big = false, dur = 2.6) {
    this.banners = this.banners.filter((b) => b.big !== big);
    this.banners.push({ text, sub, t: 0, dur, big });
  }

  toast(text: string, sub?: string) {
    this.toasts.push({ text, sub, t: 0 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  update(dt: number) {
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter((b) => b.t < b.dur);
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < 3.4);
  }
}

function frameBar(g: Ctx, x: number, y: number, w: number, h: number) {
  g.fillStyle = 'rgba(8,6,6,0.75)';
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.strokeStyle = 'rgba(190,160,110,0.55)';
  g.lineWidth = 1;
  g.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
  // ornamental caps
  g.fillStyle = 'rgba(190,160,110,0.8)';
  g.beginPath();
  g.moveTo(x - 7, y + h / 2);
  g.lineTo(x - 2, y - 3);
  g.lineTo(x - 2, y + h + 3);
  g.fill();
}

function smallBell(g: Ctx, x: number, y: number, fill: number, time: number) {
  g.fillStyle = 'rgba(20,14,10,0.85)';
  g.beginPath();
  g.moveTo(x - 7, y + 6);
  g.quadraticCurveTo(x - 7, y - 7, x, y - 8);
  g.quadraticCurveTo(x + 7, y - 7, x + 7, y + 6);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(200,160,100,0.7)';
  g.lineWidth = 1;
  g.stroke();
  if (fill > 0) {
    g.save();
    g.beginPath();
    g.moveTo(x - 6, y + 5);
    g.quadraticCurveTo(x - 6, y - 6, x, y - 7);
    g.quadraticCurveTo(x + 6, y - 6, x + 6, y + 5);
    g.closePath();
    g.clip();
    g.fillStyle = fill >= 1 ? '#ffd27a' : '#a8803e';
    g.fillRect(x - 7, y + 6 - 14 * fill, 14, 14 * fill);
    g.restore();
    if (fill >= 1) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      glow(g, x, y, 14, '#ffcf7a', 0.35 + Math.sin(time * 4 + x) * 0.1);
      g.restore();
    }
  }
}

function waxTear(g: Ctx, x: number, y: number, lit: boolean) {
  g.fillStyle = lit ? '#f2e2bc' : 'rgba(80,70,60,0.6)';
  g.beginPath();
  g.moveTo(x, y - 9);
  g.quadraticCurveTo(x + 6, y, x, y + 5);
  g.quadraticCurveTo(x - 6, y, x, y - 9);
  g.fill();
  if (lit) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, x, y - 1, 12, '#ffcf7a', 0.35);
    g.restore();
  }
}

export function promptLabel(w: World): string | null {
  const it = w.focus;
  if (!it) return null;
  switch (it.kind) {
    case 'shrine':
      return it.used ? 'Odpocznij' : 'Zapal kapliczkę';
    case 'chest':
      return 'Otwórz';
    case 'lore':
      return 'Czytaj kronikę';
    case 'event':
      return it.data === 'duch' ? 'Wysłuchaj ducha' : it.data === 'oltarz' ? 'Ołtarz Popiołu' : 'Wędrowny Mumrot';
    case 'station':
      return STATION_LABEL[it.data] ?? null;
    case 'portal':
      return 'Wróć do Krypty';
    default:
      return null;
  }
}

export function drawHud(g: Ctx, w: World, hud: HudState, viewW: number, viewH: number, time: number, usingPad: boolean, zoom: number) {
  const p = w.player;
  const s = p.stats;
  hud.hpShown += (p.hp - hud.hpShown) * (p.hp < hud.hpShown ? 0.04 : 0.3);

  // ---- vitals
  const x = 26;
  const hpW = Math.min(360, 150 + s.maxHp * 1.1);
  frameBar(g, x, 22, hpW, 11);
  g.fillStyle = '#e8d8c0';
  g.fillRect(x, 22, hpW * clamp(hud.hpShown / p.maxHp, 0, 1), 11);
  const hpG = g.createLinearGradient(0, 22, 0, 33);
  hpG.addColorStop(0, '#c23a2a');
  hpG.addColorStop(1, '#6a1410');
  g.fillStyle = hpG;
  g.fillRect(x, 22, hpW * clamp(p.hp / p.maxHp, 0, 1), 11);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(x, 22, hpW * clamp(p.hp / p.maxHp, 0, 1), 2);

  const stW = Math.min(300, 110 + s.maxStamina * 1.1);
  frameBar(g, x, 40, stW, 6);
  g.fillStyle = p.staminaFlash > 0 ? mix('#d8c48a', '#ff4a3a', Math.sin(time * 30) * 0.5 + 0.5) : '#d8c48a';
  g.fillRect(x, 40, stW * clamp(p.stamina / s.maxStamina, 0, 1), 6);

  // ---- resonance bells
  for (let i = 0; i < s.pips; i++) smallBell(g, x + 6 + i * 20, 66, clamp(p.resonance - i, 0, 1), time);
  // ---- wax tears (flasks)
  for (let i = 0; i < p.flaskMax; i++) waxTear(g, x + 4 + i * 14, 92, i < p.flasks);
  g.font = `13px ${SERIF}`;
  g.fillStyle = 'rgba(232,220,196,0.7)';
  g.textAlign = 'left';
  if (p.riposteT > 0) {
    g.fillStyle = `rgba(255,210,122,${0.6 + Math.sin(time * 12) * 0.3})`;
    g.fillText('Riposta gotowa', x, 118);
  }

  // ---- currency (top right)
  g.textAlign = 'right';
  g.font = `18px ${SERIF}`;
  g.fillStyle = '#e9d9b6';
  g.fillText(`${w.save.zuzel}`, viewW - 30, 32);
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, viewW - 20, 26, 12, '#ffb766', 0.7);
  g.restore();
  g.fillStyle = '#ffb766';
  g.beginPath();
  g.arc(viewW - 20, 26, 4, 0, Math.PI * 2);
  g.fill();
  g.font = `12px ${SERIF}`;
  g.fillStyle = 'rgba(232,220,196,0.6)';
  g.fillText('żużel', viewW - 30, 46);
  if (w.save.shards > 0) {
    g.fillStyle = '#c9a26a';
    g.font = `14px ${SERIF}`;
    g.fillText(`odłamki spiżu: ${w.save.shards}`, viewW - 30, 66);
  }

  // ---- off-screen marker for lost ash
  if (w.lostAsh) {
    const sx = (w.lostAsh.x - w.camX) * zoom;
    if (sx < 0 || sx > viewW) {
      const right = sx > viewW;
      const ax = right ? viewW - 22 : 22;
      const ay = viewH / 2;
      g.save();
      g.globalCompositeOperation = 'lighter';
      glow(g, ax, ay, 20, '#ffd38a', 0.5 + Math.sin(time * 4) * 0.2);
      g.restore();
      g.fillStyle = '#ffd38a';
      g.beginPath();
      g.moveTo(ax + (right ? 8 : -8), ay);
      g.lineTo(ax + (right ? -4 : 4), ay - 8);
      g.lineTo(ax + (right ? -4 : 4), ay + 8);
      g.fill();
      g.font = `12px ${SERIF}`;
      g.textAlign = right ? 'right' : 'left';
      g.fillText(`twój popiół: ${w.lostAsh.amount}`, right ? viewW - 34 : 34, ay + 4);
    }
  }

  // ---- off-screen boss marker
  const ob = w.boss;
  if (ob && w.bossStarted && !ob.dead && ob.state !== 'intro') {
    const bx = (ob.cx - w.camX) * zoom;
    if (bx < -10 || bx > viewW + 10) {
      const right = bx > viewW;
      const ax = right ? viewW - 20 : 20;
      const ay = clamp((ob.cy - w.camY) * zoom, 90, viewH - 90);
      const tg = ob.telegraph;
      const col = tg === 'red' ? '#ff4a3a' : tg === 'white' ? '#fff6dc' : '#d9a25a';
      g.save();
      g.globalCompositeOperation = 'lighter';
      glow(g, ax, ay, 26, col, 0.5 + Math.sin(time * 6) * 0.2);
      g.restore();
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(ax + (right ? 10 : -10), ay);
      g.lineTo(ax + (right ? -5 : 5), ay - 10);
      g.lineTo(ax + (right ? -5 : 5), ay + 10);
      g.fill();
    }
  }

  // ---- interaction prompt
  const label = promptLabel(w);
  if (label && w.focus && p.state !== 'dead') {
    const sx = (w.focus.x - w.camX) * zoom;
    const sy = (w.focus.y - w.camY - 70) * zoom;
    g.font = `15px ${SERIF}`;
    g.textAlign = 'center';
    const tw = g.measureText(label).width;
    const key = usingPad ? '▲' : 'E';
    const bw = tw + 46;
    g.fillStyle = 'rgba(10,8,8,0.72)';
    g.fillRect(sx - bw / 2, sy - 16, bw, 26);
    g.strokeStyle = 'rgba(200,170,110,0.5)';
    g.strokeRect(sx - bw / 2 + 0.5, sy - 15.5, bw - 1, 25);
    g.fillStyle = '#ffd27a';
    g.fillRect(sx - bw / 2 + 6, sy - 11, 18, 16);
    g.fillStyle = '#1a120a';
    g.font = `bold 12px ${SERIF}`;
    g.fillText(key, sx - bw / 2 + 15, sy + 1);
    g.font = `15px ${SERIF}`;
    g.fillStyle = '#efe3c8';
    g.fillText(label, sx + 12, sy + 2);
  }

  // ---- boss bar
  const b = w.boss;
  if (b && w.bossStarted && !b.dead && b.state !== 'intro') {
    const frac = clamp(b.hp / b.maxHp, 0, 1);
    hud.bossShown += (frac - hud.bossShown) * (frac < hud.bossShown ? 0.03 : 0.3);
    const bw = Math.min(640, viewW * 0.62);
    const bx = (viewW - bw) / 2;
    const by = viewH - 30;
    g.font = `22px ${DISPLAY}`;
    g.textAlign = 'center';
    g.fillStyle = '#efe3c8';
    g.fillText(b.name, viewW / 2, by - 10);
    g.font = `italic 13px ${SERIF}`;
    g.fillStyle = 'rgba(232,210,170,0.65)';
    g.fillText(b.title, viewW / 2, by + 24);
    frameBar(g, bx, by, bw, 9);
    g.fillStyle = '#e8d8c0';
    g.fillRect(bx, by, bw * hud.bossShown, 9);
    const bg = g.createLinearGradient(0, by, 0, by + 9);
    bg.addColorStop(0, b.bossId === 'pasterz' ? '#7ea7c8' : '#b8422c');
    bg.addColorStop(1, b.bossId === 'pasterz' ? '#2a4a68' : '#5a120c');
    g.fillStyle = bg;
    g.fillRect(bx, by, bw * frac, 9);
    // phase notch
    const notch = b.bossId === 'dzwon' ? 0.55 : 0.5;
    g.fillStyle = 'rgba(255,230,180,0.6)';
    g.fillRect(bx + bw * notch - 1, by - 3, 2, 15);
    // poise (stagger) meter
    const poise = 1 - b.poise / b.maxPoise;
    if (poise > 0.02) {
      g.fillStyle = 'rgba(255,210,122,0.75)';
      g.fillRect(bx, by + 12, bw * poise, 2);
    }
  } else hud.bossShown = 1;

  // ---- hint banner (tutorial stones)
  if (w.hint) {
    const hw = Math.min(680, viewW - 60);
    const hy = viewH - (b && w.bossStarted ? 110 : 64);
    g.fillStyle = 'rgba(14,10,8,0.82)';
    g.fillRect((viewW - hw) / 2, hy - 22, hw, 40);
    g.strokeStyle = 'rgba(200,170,110,0.45)';
    g.strokeRect((viewW - hw) / 2 + 0.5, hy - 21.5, hw - 1, 39);
    g.fillStyle = '#efe3c8';
    g.font = `15px ${SERIF}`;
    g.textAlign = 'center';
    wrapText(g, w.hint, viewW / 2, hy - 2, hw - 30, 17);
  }

  // ---- banners
  for (const bn of hud.banners) {
    const k = bn.t < 0.5 ? easeOut(bn.t / 0.5) : bn.t > bn.dur - 0.7 ? (bn.dur - bn.t) / 0.7 : 1;
    g.save();
    g.globalAlpha = clamp(k, 0, 1);
    g.textAlign = 'center';
    if (bn.big) {
      const y = viewH * 0.36;
      const grd = g.createLinearGradient(0, y - 60, 0, y + 40);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.5, 'rgba(0,0,0,0.55)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, y - 60, viewW, 100);
      g.font = `44px ${DISPLAY}`;
      g.fillStyle = '#f2e6cf';
      g.fillText(bn.text, viewW / 2, y);
      if (bn.sub) {
        g.font = `italic 17px ${SERIF}`;
        g.fillStyle = 'rgba(232,210,170,0.8)';
        g.fillText(bn.sub, viewW / 2, y + 28);
      }
    } else {
      const y = viewH * 0.24;
      g.font = `22px ${SERIF}`;
      g.fillStyle = '#efe0c0';
      g.shadowColor = 'rgba(0,0,0,0.9)';
      g.shadowBlur = 8;
      g.fillText(bn.text, viewW / 2, y);
      if (bn.sub) {
        g.font = `italic 14px ${SERIF}`;
        g.fillStyle = 'rgba(232,210,170,0.8)';
        g.fillText(bn.sub, viewW / 2, y + 22);
      }
    }
    g.restore();
  }
  // ---- toasts (loot)
  hud.toasts.forEach((t, i) => {
    const k = t.t < 0.3 ? t.t / 0.3 : t.t > 2.8 ? (3.4 - t.t) / 0.6 : 1;
    const y = 150 + i * 46;
    g.save();
    g.globalAlpha = clamp(k, 0, 1);
    g.fillStyle = 'rgba(12,9,8,0.78)';
    g.fillRect(viewW - 300, y - 20, 274, 38);
    g.fillStyle = '#ffcf7a';
    g.fillRect(viewW - 300, y - 20, 3, 38);
    g.textAlign = 'left';
    g.font = `15px ${SERIF}`;
    g.fillStyle = '#efe3c8';
    g.fillText(t.text, viewW - 288, y - 2);
    if (t.sub) {
      g.font = `italic 12px ${SERIF}`;
      g.fillStyle = 'rgba(232,210,170,0.7)';
      g.fillText(t.sub, viewW - 288, y + 13);
    }
    star(g, viewW - 44, y - 2, 5, '#ffd27a', 0.8, time * 2);
    g.restore();
  });

  // location tag
  if (w.location !== 'krypta') {
    g.textAlign = 'left';
    g.font = `italic 12px ${SERIF}`;
    g.fillStyle = 'rgba(232,220,196,0.4)';
    g.fillText(LOCATIONS[w.location].name, 26, viewH - 18);
  }
}

export function wrapText(g: Ctx, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const wd of words) {
    const t = line ? line + ' ' + wd : wd;
    if (g.measureText(t).width > maxW && line) {
      lines.push(line);
      line = wd;
    } else line = t;
  }
  if (line) lines.push(line);
  const y0 = y - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => g.fillText(l, x, y0 + i * lh));
}

export function drawLowHp(g: Ctx, w: World, viewW: number, viewH: number, time: number) {
  const p = w.player;
  const k = 1 - p.hp / p.maxHp;
  if (k < 0.6 || p.dead) return;
  const a = (k - 0.6) * 1.2 * (0.7 + Math.sin(time * 5) * 0.3);
  const grd = g.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.35, viewW / 2, viewH / 2, viewW * 0.7);
  grd.addColorStop(0, 'rgba(120,0,0,0)');
  grd.addColorStop(1, rgba('#780000', a));
  g.fillStyle = grd;
  g.fillRect(0, 0, viewW, viewH);
}
