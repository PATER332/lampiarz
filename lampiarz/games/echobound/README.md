# ECHOBOUND

Pixelartowa platformówka 2D z eksploracją, zagadkami i mechaniką **ech czasu** — działa w całości w przeglądarce (HTML5 Canvas + Web Audio API + React/Vite/Tailwind). Bez logowania, bez backendu; postęp zapisuje się w `localStorage`.

## W EVGAMES

Gra jest budowana razem z platformą (`node build.mjs` w katalogu głównym) i działa pod `/g/echobound/`.
Oryginalny projekt używał Vite + Tailwind; tutaj build robi esbuild, a style Tailwinda są skompilowane do
zwykłego pliku `src/index.css` (źródło: `src/styles.tailwind.css`). Po zmianie klas Tailwinda w komponentach:

```bash
npx -y -p tailwindcss@4 node games/echobound/tools/build-css.mjs
```

Czcionki (Cinzel, Rajdhani, Press Start 2P) ładują się z Google Fonts. Zapis: `echobound.save.v1`, `echobound.settings.v1`.

## Sterowanie

| Klawisz | Akcja |
| --- | --- |
| A / D, ← / → | ruch |
| Spacja / W / ↑ | skok (przytrzymaj = wyższy) |
| S + Spacja | zeskok z półki |
| Q | nagraj / przywołaj echo |
| E | interakcja (dźwignie, ołtarz ulepszeń) |
| R | rozprosz echa / przerwij nagrywanie |
| F | pamięć echa (po ulepszeniu) |
| Esc | pauza |

Na urządzeniach dotykowych pojawiają się przyciski ekranowe.

## Obszary

Akt I:

1. **Zapomniana Jaskinia** — samouczek, pierwsze echo
2. **Kryształowe Ruiny** — dźwignie czasowe, Strażnik, Pożeracz Ech
3. **Zatopione Archiwum** — kruche półki, woda, ruchome platformy
4. **Ogrody Rezonansu** — grzyby sprężyste, prądy zarodników, pryzmaty odbijające echa, zasłony
5. **Kuźnia Widm** — Widma, windy sterowane echem, kolczaste bloki, klucze i zamki
6. **Pęknięta Wieża** — pionowa wspinaczka, szczeliny-portale, połączenie wszystkich mechanik
7. **Serce Podziemi**

Akt II: **Głębia Zapomnienia**, **Mokradła Czasu**, **Twierdza Ciszy**, **Rozpadlina**.

## Postacie

| | **Wędrowiec** (od początku) | **Szept, Tkaczka Cieni** (do odblokowania) |
| --- | --- | --- |
| Moc główna | Echo — nagrywa ruchy i odtwarza je | Kotwica Cienia — zostawia cień, `Q` ponownie = skok do niego |
| Mobilność | zwykły skok | **Dash** (`Shift`/`X`/`K`) z nietykalnością + **wspinaczka i odbicie od ścian** |
| Zdrowie | 4 serca | 3 serca |
| Specjalne | echa pociągają dźwignie | kotwica trzyma płyty i wabi Pożeraczy, blink przechodzi przez zasłony i ściany |

**Odblokowanie:** w Zatopionym Archiwum, na końcu górnego korytarza, stoi klatka z Szept — podejdź i naciśnij `E`.
Kto ją ominie, może przywołać ją przy ołtarzu za kryształy. Postacie zmieniasz klawiszem `C` lub w menu pauzy
(wspólne kryształy, ulepszenia i rany; ulepszenia mają osobne opisy i efekty dla każdej postaci).

## Mechaniki

- **Echo** — nagrywanie i odtwarzanie ruchów (płyty, dźwignie, przynęta)
- **Pryzmat** — echo przechodzące przez pryzmat tworzy lustrzane odbicie po drugiej stronie
- **Zasłony** — błękitna zatrzymuje gracza (echa przechodzą), bursztynowa rozprasza echa
- **Grzyb sprężysty / prąd zarodników** — wysoki wyskok i unoszenie w górę
- **Winda echa** — jedzie, dopóki połączona płyta jest wciśnięta
- **Kolczaste bloki** — ruchome zagrożenia po torach (z przesunięciem fazy)
- **Klucze i zamki** — tylko gracz może podnieść klucz; zamek otwiera się na stałe
- **Szczeliny czasu** — pary portali
- **Przeciwnicy** — Cień, Strażnik Ruin, Pożeracz Ech, Widmo (rusza się, gdy nie patrzysz), Żarłacz (roślina-pułapka)

## Struktura

- `src/game/game.ts` — pętla gry, fizyka, system ech, mechanizmy, przeciwnicy, zapis
- `src/game/render.ts` — renderowanie świata, oświetlenie, mgła, paralaksa
- `src/game/sprites.ts` — proceduralny pixel art (postacie, kafle, obiekty)
- `src/game/levels.ts` — jedenaście obszarów zbudowanych „rzeźbieniem” siatki
- `src/game/audio.ts` — syntezowane efekty i ambient (Web Audio API)
- `src/game/menuScene.ts` — animowane tło menu
- `src/components/*` — menu, HUD, pauza, sklep ulepszeń, ekrany śmierci i zwycięstwa
