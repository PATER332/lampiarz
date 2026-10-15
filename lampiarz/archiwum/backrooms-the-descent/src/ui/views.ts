// Screens and device interfaces. Each builder returns a Modal; the app decides when
// to show it and what its callbacks do.
import { obsText, type Sim } from '../game/sim';
import type { Meta, Settings } from '../game/state';
import { DIFF, DOC_BY_ID, DOCS, ENDING_ORDER, ENDINGS, type EndingId } from '../game/story';
import { codeOf } from '../game/puzzle';
import { CAMERAS, DIFFS, SYM_NAME, SYM_PLACE, SYMBOLS, ZONE_NAMES, type Difficulty, type Sym } from '../world/map';
import { btn, fmtTime, h, panel } from './dom';

export interface Modal {
  kind: string;
  el: HTMLElement;
  pausesSim: boolean;
  key?: (e: KeyboardEvent) => boolean;
  refresh?: () => void;
  onClose?: () => void;
}

const layer = (content: HTMLElement, cls = '') => h('div', { class: `bd-layer ${cls}`.trim() }, content);
const esc = (fn: () => void) => (e: KeyboardEvent) => (e.code === 'Escape' ? (fn(), true) : false);

const SVGNS = 'http://www.w3.org/2000/svg';
export function symSvg(s: Sym, color = 'currentColor'): SVGSVGElement {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-label', SYM_NAME[s]);
  const el = (tag: string, attrs: Record<string, string>) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    e.setAttribute('stroke', color);
    e.setAttribute('stroke-width', '8');
    e.setAttribute('fill', 'none');
    e.setAttribute('stroke-linecap', 'round');
    e.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(e);
    return e;
  };
  if (s === 'circle') el('circle', { cx: '50', cy: '50', r: '38' });
  if (s === 'triangle') el('path', { d: 'M50 10 L90 84 L10 84 Z' });
  if (s === 'square') el('rect', { x: '14', y: '14', width: '72', height: '72' });
  if (s === 'cross') el('path', { d: 'M16 16 L84 84 M84 16 L16 84' });
  if (s === 'eye') {
    el('path', { d: 'M6 50 Q50 4 94 50 Q50 96 6 50 Z' });
    el('circle', { cx: '50', cy: '50', r: '10' }).setAttribute('fill', color);
  }
  return svg;
}

// ---------------------------------------------------------------- boot
export function loadingView() {
  const bar = h('i');
  const label = h('p', { class: 'bd-text bd-dim bd-mono' }, 'Przygotowanie…');
  const pct = h('span', { class: 'bd-mono bd-dim' });
  const el = layer(h('div', { class: 'bd-loading' }, h('p', { class: 'bd-kicker' }, 'EVGAMES · 18+'), h('h1', { class: 'bd-title' }, 'BACKROOMS: THE DESCENT'), h('div', { class: 'bd-bar' }, bar), h('div', { class: 'bd-row', style: 'justify-content:space-between;margin:0' }, label, pct)), 'bd-black');
  return {
    el,
    set(done: number, total: number, text: string) {
      const p = Math.round((done / total) * 100);
      bar.style.width = `${p}%`;
      label.textContent = text;
      pct.textContent = `${p}%`;
    },
  };
}

/** The adult-content warning; a real click is needed before audio and pointer lock. */
export function warningView(onEnter: () => void) {
  return layer(
    h(
      'div',
      { class: 'bd-loading bd-warning18' },
      h('div', { class: 'bd-badge18' }, '18+'),
      h('h1', { class: 'bd-title' }, 'Ostrzeżenie'),
      h('p', { class: 'bd-text' }, 'BACKROOMS: THE DESCENT to intensywny horror dla dorosłych. Zawiera fikcyjną przemoc, krew, sceny śmierci, nagłe głośne dźwięki, migające światło i sceny wywołujące silny niepokój.'),
      h('p', { class: 'bd-text bd-dim' }, 'Krew, migotanie i ziarno obrazu można ograniczyć w ustawieniach. Najlepiej grać w słuchawkach.'),
      h('div', { class: 'bd-btns' }, btn('Mam ukończone 18 lat — wejdź', onEnter, { cls: 'bd-primary', hint: 'klik / Enter', id: 'enter' }), h('a', { class: 'bd-btn', href: '/', target: '_top', style: 'text-decoration:none', 'data-id': 'evgames' }, h('span', null, 'Powrót do EVGAMES'))),
    ),
    'bd-black',
  );
}

export function errorView(title: string, text: string) {
  return h('div', { class: 'bd-error', role: 'alert' }, h('h2', { class: 'bd-title', style: 'font-size:28px' }, title), h('p', { class: 'bd-text' }, text), h('a', { href: '/', target: '_top', class: 'bd-btn', style: 'display:inline-flex;text-decoration:none' }, 'Powrót do EVGAMES'));
}

