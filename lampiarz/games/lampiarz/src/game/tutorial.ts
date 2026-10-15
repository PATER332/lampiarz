// Interactive tutorial: a hand-made district played with the real engine.
// Each step has a goal checked after every player action; some steps
// script a spawn when they begin. Tutorial runs are never saved and never
// count towards statistics or achievements.

import { THEMES } from './content';
import { gateOpen, newRun, objective, refreshView, spawnScripted, type Objective } from './engine';
import type { District, Fx, Item, Lamp, Point, Run } from './types';
import { TILE_FLOOR, TILE_WALL } from './types';

const W = 23;
const H = 17;

// layout (inclusive rectangles): rooms and the corridors between them
const RECTS: [number, number, number, number][] = [
  [2, 2, 6, 6], // A — start
  [11, 2, 20, 6], // B — first brazier
  [7, 4, 10, 4], // A–B
  [3, 9, 11, 13], // C — second brazier
  [14, 9, 19, 13], // D — third brazier
  [5, 7, 5, 8], // A–C
  [16, 7, 16, 8], // B–D
  [12, 11, 13, 11], // C–D
  [20, 11, 21, 11], // D–gate
];

export const TUT = {
  start: { x: 3, y: 4 },
  firstSpot: { x: 6, y: 4 },
  gate: { x: 21, y: 11 },
  lamp1: { x: 6, y: 2 },
  brazier1: { x: 17, y: 3 },
  brazier2: { x: 7, y: 10 },
  brazier3: { x: 18, y: 13 },
  oil1: { x: 9, y: 4 },
  oil2: { x: 16, y: 8 },
  oil3: { x: 4, y: 11 },
  shadow1: { x: 12, y: 4 },
  snuffer: { x: 20, y: 6 },
  pair: [
    { x: 19, y: 10 },
    { x: 15, y: 12 },
  ],
} as const;

export interface TutorialStep {
  title: string;
  text: string;
  /** keys / buttons worth showing for this step */
  keys?: string[];
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Ruch',
    text: 'Idź do pola w złotym kręgu. Każdy ruch to jedna tura — wrogowie ruszają się dopiero po tobie, więc możesz spokojnie myśleć.',
    keys: ['WASD / strzałki', 'albo kliknij pole'],
  },
  {
    title: 'Zapal latarnię',
    text: 'W złotym kręgu stoi zgaszona latarnia uliczna. Podejdź i wejdź w nią (ruch w jej stronę), żeby ją zapalić. Zwykle kosztuje 1 olej — pierwsza w każdej dzielnicy jest za darmo.',
    keys: ['wejdź w latarnię', 'F — gdy stoisz obok'],
  },
  {
    title: 'Święte światło',
    text: 'Ciepły krąg wokół płonącej latarni to święte światło: cienie NIE MOGĄ w nie wejść. Nadchodzi cień. Stań w środku blasku (nie na krawędzi — stamtąd cień może cię drapnąć) i przeczekaj 2 tury.',
    keys: ['Spacja — czekaj turę'],
  },
  {
    title: 'Atak',
    text: 'Atakujesz, wchodząc we wroga. Zwykły cień ma 1 punkt życia (kreski pod nim). Ikona pazurów nad wrogiem znaczy: jeśli będziesz obok, uderzy w tej turze. Uderz pierwszy!',
    keys: ['wejdź we wroga'],
  },
  {
    title: 'Olej',
    text: 'Olej (pasek u góry) to twoje paliwo: płacisz nim za latarnie, znicze i umiejętność. W prawdziwej nocy latarnia przy pasie spala też 1 olej co 15 tur. Podnieś kanister w korytarzu.',
    keys: ['wejdź na kanister'],
  },
  {
    title: 'Znicz',
    text: 'Znicze (duże misy ognia) to cel każdej dzielnicy: trzy płonące znicze otwierają bramę. Zapalenie kosztuje 2 oleju. W blasku znicza możesz też odpoczywać — kilka tur czekania leczy 1 serce.',
    keys: ['wejdź w znicz'],
  },
  {
    title: 'Gasiciel',
    text: 'Gasiciel! Nie rani, ale gasi płomienie. Przerywana fioletowa linia pokazuje, do którego płomienia idzie, a liczba nad nim — ile tur zostało do zgaszenia. Dogoń go i uderz: ginie od jednego ciosu i oddaje 1 olej.',
    keys: ['wejdź w gasiciela'],
  },
  {
    title: 'Umiejętność',
    text: 'Zejdź korytarzem na dół — czekają dwa cienie. Gdy podejdą blisko, użyj Rozbłysku: rani wszystkie cienie w promieniu 2,5 pola (koszt: 2 oleju). Każda klasa ma inną umiejętność.',
    keys: ['Q — umiejętność'],
  },
  {
    title: 'Brama',
    text: 'Zapal dwa pozostałe znicze (strzałki na brzegu ekranu wskazują drogę). Brakuje oleju? Podnieś kanister albo stań obok zapalonej latarni i naciśnij F — zgaśnie i odda olej.',
    keys: ['F — zgaś latarnię, odzyskaj olej'],
  },
  {
    title: 'Wyjście',
    text: 'Trzy znicze płoną — brama jest otwarta na dobre (nawet jeśli coś potem zgasi któryś znicz). Wejdź w bramę, aby ukończyć dzielnicę.',
    keys: ['wejdź w bramę'],
  },
];

