// LAMPIARZ game engine: pure turn logic. UI calls the exported functions,
// receives Fx events for animation/audio, and persists the Run as JSON.

import { BALANCE } from './balance';
import { CLASSES, ENEMIES, EVENT_MAP, EVENTS, PATH_THEMES, RELIC_MAP, RELICS, THEMES, WEATHERS } from './content';
import { bfs, DIRS4, DIRS8, dist, inBounds, lineOfSight, manhattan } from './grid';
import { computeLight, type LightState } from './light';
import { gasicielCap, generateDistrict, makeEnemy, rollEnemyType, weatherFor } from './mapgen';
import { hashString, Rng } from './rng';
import type {
  Action,
  ClassId,
  District,
  Enemy,
  EnemyType,
  Fx,
  Item,
  Lamp,
  PathOption,
  Point,
  Run,
  RunMode,
  ThemeId,
  Tone,
  Workshop,
} from './types';
import { TILE_FLOOR, TILE_WALL } from './types';

export const RUN_VERSION = 3;

interface Ctx {
  run: Run;
  rng: Rng;
  fx: Fx[];
  light: LightState;
}

function ctxOf(run: Run): Ctx {
  return { run, rng: new Rng(run.rngState), fx: [], light: computeLight(run) };
}
function commit(ctx: Ctx): Fx[] {
  ctx.run.rngState = ctx.rng.state;
  return ctx.fx;
}

// ------------------------------------------------------------------ helpers
export const hasRelic = (run: Run, id: string) => run.player.relics.includes(id);
export const lampAt = (d: District, x: number, y: number) => d.lamps.find((l) => l.x === x && l.y === y);
export const enemyAt = (d: District, x: number, y: number) => d.enemies.find((e) => e.x === x && e.y === y);
export const itemAt = (d: District, x: number, y: number) => d.items.find((i) => i.x === x && i.y === y);
const isWall = (d: District, x: number, y: number) => !inBounds(d.w, d.h, x, y) || d.tiles[y * d.w + x] === TILE_WALL;
export const braziers = (d: District) => d.lamps.filter((l) => l.kind === 'brazier');
export const barrelAt = (d: District, x: number, y: number) => (d.barrels ?? []).find((b) => b.x === x && b.y === y);
export const isEndless = (run: Run) => run.mode === 'endless';
export const gateOpen = (d: District) => !!d.gateUnlocked || braziers(d).every((b) => b.lit);
export const isFinal = (run: Run) => run.district.theme === 'latarnia';

function log(run: Run, text: string, tone: Tone = 'info') {
  run.log.push({ text, tone, turn: run.district.turn });
  if (run.log.length > 40) run.log.splice(0, run.log.length - 40);
}

function recompute(ctx: Ctx) {
  ctx.light = computeLight(ctx.run);
}

function exploreVisible(ctx: Ctx) {
  const d = ctx.run.district;
  for (let i = 0; i < d.explored.length; i++) if (ctx.light.visible[i]) d.explored[i] = 1;
  // note discovered enemy types
  for (const e of d.enemies) {
    if (ctx.light.visible[e.y * d.w + e.x] && !ctx.run.seenEnemies.includes(e.type)) ctx.run.seenEnemies.push(e.type);
  }
}

// ------------------------------------------------------------------ run creation
export interface NewRunOptions {
  cls: ClassId;
  night: number;
  seed: number;
  daily: string | null;
  /** 'endless' = "Do świtu" */
  mode?: RunMode;
  /** permanent upgrades from the profile (ignored for the daily night) */
  mastery?: Record<string, number>;
}

export function newRun(opts: NewRunOptions): Run {
  const def = CLASSES[opts.cls];
  const mastery = opts.daily ? {} : { ...(opts.mastery ?? {}) };
  const lv = (id: string) => mastery[id] ?? 0;
  const maxHp = def.hp - (opts.night >= 5 ? 1 : 0) + lv('hart');
  const run: Run = {
    version: RUN_VERSION,
    seed: opts.seed >>> 0,
    rngState: hashString('run:' + opts.seed),
    cls: opts.cls,
    night: opts.night,
    daily: opts.daily,
    depth: 1,
    district: null as unknown as District,
    player: {
      x: 0,
      y: 0,
      facing: { x: 1, y: 0 },
      hp: maxHp,
      maxHp,
      oil: Math.min(def.maxOil + lv('zapas'), def.startOil + lv('zapas')),
      maxOil: def.maxOil + lv('zapas'),
      embers: 4 * lv('kieszen'),
      relics: [],
      lanternTimer: 0,
    },
    stats: {
      kills: 0,
      lampsLit: 0,
      embersGained: 0,
      turns: 0,
      damageTaken: 0,
      districts: 0,
      oilUsed: 0,
      flawlessDistricts: 0,
      zeroOilFinish: false,
    },
    phase: 'play',
    workshop: null,
    pathOptions: null,
    pendingEvent: null,
    log: [],
    phoenixUsed: false,
    shrineFound: false,
    bossSlain: false,
    killedBy: null,
    score: 0,
    startedAt: Date.now(),
    seenEnemies: [],
    seenRelics: [],
    summary: null,
    mode: opts.mode ?? 'normal',
    mastery,
  };
  enterDistrict(run, 'stare');
  log(run, 'Zmierzch. Miasto tonie w mroku, a latarnie czekają na płomień.', 'lore');
  log(run, 'Zapal trzy znicze, by otworzyć bramę do następnej dzielnicy.', 'info');
  if (run.mode === 'endless') log(run, 'Tryb „Do świtu”: dzielnice nie mają końca. Ile wytrzymasz?', 'lore');
  return run;
}

function enterDistrict(run: Run, theme: ThemeId) {
  const seed = hashString(`${run.seed}:${run.depth}:${theme}`);
  const d = generateDistrict({
    depth: run.depth,
    theme,
    seed,
    night: run.night,
    hasMapRelic: run.player.relics.includes('mapa'),
  });
  const rng = new Rng(run.rngState);
  const unseen = EVENTS.map((e) => e.id);
  for (const it of d.items) if (it.kind === 'event') it.eventId = rng.pick(unseen);
  run.rngState = rng.state;
  run.district = d;
  run.player.x = d.start.x;
  run.player.y = d.start.y;
  run.player.lanternTimer = 0;
  run.phase = 'play';
  run.summary = null;
  run.pendingEvent = null;
  const ctx = ctxOf(run);
  exploreVisible(ctx);
  if (theme === 'latarnia') {
    const p = run.player;
    p.hp = p.maxHp;
    gainOil(run, BALANCE.boss.arrivalOil);
    log(run, 'Cypel Latarni. Wiatr od morza przywraca ci siły (pełne zdrowie, +2 oleju).', 'lore');
    log(run, 'Matka Mroku śpi przy latarni morskiej. Obudzi się, gdy zapalisz pierwszy znicz.', 'warn');
    log(run, 'Cel: zapal 3 znicze, potem latarnię morską (1 olej) — albo rozprosz Matkę.', 'info');
  } else {
    log(run, `Dzielnica ${run.depth}: ${d.name}.`, 'lore');
    const w = d.weather ?? 'jasna';
    if (w !== 'jasna') log(run, `${WEATHERS[w].name}. ${WEATHERS[w].desc}`, 'warn');
  }
}

// ------------------------------------------------------------------ public actions
export function playerAct(run: Run, action: Action): Fx[] {
  if (run.phase !== 'play') return [];
  const ctx = ctxOf(run);
  let consumed = false;
  switch (action.type) {
    case 'move':
      consumed = doMove(ctx, action.dx, action.dy);
      break;
    case 'wait':
      consumed = true;
      rest(ctx);
      break;
    case 'ability':
      consumed = doAbility(ctx);
      break;
    case 'interact':
      consumed = doInteract(ctx);
      break;
  }
  if (action.type !== 'wait') run.district.rest = 0;
  if (consumed && (run.phase === 'play' || run.phase === 'event')) endTurn(ctx);
  return commit(ctx);
}

// ------------------------------------------------------------------ player actions
/** Is the player warmed by a burning brazier (or the lighthouse)? */
export function inBrazierWarmth(run: Run, light: LightState): boolean {
  const d = run.district;
  const p = run.player;
  if (!light.holy[p.y * d.w + p.x]) return false;
  return d.lamps.some((l) => l.lit && l.kind === 'brazier' && dist(l, p) <= BALANCE.light.brazierRadius + d.mods.lampRadiusBonus + (hasRelic(run, 'zloty_knot') ? 1 : 0));
}

function rest(ctx: Ctx) {
  const { run } = ctx;
  const d = run.district;
  const p = run.player;
  if (p.hp >= p.maxHp || !inBrazierWarmth(run, ctx.light)) {
    d.rest = 0;
    return;
  }
  d.rest = (d.rest ?? 0) + 1;
  if (d.rest >= BALANCE.rest.turns) {
    d.rest = 0;
    p.hp++;
    ctx.fx.push({ k: 'heal', amount: 1 });
    ctx.fx.push({ k: 'text', x: p.x, y: p.y, text: '+1 zdrowie', color: '#e97a6a' });
    log(run, 'Ciepło znicza goi rany (+1 zdrowia).', 'good');
  }
}

function meleeDamage(run: Run): number {
  return CLASSES[run.cls].melee + (hasRelic(run, 'iskrownik') ? 1 : 0);
}