// ---------------------------------------------------------------- menus
export function menuView(o: { save: { difficulty: Difficulty; area: string; playTime: number } | null; warning: string | null; endings: number; onContinue: () => void; onNew: () => void; onOptions: () => void; onControls: () => void; onEndings: () => void }): Modal {
  const el = layer(
    h(
      'div',
      { class: 'bd-menu' },
      h('h1', { class: 'bd-logo' }, 'Backrooms', h('span', { class: 'bd-logo-time' }, 'THE DESCENT')),
      h('p', { class: 'bd-tag' }, 'Obudziłeś się tam, gdzie nie powinno być niczego. Pięć znaków. Jedne drzwi. I to, co poluje w korytarzach.'),
      o.warning ? h('p', { class: 'bd-warning', role: 'alert' }, o.warning) : null,
      h(
        'nav',
        { class: 'bd-btns', 'aria-label': 'Menu główne' },
        o.save ? btn('Kontynuuj', o.onContinue, { cls: 'bd-primary', hint: `${DIFF[o.save.difficulty].name} · ${o.save.area === 'descent' ? 'Zejście' : 'Poziom 0'} · ${fmtTime(o.save.playTime)}`, id: 'continue' }) : null,
        btn('Nowa gra', o.onNew, { cls: o.save ? '' : 'bd-primary', id: 'new' }),
        btn('Ustawienia', o.onOptions, { id: 'options' }),
        btn('Sterowanie', o.onControls, { id: 'controls' }),
        btn('Zakończenia', o.onEndings, { hint: `${o.endings}/3`, id: 'endings' }),
        h('a', { class: 'bd-btn', href: '/', target: '_top', 'data-id': 'evgames', style: 'text-decoration:none' }, h('span', null, 'Powrót do EVGAMES'), h('small', null, 'biblioteka gier')),
      ),
      h('p', { class: 'bd-foot' }, 'EVGAMES · BACKROOMS: THE DESCENT · v1.1 · 18+ · postęp zapisuje się lokalnie w przeglądarce'),
    ),
    'bd-clear',
  );
  return { kind: 'menu', el, pausesSim: true };
}

export function difficultyView(onPick: (d: Difficulty) => void, onBack: () => void): Modal {
  const el = layer(
    panel(
      'bd-wide',
      h('p', { class: 'bd-kicker' }, 'Nowa gra'),
      h('h2', { class: 'bd-title' }, 'Poziom trudności'),
      h(
        'div',
        { class: 'bd-diffs' },
        ...DIFFS.map((d) => {
          const b = h('button', { type: 'button', class: `bd-diff ${d}`, 'data-id': `diff-${d}`, onclick: () => onPick(d) }, h('b', null, DIFF[d].name), DIFF[d].blurb);
          return b;
        }),
      ),
      h('div', { class: 'bd-row' }, btn('Wróć', onBack, { id: 'back' })),
    ),
  );
  return { kind: 'difficulty', el, pausesSim: true, key: esc(onBack) };
}

export function confirmView(title: string, text: string, yes: string, onYes: () => void, onNo: () => void): Modal {
  const el = layer(panel('bd-narrow', h('h2', { class: 'bd-title' }, title), h('p', { class: 'bd-text' }, text), h('div', { class: 'bd-row' }, btn('Anuluj', onNo, { id: 'no' }), btn(yes, onYes, { cls: 'bd-danger', id: 'yes' }))));
  return { kind: 'confirm', el, pausesSim: true, key: esc(onNo) };
}

