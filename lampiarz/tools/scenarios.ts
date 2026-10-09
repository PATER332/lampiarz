// Generates saved-run JSON for visual E2E checks (not shipped).
import { writeFileSync } from 'node:fs';
import { choosePath, grantRelic, newRun, openWorkshop, playerAct, workshopAct } from '../src/game/engine';
import { makeEnemy } from '../src/game/mapgen';
import { Rng } from '../src/game/rng';
import { DIRS4 } from '../src/game/grid';
import type { Run } from '../src/game/types';
import { TILE_WALL } from '../src/game/types';
import { botAction } from '../tests/helpers';

const out: Record<string, Run> = {};
const free = (r: Run, x: number, y: number) =>
  r.district.tiles[y * r.district.w + x] !== TILE_WALL && !r.district.lamps.some((l) => l.x === x && l.y === y) && !r.district.enemies.some((e) => e.x === x && e.y === y) && !(r.player.x === x && r.player.y === y);

// A: mid-district combat with several enemies near a lit lamp
{
  const r = newRun({ cls: 'lampiarz', night: 1, seed: 424242, daily: null });
  r.depth = 3;
  const rng = new Rng(3);
  for (let i = 0; i < 70 && r.phase === 'play'; i++) playerAct(r, botAction(r, rng));
  r.player.hp = r.player.maxHp = 5; r.player.oil = 6;
  const d = r.district; const p = r.player;
  const near = d.lamps.filter((l) => l.kind === 'lamp').sort((a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)))[0];
  near.lit = true;
  let id = 900;
  const types = ['cien', 'smigacz', 'lowca', 'smolnik', 'gasiciel'] as const;
  let ti = 0;
  for (let dy = -3; dy <= 3 && ti < types.length; dy++) for (let dx = -3; dx <= 3 && ti < types.length; dx++) {
    const x = p.x + dx, y = p.y + dy;
    if (Math.abs(dx) + Math.abs(dy) < 2 || x < 0 || y < 0 || x >= d.w || y >= d.h) continue;
    if (!free(r, x, y)) continue;
    const e = makeEnemy(id++, types[ti++], { x, y }, rng, 3);
    if (e.type === 'lowca') e.aim = dx === 0 ? { x: 0, y: Math.sign(-dy) } : dy === 0 ? { x: Math.sign(-dx), y: 0 } : null;
    d.enemies.push(e);
  }
  for (let i = 0; i < d.explored.length; i++) if (Math.abs((i % d.w) - p.x) < 8 && Math.abs(Math.floor(i / d.w) - p.y) < 6) d.explored[i] = 1;
  grantRelic(r, 'czujne_oko'); grantRelic(r, 'iskrownik'); grantRelic(r, 'zloty_knot');
  r.player.embers = 23;
  out.combat = r;
}
// B: workshop
{
  const r = newRun({ cls: 'kowalka', night: 2, seed: 777, daily: null });
  r.phase = 'summary';
  r.summary = { name: 'Stare Miasto', turns: 84, kills: 7, lamps: 6, totalLamps: 7, fullLight: false, flawless: true, embers: 31 };
  out.summary = JSON.parse(JSON.stringify(r));
  r.player.embers = 31; r.district.fullLight = true;
  openWorkshop(r, new Set());
  out.workshop = r;
  const r2 = JSON.parse(JSON.stringify(r)) as Run;
  workshopAct(r2, { type: 'leave' }, new Set());
  out.path = r2;
}
// C: final district with the boss close by and braziers lit
{
  const r = newRun({ cls: 'alchemik', night: 1, seed: 99, daily: null });
  r.depth = 5; r.phase = 'path'; r.pathOptions = [{ theme: 'latarnia', name: 'Cypel', danger: 4 }];
  choosePath(r, 'latarnia');
  const d = r.district;
  const lh = d.lamps.find((l) => l.kind === 'lighthouse')!;
  for (const l of d.lamps) if (l.kind === 'brazier') l.lit = true;
  const spot = DIRS4.find((dd) => free(r, lh.x + dd.x, lh.y + dd.y))!;
  r.player.x = lh.x + spot.x; r.player.y = lh.y + spot.y; r.player.oil = 5;
  const boss = d.enemies.find((e) => e.type === 'matka')!;
  for (const dd of [{ x: 3, y: 0 }, { x: -3, y: 0 }, { x: 0, y: 3 }, { x: 0, y: -3 }, { x: 3, y: 1 }, { x: 2, y: 2 }]) {
    if (free(r, r.player.x + dd.x, r.player.y + dd.y)) { boss.x = r.player.x + dd.x; boss.y = r.player.y + dd.y; break; }
  }
  boss.pulse = 1;
  for (let i = 0; i < d.explored.length; i++) d.explored[i] = 1;
  out.boss = r;
  const v = JSON.parse(JSON.stringify(r)) as Run;
  (v as any).__victoryMove = { dx: -spot.x, dy: -spot.y };
  out.victory = v;
}
// D: about to die
{
  const r = newRun({ cls: 'lampiarz', night: 1, seed: 5, daily: null });
  const d = r.district; const p = r.player;
  p.hp = 1;
  const dir = DIRS4.find((dd) => free(r, p.x + dd.x, p.y + dd.y))!;
  d.enemies = [makeEnemy(500, 'cien', { x: p.x + dir.x, y: p.y + dir.y }, new Rng(1), 1)];
  out.death = r;
}
writeFileSync(process.argv[2], JSON.stringify(out));
console.log('scenarios:', Object.keys(out).join(', '));
