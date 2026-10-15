// Menu screens, intro cards, pause, results and the victory screen.
import { Renderer } from '../render/renderer';
import { GAMES, GAME_BY_ID, type GameId } from '../sim/games/registry';
import type { GameDef } from '../sim/games/base';
import type { PadInput } from '../sim/player';
import { MODS, MOD_BY_ID, type ModId } from '../sim/modifiers';
import type { Match } from '../sim/tournament';
import type { RoundResult } from '../sim/round';
import { LENGTH, type LengthId, type Settings, type Stats } from '../state';
import { btn, h, kbd } from './dom';

export interface Screen {
  el: HTMLElement;
  /** keyboard: return true if handled */
  key?: (code: string) => boolean;
  /** called every frame while shown */
  tick?: (dt: number) => void;
  /** element to focus first */
  focus?: HTMLElement | null;
}

/** All icon canvases on screen are redrawn each frame (they move a little). */
export const liveIcons = new Set<{ c: HTMLCanvasElement; id: string }>();
export function iconCanvas(id: string, size = 72) {
  const c = h('canvas', { class: 'rc-icon', width: size * 2, height: size * 2, 'aria-hidden': 'true' }) as HTMLCanvasElement;
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  const entry = { c, id };
  liveIcons.add(entry);
  drawIcon(entry, 0);
  return c;
}
export function drawIcon(e: { c: HTMLCanvasElement; id: string }, t: number) {
  const g = e.c.getContext('2d');
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, e.c.width, e.c.height);
  Renderer.icon(g, e.id, e.c.width, t);
}

function seg<T extends string | number>(label: string, id: string, opts: [T, string][], get: () => T, set: (v: T) => void) {
  const wrap = h('div', { class: 'rc-seg', role: 'group', 'aria-label': label, 'data-setting': id });
  const draw = () =>
    wrap.replaceChildren(
      ...opts.map(([v, name]) =>
        btn(name, () => (set(v), draw()), { cls: get() === v ? 'on' : '', pressed: get() === v, id: `${id}-${v}` }),
      ),
    );
  draw();
  return h('div', { class: 'rc-field' }, h('span', { class: 'rc-label' }, label), wrap);
}
function slider(label: string, id: string, get: () => number, set: (v: number) => void) {
  const out = h('output', null, `${Math.round(get() * 100)}%`);
  const input = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: get(), 'aria-label': label, 'data-setting': id }) as HTMLInputElement;
  input.addEventListener('input', () => {
    set(Number(input.value));
    out.textContent = `${Math.round(Number(input.value) * 100)}%`;
  });
  return h('label', { class: 'rc-field rc-slider' }, h('span', { class: 'rc-label' }, label), input, out);
}
function back(onBack: () => void, label = 'Wróć') {
  return btn(label, onBack, { cls: 'ghost', id: 'back', hint: 'Esc' });
}
const escBack = (onBack: () => void) => (code: string) => {
  if (code === 'Escape') {
    onBack();
    return true;
  }
  return false;
};

// ---------------------------------------------------------------- menu
export function menuView(o: { names: [string, string]; onPlay: () => void; onTournament: () => void; onGames: () => void; onSettings: () => void; onControls: () => void; onPlayers: () => void; target: number }): Screen {
  const play = btn('GRAJ', o.onPlay, { cls: 'primary big', id: 'play', hint: `szybki mecz · do ${o.target} pkt` });
  const el = h(
    'div',
    { class: 'rc-menu' },
    h('div', { class: 'rc-logo', 'aria-label': 'RANDOM CHAOS' }, h('span', { class: 'r' }, 'RANDOM'), h('span', { class: 'c' }, 'CHAOS')),
    h('p', { class: 'rc-tag' }, 'Imprezowy pojedynek dla dwóch osób na jednej klawiaturze. Osiem szalonych minigier, losowe zasady, jeden zwycięzca.'),
    h(
      'nav',
      { class: 'rc-menu-btns', 'aria-label': 'Menu główne' },
      play,
      btn('TURNIEJ', o.onTournament, { id: 'tournament', hint: 'punkty, minigry, modyfikatory' }),
      btn('MINIGRY', o.onGames, { id: 'games', hint: 'wybór i trening' }),
      h('div', { class: 'rc-row' }, btn('Gracze', o.onPlayers, { cls: 'small', id: 'players' }), btn('Ustawienia', o.onSettings, { cls: 'small', id: 'settings' }), btn('Sterowanie', o.onControls, { cls: 'small', id: 'controls' })),
      h('a', { class: 'rc-btn ghost small rc-evg', href: '/', target: '_top', 'data-id': 'evgames' }, h('span', { class: 'rc-btn-label' }, '← Powrót do EVGAMES')),
    ),
    h(
      'div',
      { class: 'rc-keys-strip' },
      h('span', { class: 'p1' }, h('b', null, o.names[0]), ' ', kbd('W', 'A', 'S', 'D')),
      h('span', { class: 'p2' }, h('b', null, o.names[1]), ' ', kbd('↑', '←', '↓', '→')),
    ),
  );
  return { el, focus: play };
}

