export type Action = 'left' | 'right' | 'jump' | 'down' | 'echo' | 'interact' | 'clear' | 'memory' | 'pause' | 'dash' | 'swap';

const KEYMAP: Record<string, Action> = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyW: 'jump', ArrowUp: 'jump',
  KeyS: 'down', ArrowDown: 'down',
  KeyQ: 'echo', KeyE: 'interact', KeyR: 'clear', KeyF: 'memory',
  KeyC: 'swap', ShiftLeft: 'dash', ShiftRight: 'dash', KeyX: 'dash', KeyK: 'dash',
  Escape: 'pause',
};

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  private held = new Set<Action>();
  private pressed = new Set<Action>();
  private virtual = new Set<Action>();
  private vPressed = new Set<Action>();
  enabled = true;

  constructor() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  private onDown = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code];
    if (!a) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (!this.held.has(a)) this.pressed.add(a);
    this.held.add(a);
  };

  private onUp = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code];
    if (!a) return;
    this.held.delete(a);
  };

  private onBlur = () => {
    this.held.clear();
    this.pressed.clear();
  };

  isDown(a: Action): boolean {
    return this.enabled && (this.held.has(a) || this.virtual.has(a));
  }

  justPressed(a: Action): boolean {
    return this.enabled && (this.pressed.has(a) || this.vPressed.has(a));
  }

  /** Consume one-shot presses at the end of a simulation step. */
  endStep() {
    this.pressed.clear();
    this.vPressed.clear();
  }

  setVirtual(a: Action, down: boolean) {
    if (down) {
      if (!this.virtual.has(a)) this.vPressed.add(a);
      this.virtual.add(a);
    } else {
      this.virtual.delete(a);
    }
  }

  reset() {
    this.held.clear();
    this.pressed.clear();
    this.virtual.clear();
    this.vPressed.clear();
  }

  destroy() {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
