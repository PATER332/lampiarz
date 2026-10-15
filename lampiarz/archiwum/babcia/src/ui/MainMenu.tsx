import { useEffect, useState } from "react";

export type Diff = "easy" | "normal" | "hard";

interface Props {
  ready: boolean;
  diff: Diff;
  setDiff: (d: Diff) => void;
  sens: number;
  setSens: (v: number) => void;
  vol: number;
  setVol: (v: number) => void;
  shadows: boolean;
  setShadows: (v: boolean) => void;
  skipIntro: boolean;
  setSkipIntro: (v: boolean) => void;
  seenIntro: boolean;
  onStart: () => void;
}

const DIFFS: Record<
  Diff,
  { label: string; sub: string; desc: string; speed: number; senses: number; mercy: number; tag?: string }
> = {
  easy: {
    label: "Spokojna",
    sub: "na rozgrzewkę",
    desc: "Wolno szura kapciami, słabo słyszy i źle widzi w ciemności. Dobra do nauki domu.",
    speed: 2,
    senses: 2,
    mercy: 5,
  },
  normal: {
    label: "Babcia",
    sub: "tak, jak ma być",
    desc: "Zrównoważone polowanie. Każdy hałas ma znaczenie, każde drzwi mogą skrzypnąć w złym momencie.",
    speed: 3,
    senses: 3,
    mercy: 3,
    tag: "polecane",
  },
  hard: {
    label: "Wściekła",
    sub: "bez litości",
    desc: "Szybka, czujna i pamiętliwa. Zobaczy błysk latarki z drugiego końca korytarza.",
    speed: 5,
    senses: 5,
    mercy: 1,
  },
};

const RULES = [
  "Babcia słyszy wszystko. Chodź powoli, kucaj, omijaj skrzypiące deski.",
  "Latarka zdradza. Jej snop widać z daleka — gaś ją, gdy ona jest blisko.",
  "Szafa, łóżko, stół. Schowaj się, zanim cię zobaczy — nie po tym.",
  "Cztery zabezpieczenia, cztery przedmioty. Pięć nocy. Potem już nie wyjdziesz.",
];

