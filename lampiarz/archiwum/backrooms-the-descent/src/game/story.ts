// Narrative text: documents, spoken lines, endings and difficulty settings.
import { SYM_GLYPH, type Difficulty } from '../world/map';
import type { Puzzle } from './puzzle';

export interface Doc {
  id: string;
  title: string;
  kind: string;
  text: (p: Puzzle) => string;
}

export const DOCS: Doc[] = [
  {
    id: 'd01',
    title: 'Do tego, kto się obudzi',
    kind: 'Kartka przy materacu',
    text: () =>
      'Jeżeli to czytasz, przeszedłeś przez ścianę tak jak my. Nie panikuj. Nie biegnij, jeśli nie musisz — tu wszystko słyszy.\n\nZasady, które kosztowały nas życie:\n1. Światło jest twoje. Ciemność nie.\n2. Szafki ratują. Stoły — tylko przed Wysokim.\n3. Nie odpowiadaj głosom, które wołają z ciemności.\n\nZbrojownia jest na wschodnim krańcu labiryntu. Zamek ma pięć znaków. Każdy z nas zapamiętał i ukrył jeden, żeby TO nie wyciągnęło całego kodu z jednej głowy. Wskazówki zostawiliśmy tam, gdzie je ukryliśmy. Kolejność znaków jest wybita na drzwiach.\n\n— H.W.',
  },
  {
    id: 'd02',
    title: 'Zegary',
    kind: 'Notatka na stole',
    text: () =>
      `Kiedy weszliśmy, wszystkie zegary w tym pokoju stanęły. Wszystkie oprócz jednego.\n\nTen, który wciąż tyka, pokazuje godzinę, którą zapisałam jako KOŁO ${SYM_GLYPH.circle}. Minuty się nie liczą.\n\nSłuchaj, nie patrz — stojące zegary też mają wskazówki.\n\n— I.R.`,
  },
  {
    id: 'd03',
    title: 'Dziennik Zwiadu 4, dzień 1',
    kind: 'Dziennik',
    text: () =>
      'Weszliśmy windą Instytutu. Dziewięć osób, dwa tygodnie zapasów, rozkaz: znaleźć Kotwicę i ją wyłączyć.\n\nLabirynt jest większy niż na planach z 1987 roku i chyba rośnie, kiedy nie patrzymy. Marek widział w korytarzu kogoś wysokiego. Za wysokiego. Kiedy zawołał, to coś po prostu się odwróciło i odeszło. Bez pośpiechu. Jakby wiedziało, że mamy czas.\n\nZałożyliśmy obóz przy mokrym dywanie. Tu przynajmniej słychać, kiedy ktoś podchodzi.\n\n— H.W.',
  },
  {
    id: 'd04',
    title: 'Dwie stacje',
    kind: 'Kartka przy odbiorniku',
    text: (p) =>
      `Na krótkich falach nadają dwie stacje: ${p.radio.freqA.toFixed(2)} i ${p.radio.freqB.toFixed(2)} MHz.\n\nJedna to nasz automat — powtarza mój znak, TRÓJKĄT ${SYM_GLYPH.triangle}. Druga to TO. Nauczyło się mojego głosu i nadaje inną liczbę.\n\nNasza stacja zawsze zaczyna od szumu i trzech trzasków przekaźnika. TO zaczyna od ciszy. Szumu nie umie podrobić.\n\nOdbiornik potrzebuje prądu z agregatu.\n\n— T.B.`,
  },
  {
    id: 'd05',
    title: 'Rozruch agregatu',
    kind: 'Instrukcja przybita do ściany',
    text: () =>
      'PROCEDURA (wyłącznie w tej kolejności):\n1. POMPA PALIWA\n2. SSANIE\n3. ROZRUSZNIK\n\nInna kolejność zalewa silnik. Huk słychać w całym sektorze — a tu się nie hałasuje.\n\nAgregat zasila: Kompleks Magazynowy, kamery, radiostację, lampę UV i śluzę do Czerwonego Sektora.',
  },
  {
    id: 'd06',
    title: 'Klatka',
    kind: 'Notatka przy konsoli',
    text: () =>
      `Do klatki w hali nie ma wejścia. Nie ma drzwi, nie ma kratki, nie ma szczeliny. Kamera 3 i tak pokazuje w środku krzesło i kogoś na podłodze.\n\nNa ścianie wyrysowałem KWADRAT ${SYM_GLYPH.square}, a pod nim kreski — tyle, ile wynosi mój znak. Nie pytaj, jak tam wszedłem. Nie pamiętam.\n\n— J.L.`,
  },
  {
    id: 'd07',
    title: 'Farba',
    kind: 'Kartka na beczce',
    text: () =>
      `Prawdziwe zapiski robiliśmy farbą UV. Lampa jest pod sufitem, włącznik przy drzwiach — potrzebny prąd z agregatu.\n\nOKO ${SYM_GLYPH.eye} zapisałem kropkami.\n\nWszystko, co widać na tych ścianach w zwykłym świetle, mogło napisać TO. Ono też umie pisać. Pisze ładniej ode mnie.\n\n— P.G.`,
  },
  {
    id: 'd08',
    title: 'Zasada obozu',
    kind: 'Kartka przypięta do listy',
    text: () =>
      `Kto zginął, dostaje na liście czarny krzyżyk. Tylko czarny — czarny marker nosi Hanna i nikomu go nie pożycza.\n\nLiczba czarnych krzyżyków to mój znak, KRZYŻYK ${SYM_GLYPH.cross}.\n\nOstatniej nocy ktoś dopisał krzyżyk czerwonym. Ta osoba żyła — siedziała ze mną przy ogniu. Nie liczcie czerwonych.\n\n— K.Z.`,
  },
  {
    id: 'd09',
    title: 'Taśma 14: Echo',
    kind: 'Transkrypcja nagrania',
    text: () =>
      'To, co nazywamy Echem, nie ma własnego głosu. Pożycza nasze.\n\nWoła po imieniu, stuka w drzwi, chodzi naszym krokiem — tylko trochę nierówno, jakby liczyło do czterech i myliło się na trzecim. Z daleka wygląda jak jedno z nas, w pomarańczowej kurtce. Z bliska nie ma twarzy.\n\nNie rzuca cienia. Latarka w twarz je przegania. Kula też, jeśli masz ich dość.',
  },
  {
    id: 'd10',
    title: 'Rewolwer .38 — instrukcja',
    kind: 'Karta na stole',
    text: () =>
      'Sześć komór. LPM — strzał. PPM — celowanie (mniejszy rozrzut). R — przeładowanie z zapasu. Q — schowanie broni.\n\nUwagi z pola:\n• Pełzacze padają po dwóch, trzech celnych strzałach. Głowa liczy się podwójnie.\n• Echo — po czterech.\n• Wysokiego nie da się zabić. Trzy celne strzały zatrzymują go i przepędzają na jakiś czas.\n• Każdy strzał słychać w całym sektorze.',
  },
  {
    id: 'd11',
    title: 'Zagrożenia',
    kind: 'Tablica w zbrojowni',
    text: () =>
      'WYSOKI — patroluje, słyszy bieg i trzaśnięcia drzwiami. Sprawdza szafki, jeśli widział, jak do nich wchodzisz, a czasem z czystej podejrzliwości. Pod stołem cię nie szuka.\n\nPEŁZACZ — nisko, szybko, krótko. Widzi pod stołami. Szafki są przed nim bezpieczne. Po kilku sekundach pościgu musi odpocząć. Unika jasnych lamp.\n\nECHO — wabi głosem i krokami. Nie podchodź do wołających w ciemności. Boi się latarki.',
  },
  {
    id: 'd12',
    title: 'Winda',
    kind: 'Notatka przy windzie',
    text: () =>
      'Winda towarowa Instytutu zjeżdża tylko na poziom Kotwicy. Karta leży w zbrojowni — dlatego zbrojownia ma kod.\n\nNa dole trzy stabilizatory trzymają drzwi komory zamknięte. Przestaw wszystkie trzy. Potem będziesz miał wybór, którego my nie zdążyliśmy dokonać.\n\nWinda nie wraca na górę.',
  },
  {
    id: 'd13',
    title: 'Kotwica (Instytut, 1987)',
    kind: 'Notatka służbowa',
    text: () =>
      'Instytut Topologii Stosowanej, notatka wewnętrzna.\n\nKotwica utrzymuje zakładkę przestrzeni otwartą. Jej wyłączenie spowoduje zapadnięcie się zakładki wraz ze wszystkim, co się w niej znajduje. Personel ma wtedy niezwłocznie opuścić strefę przez Drzwi Wyjściowe.\n\nUWAGA: Drzwi Wyjściowe otwarte przy pracującej Kotwicy prowadzą GŁĘBIEJ, nie na zewnątrz.',
  },
  {
    id: 'd14',
    title: 'Pokój bez numeru',
    kind: 'List',
    text: () =>
      'Tu Ewa. Zostałam ostatnia.\n\nKotwica nie zabija. Zatrzymuje. Ci, którzy zostali w zakładce, wciąż tu są — tylko nie potrafią wrócić, dopóki ktoś ich nie zawoła. Zostawiliśmy nieśmiertelniki tam, gdzie każde z nas utknęło.\n\nJeśli zbierzesz wszystkie pięć i staniesz przy terminalu Kotwicy, wywołaj nas. Wyjdziemy razem.\n\nNie zgub żadnego.',
  },
  {
    id: 'd15',
    title: 'Pełzacz',
    kind: 'Kartka w schowku',
    text: () =>
      'Siedziałem w szafce trzy godziny. Pełzacz przechodził obok cztery razy. Przez drzwiczki nie widzi. Ale pod stołem znalazł Marka w dwie sekundy.\n\nJeśli słyszysz drapanie w wentylacji, idź tam, gdzie jest jasno. Lamp nie lubi.',
  },
];
export const DOC_BY_ID: Record<string, Doc> = Object.fromEntries(DOCS.map((d) => [d.id, d]));

