// G. DODGE OR DIE — a test lab that tries to hit you: laser beams, falling
// anvils, rolling boulders and floor shockwaves. Every attack is marked before
// it fires. Three hearts each; last one with hearts left wins.
import type { Player } from '../player';
import { Prop, Zone } from '../world';
import { Minigame, type GameDef, type HudInfo } from './base';

export const DODGE: GameDef = {
  id: 'dodge',
  name: 'DODGE OR DIE',
  tagline: 'Lasery, kowadła i głazy. Każdy atak jest zapowiedziany — unikaj.',
  rules: ['Czerwone linie to lasery, które zaraz strzelą. Cień na podłodze to kowadło.', 'Strzałka przy ścianie: nadjeżdża głaz. Fala po podłodze: skacz.', 'Masz 3 serca. S / ↓ to unik-pchnięcie.'],
  theme: 'lab',
  music: 'fight',
  time: 45,
  action: 'unik-pchnięcie',
};

const FLOOR = 620;

export class Dodge extends Minigame {
  def = DODGE;
  hearts: [number, number] = [3, 3];
  nextT = 1.6;
  lasers: Zone[] = [];
  waves: Zone[] = [];
  sudden = false;

  build() {
    const W = this.w;
    W.bounds = { x: 0, y: 0, w: 1280, h: 720, killY: 900 };
    this.floor(0, FLOOR, 1280, 100);
    this.plat(170, 485, 250, { tint: 1 });
    this.plat(860, 485, 250, { tint: 1 });
    this.plat(515, 355, 250, { tint: 2 });
  }
  spawnPoint(id: 0 | 1): [number, number] {
    return id === 0 ? [420, FLOOR] : [860, FLOOR];
  }

  private attack() {
    const r = this.rng;
    const k = r.next();
    if (k < 0.32) {
      // laser: a horizontal lane or a vertical column
      const z = r.chance(0.6)
        ? new Zone(0, r.pick([FLOOR - 34, FLOOR - 120, 485 - 40, 355 - 40]), 1280, 18, 'laser')
        : new Zone(r.range(60, 1180), 0, 22, 720, 'laser');
      z.warn = 1.05;
      z.active = false;
      this.lasers.push(this.w.zone(z));
      this.r.emit({ type: 'sfx', name: 'charge', x: z.x + z.w / 2, y: z.y, vol: 0.7 });
    } else if (k < 0.58) {
      // anvils over a player (each one in turn) and one random
      const target = this.players[r.int(0, 1)];
      for (const x of [target.alive ? target.cx + r.range(-40, 40) : r.range(80, 1200), r.range(80, 1200)]) {
        const a = this.w.prop(new Prop('anvil', x, -420, 26, 0.1, true));
        a.ttl = 4;
        this.r.emit({ type: 'warn', x, y: this.w.groundBelow(x, 0) ?? FLOOR, power: 0.8 });
      }
    } else if (k < 0.8) {
      // a boulder rolls in from one side
      const left = r.chance(0.5);
      this.r.emit({ type: 'warn', x: left ? 30 : 1250, y: FLOOR - 40, power: -1 });
      const b = this.w.prop(new Prop('boulder', left ? -60 : 1340, FLOOR - 34, 34, 0.15, true));
      b.vx = (left ? 1 : -1) * 0;
      b.gravity = 1;
      b.ttl = 6;
      // released after the warning
      (b as Prop & { launch?: number }).launch = 0.9;
      b.spin = left ? 8 : -8;
      (b as Prop & { dirX?: number }).dirX = left ? 1 : -1;
    } else {
      // a shockwave runs along the floor from the middle
      const z1 = this.w.zone(new Zone(620, FLOOR - 26, 40, 26, 'laser', 520, [-1, 0], 'wave'));
      const z2 = this.w.zone(new Zone(620, FLOOR - 26, 40, 26, 'laser', 520, [1, 0], 'wave'));
      for (const z of [z1, z2]) {
        z.warn = 0.8;
        z.active = false;
        this.waves.push(z);
      }
      this.r.emit({ type: 'warn', x: 640, y: FLOOR, power: 1 });
    }
  }

