// Minimal History-API router: real URLs (/games/lampiarz), refresh-safe via the
// Vercel rewrite to index.html, no dependency.
import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'discover' }
  | { name: 'new' }
  | { name: 'favorites' }
  | { name: 'game'; slug: string }
  | { name: 'play'; slug: string }
  | { name: 'privacy' }
  | { name: 'notfound' };

export function parse(pathname: string): Route {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/') return { name: 'home' };
  if (p === '/games') return { name: 'library' };
  if (p === '/discover') return { name: 'discover' };
  if (p === '/new') return { name: 'new' };
  if (p === '/favorites') return { name: 'favorites' };
  if (p === '/privacy') return { name: 'privacy' };
  let m = /^\/games\/([a-z0-9-]+)$/.exec(p);
  if (m) return { name: 'game', slug: m[1] };
  m = /^\/play\/([a-z0-9-]+)$/.exec(p);
  if (m) return { name: 'play', slug: m[1] };
  return { name: 'notfound' };
}

const listeners = new Set<() => void>();
let snapshot = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
function update() {
  const next = window.location.pathname + window.location.search;
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((l) => l());
}
if (typeof window !== 'undefined') window.addEventListener('popstate', update);

export function navigate(to: string, opts: { replace?: boolean; keepScroll?: boolean } = {}) {
  const url = new URL(to, window.location.origin);
  const target = url.pathname + url.search + url.hash;
  if (target === window.location.pathname + window.location.search + window.location.hash && !opts.replace) return;
  if (opts.replace) window.history.replaceState(null, '', target);
  else window.history.pushState(null, '', target);
  const samePath = url.pathname === new URL(snapshot, window.location.origin).pathname;
  update();
  if (url.hash) {
    requestAnimationFrame(() => document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  } else if (!opts.keepScroll && !samePath) window.scrollTo({ top: 0 });
}

export function useLocation() {
  const loc = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => snapshot,
  );
  const url = new URL(loc, 'http://local');
  return { pathname: url.pathname, search: url.searchParams, route: parse(url.pathname) };
}

export function Link({ to, children, onClick, ...rest }: { to: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={handle} {...rest}>
      {children}
    </a>
  );
}

/** Per-route title, description and canonical-ish OG tags. */
export function useMeta(title: string, description: string, image?: string) {
  useEffect(() => {
    document.title = title;
    const set = (sel: string, attr: string, value: string) => {
      const el = document.head.querySelector<HTMLMetaElement>(sel);
      if (el) el.setAttribute(attr, value);
    };
    set('meta[name="description"]', 'content', description);
    set('meta[property="og:title"]', 'content', title);
    set('meta[property="og:description"]', 'content', description);
    if (image) {
      const abs = new URL(image, window.location.origin).href;
      set('meta[property="og:image"]', 'content', abs);
    }
  }, [title, description, image]);
}
