// Tiny DOM helpers used by the UI. No framework: every screen is a function that
// returns an element, and the app swaps them in and out of a single layer.

type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs)
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

/** A menu button. `hint` is rendered on the right in small mono type. */
export function btn(label: string, onClick: () => void, o: { hint?: string; cls?: string; disabled?: boolean; title?: string; id?: string } = {}) {
  return h(
    'button',
    {
      type: 'button',
      class: `ns-btn ${o.cls ?? ''}`.trim(),
      disabled: !!o.disabled,
      title: o.title,
      'data-id': o.id,
      onclick: (e: Event) => {
        e.stopPropagation();
        onClick();
      },
    },
    h('span', null, label),
    o.hint ? h('small', null, o.hint) : null,
  );
}

export function panel(cls: string, ...children: Child[]) {
  return h('div', { class: `ns-panel ${cls}`.trim(), role: 'dialog', 'aria-modal': 'true' }, ...children);
}

export function setText(el: HTMLElement, text: string) {
  if (el.textContent !== text) el.textContent = text;
}

export function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const hh = Math.floor(m / 60);
  return hh > 0 ? `${hh}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
}
