import type { ClassId, DistrictMods, EnemyType, ThemeId } from './types';

// ---------------------------------------------------------------- classes
export interface ClassDef {
  id: ClassId;
  name: string;
  title: string;
  hp: number;
  maxOil: number;
  startOil: number;
  lantern: number;
  melee: number;
  ability: { name: string; cost: number; desc: string };
  passive: string;
  unlock: string | null; // achievement id
  unlockHint: string;
  color: string;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  lampiarz: {
    id: 'lampiarz',
    name: 'Lampiarz',
    title: 'Strażnik knotów',
    hp: 4,
    maxOil: 8,
    startOil: 6,
    lantern: 2.6,
    melee: 1,
    ability: { name: 'Rozbłysk', cost: 2, desc: 'Zadaje 1 obrażeń każdemu cieniowi w promieniu 2,5 pola (w linii wzroku).' },
    passive: 'Zrównoważony. Pierwsza latarnia w każdej dzielnicy jest darmowa.',
    unlock: null,
    unlockHint: '',
    color: '#4f8a83',
  },
  kowalka: {
    id: 'kowalka',
    name: 'Kowalka',
    title: 'Młot przeciw mrokowi',
    hp: 6,
    maxOil: 6,
    startOil: 5,
    lantern: 2.1,
    melee: 2,
    ability: { name: 'Uderzenie młota', cost: 1, desc: 'Zadaje 2 obrażeń sąsiednim cieniom i odpycha je o pole (+1 obrażeń, gdy uderzą w przeszkodę).' },
    passive: 'Cios wręcz zadaje 2 obrażeń. Mniejszy zasięg latarni.',
    unlock: 'przez_mrok',
    unlockHint: 'Dotrzyj do 3. dzielnicy.',
    color: '#b5643a',
  },
  alchemik: {
    id: 'alchemik',
    name: 'Alchemik',
    title: 'Destylator płomieni',
    hp: 3,
    maxOil: 12,
    startOil: 9,
    lantern: 2.6,
    melee: 1,
    ability: { name: 'Pożoga', cost: 2, desc: 'Podpala 8 pól wokół na 4 tury. Ogień to święte światło: rani cienie i ich nie wpuszcza.' },
    passive: 'Kanistry dają +1 oleju. Kruche ciało.',
    unlock: 'alchemia',
    unlockHint: 'Zapal łącznie 40 latarni.',
    color: '#8b5a9e',
  },
};

// ---------------------------------------------------------------- enemies
export interface EnemyDef {
  type: EnemyType;
  name: string;
  hp: number;
  damage: number;
  speed: number;
  embers: number;
  holyImmune: boolean;
  desc: string;
  minDepth: number;
  weight: number;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  cien: { type: 'cien', name: 'Cień', hp: 1, damage: 1, speed: 1, embers: 1, holyImmune: false, minDepth: 1, weight: 10, desc: 'Zwykły strzęp mroku. Podchodzi i drapie. Nie wejdzie w światło latarni.' },
  smigacz: { type: 'smigacz', name: 'Śmigacz', hp: 1, damage: 1, speed: 2, embers: 1, holyImmune: false, minDepth: 2, weight: 6, desc: 'Porusza się o dwa pola na turę, ale żeby uderzyć, musi się zatrzymać. Uderz pierwszy.' },
  gasiciel: { type: 'gasiciel', name: 'Gasiciel', hp: 2, damage: 0, speed: 1, embers: 2, holyImmune: true, minDepth: 2, weight: 4, desc: 'Odporny na światło i nie rani. Idzie do najbliższej płonącej latarni lub znicza i gasi ją — zgaszony znicz zamyka bramę. Gdy nic nie płonie, zdmuchuje olej z twojej latarni.' },
  smolnik: { type: 'smolnik', name: 'Smolnik', hp: 2, damage: 0, speed: 1, embers: 2, holyImmune: false, minDepth: 3, weight: 4, desc: 'Lepka smoła. Zamiast ranić, wysysa 2 oleju z twojej latarni. Gdy olej się skończy — parzy.' },
  lowca: { type: 'lowca', name: 'Łowca', hp: 2, damage: 2, speed: 1, embers: 3, holyImmune: false, minDepth: 3, weight: 3, desc: 'Gdy staniesz z nim w linii (do 4 pól), celuje, a w następnej turze szarżuje. Zejdź z czerwonej linii.' },
  matka: { type: 'matka', name: 'Matka Mroku', hp: 12, damage: 2, speed: 1, embers: 20, holyImmune: true, minDepth: 6, weight: 0, desc: 'Źródło nocy. Co kilka tur gasi wszystkie światła wokół siebie i rodzi nowe cienie. Można ją zabić — albo zapalić latarnię morską mimo niej.' },
};

