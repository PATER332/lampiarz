import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './ui/App';
import { clearRun } from './save/storage';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('LAMPIARZ crashed:', error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="overlay">
        <div className="panel modal" role="alertdialog" aria-labelledby="crash-title">
          <p className="eyebrow">Błąd</p>
          <h2 id="crash-title">Wiatr zgasił wszystkie latarnie</h2>
          <p className="muted">Gra napotkała nieoczekiwany błąd. Twój profil jest bezpieczny. Możesz odświeżyć stronę albo — jeśli błąd się powtarza — porzucić bieżącą noc.</p>
          <p className="muted" style={{ fontSize: 13 }}>
            {String(this.state.error.message).slice(0, 200)}
          </p>
          <div className="modal-actions">
            <button
              className="btn danger"
              onClick={() => {
                clearRun();
                location.reload();
              }}
            >
              Porzuć noc i odśwież
            </button>
            <button className="btn primary" onClick={() => location.reload()}>
              Odśwież
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