export function optionsView(s: Settings, onChange: (s: Settings) => void, onBack: () => void, isFs: () => boolean, toggleFs: () => void): Modal {
  const slider = (label: string, key: 'music' | 'sfx' | 'ambient' | 'sensitivity' | 'brightness', min: number, max: number, step: number, fmt: (v: number) => string) => {
    const out = h('output', null, fmt(s[key]));
    const input = h('input', { type: 'range', min, max, step, value: s[key], 'aria-label': label, 'data-setting': key }) as HTMLInputElement;
    input.addEventListener('input', () => {
      s[key] = Number(input.value);
      out.textContent = fmt(s[key]);
      onChange(s);
    });
    return h('label', { class: 'bd-setting' }, h('span', null, label), input, out);
  };
  const check = (label: string, key: 'invertY' | 'reduced' | 'headBob' | 'gore' | 'voice', note?: string) => {
    const input = h('input', { type: 'checkbox', 'data-setting': key }) as HTMLInputElement;
    input.checked = s[key];
    input.addEventListener('change', () => {
      s[key] = input.checked;
      onChange(s);
    });
    return h('label', { class: 'bd-check' }, input, h('span', null, label, note ? h('small', { class: 'bd-dim', style: 'display:block;font-size:12px' }, note) : null));
  };
  const seg = <T extends string | number>(label: string, opts: [T, string][], get: () => T, set: (v: T) => void, id: string) => {
    const wrap = h('div', { class: 'bd-seg', 'data-setting': id });
    const draw = () =>
      wrap.replaceChildren(
        ...opts.map(([v, name]) => {
          const b = btn(name, () => {
            set(v);
            onChange(s);
            draw();
          });
          if (get() === v) b.classList.add('active');
          b.setAttribute('aria-pressed', String(get() === v));
          return b;
        }),
      );
    draw();
    return h('div', { class: 'bd-setting' }, h('span', null, label), wrap, h('output'));
  };
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const fsBtn = btn(isFs() ? 'Wyłącz pełny ekran' : 'Włącz pełny ekran', () => {
    toggleFs();
    window.setTimeout(() => (fsBtn.firstChild!.textContent = isFs() ? 'Wyłącz pełny ekran' : 'Włącz pełny ekran'), 250);
  }, { id: 'fullscreen' });
  const el = layer(
    panel(
      '',
      h('p', { class: 'bd-kicker' }, 'Ustawienia'),
      h('h2', { class: 'bd-title' }, 'Opcje'),
      h('p', { class: 'bd-h3' }, 'Dźwięk'),
      slider('Muzyka', 'music', 0, 1, 0.05, pct),
      slider('Efekty', 'sfx', 0, 1, 0.05, pct),
      slider('Otoczenie', 'ambient', 0, 1, 0.05, pct),
      check('Głos syntezatora w radiu', 'voice', 'Wymaga syntezy mowy w przeglądarce. Napisy są zawsze.'),
      h('p', { class: 'bd-h3' }, 'Sterowanie'),
      slider('Czułość myszy', 'sensitivity', 0.2, 3, 0.05, (v) => `${v.toFixed(2)}×`),
      check('Odwróć oś Y', 'invertY'),
      check('Kołysanie kamery', 'headBob'),
      h('p', { class: 'bd-h3' }, 'Obraz'),
      slider('Jasność', 'brightness', 0.7, 1.6, 0.05, (v) => `${Math.round(v * 100)}%`),
      seg('Jakość grafiki', [['low', 'Niska'], ['medium', 'Średnia'], ['high', 'Wysoka']] as ['low' | 'medium' | 'high', string][], () => s.quality, (v) => (s.quality = v), 'quality'),
      seg('Rozdzielczość renderu', [[0.5, '50%'], [0.75, '75%'], [1, '100%']] as [number, string][], () => s.renderScale, (v) => (s.renderScale = v), 'renderScale'),
      check('Ogranicz efekty', 'reduced', 'Mniej migotania, bez ziarna, aberracji, zakłóceń i drgań kamery.'),
      check('Krew i brutalne efekty', 'gore', 'Wyłączone: bez krwi na ścianach i rozbryzgów.'),
      h('div', { class: 'bd-row' }, fsBtn),
      h('div', { class: 'bd-row' }, btn('Wróć', onBack, { cls: 'bd-primary', id: 'back' })),
    ),
  );
  return { kind: 'options', el, pausesSim: true, key: esc(onBack) };
}

export function controlsView(onBack: () => void): Modal {
  const rows: [string, string][] = [
    ['W A S D', 'ruch'],
    ['Mysz', 'rozglądanie się'],
    ['Shift', 'bieg (głośny, męczy)'],
    ['C', 'kucanie (cicho; w ciemnej wnęce — ukrycie)'],
    ['E', 'interakcja, kryjówka, wyjście z kryjówki'],
    ['F', 'latarka'],
    ['B', 'wymiana baterii'],
    ['H', 'apteczka'],
    ['Q', 'wyciągnij / schowaj rewolwer'],
    ['LPM / PPM', 'strzał / celowanie'],
    ['R', 'przeładowanie'],
    ['Tab', 'dziennik: znaki, obserwacje, dokumenty, notatki'],
    ['Esc', 'pauza'],
  ];
  const el = layer(
    panel(
      'bd-narrow',
      h('p', { class: 'bd-kicker' }, 'Sterowanie'),
      h('h2', { class: 'bd-title' }, 'Klawisze'),
      h('table', { class: 'bd-table' }, h('tbody', null, ...rows.map(([k, v]) => h('tr', null, h('td', null, h('span', { class: 'bd-key' }, k)), h('td', null, v))))),
      h('p', { class: 'bd-text bd-dim', style: 'margin-top:14px;font-size:13px' }, 'Dziennik, dokumenty i pauza wstrzymują czas. Klawiatura kodowa, radio, agregat i kamery — nie.'),
      h('div', { class: 'bd-row' }, btn('Wróć', onBack, { cls: 'bd-primary', id: 'back' })),
    ),
  );
  return { kind: 'controls', el, pausesSim: true, key: esc(onBack) };
}

export function endingsView(meta: Meta, onBack: () => void): Modal {
  const el = layer(
    panel(
      'bd-narrow',
      h('p', { class: 'bd-kicker' }, 'Zakończenia'),
      h('h2', { class: 'bd-title' }, `${meta.endings.length} / 3`),
      h('table', { class: 'bd-table' }, h('tbody', null, ...ENDING_ORDER.map((id) => h('tr', null, h('td', null, meta.endings.includes(id) ? ENDINGS[id].title : ENDINGS[id].secret ? '??? (sekret)' : '???'), h('td', { class: 'bd-dim bd-mono' }, meta.endings.includes(id) ? 'odkryte' : 'nieodkryte'))))),
      meta.bestTime !== null ? h('p', { class: 'bd-text bd-dim', style: 'margin-top:12px' }, `Najszybsze przejście: ${fmtTime(meta.bestTime)}`) : null,
      h('div', { class: 'bd-row' }, btn('Wróć', onBack, { cls: 'bd-primary', id: 'back' })),
    ),
  );
  return { kind: 'endings', el, pausesSim: true, key: esc(onBack) };
}

