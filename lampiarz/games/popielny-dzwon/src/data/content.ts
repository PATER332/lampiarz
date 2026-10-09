// World content: story texts, weapons, relics, enemies, locations.
// Every number that shapes the fight lives here.

export type LocationId = 'rynek' | 'ogrod' | 'katedra';
export type WeaponId = 'klucz' | 'sierpy' | 'mlot';
export type BossId = 'kat' | 'pasterz' | 'dzwon';
export type EnemyKind = 'wyrwany' | 'ogar' | 'straznik' | 'cmiara' | 'spiewak' | 'cma';
export type RelicId =
  | 'tanczacy_popiol'
  | 'gorzka_modlitwa'
  | 'woskowe_serce'
  | 'pekniety_klosz'
  | 'zalobny_welon'
  | 'pierscien_wdowy'
  | 'kosc_dzwonka'
  | 'oko_cmy'
  | 'zelazny_rozaniec';

// ------------------------------------------------------------------ weapons
export interface MeleeHit {
  windup: number;
  active: number;
  recover: number;
  dmg: number;
  poise: number;
  /** hitbox relative to the attacker: forward offset, vertical offset from top, size */
  reach: number;
  height: number;
  top: number;
  stamina: number;
  lunge: number;
  /** can the next input cancel into a roll during recovery? */
  rollCancel: number;
  sound: 'light' | 'heavy' | 'blade';
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  kind: string;
  desc: string;
  lore: string;
  combo: MeleeHit[];
  heavy: MeleeHit & { chargeMax: number; chargeBonus: number; shockwave?: boolean; spin?: number };
  /** perfect-parry window (s) and fraction of damage that passes a block */
  parryWindow: number;
  blockLeak: number;
  hyperArmor: boolean;
  upgradeDmg: number;
}

