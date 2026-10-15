// Central game catalog. Adding a game = drop its build into games/<slug>/,
// add one entry to GAMES below, and put its images in public/img/games/<slug>/.

export type CategoryId = 'akcja' | 'strategia' | 'przygodowe' | 'horror' | 'symulacje' | 'puzzle' | 'roguelite' | 'imprezowe';

export interface Category {
  id: CategoryId;
  name: string;
  blurb: string;
}

/** Categories offered by the platform. Counts are always computed from GAMES. */
export const CATEGORIES: Category[] = [
  { id: 'roguelite', name: 'Roguelite', blurb: 'Każda rozgrywka inna, porażka uczy na następną.' },
  { id: 'strategia', name: 'Strategia', blurb: 'Planowanie, zasoby i decyzje z konsekwencjami.' },
  { id: 'akcja', name: 'Akcja', blurb: 'Refleks i tempo.' },
  { id: 'przygodowe', name: 'Przygodowe', blurb: 'Eksploracja i historia.' },
  { id: 'horror', name: 'Horror', blurb: 'Napięcie, ciemność i rzeczy, których lepiej nie oglądać z bliska.' },
  { id: 'symulacje', name: 'Symulacje', blurb: 'Systemy, które żyją własnym życiem.' },
  { id: 'puzzle', name: 'Puzzle', blurb: 'Łamigłówki i logika.' },
  { id: 'imprezowe', name: 'Imprezowe', blurb: 'Dla dwóch osób przy jednym komputerze.' },
];

export type GameStatus = 'published' | 'coming-soon' | 'hidden';

export interface Control {
  keys: string[];
  action: string;
}

export interface Game {
  id: string;
  slug: string;
  title: string;
  /** One line used on cards and in the hero. */
  tagline: string;
  /** Short description (cards, meta description). */
  description: string;
  /** Long description for the game page. */
  about?: string[];
  category: CategoryId;
  /** Additional categories the game also fits. */
  categories?: CategoryId[];
  tags?: string[];
  thumbnail: string;
  cover: string;
  screenshots?: { src: string; alt: string }[];
  /** Entry point of the built game (same origin). */
  entry: string;
  featured?: boolean;
  status: GameStatus;
  /** ISO date when the game appeared on EVGAMES. */
  addedAt: string;
  controls?: Control[];
  /** Facts that are verifiable from the game itself. */
  facts?: { label: string; value: string }[];
  mode?: string;
  mobile?: boolean;
  /** What playing on a phone looks like (shown when `mobile` is true). */
  mobileNote?: string;
  /** Content for adults only (18+): shown as a badge on cards and the game page. */
  adult?: boolean;
  fullscreen?: boolean;
  /** Accent used on this game's surfaces (taken from the game's own palette). */
  accent?: string;
  /** localStorage keys the game uses, shown on the privacy page. */
  storageKeys?: string[];
}