export type Speaker = 'TY' | 'GŁOS' | 'RADIO' | 'INSTYTUT';
export interface Line {
  who: Speaker;
  text: string;
  t?: number;
}

export const LINES: Record<string, Line[]> = {
  wake: [
    { who: 'TY', text: 'Gdzie ja jestem...? To nie jest mój dom.' },
    { who: 'TY', text: 'Ta lampa buczy, jakby była w mojej głowie.' },
  ],
  armorySeen: [{ who: 'TY', text: 'Zamek na pięć cyfr. Nad klawiaturą pięć symboli, w ustalonej kolejności.' }],
  firstStalker: [{ who: 'TY', text: 'Co to było...? Nikt nie jest tak wysoki.' }],
  genOn: [{ who: 'TY', text: 'Zasilanie wróciło. To słychać w całym kompleksie... i nie tylko ja to usłyszałem.' }],
  genFlooded: [{ who: 'TY', text: 'Zalałem go. Cholera, za głośno.' }],
  armoryOpen: [{ who: 'TY', text: 'Otwarte. Nareszcie coś, czym mogę się bronić.' }],
  liftDown: [
    { who: 'INSTYTUT', text: 'Poziom Kotwicy. Personel proszony jest o zachowanie ciszy.' },
    { who: 'TY', text: 'Nie ma przycisku do góry.' },
  ],
  stabilizer: [{ who: 'INSTYTUT', text: 'Stabilizator przestawiony.' }],
  stabilizersDone: [{ who: 'INSTYTUT', text: 'Wszystkie stabilizatory w pozycji serwisowej. Komora Kotwicy otwarta.' }],
  collapse: [
    { who: 'INSTYTUT', text: 'Kotwica wyłączona. Zakładka niestabilna. Opuścić strefę.' },
    { who: 'TY', text: 'Drzwi! Teraz!' },
  ],
  exitOpen: [{ who: 'INSTYTUT', text: 'Drzwi Wyjściowe otwarte. Kotwica pracuje normalnie.' }],
  callTeam: [{ who: 'GŁOS', text: 'Słyszymy cię. Idziemy. Nie zamykaj drzwi.' }],
  secretFound: [{ who: 'TY', text: 'Za tapetą jest pokój. Ktoś tu mieszkał.' }],
  hurt: [{ who: 'TY', text: 'Krwawię... potrzebuję apteczki.' }],
  enteredDescent: [{ who: 'TY', text: 'Tu jest zimniej. I coś zjechało na dół przede mną.' }],
};

