# LAMPIARZ

Taktyczny roguelite w przeglądarce o świetle i mroku. Jesteś ostatnim lampiarzem miasta: zapalasz latarnie, gospodarujesz olejem i przeprowadzasz światło przez pięć nocnych dzielnic aż do latarni morskiej na cyplu.

Gra działa w całości po stronie klienta — bez backendu, bazy danych, kont i kluczy API. Postęp zapisuje się w `localStorage` po każdej turze.

## Uruchamianie

Gra jest częścią platformy EVGAMES. Budowanie, testy i wdrożenie obsługuje katalog główny repozytorium (`npm run build`, `npm test`) — patrz README w katalogu głównym. Po zbudowaniu gra jest dostępna pod `/g/lampiarz/index.html`, a na platformie pod `/play/lampiarz`.

## Jak się gra

Najprościej: **menu → Samouczek** (ok. 3 minuty, 10 kroków na prawdziwym silniku gry). Przy pierwszej nowej nocy gra sama go proponuje. Samouczek nie zapisuje się jako noc i nie liczy się do statystyk ani osiągnięć.

W trakcie nocy ramka **„Cel”** u góry ekranu zawsze mówi, co robić dalej (zapal znicze → idź do bramy; „Gasiciel gasi znicz!”; „Brakuje oleju”), a **strzałki na brzegu ekranu** z liczbą pól wskazują znicze, bramę lub zagrożenie. Znicze i latarnia morska są zaznaczone na mapie od początku. Przy pierwszym spotkaniu nowego wroga pojawia się karta z opisem, a po przegranej — wskazówka, co poszło nie tak. Wszystko to można wyłączyć w Ustawieniach (przełącznik „Wskazówki”).

- **Cel:** w każdej dzielnicy zapal 3 znicze — gdy wszystkie trzy zapłoną naraz, brama otwiera się **na dobre** (zgaszenie znicza już jej nie zamknie). Na Cyplu Latarni zapal znicze i latarnię morską (1 olej) — albo rozprosz Matkę Mroku.
- **Gasiciel:** nie rani, ale gasi płomienie. Zgaszenie latarni zajmuje mu 2 tury (znicza 3), licznik nad nim i przerywana linia pokazują cel. Ginie od jednego ciosu i oddaje 1 olej. Najwyżej jeden naraz (dwa w Gazowni i od 5. dzielnicy).
- **Cypel Latarni:** na wejściu pełne zdrowie i +2 oleju. Matka Mroku śpi, dopóki nie zapalisz pierwszego znicza (albo nie podejdziesz za blisko); rusza się co drugą turę, zaćmienie co 5 tur (z ostrzeżeniem) gasi zwykłe latarnie, ale nie znicze.
- **Święte światło:** pola oświetlone przez latarnie, znicze i ogień są nieosiągalne dla cieni; cień zaskoczony przez światło płonie i ucieka. Ręczna latarnia tylko pozwala widzieć.
- **Olej:** waluta decyzji — latarnie, znicze, zdolności i sam knot. Zgaszona latarnia oddaje olej.
- **Mrok:** rośnie co turę i rodzi nowe cienie; każde płonące światło go spowalnia. Po 160 turach w dzielnicy zapada głęboka noc.
- **Żar:** zbierany z cieni i stosów, wydawany w warsztacie na relikty, leczenie i olej.
- **Sterowanie:** WASD/strzałki, Q — zdolność, F/E — zapal/zgaś latarnię, Spacja — czekaj (w blasku znicza leczy), Esc/P — pauza, M — wycisz. Mysz/dotyk: kliknij pole, by iść w jego stronę; najedź, by je zbadać. Na telefonie — wirtualny pad.

## Nowe w wersji 2.0

