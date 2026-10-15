# POPIELNY DZWON

Mroczne fantasy RPG akcji z elementami roguelite — druga gra platformy EVGAMES.

Trzysta dni temu w Wierchołowie pękł dzwon Gromnica. Od tamtej nocy z nieba sypie się popiół, a umarli nie odchodzą. Jesteś dzwonnikiem, któremu odebrano głos. Odzyskaj trzy serca dzwonu — a potem zdecyduj, co z nim zrobić.

Gra działa w całości w przeglądarce (Canvas 2D + Web Audio), bez backendu i bez zewnętrznych zasobów. Grafika i muzyka są generowane proceduralnie w kodzie.

## Uruchamianie

Budowanie, testy i wdrożenie obsługuje katalog główny repozytorium EVGAMES (`npm run build`, `npm test`). Po zbudowaniu gra jest pod `/g/popielny-dzwon/index.html`, a na platformie pod `/play/popielny-dzwon`.

## Jak się gra

- **Pętla:** Krypta Odlewników (hub) → stół z mapą → wyprawa przez losowo złożoną lokację → kapliczki → boss → portal do Krypty. Między wyprawami rozwijasz postać u Halszki, ulepszasz broń przy kowadle i kupujesz relikty u Mumrota.
- **Walka:** lekkie serie, ciężkie ataki ładowane przytrzymaniem, przewrót z klatkami nietykalności, blok i parowanie (wciśnięte tuż przed trafieniem), riposta za potrójne obrażenia, wytrzymałość, równowaga (poise) wrogów i bossów.
- **Czytelne zapowiedzi:** biały błysk — cios do zablokowania/sparowania; czerwony — nie do zablokowania, trzeba zrobić unik lub przeskoczyć.
- **Rezonans:** parowania, idealne uniki i trafienia ładują dzwonki; dwa uwalniają Głos Serca — falę, która rani i niszczy pociski.
- **Śmierć:** niesiony żużel zostaje tam, gdzie zginąłeś. Odzyskaj go, zanim zginiesz ponownie. Porzucenie wyprawy po śmierci oznacza jego utratę.
- **Sekrety:** pęknięte ściany do rozbicia (kryją skrytki i karty kroniki), wydarzenia losowe (duch, Ołtarz Popiołu, wędrowny Mumrot), 5 kart Kroniki odsłaniających prawdę i odblokowujących trzecie zakończenie.

### Sterowanie

| Akcja | Klawiatura / mysz | Pad |
|---|---|---|
| Ruch | A / D, ← → | lewa gałka, krzyżak |
| Skok (przytrzymaj = wyżej), zeskok z kładki | Spacja, S + Spacja | A |
| Lekki atak (seria) | LPM / J | X |
| Ciężki atak (przytrzymaj = ładowanie) | PPM / K | Y |
| Przewrót | Shift / L | B |
| Blok / parowanie | Q / U | LB |
| Głos Serca | R / O | RB |
| Łza Wosku (leczenie) | F | LT |
| Interakcja | E / W | krzyżak ↑ |
| Postać i ekwipunek | Tab / I | Back |
| Pauza | Esc / P | Start |

Menu obsługuje się myszą, klawiaturą (strzałki, Enter/Spacja, Esc) i padem.

## Zawartość

- **3 lokacje** z własną paletą, pogodą, ambientem i przeszkodami: Rynek Wierchołowa (popiół, szubienice, samouczek), Ogród Kamiennych Mnichów (deszcz, kładki, kolce), Katedra Pękniętego Dzwonu (wahadła, kurz w promieniach witraży) + hub Krypta Odlewników.
- **6 typów wrogów** z różnymi wzorcami: Wyrwany, Ogar Żałoby, Strażnik Spiżu (tarcza z przodu), Ćmiara (latająca, pociski do odbicia), Śpiewak Żałobny (wzmacnia innych — przerwij pieśń), Ćmy Dusz; warianty elitarne.
- **3 bossów z dwiema fazami:** Mistrz Ignacy / Kat z Rynku (szarża w ścianę, płonący topór), Brat Ambroży / Pasterz Ciem (latający, rój ciem, nurkowanie, gaszenie światła), Gromnica i Mikołaj / Echo Dzwonu (dzwon spadający i fale dźwięku, potem odlewnik z młotem, łańcuchem i strugami spiżu).
- **3 bronie** zmieniające styl walki: Klucz Dzwonnika (zrównoważony), Sierpy Żałobnicy (szybkie, wirujący ciężki atak, szerokie okno parowania), Młot Odlewni (wolny, odporny na przerwanie, fala uderzeniowa); ulepszenia +1…+3.
- **9 reliktów** — każdy z korzyścią, większość z wyraźną ceną; 2–3 miejsca.
- **Rozwój:** poziomy za żużel, 4 atrybuty (Wigor, Wytrwałość, Siła, Rezonans), Woskowe Ziarna (+1 leczenie).
- **3 zakończenia**, w tym ukryte (wymaga całej Kroniki).

## Zapis

`localStorage`, klucze: `popielnydzwon.save.v1` (postęp) i `popielnydzwon.settings.v1` (ustawienia). Zapis jest wersjonowany i walidowany; uszkodzony zapis jest odkładany pod `…save.v1.corrupt`, a gra pokazuje ostrzeżenie zamiast się wysypać. Gra zapisuje się w bezpiecznych momentach (kapliczki, skrzynie, bossowie, sklep, rozwój), nie co klatkę.

## Struktura

```
src/main.ts               punkt wejścia
src/game.ts               stan gry (tytuł / gra / zakończenie), pętla o stałym kroku, zdarzenia, przejścia
src/core/                 wejście (klawiatura, mysz, pad, bufor), matematyka, RNG
src/data/content.ts       bronie, relikty, wrogowie, lokacje, bossowie, fabuła — wszystkie liczby balansu
src/data/rooms.ts         ręcznie zaprojektowane pokoje (składane losowo w wyprawy)
src/world/                poziom i fizyka, świat (walka, interakcje, kamera), zagrożenia, cząsteczki
src/entities/             gracz, wrogowie, bossowie
src/render/               tła paralaksy, kafelki, postacie, rekwizyty, światło, pogoda, HUD
src/audio/audio.ts        syntezator efektów i muzyka proceduralna (nastroje z płynnym przejściem)
src/ui/                   menu i ekrany (DOM), style
tests/                    testy jednostkowe i symulacyjne (Node) + e2e.py (Chromium)
```

## Testy

```bash
npm test                                                     # z katalogu głównego EVGAMES
python3 games/popielny-dzwon/tests/e2e.py http://localhost:4321 /tmp/shots   # po `npm run preview`
```

Testy symulacyjne uruchamiają prawdziwy świat gry bez przeglądarki: walka, parowanie, riposta, nietykalność przewrotu, tarcza Strażnika, śmierć i odzyskanie popiołu, kapliczki, deterministyczne łupy, sekretne ściany oraz pełne walki z każdym z trzech bossów prowadzone przez skryptowego gracza.

Adres `?debug` włącza haki testowe (`window.__pd`) — używane tylko przez testy E2E.
