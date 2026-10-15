// Every full-screen view and in-game device interface. Each builder returns a
// Modal; the app decides when to show it and what the callbacks do.
import { CAMERAS, CELL, CONSUMERS, DOORS, GRID_H, GRID_W, ROOMS, ZONE_NAMES, ITEM_NAMES, type ZoneId } from '../world/map';
import type { Sim } from '../game/sim';
import type { Meta, Settings } from '../game/state';
import { DOC_BY_ID, DOCS, ENDING_ORDER, ENDINGS, MISSIONS, clockText, type EndingId } from '../game/story';
import { btn, fmtTime, h, panel } from './dom';

export interface Modal {
  kind: string;
  el: HTMLElement;
  /** does the simulation stop while this is open? */
  pausesSim: boolean;
  /** keyboard handling while open; return true when the key was used */
  key?: (e: KeyboardEvent) => boolean;
  /** rebuild dynamic content (after an action or a power change) */
  refresh?: () => void;
  /** layer style */
  clear?: boolean;
}

const layer = (content: HTMLElement, cls = '') => h('div', { class: `ns-layer ${cls}`.trim() }, content);

// ---------------------------------------------------------------- loading & errors
export function loadingView() {
  const bar = h('i');
  const label = h('p', { class: 'ns-text ns-dim ns-mono' }, 'Przygotowanie…');
  const pct = h('span');
  const el = layer(
    h('div', { class: 'ns-loading' }, h('p', { class: 'ns-kicker' }, 'Ośrodek H-27 · nocna zmiana'), h('h1', { class: 'ns-title' }, 'NIGHT SHIFT: 03:17'), h('div', { class: 'ns-bar' }, bar), h('div', { class: 'ns-row', style: 'justify-content:space-between;margin:0' }, label, pct)),
    'ns-black',
  );
  return {
    el,
    set(done: number, total: number, text: string) {
      const p = Math.round((done / total) * 100);
      bar.style.width = `${p}%`;
      label.textContent = text;
      pct.textContent = `${p}%`;
      pct.className = 'ns-mono ns-dim';
    },
  };
}

export function gateView(onEnter: () => void) {
  // a real click is needed before audio may start and before the pointer can be locked
  return layer(
    h(
      'div',
      { class: 'ns-loading' },
      h('p', { class: 'ns-kicker' }, 'Gotowe'),
      h('h1', { class: 'ns-title' }, 'NIGHT SHIFT: 03:17'),
      h('p', { class: 'ns-text ns-dim' }, 'Gra korzysta z dźwięku przestrzennego. Najlepiej grać w słuchawkach, przy przyciemnionym świetle.'),
      h('div', { class: 'ns-btns' }, btn('Wejdź do ośrodka', onEnter, { cls: 'ns-primary', hint: 'klik / Enter', id: 'enter' })),
    ),
    'ns-black',
  );
}

export function errorView(title: string, text: string) {
  return h('div', { class: 'ns-error', role: 'alert' }, h('h2', { class: 'ns-title', style: 'font-size:28px' }, title), h('p', { class: 'ns-text' }, text), h('a', { href: '/', target: '_top', class: 'ns-btn', style: 'display:inline-flex;text-decoration:none' }, 'Powrót do EVGAMES'));
}

// ---------------------------------------------------------------- main menu
export function menuView(o: {
  save: { mission: number; playTime: number; clock: number } | null;
  warning: string | null;
  endings: number;
  onContinue: () => void;
  onNew: () => void;
  onOptions: () => void;
  onControls: () => void;
  onEndings: () => void;
}): Modal {
  const m = o.save ? MISSIONS[Math.min(o.save.mission, MISSIONS.length - 1)] : null;
  const el = layer(
    h(
      'div',
      { class: 'ns-menu' },
      h('h1', { class: 'ns-logo' }, 'Night', h('br'), 'Shift', h('span', { class: 'ns-logo-time' }, '03:17')),
      h('p', { class: 'ns-tag' }, 'Ośrodek badawczy H-27. Twoja pierwsza nocna zmiana. Ta sama noc — znowu.'),
      o.warning ? h('p', { class: 'ns-warning', role: 'alert' }, o.warning) : null,
      h(
        'nav',
        { class: 'ns-btns', 'aria-label': 'Menu główne' },
        o.save && m ? btn('Kontynuuj', o.onContinue, { cls: 'ns-primary', hint: `${m.title} · ${clockText(o.save.clock)} · ${fmtTime(o.save.playTime)}`, id: 'continue' }) : null,
        btn('Nowa gra', o.onNew, { cls: o.save ? '' : 'ns-primary', id: 'new' }),
        btn('Ustawienia', o.onOptions, { id: 'options' }),
        btn('Sterowanie', o.onControls, { id: 'controls' }),
        btn('Zakończenia', o.onEndings, { hint: `${o.endings}/4`, id: 'endings' }),
        h('a', { class: 'ns-btn', href: '/', target: '_top', 'data-id': 'evgames', style: 'text-decoration:none' }, h('span', null, 'Powrót do EVGAMES'), h('small', null, 'biblioteka gier')),
      ),
      h('p', { class: 'ns-foot' }, 'EVGAMES · NIGHT SHIFT: 03:17 · v1.0 · postęp zapisuje się lokalnie w przeglądarce'),
    ),
    'ns-clear',
  );
  return { kind: 'menu', el, pausesSim: true, clear: true };
}

