import { useEffect, useRef } from 'react';
import { audio } from '../audio/audio';
import { CLASSES } from '../game/content';
import type { Profile } from '../game/meta';
import type { Run } from '../game/types';
import { MenuScene } from '../render/scene';

export interface MainMenuProps {
  profile: Profile;
  savedRun: Run | null;
  dailyScore: number | null;
  onContinue: () => void;
  onNew: () => void;
  onDaily: () => void;
  onBook: () => void;
  onHowTo: () => void;
  onSettings: () => void;
}

export function MainMenu(p: MainMenuProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvasRef.current!;
    const c = cv.getContext('2d')!;
    const scene = new MenuScene();
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      scene.mouseX = e.clientX / window.innerWidth - 0.5;
      scene.mouseY = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener('pointermove', onMove);
    const loop = (now: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene.draw(c, w, h, now, p.profile.settings.reducedMotion);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, [p.profile.settings.reducedMotion]);

  const s = p.profile.stats;
  const click = (fn: () => void) => () => {
    audio.unlock();
    audio.play('click');
    fn();
  };
  const sr = p.savedRun;

  return (
    <div className="menu">
      <canvas ref={canvasRef} />
      <div className="menu-content">
        <h1 className="title">
          LAMPIA<span className="glow">R</span>Z
        </h1>
        <p className="subtitle">Ostatni latarnik miasta. Każdy płomień to schronienie — i każda kropla oleju to wybór.</p>
        <nav className="menu-list" aria-label="Menu główne">
          {sr ? (
            <button className="menu-item" onClick={click(p.onContinue)} onMouseEnter={() => audio.play('hover')}>
              Kontynuuj noc
              <small>
                {CLASSES[sr.cls].name}, dzielnica {sr.depth}/6
              </small>
            </button>
          ) : null}
          <button className="menu-item" onClick={click(p.onNew)} onMouseEnter={() => audio.play('hover')}>
            Nowa noc
          </button>
          <button className="menu-item" onClick={click(p.onDaily)} onMouseEnter={() => audio.play('hover')}>
            Noc dnia
            <small>{p.dailyScore !== null ? `twój wynik: ${p.dailyScore}` : 'to samo miasto dla wszystkich'}</small>
          </button>
          <button className="menu-item" onClick={click(p.onBook)} onMouseEnter={() => audio.play('hover')}>
            Księga lampiarza
          </button>
          <button className="menu-item" onClick={click(p.onHowTo)} onMouseEnter={() => audio.play('hover')}>
            Jak grać
          </button>
          <button className="menu-item" onClick={click(p.onSettings)} onMouseEnter={() => audio.play('hover')}>
            Ustawienia
          </button>
        </nav>
      </div>
      <div className="menu-footer">
        <div className="menu-stats">
          {s.runs > 0 ? (
            <>
              <span>
                Noce: <b>{s.runs}</b>
              </span>
              <span>
                Świty: <b>{s.wins}</b>
              </span>
              <span>
                Rekord: <b>{s.bestScore}</b>
              </span>
            </>
          ) : (
            <span>Pierwsza noc czeka.</span>
          )}
        </div>
        <span>v1.0</span>
      </div>
    </div>
  );
}