export const GAMES: Game[] = [
  {
    id: 'lampiarz',
    slug: 'lampiarz',
    title: 'Lampiarz',
    tagline: 'Zapal miasto, zanim pochłonie je noc.',
    description:
      'Taktyczny roguelite o świetle i mroku. Zapalaj latarnie, gospodaruj olejem i przeprowadź płomień przez pięć nocnych dzielnic aż do latarni morskiej.',
    about: [
      'Jesteś ostatnim lampiarzem miasta. Każde zapalone światło tworzy schronienie, w które cienie nie mogą wejść, ale każda kropla oleju wydana na latarnię to olej, którego zabraknie na drogę.',
      'Rozgrywka jest turowa i przemyślana: wrogowie pokazują swoje zamiary, ściany rzucają cień, a mrok gęstnieje z każdą turą. W warsztacie między dzielnicami wymieniasz żar na relikty, które zmieniają zasady gry.',
      'Każda noc to nowe, losowo generowane miasto. Wybierasz drogę przez dzielnice o różnym charakterze, odblokowujesz postacie i kolejne, trudniejsze noce.',
      'Nowy w grze? Interaktywny samouczek w 10 krokach uczy ruchu, światła, oleju, zniczy, gasiciela i umiejętności, a w trakcie nocy ramka „Cel” i strzałki na brzegu ekranu zawsze pokazują, co robić dalej.',
      'Wersja 2: proste sterowanie (tylko ruch, Rozbłysk, latarnia i czekanie), beczki z olejem jako pułapki na cienie, pogoda (deszcz, mgła, pełnia), mini-boss Kominiarz Cieni, tryb „Do świtu” bez końca i Księga mistrza z trwałymi ulepszeniami za popiół.',
    ],
    category: 'roguelite',
    categories: ['strategia'],
    tags: ['Turowa', 'Taktyczna', 'Proceduralne mapy', 'Samouczek', 'Single-player', 'Zapis lokalny'],
    thumbnail: '/img/games/lampiarz/thumb.webp',
    cover: '/img/games/lampiarz/cover.webp',
    screenshots: [
      { src: '/img/games/lampiarz/shot-play.webp', alt: 'Lampiarz: oświetlona ulica, latarnie i cienie podchodzące do gracza' },
      { src: '/img/games/lampiarz/shot-boss.webp', alt: 'Lampiarz: Cypel Latarni i zapowiedź zaćmienia Matki Mroku' },
      { src: '/img/games/lampiarz/shot-workshop.webp', alt: 'Lampiarz: warsztat z reliktami do kupienia za żar' },
      { src: '/img/games/lampiarz/shot-menu.webp', alt: 'Lampiarz: menu główne z panoramą nocnego miasta' },
    ],
    entry: '/g/lampiarz/index.html',
    featured: true,
    status: 'published',
    addedAt: '2026-10-09',
    mode: 'Jeden gracz · turowa',
    mobile: true,
    fullscreen: true,
    accent: '#f0a848',
    controls: [
      { keys: ['W', 'A', 'S', 'D'], action: 'Ruch, atak i zapalanie latarni' },
      { keys: ['Q'], action: 'Zdolność postaci' },
      { keys: ['F'], action: 'Zapal lub zgaś sąsiednią latarnię' },
      { keys: ['Spacja'], action: 'Czekaj turę' },
      { keys: ['Esc'], action: 'Pauza' },
      { keys: ['M'], action: 'Wycisz dźwięk' },
    ],
    facts: [
      { label: 'Tryb', value: 'Jeden gracz, turowa' },
      { label: 'Dzielnice', value: '5 + finał na cyplu' },
      { label: 'Postacie', value: '3 (2 do odblokowania)' },
      { label: 'Relikty', value: '19' },
      { label: 'Poziomy trudności', value: '5 nocy' },
      { label: 'Osiągnięcia', value: '21' },
      { label: 'Samouczek', value: 'Interaktywny, 10 kroków' },
      { label: 'Tryby', value: 'Noc (5 dzielnic + Cypel), Do świtu (bez końca), Noc dnia' },
      { label: 'Sterowanie', value: 'Klawiatura, mysz, dotyk' },
      { label: 'Zapis', value: 'Automatyczny, w przeglądarce' },
    ],
    storageKeys: ['lampiarz.profile.v1', 'lampiarz.run.v1'],
  },
  {
    id: 'random-chaos',
    slug: 'random-chaos',
    title: 'RANDOM CHAOS',
    tagline: 'Dwóch graczy, jedna klawiatura, osiem minigier i zero litości.',
    description:
      'Imprezowa gra dla 2 osób na jednej klawiaturze. Turniej losowych minigier: od walącej się podłogi i rosnącej lawy po wyścig przez fabrykę pułapek, z modyfikatorami chaosu, które zmieniają zasady w trakcie meczu.',
    about: [
      'Bąbel i Pieprz siadają przy jednej klawiaturze: jeden na W A S D, drugi na strzałkach. Każda runda to losowa minigra z własną areną, zasadami i warunkiem zwycięstwa — kto pierwszy zdobędzie ustaloną liczbę punktów, wygrywa turniej.',
      'Osiem minigier: Last One Standing (pękające płytki), Lava Rush (wspinaczka przed lawą), Knockout (wypychanie z areny), Chaos Race (wyścig przez pułapki), Coin Panic (zbieranie monet), Floor is Lava (stań na wywołanym kolorze), Dodge or Die (lasery, kowadła i głazy) oraz King of the Platform (utrzymaj koronę).',
      'Dwanaście modyfikatorów chaosu — niska grawitacja, śliska podłoga, olbrzymy, odwrócone sterowanie, podmuchy wiatru i inne — zapowiadanych przed rundą i zawsze działających tak samo na obu graczy. W ustawieniach turnieju wybierzesz liczbę punktów, długość rund, minigry w puli i dozwolone modyfikatory.',
    ],
    category: 'imprezowe',
    categories: ['akcja'],
    tags: ['2 graczy', 'Jedna klawiatura', 'Party game', 'Minigry', 'Platformówka', 'Turniej', 'Zapis lokalny'],
    thumbnail: '/img/games/random-chaos/thumb.webp',
    cover: '/img/games/random-chaos/cover.webp',
    screenshots: [
      { src: '/img/games/random-chaos/shot-lava.webp', alt: 'RANDOM CHAOS — Lava Rush: wspinaczka przed rosnącą lawą' },
      { src: '/img/games/random-chaos/shot-coins.webp', alt: 'RANDOM CHAOS — Coin Panic: wyścig po monety' },
      { src: '/img/games/random-chaos/shot-race.webp', alt: 'RANDOM CHAOS — Chaos Race: fabryka pułapek' },
      { src: '/img/games/random-chaos/shot-colors.webp', alt: 'RANDOM CHAOS — Floor is Lava: platformy w kolorach' },
      { src: '/img/games/random-chaos/shot-dodge.webp', alt: 'RANDOM CHAOS — Dodge or Die: unikanie głazów' },
      { src: '/img/games/random-chaos/shot-intro.webp', alt: 'RANDOM CHAOS — karta minigry z modyfikatorem chaosu' },
      { src: '/img/games/random-chaos/shot-menu.webp', alt: 'RANDOM CHAOS — menu główne' },
    ],
    entry: '/g/random-chaos/index.html',
    status: 'published',
    addedAt: '2026-10-12',
    mode: 'Dwóch graczy · jedna klawiatura',
    mobile: false,
    fullscreen: true,
    accent: '#ffd23f',
    controls: [
      { keys: ['A', 'D'], action: 'Gracz 1: ruch' },
      { keys: ['W'], action: 'Gracz 1: skok (przytrzymaj = wyżej)' },
      { keys: ['S'], action: 'Gracz 1: akcja (pchnięcie / wbicie w ziemię)' },
      { keys: ['←', '→'], action: 'Gracz 2: ruch' },
      { keys: ['↑'], action: 'Gracz 2: skok (przytrzymaj = wyżej)' },
      { keys: ['↓'], action: 'Gracz 2: akcja (pchnięcie / wbicie w ziemię)' },
      { keys: ['I', 'J', 'K', 'L'], action: 'Gracz 2 — alternatywnie (gdy klawiatura gubi klawisze); też klawiatura numeryczna 8 4 5 6' },
      { keys: ['Pad'], action: 'Pad 1 → gracz 1, pad 2 → gracz 2 (A skok, B/X akcja, Start pauza)' },
      { keys: ['Esc'], action: 'Pauza' },
      { keys: ['R'], action: 'W menu pauzy: restart rundy (wynik meczu bez zmian)' },
      { keys: ['Enter'], action: 'Dalej / zatwierdź' },
    ],
    facts: [
      { label: 'Gracze', value: '2 na jednej klawiaturze' },
      { label: 'Minigry', value: '8, każda z własną areną i zasadami' },
      { label: 'Modyfikatory chaosu', value: '12, do włączania i wyłączania' },
      { label: 'Turniej', value: 'Do 3, 5, 7 lub 10 punktów' },
      { label: 'Długość rundy', value: 'Ok. 20–60 s' },
      { label: 'Wymagania', value: 'Klawiatura (jedna, wspólna) lub pady' },
      { label: 'Zapis', value: 'Ustawienia i statystyki w przeglądarce' },
    ],
    storageKeys: ['randomchaos.settings.v1', 'randomchaos.stats.v1'],
  },
  {
    id: 'skrzynkomat',
    slug: 'skrzynkomat',
    title: 'Skrzynkomat',
    tagline: 'Otwórz skrzynkę, zatrzymaj ruletkę, trafi się legenda?',
    description:
      'Symulator otwierania skrzynek za wirtualne złotówki: dwanaście skrzynek, pięć poziomów rzadkości, bitwy skrzynek, upgrader z szansą, kontrakty 10 za 1 i ranking. Bez prawdziwych pieniędzy i realnych nagród.',
    about: [
      'Zaczynasz z 200 zł wirtualnego salda. Wybierasz jedną z dwunastu skrzynek — od Podwórkowej za 4 zł po Złotą Gorączkę za 120 zł — i patrzysz, jak ruletka zwalnia przy wylosowanym przedmiocie. Każda skrzynka ma 15 przedmiotów w pięciu poziomach rzadkości, a szanse widać w podglądzie zawartości: od Zwykłego (79,92%) po Legendarny (0,26%).',
      'W bitwie ty i rywal otwieracie te same skrzynki przez 1, 3 albo 5 rund — wyższa suma wartości zabiera wszystkie przedmioty. Na EVGAMES rywalami są boty, oznaczone etykietą BOT. Łupy możesz też zachować, sprzedać, zaryzykować w upgraderze albo wymienić w kontrakcie: 10 przedmiotów jednego poziomu na jeden z poziomu wyżej.',
      'Każda skórka ma zużycie — od „Prosto z fabryki” po „Zniszczone” — widoczne na rysunku jako rysy i ubytki lakieru. Za otwieranie, zamiany i bitwy zdobywasz poziomy, a topka porównuje twój wynik netto, wygrane bitwy i najlepszy łup z botami. Wszystkie nazwy i przedmioty są wymyślone, a waluta nie ma żadnej wartości poza grą.',
    ],
    category: 'symulacje',
    tags: ['Symulator', 'Skrzynki', 'Bitwy', 'Wirtualna waluta', 'Kolekcjonowanie', 'Single-player', 'Zapis lokalny'],
    thumbnail: '/img/games/skrzynkomat/thumb.webp',
    cover: '/img/games/skrzynkomat/cover.webp',
    screenshots: [
      { src: '/img/games/skrzynkomat/shot-legendary.webp', alt: 'Skrzynkomat — wylosowany legendarny nóż ze Skrzynki Kosmicznej' },
      { src: '/img/games/skrzynkomat/shot-cases.webp', alt: 'Skrzynkomat — wybór skrzynki' },
      { src: '/img/games/skrzynkomat/shot-battle.webp', alt: 'Skrzynkomat — bitwa skrzynek z botem' },
      { src: '/img/games/skrzynkomat/shot-roll.webp', alt: 'Skrzynkomat — ruletka w trakcie losowania' },
      { src: '/img/games/skrzynkomat/shot-upgrader.webp', alt: 'Skrzynkomat — upgrader: zamiana przedmiotów z podaną szansą' },
      { src: '/img/games/skrzynkomat/shot-inventory.webp', alt: 'Skrzynkomat — ekwipunek z cenami i zużyciem skórek' },
      { src: '/img/games/skrzynkomat/shot-top.webp', alt: 'Skrzynkomat — topka graczy' },
      { src: '/img/games/skrzynkomat/shot-menu.webp', alt: 'Skrzynkomat — menu główne' },
    ],
    entry: '/g/skrzynkomat/index.html',
    status: 'published',
    addedAt: '2026-10-12',
    mode: 'Jeden gracz · symulator',
    mobile: true,
    mobileNote: 'Na telefonie: wszystko obsłużysz dotykiem.',
    fullscreen: true,
    accent: '#e04fd0',
    controls: [
      { keys: ['Mysz'], action: 'Wybór skrzynek, przedmiotów i przycisków' },
      { keys: ['Esc'], action: 'Pomiń animację, zamknij okno' },
      { keys: ['↑', '↓'], action: 'Poruszanie się po menu głównym' },
      { keys: ['Enter'], action: 'Zaznaczenie przedmiotu w zamianie' },
    ],
    facts: [
      { label: 'Skrzynki', value: '12, od 4 zł do 120 zł wirtualnego salda' },
      { label: 'Przedmioty', value: '15 w każdej skrzynce, 5 poziomów rzadkości' },
      { label: 'Szansa na Legendarny', value: '0,26%' },
      { label: 'Tryby', value: 'Otwieranie, bitwy z botami (1, 3 lub 5 rund), upgrader, kontrakty' },
      { label: 'Waluta', value: 'Wirtualna, bez prawdziwych pieniędzy' },
      { label: 'Zapis', value: 'Saldo, ekwipunek, poziom i statystyki w przeglądarce' },
    ],
    storageKeys: ['skrzynkomat.v1', 'skrzynkomat.prefs'],
  },
  {
    id: 'echobound',
    slug: 'echobound',
    title: 'ECHOBOUND',
    tagline: 'Nagraj swoje ruchy. Przywołaj echo. Rozwiąż podziemia.',
    description:
      'Pixelartowa platformówka 2D z echami czasu: nagrywasz kilka sekund własnych ruchów, a echo powtarza je za ciebie — trzyma płyty, ciągnie dźwignie i wabi przeciwników. Jedenaście obszarów podziemi w dwóch aktach.',
    about: [
      'Budzisz się w Zapomnianej Jaskini z mocą, która nie powinna istnieć: potrafisz nagrać własne ruchy i przywołać echo, które powtórzy je co do kroku. Echo stanie na płycie naciskowej, gdy ty biegniesz do drzwi, pociągnie dźwignię po drugiej stronie przepaści albo zwabi Pożeracza Ech, żebyś mógł się prześlizgnąć.',
      'Podziemia mają jedenaście obszarów w dwóch aktach — od Kryształowych Ruin, Zatopionego Archiwum i Ogrodów Rezonansu, przez Kuźnię Widm i Pękniętą Wieżę, po Serce Podziemi, Głębię Zapomnienia, Mokradła Czasu, Twierdzę Ciszy i Rozpadlinę. Kolejne obszary dokładają nowe mechaniki: pryzmaty odbijające echa, zasłony, grzyby sprężyste, prądy zarodników, windy sterowane echem, kolczaste bloki, klucze i zamki, szczeliny-portale.',
      'Za kryształy kupujesz ulepszenia przy ołtarzach. W Zatopionym Archiwum możesz uwolnić drugą postać — Szept, Tkaczkę Cieni, która zamiast ech zostawia Kotwicę Cienia, robi zryw i wspina się po ścianach. Postęp zapisuje się sam w punktach kontrolnych.',
    ],
    category: 'przygodowe',
    categories: ['puzzle', 'akcja'],
    tags: ['Platformówka', 'Pixel art', 'Zagadki', 'Echa czasu', 'Single-player'],
    thumbnail: '/img/games/echobound/thumb.webp',
    cover: '/img/games/echobound/cover.webp',
    screenshots: [
      { src: '/img/games/echobound/shot-cave.webp', alt: 'ECHOBOUND — Zapomniana Jaskinia, pierwszy obszar' },
      { src: '/img/games/echobound/shot-forge.webp', alt: 'ECHOBOUND — Kuźnia Widm' },
      { src: '/img/games/echobound/shot-spire.webp', alt: 'ECHOBOUND — Pęknięta Wieża' },
      { src: '/img/games/echobound/shot-heart.webp', alt: 'ECHOBOUND — Serce Podziemi' },
      { src: '/img/games/echobound/shot-menu.webp', alt: 'ECHOBOUND — menu główne' },
    ],
    entry: '/g/echobound/index.html',
    status: 'published',
    addedAt: '2026-10-15',
    mode: 'Jeden gracz · platformówka 2D',
    mobile: true,
    mobileNote: 'Na telefonie pojawiają się przyciski ekranowe do ruchu, skoku, ech i interakcji.',
    fullscreen: true,
    accent: '#6ff3ff',
    controls: [
      { keys: ['A', 'D'], action: 'Ruch (albo strzałki)' },
      { keys: ['Spacja'], action: 'Skok — przytrzymaj, by skoczyć wyżej (też W / ↑)' },
      { keys: ['S', 'Spacja'], action: 'Zeskok z półki' },
      { keys: ['Q'], action: 'Nagraj / przywołaj echo' },
      { keys: ['E'], action: 'Interakcja: dźwignie, ołtarz ulepszeń' },
      { keys: ['R'], action: 'Rozprosz echa / przerwij nagrywanie' },
      { keys: ['F'], action: 'Pamięć echa (po ulepszeniu)' },
      { keys: ['Shift'], action: 'Zryw — tylko Szept (też X / K)' },
      { keys: ['C'], action: 'Zmiana postaci' },
      { keys: ['Esc'], action: 'Pauza' },
    ],
    facts: [
      { label: 'Obszary', value: '11, w dwóch aktach' },
      { label: 'Postacie', value: '2: Wędrowiec i Szept, Tkaczka Cieni (do uwolnienia)' },
      { label: 'Ulepszenia', value: '7 rodzajów, za kryształy przy ołtarzach' },
      { label: 'Przeciwnicy', value: '5: Cień, Strażnik Ruin, Pożeracz Ech, Widmo, Żarłacz' },
      { label: 'Sterowanie', value: 'Klawiatura albo ekran dotykowy' },
      { label: 'Zapis', value: 'Automatyczny w punktach kontrolnych, w przeglądarce' },
    ],
    storageKeys: ['echobound.save.v1', 'echobound.settings.v1'],
  },
];