// ---------------------------------------------------------------- tournament setup
export function setupView(s: Settings, onChange: () => void, onStart: () => void, onBack: () => void): Screen {
  const gameGrid = h('div', { class: 'rc-game-toggles' });
  const drawGames = () =>
    gameGrid.replaceChildren(
      ...GAMES.map((g) => {
        const on = s.games.includes(g.id as GameId);
        const b = btn([iconCanvas(g.id, 44), h('span', null, g.name)], () => {
          if (on && s.games.length <= 1) return;
          s.games = on ? s.games.filter((x) => x !== g.id) : [...s.games, g.id as GameId];
          onChange();
          drawGames();
          count.textContent = `${s.games.length} / ${GAMES.length}`;
        }, { cls: `toggle ${on ? 'on' : ''}`, pressed: on, id: `game-${g.id}`, title: g.tagline });
        return b;
      }),
    );
  const count = h('span', { class: 'rc-count' }, `${s.games.length} / ${GAMES.length}`);
  drawGames();
  const start = btn('START TURNIEJU', onStart, { cls: 'primary big', id: 'start', hint: 'Enter' });
  const el = h(
    'div',
    { class: 'rc-panel wide' },
    h('h2', null, 'Turniej'),
    h(
      'div',
      { class: 'rc-cols' },
      h(
        'div',
        null,
        seg('Punkty do zwycięstwa', 'target', [[3, '3'], [5, '5'], [7, '7'], [10, '10']], () => s.target, (v) => ((s.target = v), onChange())),
        seg('Długość rund', 'length', (Object.keys(LENGTH) as LengthId[]).map((k) => [k, LENGTH[k].label] as [LengthId, string]), () => s.length, (v) => ((s.length = v), onChange())),
        seg('Modyfikatory chaosu', 'modFreq', [['off', 'Wyłączone'], ['sometimes', 'Czasem'], ['always', 'Zawsze']], () => s.modFreq, (v) => ((s.modFreq = v), onChange())),
        modToggles(s, onChange),
      ),
      h('div', null, h('div', { class: 'rc-label' }, 'Minigry w puli ', count), gameGrid, h('p', { class: 'rc-note' }, 'Kliknij, żeby wyłączyć lub włączyć minigrę. Przynajmniej jedna musi zostać.')),
    ),
    h('div', { class: 'rc-row end' }, back(onBack), start),
  );
  return {
    el,
    focus: start,
    key: (c) => {
      if (c === 'Enter') {
        onStart();
        return true;
      }
      return escBack(onBack)(c);
    },
  };
}

function modToggles(s: Settings, onChange: () => void) {
  const wrap = h('div', { class: 'rc-mods' });
  const draw = () =>
    wrap.replaceChildren(
      ...MODS.map((m) => {
        const on = s.mods.includes(m.id);
        const b = btn(m.name, () => {
          s.mods = on ? s.mods.filter((x) => x !== m.id) : [...s.mods, m.id];
          onChange();
          draw();
        }, { cls: `chip ${on ? 'on' : ''}`, pressed: on, id: `mod-${m.id}`, title: m.text });
        b.style.setProperty('--chip', m.color);
        return b;
      }),
    );
  draw();
  return h('div', { class: 'rc-field col' }, h('span', { class: 'rc-label' }, 'Dozwolone modyfikatory'), wrap);
}