function buildDistrict(): District {
  const tiles = new Array<number>(W * H).fill(TILE_WALL);
  for (const [x0, y0, x1, y1] of RECTS) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles[y * W + x] = TILE_FLOOR;
  let id = 1;
  const lamp = (p: Point, kind: Lamp['kind']): Lamp => ({ id: id++, x: p.x, y: p.y, kind, lit: false });
  const lamps: Lamp[] = [
    lamp(TUT.lamp1, 'lamp'),
    lamp(TUT.brazier1, 'brazier'),
    lamp(TUT.brazier2, 'brazier'),
    lamp(TUT.brazier3, 'brazier'),
    lamp({ x: 11, y: 6 }, 'lamp'),
    lamp({ x: 3, y: 13 }, 'lamp'),
    lamp({ x: 19, y: 9 }, 'lamp'),
  ];
  const item = (p: Point, kind: Item['kind'], amount: number): Item => ({ id: id++, x: p.x, y: p.y, kind, amount });
  const items: Item[] = [item(TUT.oil1, 'oil', 3), item(TUT.oil2, 'oil', 3), item(TUT.oil3, 'oil', 3), item({ x: 13, y: 5 }, 'embers', 4)];
  return {
    depth: 1,
    theme: 'stare',
    name: 'Samouczek: Stary Rynek',
    seed: 4242,
    w: W,
    h: H,
    tiles,
    explored: new Array<number>(W * H).fill(0),
    deco: Array.from({ length: W * H }, (_, i) => (i * 97 + 31) % 256),
    lamps,
    items,
    enemies: [],
    burning: [],
    gate: { ...TUT.gate },
    start: { ...TUT.start },
    mrok: 0,
    turn: 0,
    nextId: id,
    tookDamage: false,
    cloakUsed: false,
    heartUsed: false,
    fullLight: false,
    lampsLitHere: 0,
    freeLampCounter: 0,
    rest: 0,
    killCounter: 0,
    mods: { ...THEMES.stare.mods, weights: {} },
    revealed: false,
    scripted: true,
  };
}

/** A fresh tutorial run (Lampiarz class, Night I). */
export function newTutorialRun(): Run {
  const run = newRun({ cls: 'lampiarz', night: 1, seed: 4242, daily: null });
  run.district = buildDistrict();
  run.player.x = TUT.start.x;
  run.player.y = TUT.start.y;
  run.player.oil = 2;
  run.player.facing = { x: 1, y: 0 };
  run.log = [];
  run.log.push({ text: 'Samouczek: Stary Rynek. Wykonuj polecenia z ramki u góry.', tone: 'lore', turn: 0 });
  run.tutorial = { step: 0, stepTurn: 0, done: false };
  refreshView(run);
  return run;
}