function doMove(ctx: Ctx, dx: number, dy: number): boolean {
  const { run } = ctx;
  const d = run.district;
  const p = run.player;
  p.facing = { x: dx, y: dy };
  const nx = p.x + dx;
  const ny = p.y + dy;
  if (isWall(d, nx, ny)) {
    ctx.fx.push({ k: 'bump', x: p.x, y: p.y, dx, dy });
    return false;
  }
  const enemy = enemyAt(d, nx, ny);
  if (enemy) {
    ctx.fx.push({ k: 'attack', from: -1, x: p.x, y: p.y, dx, dy });
    damageEnemy(ctx, enemy, meleeDamage(run));
    return true;
  }
  const barrel = barrelAt(d, nx, ny);
  if (barrel) {
    ctx.fx.push({ k: 'attack', from: -1, x: p.x, y: p.y, dx, dy });
    log(run, 'Rozbijasz beczkę — olej bucha ogniem!', 'warn');
    explodeBarrel(ctx, barrel);
    return true;
  }
  const lamp = lampAt(d, nx, ny);
  if (lamp) {
    if (!lamp.lit) return lightLamp(ctx, lamp);
    if (lamp.kind === 'lamp') log(run, 'Latarnia płonie. [F] — zbierz z niej olej.', 'info');
    ctx.fx.push({ k: 'bump', x: p.x, y: p.y, dx, dy });
    return false;
  }
  if (!isFinal(run) && nx === d.gate.x && ny === d.gate.y) {
    if (!gateOpen(d)) {
      const lit = braziers(d).filter((b) => b.lit).length;
      log(run, `Brama zamknięta. Płonące znicze: ${lit}/3.`, 'warn');
      ctx.fx.push({ k: 'deny' });
      return false;
    }
    p.x = nx;
    p.y = ny;
    completeDistrict(ctx);
    return false;
  }
  p.x = nx;
  p.y = ny;
  ctx.fx.push({ k: 'step' });
  const item = itemAt(d, nx, ny);
  if (item) pickup(ctx, item);
  return true;
}

function emberAmount(run: Run, base: number): number {
  let v = base * run.district.mods.emberMult * (run.district.weather === 'pelnia' ? BALANCE.weather.moonEmbers : 1);
  if (hasRelic(run, 'kieszen_zaru')) v *= 1.5;
  return Math.max(1, Math.round(v));
}

function gainEmbers(ctx: Ctx, amount: number, x: number, y: number) {
  ctx.run.player.embers += amount;
  ctx.run.stats.embersGained += amount;
  ctx.fx.push({ k: 'pickup', x, y, kind: 'embers', amount });
}

function gainOil(run: Run, amount: number): number {
  const p = run.player;
  const before = p.oil;
  p.oil = Math.min(p.maxOil, p.oil + amount);
  return p.oil - before;
}

function pickup(ctx: Ctx, item: Item) {
  const { run } = ctx;
  const d = run.district;
  switch (item.kind) {
    case 'oil': {
      const amt = item.amount + (run.cls === 'alchemik' ? 1 : 0) + (d.weather === 'deszcz' ? 1 : 0);
      const got = gainOil(run, amt);
      if (got <= 0) {
        log(run, 'Zbiornik pełny — kanister zostaje na później.', 'info');
        return;
      }
      ctx.fx.push({ k: 'pickup', x: item.x, y: item.y, kind: 'oil', amount: got });
      log(run, `Kanister: +${got} oleju.`, 'good');
      break;
    }
    case 'embers': {
      const amt = emberAmount(run, item.amount);
      gainEmbers(ctx, amt, item.x, item.y);
      log(run, `Stos żaru: +${amt}.`, 'good');
      break;
    }
    case 'event': {
      run.pendingEvent = { id: item.eventId ?? 'handlarz', itemId: item.id };
      run.phase = 'event';
      return; // item removed on resolve
    }
    case 'shrine': {
      run.shrineFound = true;
      const relic = !hasRelic(run, 'zloty_knot')
        ? 'zloty_knot'
        : RELICS.find((r) => r.rarity === 'rare' && !hasRelic(run, r.id) && !r.shopless)?.id;
      if (relic) {
        grantRelic(run, relic);
        recompute(ctx);
        holyBurn(ctx);
        log(run, `Zapomniana kapliczka. W popiele leży ${RELIC_MAP[relic].name}.`, 'lore');
        ctx.fx.push({ k: 'flare', x: item.x, y: item.y, r: 2, color: '#f0c46c' });
      } else {
        gainEmbers(ctx, 10, item.x, item.y);
      }
      break;
    }
  }
  d.items = d.items.filter((i) => i !== item);
}

function lampCost(run: Run, lamp: Lamp): number {
  const d = run.district;
  if (lamp.kind === 'brazier') return BALANCE.light.brazierCost;
  if (lamp.kind === 'lighthouse') return BALANCE.light.lighthouseCost;
  if (run.cls === 'lampiarz' && d.lampsLitHere === 0) return 0;
  if (hasRelic(run, 'krzesiwo') && (d.freeLampCounter + 1) % 3 === 0) return 0;
  return BALANCE.light.lampCost;
}
export { lampCost };

function lightLamp(ctx: Ctx, lamp: Lamp): boolean {
  const { run } = ctx;
  const d = run.district;
  if (lamp.kind === 'lighthouse' && !gateOpen(d)) {
    log(run, 'Latarnia morska zapłonie dopiero od trzech płonących zniczy.', 'warn');
    ctx.fx.push({ k: 'deny' });
    return false;
  }
  const cost = lampCost(run, lamp);
  if (run.player.oil < cost) {
    log(run, `Za mało oleju — potrzeba ${cost}.`, 'bad');
    ctx.fx.push({ k: 'deny' });
    return false;
  }
  spendOil(ctx, cost);
  lamp.lit = true;
  if (lamp.kind === 'lamp') {
    d.lampsLitHere++;
    d.freeLampCounter++;
  }
  run.stats.lampsLit++;
  ctx.fx.push({ k: 'light', x: lamp.x, y: lamp.y, kind: lamp.kind });
  const wasOpen = lamp.kind === 'brazier' && !d.gateUnlocked && braziers(d).every((b) => b.lit);
  if (wasOpen) d.gateUnlocked = true;
  recompute(ctx);
  holyBurn(ctx);
  if (lamp.kind === 'lighthouse') {
    log(run, 'Latarnia morska płonie! Mrok cofa się do morza.', 'good');
    victory(ctx);
    return false;
  }
  if (lamp.kind === 'brazier') {
    const lit = braziers(d).filter((b) => b.lit).length;
    if (wasOpen) {
      log(run, isFinal(run) ? 'Wszystkie znicze płoną — latarnia morska czeka na płomień!' : 'Wszystkie znicze płoną — brama otwiera się na dobre!', 'good');
      ctx.fx.push({ k: 'gate', open: true });
    } else log(run, `Znicz zapłonął (${lit}/3).`, 'good');
    maybeCallMiniboss(ctx);
  } else {
    log(run, cost === 0 ? 'Latarnia zapłonęła — za darmo.' : 'Latarnia zapłonęła.', 'good');
  }
  const lamps = d.lamps.filter((l) => l.kind === 'lamp');
  if (!d.fullLight && lamps.every((l) => l.lit)) {
    d.fullLight = true;
    const bonus = BALANCE.rewards.fullLightEmbers;
    gainEmbers(ctx, bonus, run.player.x, run.player.y);
    log(run, `Pełne światło! +${bonus} żaru i darmowy relikt w warsztacie.`, 'good');
  }
  return true;
}

function spendOil(ctx: Ctx, n: number) {
  const { run } = ctx;
  if (n <= 0) return;
  run.player.oil = Math.max(0, run.player.oil - n);
  run.stats.oilUsed += n;
  checkEmptyOil(ctx);
}

function checkEmptyOil(ctx: Ctx) {
  const { run } = ctx;
  const d = run.district;
  if (run.player.oil > 0) return;
  if (hasRelic(run, 'serce_latarni') && !d.heartUsed) {
    d.heartUsed = true;
    gainOil(run, 4);
    log(run, 'Serce latarni bije mocniej: +4 oleju.', 'good');
    ctx.fx.push({ k: 'text', x: run.player.x, y: run.player.y, text: '+4 olej', color: '#e8b04b' });
  } else {
    log(run, 'Latarnia przygasa — skończył się olej!', 'bad');
  }
}

function doInteract(ctx: Ctx): boolean {
  const { run } = ctx;
  const d = run.district;
  const p = run.player;
  const order = [p.facing, ...DIRS4.filter((dd) => dd.x !== p.facing.x || dd.y !== p.facing.y)];
  for (const dir of order) {
    const lamp = lampAt(d, p.x + dir.x, p.y + dir.y);
    if (!lamp) continue;
    if (!lamp.lit) return lightLamp(ctx, lamp);
    if (lamp.kind !== 'lamp') continue;
    if (p.oil >= p.maxOil) {
      log(run, 'Zbiornik pełny — nie ma sensu gasić latarni.', 'info');
      ctx.fx.push({ k: 'deny' });
      return false;
    }
    lamp.lit = false;
    const got = gainOil(run, hasRelic(run, 'rekawice') ? 2 : BALANCE.light.drainRefund);
    ctx.fx.push({ k: 'drain', x: lamp.x, y: lamp.y });
    log(run, `Zgaszona latarnia oddaje ${got} oleju.`, 'info');
    return true;
  }
  log(run, 'W pobliżu nie ma latarni.', 'info');
  ctx.fx.push({ k: 'deny' });
  return false;
}

