import { useEffect, useRef } from "react";
import type { Game } from "../game/engine";

interface Props {
  game: Game;
  onInteract: () => void;
  onFlash: () => void;
  onCrouch: () => void;
  onBattery: () => void;
  crouched: boolean;
  flashlight: boolean;
}

/** Virtual joystick + action buttons for touch devices. */
export default function TouchControls({ game, onInteract, onFlash, onCrouch, onBattery, crouched, flashlight }: Props) {
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const lookRef = useRef<HTMLDivElement>(null);
  const state = useRef({ id: -1, cx: 0, cy: 0 });

  useEffect(() => {
    const stick = stickRef.current;
    const knob = knobRef.current;
    const look = lookRef.current;
    if (!stick || !knob || !look) return;

    const R = 52;

    const startMove = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      state.current.id = t.identifier;
      const r = stick.getBoundingClientRect();
      state.current.cx = r.left + r.width / 2;
      state.current.cy = r.top + r.height / 2;
      moveMove(e);
    };
    const moveMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier !== state.current.id) continue;
        let dx = t.clientX - state.current.cx;
        let dy = t.clientY - state.current.cy;
        const len = Math.hypot(dx, dy);
        if (len > R) {
          dx = (dx / len) * R;
          dy = (dy / len) * R;
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        game.touch.move.x = dx / R;
        game.touch.move.y = -dy / R;
        game.touch.sprint = Math.hypot(dx, dy) / R > 0.88;
      }
      e.preventDefault();
    };
    const endMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier !== state.current.id) continue;
        state.current.id = -1;
        knob.style.transform = "translate(0px, 0px)";
        game.touch.move.x = 0;
        game.touch.move.y = 0;
        game.touch.sprint = false;
      }
    };

    let lookId = -1;
    let lx = 0;
    let ly = 0;
    const startLook = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lx = t.clientX;
      ly = t.clientY;
    };
    const moveLook = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier !== lookId) continue;
        game.touch.look.x = (t.clientX - lx) * 0.55;
        game.touch.look.y = (t.clientY - ly) * 0.55;
        lx = t.clientX;
        ly = t.clientY;
      }
      e.preventDefault();
    };
    const endLook = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookId) {
          lookId = -1;
          game.touch.look.x = 0;
          game.touch.look.y = 0;
        }
      }
    };

    stick.addEventListener("touchstart", startMove, { passive: false });
    stick.addEventListener("touchmove", moveMove, { passive: false });
    stick.addEventListener("touchend", endMove);
    stick.addEventListener("touchcancel", endMove);
    look.addEventListener("touchstart", startLook, { passive: false });
    look.addEventListener("touchmove", moveLook, { passive: false });
    look.addEventListener("touchend", endLook);
    look.addEventListener("touchcancel", endLook);
    return () => {
      stick.removeEventListener("touchstart", startMove);
      stick.removeEventListener("touchmove", moveMove);
      stick.removeEventListener("touchend", endMove);
      stick.removeEventListener("touchcancel", endMove);
      look.removeEventListener("touchstart", startLook);
      look.removeEventListener("touchmove", moveLook);
      look.removeEventListener("touchend", endLook);
      look.removeEventListener("touchcancel", endLook);
    };
  }, [game]);

  const btn =
    "select-none rounded-full border border-white/20 bg-black/50 backdrop-blur-sm text-[11px] uppercase tracking-widest text-stone-200 active:bg-red-900/70";

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div ref={lookRef} className="pointer-events-auto absolute inset-0" style={{ touchAction: "none" }} />
      <div
        ref={stickRef}
        className="pointer-events-auto absolute bottom-8 left-6 h-32 w-32 rounded-full border border-white/15 bg-black/40"
        style={{ touchAction: "none" }}
      >
        <div ref={knobRef} className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-stone-700/60" />
      </div>
      <div className="pointer-events-auto absolute bottom-8 right-5 grid grid-cols-2 gap-3">
        <button className={`${btn} h-16 w-16`} onTouchStart={onFlash}>
          💡 {flashlight ? "ON" : "OFF"}
        </button>
        <button className={`${btn} h-16 w-16 border-red-800/60 text-red-200`} onTouchStart={onInteract}>
          E
        </button>
        <button className={`${btn} h-14 w-16`} onTouchStart={onCrouch}>
          {crouched ? "wstań" : "kucnij"}
        </button>
        <button className={`${btn} h-14 w-16`} onTouchStart={onBattery}>
          bater.
        </button>
      </div>
    </div>
  );
}