export default function MainMenu(p: Props) {
  const [tab, setTab] = useState<"play" | "settings" | "controls">("play");
  const [rule, setRule] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setRule((r) => (r + 1) % RULES.length), 5200);
    return () => window.clearInterval(id);
  }, []);

  const d = DIFFS[p.diff];

  return (
    <div className="absolute inset-0 z-40 overflow-hidden">
      {/* backdrop: dark gradient + animated red breathing glow at the bottom */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 to-black/40" />
      <div className="menu-glow pointer-events-none absolute -bottom-40 left-1/4 h-[60vh] w-[60vw] rounded-full" />
      <div className="menu-drips pointer-events-none absolute inset-x-0 top-0 h-40" />
      <div className="pointer-events-none absolute inset-0 scanlines opacity-30" />

      <div className="relative flex h-full w-full flex-col justify-between p-5 md:p-10 lg:flex-row lg:items-stretch lg:gap-10">
        {/* ---------- LEFT: title + primary actions ---------- */}
        <div className="flex max-w-xl flex-col justify-center">
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.5em] text-red-800">
            <span className="h-px w-8 bg-red-900" />
            horror 3d · noc za nocą
          </div>
          <h1 className="horror-title menu-title mt-3 text-[22vw] leading-[0.82] text-red-700 md:text-[9rem] lg:text-[10rem]">
            BAB
            <span className="menu-title-cia">CIA</span>
          </h1>
          <div className="horror-title mt-1 text-base tracking-[0.42em] text-stone-400 md:text-xl">DOM BEZ WYJŚCIA</div>

          <div className="mt-6 h-12 overflow-hidden border-l-2 border-red-900/60 pl-3">
            <p key={rule} className="fade-up text-sm leading-snug text-stone-400 md:text-[15px]">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-red-700/80">zasada {rule + 1} </span>
              <br className="md:hidden" />
              {RULES[rule]}
            </p>
          </div>

          {/* nav */}
          <nav className="mt-8 flex flex-col gap-2">
            {(
              [
                ["play", "Rozpocznij noc"],
                ["settings", "Ustawienia"],
                ["controls", "Sterowanie"],
              ] as const
            ).map(([k, label], i) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`menu-nav group flex items-center gap-4 py-1.5 text-left ${tab === k ? "is-active" : ""}`}
              >
                <span className="font-mono text-[10px] text-stone-600">0{i + 1}</span>
                <span className="horror-title text-2xl tracking-[0.12em] text-stone-400 transition-colors group-hover:text-stone-100 md:text-3xl">
                  {label}
                </span>
                <span className="menu-nav-line h-px flex-1 bg-stone-800" />
                <span className="menu-nav-arrow text-red-600">▸</span>
              </button>
            ))}
          </nav>
        </div>

        {/* ---------- RIGHT: tab panel ---------- */}
        <div className="mt-6 flex w-full flex-col justify-center lg:mt-0 lg:max-w-md">
          <div className="menu-panel fade-up p-5 md:p-6" key={tab}>
            {tab === "play" && (
              <>
                <PanelHead title="Wybierz babcię" sub="poziom trudności" />
                <div className="mt-4 space-y-2">
                  {(Object.keys(DIFFS) as Diff[]).map((k) => {
                    const it = DIFFS[k];
                    const active = p.diff === k;
                    return (
                      <button
                        key={k}
                        onClick={() => p.setDiff(k)}
                        className={`diff-card w-full rounded-sm px-4 py-3 text-left ${active ? "is-active" : ""}`}
                      >
                        <div className="flex items-baseline justify-between">
                          <div className="flex items-baseline gap-2">
                            <span className="horror-title text-xl text-stone-100">{it.label}</span>
                            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">{it.sub}</span>
                          </div>
                          {it.tag && (
                            <span className="rounded-sm border border-red-800/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-red-400">
                              {it.tag}
                            </span>
                          )}
                        </div>
                        {active && <p className="fade-up mt-1.5 text-[12px] leading-snug text-stone-400">{it.desc}</p>}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <Stat label="szybkość" value={d.speed} />
                  <Stat label="zmysły" value={d.senses} />
                  <Stat label="litość" value={d.mercy} good />
                </div>

                <button
                  disabled={!p.ready}
                  onClick={p.onStart}
                  className="btn-enter horror-title mt-6 w-full rounded-sm py-4 text-2xl tracking-[0.15em] text-red-100 disabled:opacity-40"
                >
                  <span className="relative z-10">{p.ready ? "wejdź do domu" : "ładowanie..."}</span>
                </button>
                <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
                  <input
                    type="checkbox"
                    checked={p.skipIntro}
                    onChange={(e) => p.setSkipIntro(e.target.checked)}
                    className="accent-red-700"
                  />
                  pomiń scenkę wstępną{p.seenIntro ? "" : " · warto obejrzeć"}
                </label>
              </>
            )}

            {tab === "settings" && (
              <>
                <PanelHead title="Ustawienia" sub="dostrój koszmar" />
                <div className="mt-5 space-y-5">
                  <Slider label="Czułość myszy" value={p.sens} min={0.3} max={2.5} step={0.1} onChange={p.setSens} />
                  <Slider label="Głośność" value={p.vol} min={0} max={1} step={0.05} onChange={p.setVol} />
                  <Toggle
                    label="Cienie dynamiczne"
                    hint="Wyłącz, jeśli gra się tnie."
                    checked={p.shadows}
                    onChange={p.setShadows}
                  />
                  <Toggle
                    label="Pomiń scenkę wstępną"
                    hint="Powtórki po śmierci pomijają ją automatycznie."
                    checked={p.skipIntro}
                    onChange={p.setSkipIntro}
                  />
                </div>
                <div className="mt-6 rounded-sm border border-stone-800/70 bg-black/40 p-3 font-mono text-[10px] leading-relaxed text-stone-500">
                  🎧 Gra używa dźwięku przestrzennego. Słuchawki pozwolą usłyszeć, <em>z której strony</em> idzie.
                </div>
                <button onClick={() => setTab("play")} className="menu-back mt-5">
                  ◂ wróć
                </button>
              </>
            )}

            {tab === "controls" && (
              <>
                <PanelHead title="Sterowanie" sub="klawiatura i mysz" />
                <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 font-mono text-[12px] text-stone-300">
                  <Keys k={["W", "A", "S", "D"]} /> <span>ruch</span>
                  <Keys k={["mysz"]} /> <span>rozglądanie</span>
                  <Keys k={["shift"]} /> <span>bieg — głośny, zużywa siłę</span>
                  <Keys k={["C"]} /> <span>kucanie — cicho, wolno</span>
                  <Keys k={["E"]} /> <span>podnieś · drzwi · schowaj się</span>
                  <Keys k={["F"]} /> <span>latarka</span>
                  <Keys k={["R"]} /> <span>wymień baterię</span>
                  <Keys k={["esc"]} /> <span>pauza</span>
                </div>
                <div className="mt-5 space-y-1.5 border-t border-stone-800/70 pt-4 text-[12px] leading-snug text-stone-400">
                  <p>
                    <span className="text-stone-200">Cel:</span> znajdź <span className="text-amber-200">łom</span>,{" "}
                    <span className="text-stone-200">klucz do kłódki</span>, <span className="text-cyan-200">bezpiecznik</span> i{" "}
                    <span className="text-yellow-200">klucz główny</span>, potem użyj ich na drzwiach wyjściowych w przybudówce.
                  </p>
                  <p>Na telefonie: lewy joystick to ruch, przeciągnięcie po ekranie to rozglądanie.</p>
                </div>
                <button onClick={() => setTab("play")} className="menu-back mt-5">
                  ◂ wróć
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* footer */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-between px-5 font-mono text-[9px] uppercase tracking-[0.3em] text-stone-700 md:px-10">
        <span>v1.0 · dźwięk i grafika generowane proceduralnie</span>
        <span className="hidden md:inline">gra zawiera jumpscare · użyj słuchawek</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- bits
function PanelHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-end justify-between border-b border-stone-800/80 pb-2">
      <div className="horror-title text-2xl tracking-[0.1em] text-stone-100">{title}</div>
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-red-700/80">{sub}</div>
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: number; good?: boolean }) {
  return (
    <div>
      <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.25em] text-stone-500">{label}</div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-sm transition-colors ${
              i <= value ? (good ? "bg-emerald-700" : "bg-red-700") : "bg-stone-800"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function Keys({ k }: { k: string[] }) {
  return (
    <span className="flex gap-0.5">
      {k.map((x) => (
        <span key={x} className="kbd">
          {x}
        </span>
      ))}
    </span>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 text-left">
      <div>
        <div className="text-sm text-stone-200">{label}</div>
        {hint && <div className="text-[11px] text-stone-500">{hint}</div>}
      </div>
      <span className={`toggle ${checked ? "is-on" : ""}`}>
        <span className="toggle-knob" />
      </span>
    </button>
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
      <div className="mb-1.5 flex justify-between font-mono text-[10px] uppercase tracking-[0.25em] text-stone-500">
        <span>{label}</span>
        <span className="text-stone-300">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="menu-range w-full"
      />
    </label>
  );
}