export function pauseView(o: { save: { ok: boolean; reason: string }; diff: Difficulty; onResume: () => void; onSave: () => void; onOptions: () => void; onControls: () => void; onMenu: () => void }): Modal {
  const el = layer(
    panel(
      'bd-narrow',
      h('p', { class: 'bd-kicker' }, `Pauza · ${DIFF[o.diff].name}`),
      h('h2', { class: 'bd-title' }, 'Wstrzymano'),
      h(
        'div',
        { class: 'bd-btns' },
        btn('Wznów', o.onResume, { cls: 'bd-primary', hint: 'Esc', id: 'resume' }),
        btn('Zapisz grę', o.onSave, { disabled: !o.save.ok, hint: o.save.reason, id: 'save' }),
        btn('Ustawienia', o.onOptions, { id: 'options' }),
        btn('Sterowanie', o.onControls, { id: 'controls' }),
        btn('Menu główne', o.onMenu, { id: 'menu' }),
      ),
    ),
  );
  return { kind: 'pause', el, pausesSim: true };
}

const DEATH_TEXT: Record<string, string> = {
  stalker: 'Wysoki pochyla się nad tobą. Ostatnie, co widzisz, to szczelina tam, gdzie powinna być jego twarz.',
  crawler: 'Pełzacz nie przestaje, kiedy już leżysz. Słyszysz jeszcze drapanie pazurów o dywan.',
  echo: 'Echo mówi twoim głosem. Mówi, że wszystko w porządku. Mówi to jeszcze długo.',
  collapse: 'Zakładka zamyka się nad tobą jak woda. Nie ma już korytarzy. Nie ma już ciebie.',
};

export function deathView(o: { by: string; hasSave: boolean; deaths: number; onLoad: () => void; onMenu: () => void }): Modal {
  const el = layer(
    panel(
      'bd-narrow bd-death',
      h('p', { class: 'bd-kicker' }, 'Zginąłeś'),
      h('h2', { class: 'bd-title' }, 'Koniec drogi'),
      h('p', { class: 'bd-text' }, DEATH_TEXT[o.by] ?? DEATH_TEXT.stalker),
      h('p', { class: 'bd-text bd-dim', style: 'font-size:13px' }, 'Wysoki słyszy bieg i trzaskanie drzwiami, sprawdza szafki, jeśli widział, jak do nich wchodzisz. Pełzacz widzi pod stołami. Echo boi się latarki skierowanej w twarz.'),
      h('div', { class: 'bd-btns' }, btn('Wróć do ostatniego zapisu', o.onLoad, { cls: 'bd-primary', disabled: !o.hasSave, hint: `śmierci: ${o.deaths}`, id: 'load' }), btn('Menu główne', o.onMenu, { id: 'menu' })),
    ),
    'bd-black',
  );
  return { kind: 'death', el, pausesSim: true };
}

export function endingView(o: { id: EndingId; sim: Sim; endings: number; newBest: boolean; hasSave: boolean; onReplay: () => void; onDecision: () => void; onMenu: () => void }): Modal {
  const E = ENDINGS[o.id];
  const st = o.sim.state;
  const acc = st.stats.shots ? Math.round((st.stats.hits / st.stats.shots) * 100) : 0;
  const el = layer(
    panel(
      'bd-ending',
      h('p', { class: 'bd-kicker' }, `${E.secret ? 'Zakończenie sekretne' : 'Zakończenie'} · ${DIFF[st.difficulty].name}`),
      h('h2', { class: 'bd-title', style: 'font-size:46px' }, E.title),
      ...E.paragraphs.map((p, i) => h('p', { class: 'bd-text', style: `animation-delay:${0.4 + i * 0.9}s` }, p)),
      h(
        'div',
        { class: 'bd-stats' },
        h('div', null, h('b', null, fmtTime(st.playTime)), h('span', null, o.newBest ? 'czas gry · rekord' : 'czas gry')),
        h('div', null, h('b', null, `${st.docs.length}/${DOCS.length}`), h('span', null, 'dokumenty')),
        h('div', null, h('b', null, String(st.stats.kills)), h('span', null, 'zabite istoty')),
        h('div', null, h('b', null, `${acc}%`), h('span', null, `celność (${st.stats.hits}/${st.stats.shots})`)),
        h('div', null, h('b', null, String(st.deaths)), h('span', null, 'śmierci')),
        h('div', null, h('b', null, `${st.inv.tags}/5`), h('span', null, 'nieśmiertelniki')),
        h('div', null, h('b', null, `${o.endings}/3`), h('span', null, 'odkryte zakończenia')),
      ),
      h(
        'div',
        { class: 'bd-btns' },
        o.hasSave ? btn('Wróć do ostatniego zapisu', o.onDecision, { hint: 'spróbuj innego wyboru', id: 'decision' }) : null,
        btn('Zagraj od nowa', o.onReplay, { cls: 'bd-primary', id: 'replay' }),
        btn('Menu główne', o.onMenu, { id: 'menu' }),
        h('a', { class: 'bd-btn', href: '/', target: '_top', style: 'text-decoration:none', 'data-id': 'evgames' }, h('span', null, 'Powrót do EVGAMES')),
      ),
    ),
    'bd-black',
  );
  return { kind: 'ending', el, pausesSim: true };
}