export function abilityCost(run: Run): number {
  return Math.max(1, CLASSES[run.cls].ability.cost - (hasRelic(run, 'dlugi_lont') ? 1 : 0));
}

function doAbility(ctx: Ctx): boolean {
  const { run } = ctx;
  const p = run.player;
  const d = run.district;
  const cost = abilityCost(run);
  if (p.oil < cost) {
    log(run, `Za mało oleju na zdolność (${cost}).`, 'bad');
    ctx.fx.push({ k: 'deny' });
    return false;
  }
  const bonus = hasRelic(run, 'lustro') ? 1 : 0;
  const range = hasRelic(run, 'dlugi_lont') ? 1 : 0;
  spendOil(ctx, cost);
  if (run.cls === 'lampiarz') {
    const r = 2.5 + range;
    ctx.fx.push({ k: 'flare', x: p.x, y: p.y, r, color: '#ffd27a' });
    const opaque = (x: number, y: number) => isWall(d, x, y);
    const targets = d.enemies.filter((e) => dist(e, p) <= r && lineOfSight(p.x, p.y, e.x, e.y, opaque));
    for (const e of targets) damageEnemy(ctx, e, 1 + bonus);
    log(run, targets.length ? `Rozbłysk trafia ${targets.length} ${targets.length === 1 ? 'cień' : 'cienie'}.` : 'Rozbłysk rozświetla pustą ulicę.', 'info');
  } else if (run.cls === 'kowalka') {
    ctx.fx.push({ k: 'flare', x: p.x, y: p.y, r: 1.5 + range, color: '#ff9a5a' });
    ctx.fx.push({ k: 'shake', power: 6 });
    let hits = 0;
    const reach = 1 + range;
    const struck = new Set<Enemy>();
    for (const dir of DIRS4) {
      for (let k = 1; k <= reach; k++) {
        const e = enemyAt(d, p.x + dir.x * k, p.y + dir.y * k);
        // an enemy knocked one tile further must not be hit a second time
        if (!e || struck.has(e)) continue;
        struck.add(e);
        hits++;
        if (!damageEnemy(ctx, e, 2 + bonus)) continue;
        if (e.type === 'matka') continue;
        const tx = e.x + dir.x;
        const ty = e.y + dir.y;
        if (isWall(d, tx, ty) || lampAt(d, tx, ty) || enemyAt(d, tx, ty) || barrelAt(d, tx, ty) || (run.player.x === tx && run.player.y === ty)) {
          ctx.fx.push({ k: 'text', x: e.x, y: e.y, text: 'łup!', color: '#ffb27a' });
          damageEnemy(ctx, e, 1);
        } else {
          e.x = tx;
          e.y = ty;
        }
      }
    }
    log(run, hits ? 'Młot spada na mrok.' : 'Młot uderza w bruk.', 'info');
    recompute(ctx);
    holyBurn(ctx);
  } else {
    const r = 1 + range;
    let n = 0;
    const blow: NonNullable<District['barrels']> = [];
    for (let y = p.y - r; y <= p.y + r; y++) {
      for (let x = p.x - r; x <= p.x + r; x++) {
        const b = barrelAt(d, x, y);
        if (b) blow.push(b);
        if ((x === p.x && y === p.y) || isWall(d, x, y) || lampAt(d, x, y) || b) continue;
        const ex = d.burning.find((b) => b.x === x && b.y === y);
        if (ex) ex.t = 4;
        else d.burning.push({ x, y, t: 4 });
        n++;
        ctx.fx.push({ k: 'burn', x, y });
        const e = enemyAt(d, x, y);
        if (e) damageEnemy(ctx, e, 2 + bonus);
      }
    }
    ctx.fx.push({ k: 'flare', x: p.x, y: p.y, r: 1.8 + range, color: '#ff7b3a' });
    log(run, `Pożoga: ${n} pól w ogniu.`, 'info');
    for (const b of blow) if ((d.barrels ?? []).includes(b)) explodeBarrel(ctx, b);
    recompute(ctx);
    holyBurn(ctx);
  }
  return true;
}


// ------------------------------------------------------------------ barrels, mini-boss
function explodeBarrel(ctx: Ctx, b: NonNullable<District['barrels']>[number]) {
  const { run } = ctx;
  const d = run.district;
  const B = BALANCE.barrels;
  d.barrels = (d.barrels ?? []).filter((x) => x !== b);
  run.stats.barrelsBlown = (run.stats.barrelsBlown ?? 0) + 1;
  ctx.fx.push({ k: 'explode', x: b.x, y: b.y });
  ctx.fx.push({ k: 'shake', power: 9 });
  for (let y = b.y - 1; y <= b.y + 1; y++)
    for (let x = b.x - 1; x <= b.x + 1; x++) {
      if (isWall(d, x, y) || lampAt(d, x, y) || barrelAt(d, x, y)) continue;
      if (run.player.x === x && run.player.y === y) continue;
      const ex = d.burning.find((q) => q.x === x && q.y === y);
      if (ex) ex.t = 4;
      else d.burning.push({ x, y, t: 4 });
    }
  let kills = 0;
  for (const e of [...d.enemies]) {
    if (dist(e, b) > B.radius + 0.01) continue;
    if (!damageEnemy(ctx, e, B.damage)) kills++;
  }
  if (kills > (run.stats.bestBlast ?? 0)) run.stats.bestBlast = kills;
  if (kills) log(run, `Wybuch beczki rozprasza ${kills}!`, 'good');
  // chain reaction
  for (const o of [...(d.barrels ?? [])]) if (dist(o, b) <= B.radius + 0.01 && (d.barrels ?? []).includes(o)) explodeBarrel(ctx, o);
  recompute(ctx);
  if (!isOver(run)) holyBurn(ctx);
}

function weatherTick(ctx: Ctx) {
  const { run } = ctx;
  const d = run.district;
  if (d.weather !== 'deszcz' || d.turn % BALANCE.weather.rainEvery !== 0) return;
  const lit = d.lamps.filter((l) => l.lit && l.kind === 'lamp');
  if (!lit.length) return;
  const l = ctx.rng.pick(lit);
  l.lit = false;
  ctx.fx.push({ k: 'snuff', x: l.x, y: l.y });
  log(run, 'Ulewa gasi jedną z latarni.', 'warn');
}

/** Kominiarz Cieni comes down from the roofs when the second brazier starts burning. */
function maybeCallMiniboss(ctx: Ctx) {
  const { run } = ctx;
  const d = run.district;
  if (d.bossCalled || d.scripted || isFinal(run)) return;
  const K = BALANCE.kominiarz;
  const here = isEndless(run) ? run.depth % 5 === K.depth : run.depth === K.depth;
  if (!here) return;
  if (braziers(d).filter((b) => b.lit).length < 2) return;
  d.bossCalled = true;
  const e = spawnShadow(ctx, undefined, 'kominiarz');
  if (!e) return;
  e.elite = false;
  e.hp = e.maxHp = ENEMIES.kominiarz.hp + (run.night >= 3 ? 2 : 0) + Math.floor(Math.max(0, run.depth - 5) / 5);
  e.soot = K.sootEvery;
  ctx.fx.push({ k: 'shake', power: 8 });
  log(run, 'Z dachów schodzi Kominiarz Cieni! Gasi latarnie sadzą — pokonaj go, a zostawi relikt.', 'bad');
}

function killMiniboss(ctx: Ctx, e: Enemy) {
  const { run } = ctx;
  run.stats.minibossSlain = (run.stats.minibossSlain ?? 0) + 1;
  const pool = RELICS.filter((r) => !r.shopless && r.unlock === null && !hasRelic(run, r.id));
  if (pool.length) {
    const r = ctx.rng.pick(pool);
    grantRelic(run, r.id);
    recompute(ctx);
    log(run, `Kominiarz rozsypuje się w sadzę. Zostaje ${r.name}.`, 'good');
    ctx.fx.push({ k: 'flare', x: e.x, y: e.y, r: 2, color: '#f0c46c' });
  } else log(run, 'Kominiarz rozsypuje się w sadzę.', 'good');
}

// ------------------------------------------------------------------ combat
/** Returns true if the enemy survived. */
function damageEnemy(ctx: Ctx, e: Enemy, amount: number): boolean {
  e.hp -= amount;
  if (e.type === 'gasiciel') {
    e.snuff = 0;
    e.snuffTarget = null;
  }
  ctx.fx.push({ k: 'hit', x: e.x, y: e.y, amount, target: 'enemy' });
  if (e.hp > 0) return true;
  killEnemy(ctx, e);
  return false;
}