// ---------------------------------------------------------------- minigames
export function gamesView(onPlayOne: (id: GameId) => void, onBack: () => void): Screen {
  const cards = GAMES.map((g, i) =>
    h(
      'article',
      { class: 'rc-card' },
      iconCanvas(g.id, 64),
      h('div', null, h('h3', null, `${String.fromCharCode(65 + i)}. ${g.name}`), h('p', null, g.tagline), h('ul', null, ...g.rules.map((r) => h('li', null, r)))),
      btn('Zagraj', () => onPlayOne(g.id as GameId), { cls: 'small primary', id: `one-${g.id}`, hint: 'do 3 pkt' }),
    ),
  );
  const el = h('div', { class: 'rc-panel wide' }, h('h2', null, 'Minigry'), h('p', { class: 'rc-note' }, 'Zagraj jedną minigrę w meczu do 3 punktów. Pulę minigier dla turnieju ustawisz w zakładce Turniej.'), h('div', { class: 'rc-cards' }, ...cards), h('div', { class: 'rc-row end' }, back(onBack)));
  return { el, focus: el.querySelector('button'), key: escBack(onBack) };
}

// ---------------------------------------------------------------- settings
export function settingsView(s: Settings, onChange: () => void, onBack: () => void, extra: { isFs: () => boolean; toggleFs: () => void; resetStats: () => void }): Screen {
  const fs = btn(extra.isFs() ? 'Wyłącz pełny ekran' : 'Pełny ekran', () => {
    extra.toggleFs();
    window.setTimeout(() => (fs.querySelector('.rc-btn-label')!.textContent = extra.isFs() ? 'Wyłącz pełny ekran' : 'Pełny ekran'), 200);
  }, { cls: 'small', id: 'fullscreen' });
  const reduced = h('input', { type: 'checkbox', 'data-setting': 'reduced' }) as HTMLInputElement;
  reduced.checked = s.reduced;
  reduced.addEventListener('change', () => ((s.reduced = reduced.checked), onChange()));
  const el = h(
    'div',
    { class: 'rc-panel wide' },
    h('h2', null, 'Ustawienia'),
    h(
      'div',
      { class: 'rc-cols' },
      h(
        'div',
        null,
        h('h3', null, 'Dźwięk'),
        slider('Muzyka', 'music', () => s.music, (v) => ((s.music = v), onChange())),
        slider('Efekty', 'sfx', () => s.sfx, (v) => ((s.sfx = v), onChange())),
        h('h3', null, 'Obraz'),
        slider('Trzęsienie ekranu', 'shake', () => s.shake, (v) => ((s.shake = v), onChange())),
        h('label', { class: 'rc-check' }, reduced, h('span', null, 'Ogranicz efekty (mniej cząsteczek, bez wstrząsów i błysków)')),
        h('div', { class: 'rc-row' }, fs),
      ),
      h(
        'div',
        null,
        h('h3', null, 'Rozgrywka'),
        seg('Długość rund', 'length', (Object.keys(LENGTH) as LengthId[]).map((k) => [k, LENGTH[k].label] as [LengthId, string]), () => s.length, (v) => ((s.length = v), onChange())),
        seg('Modyfikatory chaosu', 'modFreq', [['off', 'Wyłączone'], ['sometimes', 'Czasem'], ['always', 'Zawsze']], () => s.modFreq, (v) => ((s.modFreq = v), onChange())),
        modToggles(s, onChange),
        h('div', { class: 'rc-row' }, btn('Wyzeruj statystyki', extra.resetStats, { cls: 'small danger', id: 'reset-stats' })),
      ),
    ),
    h('div', { class: 'rc-row end' }, back(onBack)),
  );
  return { el, focus: el.querySelector('input'), key: escBack(onBack) };
}

// ---------------------------------------------------------------- controls
export interface ControlsProbe {
  pads: [PadInput, PadInput];
  gamepads: number;
}