/** Voices the Echo (Mimic) uses to lure the player. */
export const ECHO_CALLS = ['Hej! Tutaj!', 'Pomocy... jestem tutaj...', 'Halo? Słyszysz mnie?', 'Chodź, znalazłam wyjście!', 'Nie zostawiaj mnie...'];

export type EndingId = 'przebudzenie' | 'zejscie' | 'zwiad';
export const ENDINGS: Record<EndingId, { title: string; paragraphs: string[]; secret?: boolean }> = {
  przebudzenie: {
    title: 'Przebudzenie',
    paragraphs: [
      'Kotwica gaśnie z dźwiękiem, którego nie słychać uszami. Ściany składają się za tobą jak kartki.',
      'Przechodzisz przez Drzwi bez klamki i upadasz na coś twardego. Na panele. Na własny przedpokój.',
      'Jest 3:17 w nocy. Lampa w kuchni buczy. Na tapecie, na wysokości twoich oczu, ktoś narysował pięć symboli.',
    ],
  },
  zejscie: {
    title: 'Zejście',
    paragraphs: [
      'Drzwi otwierają się na schody. Prowadzą w dół. Kotwica za twoimi plecami pracuje równo, cierpliwie.',
      'Po trzystu stopniach przestajesz liczyć. Na dole jest korytarz z żółtą tapetą i lampą, która buczy.',
      'Na materacu leży kartka. Rozpoznajesz swoje pismo: „Jeżeli to czytasz, przeszedłeś przez ścianę tak jak my”.',
    ],
  },
  zwiad: {
    title: 'Zwiad 4',
    secret: true,
    paragraphs: [
      'Pięć nieśmiertelników dźwięczy w twojej dłoni, kiedy wpisujesz ich imiona w terminal.',
      'Z ciemności wychodzą ludzie w pomarańczowych kurtkach. Mają twarze. Mają cienie. Hanna kiwa głową, jakby czekała tylko na ciebie.',
      'Kotwica gaśnie, a sześcioro ludzi przechodzi przez Drzwi Wyjściowe razem. Po drugiej stronie pada deszcz. Prawdziwy.',
    ],
  },
};
export const ENDING_ORDER: EndingId[] = ['przebudzenie', 'zejscie', 'zwiad'];