const hit = (o: Partial<MeleeHit> & Pick<MeleeHit, 'windup' | 'active' | 'recover' | 'dmg'>): MeleeHit => ({
  poise: 12,
  reach: 54,
  height: 34,
  top: 2,
  stamina: 14,
  lunge: 60,
  rollCancel: 0.5,
  sound: 'light',
  ...o,
});

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  klucz: {
    id: 'klucz',
    name: 'Klucz Dzwonnika',
    kind: 'zrównoważony',
    desc: 'Ciężki kuty klucz do bram dzwonnicy. Trzy ciosy w serii, pewny blok, uczciwe okno parowania.',
    lore: 'Otwierał drzwi, za którymi wisiała Gromnica. Teraz otwiera tylko czaszki.',
    combo: [
      hit({ windup: 0.13, active: 0.1, recover: 0.24, dmg: 16, poise: 12 }),
      hit({ windup: 0.12, active: 0.1, recover: 0.26, dmg: 17, poise: 12 }),
      hit({ windup: 0.2, active: 0.12, recover: 0.38, dmg: 26, poise: 22, reach: 62, lunge: 110, stamina: 18, sound: 'heavy' }),
    ],
    heavy: { ...hit({ windup: 0.26, active: 0.14, recover: 0.45, dmg: 34, poise: 42, reach: 70, height: 40, stamina: 30, lunge: 90, sound: 'heavy', rollCancel: 0.7 }), chargeMax: 0.85, chargeBonus: 0.75 },
    parryWindow: 0.16,
    blockLeak: 0.3,
    hyperArmor: false,
    upgradeDmg: 0.14,
  },
  sierpy: {
    id: 'sierpy',
    name: 'Sierpy Żałobnicy',
    kind: 'szybkie',
    desc: 'Dwa bliźniacze sierpy. Cztery błyskawiczne cięcia, unik w każdej chwili serii, szerokie okno parowania — ale blok przepuszcza połowę ciosu.',
    lore: 'Żniwiarka z Rynku ścinała nimi zboże, póki pole nie zaczęło krwawić.',
    combo: [
      hit({ windup: 0.07, active: 0.08, recover: 0.16, dmg: 9, poise: 5, reach: 46, stamina: 9, lunge: 50, rollCancel: 0, sound: 'blade' }),
      hit({ windup: 0.07, active: 0.08, recover: 0.16, dmg: 9, poise: 5, reach: 46, stamina: 9, lunge: 50, rollCancel: 0, sound: 'blade' }),
      hit({ windup: 0.08, active: 0.08, recover: 0.18, dmg: 11, poise: 6, reach: 48, stamina: 10, lunge: 60, rollCancel: 0, sound: 'blade' }),
      hit({ windup: 0.12, active: 0.12, recover: 0.3, dmg: 18, poise: 12, reach: 54, stamina: 12, lunge: 130, rollCancel: 0, sound: 'blade' }),
    ],
    heavy: { ...hit({ windup: 0.18, active: 0.36, recover: 0.36, dmg: 13, poise: 8, reach: 58, height: 46, top: -4, stamina: 28, lunge: 40, sound: 'blade', rollCancel: 0.3 }), chargeMax: 0.6, chargeBonus: 0.5, spin: 3 },
    parryWindow: 0.22,
    blockLeak: 0.5,
    hyperArmor: false,
    upgradeDmg: 0.13,
  },
  mlot: {
    id: 'mlot',
    name: 'Młot Odlewni',
    kind: 'ciężki',
    desc: 'Młot do rozbijania form. Wolny, ale nie da się go przerwać w trakcie zamachu. Naładowany cios wypuszcza falę po ziemi.',
    lore: 'Na obuchu wybito imię: Mikołaj. Ktoś próbował je potem zetrzeć.',
    combo: [
      hit({ windup: 0.34, active: 0.14, recover: 0.42, dmg: 36, poise: 45, reach: 66, height: 44, top: -6, stamina: 26, lunge: 70, rollCancel: 0.75, sound: 'heavy' }),
      hit({ windup: 0.38, active: 0.14, recover: 0.5, dmg: 46, poise: 60, reach: 70, height: 44, top: -6, stamina: 30, lunge: 90, rollCancel: 0.75, sound: 'heavy' }),
    ],
    heavy: { ...hit({ windup: 0.4, active: 0.16, recover: 0.6, dmg: 62, poise: 90, reach: 72, height: 50, top: -10, stamina: 44, lunge: 40, sound: 'heavy', rollCancel: 0.8 }), chargeMax: 1.0, chargeBonus: 0.6, shockwave: true },
    parryWindow: 0.12,
    blockLeak: 0.2,
    hyperArmor: true,
    upgradeDmg: 0.15,
  },
};

export const UPGRADE_COST = [
  { shards: 2, zuzel: 220 },
  { shards: 3, zuzel: 480 },
  { shards: 5, zuzel: 900 },
];

// ------------------------------------------------------------------ relics
export interface RelicDef {
  id: RelicId;
  name: string;
  effect: string;
  cost?: string;
  lore: string;
  price?: number; // in Mumrot's shop
}