- **Beczki z olejem**: wejście = wybuch (3 obrażeń wrogom w promieniu 1,5, ogień na 4 tury, reakcja łańcuchowa). Wybuch nigdy nie rani gracza — to pułapka na cienie.
- **Pogoda** każdej dzielnicy (prognoza na ekranie wyboru drogi): deszcz (gasi latarnię co 14 tur, kanistry +1), mgła (krótsza latarnia, wolniejszy mrok), pełnia (więcej żaru, szybszy mrok).
- **Kominiarz Cieni** — mini-boss 3. dzielnicy: schodzi z dachów przy drugim znicze, co 5 tur gasi sadzą latarnię uliczną, bije co drugą turę, po pokonaniu zostawia relikt.
- **Tryb „Do świtu”**: dzielnice bez końca, mrok rośnie z każdą, Kominiarz co 5 dzielnic, rekord w profilu.
- **Księga mistrza**: popiół z każdej nocy (wygranej i przegranej) kupuje trwałe ulepszenia: zapasowa bańka, kieszeń na żar, grubszy knot, hart ducha. Nie działa w Nocy dnia (równe warunki).
- 4 nowe osiągnięcia, efekty deszczu/mgły/pełni, poprawka podwójnego trafienia młotem Kowalki przy reliktach zasięgu.
- 2.3: dużo więcej szczegółów w grafice — dachy dwuspadowe z kalenicą, dachówką/łupkiem/blachą/strzechą zależnie od dzielnicy, podział na kamienice z murami ogniowymi, kominy (z dymem), lukarny, świetliki, kot na dachu; fasady z gzymsem, rynną, cokołem, odpadającym tynkiem, bluszczem, plakatami, szyldami, markizami sklepów, okiennicami, firankami, numerami domów i rurami spustowymi; chodniki z krawężnikiem, kratki ściekowe, włazy, kałuże z odbiciem nieba, liście, śmieci, deski pomostów w porcie, płyty nagrobne i trawa na cmentarzu, żwir i kwiaty w ogrodzie, tory i plamy oleju w gazowni; nowe rekwizyty (studnia, pachołek z liną, kotwica, zawór gazowy, urna z kwiatami, grobowce); kute latarnie z szybkami, znicze na kamiennych postumentach, brama z kamiennymi filarami, beczki z klepkami i obręczami, kanistry z etykietą; płaszcz lampiarza z szalikiem, torbą i dłonią na drążku; cienie gubią smugi mroku; ćmy przy latarniach, kurz w świetle latarni, ciepłe światło z okien na bruku. Wszystko statyczne jest rysowane raz na dzielnicę, więc nie spowalnia gry.
- 2.3: jeszcze prościej — usunięte jednorazowe narzędzia (flara, bomba, bandaż); na dole ekranu znów tylko trzy przyciski: Rozbłysk (umiejętność), Latarnia (F) i Czekaj. Samouczek ma 10 kroków. Kupione wcześniej ulepszenie „torba” zamienia się automatycznie w „kieszeń na żar”.
- 2.2: nowa grafika — oświetlenie w wysokiej rozdzielczości (miękkie, okrągłe plamy światła i rozmyte cienie ścian zamiast kafelków), księżycowa poświata w zapamiętanych uliczkach, barwne światło płomieni na bruku, mokre refleksy, poświata płomieni, gradacja kolorów i ziarno; fazowane kamienie, mech, kałuże, okiennice, skrzynki z kwiatami, łukowe drzwi; większe postacie z obrysem i ciepłym światłem latarni. Na słabych komputerach ciężkie efekty wyłączają się same (jest też przełącznik „Efekty świetlne” w Ustawieniach).
- 2.1: uproszczenie — bez ocalałych i dzwonka, beczki nie ranią gracza, Księga mistrza ma 4 czytelne ulepszenia.

## Zawartość

- 3 postacie (2 do odblokowania) z różnymi zdolnościami, 5 rodzajów cieni, mini-boss (Kominiarz Cieni) i boss (Matka Mroku), 19 reliktów, 6 typów dzielnic (wybór ścieżki), 6 zdarzeń fabularnych, ukryte kapliczki.
- 21 osiągnięć (5 sekretnych), część odblokowuje postacie, relikty i wyższe poziomy trudności.
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
    engine.ts    tura gracza, AI wrogów, mrok, warsztat, zdarzenia, wynik, bieżący cel (objective)
    tutorial.ts  interaktywny samouczek: ręcznie zaprojektowana dzielnica + kroki ze skryptami
    tips.ts      wskazówki po przegranej
    meta.ts      profil, statystyki, osiągnięcia, odblokowania
  save/        zapis/odczyt z walidacją i kopią uszkodzonych danych
  render/      renderer Canvas: kafle, oświetlenie (lightmap.ts — mapa światła 4×4 na pole), cząsteczki, sceny menu
  audio/       dźwięk syntezowany w Web Audio API (bez plików audio)
  ui/          React: menu, HUD, modale, księga
tests/         testy logiki (node:test) + bot grający całe noce + bot przechodzący samouczek
tools/         testy E2E w Chromium (Playwright, Python), generator scenariuszy,
               e2e_tutorial.py (cały samouczek w przeglądarce; klawisze z tutorial_keys.ts)
```

Bundler: esbuild (`build.mjs` w katalogu głównym platformy) — buduje grę ze ścieżką bazową `/g/lampiarz/`.

## Licencje

Kod gry: do Twojej dyspozycji. Font Lora (Cyreal) na licencji SIL Open Font License 1.1 — patrz `public/fonts/OFL.txt`. Grafika i dźwięk są generowane proceduralnie w kodzie.
