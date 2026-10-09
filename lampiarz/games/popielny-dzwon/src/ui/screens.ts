// Every menu, dialogue and story screen of the game.
import { audio } from '../audio/audio';
import { CONTROLS_HELP } from '../core/input';
import { hashString, Rng } from '../core/util';
import {
  ATTR,
  BOSSES,
  ENDINGS,
  ENEMIES,
  HALSZKA_LINES,
  HALSZKA_REST,
  LOCATION_ORDER,
  LOCATIONS,
  LORE,
  MUMROT_LINES,
  RELICS,
  UPGRADE_COST,
  WEAPONS,
  levelCost,
  type AttrId,
  type EndingId,
  type LocationId,
  type RelicId,
  type WeaponId,
} from '../data/content';
import type { Game, RunInfo } from '../game';
import { deleteSave, hasSave } from '../save';
import { computeStats } from '../stats';
import type { Interactable } from '../world/world';
import { btn, h, panel, para, type Screen } from './ui';

const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const hh = Math.floor(m / 60);
  return hh > 0 ? `${hh} h ${m % 60} min` : `${m} min ${Math.floor(s % 60)} s`;
};

function open(g: Game, el: HTMLElement, name: string, opts: Partial<Screen> = {}): Screen {
  el.setAttribute('data-screen', name);
  return g.ui.open({ el, closable: true, blocking: true, ...opts });
}

function rerender(g: Game, s: Screen, build: () => HTMLElement, name: string) {
  const el = build();
  el.setAttribute('data-screen', name);
  g.ui.refresh(s, el);
}

