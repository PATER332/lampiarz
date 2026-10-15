import { GridBuilder } from './levelBuilder';
import type { LevelDef, Theme } from './types';

/* ------------------------------------------------------------------ */
/*  LEVEL 1 — Zapomniana Jaskinia (tutorial)                           */
/* ------------------------------------------------------------------ */
function level1(): LevelDef {
  const b = new GridBuilder(160, 32);
  // hidden room on the far left
  b.clear(1, 22, 4, 25); b.put(2, 25, '$'); b.vcol(5, 23, 25, 'H');
  // A: start chamber
  b.clear(6, 18, 18, 25); b.fill(16, 24, 18, 25);
  b.put(8, 25, 'P'); b.put(11, 25, '0'); b.put(13, 23, 'C'); b.put(17, 22, 'C');
  // B: steps
  b.clear(19, 14, 30, 25); b.fill(19, 24, 22, 25); b.fill(23, 22, 26, 25); b.fill(27, 20, 30, 25);
  b.crystals([[21, 22], [25, 20], [29, 18]]);
  // C: plateau with shrine
  b.clear(31, 11, 52, 17); b.fill(48, 16, 52, 17);
  b.put(34, 17, '1'); b.put(38, 17, 'U'); b.crystals([[43, 15], [50, 13]]);
  // D: drop
  b.clear(53, 11, 60, 25); b.hrow(55, 57, 20, '-'); b.put(56, 18, 'C');
  // E: first echo puzzle (plate + door)
  b.clear(61, 18, 84, 25); b.put(63, 25, '3'); b.put(67, 25, '2');
  b.vcol(75, 18, 23, '#'); b.vcol(75, 24, 25, 'a'); b.put(79, 25, 'K'); b.put(82, 24, 'C');
  // F: spike pits
  b.clear(85, 17, 108, 25);
  b.hrow(89, 91, 25, '^'); b.hrow(89, 91, 23, '-'); b.put(90, 21, 'C');
  b.hrow(97, 100, 25, '^'); b.hrow(98, 99, 23, '-'); b.put(98, 21, 'C');
  b.put(94, 25, 's'); b.hrow(93, 95, 21, '-'); b.put(94, 19, 'C');
  // G: shadow corridor
  b.clear(109, 19, 124, 25); b.put(111, 25, '4'); b.put(117, 25, 's'); b.put(121, 23, 'C');
  // H: lever puzzle & exit
  b.clear(125, 18, 150, 25); b.put(127, 25, '5'); b.put(131, 25, '6');
  b.vcol(138, 18, 23, '#'); b.vcol(138, 24, 25, 'b'); b.fill(142, 24, 150, 25);
  b.put(147, 23, 'X'); b.crystals([[140, 24], [145, 22], [135, 23]]);
  // hidden room right of exit
  b.fill(151, 22, 152, 23, 'H'); b.clear(153, 20, 156, 23); b.put(155, 23, '$');
  b.decorate(11);
  return {
    id: 'cave', name: 'Zapomniana Jaskinia', subtitle: 'Gdzie wszystko się zaczęło', theme: 'cave', next: 'ruins',
    map: b.build(),
    legend: {
      '0': { type: 'sign', text: 'Ruch: A / D lub strzałki. Skok: Spacja. Zbieraj świecące kryształy — mówią, że ściany tej jaskini pamiętają.' },
      '1': { type: 'sign', text: 'Kryształy to waluta. Przy ołtarzu (naciśnij E) odblokujesz ulepszenia: dłuższe nagrania, więcej ech, wyższy skok...' },
      '2': { type: 'plate', target: 'a' },
      '3': { type: 'sign', text: 'ECHO: naciśnij Q, by zacząć nagrywać. Stań na płycie i naciśnij Q ponownie — echo powtórzy Twoje ruchy i przytrzyma płytę, a Ty przejdź przez drzwi. R rozprasza echa.' },
      'a': { type: 'door', id: 'a' },
      '4': { type: 'sign', text: 'Cienie patrolują ciemność i gonią tego, kogo zobaczą. Skocz im na głowę, by je rozproszyć — albo przemknij obok.' },
      '5': { type: 'sign', text: 'E — pociągnij dźwignię. Echa też potrafią to zrobić, jeśli podczas nagrywania naciśniesz E obok mechanizmu.' },
      '6': { type: 'lever', target: 'b' },
      'b': { type: 'door', id: 'b' },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  LEVEL 2 — Kryształowe Ruiny                                        */
/* ------------------------------------------------------------------ */
function level2(): LevelDef {
  const b = new GridBuilder(170, 40);
  // start
  b.clear(2, 28, 20, 35); b.put(4, 35, 'P'); b.put(6, 35, 'K'); b.put(9, 35, 'U'); b.put(12, 35, '0');
  b.crystals([[15, 33], [18, 33]]);
  // timed-lever corridor
  b.clear(21, 30, 47, 35); b.put(24, 35, '1'); b.put(27, 35, '2');
  b.hrow(36, 38, 35, '^'); b.fill(41, 34, 43, 35, '%'); b.crystals([[33, 33], [42, 32]]);
  b.vcol(48, 34, 35, 'a');
  // vertical shaft
  b.clear(49, 8, 60, 35); b.put(51, 35, 'K');
  const shaft: Array<[number, number, number]> = [[51, 53, 33], [55, 57, 30], [51, 53, 27], [55, 57, 24], [51, 53, 21], [55, 57, 18], [51, 53, 15], [55, 57, 12]];
  for (const [x1, x2, y] of shaft) b.hrow(x1, x2, y, '-');
  b.crystals([[52, 31], [56, 28], [52, 25], [56, 22], [52, 19], [56, 16], [52, 13]]);
  b.hrow(59, 60, 13, '-');
  // upper hall
  b.clear(61, 5, 110, 13); b.hrow(61, 110, 14, '%');
  b.put(66, 13, '4'); b.put(70, 13, '3');
  b.hrow(72, 74, 9, '-'); b.put(73, 7, 'C');
  // guardian corridor (3 tiles tall) + hidden room above it
  b.fill(76, 5, 92, 10, '%'); b.fill(76, 7, 77, 8, 'H'); b.clear(78, 6, 86, 8); b.put(84, 8, '$');
  b.put(84, 13, 'g');
  // two-plate latch
  b.put(95, 13, '7'); b.put(97, 13, '5'); b.put(104, 13, '6'); b.crystals([[100, 11], [106, 11]]);
  b.vcol(108, 5, 11, '%'); b.vcol(108, 12, 13, 'b');
  // drop shaft to lower area
  b.clear(109, 5, 118, 13); b.clear(112, 14, 118, 33);
  b.hrow(113, 115, 20, '-'); b.put(114, 18, 'C'); b.hrow(116, 118, 26, '-'); b.put(117, 24, 'C');
  // lower area: devourer puzzle
  b.clear(112, 26, 163, 35); b.put(120, 35, 'K'); b.put(123, 35, '8'); b.put(128, 35, '9');
  b.put(134, 31, 'v'); b.vcol(140, 26, 33, '%'); b.vcol(140, 34, 35, 'c');
  b.crystals([[144, 33], [148, 33], [131, 33]]); b.put(152, 35, 's'); b.put(160, 35, 'X');
  // hidden room right
  b.fill(164, 33, 165, 35, 'H'); b.clear(166, 32, 168, 35); b.put(167, 35, '$');
  b.decorate(22);
  return {
    id: 'ruins', name: 'Kryształowe Ruiny', subtitle: 'Mechanizmy dawnych budowniczych', theme: 'ruins', next: 'archive',
    map: b.build(),
    legend: {
      '0': { type: 'sign', text: 'Kryształowe Ruiny. Dawni budowniczowie zostawili mechanizmy, które reagują na echa tak samo jak na żywych.' },
      '1': { type: 'lever', target: 'a', timed: 3.5 },
      '2': { type: 'sign', text: 'Ta dźwignia otwiera drzwi tylko na 3,5 sekundy — za krótko, by dobiec. Nagraj echo, które ODCZEKA kilka sekund (stój spokojnie) i dopiero wtedy pociągnie dźwignię. W tym czasie Ty biegnij do drzwi.' },
      'a': { type: 'door', id: 'a' },
      '3': { type: 'plate', target: 'g1' },
      '4': { type: 'sign', text: 'Strażnik Ruin śpi, póki ktoś stoi na runicznej płycie. Zostaw na niej echo i przemknij obok, zanim się ulotni.' },
      'g': { type: 'guardian', range: 6, sleepWhen: 'g1' },
      '5': { type: 'plate', target: 'b' },
      '6': { type: 'plate', target: 'b' },
      '7': { type: 'sign', text: 'Dwie płyty naciśnięte jednocześnie otwierają zamek NA STAŁE. Echo na jednej, Ty na drugiej.' },
      'b': { type: 'door', id: 'b', latch: true },
      '8': { type: 'sign', text: 'Pożeracz Ech wyczuwa Twoje kopie i pochłania je. Przywołaj przynętę z dala od płyty — albo działaj, gdy jest syty i ociężały.' },
      '9': { type: 'plate', target: 'c' },
      'c': { type: 'door', id: 'c' },
      'v': { type: 'devourer', range: 7 },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  LEVEL 3 — Zatopione Archiwum                                       */
/* ------------------------------------------------------------------ */
function level3(): LevelDef {
  const b = new GridBuilder(180, 44);
  // start
  b.clear(2, 6, 20, 13); b.put(4, 13, 'P'); b.put(6, 13, 'K'); b.put(9, 13, 'U'); b.put(12, 13, '0'); b.put(16, 11, 'C');
  // flooded chasm with crumbling bridge
  b.clear(21, 6, 56, 42); b.fill(21, 40, 56, 42, 'w');
  b.hrow(21, 25, 14, '~'); b.hrow(28, 32, 14, '~'); b.hrow(36, 40, 14, '~');
  b.crystals([[23, 12], [30, 12], [38, 12], [47, 11], [51, 11]]);
  b.put(42, 14, '1');
  // landing corridor
  b.clear(57, 6, 75, 13); b.put(60, 12, 'C'); b.put(62, 13, 'K'); b.put(65, 13, '2');
  b.clear(70, 14, 75, 15);
  // hidden room left of hall
  b.clear(58, 35, 61, 38); b.put(59, 38, '$'); b.vcol(62, 36, 38, 'H');
  // the archive hall
  b.clear(63, 16, 125, 38);
  b.hrow(63, 71, 35, '%'); b.hrow(72, 80, 31, '%'); b.hrow(84, 92, 27, '%'); b.hrow(96, 104, 31, '%');
  b.hrow(108, 116, 34, '%'); b.hrow(118, 124, 29, '%');
  b.hrow(81, 83, 29, '-'); b.hrow(93, 95, 30, '-'); b.hrow(105, 107, 33, '-');
  b.crystals([[76, 29], [88, 25], [100, 29], [112, 32], [121, 27], [68, 37], [118, 37], [83, 27]]);
  b.put(90, 38, 's'); b.put(88, 26, 's'); b.put(112, 33, 's');
  // water pit in hall floor with planks
  b.clear(106, 39, 110, 41); b.fill(106, 40, 110, 41, 'w'); b.hrow(107, 109, 37, '-');
  // two timed levers -> door d
  b.put(97, 38, '3'); b.put(100, 38, '4'); b.put(124, 38, '5');
  b.vcol(126, 37, 38, 'd');
  // vertical mover shaft
  b.clear(127, 14, 133, 38); b.put(128, 38, '6');
  // upper corridor
  b.clear(134, 14, 178, 22); b.put(136, 22, 'K'); b.hrow(141, 142, 22, '^');
  b.clear(147, 23, 151, 42); b.fill(147, 40, 151, 42, 'w'); b.hrow(147, 151, 23, '~');
  b.put(158, 22, 's'); b.crystals([[139, 20], [149, 20], [156, 20], [165, 20]]); b.put(176, 22, 'X');
  b.put(168, 22, '7'); b.put(170, 22, 'V');
  // hidden nook above exit corridor
  b.hrow(164, 165, 19, '-'); b.hrow(168, 170, 16, '-'); b.vcol(171, 14, 15, 'H');
  b.clear(172, 11, 176, 15); b.fill(172, 16, 176, 16, '#'); b.put(174, 15, '$');
  b.decorate(33);
  return {
    id: 'archive', name: 'Zatopione Archiwum', subtitle: 'Półki, które pamiętają za dużo', theme: 'archive', next: 'gardens',
    map: b.build(),
    legend: {
      '0': { type: 'sign', text: 'Zatopione Archiwum. Kruche półki pękają pod stopami, a czarna woda jest śmiertelna. Ruchome platformy wciąż działają — bądź cierpliwy.' },
      '1': { type: 'mover', dx: 12, dy: 0, speed: 0.8, w: 3 },
      '2': { type: 'sign', text: 'W dole leży wielka sala archiwum. Cienie krążą między półkami. Szukaj dwóch dźwigni.' },
      '3': { type: 'sign', text: 'Dwie dźwignie, cztery sekundy każda — obie muszą działać naraz. Echo powtarza również Twoje CZEKANIE: odczekaj w nagraniu, nim pociągniesz.' },
      '4': { type: 'lever', target: 'd', timed: 4 },
      '5': { type: 'lever', target: 'd', timed: 4 },
      'd': { type: 'door', id: 'd' },
      '6': { type: 'mover', dx: 0, dy: -20, speed: 0.7, w: 3 },
      '7': { type: 'sign', text: 'Za kratami drzemie Szept, Tkaczka Cieni. Uwolnij ją [E] — odda Ci Kotwicę Cienia, Dash i wspinaczkę po ścianach. Postacie zmienisz klawiszem [C].' },
      'V': { type: 'captive', char: 'weaver' },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  LEVEL 4 — Serce Podziemi                                           */
/* ------------------------------------------------------------------ */
function level4(): LevelDef {
  const b = new GridBuilder(176, 44);
  // start
  b.clear(2, 30, 20, 37); b.put(4, 37, 'P'); b.put(6, 37, 'K'); b.put(9, 37, 'U'); b.put(12, 37, '0'); b.put(16, 35, 'C');
  // gauntlet
  b.clear(21, 28, 60, 37); b.hrow(26, 27, 37, '^'); b.hrow(33, 35, 37, '^'); b.hrow(33, 35, 35, '-');
  b.fill(45, 36, 47, 37, '%'); b.fill(55, 36, 58, 37, '%');
  b.put(41, 37, 's'); b.put(52, 37, 's'); b.crystals([[30, 35], [38, 35], [46, 33], [56, 33]]); b.put(60, 37, 'K');
  // puzzle A: three plates latch
  b.clear(61, 28, 95, 37); b.put(63, 37, '1'); b.put(67, 37, '2'); b.put(74, 37, '3'); b.put(81, 37, '4');
  b.vcol(88, 28, 35, '%'); b.vcol(88, 36, 37, 'a'); b.crystals([[70, 35], [78, 35], [91, 35]]);
  // puzzle B: guardian + devourer
  b.clear(89, 30, 130, 37); b.put(92, 37, '5'); b.put(96, 37, '6');
  b.fill(102, 30, 118, 34, '%'); b.put(110, 37, 'g'); b.put(94, 31, 'v'); b.put(122, 37, 'K');
  b.crystals([[125, 35], [128, 35], [106, 36]]);
  // hidden tunnel above guardian corridor
  b.hrow(98, 101, 34, '-'); b.fill(102, 32, 107, 33, 'H'); b.clear(108, 31, 112, 33); b.put(110, 33, '$');
  // final chamber
  b.clear(131, 8, 168, 37); b.put(134, 37, '7'); b.put(137, 37, '8');
  const climb: Array<[number, number, number]> = [[140, 142, 35], [145, 147, 32], [150, 152, 29], [155, 157, 26], [160, 162, 23], [155, 157, 20], [150, 152, 17], [145, 147, 14]];
  for (const [x1, x2, y] of climb) b.hrow(x1, x2, y, '-');
  b.hrow(131, 143, 13, '%'); b.vcol(138, 8, 10, '%'); b.vcol(138, 11, 12, 'b'); b.put(134, 12, 'X');
  b.put(158, 30, 'v'); b.hrow(148, 160, 37, '^');
  b.crystals([[141, 33], [151, 27], [161, 21], [146, 12], [156, 18]]);
  // hidden room right
  b.hrow(164, 167, 34, '-'); b.vcol(169, 32, 33, 'H'); b.clear(170, 30, 174, 33); b.put(172, 33, '$');
  b.decorate(44);
  return {
    id: 'heart', name: 'Serce Podziemi', subtitle: 'Tu echa są najgłośniejsze', theme: 'heart', next: 'abyss',
    map: b.build(),
    legend: {
      '0': { type: 'sign', text: 'Serce Podziemi. Tu echa przeszłości są najsilniejsze — i najbardziej potrzebne. Na końcu czeka Rdzeń.' },
      '1': { type: 'sign', text: 'Trzy płyty, jeden zamek. Dwa echa i Ty — wszyscy naraz. Zamek otwiera się na stałe.' },
      '2': { type: 'plate', target: 'a' },
      '3': { type: 'plate', target: 'a' },
      '4': { type: 'plate', target: 'a' },
      'a': { type: 'door', id: 'a', latch: true },
      '5': { type: 'sign', text: 'Strażnik i Pożeracz pilnują razem. Najpierw przynęta dla Pożeracza, potem echo na płycie — i biegnij.' },
      '6': { type: 'plate', target: 'g2' },
      'g': { type: 'guardian', range: 6, sleepWhen: 'g2' },
      'v': { type: 'devourer', range: 6 },
      '7': { type: 'lever', target: 'b', timed: 8 },
      '8': { type: 'sign', text: 'Wrota Rdzenia otwierają się na osiem sekund. Nagraj echo, które ODCZEKA, nim pociągnie dźwignię — i wspinaj się, zanim je pociągnie.' },
      'b': { type: 'door', id: 'b' },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  LEVEL 5 — Ogrody Rezonansu (springs, updrafts, prisms, veils)      */
/* ------------------------------------------------------------------ */
function level5(): LevelDef {
  const b = new GridBuilder(190, 44);
  // A: start
  b.clear(2, 30, 22, 37); b.put(4, 37, 'P'); b.put(6, 37, 'K'); b.put(9, 37, 'U'); b.put(12, 37, '0');
  b.crystals([[16, 35], [19, 35]]);
  // B: spring up to a plateau
  b.clear(23, 24, 33, 37); b.put(25, 37, '1'); b.put(32, 38, 'S'); b.put(28, 35, 'C');
  b.clear(34, 24, 52, 30); b.crystals([[38, 29], [44, 29], [50, 29]]);
  b.vcol(34, 35, 37, 'H'); b.clear(35, 33, 39, 37); b.put(37, 37, '$');
  // C: updraft shaft
  b.clear(53, 8, 60, 30); b.fill(55, 10, 58, 30, 'W'); b.put(54, 30, '2');
  b.crystals([[56, 25], [57, 19], [56, 13]]);
  // D: prism lesson — reflection reaches a plate behind the blue veil
  b.clear(61, 4, 112, 12); b.put(64, 12, '3'); b.put(84, 12, 'M'); b.put(75, 12, 'm'); b.put(89, 13, 'S');
  b.hrow(92, 96, 8, '#'); b.vcol(91, 9, 12, 'B'); b.vcol(97, 9, 12, '#'); b.put(93, 12, '4');
  b.vcol(104, 9, 12, 'a'); b.fill(104, 4, 104, 8, '#');
  b.crystals([[70, 10], [78, 10], [100, 10]]);
  // E: drop shaft with a hidden room
  b.clear(106, 13, 112, 30); b.crystals([[108, 20], [109, 26]]);
  b.vcol(105, 28, 30, 'H'); b.clear(100, 27, 104, 30); b.put(102, 30, '$');
  // F: snappers, then a double-plate prism puzzle
  b.clear(113, 24, 160, 30); b.put(115, 30, '5');
  b.put(121, 30, 'n'); b.put(127, 30, 'n'); b.crystals([[118, 28], [124, 28], [130, 28]]);
  b.put(131, 30, '6'); b.put(133, 30, '7'); b.put(140, 30, 'M');
  b.vcol(145, 27, 30, 'B'); b.hrow(146, 149, 26, '#'); b.vcol(150, 27, 30, '#'); b.put(147, 30, '8');
  b.put(143, 31, 'S');
  b.vcol(153, 27, 30, 'b'); b.fill(153, 24, 153, 26, '#');
  // G: amber veil demo, chimney secret, exit
  b.clear(154, 24, 188, 30); b.put(156, 30, 'K'); b.put(161, 30, '9'); b.vcol(164, 27, 30, 'Z'); b.put(185, 30, 'X');
  b.put(170, 31, 'S'); b.clear(166, 16, 174, 23); b.fill(168, 16, 172, 23, 'W');
  b.crystals([[170, 20], [170, 17], [178, 28], [182, 28]]);
  b.vcol(175, 17, 19, 'H'); b.clear(176, 16, 179, 19); b.put(178, 19, '$');
  b.decorate(55);
  return {
    id: 'gardens', name: 'Ogrody Rezonansu', subtitle: 'Gdzie światło zakrzywia echa', theme: 'gardens', next: 'forge',
    map: b.build(),
    legend: {
      '0': { type: 'sign', text: 'Ogrody Rezonansu. Zarodniki świecą, grzyby sprężynują, a kryształowe pryzmaty zakrzywiają echa. Tutaj obowiązują inne reguły.' },
      '1': { type: 'sign', text: 'GRZYB SPRĘŻYSTY: stań na nim, a wyrzuci Cię wysoko. Steruj w locie i uważaj na sufit.' },
      '2': { type: 'sign', text: 'PRĄD ZARODNIKÓW unosi wszystko, co lekkie. Wejdź w kolumnę i płyń w górę, sterując na boki.' },
      '3': { type: 'sign', text: 'PRYZMAT ECHA: gdy echo przejdzie przez pryzmat, po drugiej stronie powstaje jego ODBICIE. Błękitna Zasłona zatrzymuje żywych, ale nie echa. Nagraj przejście PRZEZ pryzmat aż do świecącej runy — odbicie dotrze na płytę za zasłoną.' },
      '4': { type: 'plate', target: 'a' },
      'a': { type: 'door', id: 'a', latch: true },
      '5': { type: 'sign', text: 'ŻARŁACZE czają się w ściółce. Gdy podejdziesz, kłapną — przeskocz je albo zdepcz, póki są spokojne.' },
      '6': { type: 'sign', text: 'Dwie płyty naraz: ta tutaj dla echa, a ta za zasłoną — dla jego odbicia. Pryzmat stoi dokładnie pośrodku. Nagraj marsz od pryzmatu aż na tę płytę.' },
      '7': { type: 'plate', target: 'b' },
      '8': { type: 'plate', target: 'b' },
      'b': { type: 'door', id: 'b', latch: true },
      '9': { type: 'sign', text: 'BURSZTYNOWA ZASŁONA rozprasza każde echo, które jej dotknie. Ty przejdziesz bez szwanku. Dalej leży Kuźnia Widm.' },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  LEVEL 6 — Kuźnia Widm (wraiths, echo lifts, spike blocks, keys)    */
/* ------------------------------------------------------------------ */
function level6(): LevelDef {
  const b = new GridBuilder(190, 44);
  // A: start
  b.clear(2, 30, 22, 37); b.put(4, 37, 'P'); b.put(6, 37, 'K'); b.put(9, 37, 'U'); b.put(12, 37, '0'); b.crystals([[16, 35], [19, 35]]);
  // B: wraith corridor
  b.clear(23, 30, 60, 37); b.put(25, 37, '1'); b.put(42, 33, 'r');
  b.hrow(30, 32, 34, '-'); b.hrow(48, 50, 34, '-'); b.crystals([[31, 33], [49, 33], [38, 36], [55, 36]]);
  // C: echo lift hall
  b.clear(61, 16, 75, 37); b.clear(76, 16, 90, 19);
  b.put(63, 37, '2'); b.put(66, 37, '3'); b.put(72, 36, '4'); b.crystals([[73, 30], [73, 24], [80, 18], [86, 18]]);
  b.vcol(76, 35, 37, 'H'); b.clear(77, 33, 83, 37); b.put(80, 37, '$');
  // D: spike block gauntlet
  b.clear(91, 10, 130, 19); b.put(92, 19, '5');
  b.put(96, 19, '6'); b.put(112, 12, '7'); b.put(119, 12, '8');
  b.crystals([[100, 17], [108, 17], [115, 13], [125, 17]]); b.put(124, 19, 's');
  // E: key pit guarded by a wraith, then the lock
  b.clear(131, 10, 160, 19); b.put(133, 19, '9');
  b.clear(141, 20, 149, 26); b.put(142, 27, 'S'); b.put(148, 26, 'k'); b.put(146, 23, 'r');
  b.vcol(156, 16, 19, 'L'); b.fill(156, 10, 156, 15, '#');
  b.crystals([[136, 17], [152, 17], [144, 24]]);
  // F: two plates, one lift, exit
  b.clear(161, 8, 175, 19); b.clear(176, 8, 188, 11);
  b.put(163, 19, 'K'); b.put(166, 19, 'a'); b.put(169, 19, 'a'); b.put(174, 19, 'b'); b.put(171, 18, 'c');
  b.put(186, 11, 'X'); b.crystals([[172, 12], [180, 10], [184, 10]]);
  b.vcol(176, 17, 19, 'H'); b.clear(177, 16, 181, 19); b.put(179, 19, '$');
  b.decorate(66);
  return {
    id: 'forge', name: 'Kuźnia Widm', subtitle: 'Piece wygasły, lecz coś w nich pozostało', theme: 'forge', next: 'spire',
    map: b.build(),
    legend: {
      '0': { type: 'sign', text: 'Kuźnia Widm. Piece wygasły wieki temu, ale w ich żarze wciąż krążą Widma. Patrz im prosto w oczy.' },
      '1': { type: 'sign', text: 'WIDMO porusza się tylko wtedy, gdy na nie nie patrzysz. Idź w jego stronę — zamrze. Odwróć się — ruszy za Tobą. Światło echa również je unieruchamia.' },
      '2': { type: 'sign', text: 'WINDA ECHA jedzie w górę, dopóki płyta jest wciśnięta — i wraca, gdy ją zwolnisz. Zostaw echo na płycie i wsiadaj.' },
      '3': { type: 'plate', target: 'l1' },
      '4': { type: 'mover', dx: 0, dy: -18, speed: 0.9, w: 3, when: 'l1' },
      '5': { type: 'sign', text: 'KOLCZASTE BLOKI suną po torach. Poziome przeskakuj, pod pionowymi przebiegaj, gdy są u góry.' },
      '6': { type: 'mover', dx: 10, dy: 0, speed: 1.0, w: 2, spikes: true },
      '7': { type: 'mover', dx: 0, dy: 7, speed: 0.8, w: 2, spikes: true },
      '8': { type: 'mover', dx: 0, dy: 7, speed: 0.8, w: 2, spikes: true, phase: 0.5 },
      '9': { type: 'sign', text: 'KLUCZ PAMIĘCI otwiera zamek na stałe — ale unieść go może tylko żywa dłoń. W dole czeka Widmo. Grzyb wyniesie Cię z powrotem.' },
      'k': { type: 'key', id: 'k1' },
      'L': { type: 'lock', id: 'k1' },
      'a': { type: 'plate', target: 'l2' },
      'b': { type: 'sign', text: 'Dwie płyty, jedna winda. Zostaw dwa echa i jedź na górę — wyjście jest na półce.' },
      'c': { type: 'mover', dx: 0, dy: -8, speed: 0.9, w: 3, when: 'l2' },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  LEVEL 7 — Pęknięta Wieża (vertical; portals + everything combined) */
/* ------------------------------------------------------------------ */
function level7(): LevelDef {
  const b = new GridBuilder(64, 84);
  // F1 (bottom): portals intro
  b.clear(2, 68, 60, 76); b.put(4, 76, 'P'); b.put(6, 76, 'K'); b.put(9, 76, 'U'); b.put(12, 76, '0');
  b.put(30, 76, 's'); b.put(44, 76, 's');
  b.hrow(22, 24, 73, '-'); b.hrow(36, 38, 73, '-'); b.crystals([[23, 72], [37, 72], [18, 75], [50, 75]]);
  b.put(52, 76, '1'); b.put(56, 76, 'p');
  // fake floor secret with a spring to get back up
  b.hrow(39, 41, 77, 'H'); b.clear(38, 78, 44, 82); b.put(40, 83, 'S'); b.put(43, 82, '$');
  // F2: timed lever sprint, snapper, devourer, updraft to F3
  b.clear(2, 56, 60, 64); b.put(4, 64, 'p'); b.put(7, 64, '2'); b.put(12, 64, '3'); b.put(24, 64, 'n');
  b.vcol(34, 61, 64, 'b'); b.fill(34, 56, 34, 60, '#'); b.put(46, 60, 'v');
  b.clear(54, 53, 57, 64); b.fill(54, 46, 57, 64, 'W');
  b.crystals([[26, 62], [44, 62], [56, 58], [20, 62]]);
  b.vcol(61, 62, 64, 'H'); b.clear(62, 61, 63, 64); b.put(63, 64, '$');
  // F3: prism + devourer bait; door to the updraft
  b.clear(2, 44, 60, 52); b.put(22, 52, 'K'); b.put(36, 52, '4'); b.put(40, 52, 'M'); b.put(33, 52, 'm'); b.put(30, 48, 'v');
  b.hrow(44, 53, 48, '#'); b.vcol(43, 49, 52, 'B'); b.put(47, 52, '5'); b.fill(50, 49, 51, 52, '#');
  b.vcol(20, 49, 52, 'c'); b.fill(20, 44, 20, 48, '#');
  b.clear(4, 41, 7, 43); b.fill(4, 36, 7, 52, 'W');
  b.crystals([[12, 50], [26, 50], [38, 46], [55, 50]]);
  // F4: guardian corridor, wraith, portal to F5
  b.clear(2, 32, 60, 40); b.put(10, 40, 'K'); b.put(13, 40, '6'); b.put(16, 40, '8'); b.put(30, 40, 'G'); b.put(22, 40, 'n'); b.put(46, 36, 'r');
  b.hrow(26, 28, 37, '-'); b.hrow(38, 40, 37, '-'); b.put(57, 40, 'q');
  b.crystals([[16, 38], [27, 36], [39, 36], [52, 38]]);
  b.vcol(61, 38, 40, 'H'); b.clear(62, 37, 63, 40); b.put(63, 40, '$');
  // F5: three seals (player-only plate, echo plate, reflection plate)
  b.clear(2, 18, 60, 28); b.put(4, 28, 'q'); b.put(6, 28, 'K'); b.put(9, 28, '7');
  b.put(12, 28, 'x'); b.put(24, 28, 'y'); b.put(36, 28, 'M'); b.put(27, 28, 'm'); b.put(55, 22, 'r');
  b.hrow(42, 47, 24, '#'); b.vcol(41, 25, 28, 'B'); b.put(45, 28, 'z'); b.fill(48, 25, 49, 28, '#'); b.hrow(38, 39, 26, '-');
  b.vcol(52, 25, 28, 'd'); b.fill(52, 18, 52, 24, '#'); b.put(58, 28, 'X');
  b.crystals([[16, 26], [30, 26], [44, 22], [55, 26]]);
  b.vcol(61, 26, 28, 'H'); b.clear(62, 25, 63, 28); b.put(63, 28, '$');
  b.decorate(77);
  return {
    id: 'spire', name: 'Pęknięta Wieża', subtitle: 'Wspinaczka przez pęknięcia w czasie', theme: 'spire', next: 'heart',
    map: b.build(),
    legend: {
      '0': { type: 'sign', text: 'Pęknięta Wieża. Czas pękł tu na warstwy — każda wyżej od poprzedniej. Szczeliny łączą to, co rozdzielone.' },
      '1': { type: 'sign', text: 'SZCZELINA CZASU: wejdź w nią, a wyjdziesz z bliźniaczej szczeliny gdzie indziej. Echo nagrane podczas przejścia także przeskoczy.' },
      'p': { type: 'portal', id: 'A' },
      '2': { type: 'sign', text: 'Dźwignia otwiera wrota tylko na 5 sekund. Biegnij — albo nagraj echo, które odczeka i pociągnie dźwignię, gdy będziesz już przy wrotach.' },
      '3': { type: 'lever', target: 'b', timed: 5 },
      'b': { type: 'door', id: 'b' },
      '4': { type: 'sign', text: 'Pożeracz czeka po lewej, płyta skryta za zasłoną po prawej. Przejdź przez pryzmat do runy: oryginał będzie przynętą, a odbicie zrobi resztę.' },
      '5': { type: 'plate', target: 'c' },
      'c': { type: 'door', id: 'c', latch: true },
      '6': { type: 'sign', text: 'Strażnik śpi, póki ktoś stoi na płycie. Półki nad korytarzem też prowadzą dalej — Widmo nie śpi nigdy.' },
      '8': { type: 'plate', target: 'g4' },
      'G': { type: 'guardian', range: 5, sleepWhen: 'g4' },
      'q': { type: 'portal', id: 'B' },
      '7': { type: 'sign', text: 'Trzy pieczęcie: bursztynowa płyta reaguje tylko na żywych, środkowa na echo, a trzecia za zasłoną — na odbicie z pryzmatu. Wszystkie naraz.' },
      'x': { type: 'plate', target: 'd', noEcho: true },
      'y': { type: 'plate', target: 'd' },
      'z': { type: 'plate', target: 'd' },
      'd': { type: 'door', id: 'd', latch: true },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  AKT II — LEVEL 8: Głębia Zapomnienia (gejzery, pełzacze, zegar)     */
/* ------------------------------------------------------------------ */
function level8(): LevelDef {
  const b = new GridBuilder(150, 40);
  // A: brzeg przebudzenia
  b.clear(2, 29, 20, 35); b.put(4, 35, 'P'); b.put(6, 35, 'K'); b.put(9, 35, 'U'); b.put(12, 35, '0');
  b.crystals([[15, 33], [18, 33]]);
  // B: sala pełzaczy z sekretem w martwym końcu
  b.clear(21, 29, 33, 35); b.put(23, 35, '1');
  b.put(28, 35, 'e'); b.put(31, 35, 'e');
  b.hrow(24, 27, 32, '-'); b.crystals([[25, 31], [30, 33]]);
  b.fill(34, 33, 34, 35, 'H'); b.clear(35, 32, 38, 35); b.put(36, 35, '$');
  // B2: górny trakt nad sekretem
  b.hrow(28, 31, 32, '-'); b.hrow(30, 33, 29, '-'); b.clear(32, 25, 46, 28);
  b.crystals([[37, 27], [42, 27]]);
  // C: szyb gejzerów
  b.clear(47, 25, 72, 35); b.put(48, 35, '2');
  b.fill(53, 29, 54, 34, 'J'); b.fill(60, 31, 61, 34, 'J');
  b.hrow(56, 59, 32, '-'); b.hrow(63, 66, 28, '-');
  b.put(66, 35, 'e'); b.crystals([[57, 31], [64, 27], [69, 33]]);
  // D: brama zegarowa
  b.clear(73, 29, 97, 35); b.put(74, 35, '3');
  b.put(78, 35, '4'); b.put(88, 35, 'e');
  b.hrow(82, 85, 32, '-'); b.crystals([[83, 31], [91, 33]]);
  b.vcol(94, 29, 35, 'b');
  // E: korytarz strażników
  b.clear(98, 29, 122, 35); b.put(99, 35, '5');
  b.put(105, 35, 't'); b.put(112, 33, 'f'); b.put(118, 35, 't');
  b.hrow(108, 111, 32, '-'); b.crystals([[109, 31], [115, 33]]);
  // F: wyjście
  b.clear(123, 29, 148, 35); b.put(124, 35, '6'); b.put(128, 35, 'K');
  b.crystals([[132, 33], [137, 33], [141, 33]]); b.put(145, 35, 'X');
  b.decorate(808);
  return {
    id: 'abyss', name: 'Głębia Zapomnienia', subtitle: 'Akt II — gdzie pamięć tonie', theme: 'abyss', next: 'mire',
    map: b.build(),
    legend: {
      '0': { type: 'sign', text: 'AKT II · GŁĘBIA ZAPOMNIENIA. Rdzeń wskazał drogę jeszcze niżej. Tu skały pamiętają nie tylko ruch, ale i czas.' },
      '1': { type: 'sign', text: 'PEŁZACZE suną po dnie i rzucają się na wszystko, co żywe. Zdepcz je z góry albo przeskocz — kontakt boli.' },
      '2': { type: 'sign', text: 'GEJZERY wyrzucają pył falami. Stań w kolumnie w chwili wybuchu, by wzbić się na wyższą półkę — poza falą nic nie unosi.' },
      '3': { type: 'sign', text: 'PŁYTA ZEGARA pozostaje naciśnięta kilka sekund po opuszczeniu. Zdążysz przejść — albo zostaw na niej echo, które naciśnie ją ponownie.' },
      '4': { type: 'plate', target: 'b', timed: 5 },
      'b': { type: 'door', id: 'b' },
      '5': { type: 'sign', text: 'STRAŻNICY OTCHŁANI widzą wyłącznie ruch, a DUSZKI unoszą się tuż nad ziemią. Dash przeprowadzi Cię przez ostrza ich spojrzeń.' },
      '6': { type: 'sign', text: 'Szczelina wiodąca niżej. Za nią rozciągają się Mokradła Czasu — miejsce, gdzie woda pamięta każdą kroplę.' },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  AKT II — LEVEL 9: Mokradła Czasu (duszki, sprężyny, echo-płyta)    */
/* ------------------------------------------------------------------ */
function level9(): LevelDef {
  const b = new GridBuilder(150, 40);
  // A: start
  b.clear(2, 29, 20, 35); b.put(4, 35, 'P'); b.put(6, 35, 'K'); b.put(9, 35, 'U'); b.put(12, 35, '0');
  b.crystals([[15, 33], [18, 33]]);
  // B: bagna duszków
  b.clear(21, 27, 42, 35); b.put(23, 35, '1');
  b.put(28, 33, 'f'); b.put(35, 31, 'f');
  b.hrow(26, 29, 32, '-'); b.hrow(33, 36, 30, '-'); b.hrow(38, 41, 32, '-');
  b.crystals([[27, 31], [34, 29], [39, 31]]);
  // sekret nad sklepieniem: fałszywa skała odsłania komnatę po skoku z półki
  b.fill(32, 27, 36, 27, 'H'); b.clear(32, 24, 36, 26); b.put(34, 26, '$');
  // C: komora sprężyn
  b.clear(43, 24, 70, 35); b.put(44, 35, '2');
  b.put(49, 35, 'S'); b.put(58, 35, 'S');
  b.hrow(51, 54, 31, '-'); b.hrow(60, 63, 27, '-'); b.hrow(52, 55, 22, '-');
  b.put(56, 35, 'e'); b.crystals([[52, 30], [61, 26], [53, 21]]);
  // D: trzecia osoba — płyta tylko dla ech
  b.clear(71, 29, 98, 35); b.put(72, 35, '3');
  b.put(77, 35, '4'); b.hrow(82, 85, 32, '-');
  b.put(90, 35, 't'); b.crystals([[83, 31], [93, 33]]);
  b.vcol(95, 29, 35, 'c');
  // E: rozlewisko pełzaczy
  b.clear(99, 29, 124, 35); b.put(100, 35, '5');
  b.put(104, 35, 'e'); b.put(110, 35, 'e'); b.put(116, 33, 'f');
  b.hrow(106, 109, 32, '-'); b.crystals([[107, 31], [113, 33], [120, 33]]);
  // F: wyjście
  b.clear(125, 29, 148, 35); b.put(126, 35, '6'); b.put(130, 35, 'K');
  b.crystals([[134, 33], [139, 33], [143, 33]]); b.put(145, 35, 'X');
  b.decorate(909);
  return {
    id: 'mire', name: 'Mokradła Czasu', subtitle: 'Woda pamięta każdą kroplę', theme: 'mire', next: 'citadel',
    map: b.build(),
    legend: {
      '0': { type: 'sign', text: 'MOKRADŁA CZASU. Woda w tych bagnach płynie wstecz. Cokolwiek w niej zanurzysz, wróci — ale niekoniecznie w całości.' },
      '1': { type: 'sign', text: 'DUSZKI unoszą się tuż nad ziemią i nie zważają na ściany. Odbijają się od Twojego światła — ale nie na długo.' },
      '2': { type: 'sign', text: 'GRZYBY SPRĘŻYSTE wyrzucają Cię wysoko w górę. Złap się półek i nie spadnij do rozlewiska.' },
      '3': { type: 'sign', text: 'PŁYTA TYLKO DLA ECH reaguje wyłącznie na nagrane kopie. Nagraj siebie stojącego na niej, potem podejdź do wrót i przywołaj echo.' },
      '4': { type: 'plate', target: 'c', echoOnly: true },
      'c': { type: 'door', id: 'c' },
      '5': { type: 'sign', text: 'Tu pełzacze mają przewagę liczebną. Skacz z półki na półkę i nie daj się zepchnąć w wodę.' },
      '6': { type: 'sign', text: 'Most prowadzi do Twierdzy Ciszy. Tam wrogowie mają oczy, a kamienie — pamięć.' },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  AKT II — LEVEL 10: Twierdza Ciszy (strażnicy, klucz, pryzmat)      */
/* ------------------------------------------------------------------ */
function level10(): LevelDef {
  const b = new GridBuilder(150, 40);
  // A: start
  b.clear(2, 29, 20, 35); b.put(4, 35, 'P'); b.put(6, 35, 'K'); b.put(9, 35, 'U'); b.put(12, 35, '0');
  b.crystals([[15, 33], [18, 33]]);
  // B: korytarz strażników
  b.clear(21, 29, 46, 35); b.put(23, 35, '1');
  b.put(29, 35, 't'); b.put(38, 35, 't');
  b.hrow(33, 36, 32, '-'); b.hrow(41, 44, 32, '-');
  b.crystals([[34, 31], [42, 31]]);
  // sekret w ślepym końcu
  b.fill(21, 33, 21, 35, 'H'); b.clear(17, 32, 20, 35); b.put(18, 35, '$');
  // C: komora pryzmatu
  b.clear(47, 24, 72, 35); b.put(48, 35, '2');
  b.put(54, 35, 'M'); b.put(50, 35, 'm');
  b.put(62, 35, '4'); b.vcol(67, 29, 35, 'a');
  b.put(70, 33, 'f'); b.crystals([[56, 33], [63, 33]]);
  // D: studnia z kluczem
  b.clear(73, 29, 98, 35); b.put(74, 35, '3');
  b.put(79, 35, 'e'); b.put(85, 35, 't');
  b.hrow(81, 84, 32, '-'); b.put(82, 31, 'k');
  b.crystals([[77, 33], [90, 33]]);
  b.vcol(94, 29, 35, 'l');
  // E: sala pełzaczy i duszków
  b.clear(99, 27, 124, 35); b.put(100, 35, '5');
  b.put(104, 35, 'e'); b.put(110, 33, 'f'); b.put(117, 35, 'e');
  b.hrow(106, 109, 31, '-'); b.hrow(113, 116, 29, '-');
  b.crystals([[107, 30], [114, 28], [120, 33]]);
  // F: wyjście
  b.clear(125, 29, 148, 35); b.put(126, 35, '6'); b.put(130, 35, 'K');
  b.crystals([[134, 33], [139, 33], [143, 33]]); b.put(145, 35, 'X');
  b.decorate(1010);
  return {
    id: 'citadel', name: 'Twierdza Ciszy', subtitle: 'Kamienie, które pamiętają wszystko', theme: 'citadel', next: 'rift',
    map: b.build(),
    legend: {
      '0': { type: 'sign', text: 'TWIERDZA CISZY. Tu nie wolno mówić głośno — kamienie zapisują każde słowo i oddają je po latach.' },
      '1': { type: 'sign', text: 'STRAŻNICY zastygli w gotowości. Gdy Cię zobaczą, wypalają w Twoim kierunku skupioną pamięć. Dash pozwala przejść przez ich salwę.' },
      '2': { type: 'sign', text: 'PRYZMAT ECHA rozszczepia nagranie. Echo idące przez niego zostawia odbicie, które biegnie w przeciwną stronę.' },
      '3': { type: 'sign', text: 'KLUCZ PAMIĘCI otwiera zamek na stałe. Nie zgub go — bez klucza brama pozostanie wiecznie zamknięta.' },
      '4': { type: 'plate', target: 'a' },
      'a': { type: 'door', id: 'a' },
      'k': { type: 'key', id: 'k1' },
      'l': { type: 'lock', id: 'k1' },
      '5': { type: 'sign', text: 'Przed Tobą ostatnia próba. Tam czeka Rozpadlina — miejsce, z którego nie ma już drogi w dół.' },
      '6': { type: 'sign', text: 'Wejście do Rozpadliny. Przygotuj się — echo będzie potrzebne jak nigdy wcześniej.' },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  AKT II — LEVEL 11: Rozpadlina (finał aktu)                         */
/* ------------------------------------------------------------------ */
function level11(): LevelDef {
  const b = new GridBuilder(150, 40);
  // A: start
  b.clear(2, 29, 20, 35); b.put(4, 35, 'P'); b.put(6, 35, 'K'); b.put(9, 35, 'U'); b.put(12, 35, '0');
  b.crystals([[15, 33], [18, 33]]);
  // B: gejzery i strażnicy
  b.clear(21, 27, 45, 35); b.put(23, 35, '1');
  b.fill(28, 30, 29, 34, 'J'); b.fill(37, 31, 38, 34, 'J');
  b.hrow(31, 34, 32, '-'); b.hrow(40, 43, 28, '-');
  b.put(35, 35, 't'); b.put(42, 33, 'f');
  b.crystals([[32, 31], [41, 27]]);
  // sekret pod ścianą
  b.fill(21, 33, 21, 35, 'H'); b.clear(17, 32, 20, 35); b.put(18, 35, '$');
  // C: komora dwóch płyt
  b.clear(46, 29, 72, 35); b.put(47, 35, '2');
  b.put(52, 35, '3'); b.put(60, 35, '4');
  b.hrow(55, 58, 32, '-'); b.put(65, 35, 'e');
  b.crystals([[56, 31], [63, 33]]);
  b.vcol(69, 29, 35, 'a');
  // D: korytarz pełzaczy
  b.clear(73, 29, 98, 35); b.put(74, 35, '5');
  b.put(78, 35, 'e'); b.put(85, 35, 'e'); b.put(91, 33, 'f');
  b.hrow(81, 84, 32, '-'); b.crystals([[82, 31], [88, 33], [95, 33]]);
  // E: trzecia osoba i brama
  b.clear(99, 26, 124, 35); b.put(100, 35, '6');
  b.put(105, 35, '5'); b.put(110, 35, '4'); b.put(116, 33, 'f');
  b.hrow(112, 115, 31, '-');
  b.vcol(121, 29, 35, 'b');
  b.crystals([[113, 30], [118, 33]]);
  // F: rozpadlina — finał
  b.clear(125, 24, 148, 35); b.put(126, 35, '3'); b.put(131, 35, 'K'); b.put(135, 35, '0');
  b.hrow(138, 141, 31, '-'); b.crystals([[132, 33], [140, 30], [144, 33]]);
  b.put(146, 35, 'X');
  b.decorate(1111);
  return {
    id: 'rift', name: 'Rozpadlina', subtitle: 'Ostatnia próba przed sercem', theme: 'rift', next: null,
    map: b.build(),
    legend: {
      '0': { type: 'sign', text: 'ROZPADLINA. Tu kończą się ścieżki, a zaczyna to, co między nimi. Twoje echo jest jedynym świadkiem.' },
      '1': { type: 'sign', text: 'Gejzery i strażnicy działają tu razem. Wzleć nad ich pociski, gdy gejzer wybije, i ląduj na półkach.' },
      '2': { type: 'sign', text: 'Trzy płyty: jedna zwykła, jedna tylko dla ech, jedna zegarowa. Tylko pełne wykorzystanie mechaniki echa otworzy bramę.' },
      '3': { type: 'plate', target: 'a', echoOnly: true },
      '4': { type: 'plate', target: 'a', timed: 4 },
      '5': { type: 'sign', text: 'Pełzacze tu nie odpuszczają. Poruszaj się skokami i dashem, by nie dać się okrążyć.' },
      '6': { type: 'sign', text: 'Płyta zegarowa działa tylko przez chwilę. Nagranie, które na niej stanie, da Ci czas na przejście.' },
      'a': { type: 'door', id: 'a' },
      'b': { type: 'door', id: 'b', latch: true },
    },
  };
}

export const LEVELS: Record<Theme, LevelDef> = {
  cave: level1(),
  ruins: level2(),
  archive: level3(),
  gardens: level5(),
  forge: level6(),
  spire: level7(),
  heart: level4(),
  abyss: level8(),
  mire: level9(),
  citadel: level10(),
  rift: level11(),
};

export const LEVEL_ORDER: Theme[] = ['cave', 'ruins', 'archive', 'gardens', 'forge', 'spire', 'heart', 'abyss', 'mire', 'citadel', 'rift'];

/** Total number of hidden regions across all levels (for completion stats). */
export const TOTAL_SECRETS: number = (() => {
  let total = 0;
  for (const id of LEVEL_ORDER) {
    const map = LEVELS[id].map;
    const h = map.length, w = map[0].length;
    const seen = new Set<number>();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (map[y][x] !== 'H' || seen.has(y * w + x)) continue;
        total++;
        const stack = [y * w + x];
        seen.add(y * w + x);
        while (stack.length) {
          const k = stack.pop()!;
          const kx = k % w, ky = Math.floor(k / w);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = kx + dx, ny = ky + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const nk = ny * w + nx;
            if (map[ny][nx] === 'H' && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
          }
        }
      }
    }
  }
  return total;
})();
