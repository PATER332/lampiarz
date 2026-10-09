import { BALANCE } from '../game/balance';
import { CLASSES, NIGHTS, RELIC_MAP } from '../game/content';
import { abilityCost, braziers, deepNight, gateOpen, hasRelic, isFinal, lampAt, mrokRate } from '../game/engine';
import { DIRS4 } from '../game/grid';
import type { Action, Run } from '../game/types';
import { IconArrow, IconBrazier, IconEmber, IconFire, IconFlare, IconGate, IconHammer, IconHand, IconHeart, IconHourglass, IconMoon, IconOil, IconPause, IconSound, RelicIcon } from './icons';

export interface InspectInfo {
  title: string;
  sub: string;
  text: string;
  intent?: string;
}

export function Hud({
  run,
  onAction,
  onPause,
  muted,
  onMute,
  inspect,
}: {
  run: Run;
  onAction: (a: Action) => void;
  onPause: () => void;
  muted: boolean;
  onMute: () => void;
  inspect: InspectInfo | null;
}) {
  const p = run.player;
  const d = run.district;
  const cls = CLASSES[run.cls];
  const cost = abilityCost(run);
  const lit = braziers(d).filter((b) => b.lit).length;
  const open = gateOpen(d);
  const every = hasRelic(run, 'oszczedny_palnik') ? BALANCE.lantern.burnEveryFrugal : BALANCE.lantern.burnEvery;
  const burnSoon = p.oil > 0 && every - p.lanternTimer <= 2;
  const mrokPct = Math.min(100, (d.mrok / BALANCE.mrok.threshold) * 100);
  const rate = mrokRate(run);
  const turnsToSpawn = Math.max(1, Math.ceil((BALANCE.mrok.threshold - d.mrok) / rate));
  const deep = deepNight(run);
  const adjLamp = DIRS4.map((dir) => lampAt(d, p.x + dir.x, p.y + dir.y)).find((l) => l && (l.kind === 'lamp' || !l.lit));
  const interactLabel = adjLamp ? (adjLamp.lit ? 'Zbierz olej' : 'Zapal') : 'Latarnia';
  const AbilityIcon = run.cls === 'kowalka' ? IconHammer : run.cls === 'alchemik' ? IconFire : IconFlare;
  const logs = run.log.slice(-4);
  const lowHp = p.hp <= 1;

  return (
    <>
      <div className="hud-top">
        <div className="vitals">
          <div className={`hearts ${lowHp ? 'low' : ''}`} aria-label={`Zdrowie ${p.hp} z ${p.maxHp}`}>
            {Array.from({ length: p.maxHp }, (_, i) => (
              <IconHeart key={i} size={20} empty={i >= p.hp} className={i >= p.hp ? 'empty' : ''} />
            ))}
          </div>
          <div className="oil-row" aria-label={`Olej ${p.oil} z ${p.maxOil}`}>
            <span className="stat oil">
              <IconOil size={16} />
            </span>
            <div className="oil-bar">
              {Array.from({ length: p.maxOil }, (_, i) => (
                <i key={i} className={`${i < p.oil ? 'on' : ''} ${burnSoon && i === p.oil - 1 ? 'burn' : ''}`} />
              ))}
            </div>
            <span className="stat oil">
              {p.oil}
              <small>/{p.maxOil}</small>
            </span>
          </div>
          <span className="stat ember" aria-label={`Żar ${p.embers}`}>
            <IconEmber size={16} /> {p.embers}
            <small className="hide-mobile">żaru</small>
          </span>
        </div>

        <div className="district">
          <div className="name">{d.name}</div>
          <div className="meta">
            {isFinal(run) ? 'Ostatnia noc' : `Dzielnica ${run.depth} z 5`} · {NIGHTS[run.night - 1].name} · tura {d.turn}
          </div>
          <div className="braziers" aria-label={`Znicze ${lit} z 3`}>
            {braziers(d).map((b) => (
              <IconBrazier key={b.id} size={20} lit={b.lit} className={b.lit ? 'lit' : ''} />
            ))}
            <span style={{ width: 8 }} />
            {isFinal(run) ? (
              <span className={open ? 'gate-ok' : ''} title="Latarnia morska">
                <IconFlare size={20} />
              </span>
            ) : (
              <span className={open ? 'gate-ok' : ''} title={open ? 'Brama otwarta' : 'Brama zamknięta'}>
                <IconGate size={20} open={open} />
              </span>
            )}
          </div>
        </div>

        <div className="hud-right">
          <div className={`mrok ${deep ? 'deep' : ''}`} title={`Nowy cień za ok. ${turnsToSpawn} tur`}>
            <div className="lbl">
              <IconMoon size={14} />
              <span>{deep ? 'Głęboka noc' : 'Mrok'}</span>
            </div>
            <div className="track">
              <div className="fill" style={{ width: `${mrokPct}%` }} />
            </div>
            <div className="rate">nowy cień za ~{turnsToSpawn} t.</div>
          </div>
          <button className="btn icon hud-btn hide-mobile" onClick={onMute} aria-label={muted ? 'Włącz dźwięk' : 'Wycisz'} title="Dźwięk (M)">
            <IconSound size={18} off={muted} />
          </button>
          <button className="btn icon hud-btn" onClick={onPause} aria-label="Pauza" title="Pauza (Esc)">
            <IconPause size={18} />
          </button>
        </div>
      </div>

      <div className="hud-bottom">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div className="dpad" aria-label="Kierunki">
            <span />
            <button aria-label="Góra" onPointerDown={(e) => (e.preventDefault(), onAction({ type: 'move', dx: 0, dy: -1 }))}>
              <IconArrow dir="up" size={20} />
            </button>
            <span />
            <button aria-label="Lewo" onPointerDown={(e) => (e.preventDefault(), onAction({ type: 'move', dx: -1, dy: 0 }))}>
              <IconArrow dir="left" size={20} />
            </button>
            <button aria-label="Czekaj" onPointerDown={(e) => (e.preventDefault(), onAction({ type: 'wait' }))}>
              <IconHourglass size={18} />
            </button>
            <button aria-label="Prawo" onPointerDown={(e) => (e.preventDefault(), onAction({ type: 'move', dx: 1, dy: 0 }))}>
              <IconArrow dir="right" size={20} />
            </button>
            <span />
            <button aria-label="Dół" onPointerDown={(e) => (e.preventDefault(), onAction({ type: 'move', dx: 0, dy: 1 }))}>
              <IconArrow dir="down" size={20} />
            </button>
            <span />
          </div>
          <div className="log" aria-live="polite">
            {logs.map((l, i) => (
              <div key={`${run.log.length - logs.length + i}`} className={`t-${l.tone} ${i < logs.length - 2 ? 'old' : ''}`}>
                {l.text}
              </div>
            ))}
          </div>
        </div>

        <div className="actions">
          <button
            className={`action ${p.oil >= cost ? 'ready' : ''}`}
            disabled={p.oil < cost || run.phase !== 'play'}
            onClick={() => onAction({ type: 'ability' })}
            title={`${cls.ability.name}: ${cls.ability.desc}`}
          >
            <span className="cost">
              <IconOil size={10} />
              {cost}
            </span>
            <span className="key kbd">Q</span>
            <AbilityIcon size={22} />
            {cls.ability.name}
          </button>
          <button className="action" disabled={!adjLamp || run.phase !== 'play'} onClick={() => onAction({ type: 'interact' })} title="Zapal lub zgaś sąsiednią latarnię">
            <span className="key kbd">F</span>
            <IconHand size={22} />
            {interactLabel}
          </button>
          <button className="action" disabled={run.phase !== 'play'} onClick={() => onAction({ type: 'wait' })} title="Czekaj turę (w blasku znicza leczy)">
            <span className="key kbd">Spc</span>
            <IconHourglass size={22} />
            Czekaj
          </button>
        </div>

        <div className="relics" aria-label="Relikty">
          {p.relics.map((id) => {
            const r = RELIC_MAP[id];
            return (
              <div key={id} className={`relic ${r.rarity}`} tabIndex={0} aria-label={`${r.name}: ${r.desc}`}>
                <RelicIcon id={id} size={18} />
                <div className="tip">
                  <b>{r.name}</b>
                  {r.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {inspect ? (
        <div className="panel inspect">
          <div className="sub">{inspect.sub}</div>
          <b>{inspect.title}</b>
          <div>{inspect.text}</div>
          {inspect.intent ? <div className="intent">{inspect.intent}</div> : null}
        </div>
      ) : null}
    </>
  );
}
