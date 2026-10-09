# LAMPIARZ

Taktyczny roguelite w przeglądarce o świetle i mroku. Jesteś ostatnim lampiarzem miasta: zapalasz latarnie, gospodarujesz olejem i przeprowadzasz światło przez pięć nocnych dzielnic aż do latarni morskiej na cyplu.

Gra działa w całości po stronie klienta — bez backendu, bazy danych, kont i kluczy API. Postęp zapisuje się w `localStorage` po każdej turze.

## Wdrożenie na Vercel (krok po kroku)

**Wariant A — przez GitHub (zalecany)**

1. Rozpakuj archiwum i wrzuć zawartość folderu `lampiarz/` do nowego repozytorium na GitHubie (pliki `package.json`, `vercel.json` itd. muszą być w katalogu głównym repozytorium).
2. Wejdź na [vercel.com/new](https://vercel.com/new), wybierz repozytorium i kliknij **Import**.
3. Vercel odczyta ustawienia z `vercel.json`: polecenie budowania `npm run build`, katalog wynikowy `dist`. Framework Preset zostaw jako **Other**. Niczego nie zmieniaj.
4. Kliknij **Deploy**. Po ok. minucie gra będzie dostępna pod adresem `https://<nazwa>.vercel.app`.

**Wariant B — przez Vercel CLI**

```bash
npm install -g vercel
cd lampiarz
vercel          # pierwsze wdrożenie (podgląd)
vercel --prod   # wdrożenie produkcyjne
```

**Lokalnie**

```bash
npm install
npm run dev      # serwer deweloperski z przebudową na żywo: http://localhost:5173
npm run build    # build produkcyjny do dist/
npm test         # testy logiki gry (Node 18+)
npm run typecheck
```

Wymagany Node.js 18 lub nowszy.

## Jak się gra

- **Cel:** w każdej dzielnicy zapal 3 znicze, aby otworzyć bramę. Na Cyplu Latarni zapal znicze i latarnię morską — albo rozprosz Matkę Mroku.
- **Święte światło:** pola oświetlone przez latarnie, znicze i ogień są nieosiągalne dla cieni; cień zaskoczony przez światło płonie i ucieka. Ręczna latarnia tylko pozwala widzieć.
- **Olej:** waluta decyzji — latarnie, znicze, zdolności i sam knot. Zgaszona latarnia oddaje olej.
- **Mrok:** rośnie co turę i rodzi nowe cienie; każde płonące światło go spowalnia. Po 160 turach w dzielnicy zapada głęboka noc.
- **Żar:** zbierany z cieni i stosów, wydawany w warsztacie na relikty, leczenie i olej.
- **Sterowanie:** WASD/strzałki, Q — zdolność, F/E — zapal/zgaś latarnię, Spacja — czekaj (w blasku znicza leczy), Esc/P — pauza, M — wycisz. Mysz/dotyk: kliknij pole, by iść w jego stronę; najedź, by je zbadać. Na telefonie — wirtualny pad.

## Zawartość

- 3 postacie (2 do odblokowania) z różnymi zdolnościami, 5 rodzajów cieni + boss (Matka Mroku), 19 reliktów, 6 typów dzielnic (wybór ścieżki), 6 zdarzeń fabularnych, ukryte kapliczki.
- 17 osiągnięć (4 sekretne), część odblokowuje postacie, relikty i wyższe poziomy trudności.
- 5 poziomów nocy (New Game+), Noc dnia (wspólne ziarno na dzień), własne ziarna miasta, statystyki, historia, bestiariusz.

## Architektura

```
src/
  game/        czysta logika (bez DOM) — testowalna w Node
    rng.ts       deterministyczny PRNG (mulberry32), kody ziaren
    types.ts     model danych (cały stan nocy to zwykły JSON)
    balance.ts   wszystkie liczby balansu w jednym miejscu
    content.ts   postacie, wrogowie, relikty, dzielnice, zdarzenia, osiągnięcia
    mapgen.ts    proceduralne dzielnice z gwarancją spójności
    light.ts     światło z linią wzroku (ściany rzucają cień)
    engine.ts    tura gracza, AI wrogów, mrok, warsztat, zdarzenia, wynik
    meta.ts      profil, statystyki, osiągnięcia, odblokowania
  save/        zapis/odczyt z walidacją i kopią uszkodzonych danych
  render/      renderer Canvas: kafle, oświetlenie, cząsteczki, sceny menu
  audio/       dźwięk syntezowany w Web Audio API (bez plików audio)
  ui/          React: menu, HUD, modale, księga
tests/         testy logiki (node:test) + bot grający całe noce
tools/         testy E2E w Chromium (Playwright, Python) i generator scenariuszy
```

Bundler: esbuild (`build.mjs`) — ten sam skrypt buduje lokalnie i na Vercel.

## Licencje

Kod gry: do Twojej dyspozycji. Font Lora (Cyreal) na licencji SIL Open Font License 1.1 — patrz `public/fonts/OFL.txt`. Grafika i dźwięk są generowane proceduralnie w kodzie.