// ---------------------------------------------------------------- relics
export type Rarity = 'common' | 'uncommon' | 'rare';
export interface RelicDef {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  unlock: string | null; // achievement that adds it to the pool
  shopless?: boolean; // only from special sources
}

export const RELICS: RelicDef[] = [
  { id: 'szeroki_knot', name: 'Szeroki knot', desc: 'Promień twojej latarni +1.', rarity: 'common', unlock: null },
  { id: 'miedziany_zbiornik', name: 'Miedziany zbiornik', desc: '+3 maks. oleju i +3 oleju teraz.', rarity: 'common', unlock: null },
  { id: 'oszczedny_palnik', name: 'Oszczędny palnik', desc: 'Latarnia spala olej co 24 tury zamiast co 15.', rarity: 'common', unlock: null },
  { id: 'iskrownik', name: 'Iskrownik', desc: '+1 obrażeń wręcz.', rarity: 'common', unlock: null },
  { id: 'kieszen_zaru', name: 'Kieszeń na żar', desc: '+50% żaru z cieni i stosów.', rarity: 'common', unlock: null },
  { id: 'rekawice', name: 'Skórzane rękawice', desc: 'Zbieranie oleju z latarni daje 2 zamiast 1.', rarity: 'common', unlock: null },
  { id: 'zelazne_serce', name: 'Żelazne serce', desc: '+1 maks. zdrowia i leczy 1.', rarity: 'common', unlock: null },
  { id: 'kolce_swiatla', name: 'Kolce światła', desc: 'Cień, który cię zrani, otrzymuje 1 obrażeń.', rarity: 'uncommon', unlock: null },
  { id: 'krzesiwo', name: 'Krzesiwo', desc: 'Co trzecia zapalona latarnia jest darmowa.', rarity: 'uncommon', unlock: null },
  { id: 'dlugi_lont', name: 'Długi lont', desc: 'Zdolność kosztuje 1 olej mniej (min. 1) i ma +1 zasięgu.', rarity: 'uncommon', unlock: null },
  { id: 'pijawka', name: 'Pijawka', desc: 'Co drugie zabójstwo daje 1 olej.', rarity: 'uncommon', unlock: null },
  { id: 'czujne_oko', name: 'Czujne oko', desc: 'Widzisz wrogów i ich zamiary w promieniu 6 pól, nawet w mroku.', rarity: 'uncommon', unlock: null },
  { id: 'wiatrochron', name: 'Wiatrochron', desc: 'Gasiciele potrzebują 2 tur, by zgasić płomień.', rarity: 'uncommon', unlock: null },
  { id: 'mapa', name: 'Mapa kartografa', desc: 'Na początku dzielnicy znasz położenie zniczy, bramy, oleju i żaru.', rarity: 'uncommon', unlock: null },
  { id: 'plaszcz_mgly', name: 'Płaszcz z mgły', desc: 'Pierwsze obrażenia w każdej dzielnicy są ignorowane.', rarity: 'rare', unlock: 'bez_skazy' },
  { id: 'serce_latarni', name: 'Serce latarni', desc: 'Gdy olej spadnie do 0, raz na dzielnicę odzyskujesz 4 oleju.', rarity: 'rare', unlock: null },
  { id: 'popiol_feniksa', name: 'Popiół feniksa', desc: 'Raz na noc: śmiertelny cios zostawia cię z 1 zdrowiem i pełnym olejem.', rarity: 'rare', unlock: 'swit' },
  { id: 'lustro', name: 'Lustro latarnika', desc: 'Zdolność zadaje +1 obrażeń.', rarity: 'rare', unlock: 'pogromca' },
  { id: 'zloty_knot', name: 'Złoty knot', desc: 'Latarnie i znicze świecą o 1 pole dalej.', rarity: 'rare', unlock: null, shopless: true },
];