export function confirmView(title: string, text: string, yes: string, onYes: () => void, onNo: () => void): Modal {
  const el = layer(panel('ns-narrow', h('h2', { class: 'ns-title' }, title), h('p', { class: 'ns-text' }, text), h('div', { class: 'ns-row' }, btn('Anuluj', onNo, { id: 'no' }), btn(yes, onYes, { cls: 'ns-danger', id: 'yes' }))));
  return { kind: 'confirm', el, pausesSim: true, key: (e) => (e.code === 'Escape' ? (onNo(), true) : false) };
}

// ---------------------------------------------------------------- options
export function optionsView(s: Settings, onChange: (s: Settings) => void, onBack: () => void, isFullscreen: () => boolean, toggleFullscreen: () => void): Modal {
  const body = h('div');
  const slider = (label: string, key: 'music' | 'sfx' | 'ambient' | 'sensitivity', min: number, max: number, step: number, fmt: (v: number) => string) => {
    const out = h('output', null, fmt(s[key]));
    const input = h('input', { type: 'range', min, max, step, value: s[key], 'aria-label': label, 'data-setting': key }) as HTMLInputElement;
    input.addEventListener('input', () => {
      s[key] = Number(input.value);
      out.textContent = fmt(s[key]);
      onChange(s);
    });
    return h('label', { class: 'ns-setting' }, h('span', null, label), input, out);
  };
  const check = (label: string, key: 'invertY' | 'reduced' | 'headBob', note?: string) => {
    const input = h('input', { type: 'checkbox', 'data-setting': key }) as HTMLInputElement;
    input.checked = s[key];
    input.addEventListener('change', () => {
      s[key] = input.checked;
      onChange(s);
    });
    return h('label', { class: 'ns-check' }, input, h('span', null, label, note ? h('small', { class: 'ns-dim', style: 'display:block;font-size:12px' }, note) : null));
  };
  const seg = <T extends string | number>(label: string, opts: [T, string][], get: () => T, set: (v: T) => void, id: string) => {
    const wrap = h('div', { class: 'ns-seg', 'data-setting': id });
    const draw = () => {
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
    };
    draw();
    return h('div', { class: 'ns-setting' }, h('span', null, label), wrap, h('output'));
  };
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const fsBtn = btn(isFullscreen() ? 'Wyłącz pełny ekran' : 'Włącz pełny ekran', () => {
    toggleFullscreen();
    window.setTimeout(() => (fsBtn.firstChild!.textContent = isFullscreen() ? 'Wyłącz pełny ekran' : 'Włącz pełny ekran'), 250);
  }, { id: 'fullscreen' });
  body.append(
    h('p', { class: 'ns-h3' }, 'Dźwięk'),
    slider('Muzyka', 'music', 0, 1, 0.05, pct),
    slider('Efekty', 'sfx', 0, 1, 0.05, pct),
    slider('Otoczenie', 'ambient', 0, 1, 0.05, pct),
    h('p', { class: 'ns-h3' }, 'Sterowanie'),
    slider('Czułość myszy', 'sensitivity', 0.2, 3, 0.05, (v) => `${v.toFixed(2)}×`),
    check('Odwróć oś Y', 'invertY'),
    check('Kołysanie kamery przy chodzeniu', 'headBob'),
    h('p', { class: 'ns-h3' }, 'Obraz'),
    seg('Jakość grafiki', [['low', 'Niska'], ['medium', 'Średnia'], ['high', 'Wysoka']] as ['low' | 'medium' | 'high', string][], () => s.quality, (v) => (s.quality = v), 'quality'),
    seg('Rozdzielczość renderu', [[0.5, '50%'], [0.75, '75%'], [1, '100%']] as [number, string][], () => s.renderScale, (v) => (s.renderScale = v), 'renderScale'),
    check('Ogranicz efekty', 'reduced', 'Mniej migotania, bez ziarna, aberracji i zakłóceń obrazu.'),
    h('div', { class: 'ns-row' }, fsBtn),
  );
  const el = layer(panel('', h('p', { class: 'ns-kicker' }, 'Ustawienia'), h('h2', { class: 'ns-title' }, 'Opcje'), body, h('div', { class: 'ns-row' }, btn('Wróć', onBack, { cls: 'ns-primary', id: 'back' }))));
  return { kind: 'options', el, pausesSim: true, key: (e) => (e.code === 'Escape' ? (onBack(), true) : false) };
}

