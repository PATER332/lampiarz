import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Action, Input } from '../game/input';

function TBtn({ input, action, label, className = '', big }: { input: Input; action: Action; label: string; className?: string; big?: boolean }) {
  const down = (e: ReactPointerEvent) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); input.setVirtual(action, true); };
  const up = (e: ReactPointerEvent) => { e.preventDefault(); input.setVirtual(action, false); };
  return (
    <button
      className={`touch-btn ${big ? 'w-20! h-20! text-sm!' : ''} ${className}`}
      onPointerDown={down} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
    >
      {label}
    </button>
  );
}

export function TouchControls({ input, onPause, weaver, canSwap }: { input: Input; onPause: () => void; weaver: boolean; canSwap: boolean }) {
  return (
    <div className="fixed inset-0 pointer-events-none select-none" style={{ zIndex: 25 }}>
      <div className="absolute left-4 bottom-5 flex gap-3 pointer-events-auto">
        <TBtn input={input} action="left" label="◀" big />
        <TBtn input={input} action="right" label="▶" big />
      </div>
      <div className="absolute right-4 bottom-5 flex flex-col items-end gap-3 pointer-events-auto">
        <div className="flex gap-3">
          <TBtn input={input} action="clear" label="R" />
          {canSwap && <TBtn input={input} action="swap" label="C" className="border-amber-300/70!" />}
          <TBtn input={input} action="echo" label="Q" className={weaver ? 'border-violet-300/70!' : 'border-rose-300/60!'} />
        </div>
        <div className="flex gap-3">
          <TBtn input={input} action="interact" label="E" />
          {weaver && <TBtn input={input} action="dash" label="DASH" className="border-amber-300/80! text-[9px]!" />}
          <TBtn input={input} action="jump" label="SKOK" big className="border-cyan-300/80!" />
        </div>
      </div>
      <button className="absolute right-4 top-14 touch-btn w-11! h-11! text-[10px]! pointer-events-auto" onPointerDown={(e) => { e.preventDefault(); onPause(); }} aria-label="Pauza">II</button>
    </div>
  );
}