export const RELIC_MAP: Record<string, RelicDef> = Object.fromEntries(RELICS.map((r) => [r.id, r]));

// ---------------------------------------------------------------- themes
export interface ThemeDef {
  id: ThemeId;
  name: string;
  blurb: string;
  mods: DistrictMods;
  danger: number;
  palette: {
    floor: string;
    floorAlt: string;
    joint: string;
    wallTop: string;
    wallFace: string;
    wallTrim: string;
    accent: string;
    fog: string;
  };
}

const baseMods: DistrictMods = {
  oilBonus: 0,
  emberMult: 1,
  extraEnemies: 0,
  mrokMult: 1,
  lampRadiusBonus: 0,
  weights: {},
  eventGuaranteed: false,
};

export const THEMES: Record<ThemeId, ThemeDef> = {
  stare: {
    id: 'stare',
    name: 'Stare Miasto',
    blurb: 'Kręte uliczki i dużo latarni. Bez niespodzianek.',
    mods: { ...baseMods },
    danger: 1,
    palette: { floor: '#3a3631', floorAlt: '#433e37', joint: '#24211d', wallTop: '#4a2f2a', wallFace: '#5b4a3e', wallTrim: '#2a1c18', accent: '#d39b54', fog: '#141a2b' },
  },
  port: {
    id: 'port',
    name: 'Zatopiony Port',
    blurb: 'Więcej kanistrów oleju, ale smoła sączy się z kanałów.',
    mods: { ...baseMods, oilBonus: 2, weights: { smolnik: 7 } },
    danger: 2,
    palette: { floor: '#2b3638', floorAlt: '#314043', joint: '#182224', wallTop: '#2c3a45', wallFace: '#3c4b52', wallTrim: '#141c22', accent: '#7fb7b0', fog: '#0f1c25' },
  },
  cmentarz: {
    id: 'cmentarz',
    name: 'Cmentarz Kalwaryjski',
    blurb: 'Żar ×1,5. Mrok gęstnieje szybciej, cieni jest więcej.',
    mods: { ...baseMods, emberMult: 1.5, extraEnemies: 1, mrokMult: 1.25 },
    danger: 3,
    palette: { floor: '#2f3429', floorAlt: '#363c2f', joint: '#1b1f17', wallTop: '#3a3b3c', wallFace: '#4a4c4a', wallTrim: '#1d1e1f', accent: '#a7c08a', fog: '#121a16' },
  },
  fabryka: {
    id: 'fabryka',
    name: 'Gazownia',
    blurb: 'Gazowe latarnie świecą o pole dalej. Gasiciele ciągną tu chmarą.',
    mods: { ...baseMods, lampRadiusBonus: 1, weights: { gasiciel: 9 } },
    danger: 2,
    palette: { floor: '#352f2b', floorAlt: '#3d3530', joint: '#1e1a17', wallTop: '#4d3426', wallFace: '#5e4232', wallTrim: '#24170f', accent: '#e07a3f', fog: '#1a1414' },
  },
  ogrod: {
    id: 'ogrod',
    name: 'Ogród Ciszy',
    blurb: 'Mniej cieni i mniej oleju. Zawsze czeka tu jakieś spotkanie.',
    mods: { ...baseMods, oilBonus: -1, extraEnemies: -1, eventGuaranteed: true, mrokMult: 0.85 },
    danger: 1,
    palette: { floor: '#2e3327', floorAlt: '#353b2c', joint: '#1a1e15', wallTop: '#24382a', wallFace: '#2f4634', wallTrim: '#122016', accent: '#c7b56a', fog: '#101a14' },
  },
  latarnia: {
    id: 'latarnia',
    name: 'Cypel Latarni',
    blurb: 'Ostatnia noc. Zapal znicze, potem latarnię morską — albo zabij Matkę Mroku.',
    mods: { ...baseMods, mrokMult: 1.1 },
    danger: 4,
    palette: { floor: '#34322f', floorAlt: '#3b3935', joint: '#1c1b19', wallTop: '#30384a', wallFace: '#414a5c', wallTrim: '#161b26', accent: '#f0c46c', fog: '#0d1222' },
  },
};

