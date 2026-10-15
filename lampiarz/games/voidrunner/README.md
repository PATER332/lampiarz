# VOIDRUNNER

Mroczna gra akcji 2D w stylu roguelite (pixel art, sci-fi), w całości po polsku. Działa w przeglądarce,
bez backendu i bez kont; postęp zapisuje się w `localStorage` (`voidrunner.meta.v1` — trwały postęp i
ustawienia, `voidrunner.run.v1` — wyprawa w ostatnim punkcie zapisu).

## Sterowanie (domyślne, do zmiany w menu „Sterowanie”)

| Klawisz | Akcja |
| --- | --- |
| A / D, ← / → | ruch |
| Spacja | skok; w powietrzu drugi raz — podwójny skok |
| Shift | zryw / unik (krótka nietykalność, działa też w powietrzu) |
| J | atak; przytrzymaj i puść — atak naładowany |
| K | umiejętność specjalna (zużywa energię) |
| E | interakcja: ołtarze ulepszeń, skrzynie, terminale, stacje medyczne |
| Q | nanoapteczka (leczenie) |
| I | ekwipunek |
| S + Spacja | zeskok z kładki |
| Esc | pauza |

Na ekranach dotykowych pojawiają się przyciski (można je też włączyć/wyłączyć w Ustawieniach).

## Zawartość

- **5 sektorów** po 6 pomieszczeń: Opuszczony Kompleks, Strefa Biologiczna (kwas), Podziemne Miasto
  (odsłonięte kable), Rdzeń Energii (lasery bezpieczeństwa), Szczelina Pustki. Każdy ma własną paletę,
  tła z paralaksą, rekwizyty, zagrożenia i zestaw wrogów.
- **Wyprawy**: pomieszczenia to ręcznie zaprojektowane szablony (walka, platformówka, szyby pionowe, skarbiec,
  arena elit, arena bossa) w losowej kolejności i z losowym obsadzeniem — z ziarna wyprawy.
  Test `tests/world.test.ts` sprawdza dla każdego szablonu, że wyjście, punkty zapisu, ołtarze i skrytki
  są osiągalne.
- **Wrogowie**: dron, łowca, wieżyczka, prześladowca, istota Pustki (+ odmiany elitarne). Każdy groźny atak
  jest zapowiedziany (zamach, błysk, linia celownika, dźwięk); obrażenia przy dotyku tylko w trakcie ataku (wyjątek: małe larwy Matki Roju).
- **Bossowie**: Matka Roju (kwas, skoki z falą uderzeniową, larwy), Strażnik Rdzenia (namierzające lasery,
  pierścienie kul, szarża), Serce Pustki (kolce spod ziemi, poziome promienie — przeskocz albo zostań nisko,
  kule, przywoływanie istot). Każdy ma fazy zależne od zdrowia.
- **Bronie**: Ostrze Energetyczne (3 cięcia), Ciężkie Ostrze (wolne i mocne, fala uderzeniowa),
  Działo Pustki (strzały, promień, granat). Każda ma atak naładowany i własną umiejętność.
- **Ulepszenia wyprawy** (13): m.in. Ładunek Błyskawicy, Cień Pustki, Przeciążenie, Nanoregeneracja,
  Energetyczne Ostrze, Reaktor Awaryjny, Rozszczepienie. Wybór 1 z 3 przy ołtarzach i po bossach.
- **Trwały postęp**: Fragmenty Pustki zostają po śmierci; w bazie kupujesz zdrowie, obrażenia,
  nanoapteczki, energię, moduł startowy (ulepszenie na start), drugi zryw w powietrzu, bronie i wygląd pancerza.
- **Fabuła**: ARIA, system awaryjny kompleksu, komentuje sektory; terminale i dzienniki opowiadają, co się stało.

## Kod

- `src/game/` — symulacja (stały krok 1/60 s): gracz, walka, wrogowie, bossowie, ulepszenia, przebieg wyprawy.
  Nie dotyka DOM, więc testy w Node sterują nią bezpośrednio.
- `src/world/` — kafelki, fizyka (AABB z kładkami), szablony pomieszczeń, generator wypraw, sektory.
- `src/render/` — renderer w buforze 480×270 skalowanym bez rozmycia: tła z paralaksą, wstępnie rysowane
  pomieszczenia z detalami, sprite'y rysowane kodem, światło (warstwa ciemności z „dziurami” światła), cząsteczki.
- `src/core/` — wejście (z możliwością zmiany klawiszy), dźwięk (Web Audio: efekty i muzyka generatywna), zapis.
- `src/ui.ts` — menu, baza, HUD, pauza, ekwipunek, ustawienia, sterowanie, ekrany końca wyprawy, przyciski dotykowe.

## Testy

```bash
npx tsx --test games/voidrunner/tests/*.test.ts                      # logika: ruch, walka, bossowie, zapis…
python3 games/voidrunner/tests/e2e.py http://localhost:4321 /tmp/vr   # przeglądarka (Playwright)
```

Czcionki: Inter (OFL) i TeX Gyre Heros Condensed (GUST Font License) — `public/fonts/LICENSES.txt`.
Grafika, dźwięki i muzyka są generowane w kodzie.
