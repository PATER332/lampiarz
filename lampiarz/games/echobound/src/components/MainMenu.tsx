import { useEffect, useRef, useState } from 'react';
import { MenuScene } from '../game/menuScene';
import type { AudioEngine } from '../game/audio';
import type { SaveData, Settings } from '../game/types';
import { formatTime } from '../game/save';
import { LEVEL_ORDER } from '../game/levels';
import { AboutPanel, ControlsPanel, SettingsPanel } from './Panels';

type Sub = 'none' | 'settings' | 'controls' | 'about' | 'confirmNew';

export function MainMenu({ save, settings, audio, onNewGame, onContinue, onSettings, onResetSave }: {
  save: SaveData | null; settings: Settings; audio: AudioEngine;
  onNewGame: () => void; onContinue: () => void; onSettings: (s: Settings) => void; onResetSave: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sub, setSub] = useState<Sub>('none');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const scene = new MenuScene(canvasRef.current!);
    scene.start();
    const t = setTimeout(() => setReady(true), 300);
    return () => { scene.stop(); clearTimeout(t); };
  }, []);

  // soft cave ambience in the menu once the browser allows audio
  useEffect(() => {
    const h = () => { audio.init(); audio.startAmbient('cave'); };
    window.addEventListener('pointerdown', h);
    window.addEventListener('keydown', h);
    return () => { window.removeEventListener('pointerdown', h); window.removeEventListener('keydown', h); };
  }, [audio]);

  const hover = () => audio.play('uiHover');
  const click = () => audio.play('uiClick');
  const title = 'ECHOBOUND';

  const items: Array<{ label: string; hint?: string; disabled?: boolean; action: () => void }> = [
    { label: 'Nowa gra', action: () => { click(); if (save && !save.completed) setSub('confirmNew'); else onNewGame(); } },
    { label: 'Kontynuuj', hint: save ? save.areaName : 'brak zapisu', disabled: !save, action: () => { click(); onContinue(); } },
    { label: 'Ustawienia', action: () => { click(); setSub('settings'); } },
    { label: 'Sterowanie', action: () => { click(); setSub('controls'); } },
    { label: 'O grze', action: () => { click(); setSub('about'); } },
  ];

  return (
    <div className="fixed inset-0 overflow-hidden select-none">
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="scanlines" />
      <div className="absolute inset-0 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-10 overflow-y-auto scroll-thin min-h-0">
          <div className="title-wrap">
            <div className="title-echo text-[2.6rem] sm:text-[4.2rem] md:text-[5.6rem]" aria-hidden>{title}</div>
            <div className="title-echo two text-[2.6rem] sm:text-[4.2rem] md:text-[5.6rem]" aria-hidden>{title}</div>
            <h1 className="title-main text-[2.6rem] sm:text-[4.2rem] md:text-[5.6rem] leading-none">
              {title.split('').map((ch, i) => (
                <span key={i} className="ltr" style={{ animationDelay: `${0.15 + i * 0.07}s` }}>{ch}</span>
              ))}
            </h1>
          </div>
          <div className="mt-4 flex items-center gap-4 text-cyan-100/70 tracking-[0.45em] uppercase text-xs sm:text-sm" style={{ animation: 'fadeUp 1s ease both', animationDelay: '0.9s' }}>
            <span className="h-px w-10 sm:w-20 bg-gradient-to-r from-transparent to-cyan-300/60" />
            <span>Ślady przeszłości prowadzą naprzód</span>
            <span className="h-px w-10 sm:w-20 bg-gradient-to-l from-transparent to-cyan-300/60" />
          </div>

          <nav className={`mt-10 sm:mt-14 w-full max-w-sm flex flex-col gap-3 transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}>
            {items.map((it, i) => (
              <button
                key={it.label} className="menu-btn" style={{ animationDelay: `${1.1 + i * 0.12}s` }} disabled={it.disabled}
                onMouseEnter={hover} onFocus={hover} onClick={it.action}
              >
                <span className="rune" />
                <span>{it.label}</span>
                {it.hint && <span className="hint">{it.hint}</span>}
              </button>
            ))}
          </nav>

          {save && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs tracking-[0.2em] uppercase text-slate-400" style={{ animation: 'fadeUp 1s ease both', animationDelay: '1.8s' }}>
              <span><span className="text-cyan-200">◆</span> {save.crystals} kryształów</span>
              <span>{Math.min(save.unlocked.length, LEVEL_ORDER.length)}/{LEVEL_ORDER.length} obszarów</span>
              <span>czas {formatTime(save.playtime)}</span>
              {save.completed && <span className="shimmer-text">ukończono</span>}
            </div>
          )}
        </div>
        <footer className="px-6 pb-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] sm:text-xs tracking-[0.25em] uppercase text-slate-500" style={{ animation: 'fadeIn 1.5s ease both', animationDelay: '2s' }}>
          <span>ECHOBOUND · v1.0 · gra przeglądarkowa</span>
          <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cyan-300/70" style={{ animation: 'recBlink 2s infinite' }} />Dźwięk aktywuje się po pierwszym kliknięciu</span>
        </footer>
      </div>

      {sub === 'settings' && <SettingsPanel settings={settings} onChange={onSettings} onClose={() => setSub('none')} onResetSave={() => { onResetSave(); setSub('none'); }} hasSave={!!save} audio={audio} />}
      {sub === 'controls' && <ControlsPanel onClose={() => setSub('none')} />}
      {sub === 'about' && <AboutPanel onClose={() => setSub('none')} />}
      {sub === 'confirmNew' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(2,4,10,0.6)', animation: 'fadeIn .25s ease both' }} onClick={() => setSub('none')}>
          <div className="panel max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="panel-title text-lg mb-3">Nowa wyprawa?</h3>
            <p className="text-slate-300">Istnieje zapis gry ({save?.areaName}, {save?.crystals} kryształów). Rozpoczęcie nowej gry nadpisze go bezpowrotnie.</p>
            <div className="mt-6 flex gap-3 justify-end">
              <button className="btn" onClick={() => { click(); setSub('none'); }}>Anuluj</button>
              <button className="btn btn-danger" onClick={() => { click(); setSub('none'); onNewGame(); }}>Zacznij od nowa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