export const RELICS: Record<RelicId, RelicDef> = {
  tanczacy_popiol: { id: 'tanczacy_popiol', name: 'Tańczący Popiół', effect: 'Unik przez wrogi cios: następne trafienie zadaje +60% obrażeń.', cost: 'Maks. wytrzymałość −15.', lore: 'Garść popiołu, która nigdy nie opada.', price: 650 },
  gorzka_modlitwa: { id: 'gorzka_modlitwa', name: 'Gorzka Modlitwa', effect: 'Ciężkie ataki zadają +35% obrażeń i łamią więcej równowagi.', cost: 'Ciężkie ataki kosztują +12 wytrzymałości.', lore: 'Różaniec z kamieni nerkowych przeora.', price: 600 },
  woskowe_serce: { id: 'woskowe_serce', name: 'Woskowe Serce', effect: '+1 Łza Wosku.', cost: 'Każda Łza leczy o 25% mniej.', lore: 'Serce ulane z gromnicy. Wciąż ciepłe.' },
  pekniety_klosz: { id: 'pekniety_klosz', name: 'Pęknięty Klosz', effect: 'Okno parowania jest o 80% dłuższe.', cost: 'Blok przepuszcza dwa razy więcej obrażeń.', lore: 'Szkło latarni, która osłaniała płomień przed wiatrem. Już nie osłania.', price: 700 },
  zalobny_welon: { id: 'zalobny_welon', name: 'Żałobny Welon', effect: 'Poniżej 35% zdrowia zadajesz +35% obrażeń.', lore: 'Wdowy z Wierchołowa nosiły go rok i jeden dzień.' },
  pierscien_wdowy: { id: 'pierscien_wdowy', name: 'Pierścień Wdowy', effect: 'Każde zabójstwo leczy 7 zdrowia.', cost: 'Maks. zdrowie −20.', lore: 'Obrączka, której nikt nie odebrał z ręki trupa.', price: 550 },
  kosc_dzwonka: { id: 'kosc_dzwonka', name: 'Kość Dzwonka', effect: 'Rezonans narasta o 60% szybciej.', cost: 'Głos Serca zadaje 20% mniej obrażeń.', lore: 'Serce małego dzwonka z kaplicy dziecięcej.' },
  oko_cmy: { id: 'oko_cmy', name: 'Oko Ćmy', effect: 'Wrogowie zamierzają się o 15% wolniej, a ukryte ściany migoczą.', lore: 'Ćmy widzą światło, którego jeszcze nie ma.', price: 500 },
  zelazny_rozaniec: { id: 'zelazny_rozaniec', name: 'Żelazny Różaniec', effect: 'Ciosy nie przerywają picia Łzy Wosku.', cost: 'Picie trwa o 30% dłużej.', lore: 'Każdy paciorek to inna prośba. Żadna nie została wysłuchana.' },
};

// ------------------------------------------------------------------ attributes / progression
export const BASE = {
  hp: 100,
  stamina: 90,
  staminaRegen: 52, // per second
  staminaDelay: 0.55,
  flasks: 3,
  flaskHeal: 0.42,
  pips: 3,
  pipDamage: 70, // damage dealt per resonance pip
};

export const ATTR = {
  wigor: { name: 'Wigor', desc: '+12 maks. zdrowia', hp: 12 },
  wytrwalosc: { name: 'Wytrwałość', desc: '+8 wytrzymałości, szybsza regeneracja', stamina: 8 },
  sila: { name: 'Siła', desc: '+6% obrażeń broni', dmg: 0.06 },
  rezonans: { name: 'Rezonans', desc: '+10% siły Głosu Serca; co 3 punkty dodatkowa nuta', skill: 0.1 },
};
export type AttrId = keyof typeof ATTR;

export const levelCost = (level: number) => Math.round(80 * Math.pow(1.14, level - 1));

// ------------------------------------------------------------------ enemies
export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  poise: number;
  speed: number;
  w: number;
  h: number;
  zuzel: number;
  flying?: boolean;
  aggro: number;
  material: 'flesh' | 'armor' | 'spirit';
  desc: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  wyrwany: { kind: 'wyrwany', name: 'Wyrwany', hp: 52, poise: 20, speed: 62, w: 24, h: 46, zuzel: 18, aggro: 340, material: 'flesh', desc: 'Mieszczanin, który został po tej stronie popiołu. Wolny, ale nie przestaje.' },
  ogar: { kind: 'ogar', name: 'Ogar Żałoby', hp: 40, poise: 14, speed: 190, w: 40, h: 26, zuzel: 22, aggro: 420, material: 'flesh', desc: 'Pies kata. Przyczaja się i skacze — po skoku zawsze odskakuje.' },
  straznik: { kind: 'straznik', name: 'Strażnik Spiżu', hp: 150, poise: 80, speed: 50, w: 34, h: 58, zuzel: 64, aggro: 320, material: 'armor', desc: 'Za tarczą z odłamka dzwonu nie przebije się lekki cios. Ciężki — tak. Plecy — zawsze.' },
  cmiara: { kind: 'cmiara', name: 'Ćmiara', hp: 44, poise: 16, speed: 90, w: 30, h: 36, zuzel: 28, flying: true, aggro: 460, material: 'spirit', desc: 'Wiedźma o skrzydłach z popiołu. Ciska pyłem; dobrze sparowany pył wraca do nadawcy.' },
  spiewak: { kind: 'spiewak', name: 'Śpiewak Żałobny', hp: 34, poise: 10, speed: 70, w: 22, h: 44, zuzel: 32, aggro: 420, material: 'flesh', desc: 'Jego lament wzmacnia i leczy innych. Przerwij pieśń ciosem.' },
  cma: { kind: 'cma', name: 'Ćma Dusz', hp: 12, poise: 1, speed: 120, w: 18, h: 16, zuzel: 0, flying: true, aggro: 900, material: 'spirit', desc: 'Dusza, która zapomniała, czyja jest.' },
};