export function controlsView(names: [string, string], onBack: () => void, probe?: () => ControlsProbe): Screen {
  const lights: HTMLElement[][] = [[], []];
  const pad = (i: 0 | 1, cls: string, name: string, keys: [string, string, string, string], alt: string) => {
    const key = (k: string, label: string, extra = '') => {
      const el = h('div', { class: `rc-key ${extra}` }, h('kbd', null, k), h('small', null, label));
      lights[i].push(el);
      return el;
    };
    return h(
      'div',
      { class: `rc-pad ${cls}` },
      h('h3', null, name),
      h('div', { class: 'rc-keys' }, key(keys[0], 'skok', 'up'), key(keys[1], 'w lewo'), key(keys[2], 'akcja'), key(keys[3], 'w prawo')),
      h('p', { class: 'rc-note' }, alt),
    );
  };
  const padStatus = h('p', { class: 'rc-note rc-padstatus' }, '');
  const el = h(
    'div',
    { class: 'rc-panel wide' },
    h('h2', null, 'Sterowanie'),
    h(
      'div',
      { class: 'rc-cols' },
      pad(0, 'p1', `Gracz 1 · ${names[0]}`, ['W', 'A', 'S', 'D'], 'albo pad nr 1'),
      pad(1, 'p2', `Gracz 2 · ${names[1]}`, ['↑', '←', '↓', '→'], 'albo I J K L · albo klawiatura numeryczna 8 4 5 6 · albo pad nr 2'),
    ),
    h('p', { class: 'rc-note rc-tester' }, 'Test: naciśnij klawisze — pola powyżej podświetlają się, gdy gra je widzi.'),
    padStatus,
    h(
      'div',
      { class: 'rc-help' },
      h('p', null, h('b', null, 'Skok'), ' — przytrzymaj, żeby skoczyć wyżej. Skok działa też chwilę po zejściu z krawędzi i tuż przed lądowaniem.'),
      h('p', null, h('b', null, 'Akcja'), ' — na ziemi: pchnięcie z rozpędu. W powietrzu: wbicie w ziemię z falą uderzeniową. Skok na głowę rywala ogłusza go. Akcja wciśnięta chwilę za wcześnie (np. tuż przed końcem odnowienia) wykona się sama, gdy będzie możliwa.'),
      h(
        'p',
        null,
        h('b', null, 'Klawisz czasem nie reaguje?'),
        ' Wiele klawiatur nie rejestruje niektórych kombinacji, gdy dwie osoby trzymają naraz kilka klawiszy (tzw. ghosting — to ograniczenie sprzętu, nie gry). Sprawdź to w teście powyżej. Pomaga, gdy gracz 2 przejdzie na I J K L albo klawiaturę numeryczną, albo gdy podłączycie pady.',
      ),
      h('p', null, kbd('Esc'), ' pauza (na padzie: Start) · ', kbd('R'), ' w menu pauzy: restart rundy (wynik meczu bez zmian) · ', kbd('Enter'), ' dalej / zatwierdź · ', 'Na karcie minigry obaj gracze wciskają skok, żeby zacząć.'),
    ),
    h('table', { class: 'rc-table' }, h('tbody', null, ...GAMES.map((g) => h('tr', null, h('td', null, g.name), h('td', null, `Akcja: ${g.action}`))))),
    h('div', { class: 'rc-row end' }, back(onBack)),
  );
  const order: (keyof PadInput)[] = ['jump', 'left', 'action', 'right'];
  return {
    el,
    focus: el.querySelector('button'),
    key: escBack(onBack),
    tick() {
      if (!probe) return;
      const st = probe();
      for (const i of [0, 1] as const) order.forEach((k, j) => lights[i][j]?.classList.toggle('on', !!st.pads[i][k]));
      padStatus.textContent = st.gamepads ? `Podłączone pady: ${st.gamepads} (pad 1 → gracz 1, pad 2 → gracz 2).` : 'Pady: brak (podłącz i naciśnij dowolny przycisk, żeby przeglądarka go zobaczyła).';
    },
  };
}

