// In-world screens (terminals, the monitor wall, power panel, radio, lift) drawn
// on small canvases and uploaded as textures a few times per second.
import { clockText } from '../game/story';
import type { Sim } from '../game/sim';
import { CAMERAS, CONSUMERS } from '../world/map';

export type ScreenId = 'term_reception' | 'term_lab' | 'term_chamber' | 'wall' | 'panel' | 'radio' | 'lift';

const SIZES: Record<ScreenId, [number, number]> = {
  term_reception: [256, 200],
  term_lab: [256, 200],
  term_chamber: [256, 200],
  wall: [512, 248],
  panel: [256, 128],
  radio: [256, 74],
  lift: [64, 42],
};

export class Screens {
  canvases = new Map<ScreenId, HTMLCanvasElement>();
  dirty = new Set<ScreenId>();
  private t = 0;

  constructor() {
    for (const id of Object.keys(SIZES) as ScreenId[]) {
      const c = document.createElement('canvas');
      [c.width, c.height] = SIZES[id];
      this.canvases.set(id, c);
    }
  }

  /** Redraw (cheap); returns the set of canvases that changed. */
  update(sim: Sim, dt: number): Set<ScreenId> {
    this.t += dt;
    this.dirty.clear();
    if (Math.floor(this.t * 4) === Math.floor((this.t - dt) * 4)) return this.dirty;
    for (const [id, c] of this.canvases) {
      const g = c.getContext('2d')!;
      this.draw(id, g, c.width, c.height, sim);
      this.dirty.add(id);
    }
    return this.dirty;
  }

  private draw(id: ScreenId, g: CanvasRenderingContext2D, w: number, h: number, sim: Sim) {
    const st = sim.state;
    const on = (c: Parameters<Sim['powered']>[0]) => sim.powered(c);
    const term = (lines: string[], color = '#9cf0b8', bg = '#03110a') => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = color;
      g.font = '15px "NS Mono", monospace';
      lines.forEach((l, i) => g.fillText(l, 10, 22 + i * 18));
      // scanlines
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
      if (Math.floor(this.t * 2) % 2 === 0) g.fillRect(10, 22 + lines.length * 18 - 12, 9, 14);
    };
    const dark = () => {
      g.fillStyle = '#020304';
      g.fillRect(0, 0, w, h);
    };
    switch (id) {
      case 'term_reception':
        if (!on('lights_rooms') && !st.power.main) return term(['H-27 // ZASILANIE', 'REZERWOWE', '', clockText(st.clock)], '#e0b060', '#120a02');
        return term(sim.has('loggedIn') ? ['H-27 RECEPCJA', `ZMIANA NOCNA  ${clockText(st.clock)}`, 'TECHNIK: 7', '', 'NADZORCA: AKTYWNY', `MISJA: ${st.mission + 1}/8`] : ['H-27 RECEPCJA', 'NADZORCA v4.1', '', 'ZALOGUJ SIE:', '> TECHNIK 7_']);
      case 'term_lab':
        if (!on('lights_rooms')) return dark();
        return term(['LAB-2 ANALIZA', 'PROBKA K-1/7', 'KORELACJA: 0.9994', 'PRZESUNIECIE: +24h', '', 'WYNIK POWTARZALNY']);
      case 'term_chamber':
        if (!on('sector_c')) return dark();
        return term(
          sim.ended || sim.final?.kind === 'stop'
            ? ['K-1 // KLUCZ', 'CIAGLOSC:', `${Math.max(0, 100 - Math.floor(((sim.final?.t ?? 25) / 25) * 100))}%`, '', 'NIE WYCHODZ']
            : ['KOMORA K-1', 'TEST GOTOWY', `TLO: -9 dB`, '', sim.has('truth') ? 'CIAGLOSC: ZAGROZONA' : 'CZEKAM NA TECHNIKA'],
          '#9fd0ff',
          '#020812',
        );
      case 'wall': {
        g.fillStyle = '#05080a';
        g.fillRect(0, 0, w, h);
        if (!on('cameras')) {
          g.fillStyle = '#300';
          g.font = '18px "NS Mono", monospace';
          g.fillText('BRAK SYGNALU', 190, 130);
          return;
        }
        const cw = w / 3;
        const chh = h / 2;
        for (let i = 0; i < 6; i++) {
          const x = (i % 3) * cw;
          const y = Math.floor(i / 3) * chh;
          if (i === 5) continue; // the big feed sits there
          const img = g.createImageData(Math.floor(cw - 6), Math.floor(chh - 6));
          for (let k = 0; k < img.data.length; k += 4) {
            const v = Math.random() * 40 + 10;
            img.data[k] = v * 0.7;
            img.data[k + 1] = v;
            img.data[k + 2] = v * 0.8;
            img.data[k + 3] = 255;
          }
          g.putImageData(img, x + 3, y + 3);
          g.fillStyle = '#bfe8c8';
          g.font = '13px "NS Mono", monospace';
          g.fillText(CAMERAS[i].name.slice(0, 18), x + 8, y + 18);
          g.fillText(clockText(st.clock), x + 8, y + chh - 10);
        }
        return;
      }
      case 'panel': {
        g.fillStyle = '#040b06';
        g.fillRect(0, 0, w, h);
        g.font = '14px "NS Mono", monospace';
        g.fillStyle = st.power.main ? '#8cf0a0' : '#f0b060';
        g.fillText(st.power.main ? 'SIEC GLOWNA' : 'REZERWA', 8, 18);
        g.fillText(`MOC ${sim.used}/${sim.capacity}`, 150, 18);
        CONSUMERS.forEach((c, i) => {
          const y = 36 + i * 13;
          g.fillStyle = on(c.id) ? '#8cf0a0' : '#4a5a50';
          g.fillRect(8, y - 8, 8, 8);
          g.fillText(c.name.slice(0, 24), 22, y);
        });
        return;
      }
      case 'radio': {
        g.fillStyle = '#100802';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = on('transmitter') ? '#ffb050' : '#5a3a20';
        g.lineWidth = 2;
        g.beginPath();
        for (let x = 0; x < w; x += 4) {
          const v = Math.sin(x * 0.12 + this.t * 6) * (sim.final?.kind === 'tx' ? 22 : 6) * Math.random();
          if (x === 0) g.moveTo(x, h / 2 + v);
          else g.lineTo(x, h / 2 + v);
        }
        g.stroke();
        g.fillStyle = '#ffb050';
        g.font = '13px "NS Mono", monospace';
        g.fillText(sim.final?.kind === 'tx' ? `NADAWANIE ${Math.floor((sim.final.t / sim.final.need) * 100)}%` : '3.17 MHz', 8, 16);
        return;
      }
      case 'lift': {
        g.fillStyle = '#100';
        g.fillRect(0, 0, w, h);
        g.fillStyle = on('evac') ? '#ff5040' : '#300';
        g.font = '22px "NS Mono", monospace';
        g.fillText(sim.final?.kind === 'lift' ? (sim.final.done ? 'OK' : String(Math.max(0, Math.ceil(sim.final.need - sim.final.t)))) : on('evac') ? 'E-1' : '--', 8, 30);
        return;
      }
    }
  }
}
