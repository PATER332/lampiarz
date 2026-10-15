// D. CHAOS RACE — a factory obstacle course to the right: stepping stones,
// speed pads, moving platforms, a crushing piston, a fan lift over a pit, a
// crumbling bridge, a spring over a wall, falling anvils and a gate that only
// opens while someone stands on its button. First to the flag wins.
import { clamp, type Rect } from '../../engine/math';
import type { Player } from '../player';
import { Prop, type Solid, Zone } from '../world';
import { Minigame, type GameDef, type HudInfo } from './base';

export const RACE: GameDef = {
  id: 'race',
  name: 'CHAOS RACE',
  tagline: 'Wyścig przez fabrykę pułapek. Pierwszy przy fladze wygrywa.',
  rules: ['Biegnij w prawo do flagi. Upadek cofa do ostatniego punktu kontrolnego.', 'Wentylatory unoszą, sprężyny wybijają, tłok miażdży.', 'Brama otwiera się, gdy ktoś stoi na przycisku. S / ↓ to pchnięcie.'],
  theme: 'factory',
  music: 'race',
  time: 75,
  action: 'pchnięcie (w powietrzu: wbicie w ziemię)',
};

const END = 6400;
export const RACE_CHECKPOINTS = [120, 620, 1400, 2100, 2860, 3200, 3980, 4600, 5180, 5600, 6000];

export class Race extends Minigame {
  def = RACE;
  cp: [number, number] = [0, 0];
  best: [number, number] = [0, 0];
  behindT: [number, number] = [0, 0];
  gate!: Solid;
  gateOpen = 0;
  button!: Zone;
  goal!: Zone;
  piston!: Solid;
  anvilT = 2;

  build() {
    const W = this.w;
    W.bounds = { x: 0, y: -400, w: END, h: 1120, killY: 780 };
    const G = 600;
    // 1. start and stepping stones
    this.floor(0, G, 700, 140);
    this.plat(800, 560, 130, { tint: 1 });
    this.plat(1010, 520, 130, { tint: 1 });
    this.plat(1190, 560, 110, { tint: 1 });
    // 2. speed pad and hurdles
    this.floor(1320, G, 820, 140);
    W.zone(new Zone(1360, G - 12, 140, 12, 'pad', 720, [1, 0]));
    this.wall(1600, G - 60, 50, 60, { style: 'crate' });
    this.wall(1860, G - 110, 60, 110, { style: 'crate' });
    // 3. moving platforms over a pit
    this.plat(2150, 560, 150, { tint: 2, path: (t) => [2150 + (Math.sin(t * 1.1) * 0.5 + 0.5) * 190, 560] });
    this.plat(2440, 520, 130, { tint: 2, path: (t) => [2440, 470 + (Math.sin(t * 1.4 + 1) * 0.5 + 0.5) * 120] });
    this.plat(2600, 560, 130, { tint: 2, path: (t) => [2600 + (Math.sin(t * 1.2 + 2) * 0.5 + 0.5) * 120, 560] });
    // 4. the piston
    this.floor(2780, G, 560, 140);
    const cyc = (t: number) => {
      const u = (t % 3.4) / 3.4;
      // up most of the time, slams down, waits, rises
      const k = u < 0.55 ? 0 : u < 0.6 ? (u - 0.55) / 0.05 : u < 0.8 ? 1 : 1 - (u - 0.8) / 0.2;
      return k;
    };
    this.piston = this.w.block(3020, -80, 80, 520, { style: 'metal', tag: 'piston', path: (t) => [3020, -80 + cyc(t) * 160] });
    // 5. fan lift over a pit
    this.floor(3900, G, 200, 140);
    W.zone(new Zone(3380, 180, 500, 440, 'fan', 3300, [0, -1]));
    this.plat(3560, 300, 140, { tint: 3 });
    // 6. crumbling bridge
    for (let i = 0; i < 5; i++) this.w.block(4100 + i * 80 + 2, G, 76, 30, { style: 'tile', tint: i % 4, crumble: 0.42, respawn: 2.4 });
    // 7. spring over the wall, then falling anvils
    this.floor(4500, G, 1400, 140);
    this.w.block(4760, G - 14, 100, 14, { spring: 1450, style: 'spring' });
    this.wall(4860, G - 300, 80, 300, { style: 'metal' });
    // 8. the gate and its button
    this.button = W.zone(new Zone(5700, G - 10, 70, 10, 'button'));
    this.gate = this.wall(5940, G - 230, 40, 230, { style: 'gate', tag: 'gate' });
    this.floor(5900, G, END - 5900, 140);
    this.goal = W.zone(new Zone(6240, G - 260, 60, 260, 'goal'));
  }
  spawnPoint(id: 0 | 1): [number, number] {
    return id === 0 ? [90, 600] : [170, 600];
  }
  respawnPoint(id: 0 | 1): [number, number] {
    const x = RACE_CHECKPOINTS[this.cp[id]];
    const y = this.w.groundBelow(x, -300) ?? 600;
    return [x + (id === 0 ? -14 : 14), y];
  }

