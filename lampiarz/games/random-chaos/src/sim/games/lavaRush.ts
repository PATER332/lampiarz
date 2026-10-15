// B. LAVA RUSH — a tall volcanic shaft. Lava rises from below, faster and
// faster; the platforms above move, crumble or bounce. The one who stays above
// the lava longer wins.
import { clamp, type Rect } from '../../engine/math';
import type { Player } from '../player';
import { Prop, Zone } from '../world';
import { Minigame, type GameDef, type HudInfo } from './base';

export const LAVA_RUSH: GameDef = {
  id: 'lavaRush',
  name: 'LAVA RUSH',
  tagline: 'Lawa się podnosi. Wspinaj się szybciej niż rywal.',
  rules: ['Lawa rośnie coraz szybciej — dotknięcie oznacza koniec.', 'Sprężyny wybijają wysoko, pękające skały nie czekają.', 'Uważaj na spadające kamienie. S / ↓ to pchnięcie.'],
  theme: 'volcano',
  music: 'lava',
  time: 55,
  action: 'pchnięcie (w powietrzu: wbicie w ziemię)',
};

const TOP = -5200;

export class LavaRush extends Minigame {
  def = LAVA_RUSH;
  lava = 1000;
  lavaV = 34;
  lavaZone!: Zone;
  rockT = 3;
  best: [number, number] = [0, 0];

  build() {
    const W = this.w;
    W.bounds = { x: 0, y: TOP, w: 1280, h: 720 - TOP, killY: 99999 };
    this.floor(0, 680, 1280, 80);
    // rows of platforms all the way up. One platform per row continues a
    // guaranteed path (never more than a comfortable jump from the last one);
    // the others are optional routes and traps.
    let y = 560;
    let row = 0;
    let pathX = 640;
    let lastY = 680;
    const r = this.rng;
    while (y > TOP + 300) {
      lastY = y;
      const dx = r.range(140, 300) * (r.chance(0.5) ? -1 : 1);
      pathX = clamp(pathX + dx, 140, 1140);
      const xs = [pathX];
      for (let k = 0; k < (row % 3 === 0 ? 2 : 1); k++) {
        const cand = r.range(120, 1160);
        if (xs.every((x) => Math.abs(x - cand) > 300)) xs.push(cand);
      }
      xs.forEach((cx, i) => {
        const w = r.range(180, 240);
        const x = clamp(cx - w / 2, 30, 1250 - w);
        const kind = i === 0 ? r.next() * 0.5 + 0.5 : r.next();
        if (row > 2 && kind < 0.18) {
          const span = r.range(120, 200);
          const sp = r.range(0.6, 1.1);
          const ph = r.range(0, 6);
          const ax = clamp(x, 30 + span / 2, 1250 - w - span / 2);
          const yy = y;
          this.plat(ax, yy, w, { tint: 2, path: (t) => [ax + Math.sin(t * sp + ph) * span * 0.5, yy] });
        } else if (row > 1 && kind < 0.36) this.plat(x, y, w, { tint: 1, crumble: 0.6, respawn: 4, style: 'tile' });
        else if (row > 3 && kind < 0.44) {
          this.plat(x, y, w, { tint: 0 });
          this.w.block(x + w - 46, y - 14, 40, 14, { spring: 1250, style: 'spring' });
        } else this.plat(x, y, w, { tint: 0 });
      });
      y -= r.range(116, 134);
      row++;
    }
    // the summit: one comfortable jump above the last row
    this.floor(380, lastY - 125, 520, 40);
    this.lavaZone = W.zone(new Zone(-100, this.lava, 1480, 2000, 'lava'));
  }
  spawnPoint(id: 0 | 1): [number, number] {
    return id === 0 ? [480, 680] : [800, 680];
  }

  step(dt: number, playing: boolean) {
    if (!playing) return;
    // lava speeds up over time, and a lot once time is up
    const t = this.r.t;
    this.lavaV = this.r.overtime ? 260 : 34 + t * 2.3 + (t > 25 ? (t - 25) * 1.4 : 0);
    // never let it fall too far behind the lower player: the chase stays on
    const low = Math.max(...this.players.filter((p) => p.alive).map((p) => p.bottom));
    if (this.lava - low > 520) this.lava -= (this.lava - low - 520) * dt * 2;
    this.lava -= this.lavaV * dt;
    this.lavaZone.y = this.lava;
    for (const p of this.players) {
      this.best[p.id] = Math.max(this.best[p.id], 680 - p.bottom);
      if (p.alive && p.bottom > this.lava + 8) this.eliminate(p, 'wpadł do lawy');
    }
    // falling rocks from above the higher player
    this.rockT -= dt * this.r.trouble;
    if (this.rockT <= 0) {
      this.rockT = this.rng.range(2.2, 3.6);
      const top = Math.min(...this.players.map((p) => p.y));
      const x = this.rng.range(80, 1200);
      const pr = this.w.prop(new Prop('boulder', x, top - 700, 22, 0.25, true));
      pr.vy = 200;
      pr.ttl = 6;
      this.r.emit({ type: 'warn', x, y: top - 380, power: 0.5 });
    }
    // rocks melt in the lava
    for (const pr of this.w.props) if (pr.alive && pr.y > this.lava + 10) pr.alive = false;
  }

  onFall(p: Player) {
    this.eliminate(p, 'wpadł do lawy');
  }

  timeUp() {
    // the lava surges; somebody will be caught
    this.r.overtime = true;
    this.r.limit += 15;
    if (this.r.t > this.def.time * this.r.cfg.length + 14) {
      const [a, b] = this.players;
      if (Math.abs(a.bottom - b.bottom) < 4) return { winner: -1 as const, reason: 'Ramię w ramię' };
      return { winner: (a.bottom < b.bottom ? 0 : 1) as 0 | 1, reason: 'Wyżej, gdy lawa doszła do szczytu' };
    }
    this.r.emit({ type: 'sfx', name: 'sudden', vol: 1 });
    return null;
  }

  view(): Rect {
    // both players and the lava surface in view, scrolling upwards
    const ps = this.players.filter((p) => p.alive);
    const top = Math.min(...ps.map((p) => p.y)) - 220;
    const bottom = Math.max(Math.min(this.lava + 120, Math.max(...ps.map((p) => p.bottom)) + 420), top + 720);
    return { x: 0, y: top, w: 1280, h: bottom - top };
  }

  hud(): HudInfo {
    const ps = this.players.map((p) => ({ main: `${Math.max(0, Math.round((680 - p.bottom) / 10))} m`, sub: `nad lawą: ${Math.max(0, Math.round((this.lava - p.bottom) / 10))} m`, out: !p.alive })) as HudInfo['p'];
    return { p: ps, banner: this.r.overtime ? 'LAWA PRZYSPIESZA!' : undefined, bannerColor: '#ff7a1a' };
  }
}
