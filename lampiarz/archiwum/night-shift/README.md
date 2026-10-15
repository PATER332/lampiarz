# NIGHT SHIFT: 03:17

Psychologiczny horror FPS w 3D dla platformy EVGAMES. Nocna zmiana w podziemnym ośrodku badawczym H-27, zarządzanie zasilaniem, Przestój w korytarzach i cztery zakończenia. Działa w całości w przeglądarce (WebGL 2 + Web Audio), bez backendu i bez kluczy API.

## Uruchomienie

Gra jest budowana razem z platformą (`node build.mjs` w katalogu głównym `evgames/`) do `dist/g/night-shift/`. Na platformie: `/play/night-shift`, bezpośrednio: `/g/night-shift/index.html`. Parametr `?debug` udostępnia `window.__ns` (zamrażanie symulacji, teleport, celowanie) — używa go test E2E.

## Architektura

```
src/main.ts            punkt wejścia (styl, start aplikacji)
src/app.ts             powłoka: pętla, wejście, blokada kursora, zdarzenia symulacji, zapis, śmierć, zakończenia, cykl życia
src/engine/            własny silnik WebGL 2
  math.ts                wektory, macierze, RNG
  gl.ts                  programy, siatki, tekstury, bufory renderowania, mapa cieni
  mesh.ts                budowanie geometrii (prostopadłościany, płaszczyzny, tangenty)
  textures.ts            proceduralne tekstury + mapy normalnych (canvas)
  shaders.ts             GLSL: oświetlenie forward (12 świateł + latarka z cieniem PCF), mgła, pył, bloom, post-process
  renderer.ts            klatka: cienie, scena HDR, bloom, korekcja, widok CCTV i podgląd na ścianie monitorów
src/world/
  map.ts                 dane ośrodka: pomieszczenia, drzwi, światła, kamery, meble, przedmioty, wentylacja
  level.ts               siatka kolizji, strefy, przeszukiwanie ścieżek
  scene.ts               budowa geometrii świata z danych mapy
  screens.ts             ekrany w świecie (terminale, panel, radio, winda)
src/game/
  sim.ts                 symulacja (czysta logika, bez DOM): ruch, kolizje, interakcje, misje, zasilanie, zdarzenia, zakończenia
  enemy.ts               Przestój: AI ze stanami (ukryty, patrol, nasłuch, sprawdzanie hałasu, pościg, szukanie, zgubienie, odwrót, szafki)
  story.ts               dokumenty, kwestie NADZORCY i radia, misje, zakończenia
  state.ts               stan gry, walidacja, zapis/odczyt, ustawienia, meta (odkryte zakończenia)
src/audio/audio.ts     proceduralny dźwięk przestrzenny (HRTF), osobne szyny: muzyka / efekty / otoczenie
src/ui/                HUD, ekrany i interfejsy urządzeń (DOM + CSS)
tests/sim.test.ts      testy logiki (Node)
tests/e2e.py           test E2E w Chromium: pełne przejście gry i wszystkie 4 zakończenia
```

Dlaczego własny silnik zamiast Three.js: w środowisku, w którym powstała gra, nie było dostępu do rejestru npm ani CDN, a projekt nie może odwoływać się do nieistniejących plików. Silnik obejmuje dokładnie to, czego gra potrzebuje.

## Zapis

`localStorage`, klucze `nightshift.save.v1` (stan gry, wersjonowany i walidowany), `nightshift.settings.v1`, `nightshift.meta.v1`. Uszkodzony zapis jest odkładany pod `nightshift.save.v1.corrupt`, a menu pokazuje ostrzeżenie. Punkty kontrolne zapisują się automatycznie po postępach; ręczny zapis jest w pauzie (niedostępny podczas pościgu, w szafce i w finale).

## Testy

```bash
npx tsx --test games/night-shift/tests/sim.test.ts
python3 games/night-shift/tests/e2e.py http://localhost:4321 /tmp/ns-shots
```

## Zasoby

Wszystkie tekstury, modele, dźwięki i muzyka są generowane w kodzie. Czcionki: Inter (OFL), TeX Gyre Heros Condensed (GUST), GNU Unifont (OFL) — `public/fonts/LICENSES.txt`.