function killEnemy(ctx: Ctx, e: Enemy) {
  const { run } = ctx;
  const d = run.district;
  d.enemies = d.enemies.filter((x) => x !== e);
  run.stats.kills++;
  d.killCounter++;
  ctx.fx.push({ k: 'death', x: e.x, y: e.y, type: e.type });
  const def = ENEMIES[e.type];
  if (!deepNight(run)) gainEmbers(ctx, emberAmount(run, def.embers + (e.elite ? 1 : 0)), e.x, e.y);
  if (e.type === 'gasiciel') {
    const got = gainOil(run, BALANCE.gasiciel.killOil);
    ctx.fx.push({ k: 'text', x: e.x, y: e.y, text: got ? `płomień wraca +${got} olej` : 'płomień wraca', color: '#e8b04b' });
  } else if (run.player.oil <= 1) {
    gainOil(run, 1);
    ctx.fx.push({ k: 'text', x: e.x, y: e.y, text: 'iskra +1 olej', color: '#e8b04b' });
  } else if (ctx.rng.chance(BALANCE.enemies.oilDropChance) && gainOil(run, 1) > 0) {
    ctx.fx.push({ k: 'text', x: e.x, y: e.y, text: '+1 olej', color: '#e8b04b' });
  }
  if (hasRelic(run, 'pijawka') && d.killCounter % 2 === 0 && gainOil(run, 1) > 0) {
    ctx.fx.push({ k: 'text', x: e.x, y: e.y, text: 'pijawka +1', color: '#e8b04b' });
  }
  if (e.type === 'kominiarz') killMiniboss(ctx, e);
  if (e.type === 'matka') {
    run.bossSlain = true;
    log(run, 'Matka Mroku rozpada się w szary dym. Noc pęka.', 'good');
    victory(ctx);
  }
}

function damagePlayer(ctx: Ctx, amount: number, source: string, attacker?: Enemy) {
  const { run } = ctx;
  if (run.phase === 'defeat' || run.phase === 'victory') return;
  const p = run.player;
  const d = run.district;
  if (hasRelic(run, 'plaszcz_mgly') && !d.cloakUsed) {
    d.cloakUsed = true;
    log(run, 'Płaszcz z mgły pochłania cios.', 'good');
    ctx.fx.push({ k: 'text', x: p.x, y: p.y, text: 'unik', color: '#bcd2e8' });
    return;
  }
  p.hp -= amount;
  d.tookDamage = true;
  run.stats.damageTaken += amount;
  ctx.fx.push({ k: 'hit', x: p.x, y: p.y, amount, target: 'player' });
  ctx.fx.push({ k: 'shake', power: 4 + amount * 3 });
  log(run, `${source} rani cię (−${amount}).`, 'bad');
  if (attacker && hasRelic(run, 'kolce_swiatla') && d.enemies.includes(attacker)) {
    damageEnemy(ctx, attacker, 1);
  }
  if (p.hp <= 0) {
    if (hasRelic(run, 'popiol_feniksa') && !run.phoenixUsed) {
      run.phoenixUsed = true;
      p.hp = 1;
      p.oil = p.maxOil;
      log(run, 'Popiół feniksa rozżarza się. Wstajesz z 1 zdrowiem.', 'good');
      ctx.fx.push({ k: 'flare', x: p.x, y: p.y, r: 3, color: '#ff8a3a' });
      return;
    }
    p.hp = 0;
    run.killedBy = source;
    defeat(ctx);
  }
}

/** Shadows caught in holy light burn and are pushed out. */
function holyBurn(ctx: Ctx) {
  const { run } = ctx;
  const d = run.district;
  for (const e of [...d.enemies]) {
    const i = e.y * d.w + e.x;
    if (!ctx.light.holy[i]) continue;
    if (ENEMIES[e.type].holyImmune) continue;
    ctx.fx.push({ k: 'burn', x: e.x, y: e.y });
    if (!damageEnemy(ctx, e, BALANCE.light.holyBurnDamage)) continue;
    const dest = nearestDark(ctx, e);
    if (dest) {
      e.x = dest.x;
      e.y = dest.y;
    } else {
      damageEnemy(ctx, e, 99);
    }
  }
}

function nearestDark(ctx: Ctx, from: Point): Point | null {
  const { run } = ctx;
  const d = run.district;
  const free = (x: number, y: number) =>
    !isWall(d, x, y) && !lampAt(d, x, y) && !barrelAt(d, x, y) && !(run.player.x === x && run.player.y === y);
  const dd = bfs(d.w, d.h, [from], free);
  let best: Point | null = null;
  let bestD = Infinity;
  for (let y = 0; y < d.h; y++) {
    for (let x = 0; x < d.w; x++) {
      const v = dd[y * d.w + x];
      if (v <= 0 || v >= bestD) continue;
      if (ctx.light.holy[y * d.w + x] || enemyAt(d, x, y)) continue;
      best = { x, y };
      bestD = v;
    }
  }
  return best;
}

// ------------------------------------------------------------------ turn end
function endTurn(ctx: Ctx) {
  const { run } = ctx;
  const d = run.district;
  const p = run.player;
  d.turn++;
  run.stats.turns++;
  if (d.turn === BALANCE.mrok.deepNightTurn && !d.scripted) {
    log(run, 'Zapada głęboka noc: mrok rośnie dwa razy szybciej, a cienie nie zostawiają żaru.', 'bad');
  }

  // lantern consumption
  if (!d.scripted) p.lanternTimer++;
  const every = lanternBurnEvery(run);
  if (p.lanternTimer >= every) {
    p.lanternTimer = 0;
    if (p.oil > 0) {
      spendOil(ctx, 1);
      if (p.oil > 0 && p.oil <= 2) log(run, 'Knot syczy — zostało mało oleju.', 'warn');
    }
  }

  weatherTick(ctx);

  recompute(ctx);
  enemyPhase(ctx);
  if (isOver(run)) return;

  // fire damage and decay
  for (const b of d.burning) {
    const e = enemyAt(d, b.x, b.y);
    if (e) damageEnemy(ctx, e, 1);
    b.t--;
  }
  d.burning = d.burning.filter((b) => b.t > 0);
  if (isOver(run)) return;

  recompute(ctx);
  if (!d.scripted) mrokTick(ctx);
  recompute(ctx);
  exploreVisible(ctx);
}

/** Turns per 1 oil burnt by the hand lantern. */
export function lanternBurnEvery(run: Run): number {
  const base = hasRelic(run, 'oszczedny_palnik') ? BALANCE.lantern.burnEveryFrugal : BALANCE.lantern.burnEvery;
  return base + 3 * (run.mastery?.knot ?? 0);
}

const isOver = (run: Run) => run.phase === 'victory' || run.phase === 'defeat';

/** After a long stay in one district the night deepens: faster mrok, no embers from shadows. */
export function deepNight(run: Run): boolean {
  if (run.district.scripted) return false;
  return run.district.turn >= BALANCE.mrok.deepNightTurn;
}

export function mrokRate(run: Run): number {
  const d = run.district;
  const M = BALANCE.mrok;
  const lit = d.lamps.filter((l) => l.lit).length;
  const W = BALANCE.weather;
  const weather = d.weather === 'mgla' ? W.fogMrok : d.weather === 'pelnia' ? W.moonMrok : 1;
  const endless = isEndless(run) ? 1 + BALANCE.endless.extraMrokPerDepth * Math.max(0, run.depth - 5) : 1;
  const base = (M.base + M.perDepth * (Math.min(run.depth, 12) - 1)) * d.mods.mrokMult * (run.night >= 3 ? 1.25 : 1) * weather * endless;
  const rate = Math.max(M.minRate, base - M.perLitLamp * lit);
  return deepNight(run) ? rate * 2 : rate;
}

function maxAlive(run: Run) {
  if (isFinal(run)) return BALANCE.boss.maxShadows;
  return BALANCE.mrok.maxAliveBase + BALANCE.mrok.maxAlivePerDepth * Math.min(run.depth, 10);
}

function mrokTick(ctx: Ctx) {
  const { run } = ctx;
  const d = run.district;
  d.mrok += mrokRate(run);
  while (d.mrok >= BALANCE.mrok.threshold) {
    d.mrok -= BALANCE.mrok.threshold;
    spawnShadow(ctx);
  }
}

export function addMrok(run: Run, amount: number) {
  run.district.mrok += amount;
}

function spawnShadow(ctx: Ctx, near?: Point, forced?: EnemyType): Enemy | null {
  const { run, rng } = ctx;
  const d = run.district;
  if (!forced && d.enemies.filter((e) => e.type !== 'matka').length >= maxAlive(run)) return null;
  const p = run.player;
  let cands: Point[] = [];
  const ok = (x: number, y: number) =>
    !isWall(d, x, y) &&
    !lampAt(d, x, y) &&
    !barrelAt(d, x, y) &&
    !enemyAt(d, x, y) &&
    !(p.x === x && p.y === y) &&
    !ctx.light.holy[y * d.w + x] &&
    !(x === d.gate.x && y === d.gate.y);
  if (near) {
    for (const dir of DIRS8) if (ok(near.x + dir.x, near.y + dir.y)) cands.push({ x: near.x + dir.x, y: near.y + dir.y });
  } else {
    for (let y = 0; y < d.h; y++)
      for (let x = 0; x < d.w; x++)
        if (ok(x, y) && !ctx.light.visible[y * d.w + x] && manhattan({ x, y }, p) >= 6) cands.push({ x, y });
  }
  if (!cands.length) return null;
  const pos = rng.pick(cands);
  let type: EnemyType = forced ?? rollEnemyType(rng, run.depth, d.mods.weights);
  if (!forced && type === 'gasiciel' && d.enemies.filter((o) => o.type === 'gasiciel').length >= gasicielCap(run.depth, d.theme)) type = 'cien';
  const e = makeEnemy(d.nextId++, type, pos, rng, run.depth);
  d.enemies.push(e);
  const visible = ctx.light.visible[pos.y * d.w + pos.x] === 1;
  ctx.fx.push({ k: 'spawn', x: pos.x, y: pos.y, visible });
  if (!near) log(run, 'Mrok gęstnieje. Coś poruszyło się w ciemności.', 'warn');
  cands = [];
  return e;
}

