// Game data: weapons, expedition upgrades, permanent upgrades, cosmetics.

export type WeaponId = 'blade' | 'heavy' | 'cannon';

export interface ComboHit {
  dmg: number;
  dur: number; // total time of the swing
  active: [number, number]; // window (seconds) in which the hitbox is live
  reach: number; // px in front of the body
  height: number;
  knock: number;
  lunge: number; // forward step
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  short: string;
  desc: string;
  combo: ComboHit[]; // empty for ranged weapons
  shot?: { dmg: number; speed: number; cooldown: number };
  charged: { name: string; desc: string; dmg: number };
  special: { name: string; desc: string; cost: number; dmg: number };
  cost: number; // fragments to unlock (0 = from the start)
  stats: { label: string; value: string }[];
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  blade: {
    id: 'blade',
    name: 'Ostrze Energetyczne',
    short: 'Ostrze',
    desc: 'Szybkie cięcia w trzech ruchach. Dobre na wszystko, mistrzowskie w rękach cierpliwych.',
    combo: [
      { dmg: 11, dur: 0.24, active: [0.04, 0.13], reach: 24, height: 24, knock: 90, lunge: 40 },
      { dmg: 11, dur: 0.24, active: [0.04, 0.13], reach: 24, height: 24, knock: 90, lunge: 40 },
      { dmg: 18, dur: 0.34, active: [0.07, 0.18], reach: 30, height: 28, knock: 200, lunge: 80 },
    ],
    charged: { name: 'Wir Ostrzy', desc: 'Obrotowe cięcie wokół ciebie.', dmg: 38 },
    special: { name: 'Fala Pustki', desc: 'Przebijająca fala energii lecąca przed siebie.', cost: 30, dmg: 24 },
    cost: 0,
    stats: [
      { label: 'Obrażenia', value: '11 / 11 / 18' },
      { label: 'Szybkość', value: 'wysoka' },
      { label: 'Zasięg', value: 'krótki' },
    ],
  },
  heavy: {
    id: 'heavy',
    name: 'Ciężkie Ostrze',
    short: 'Ciężkie',
    desc: 'Wolne, potężne uderzenia, które odrzucają wrogów. Każde trafienie mocno się czuje.',
    combo: [
      { dmg: 26, dur: 0.46, active: [0.16, 0.28], reach: 34, height: 30, knock: 260, lunge: 30 },
      { dmg: 36, dur: 0.56, active: [0.2, 0.34], reach: 38, height: 34, knock: 340, lunge: 50 },
    ],
    charged: { name: 'Miażdżący Cios', desc: 'Uderzenie z góry, które wysyła falę uderzeniową po ziemi w obie strony.', dmg: 64 },
    special: { name: 'Wstrząs', desc: 'Uderzenie w ziemię raniące wszystko wokół.', cost: 35, dmg: 34 },
    cost: 60,
    stats: [
      { label: 'Obrażenia', value: '26 / 36' },
      { label: 'Szybkość', value: 'niska' },
      { label: 'Zasięg', value: 'średni' },
    ],
  },
  cannon: {
    id: 'cannon',
    name: 'Działo Pustki',
    short: 'Działo',
    desc: 'Strzela pociskami energii na odległość. Mniejsze obrażenia, za to bezpieczny dystans.',
    combo: [],
    shot: { dmg: 8, speed: 380, cooldown: 0.2 },
    charged: { name: 'Promień Pustki', desc: 'Przebijający promień przez cały ekran.', dmg: 44 },
    special: { name: 'Granat Pustki', desc: 'Granat lecący łukiem, wybucha przy uderzeniu.', cost: 30, dmg: 38 },
    cost: 90,
    stats: [
      { label: 'Obrażenia', value: '8 na pocisk' },
      { label: 'Szybkość', value: 'bardzo wysoka' },
      { label: 'Zasięg', value: 'daleki' },
    ],
  },
};