export function controlsView(onBack: () => void): Modal {
  const rows: [string, string][] = [
    ['W A S D', 'ruch'],
    ['Mysz', 'rozglądanie się'],
    ['Shift', 'bieg (zużywa kondycję, jest głośny)'],
    ['C / Ctrl', 'kucanie (cicho, wolno)'],
    ['E', 'interakcja / wyjście z szafki'],
    ['F', 'latarka'],
    ['R', 'wymiana akumulatora latarki'],
    ['Tab', 'tablet: zadania, dokumenty, mapa, zasilanie'],
    ['Esc', 'pauza'],
    ['A / D', 'przełączanie kamer w konsoli monitoringu'],
    ['0–9, Enter', 'klawiatury kodowe'],
  ];
  const el = layer(
    panel(
      'ns-narrow',
      h('p', { class: 'ns-kicker' }, 'Sterowanie'),
      h('h2', { class: 'ns-title' }, 'Klawisze'),
      h('table', { class: 'ns-table' }, h('tbody', null, ...rows.map(([k, v]) => h('tr', null, h('td', null, h('span', { class: 'ns-key' }, k)), h('td', null, v))))),
      h('p', { class: 'ns-text ns-dim', style: 'margin-top:14px;font-size:13px' }, 'Czytanie dokumentów, tablet i pauza wstrzymują czas. Terminale, panel i kamery — nie. Przestój reaguje na hałas i unika światła latarki.'),
      h('div', { class: 'ns-row' }, btn('Wróć', onBack, { cls: 'ns-primary', id: 'back' })),
    ),
  );
  return { kind: 'controls', el, pausesSim: true, key: (e) => (e.code === 'Escape' ? (onBack(), true) : false) };
}

export function endingsView(meta: Meta, onBack: () => void): Modal {
  const el = layer(
    panel(
      'ns-narrow',
      h('p', { class: 'ns-kicker' }, 'Zakończenia'),
      h('h2', { class: 'ns-title' }, `${meta.endings.length} / 4`),
      h(
        'table',
        { class: 'ns-table' },
        h('tbody', null, ...ENDING_ORDER.map((id) => h('tr', null, h('td', null, meta.endings.includes(id) ? ENDINGS[id].title : '???'), h('td', { class: 'ns-dim ns-mono' }, meta.endings.includes(id) ? 'odkryte' : 'nieodkryte')))),
      ),
      meta.bestTime !== null ? h('p', { class: 'ns-text ns-dim', style: 'margin-top:12px' }, `Najszybsze ukończenie: ${fmtTime(meta.bestTime)}`) : null,
      h('div', { class: 'ns-row' }, btn('Wróć', onBack, { cls: 'ns-primary', id: 'back' })),
    ),
  );
  return { kind: 'endings', el, pausesSim: true, key: (e) => (e.code === 'Escape' ? (onBack(), true) : false) };
}

// ---------------------------------------------------------------- pause, death, ending
export function pauseView(o: { canSave: boolean; saveReason: string; onResume: () => void; onSave: () => void; onOptions: () => void; onControls: () => void; onMenu: () => void }): Modal {
  const el = layer(
    panel(
      'ns-narrow',
      h('p', { class: 'ns-kicker' }, 'Pauza'),
      h('h2', { class: 'ns-title' }, 'Zmiana wstrzymana'),
      h(
        'div',
        { class: 'ns-btns' },
        btn('Wznów', o.onResume, { cls: 'ns-primary', hint: 'Esc', id: 'resume' }),
        btn('Zapisz grę', o.onSave, { disabled: !o.canSave, hint: o.canSave ? '' : o.saveReason, id: 'save' }),
        btn('Ustawienia', o.onOptions, { id: 'options' }),
        btn('Sterowanie', o.onControls, { id: 'controls' }),
        btn('Menu główne', o.onMenu, { id: 'menu' }),
      ),
    ),
  );
  return { kind: 'pause', el, pausesSim: true };
}

export function deathView(o: { hasSave: boolean; deaths: number; onLoad: () => void; onMenu: () => void }): Modal {
  const el = layer(
    panel(
      'ns-narrow ns-death',
      h('p', { class: 'ns-kicker' }, 'Sygnał utracony'),
      h('h2', { class: 'ns-title' }, 'Przestój'),
      h('p', { class: 'ns-text' }, 'Zimne palce na karku. Zegar na ścianie cofa się do ostatniej pełnej minuty, którą pamiętasz.'),
      h('p', { class: 'ns-text ns-dim', style: 'font-size:13px' }, 'Przestój słyszy bieg i trzaskanie drzwiami. Światło latarki skierowane prosto na niego na chwilę go odpycha. Szafki pomagają, gdy cię nie widział.'),
      h('div', { class: 'ns-btns' }, btn('Wróć do ostatniego zapisu', o.onLoad, { cls: 'ns-primary', disabled: !o.hasSave, hint: `śmierci: ${o.deaths}`, id: 'load' }), btn('Menu główne', o.onMenu, { id: 'menu' })),
    ),
    'ns-black',
  );
  return { kind: 'death', el, pausesSim: true };
}

