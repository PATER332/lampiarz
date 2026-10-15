// Tiny DOM helpers: every screen is a function that returns an element.
type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs)
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
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

export interface BtnOpts {
  cls?: string;
  id?: string;
  hint?: string;
  disabled?: boolean;
  pressed?: boolean;
  title?: string;
}
let onUi: (kind: 'click' | 'hover') => void = () => {};
export function setUiSound(fn: (kind: 'click' | 'hover') => void) {
  onUi = fn;
}
export function btn(label: Child, onClick: () => void, o: BtnOpts = {}) {
  const b = h(
    'button',
    {
      type: 'button',
      class: `rc-btn ${o.cls ?? ''}`.trim(),
      'data-id': o.id,
      disabled: !!o.disabled,
      title: o.title,
      'aria-pressed': o.pressed === undefined ? null : String(o.pressed),
      onclick: (e: Event) => {
        e.stopPropagation();
        onUi('click');
        onClick();
      },
      onmouseenter: () => onUi('hover'),
    },
    h('span', { class: 'rc-btn-label' }, label),
    o.hint ? h('small', null, o.hint) : null,
  );
  return b;
}
export function kbd(...keys: string[]) {
  return keys.map((k) => h('kbd', null, k));
}