export const PATH_THEMES: ThemeId[] = ['stare', 'port', 'cmentarz', 'fabryka', 'ogrod'];

// ---------------------------------------------------------------- nights (difficulty)
export const NIGHTS = [
  { level: 1, name: 'Noc I', desc: 'Zwykła noc.' },
  { level: 2, name: 'Noc II', desc: '+1 cień na starcie każdej dzielnicy.' },
  { level: 3, name: 'Noc III', desc: 'Oraz: mrok gęstnieje o 25% szybciej.' },
  { level: 4, name: 'Noc IV', desc: 'Oraz: ceny w warsztacie +30%.' },
  { level: 5, name: 'Noc V', desc: 'Oraz: −1 maks. zdrowia, Matka Mroku silniejsza.' },
];

// ---------------------------------------------------------------- events
export interface EventChoiceDef {
  id: string;
  label: string;
  hint: string;
}
export interface EventDef {
  id: string;
  title: string;
  text: string;
  choices: EventChoiceDef[];
}

export const EVENTS: EventDef[] = [
  {
    id: 'handlarz',
    title: 'Wędrowny handlarz olejem',
    text: 'Pod daszkiem kramu skrzypi wózek pełen bańek. Handlarz nie patrzy ci w oczy — patrzy na twój żar.',
    choices: [
      { id: 'buy', label: 'Kup 3 oleju', hint: '−4 żaru, +3 oleju' },
      { id: 'buy_big', label: 'Kup cały zapas', hint: '−9 żaru, olej do pełna i +2 maks. oleju' },
      { id: 'leave', label: 'Odejdź', hint: '' },
    ],
  },
  {
    id: 'studnia',
    title: 'Studnia życzeń',
    text: 'Na dnie studni coś żarzy się jak zapomniany węgielek. Miasto mówi, że studnia oddaje dwa razy tyle, ile dostanie.',
    choices: [
      { id: 'throw', label: 'Wrzuć 5 żaru', hint: 'Los: relikt albo nic' },
      { id: 'drink', label: 'Napij się', hint: '+1 zdrowia, mrok +4' },
      { id: 'leave', label: 'Odejdź', hint: '' },
    ],
  },
  {
    id: 'ranny',
    title: 'Ranny lampiarz',
    text: 'Opiera się o mur, ręce mu drżą. Jego latarnia zgasła godzinę temu.',
    choices: [
      { id: 'help', label: 'Oddaj mu 2 oleju', hint: '−2 oleju, +1 maks. zdrowia' },
      { id: 'rob', label: 'Zabierz mu torbę', hint: '+7 żaru, mrok +6' },
      { id: 'leave', label: 'Odejdź', hint: '' },
    ],
  },
  {
    id: 'szept',
    title: 'Szept z mroku',
    text: 'Z ciemnej bramy ktoś wyciąga dłoń z czymś błyszczącym. „Weź. Zapłacisz później.”',
    choices: [
      { id: 'accept', label: 'Przyjmij dar', hint: 'Losowy relikt, −1 maks. zdrowia' },
      { id: 'refuse', label: 'Odmów', hint: '+2 żaru za odwagę' },
    ],
  },
  {
    id: 'kapliczka',
    title: 'Przydrożna kapliczka',
    text: 'Gromnica w niszy wciąż się tli. W wosku ktoś wydrapał imiona tych, którzy nie wrócili.',
    choices: [
      { id: 'pray', label: 'Pomódl się', hint: 'Pełne zdrowie, mrok +8' },
      { id: 'take', label: 'Weź gromnicę', hint: '+3 oleju' },
      { id: 'leave', label: 'Odejdź', hint: '' },
    ],
  },
  {
    id: 'kartograf',
    title: 'Zbieracz map',
    text: 'Starzec rozkłada na bruku plany dzielnicy narysowane sadzą. Część ulic przekreślono.',
    choices: [
      { id: 'buy', label: 'Kup plan', hint: '−3 żaru, odkrywa całą dzielnicę' },
      { id: 'trade', label: 'Wymień się opowieścią', hint: 'Odkrywa położenie zniczy' },
      { id: 'leave', label: 'Odejdź', hint: '' },
    ],
  },
];

