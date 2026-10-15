// H. KING OF THE PLATFORM — a glowing crown zone on the summit. Standing in it
// alone earns time; two in the zone earn nothing. The zone moves between three
// spots, and a button on the side fires a sweeper across it.
import { Zone, type Solid } from '../world';
import { Minigame, type GameDef, type HudInfo } from './base';

export const KING: GameDef = {
  id: 'king',
  name: 'KING OF THE PLATFORM',
  tagline: 'Stój sam w strefie korony. Kto pierwszy uzbiera czas, wygrywa.',
  rules: ['Punkty lecą tylko, gdy jesteś w strefie sam.', 'Strefa co jakiś czas się przenosi — patrz na strzałkę.', 'Przycisk z boku odpala zamiatacz przez strefę. S / ↓ to pchnięcie.'],
  theme: 'sunset',
  music: 'bounce',
  time: 50,
  action: 'pchnięcie (w powietrzu: wbicie w ziemię)',
};

const SPOTS: { x: number; y: number; w: number }[] = [
  { x: 520, y: 380, w: 240 },
  { x: 140, y: 470, w: 220 },
  { x: 920, y: 470, w: 220 },
];

export class King extends Minigame {
  def = KING;
  zone!: Zone;
  spot = 0;
  next = -1;
  moveT = 11;
  warnT = 0;
  score: [number, number] = [0, 0];
  target = 12;
  sweeper!: Solid;
  sweepT = -1;
  sweepCd = 0;
  buttons: Zone[] = [];
  sudden = false;
  contested = false;

  build() {
    const W = this.w;
    W.bounds = { x: 0, y: 0, w: 1280, h: 720, killY: 900 };
    this.target = Math.round(12 * Math.min(1.25, Math.max(0.8, this.r.cfg.length)));
    this.floor(0, 620, 1280, 100);
    // the summit in the middle and two side terraces
    this.w.block(500, 380, 280, 240, { style: 'pillar', tint: 2 });
    this.plat(130, 470, 240, { tint: 1 });
    this.plat(910, 470, 240, { tint: 1 });
    this.plat(340, 520, 110, { tint: 3 });
    this.plat(830, 520, 110, { tint: 3 });
    // springs at the walls
    this.w.block(20, 606, 50, 14, { spring: 1200, style: 'spring' });
    this.w.block(1210, 606, 50, 14, { spring: 1200, style: 'spring' });
    this.buttons = [W.zone(new Zone(190, 610, 60, 10, 'button')), W.zone(new Zone(1030, 610, 60, 10, 'button'))];
    // the sweeper hides above the summit until the button fires it
    this.sweeper = this.w.block(-200, 250, 40, 120, { style: 'metal', tag: 'sweeper' });
    // it is not a wall: it only shoves (see step)
    this.sweeper.active = false;
    this.zone = W.zone(new Zone(0, 0, 0, 0, 'hill'));
    this.placeZone(0);
  }
  spawnPoint(id: 0 | 1): [number, number] {
    return id === 0 ? [300, 620] : [980, 620];
  }

  private placeZone(i: number) {
    const s = SPOTS[i];
    this.spot = i;
    this.zone.x = s.x + (s.w - (s.w - 20)) / 2;
    this.zone.y = s.y - 130;
    this.zone.w = s.w - 20;
    this.zone.h = 130;
  }

  step(dt: number, playing: boolean) {
    // the sweeper: fired by the button, runs across the current zone once
    if (this.sweepT >= 0) {
      this.sweepT += dt;
      const k = this.sweepT / 1.1;
      const s = SPOTS[this.spot];
      const from = s.x - 120;
      const to = s.x + s.w + 80;
      this.sweeper.x = from + (to - from) * Math.min(1, k);
      this.sweeper.y = s.y - 120;
      for (const p of this.players) {
        if (!p.alive || p.invuln > 0) continue;
        if (p.x < this.sweeper.x + this.sweeper.w && p.x + p.w > this.sweeper.x && p.y < this.sweeper.y + this.sweeper.h && p.bottom > this.sweeper.y) {
          p.knock(700, -520, 0.5);
          this.r.emit({ type: 'impact', x: p.cx, y: p.cy, power: 1 });
        }
      }
      if (k >= 1) {
        this.sweepT = -1;
        this.sweeper.x = -200;
      }
    }
    this.sweepCd = Math.max(0, this.sweepCd - dt * this.r.trouble);
    const pressed = this.buttons.find((b) => this.players.some((p) => p.alive && p.grounded && p.x + p.w > b.x && p.x < b.x + b.w));
    if (pressed && this.sweepCd <= 0 && this.sweepT < 0 && playing) {
      this.sweepT = 0;
      this.sweepCd = 6;
      this.r.emit({ type: 'button', x: pressed.x + 30, y: pressed.y, on: true });
    }
    for (const b of this.buttons) b.pressed = this.sweepCd <= 0;
    if (!playing) return;
    // moving the zone, with a warning
    this.moveT -= dt * this.r.trouble;
    if (this.next < 0 && this.moveT < 2.5) {
      this.next = (this.spot + 1 + this.rng.int(0, 1)) % 3;
      this.r.emit({ type: 'sfx', name: 'move', vol: 0.8 });
    }
    if (this.moveT <= 0) {
      this.placeZone(this.next);
      this.next = -1;
      this.moveT = this.rng.range(9, 13);
    }
    // scoring: alone in the zone
    const inZone = this.players.filter((p) => p.alive && p.x + p.w > this.zone.x && p.x < this.zone.x + this.zone.w && p.bottom > this.zone.y && p.y < this.zone.y + this.zone.h);
    this.contested = inZone.length === 2;
    if (inZone.length === 1) {
      const p = inZone[0];
      const before = Math.floor(this.score[p.id]);
      this.score[p.id] += dt;
      if (Math.floor(this.score[p.id]) > before) this.r.emit({ type: 'sfx', name: 'tick', x: p.cx, y: p.cy, vol: 0.6 });
      if (this.score[p.id] >= this.target) this.r.finish(p.id, `${p.name} utrzymał koronę`);
      else if (this.sudden && this.score[p.id] - this.score[1 - p.id] >= 1) this.r.finish(p.id, `${p.name} przejął koronę w dogrywce`);
    }
  }

  onFall(p: import('../player').Player) {
    this.r.respawn(p);
  }

  timeUp() {
    const [a, b] = this.score;
    if (Math.abs(a - b) >= 0.5) return { winner: (a > b ? 0 : 1) as 0 | 1, reason: `${Math.max(a, b).toFixed(1)} s w koronie` };
    if (!this.sudden) {
      this.sudden = true;
      this.r.limit += 20;
      this.r.overtime = true;
      this.r.emit({ type: 'sfx', name: 'sudden', vol: 1 });
      return null;
    }
    return { winner: -1 as const, reason: 'Korona bez króla' };
  }

  hud(): HudInfo {
    const ps = this.players.map((p) => ({ main: `${this.score[p.id].toFixed(1)} s`, sub: `cel: ${this.target} s`, bar: Math.min(1, this.score[p.id] / this.target) })) as HudInfo['p'];
    return { p: ps, banner: this.sudden ? 'DOGRYWKA: SEKUNDA PRZEWAGI' : this.contested ? 'STREFA ZAJĘTA!' : this.next >= 0 ? 'STREFA SIĘ PRZENOSI…' : undefined, bannerColor: this.contested ? '#ffffff' : '#ffb347' };
  }
}
