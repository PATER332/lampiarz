// Game launcher. Games are separate builds served from the same origin
// (/g/<slug>/). They run in a same-origin frame so their global styles cannot
// leak into the platform, while their saves (localStorage), keyboard controls
// and fullscreen keep working exactly as in the standalone build.
import { useCallback, useEffect, useRef, useState } from 'react';
import { findGame } from './catalog';
import { FavButton, IArrow, IExpand, IReload, LogoMark } from './components';
import { Link, useMeta } from './router';
import { markPlayed } from './store';
import { NotFound } from './pages';

type State = 'loading' | 'ready' | 'error';
const LOAD_TIMEOUT = 15000;

export function Player({ slug }: { slug: string }) {
  const game = findGame(slug);
  useMeta(game ? `Grasz: ${game.title} — EVGAMES` : 'Nie znaleziono — EVGAMES', game?.description ?? '', game?.cover);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [isFs, setIsFs] = useState(false);
  const [noTouchNote, setNoTouchNote] = useState(() => {
    try {
      return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    } catch {
      return false;
    }
  });
  const canFs = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

  useEffect(() => {
    if (game && game.status === 'published') markPlayed(game.slug);
  }, [game]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  const loadedAt = useRef(0);

  // load watchdog: the game counts as started once its root element has rendered
  useEffect(() => {
    setState('loading');
    loadedAt.current = 0;
    const started = Date.now();
    let timer = 0;
    const check = () => {
      const frame = frameRef.current;
      let doc: Document | null = null;
      try {
        doc = frame?.contentDocument ?? null;
      } catch {
        doc = null;
      }
      if (doc && doc.readyState !== 'loading') {
        if (doc.getElementById('evgames-root')) {
          setError('Pliki gry nie zostały znalezione na serwerze.');
          setState('error');
          return;
        }
        const root = doc.getElementById('root');
        if (root && root.childElementCount > 0) {
          setState('ready');
          window.setTimeout(() => frame?.contentWindow?.focus(), 50);
          return;
        }
        if (/404|not[ _]found/i.test(doc.title) || doc.body?.textContent?.trim() === '404') {
          setError('Pliki gry nie zostały znalezione na serwerze (404).');
          setState('error');
          return;
        }
      }
      // the frame finished loading but the game never rendered (e.g. a server error page)
      if (loadedAt.current && Date.now() - loadedAt.current > 5000) {
        setError('Strona gry załadowała się, ale gra nie wystartowała. Plik gry może być niedostępny.');
        setState('error');
        return;
      }
      if (Date.now() - started > LOAD_TIMEOUT) {
        setError('Gra ładuje się zbyt długo. Sprawdź połączenie z internetem i spróbuj ponownie.');
        setState('error');
        return;
      }
      timer = window.setTimeout(check, 150);
    };
    timer = window.setTimeout(check, 150);
    return () => window.clearTimeout(timer);
  }, [attempt, slug]);

  const toggleFs = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else
      void el
        .requestFullscreen()
        .then(() => frameRef.current?.contentWindow?.focus())
        .catch(() => undefined);
  }, []);

  if (!game) return <NotFound />;
  if (game.status !== 'published') return <NotFound />;

  return (
    <div className="player">
      <div className="bar">
        <Link to={`/games/${game.slug}`} className="btn sm ghost" aria-label="Wróć do strony gry">
          <IArrow left size={16} />
          <span className="hide-sm">Wróć</span>
        </Link>
        <span className="sep hide-sm" aria-hidden="true" />
        <div className="title">
          <Link to="/" aria-label="EVGAMES — strona główna" style={{ display: 'inline-flex' }}>
            <LogoMark size={26} />
          </Link>
          <b>{game.title}</b>
        </div>
        <Link to="/games" className="btn sm ghost hide-sm">
          Biblioteka
        </Link>
        <FavButton slug={game.slug} title={game.title} small />
        <button className="btn sm icon" onClick={() => setAttempt((a) => a + 1)} aria-label="Uruchom grę ponownie" title="Przeładuj grę (postęp jest zapisany)">
          <IReload size={17} />
        </button>
        {canFs && game.fullscreen !== false ? (
          <button className="btn sm icon" onClick={toggleFs} aria-label={isFs ? 'Wyjdź z pełnego ekranu' : 'Pełny ekran'} aria-pressed={isFs} title="Pełny ekran">
            <IExpand size={17} />
          </button>
        ) : null}
      </div>
      <div className="stage" ref={stageRef}>
        <iframe
          key={attempt}
          ref={frameRef}
          src={game.entry}
          title={`${game.title} — gra`}
          allow="fullscreen; autoplay"
          allowFullScreen
          onLoad={() => {
            loadedAt.current = Date.now();
            frameRef.current?.contentWindow?.focus();
          }}
        />
        {noTouchNote && game.mobile === false ? (
          <div role="note" style={{ position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 3, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(10,10,14,0.92)', border: '1px solid var(--line, #333)', borderRadius: 10, fontSize: 14 }}>
            <span>{game.title} wymaga klawiatury i myszy albo pada. Na ekranie dotykowym nie da się w nią grać.</span>
            <button className="btn sm" onClick={() => setNoTouchNote(false)}>
              Rozumiem
            </button>
          </div>
        ) : null}
        {state !== 'ready' ? (
          <div className="state" role={state === 'error' ? 'alert' : 'status'}>
            {state === 'loading' ? (
              <div className="box">
                <div className="loader" aria-hidden="true" />
                <span className="label">Ładowanie: {game.title}</span>
              </div>
            ) : (
              <div className="box">
                <span className="label" style={{ color: 'var(--danger)' }}>
                  Błąd uruchamiania
                </span>
                <h2 style={{ fontSize: 34 }}>Gra nie wystartowała</h2>
                <p style={{ color: 'var(--muted)', margin: 0 }}>{error}</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button className="btn primary" onClick={() => setAttempt((a) => a + 1)}>
                    <IReload size={16} /> Spróbuj ponownie
                  </button>
                  <Link to="/games" className="btn">
                    Wróć do biblioteki
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
