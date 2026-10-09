import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Footer, Header, ToastHost } from './components';
import { Discover, Favorites, GameDetail, Home, Library, Newest, NotFound, Privacy } from './pages';
import { Player } from './Player';
import { useLocation } from './router';

function App() {
  const { route, pathname } = useLocation();
  if (route.name === 'play') {
    return (
      <>
        <Player slug={route.slug} />
        <ToastHost />
      </>
    );
  }
  let page: ReactNode;
  switch (route.name) {
    case 'home':
      page = <Home />;
      break;
    case 'library':
      page = <Library />;
      break;
    case 'discover':
      page = <Discover />;
      break;
    case 'new':
      page = <Newest />;
      break;
    case 'favorites':
      page = <Favorites />;
      break;
    case 'game':
      page = <GameDetail slug={route.slug} />;
      break;
    case 'privacy':
      page = <Privacy />;
      break;
    default:
      page = <NotFound />;
  }
  return (
    <>
      <a href="#main" className="skip">
        Przejdź do treści
      </a>
      <Header />
      <main id="main" key={pathname} tabIndex={-1}>
        {page}
      </main>
      <Footer />
      <ToastHost />
    </>
  );
}

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="wrap notfound">
        <span className="label" style={{ color: 'var(--danger)' }}>
          Błąd
        </span>
        <h1 style={{ fontSize: 48 }}>Coś poszło nie tak</h1>
        <p className="lead">Odśwież stronę. Jeśli problem wraca, wyczyść dane witryny w przeglądarce.</p>
        <button className="btn primary" onClick={() => location.reload()}>
          Odśwież
        </button>
      </div>
    );
  }
}

const el = document.getElementById('evgames-root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <Boundary>
        <App />
      </Boundary>
    </StrictMode>,
  );
}
