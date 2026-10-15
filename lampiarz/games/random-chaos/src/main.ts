// RANDOM CHAOS — entry point.
import './ui/style.css';
import { App } from './app';

const root = document.getElementById('root')!;
const app = new App(root);
void app.start();
(window as unknown as { __rcDispose?: () => void }).__rcDispose = () => app.dispose();