  step(dt: number, playing: boolean) {
    // the piston pushes anyone under it back the way they came
    const pi = this.piston;
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.x + p.w > pi.x && p.x < pi.x + pi.w && p.y < pi.y + pi.h && p.bottom > pi.y + pi.h - 30 && pi.dy > 0) {
        p.x = pi.x - p.w - 1;
        p.vx = -320;
        p.stun = Math.max(p.stun, 0.3);
        this.r.emit({ type: 'impact', x: pi.x, y: pi.y + pi.h, power: 0.6 });
      }
    }
    // the gate
    this.button.pressed = this.players.some((p) => p.alive && p.grounded && p.x + p.w > this.button.x && p.x < this.button.x + this.button.w);
    if (this.button.pressed) {
      if (this.gateOpen <= 0) this.r.emit({ type: 'button', x: this.button.x + 35, y: this.button.y, on: true });
      this.gateOpen = 2.8;
    } else if (this.gateOpen > 0) {
      this.gateOpen -= dt;
      if (this.gateOpen <= 0) this.r.emit({ type: 'gate', x: this.gate.x, y: this.gate.y, on: false });
    }
    const gy = this.gateOpen > 0 ? 600 - 230 - 210 : 600 - 230;
    const blocked = this.players.some((p) => p.alive && p.x + p.w > this.gate.x && p.x < this.gate.x + this.gate.w && p.y < 600 && p.bottom > 600 - 230);
    if (gy > this.gate.y && blocked) {
      /* never close onto somebody */
    } else this.gate.y += clamp(gy - this.gate.y, -600 * dt, 600 * dt);
    if (!playing) return;

    for (const p of this.players) {
      if (!p.alive) continue;
      this.best[p.id] = Math.max(this.best[p.id], p.cx);
      while (this.cp[p.id] < RACE_CHECKPOINTS.length - 1 && p.cx > RACE_CHECKPOINTS[this.cp[p.id] + 1] && p.grounded) this.cp[p.id]++;
      if (p.x + p.w > this.goal.x && p.x < this.goal.x + this.goal.w && p.bottom > this.goal.y) {
        this.r.finish(p.id, `${p.name} pierwszy na mecie`);
        return;
      }
    }
    // somebody far behind and off camera: back to the leader's checkpoint
    const [a, b] = this.players;
    const lead = a.cx > b.cx ? a : b;
    const back = lead === a ? b : a;
    if (lead.cx - back.cx > 1500 && back.alive) {
      this.behindT[back.id] += dt;
      if (this.behindT[back.id] > 1.6) {
        this.behindT[back.id] = 0;
        this.cp[back.id] = Math.max(0, this.cp[lead.id] - 1);
        this.r.respawn(back);
        this.r.emit({ type: 'text', text: 'DOGANIASZ!', x: back.cx, y: back.y - 30 });
      }
    } else this.behindT[back.id] = 0;
    // anvils in the last hall, always with a shadow first
    this.anvilT -= dt * this.r.trouble;
    if (this.anvilT <= 0) {
      this.anvilT = this.rng.range(0.9, 1.6);
      const x = this.rng.range(5120, 5650);
      if (this.players.some((p) => Math.abs(p.cx - x) < 900)) {
        const pr = this.w.prop(new Prop('anvil', x, -380, 26, 0.1, true));
        pr.ttl = 5;
        this.r.emit({ type: 'warn', x, y: 600, power: 0.7 });
      }
    }
  }

  onFall(p: Player) {
    this.r.respawn(p);
  }

  timeUp() {
    const [a, b] = this.best;
    if (Math.abs(a - b) < 20) return { winner: -1 as const, reason: 'Łeb w łeb' };
    return { winner: (a > b ? 0 : 1) as 0 | 1, reason: 'Dalej na trasie, gdy skończył się czas' };
  }

  view(): Rect {
    const [a, b] = this.players;
    const ps = [a, b].filter((p) => p.alive);
    const lead = ps.reduce((m, p) => (p.cx > m.cx ? p : m), ps[0] ?? a);
    const near = ps.filter((p) => lead.cx - p.cx < 1400);
    const x0 = Math.min(...near.map((p) => p.cx)) - 360;
    const x1 = Math.max(...near.map((p) => p.cx)) + 520;
    const y0 = Math.min(...near.map((p) => p.y)) - 220;
    const y1 = Math.max(600 + 140, ...near.map((p) => p.bottom + 160));
    return { x: x0, y: Math.min(y0, y1 - 720), w: x1 - x0, h: Math.max(720, y1 - Math.min(y0, y1 - 720)) };
  }

  hud(): HudInfo {
    const ps = this.players.map((p) => ({ main: `${Math.min(100, Math.round((this.best[p.id] / 6240) * 100))}%`, sub: `punkt kontrolny ${this.cp[p.id] + 1}/${RACE_CHECKPOINTS.length}`, bar: Math.min(1, this.best[p.id] / 6240) })) as HudInfo['p'];
    return { p: ps };
  }
}
