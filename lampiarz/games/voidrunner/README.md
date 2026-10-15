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
| J, R, lewy przycisk myszy | atak; przytrzymaj i puść — atak naładowany |
| K, prawy przycisk myszy | umiejętność specjalna (zużywa energię) |
| E | interakcja: ołtarze ulepszeń, skrzynie, terminale, stacje medyczne |
| Q | nanoapteczka (leczenie) |
| I | ekwipunek |
| S + Spacja | zeskok z kładki |
| ↓ + atak (w powietrzu) | cięcie w dół — odbicie od wrogów, skrzyń i kolców („pogo”) |
| ↑ + atak | cięcie w górę |
| kierunek do ściany + Spacja | ślizg po ścianie i odbicie od niej |
| Esc | pauza |

Na ekranach dotykowych pojawiają się przyciski (można je też włączyć/wyłączyć w Ustawieniach).

## Zawartość

- **5 sektorów** po 6 pomieszczeń: Opuszczony Kompleks, Strefa Biologiczna (kwas), Podziemne Miasto
  (odsłonięte kable), Rdzeń Energii (lasery bezpieczeństwa), Szczelina Pustki. Każdy ma własną paletę,
  tła z paralaksą, rekwizyty, zagrożenia i zestaw wrogów.
- **Wyprawy**: pomieszczenia to ręcznie zaprojektowane szablony (walka, tartak z piłami, korytarz z pułapkami,
  kanały z ruchomą platformą, wieża z miotaczami ognia, platformówka, szyby pionowe, skarbiec, arena elit, arena bossa) w losowej kolejności i z losowym obsadzeniem — z ziarna wyprawy.
  Test `tests/world.test.ts` sprawdza dla każdego szablonu, że wyjście, punkty zapisu, ołtarze i skrytki
  są osiągalne.
- **Ruch i walka**: ślizg i odbicie od ścian, cięcia w dół („pogo”) i w górę, działo celuje też w pionie,
  perfekcyjny unik (zryw tuż przed trafieniem → spowolnienie, energia, kontra ×1,6), licznik serii trafień
  z nagrodami co 10 trafień.
- **Przeszkody**: piły jeżdżące po szynach w podłodze, wysuwane kolce, miotacze ognia w ścianach, spadające
  stalaktyty i gruz (odrastają), ruchome platformy nad przepaściami. Każda przeszkoda najpierw ostrzega;
  piły i wysunięte kolce można przeskoczyć „pogo” (cięcie w dół). Przeszkody ranią też wrogów.
- **Pogoda** (losowana dla każdego pomieszczenia, zależna od sektora): deszcz przeciekający przez strop
  (krople rozbijają się o podłogi i kładki, kałuże), burza (ulewa, błyskawice, grzmoty, wiatr spychający
  w powietrzu), mgła (wrogowie widzą cię z bliższej odległości), śnieg chłodziwa (osiada na krawędziach,
  sople; śliska podłoga), popiół i iskry, Burza Pustki (fioletowe wyładowania). Bossowie mają stałą pogodę.
- **Dźwięk otoczenia** (Web Audio, generowany): szum deszczu i pojedyncze krople, grzmot z opóźnieniem,
  porywy wiatru, trzask iskier, kryształki lodu, zawodzenie Pustki, buczenie maszyn sektora; osobny suwak
  „Otoczenie i pogoda” w Ustawieniach.
- **Postać**: nowy, większy i bardziej szczegółowy sprite (hełm z wizjerem i grzebieniem, antena, rdzeń
  energii, naramienniki, nakolanniki, świecące podeszwy, plecak z kontrolkami), kolorowa obwódka, zawsze
  oświetlona, z poświatą na podłodze.
- **Czytelność**: jaśniejsze krawędzie i obrys wszystkiego, po czym można chodzić, przyciemnione tło,
  minimapa pomieszczenia z wrogami, przeszkodami i wyjściem, strzałka do otwartego wyjścia poza ekranem.
- **Elementy otoczenia**: skrzynie do rozbicia (Fragmenty, czasem zdrowie), wybuchowe beczki (ranią też gracza),
  wyrzutnie skokowe, zawory pary z ostrzeżeniem, kruszące się kładki, które po chwili się odbudowują.
- **Wrogowie**: dron, łowca, wieżyczka, prześladowca, istota Pustki, tarczownik (blokuje ciosy z przodu) (+ odmiany elitarne). Każdy groźny atak
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
- `src/render/` — renderer w buforze 480×270 skalowanym bez rozmycia: tła z paralaksą i pierwszy plan,
  wstępnie rysowane pomieszczenia z cieniowaniem (AO) i detalami, animowane detale (snopy światła, krople,
  wentylatory, diody, neony, ekrany, łuki elektryczne, para), sprite'y rysowane kodem z obrysem i białym
  błyskiem trafienia, światło (warstwa ciemności z „dziurami” światła), poświata (bloom), cząsteczki otoczenia.
- `src/core/` — wejście (z możliwością zmiany klawiszy), dźwięk (Web Audio: efekty i muzyka generatywna), zapis.
- `src/ui.ts` — menu, baza, HUD, pauza, ekwipunek, ustawienia, sterowanie, ekrany końca wyprawy, przyciski dotykowe.

## Testy

```bash
npx tsx --test games/voidrunner/tests/*.test.ts                      # logika: ruch, walka, bossowie, zapis…
python3 games/voidrunner/tests/e2e.py http://localhost:4321 /tmp/vr   # przeglądarka (Playwright)
```

Czcionki: Inter (OFL) i TeX Gyre Heros Condensed (GUST Font License) — `public/fonts/LICENSES.txt`.
Grafika, dźwięki i muzyka są generowane w kodzie.
