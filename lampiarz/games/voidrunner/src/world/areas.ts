// The five sectors of the complex: names, palettes, enemy pools and story fragments.

export type EnemyType = 'drone' | 'hunter' | 'turret' | 'stalker' | 'void' | 'shield';
export type BossType = 'matka' | 'straznik' | 'serce';

export interface Palette {
  sky: [string, string]; // background gradient (top, bottom)
  far: string; // distant silhouettes
  mid: string;
  wall: string; // tile base
  wallHi: string;
  wallLo: string;
  trim: string;
  accent: string; // neon / energy colour
  accent2: string;
  hazard: string;
  fog: string;
  ambient: number; // 0..1 how bright the darkness layer is
}

export interface AreaDef {
  id: number;
  name: string;
  subtitle: string;
  hazardName: string;
  ground: EnemyType[];
  air: EnemyType[];
  elite: EnemyType[];
  eliteChance: number;
  boss: BossType | null;
  palette: Palette;
  intro: string; // ARIA speaks when you enter the sector
  terminals: string[];
}

export const AREAS: AreaDef[] = [
  {
    id: 0,
    name: 'Opuszczony Kompleks',
    subtitle: 'Sektor A — poziom techniczny',
    hazardName: 'Kolce zabezpieczeń',
    ground: ['hunter'],
    air: ['drone'],
    elite: ['hunter'],
    eliteChance: 0,
    boss: null,
    palette: {
      sky: ['#05060d', '#0c1020'],
      far: '#0e1426',
      mid: '#141b30',
      wall: '#1d2233',
      wallHi: '#2c3450',
      wallLo: '#10131f',
      trim: '#3a4566',
      accent: '#3ee6ff',
      accent2: '#8a5cff',
      hazard: '#c8d2e6',
      fog: '#1a2440',
      ambient: 0.58,
    },
    intro: 'Rdzeń odzyskał przytomność. Mówi ARIA — system awaryjny kompleksu. Twoje ciało złożono z części. Musisz zejść niżej.',
    terminals: [
      'DZIENNIK 2197-03-11: Pierwsza próbka Pustki ustabilizowana. Dyrektor Wren zakazał wpisywania jej do raportów dla Rady.',
      'KOMUNIKAT OCHRONY: Drony serwisowe zignorowały polecenie powrotu do doków. Proszę nie zbliżać się do ich czujników.',
      'NOTATKA: Jeśli to czytasz, nie ufaj windom. Schodzą tylko w dół.',
    ],
  },
  {
    id: 1,
    name: 'Strefa Biologiczna',
    subtitle: 'Sektor B — laboratoria hodowlane',
    hazardName: 'Kwas',
    ground: ['hunter', 'stalker'],
    air: ['drone'],
    elite: ['stalker'],
    eliteChance: 0.08,
    boss: 'matka',
    palette: {
      sky: ['#04090a', '#0b1a17'],
      far: '#0b1f1c',
      mid: '#10292a',
      wall: '#152427',
      wallHi: '#22393b',
      wallLo: '#0b1416',
      trim: '#2d4f4a',
      accent: '#5dff9b',
      accent2: '#d23a6a',
      hazard: '#7dff4a',
      fog: '#123326',
      ambient: 0.55,
    },
    intro: 'Strefa Biologiczna. Coś tu rośnie na ścianach i oddycha. Kwas w zbiornikach przeżera pancerz — nie wchodź do niego.',
    terminals: [
      'DZIENNIK DR SALI: Tkanka reaguje na Pustkę jak na słońce. Rośnie w jej stronę. Rośnie w stronę nas.',
      'ALARM BIO-3: Matka Roju opuściła komorę inkubacyjną. Zamknąć grodzie. Nikt nie wychodzi.',
      'Ostatni wpis: zostawiłam apteczkę przy wyjściu. Komuś się przyda.',
    ],
  },
  {
    id: 2,
    name: 'Podziemne Miasto',
    subtitle: 'Sektor C — osiedle personelu',
    hazardName: 'Odsłonięte kable',
    ground: ['stalker', 'hunter', 'shield'],
    air: ['drone'],
    elite: ['stalker', 'hunter', 'shield'],
    eliteChance: 0.12,
    boss: null,
    palette: {
      sky: ['#07060f', '#160f24'],
      far: '#160f26',
      mid: '#1f1633',
      wall: '#221d2d',
      wallHi: '#352d45',
      wallLo: '#130f1a',
      trim: '#4a3b5e',
      accent: '#ff3d6e',
      accent2: '#3ee6ff',
      hazard: '#ffd23e',
      fog: '#2a1838',
      ambient: 0.6,
    },
    intro: 'Podziemne Miasto. Tu mieszkali ludzie, którzy budowali kompleks. Szyldy wciąż świecą. Nikt już ich nie czyta.',
    terminals: [
      'OGŁOSZENIE: Ewakuacja sektora C odwołana decyzją Dyrekcji. Prosimy pozostać w mieszkaniach.',
      'PAMIĘTNIK: Mama mówi, że dźwięk spod podłogi to tylko pompy. Pompy nie mówią po imieniu.',
      'ARIA, pamięć zablokowana: Projekt RUNNER — „nosiciel odporny na Pustkę”. Plik uszkodzony.',
    ],
  },
  {
    id: 3,
    name: 'Rdzeń Energii',
    subtitle: 'Sektor D — reaktor Pustki',
    hazardName: 'Wyładowania',
    ground: ['stalker', 'hunter', 'shield'],
    air: ['void', 'drone'],
    elite: ['void', 'stalker'],
    eliteChance: 0.18,
    boss: 'straznik',
    palette: {
      sky: ['#04070f', '#081428'],
      far: '#0a1a33',
      mid: '#0f2244',
      wall: '#141c2e',
      wallHi: '#22304d',
      wallLo: '#0a0f1a',
      trim: '#2c4a7a',
      accent: '#3ee6ff',
      accent2: '#ff4a5a',
      hazard: '#8ef6ff',
      fog: '#0f2a4a',
      ambient: 0.6,
    },
    intro: 'Rdzeń Energii. Lasery bezpieczeństwa wciąż działają — czerwona linia oznacza, że za chwilę wystrzelą.',
    terminals: [
      'PROTOKÓŁ: Strażnik Rdzenia ma bronić reaktora przed wszystkimi. Także przed nami. Zwłaszcza przed nami.',
      'Wren do zespołu: Otwieramy Szczelinę o 03:00. To nie eksperyment. To drzwi.',
      'ARIA: Odzyskałam fragment. Projekt RUNNER to ty. Byłeś pierwszym, który wrócił z Pustki.',
    ],
  },
  {
    id: 4,
    name: 'Szczelina Pustki',
    subtitle: 'Poza mapą kompleksu',
    hazardName: 'Pustka',
    ground: ['stalker', 'hunter', 'shield'],
    air: ['void'],
    elite: ['void', 'stalker', 'hunter'],
    eliteChance: 0.25,
    boss: 'serce',
    palette: {
      sky: ['#05020a', '#16051f'],
      far: '#1c0726',
      mid: '#2a0b35',
      wall: '#1a1022',
      wallHi: '#2e1d3d',
      wallLo: '#0d0812',
      trim: '#5a2a78',
      accent: '#c45cff',
      accent2: '#3ee6ff',
      hazard: '#e04aff',
      fog: '#3a0f4a',
      ambient: 0.56,
    },
    intro: 'Szczelina. Tu fizyka jest tylko sugestią. Serce Pustki jest blisko — czuję je w twoich obwodach.',
    terminals: [
      'Głos bez źródła: wróciłeś, RUNNER. Zawsze wracasz.',
      'ARIA: Jeśli zniszczysz Serce, Szczelina się zamknie. Razem z tym, co jest po tej stronie.',
      'Wyryte w ścianie: WREN BYŁ TU. WREN ZOSTAŁ.',
    ],
  },
];

export const BOSS_INFO: Record<BossType, { name: string; title: string; intro: string; outro: string }> = {
  matka: {
    name: 'Matka Roju',
    title: 'Strażniczka Strefy Biologicznej',
    intro: 'ARIA: To ona wyhodowała wszystko w tym sektorze. Uważaj na kwas i jej skok — widać, kiedy się przyczaja.',
    outro: 'Rój cichnie. ARIA: Grodzie do Miasta otwarte.',
  },
  straznik: {
    name: 'Strażnik Rdzenia',
    title: 'Ostatnia linia obrony reaktora',
    intro: 'ARIA: Strażnik celuje laserem tam, gdzie stoisz. Ruszaj się, gdy widzisz czerwoną linię.',
    outro: 'Strażnik gaśnie. Za nim — Szczelina.',
  },
  serce: {
    name: 'Serce Pustki',
    title: 'Źródło skażenia',
    intro: 'ARIA: To jest to. Wszystko, czego się nauczyłeś, przyda się teraz.',
    outro: 'Szczelina zapada się w sobie. ARIA: Udało się, RUNNER. Wracamy na powierzchnię.',
  },
};