// ------------------------------------------------------------------ enemy AI
interface Maps {
  dark: Int16Array; // distance to player through non-holy tiles
  any: Int16Array; // distance to player for light-immune walkers
}

function walkable(d: District, x: number, y: number) {
  return !isWall(d, x, y) && !lampAt(d, x, y) && !barrelAt(d, x, y);
}

function buildMaps(ctx: Ctx): Maps {
  const { run } = ctx;
  const d = run.district;
  const p = run.player;
  const dark = bfs(d.w, d.h, [p], (x, y) => walkable(d, x, y) && !ctx.light.holy[y * d.w + x]);
  const any = bfs(d.w, d.h, [p], (x, y) => walkable(d, x, y));
  return { dark, any };
}

/** Deterministic step choice: first neighbour (in a stable order) that lowers the distance. */
export function stepToward(
  d: District,
  e: Point,
  map: Int16Array,
  canEnter: (x: number, y: number) => boolean,
  target: Point,
): Point | null {
  const here = map[e.y * d.w + e.x];
  const order = [...DIRS4].sort((a, b) => {
    const da = Math.abs(target.x - (e.x + a.x)) + Math.abs(target.y - (e.y + a.y));
    const db = Math.abs(target.x - (e.x + b.x)) + Math.abs(target.y - (e.y + b.y));
    return da - db;
  });
  let best: Point | null = null;
  let bestV = here >= 0 ? here : Infinity;
  for (const dir of order) {
    const nx = e.x + dir.x;
    const ny = e.y + dir.y;
    if (!inBounds(d.w, d.h, nx, ny) || !canEnter(nx, ny)) continue;
    const v = map[ny * d.w + nx];
    if (v < 0) continue;
    if (v < bestV) {
      bestV = v;
      best = { x: nx, y: ny };
    }
  }
  if (best) return best;
  if (here >= 0) return null;
  // unreachable: greedy approach through allowed tiles
  const cur = manhattan(e, target);
  for (const dir of order) {
    const nx = e.x + dir.x;
    const ny = e.y + dir.y;
    if (!inBounds(d.w, d.h, nx, ny) || !canEnter(nx, ny)) continue;
    if (manhattan({ x: nx, y: ny }, target) < cur) return { x: nx, y: ny };
  }
  return null;
}

const adjacent = (a: Point, b: Point) => manhattan(a, b) === 1;

function enemyPhase(ctx: Ctx) {
  const { run } = ctx;
  const d = run.district;
  const maps = buildMaps(ctx);
  const order = [...d.enemies].sort((a, b) => a.id - b.id);
  for (const e of order) {
    if (!d.enemies.includes(e)) continue;
    if (isOver(run)) return;
    actEnemy(ctx, e, maps);
  }
}

function occupiedBy(ctx: Ctx, x: number, y: number, self: Enemy) {
  const d = ctx.run.district;
  const p = ctx.run.player;
  return (p.x === x && p.y === y) || d.enemies.some((o) => o !== self && o.x === x && o.y === y);
}

function actEnemy(ctx: Ctx, e: Enemy, maps: Maps) {
  const { run } = ctx;
  const d = run.district;
  const p = run.player;
  const def = ENEMIES[e.type];
  const holy = ctx.light.holy;
  const canDark = (x: number, y: number) => walkable(d, x, y) && !holy[y * d.w + x] && !occupiedBy(ctx, x, y, e);
  const canAny = (x: number, y: number) => walkable(d, x, y) && !occupiedBy(ctx, x, y, e);
  const name = def.name + (e.elite ? ' (elita)' : '');


  switch (e.type) {
    case 'cien':
    case 'smigacz':
    case 'smolnik': {
      for (let s = 0; s < def.speed; s++) {
        // fast shadows must stop before they can strike
        if (adjacent(e, p) && s === 0) {
          ctx.fx.push({ k: 'attack', from: e.id, x: e.x, y: e.y, dx: p.x - e.x, dy: p.y - e.y });
          if (e.type === 'smolnik') {
            if (p.oil > 0) {
              const lost = Math.min(2, p.oil);
              p.oil -= lost;
              ctx.fx.push({ k: 'text', x: p.x, y: p.y, text: `−${lost} olej`, color: '#9fb86a' });
              log(run, `Smolnik wysysa ${lost} oleju!`, 'bad');
              checkEmptyOil(ctx);
            } else damagePlayer(ctx, 1, 'Smolnik', e);
          } else damagePlayer(ctx, def.damage + (e.elite ? 0 : 0), name, e);
          return;
        }
        const step = stepToward(d, e, maps.dark, canDark, p);
        if (!step) return;
        e.x = step.x;
        e.y = step.y;
      }
      return;
    }
    case 'lowca': {
      if (e.aim) {
        const dir = e.aim;
        e.aim = null;
        ctx.fx.push({ k: 'lunge', x: e.x, y: e.y });
        for (let k = 0; k < 4; k++) {
          const nx = e.x + dir.x;
          const ny = e.y + dir.y;
          if (nx === p.x && ny === p.y) {
            damagePlayer(ctx, def.damage + (e.elite ? 1 : 0), name, e);
            return;
          }
          if (!canDark(nx, ny)) return;
          e.x = nx;
          e.y = ny;
        }
        return;
      }
      const aim = lineToPlayer(ctx, e);
      if (aim) {
        e.aim = aim;
        if (ctx.light.visible[e.y * d.w + e.x]) log(run, 'Łowca celuje — zejdź z linii!', 'warn');
        return;
      }
      const step = stepToward(d, e, maps.dark, canDark, p);
      if (step) {
        e.x = step.x;
        e.y = step.y;
      }
      return;
    }
    case 'gasiciel': {
      const target = gasicielTarget(ctx, e);
      if (!target) {
        e.snuffTarget = null;
        if (adjacent(e, p)) {
          ctx.fx.push({ k: 'attack', from: e.id, x: e.x, y: e.y, dx: p.x - e.x, dy: p.y - e.y });
          if (p.oil > 0) {
            p.oil -= 1;
            ctx.fx.push({ k: 'text', x: p.x, y: p.y, text: '−1 olej', color: '#b49be0' });
            log(run, 'Gasiciel dmucha w twoją latarnię (−1 oleju).', 'bad');
            checkEmptyOil(ctx);
          }
          return;
        }
        const step = stepToward(d, e, maps.any, canAny, p);
        if (step) {
          e.x = step.x;
          e.y = step.y;
        }
        return;
      }
      if (e.snuffTarget !== target.id) e.snuff = 0;
      e.snuffTarget = target.id;
      if (adjacent(e, target)) {
        e.snuff = (e.snuff ?? 0) + 1;
        const need = snuffNeed(run, target);
        if (e.snuff >= need) {
          snuffLamp(ctx, target, 'Gasiciel');
          e.snuff = 0;
          e.snuffTarget = null;
        } else {
          const left = need - e.snuff;
          ctx.fx.push({ k: 'text', x: target.x, y: target.y, text: `gaśnie za ${left}`, color: '#c8a4ff' });
          if (e.snuff === 1) {
            const what = target.kind === 'brazier' ? 'znicz' : 'latarnię';
            log(run, `Gasiciel gasi ${what}! ${left === 1 ? 'Została 1 tura' : `Zostały ${left} tury`} — uderz go.`, 'warn');
          }
        }
        return;
      }
      const map = lampApproachMap(d, target);
      const step = stepToward(d, e, map, canAny, target);
      if (step) {
        e.x = step.x;
        e.y = step.y;
      }
      return;
    }
    case 'kominiarz': {
      const K = BALANCE.kominiarz;
      e.soot = (e.soot ?? K.sootEvery) - 1;
      if (e.soot <= 0) {
        e.soot = K.sootEvery;
        const target = sootTarget(run, e);
        if (target) {
          snuffLamp(ctx, target, 'Kominiarz');
          ctx.fx.push({ k: 'text', x: target.x, y: target.y, text: 'sadza!', color: '#9a9aa8' });
          recompute(ctx);
          return;
        }
      }
      if (adjacent(e, p)) {
        // heavy brush: after a blow he needs a turn to swing again
        if (e.stride) {
          e.stride = 0;
          return;
        }
        e.stride = 1;
        ctx.fx.push({ k: 'attack', from: e.id, x: e.x, y: e.y, dx: p.x - e.x, dy: p.y - e.y });
        damagePlayer(ctx, def.damage + (run.night >= 3 ? 1 : 0), name, e);
        return;
      }
      e.stride = 0;
      const step = stepToward(d, e, maps.dark, canDark, p);
      if (step) {
        e.x = step.x;
        e.y = step.y;
      }
      return;
    }
    case 'matka': {
      const B = BALANCE.boss;
      if (e.dormant) {
        const anyLit = d.lamps.some((l) => l.kind === 'brazier' && l.lit);
        if (!anyLit && dist(e, p) > B.wakeDistance && e.hp >= e.maxHp) return;
        e.dormant = false;
        e.pulse = B.pulseEvery;
        e.brood = B.broodEvery;
        ctx.fx.push({ k: 'shake', power: 10 });
        ctx.fx.push({ k: 'text', x: e.x, y: e.y, text: 'BUDZI SIĘ!', color: '#c8a4ff' });
        log(run, 'Matka Mroku budzi się! Zaćmienie co ' + B.pulseEvery + ' tur — trzymaj się z dala od jej kręgu.', 'bad');
        return;
      }
      e.pulse = (e.pulse ?? B.pulseEvery) - 1;
      e.brood = (e.brood ?? B.broodEvery) - 1;
      if (e.pulse <= 0) {
        e.pulse = B.pulseEvery;
        ctx.fx.push({ k: 'pulse', x: e.x, y: e.y, r: B.pulseRadius });
        ctx.fx.push({ k: 'shake', power: 8 });
        let n = 0;
        for (const l of d.lamps) {
          if (l.lit && l.kind === 'lamp' && dist(l, e) <= B.pulseRadius + 0.01) {
            snuffLamp(ctx, l, 'Matka Mroku', true);
            n++;
          }
        }
        log(run, n ? `Zaćmienie! Matka Mroku gasi ${n} ${n === 1 ? 'płomień' : 'płomienie'}.` : 'Zaćmienie przetacza się przez cypel.', 'bad');
        if (dist(p, e) <= B.pulseRadius + 0.01) damagePlayer(ctx, 1, 'Zaćmienie', e);
        recompute(ctx);
        if (isOver(run)) return;
      }
      if (e.brood <= 0) {
        e.brood = B.broodEvery;
        if (d.enemies.filter((o) => o.type !== 'matka').length < maxAlive(run)) {
          for (let i = 0; i < B.brood; i++) spawnShadow(ctx, e, 'cien');
          log(run, B.brood > 1 ? 'Matka Mroku rodzi nowe cienie.' : 'Matka Mroku rodzi nowy cień.', 'warn');
        }
      }
      if (adjacent(e, p)) {
        ctx.fx.push({ k: 'attack', from: e.id, x: e.x, y: e.y, dx: p.x - e.x, dy: p.y - e.y });
        damagePlayer(ctx, B.damage + (run.night >= 3 ? 1 : 0), 'Matka Mroku', e);
        return;
      }
      // she is heavy: one step every other turn
      e.stride = ((e.stride ?? 0) + 1) % 2;
      if (e.stride === 0) return;
      const step = stepToward(d, e, maps.any, canAny, p);
      if (step) {
        e.x = step.x;
        e.y = step.y;
      }
      return;
    }
  }
}

