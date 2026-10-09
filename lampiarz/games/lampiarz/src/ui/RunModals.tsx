import { useState } from 'react';
import { audio } from '../audio/audio';
import { BALANCE } from '../game/balance';
import { ACH_MAP, CLASSES, EVENT_MAP, NIGHTS, RELIC_MAP, THEMES } from '../game/content';
import { eventChoiceAvailable } from '../game/engine';
import { seedToCode } from '../game/rng';
import type { Run, ThemeId } from '../game/types';
import { Modal, ThemeArt } from './common';
import { IconEmber, IconGate, IconHeart, IconHome, IconOil, IconRestart, IconSkull, IconSun, RelicIcon } from './icons';

const click = () => audio.play('click');

// ------------------------------------------------------------------ event
export function EventModal({ run, onChoose }: { run: Run; onChoose: (id: string) => void }) {
  const pe = run.pendingEvent;
  if (!pe) return null;
  const ev = EVENT_MAP[pe.id];
  return (
    <Modal labelledBy="ev-title">
      <p className="eyebrow">Spotkanie w mroku</p>
      <h2 id="ev-title">{ev.title}</h2>
      <p className="lore">{ev.text}</p>
      <div className="choices">
        {ev.choices.map((c) => {
          const ok = eventChoiceAvailable(run, ev.id, c.id);
          return (
            <button
              key={c.id}
              className="choice"
              disabled={!ok}
              onClick={() => {
                click();
                onChoose(c.id);
              }}
            >
              <span>{c.label}</span>
              <span className="hint">{ok ? c.hint : 'Nie stać cię'}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ district summary
export function SummaryModal({ run, onNext }: { run: Run; onNext: () => void }) {
  const s = run.summary;
  if (!s) return null;
  return (
    <Modal labelledBy="sum-title">
      <p className="eyebrow">Dzielnica {run.depth} ocalona</p>
      <h2 id="sum-title">{s.name}</h2>
      <p className="lore">Brama skrzypi za twoimi plecami. Gdzieś za nią ktoś znów odważy się wyjrzeć przez okno.</p>
      <div className="kv">
        <div>
          <span>Tury</span>
          <b>{s.turns}</b>
        </div>
        <div>
          <span>Cienie</span>
          <b>{s.kills}</b>
        </div>
        <div>
          <span>Latarnie</span>
          <b>
            {s.lamps}/{s.totalLamps}
          </b>
        </div>
        <div>
          <span>Żar</span>
          <b>{s.embers}</b>
        </div>
      </div>
      <div className="badges">
        {s.fullLight ? <span className="tag good">Pełne światło — darmowy relikt</span> : null}
        {s.flawless ? <span className="tag good">Bez skazy</span> : null}
        <span className="tag">+1 zdrowia, +1 oleju</span>
      </div>
      <div className="modal-actions">
        <button
          className="btn primary"
          data-autofocus
          onClick={() => {
            click();
            onNext();
          }}
        >
          Do warsztatu
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ workshop
export function WorkshopModal({
  run,
  onAct,
}: {
  run: Run;
  onAct: (a: { type: 'buy'; index: number } | { type: 'heal' } | { type: 'oil' } | { type: 'reroll' } | { type: 'leave' }) => string | null;
}) {
  const ws = run.workshop;
  const [msg, setMsg] = useState<string | null>(null);
  if (!ws) return null;
  const p = run.player;
  const act = (a: Parameters<typeof onAct>[0]) => {
    const r = onAct(a);
    if (r) setMsg(r);
  };
  return (
    <Modal wide labelledBy="ws-title">
      <div className="modal-head">
        <div>
          <p className="eyebrow">Warsztat lampiarzy</p>
          <h2 id="ws-title">Żar za światło</h2>
        </div>
        <div className="purse">
          <span className="stat" style={{ color: 'var(--blood)' }}>
            <IconHeart size={17} /> {p.hp}/{p.maxHp}
          </span>
          <span className="stat oil">
            <IconOil size={17} /> {p.oil}/{p.maxOil}
          </span>
          <span className="stat ember">
            <IconEmber size={17} /> {p.embers}
          </span>
        </div>
      </div>
      <p className="lore" style={{ marginTop: 0 }}>
        Stary mistrz kiwa głową w stronę lady. {ws.freePick ? 'Za pełne światło jedna rzecz jest dziś twoja za darmo.' : 'Płacisz żarem — innej waluty tu nie znają.'}
      </p>
      <div className="offers">
        {ws.offers.map((o, i) => {
          const r = RELIC_MAP[o.relic];
          const afford = ws.freePick || p.embers >= o.price;
          return (
            <button
              key={o.relic + i}
              className={`offer ${r.rarity} ${o.sold ? 'sold' : ''}`}
              disabled={o.sold || !afford}
              onClick={() => {
                audio.play('embers');
                act({ type: 'buy', index: i });
              }}
            >
              <div className="ico">
                <RelicIcon id={r.id} size={24} />
              </div>
              <div className="rar">{r.rarity === 'common' ? 'pospolity' : r.rarity === 'uncommon' ? 'rzadki' : 'legendarny'}</div>
              <div className="nm">{r.name}</div>
              <div className="ds">{r.desc}</div>
              {o.sold ? (
                <div className="pr">kupione</div>
              ) : ws.freePick ? (
                <div className="pr free">za darmo</div>
              ) : (
                <div className="pr">
                  <IconEmber size={15} /> {o.price}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="services">
        <button className="btn service" disabled={p.hp >= p.maxHp || p.embers < ws.healCost} onClick={() => (audio.play('heal'), act({ type: 'heal' }))}>
          <span>
            <IconHeart size={15} /> Opatrunek +1
          </span>
          <span className="stat ember">
            <IconEmber size={14} /> {ws.healCost}
          </span>
        </button>
        <button className="btn service" disabled={p.oil >= p.maxOil || p.embers < ws.oilCost} onClick={() => (audio.play('oil'), act({ type: 'oil' }))}>
          <span>
            <IconOil size={15} /> Olej +{BALANCE.workshop.oilAmount}
          </span>
          <span className="stat ember">
            <IconEmber size={14} /> {ws.oilCost}
          </span>
        </button>
        <button className="btn service" disabled={p.embers < ws.rerollCost} onClick={() => (click(), act({ type: 'reroll' }))}>
          <span>
            <IconRestart size={15} /> Nowe towary
          </span>
          <span className="stat ember">
            <IconEmber size={14} /> {ws.rerollCost}
          </span>
        </button>
      </div>
      <div className="modal-actions" style={{ alignItems: 'center' }}>
        <span className="muted" style={{ marginRight: 'auto', fontSize: 14 }} aria-live="polite">
          {msg ?? ' '}
        </span>
        <button
          className="btn primary"
          onClick={() => {
            click();
            onAct({ type: 'leave' });
          }}
        >
          Ruszaj dalej
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ path choice
export function PathModal({ run, onChoose }: { run: Run; onChoose: (t: ThemeId) => void }) {
  const opts = run.pathOptions ?? [];
  const final = opts.length === 1 && opts[0].theme === 'latarnia';
  return (
    <Modal wide labelledBy="path-title">
      <p className="eyebrow">{final ? 'Ostatnia droga' : `Dzielnica ${run.depth + 1} z 5`}</p>
      <h2 id="path-title">{final ? 'Na cypel' : 'Którędy dalej?'}</h2>
      <p className="lore" style={{ marginBottom: 0 }}>
        {final ? 'Za ostatnią bramą zaczyna się wiatr od morza. Tam czeka latarnia — i to, co jej strzeże.' : 'Dwie ulice, dwa rodzaje nocy. Wybór zostanie z tobą do świtu.'}
      </p>
      <div className="paths">
        {opts.map((o) => {
          const th = THEMES[o.theme];
          return (
            <button
              key={o.theme}
              className="path"
              onClick={() => {
                click();
                onChoose(o.theme);
              }}
            >
              <div className="sky">
                <ThemeArt theme={o.theme} />
              </div>
              <div className="pb">
                <div className="nm">{th.name}</div>
                <div className="ds">{th.blurb}</div>
                <div className="danger-pips">
                  zagrożenie
                  {[1, 2, 3, 4].map((i) => (
                    <i key={i} className={i <= o.danger ? 'on' : ''} />
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ end of run
export function RunEndModal({
  run,
  newAchievements,
  onAgain,
  onMenu,
}: {
  run: Run;
  newAchievements: string[];
  onAgain: () => void;
  onMenu: () => void;
}) {
  const won = run.phase === 'victory';
  const st = run.stats;
  return (
    <Modal labelledBy="end-title">
      <div className={`end-hero ${won ? 'win' : 'lose'}`}>
        <div className="ico">{won ? <IconSun size={32} /> : <IconSkull size={30} />}</div>
        <p className="eyebrow" style={{ marginTop: 14 }}>
          {won ? (run.bossSlain ? 'Matka Mroku rozproszona' : 'Latarnia morska płonie') : `Dzielnica ${run.depth} · ${run.killedBy ?? 'mrok'}`}
        </p>
        <div className="big" id="end-title">
          {won ? 'Świt nad miastem' : 'Latarnia zgasła'}
        </div>
        <p className="lore" style={{ margin: '6px auto 0', maxWidth: 420 }}>
          {won
            ? 'Pierwsze promienie słońca wchodzą w uliczki, które jeszcze godzinę temu należały do cieni. Gasisz latarnię. Tej nocy wystarczyło.'
            : 'Ostatnia iskra syczy i gaśnie. Miasto będzie czekać na kolejnego lampiarza.'}
        </p>
      </div>
      <div className="kv">
        <div>
          <span>Dzielnice</span>
          <b>{st.districts}</b>
        </div>
        <div>
          <span>Latarnie</span>
          <b>{st.lampsLit}</b>
        </div>
        <div>
          <span>Cienie</span>
          <b>{st.kills}</b>
        </div>
        <div>
          <span>Żar</span>
          <b>{st.embersGained}</b>
        </div>
        <div>
          <span>Tury</span>
          <b>{st.turns}</b>
        </div>
      </div>
      <div className="score" style={{ textAlign: 'center' }}>
        Wynik
        <b>{run.score}</b>
      </div>
      <p className="muted" style={{ textAlign: 'center', fontSize: 13, margin: '8px 0 0' }}>
        {CLASSES[run.cls].name} · {NIGHTS[run.night - 1].name} · {run.daily ? `Noc dnia ${run.daily}` : `ziarno ${seedToCode(run.seed)}`}
      </p>
      {run.player.relics.length ? (
        <div className="badges" style={{ justifyContent: 'center', marginTop: 12 }}>
          {run.player.relics.map((r) => (
            <span key={r} className="tag">
              <RelicIcon id={r} size={14} /> {RELIC_MAP[r].name}
            </span>
          ))}
        </div>
      ) : null}
      {newAchievements.length ? (
        <>
          <hr className="divider" />
          <p className="eyebrow">Nowe osiągnięcia</p>
          <div className="badges">
            {newAchievements.map((a) => (
              <span key={a} className="tag good">
                {ACH_MAP[a]?.name}
                {ACH_MAP[a]?.reward ? ` — ${ACH_MAP[a].reward}` : ''}
              </span>
            ))}
          </div>
        </>
      ) : null}
      <div className="modal-actions center">
        <button className="btn" onClick={() => (click(), onMenu())}>
          <IconHome size={17} /> Menu
        </button>
        <button className="btn primary" data-autofocus onClick={() => (click(), onAgain())}>
          <IconRestart size={17} /> Kolejna noc
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ pause
export function PauseModal({
  run,
  onResume,
  onSettings,
  onHowTo,
  onQuit,
  onAbandon,
}: {
  run: Run;
  onResume: () => void;
  onSettings: () => void;
  onHowTo: () => void;
  onQuit: () => void;
  onAbandon: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal onClose={onResume} labelledBy="pause-title">
      <p className="eyebrow">Pauza</p>
      <h2 id="pause-title">Chwila oddechu</h2>
      <p className="muted" style={{ fontSize: 14 }}>
        {CLASSES[run.cls].name} · {NIGHTS[run.night - 1].name} · dzielnica {run.depth}/6 · {run.daily ? `Noc dnia ${run.daily}` : `ziarno ${seedToCode(run.seed)}`}
      </p>
      <p className="muted" style={{ fontSize: 14 }}>Postęp zapisuje się automatycznie po każdej turze.</p>
      <div className="choices">
        <button className="choice" data-autofocus onClick={() => (click(), onResume())}>
          <span>Wznów</span>
          <span className="kbd">Esc</span>
        </button>
        <button className="choice" onClick={() => (click(), onSettings())}>
          <span>Ustawienia</span>
        </button>
        <button className="choice" onClick={() => (click(), onHowTo())}>
          <span>Jak grać</span>
        </button>
        <button className="choice" onClick={() => (click(), onQuit())}>
          <span>Zapisz i wyjdź do menu</span>
          <IconGate size={18} />
        </button>
      </div>
      <hr className="divider" />
      {!confirm ? (
        <button className="btn danger small" onClick={() => setConfirm(true)}>
          Porzuć tę noc
        </button>
      ) : (
        <ConfirmAbandon onConfirm={onAbandon} onCancel={() => setConfirm(false)} />
      )}
    </Modal>
  );
}

function ConfirmAbandon({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="muted" style={{ fontSize: 14 }}>
        Noc zostanie zaliczona jako przegrana.
      </span>
      <button className="btn danger small" onClick={onConfirm}>
        Porzuć
      </button>
      <button className="btn small" onClick={onCancel}>
        Anuluj
      </button>
    </div>
  );
}
