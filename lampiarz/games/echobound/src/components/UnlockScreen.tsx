import { useEffect } from 'react';
import { CHARACTERS, type CharId } from '../game/constants';
import { Portrait } from './CharacterSelect';

export function UnlockScreen({ char, onContinue, onPlay }: { char: CharId; onContinue: () => void; onPlay: () => void }) {
  const def = CHARACTERS[char];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') {
        e.preventDefault();
        onContinue();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onContinue]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'radial-gradient(ellipse at center, rgba(40,20,50,0.55), rgba(2,4,10,0.82))', backdropFilter: 'blur(3px)', animation: 'fadeIn .35s ease both' }}
    >
      <div className="panel w-full max-w-2xl p-6 sm:p-8 m-auto">
        <div className="text-center">
          <div className="font-pixel text-[9px] text-amber-300/90 tracking-widest" style={{ animation: 'recBlink 2.4s infinite' }}>NOWA POSTAĆ ODBLOKOWANA</div>
          <h2 className="font-title text-3xl sm:text-5xl tracking-[0.25em] uppercase mt-3 shimmer-text">{def.name}</h2>
          <div className="mt-1 text-xs tracking-[0.4em] uppercase text-slate-400">{def.title}</div>
          <div className="divider mt-4" />
        </div>

        <div className="mt-5 flex flex-col sm:flex-row gap-6 items-center">
          <div className="flex-none border border-amber-200/20 bg-black/30 p-2" style={{ boxShadow: '0 0 40px rgba(255,179,71,0.18)' }}>
            <Portrait id={char} size={176} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-300 leading-snug mb-3">{def.tagline}</p>
            <ul className="space-y-2">
              {def.abilities.map((a, i) => (
                <li key={a.name} className="flex gap-2 text-sm leading-snug" style={{ animation: 'fadeUp .4s ease both', animationDelay: `${0.25 + i * 0.1}s` }}>
                  <span className="kbd flex-none self-start" style={{ minWidth: 34 }}>{a.key}</span>
                  <span className="text-slate-300"><b className="text-amber-100">{a.name}.</b> {a.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
          <button className="btn btn-primary" onClick={onPlay}>Zagraj teraz tą postacią</button>
          <button className="btn" onClick={onContinue}>Kontynuuj <span className="ml-1 opacity-60 text-xs">[Spacja]</span></button>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500 tracking-wide">W każdej chwili zmienisz postać klawiszem <span className="kbd">C</span> lub w menu pauzy.</p>
      </div>
    </div>
  );
}
