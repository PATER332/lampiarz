# EVGAMES

Platforma gier przeglądarkowych. Tytuły:

- **Lampiarz** — taktyczny roguelite o świetle i mroku (`/play/lampiarz`),
- **RANDOM CHAOS** — imprezowa gra dla 2 osób na jednej klawiaturze: turniej 8 minigier z 12 modyfikatorami chaosu (`/play/random-chaos`),
- **Skrzynkomat** — symulator otwierania skrzynek za wirtualne złotówki: ruletka, bitwy z botami, ekwipunek, upgrader, kontrakty (`/play/skrzynkomat`),
- **BABCIA: Dom bez wyjścia** — horror 3D (three.js): pięć nocy, cztery zabezpieczenia drzwi i babcia, która słyszy wszystko (`/play/babcia`).

Gry Popielny Dzwon, NIGHT SHIFT: 03:17 i BACKROOMS: THE DESCENT zostały zdjęte ze strony. Ich źródła leżą w `archiwum/` (poza `games/`, więc build ich nie buduje i nie publikuje); żeby którąś przywrócić, przenieś jej folder z powrotem do `games/`, grafiki z `archiwum/<slug>/_platform_img/<slug>` do `public/img/games/` i wpis z `archiwum/wpisy-katalogu.ts.txt` do tablicy `GAMES` w `src/catalog.ts`.

Wszystko działa po stronie przeglądarki: bez backendu, kont, bazy danych i kluczy API. Ulubione, historia i zapisy gier trzymane są w `localStorage`.

## Struktura

```
index.html            szablon platformy (SEO, Open Graph, favicon)
src/                  platforma EVGAMES (React + TypeScript)
  catalog.ts            centralny katalog gier i kategorii  ← tu dodajesz gry
  router.tsx            trasy: /  /games  /games/:slug  /play/:slug  /discover  /new  /favorites  /privacy
  pages.tsx             strony
  Player.tsx            uruchamianie gry (pełny ekran, błędy ładowania, powrót)
  components.tsx        nagłówek, stopka, karty, ikony, logo
  store.ts              ulubione i ostatnio grane (localStorage)
public/               czcionki, favicon, grafiki (img/games/<slug>/…), og.jpg
games/
  lampiarz/           gra Lampiarz — źródła, testy i narzędzia
  random-chaos/       gra RANDOM CHAOS (2 graczy) — własny silnik 2D (Canvas), testy (tests/game.test.ts, tests/e2e.py), README
  babcia/             gra BABCIA: Dom bez wyjścia — React + three.js, style Tailwind skompilowane do src/index.css (tools/build-css.mjs), README
  skrzynkomat/        gra Skrzynkomat — oryginalna gra w jednym pliku HTML rozdzielona na index.html + src/ (bez zmian w logice), README
archiwum/             zdjęte gry (nie są budowane ani publikowane)
build.mjs             buduje platformę i KAŻDĄ grę z games/* do dist/
vercel.json           przepisywanie adresów (odświeżanie podstron) i nagłówki
tools/serve.mjs       lokalny serwer działający jak Vercel
tools/e2e_platform.py testy E2E w Chromium (Playwright)
tests/                testy katalogu i tras
```

Po zbudowaniu:

```
dist/index.html, dist/assets/…      platforma
dist/g/lampiarz/index.html, …       gra, zbudowana ze ścieżką bazową /g/lampiarz/
dist/g/random-chaos/…               druga gra, ścieżka bazowa /g/random-chaos/
dist/g/skrzynkomat/…                trzecia gra, ścieżka bazowa /g/skrzynkomat/
dist/g/babcia/…                     czwarta gra, ścieżka bazowa /g/babcia/
```

## Jak zintegrowane są gry

Każda gra jest osobnym buildem (Lampiarz pod `/g/lampiarz/`, RANDOM CHAOS pod `/g/random-chaos/`, Skrzynkomat pod `/g/skrzynkomat/`, BABCIA pod `/g/babcia/`). Gry nie dzielą kodu ani stylów, a ich klucze `localStorage` mają własne przedrostki (`lampiarz.*`, `randomchaos.*`, `skrzynkomat.*`) — test `tests/catalog.test.ts` pilnuje, żeby się nie pokrywały.

Lampiarz jest osobnym buildem w tej samej domenie (`/g/lampiarz/`). Strona `/play/lampiarz` wyświetla go w ramce z tej samej domeny, nad nią jest pasek EVGAMES: powrót, biblioteka, ulubione, przeładowanie, pełny ekran.

Dlaczego tak:
- gra ma własne globalne style (przyciski, panele, blokadę przewijania), które w jednym dokumencie popsułyby wygląd platformy — ramka je izoluje;
- ta sama domena oznacza wspólny `localStorage`, więc zapisy gry działają jak wcześniej, a platforma może sprawdzić, czy gra się uruchomiła;
- sterowanie klawiaturą trafia do gry (fokus ustawiany po załadowaniu), pełny ekran obejmuje obszar gry.

