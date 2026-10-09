import { useEffect, useRef, useState, type ReactNode } from 'react';
import { categoryName, type Game } from './catalog';
import { Link, navigate, useLocation } from './router';
import { toggleFavorite, useStore } from './store';

// ------------------------------------------------------------------ icons (24px grid, monoline)
type IP = { size?: number; className?: string };
const S = ({ size = 18, className, children, fill }: IP & { children: ReactNode; fill?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
export const IPlay = (p: IP) => (
  <S {...p} fill>
    <path d="M7 4.8v14.4a1 1 0 0 0 1.5.9l11.3-7.2a1 1 0 0 0 0-1.7L8.5 3.9A1 1 0 0 0 7 4.8z" />
  </S>
);
export const ISearch = (p: IP) => (
  <S {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </S>
);
export const IHeart = (p: IP) => (
  <S {...p}>
    <path d="M12 20s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />
  </S>
);
export const IArrow = (p: IP & { left?: boolean }) => (
  <S {...p}>
    {p.left ? <path d="M19 12H5M11 6l-6 6 6 6" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
  </S>
);
export const IMenu = (p: IP & { open?: boolean }) => <S {...p}>{p.open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</S>;
export const IExpand = (p: IP) => (
  <S {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </S>
);
export const IReload = (p: IP) => (
  <S {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" />
  </S>
);
export const IClose = (p: IP) => (
  <S {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </S>
);
export const IGrid = (p: IP) => (
  <S {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </S>
);
export const IDevice = (p: IP) => (
  <S {...p}>
    <rect x="3" y="5" width="13" height="10" rx="1.5" />
    <rect x="17" y="8" width="4" height="11" rx="1" />
    <path d="M6.5 19h6" />
  </S>
);
export const ISave = (p: IP) => (
  <S {...p}>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v5h7V4M8 20v-6h8v6" />
  </S>
);
export const IShuffle = (p: IP) => (
  <S {...p}>
    <path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.4 0 2.4-1.2 3.3-2.7M16.5 7H20M13.4 9.6C14.2 8.1 15.1 7 16.5 7M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5" />
  </S>
);

// ------------------------------------------------------------------ logo
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1b1e26" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="6.5" fill="none" stroke="#343a49" />
      <path d="M7 8h9v3H10v3.5h5.5v3H10V21h6v3H7z" fill="#ecebf3" />
      <path d="M17.2 8h3.3l2.6 10.2L25.7 8H29l-4.4 16h-3z" fill="#8b7dff" />
    </svg>
  );
}

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="EVGAMES — strona główna">
      <LogoMark />
      <span className="word">
        <b>EV</b>GAMES
      </span>
    </Link>
  );
}

// ------------------------------------------------------------------ header
const NAV: { to: string; label: string; match: string[] }[] = [
  { to: '/games', label: 'Gry', match: ['library', 'game'] },
  { to: '/discover', label: 'Odkrywaj', match: ['discover'] },
  { to: '/new', label: 'Ostatnio dodane', match: ['new'] },
  { to: '/favorites', label: 'Ulubione', match: ['favorites'] },
];

function SearchBox({ id, onDone }: { id: string; onDone?: () => void }) {
  const { route, search } = useLocation();
  const [q, setQ] = useState(route.name === 'library' ? search.get('q') ?? '' : '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (route.name === 'library') setQ(search.get('q') ?? '');
  }, [route.name, search]);
  useEffect(() => {
    if (id !== 'search-desktop') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !(t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);
  const submit = (value: string, replace = false) => {
    const params = new URLSearchParams(route.name === 'library' ? search : undefined);
    if (value.trim()) params.set('q', value.trim());
    else params.delete('q');
    const qs = params.toString();
    navigate(`/games${qs ? '?' + qs : ''}`, { replace: replace && route.name === 'library', keepScroll: route.name === 'library' });
  };
  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit(q);
        onDone?.();
        if (id !== 'search-desktop') ref.current?.blur();
        document.getElementById('library-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
    >
      <label htmlFor={id} className="sr-only">
        Szukaj gier
      </label>
      <span className="ico">
        <ISearch size={17} />
      </span>
      <input
        ref={ref}
        id={id}
        type="search"
        placeholder="Szukaj gier"
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (route.name === 'library') submit(e.target.value, true);
        }}
      />
      {id === 'search-desktop' ? <kbd aria-hidden="true">/</kbd> : null}
    </form>
  );
}

export function Header() {
  const { route } = useLocation();
  const { favorites } = useStore();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route.name, route.name === 'game' ? route.slug : '']);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);
  const current = (m: string[]) => (m.includes(route.name) ? 'page' : undefined);
  return (
    <header className="header">
      <div className="wrap bar">
        <Brand />
        <nav className="nav" aria-label="Główna nawigacja">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} aria-current={current(n.match)}>
              {n.label}
              {n.to === '/favorites' && favorites.length ? <span className="badge">{favorites.length}</span> : null}
            </Link>
          ))}
        </nav>
        <SearchBox id="search-desktop" />
        <button className="btn ghost icon menu-btn" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? 'Zamknij menu' : 'Otwórz menu'} onClick={() => setOpen((o) => !o)}>
          <IMenu open={open} size={22} />
        </button>
      </div>
      <div id="mobile-nav" className={`mobile-nav ${open ? 'open' : ''}`} aria-hidden={!open}>
        <SearchBox id="search-mobile" onDone={() => setOpen(false)} />
        <nav aria-label="Menu mobilne">
          {[{ to: '/', label: 'Start', match: ['home'] }, ...NAV].map((n) => (
            <Link key={n.to} to={n.to} className="m" aria-current={current(n.match)} tabIndex={open ? 0 : -1}>
              {n.label}
              <IArrow size={22} />
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ footer
export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap grid">
        <div>
          <Brand />
          <p>Platforma gier przeglądarkowych. Bez instalacji, bez kont — wybierasz grę i grasz od razu. Postęp zostaje w twojej przeglądarce.</p>
        </div>
        <div>
          <h4 className="label muted">Platforma</h4>
          <ul>
            <li>
              <Link to="/">Strona główna</Link>
            </li>
            <li>
              <Link to="/games">Biblioteka gier</Link>
            </li>
            <li>
              <Link to="/discover">Odkrywaj</Link>
            </li>
            <li>
              <Link to="/new">Ostatnio dodane</Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="label muted">Ty</h4>
          <ul>
            <li>
              <Link to="/favorites">Ulubione i historia</Link>
            </li>
            <li>
              <Link to="/privacy">Prywatność</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="wrap base">
        <span>© {new Date().getFullYear()} EVGAMES. Wszystkie prawa zastrzeżone.</span>
        <span>Wersja 1.0</span>
      </div>
    </footer>
  );
}

// ------------------------------------------------------------------ favourites
export function FavButton({ slug, title, small }: { slug: string; title: string; small?: boolean }) {
  const { favorites } = useStore();
  const on = favorites.includes(slug);
  const [pop, setPop] = useState(false);
  return (
    <button
      type="button"
      className={`btn ${small ? 'sm icon' : ''} fav-btn ${pop ? 'pop' : ''}`}
      aria-pressed={on}
      aria-label={on ? `Usuń ${title} z ulubionych` : `Dodaj ${title} do ulubionych`}
      title={on ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
      onClick={(e) => {
        e.stopPropagation();
        const now = toggleFavorite(slug);
        setPop(now);
        if (now) window.setTimeout(() => setPop(false), 400);
        showToast(now ? `${title}: dodano do ulubionych` : `${title}: usunięto z ulubionych`);
      }}
    >
      <IHeart size={small ? 17 : 18} />
      {small ? null : on ? 'W ulubionych' : 'Ulubione'}
    </button>
  );
}

// ------------------------------------------------------------------ toast
let toastListener: ((t: string) => void) | null = null;
export function showToast(text: string) {
  toastListener?.(text);
}
export function ToastHost() {
  const [t, setT] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => {
    toastListener = (text) => setT({ text, id: Date.now() });
    return () => {
      toastListener = null;
    };
  }, []);
  useEffect(() => {
    if (!t) return;
    const h = window.setTimeout(() => setT(null), 2500);
    return () => window.clearTimeout(h);
  }, [t]);
  return (
    <div aria-live="polite" className="sr-live">
      {t ? (
        <div key={t.id} className="toast" role="status">
          {t.text}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ game card
export function GameCard({ game, priority }: { game: Game; priority?: boolean }) {
  return (
    <article className="card">
      <div className="thumb">
        <img src={game.thumbnail} alt="" loading={priority ? 'eager' : 'lazy'} width={640} height={360} />
        <div className="play-overlay" aria-hidden="true">
          <span>
            <IPlay size={16} /> Szczegóły
          </span>
        </div>
      </div>
      <div className="info">
        <div className="top">
          <span className="label">{categoryName(game.category)}</span>
          {game.mode ? <span className="label muted">{game.mode.split('·')[1]?.trim() ?? game.mode}</span> : null}
        </div>
        <h3>
          <Link to={`/games/${game.slug}`}>{game.title}</Link>
        </h3>
        <p>{game.tagline}</p>
      </div>
      <div className="foot">
        <Link to={`/play/${game.slug}`} className="btn primary sm" aria-label={`Zagraj w ${game.title}`}>
          <IPlay size={14} /> Zagraj
        </Link>
        <FavButton slug={game.slug} title={game.title} small />
      </div>
    </article>
  );
}

export function SoonCard() {
  return (
    <article className="card soon" aria-label="Miejsce na kolejną grę — wkrótce">
      <div className="thumb">
        <span className="label">Slot 02 · wkrótce</span>
      </div>
      <div className="info">
        <div className="top">
          <span className="pill dim">Wkrótce</span>
        </div>
        <h3 style={{ color: 'var(--faint)' }}>Kolejny tytuł</h3>
        <p>Następna gra jest w przygotowaniu. Pojawi się tutaj, gdy będzie gotowa do grania.</p>
      </div>
    </article>
  );
}

export function MiniGame({ game, sub }: { game: Game; sub: string }) {
  return (
    <Link to={`/games/${game.slug}`} className="mini">
      <img src={game.thumbnail} alt="" loading="lazy" width={112} height={63} />
      <div>
        <div className="t">{game.title}</div>
        <div className="s">{sub}</div>
      </div>
    </Link>
  );
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'przed chwilą';
  if (s < 3600) return `${Math.floor(s / 60)} min temu`;
  if (s < 86400) return `${Math.floor(s / 3600)} godz. temu`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'wczoraj';
  if (d < 30) return `${d} dni temu`;
  return new Date(ts).toLocaleDateString('pl-PL');
}

export function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}
