import { bfs, DIRS4 } from '../src/game/grid';
import {
  inBrazierWarmth,
  choosePath,
  enemyAt,
  gateOpen,
  lampAt,
  openWorkshop,
  playerAct,
  resolveEvent,
  workshopAct,
} from '../src/game/engine';
import { EVENT_MAP } from '../src/game/content';
import { computeLight } from '../src/game/light';
import type { Action, Point, Run } from '../src/game/types';
import { TILE_WALL } from '../src/game/types';
import { Rng } from '../src/game/rng';

let waits = 0;
/** A reasonably smart bot: lights braziers, grabs oil when low, fights adjacent shadows, heads to gate. */
export function botAction(run: Run, rng: Rng): Action {
  const d = run.district;
  const p = run.player;
  const light = computeLight(run);
  // fight adjacent enemies
  for (const dir of DIRS4) {
    const e = enemyAt(d, p.x + dir.x, p.y + dir.y);
    if (e) {
      if (p.oil >= 3 && d.enemies.filter((o) => Math.abs(o.x - p.x) + Math.abs(o.y - p.y) <= 2).length >= 2)
        return { type: 'ability' };
      return { type: 'move', dx: dir.x, dy: dir.y };
    }
  }
  // rest by a brazier when hurt
  if (p.hp <= Math.ceil(p.maxHp / 2) && inBrazierWarmth(run, light) && !d.enemies.some((e) => Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= 2))
    return { type: 'wait' };
  // dodge łowca aim
  for (const e of d.enemies) {
    if (e.aim) {
      for (const dir of DIRS4) {
        if (dir.x === e.aim.x || dir.y === e.aim.y) {
          const nx = p.x + dir.x;
          const ny = p.y + dir.y;
          if (d.tiles[ny * d.w + nx] !== TILE_WALL && !lampAt(d, nx, ny) && !enemyAt(d, nx, ny) && (dir.x !== 0) !== (e.aim.x !== 0))
            return { type: 'move', dx: dir.x, dy: dir.y };
        }
      }
    }
  }
  const passable = (x: number, y: number) =>
    d.tiles[y * d.w + x] !== TILE_WALL && !lampAt(d, x, y) && !(x === d.gate.x && y === d.gate.y && !gateOpen(d));
  const targets: Point[] = [];
  const unlitB = d.lamps.filter((l) => l.kind === 'brazier' && !l.lit);
  const lighthouse = d.lamps.find((l) => l.kind === 'lighthouse');
  const hunters = d.enemies.filter((e) => e.type === 'gasiciel' && e.snuffTarget != null);
  if (hunters.length) targets.push(...hunters);
  if (!targets.length && p.oil < 3) for (const it of d.items) if (it.kind === 'oil') targets.push(it);
  if (p.oil < 2 && !targets.length) {
    for (const l of d.lamps)
      if (l.kind === 'lamp' && l.lit && Math.abs(l.x - p.x) + Math.abs(l.y - p.y) === 1) {
        p.facing = { x: l.x - p.x, y: l.y - p.y };
        return { type: 'interact' };
      }
    targets.push(...d.enemies.filter((e) => e.type !== 'matka'));
  }
  if (!targets.length) {
    if (unlitB.length && p.oil >= 2) targets.push(...unlitB);
    else if (lighthouse && gateOpen(d) && p.oil >= 3) targets.push(lighthouse);
    else if (!lighthouse && gateOpen(d)) targets.push(d.gate);
    else {
      const cheap = d.lamps.filter((l) => l.kind === 'lamp' && !l.lit);
      for (const it of d.items) if (it.kind !== 'event' || rng.chance(0.5)) targets.push(it);
      if (p.oil >= 2) targets.push(...cheap);
      if (lighthouse && !targets.length) {
        const boss = d.enemies.find((e) => e.type === 'matka');
        if (boss) targets.push(boss);
      }
    }
  }
  function drainOrGo(l: Point): Action {
    if (Math.abs(l.x - p.x) + Math.abs(l.y - p.y) === 1) {
      p.facing = { x: l.x - p.x, y: l.y - p.y };
      return { type: 'interact' };
    }
    targets.push(l);
    return { type: 'wait' };
  }
  void drainOrGo;
  if (!targets.length) return { type: 'wait' };
  // adjacent target that is a lamp -> light it via move
  for (const dir of DIRS4) {
    const l = lampAt(d, p.x + dir.x, p.y + dir.y);
    if (l && !l.lit && targets.includes(l)) return { type: 'move', dx: dir.x, dy: dir.y };
  }
  const srcs: Point[] = [];
  for (const t of targets) {
    if (passable(t.x, t.y)) srcs.push(t);
    else for (const dir of DIRS4) if (passable(t.x + dir.x, t.y + dir.y)) srcs.push({ x: t.x + dir.x, y: t.y + dir.y });
  }
  const map = bfs(d.w, d.h, srcs, passable);
  let best: Point | null = null;
  let bv = map[p.y * d.w + p.x];
  for (const dir of DIRS4) {
    const nx = p.x + dir.x;
    const ny = p.y + dir.y;
    const v = map[ny * d.w + nx];
    if (v >= 0 && (bv < 0 || v < bv) && (passable(nx, ny) || enemyAt(d, nx, ny))) {
      bv = v;
      best = dir;
    }
  }
  void light;
  if (best) {
    // don't walk into a shadow's reach: let it come to us and strike first
    const nx = p.x + best.x;
    const ny = p.y + best.y;
    const danger = d.enemies.some(
      (e) => e.type !== 'gasiciel' && Math.abs(e.x - nx) + Math.abs(e.y - ny) <= (e.type === 'smigacz' ? 2 : 1),
    );
    const hereSafe = !d.enemies.some((e) => Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= (e.type === 'smigacz' ? 3 : 2));
    const patient = waits < 5;
    if (danger && patient && rng.chance(0.85)) {
      waits++;
      return { type: 'wait' };
    }
    void hereSafe;
    waits = 0;
    return { type: 'move', dx: best.x, dy: best.y };
  }
  const dir = rng.pick(DIRS4);
  return { type: 'move', dx: dir.x, dy: dir.y };
}