export const EVENT_MAP: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// ---------------------------------------------------------------- achievements
export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  secret: boolean;
  reward?: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'pierwsze_swiatlo', name: 'Pierwsze światło', desc: 'Zapal pierwszą latarnię.', secret: false },
  { id: 'pelne_swiatlo', name: 'Pełne światło', desc: 'Zapal wszystkie latarnie w jednej dzielnicy.', secret: false },
  { id: 'przez_mrok', name: 'Przez mrok', desc: 'Dotrzyj do 3. dzielnicy.', secret: false, reward: 'Odblokowuje Kowalkę' },
  { id: 'alchemia', name: 'Alchemia światła', desc: 'Zapal łącznie 40 latarni.', secret: false, reward: 'Odblokowuje Alchemika' },
  { id: 'bez_skazy', name: 'Bez skazy', desc: 'Ukończ dzielnicę bez otrzymania obrażeń.', secret: false, reward: 'Relikt „Płaszcz z mgły” w puli' },
  { id: 'pogromca', name: 'Pogromca cieni', desc: 'Rozprosz łącznie 100 cieni.', secret: false, reward: 'Relikt „Lustro latarnika” w puli' },
  { id: 'swit', name: 'Świt', desc: 'Zapal latarnię morską i przetrwaj noc.', secret: false, reward: 'Noc II i relikt „Popiół feniksa”' },
  { id: 'skarbnik', name: 'Skarbnik', desc: 'Zbierz 60 żaru w jednej nocy.', secret: false },
  { id: 'asceta', name: 'Asceta', desc: 'Wygraj, mając najwyżej 2 relikty.', secret: false },
  { id: 'nocna_zmiana', name: 'Nocna zmiana', desc: 'Wygraj na Nocy III lub trudniejszej.', secret: false },
  { id: 'piec_nocy', name: 'Pięć nocy', desc: 'Wygraj na Nocy V.', secret: false },
  { id: 'wszyscy', name: 'Cech lampiarzy', desc: 'Wygraj każdą z trzech postaci.', secret: false },
  { id: 'codzienna', name: 'Codzienna warta', desc: 'Ukończ Noc dnia (wygrana lub śmierć po 3. dzielnicy).', secret: false },
  { id: 'matkobojca', name: 'Matkobójca', desc: 'Rozprosz Matkę Mroku zamiast zapalać latarnię.', secret: true },
  { id: 'na_oparach', name: 'Na oparach', desc: 'Przejdź przez bramę z pustą latarnią.', secret: true },
  { id: 'kapliczka', name: 'Zapomniana kapliczka', desc: 'Odnajdź ukrytą kapliczkę w mroku.', secret: true },
  { id: 'feniks', name: 'Z popiołów', desc: 'Przeżyj dzięki Popiołowi feniksa.', secret: true },
];

export const ACH_MAP: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