export function endingView(o: { id: EndingId; time: number; docs: number; deaths: number; endings: number; newBest: boolean; hasSave: boolean; onReplay: () => void; onDecision: () => void; onMenu: () => void }): Modal {
  const E = ENDINGS[o.id];
  const n = ENDING_ORDER.indexOf(o.id) + 1;
  const el = layer(
    panel(
      'ns-ending',
      h('p', { class: 'ns-kicker' }, `Zakończenie ${n} z 4 · 03:17`),
      h('h2', { class: 'ns-title', style: 'font-size:46px' }, E.title),
      ...E.paragraphs.map((p, i) => h('p', { class: 'ns-text', style: `animation-delay:${0.4 + i * 0.9}s` }, p)),
      h(
        'div',
        { class: 'ns-stats' },
        h('div', null, h('b', null, fmtTime(o.time)), h('span', null, o.newBest ? 'czas gry · nowy rekord' : 'czas gry')),
        h('div', null, h('b', null, `${o.docs}/${DOCS.length}`), h('span', null, 'dokumenty')),
        h('div', null, h('b', null, String(o.deaths)), h('span', null, 'spotkania z Przestojem')),
        h('div', null, h('b', null, `${o.endings}/4`), h('span', null, 'odkryte zakończenia')),
      ),
      h(
        'div',
        { class: 'ns-btns' },
        o.hasSave ? btn('Wróć do decyzji', o.onDecision, { hint: 'ostatni zapis przed 03:17', id: 'decision' }) : null,
        btn('Zagraj od nowa', o.onReplay, { cls: 'ns-primary', id: 'replay' }),
        btn('Menu główne', o.onMenu, { id: 'menu' }),
        h('a', { class: 'ns-btn', href: '/', target: '_top', style: 'text-decoration:none', 'data-id': 'evgames' }, h('span', null, 'Powrót do EVGAMES')),
      ),
    ),
    'ns-black',
  );
  return { kind: 'ending', el, pausesSim: true };
}

