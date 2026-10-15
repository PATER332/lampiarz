// Chaos modifiers: one optional twist per round, announced before it starts.
// Every modifier affects both players equally; none of them takes control away
// for longer than a few announced seconds.
import type { Tuning } from './player';

export type ModId =
  | 'lowGravity'
  | 'superBounce'
  | 'slippery'
  | 'speedDemons'
  | 'giant'
  | 'tiny'
  | 'screenShake'
  | 'wind'
  | 'disappearing'
  | 'doubleTrouble'
  | 'reversed'
  | 'chaosBlast';

export interface ModDef {
  id: ModId;
  name: string;
  /** one short line under the name */
  text: string;
  /** a hue for the badge */
  color: string;
  tune?: (t: Tuning) => void;
}

export const MODS: ModDef[] = [
  { id: 'lowGravity', name: 'LOW GRAVITY', text: 'Grawitacja słabnie. Skoki trwają wieczność.', color: '#8fd3ff', tune: (t) => ((t.gravityMul *= 0.55), (t.jumpV *= 0.78)) },
  { id: 'superBounce', name: 'SUPER BOUNCE', text: 'Nogi ze sprężyn: skaczecie dużo wyżej.', color: '#7dffa4', tune: (t) => (t.jumpV *= 1.3) },
  { id: 'slippery', name: 'SLIPPERY FLOOR', text: 'Podłoga jak lodowisko. Hamowanie to sugestia.', color: '#b9f1ff', tune: (t) => (t.slippery = true) },
  { id: 'speedDemons', name: 'SPEED DEMONS', text: 'Wszystko szybciej. Dużo szybciej.', color: '#ffd44d', tune: (t) => ((t.maxSpeed *= 1.35), (t.accel *= 1.3), (t.airAccel *= 1.3)) },
  { id: 'giant', name: 'GIANT MODE', text: 'Jesteście ogromni i ciężcy. Pchnięcia bolą bardziej.', color: '#ff9b6b', tune: (t) => ((t.scale = 1.35), (t.knock *= 1.15), (t.jumpV *= 1.06)) },
  { id: 'tiny', name: 'TINY MODE', text: 'Malutcy i zwinni. Łatwo was zdmuchnąć.', color: '#d6a2ff', tune: (t) => ((t.scale = 0.7), (t.maxSpeed *= 1.08)) },
  { id: 'screenShake', name: 'SCREEN SHAKE', text: 'Każde uderzenie trzęsie areną. Ciosy silniejsze.', color: '#ff6b8b', tune: (t) => (t.knock *= 1.2) },
  { id: 'wind', name: 'RANDOM WIND', text: 'Podmuchy wiatru, zapowiadane strzałkami.', color: '#a6e3e9' },
  { id: 'disappearing', name: 'DISAPPEARING PLATFORMS', text: 'Platformy znikają chwilę po wejściu i wracają.', color: '#c9b6ff' },
  { id: 'doubleTrouble', name: 'DOUBLE TROUBLE', text: 'Dwa razy więcej przeszkód.', color: '#ff7a59' },
  { id: 'reversed', name: 'REVERSED CONTROLS', text: 'Co jakiś czas lewo to prawo. Zawsze z ostrzeżeniem.', color: '#f5a6ff' },
  { id: 'chaosBlast', name: 'CHAOS BLAST', text: 'Fale uderzeniowe co kilka sekund. Patrzcie na znaczniki.', color: '#ffe066' },
];

export const MOD_BY_ID = Object.fromEntries(MODS.map((m) => [m.id, m])) as Record<ModId, ModDef>;

/** Time-based effects of the active modifier (wind gusts, reversed windows, blasts). */
export class ModState {
  /** wind: current target force, upcoming gust */
  windNow = 0;
  windNext = 0;
  windWarn = 0;
  windT = 3;
  windLeft = 0;
  /** reversed controls: warning countdown and active time */
  revWarn = 0;
  revOn = 0;
  revT = 6;
  /** chaos blast: where and when */
  blastT = 5;
  blastAt: [number, number] | null = null;
  blastWarn = 0;
  constructor(public id: ModId | null) {}
}