// ---------------------------------------------------------------- players
export function playersView(s: Settings, stats: Stats, onChange: () => void, onBack: () => void): Screen {
  const name = (i: 0 | 1) => {
    const inp = h('input', { type: 'text', maxlength: 12, value: s.names[i], 'aria-label': `Imię gracza ${i + 1}`, 'data-setting': `name${i}` }) as HTMLInputElement;
    inp.addEventListener('input', () => {
      const v = inp.value.trim();
      if (v) {
        s.names[i] = v.slice(0, 12);
        onChange();
      }
    });
    return inp;
  };
  const per = GAMES.map((g) => {
    const p = stats.perGame[g.id as GameId] ?? [0, 0];
    return h('tr', null, h('td', null, g.name), h('td', { class: 'p1' }, p[0]), h('td', { class: 'p2' }, p[1]));
  });
  const el = h(
    'div',
    { class: 'rc-panel wide' },
    h('h2', null, 'Gracze'),
    h(
      'div',
      { class: 'rc-cols' },
      h('div', { class: 'rc-player p1' }, h('div', { class: 'rc-avatar p1' }), h('label', { class: 'rc-label' }, 'Gracz 1 (niebieski) — W A S D'), name(0), h('p', { class: 'rc-note' }, 'Bąbel: sprężysta antenka, zawsze optymista.')),
      h('div', { class: 'rc-player p2' }, h('div', { class: 'rc-avatar p2' }), h('label', { class: 'rc-label' }, 'Gracz 2 (pomarańczowy) — strzałki lub IJKL'), name(1), h('p', { class: 'rc-note' }, 'Pieprz: płomienna czupryna, zero cierpliwości.')),
    ),
    h('h3', null, 'Statystyki (w tej przeglądarce)'),
    h(
      'table',
      { class: 'rc-table' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'p1' }, 'Gracz 1'), h('th', { class: 'p2' }, 'Gracz 2'))),
      h(
        'tbody',
        null,
        h('tr', null, h('td', null, 'Wygrane mecze'), h('td', { class: 'p1' }, stats.wins[0]), h('td', { class: 'p2' }, stats.wins[1])),
        h('tr', null, h('td', null, 'Wygrane rundy'), h('td', { class: 'p1' }, stats.rounds[0]), h('td', { class: 'p2' }, stats.rounds[1])),
        h('tr', null, h('td', null, 'Rozegrane mecze / remisy rund'), h('td', { colspan: 2 }, `${stats.matches} / ${stats.draws}`)),
        ...per,
      ),
    ),
    h('div', { class: 'rc-row end' }, back(onBack)),
  );
  return { el, focus: el.querySelector('input'), key: escBack(onBack) };
}

// ---------------------------------------------------------------- in-game
export function introView(o: { def: GameDef; mod: ModId | null; round: number; score: [number, number]; target: number; names: [string, string]; onGo: () => void }): Screen & { ready: (i: 0 | 1) => void } {
  const ready = [false, false];
  const marks = [h('span', { class: 'rc-ready p1' }, `${o.names[0]}: wciśnij W`), h('span', { class: 'rc-ready p2' }, `${o.names[1]}: wciśnij ↑`)];
  const M = o.mod ? MOD_BY_ID[o.mod] : null;
  const go = btn('START', o.onGo, { cls: 'primary', id: 'go', hint: 'Enter' });
  const el = h(
    'div',
    { class: 'rc-intro' },
    h('div', { class: 'rc-intro-top' }, h('span', null, `RUNDA ${o.round}`), h('span', { class: 'score' }, h('b', { class: 'p1' }, o.score[0]), ' : ', h('b', { class: 'p2' }, o.score[1]), h('small', null, ` do ${o.target}`))),
    h('div', { class: 'rc-intro-main' }, iconCanvas(o.def.id, 110), h('div', null, h('h2', null, o.def.name), h('p', { class: 'rc-tagline' }, o.def.tagline), h('ul', null, ...o.def.rules.map((r) => h('li', null, r))))),
    M
      ? h('div', { class: 'rc-modcard', style: `--chip:${M.color}` }, h('small', null, 'MODYFIKATOR CHAOSU'), h('b', null, M.name), h('span', null, M.text))
      : null,
    h('div', { class: 'rc-intro-foot' }, marks[0], go, marks[1]),
  );
  let t = 0;
  return {
    el,
    focus: go,
    ready(i) {
      if (ready[i]) return;
      ready[i] = true;
      marks[i].classList.add('on');
      marks[i].textContent = `${o.names[i]}: GOTOWY!`;
      if (ready[0] && ready[1]) window.setTimeout(o.onGo, 250);
    },
    tick(dt) {
      t += dt;
    },
    key: (c) => {
      if (c === 'Enter' || c === 'Space') {
        o.onGo();
        return true;
      }
      return false;
    },
  };
}

export function pauseView(o: { onResume: () => void; onRestart: () => void; onUnstick: () => void; onSettings: () => void; onControls: () => void; onQuit: () => void; game: GameDef }): Screen {
  const resume = btn('Wznów', o.onResume, { cls: 'primary', id: 'resume', hint: 'Esc' });
  const el = h(
    'div',
    { class: 'rc-panel narrow rc-pause' },
    h('h2', null, 'Pauza'),
    h('p', { class: 'rc-note' }, o.game.name),
    resume,
    btn('Restart rundy', o.onRestart, { id: 'restart', hint: 'R · wynik bez zmian' }),
    btn('Odblokuj postacie', o.onUnstick, { id: 'unstick', hint: 'gdy ktoś utknął' }),
    btn('Ustawienia', o.onSettings, { id: 'settings' }),
    btn('Sterowanie', o.onControls, { id: 'controls' }),
    btn('Wyjdź do menu', o.onQuit, { cls: 'ghost', id: 'quit' }),
  );
  return {
    el,
    focus: resume,
    key: (c) => {
      if (c === 'Escape') {
        o.onResume();
        return true;
      }
      if (c === 'KeyR') {
        o.onRestart();
        return true;
      }
      return false;
    },
  };
}

