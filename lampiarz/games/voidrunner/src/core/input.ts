// Action-based input. The simulation only sees actions; keyboard / touch / tests feed them.

export type Action =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'dash'
  | 'attack'
  | 'special'
  | 'interact'
  | 'heal'
  | 'block'
  | 'inventory'
  | 'pause';

export const ACTIONS: { id: Action; label: string }[] = [
  { id: 'left', label: 'Ruch w lewo' },
  { id: 'right', label: 'Ruch w prawo' },
  { id: 'up', label: 'Góra (celowanie, drabiny)' },
  { id: 'down', label: 'Dół (zeskok z kładki)' },
  { id: 'jump', label: 'Skok / podwójny skok' },
  { id: 'dash', label: 'Zryw / unik' },
  { id: 'attack', label: 'Atak (przytrzymaj: atak naładowany)' },
  { id: 'special', label: 'Umiejętność specjalna' },
  { id: 'interact', label: 'Interakcja' },
  { id: 'block', label: 'Obrona (blok; tuż przed ciosem: parowanie)' },
  { id: 'heal', label: 'Nanoapteczka (leczenie)' },
  { id: 'inventory', label: 'Ekwipunek' },
  { id: 'pause', label: 'Pauza' },
];

export type KeyMap = Record<Action, string[]>;

export const DEFAULT_KEYS: KeyMap = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space'],
  dash: ['ShiftLeft', 'ShiftRight'],
  attack: ['KeyJ', 'KeyR', 'Mouse0'],
  special: ['KeyK', 'Mouse2'],
  interact: ['KeyE'],
  block: ['KeyQ'],
  heal: ['KeyF'],
  inventory: ['KeyI'],
  pause: ['Escape'],
};

export function keyLabel(code: string): string {
  if (code.startsWith('Mouse')) return ({ Mouse0: 'LPM', Mouse1: 'ŚPM', Mouse2: 'PPM', Mouse3: 'Mysz 4', Mouse4: 'Mysz 5' } as Record<string, string>)[code] ?? code;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Spacja',
    ShiftLeft: 'Shift',
    ShiftRight: 'Prawy Shift',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Escape: 'Esc',
    Enter: 'Enter',
    ControlLeft: 'Ctrl',
    ControlRight: 'Prawy Ctrl',
    AltLeft: 'Alt',
    Tab: 'Tab',
    Backspace: 'Backspace',
  };
  return map[code] ?? code;
}

export class Input {
  held = new Set<Action>();
  pressed = new Set<Action>();
  released = new Set<Action>();

  press(a: Action) {
    if (!this.held.has(a)) this.pressed.add(a);
    this.held.add(a);
  }
  release(a: Action) {
    if (this.held.has(a)) this.released.add(a);
    this.held.delete(a);
  }
  /** Call once after every simulation step. */
  endStep() {
    this.pressed.clear();
    this.released.clear();
  }
  clear() {
    for (const a of [...this.held]) this.release(a);
    this.endStep();
  }
  down(a: Action) {
    return this.held.has(a);
  }
  hit(a: Action) {
    return this.pressed.has(a);
  }
  up(a: Action) {
    return this.released.has(a);
  }
}

/** Max keys / buttons bound to one action. */
export const MAX_BINDS = 3;

/** Keyboard + mouse buttons → actions, with rebinding and without letting game keys scroll the page.
 * Mouse buttons use the pseudo codes Mouse0 (left), Mouse1 (middle), Mouse2 (right), Mouse3/4 (side). */
export class Keyboard {
  private byCode = new Map<string, Action[]>();
  onAnyKey: ((code: string) => boolean) | null = null; // used by the rebinding screen
  onPause: (() => void) | null = null;
  enabled = true;

  constructor(
    private input: Input,
    keys: KeyMap,
  ) {
    this.setKeys(keys);
    window.addEventListener('keydown', this.down, { passive: false });
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', () => this.input.clear());
    window.addEventListener('mousedown', this.mouseDown, { passive: false });
    window.addEventListener('mouseup', this.mouseUp);
    window.addEventListener('contextmenu', (e) => {
      if (this.isGameSurface(e.target)) e.preventDefault();
    });
  }

  /** Mouse buttons only act on the game itself (not on menus, panels or touch buttons). */
  stage: HTMLElement | null = null;
  private isGameSurface(t: EventTarget | null) {
    if (!this.stage || !(t instanceof Node)) return false;
    return this.stage.contains(t);
  }

  private mouseDown = (e: MouseEvent) => {
    const code = `Mouse${e.button}`;
    if (this.onAnyKey) {
      // rebinding: click the waiting key box with the button you want
      if (e.target instanceof HTMLElement && e.target.classList.contains('wait')) {
        e.preventDefault();
        if (this.onAnyKey(code)) this.onAnyKey = null;
      }
      return;
    }
    if (!this.enabled || !this.isGameSurface(e.target)) return;
    const acts = this.byCode.get(code);
    if (!acts) return;
    e.preventDefault();
    for (const a of acts) if (a !== 'pause') this.input.press(a);
  };

  private mouseUp = (e: MouseEvent) => {
    const acts = this.byCode.get(`Mouse${e.button}`);
    if (!acts) return;
    for (const a of acts) this.input.release(a);
  };

  setKeys(keys: KeyMap) {
    this.byCode.clear();
    for (const a of Object.keys(keys) as Action[]) for (const c of keys[a]) this.byCode.set(c, [...(this.byCode.get(c) ?? []), a]);
  }

  private down = (e: KeyboardEvent) => {
    if (this.onAnyKey) {
      e.preventDefault();
      if (this.onAnyKey(e.code)) this.onAnyKey = null;
      return;
    }
    const acts = this.byCode.get(e.code);
    if (!acts) return;
    // never let Space / arrows / Tab scroll the platform page around the game
    e.preventDefault();
    if (!this.enabled) return;
    for (const a of acts) {
      if (a === 'pause' && !e.repeat) this.onPause?.();
      this.input.press(a);
    }
  };

  private up = (e: KeyboardEvent) => {
    const acts = this.byCode.get(e.code);
    if (!acts) return;
    for (const a of acts) this.input.release(a);
  };
}
