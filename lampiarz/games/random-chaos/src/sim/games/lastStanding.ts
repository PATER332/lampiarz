// A. LAST ONE STANDING — a field of tiles over the void. Every tile crumbles a
// moment after someone stands on it, and the arena drops random tiles of its
// own (always flashing first). The first one to fall loses.
import type { Player } from '../player';
import type { Solid } from '../world';
import { Minigame, type GameDef, type HudInfo } from './base';

export const LAST_STANDING: GameDef = {
  id: 'lastStanding',
  name: 'LAST ONE STANDING',
  tagline: 'Płytki kruszą się pod stopami. Kto spadnie pierwszy, przegrywa.',
  rules: ['Płytka pęka chwilę po tym, jak na nią wejdziesz.', 'Migające płytki zaraz same spadną.', 'Zepchnij rywala w przepaść — S / ↓ to pchnięcie.'],
  theme: 'candy',
  music: 'bounce',
  time: 50,
  noMods: ['disappearing'],
  action: 'pchnięcie (w powietrzu: wbicie w ziemię)',
};

const TW = 80;

export class LastStanding extends Minigame {
  def = LAST_STANDING;
  tiles: Solid[] = [];
  dropT = 4;
  suddenDeath = false;

  build() {
    const W = this.w;
    W.bounds = { x: 0, y: -120, w: 1280, h: 840, killY: 820 };
    const rows: [number, number, number][] = [
      // y, first tile x, count
      [580, 160, 12],
      [445, 240, 10],
      [310, 320, 8],
    ];
    rows.forEach(([y, x0, n], ri) => {
      for (let i = 0; i < n; i++) {
        const t = this.w.block(x0 + i * TW + 2, y, TW - 4, 26, { oneway: ri > 0, style: 'tile', tint: (i + ri) % 4, crumble: 1.3 });
        this.tiles.push(t);
      }
    });
  }
  spawnPoint(id: 0 | 1): [number, number] {
    return id === 0 ? [360, 580] : [920, 580];
  }

  step(dt: number, playing: boolean) {
    if (!playing) return;
    // the arena drops random tiles, faster and faster
    this.dropT -= dt * this.r.trouble * (this.suddenDeath ? 3 : 1);
    if (this.dropT <= 0) {
      this.dropT = Math.max(0.9, 3.2 - this.r.t * 0.04);
      const idle = this.tiles.filter((t) => t.state === 'idle');
      if (idle.length > 2) {
        const t = this.rng.pick(idle);
        t.trigger(1.3);
        this.r.emit({ type: 'sfx', name: 'crack', x: t.x + t.w / 2, y: t.y, vol: 0.7 });
      }
    }
    // tiles hold less and less as the round goes on
    const hold = this.suddenDeath ? 0.4 : Math.max(0.55, 1.3 - this.r.t * 0.025);
    for (const t of this.tiles) if (t.state === 'idle') t.crumble = hold;
  }

  timeUp() {
    if (!this.suddenDeath) {
      this.suddenDeath = true;
      this.r.limit += 20;
      this.r.overtime = true;
      this.r.emit({ type: 'sfx', name: 'sudden', vol: 1 });
      return null;
    }
    // still both standing after the overtime: the one with more ground under them wins
    const [a, b] = this.players;
    const ga = this.groundNear(a);
    const gb = this.groundNear(b);
    if (ga === gb) return { winner: -1 as const, reason: 'Oboje wytrwali do końca' };
    return { winner: (ga > gb ? 0 : 1) as 0 | 1, reason: 'Więcej płytek wokół siebie' };
  }
  private groundNear(p: Player) {
    return this.tiles.filter((t) => t.state === 'idle' && Math.abs(t.x + t.w / 2 - p.cx) < 260 && Math.abs(t.y - p.bottom) < 200).length;
  }

  hud(): HudInfo {
    const left = this.tiles.filter((t) => t.state === 'idle' || t.state === 'warn').length;
    const ps = this.players.map((p) => ({ main: p.alive ? 'STOI' : 'ODPADŁ', sub: `płytki: ${left}`, out: !p.alive })) as HudInfo['p'];
    return { p: ps, banner: this.suddenDeath ? 'NAGŁA ŚMIERĆ' : undefined, bannerColor: '#ff4f6d' };
  }
}
