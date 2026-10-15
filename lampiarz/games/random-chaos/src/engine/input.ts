// Controls for two players: one shared keyboard and/or gamepads.
//
// - Keys are tracked by physical code (KeyA, ArrowLeft…), so the layout does not matter.
// - Every player has alternative keys. Many keyboards cannot register some
//   combinations of WASD + arrows held at the same time ("ghosting"), so player 2
//   can also use IJKL or the numeric keypad.
// - A key tapped and released between two frames still counts as pressed for
//   one frame (latched), so a very quick tap is never lost.
// - Gamepads: pad 1 → player 1, pad 2 → player 2 (D-pad / left stick, A = jump,
//   B / X = action, Start = pause).
// - Everything is released when the window loses focus, so no key stays
//   "stuck" after Alt+Tab.
import { NO_INPUT, type PadInput } from '../sim/player';

export interface Binding {
  left: string[];
  right: string[];
  jump: string[];
  action: string[];
}

export const BINDINGS: [Binding, Binding] = [
  { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW'], action: ['KeyS'] },
  {
    left: ['ArrowLeft', 'KeyJ', 'Numpad4'],
    right: ['ArrowRight', 'KeyL', 'Numpad6'],
    jump: ['ArrowUp', 'KeyI', 'Numpad8'],
    action: ['ArrowDown', 'KeyK', 'Numpad5', 'Numpad2'],
  },
];

const ALL_GAME_CODES = new Set(BINDINGS.flatMap((b) => [...b.left, ...b.right, ...b.jump, ...b.action]));
/** keys the page must not react to (scrolling, tab focus) while the game runs */
const GAME_KEYS = new Set([...ALL_GAME_CODES, 'Space', 'Tab']);

const DEAD = 0.45;

export class Input {
  down = new Set<string>();
  /** keys pressed since the end of the last frame — kept even if already released */
  private tapped = new Set<string>();
  /** key presses since the last poll (menus, pause, restart) */
  private pressed: string[] = [];
  /** while true, arrows / WASD are game controls and do not move menu focus */
  capture = false;
  onBlur: () => void = () => {};
  /** gamepad Start buttons held on the previous frame (edge detection) */
  private startHeld = [false, false];

  constructor(private target: Window = window) {
    target.addEventListener('keydown', this.kd);
    target.addEventListener('keyup', this.ku);
    target.addEventListener('blur', this.blur);
    document.addEventListener('visibilitychange', this.vis);
  }
  dispose() {
    this.target.removeEventListener('keydown', this.kd);
    this.target.removeEventListener('keyup', this.ku);
    this.target.removeEventListener('blur', this.blur);
    document.removeEventListener('visibilitychange', this.vis);
  }

  private kd = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    // typing a name: letters are text, not controls (Esc still goes back)
    const typing = !!t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && ['text', 'search', ''].includes((t as HTMLInputElement).type)));
    if (typing && e.code !== 'Escape' && e.code !== 'Enter') return;
    if (this.capture && GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.code === 'Space' || e.code.startsWith('Arrow')) {
      // never scroll the page; buttons still get their own keyboard handling
      const ownKeys = !!t && ((t.tagName === 'BUTTON' && e.code === 'Space') || (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'range' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')));
      if (this.capture || !ownKeys) e.preventDefault();
    }
    // Enter / Space on a focused button or link is already a click on that
    // element: it must not also reach the screen's key handler (that would act
    // twice, e.g. skip the next intro card).
    const el = t && (t.tagName === 'BUTTON' || t.tagName === 'A');
    const native = el && !e.defaultPrevented && (e.code === 'Enter' || e.code === 'NumpadEnter' || (e.code === 'Space' && t!.tagName === 'BUTTON'));
    if (!e.repeat && !native) this.pressed.push(e.code);
    if (!e.repeat) this.tapped.add(e.code);
    this.down.add(e.code);
  };
  private ku = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };
  private blur = () => {
    this.releaseAll();
    this.onBlur();
  };
  private vis = () => {
    if (document.hidden) this.blur();
  };

  releaseAll() {
    this.down.clear();
    this.tapped.clear();
    this.pressed.length = 0;
  }

  /** Keys pressed since the last call. Gamepad Start counts as Escape. */
  take(): string[] {
    for (const i of [0, 1] as const) {
      const gp = this.gamepad(i);
      const start = !!gp && !!gp.buttons[9]?.pressed;
      if (start && !this.startHeld[i]) this.pressed.push('Escape');
      this.startHeld[i] = start;
    }
    const p = this.pressed;
    this.pressed = [];
    return p;
  }

  /** Call once at the end of every frame: quick taps have now been seen by the game. */
  endFrame() {
    this.tapped.clear();
  }

  private gamepad(i: 0 | 1): Gamepad | null {
    let pads: (Gamepad | null)[] = [];
    try {
      pads = typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    } catch {
      pads = [];
    }
    const connected = pads.filter((g): g is Gamepad => !!g && g.connected);
    return connected[i] ?? null;
  }

  /** Number of connected gamepads (for the controls screen). */
  gamepadCount(): number {
    return (this.gamepad(0) ? 1 : 0) + (this.gamepad(1) ? 1 : 0);
  }

  pad(i: 0 | 1): PadInput {
    const b = BINDINGS[i];
    const on = (codes: string[]) => codes.some((c) => this.down.has(c) || this.tapped.has(c));
    const out: PadInput = { left: on(b.left), right: on(b.right), jump: on(b.jump), action: on(b.action) };
    const gp = this.gamepad(i);
    if (gp) {
      const btn = (n: number) => !!gp.buttons[n]?.pressed;
      const ax = gp.axes[0] ?? 0;
      out.left ||= btn(14) || ax < -DEAD;
      out.right ||= btn(15) || ax > DEAD;
      out.jump ||= btn(0) || btn(12);
      out.action ||= btn(1) || btn(2) || btn(13);
    }
    return out;
  }
}

/** Human-readable key names for the controls screen. */
export const KEY_LABEL: Record<string, string> = {
  KeyA: 'A',
  KeyD: 'D',
  KeyW: 'W',
  KeyS: 'S',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  KeyJ: 'J',
  KeyL: 'L',
  KeyI: 'I',
  KeyK: 'K',
  Numpad4: 'Num 4',
  Numpad6: 'Num 6',
  Numpad8: 'Num 8',
  Numpad5: 'Num 5',
  Numpad2: 'Num 2',
};

export { NO_INPUT };