// ------------------------------------------------------------------ locations
export interface LocationDef {
  id: LocationId;
  name: string;
  short: string;
  intro: string;
  boss: BossId;
  enemies: { melee: EnemyKind[]; heavy: EnemyKind; ranged: EnemyKind | null; support: EnemyKind | null };
  scale: { hp: number; dmg: number; zuzel: number };
  weather: 'ash' | 'rain' | 'dust';
  darkness: number;
  roomsBefore: number;
  roomsAfter: number;
  surface: 'stone' | 'grass' | 'wood';
  palette: {
    sky: [string, string, string];
    far: string;
    mid: string;
    near: string;
    tile: string;
    tileHi: string;
    tileLo: string;
    rim: string;
    light: string;
    accent: string;
    fog: string;
  };
}

export const LOCATIONS: Record<LocationId, LocationDef> = {
  rynek: {
    id: 'rynek',
    name: 'Rynek Wierchołowa',
    short: 'Rynek',
    intro: 'Popiół pada tu od trzystu dni. Nikt go już nie zamiata.',
    boss: 'kat',
    enemies: { melee: ['wyrwany', 'wyrwany', 'ogar'], heavy: 'wyrwany', ranged: null, support: 'spiewak' },
    scale: { hp: 1, dmg: 1, zuzel: 1 },
    weather: 'ash',
    darkness: 0.5,
    roomsBefore: 3,
    roomsAfter: 3,
    surface: 'stone',
    palette: { sky: ['#06070c', '#1a1d2b', '#3a3341'], far: '#1c1f2c', mid: '#14161f', near: '#0b0c12', tile: '#2a2a31', tileHi: '#4a4855', tileLo: '#17171c', rim: '#8f8aa0', light: '#ffb766', accent: '#d9a25a', fog: '#3b3a48' },
  },
  ogrod: {
    id: 'ogrod',
    name: 'Ogród Kamiennych Mnichów',
    short: 'Ogród',
    intro: 'Mnisi klęczą tu tak długo, że porósł ich mech. Deszcz nie zmywa z nich modlitwy.',
    boss: 'pasterz',
    enemies: { melee: ['wyrwany', 'ogar'], heavy: 'wyrwany', ranged: 'cmiara', support: 'spiewak' },
    scale: { hp: 1.45, dmg: 1.3, zuzel: 1.7 },
    weather: 'rain',
    darkness: 0.58,
    roomsBefore: 3,
    roomsAfter: 3,
    surface: 'grass',
    palette: { sky: ['#03080a', '#0c1d1f', '#20393a'], far: '#10201f', mid: '#0b1716', near: '#050c0b', tile: '#262d27', tileHi: '#3f4f3c', tileLo: '#141813', rim: '#7fb3a1', light: '#b6f0c8', accent: '#9fd6a8', fog: '#2a4441' },
  },
  katedra: {
    id: 'katedra',
    name: 'Katedra Pękniętego Dzwonu',
    short: 'Katedra',
    intro: 'Wahadła wciąż odmierzają czas, choć nie ma już komu go liczyć.',
    boss: 'dzwon',
    enemies: { melee: ['wyrwany', 'ogar', 'straznik'], heavy: 'straznik', ranged: 'cmiara', support: 'spiewak' },
    scale: { hp: 1.95, dmg: 1.6, zuzel: 2.6 },
    weather: 'dust',
    darkness: 0.52,
    roomsBefore: 3,
    roomsAfter: 3,
    surface: 'wood',
    palette: { sky: ['#0a0406', '#24090f', '#4a1a1a'], far: '#2a0e12', mid: '#1b080b', near: '#0c0405', tile: '#2f2525', tileHi: '#5a4337', tileLo: '#170f0f', rim: '#e0a96c', light: '#ffcf7a', accent: '#e8b45c', fog: '#4a2224' },
  },
};

