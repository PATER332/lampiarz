// F. FLOOR IS LAVA — coloured platforms over lava. The announcer calls a
// colour; a moment later every platform of another colour drops away. Be on the
// right colour in time. The calls come faster and faster.
import type { Solid } from '../world';
import { Zone } from '../world';
import type { Player } from '../player';
import { Minigame, type GameDef, type HudInfo } from './base';

export const COLORS: GameDef = {
  id: 'colors',
  name: 'FLOOR IS LAVA',
  tagline: 'Stań na wywołanym kolorze, zanim reszta platform zniknie.',
  rules: ['Na górze pojawia się kolor. Chwilę później znikają wszystkie inne.', 'Pod spodem jest lawa. Kto wpadnie, przegrywa.', 'Z każdą rundą czasu jest mniej. S / ↓ to pchnięcie.'],
  theme: 'disco',
  music: 'disco',
  time: 50,
  noMods: ['disappearing'],
  action: 'pchnięcie (w powietrzu: wbicie w ziemię)',
};

export const COLOR_NAMES = ['RÓŻOWY', 'TURKUSOWY', 'ŻÓŁTY'];
export const COLOR_HEX = ['#ff4fa3', '#2fe0d0', '#ffd23f'];

type Stage = 'calm' | 'call' | 'drop';

export class Colors extends Minigame {
  def = COLORS;
  plats: Solid[] = [];
  stage: Stage = 'calm';
  stageT = 2.2;
  called = -1;
  calls = 0;
  sudden = false;
  lavaY = 650;

  build() {
    const W = this.w;
    W.bounds = { x: 0, y: 0, w: 1280, h: 720, killY: 820 };
    const cols = [110, 410, 710, 1010];
    const rows = [560, 440, 320];
    rows.forEach((y, ri) => {
      cols.forEach((x, ci) => {
        const sway = ri === 1;
        const s = this.w.block(x, y, 160, 22, {
          oneway: ri > 0,
          style: 'tile',
          path: sway ? (t) => [x + Math.sin(t * 0.8 + ci) * 45, y] : undefined,
        });
        this.plats.push(s);
      });
    });
    this.recolor();
    W.zone(new Zone(-50, this.lavaY, 1380, 300, 'lava'));
  }
  spawnPoint(id: 0 | 1): [number, number] {
    return id === 0 ? [490, 560] : [790, 560];
  }

  /** every row gets every colour at least once, so the right colour is always a jump away */
  private recolor() {
    for (let r = 0; r < 3; r++) {
      const row = this.plats.slice(r * 4, r * 4 + 4);
      const cs = this.rng.shuffle([0, 1, 2, this.rng.int(0, 2)]);
      row.forEach((s, i) => ((s.color = cs[i]), (s.tint = cs[i])));
    }
  }

  get warnTime() {
    return Math.max(this.sudden ? 0.85 : 1.25, 2.6 - this.calls * 0.18);
  }

  step(dt: number, playing: boolean) {
    if (!playing) return;
    for (const p of this.players) if (p.alive && p.bottom > this.lavaY + 6) this.eliminate(p, 'wpadł do lawy');
    this.stageT -= dt * (this.r.trouble > 1 ? 1.25 : 1);
    if (this.stageT > 0) return;
    if (this.stage === 'calm') {
      this.stage = 'call';
      this.called = this.rng.int(0, 2);
      this.calls++;
      this.stageT = this.warnTime;
      this.r.emit({ type: 'sfx', name: `color${this.called}`, vol: 1 });
    } else if (this.stage === 'call') {
      this.stage = 'drop';
      this.stageT = 2.1;
      for (const s of this.plats) if (s.color !== this.called) ((s.respawn = 0), s.drop());
      this.r.emit({ type: 'sfx', name: 'drop', vol: 1 });
      this.r.emit({ type: 'shake', power: 0.25 });
    } else {
      this.stage = 'calm';
      this.stageT = this.sudden ? 0.9 : 1.6;
      this.called = -1;
      this.recolor();
      for (const s of this.plats) {
        if (s.state === 'gone' || s.state === 'fall') {
          s.state = 'gone';
          s.respawn = 0.01;
          s.stateT = 1;
        }
      }
    }
  }

  onFall(p: Player) {
    this.eliminate(p, 'wpadł do lawy');
  }

  timeUp() {
    if (!this.sudden) {
      this.sudden = true;
      this.r.limit += 25;
      this.r.overtime = true;
      this.r.emit({ type: 'sfx', name: 'sudden', vol: 1 });
      return null;
    }
    return { winner: -1 as const, reason: 'Oboje przetrwali wszystkie kolory' };
  }

  hud(): HudInfo {
    const ps = this.players.map((p) => ({ main: p.alive ? 'STOI' : 'ODPADŁ', sub: `wezwania: ${this.calls}`, out: !p.alive })) as HudInfo['p'];
    if (this.stage === 'call' || this.stage === 'drop') return { p: ps, banner: COLOR_NAMES[this.called], bannerColor: COLOR_HEX[this.called] };
    return { p: ps, banner: this.sudden ? 'SZYBCIEJ!' : undefined, bannerColor: '#ffffff' };
  }
}