export type UpgradeId =
  | 'lightning'
  | 'voidshadow'
  | 'overload'
  | 'nanoregen'
  | 'energyblade'
  | 'reactor'
  | 'split'
  | 'plating'
  | 'cell'
  | 'crit'
  | 'kinetic'
  | 'triplejump'
  | 'magnet';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: (stacks: number) => string; // description for the NEXT stack
  max: number;
  weight: number;
  color: string;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  lightning: {
    id: 'lightning',
    name: 'Ładunek Błyskawicy',
    desc: (s) => `Trafienia mają ${20 + s * 10}% szans na wyładowanie, które przeskakuje na 2 pobliskich wrogów (12 obrażeń).`,
    max: 3,
    weight: 10,
    color: '#8ef6ff',
  },
  voidshadow: {
    id: 'voidshadow',
    name: 'Cień Pustki',
    desc: (s) => `Zryw zostawia ładunek, który po chwili wybucha (${18 + s * 8} obrażeń).`,
    max: 3,
    weight: 9,
    color: '#c45cff',
  },
  overload: {
    id: 'overload',
    name: 'Przeciążenie',
    desc: (s) => `Ataki naładowane zadają +${50 * (s + 1)}% obrażeń i ładują się szybciej.`,
    max: 3,
    weight: 9,
    color: '#ffb23e',
  },
  nanoregen: {
    id: 'nanoregen',
    name: 'Nanoregeneracja',
    desc: (s) => `Pokonanie wroga przywraca ${3 * (s + 1)} punktów zdrowia.`,
    max: 3,
    weight: 9,
    color: '#5dff9b',
  },
  energyblade: {
    id: 'energyblade',
    name: 'Energetyczne Ostrze',
    desc: (s) => `+${15 * (s + 1)}% obrażeń zwykłych ataków i +${20 * (s + 1)}% zasięgu cięć.`,
    max: 3,
    weight: 10,
    color: '#3ee6ff',
  },
  reactor: {
    id: 'reactor',
    name: 'Reaktor Awaryjny',
    desc: () => 'Poniżej 35% zdrowia: +35% szybkości ruchu i +25% obrażeń.',
    max: 1,
    weight: 6,
    color: '#ff4a5a',
  },
  split: {
    id: 'split',
    name: 'Rozszczepienie',
    desc: (s) => `Umiejętność specjalna wystrzeliwuje dodatkowo ${3 + s * 2} odłamki energii.`,
    max: 2,
    weight: 7,
    color: '#ff7ad9',
  },
  plating: {
    id: 'plating',
    name: 'Pancerz Fazowy',
    desc: () => '+20 maksymalnego zdrowia i natychmiast leczy 20.',
    max: 3,
    weight: 8,
    color: '#c8d2e6',
  },
  cell: {
    id: 'cell',
    name: 'Ogniwo Pustki',
    desc: (s) => `Energia odnawia się o ${40 * (s + 1)}% szybciej, trafienia dają więcej energii.`,
    max: 2,
    weight: 7,
    color: '#7f9bff',
  },
  crit: {
    id: 'crit',
    name: 'Precyzja Bojowa',
    desc: (s) => `${12 * (s + 1)}% szans na trafienie krytyczne (podwójne obrażenia).`,
    max: 3,
    weight: 8,
    color: '#ffe066',
  },
  kinetic: {
    id: 'kinetic',
    name: 'Zbroja Kinetyczna',
    desc: (s) => `Otrzymujesz ${15 * (s + 1)}% mniej obrażeń.`,
    max: 2,
    weight: 7,
    color: '#9aa7c4',
  },
  triplejump: {
    id: 'triplejump',
    name: 'Trzeci Skok',
    desc: () => 'Dodatkowy skok w powietrzu.',
    max: 1,
    weight: 4,
    color: '#a6f0ff',
  },
  magnet: {
    id: 'magnet',
    name: 'Magnes Fragmentów',
    desc: (s) => `+${25 * (s + 1)}% Fragmentów Pustki z wrogów i większy zasięg ich zbierania.`,
    max: 2,
    weight: 6,
    color: '#e0b3ff',
  },
};

export type PermId = 'hp' | 'dmg' | 'heal' | 'energy' | 'startup' | 'airdash';

export interface PermDef {
  id: PermId;
  name: string;
  desc: (lvl: number) => string;
  costs: number[];
}

export const PERMS: PermDef[] = [
  { id: 'hp', name: 'Wzmocniony Pancerz', desc: (l) => `+15 maksymalnego zdrowia na poziom (teraz +${l * 15}).`, costs: [15, 25, 40, 60, 90] },
  { id: 'dmg', name: 'Kalibracja Broni', desc: (l) => `+8% obrażeń broni startowej na poziom (teraz +${l * 8}%).`, costs: [20, 35, 55, 80, 110] },
  { id: 'heal', name: 'Nanoapteczki', desc: (l) => `+1 ładunek leczenia na wyprawę (teraz ${1 + l}).`, costs: [25, 50, 90] },
  { id: 'energy', name: 'Ogniwo Rezerwowe', desc: (l) => `+20 energii i szybsza regeneracja (teraz +${l * 20}).`, costs: [20, 40, 70] },
  {
    id: 'startup',
    name: 'Moduł Startowy',
    desc: (l) => (l === 0 ? 'Zaczynasz wyprawę z wyborem jednego ulepszenia.' : l === 1 ? 'Poziom 2: start z dwoma ulepszeniami do wyboru.' : 'Zaczynasz z dwoma ulepszeniami.'),
    costs: [60, 120],
  },
  { id: 'airdash', name: 'Zryw Fazowy', desc: () => 'Nowa umiejętność startowa: drugi zryw w powietrzu.', costs: [50] },
];

export type CosmeticId = 'standard' | 'karmazyn' | 'zloto' | 'widmo';

export const COSMETICS: Record<CosmeticId, { name: string; cost: number; armor: string; armorHi: string; glow: string; visor: string }> = {
  standard: { name: 'Prototyp', cost: 0, armor: '#6878a0', armorHi: '#c4d4f0', glow: '#3ee6ff', visor: '#9ff6ff' },
  karmazyn: { name: 'Karmazyn', cost: 30, armor: '#6a2a38', armorHi: '#c25466', glow: '#ff3d5e', visor: '#ffb0bc' },
  zloto: { name: 'Złoty Pancerz', cost: 45, armor: '#6e5628', armorHi: '#d4b060', glow: '#ffd23e', visor: '#fff0b0' },
  widmo: { name: 'Widmo', cost: 60, armor: '#4a3d60', armorHi: '#a896c8', glow: '#c45cff', visor: '#f0dcff' },
};
