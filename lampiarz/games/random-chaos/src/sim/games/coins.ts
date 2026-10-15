// E. COIN PANIC — coins keep appearing around a vault. Grab more than the
// rival before the time runs out. A shove knocks coins out of the other one's
// pockets, and spiked balls fall from the ceiling (their drop point flashes).
import type { Player } from '../player';
import { Prop, type Prop as PropT } from '../world';
import { Minigame, type GameDef, type HudInfo } from './base';

export const COINS: GameDef = {
  id: 'coins',
  name: 'COIN PANIC',
  tagline: 'Zbierz więcej monet niż rywal. Pchnięcie wytrąca mu monety.',
  rules: ['Zbieraj monety; złota duża moneta jest warta 5.', 'Trafiony pchnięciem gubi 2 monety, kolczastą kulą — 3.', 'Remis? Ostatnia złota moneta rozstrzyga.'],
  theme: 'vault',
  music: 'funk',
  time: 35,
  action: 'pchnięcie — wytrąca monety',
};

export interface Coin {
  x: number;
  y: number;
  v: number;
  vx: number;
  vy: number;
  /** loose coins bounce and settle; spawned ones float */
  loose: boolean;
  t: number;
  alive: boolean;
}

const SPOTS: [number, number][] = [
  [140, 560],
  [380, 560],
  [640, 560],
  [900, 560],
  [1140, 560],
  [250, 400],
  [640, 330],
  [1030, 400],
  [440, 230],
  [840, 230],
  [100, 300],
  [1180, 300],
  [640, 140],
];

export class Coins extends Minigame {
  def = COINS;
  coins: Coin[] = [];
  score: [number, number] = [0, 0];
  spawnT = 0.3;
  ballT = 4;
  sudden = false;

  build() {
    const W = this.w;
    W.bounds = { x: 0, y: 0, w: 1280, h: 720, killY: 900 };
    this.floor(0, 620, 1280, 100);
    this.plat(160, 480, 200, { tint: 1 });
    this.plat(920, 480, 200, { tint: 1 });
    this.plat(530, 380, 220, { tint: 2 });
    this.plat(340, 280, 200, { tint: 3 });
    this.plat(740, 280, 200, { tint: 3 });
    this.plat(0, 350, 140, { tint: 0 });
    this.plat(1140, 350, 140, { tint: 0 });
    this.plat(560, 190, 160, { tint: 2 });
    // springs in the corners
    this.w.block(40, 606, 50, 14, { spring: 1180, style: 'spring' });
    this.w.block(1190, 606, 50, 14, { spring: 1180, style: 'spring' });
  }
  spawnPoint(id: 0 | 1): [number, number] {
    return id === 0 ? [460, 620] : [820, 620];
  }

  private spawnCoin(v = 1) {
    const free = SPOTS.filter(([x, y]) => !this.coins.some((c) => c.alive && Math.hypot(c.x - x, c.y - y) < 60) && !this.players.some((p) => Math.hypot(p.cx - x, p.cy - y) < 90));
    if (!free.length) return;
    const [x, y] = this.rng.pick(free);
    this.coins.push({ x, y, v, vx: 0, vy: 0, loose: false, t: 0, alive: true });
  }

  /** Coins knocked out of a player fly out and can be picked up by anyone. */
  drop(p: Player, n: number) {
    const k = Math.min(n, this.score[p.id]);
    if (k <= 0) return;
    this.score[p.id] -= k;
    for (let i = 0; i < k; i++) this.coins.push({ x: p.cx, y: p.cy - 10, v: 1, vx: this.rng.range(-320, 320), vy: this.rng.range(-620, -360), loose: true, t: -0.45, alive: true });
    this.r.emit({ type: 'coinDrop', p: p.id, x: p.cx, y: p.cy, n: k });
  }

  onHit(attacker: number, victim: number, kind: 'shove' | 'stomp' | 'slam') {
    if (!this.live) return;
    this.drop(this.players[victim], kind === 'shove' ? 2 : 1);
    void attacker;
  }
  onProp(p: Player, pr: PropT) {
    if (this.hurt(p, pr.x)) this.drop(p, 3);
    pr.alive = false;
  }
  onFall(p: Player) {
    this.r.respawn(p);
  }

  step(dt: number, playing: boolean) {
    // loose coins: gravity and floors
    for (const c of this.coins) {
      if (!c.alive) continue;
      c.t += dt;
      if (c.loose) {
        c.vy += 1800 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        if (c.x < 14 || c.x > 1266) c.vx = -c.vx * 0.6;
        c.x = Math.max(14, Math.min(1266, c.x));
        for (const s of this.w.solids) {
          if (!s.solid || c.vy < 0) continue;
          if (c.x > s.x && c.x < s.x + s.w && c.y + 12 > s.y && c.y + 12 - c.vy * dt <= s.y + 2) {
            c.y = s.y - 12;
            c.vy = -c.vy * 0.35;
            c.vx *= 0.7;
            if (Math.abs(c.vy) < 60) c.vy = 0;
          }
        }
        if (c.t > 9) c.alive = false;
      }
    }
    if (!playing) return;
    // pick up
    for (const c of this.coins) {
      if (!c.alive || c.t < 0) continue;
      for (const p of this.players) {
        if (!p.alive) continue;
        const r = c.v > 1 ? 30 : 22;
        if (c.x > p.x - r && c.x < p.x + p.w + r && c.y > p.y - r && c.y < p.y + p.h + r) {
          c.alive = false;
          this.score[p.id] += c.v;
          this.r.emit({ type: 'coin', p: p.id, x: c.x, y: c.y, n: c.v });
          if (this.sudden && c.v > 1) {
            this.r.finish(p.id, `${p.name} złapał ostatnią monetę`);
            return;
          }
          break;
        }
      }
    }
    this.coins = this.coins.filter((c) => c.alive);
    if (!this.sudden) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.coins.filter((c) => !c.loose).length < 4) {
        this.spawnT = this.rng.range(0.6, 1.1);
        this.spawnCoin(this.rng.chance(0.08) ? 5 : 1);
      }
    }
    // spiked balls from the ceiling
    this.ballT -= dt * this.r.trouble;
    if (this.ballT <= 0) {
      this.ballT = this.rng.range(2.6, 4.2);
      const x = this.rng.range(80, 1200);
      this.r.emit({ type: 'warn', x, y: 0, power: 0.6 });
      const b = this.w.prop(new Prop('spikeball', x, -60, 20, 0.5, true));
      b.vy = 0;
      b.gravity = 0.55;
      b.ttl = 5;
    }
  }

  timeUp() {
    const [a, b] = this.score;
    if (a !== b) return { winner: (a > b ? 0 : 1) as 0 | 1, reason: `${Math.max(a, b)} : ${Math.min(a, b)} w monetach` };
    if (!this.sudden) {
      this.sudden = true;
      this.coins = this.coins.filter((c) => c.loose);
      this.coins.push({ x: 640, y: 330, v: 5, vx: 0, vy: 0, loose: false, t: 0, alive: true });
      this.r.limit += 15;
      this.r.overtime = true;
      this.r.emit({ type: 'sfx', name: 'sudden', vol: 1 });
      return null;
    }
    return { winner: -1 as const, reason: 'Nikt nie złapał ostatniej monety' };
  }

  hud(): HudInfo {
    const ps = this.players.map((p) => ({ main: `${this.score[p.id]}`, sub: 'monet' })) as HudInfo['p'];
    return { p: ps, banner: this.sudden ? 'OSTATNIA MONETA!' : undefined, bannerColor: '#ffd23f' };
  }
}
