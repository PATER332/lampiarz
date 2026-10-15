import { useEffect, useState, type ReactNode } from 'react';
import { CHARACTERS, UPGRADES, type UpgradeId } from '../game/constants';
import type { Game } from '../game/game';
import { formatTime } from '../game/save';
import type { VictoryStats } from '../game/types';
import { CrystalIcon } from './HUD';

function useKey(code: string | string[], fn: () => void) {
  useEffect(() => {
    const codes = Array.isArray(code) ? code : [code];
    const onKey = (e: KeyboardEvent) => {
      if (codes.includes(e.code)) { e.preventDefault(); fn(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [code, fn]);
}

function Backdrop({ children, dark = 0.55 }: { children: ReactNode; dark?: number }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4" style={{ background: `rgba(2,4,10,${dark})`, animation: 'fadeIn .25s ease both', backdropFilter: 'blur(3px)' }}>
      {children}
    </div>
  );
}

export function PauseMenu({ game, onResume, onShop, onSettings, onControls, onCharacters, onExit }: {
  game: Game; onResume: () => void; onShop: () => void; onSettings: () => void; onControls: () => void; onCharacters: () => void; onExit: () => void;
}) {
  useKey('Escape', onResume);
  const click = () => game.audio.play('uiClick');
  const hover = () => game.audio.play('uiHover');
  const items = [
    ['Kontynuuj', onResume], ['Postacie', onCharacters], ['Ulepszenia', onShop], ['Ustawienia', onSettings], ['Sterowanie', onControls], ['Wyjdź do menu', onExit],
  ] as const;
  return (
    <Backdrop>
      <div className="panel w-full max-w-md p-6 sm:p-8">
        <div className="text-center">
          <div className="font-pixel text-[9px] text-cyan-300/80 tracking-widest">GRA WSTRZYMANA</div>
          <h2 className="panel-title text-2xl mt-2">Pauza</h2>
          <div className="divider mt-4" />
        </div>
        <div className="mt-6 flex flex-col gap-2">
          {items.map(([label, fn], i) => (
            <button key={label} className="menu-btn max-w-none! text-base!" style={{ animationDelay: `${i * 0.06}s` }} onMouseEnter={hover} onClick={() => { click(); fn(); }}>
              <span className="rune" /><span>{label}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 text-center text-[10px] tracking-[0.25em] uppercase text-slate-500">Postęp zapisany przy ostatnim punkcie kontrolnym</div>
      </div>
    </Backdrop>
  );
}

export function DeathScreen({ game, onRespawn, onExit }: { game: Game; onRespawn: () => void; onExit: () => void }) {
  useKey(['Space', 'Enter'], onRespawn);
  return (
    <Backdrop dark={0.35}>
      <div className="text-center" style={{ animation: 'fadeUp .6s ease both' }}>
        <div className="font-title text-4xl sm:text-6xl tracking-[0.3em] uppercase text-rose-100" style={{ textShadow: '0 0 30px rgba(255,77,109,0.7)' }}>Echo zgasło</div>
        <p className="mt-4 text-slate-300 tracking-wide">Podziemia pamiętają każdy upadek. Ale pamiętają też, gdzie zostawiłeś światło.</p>
        <div className="mt-2 text-xs tracking-[0.3em] uppercase text-slate-500">Śmierci: {game.save.deaths}</div>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button className="btn btn-primary" onClick={() => { game.audio.play('uiClick'); onRespawn(); }}>Odrodź się przy punkcie kontrolnym <span className="ml-2 opacity-60 text-xs">[Spacja]</span></button>
          <button className="btn" onClick={() => { game.audio.play('uiClick'); onExit(); }}>Menu główne</button>
        </div>
      </div>
    </Backdrop>
  );
}

export function VictoryScreen({ stats, onMenu, onContinue }: { stats: VictoryStats; onMenu: () => void; onContinue: () => void }) {
  return (
    <Backdrop dark={0.5}>
      <div className="panel w-full max-w-lg p-8 text-center">
        <div className="font-pixel text-[9px] text-fuchsia-300/80 tracking-widest">RDZEŃ ODNALEZIONY</div>
        <h2 className="font-title text-3xl sm:text-4xl tracking-[0.25em] uppercase mt-3 shimmer-text">Serce Podziemi bije</h2>
        <p className="mt-4 text-slate-300 leading-relaxed">
          Echa przeszłości splotły się w jedno. Podziemia odetchnęły — a Ty wiesz już, że żaden ślad nie ginie bez reszty.
        </p>
        <div className="divider my-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          {[
            ['Kryształy', String(stats.crystals)], ['Sekrety', `${stats.secrets}/${stats.secretsTotal}`], ['Śmierci', String(stats.deaths)], ['Czas', formatTime(stats.time)],
          ].map(([l, v], i) => (
            <div key={l} style={{ animation: 'fadeUp .5s ease both', animationDelay: `${0.3 + i * 0.1}s` }}>
              <div className="font-pixel text-sm text-cyan-100">{v}</div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-slate-400 mt-1">{l}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button className="btn btn-primary" onClick={onMenu}>Menu główne</button>
          <button className="btn" onClick={onContinue}>Zostań w podziemiach</button>
        </div>
      </div>
    </Backdrop>
  );
}

export function UpgradeShop({ game, onClose }: { game: Game; onClose: () => void }) {
  const [, force] = useState(0);
  useKey(['Escape', 'KeyE'], onClose);
  const crystals = game.save.crystals;
  const weaver = game.save.character === 'weaver';
  const buy = (id: UpgradeId) => {
    if (game.buy(id)) force((x) => x + 1);
  };
  // fallback for players who skipped the cage in the Archive: the altar can summon her for a price
  const offer = CHARACTERS.weaver;
  const showOffer = !game.hasCharacter('weaver') && game.save.unlocked.includes('gardens');
  const buyChar = () => {
    if (game.buyCharacter('weaver')) force((x) => x + 1);
  };
  return (
    <Backdrop>
      <div className="panel w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 pt-5 pb-3 flex items-center justify-between gap-4">
          <div>
            <div className="font-pixel text-[9px] text-violet-300/80 tracking-widest">OŁTARZ ECH</div>
            <h2 className="panel-title text-xl mt-1">Ulepszenia</h2>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 border border-cyan-300/30 bg-cyan-400/5">
            <CrystalIcon className="w-3.5 h-5" />
            <span className="font-pixel text-sm text-cyan-50 tabular-nums">{crystals}</span>
          </div>
        </div>
        <div className="divider mx-6" />
        <div className="px-6 py-4 overflow-y-auto scroll-thin grid gap-2">
          {showOffer && (
            <div className="flex items-center gap-4 px-4 py-3 border border-amber-300/30 bg-amber-400/5" style={{ animation: 'fadeUp .4s ease both' }}>
              <div className="w-10 h-10 flex items-center justify-center text-2xl text-amber-200 border border-amber-300/30 bg-amber-400/5 flex-none">☾</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold tracking-wide text-amber-100">Przywołaj: {offer.name}, {offer.title}</div>
                <div className="text-sm text-slate-400 leading-snug">Nie uwolniłeś jej z klatki w Archiwum? Ołtarz może ją przywołać — dołączy do Ciebie, a postacie zmienisz klawiszem C.</div>
              </div>
              <button className={`btn px-3! py-1.5! text-xs flex items-center gap-1.5 flex-none ${crystals >= offer.price ? 'btn-primary' : ''}`} disabled={crystals < offer.price} onClick={buyChar}>
                <CrystalIcon className="w-2.5 h-3.5" />{offer.price}
              </button>
            </div>
          )}
          {UPGRADES.map((u, i) => {
            const lvl = game.save.upgrades[u.id];
            const maxed = lvl >= u.costs.length;
            const cost = maxed ? 0 : u.costs[lvl];
            const can = !maxed && crystals >= cost;
            return (
              <div key={u.id} className="upgrade-row flex items-center gap-4 px-4 py-3" style={{ animation: 'fadeUp .4s ease both', animationDelay: `${i * 0.05}s` }}>
                <div className="w-10 h-10 flex items-center justify-center text-2xl text-cyan-200 border border-cyan-300/30 bg-cyan-400/5 flex-none">{u.glyph}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="font-semibold tracking-wide text-cyan-50">{weaver && u.weaverName ? u.weaverName : u.name}</div>
                    <div className="flex gap-1">
                      {u.costs.map((_, k) => <span key={k} className={`pip ${k < lvl ? 'on' : ''}`} />)}
                    </div>
                  </div>
                  <div className="text-sm text-slate-400 leading-snug">{weaver && u.weaverDesc ? u.weaverDesc : u.desc}</div>
                </div>
                <button className={`btn px-3! py-1.5! text-xs flex items-center gap-1.5 flex-none ${can ? 'btn-primary' : ''}`} disabled={!can} onClick={() => buy(u.id)}>
                  {maxed ? 'MAX' : <><CrystalIcon className="w-2.5 h-3.5" />{cost}</>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="px-6 py-4 flex items-center justify-between border-t border-cyan-200/10">
          <span className="text-[10px] tracking-[0.25em] uppercase text-slate-500">Kryształy znajdziesz w całych podziemiach — sekrety kryją większe</span>
          <button className="btn" onClick={onClose}>Zamknij <span className="ml-1 opacity-60 text-xs">[E]</span></button>
        </div>
      </div>
    </Backdrop>
  );
}