export const LOCATION_ORDER: LocationId[] = ['rynek', 'ogrod', 'katedra'];

// ------------------------------------------------------------------ bosses
export interface BossDef {
  id: BossId;
  name: string;
  title: string;
  hp: number;
  poise: number;
  zuzel: number;
  heart: string;
  reward: string;
  defeat: string;
}

export const BOSSES: Record<BossId, BossDef> = {
  kat: {
    id: 'kat',
    name: 'Mistrz Ignacy',
    title: 'Kat z Rynku',
    hp: 820,
    poise: 170,
    zuzel: 600,
    heart: 'Serce Wyroku',
    reward: 'Sierpy Żałobnicy, 3 odłamki spiżu',
    defeat: 'Topór wypada z rąk, które przez trzysta lat nie umiały go odłożyć.',
  },
  pasterz: {
    id: 'pasterz',
    name: 'Brat Ambroży',
    title: 'Pasterz Ciem',
    hp: 1050,
    poise: 200,
    zuzel: 1200,
    heart: 'Serce Modlitwy',
    reward: 'Młot Odlewni, trzecie miejsce na relikt, 3 odłamki spiżu',
    defeat: 'Ćmy rozlatują się z jego habitu. Pod spodem nie było nikogo.',
  },
  dzwon: {
    id: 'dzwon',
    name: 'Gromnica i Mikołaj',
    title: 'Echo Dzwonu',
    hp: 1700,
    poise: 260,
    zuzel: 0,
    heart: 'Trzecie Serce',
    reward: 'Wybór',
    defeat: 'Spiż milknie. Pierwszy raz od trzystu dni słychać ciszę.',
  },
};

// ------------------------------------------------------------------ story
export interface LoreDef {
  id: string;
  title: string;
  text: string;
  location: LocationId;
}

export const LORE: LoreDef[] = [
  {
    id: 'kronika1',
    location: 'rynek',
    title: 'Kronika I — O Gromnicy',
    text: 'Roku pańskiego, gdy burze trzy lata z rzędu paliły zboże, rada miasta zamówiła u odlewniczki Halszki dzwon, co rozpędzi chmury. Gromnica zadzwoniła raz i burze odeszły. Nikt nie pytał, z czego ją ulano.',
  },
  {
    id: 'kronika2',
    location: 'rynek',
    title: 'Kronika II — Wyrok',
    text: 'Trzech skazańców nie dostało ostatniej spowiedzi. Kat Ignacy odebrał od odlewni trzy worki i nie zajrzał do środka. Od tej pory na egzekucjach biło tylko jedno serce — jego własne.',
  },
  {
    id: 'kronika3',
    location: 'ogrod',
    title: 'Kronika III — Ćmy',
    text: 'Brat Ambroży pisał, że po śmierci dusze Wierchołowa nie odchodzą. Krążą wokół dzwonnicy jak ćmy wokół gromnicy. Zaczął je zbierać do słoików, „żeby nie bolały”.',
  },
  {
    id: 'kronika4',
    location: 'katedra',
    title: 'Kronika IV — Mikołaj',
    text: 'Mąż odlewniczki wspiął się w noc Popielnej Wigilii na wieżę z młotem. Chciał rozbić dzwon, w którym słyszał głosy skazańców. Rozbił tylko jego serce. Spiż przyjął go w zamian.',
  },
  {
    id: 'kronika5',
    location: 'katedra',
    title: 'Kronika V — Spowiedź Halszki',
    text: 'Dzwon trzyma umarłych, żeby żywi mieli spokój. Trzy serca skazanych to za mało, by trzymać całe miasto. Czwartym był głos chłopca, który dzwonił co rano. Odebrałam mu go we śnie. Wybacz mi, dzwonniku.',
  },
];

