# Skrzynkomat

Symulator otwierania skrzynek za wirtualne złotówki. Część platformy EVGAMES:
`/play/skrzynkomat`, bezpośrednio `/g/skrzynkomat/index.html`.

Gra powstała jako jeden plik HTML (`Skrzynkomat.html`, obecnie „Wersja 4”). Na potrzeby buildu EVGAMES
została rozdzielona bez zmian w logice i wyglądzie:

```
index.html       <head> (tytuł, opis, favicon, Google Fonts) + oryginalne znaczniki gry wewnątrz <div id="root">
src/style.css    oryginalne style (+ reset marginesu body i reguła [hidden] z pierwotnego pliku)
src/game.js      oryginalny skrypt gry, bez zmian
src/main.ts      punkt wejścia: importuje style.css i game.js
public/          favicon (romb z logo gry)
```

`#root` jest potrzebny platformie: odtwarzacz EVGAMES uznaje grę za uruchomioną, gdy `#root` ma zawartość.

Zapis: `skrzynkomat.v1` (saldo, ekwipunek, statystyki) i `skrzynkomat.prefs` (ustawienia) w `localStorage`.

Czcionki Rajdhani, Barlow i JetBrains Mono są ładowane z Google Fonts (informacja na stronie Prywatność).
Żeby gra nie łączyła się z serwerami Google, wystarczy wgrać pliki czcionek do `public/fonts/`,
dodać `@font-face` na początku `src/style.css` i usunąć trzy znaczniki `<link>` z `index.html`.

Aktualizacja gry: nową wersję pliku HTML rozdziel tak samo (style → `src/style.css`, skrypt → `src/game.js`,
znaczniki → `index.html` w `#root`) i uruchom `npm test` oraz `npm run preview`.

## Funkcje online (bitwy z ludźmi, wspólna topka)

Od wersji 4 gra próbuje połączyć się z bazą przez `window.claude.use("db" / "user" / "room")` — to
środowisko artefaktów claude.ai. Na EVGAMES (Vercel) tego obiektu nie ma, więc gra sama przechodzi
w tryb offline: w bitwach rywalami są boty (z etykietą BOT), a topka pokazuje gracza i boty.
Prawdziwe bitwy między ludźmi na EVGAMES wymagałyby własnego backendu (np. bazy z WebSocketami).