/** The lamp the Kominiarz throws soot at: the nearest burning street lamp in range (braziers are too hot for soot). */
export function sootTarget(run: Run, e: Point): Lamp | null {
  const d = run.district;
  const K = BALANCE.kominiarz;
  const lit = d.lamps.filter((l) => l.lit && l.kind === 'lamp' && manhattan(l, e) <= K.sootRange);
  lit.sort((a, b) => manhattan(a, e) - manhattan(b, e) || a.id - b.id);
  return lit[0] ?? null;
}

function snuffLamp(ctx: Ctx, lamp: Lamp, who: string, quiet = false) {
  const { run } = ctx;
  const d = run.district;
  lamp.lit = false;
  ctx.fx.push({ k: 'snuff', x: lamp.x, y: lamp.y });
  if (!quiet) log(run, lamp.kind === 'brazier' ? `${who} zgasił znicz!` : `${who} zgasił latarnię.`, 'bad');
  if (lamp.kind === 'brazier' && !quiet && !d.gateUnlocked) {
    const lit = braziers(d).filter((b) => b.lit).length;
    log(run, `Płonące znicze: ${lit}/3. Zapal go ponownie.`, 'warn');
  }
}

function gasicielTarget(ctx: Ctx, e: Enemy): Lamp | null {
  const d = ctx.run.district;
  const lit = d.lamps.filter((l) => l.lit && l.kind !== 'lighthouse' && !(l.kind === 'brazier' && d.gateUnlocked));
  if (!lit.length) return null;
  const map = bfs(d.w, d.h, [e], (x, y) => walkable(d, x, y));
  let best: Lamp | null = null;
  let bestD = Infinity;
  for (const l of lit) {
    let m = Infinity;
    if (adjacent(l, e)) m = 0;
    for (const dir of DIRS4) {
      const v = map[(l.y + dir.y) * d.w + (l.x + dir.x)];
      if (inBounds(d.w, d.h, l.x + dir.x, l.y + dir.y) && v >= 0) m = Math.min(m, v);
    }
    // prefer braziers when equally near: they hurt the player most
    const score = m - (l.kind === 'brazier' ? 3 : 0);
    if (m < Infinity && score < bestD) {
      bestD = score;
      best = l;
    }
  }
  return best;
}

/** Turns a Gasiciel must spend next to a flame before it goes out. */
export function snuffNeed(run: Run, lamp: Lamp): number {
  const G = BALANCE.gasiciel;
  return (lamp.kind === 'brazier' ? G.snuffBrazier : G.snuffLamp) + (hasRelic(run, 'wiatrochron') ? G.windbreakBonus : 0);
}

function lampApproachMap(d: District, lamp: Lamp): Int16Array {
  const srcs = DIRS4.map((dd) => ({ x: lamp.x + dd.x, y: lamp.y + dd.y })).filter((q) => walkable(d, q.x, q.y));
  return bfs(d.w, d.h, srcs, (x, y) => walkable(d, x, y));
}

function lineToPlayer(ctx: Ctx, e: Enemy): Point | null {
  const d = ctx.run.district;
  const p = ctx.run.player;
  if (e.x !== p.x && e.y !== p.y) return null;
  const n = manhattan(e, p);
  if (n > 4 || n < 1) return null;
  const dir = { x: Math.sign(p.x - e.x), y: Math.sign(p.y - e.y) };
  for (let k = 1; k < n; k++) {
    const x = e.x + dir.x * k;
    const y = e.y + dir.y * k;
    if (!walkable(d, x, y) || ctx.light.holy[y * d.w + x] || enemyAt(d, x, y)) return null;
  }
  return dir;
}

// ------------------------------------------------------------------ intents (for the HUD)
export type Intent =
  | { kind: 'attack'; target: Point }
  | { kind: 'move'; to: Point }
  | { kind: 'aim'; tiles: Point[] }
  | { kind: 'snuff'; lamp: Point; progress: number; need: number }
  | { kind: 'hunt'; to: Point; lamp: Point }
  | { kind: 'drain'; target: Point }
  | { kind: 'wait' }
  | { kind: 'boss'; pulse: number; brood: number; to: Point | null; attack: boolean; dormant: boolean }
  | { kind: 'soot'; left: number; lamp: Point | null; attack: boolean };