const at = (p: Point, q: Point) => p.x === q.x && p.y === q.y;
const lampAtP = (run: Run, p: Point) => run.district.lamps.find((l) => at(l, p));
const itemGone = (run: Run, p: Point) => !run.district.items.some((it) => at(it, p) && it.kind === 'oil');
const alive = (run: Run, type?: string) => run.district.enemies.filter((e) => !type || e.type === type);

function stepDone(run: Run, step: number): boolean {
  const p = run.player;
  const d = run.district;
  switch (step) {
    case 0:
      return p.x >= TUT.firstSpot.x || at(p, TUT.firstSpot);
    case 1:
      return !!lampAtP(run, TUT.lamp1)?.lit;
    case 2:
      return d.turn - run.tutorial!.stepTurn >= 2;
    case 3:
      return alive(run, 'cien').length === 0;
    case 4:
      return itemGone(run, TUT.oil1);
    case 5:
      return !!lampAtP(run, TUT.brazier1)?.lit;
    case 6:
      return alive(run, 'gasiciel').length === 0;
    case 7:
      return alive(run).length === 0;
    case 8:
      return gateOpen(d);
    case 9:
      return run.phase === 'summary' || run.phase === 'event' || run.phase === 'workshop';
    default:
      return false;
  }
}

function onStepStart(run: Run, step: number): Fx[] {
  switch (step) {
    case 2:
      return spawnScripted(run, 'cien', TUT.shadow1);
    case 6:
      return spawnScripted(run, 'gasiciel', TUT.snuffer);
    case 7:
      return [...spawnScripted(run, 'cien', TUT.pair[0]), ...spawnScripted(run, 'cien', TUT.pair[1])];
    default:
      return [];
  }
}

/** Call after every player action in the tutorial. Advances steps (possibly several) and runs their scripts. */
export function tutorialAdvance(run: Run): Fx[] {
  const t = run.tutorial;
  if (!t || t.done) return [];
  const fx: Fx[] = [];
  let guard = 0;
  while (!t.done && guard++ < TUTORIAL_STEPS.length && stepDone(run, t.step)) {
    t.step++;
    t.stepTurn = run.district.turn;
    if (t.step >= TUTORIAL_STEPS.length) {
      t.done = true;
      break;
    }
    if (run.phase === 'play') {
      run.log.push({ text: `Krok ${t.step + 1}: ${TUTORIAL_STEPS[t.step].title}.`, tone: 'good', turn: run.district.turn });
      fx.push({ k: 'text', x: run.player.x, y: run.player.y, text: '✓', color: '#9fe39a' });
      fx.push(...onStepStart(run, t.step));
    }
  }
  return fx;
}

/** Where the current tutorial step wants the player to look. */
export function tutorialTargets(run: Run): Point[] {
  const t = run.tutorial;
  if (!t || t.done) return [];
  const d = run.district;
  const unlit = (p: Point) => !lampAtP(run, p)?.lit;
  switch (t.step) {
    case 0:
      return [TUT.firstSpot];
    case 1:
      return [TUT.lamp1];
    case 2:
      return [];
    case 3:
      return alive(run, 'cien');
    case 4:
      return itemGone(run, TUT.oil1) ? [] : [TUT.oil1];
    case 5:
      return [TUT.brazier1];
    case 6:
      return alive(run, 'gasiciel');
    case 7:
      return alive(run).length ? alive(run) : [];
    case 8: {
      const out: Point[] = [TUT.brazier2, TUT.brazier3, TUT.brazier1].filter(unlit);
      if (run.player.oil < 2) {
        for (const p of [TUT.oil2, TUT.oil3]) if (!itemGone(run, p)) out.unshift(p);
      }
      return out;
    }
    case 9:
      return [d.gate];
    default:
      return [];
  }
}

/** Objective for HUD / renderer: the tutorial step while it runs, the normal objective otherwise. */
export function currentObjective(run: Run): Objective {
  const t = run.tutorial;
  if (!t || t.done) return objective(run);
  const st = TUTORIAL_STEPS[t.step];
  return { title: `Krok ${t.step + 1}/${TUTORIAL_STEPS.length}: ${st.title}`, hint: st.text, targets: tutorialTargets(run), tone: 'info' };
}