// ------------------------------------------------------------------ queries
export const publishedGames = () => GAMES.filter((g) => g.status === 'published');
export const findGame = (slug: string) => GAMES.find((g) => g.slug === slug && g.status !== 'hidden');
export const featuredGame = () => publishedGames().find((g) => g.featured) ?? publishedGames()[0];
export const gameCategories = (g: Game): CategoryId[] => [g.category, ...(g.categories ?? [])];
export const categoryName = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)?.name ?? id;

export function categoryCounts(): Record<CategoryId, number> {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0])) as Record<CategoryId, number>;
  for (const g of publishedGames()) for (const c of gameCategories(g)) out[c]++;
  return out;
}

export type SortKey = 'newest' | 'title';

/** Normalise for search: lower-case, strip Polish diacritics. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');
}

export function searchGames(opts: { q?: string; category?: CategoryId | null; sort?: SortKey }): Game[] {
  const q = norm(opts.q?.trim() ?? '');
  let list = publishedGames().filter((g) => {
    if (opts.category && !gameCategories(g).includes(opts.category)) return false;
    if (!q) return true;
    const hay = norm([g.title, g.tagline, g.description, ...(g.tags ?? []), ...gameCategories(g).map(categoryName)].join(' '));
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
  if (opts.sort === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'pl'));
  else list = [...list].sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.title.localeCompare(b.title, 'pl'));
  return list;
}

/** Sorting UI only makes sense once the library has a few titles. */
export const SORT_THRESHOLD = 3;