export function computeIntents(run: Run, light: LightState): Map<number, Intent> {
  const ctx: Ctx = { run, rng: new Rng(1), fx: [], light };
  const d = run.district;
  const p = run.player;
  const maps = buildMaps(ctx);
  const out = new Map<number, Intent>();
  for (const e of d.enemies) {
    const canDark = (x: number, y: number) => walkable(d, x, y) && !light.holy[y * d.w + x] && !occupiedBy(ctx, x, y, e);
    const canAny = (x: number, y: number) => walkable(d, x, y) && !occupiedBy(ctx, x, y, e);
    switch (e.type) {
      case 'kominiarz': {
        const left = (e.soot ?? BALANCE.kominiarz.sootEvery) - 1;
        const t = sootTarget(run, e);
        out.set(e.id, { kind: 'soot', left, lamp: t ? { x: t.x, y: t.y } : null, attack: adjacent(e, p) && !e.stride });
        break;
      }
      case 'cien':
      case 'smigacz':
      case 'smolnik': {
        if (adjacent(e, p)) out.set(e.id, e.type === 'smolnik' ? { kind: 'drain', target: p } : { kind: 'attack', target: p });
        else {
          const s = stepToward(d, e, maps.dark, canDark, p);
          out.set(e.id, s ? { kind: 'move', to: s } : { kind: 'wait' });
        }
        break;
      }
      case 'lowca': {
        if (e.aim) {
          const tiles: Point[] = [];
          let x = e.x;
          let y = e.y;
          for (let k = 0; k < 4; k++) {
            x += e.aim.x;
            y += e.aim.y;
            if (!(x === p.x && y === p.y) && !canDark(x, y)) break;
            tiles.push({ x, y });
            if (x === p.x && y === p.y) break;
          }
          out.set(e.id, { kind: 'aim', tiles });
        } else {
          const s = stepToward(d, e, maps.dark, canDark, p);
          out.set(e.id, s ? { kind: 'move', to: s } : { kind: 'wait' });
        }
        break;
      }
      case 'gasiciel': {
        const t = gasicielTarget(ctx, e);
        if (t) {
          const need = snuffNeed(run, t);
          if (adjacent(e, t)) out.set(e.id, { kind: 'snuff', lamp: t, progress: e.snuffTarget === t.id ? e.snuff ?? 0 : 0, need });
          else {
            const s = stepToward(d, e, lampApproachMap(d, t), canAny, t);
            out.set(e.id, s ? { kind: 'hunt', to: s, lamp: { x: t.x, y: t.y } } : { kind: 'wait' });
          }
        } else if (adjacent(e, p)) out.set(e.id, { kind: 'drain', target: p });
        else {
          const s = stepToward(d, e, maps.any, canAny, p);
          out.set(e.id, s ? { kind: 'move', to: s } : { kind: 'wait' });
        }
        break;
      }
      case 'matka': {
        out.set(e.id, {
          kind: 'boss',
          pulse: e.dormant ? 99 : (e.pulse ?? 1) - 1,
          brood: e.dormant ? 99 : (e.brood ?? 1) - 1,
          dormant: !!e.dormant,
          to: null,
          attack: adjacent(e, p),
        });
        break;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ district end / workshop / path
function completeDistrict(ctx: Ctx) {
  const { run } = ctx;
  const d = run.district;
  const p = run.player;
  run.stats.districts++;
  const flawless = !d.tookDamage;
  if (flawless) run.stats.flawlessDistricts++;
  if (p.oil <= 0) run.stats.zeroOilFinish = true;
  const healed = Math.min(BALANCE.rewards.districtHeal, p.maxHp - p.hp);
  p.hp += healed;
  gainOil(run, BALANCE.rewards.districtOil);
  const lamps = d.lamps.filter((l) => l.kind === 'lamp');
  run.summary = {
    name: d.name,
    turns: d.turn,
    kills: d.killCounter,
    lamps: lamps.filter((l) => l.lit).length,
    totalLamps: lamps.length,
    fullLight: d.fullLight,
    flawless,
    embers: p.embers,
  };
  run.phase = 'summary';
  ctx.fx.push({ k: 'complete' });
  log(run, `${d.name} ocalone. Przechodzisz przez bramę.`, 'good');
}

function priceFor(run: Run, relicId: string): number {
  const W = BALANCE.workshop;
  const r = RELIC_MAP[relicId].rarity;
  const base = r === 'common' ? W.priceCommon : r === 'uncommon' ? W.priceUncommon : W.priceRare;
  return Math.round(base * (run.night >= 4 ? W.night4PriceMult : 1));
}

export function relicPool(run: Run, unlockedAchievements: Set<string>, exclude: string[] = []): string[] {
  return RELICS.filter(
    (r) =>
      !r.shopless &&
      !run.player.relics.includes(r.id) &&
      !exclude.includes(r.id) &&
      (r.unlock === null || unlockedAchievements.has(r.unlock)),
  ).map((r) => r.id);
}

function rollOffers(run: Run, rng: Rng, unlocked: Set<string>, exclude: string[]): string[] {
  const pool = relicPool(run, unlocked, exclude);
  const weighted = pool.map((id) => {
    const r = RELIC_MAP[id].rarity;
    return [id, r === 'common' ? 6 : r === 'uncommon' ? 4 : 1.6] as [string, number];
  });
  const out: string[] = [];
  while (out.length < 3 && weighted.length) {
    const pick = rng.weighted(weighted);
    out.push(pick);
    weighted.splice(
      weighted.findIndex((w) => w[0] === pick),
      1,
    );
  }
  return out;
}

export function openWorkshop(run: Run, unlocked: Set<string>) {
  if (run.phase !== 'summary') return;
  const rng = new Rng(run.rngState);
  const W = BALANCE.workshop;
  const offers = rollOffers(run, rng, unlocked, []);
  const ws: Workshop = {
    offers: offers.map((id) => ({ relic: id, price: priceFor(run, id), sold: false })),
    rerollCost: W.rerollCost,
    healCost: Math.round(W.healCost * (run.night >= 4 ? W.night4PriceMult : 1)),
    oilCost: W.oilCost,
    freePick: run.district.fullLight,
  };
  run.workshop = ws;
  run.phase = 'workshop';
  run.rngState = rng.state;
  for (const o of ws.offers) if (!run.seenRelics.includes(o.relic)) run.seenRelics.push(o.relic);
}

export function grantRelic(run: Run, id: string) {
  if (run.player.relics.includes(id)) return;
  run.player.relics.push(id);
  if (!run.seenRelics.includes(id)) run.seenRelics.push(id);
  const p = run.player;
  if (id === 'miedziany_zbiornik') {
    p.maxOil += 3;
    p.oil = Math.min(p.maxOil, p.oil + 3);
  }
  if (id === 'zelazne_serce') {
    p.maxHp += 1;
    p.hp = Math.min(p.maxHp, p.hp + 1);
  }
  if (id === 'mapa' && run.district) run.district.revealed = true;
}

export type WorkshopAction =
  | { type: 'buy'; index: number }
  | { type: 'heal' }
  | { type: 'oil' }
  | { type: 'reroll' }
  | { type: 'leave' };

export function workshopAct(run: Run, a: WorkshopAction, unlocked: Set<string>): string | null {
  const ws = run.workshop;
  if (run.phase !== 'workshop' || !ws) return null;
  const p = run.player;
  switch (a.type) {
    case 'buy': {
      const o = ws.offers[a.index];
      if (!o || o.sold) return null;
      if (ws.freePick) {
        ws.freePick = false;
      } else {
        if (p.embers < o.price) return 'Za mało żaru.';
        p.embers -= o.price;
      }
      o.sold = true;
      grantRelic(run, o.relic);
      return `Zdobyto: ${RELIC_MAP[o.relic].name}.`;
    }
    case 'heal': {
      if (p.hp >= p.maxHp) return 'Jesteś w pełni sił.';
      if (p.embers < ws.healCost) return 'Za mało żaru.';
      p.embers -= ws.healCost;
      p.hp++;
      ws.healCost += BALANCE.workshop.healCostStep;
      return '+1 zdrowia.';
    }
    case 'oil': {
      if (p.oil >= p.maxOil) return 'Zbiornik pełny.';
      if (p.embers < ws.oilCost) return 'Za mało żaru.';
      p.embers -= ws.oilCost;
      gainOil(run, BALANCE.workshop.oilAmount);
      return `+${BALANCE.workshop.oilAmount} oleju.`;
    }
    case 'reroll': {
      if (p.embers < ws.rerollCost) return 'Za mało żaru.';
      const rng = new Rng(run.rngState);
      const current = ws.offers.map((o) => o.relic);
      let ids = rollOffers(run, rng, unlocked, current);
      if (ids.length < 3) ids = rollOffers(run, rng, unlocked, []);
      if (!ids.length) return 'Warsztat nie ma nic więcej.';
      p.embers -= ws.rerollCost;
      ws.rerollCost += 1;
      ws.offers = ids.map((id) => ({ relic: id, price: priceFor(run, id), sold: false }));
      for (const o of ws.offers) if (!run.seenRelics.includes(o.relic)) run.seenRelics.push(o.relic);
      run.rngState = rng.state;
      return 'Nowe towary na ladzie.';
    }
    case 'leave': {
      run.workshop = null;
      run.pathOptions = buildPathOptions(run);
      run.phase = 'path';
      return null;
    }
  }
}

function buildPathOptions(run: Run): PathOption[] {
  const next = run.depth + 1;
  if (next >= BALANCE.totalDepth && !isEndless(run)) {
    return [{ theme: 'latarnia', name: THEMES.latarnia.name, danger: THEMES.latarnia.danger }];
  }
  const rng = new Rng(hashString(`${run.seed}:paths:${run.depth}`));
  const pool = PATH_THEMES.filter((t) => t !== run.district.theme);
  rng.shuffle(pool);
  return pool.slice(0, 2).map((t) => ({ theme: t, name: THEMES[t].name, danger: THEMES[t].danger }));
}

export function choosePath(run: Run, theme: ThemeId) {
  if (run.phase !== 'path' || !run.pathOptions?.some((o) => o.theme === theme)) return;
  run.depth++;
  run.pathOptions = null;
  enterDistrict(run, theme);
}

// ------------------------------------------------------------------ events
export function eventChoiceAvailable(run: Run, eventId: string, choiceId: string): boolean {
  const p = run.player;
  switch (`${eventId}:${choiceId}`) {
    case 'handlarz:buy':
      return p.embers >= 4;
    case 'handlarz:buy_big':
      return p.embers >= 9;
    case 'studnia:throw':
      return p.embers >= 5;
    case 'ranny:help':
      return p.oil >= 2;
    case 'szept:accept':
      return p.maxHp > 1;
    case 'kartograf:buy':
      return p.embers >= 3;
    default:
      return true;
  }
}

export function resolveEvent(run: Run, choiceId: string, unlocked: Set<string>): Fx[] {
  const pe = run.pendingEvent;
  if (run.phase !== 'event' || !pe) return [];
  const ev = EVENT_MAP[pe.id];
  if (!ev || !ev.choices.some((c) => c.id === choiceId)) return [];
  if (!eventChoiceAvailable(run, pe.id, choiceId)) return [];
  const ctx = ctxOf(run);
  const p = run.player;
  const d = run.district;
  const randomRelic = () => {
    const pool = relicPool(run, unlocked);
    return pool.length ? ctx.rng.pick(pool) : null;
  };
  switch (`${pe.id}:${choiceId}`) {
    case 'handlarz:buy':
      p.embers -= 4;
      gainOil(run, 3);
      log(run, 'Bańka z olejem chlupocze w torbie. +3 oleju.', 'good');
      break;
    case 'handlarz:buy_big':
      p.embers -= 9;
      p.maxOil += 2;
      p.oil = p.maxOil;
      log(run, 'Wykupujesz cały wózek. Olej do pełna, +2 pojemności.', 'good');
      break;
    case 'studnia:throw': {
      p.embers -= 5;
      if (ctx.rng.chance(0.55)) {
        const r = randomRelic();
        if (r) {
          grantRelic(run, r);
          log(run, `Studnia oddaje: ${RELIC_MAP[r].name}.`, 'good');
        } else {
          gainEmbers(ctx, 10, p.x, p.y);
          log(run, 'Studnia oddaje dwa razy tyle żaru.', 'good');
        }
      } else log(run, 'Plusk. Cisza. Studnia niczego nie oddaje.', 'bad');
      break;
    }
    case 'studnia:drink':
      p.hp = Math.min(p.maxHp, p.hp + 1);
      addMrok(run, 4);
      ctx.fx.push({ k: 'heal', amount: 1 });
      log(run, 'Woda jest lodowata i gorzka. +1 zdrowia, mrok gęstnieje.', 'info');
      break;
    case 'ranny:help':
      p.oil -= 2;
      p.maxHp += 1;
      p.hp += 1;
      ctx.fx.push({ k: 'heal', amount: 1 });
      log(run, 'Jego latarnia znów świeci. Czujesz w piersi dziwne ciepło. +1 maks. zdrowia.', 'good');
      checkEmptyOil(ctx);
      break;
    case 'ranny:rob':
      gainEmbers(ctx, 7, p.x, p.y);
      addMrok(run, 6);
      log(run, 'Zabierasz torbę. Za plecami słychać szloch — i coś jeszcze.', 'warn');
      break;
    case 'szept:accept': {
      const r = randomRelic();
      p.maxHp -= 1;
      p.hp = Math.min(p.hp, p.maxHp);
      if (r) {
        grantRelic(run, r);
        log(run, `Dłoń znika. Zostaje ${RELIC_MAP[r].name} — i chłód w kościach.`, 'warn');
      } else log(run, 'Dłoń znika. Zostaje tylko chłód w kościach.', 'bad');
      break;
    }
    case 'szept:refuse':
      gainEmbers(ctx, 2, p.x, p.y);
      log(run, 'Odchodzisz. Mrok syczy z zawodu.', 'info');
      break;
    case 'kapliczka:pray':
      p.hp = p.maxHp;
      addMrok(run, 8);
      ctx.fx.push({ k: 'heal', amount: p.maxHp });
      log(run, 'Modlitwa koi rany. Mrok usłyszał każde słowo.', 'info');
      break;
    case 'kapliczka:take':
      gainOil(run, 3);
      log(run, 'Gromnica topi się w twojej latarni. +3 oleju.', 'good');
      break;
    case 'kartograf:buy':
      p.embers -= 3;
      for (let i = 0; i < d.explored.length; i++) d.explored[i] = 1;
      d.revealed = true;
      log(run, 'Plan dzielnicy rozkłada się w twojej głowie.', 'good');
      break;
    case 'kartograf:trade':
      d.revealed = true;
      for (const l of d.lamps) if (l.kind === 'brazier') d.explored[l.y * d.w + l.x] = 1;
      log(run, 'Starzec kreśli trzy krzyżyki. Znicze.', 'good');
      break;
    default:
      log(run, 'Odchodzisz w swoją stronę.', 'info');
  }
  d.items = d.items.filter((i) => i.id !== pe.itemId);
  run.pendingEvent = null;
  if (run.phase === 'event') run.phase = 'play';
  // a mrok jump may spawn shadows immediately
  recompute(ctx);
  while (d.mrok >= BALANCE.mrok.threshold) {
    d.mrok -= BALANCE.mrok.threshold;
    spawnShadow(ctx);
  }
  return commit(ctx);
}

// ------------------------------------------------------------------ end of run
function victory(ctx: Ctx) {
  const { run } = ctx;
  if (isOver(run)) return;
  run.phase = 'victory';
  run.stats.districts = Math.max(run.stats.districts, run.depth);
  run.score = computeScore(run, true);
  ctx.fx.push({ k: 'victory' });
}

function defeat(ctx: Ctx) {
  const { run } = ctx;
  run.phase = 'defeat';
  run.pendingEvent = null;
  run.score = computeScore(run, false);
  ctx.fx.push({ k: 'defeat' });
  log(run, 'Twoja latarnia gaśnie.', 'bad');
}

export function computeScore(run: Run, won: boolean): number {
  const S = BALANCE.score;
  const raw =
    run.stats.embersGained * S.perEmber +
    run.stats.lampsLit * S.perLamp +
    run.stats.kills * S.perKill +
    run.stats.districts * S.perDistrict +
    (won ? S.victory : 0);
  return Math.round(raw * (1 + S.nightMult * (run.night - 1)));
}

/** Abandon from the pause menu: counts as a defeat. */
export function abandonRun(run: Run) {
  if (isOver(run)) return;
  run.phase = 'defeat';
  run.killedBy = 'Porzucona warta';
  run.pendingEvent = null;
  run.score = computeScore(run, false);
}

export { TILE_FLOOR, TILE_WALL };

// ------------------------------------------------------------------ objective (for the HUD / tutorial)
export interface Objective {
  /** short headline, e.g. "Zapal znicze 1/3" */
  title: string;
  /** one-sentence hint on how to do it right now */
  hint: string;
  /** where to go (null if nothing to point at) */
  targets: Point[];
  tone: 'info' | 'warn' | 'good';
}

/** What should the player do next? Pure: derived from the run state only. */
export function objective(run: Run): Objective {
  const d = run.district;
  const p = run.player;
  const bz = braziers(d);
  const lit = bz.filter((b) => b.lit).length;
  const open = gateOpen(d);
  const final = isFinal(run);
  const near = (pts: Point[]) => [...pts].sort((a, b) => manhattan(a, p) - manhattan(b, p));
  // urgent: a Gasiciel is putting out a flame
  const snuffer = d.enemies.find((e) => e.type === 'gasiciel' && e.snuffTarget != null && (e.snuff ?? 0) > 0);
  if (snuffer) {
    const lamp = d.lamps.find((l) => l.id === snuffer.snuffTarget);
    if (lamp && lamp.lit) {
      const left = snuffNeed(run, lamp) - (snuffer.snuff ?? 0);
      return {
        title: lamp.kind === 'brazier' ? 'Gasiciel gasi znicz!' : 'Gasiciel gasi latarnię!',
        hint: `${left === 1 ? 'Została 1 tura' : `Zostały ${left} tury`} — podejdź i uderz go (wejdź na niego).`,
        targets: [snuffer],
        tone: 'warn',
      };
    }
  }
  if (final) {
    const lh = d.lamps.find((l) => l.kind === 'lighthouse');
    if (open && lh && !lh.lit) {
      return {
        title: 'Zapal latarnię morską!',
        hint: p.oil >= BALANCE.light.lighthouseCost ? 'Podejdź do wieży i wejdź w nią (koszt: 1 olej). To koniec nocy.' : 'Potrzebujesz kropli oleju — zbierz kanister albo zgaś latarnię (F).',
        targets: [lh],
        tone: 'good',
      };
    }
  }
  if (open && !final) {
    return { title: 'Brama otwarta!', hint: 'Idź do bramy (świecąca rama) i wejdź w nią, by przejść dalej.', targets: [d.gate], tone: 'good' };
  }
  const unlit = near(bz.filter((b) => !b.lit));
  const cost = BALANCE.light.brazierCost;
  if (p.oil < cost) {
    const oil = near(d.items.filter((it) => it.kind === 'oil'));
    return {
      title: `Brakuje oleju (masz ${p.oil}, znicz kosztuje ${cost})`,
      hint: oil.length ? 'Zbierz kanister oleju (niebieska bańka) albo zgaś zapaloną latarnię klawiszem F.' : 'Zgaś zapaloną latarnię (stań obok, F) — odda olej. Albo rozprosz gasiciela.',
      targets: oil.slice(0, 1),
      tone: 'warn',
    };
  }
  return {
    title: `Zapal znicze ${lit}/3`,
    hint: final
      ? 'Wejdź w znicz, by go zapalić (2 oleju). Trzy znicze otworzą drogę do latarni morskiej.'
      : 'Wejdź w znicz, by go zapalić (2 oleju). Trzy płonące znicze otworzą bramę na dobre.',
    targets: unlit,
    tone: 'info',
  };
}

// ------------------------------------------------------------------ scripting hooks (tutorial)
/** Re-evaluates light and exploration after a district was edited from outside the engine. */
export function refreshView(run: Run) {
  const ctx = ctxOf(run);
  exploreVisible(ctx);
}

/** Places an enemy on (or next to) the given tile. Returns null if there is no free spot nearby. */
export function spawnScripted(run: Run, type: EnemyType, at: Point): Fx[] {
  const d = run.district;
  const p = run.player;
  const free = (x: number, y: number) =>
    inBounds(d.w, d.h, x, y) && !isWall(d, x, y) && !lampAt(d, x, y) && !enemyAt(d, x, y) && !(p.x === x && p.y === y) && !(x === d.gate.x && y === d.gate.y);
  let pos: Point | null = free(at.x, at.y) ? at : null;
  for (let r = 1; !pos && r <= 3; r++)
    for (let dy = -r; dy <= r && !pos; dy++)
      for (let dx = -r; dx <= r && !pos; dx++) if (free(at.x + dx, at.y + dy)) pos = { x: at.x + dx, y: at.y + dy };
  if (!pos) return [];
  const rng = new Rng(run.rngState);
  const e = makeEnemy(d.nextId++, type, pos, rng, 1);
  e.elite = false;
  e.hp = e.maxHp = ENEMIES[type].hp;
  run.rngState = rng.state;
  d.enemies.push(e);
  const ctx = ctxOf(run);
  exploreVisible(ctx);
  return [{ k: 'spawn', x: pos.x, y: pos.y, visible: ctx.light.visible[pos.y * d.w + pos.x] === 1 }];
}


/** The weather waiting behind a path option (shown on the path screen). */
export function forecastWeather(run: Run, theme: ThemeId) {
  return weatherFor(hashString(`${run.seed}:${run.depth + 1}:${theme}`), theme === 'latarnia');
}