// ---------------------------------------------------------------- reading
export function docView(sim: Sim, id: string, onClose: () => void): Modal {
  const d = DOC_BY_ID[id];
  const el = layer(panel('bd-paper', h('p', { class: 'bd-kicker' }, d.kind), h('h2', { class: 'bd-title', style: 'font-size:28px' }, d.title), h('p', { class: 'bd-text' }, d.text(sim.puzzle)), h('div', { class: 'bd-row' }, btn('Odłóż', onClose, { hint: 'E / Esc', id: 'close' }))));
  return { kind: 'doc', el, pausesSim: true, key: (e) => (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Tab' ? (onClose(), true) : false) };
}

/** A picture to look at closely: the roster, a clock, a wall writing. */
export function imageView(title: string, kicker: string, img: HTMLCanvasElement, caption: string, onClose: () => void): Modal {
  const c = h('canvas', { class: 'bd-image', width: img.width, height: img.height }) as HTMLCanvasElement;
  c.getContext('2d')!.drawImage(img, 0, 0);
  const el = layer(panel('bd-wide', h('p', { class: 'bd-kicker' }, kicker), h('h2', { class: 'bd-title', style: 'font-size:28px' }, title), c, h('p', { class: 'bd-text bd-dim', style: 'margin-top:10px' }, caption), h('div', { class: 'bd-row' }, btn('Zamknij', onClose, { hint: 'E / Esc', id: 'close' }))));
  return { kind: 'image', el, pausesSim: true, key: (e) => (e.code === 'Escape' || e.code === 'KeyE' ? (onClose(), true) : false) };
}

type JTab = 'znaki' | 'obserwacje' | 'dokumenty' | 'notatki';

export function journalView(sim: Sim, onClose: () => void): Modal {
  let tab: JTab = 'znaki';
  let reading: string | null = null;
  const st = sim.state;
  const full = sim.diff.journal === 'full';
  const tabs = h('div', { class: 'bd-tabs', role: 'tablist' });
  const body = h('div');
  const p = panel('bd-wide', h('p', { class: 'bd-kicker' }, `Dziennik · ${ZONE_NAMES[sim.zone ?? 'maze']}`), tabs, body, h('div', { class: 'bd-row' }, btn('Zamknij', onClose, { hint: 'Tab / Esc', id: 'close' })));
  const draw = () => {
    tabs.replaceChildren(
      ...(['znaki', 'obserwacje', 'dokumenty', 'notatki'] as JTab[]).map((t) => {
        const b = btn(t[0].toUpperCase() + t.slice(1), () => {
          tab = t;
          reading = null;
          draw();
        }, { id: `tab-${t}` });
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(t === tab));
        if (t === tab) b.classList.add('active');
        return b;
      }),
    );
    body.replaceChildren(...content());
  };
  const content = (): HTMLElement[] => {
    if (tab === 'znaki') {
      const known = sim.symbolsKnown();
      const out: HTMLElement[] = [
        h('p', { class: 'bd-text' }, st.obs.includes('order') || sim.fired('armorySeen') ? 'Kolejność na drzwiach zbrojowni:' : 'Kolejności znaków jeszcze nie znasz — jest wybita na drzwiach zbrojowni.'),
      ];
      if (st.obs.includes('order') || sim.fired('armorySeen')) out.push(h('div', { class: 'bd-order' }, ...sim.puzzle.order.map((s) => symSvg(s, '#e9e1c9'))));
      out.push(
        h(
          'div',
          { class: 'bd-journal-grid' },
          ...SYMBOLS.map((s) => {
            const input = h('input', { type: 'text', inputmode: 'numeric', maxlength: '1', value: st.hypotheses[s], 'aria-label': `Hipoteza: ${SYM_NAME[s]}`, 'data-sym': s }) as HTMLInputElement;
            input.addEventListener('input', () => {
              input.value = input.value.replace(/[^0-9]/g, '').slice(0, 1);
              st.hypotheses[s] = input.value;
            });
            return h('div', { class: 'bd-sym' }, symSvg(s, known.includes(s) ? '#d8bf6a' : '#6d6550'), h('b', null, SYM_NAME[s]), input, h('small', null, known.includes(s) ? 'wskazówka znaleziona' : sim.diff.journal === 'none' ? '' : SYM_PLACE[s]));
          }),
        ),
      );
      const guess = SYMBOLS.every((s) => st.hypotheses[s]) ? sim.puzzle.order.map((s) => st.hypotheses[s]).join('') : null;
      out.push(h('p', { class: 'bd-text bd-dim' }, guess ? `Twój kod według hipotez (w kolejności z drzwi): ${guess}` : 'Wpisz swoje hipotezy pod znakami. Dziennik zapisuje je razem z grą.'));
      if (full && known.length === 5) out.push(h('p', { class: 'bd-text' }, `STORY: wszystkie znaki odkryte. Kod: ${codeOf(sim.puzzle)}`));
      out.push(h('p', { class: 'bd-h3' }, 'Ekwipunek'));
      const inv = [`Baterie: ${st.inv.battery}`, `Apteczki: ${st.inv.medkit}`, st.revolver ? `Rewolwer: ${st.loaded}/6, zapas ${st.inv.ammo}` : '', st.liftcard ? 'Karta windy' : '', st.inv.tags ? `Nieśmiertelniki: ${st.inv.tags}/5` : ''].filter(Boolean);
      out.push(h('p', { class: 'bd-text' }, inv.join(' · ')));
      return out;
    }
    if (tab === 'obserwacje') {
      if (sim.diff.journal === 'none') return [h('p', { class: 'bd-text bd-dim' }, 'NO MERCY: dziennik niczego nie zapisuje za ciebie. Korzystaj z notatek.')];
      const items = st.obs.map((id) => obsText(id, sim.puzzle, full).text);
      return [h('ul', { class: 'bd-obs' }, ...(items.length ? items.map((t) => h('li', null, t)) : [h('li', { class: 'bd-dim' }, 'Jeszcze nic. Przyglądaj się zegarom, tablicom, napisom, słuchaj radia.')]))];
    }
    if (tab === 'dokumenty') {
      if (reading) {
        const d = DOC_BY_ID[reading];
        return [h('div', { class: 'bd-panel bd-paper', style: 'width:100%;max-height:none' }, h('p', { class: 'bd-kicker' }, d.kind), h('h2', { class: 'bd-title', style: 'font-size:26px' }, d.title), h('p', { class: 'bd-text' }, d.text(sim.puzzle)), h('div', { class: 'bd-row' }, btn('Lista', () => ((reading = null), draw()), { id: 'doc-back' })))];
      }
      return [
        h('p', { class: 'bd-text bd-dim' }, `Znalezione: ${st.docs.length} z ${DOCS.length}`),
        h('div', { class: 'bd-doclist' }, ...DOCS.map((d) => (st.docs.includes(d.id) ? btn(d.title, () => ((reading = d.id), draw()), { hint: d.kind, id: `doc-${d.id}` }) : btn('— nieznaleziony —', () => {}, { disabled: true })))),
      ];
    }
    const ta = h('textarea', { class: 'bd-notes', 'aria-label': 'Notatki', 'data-id': 'notes' }) as HTMLTextAreaElement;
    ta.value = st.notes;
    ta.addEventListener('input', () => (st.notes = ta.value.slice(0, 4000)));
    return [h('p', { class: 'bd-text bd-dim' }, 'Twoje notatki. Zapisują się razem z grą.'), ta];
  };
  draw();
  return {
    kind: 'journal',
    el: layer(p),
    pausesSim: true,
    key: (e) => {
      if (e.code === 'Escape' || e.code === 'Tab') return onClose(), true;
      return false;
    },
  };
}

// ---------------------------------------------------------------- devices
function termPanel(kicker: string, title: string, ...rest: (HTMLElement | null)[]) {
  return panel('bd-term', h('p', { class: 'bd-kicker' }, kicker), h('h2', { class: 'bd-title', style: 'font-size:26px' }, title), ...rest);
}

export function keypadView(sim: Sim, o: { onClose: () => void; onResult: (r: 'ok' | 'bad' | 'locked') => void; onPress: () => void }): Modal {
  let code = '';
  let bad = false;
  const slots = h('div', { class: 'bd-slots', 'aria-live': 'polite' });
  const info = h('p', { class: 'bd-text bd-dim', style: 'margin-top:10px;font-size:13px' });
  const show = () => {
    slots.className = `bd-slots${bad ? ' bad' : ''}`;
    slots.replaceChildren(...Array.from({ length: 5 }, (_, i) => h('div', null, code[i] ?? '_')));
    const st = sim.state;
    const left = Math.ceil(st.lockUntil - st.playTime);
    const tries = sim.diff.codeTries ? `Pozostałe próby przed blokadą: ${Math.max(0, sim.diff.codeTries - st.codeTries)}.` : 'Ten zamek się nie blokuje (STORY), ale każda pomyłka jest głośna.';
    info.textContent = left > 0 ? `ZAMEK ZABLOKOWANY: ${left} s.` : `Cyfry z klawiatury, Enter — zatwierdź, Backspace — cofnij. ${tries}`;
  };
  const press = (k: string) => {
    o.onPress();
    if (bad) {
      bad = false;
      code = '';
    }
    if (k === 'C') code = '';
    else if (k === '<') code = code.slice(0, -1);
    else if (k === 'OK') {
      if (code.length < 5) return show();
      const r = sim.enterCode(code);
      o.onResult(r);
      if (r === 'ok') return;
      bad = true;
      code = r === 'locked' ? '' : code;
    } else if (code.length < 5) code += k;
    show();
  };
  show();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
  const el = layer(
    panel(
      'bd-narrow bd-term',
      h('p', { class: 'bd-kicker' }, 'Zamek szyfrowy · Zbrojownia'),
      h('div', { class: 'bd-order' }, ...sim.puzzle.order.map((s) => symSvg(s, '#c4ffd2'))),
      slots,
      h('div', { class: 'bd-keypad' }, ...keys.map((k) => btn(k, () => press(k), { id: `k-${k}` }))),
      info,
      h('div', { class: 'bd-row' }, btn('Odejdź', o.onClose, { hint: 'Esc', id: 'close' })),
    ),
  );
  const t = window.setInterval(show, 1000);
  return {
    kind: 'keypad',
    el,
    pausesSim: false,
    onClose: () => window.clearInterval(t),
    key: (e) => {
      if (e.code === 'Escape') return o.onClose(), true;
      const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
      if (m) return press(m[1]), true;
      if (e.code === 'Enter' || e.code === 'NumpadEnter') return press('OK'), true;
      if (e.code === 'Backspace') return press('<'), true;
      return false;
    },
  };
}

export function generatorView(sim: Sim, o: { onClose: () => void; onAction: (a: 'pump' | 'choke' | 'start') => void }): Modal {
  const box = h('div');
  const draw = (msg = '') => {
    const g = sim.state.gen;
    box.replaceChildren(
      termPanel(
        'Agregat prądotwórczy · panel',
        g.on ? 'Agregat pracuje' : 'Agregat stoi',
        h('div', { class: 'bd-lamps' }, ...[0, 1, 2].map((i) => h('span', { class: g.on ? 'ok' : g.step > i ? 'on' : '' }))),
        h('div', { class: 'bd-gen' }, btn('POMPA PALIWA', () => o.onAction('pump'), { disabled: g.on, id: 'pump' }), btn('SSANIE', () => o.onAction('choke'), { disabled: g.on, id: 'choke' }), btn('ROZRUSZNIK', () => o.onAction('start'), { disabled: g.on, id: 'start' })),
        h('p', { class: 'bd-text', style: 'margin-top:12px' }, msg || (g.on ? 'Zasilanie pomocnicze: KOMPLEKS MAGAZYNOWY · KAMERY · RADIO · UV · ŚLUZA.' : 'Trzy przełączniki. Kolejność ma znaczenie.')),
        h('div', { class: 'bd-row' }, btn('Odejdź', o.onClose, { hint: 'Esc', id: 'close' })),
      ),
    );
  };
  draw();
  const m: Modal & { drawMsg: (msg: string) => void } = { kind: 'generator', el: layer(box), pausesSim: false, refresh: () => draw(), key: esc(o.onClose), drawMsg: draw };
  return m;
}

export function radioView(sim: Sim, o: { onClose: () => void; onTune: (f: number) => void; onListen: () => void }): Modal {
  const dial = h('div', { class: 'bd-dial', 'aria-live': 'polite' });
  const range = h('input', { type: 'range', min: 2.5, max: 5, step: 0.01, value: sim.radioFreq, 'aria-label': 'Częstotliwość', 'data-id': 'freq' }) as HTMLInputElement;
  const log = h('p', { class: 'bd-text', style: 'min-height:3.2em' });
  const show = () => (dial.textContent = `${sim.radioFreq.toFixed(2)} MHz`);
  range.addEventListener('input', () => {
    o.onTune(Number(range.value));
    show();
  });
  show();
  const el = layer(
    termPanel(
      'Odbiornik krótkofalowy',
      'Radiostacja',
      dial,
      range,
      h('div', { class: 'bd-row' }, btn('− 0.01', () => step(-0.01), { id: 'minus' }), btn('Słuchaj', o.onListen, { cls: 'bd-primary', id: 'listen' }), btn('+ 0.01', () => step(0.01), { id: 'plus' })),
      log,
      h('p', { class: 'bd-text bd-dim', style: 'font-size:13px' }, 'Strzałki ← → stroją, Spacja — słuchaj.'),
      h('div', { class: 'bd-row' }, btn('Odejdź', o.onClose, { hint: 'Esc', id: 'close' })),
    ),
  );
  function step(d: number) {
    const f = Math.round((sim.radioFreq + d) * 100) / 100;
    o.onTune(Math.max(2.5, Math.min(5, f)));
    range.value = String(sim.radioFreq);
    show();
  }
  return {
    kind: 'radio',
    el,
    pausesSim: false,
    refresh: () => {
      range.value = String(sim.radioFreq);
      show();
    },
    key: (e) => {
      if (e.code === 'Escape') return o.onClose(), true;
      if (e.code === 'ArrowLeft') return step(e.shiftKey ? -0.1 : -0.01), true;
      if (e.code === 'ArrowRight') return step(e.shiftKey ? 0.1 : 0.01), true;
      if (e.code === 'Space') return o.onListen(), true;
      return false;
    },
    log,
  } as Modal & { log: HTMLElement };
}

export function cctvView(sim: Sim, o: { onClose: () => void; onSwitch: (d: number) => void }): Modal {
  const tl = h('div', { class: 'tl' });
  const tr = h('div', { class: 'tr' });
  const bl = h('div', { class: 'bl' });
  const br = h('div', { class: 'br' });
  const el = h('div', { class: 'bd-cctv' }, tl, tr, bl, br);
  const draw = () => {
    const c = sim.cctv;
    if (!c) return;
    const cam = CAMERAS[c.cam];
    tl.replaceChildren(h('div', { class: 'rec' }, 'REC'), h('div', null, cam.name));
    tr.replaceChildren(h('div', null, 'INSTYTUT · SIEĆ WEWN.'));
    bl.replaceChildren(h('div', { class: 'dots' }, ...CAMERAS.map((k, i) => h('span', { class: i === c.cam ? 'on' : '' }, String(k.id)))));
    br.replaceChildren(h('div', { class: 'bd-cctv-actions' }, btn('A · Poprzednia', () => o.onSwitch(-1), { cls: 'bd-small', id: 'prev' }), btn('D · Następna', () => o.onSwitch(1), { cls: 'bd-small', id: 'next' }), btn('E · Odejdź', o.onClose, { cls: 'bd-small', id: 'close' })));
  };
  draw();
  return {
    kind: 'cctv',
    el,
    pausesSim: false,
    refresh: draw,
    key: (e) => {
      if (e.code === 'Escape' || e.code === 'KeyE') return o.onClose(), true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') return o.onSwitch(-1), true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') return o.onSwitch(1), true;
      const m = /^Digit([1-4])$/.exec(e.code);
      if (m && sim.cctv) return o.onSwitch(Number(m[1]) - 1 - sim.cctv.cam), true;
      return false;
    },
  };
}

