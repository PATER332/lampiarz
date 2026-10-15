// Contextual advice shown after a lost night: what most likely went wrong and how to avoid it.

import type { Run } from './types';

export function deathTip(run: Run): string {
  const by = run.killedBy ?? '';
  const p = run.player;
  if (by.startsWith('Łowca'))
    return 'Łowca zawsze najpierw celuje: czerwona linia pokazuje, gdzie uderzy w następnej turze. Zrób krok w bok — po szarży stoi obok ciebie i jest łatwym celem.';
  if (by.startsWith('Śmigacz'))
    return 'Śmigacz pokonuje 2 pola na turę, ale żeby uderzyć, musi się zatrzymać obok ciebie. Poczekaj (Spacja), aż podejdzie, i uderz pierwszy.';
  if (by.startsWith('Smolnik') || p.oil <= 0)
    return 'Bez oleju latarnia ledwo świeci, a smolnik parzy. Zbieraj kanistry, a w potrzebie zgaś zbędną latarnię (F) — odda olej. Nie wydawaj ostatnich kropel na umiejętność.';
  if (by.startsWith('Zaćmienie'))
    return 'Napis „ZAĆMIENIE!” nad Matką Mroku ostrzega turę wcześniej. Odejdź poza jej krąg (ok. 2 pola) i wróć po wybuchu. Znicze zaćmienie przetrwają.';
  if (by.startsWith('Matka'))
    return 'Matka Mroku jest ciężka — rusza się co drugą turę. Nie musisz z nią walczyć: odciągnij ją, okrąż i zapal znicze oraz latarnię morską.';
  if (by.startsWith('Cień'))
    return 'Cienie nie wchodzą w blask latarni. Walcz, stojąc w świetle (nie na jego krawędzi), a gdy otoczą cię dwa lub więcej — użyj umiejętności (Q).';
  if (run.district.turn >= 160)
    return 'Zapadła głęboka noc: po 160 turach mrok rośnie dwa razy szybciej. Idź prosto do zniczy — strzałki na brzegu ekranu wskazują drogę.';
  return 'Zapalaj latarnie po drodze do zniczy: każda daje bezpieczny krąg światła i spowalnia mrok. Odpoczywaj w blasku znicza, by leczyć rany.';
}
