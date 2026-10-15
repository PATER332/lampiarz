import { useEffect, useRef, useState } from 'react';

interface SceneBeat {
  start: number;
  end: number;
  eyebrow: string;
  title: string;
  caption: string;
}

const BEATS: SceneBeat[] = [
  { start: 0.55, end: 2.35, eyebrow: 'DALEKO OD ŚWIATŁA', title: 'W głębinach milknie czas.', caption: 'A ciemność zachowuje wszystko, co w niej pozostawiono.' },
  { start: 2.55, end: 4.5, eyebrow: 'KAMIENIE PAMIĘTAJĄ', title: 'Każdy krok. Każdy powrót.', caption: 'Świat przechowuje ślady tych, którzy przez niego przeszli.' },
  { start: 4.7, end: 6.65, eyebrow: 'ALE TY...', title: 'Pamiętasz tylko ciszę.', caption: 'Budzisz się bez imienia. Bez drogi powrotnej.' },
  { start: 6.85, end: 9.1, eyebrow: 'A W MROKU...', title: 'Odpowiada Twoje echo.', caption: 'Powtórz swój ślad. Zmień to, co wydawało się nieuniknione.' },
  { start: 9.4, end: 12.25, eyebrow: 'ROZDZIAŁ I · PRZEBUDZENIE', title: 'ECHOBOUND', caption: 'Nagraj swój ślad. Otwórz drogę naprzód.' },
];

const DURATION = 12.5;

export function IntroCutscene({ onFinish }: { onFinish: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const finishRef = useRef(onFinish);
  const finishCutsceneRef = useRef<() => void>(() => undefined);
  const finishedRef = useRef(false);
  finishRef.current = onFinish;

  useEffect(() => {
    const started = performance.now();
    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      finishRef.current();
    };
    finishCutsceneRef.current = finish;
    const timer = window.setInterval(() => {
      const next = (performance.now() - started) / 1000;
      setElapsed(Math.min(DURATION, next));
      if (next >= DURATION) {
        window.clearInterval(timer);
        finish();
      }
    }, 50);
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Tab' || event.code.startsWith('Shift') || event.code.startsWith('Control') || event.code.startsWith('Alt')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKey, true);
      finishCutsceneRef.current = () => undefined;
    };
  }, []);

  const beat = BEATS.find((item) => elapsed >= item.start && elapsed < item.end);
  const progress = Math.min(100, (elapsed / DURATION) * 100);
  const reveal = Math.min(1, elapsed / 1.4);

  return (
    <div className="intro-scene fixed inset-0 z-30 overflow-hidden" role="dialog" aria-label="Scenka wprowadzająca">
      <div className="intro-darkness" style={{ opacity: 0.88 - reveal * 0.38 }} />
      <div className="intro-vignette" />
      <div className="intro-light intro-light-one" />
      <div className="intro-light intro-light-two" />
      <div className="intro-scan" />

      <div className="intro-bar intro-bar-top" />
      <div className="intro-bar intro-bar-bottom" />

      <div className="intro-topline">
        <span>ECHOBOUND</span>
        <span className="intro-topline-rule" />
        <span>PROLOG</span>
      </div>

      <div className={`intro-copy ${beat ? 'intro-copy-visible' : ''}`} key={beat?.title ?? 'silence'}>
        {beat && (
          <>
            <div className="intro-eyebrow"><span />{beat.eyebrow}<span /></div>
            <h2 className={beat.title === 'ECHOBOUND' ? 'intro-title-brand' : 'intro-title-line'}>{beat.title}</h2>
            <p>{beat.caption}</p>
          </>
        )}
      </div>

      <div className="intro-footer">
        <div className="intro-progress"><span style={{ width: `${progress}%` }} /></div>
        <button className="intro-skip" onClick={() => finishCutsceneRef.current()}>
          POMIŃ SCENĘ <span>↗</span>
        </button>
        <div className="intro-key-hint">SPACJA / ENTER · POMIŃ</div>
      </div>
    </div>
  );
}