# RANDOM CHAOS

Imprezowa gra przeglądarkowa dla dwóch osób na jednej klawiaturze. Turniej losowych minigier
z modyfikatorami chaosu. Część platformy EVGAMES: `/play/random-chaos`, bezpośrednio `/g/random-chaos/index.html`.

## Sterowanie

| | Gracz 1 (Bąbel, niebieski) | Gracz 2 (Pieprz, pomarańczowy) |
|---|---|---|
| ruch | A / D | ← / → |
| skok (przytrzymaj = wyżej) | W | ↑ |
| akcja | S | ↓ |
| alternatywnie | pad nr 1 | I J K L · klawiatura numeryczna 8 4 5 6 · pad nr 2 |

Pady (standardowe mapowanie): D-pad / lewa gałka — ruch, A — skok, B lub X — akcja, Start — pauza.

Niezawodność sterowania: klawisze liczą się po fizycznym kodzie (układ klawiatury nie ma znaczenia); bardzo krótkie
stuknięcie (krótsze niż klatka) jest zapamiętywane, aż symulacja je zobaczy; akcja wciśnięta chwilę za wcześnie
(odnowienie, ogłuszenie) wykonuje się sama, gdy jest to możliwe; utrata fokusu zwalnia klawisze i pauzuje rundę.
Na platformie EVGAMES klawisze wciśnięte poza ramką gry (np. po kliknięciu paska) trafiają do gry, a ramka odzyskuje fokus.
W ekranie „Sterowanie” jest test klawiszy — pokazuje na żywo, co gra rejestruje. Jeśli przy kilku klawiszach naraz
któryś nie reaguje, to ograniczenie klawiatury (ghosting); wtedy gracz 2 może przejść na IJKL / numeryczną albo pad.

Akcja na ziemi to pchnięcie z rozpędu, w powietrzu wbicie w ziemię z falą uderzeniową. Skok na głowę rywala go ogłusza.
Skok działa jeszcze chwilę po zejściu z krawędzi (coyote time) i jest zapamiętywany tuż przed lądowaniem (jump buffer).

`Esc` pauza · `R` w menu pauzy: restart rundy (wynik meczu bez zmian; w trakcie gry R nic nie robi, żeby przypadkowe wciśnięcie obok WASD nie kasowało rundy) · `Enter` dalej / zatwierdź. Na karcie minigry obaj gracze
wciskają skok (W i ↑), żeby zacząć — albo `Enter`. W pauzie jest też „Odblokuj postacie”, gdy ktoś utknie.

## Minigry

| | Cel | Wygrana |
|---|---|---|
| A. LAST ONE STANDING | pękające płytki na trzech poziomach | rywal spada w przepaść; przy remisie czasu — dogrywka |
| B. LAVA RUSH | wspinaczka szybem przed rosnącą lawą (ruchome, pękające platformy, sprężyny, kamienie) | rywal dotyka lawy; po czasie lawa przyspiesza |
| C. KNOCKOUT | wypychanie z areny, obrażenia zwiększają odrzut, windy i wentylatory | rywal traci wszystkie życia; po czasie — więcej żyć, potem mniej obrażeń |
| D. CHAOS RACE | wyścig przez fabrykę: tłok, wentylator nad dołem, kruszący się most, kowadła, brama na przycisk | pierwszy przy fladze; po czasie — kto dalej |
| E. COIN PANIC | zbieranie monet (złota = 5), pchnięcie i kolczasta kula wytrącają monety | więcej monet; remis — ostatnia złota moneta |
| F. FLOOR IS LAVA | stań na platformie w wywołanym kolorze, reszta znika | rywal wpada do lawy |
| G. DODGE OR DIE | zapowiadane lasery, kowadła z cieniem, toczące się głazy, fale | rywal traci 3 serca; po czasie — więcej serc, potem nagła śmierć |
| H. KING OF THE PLATFORM | strefa korony przenosi się, zamiatacz na przycisk | pierwszy uzbiera czas sam w strefie; we dwóch nikt nie punktuje |

Rundy trwają ok. 20–60 s (ustawienie „Długość rund”), każda kończy się dokładnie jednym wynikiem.

## Modyfikatory chaosu (12)

LOW GRAVITY, SUPER BOUNCE, SLIPPERY FLOOR, SPEED DEMONS, GIANT MODE, TINY MODE, SCREEN SHAKE, RANDOM WIND,
DISAPPEARING PLATFORMS, DOUBLE TROUBLE, REVERSED CONTROLS, CHAOS BLAST. Każdy jest pokazany na karcie minigry
przed startem, działa tak samo na obu graczy, a zdarzenia w trakcie rundy (wiatr, odwrócenie sterowania, fala
uderzeniowa) są zapowiadane ostrzeżeniem. Częstość (wyłączone / czasem / zawsze) i lista dozwolonych modyfikatorów
są w ustawieniach turnieju. Minigra może wykluczyć modyfikator, który psułby jej zasady.

## Kod

```
src/main.ts            punkt wejścia
src/app.ts             ekrany, przebieg meczu, pętla, demo w tle menu, hooki testowe (?debug → window.__rc)
src/engine/            matematyka, RNG, klawiatura dwóch graczy (bez zacinania klawiszy po utracie fokusu)
src/sim/               symulacja (bez DOM): świat i kolizje, gracz, runda, modyfikatory, turniej, boty
src/sim/games/         8 minigier — każda w osobnym pliku, wspólna klasa bazowa
src/render/            Canvas 2D: motywy aren z paralaksą, postacie, cząsteczki, HUD
src/audio/             Web Audio: efekty i muzyka syntezowane w kodzie, odblokowanie po pierwszym kliknięciu/klawiszu
src/ui/                ekrany menu (DOM) i style
tests/game.test.ts     testy logiki (Node)
tests/e2e.py           test E2E w Chromium (Playwright)
```

Fizyka działa ze stałym krokiem 1/120 s (akumulator), niezależnie od liczby klatek. Zapisy: `randomchaos.settings.v1`
(ustawienia) i `randomchaos.stats.v1` (statystyki) w `localStorage`; uszkodzony zapis jest ignorowany.

Silnik jest własny (Canvas 2D + własna fizyka platformowa), bez Phasera i Matter.js: w środowisku, w którym gra
powstała, rejestr npm i CDN nie były dostępne, a platforma EVGAMES buduje gry własnym esbuildem bez dodatkowych
zależności.

## Testy

```bash
npx tsx --test games/random-chaos/tests/game.test.ts
node build.mjs && node tools/serve.mjs &
python3 games/random-chaos/tests/e2e.py http://localhost:4321 /tmp/shots
```

## Zasoby

Postacie, areny, efekty, dźwięki i muzyka są rysowane i syntezowane w kodzie. Czcionka Inter (OFL) — `public/fonts/LICENSES.txt`.
