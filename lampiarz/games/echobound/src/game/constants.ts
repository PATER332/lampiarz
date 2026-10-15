export const TILE = 16;
export const VIEW_H = 360;
export const MIN_VIEW_W = 400;
export const MAX_VIEW_W = 960;
export const STEP_MS = 1000 / 60;
export const GRAVITY = 0.32;
export const MAX_FALL = 7;
export const PLAYER_W = 10;
export const PLAYER_H = 14;
export const COYOTE = 6;
export const JUMP_BUFFER = 7;
export const INVULN_FRAMES = 75;
export const DASH_V = 4.3;
export const DASH_FRAMES = 11;

export type CharId = 'echo' | 'weaver';

export interface CharacterDef {
  id: CharId;
  name: string;
  title: string;
  tagline: string;
  abilities: Array<{ key: string; name: string; desc: string }>;
  hint: string;
  price: number;
}

export const CHARACTERS: Record<CharId, CharacterDef> = {
  echo: {
    id: 'echo',
    name: 'Wędrowiec',
    title: 'Mistrz Ech',
    tagline: 'Zapisuje własne ruchy i przywołuje echa, które rozwiązują zagadki w jego imieniu.',
    abilities: [
      { key: 'Q', name: 'Echo', desc: 'Nagrywa ruchy i odtwarza je w postaci echa — trzyma płyty, pociąga dźwignie, wabi wrogów.' },
      { key: 'R', name: 'Rozproszenie', desc: 'Usuwa aktywne echa lub przerywa nagrywanie.' },
      { key: 'F', name: 'Pamięć echa', desc: 'Po ulepszeniu powtarza ostatnie nagranie za pół ceny.' },
      { key: '♥', name: 'Wytrzymałość', desc: 'Cztery serca na starcie.' },
    ],
    hint: '',
    price: 0,
  },
  weaver: {
    id: 'weaver',
    name: 'Szept',
    title: 'Tkaczka Cieni',
    tagline: 'Zwinna i krucha. Zamiast ech zostawia Kotwice Cienia i przeskakuje do nich w mgnieniu oka.',
    abilities: [
      { key: 'Q', name: 'Kotwica Cienia', desc: 'Zostaw w miejscu swój cień — trzyma płyty i wabi Pożeraczy. Naciśnij Q ponownie, by skoczyć do niego przez ściany i zasłony.' },
      { key: 'Shift', name: 'Dash', desc: 'Błyskawiczny zryw na ziemi i w powietrzu. Chwilowa nietykalność, rozprasza Cienie, odnawia się po lądowaniu.' },
      { key: 'Ściana', name: 'Wspinaczka', desc: 'Przyklejasz się do ścian, powoli zsuwasz i odbijasz od nich skokiem.' },
      { key: '♥', name: 'Kruchość', desc: 'Trzy serca. Kotwica nie pociąga dźwigni, a płyty „tylko dla żywych” ją odrzucają.' },
    ],
    hint: 'Uwięziona w Zatopionym Archiwum — szukaj klatki na końcu górnego korytarza.',
    price: 25,
  },
};

export type UpgradeId = 'recordTime' | 'maxEchoes' | 'speed' | 'jump' | 'regen' | 'memory' | 'health';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  costs: number[];
  glyph: string;
  weaverName?: string;
  weaverDesc?: string;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'recordTime', name: 'Dłuższe nagranie', desc: 'Więcej energii echa: dłuższy czas nagrywania i dłuższa żywotność przywołanych ech.', costs: [6, 12, 20], glyph: '◷',
    weaverName: 'Trwalsza kotwica', weaverDesc: 'Pojemniejsza energia cienia i dłuższe życie Kotwicy Cienia.',
  },
  {
    id: 'maxEchoes', name: 'Więcej ech', desc: 'Pozwala utrzymać więcej aktywnych ech jednocześnie.', costs: [10, 25], glyph: '⧉',
    weaverName: 'Dodatkowy dash', weaverDesc: '+1 ładunek dashu w powietrzu na każdy poziom.',
  },
  { id: 'speed', name: 'Szybszy krok', desc: 'Zwiększa prędkość poruszania się.', costs: [8, 18], glyph: '»' },
  {
    id: 'jump', name: 'Wyższy skok', desc: 'Zwiększa wysokość skoku i zasięg przeskoków.', costs: [8, 18], glyph: '↥',
    weaverDesc: 'Wyższy skok oraz mocniejsze odbicie od ściany.',
  },
  { id: 'regen', name: 'Szybsze odnowienie', desc: 'Energia echa regeneruje się szybciej.', costs: [6, 12, 20], glyph: '⟳' },
  {
    id: 'memory', name: 'Pamięć echa', desc: 'Klawisz F przywołuje ponownie ostatnie nagranie za połowę kosztu energii.', costs: [12], glyph: '◈',
    weaverName: 'Wieczna kotwica', weaverDesc: 'Kotwica Cienia nie zanika z czasem — trwa, dopóki jej nie użyjesz.',
  },
  { id: 'health', name: 'Więcej zdrowia', desc: 'Dodaje jedno serce.', costs: [8, 16], glyph: '♥' },
];

export interface Stats {
  speed: number;
  jump: number;
  recordTime: number;
  maxEchoes: number;
  regen: number;
  linger: number;
  maxHp: number;
  memory: boolean;
  dashes: number;
  anchorLife: number;
  anchorCost: number;
}

export type UpgradeLevels = Record<UpgradeId, number>;

export const emptyUpgrades = (): UpgradeLevels => ({
  recordTime: 0, maxEchoes: 0, speed: 0, jump: 0, regen: 0, memory: 0, health: 0,
});

export function computeStats(up: UpgradeLevels, char: CharId = 'echo'): Stats {
  const weaver = char === 'weaver';
  return {
    speed: (1.6 + 0.2 * up.speed) * (weaver ? 1.1 : 1),
    jump: -((weaver ? 5.8 : 6.0) + 0.45 * up.jump),
    recordTime: 8 + 4 * up.recordTime,
    maxEchoes: 2 + up.maxEchoes,
    regen: 0.6 + 0.35 * up.regen,
    linger: 8 + 3 * up.recordTime,
    maxHp: (weaver ? 3 : 4) + up.health,
    memory: up.memory > 0,
    dashes: 1 + up.maxEchoes,
    anchorLife: up.memory > 0 ? Infinity : 10 + 4 * up.recordTime,
    anchorCost: 2.5,
  };
}

export const AREA_ORDER = ['cave', 'ruins', 'archive', 'gardens', 'forge', 'spire', 'heart', 'abyss', 'mire', 'citadel', 'rift'] as const;
