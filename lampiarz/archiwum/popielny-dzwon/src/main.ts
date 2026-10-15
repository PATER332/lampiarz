// Popielny Dzwon — entry point.
import './ui/style.css';
import { Game } from './game';

function boot() {
  const root = document.getElementById('root');
  if (!root) return;
  root.textContent = '';
  try {
    const game = new Game(root);
    if (new URLSearchParams(location.search).has('debug')) game.installDebug();
    // canvas text needs the fonts before the first HUD frame; never block longer than a moment
    const fonts = document.fonts ? Promise.race([Promise.all(['16px Pagella', '16px Chorus', 'italic 16px Pagella'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();
    void fonts.finally(() => game.start());
  } catch (err) {
    console.error(err);
    root.innerHTML = '<div class="pd-error"><h2>Nie udało się uruchomić gry</h2><p>Twoja przeglądarka nie obsługuje wymaganych funkcji (Canvas 2D, Web Audio). Spróbuj aktualnej wersji Chrome, Firefoksa, Edge lub Safari.</p></div>';
  }
}

boot();
