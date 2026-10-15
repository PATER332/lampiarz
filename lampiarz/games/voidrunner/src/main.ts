import './style.css';
import { App } from './ui';

const root = document.getElementById('root')!;
const app = new App(root);
// handy for automated checks and debugging in the console
(window as unknown as { __voidrunner: App }).__voidrunner = app;
