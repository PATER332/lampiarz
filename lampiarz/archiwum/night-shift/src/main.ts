// NIGHT SHIFT: 03:17 — entry point.
import './ui/style.css';
import { App } from './app';

const root = document.getElementById('root')!;
const app = new App(root);
void app.start();
// lets the EVGAMES player (or a test) shut the game down cleanly
(window as unknown as { __nsDispose?: () => void }).__nsDispose = () => app.dispose();
