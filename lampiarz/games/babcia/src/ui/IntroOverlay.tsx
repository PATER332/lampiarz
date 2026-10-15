import { useEffect, useState } from "react";
import type { IntroLine } from "../game/engine";

interface Props {
  line: IntroLine | null;
  progress: number;
  onSkip: () => void;
}

/** Letterboxed cutscene overlay with typewriter subtitles. */
export default function IntroOverlay({ line, progress, onSkip }: Props) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (!line) {
      setShown("");
      return;
    }
    setShown("");
    const text = line.text;
    const speed = Math.max(18, Math.min(60, (line.dur * 650) / text.length));
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [line]);

  const granny = line?.speaker === "BABCIA";

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* letterbox */}
      <div className="absolute inset-x-0 top-0 h-[11vh] bg-black" />
      <div className="absolute inset-x-0 bottom-0 h-[11vh] bg-black" />

      {/* chapter card at the very start */}
      {progress < 0.06 && (
        <div className="fade-up absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.5em] text-stone-500">noc pierwsza</div>
          <div className="horror-title mt-2 text-3xl tracking-[0.2em] text-stone-300 md:text-5xl">PRZEBUDZENIE</div>
        </div>
      )}

      {/* subtitle */}
      {line && (
        <div className="absolute inset-x-0 bottom-[13vh] flex justify-center px-6">
          <div className="max-w-2xl text-center">
            <div
              className={`font-mono text-[10px] uppercase tracking-[0.35em] ${
                granny ? "text-red-500/90" : "text-stone-400"
              }`}
            >
              {line.speaker}
            </div>
            <div
              className={`mt-1 text-lg leading-snug drop-shadow-[0_2px_8px_rgba(0,0,0,1)] md:text-2xl ${
                granny ? "italic text-stone-100" : "text-stone-300"
              }`}
              style={granny ? { textShadow: "0 0 18px rgba(180,20,10,0.35)" } : undefined}
            >
              {shown}
              <span className="animate-pulse text-stone-500">{shown.length < line.text.length ? "▌" : ""}</span>
            </div>
          </div>
        </div>
      )}

      {/* progress line + skip */}
      <div className="absolute bottom-[3vh] left-1/2 w-56 -translate-x-1/2">
        <div className="h-px w-full bg-stone-800">
          <div className="h-px bg-red-800/80 transition-all duration-300" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      </div>
      <button
        onClick={onSkip}
        className="pointer-events-auto absolute bottom-[3vh] right-6 rounded border border-stone-800 bg-black/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-stone-500 hover:border-red-900 hover:text-stone-200"
      >
        pomiń <span className="kbd ml-1">enter</span>
      </button>
    </div>
  );
}
