import { useCallback, useEffect, useRef, useState } from "react";
import { Game, HudState, ITEM_INFO, ItemId, IntroLine } from "./game/engine";
import { sound } from "./game/audio";
import TouchControls from "./ui/TouchControls";
import IntroOverlay from "./ui/IntroOverlay";
import MainMenu, { Diff } from "./ui/MainMenu";

type Phase = "idle" | "intro" | "playing" | "paused" | "caught" | "over" | "escaping" | "won";

const ALL_ITEMS: ItemId[] = ["key", "crowbar", "fuse", "padlock"];
const ITEM_ICON: Record<ItemId, string> = { key: "🗝️", crowbar: "🪓", fuse: "🔌", padlock: "🔓" };

function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [hud, setHud] = useState<HudState | null>(null);
  const [diff, setDiff] = useState<Diff>("normal");
  const [shadows, setShadows] = useState(true);
  const [sens, setSens] = useState(1);
  const [vol, setVol] = useState(0.8);
  const [ready, setReady] = useState(false);
  const [skipIntro, setSkipIntro] = useState(false);
  const [intro, setIntro] = useState<{ line: IntroLine | null; progress: number }>({ line: null, progress: 0 });
  const [seenIntro, setSeenIntro] = useState(false);

  useEffect(() => {
    if (!mountRef.current || gameRef.current) return;
    const g = new Game(mountRef.current);
    gameRef.current = g;
    g.onPhase = (p) => setPhase(p as Phase);
    g.onHud = (h) => setHud(h);
    g.onIntro = (line, progress) => setIntro({ line, progress });
    g.pushHud();
    setReady(true);
    return () => {
      g.dispose();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    sound.setVolume(vol);
  }, [vol]);

  useEffect(() => {
    gameRef.current?.setSensitivity(sens);
  }, [sens]);

  const start = useCallback(() => {
    sound.resume();
    sound.setVolume(vol);
    gameRef.current?.start(diff, shadows, sens, skipIntro);
    if (!skipIntro) setSeenIntro(true);
  }, [diff, shadows, sens, vol, skipIntro]);

  // retries after death/win skip the cutscene — you already know the house
  const restart = useCallback(() => {
    sound.resume();
    gameRef.current?.start(diff, shadows, sens, true);
  }, [diff, shadows, sens]);

  const skipCutscene = useCallback(() => gameRef.current?.skipIntro(), []);

  const toMenu = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    sound.stopAmbient();
    g.phase = "idle";
    setPhase("idle");
    g.pushHud();
  }, []);

  const resume = useCallback(() => {
    sound.resume();
    gameRef.current?.resume();
  }, []);

  const interact = useCallback(() => gameRef.current?.interact(), []);
  const toggleFlash = useCallback(() => gameRef.current?.toggleFlashlight(), []);
  const toggleCrouch = useCallback(() => {
    const g = gameRef.current;
    if (g) g.keys["KeyC"] = true;
    setTimeout(() => {
      if (g) g.keys["KeyC"] = false;
    }, 90);
  }, []);
  const swapBattery = useCallback(() => gameRef.current?.swapBattery(), []);

  const isTouch = gameRef.current?.isTouch ?? false;
  const dread = hud?.dread ?? 0;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={mountRef} className="absolute inset-0" onClick={() => phase === "playing" && gameRef.current?.requestLock()} />

      {/* ---------------- atmosphere overlays ---------------- */}
      <div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity"
        style={{
          opacity: phase === "caught" ? 0.9 : dread * 0.45,
          background: "radial-gradient(ellipse at center, rgba(120,0,0,0) 30%, rgba(130,10,10,0.55) 75%, rgba(60,0,0,0.95) 100%)",
        }}
      />
      {hud?.hidden && hud.hideType === "wardrobe" && phase === "playing" && (
        <div className="pointer-events-none absolute inset-0 z-20 wardrobe-slats opacity-90" />
      )}
      {hud?.hidden && hud.hideType !== "wardrobe" && phase === "playing" && (
        <div className="pointer-events-none absolute inset-0 z-20 bg-black/55" />
      )}

      {/* ---------------- intro cutscene ---------------- */}
      {phase === "intro" && <IntroOverlay line={intro.line} progress={intro.progress} onSkip={skipCutscene} />}

      {/* pointer-lock hint after the cutscene */}
      {phase === "playing" && hud && !hud.locked && (
        <div className="pointer-events-none absolute inset-x-0 top-[18%] z-20 flex justify-center">
          <div className="fade-up rounded border border-red-900/60 bg-black/75 px-5 py-2 font-mono text-xs uppercase tracking-[0.3em] text-stone-300">
            kliknij, aby przejąć kontrolę
          </div>
        </div>
      )}

      {/* ---------------- HUD ---------------- */}
      {(phase === "playing" || phase === "caught" || phase === "escaping") && hud && (
        <div className="pointer-events-none absolute inset-0 z-20 select-none">
          {/* crosshair */}
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />

          {/* top-left */}
          <div className="absolute left-4 top-4 space-y-1">
            <div className="horror-title text-2xl text-red-700/90 drop-shadow-[0_0_10px_rgba(180,0,0,0.5)]">
              NOC {hud.nights}
              <span className="text-sm text-stone-500"> / {hud.maxNights}</span>
            </div>
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-400/80">{hud.room}</div>
            <div className="font-mono text-[11px] text-stone-500">{fmtTime(hud.time)}</div>
          </div>

          {/* top-right: objective */}
          <div className="absolute right-4 top-4 w-56 space-y-1.5 text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-stone-500">Drzwi wyjściowe</div>
            <div className="flex justify-end gap-1.5">
              {ALL_ITEMS.map((id) => {
                const got = hud.items.includes(id);
                return (
                  <div
                    key={id}
                    title={ITEM_INFO[id].name}
                    className={`flex h-9 w-9 items-center justify-center rounded border text-base ${
                      got
                        ? "border-emerald-700/70 bg-emerald-950/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                        : "border-stone-800 bg-black/50 opacity-40 grayscale"
                    }`}
                  >
                    {ITEM_ICON[id]}
                  </div>
                );
              })}
            </div>
            <div className="font-mono text-[10px] text-stone-500">
              zabezpieczenia: <span className={hud.locks === 0 ? "text-emerald-400" : "text-red-400"}>{hud.locks}</span> / 4
            </div>
            <div className="font-mono text-[10px] text-stone-600">🔋 ×{hud.batteries}</div>
          </div>

          {/* bottom-left: bars */}
          <div className="absolute bottom-5 left-4 w-44 space-y-2">
            <Bar label="SIŁA" value={hud.stamina} color={hud.stamina < 25 ? "#b91c1c" : "#a8a29e"} />
            <Bar label="LATARKA" value={hud.battery} color={hud.flashlight ? (hud.battery < 20 ? "#b45309" : "#eab308") : "#3f3f46"} />
          </div>

          {/* prompt */}
          {hud.prompt && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded border border-stone-700/60 bg-black/70 px-4 py-1.5 font-mono text-xs tracking-wide text-stone-200">
              {hud.prompt}
            </div>
          )}

          {/* message */}
          {hud.message && (
            <div className="fade-up absolute bottom-40 left-1/2 max-w-md -translate-x-1/2 text-center text-sm text-amber-100/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
              {hud.message}
            </div>
          )}

          {/* state badges */}
          <div className="absolute bottom-5 right-4 flex flex-col items-end gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
            {hud.crouched && <span className="text-stone-300">skulony</span>}
            {hud.hidden && <span className="text-emerald-400">ukryty</span>}
            {!isTouch && <span className="text-stone-600">esc — pauza</span>}
          </div>
        </div>
      )}

      {/* ---------------- touch controls ---------------- */}
      {isTouch && phase === "playing" && gameRef.current && (
        <TouchControls
          game={gameRef.current}
          onInteract={interact}
          onFlash={toggleFlash}
          onCrouch={toggleCrouch}
          onBattery={swapBattery}
          crouched={hud?.crouched ?? false}
          flashlight={hud?.flashlight ?? false}
        />
      )}

      {/* ---------------- caught flash ---------------- */}
      {phase === "caught" && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <div className="dread-pulse absolute inset-0 bg-red-900/40" />
          <div className="shake horror-title text-6xl text-red-600 drop-shadow-[0_0_30px_rgba(200,0,0,0.8)] md:text-8xl">
            ZŁAPANY!
          </div>
        </div>
      )}

      {/* ---------------- menu ---------------- */}
      {phase === "idle" && (
        <MainMenu
          ready={ready}
          diff={diff}
          setDiff={setDiff}
          sens={sens}
          setSens={setSens}
          vol={vol}
          setVol={setVol}
          shadows={shadows}
          setShadows={setShadows}
          skipIntro={skipIntro}
          setSkipIntro={setSkipIntro}
          seenIntro={seenIntro}
          onStart={start}
        />
      )}

      {/* ---------------- pause ---------------- */}
      {phase === "paused" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
          <div className="panel fade-up w-full max-w-sm p-6 text-center">
            <div className="horror-title text-4xl text-stone-200">pauza</div>
            <div className="mt-2 font-mono text-[11px] text-stone-500">noc {hud?.nights ?? 1} / {hud?.maxNights ?? 5}</div>
            <button onClick={resume} className="btn-horror horror-title mt-6 w-full rounded py-3 text-xl text-red-400">
              wróć do gry
            </button>
            <div className="mt-4 space-y-3">
              <Slider label="Czułość myszy" value={sens} min={0.3} max={2.5} step={0.1} onChange={setSens} />
              <Slider label="Głośność" value={vol} min={0} max={1} step={0.05} onChange={setVol} />
            </div>
            <button onClick={toMenu} className="mt-5 w-full rounded border border-stone-800 py-2 font-mono text-xs uppercase tracking-[0.2em] text-stone-500 hover:text-stone-300">
              wróć do menu
            </button>
          </div>
        </div>
      )}

      {/* ---------------- game over ---------------- */}
      {phase === "over" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/92 p-4">
          <div className="fade-up text-center">
            <div className="horror-title text-6xl text-red-700 drop-shadow-[0_0_30px_rgba(160,0,0,0.6)] md:text-7xl">koniec gry</div>
            <p className="mt-4 max-w-md text-sm text-stone-400">
              Zostałeś w tym domu na zawsze. Pięć nocy to było wszystko, co dostałeś.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={restart} className="btn-horror horror-title rounded px-6 py-3 text-xl text-red-400">
                spróbuj ponownie
              </button>
              <button onClick={toMenu} className="btn-horror horror-title rounded px-6 py-3 text-xl text-stone-300">
                menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- victory ---------------- */}
      {phase === "won" && hud && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-gradient-to-b from-black/90 to-emerald-950/50 p-4">
          <div className="fade-up text-center">
            <div className="horror-title text-5xl text-emerald-300 drop-shadow-[0_0_25px_rgba(16,185,129,0.5)] md:text-7xl">
              uciekłeś
            </div>
            <p className="mt-4 text-sm text-stone-300">Drzwi stanęły otworem. Za tobą został tylko jej szept.</p>
            <div className="mt-6 flex justify-center gap-8 font-mono text-xs uppercase tracking-[0.2em] text-stone-400">
              <div>
                noce: <span className="text-emerald-300">{hud.nights}</span>/{hud.maxNights}
              </div>
              <div>
                czas: <span className="text-emerald-300">{fmtTime(hud.time)}</span>
              </div>
              <div>
                przedmioty: <span className="text-emerald-300">{hud.items.length}</span>/4
              </div>
            </div>
            <div className="mt-7 flex justify-center gap-3">
              <button onClick={restart} className="btn-horror horror-title rounded px-6 py-3 text-xl text-emerald-300">
                zagraj ponownie
              </button>
              <button onClick={toMenu} className="btn-horror horror-title rounded px-6 py-3 text-xl text-stone-300">
                menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-stone-500">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full border border-stone-800/80 bg-black/70">
        <div className="h-full transition-all duration-200" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-red-700"
      />
    </label>
  );
}
