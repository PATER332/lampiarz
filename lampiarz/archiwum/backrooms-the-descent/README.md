# BACKROOMS: THE DESCENT

Horror FPS 3D dla dorosłych (18+) na platformę EVGAMES. Żółty labirynt, pięć cyfr kodu do zbrojowni ukrytych w świecie gry, rewolwer, trzy istoty z własną sztuczną inteligencją, zejście windą i trzy zakończenia (jedno ukryte). Działa w całości w przeglądarce (WebGL 2 + Web Audio), bez backendu i bez kluczy API.

## Uruchomienie

Gra jest budowana razem z platformą (`node build.mjs` w katalogu głównym `evgames/`) do `dist/g/backrooms-the-descent/`. Na platformie: `/play/backrooms-the-descent`, bezpośrednio: `/g/backrooms-the-descent/index.html`. Parametr `?debug` udostępnia `window.__bd` (zamrażanie symulacji, teleport, przewijanie czasu, podejście do obiektu, interakcja) — używa go test E2E.

## Przebieg

1. Schowek startowy → Żółty Labirynt: notatki wędrowców, zegary, pierwszy kontakt ze Stalkerem.
2. Pięć symboli na tabliczce nad drzwiami zbrojowni (kolejność losowana na zapis). Każdy symbol to jedna cyfra:
   - ○ — godzina na zegarze, który naprawdę tyka (pozostałe stoją),
   - △ — liczba trzasków na stacji radiowej z szumem (druga stacja jest „martwa” i kłamie),
   - □ — kreski na ścianie zamkniętej klatki, widoczne tylko przez kamerę 3,
   - ✕ — czarne krzyżyki na liście obecności (czerwony jest fałszywy),
   - ◉ — kropki napisane tuszem UV (napis zwykłą farbą obok podaje nieprawdę).
3. Dziennik (Tab): znaki, obserwacje (zależnie od trudności z gotową podpowiedzią, samą obserwacją albo bez), dokumenty, notatki i własne hipotezy dla każdego znaku.
4. Klawiatura zbrojowni: zły kod = hałas, który przyciąga istoty, i blokada na kilka/kilkanaście sekund. Liczba prób przed blokadą zależy od trudności (STORY: bez blokady). Nie ma kodu, który zamyka grę na stałe.
5. Wskazówki są rozrzucone po Labiryncie, Ciemnych Korytarzach i Kompleksie Magazynowym (agregat, kamery, lampa UV).
6. Zbrojownia: rewolwer, amunicja, karta windy → śluza do Czerwonego Sektora (wymaga uruchomionego agregatu) → winda towarowa w dół (Zejście) → trzy stabilizatory na poziomie Kotwicy → terminal Kotwicy i wybór zakończenia → ucieczka przez Drzwi bez klamki.

## Poziomy trudności (realne różnice parametrów w `src/game/story.ts → DIFF`)

STORY, NORMAL, NIGHTMARE, NO MERCY różnią się: prędkością, słuchem, wzrokiem i czasem reakcji istot, obrażeniami, wytrzymałością istot, podejrzliwością przy szafkach, regeneracją zdrowia, zużyciem baterii, liczbą prób kodu i czasem blokady, ilością przedmiotów na mapie, zawartością dziennika oraz zapisem (STORY/NORMAL: ręczny zapis wszędzie, gdzie bezpiecznie; NIGHTMARE: tylko w bezpiecznych pokojach; NO MERCY: tylko automatyczne punkty kontrolne).

## Architektura

```
src/main.ts            punkt wejścia
src/app.ts             powłoka: pętla, wejście, blokada kursora, ekrany, zapis, śmierć, zakończenia, tło menu 3D, debug
src/engine/            własny silnik WebGL 2
  math.ts, gl.ts         macierze, programy, siatki, tekstury, bufory, mapy cieni
  mesh.ts                geometria: prostopadłościany, bryły obrotowe (lathe), elipsoidy, kończyny
  textures.ts            proceduralne tekstury, mapy normalnych i naklejki (krew, ślady, pleśń, dziury po kulach)
  shaders.ts             oświetlenie forward (12 świateł), latarka z cieniem PCF, drugi cień od lampy przy istocie,
                         mgła, cząsteczki, bloom, post-process (ACES, ziarno, aberracja, strach, CCTV, glitch)
  renderer.ts            klatka: cienie, scena HDR, istoty (szkielety), naklejki, cząsteczki, ręce i broń, widok CCTV
src/world/
  layout.ts              plan poziomu na siatce 2 m (strefy, ściany, drzwi, regały, filary, mokra podłoga)
  map.ts                 drzwi, rekwizyty, kryjówki, przedmioty, kamery, wentylacja, symbole
  level.ts               kolizje, linia wzroku, A* z wygładzaniem ścieżki
  lights.ts, scene.ts    światła i budowa geometrii świata
  props.ts               modele rekwizytów (szafki, stoły, regały, panele, winda, kotwica…)
  rig.ts                 modele i animacje istot (Stalker, Crawler, Echo): kości + proceduralne animacje
  puzzleArt.ts           grafiki zagadek (tarcze zegarów, lista obecności, kreski, tusz UV, tabliczka)
src/game/
  sim.ts                 symulacja (bez DOM): ruch, kolizje, interakcje, broń, kryjówki, zagadki, zdarzenia, zakończenia
  monsters.ts            AI istot: stany, percepcja (wzrok, słuch przez ściany, światło), ścieżki, szafki, wentylacja
  puzzle.ts              losowanie cyfr i kolejności na podstawie ziarna zapisu
  story.ts               dokumenty, kwestie, zakończenia, parametry trudności
  state.ts               stan gry, walidacja, wersjonowany zapis, ustawienia, meta
src/audio/audio.ts     proceduralny dźwięk przestrzenny (HRTF), radio z syntezą mowy (opcjonalnie)
src/ui/                HUD, ekrany, dziennik, klawiatura, generator, radio, CCTV, terminal (DOM + CSS)
tests/sim.test.ts      testy logiki (Node)
tests/e2e.py           test E2E w Chromium: pełne przejście, dedukcja kodu z dziennika, walka, kryjówki, zapis, 3 zakończenia
```