/** Advance any non-play phase with sensible choices. */
export function botMeta(run: Run, rng: Rng, unlocked: Set<string>) {
  if (run.phase === 'event' && run.pendingEvent) {
    const ev = EVENT_MAP[run.pendingEvent.id];
    resolveEvent(run, rng.pick(ev.choices).id, unlocked);
    if (run.phase === 'event') resolveEvent(run, ev.choices[ev.choices.length - 1].id, unlocked);
  } else if (run.phase === 'summary') openWorkshop(run, unlocked);
  else if (run.phase === 'workshop') {
    const ws = run.workshop!;
    if (run.player.hp < run.player.maxHp - 1) workshopAct(run, { type: 'heal' }, unlocked);
    const i = ws.offers.findIndex((o) => !o.sold && (ws.freePick || o.price <= run.player.embers));
    if (i >= 0) workshopAct(run, { type: 'buy', index: i }, unlocked);
    if (run.player.oil < run.player.maxOil - 2) workshopAct(run, { type: 'oil' }, unlocked);
    workshopAct(run, { type: 'leave' }, unlocked);
  } else if (run.phase === 'path') choosePath(run, rng.pick(run.pathOptions!).theme);
}

export function playRun(run: Run, botSeed: number, unlocked = new Set<string>(), maxSteps = 6000) {
  const rng = new Rng(botSeed);
  let steps = 0;
  while (run.phase !== 'victory' && run.phase !== 'defeat' && steps < maxSteps) {
    steps++;
    if (run.phase === 'play') playerAct(run, botAction(run, rng));
    else botMeta(run, rng, unlocked);
  }
  return steps;
}
