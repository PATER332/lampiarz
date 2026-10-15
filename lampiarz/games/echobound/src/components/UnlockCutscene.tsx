import { useEffect, useRef, useState } from 'react';

interface SceneBeat {
  start: number;
  end: number;
  eyebrow: string;
  title: string;
  caption: string;
}

const BEATS: SceneBeat[] = [
  { start: 0.35, end: 2.1, eyebrow: 'KLATKA', title: 'Cień odblaskiwuje w kratach.', caption: 'Zamek pęka. Kraty brzęczą i znikają jedna po drugiej.' },
  { start: 2.35, end: 4.5, eyebrow: 'SZEPT', title: 'Szept wstaje; słyszy Twój oddech.', caption: 'Dlugo słucham podświatów. Podziemia mówią cicho.' },
  { start: 4.75, end: 6.9, eyebrow: 'KOTWICA CIENIA', title: 'Świat odpowiada na Szept.', caption: 'Zostawia swój cień… i wraca do niego, nim drkniesz.' },
  { start: 7.15, end: 9.45, eyebrow: 'DASH', title: 'Błysk składa się w powietrzu.', caption: 'Przez przepaście, przez szczeliny, przez ciepły mrok.' },
  { start: 9.7, end: 11.4, eyebrow: 'WSPINANIE', title: 'Ściany jej nie trzymają.', caption: 'Liże kamień. Nachyla się. I podąża za Tobą.' },
  { start: 11.65, end: 13.2, eyebrow: 'NOWA POSTAĆ', title: 'Szept dołącza.', caption: 'Grasz nią lub wróć do Wędrowca klawiszem C.' },
];

const DURATION = 13.5;

export function UnlockCutscene({ onFinish }: { onFinish: () => void }) {
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
  const reveal = Math.min(1, elapsed / 1.1);

  return (
    <div
      className="unlock-scene fixed inset-0 z-40 overflow-hidden"
      role="dialog"
      aria-label="Scenka odblokowania postaci Szept"
      style={{ background: 'radial-gradient(circle at 50% 40%, rgba(11,5,22,0.92), rgba(2,3,9,0.97))' }}
    >
      <div className="unlock-rays unlock-rays-one" />
      <div className="unlock-rays unlock-rays-two" />
      <div className="unlock-particles" />
      <div className="unlock-vein" />
      <div className="unlock-topline">
        <span className="pixel-text">ECHOBOUND</span>
        <span className="unlock-topline-rule" />
        <span className="pixel-text">UWOLNIENIE · SZEPT</span>
      </div>

      <div className="unlock-copy" key={beat?.title ?? 'silence'}>
        {beat && (
          <>
            <div className="unlock-eyebrow">
              <span>{beat.eyebrow}</span>
              <span className="unlock-eyebrow-rule" />
            </div>
            <h2 className={beat.eyebrow === 'NOWA POSTAĆ' ? 'unlock-title-brand' : 'unlock-title-line'}>{beat.title}</h2>
            <p className="unlock-caption">{beat.caption}</p>
          </>
        )}
      </div>

      <div className="unlock-footer">
        <div className="unlock-progress">
          <span style={{ width: `${progress}%` }} />
        </div>
        <button className="unlock-skip" onClick={() => finishCutsceneRef.current()}>
          POMIŃ SCENĘ
        </button>
        <div className="unlock-key-hint">SPACJA / ENTER · POMIŃ</div>
      </div>

      <div className="unlock-shadow-panel" style={{ opacity: 0.45 + reveal * 0.55 }}>
        <div className="unlock-shadow-figure">
          <div className="unlock-shadow-ear left" />
          <div className="unlock-shadow-ear right" />
          <div className="unlock-shadow-body" />
        </div>
        <div className="unlock-anchor-pulse" />
      </div>
    </div>
  );
}
