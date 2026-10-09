// DOM overlay: a stack of screens with keyboard / gamepad navigation.
import type { Action } from '../core/input';

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> | null;

/** Tiny element factory. `on*` props become listeners, `class`/`text`/`html` are special. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = null, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props)
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'text') el.textContent = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export interface Screen {
  el: HTMLElement;
  /** may Esc / B close it? */
  closable?: boolean;
  onClose?: () => void;
  /** dims the game and pauses the simulation */
  blocking?: boolean;
  /** extra key handling, return true if consumed */
  onAction?: (a: Action) => boolean;
  cls?: string;
}

export class UI {
  root: HTMLElement;
  stack: Screen[] = [];
  sound: (name: 'menu' | 'deny' | 'interact') => void = () => undefined;
  onChange: () => void = () => undefined;

  constructor(host: HTMLElement) {
    this.root = h('div', { class: 'pd-ui' });
    host.appendChild(this.root);
    this.root.addEventListener('mouseover', (e) => {
      const b = (e.target as HTMLElement).closest('.pd-btn') as HTMLElement | null;
      if (b && !b.hasAttribute('disabled') && document.activeElement !== b) b.focus({ preventScroll: true });
    });
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && !b.disabled) this.sound('menu');
    });
  }

  get blocking() {
    return this.stack.some((s) => s.blocking !== false);
  }

  get top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  open(s: Screen) {
    const wrap = h('div', { class: `pd-layer ${s.blocking === false ? 'pd-layer-free' : ''} ${s.cls ?? ''}` }, s.el);
    (s as Screen & { wrap?: HTMLElement }).wrap = wrap;
    this.root.appendChild(wrap);
    this.stack.push(s);
    requestAnimationFrame(() => wrap.classList.add('pd-in'));
    this.focusFirst(s.el);
    this.onChange();
    return s;
  }

  close(s?: Screen) {
    const target = s ?? this.top;
    if (!target) return;
    const i = this.stack.indexOf(target);
    if (i < 0) return;
    this.stack.splice(i, 1);
    const wrap = (target as Screen & { wrap?: HTMLElement }).wrap;
    wrap?.remove();
    target.onClose?.();
    if (this.top) this.focusFirst(this.top.el);
    this.onChange();
  }

  closeAll() {
    while (this.stack.length) this.close();
  }

  /** Replace the contents of an open screen (re-render) keeping focus position. */
  refresh(s: Screen, el: HTMLElement) {
    const btns = [...s.el.querySelectorAll<HTMLElement>('.pd-btn')];
    const idx = btns.indexOf(document.activeElement as HTMLElement);
    s.el.replaceWith(el);
    s.el = el;
    const nb = [...el.querySelectorAll<HTMLElement>('.pd-btn:not([disabled])')];
    const all = [...el.querySelectorAll<HTMLElement>('.pd-btn')];
    const want = idx >= 0 ? all[Math.min(idx, all.length - 1)] : null;
    if (want && !want.hasAttribute('disabled')) want.focus({ preventScroll: true });
    else nb[0]?.focus({ preventScroll: true });
  }

  focusFirst(el: HTMLElement) {
    const pref = el.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ?? el.querySelector<HTMLElement>('.pd-btn:not([disabled]), input');
    pref?.focus({ preventScroll: true });
  }

  /** Menu navigation from keyboard / gamepad actions. Returns true if consumed. */
  action(a: Action, ev?: KeyboardEvent): boolean {
    const s = this.top;
    if (!s) return false;
    if (s.onAction?.(a)) return true;
    const focusables = [...s.el.querySelectorAll<HTMLElement>('.pd-btn:not([disabled]), input[type=range], input[type=checkbox]')].filter((e) => e.offsetParent !== null);
    const cur = document.activeElement as HTMLElement | null;
    const idx = cur ? focusables.indexOf(cur) : -1;
    const move = (d: number) => {
      if (!focusables.length) return;
      const n = idx < 0 ? 0 : (idx + d + focusables.length) % focusables.length;
      focusables[n].focus({ preventScroll: true });
      focusables[n].scrollIntoView({ block: 'nearest' });
      this.sound('menu');
    };
    switch (a) {
      case 'up':
        move(-1);
        return true;
      case 'down':
        move(1);
        return true;
      case 'left':
      case 'right': {
        if (cur instanceof HTMLInputElement && cur.type === 'range') {
          const step = Number(cur.step || 1) * (a === 'left' ? -1 : 1);
          cur.value = String(Math.min(Number(cur.max), Math.max(Number(cur.min), Number(cur.value) + step)));
          cur.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        // tabs / horizontal button rows
        const row = cur?.closest('.pd-row, .pd-tabs');
        if (row) {
          const sib = [...row.querySelectorAll<HTMLElement>('.pd-btn:not([disabled])')];
          const i = sib.indexOf(cur!);
          const n = sib[(i + (a === 'left' ? -1 : 1) + sib.length) % sib.length];
          n?.focus({ preventScroll: true });
          this.sound('menu');
          return true;
        }
        move(a === 'left' ? -1 : 1);
        return true;
      }
      case 'jump':
      case 'interact':
      case 'light':
        if (ev && (ev.code === 'Space' || ev.code === 'KeyE') && cur instanceof HTMLButtonElement) {
          // a real key: let the button handle it once
          cur.click();
          return true;
        }
        if (cur instanceof HTMLInputElement && cur.type === 'checkbox') {
          cur.click();
          return true;
        }
        cur?.click();
        return true;
      case 'pause':
      case 'roll':
      case 'inventory':
        if (s.closable !== false) {
          this.sound('menu');
          this.close(s);
        }
        return true;
    }
    return false;
  }
}

// ------------------------------------------------------------------ building blocks
export function btn(label: string, onClick: () => void, opts: { disabled?: boolean; sub?: string; cls?: string; autofocus?: boolean } = {}) {
  return h(
    'button',
    { class: `pd-btn ${opts.cls ?? ''}`, type: 'button', disabled: opts.disabled ? true : undefined, 'data-autofocus': opts.autofocus ? '' : undefined, onclick: opts.disabled ? undefined : onClick },
    h('span', { class: 'pd-btn-label' }, label),
    opts.sub ? h('span', { class: 'pd-btn-sub' }, opts.sub) : null,
  );
}

export function panel(title: string, ...kids: Child[]) {
  return h('div', { class: 'pd-panel', role: 'dialog', 'aria-label': title }, h('h2', { class: 'pd-title' }, title), ...kids);
}

export function para(text: string, cls = '') {
  return h('p', { class: `pd-text ${cls}` }, text);
}