Dlaczego własny silnik zamiast Three.js: w środowisku, w którym powstała gra, nie było dostępu do rejestru npm ani CDN, a projekt nie może odwoływać się do nieistniejących plików.

## Modele

Wszystkie modele (istoty, broń, ręce, rekwizyty) są **proceduralne i stylizowane** — zbudowane w kodzie z brył obrotowych, elipsoid i kończyn przypiętych do kości szkieletu, animowane proceduralnie (chód, pościg, atak, zauważenie, trafienie, śmierć). To nie są realistyczne modele GLB ani skany.

## Audyt jakości (wersja 1.1)

- Modele: kręgosłup, klatka, szyja i głowa pochylały się do tyłu zamiast do przodu (odwrócony znak obrotu kości skierowanych w górę) — Stalker i Echo „odchylały się” przy biegu i ataku. Naprawione; ręce wiszą względem pionu, a nie tułowia; stopy (i kolana, dłonie) są dopasowywane do podłogi w każdej klatce, więc nic nie lewituje ani nie zapada się (martwy Pełzacz znikał pod podłogą). Echo dostało kaptur, wszystkie istoty oddychają w bezruchu.
- Istoty wychodzą z wentylacji widocznie: kratka odskakuje na zawiasie, istota wypełza na czworakach i wstaje; przy odwrocie wczołguje się z powrotem.
- AI: zamknięte drzwi zasłaniały gracza stojącego we wnęce przed nimi (traktowane jak ściana) — teraz zasłania tylko skrzydło drzwi. Przeszukiwanie po zgubieniu gracza jest prawdziwym przeczesywaniem okolicy z rozglądaniem się (wcześniej istota czasem od razu wracała do patrolu). Dźwięki nie zawracają już istoty, która ucieka lub sprawdza kryjówkę. Ścieżki omijają meble stojące na środku pola siatki.
- Dźwięk: dźwięki zza ścian i zamkniętych drzwi są przytłumione (filtr dolnoprzepustowy + ciszej).
- Tempo: w długich spokojnych okresach pojawiają się odległe kroki, trzaśnięcia drzwi, stukanie w kanałach, przygasanie świateł (bez wpływu na AI).
- Otoczenie: rury i przewody pod sufitami stref technicznych, porozrzucane kartki, gruz, brakujące płyty sufitowe, gniazdka; meble i rupiecie przy ścianach większych pomieszczeń (generowane deterministycznie, z kontrolą, że nie blokują przejść) i ręcznie umeblowane puste pokoje.
- Interfejs: obrazy wskazówek (zegar, lista) zawsze mieszczą się na ekranie; nowe ustawienie „Jasność”.

## Zapis

`localStorage`: `backroomsthedescent.save.v1` (stan gry, wersjonowany i walidowany), `backroomsthedescent.settings.v1`, `backroomsthedescent.meta.v1` (odkryte zakończenia, potwierdzenie 18+). Uszkodzony zapis jest odkładany pod `backroomsthedescent.save.v1.corrupt`, a menu pokazuje ostrzeżenie zamiast się wywracać.

## Testy

```bash
npx tsx --test games/backrooms-the-descent/tests/sim.test.ts          # logika: zagadka, AI, kryjówki, broń, zakończenia
npx tsx --test games/backrooms-the-descent/tests/walkthrough.test.ts  # przejście całej gry samym chodzeniem (bez teleportów)
python3 games/backrooms-the-descent/tests/e2e.py http://localhost:4321 /tmp/bd-shots
```

## Zasoby

Tekstury, modele, dźwięki i muzyka są generowane w kodzie. Głos radia korzysta z syntezy mowy przeglądarki, jeśli jest dostępna (można wyłączyć w ustawieniach). Czcionki: Inter (OFL), TeX Gyre Heros Condensed (GUST), GNU Unifont (OFL) — `public/fonts/LICENSES.txt`.
