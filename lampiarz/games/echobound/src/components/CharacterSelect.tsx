import { useEffect, useRef, useState } from 'react';
import { CHARACTERS, type CharId } from '../game/constants';
import type { Game } from '../game/game';
import { PLAYER_PAL, WEAVER_PAL, drawCharacter, type AnimName } from '../game/sprites';
import { Panel } from './Panels';

const CYCLE: Record<CharId, AnimName[]> = {
  echo: ['idle', 'run', 'jump', 'interact'],
  weaver: ['idle', 'run', 'dash', 'wall'],
};

/** Animated pixel-art portrait that cycles through the character's signature moves. */
export function Portrait({ id, size = 144, locked = false }: { id: CharId; size?: number; locked?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    let raf = 0;
    let t = 0;
    const tick = () => {
      t++;
      ctx.clearRect(0, 0, cv.width, cv.height);
      const names = CYCLE[id];
      const slot = Math.floor(t / 110) % names.length;
      const anim = names[slot];
      // keep the wall pose against a visible wall and the dash pose facing right
      if (anim === 'wall') {
        ctx.fillStyle = '#2a2d44'; ctx.fillRect(36, 2, 6, 40);
        ctx.fillStyle = '#4a4f6e'; ctx.fillRect(36, 2, 1, 40);
      }
      const x = anim === 'run' ? 18 + ((t * 0.5) % 6) : anim === 'wall' ? 29 : 24;
      drawCharacter(ctx, x, 40, 1, anim, t % 110, id === 'weaver' ? WEAVER_PAL : PLAYER_PAL, id === 'weaver' ? 'weaver' : 'hero');
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id]);

  return (
    <canvas
      ref={ref}
      width={48}
      height={44}
      style={{
        width: size,
        height: (size * 44) / 48,
        imageRendering: 'pixelated',
        filter: locked ? 'brightness(0) opacity(0.55)' : undefined,
      }}
    />
  );
}

export function CharacterSelect({ game, onClose }: { game: Game; onClose: () => void }) {
  const [, force] = useState(0);
  const ids = Object.keys(CHARACTERS) as CharId[];
  const select = (id: CharId) => {
    game.audio.play('uiClick');
    if (game.swapCharacter(id)) force((x) => x + 1);
  };

  return (
    <Panel title="Postacie" onClose={onClose} wide>
      <div className="grid md:grid-cols-2 gap-4">
        {ids.map((id, i) => {
          const def = CHARACTERS[id];
          const unlocked = game.hasCharacter(id);
          const active = game.save.character === id;
          const canPick = unlocked && !active && game.canSwap();
          return (
            <div
              key={id}
              className={`relative border p-4 flex flex-col gap-3 ${active ? 'border-cyan-300/70 bg-cyan-400/10' : 'border-cyan-300/15 bg-slate-950/40'}`}
              style={{ animation: 'fadeUp .45s ease both', animationDelay: `${i * 90}ms` }}
            >
              {active && <div className="absolute right-3 top-3 font-pixel text-[8px] text-cyan-200">AKTYWNA</div>}
              <div className="flex items-center gap-4">
                <div className="flex-none border border-cyan-300/15 bg-black/30 p-1">
                  <Portrait id={id} size={120} locked={!unlocked} />
                </div>
                <div className="min-w-0">
                  <div className="font-title text-xl tracking-[0.18em] uppercase text-white">{unlocked ? def.name : '???'}</div>
                  <div className="text-xs tracking-[0.3em] uppercase text-slate-400">{unlocked ? def.title : 'Zablokowana'}</div>
                  <p className="mt-2 text-sm text-slate-300 leading-snug">{unlocked ? def.tagline : def.hint}</p>
                </div>
              </div>
              {unlocked && (
                <ul className="space-y-1.5">
                  {def.abilities.map((a) => (
                    <li key={a.name} className="flex gap-2 text-sm leading-snug">
                      <span className="kbd flex-none self-start" style={{ minWidth: 34 }}>{a.key}</span>
                      <span className="text-slate-300"><b className="text-cyan-100">{a.name}.</b> {a.desc}</span>
                    </li>
                  ))}
                </ul>
              )}
              {unlocked && (
                <button className={`btn mt-auto ${canPick ? 'btn-primary' : ''}`} disabled={!canPick} onClick={() => select(id)}>
                  {active ? 'Wybrana' : game.recording ? 'Najpierw zakończ nagranie' : 'Zagraj tą postacią'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-slate-500 tracking-wide">Postacie możesz też zmieniać w trakcie gry klawiszem C. Ulepszenia i kryształy są wspólne, rany — również.</p>
    </Panel>
  );
}
