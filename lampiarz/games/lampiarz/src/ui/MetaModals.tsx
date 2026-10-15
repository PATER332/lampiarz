import { useState } from 'react';
import { audio } from '../audio/audio';
import { ACHIEVEMENTS, CLASSES, ENEMIES, MASTERY, RELICS, WEATHERS } from '../game/content';
import { masteryLevel, masteryNextCost, type Profile, type Settings } from '../game/meta';
import { seedToCode } from '../game/rng';
import type { EnemyType } from '../game/types';
import { CloseButton, EnemyPortrait, Modal, Switch } from './common';
import { IconExpand, IconLock, IconStar, RelicIcon } from './icons';

// ------------------------------------------------------------------ settings
export function SettingsModal({
  settings,
  onChange,
  onClose,
  onReset,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  onReset?: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const slider = (k: 'master' | 'music' | 'sfx', label: string) => (
    <div className="setting">
      <div>
        <div className="ttl">{label}</div>
      </div>
      <input
        className="range"
        type="range"
        min={0}
        max={100}
        value={Math.round(settings[k] * 100)}
        aria-label={label}
        onChange={(e) => set(k, Number(e.target.value) / 100)}
        onPointerUp={() => audio.play('click')}
      />
    </div>
  );
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
  return (
    <Modal onClose={onClose} labelledBy="settings-title">
      <div className="modal-head">
        <div>
          <p className="eyebrow">Ustawienia</p>
          <h2 id="settings-title">Warsztat lampiarza</h2>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      {slider('master', 'Głośność ogólna')}
      {slider('music', 'Muzyka i otoczenie')}
      {slider('sfx', 'Efekty dźwiękowe')}
      <div className="setting">
        <div>
          <div className="ttl">Wycisz wszystko</div>
          <div className="sub">Skrót: M</div>
        </div>
        <Switch on={settings.muted} onChange={(v) => set('muted', v)} label="Wycisz wszystko" />
      </div>
      <div className="setting">
        <div>
          <div className="ttl">Wstrząsy ekranu</div>
        </div>
        <Switch on={settings.shake} onChange={(v) => set('shake', v)} label="Wstrząsy ekranu" />
      </div>
      <div className="setting">
        <div>
          <div className="ttl">Ograniczony ruch</div>
          <div className="sub">Mniej cząsteczek, bez mgły i wstrząsów.</div>
        </div>
        <Switch on={settings.reducedMotion} onChange={(v) => set('reducedMotion', v)} label="Ograniczony ruch" />
      </div>
      <div className="setting">
        <div>
          <div className="ttl">Efekty świetlne</div>
          <div className="sub">Barwne światło, mokry bruk, poświata i ziarno. Na słabszych komputerach gra wyłącza je sama.</div>
        </div>
        <Switch on={settings.effects !== false} onChange={(v) => set('effects', v)} label="Efekty świetlne" />
      </div>
      <div className="setting">
        <div>
          <div className="ttl">Wskazówki</div>
          <div className="sub">Ramka „Cel”, strzałki do zniczy i bramy, karty nowych wrogów.</div>
        </div>
        <Switch on={settings.hints} onChange={(v) => set('hints', v)} label="Wskazówki" />
      </div>
      <div className="setting">
        <div>
          <div className="ttl">Siatka pól</div>
        </div>
        <Switch on={settings.showGrid} onChange={(v) => set('showGrid', v)} label="Siatka pól" />
      </div>
      {canFullscreen ? (
        <div className="setting">
          <div>
            <div className="ttl">Pełny ekran</div>
            <div className="sub">Skrót: F11 lub przycisk obok.</div>
          </div>
          <button
            className="btn small"
            onClick={() => {
              audio.play('click');
              if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
              else void document.documentElement.requestFullscreen().catch(() => undefined);
            }}
          >
            <IconExpand size={16} /> Przełącz
          </button>
        </div>
      ) : null}
      {onReset ? (
        <>
          <hr className="divider" />
          {!confirm ? (
            <button className="btn danger small" onClick={() => setConfirm(true)}>
              Usuń cały postęp
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 14 }}>
                Na pewno? Osiągnięcia, statystyki i bieżąca noc przepadną.
              </span>
              <button className="btn danger small" onClick={onReset}>
                Tak, usuń
              </button>
              <button className="btn small" onClick={() => setConfirm(false)}>
                Anuluj
              </button>
            </div>
          )}
        </>
      ) : null}
    </Modal>
  );
}