Platforma wykrywa błąd ładowania (brak plików, timeout) i pokazuje ekran z przyciskiem „Spróbuj ponownie”. Gra jest też dostępna bezpośrednio pod `/g/lampiarz/index.html`.

## Wdrożenie na Vercel

1. Wrzuć **zawartość** folderu `evgames/` do repozytorium GitHub tak, żeby `package.json` był w katalogu głównym repozytorium.
   (Jeśli wolisz zostawić pliki w podfolderze, ustaw w Vercel *Settings → Build and Deployment → Root Directory* na nazwę tego folderu.)
2. Vercel → **Add New → Project** → wybierz repozytorium → **Import**.
3. Framework Preset: **Other**. Resztę ustawień Vercel weźmie z `vercel.json`. Kliknij **Deploy**.

Adres produkcyjny trafia automatycznie do meta tagu `og:image` (zmienna `VERCEL_PROJECT_PRODUCTION_URL`). Własną domenę możesz wymusić zmienną środowiskową `SITE_URL=https://twojadomena.pl`.

## Lokalnie

```bash
npm install
npm run preview     # build + serwer jak na Vercel: http://localhost:4321
npm run dev         # przebudowa przy zmianach + serwer
npm test            # testy platformy i gier (Node 18+)
python3 tools/e2e_platform.py http://localhost:4321 /tmp/shots                 # E2E platformy (Playwright)
python3 games/random-chaos/tests/e2e.py http://localhost:4321 /tmp/shots       # E2E RANDOM CHAOS (menu, turniej, 8 minigier, pauza, zapis)
npm run typecheck
```

## Dodawanie nowej gry

1. **Pliki gry.** Umieść grę w `games/<slug>/` w tym samym układzie co Lampiarz lub RANDOM CHAOS:
   - `games/<slug>/src/main.tsx` albo `src/main.ts` — punkt wejścia (TypeScript/JS; React jest opcjonalny),
   - `games/<slug>/index.html` — szablon z `<div id="root"></div>` i znacznikiem `<!--APP-->`,
   - `games/<slug>/public/` — opcjonalne zasoby (czcionki, dźwięki, obrazy).
   Używaj ścieżek zaczynających się od `/` (np. `/fonts/x.woff`) — build sam przepnie je pod `/g/<slug>/`. Gra musi renderować coś do `#root`, bo po tym platforma poznaje, że gra wystartowała.
2. **Wpis w katalogu.** Dodaj obiekt do `GAMES` w `src/catalog.ts`: `slug`, `title`, `tagline`, `description`, `category`, `thumbnail`, `cover`, `entry: '/g/<slug>/index.html'`, `status: 'published'`, `addedAt`. Pola `controls`, `facts`, `screenshots`, `tags`, `adult` (plakietka 18+) są opcjonalne — wpisuj tylko to, co gra naprawdę ma.
3. **Grafiki.** `public/img/games/<slug>/thumb.webp` (16:9, np. 800×450) i `cover.webp` (16:9, np. 1600×900), opcjonalnie zrzuty ekranu.
   Gra w jednym pliku HTML (jak Skrzynkomat): style przenieś do `src/style.css`, skrypt do `src/game.js`, znaczniki z `<body>` do `index.html` wewnątrz `<div id="root">`, a `src/main.ts` niech tylko importuje oba pliki.
4. **Sprawdzenie.** `npm test` (sprawdza, czy pliki z katalogu istnieją), `npm run preview`, wejdź na `/play/<slug>`. Po pushu Vercel wdroży wszystko sam.

Gra w przygotowaniu: ustaw `status: 'coming-soon'` — strona gry pokaże „Wkrótce”, a uruchomienie będzie zablokowane. `status: 'hidden'` ukrywa tytuł całkowicie.

## Licencje

Czcionki: Inter (OFL), TeX Gyre Heros Condensed (GUST Font License), GNU Unifont (OFL) — szczegóły w `public/fonts/LICENSES.txt`. Lampiarz używa czcionki Lora (OFL). RANDOM CHAOS używa Inter (OFL) — `games/random-chaos/public/fonts/LICENSES.txt`; postacie, areny, efekty, dźwięki i muzyka są rysowane i syntezowane w kodzie. Skrzynkomat ładuje czcionki Rajdhani, Barlow i JetBrains Mono z Google Fonts (opisane na stronie Prywatność); jego grafiki broni i skrzynek to SVG generowane w kodzie. BABCIA używa biblioteki three.js (MIT, zależność `three` w package.json); jej modele, tekstury i dźwięki są generowane w kodzie. Grafiki gier to zrzuty ekranu z samej gry.
