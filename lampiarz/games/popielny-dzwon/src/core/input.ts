// Unified input: keyboard, mouse and standard gamepads, with press buffering so
// that an attack or dodge pressed a few frames early is never lost.

export type Action =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'light'
  | 'heavy'
  | 'roll'
  | 'block'
  | 'skill'
  | 'heal'
  | 'interact'
  | 'pause'
  | 'inventory';

const KEYMAP: Record<string, Action> = {
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  Space: 'jump',
  KeyJ: 'light',
  KeyK: 'heavy',
  ShiftLeft: 'roll',
  ShiftRight: 'roll',
  KeyL: 'roll',
  KeyQ: 'block',
  KeyU: 'block',
  KeyR: 'skill',
  KeyO: 'skill',
  KeyF: 'heal',
  KeyE: 'interact',
  Escape: 'pause',
  KeyP: 'pause',
  Tab: 'inventory',
  KeyI: 'inventory',
};

export const CONTROLS_HELP: { action: string; keys: string; pad: string }[] = [
  { action: 'Ruch', keys: 'A / D lub ← →', pad: 'Lewa gałka' },
  { action: 'Skok (przytrzymaj = wyżej)', keys: 'Spacja', pad: 'A' },
  { action: 'Zeskok z kładki', keys: 'S + Spacja', pad: 'Dół + A' },
  { action: 'Lekki atak (seria)', keys: 'Lewy przycisk myszy / J', pad: 'X' },
  { action: 'Ciężki atak (przytrzymaj = ładowanie)', keys: 'Prawy przycisk myszy / K', pad: 'Y' },
  { action: 'Unik (przewrót)', keys: 'Shift / L', pad: 'B' },
  { action: 'Blok — wciśnij w chwili ciosu, by sparować', keys: 'Q / U', pad: 'LB' },
  { action: 'Głos Serca (umiejętność)', keys: 'R / O', pad: 'RB' },
  { action: 'Łza Wosku (leczenie)', keys: 'F', pad: 'LT' },
  { action: 'Interakcja', keys: 'E / W', pad: 'Krzyżak ↑' },
  { action: 'Ekwipunek', keys: 'Tab / I', pad: 'Back' },
  { action: 'Pauza', keys: 'Esc / P', pad: 'Start' },
];

const BUFFER = 0.15; // seconds a press stays "fresh"

export class Input {
  private down = new Set<Action>();
  private pressedAt = new Map<Action, number>();
  private releasedAt = new Map<Action, number>();
  private padPrev = new Set<Action>();
  time = 0;
  enabled = true;
  usingPad = false;
  /** Called for menu-level presses even while gameplay input is disabled. */
  onPress: ((a: Action, e?: KeyboardEvent) => void) | null = null;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', this.onKey, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('mousedown', this.onMouse);
    window.addEventListener('mouseup', this.onMouseUp);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.releaseAll());
  }

  private isTyping(e: Event) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const a = KEYMAP[e.code];
    if (!a) return;
    // keep the page from scrolling / tabbing away while playing
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    this.usingPad = false;
    if (!e.repeat) {
      this.press(a);
      this.onPress?.(a, e);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code];
    if (a) this.release(a);
  };

  private onMouse = (e: MouseEvent) => {
    if (e.button === 0) this.press('light');
    else if (e.button === 2) this.press('heavy');
    this.usingPad = false;
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.release('light');
    else if (e.button === 2) this.release('heavy');
  };

  private holdStart = new Map<Action, number>();

  private press(a: Action) {
    if (!this.down.has(a)) {
      this.pressedAt.set(a, this.time);
      this.holdStart.set(a, this.time);
    }
    this.down.add(a);
  }

  private release(a: Action) {
    if (this.down.has(a)) this.releasedAt.set(a, this.time);
    this.down.delete(a);
  }

  releaseAll() {
    for (const a of [...this.down]) this.release(a);
  }

  /** Forget buffered presses (e.g. the key that closed a menu). */
  flush() {
    this.pressedAt.clear();
  }

  /** Poll gamepads once per frame (standard mapping). */
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find((g) => g && g.mapping === 'standard');
    if (!p) return;
    const now = new Set<Action>();
    const b = (i: number) => !!p.buttons[i]?.pressed;
    const ax = p.axes[0] ?? 0;
    const ay = p.axes[1] ?? 0;
    if (ax < -0.35 || b(14)) now.add('left');
    if (ax > 0.35 || b(15)) now.add('right');
    if (ay > 0.5 || b(13)) now.add('down');
    if (ay < -0.75 || b(12)) now.add('up');
    if (b(0)) now.add('jump');
    if (b(2)) now.add('light');
    if (b(3)) now.add('heavy');
    if (b(1)) now.add('roll');
    if (b(4)) now.add('block');
    if (b(5)) now.add('skill');
    if (b(6)) now.add('heal');
    if (b(9)) now.add('pause');
    if (b(8)) now.add('inventory');
    if (now.size) this.usingPad = true;
    for (const a of now) if (!this.padPrev.has(a)) {
      this.press(a);
      this.onPress?.(a);
    }
    for (const a of this.padPrev) if (!now.has(a)) this.release(a);
    this.padPrev = now;
  }

  held(a: Action) {
    return this.enabled && this.down.has(a);
  }

  /** True if pressed within the buffer window and not yet consumed. */
  buffered(a: Action, window = BUFFER) {
    if (!this.enabled) return false;
    const t = this.pressedAt.get(a);
    return t !== undefined && this.time - t <= window;
  }

  consume(a: Action) {
    this.pressedAt.delete(a);
  }

  /** How long the action has been held (0 if not held). */
  heldFor(a: Action) {
    if (!this.held(a)) return 0;
    const t = this.holdStart.get(a);
    return t === undefined ? 0 : this.time - t;
  }

  /** Released within the buffer window (used for charge attacks). */
  releasedRecently(a: Action, window = BUFFER) {
    const t = this.releasedAt.get(a);
    return t !== undefined && this.time - t <= window;
  }

  axis() {
    return (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
  }

  tick(dt: number) {
    this.time += dt;
  }
}