// ------------------------------------------------------------------ how to play
export function HowToModal({ onClose, onTutorial }: { onClose: () => void; onTutorial?: () => void }) {
  return (
    <Modal onClose={onClose} wide labelledBy="howto-title">
      <div className="modal-head">
        <div>
          <p className="eyebrow">Jak grać</p>
          <h2 id="howto-title">Zasady nocnej warty</h2>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="howto">
        <p className="lore">
          Mrok zalał miasto. Ty masz latarnię, kanister oleju i jedno zadanie: przeprowadzić światło przez pięć dzielnic aż do latarni morskiej na
          cyplu.
        </p>
        {onTutorial ? (
          <p className="howto-tut">
            Najszybciej nauczysz się w praktyce:{' '}
            <button className="btn small primary" onClick={onTutorial}>
              Zagraj samouczek
            </button>
          </p>
        ) : null}
        <h3>Cel w każdej dzielnicy</h3>
        <ol>
          <li>Znajdź trzy <b>znicze</b> (duże misy ognia) — strzałki na brzegu ekranu i ramka „Cel” u góry wskazują drogę.</li>
          <li>
            Zapal każdy, wchodząc w niego (2 oleju). Gdy <b>wszystkie trzy</b> zapłoną jednocześnie, brama otwiera się <b>na dobre</b> — nawet jeśli coś
            potem zgasi znicz.
          </li>
          <li>Wejdź w bramę. Dostajesz +1 zdrowia i +1 oleju, potem warsztat i wybór kolejnej dzielnicy.</li>
        </ol>
        <p>
          Gra jest <b>turowa</b>: każdy twój ruch to jedna tura, a wrogowie ruszają się dopiero po tobie. Nie ma pośpiechu — ikony nad wrogami mówią,
          co zrobią w następnej turze.
        </p>
        <h3>Światło to schronienie</h3>
        <ul>
          <li>
            Pola oświetlone przez <b>latarnie, znicze i ogień</b> to święte światło: cienie nie mogą w nie wejść, a jeśli światło je zaskoczy — płoną
            (2 obrażeń). Uwaga: cień stojący tuż za granicą blasku nadal może cię drapnąć, więc stój głębiej w świetle.
          </li>
          <li>Twoja ręczna latarnia tylko oświetla drogę — cienie podejdą do ciebie. Bez oleju jej blask kurczy się do jednego pola.</li>
          <li>Ściany rzucają cień — światło dociera tylko tam, gdzie „widzi” płomień.</li>
          <li>
            Odpoczywając (<b>czekaj</b>) w blasku płonącego znicza, co 4 tury odzyskujesz 1 zdrowia.
          </li>
        </ul>
        <h3>Olej to waluta wyborów</h3>
        <ul>
          <li>Latarnia kosztuje 1, znicz 2, zdolność postaci 1–2. Ręczna latarnia spala 1 olej co 15 tur.</li>
          <li>
            Olej daje kanister na ulicy, rozproszony gasiciel (+1), czasem cień, a zgaszona przez ciebie latarnia oddaje 1 (stań obok i naciśnij{' '}
            <b>F</b>).
          </li>
          <li>Gdy masz najwyżej 1 olej, każdy rozproszony cień daje iskrę — +1 oleju.</li>
        </ul>
        <h3>Mrok gęstnieje</h3>
        <ul>
          <li>Pasek mroku rośnie z każdą turą; gdy się zapełni, w ciemności rodzi się nowy cień. Każde płonące światło spowalnia mrok.</li>
          <li>Po 160 turach w jednej dzielnicy zapada głęboka noc: mrok rośnie dwa razy szybciej, a cienie przestają zostawiać żar.</li>
        </ul>
        <h3>Walka</h3>
        <ul>
          <li>Wejdź we wroga, aby go uderzyć. Wrogowie atakują, gdy stoją obok ciebie — kto pierwszy, ten lepszy.</li>
          <li>Kreski pod wrogiem to jego życie. Fioletowe kreski = elita (o 1 punkt życia więcej).</li>
          <li>Żar z rozproszonych cieni i stosów wydasz w warsztacie po każdej dzielnicy na relikty, leczenie i olej.</li>
        </ul>
        <h3>Wrogowie</h3>
        <div className="bestiary-mini">
          {(Object.keys(ENEMIES) as (keyof typeof ENEMIES)[]).map((k) => (
            <div key={k}>
              <b>{ENEMIES[k].name}</b>
              <span>{ENEMIES[k].desc}</span>
            </div>
          ))}
        </div>
        <h3>Co jeszcze spotkasz</h3>
        <ul>
          <li>
            <b>Beczki z olejem</b>: wejdź w beczkę, a wybuchnie — 3 obrażeń wrogom wokół i ogień na 4 tury. Ciebie nie rani, więc zwab cienie i odpal.
          </li>
          <li>
            <b>Pogoda</b>: {(['deszcz', 'mgla', 'pelnia'] as const).map((w) => `${WEATHERS[w].name} — ${WEATHERS[w].desc}`).join(' ')} Prognozę widać przy wyborze drogi.
          </li>
          <li>
            <b>Kominiarz Cieni</b> (3. dzielnica): schodzi z dachów, gdy zapłonie drugi znicz, i gasi latarnie sadzą. Pokonany zostawia relikt.
          </li>
          <li>
            <b>Tryb „Do świtu”</b>: dzielnice bez końca, mrok gęstnieje z każdą. Liczy się rekord.
          </li>
          <li>
            <b>Księga mistrza</b> (menu): popiół z każdej nocy zamienisz na trwałe ulepszenia.
          </li>
        </ul>
        <h3>Ostatnia noc: Cypel Latarni</h3>
        <ul>
          <li>Na Cyplu wiatr od morza leczy cię do pełna i daje +2 oleju.</li>
          <li>
            Matka Mroku śpi, dopóki nie zapalisz pierwszego znicza. Zapal trzy znicze, a potem <b>latarnię morską</b> (1 olej) — albo rozprosz Matkę.
          </li>
          <li>Napis „ZAĆMIENIE!” ostrzega turę wcześniej: odejdź z jej kręgu. Zaćmienie gasi zwykłe latarnie, znicze wytrzymują.</li>
        </ul>
        <h3>Sterowanie</h3>
        <div className="keys">
          <div className="k">
            <span className="kbd">W</span>
            <span className="kbd">A</span>
            <span className="kbd">S</span>
            <span className="kbd">D</span> / strzałki
          </div>
          <div>Ruch, atak, zapalanie latarni (wejdź w nią)</div>
          <div className="k">
            <span className="kbd">Q</span>
          </div>
          <div>Zdolność postaci</div>
          <div className="k">
            <span className="kbd">F</span> / <span className="kbd">E</span>
          </div>
          <div>Zapal lub zgaś sąsiednią latarnię (zbierz olej)</div>
          <div className="k">
            <span className="kbd">Spacja</span>
          </div>
          <div>Czekaj turę</div>
          <div className="k">
            <span className="kbd">Esc</span> / <span className="kbd">P</span>
          </div>
          <div>Pauza</div>
          <div className="k">
            <span className="kbd">M</span>
          </div>
          <div>Wycisz dźwięk</div>
          <div className="k">Mysz / dotyk</div>
          <div>Kliknij pole, aby iść w jego stronę. Najedź na pole, aby je zbadać.</div>
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn primary" onClick={onClose}>
          Rozumiem
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ book
type Tab = 'ach' | 'stats' | 'beasts' | 'relics' | 'history';

// ------------------------------------------------------------------ mastery (permanent upgrades)
export function MasteryModal({ profile, onBuy, onClose }: { profile: Profile; onBuy: (id: string) => string | null; onClose: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Modal onClose={onClose} wide labelledBy="mastery-title">
      <div className="modal-head">
        <div>
          <p className="eyebrow">Księga mistrza</p>
          <h2 id="mastery-title">Ulepszenia na każdą noc</h2>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <p className="lore" style={{ marginTop: 0 }}>
        Po każdej nocy — wygranej czy przegranej — z latarni zostaje <b>popiół</b>. Mistrz cechu zamienia go na trwałe ulepszenia, które działają w każdej
        kolejnej nocy (oprócz Nocy dnia, żeby była równa dla wszystkich).
      </p>
      <div className="ash-balance">
        Popiół: <b>{profile.ash ?? 0}</b>
      </div>
      <div className="mastery-grid">
        {MASTERY.map((m) => {
          const lv = masteryLevel(profile, m.id);
          const cost = masteryNextCost(profile, m.id);
          return (
            <div key={m.id} className={`mastery ${lv > 0 ? 'owned' : ''}`}>
              <div className="nm">
                {m.name}
                <span className="lv">
                  {Array.from({ length: m.costs.length }, (_, i) => (
                    <i key={i} className={i < lv ? 'on' : ''} />
                  ))}
                </span>
              </div>
              <div className="ds">{m.desc}</div>
              <button
                className="btn small"
                disabled={cost === null || (profile.ash ?? 0) < cost}
                onClick={() => {
                  const r = onBuy(m.id);
                  setMsg(r ?? `Ulepszono: ${m.name}.`);
                }}
              >
                {cost === null ? 'Maksymalny poziom' : `Kup za ${cost} popiołu`}
              </button>
            </div>
          );
        })}
      </div>
      <div className="modal-actions" style={{ alignItems: 'center' }}>
        <span className="muted" style={{ marginRight: 'auto', fontSize: 14 }} aria-live="polite">
          {msg ?? ' '}
        </span>
        <button className="btn primary" onClick={onClose}>
          Zamknij
        </button>
      </div>
    </Modal>
  );
}

export function BookModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('ach');
  const s = profile.stats;
  const got = Object.keys(profile.achievements).length;
  return (
    <Modal onClose={onClose} wide labelledBy="book-title">
      <div className="modal-head">
        <div>
          <p className="eyebrow">Księga lampiarza</p>
          <h2 id="book-title">Wszystko, co przetrwało noc</h2>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="tabs" role="tablist">
        {(
          [
            ['ach', `Osiągnięcia ${got}/${ACHIEVEMENTS.length}`],
            ['stats', 'Statystyki'],
            ['beasts', 'Bestiariusz'],
            ['relics', 'Relikty'],
            ['history', 'Ostatnie noce'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={`tab ${tab === k ? 'on' : ''}`}
            onClick={() => {
              audio.play('page');
              setTab(k);
            }}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === 'ach' ? (
        <div className="ach-list">
          {ACHIEVEMENTS.map((a) => {
            const on = !!profile.achievements[a.id];
            const hidden = a.secret && !on;
            return (
              <div key={a.id} className={`ach ${on ? 'on' : ''}`}>
                <div className="b">{on ? <IconStar size={17} /> : hidden ? <IconLock size={15} /> : <IconStar size={15} />}</div>
                <div>
                  <div className="n">{hidden ? 'Sekretne osiągnięcie' : a.name}</div>
                  <div className="d">{hidden ? 'Odkryj je w mroku.' : a.desc}</div>
                  {a.reward && !hidden ? <div className="rw">{a.reward}</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {tab === 'stats' ? (
        <>
          <div className="kv">
            <div>
              <span>Noce</span>
              <b>{s.runs}</b>
            </div>
            <div>
              <span>Świty</span>
              <b>{s.wins}</b>
            </div>
            <div>
              <span>Rekord</span>
              <b>{s.bestScore}</b>
            </div>
            <div>
              <span>Najgłębiej</span>
              <b>{s.deepest ? `${s.deepest}/6` : '—'}</b>
            </div>
            <div>
              <span>Latarnie</span>
              <b>{s.lamps}</b>
            </div>
            <div>
              <span>Rozproszone cienie</span>
              <b>{s.kills}</b>
            </div>
            <div>
              <span>Zebrany żar</span>
              <b>{s.embers}</b>
            </div>
            <div>
              <span>Tury</span>
              <b>{s.turns}</b>
            </div>
            <div>
              <span>Najwyższa noc</span>
              <b>{s.maxNightWon ? ['I', 'II', 'III', 'IV', 'V'][s.maxNightWon - 1] : '—'}</b>
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Postać</th>
                <th>Świty</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(CLASSES).map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{s.winsByClass[c.id] ?? 0}</td>
                  <td className="muted">{c.unlock && !profile.achievements[c.unlock] ? c.unlockHint : 'dostępna'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      {tab === 'beasts' ? (
        <div className="bestiary">
          {(Object.keys(ENEMIES) as EnemyType[]).map((t) => {
            const e = ENEMIES[t];
            const known = profile.seenEnemies.includes(t);
            return (
              <div key={t} className={`beast ${known ? '' : 'unknown'}`}>
                <EnemyPortrait type={t} known={known} />
                <div>
                  <div className="n">{known ? e.name : '???'}</div>
                  {known ? (
                    <div className="st">
                      zdrowie {e.hp} · {t === 'smolnik' ? 'wysysa olej' : t === 'gasiciel' ? 'gasi światło' : `obrażenia ${e.damage}`} · ruch {e.speed}
                    </div>
                  ) : null}
                  <div className="d">{known ? e.desc : 'Para oczu w mroku. Spotkaj, by poznać.'}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {tab === 'relics' ? (
        <div className="relic-list">
          {RELICS.map((r) => {
            const known = profile.seenRelics.includes(r.id);
            const locked = r.unlock && !profile.achievements[r.unlock];
            return (
              <div key={r.id} className={`relic-row ${known ? '' : 'unknown'}`}>
                <div className={`relic ${r.rarity}`} style={known ? undefined : { opacity: 0.35 }}>
                  <RelicIcon id={known ? r.id : 'unknown'} size={18} />
                </div>
                <div>
                  <b style={{ color: known ? 'var(--parchment)' : undefined }}>{known ? r.name : '???'}</b>
                  <div>{known ? r.desc : locked ? 'Zablokowany — zdobądź odpowiednie osiągnięcie.' : r.shopless ? 'Spoczywa gdzieś w zapomnianym miejscu.' : 'Jeszcze nie widziany.'}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {tab === 'history' ? (
        profile.history.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Wynik</th>
                <th>Postać</th>
                <th>Noc</th>
                <th>Koniec</th>
                <th>Ziarno</th>
              </tr>
            </thead>
            <tbody>
              {profile.history.map((h, i) => (
                <tr key={i}>
                  <td>
                    <b>{h.score}</b>
                  </td>
                  <td>{CLASSES[h.cls]?.name ?? h.cls}</td>
                  <td>{['I', 'II', 'III', 'IV', 'V'][h.night - 1]}</td>
                  <td>{h.won ? <span style={{ color: 'var(--holy)' }}>Świt</span> : <span className="muted">dzielnica {h.depth}: {h.killedBy ?? '—'}</span>}</td>
                  <td className="muted">{h.daily ? `dzień ${h.daily}` : seedToCode(h.seed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">Żadna noc jeszcze się nie skończyła. Księga czeka na pierwszy wpis.</div>
        )
      ) : null}
    </Modal>
  );
}

