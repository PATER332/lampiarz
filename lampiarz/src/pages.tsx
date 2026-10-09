import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  CATEGORIES,
  categoryCounts,
  categoryName,
  featuredGame,
  findGame,
  GAMES,
  gameCategories,
  publishedGames,
  searchGames,
  SORT_THRESHOLD,
  type CategoryId,
  type Game,
  type SortKey,
} from './catalog';
import { FavButton, formatDate, GameCard, IArrow, IClose, IDevice, IGrid, IPlay, ISave, IShuffle, MiniGame, SoonCard, timeAgo } from './components';
import { Link, navigate, useLocation, useMeta } from './router';
import { clearRecent, storageWorks, useStore } from './store';

const SITE_DESC = 'EVGAMES — gry przeglądarkowe bez instalacji i bez kont. Wybierz tytuł i graj od razu na komputerze lub telefonie.';

// ------------------------------------------------------------------ shared blocks
function HudShot({ game, label, tilt }: { game: Game; label: string; tilt?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: RPointerEvent) => {
    if (!tilt || e.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = ref.current!.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    ref.current!.style.transform = `perspective(1100px) rotateY(${x * 6}deg) rotateX(${-y * 5}deg)`;
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = '';
  };
  return (
    <div ref={ref} className="hud tilt" onPointerMove={onMove} onPointerLeave={reset}>
      <div className="screen">
        <img src={game.screenshots?.[0]?.src ?? game.cover} alt={game.screenshots?.[0]?.alt ?? game.title} width={1600} height={1000} fetchPriority="high" />
      </div>
      <div className="strip">
        <span className="label">{label}</span>
        <span className="label muted live">
          <i aria-hidden="true" /> gotowa do gry
        </span>
      </div>
    </div>
  );
}

function RecentAndFavorites({ compact }: { compact?: boolean }) {
  const { recent, favorites } = useStore();
  const recentGames = recent.map((r) => ({ game: findGame(r.slug), at: r.at })).filter((r): r is { game: Game; at: number } => !!r.game);
  const favGames = favorites.map(findGame).filter((g): g is Game => !!g);
  if (compact && !recentGames.length && !favGames.length) return null;
  return (
    <>
      {recentGames.length || !compact ? (
        <section className="section" aria-labelledby="recent-title">
          <div className="wrap">
            <div className="sec-head">
              <div>
                <span className="label">Historia</span>
                <h2 id="recent-title">Ostatnio grane</h2>
              </div>
              {recentGames.length ? (
                <button className="btn ghost sm" onClick={clearRecent}>
                  Wyczyść historię
                </button>
              ) : null}
            </div>
            {recentGames.length ? (
              <div className="rail">
                {recentGames.map((r) => (
                  <MiniGame key={r.game.slug} game={r.game} sub={`Grano ${timeAgo(r.at)}`} />
                ))}
              </div>
            ) : (
              <div className="empty">
                <div className="glyph">--:--</div>
                <h3>Jeszcze nic tu nie ma</h3>
                <p>Gry, które uruchomisz, pojawią się tutaj, żebyś mógł szybko do nich wrócić.</p>
                <Link to="/games" className="btn">
                  Przeglądaj gry
                </Link>
              </div>
            )}
          </div>
        </section>
      ) : null}
      {favGames.length || !compact ? (
        <section className="section" aria-labelledby="fav-title">
          <div className="wrap">
            <div className="sec-head">
              <div>
                <span className="label">Twoja półka</span>
                <h2 id="fav-title">Ulubione</h2>
              </div>
            </div>
            {favGames.length ? (
              <div className="cards">
                {favGames.map((g) => (
                  <GameCard key={g.slug} game={g} />
                ))}
              </div>
            ) : (
              <div className="empty">
                <div className="glyph">♡</div>
                <h3>Brak ulubionych</h3>
                <p>Kliknij serce na karcie gry, aby dodać ją do ulubionych. Lista zostaje w tej przeglądarce.</p>
                <Link to="/games" className="btn">
                  Przeglądaj gry
                </Link>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ home
export function Home() {
  const feat = featuredGame();
  useMeta('EVGAMES — Browser Games', SITE_DESC, feat?.cover);
  const games = publishedGames();
  return (
    <div className="page">
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap grid">
          <div className="copy">
            <span className="label">Gry przeglądarkowe · bez instalacji</span>
            <h1 id="hero-title" className="wordmark">
              <span className="ev">EV</span>GAMES
              <span className="cursor" aria-hidden="true" />
            </h1>
            <p className="tagline">Play beyond limits.</p>
            <p className="lead">
              Platforma gier, które uruchamiasz jednym kliknięciem. Bez kont i pobierania — postęp zapisuje się w twojej przeglądarce, a każdy tytuł działa od razu na komputerze.
            </p>
            <div className="actions">
              {feat ? (
                <Link to={`/play/${feat.slug}`} className="btn primary">
                  <IPlay size={16} /> Graj teraz
                </Link>
              ) : null}
              <Link to="/games" className="btn">
                Odkryj gry <IArrow size={16} />
              </Link>
            </div>
            <div className="meta">
              <span>
                <IGrid size={16} /> {games.length} {games.length === 1 ? 'gra' : 'gry'} w bibliotece
              </span>
              <span>
                <IDevice size={16} /> klawiatura, mysz, pad i dotyk
              </span>
              <span>
                <ISave size={16} /> zapis lokalny
              </span>
            </div>
          </div>
          {feat ? <HudShot game={feat} label={`Teraz: ${feat.title}`} tilt /> : null}
        </div>
      </section>

      {feat ? (
        <section className="section" aria-labelledby="feat-title">
          <div className="wrap">
            <div className="sec-head">
              <div>
                <span className="label">Polecana gra</span>
                <h2>Na pierwszym planie</h2>
              </div>
            </div>
            <article className="featured">
              <Link to={`/games/${feat.slug}`} className="media" aria-label={`${feat.title} — szczegóły gry`}>
                <img src={feat.cover} alt={`${feat.title} — okładka`} loading="lazy" width={1600} height={900} />
                <span className="pill">Polecana</span>
              </Link>
              <div className="body">
                <span className="label">
                  {gameCategories(feat)
                    .map(categoryName)
                    .join(' · ')}
                </span>
                <h3 id="feat-title">{feat.title}</h3>
                <p className="lead" style={{ margin: 0 }}>
                  {feat.description}
                </p>
                {feat.facts ? (
                  <dl className="facts">
                    {feat.facts.slice(0, 4).map((f) => (
                      <div key={f.label}>
                        <dt>{f.label}</dt>
                        <dd>{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                <div className="row">
                  <Link to={`/play/${feat.slug}`} className="btn primary">
                    <IPlay size={16} /> Zagraj teraz
                  </Link>
                  <Link to={`/games/${feat.slug}`} className="btn">
                    Szczegóły
                  </Link>
                  <FavButton slug={feat.slug} title={feat.title} small />
                </div>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      <RecentAndFavorites compact />

      <section className="section" id="biblioteka" aria-labelledby="lib-title">
        <div className="wrap">
          <LibraryBlock headingId="lib-title" heading="Wszystkie gry" eyebrow="Biblioteka" syncUrl={false} />
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ library (shared by home and /games)
function LibraryBlock({ headingId, heading, eyebrow, syncUrl, h1 }: { headingId: string; heading: string; eyebrow: string; syncUrl: boolean; h1?: boolean }) {
  const { search } = useLocation();
  const counts = useMemo(categoryCounts, []);
  const [localQ, setLocalQ] = useState('');
  const [localCat, setLocalCat] = useState<CategoryId | null>(null);
  const [sort, setSort] = useState<SortKey>('newest');
  const q = syncUrl ? search.get('q') ?? '' : localQ;
  const catParam = syncUrl ? (search.get('kategoria') as CategoryId | null) : localCat;
  const cat = catParam && CATEGORIES.some((c) => c.id === catParam) ? catParam : null;
  const results = searchGames({ q, category: cat, sort });
  const total = publishedGames().length;
  const filtered = !!q || !!cat;

  const update = (next: { q?: string; cat?: CategoryId | null }) => {
    if (!syncUrl) {
      if (next.q !== undefined) setLocalQ(next.q);
      if (next.cat !== undefined) setLocalCat(next.cat);
      return;
    }
    const p = new URLSearchParams(search);
    if (next.q !== undefined) (next.q ? p.set('q', next.q) : p.delete('q'));
    if (next.cat !== undefined) (next.cat ? p.set('kategoria', next.cat) : p.delete('kategoria'));
    const s = p.toString();
    navigate(`/games${s ? '?' + s : ''}`, { replace: true, keepScroll: true });
  };
  const H = h1 ? 'h1' : 'h2';
  return (
    <>
      <div className="sec-head">
        <div>
          <span className="label">{eyebrow}</span>
          <H id={headingId} style={h1 ? { fontSize: 'clamp(44px, 7vw, 84px)' } : undefined}>
            {heading}
          </H>
        </div>
      </div>
      <div className="toolbar">
        <div className="row">
          {!syncUrl ? (
            <div className="search">
              <label htmlFor={`${headingId}-q`} className="sr-only">
                Szukaj w bibliotece
              </label>
              <span className="ico" aria-hidden="true">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M20 20l-4.2-4.2" />
                </svg>
              </span>
              <input id={`${headingId}-q`} type="search" placeholder="Szukaj po nazwie lub tagu" value={q} onChange={(e) => update({ q: e.target.value })} />
            </div>
          ) : null}
          {total >= SORT_THRESHOLD ? (
            <>
              <label htmlFor={`${headingId}-sort`} className="sr-only">
                Sortuj
              </label>
              <select id={`${headingId}-sort`} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="newest">Najnowsze</option>
                <option value="title">Nazwa A–Z</option>
              </select>
            </>
          ) : null}
        </div>
        <div className="row" role="group" aria-label="Kategorie">
          <button className="chip" aria-pressed={!cat} onClick={() => update({ cat: null })}>
            Wszystkie <span className="count">{total}</span>
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className="chip"
              aria-pressed={cat === c.id}
              disabled={counts[c.id] === 0 && cat !== c.id}
              title={counts[c.id] === 0 ? 'Brak gier w tej kategorii — wkrótce' : undefined}
              onClick={() => update({ cat: cat === c.id ? null : c.id })}
            >
              {c.name} <span className="count">{counts[c.id] || 'wkrótce'}</span>
            </button>
          ))}
        </div>
        <div className="result-line" id="library-results" aria-live="polite">
          {filtered ? (
            <>
              Wyniki: <b>{results.length}</b>
              {q ? ` dla „${q}”` : ''}
              {cat ? ` w kategorii ${categoryName(cat)}` : ''} ·{' '}
              <button className="btn ghost sm" style={{ display: 'inline-flex', verticalAlign: 'middle' }} onClick={() => update({ q: '', cat: null })}>
                <IClose size={14} /> Wyczyść filtry
              </button>
            </>
          ) : (
            <>
              <b>{total}</b> {total === 1 ? 'gra gotowa' : 'gry gotowe'} do uruchomienia
            </>
          )}
        </div>
      </div>
      {results.length ? (
        <div className="cards">
          {results.map((g, i) => (
            <GameCard key={g.slug} game={g} priority={i < 2} />
          ))}
          {!filtered ? <SoonCard /> : null}
        </div>
      ) : (
        <div className="empty">
          <div className="glyph">0 / {total}</div>
          <h3>Nic nie znaleziono</h3>
          <p>{q ? `Żadna gra nie pasuje do „${q}”.` : 'W tej kategorii nie ma jeszcze gier.'} Spróbuj innego słowa albo wyczyść filtry.</p>
          <button className="btn" onClick={() => update({ q: '', cat: null })}>
            Wyczyść filtry
          </button>
        </div>
      )}
    </>
  );
}

export function Library() {
  useMeta('Gry — EVGAMES', 'Biblioteka gier przeglądarkowych EVGAMES: wyszukiwanie, kategorie i szybkie uruchamianie.');
  return (
    <div className="page section">
      <div className="wrap">
        <LibraryBlock headingId="library-title" heading="Biblioteka gier" eyebrow="Gry" syncUrl h1 />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ discover
export function Discover() {
  useMeta('Odkrywaj — EVGAMES', 'Kategorie gier na EVGAMES. Sprawdź, w co możesz zagrać teraz, i co pojawi się wkrótce.');
  const counts = categoryCounts();
  const games = publishedGames();
  const random = () => {
    const g = games[Math.floor(Math.random() * games.length)];
    if (g) navigate(`/games/${g.slug}`);
  };
  const tags = [...new Set(games.flatMap((g) => g.tags ?? []))];
  return (
    <div className="page section">
      <div className="wrap" style={{ display: 'grid', gap: 36 }}>
        <div className="sec-head" style={{ marginBottom: 0 }}>
          <div>
            <span className="label">Odkrywaj</span>
            <h1 style={{ fontSize: 'clamp(44px, 7vw, 84px)' }}>W co dziś zagrasz?</h1>
            <p className="lead" style={{ margin: 0 }}>
              Kategorie pokazują tylko gry, które naprawdę działają. Puste półki czekają na kolejne tytuły.
            </p>
          </div>
          <button className="btn" onClick={random} disabled={!games.length}>
            <IShuffle size={17} /> Losuj grę
          </button>
        </div>
        <div className="cat-grid">
          {CATEGORIES.map((c) =>
            counts[c.id] ? (
              <Link key={c.id} to={`/games?kategoria=${c.id}`} className="cat">
                <div className="n">
                  <h3>{c.name}</h3>
                  <span className="label">
                    {counts[c.id]} {counts[c.id] === 1 ? 'gra' : 'gry'}
                  </span>
                </div>
                <p>{c.blurb}</p>
              </Link>
            ) : (
              <div key={c.id} className="cat empty-cat" aria-label={`${c.name}: wkrótce`}>
                <div className="n">
                  <h3>{c.name}</h3>
                  <span className="label muted">wkrótce</span>
                </div>
                <p>{c.blurb}</p>
              </div>
            ),
          )}
        </div>
        {tags.length ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <span className="label muted">Tagi w bibliotece</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {tags.map((t) => (
                <Link key={t} to={`/games?q=${encodeURIComponent(t)}`} className="chip" style={{ textDecoration: 'none' }}>
                  {t}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ newest
export function Newest() {
  useMeta('Ostatnio dodane — EVGAMES', 'Najnowsze gry dodane do EVGAMES.');
  const list = searchGames({ sort: 'newest' });
  return (
    <div className="page section">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="label">Ostatnio dodane</span>
            <h1 style={{ fontSize: 'clamp(44px, 7vw, 84px)' }}>Nowości</h1>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          {list.map((g) => (
            <article key={g.slug} className="featured" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)' }}>
              <Link to={`/games/${g.slug}`} className="media" aria-label={`${g.title} — szczegóły`} style={{ minHeight: 240 }}>
                <img src={g.thumbnail} alt="" loading="lazy" width={640} height={360} />
              </Link>
              <div className="body">
                <span className="label">Dodano {formatDate(g.addedAt)}</span>
                <h3 style={{ fontSize: 'clamp(34px, 4vw, 48px)' }}>{g.title}</h3>
                <p className="lead" style={{ margin: 0 }}>
                  {g.description}
                </p>
                <div className="row">
                  <Link to={`/play/${g.slug}`} className="btn primary">
                    <IPlay size={15} /> Zagraj
                  </Link>
                  <Link to={`/games/${g.slug}`} className="btn">
                    Szczegóły
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ favourites page
export function Favorites() {
  useMeta('Ulubione — EVGAMES', 'Twoje ulubione i ostatnio grane gry na EVGAMES (zapisane lokalnie w przeglądarce).');
  return (
    <div className="page">
      <div className="wrap" style={{ paddingTop: 'clamp(44px, 7vw, 84px)' }}>
        <span className="label">Twoje</span>
        <h1 style={{ fontSize: 'clamp(44px, 7vw, 84px)', marginTop: 12 }}>Ulubione i historia</h1>
        <p className="lead">
          {storageWorks()
            ? 'Te listy są zapisane tylko w tej przeglądarce. Nie synchronizują się z innymi urządzeniami.'
            : 'Twoja przeglądarka blokuje zapis lokalny, więc ulubione i historia nie zostaną zapamiętane po zamknięciu karty.'}
        </p>
      </div>
      <RecentAndFavorites />
    </div>
  );
}

// ------------------------------------------------------------------ game details
export function GameDetail({ slug }: { slug: string }) {
  const game = findGame(slug);
  useMeta(game ? `${game.title} — EVGAMES` : 'Nie znaleziono — EVGAMES', game?.description ?? SITE_DESC, game?.cover);
  const [shot, setShot] = useState<number | null>(null);
  useEffect(() => {
    if (shot === null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShot(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shot]);
  if (!game) return <NotFound />;
  const soon = game.status !== 'published';
  return (
    <div className="page">
      <section className="detail-hero">
        <div className="backdrop" style={{ backgroundImage: `url(${game.cover})` }} />
        <div className="wrap grid">
          <div className="copy">
            <nav className="crumbs" aria-label="Okruszki">
              <Link to="/games">Gry</Link> <span aria-hidden="true">/</span> <span>{game.title}</span>
            </nav>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {game.featured ? <span className="pill">Polecana</span> : null}
              {gameCategories(game).map((c) => (
                <Link key={c} to={`/games?kategoria=${c}`} className="tag" style={{ textDecoration: 'none' }}>
                  {categoryName(c)}
                </Link>
              ))}
            </div>
            <h1>{game.title}</h1>
            <p className="tagline" style={{ fontSize: 'clamp(20px, 2.4vw, 28px)' }}>
              {game.tagline}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {soon ? (
                <span className="btn" aria-disabled="true">
                  Wkrótce
                </span>
              ) : (
                <Link to={`/play/${game.slug}`} className="btn primary">
                  <IPlay size={16} /> Zagraj teraz
                </Link>
              )}
              <FavButton slug={game.slug} title={game.title} />
            </div>
          </div>
          <HudShot game={game} label={game.mode ?? game.title} />
        </div>
      </section>
      <section className="section">
        <div className="wrap detail-grid">
          <div style={{ display: 'grid', gap: 28, minWidth: 0 }}>
            <div className="prose">
              <h2 style={{ marginBottom: 18 }}>O grze</h2>
              {(game.about ?? [game.description]).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {game.screenshots?.length ? (
              <div>
                <h2 style={{ marginBottom: 14, fontSize: 30 }}>Z gry</h2>
                <div className="shots">
                  {game.screenshots.map((s, i) => (
                    <button key={s.src} onClick={() => setShot(i)} aria-label={`Powiększ: ${s.alt}`}>
                      <img src={s.src} alt={s.alt} loading="lazy" width={800} height={500} />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {game.tags?.length ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {game.tags.map((t) => (
                  <Link key={t} to={`/games?q=${encodeURIComponent(t)}`} className="tag" style={{ textDecoration: 'none' }}>
                    {t}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <aside style={{ display: 'grid', gap: 14 }}>
            {game.facts?.length ? (
              <div className="panel">
                <h3>Informacje</h3>
                <dl className="kv">
                  {game.facts.map((f) => (
                    <div key={f.label}>
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>Na EVGAMES od</dt>
                    <dd>{formatDate(game.addedAt)}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
            {game.controls?.length ? (
              <div className="panel">
                <h3>Sterowanie</h3>
                <div className="controls">
                  {game.controls.map((c) => (
                    <div key={c.action}>
                      <span>{c.action}</span>
                      <span className="keys">
                        {c.keys.map((k) => (
                          <kbd key={k} className="k">
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
                {game.mobile ? (
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>Na telefonie: wirtualny pad i stukanie w pola planszy.</p>
                ) : (
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>Wymaga klawiatury i myszy albo pada — na telefonie nie zagrasz.</p>
                )}
              </div>
            ) : null}
          </aside>
        </div>
      </section>
      {shot !== null && game.screenshots ? (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={game.screenshots[shot].alt} onClick={() => setShot(null)}>
          <img src={game.screenshots[shot].src} alt={game.screenshots[shot].alt} />
          <button className="btn icon close" aria-label="Zamknij podgląd" autoFocus onClick={() => setShot(null)}>
            <IClose size={20} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ privacy & 404
export function Privacy() {
  useMeta('Prywatność — EVGAMES', 'Jakie dane zapisuje EVGAMES: tylko lokalny zapis w przeglądarce, bez kont, analityki i ciasteczek reklamowych.');
  const keys = GAMES.flatMap((g) => (g.storageKeys ?? []).map((k) => ({ k, g: g.title })));
  return (
    <div className="page section">
      <div className="wrap legal">
        <span className="label">Prywatność</span>
        <h1 style={{ fontSize: 'clamp(44px, 7vw, 84px)', marginTop: 12 }}>Twoje dane zostają u ciebie</h1>
        <p className="lead">EVGAMES nie ma kont, serwera z danymi graczy, analityki ani reklam. Nie używamy ciasteczek.</p>
        <h2>Co zapisuje przeglądarka</h2>
        <p>Strona korzysta z pamięci lokalnej przeglądarki (localStorage), żeby zapamiętać:</p>
        <ul>
          <li>
            <code>evgames.favorites.v1</code> — listę ulubionych gier,
          </li>
          <li>
            <code>evgames.recent.v1</code> — ostatnio uruchomione gry,
          </li>
          {keys.map(({ k, g }) => (
            <li key={k}>
              <code>{k}</code> — postęp i ustawienia gry {g}.
            </li>
          ))}
        </ul>
        <p>Dane nie opuszczają twojego urządzenia. Usuniesz je, czyszcząc dane tej witryny w ustawieniach przeglądarki.</p>
        <h2>Hosting</h2>
        <p>Strona jest hostowana na Vercel. Jak każdy serwer, dostawca hostingu może przetwarzać techniczne dane połączenia (np. adres IP) w celu dostarczenia strony i ochrony przed nadużyciami.</p>
      </div>
    </div>
  );
}

export function NotFound() {
  useMeta('Nie znaleziono — EVGAMES', SITE_DESC);
  return (
    <div className="page wrap notfound">
      <div className="big" aria-hidden="true">
        404
      </div>
      <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)' }}>Ten poziom nie istnieje</h1>
      <p className="lead" style={{ margin: 0 }}>
        Adres jest nieprawidłowy albo gra została usunięta z biblioteki.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link to="/" className="btn primary">
          Strona główna
        </Link>
        <Link to="/games" className="btn">
          Biblioteka gier
        </Link>
      </div>
    </div>
  );
}