export function terminalView(sim: Sim, o: { onClose: () => void; onChoice: (c: 'destroy' | 'open' | 'call') => void }): Modal {
  const st = sim.state;
  const chosen = st.flags.some((f) => f.startsWith('choice_'));
  let confirm: 'destroy' | 'open' | 'call' | null = null;
  const box = h('div');
  const draw = () => {
    const text = chosen
      ? 'POLECENIE PRZYJĘTE.'
      : st.stabilizers.length < 3
        ? `STABILIZATORY: ${st.stabilizers.length}/3\nKOTWICA: PRACA NOMINALNA`
        : 'KOTWICA: PRACA NOMINALNA\nSTABILIZATORY W POZYCJI SERWISOWEJ\n\nDOSTĘPNE POLECENIA:';
    box.replaceChildren(
      termPanel(
        'Instytut Topologii Stosowanej · terminal serwisowy',
        'Kotwica',
        h('p', { class: 'bd-text' }, text),
        confirm ? h('p', { class: 'bd-warning' }, confirm === 'destroy' ? 'Wyłączenie Kotwicy zapadnie zakładkę. Będziesz mieć niewiele czasu, żeby dobiec do Drzwi bez klamki. Na pewno?' : confirm === 'open' ? 'Otworzyć Drzwi Wyjściowe przy pracującej Kotwicy? Prowadzą głębiej.' : 'Wywołać Zwiad 4? Będziesz musiał przetrwać, aż dotrą.') : null,
        !chosen && st.stabilizers.length >= 3
          ? h(
              'div',
              { class: 'bd-btns' },
              confirm
                ? btn('TAK — WYKONAJ', () => o.onChoice(confirm!), { cls: 'bd-danger', id: 'yes' })
                : null,
              confirm ? btn('Anuluj', () => ((confirm = null), draw()), { id: 'no' }) : null,
              !confirm ? btn('WYŁĄCZ KOTWICĘ', () => ((confirm = 'destroy'), draw()), { id: 'destroy' }) : null,
              !confirm ? btn('OTWÓRZ DRZWI WYJŚCIOWE', () => ((confirm = 'open'), draw()), { id: 'open' }) : null,
              !confirm && st.inv.tags >= 5 ? btn('WYWOŁAJ: ZWIAD 4 (5 nieśmiertelników)', () => ((confirm = 'call'), draw()), { cls: 'bd-primary', id: 'call' }) : null,
            )
          : null,
        h('div', { class: 'bd-row' }, btn('Odejdź', o.onClose, { hint: 'Esc', id: 'close' })),
      ),
    );
  };
  draw();
  return { kind: 'terminal', el: layer(box), pausesSim: false, key: esc(o.onClose) };
}