export const ENDINGS = {
  zadzwon: {
    title: 'Zadzwoń',
    choice: 'Zawieś serca i uderz w Gromnicę.',
    text: [
      'Dźwięk przechodzi przez miasto jak pług przez popiół. Popiół przestaje padać.',
      'Rano Wyrwani wracają do łóżek i budzą się ludźmi. Umarli wracają do dzwonu i milkną.',
      'Ktoś musi dzwonić co rano. Zostajesz na wieży. Nikt nie pyta, z czego jest twój głos.',
    ],
  },
  rozbij: {
    title: 'Rozbij',
    choice: 'Unieś młot jak Mikołaj i skończ to, co zaczął.',
    text: [
      'Spiż pęka z westchnieniem, jakby czekał na to trzysta lat.',
      'Z rysy wylatują ćmy — tysiące ciem — i odchodzą w stronę wschodu.',
      'Wierchołów pustoszeje do południa. Schodzisz z wieży sam, w szary, ale prawdziwy świt.',
    ],
  },
  oddaj: {
    title: 'Oddaj głos',
    choice: 'Przyłóż usta do pękniętego spiżu i oddaj to, co ci odebrano.',
    text: [
      'Znasz już prawdę z kronik. Czwarte serce Gromnicy to twój głos.',
      'Śpiewasz — pierwszy raz od dzieciństwa — a dzwon odpowiada twoim tonem. Nie więzi już umarłych. Odprowadza ich.',
      'Halszka odchodzi ostatnia. Na progu wieży odwraca się i mówi tylko: „Dziękuję”. Rano dzwonisz dalej. Tym razem z wyboru.',
    ],
  },
} as const;
export type EndingId = keyof typeof ENDINGS;

/** Halszka's lines change as the story advances. */
export const HALSZKA_LINES: Record<number, string[]> = {
  0: [
    'Obudziłeś się. Dobrze. Myślałam, że popiół zabrał i ciebie.',
    'Gromnica pękła w Popielną Wigilię. Od tej pory umarli nie odchodzą, a żywi powoli zapominają, kim byli.',
    'Dzwon ma trzy serca. Trzech je zabrało. Przynieś je, a ja odleję Gromnicę na nowo.',
    'Zacznij od Rynku. Kat Ignacy wciąż wykonuje wyroki, choć nikt ich już nie wydaje.',
  ],
  1: ['Serce Wyroku. Ciężkie, prawda? Ignacy nosił je trzysta lat.', 'Brat Ambroży zamknął się w Ogrodzie Mnichów. Zbiera ćmy. Uważaj — on wie, czym one są.'],
  2: ['Dwa serca. Słyszysz, jak biją nie w rytm?', 'Ostatnie jest w samej Gromnicy, w katedrze. I Mikołaj… Jeśli go spotkasz, nie słuchaj go. Proszę.'],
  3: ['Trzy serca. Dzwon czeka.'],
};

export const HALSZKA_REST = [
  'Odpocznij przy palenisku. Popiół, który niesiesz, zamienię w siłę.',
  'Każda Łza Wosku to kropla z gromnicy. Nie marnuj ich.',
  'Jeśli umrzesz, twój popiół zostanie tam, gdzie upadłeś. Wróć po niego, zanim rozwieje go wiatr.',
];

export const MUMROT_LINES = ['Mumrot handluje wszystkim, co spadło z wozu. A wszystko kiedyś spada z wozu.', 'Odłamki spiżu? Mam. Pytania skąd? Nie mam.'];
