// Central game catalog. Adding a game = drop its build into games/<slug>/,
// add one entry to GAMES below, and put its images in public/img/games/<slug>/.

export type CategoryId = 'akcja' | 'strategia' | 'przygodowe' | 'symulacje' | 'puzzle' | 'roguelite';

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
  { id: 'symulacje', name: 'Symulacje', blurb: 'Systemy, które żyją własnym życiem.' },
  { id: 'puzzle', name: 'Puzzle', blurb: 'Łamigłówki i logika.' },
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
    ],
    category: 'roguelite',
    categories: ['strategia'],
    tags: ['Turowa', 'Taktyczna', 'Proceduralne mapy', 'Single-player', 'Zapis lokalny'],
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
      { label: 'Osiągnięcia', value: '17' },
      { label: 'Sterowanie', value: 'Klawiatura, mysz, dotyk' },
      { label: 'Zapis', value: 'Automatyczny, w przeglądarce' },
    ],
    storageKeys: ['lampiarz.profile.v1', 'lampiarz.run.v1'],
  },
  {
    id: 'popielny-dzwon',
    slug: 'popielny-dzwon',
    title: 'Popielny Dzwon',
    tagline: 'Odzyskaj trzy serca pękniętego dzwonu.',
    description:
      'Mroczne fantasy RPG akcji z elementami roguelite. Paruj, rób uniki i ucz się ruchów trzech bossów w spalonym mieście, nad którym od trzystu dni pada popiół.',
    about: [
      'Jesteś dzwonnikiem, któremu odebrano głos. Gromnica — dzwon, który miał chronić Wierchołów przed burzami — pękła w Popielną Wigilię i od tamtej nocy umarli nie odchodzą. Trzy serca dzwonu zabrali kat, mnich i sam odlewnik.',
      'Walka toczy się w czasie rzeczywistym: lekkie serie, ładowane ciężkie ciosy, przewroty z klatkami nietykalności, blok i parowanie z ripostą za potrójne obrażenia. Każdy cios wroga zapowiada błysk — biały można sparować, czerwonego trzeba uniknąć.',
      'Wyprawy prowadzą przez losowo składane ulice Rynku, deszczowy Ogród Kamiennych Mnichów i Katedrę Pękniętego Dzwonu. Kapliczki zapisują postęp, śmierć zostawia twój popiół w świecie, a w Krypcie Odlewników rozwijasz postać, kujesz broń i wybierasz relikty, z których każdy coś daje i coś odbiera. Trzy zakończenia, w tym jedno ukryte.',
    ],
    category: 'akcja',
    categories: ['przygodowe', 'roguelite'],
    tags: ['Dark fantasy', 'Soulslike', 'Bossowie', 'Parowanie i uniki', 'Single-player', 'Zapis lokalny'],
    thumbnail: '/img/games/popielny-dzwon/thumb.webp',
    cover: '/img/games/popielny-dzwon/cover.webp',
    screenshots: [
      { src: '/img/games/popielny-dzwon/shot-kat.webp', alt: 'Popielny Dzwon: Kat z Rynku zamierza się toporem — biały błysk zapowiada cios do sparowania' },
      { src: '/img/games/popielny-dzwon/shot-pasterz.webp', alt: 'Popielny Dzwon: Pasterz Ciem unosi latarnię pełną ciem w deszczowym ogrodzie' },
      { src: '/img/games/popielny-dzwon/shot-dzwon.webp', alt: 'Popielny Dzwon: Gromnica w katedrze szykuje falę dźwięku — czerwony błysk ostrzega przed ciosem nie do zablokowania' },
      { src: '/img/games/popielny-dzwon/shot-halszka.webp', alt: 'Popielny Dzwon: rozmowa z Halszką w Krypcie Odlewników' },
      { src: '/img/games/popielny-dzwon/shot-menu.webp', alt: 'Popielny Dzwon: menu główne z pękniętym dzwonem nad miastem' },
    ],
    entry: '/g/popielny-dzwon/index.html',
    status: 'published',
    addedAt: '2026-10-09',
    mode: 'Jeden gracz · akcja w czasie rzeczywistym',
    mobile: false,
    fullscreen: true,
    accent: '#d9a25a',
    controls: [
      { keys: ['A', 'D'], action: 'Ruch' },
      { keys: ['Spacja'], action: 'Skok' },
      { keys: ['LPM', 'J'], action: 'Lekki atak (seria)' },
      { keys: ['PPM', 'K'], action: 'Ciężki atak (przytrzymaj)' },
      { keys: ['Shift'], action: 'Przewrót' },
      { keys: ['Q'], action: 'Blok i parowanie' },
      { keys: ['R'], action: 'Głos Serca' },
      { keys: ['F'], action: 'Leczenie' },
      { keys: ['E'], action: 'Interakcja' },
      { keys: ['Tab'], action: 'Postać i ekwipunek' },
      { keys: ['Esc'], action: 'Pauza' },
    ],
    facts: [
      { label: 'Tryb', value: 'Jeden gracz, akcja' },
      { label: 'Lokacje', value: '3 + Krypta Odlewników' },
      { label: 'Bossowie', value: '3, każdy z dwiema fazami' },
      { label: 'Bronie', value: '3, każda z innym stylem walki' },
      { label: 'Relikty', value: '9' },
      { label: 'Zakończenia', value: '3 (jedno ukryte)' },
      { label: 'Sterowanie', value: 'Klawiatura, mysz, pad' },
      { label: 'Zapis', value: 'Automatyczny, w przeglądarce' },
    ],
    storageKeys: ['popielnydzwon.save.v1', 'popielnydzwon.settings.v1'],
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
