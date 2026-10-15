# BABCIA: Dom bez wyjścia

Horror 3D w przeglądarce (React + three.js). Część platformy EVGAMES: `/play/babcia`,
bezpośrednio `/g/babcia/index.html`.

Cel: znaleźć łom, klucz do kłódki, bezpiecznik i klucz główny, zdjąć cztery zabezpieczenia z drzwi
wyjściowych w przybudówce i uciec w ciągu pięciu nocy. Babcia reaguje na hałas, światło latarki i to,
co widzi; każde złapanie to kolejna noc.

## Sterowanie

W A S D ruch · mysz rozglądanie · Shift bieg · C kucanie · E podnieś / drzwi / schowaj się ·
F latarka · R bateria · Esc pauza · Enter pomija scenkę. Na ekranach dotykowych: wirtualny joystick.

## Jak gra jest zintegrowana z EVGAMES

Oryginalny projekt był aplikacją Vite + Tailwind CSS v4 (+ plugin singlefile). Build EVGAMES
(esbuild) kompiluje `src/main.tsx` tak jak inne gry, dlatego:

- źródła z `src/` są skopiowane bez zmian w logice (`App.tsx`, `ui/`, `game/`);
- nieużywany `src/utils/cn.ts` (clsx + tailwind-merge) został pominięty;
- style: `src/styles.tailwind.css` to oryginalny `index.css` autora, a `src/index.css` jest z niego
  **wygenerowany** przez `tools/build-css.mjs` (zwykły CSS, bez potrzeby Tailwinda przy buildzie);
- three.js to zależność `three` (0.186.1) w głównym `package.json` — Vercel instaluje ją sam;
- `index.html` ma polski `lang`, ikonę i znacznik `<!--APP-->` używany przez build EVGAMES.

Po zmianie klas Tailwinda w komponentach trzeba przebudować CSS:

```bash
npx -y -p tailwindcss@4 node games/babcia/tools/build-css.mjs
```

Gra nie zapisuje niczego w `localStorage` (każda rozgrywka zaczyna się od pierwszej nocy).
