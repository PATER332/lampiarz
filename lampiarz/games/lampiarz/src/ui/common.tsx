import { useEffect, useRef, type ReactNode } from 'react';
import { audio } from '../audio/audio';
import { ACH_MAP } from '../game/content';
import type { ClassId, EnemyType } from '../game/types';
import { drawEnemy, drawEnemyEyes, drawLanternGlow, drawPlayer, lanternOffset } from '../render/sprites';
import { drawThemeCard } from '../render/scene';
import type { ThemeId } from '../game/types';
import { IconClose, IconStar, IconInfo } from './icons';

// ------------------------------------------------------------------ modal
const modalStack: object[] = [];
export const anyModalOpen = () => modalStack.length > 0;

export function Modal({
  children,
  onClose,
  wide,
  labelledBy,
  className,
}: {
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  labelledBy?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const token = {};
    modalStack.push(token);
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('button:not(:disabled), [href], input');
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== token) return;
      if (e.key === 'Escape' && closeRef.current) {
        e.stopPropagation();
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]')];
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          items[items.length - 1].focus();
          e.preventDefault();
        } else if (!e.shiftKey && i === items.length - 1) {
          items[0].focus();
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      const i = modalStack.indexOf(token);
      if (i >= 0) modalStack.splice(i, 1);
      prev?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className="overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div ref={ref} className={`panel modal ${wide ? 'wide' : ''} ${className ?? ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="btn ghost icon"
      onClick={() => {
        audio.play('click');
        onClick();
      }}
      aria-label="Zamknij"
    >
      <IconClose />
    </button>
  );
}

// ------------------------------------------------------------------ canvas helpers
function useCanvas(draw: (c: CanvasRenderingContext2D, w: number, h: number, t: number) => void, animate: boolean, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const c = cv.getContext('2d');
    if (!c) return;
    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const render = (now: number) => {
      const r = cv.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      if (cv.width !== w * dpr || cv.height !== h * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      draw(c, w, h, now / 1000);
      if (animate) raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

export function ClassPortrait({ cls, animate = true }: { cls: ClassId; animate?: boolean }) {
  const ref = useCanvas(
    (c, w, h, t) => {
      const s = Math.min(w, h) * 0.62;
      const cx = w / 2;
      const cy = h * 0.56;
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, s * 1.3);
      g.addColorStop(0, 'rgba(255,170,80,0.18)');
      g.addColorStop(1, 'rgba(255,170,80,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      drawPlayer(c, cx, cy, s, cls, 1, t);
      const lo = lanternOffset(s, 1);
      drawLanternGlow(c, cx + lo.x, cy + lo.y, s, t, 1);
    },
    animate,
    [cls, animate],
  );
  return <canvas ref={ref} aria-hidden="true" />;
}

export function EnemyPortrait({ type, known }: { type: EnemyType; known: boolean }) {
  const ref = useCanvas(
    (c, w, h, t) => {
      const s = Math.min(w, h) * (type === 'matka' ? 0.42 : 0.72);
      const cx = w / 2;
      const cy = h * 0.55;
      if (known) {
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, w * 0.6);
        g.addColorStop(0, 'rgba(120,140,190,0.25)');
        g.addColorStop(1, 'rgba(120,140,190,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        drawEnemy(c, type, cx, cy, s, t, 3, false);
      }
      drawEnemyEyes(c, type, cx, cy, s, t, 3, known ? 1 : 0.35);
    },
    true,
    [type, known],
  );
  return <canvas ref={ref} aria-hidden="true" />;
}

export function ThemeArt({ theme }: { theme: ThemeId }) {
  const ref = useCanvas((c, w, h) => drawThemeCard(c, w, h, theme), false, [theme]);
  return <canvas ref={ref} aria-hidden="true" />;
}

// ------------------------------------------------------------------ toasts
export interface ToastItem {
  id: number;
  kind: 'ach' | 'warn' | 'info';
  title: string;
  text?: string;
}

export function Toasts({ items }: { items: ToastItem[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'warn' ? 'warn' : ''}`}>
          <div className="badge">{t.kind === 'ach' ? <IconStar size={18} /> : <IconInfo size={18} />}</div>
          <div>
            <div className="k">{t.kind === 'ach' ? 'Osiągnięcie' : t.kind === 'warn' ? 'Uwaga' : 'Informacja'}</div>
            <div className="n">{t.title}</div>
            {t.text ? <div className="r">{t.text}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function achievementToast(id: string, nextId: number): ToastItem {
  const a = ACH_MAP[id];
  return { id: nextId, kind: 'ach', title: a?.name ?? id, text: a?.reward ?? a?.desc };
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className={`switch ${on ? 'on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => {
        audio.play('click');
        onChange(!on);
      }}
    />
  );
}