const touchOnly = () => {
  try {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch {
    return false;
  }
};

// ================================================================== title
export function titleScreen(g: Game) {
  const save = g.save;
  const exists = hasSave() && !!save;
  const summary = save
    ? `poziom ${save.level} · serca ${g.bossCount()}/3 · ${save.inHub || !save.expedition ? 'Krypta Odlewników' : LOCATIONS[save.expedition.location].short} · ${fmtTime(save.playTime)}`
    : undefined;
  const el = h(
    'div',
    { class: 'pd-titlescreen' },
    h('h1', { class: 'pd-logo' }, 'Popielny Dzwon'),
    h('p', { class: 'pd-tagline' }, 'Mroczna baśń o spiżu, popiele i trzech skradzionych sercach'),
    g.warning ? h('p', { class: 'pd-warning', role: 'alert' }, g.warning) : null,
    touchOnly() ? h('p', { class: 'pd-warning' }, 'Popielny Dzwon wymaga klawiatury i myszy albo pada. Na ekranie dotykowym nie da się grać.') : null,
    h(
      'div',
      { class: 'pd-btns' },
      btn('Kontynuuj', () => g.continueGame(), { disabled: !exists, sub: summary, autofocus: exists, cls: 'pd-primary' }),
      btn('Nowa gra', () => {
        if (exists)
          confirmScreen(g, {
            title: 'Rozpocząć od nowa?',
            text: `Istniejący zapis (${summary}) zostanie bezpowrotnie usunięty.`,
            yes: 'Tak, zacznij od nowa',
            danger: true,
            onYes: () => g.newGame(),
          });
        else g.newGame();
      }, { autofocus: !exists }),
      btn('Ustawienia', () => settingsScreen(g, false)),
      btn('Sterowanie i walka', () => controlsScreen(g)),
    ),
    h('p', { class: 'pd-foot' }, 'EVGAMES · Popielny Dzwon 1.0 · gra zapisuje się przy kapliczkach, skrzyniach i bossach'),
  );
  open(g, el, 'title', { closable: false, cls: 'pd-clear' });
}

export function confirmScreen(g: Game, o: { title: string; text: string; yes: string; no?: string; danger?: boolean; onYes: () => void }) {
  let s: Screen | null = null;
  const el = panel(
    o.title,
    para(o.text),
    h(
      'div',
      { class: 'pd-row' },
      btn(o.no ?? 'Anuluj', () => g.ui.close(s!), { autofocus: true }),
      btn(o.yes, () => {
        g.ui.close(s!);
        o.onYes();
      }, { cls: o.danger ? 'pd-danger' : 'pd-primary' }),
    ),
  );
  el.classList.add('pd-narrow');
  s = open(g, el, 'confirm');
}

// ================================================================== settings & controls
export function settingsScreen(g: Game, inGame: boolean) {
  const st = g.settings;
  const slider = (label: string, key: 'master' | 'music' | 'sfx') => {
    const out = h('output', null, `${Math.round(st[key] * 100)}%`);
    const input = h('input', {
      type: 'range',
      min: '0',
      max: '100',
      step: '5',
      value: String(Math.round(st[key] * 100)),
      'aria-label': label,
      oninput: (e: Event) => {
        st[key] = Number((e.target as HTMLInputElement).value) / 100;
        out.textContent = `${Math.round(st[key] * 100)}%`;
        g.applySettings();
      },
      onchange: () => key !== 'music' && audio.sfx('parry', 0, 0.6),
    });
    return h('div', { class: 'pd-setting' }, h('label', null, label), input, out);
  };
  const check = (label: string, key: 'muted' | 'shake' | 'reduced' | 'numbers', sub?: string) =>
    h(
      'label',
      { class: 'pd-check' },
      h('input', {
        type: 'checkbox',
        checked: st[key],
        onchange: (e: Event) => {
          st[key] = (e.target as HTMLInputElement).checked;
          g.applySettings();
        },
      }),
      h('span', null, label, sub ? h('small', { style: { display: 'block', color: 'var(--ink-dim)', fontStyle: 'italic' } }, sub) : null),
    );
  let s: Screen | null = null;
  const el = panel(
    'Ustawienia',
    h('div', { class: 'pd-h3' }, 'Dźwięk'),
    slider('Głośność ogólna', 'master'),
    slider('Muzyka', 'music'),
    slider('Efekty', 'sfx'),
    check('Wycisz wszystko', 'muted'),
    h('div', { class: 'pd-h3' }, 'Obraz'),
    check('Wstrząsy ekranu', 'shake'),
    check('Ograniczone efekty', 'reduced', 'mniej cząsteczek, bez ziarna i wstrząsów — dla słabszych komputerów'),
    check('Liczby obrażeń', 'numbers'),
    h('p', { class: 'pd-text pd-dim', style: { fontSize: '14px', marginTop: '12px' } }, 'Ustawienia zapisują się automatycznie i nie wpływają na zapis gry.'),
    h(
      'div',
      { class: 'pd-row' },
      btn('Gotowe', () => g.ui.close(s!), { cls: 'pd-primary' }),
      !inGame && hasSave()
        ? btn('Usuń zapis gry', () =>
            confirmScreen(g, {
              title: 'Usunąć zapis?',
              text: 'Cały postęp — poziom, bronie, relikty, pokonani bossowie — przepadnie.',
              yes: 'Usuń na zawsze',
              danger: true,
              onYes: () => {
                deleteSave();
                g.save = null;
                g.toTitle();
              },
            }), { cls: 'pd-danger' })
        : null,
    ),
  );
  s = open(g, el, 'settings');
}

export function controlsScreen(g: Game) {
  let s: Screen | null = null;
  const el = panel(
    'Sterowanie i walka',
    h(
      'table',
      { class: 'pd-table' },
      h('tbody', null, ...CONTROLS_HELP.map((c) => h('tr', null, h('td', null, c.action), h('td', null, h('span', { class: 'pd-kbd' }, c.keys)), h('td', null, h('span', { class: 'pd-kbd' }, c.pad))))),
    ),
    h('div', { class: 'pd-h3' }, 'Zasady walki'),
    para('Każdy cios wroga zapowiada błysk. Biały — możesz go zablokować, a wciśnięty tuż przed trafieniem blok paruje cios. Czerwony — nie da się go zablokować: zrób przewrót albo przeskocz.'),
    para('Parowanie i przewrót przez cios (idealny unik) ładują Rezonans. Sparowany wróg traci równowagę — wtedy riposta zadaje potrójne obrażenia.'),
    para('Ataki, bloki i przewroty zużywają wytrzymałość. Gdy jej zabraknie, garda pęka.'),
    para('Śmierć zostawia twój żużel tam, gdzie upadłeś. Wróć po niego — jeśli zginiesz po drodze, przepadnie.'),
    h('div', { class: 'pd-row' }, btn('Wróć', () => g.ui.close(s!), { cls: 'pd-primary' })),
  );
  el.classList.add('pd-wide');
  s = open(g, el, 'controls');
}

// ================================================================== pause
export function pauseScreen(g: Game) {
  if (g.ui.stack.some((x) => x.el.getAttribute('data-screen') === 'pause')) return;
  audio.duck(true);
  const w = g.world!;
  const save = g.save!;
  let s: Screen | null = null;
  const where = w.location === 'krypta' ? 'Krypta Odlewników' : LOCATIONS[w.location].name;
  const el = panel(
    'Pauza',
    h('p', { class: 'pd-sub' }, `${where} · czas gry ${fmtTime(save.playTime)}`),
    h(
      'div',
      { class: 'pd-btns' },
      btn('Wznów', () => g.ui.close(s!), { autofocus: true, cls: 'pd-primary' }),
      btn('Postać i ekwipunek', () => inventoryScreen(g, false, 'char')),
      btn('Kronika', () => inventoryScreen(g, false, 'lore')),
      btn('Ustawienia', () => settingsScreen(g, true)),
      btn('Sterowanie', () => controlsScreen(g)),
      btn('Wyjdź do menu głównego', () =>
        confirmScreen(g, {
          title: 'Wyjść do menu?',
          text: w.location === 'krypta' ? 'Gra zostanie zapisana.' : 'Gra zostanie zapisana. Po powrocie staniesz przy ostatniej kapliczce, a wrogowie odrodzą się.',
          yes: 'Wyjdź',
          onYes: () => g.toTitle(),
        }),
      ),
    ),
  );
  el.classList.add('pd-narrow');
  s = open(g, el, 'pause', {
    onClose: () => {
      g.hiddenPause = false;
      audio.duck(false);
      g.input.flush();
    },
  });
}

// ================================================================== story
export function introScreen(g: Game, done: () => void) {
  let s: Screen | null = null;
  const el = h(
    'div',
    { class: 'pd-story' },
    h('h2', { class: 'pd-title' }, 'Popielna Wigilia'),
    para('Trzysta dni temu w Wierchołowie pękł dzwon. Od tamtej nocy z nieba sypie się popiół, a umarli nie odchodzą.'),
    para('Jesteś dzwonnikiem, który stracił głos. Budzisz się w Krypcie Odlewników, przy ogniu, którego pilnuje Halszka — ta sama, która odlała Gromnicę.'),
    para('Dzwon miał trzy serca. Trzech je zabrało. Odzyskaj je — a potem zdecyduj, czy Gromnica ma znów zadzwonić.'),
    h('div', { class: 'pd-btns' }, btn('Obudź się', () => {
      g.ui.close(s!);
      done();
    }, { autofocus: true, cls: 'pd-primary' })),
  );
  s = open(g, el, 'intro', { closable: false, cls: 'pd-black' });
}

export function loreScreen(g: Game, id: string) {
  const lore = LORE.find((l) => l.id === id)!;
  const n = g.save!.lore.length;
  let s: Screen | null = null;
  const el = panel(
    lore.title,
    para(lore.text),
    h('p', { class: 'pd-text', style: { fontSize: '14px', opacity: '0.7' } }, `Karta kroniki ${n} z ${LORE.length}${n === LORE.length ? ' — znasz już całą prawdę.' : ''}`),
    h('div', { class: 'pd-row' }, btn('Zamknij', () => g.ui.close(s!), { autofocus: true })),
  );
  el.classList.add('pd-page');
  s = open(g, el, 'lore', { onClose: () => g.input.flush() });
}

// ================================================================== inventory / character
type Tab = 'char' | 'gear' | 'lore';

export function inventoryScreen(g: Game, atRest: boolean, tab: Tab = 'char') {
  let current: Tab = tab;
  let s: Screen | null = null;
  const build = (): HTMLElement => {
    const tabs = h(
      'div',
      { class: 'pd-tabs', role: 'tablist' },
      ...(
        [
          ['char', 'Postać'],
          ['gear', 'Ekwipunek'],
          ['lore', 'Kronika'],
        ] as [Tab, string][]
      ).map(([id, label]) =>
        btn(label, () => {
          current = id;
          rerender(g, s!, build, 'inventory');
        }, { cls: `pd-small ${current === id ? 'pd-active' : ''}` }),
      ),
    );
    const body = current === 'char' ? charTab(g) : current === 'gear' ? gearTab(g, atRest, () => rerender(g, s!, build, 'inventory')) : loreTab(g);
    const el = panel(atRest ? 'Odpoczynek' : 'Postać i ekwipunek', tabs, body, h('div', { class: 'pd-row' }, btn('Zamknij', () => g.ui.close(s!))));
    el.classList.add('pd-wide');
    return el;
  };
  s = open(g, build(), 'inventory', { onClose: () => g.input.flush() });
}

function charTab(g: Game) {
  const save = g.save!;
  const st = computeStats(save);
  const w = WEAPONS[save.weapon];
  const row = (k: string, v: string | number) => h('div', null, h('span', null, k), h('b', null, String(v)));
  return h(
    'div',
    null,
    h('div', { class: 'pd-money' }, h('span', null, 'Poziom ', h('b', null, save.level)), h('span', null, 'Żużel ', h('b', null, save.zuzel)), h('span', null, 'Odłamki spiżu ', h('b', null, save.shards))),
    h('div', { class: 'pd-h3' }, 'Atrybuty'),
    h('div', { class: 'pd-stats' }, ...(Object.keys(ATTR) as AttrId[]).map((k) => row(ATTR[k].name, save.attrs[k]))),
    h('div', { class: 'pd-h3' }, 'Statystyki'),
    h(
      'div',
      { class: 'pd-stats' },
      row('Zdrowie', st.maxHp),
      row('Wytrzymałość', st.maxStamina),
      row('Regeneracja', `${Math.round(st.staminaRegen)}/s`),
      row('Broń', `${w.name}${st.weaponPlus ? ` +${st.weaponPlus}` : ''}`),
      row('Mnożnik obrażeń', `×${st.dmgMul.toFixed(2)}`),
      row('Łzy Wosku', `${st.flasks} (${Math.round(st.flaskHeal * 100)}% zdrowia)`),
      row('Nuty Rezonansu', st.pips),
      row('Siła Głosu Serca', `×${st.skillMul.toFixed(2)}`),
      row('Okno parowania', `${Math.round(w.parryWindow * st.parryMul * 1000)} ms`),
      row('Blok przepuszcza', `${Math.round(Math.min(0.9, w.blockLeak * st.blockLeakMul) * 100)}%`),
    ),
    h('div', { class: 'pd-h3' }, 'Kronika czynów'),
    h(
      'div',
      { class: 'pd-stats' },
      row('Pokonani wrogowie', save.stats.kills),
      row('Śmierci', save.stats.deaths),
      row('Parowania', save.stats.parries),
      row('Idealne uniki', save.stats.perfectDodges),
      row('Wyprawy', save.stats.expeditions),
      row('Czas gry', fmtTime(save.playTime)),
    ),
  );
}

function gearTab(g: Game, atRest: boolean, redraw: () => void) {
  const save = g.save!;
  const w = g.world;
  const refresh = () => {
    if (w) {
      const ratio = w.player.hp / w.player.maxHp;
      w.player.refreshStats();
      w.player.hp = Math.max(1, Math.round(w.player.maxHp * ratio));
    }
    g.persist();
    redraw();
  };
  const weaponCards = (Object.keys(WEAPONS) as WeaponId[]).map((id) => {
    const def = WEAPONS[id];
    const owned = save.weapons[id] !== undefined;
    const using = save.weapon === id;
    return h(
      'div',
      { class: `pd-card ${using ? 'pd-on' : ''} ${owned ? '' : 'pd-locked'}` },
      h('h4', null, owned ? `${def.name}${save.weapons[id] ? ` +${save.weapons[id]}` : ''}` : '???'),
      h('p', null, owned ? `${def.kind} — ${def.desc}` : id === 'sierpy' ? 'Zabierz je Katowi z Rynku.' : 'Leży gdzieś w Ogrodzie Kamiennych Mnichów.'),
      owned ? h('p', { class: 'pd-lore' }, def.lore) : null,
      owned && atRest && !using ? btn('Weź do ręki', () => {
        save.weapon = id;
        audio.sfx('swingHeavy');
        refresh();
      }, { cls: 'pd-small' }) : using ? h('p', { class: 'pd-good' }, 'W dłoni') : null,
    );
  });
  const relicCards = save.relics.map((id) => {
    const r = RELICS[id];
    const on = save.equipped.includes(id);
    const full = save.equipped.length >= save.relicSlots;
    return h(
      'div',
      { class: `pd-card ${on ? 'pd-on' : ''}` },
      h('h4', null, r.name),
      h('p', { class: 'pd-good' }, r.effect),
      r.cost ? h('p', { class: 'pd-bad' }, `Cena: ${r.cost}`) : null,
      h('p', { class: 'pd-lore' }, r.lore),
      atRest
        ? btn(on ? 'Zdejmij' : full ? 'Brak wolnego miejsca' : 'Załóż', () => {
            if (on) save.equipped = save.equipped.filter((x) => x !== id);
            else save.equipped.push(id);
            audio.sfx(on ? 'interact' : 'pickup');
            refresh();
          }, { cls: 'pd-small', disabled: !on && full })
        : on
          ? h('p', { class: 'pd-good' }, 'Założony')
          : null,
    );
  });
  return h(
    'div',
    null,
    !atRest ? para('Broń i relikty zmienisz tylko przy kapliczce albo przy palenisku w Krypcie.', 'pd-dim') : null,
    h('div', { class: 'pd-h3' }, 'Broń'),
    h('div', { class: 'pd-cards' }, ...weaponCards),
    h('div', { class: 'pd-h3' }, `Relikty — założone ${save.equipped.length} z ${save.relicSlots}`),
    relicCards.length ? h('div', { class: 'pd-cards' }, ...relicCards) : para('Nie masz jeszcze żadnych reliktów. Szukaj ich w ukrytych skrytkach, u Mumrota i przy pokonanych bossach.', 'pd-dim'),
  );
}

function loreTab(g: Game) {
  const save = g.save!;
  const pages = LORE.map((l) => {
    const found = save.lore.includes(l.id);
    return found
      ? btn(l.title, () => loreScreen(g, l.id), { sub: LOCATIONS[l.location].short })
      : h('div', { class: 'pd-card pd-locked' }, h('h4', null, '— karta nieodnaleziona —'), h('p', null, `Gdzieś w lokacji: ${LOCATIONS[l.location].name}`));
  });
  const met = Object.values(ENEMIES).filter((e) => e.kind !== 'cma' || save.bosses.kat);
  return h(
    'div',
    null,
    h('div', { class: 'pd-h3' }, `Karty kroniki — ${save.lore.length} z ${LORE.length}`),
    h('div', { class: 'pd-btns' }, ...pages),
    h('div', { class: 'pd-h3' }, 'Bestiariusz'),
    h('div', { class: 'pd-cards' }, ...met.map((e) => h('div', { class: 'pd-card' }, h('h4', null, e.name), h('p', null, e.desc)))),
    h('div', { class: 'pd-h3' }, 'Strażnicy serc'),
    h(
      'div',
      { class: 'pd-cards' },
      ...(['kat', 'pasterz', 'dzwon'] as const).map((b) =>
        h('div', { class: `pd-card ${save.bosses[b] ? 'pd-on' : ''}` }, h('h4', null, save.bosses[b] ? BOSSES[b].name : '???'), h('p', null, save.bosses[b] ? `${BOSSES[b].title} — ${BOSSES[b].defeat}` : 'Jeszcze nie spotkany.')),
      ),
    ),
  );
}

// ================================================================== rest points
export function shrineScreen(g: Game, _it: Interactable) {
  g.atRest = true;
  const w = g.world!;
  let s: Screen | null = null;
  const el = panel(
    'Kapliczka',
    h('p', { class: 'pd-sub' }, `${LOCATIONS[w.location as LocationId].name} · gra zapisana`),
    para('Płomień przyjmuje twój oddech. Rany się zamykają, Łzy Wosku napełniają. Gdzieś w ciemności wstają ci, których już pokonałeś.', 'pd-dim'),
    h(
      'div',
      { class: 'pd-btns' },
      btn('Ruszaj dalej', () => g.ui.close(s!), { autofocus: true, cls: 'pd-primary' }),
      btn('Ekwipunek i relikty', () => inventoryScreen(g, true, 'gear')),
      btn('Wróć do Krypty', () =>
        confirmScreen(g, {
          title: 'Zakończyć wyprawę?',
          text: 'Wrócisz do Krypty z całym zebranym żużlem i przedmiotami. Ta mapa zniknie — następna wyprawa poprowadzi inną drogą.',
          yes: 'Wróć do Krypty',
          onYes: () => g.returnToHub('shrine'),
        }), { sub: 'zakończ wyprawę, rozwiń postać' }),
    ),
  );
  el.classList.add('pd-narrow');
  s = open(g, el, 'shrine', {
    onClose: () => {
      g.atRest = false;
      g.input.flush();
    },
  });
}

export function hearthScreen(g: Game) {
  g.atRest = true;
  let s: Screen | null = null;
  const line = HALSZKA_REST[Math.floor(Math.random() * HALSZKA_REST.length)];
  const el = panel(
    'Palenisko',
    para('Ogień w Krypcie nigdy nie gaśnie. Zdrowie i Łzy Wosku odnowione.', 'pd-dim'),
    h('p', { class: 'pd-text pd-quote' }, `„${line}” — Halszka`),
    h('div', { class: 'pd-btns' }, btn('Ekwipunek i relikty', () => inventoryScreen(g, true, 'gear'), { autofocus: true }), btn('Odejdź od ognia', () => g.ui.close(s!))),
  );
  el.classList.add('pd-narrow');
  s = open(g, el, 'hearth', {
    onClose: () => {
      g.atRest = false;
      g.input.flush();
    },
  });
}

// ================================================================== encounters
const DUCH_LINES = [
  '„Słyszałem, jak dzwon wołał moje imię. Nie odpowiedziałem. Może dlatego wciąż tu jestem.”',
  '„Nie bój się popiołu. Bój się tego, że przestaniesz go zauważać.”',
  '„Halszka płakała, kiedy odlewała Gromnicę. Myślała, że nikt nie widzi.”',
  '„Kat zawsze najpierw patrzył w oczy. Ty też patrz — w jego ruchach wszystko widać.”',
];

export function eventScreen(g: Game, it: Interactable) {
  const w = g.world!;
  const save = g.save!;
  const p = w.player;
  const ex = save.expedition;
  const scale = ex ? LOCATIONS[ex.location].scale.zuzel : 1;
  const rng = new Rng(hashString(`${ex?.seed ?? 0}:${it.id}`));
  let s: Screen | null = null;
  const done = (msg: string, sub?: string) => {
    w.markUsed(it, 'events');
    g.persist();
    g.ui.close(s!);
    g.renderer.hud.toast(msg, sub);
  };
  let el: HTMLElement;
  if (it.data === 'duch') {
    const reward = Math.round(60 * scale);
    el = panel(
      'Duch skazańca',
      para('Półprzezroczysta postać klęczy w popiele. Nie patrzy na ciebie, ale wie, że tu jesteś.', 'pd-dim'),
      h('p', { class: 'pd-text pd-quote' }, DUCH_LINES[rng.int(0, DUCH_LINES.length - 1)]),
      h(
        'div',
        { class: 'pd-btns' },
        btn('Wysłuchaj do końca', () => {
          p.resonance = p.stats.pips;
          save.zuzel += reward;
          w.run.zuzel += reward;
          audio.sfx('heal');
          done(`Rezonans pełny · żużel +${reward}`, 'duch odchodzi spokojnie');
        }, { autofocus: true, sub: `pełny Rezonans i ${reward} żużla` }),
        btn('Odejdź', () => g.ui.close(s!)),
      ),
    );
  } else if (it.data === 'oltarz') {
    const blood = Math.round(130 * scale);
    const relicPool: RelicId[] = ['kosc_dzwonka', 'zelazny_rozaniec', 'woskowe_serce'];
    const relic = relicPool.find((r) => !save.relics.includes(r) && rng.next() < 0.6);
    el = panel(
      'Ołtarz Popiołu',
      para('Kamienna misa pełna zastygłego wosku. Ołtarz bierze — i oddaje. Nigdy po równo.', 'pd-dim'),
      h(
        'div',
        { class: 'pd-btns' },
        btn('Złóż Łzę Wosku', () => {
          p.flasks--;
          if (ex) ex.flaskPenalty++;
          if (relic) save.relics.push(relic);
          else save.shards += 2;
          audio.sfx('shrine');
          done(relic ? `Relikt: ${RELICS[relic].name}` : 'Odłamek spiżu ×2', 'jedna Łza Wosku mniej do końca wyprawy');
        }, { disabled: p.flasks <= 0, sub: p.flasks > 0 ? `tracisz 1 Łzę na całą wyprawę · ${relic ? 'ołtarz trzyma relikt' : '2 odłamki spiżu'}` : 'nie masz żadnej Łzy Wosku' }),
        btn('Złóż krew', () => {
          p.hp = Math.max(1, p.hp - p.maxHp * 0.3);
          p.hurtFlash = 1;
          save.zuzel += blood;
          w.run.zuzel += blood;
          audio.sfx('hitPlayer');
          done(`Żużel +${blood}`, 'ołtarz pije');
        }, { sub: `−30% zdrowia · +${blood} żużla` }),
        btn('Odejdź', () => g.ui.close(s!), { autofocus: true }),
      ),
    );
  } else {
    const tearPrice = Math.round(140 * scale);
    const shardPrice = 420;
    el = panel(
      'Wędrowny Mumrot',
      h('p', { class: 'pd-text pd-quote' }, `„${MUMROT_LINES[rng.int(0, MUMROT_LINES.length - 1)]}”`),
      h('div', { class: 'pd-money' }, h('span', null, 'Żużel ', h('b', null, save.zuzel)), h('span', null, 'Łzy ', h('b', null, `${p.flasks}/${p.flaskMax}`))),
      h(
        'div',
        { class: 'pd-btns' },
        btn('Kup Łzę Wosku', () => {
          save.zuzel -= tearPrice;
          p.flasks++;
          audio.sfx('pickup');
          done('Łza Wosku +1', 'Mumrot zwija kram');
        }, { disabled: save.zuzel < tearPrice || p.flasks >= p.flaskMax, sub: `${tearPrice} żużla — uzupełnia jedną Łzę`, autofocus: true }),
        btn('Kup odłamek spiżu', () => {
          save.zuzel -= shardPrice;
          save.shards++;
          audio.sfx('pickup');
          done('Odłamek spiżu +1', 'Mumrot zwija kram');
        }, { disabled: save.zuzel < shardPrice, sub: `${shardPrice} żużla` }),
        btn('Odejdź', () => g.ui.close(s!)),
      ),
    );
  }
  el.classList.add('pd-narrow');
  s = open(g, el, 'event', { onClose: () => g.input.flush() });
}

// ================================================================== hub stations
const ENDING_LINES: Record<EndingId, string> = {
  zadzwon: 'Słyszę ją co rano. Nikt w mieście nie wie, że to twój głos. Ja wiem.',
  rozbij: 'Miasto pustoszeje, ale niebo jest czyste. Mikołaj byłby dumny. Ja… spróbuję być.',
  oddaj: 'Śpiewałeś. Myślałam, że już nigdy tego nie usłyszę. Dziękuję, dzwonniku.',
};

export function halszkaScreen(g: Game) {
  const save = g.save!;
  const count = g.bossCount();
  const lines = save.ending ? [ENDING_LINES[save.ending], 'Krypta zostaje otwarta. Wracaj, kiedy zechcesz — popiół jeszcze długo będzie opadał.'] : HALSZKA_LINES[Math.min(3, count)];
  save.halszkaTalked = Math.max(save.halszkaTalked, count);
  g.persist();
  let extra: string | null = null;
  let s: Screen | null = null;
  const build = () => {
    const el = panel(
      'Halszka',
      h('p', { class: 'pd-sub' }, 'odlewniczka dzwonów'),
      ...lines.map((l) => h('p', { class: 'pd-text pd-quote' }, l)),
      extra ? h('p', { class: 'pd-text pd-quote' }, extra) : null,
      h(
        'div',
        { class: 'pd-btns' },
        btn('Ofiaruj popiół', () => levelScreen(g), { autofocus: true, cls: 'pd-primary', sub: `rozwój postaci · następny poziom: ${levelCost(save.level)} żużla` }),
        btn('Poproś o radę', () => {
          extra = HALSZKA_REST[Math.floor(Math.random() * HALSZKA_REST.length)];
          rerender(g, s!, build, 'halszka');
        }),
        btn('Odejdź', () => g.ui.close(s!)),
      ),
    );
    el.classList.add('pd-dialogue');
    return el;
  };
  s = open(g, build(), 'halszka', { onClose: () => g.input.flush() });
}

export function levelScreen(g: Game) {
  const save = g.save!;
  let s: Screen | null = null;
  const build = () => {
    const cost = levelCost(save.level);
    const st = computeStats(save);
    const can = save.zuzel >= cost;
    const el = panel(
      'Ofiara z popiołu',
      h('div', { class: 'pd-money' }, h('span', null, 'Poziom ', h('b', null, save.level)), h('span', null, 'Żużel ', h('b', null, save.zuzel)), h('span', null, 'Koszt poziomu ', h('b', null, cost))),
      ...(Object.keys(ATTR) as AttrId[]).map((k) =>
        h(
          'div',
          { class: 'pd-attr' },
          h('div', null, ATTR[k].name, h('small', null, ATTR[k].desc)),
          h('span', { class: 'pd-val' }, save.attrs[k]),
          btn('+', () => {
            if (save.zuzel < cost) return;
            save.zuzel -= cost;
            save.level++;
            save.attrs[k]++;
            audio.sfx('levelUp');
            const w = g.world;
            if (w) {
              w.player.refreshStats();
              w.player.restoreAll();
            }
            g.persist();
            rerender(g, s!, build, 'level');
          }, { disabled: !can, cls: 'pd-small' }),
        ),
      ),
      h(
        'div',
        { class: 'pd-stats', style: { marginTop: '14px' } },
        h('div', null, h('span', null, 'Zdrowie'), h('b', null, st.maxHp)),
        h('div', null, h('span', null, 'Wytrzymałość'), h('b', null, st.maxStamina)),
        h('div', null, h('span', null, 'Obrażenia'), h('b', null, `×${st.dmgMul.toFixed(2)}`)),
        h('div', null, h('span', null, 'Nuty Rezonansu'), h('b', null, st.pips)),
      ),
      !can ? para(`Brakuje ${cost - save.zuzel} żużla. Zbieraj go, pokonując wrogów i otwierając skrzynie.`, 'pd-dim') : null,
      h('div', { class: 'pd-row' }, btn('Gotowe', () => g.ui.close(s!))),
    );
    return el;
  };
  s = open(g, build(), 'level');
}

export function anvilScreen(g: Game) {
  const save = g.save!;
  let s: Screen | null = null;
  const build = () => {
    const cards = (Object.keys(WEAPONS) as WeaponId[]).map((id) => {
      const def = WEAPONS[id];
      const lvl = save.weapons[id];
      if (lvl === undefined)
        return h('div', { class: 'pd-card pd-locked' }, h('h4', null, '???'), h('p', null, id === 'sierpy' ? 'Kat z Rynku nosi je przy pasie.' : 'Brat Ambroży strzeże jej w Ogrodzie.'));
      const next = UPGRADE_COST[lvl];
      const can = !!next && save.shards >= next.shards && save.zuzel >= next.zuzel;
      return h(
        'div',
        { class: `pd-card ${save.weapon === id ? 'pd-on' : ''}` },
        h('h4', null, `${def.name}${lvl ? ` +${lvl}` : ''}`),
        h('p', null, `${def.kind} · obrażenia +${Math.round(lvl * def.upgradeDmg * 100)}%`),
        next
          ? btn(`Ulepsz do +${lvl + 1}`, () => {
              save.shards -= next.shards;
              save.zuzel -= next.zuzel;
              save.weapons[id] = lvl + 1;
              audio.sfx('hitArmor');
              audio.sfx('levelUp');
              g.world?.player.refreshStats();
              g.persist();
              rerender(g, s!, build, 'anvil');
            }, { disabled: !can, cls: 'pd-small', sub: `${next.shards} odł. spiżu · ${next.zuzel} żużla` })
          : h('p', { class: 'pd-good' }, 'Ulepszona do granic spiżu'),
        save.weapon !== id
          ? btn('Weź do ręki', () => {
              save.weapon = id;
              audio.sfx('swingHeavy');
              g.world?.player.refreshStats();
              g.persist();
              rerender(g, s!, build, 'anvil');
            }, { cls: 'pd-small' })
          : h('p', { class: 'pd-good' }, 'W dłoni'),
      );
    });
    const el = panel(
      'Kowadło',
      h('div', { class: 'pd-money' }, h('span', null, 'Odłamki spiżu ', h('b', null, save.shards)), h('span', null, 'Żużel ', h('b', null, save.zuzel))),
      para('Spiż z pękniętych dzwonów wzmacnia każdą broń. Odłamki znajdziesz w skrzyniach, u Mumrota i przy pokonanych strażnikach serc.', 'pd-dim'),
      h('div', { class: 'pd-cards' }, ...cards),
      h('div', { class: 'pd-row' }, btn('Odejdź', () => g.ui.close(s!))),
    );
    el.classList.add('pd-wide');
    return el;
  };
  s = open(g, build(), 'anvil', { onClose: () => g.input.flush() });
}

export function shopScreen(g: Game) {
  const save = g.save!;
  const line = MUMROT_LINES[Math.floor(Math.random() * MUMROT_LINES.length)];
  let s: Screen | null = null;
  const shardPrice = 350;
  const build = () => {
    const relics = (Object.keys(RELICS) as RelicId[]).filter((r) => RELICS[r].price && !save.relics.includes(r));
    const el = panel(
      'Mumrot',
      h('p', { class: 'pd-text pd-quote' }, `„${line}”`),
      h('div', { class: 'pd-money' }, h('span', null, 'Żużel ', h('b', null, save.zuzel)), h('span', null, 'Odłamki ', h('b', null, save.shards))),
      h(
        'div',
        { class: 'pd-cards' },
        h(
          'div',
          { class: 'pd-card' },
          h('h4', null, 'Odłamek spiżu'),
          h('p', null, 'Do ulepszania broni przy kowadle.'),
          btn(`Kup — ${shardPrice} żużla`, () => {
            save.zuzel -= shardPrice;
            save.shards++;
            audio.sfx('pickup');
            g.persist();
            rerender(g, s!, build, 'shop');
          }, { disabled: save.zuzel < shardPrice, cls: 'pd-small' }),
        ),
        ...relics.map((id) => {
          const r = RELICS[id];
          return h(
            'div',
            { class: 'pd-card' },
            h('h4', null, r.name),
            h('p', { class: 'pd-good' }, r.effect),
            r.cost ? h('p', { class: 'pd-bad' }, `Cena: ${r.cost}`) : null,
            btn(`Kup — ${r.price} żużla`, () => {
              save.zuzel -= r.price!;
              save.relics.push(id);
              audio.sfx('chest');
              g.persist();
              g.renderer.hud.toast(`Relikt: ${r.name}`, 'załóż go przy palenisku');
              rerender(g, s!, build, 'shop');
            }, { disabled: save.zuzel < (r.price ?? 0), cls: 'pd-small' }),
          );
        }),
      ),
      relics.length === 0 ? para('Mumrot rozkłada ręce: wszystkie relikty już masz.', 'pd-dim') : null,
      h('div', { class: 'pd-row' }, btn('Odejdź', () => g.ui.close(s!))),
    );
    el.classList.add('pd-wide');
    return el;
  };
  s = open(g, build(), 'shop', { onClose: () => g.input.flush() });
}

export function mapScreen(g: Game) {
  const save = g.save!;
  let s: Screen | null = null;
  const unlocked = (l: LocationId) => l === 'rynek' || (l === 'ogrod' && !!save.bosses.kat) || (l === 'katedra' && !!save.bosses.pasterz);
  const cards = LOCATION_ORDER.map((l, i) => {
    const def = LOCATIONS[l];
    const open = unlocked(l);
    const boss = BOSSES[def.boss];
    const beaten = !!save.bosses[def.boss];
    return h(
      'div',
      { class: `pd-card ${open ? '' : 'pd-locked'} ${beaten ? 'pd-on' : ''}` },
      h('h4', null, open ? def.name : '— droga zasypana —'),
      h('p', null, open ? def.intro : `Pokonaj strażnika: ${BOSSES[LOCATIONS[LOCATION_ORDER[i - 1]].boss].name}`),
      open ? h('p', { class: beaten ? 'pd-good' : 'pd-bad' }, beaten ? `${boss.heart} odzyskane — wróć po tajemnice i żużel` : `Strażnik: ${boss.name}, ${boss.title}`) : null,
      open ? btn('Wyrusz', () => g.startExpedition(l), { cls: 'pd-small', autofocus: !beaten }) : null,
    );
  });
  const el = panel(
    'Stół z mapą',
    para('Każda wyprawa prowadzi inną drogą. Kapliczki zapamiętują twój postęp, dopóki nie wrócisz do Krypty.', 'pd-dim'),
    h('div', { class: 'pd-cards' }, ...cards),
    save.bosses.dzwon ? h('div', { class: 'pd-btns' }, btn('Wieża Gromnicy', () => endingChoiceScreen(g), { sub: 'dokonaj wyboru jeszcze raz' })) : null,
    h('div', { class: 'pd-row' }, btn('Odejdź', () => g.ui.close(s!))),
  );
  el.classList.add('pd-wide');
  s = open(g, el, 'map', { onClose: () => g.input.flush() });
}

// ================================================================== death & summaries
export function deathScreen(g: Game) {
  const save = g.save!;
  const carried = save.zuzel;
  const prevLost = save.lost?.amount ?? 0;
  let s: Screen | null = null;
  const el = h(
    'div',
    { class: 'pd-story pd-death' },
    h('h2', { class: 'pd-title' }, 'Zgasłeś'),
    para(carried > 0 ? `Twój popiół — ${carried} żużla — został tam, gdzie upadłeś. Odzyskaj go, zanim zginiesz ponownie.` : 'Nie niosłeś popiołu, który mógłby przepaść.'),
    prevLost > 0 ? para(`Popiół z poprzedniej śmierci (${prevLost}) rozwiał wiatr.`, 'pd-dim') : null,
    h(
      'div',
      { class: 'pd-btns' },
      btn('Powstań przy kapliczce', () => {
        g.ui.close(s!);
        g.respawn();
      }, { autofocus: true, cls: 'pd-primary' }),
      btn('Porzuć wyprawę', () =>
        confirmScreen(g, {
          title: 'Porzucić wyprawę?',
          text: `Wrócisz do Krypty, ale niesiony popiół (${carried + prevLost} żużla) przepadnie na zawsze.`,
          yes: 'Porzuć',
          danger: true,
          onYes: () => g.returnToHub('death'),
        }), { sub: 'wróć do Krypty bez popiołu' }),
    ),
  );
  s = open(g, el, 'death', { closable: false });
}

export function summaryScreen(g: Game, run: RunInfo, loc: LocationId | 'krypta', reason: 'shrine' | 'portal' | 'death' | 'ending', lost: number) {
  let s: Screen | null = null;
  const name = loc === 'krypta' ? '' : LOCATIONS[loc].name;
  const text = reason === 'portal' ? 'Portal niesie cię w dół, do ciepła paleniska.' : reason === 'death' ? 'Wracasz jako cień samego siebie. Popiół został w mieście.' : 'Ścieżka kapliczek prowadzi cię z powrotem do Krypty.';
  const el = panel(
    'Koniec wyprawy',
    h('p', { class: 'pd-sub' }, name),
    para(text, 'pd-dim'),
    h(
      'div',
      { class: 'pd-summary-grid' },
      h('div', null, h('b', null, run.kills), h('span', null, 'pokonanych wrogów')),
      h('div', null, h('b', null, run.zuzel), h('span', null, 'zebranego żużla')),
      h('div', null, h('b', null, run.deaths), h('span', null, 'śmierci')),
      h('div', null, h('b', null, fmtTime(run.time)), h('span', null, 'czas wyprawy')),
    ),
    run.items.length ? h('div', null, h('div', { class: 'pd-h3' }, 'Znaleziska'), ...run.items.map((i) => para(`· ${i}`))) : null,
    lost > 0 ? para(`Utracony popiół: ${lost} żużla.`, 'pd-dim') : null,
    h('div', { class: 'pd-row' }, btn('Do Krypty', () => g.ui.close(s!), { autofocus: true, cls: 'pd-primary' })),
  );
  s = open(g, el, 'summary', { onClose: () => g.input.flush() });
}

// ================================================================== endings
export function endingChoiceScreen(g: Game) {
  const save = g.save!;
  g.music('ending');
  let s: Screen | null = null;
  const lore = save.lore.length;
  const el = panel(
    'Trzecie Serce',
    para('Spiż milknie. W dłoniach ważysz trzy serca: Wyroku, Modlitwy i Spiżu. Halszka czeka u stóp wieży. Z pęknięcia w dzwonie patrzy na ciebie Mikołaj — już tylko jako odbicie.'),
    para('Co zrobisz z Gromnicą?', 'pd-dim'),
    h(
      'div',
      { class: 'pd-btns' },
      ...(Object.keys(ENDINGS) as EndingId[]).map((id) => {
        const e = ENDINGS[id];
        const locked = id === 'oddaj' && lore < LORE.length;
        return btn(e.title, () => {
          g.ui.close(s!);
          endingScreen(g, id);
        }, { disabled: locked, sub: locked ? `Wymaga całej Kroniki (${lore}/${LORE.length} kart)` : e.choice, autofocus: id === 'zadzwon' });
      }),
    ),
    save.ending ? h('div', { class: 'pd-row' }, btn('Jeszcze nie teraz', () => g.ui.close(s!))) : null,
  );
  s = open(g, el, 'endingChoice', { closable: !!save.ending, cls: 'pd-black', onClose: () => g.music(g.world?.location === 'krypta' ? 'hub' : 'explore') });
}

export function endingScreen(g: Game, id: EndingId) {
  const save = g.save!;
  const e = ENDINGS[id];
  let step = 0;
  let s: Screen | null = null;
  audio.setMood('ending', { scene: 'katedra' });
  audio.sfx('bellToll');
  const build = (): HTMLElement => {
    const last = step >= e.text.length;
    const el = h(
      'div',
      { class: 'pd-story' },
      h('h2', { class: 'pd-title' }, last ? 'Koniec' : e.title),
      ...(last
        ? [
            para(`Zakończenie: ${e.title}`),
            h(
              'div',
              { class: 'pd-summary-grid' },
              h('div', null, h('b', null, save.level), h('span', null, 'poziom')),
              h('div', null, h('b', null, save.stats.kills), h('span', null, 'pokonanych wrogów')),
              h('div', null, h('b', null, save.stats.deaths), h('span', null, 'śmierci')),
              h('div', null, h('b', null, fmtTime(save.playTime)), h('span', null, 'czas gry')),
            ),
            para(`Odkryte zakończenia: ${new Set([...save.endingsSeen, id]).size} z 3${save.lore.length < LORE.length ? ' · trzecie wymaga całej Kroniki' : ''}`, 'pd-dim'),
            para('Dziękujemy za grę. Popielny Dzwon — EVGAMES.', 'pd-dim'),
          ]
        : e.text.slice(0, step + 1).map((t, i) => para(t, i < step ? 'pd-old' : ''))),
      h(
        'div',
        { class: 'pd-btns' },
        btn(last ? 'Wróć do Krypty' : 'Dalej', () => {
          if (!last) {
            step++;
            audio.sfx(step >= e.text.length ? 'victory' : 'bellToll', 0, 0.5);
            rerender(g, s!, build, 'ending');
            return;
          }
          save.ending = id;
          if (!save.endingsSeen.includes(id)) save.endingsSeen.push(id);
          g.persist();
          g.ui.close(s!);
          if (g.world && g.world.location !== 'krypta') g.returnToHub('ending');
          else g.music('hub');
        }, { autofocus: true, cls: 'pd-primary' }),
      ),
    );
    return el;
  };
  s = open(g, build(), 'ending', { closable: false, cls: 'pd-black' });
}