export function confirmView(text: string, yes: string, onYes: () => void, onNo: () => void): Screen {
  const no = btn('Anuluj', onNo, { cls: 'ghost', id: 'no', hint: 'Esc' });
  const el = h('div', { class: 'rc-panel narrow' }, h('h2', null, text), h('div', { class: 'rc-row end' }, no, btn(yes, onYes, { cls: 'danger', id: 'yes' })));
  return { el, focus: no, key: escBack(onNo) };
}

export function resultsView(o: { result: RoundResult; match: Match; names: [string, string]; game: GameDef; onNext: () => void; onMenu: () => void }): Screen {
  const { result, match } = o;
  const w = result.winner;
  const next = btn(match.over ? 'Dalej' : 'Następna runda', o.onNext, { cls: 'primary', id: 'next', hint: 'Enter' });
  const bar = (i: 0 | 1) =>
    h(
      'div',
      { class: `rc-scorebar p${i + 1}` },
      h('b', null, o.names[i]),
      h('div', { class: 'pips' }, ...Array.from({ length: match.opts.target }, (_, k) => h('i', { class: k < match.score[i] ? 'on' : '' }))),
      h('span', { class: 'num' }, match.score[i]),
    );
  const el = h(
    'div',
    { class: 'rc-panel rc-results' },
    h('p', { class: 'rc-kicker' }, o.game.name),
    h('h2', { class: w < 0 ? '' : `p${w + 1}` }, w < 0 ? 'Remis — nikt nie dostaje punktu' : `Punkt dla: ${o.names[w as 0 | 1]}`),
    h('p', { class: 'rc-note' }, result.reason),
    bar(0),
    bar(1),
    h('div', { class: 'rc-row end' }, btn('Menu', o.onMenu, { cls: 'ghost', id: 'menu' }), next),
  );
  return {
    el,
    focus: next,
    key: (c) => {
      if (c === 'Enter' || c === 'Space') {
        o.onNext();
        return true;
      }
      return false;
    },
  };
}

export function victoryView(o: { winner: 0 | 1; match: Match; names: [string, string]; onRematch: () => void; onMenu: () => void }): Screen {
  const re = btn('Rewanż', o.onRematch, { cls: 'primary big', id: 'rematch', hint: 'Enter' });
  const rounds = o.match.history.map((r, i) => h('li', { class: r.result.winner < 0 ? 'draw' : `p${r.result.winner + 1}` }, `${i + 1}. ${GAME_BY_ID[r.game].name}${r.mod ? ` · ${MOD_BY_ID[r.mod].name}` : ''}`, h('b', null, r.result.winner < 0 ? 'remis' : o.names[r.result.winner as 0 | 1])));
  const el = h(
    'div',
    { class: `rc-victory p${o.winner + 1}` },
    h('p', { class: 'rc-kicker' }, 'ZWYCIĘZCA TURNIEJU'),
    h('h1', null, o.names[o.winner]),
    h('p', { class: 'rc-final' }, h('b', { class: 'p1' }, o.match.score[0]), ' : ', h('b', { class: 'p2' }, o.match.score[1])),
    h('ol', { class: 'rc-history' }, ...rounds),
    h('div', { class: 'rc-row center' }, btn('Menu główne', o.onMenu, { cls: 'ghost', id: 'menu' }), re),
  );
  return {
    el,
    focus: re,
    key: (c) => {
      if (c === 'Enter') {
        o.onRematch();
        return true;
      }
      return false;
    },
  };
}

export function loadingView() {
  return h('div', { class: 'rc-loading' }, h('div', { class: 'rc-logo small' }, h('span', { class: 'r' }, 'RANDOM'), h('span', { class: 'c' }, 'CHAOS')), h('p', null, 'Ładowanie…'));
}
export function errorView(msg: string) {
  return h('div', { class: 'rc-panel narrow', role: 'alert' }, h('h2', null, 'Coś poszło nie tak'), h('p', null, msg), h('a', { class: 'rc-btn primary', href: '/', target: '_top' }, h('span', { class: 'rc-btn-label' }, 'Powrót do EVGAMES')));
}
