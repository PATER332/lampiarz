import { useEffect, type ReactNode } from 'react';
import type { Settings } from '../game/types';
import type { AudioEngine } from '../game/audio';

export function Panel({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(2,4,10,0.55)', animation: 'fadeIn .25s ease both' }} onClick={onClose}>
      <div className={`panel w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} max-h-[90vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="panel-title text-lg sm:text-xl">{title}</h2>
          <button className="btn px-3! py-1! text-sm" onClick={onClose} aria-label="Zamknij">✕</button>
        </div>
        <div className="divider mx-6" />
        <div className="px-6 py-5 overflow-y-auto scroll-thin text-[1.05rem] leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex justify-between text-sm tracking-[0.2em] uppercase text-cyan-100/80 mb-2">
        <span>{label}</span>
        <span className="font-pixel text-[10px] text-cyan-200">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range" min={0} max={1} step={0.01} value={value} className="slider"
        style={{ ['--pct' as string]: `${value * 100}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

function Toggle({ label, value, onChange, desc }: { label: string; value: boolean; onChange: (v: boolean) => void; desc?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm tracking-[0.2em] uppercase text-cyan-100/80">{label}</div>
        {desc && <div className="text-xs text-slate-400">{desc}</div>}
      </div>
      <button className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-pressed={value} aria-label={label} />
    </div>
  );
}

export function SettingsPanel({ settings, onChange, onClose, onResetSave, hasSave, audio }: {
  settings: Settings; onChange: (s: Settings) => void; onClose: () => void; onResetSave?: () => void; hasSave: boolean; audio: AudioEngine;
}) {
  const set = (p: Partial<Settings>) => onChange({ ...settings, ...p });
  return (
    <Panel title="Ustawienia" onClose={onClose}>
      <div className="space-y-6">
        <Slider label="Głośność ogólna" value={settings.master} onChange={(v) => set({ master: v })} />
        <Slider label="Efekty dźwiękowe" value={settings.sfx} onChange={(v) => { set({ sfx: v }); audio.play('uiClick'); }} />
        <Slider label="Dźwięki otoczenia" value={settings.ambient} onChange={(v) => set({ ambient: v })} />
        <Slider label="Muzyka" value={settings.music} onChange={(v) => set({ music: v })} />
        <Toggle label="Wycisz wszystko" value={settings.muted} onChange={(v) => set({ muted: v })} />
        <Toggle label="Wstrząsy ekranu" value={settings.shake} onChange={(v) => set({ shake: v })} desc="Delikatne drgania kamery przy obrażeniach i mechanizmach." />
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm tracking-[0.2em] uppercase text-cyan-100/80">Sterowanie dotykowe</div>
            <div className="text-xs text-slate-400">Przyciski ekranowe dla telefonów i tabletów.</div>
          </div>
          <div className="flex gap-1">
            {(['auto', 'on', 'off'] as const).map((v) => (
              <button key={v} className={`btn px-3! py-1! text-xs ${settings.touch === v ? 'btn-primary' : ''}`} onClick={() => set({ touch: v })}>
                {v === 'auto' ? 'Auto' : v === 'on' ? 'Wł.' : 'Wył.'}
              </button>
            ))}
          </div>
        </div>
        {onResetSave && (
          <div className="pt-4 border-t border-cyan-200/10 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm tracking-[0.2em] uppercase text-rose-200/80">Zapis gry</div>
              <div className="text-xs text-slate-400">Usuwa postęp, ulepszenia i punkt kontrolny.</div>
            </div>
            <button className="btn btn-danger text-xs" disabled={!hasSave} onClick={() => { if (confirm('Na pewno usunąć zapis gry?')) onResetSave(); }}>Usuń zapis</button>
          </div>
        )}
      </div>
    </Panel>
  );
}

const CONTROLS: Array<[string[], string]> = [
  [['A', 'D'], 'Ruch w lewo / prawo (również strzałki ← →)'],
  [['SPACJA'], 'Skok — przytrzymaj dłużej, by skoczyć wyżej (W / ↑ też działa)'],
  [['S', '+', 'SPACJA'], 'Zeskok z półki jednokierunkowej'],
  [['Q'], 'Rozpocznij nagrywanie / zakończ i przywołaj echo'],
  [['E'], 'Interakcja: dźwignie, ołtarz ulepszeń'],
  [['R'], 'Rozprosz wszystkie echa (lub przerwij nagrywanie)'],
  [['F'], 'Pamięć echa — ponowne przywołanie ostatniego nagrania (po ulepszeniu)'],
  [['SHIFT'], 'Dash (tylko Szept) — zryw z nietykalnością; także X lub K'],
  [['Q'], 'Szept: zapuść Kotwicę Cienia, a ponownie — skocz do niej'],
  [['C'], 'Zmiana postaci (po odblokowaniu Szept)'],
  [['ESC'], 'Pauza / powrót'],
];

export function ControlsPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel title="Sterowanie" onClose={onClose} wide>
      <div className="grid gap-3">
        {CONTROLS.map(([keys, desc], i) => (
          <div key={i} className="flex items-center gap-4" style={{ animation: `fadeUp .4s ease both`, animationDelay: `${i * 50}ms` }}>
            <div className="flex items-center gap-1 min-w-[150px]">
              {keys.map((k, j) => k === '+' ? <span key={j} className="text-cyan-200/60 px-1">+</span> : <span key={j} className="kbd">{k}</span>)}
            </div>
            <div className="text-slate-200">{desc}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 p-4 border border-cyan-300/15 bg-cyan-400/5 text-sm text-cyan-50/80 leading-relaxed">
        <div className="font-pixel text-[10px] text-cyan-200 mb-2">JAK DZIAŁA ECHO</div>
        Naciśnij <span className="kbd">Q</span>, a gra zacznie zapisywać Twoje ruchy, skoki i interakcje. Naciśnij <span className="kbd">Q</span> ponownie —
        w miejscu, gdzie zacząłeś nagranie, pojawi się półprzezroczyste echo i odtworzy wszystko krok po kroku, a potem przez chwilę pozostanie w miejscu,
        gdzie skończyłeś. Echa naciskają płyty i pociągają dźwignie, ale nie zbierają kryształów, kluczy ani nie używają ołtarzy. Pamiętaj: echo powtarza też
        Twoje <em>czekanie</em> — to klucz do zagadek z limitem czasu.
      </div>
      <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm text-slate-300">
        {[
          ['Pryzmat', 'Echo przechodzące przez pryzmat zostawia lustrzane ODBICIE po drugiej stronie.'],
          ['Zasłony', 'Błękitna zatrzymuje żywych, przepuszcza echa. Bursztynowa rozprasza echa, Ciebie przepuszcza.'],
          ['Grzyb i prąd', 'Grzyb sprężysty wyrzuca Cię w górę, a prąd zarodników unosi, póki w nim płyniesz.'],
          ['Winda echa', 'Jedzie, dopóki płyta jest wciśnięta. Zostaw echo i wsiadaj.'],
          ['Klucze i szczeliny', 'Klucz Pamięci otwiera zamek na stałe. Szczeliny teleportują między bliźniaczymi punktami.'],
          ['Widmo i Żarłacz', 'Widmo rusza się tylko, gdy nie patrzysz. Żarłacz kłapie z opóźnieniem — zdepcz go, gdy jest spokojny.'],
        ].map(([k, v]) => (
          <div key={k} className="border border-cyan-300/10 bg-cyan-400/5 px-3 py-2">
            <div className="font-pixel text-[8px] text-cyan-200 mb-1 uppercase">{k}</div>
            <div className="leading-snug">{v}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function AboutPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel title="O grze" onClose={onClose}>
      <div className="space-y-4 text-slate-200">
        <p>
          <span className="font-title text-cyan-100 tracking-[0.2em]">ECHOBOUND</span> to pixelartowa platformówka o eksploracji, przetrwaniu i zagadkach.
          Budzisz się w podziemnym świecie, w którym rzeczywistość przechowuje ślady przeszłych wydarzeń — a Ty potrafisz je przywoływać.
        </p>
        <p>
          Przemierz siedem połączonych obszarów: <b>Zapomnianą Jaskinię</b>, <b>Kryształowe Ruiny</b>, <b>Zatopione Archiwum</b>, <b>Ogrody Rezonansu</b>,
          <b> Kuźnię Widm</b>, <b>Pękniętą Wieżę</b> i <b>Serce Podziemi</b>. Omijaj Cienie, usypiaj Strażników Ruin, przechytrz Pożeraczy Ech,
          nie spuszczaj Widm z oczu i dotrzyj do Rdzenia.
        </p>
        <p>
          Zbieraj kryształy i wydawaj je przy ołtarzach na ulepszenia: dłuższe nagrania, więcej ech, wyższy skok, szybszy bieg, szybsze odnowienie i pamięć echa.
        </p>
        <div className="divider" />
        <p className="text-sm text-slate-400">
          Cała grafika i wszystkie dźwięki są generowane proceduralnie w przeglądarce (Canvas 2D + Web Audio API). Postęp zapisywany jest lokalnie w Twojej przeglądarce.
          Gra nie wymaga konta, instalacji ani połączenia z serwerem.
        </p>
        <p className="font-pixel text-[9px] text-cyan-300/70">ECHOBOUND v1.0 · stworzono z miłości do podziemi</p>
      </div>
    </Panel>
  );
}
