// C. KNOCKOUT — a floating arena. Every hit raises the damage meter, and the
// higher it is, the further the next hit sends you. Knock the rival off the
// stage: three times on a normal round.
import { Prop, Zone } from '../world';
import type { Player } from '../player';
import { Minigame, type GameDef, type HudInfo } from './base';

export const KNOCKOUT: GameDef = {
  id: 'knockout',
  name: 'KNOCKOUT',
  tagline: 'Wypchnij rywala poza arenę. Im więcej obrażeń, tym dalej leci.',
  rules: ['S / ↓ na ziemi to pchnięcie, w powietrzu — wbicie w ziemię.', 'Każde trafienie zwiększa procent obrażeń przeciwnika.', 'Spadnięcie z areny kosztuje życie. Komu skończą się życia, przegrywa.'],
  theme: 'dojo',
  music: 'fight',
  time: 60,
  action: 'pchnięcie / wbicie w ziemię',
};

export class Knockout extends Minigame {
  def = KNOCKOUT;
  stocks: [number, number] = [3, 3];
  damage: [number, number] = [0, 0];
  respawnT: [number, number] = [0, 0];
  bombT = 6;

  build() {
    const W = this.w;
    W.bounds = { x: 0, y: -60, w: 1280, h: 840, killY: 860, openSides: true };
    this.stocks = this.r.cfg.length < 0.9 ? [2, 2] : [3, 3];
    this.floor(250, 520, 780, 70, { style: 'ground' });
    this.plat(320, 385, 220, { tint: 1 });
    this.plat(740, 385, 220, { tint: 1 });
    this.plat(545, 250, 190, { tint: 2 });
    // two small lifts at the sides help the way back
    this.plat(90, 560, 120, { tint: 3, path: (t) => [90, 560 - (Math.sin(t * 0.9) * 0.5 + 0.5) * 230] });
    this.plat(1070, 560, 120, { tint: 3, path: (t) => [1070, 560 - (Math.sin(t * 0.9 + Math.PI) * 0.5 + 0.5) * 230] });
    // a fan under the middle of the stage edge pushes outward: careful near the edges
    W.zone(new Zone(250, 470, 60, 50, 'fan', 900, [-1, -0.2]));
    W.zone(new Zone(970, 470, 60, 50, 'fan', 900, [1, -0.2]));
  }
  spawnPoint(id: 0 | 1): [number, number] {
    return id === 0 ? [430, 520] : [850, 520];
  }
  respawnPoint(): [number, number] {
    return [640, 250];
  }

  onHit(attacker: number, victim: number, kind: 'shove' | 'stomp' | 'slam') {
    if (!this.live) return;
    this.damage[victim] += kind === 'shove' ? 13 : kind === 'slam' ? 11 : 8;
    this.r.emit({ type: 'score', p: attacker, x: this.players[victim].cx, y: this.players[victim].y - 10, text: `${Math.round(this.damage[victim])}%` });
    this.r.knockScale[victim] = 1 + this.damage[victim] / 55;
  }

  onFall(p: Player) {
    if (!p.alive || this.respawnT[p.id] > 0) return;
    this.stocks[p.id]--;
    this.r.emit({ type: 'shake', power: 0.6 });
    this.r.emit({ type: 'sfx', name: 'ko', vol: 1 });
    if (this.stocks[p.id] <= 0) {
      this.eliminate(p, 'stracił ostatnie życie');
      return;
    }
    p.alive = false;
    this.respawnT[p.id] = 1.1;
    p.x = -9999;
  }

  step(dt: number, playing: boolean) {
    for (const p of this.players) {
      if (this.respawnT[p.id] <= 0) continue;
      this.respawnT[p.id] -= dt;
      if (this.respawnT[p.id] <= 0 && this.stocks[p.id] > 0 && playing) {
        this.damage[p.id] = 0;
        this.r.knockScale[p.id] = 1;
        this.r.respawn(p, [p.id === 0 ? 600 : 680, 250]);
        p.invuln = 1.8;
      }
    }
    if (!playing) return;
    // DOUBLE TROUBLE drops bombs onto the stage
    if (this.r.trouble > 1) {
      this.bombT -= dt;
      if (this.bombT <= 0) {
        this.bombT = this.rng.range(3, 5);
        this.r.emit({ type: 'sfx', name: 'whistle', vol: 0.8 });
        const b = this.w.prop(new Prop('bomb', this.rng.range(320, 960), -40, 16, 0.45));
        b.ttl = 2.2;
      }
    }
    for (const e of this.w.fresh) {
      if (e.type !== 'explode') continue;
      this.r.emit({ type: 'shake', power: 0.5 });
      for (const p of this.players) {
        const d = Math.hypot(p.cx - e.x, p.cy - e.y);
        if (d < 170 && p.alive && p.invuln <= 0) {
          this.damage[p.id] += 15;
          this.r.knockScale[p.id] = 1 + this.damage[p.id] / 55;
          p.knock(Math.sign(p.cx - e.x || 1) * 520 * this.r.knockScale[p.id], -560, 0.5);
        }
      }
    }
  }

  timeUp() {
    const [a, b] = this.stocks;
    if (a !== b) return { winner: (a > b ? 0 : 1) as 0 | 1, reason: 'Więcej żyć na koniec czasu' };
    const [da, db] = this.damage;
    if (Math.abs(da - db) >= 1) return { winner: (da < db ? 0 : 1) as 0 | 1, reason: 'Mniej obrażeń na koniec czasu' };
    return { winner: -1 as const, reason: 'Idealny remis' };
  }

  hud(): HudInfo {
    const ps = this.players.map((p) => ({ main: `${Math.round(this.damage[p.id])}%`, pips: this.stocks[p.id], pipsMax: this.r.cfg.length < 0.9 ? 2 : 3, out: this.stocks[p.id] <= 0 })) as HudInfo['p'];
    return { p: ps };
  }
}