// ---------------------------------------------------------------- documents & tablet
export function docView(id: string, onClose: () => void): Modal {
  const d = DOC_BY_ID[id];
  const el = layer(panel('ns-paper', h('p', { class: 'ns-kicker' }, d.kind), h('h2', { class: 'ns-title', style: 'font-size:28px' }, d.title), h('p', { class: 'ns-text' }, d.text), h('div', { class: 'ns-row' }, btn('Odłóż', onClose, { hint: 'E / Esc', id: 'close' }))));
  return { kind: 'doc', el, pausesSim: true, key: (e) => (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Tab' ? (onClose(), true) : false) };
}

type TabletTab = 'zadania' | 'dokumenty' | 'mapa' | 'zasilanie';

export function tabletView(sim: Sim, start: TabletTab, onClose: () => void): Modal {
  let tab: TabletTab = start;
  let reading: string | null = null;
  const tabs = h('div', { class: 'ns-tabs', role: 'tablist' });
  const body = h('div');
  const p = panel('ns-wide', h('p', { class: 'ns-kicker' }, `Tablet technika · ${clockText(sim.state.clock)}`), tabs, body, h('div', { class: 'ns-row' }, btn('Zamknij', onClose, { hint: 'Tab / Esc', id: 'close' })));
  const draw = () => {
    tabs.replaceChildren(
      ...(['zadania', 'dokumenty', 'mapa', 'zasilanie'] as TabletTab[]).map((t) => {
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
    const st = sim.state;
    if (tab === 'zadania') {
      const m = MISSIONS[Math.min(st.mission, MISSIONS.length - 1)];
      const out: HTMLElement[] = [h('h2', { class: 'ns-title', style: 'font-size:28px' }, m.title), h('p', { class: 'ns-text' }, sim.objective())];
      if (m.hint) out.push(h('p', { class: 'ns-text ns-dim' }, m.hint));
      if (st.mission >= 7) for (const g of sim.decisionGoals()) out.push(h('div', { class: 'ns-goal' }, h('h4', null, g.title), h('ul', null, ...g.steps.map((s) => h('li', { class: s.done ? 'done' : '' }, `${s.done ? '[x]' : '[  ]'} ${s.text}`)))));
      out.push(h('p', { class: 'ns-h3' }, 'Zakończone etapy'));
      out.push(h('ul', { class: 'ns-text ns-dim', style: 'padding-left:18px;margin:0' }, ...MISSIONS.slice(0, Math.min(st.mission, 7)).map((x) => h('li', null, x.title))));
      out.push(h('p', { class: 'ns-h3' }, 'Ekwipunek'));
      const inv = [...new Set(st.inventory.map((i) => ITEM_NAMES[i]))].map((name) => `${name}${st.inventory.filter((i) => ITEM_NAMES[i] === name).length > 1 ? ` ×${st.inventory.filter((i) => ITEM_NAMES[i] === name).length}` : ''}`);
      out.push(h('p', { class: 'ns-text' }, inv.length ? inv.join(' · ') : 'Pusto. Latarka i tablet.'));
      return out;
    }
    if (tab === 'dokumenty') {
      if (reading) {
        const d = DOC_BY_ID[reading];
        return [h('div', { class: 'ns-panel ns-paper', style: 'width:100%;max-height:none' }, h('p', { class: 'ns-kicker' }, d.kind), h('h2', { class: 'ns-title', style: 'font-size:26px' }, d.title), h('p', { class: 'ns-text' }, d.text), h('div', { class: 'ns-row' }, btn('Lista dokumentów', () => ((reading = null), draw()), { id: 'doc-back' })))];
      }
      return [
        h('p', { class: 'ns-text ns-dim' }, `Znalezione: ${st.docs.length} z ${DOCS.length}`),
        h(
          'div',
          { class: 'ns-doclist' },
          ...DOCS.map((d) =>
            st.docs.includes(d.id)
              ? btn(d.title, () => ((reading = d.id), draw()), { hint: d.kind, id: `doc-${d.id}` })
              : btn('— nieznaleziony —', () => {}, { disabled: true }),
          ),
        ),
      ];
    }
    if (tab === 'mapa') {
      const c = h('canvas', { class: 'ns-map', width: 760, height: 400, 'aria-label': 'Mapa ośrodka' }) as HTMLCanvasElement;
      drawMap(c, sim, sim.has('hasMap'));
      return [c, h('p', { class: 'ns-text ns-dim', style: 'margin-top:8px;font-size:13px' }, sim.has('hasMap') ? 'Plan ewakuacyjny z recepcji. Zielone drzwi: otwarte, szare: odblokowane, czerwone: zablokowane.' : 'Mapa pokazuje tylko odwiedzone pomieszczenia. Pełny plan wisi w recepcji.')];
    }
    // zasilanie
    return [
      h('p', { class: 'ns-text' }, `${st.power.main ? 'Sieć główna' : 'Zasilanie rezerwowe'} · zużycie ${sim.used}/${sim.capacity} · bezpieczniki ${st.power.fuses}/2`),
      capBar(sim),
      ...CONSUMERS.map((c) => h('div', { class: 'ns-circuit' }, h('div', null, `${c.name} (${c.cost})`, h('small', null, c.desc)), h('span', { class: `ns-mono ${sim.powered(c.id) ? '' : 'ns-dim'}` }, sim.powered(c.id) ? 'WŁ.' : 'WYŁ.'))),
      h('p', { class: 'ns-text ns-dim', style: 'margin-top:10px;font-size:13px' }, 'Obwody przełączysz tylko przy panelu w pomieszczeniu technicznym.'),
    ];
  };
  draw();
  return {
    kind: 'tablet',
    el: layer(p),
    pausesSim: true,
    key: (e) => {
      if (e.code === 'Escape' || e.code === 'Tab') {
        onClose();
        return true;
      }
      const map: Record<string, TabletTab> = { Digit1: 'zadania', Digit2: 'dokumenty', Digit3: 'mapa', Digit4: 'zasilanie' };
      if (map[e.code]) {
        tab = map[e.code];
        reading = null;
        draw();
        return true;
      }
      return false;
    },
  };
}

function capBar(sim: Sim) {
  const wrap = h('div', { class: 'ns-cap', 'aria-label': `Moc ${sim.used} z ${sim.capacity}` });
  for (let i = 0; i < 7; i++) {
    const s = h('span', { class: i < sim.used ? 'on' : '' });
    if (i >= sim.capacity) s.style.opacity = '0.15';
    wrap.append(s);
  }
  return wrap;
}

const ZONE_COL: Partial<Record<ZoneId, string>> = { komora: '#2a3d52', pokoj0: '#3a2c1c', awaryjna: '#3b1d1b', sektorc: '#1f2f3d' };

export function drawMap(c: HTMLCanvasElement, sim: Sim, all: boolean) {
  const g = c.getContext('2d')!;
  const s = Math.min(c.width / GRID_W, c.height / GRID_H);
  g.fillStyle = '#030607';
  g.fillRect(0, 0, c.width, c.height);
  const L = sim.level;
  const known = (z: ZoneId | null) => !!z && (all || sim.visited.has(z) || sim.has(`v:${z}`));
  for (let z = 0; z < GRID_H; z++)
    for (let x = 0; x < GRID_W; x++) {
      const zone = L.zoneOfCell(x, z);
      if (L.isSolid(x, z) || !known(zone)) continue;
      g.fillStyle = (zone && ZONE_COL[zone]) ?? (zone === 'korytarz' ? '#18262a' : '#1b2b2e');
      g.fillRect(x * s + 0.5, z * s + 0.5, s - 1, s - 1);
    }
  // doors
  for (const d of DOORS) {
    if (d.secret && !sim.state.doors[d.id].open) continue;
    const za = L.zoneOfCell(d.cx, d.cz);
    if (!known(za) && !all) continue;
    const st = sim.state.doors[d.id];
    g.fillStyle = d.external ? '#d6372b' : st.open ? '#79e08f' : st.unlocked && sim.doorPowered(d) ? '#8c9a98' : '#d6372b';
    if (d.axis === 'x') g.fillRect(d.cx * s + s / 2 - 2, d.cz * s + 3, 4, s - 6);
    else g.fillRect(d.cx * s + 3, d.cz * s + s / 2 - 2, s - 6, 4);
  }
  // labels
  g.font = `600 ${Math.round(s * 0.55)}px "NS Sans", sans-serif`;
  g.textAlign = 'center';
  const done = new Set<string>();
  for (const r of ROOMS) {
    if (r.solid || done.has(r.zone) || r.zone === 'serwis' || r.zone === 'korytarz' || !known(r.zone)) continue;
    done.add(r.zone);
    g.fillStyle = 'rgba(207,216,212,0.75)';
    const name = ZONE_NAMES[r.zone].split(' ')[0].toUpperCase();
    g.fillText(name, ((r.x0 + r.x1 + 1) / 2) * s, ((r.z0 + r.z1 + 1) / 2) * s + 4);
  }
  // player
  const p = sim.player;
  const px = (p.x / CELL) * s;
  const pz = (p.z / CELL) * s;
  const fx = -Math.sin(p.yaw);
  const fz = -Math.cos(p.yaw);
  g.fillStyle = '#e5a74f';
  g.beginPath();
  g.moveTo(px + fx * 10, pz + fz * 10);
  g.lineTo(px - fz * 6 - fx * 5, pz + fx * 6 - fz * 5);
  g.lineTo(px + fz * 6 - fx * 5, pz - fx * 6 - fz * 5);
  g.closePath();
  g.fill();
}

export function mapBoardView(sim: Sim, onClose: () => void): Modal {
  const c = h('canvas', { class: 'ns-map', width: 760, height: 400 }) as HTMLCanvasElement;
  drawMap(c, sim, true);
  const el = layer(panel('ns-wide', h('p', { class: 'ns-kicker' }, 'Plan ewakuacyjny · Ośrodek H-27'), h('h2', { class: 'ns-title' }, 'Jesteś tutaj'), c, h('p', { class: 'ns-text ns-dim', style: 'margin-top:8px' }, 'Plan został zapisany w tablecie (Tab → Mapa). Ktoś długopisem dopisał prostokąt za archiwum: „0”.'), h('div', { class: 'ns-row' }, btn('Zamknij', onClose, { hint: 'E / Esc', id: 'close' }))));
  return { kind: 'map', el, pausesSim: true, key: (e) => (e.code === 'Escape' || e.code === 'KeyE' ? (onClose(), true) : false) };
}

// ---------------------------------------------------------------- devices
function termPanel(kicker: string, title: string, ...rest: (HTMLElement | null)[]) {
  return panel('ns-term', h('p', { class: 'ns-kicker' }, kicker), h('h2', { class: 'ns-title', style: 'font-size:26px' }, title), ...rest);
}

export function receptionTerminal(sim: Sim, onClose: () => void): Modal {
  const box = h('div');
  const draw = () => {
    if (!sim.has('loggedIn'))
      box.replaceChildren(
        termPanel(
          'H-27 // NADZORCA v4.1',
          'Identyfikacja',
          h('p', { class: 'ns-text' }, `ZMIANA NOCNA ${clockText(sim.state.clock)}\nTECHNIK: 7\nOSTATNIE LOGOWANIE: 7 — ${clockText(sim.state.clock)} (DZIŚ)\n\nPotwierdź tożsamość, aby rozpocząć zmianę.`),
          h('div', { class: 'ns-btns' }, btn('ZALOGUJ: TECHNIK 7', () => (sim.login(), draw()), { cls: 'ns-primary', hint: 'Enter', id: 'login' }), btn('WYJDŹ', onClose, { hint: 'Esc', id: 'close' })),
        ),
      );
    else
      box.replaceChildren(
        termPanel(
          'H-27 // NADZORCA v4.1',
          'Recepcja',
          h('p', { class: 'ns-text' }, `TECHNIK 7 — ZALOGOWANY\nZADANIE: ${sim.objective()}\n\nREJESTR ZMIAN: 3287 WPISÓW\nWSZYSTKIE PODPISANE: TECHNIK 7\n\nUWAGA: Drzwi zewnętrzne — zamek czasowy 06:00.`),
          h('div', { class: 'ns-btns' }, btn('WYJDŹ', onClose, { hint: 'Esc', id: 'close' })),
        ),
      );
  };
  draw();
  return {
    kind: 'terminal',
    el: layer(box),
    pausesSim: false,
    key: (e) => {
      if (e.code === 'Escape' || e.code === 'KeyE') return onClose(), true;
      if (e.code === 'Enter' && !sim.has('loggedIn')) return sim.login(), draw(), true;
      return false;
    },
  };
}

export function labTerminal(_sim: Sim, onClose: () => void, onPlay: () => void): Modal {
  const el = layer(
    termPanel(
      'LAB-2 // ANALIZA AKUSTYCZNA',
      'Próbka K-1/7',
      h('p', { class: 'ns-text' }, 'ŹRÓDŁO: KOMORA K-1, REJESTRATOR B\nKORELACJA Z WENTYLACJĄ: 0.9994\nPRZESUNIĘCIE CZASOWE: +24 h 00 min\n\nUWAGI LABORANTA:\n> archiwum — kod zmieniony (patrz karteczka przy biurku)\n> nie odtwarzać próbki po 03:00'),
      h('div', { class: 'ns-btns' }, btn('ODTWÓRZ PRÓBKĘ', onPlay, { id: 'play' }), btn('WYJDŹ', onClose, { hint: 'Esc', id: 'close' })),
    ),
  );
  return { kind: 'terminal', el, pausesSim: false, key: (e) => (e.code === 'Escape' || e.code === 'KeyE' ? (onClose(), true) : false) };
}

export function chamberTerminal(sim: Sim, o: { onClose: () => void; onRead: () => void; onTest: () => void; onStop: () => void }): Modal {
  const box = h('div');
  let confirmTest = false;
  const draw = () => {
    if (!sim.powered('sector_c')) {
      box.replaceChildren(termPanel('K-1 // TERMINAL TESTOWY', 'Brak zasilania', h('p', { class: 'ns-text' }, 'Ekran jest martwy. Obwód „Sektor C” jest wyłączony.'), h('div', { class: 'ns-btns' }, btn('WYJDŹ', o.onClose, { id: 'close' }))));
      return;
    }
    const truth = sim.has('truth');
    const stopReq = [!sim.hasItem('key') ? 'brak klucza ciągłości' : '', !truth ? 'brak autoryzacji' : '', sim.final ? 'procedura w toku' : ''].filter(Boolean).join(', ');
    box.replaceChildren(
      termPanel(
        'K-1 // TERMINAL TESTOWY',
        'Komora K-1',
        h('p', { class: 'ns-text' }, truth ? `ARCHIWUM K-1/7 — ODCZYTANE\n\n${DOC_BY_ID.d08.text}\n\nCIĄGŁOŚĆ ZMIANY: ZAGROŻONA` : `STATUS: GOTOWA DO TESTU\nTŁO: −9 dB\nARCHIWUM PROTOKOŁÓW: 7 WPISÓW\n\nNADZORCA: Uruchom test, techniku siedem.`),
        confirmTest ? h('p', { class: 'ns-warning' }, 'Uruchomienie testu zakończy tę zmianę. Na pewno?') : null,
        h(
          'div',
          { class: 'ns-btns' },
          !truth ? btn('ODCZYTAJ ARCHIWUM PROTOKOŁÓW', () => (o.onRead(), draw()), { cls: 'ns-primary', id: 'read' }) : null,
          confirmTest
            ? btn('TAK — URUCHOM TEST', o.onTest, { cls: 'ns-danger', id: 'test-yes' })
            : btn('URUCHOM TEST', () => ((confirmTest = true), draw()), { disabled: !!sim.final, id: 'test' }),
          truth ? btn('PRZEKRĘĆ KLUCZ CIĄGŁOŚCI', o.onStop, { disabled: !sim.canStop(), hint: stopReq, id: 'stop' }) : null,
          btn('WYJDŹ', o.onClose, { hint: 'Esc', id: 'close' }),
        ),
      ),
    );
  };
  draw();
  return { kind: 'chamber', el: layer(box), pausesSim: false, refresh: draw, key: (e) => (e.code === 'Escape' || e.code === 'KeyE' ? (o.onClose(), true) : false) };
}

export function radioView(sim: Sim, o: { onClose: () => void; onLog: () => void; onTransmit: () => void }): Modal {
  const box = h('div');
  const draw = () => {
    const req = [!sim.has('truth') ? 'nie wiesz, co nadać' : '', !sim.hasItem('tape') ? 'brak taśmy z Pokoju 0' : '', !sim.powered('transmitter') ? 'nadajnik bez zasilania' : '', sim.final ? 'procedura w toku' : ''].filter(Boolean);
    box.replaceChildren(
      termPanel(
        'KONSOLA RADIOWA · 3.17 MHz',
        'Radio',
        h('p', { class: 'ns-text' }, `NADAJNIK: ${sim.powered('transmitter') ? 'ZASILANY' : 'BRAK ZASILANIA'}\nREJESTRATOR: 1 ZAPIS (02:44)\nTAŚMA: ${sim.hasItem('tape') ? 'WŁOŻONA' : '—'}`),
        h(
          'div',
          { class: 'ns-btns' },
          btn('ODTWÓRZ ZAPIS Z REJESTRATORA', o.onLog, { id: 'log', hint: sim.state.docs.includes('d09') ? 'odsłuchany' : '' }),
          btn('NADAJ NAGRANIE', o.onTransmit, { cls: 'ns-primary', disabled: req.length > 0, hint: req.join(', '), id: 'transmit' }),
          btn('WYJDŹ', o.onClose, { hint: 'Esc', id: 'close' }),
        ),
      ),
    );
  };
  draw();
  return { kind: 'radio', el: layer(box), pausesSim: false, refresh: draw, key: (e) => (e.code === 'Escape' || e.code === 'KeyE' ? (o.onClose(), true) : false) };
}

export function powerPanelView(sim: Sim, o: { onClose: () => void; onChange: () => void }): Modal {
  const box = h('div');
  const draw = () => {
    const st = sim.state;
    const fuses = st.inventory.filter((i) => i === 'fuseA' || i === 'fuseB').length;
    box.replaceChildren(
      panel(
        'ns-wide ns-term',
        h('p', { class: 'ns-kicker' }, 'Rozdzielnia główna · H-27'),
        h('h2', { class: 'ns-title', style: 'font-size:26px' }, st.power.main ? 'Sieć główna — 7 jednostek' : 'Zasilanie rezerwowe — 2 jednostki'),
        h('p', { class: 'ns-text' }, `Zużycie: ${sim.used}/${sim.capacity}   ·   Gniazda bezpieczników: ${st.power.fuses}/2${fuses ? `   ·   masz przy sobie: ${fuses}` : ''}`),
        capBar(sim),
        !st.power.main
          ? h(
              'div',
              { class: 'ns-row', style: 'margin:0 0 12px' },
              btn(`Włóż bezpieczniki${fuses ? ` (${fuses})` : ''}`, () => (sim.insertFuses(), o.onChange(), draw()), { disabled: fuses === 0 || st.power.fuses >= 2, id: 'fuses' }),
              btn('Załącz sieć główną', () => (sim.switchMain(), o.onChange(), draw()), { cls: 'ns-primary', disabled: st.power.fuses < 2, hint: st.power.fuses < 2 ? 'brak bezpieczników' : '', id: 'main' }),
            )
          : null,
        ...CONSUMERS.map((c) => {
          const on = sim.powered(c.id);
          const t = btn(on ? 'WŁĄCZONY' : 'WYŁĄCZONY', () => (sim.setConsumer(c.id, !on), o.onChange(), draw()), { cls: `ns-toggle ns-small${on ? ' on' : ''}`, id: `c-${c.id}` });
          t.setAttribute('aria-pressed', String(on));
          return h('div', { class: 'ns-circuit' }, h('div', null, `${c.name} — ${c.cost} ${c.cost === 1 ? 'jednostka' : 'jednostki'}`, h('small', null, c.desc)), t);
        }),
        h('div', { class: 'ns-row' }, btn('Odejdź od panelu', o.onClose, { hint: 'Esc', id: 'close' })),
      ),
    );
  };
  draw();
  return { kind: 'panel', el: layer(box), pausesSim: false, refresh: draw, key: (e) => (e.code === 'Escape' || e.code === 'KeyE' ? (o.onClose(), true) : false) };
}

export function keypadView(sim: Sim, doorId: string, o: { onClose: () => void; onSuccess: () => void; onPress: () => void }): Modal {
  const d = DOORS.find((x) => x.id === doorId)!;
  let code = '';
  let bad = false;
  const display = h('div', { class: 'ns-display', 'aria-live': 'polite' });
  const show = () => {
    display.textContent = (code + '____').slice(0, 4);
    display.className = `ns-display${bad ? ' bad' : ''}`;
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
      if (code.length < 4) return show();
      if (sim.enterCode(doorId, code)) {
        o.onSuccess();
        return;
      }
      bad = true;
      display.textContent = 'BŁĄD';
      display.className = 'ns-display bad';
      return;
    } else if (code.length < 4) code += k;
    show();
  };
  show();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
  const el = layer(
    panel(
      'ns-narrow ns-term',
      h('p', { class: 'ns-kicker' }, d.secret ? 'Zamek ukryty za segregatorami' : 'Zamek szyfrowy'),
      h('h2', { class: 'ns-title', style: 'font-size:26px' }, d.name),
      display,
      h('div', { class: 'ns-keypad' }, ...keys.map((k) => btn(k, () => press(k), { id: `k-${k}` }))),
      h('p', { class: 'ns-text ns-dim', style: 'margin-top:12px;font-size:13px' }, 'Cyfry na klawiaturze, Enter — zatwierdź, Backspace — cofnij.'),
      h('div', { class: 'ns-row' }, btn('Odejdź', o.onClose, { hint: 'Esc', id: 'close' })),
    ),
  );
  return {
    kind: 'keypad',
    el,
    pausesSim: false,
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

export function cctvView(sim: Sim, o: { onClose: () => void; onSwitch: (d: number) => void; onRelease: () => void }): Modal {
  const tl = h('div', { class: 'tl' });
  const tr = h('div', { class: 'tr' });
  const bl = h('div', { class: 'bl' });
  const br = h('div', { class: 'br' });
  const el = h('div', { class: 'ns-cctv' }, tl, tr, bl, br);
  const draw = () => {
    const c = sim.cctv;
    if (!c) return;
    const cam = CAMERAS[c.cam];
    tl.replaceChildren(h('div', { class: 'rec' }, 'REC'), h('div', null, cam.name));
    tr.replaceChildren(h('div', null, clockText(sim.state.clock)), h('div', null, `Sprawdzone: ${sim.state.camerasSeen.length}/6`));
    const dots = h('div', { class: 'dots' }, ...CAMERAS.map((k, i) => h('span', { class: `${i === c.cam ? 'on' : ''} ${sim.state.camerasSeen.includes(k.id) ? 'seen' : ''}`.trim() }, String(k.id))));
    const actions = h(
      'div',
      { class: 'ns-cctv-actions' },
      btn('A · Poprzednia', () => o.onSwitch(-1), { cls: 'ns-small', id: 'prev' }),
      btn('D · Następna', () => o.onSwitch(1), { cls: 'ns-small', id: 'next' }),
      !sim.has('serviceUnlocked') ? btn('Q · Zwolnij drzwi serwisowe', o.onRelease, { cls: 'ns-small', id: 'release' }) : null,
      btn('E · Odejdź', o.onClose, { cls: 'ns-small', id: 'close' }),
    );
    bl.replaceChildren(dots);
    br.replaceChildren(actions);
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
      if (e.code === 'KeyQ') return o.onRelease(), true;
      const m = /^Digit([1-6])$/.exec(e.code);
      if (m && sim.cctv) return o.onSwitch(Number(m[1]) - 1 - sim.cctv.cam), true;
      return false;
    },
  };
}