// ------------------------------------------------------------------ difficulty
export interface DiffParams {
  name: string;
  blurb: string;
  enemySpeed: number;
  hearing: number;
  sight: number;
  damage: number;
  reaction: number;
  enemyHp: number;
  /** probability that the Stalker checks a locker it did not see you enter */
  lockerSuspicion: number;
  /** auto-written journal entries: 'full' (+ derived digits), 'obs' (observations only), 'none' */
  journal: 'full' | 'obs' | 'none';
  /** manual saving: 'any' (when safe), 'safe' (only in safe rooms), 'none' */
  manualSave: 'any' | 'safe' | 'none';
  /** wrong code attempts before the keypad locks; 0 = never locks */
  codeTries: number;
  lockSeconds: number;
  regen: boolean;
  batteryDrain: number;
}

export const DIFF: Record<Difficulty, DiffParams> = {
  story: {
    name: 'STORY',
    blurb: 'Historia i zagadki. Wolniejsi przeciwnicy, więcej zasobów, dziennik sam zapisuje wnioski, zapis w każdej bezpiecznej chwili, zdrowie powoli się odnawia.',
    enemySpeed: 0.82,
    hearing: 0.7,
    sight: 0.8,
    damage: 0.55,
    reaction: 0.6,
    enemyHp: 0.75,
    lockerSuspicion: 0.05,
    journal: 'full',
    manualSave: 'any',
    codeTries: 0,
    lockSeconds: 0,
    regen: true,
    batteryDrain: 0.7,
  },
  normal: {
    name: 'NORMAL',
    blurb: 'Zamierzone doświadczenie. Wyważone zasoby, uczciwe zagadki, dziennik zapisuje obserwacje. Zapis ręczny, gdy nic cię nie ściga.',
    enemySpeed: 1,
    hearing: 1,
    sight: 1,
    damage: 1,
    reaction: 1,
    enemyHp: 1,
    lockerSuspicion: 0.18,
    journal: 'obs',
    manualSave: 'any',
    codeTries: 3,
    lockSeconds: 60,
    regen: false,
    batteryDrain: 1,
  },
  nightmare: {
    name: 'NIGHTMARE',
    blurb: 'Przeciwnicy słyszą więcej i reagują szybciej. Mniej zasobów. Ręczny zapis tylko w bezpiecznych pokojach (schowek, zbrojownia, winda).',
    enemySpeed: 1.1,
    hearing: 1.35,
    sight: 1.15,
    damage: 1.3,
    reaction: 1.35,
    enemyHp: 1.25,
    lockerSuspicion: 0.3,
    journal: 'obs',
    manualSave: 'safe',
    codeTries: 3,
    lockSeconds: 90,
    regen: false,
    batteryDrain: 1.25,
  },
  nomercy: {
    name: 'NO MERCY',
    blurb: 'Bez litości: najszybsze AI, najmniej zasobów, dziennik nie pisze niczego za ciebie, brak ręcznego zapisu (tylko automatyczny przy kluczowych postępach), dwie pomyłki blokują zamek.',
    enemySpeed: 1.2,
    hearing: 1.6,
    sight: 1.3,
    damage: 1.6,
    reaction: 1.7,
    enemyHp: 1.4,
    lockerSuspicion: 0.42,
    journal: 'none',
    manualSave: 'none',
    codeTries: 2,
    lockSeconds: 120,
    regen: false,
    batteryDrain: 1.5,
  },
};