  step(dt: number, playing: boolean) {
    // boulders wait off-screen for their warning, then roll
    for (const pr of this.w.props) {
      const b = pr as Prop & { launch?: number; dirX?: number };
      if (b.launch !== undefined && b.launch > 0) {
        b.launch -= dt;
        b.vx = 0;
        b.vy = 0;
        if (b.launch <= 0) {
          b.vx = (b.dirX ?? 1) * 540;
          this.r.emit({ type: 'sfx', name: 'rumble', x: b.x, y: b.y, vol: 0.9 });
        }
      }
    }
    for (const z of [...this.lasers, ...this.waves]) {
      if (z.warn > 0) {
        z.warn -= dt;
        if (z.warn <= 0) {
          z.active = true;
          z.t = 0;
          if (z.tag !== 'wave') this.r.emit({ type: 'sfx', name: 'laser', x: z.x + z.w / 2, y: z.y, vol: 1 });
        }
        continue;
      }
      if (z.tag === 'wave') {
        z.x += z.dir[0] * z.power * dt;
        if (z.x < -60 || z.x > 1340) z.active = false;
      } else if (z.t > 0.45) z.active = false;
      if (z.active && playing)
        for (const p of this.players) {
          if (p.alive && p.x < z.x + z.w && p.x + p.w > z.x && p.y < z.y + z.h && p.bottom > z.y) this.damage(p, z.x + z.w / 2);
        }
    }
    this.lasers = this.lasers.filter((z) => z.active || z.warn > 0);
    this.waves = this.waves.filter((z) => z.active || z.warn > 0);
    this.w.zones = this.w.zones.filter((z) => z.kind !== 'laser' || z.active || z.warn > 0);
    if (!playing) return;
    this.nextT -= dt * this.r.trouble * (this.sudden ? 2 : 1);
    if (this.nextT <= 0) {
      this.nextT = Math.max(0.75, 2.1 - this.r.t * 0.03);
      this.attack();
      if (this.r.t > 20 && this.rng.chance(0.3)) this.attack();
    }
  }

  private damage(p: Player, fromX: number) {
    if (!this.hurt(p, fromX, 0.9)) return;
    p.invuln = 1.5;
    this.hearts[p.id]--;
    this.r.emit({ type: 'sfx', name: 'ouch', x: p.cx, y: p.cy, vol: 1 });
    if (this.hearts[p.id] <= 0) this.eliminate(p, 'stracił ostatnie serce');
    else if (this.sudden) this.r.finish(this.other(p).id, `${p.name} trafiony w dogrywce`);
  }

  onProp(p: Player, pr: Prop) {
    this.damage(p, pr.x);
  }
  onFall(p: Player) {
    this.r.respawn(p);
  }

  timeUp() {
    const [a, b] = this.hearts;
    if (a !== b) return { winner: (a > b ? 0 : 1) as 0 | 1, reason: 'Więcej serc na koniec' };
    if (!this.sudden) {
      this.sudden = true;
      this.r.limit += 20;
      this.r.overtime = true;
      this.r.emit({ type: 'sfx', name: 'sudden', vol: 1 });
      return null;
    }
    return { winner: -1 as const, reason: 'Nikt nie dał się trafić w dogrywce' };
  }

  hud(): HudInfo {
    const ps = this.players.map((p) => ({ main: '', pips: this.hearts[p.id], pipsMax: 3, out: !p.alive })) as HudInfo['p'];
    return { p: ps, banner: this.sudden ? 'DOGRYWKA: PIERWSZE TRAFIENIE PRZEGRYWA' : undefined, bannerColor: '#ff4f6d' };
  }
}
