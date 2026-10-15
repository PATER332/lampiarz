import type { HudState } from '../game/types';

function Heart({ full, low }: { full: boolean; low: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`heart ${low && full ? 'low' : ''}`} shapeRendering="crispEdges">
      <path d="M2 3h3v1h1v1h4V4h1V3h3v1h1v4h-1v1h-1v1h-1v1h-1v1h-1v1H8v1H7v-1H6v-1H5v-1H4v-1H3V9H2V8H1V4h1z" fill={full ? '#ff4d6d' : '#2a1a24'} />
      {full && <path d="M3 4h2v1H4v1H3z" fill="#ffb3c1" />}
    </svg>
  );
}

export function CrystalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 14" className={className} shapeRendering="crispEdges">
      <path d="M4 0h2v1h1v2h1v2h1v3H8v2H7v2H6v2H4v-2H3v-2H2V8H1V5h1V3h1V1h1z" fill="#1b7fa0" />
      <path d="M4 1h1v11H4V9H3V7H2V5h1V3h1z" fill="#c6fbff" />
      <path d="M5 1h1v2h1v2h1v2H7v2H6v3H5z" fill="#4fd8f0" />
    </svg>
  );
}

export function HUD({ hud, touch }: { hud: HudState; touch: boolean }) {
  const weaver = hud.character === 'weaver';
  const energyPct = Math.max(0, Math.min(100, (hud.energy / hud.maxEnergy) * 100));
  const recPct = hud.recording ? Math.min(100, (hud.recTime / hud.recMax) * 100) : 0;
  return (
    <div className="fixed inset-0 pointer-events-none z-20 font-ui">
      {/* top-left: vitals */}
      <div className="absolute left-3 top-3 sm:left-5 sm:top-5 flex flex-col gap-2">
        <div className="hud-card px-3 py-2 sm:px-4 sm:py-3 flex flex-col gap-2 min-w-[220px]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {Array.from({ length: hud.maxHp }).map((_, i) => <Heart key={i} full={i < hud.hp} low={hud.hp <= 1} />)}
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-cyan-50">
              <CrystalIcon className="w-3 h-4" />
              <span className="font-pixel text-[11px] tabular-nums">{hud.crystals}</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[10px] tracking-[0.25em] uppercase text-cyan-100/70 mb-1">
              <span className="flex items-center gap-2">
                {hud.recording ? <><span className="rec-dot" /><span className="text-rose-300">Nagrywanie {hud.recTime.toFixed(1)}s / {hud.recMax}s</span></> : <span>{weaver ? 'Energia cienia' : 'Energia echa'}</span>}
              </span>
              <span className="font-pixel text-[9px]">{hud.energy.toFixed(1)}s</span>
            </div>
            <div className="energy-track">
              <div className={`energy-fill ${hud.recording ? 'rec' : hud.lowEnergy ? 'low' : ''}`} style={{ width: `${hud.recording ? Math.max(0, energyPct) : energyPct}%`, ...(weaver && !hud.recording && !hud.lowEnergy ? { background: 'linear-gradient(90deg, #7a3fc0, #c9a6ff)', boxShadow: '0 0 10px rgba(201,166,255,0.6)' } : {}) }} />
              {hud.recording && <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${recPct}%` }} />}
            </div>
          </div>

          {!weaver ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] tracking-[0.25em] uppercase text-cyan-100/70">Echa</span>
              <div className="flex gap-1">
                {Array.from({ length: hud.maxEchoes }).map((_, i) => <div key={i} className={`echo-slot ${i < hud.echoes ? 'on' : ''}`} />)}
              </div>
              <span className="font-pixel text-[9px] text-cyan-200/80 ml-auto">{hud.echoes}/{hud.maxEchoes}</span>
              {hud.reflections > 0 && <span className="font-pixel text-[8px] px-1.5 py-0.5 border border-fuchsia-300/60 text-fuchsia-200" title="Odbicia z pryzmatu">+{hud.reflections}</span>}
              {hud.memory && <span className={`font-pixel text-[8px] px-1.5 py-0.5 border ${hud.hasMemory ? 'border-violet-300/60 text-violet-200' : 'border-slate-500/40 text-slate-500'}`}>F</span>}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[10px] tracking-[0.25em] uppercase text-violet-100/80 w-[68px]">Kotwica</span>
                {hud.anchor >= 0 ? (
                  <>
                    <div className="flex-1 h-1.5 bg-violet-950/70 border border-violet-300/30 overflow-hidden">
                      <div className="h-full" style={{ width: `${hud.anchor * 100}%`, background: hud.anchor < 0.25 ? '#ff7a6b' : 'linear-gradient(90deg,#8a4ad0,#e0ccff)' }} />
                    </div>
                    <span className="font-pixel text-[8px] text-violet-200">Q</span>
                  </>
                ) : (
                  <span className="text-[11px] text-slate-400 tracking-wide">gotowa — <b className="text-violet-200">Q</b> zapuść</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] tracking-[0.25em] uppercase text-amber-100/80 w-[68px]">Dash</span>
                <div className="flex gap-1">
                  {Array.from({ length: hud.maxDashes }).map((_, i) => (
                    <div
                      key={i}
                      className="w-4 h-2.5 border"
                      style={{
                        borderColor: i < hud.dashes ? 'rgba(255,200,120,0.9)' : 'rgba(255,200,120,0.25)',
                        background: i < hud.dashes ? 'linear-gradient(90deg,#ff9a3c,#ffe2b0)' : 'rgba(255,200,120,0.06)',
                        boxShadow: i < hud.dashes ? '0 0 8px rgba(255,170,80,0.6)' : 'none',
                        transform: 'skewX(-18deg)',
                      }}
                    />
                  ))}
                </div>
                <span className="font-pixel text-[8px] text-amber-200/90 ml-auto">SHIFT</span>
              </div>
            </>
          )}

          {hud.keys > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] tracking-[0.25em] uppercase text-amber-100/80">Klucze</span>
              <div className="flex gap-1">
                {Array.from({ length: hud.keys }).map((_, i) => (
                  <svg key={i} viewBox="0 0 12 7" className="w-5 h-3" shapeRendering="crispEdges">
                    <path d="M0 0h5v5H0zM5 2h7v2H5zM8 4h1v2H8zM10 4h1v2h-1z" fill="#8a6a1a" />
                    <path d="M1 1h3v3H1zM5 2h6v1H5z" fill="#ffd166" />
                    <path d="M2 2h1v1H2z" fill="#1a1c2c" />
                  </svg>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* top-right: area + character + hints */}
      <div className={`absolute right-3 top-3 sm:right-5 sm:top-5 flex flex-col items-end gap-1 text-right ${touch ? 'pr-12' : ''}`}>
        <div className="flex items-center gap-2">
          <span className={`font-pixel text-[8px] px-1.5 py-0.5 border tracking-[0.15em] ${hud.act >= 2 ? 'border-fuchsia-300/60 text-fuchsia-200' : 'border-cyan-300/50 text-cyan-200'}`}>
            AKT {hud.act}
          </span>
          <div className="font-title tracking-[0.3em] uppercase text-cyan-50 text-sm sm:text-base" style={{ textShadow: '0 0 14px rgba(111,243,255,0.5)' }}>{hud.area}</div>
        </div>
        <div className="flex items-center gap-2 font-pixel text-[8px] tracking-wider" style={{ color: weaver ? '#ffc58a' : '#8ff6ff' }}>
          <span className="inline-block w-2 h-2 rotate-45" style={{ background: weaver ? '#ffb347' : '#6ff3ff', boxShadow: `0 0 8px ${weaver ? '#ffb347' : '#6ff3ff'}` }} />
          {weaver ? 'SZEPT' : 'WĘDROWIEC'}
          {hud.charsUnlocked > 1 && <span className="text-slate-400">· C zmiana</span>}
        </div>
        {!touch && (
          <div className="text-[10px] tracking-[0.2em] uppercase text-slate-400 hidden sm:flex gap-3">
            {weaver ? (
              <>
                <span><b className="text-violet-200">Q</b> kotwica / skok</span>
                <span><b className="text-amber-200">Shift</b> dash</span>
                <span><b className="text-cyan-200">E</b> użyj</span>
                <span><b className="text-cyan-200">ESC</b> pauza</span>
              </>
            ) : (
              <>
                <span><b className="text-cyan-200">Q</b> echo</span>
                <span><b className="text-cyan-200">E</b> użyj</span>
                <span><b className="text-cyan-200">R</b> rozprosz</span>
                <span><b className="text-cyan-200">ESC</b> pauza</span>
              </>
            )}
          </div>
        )}
      </div>

      {hud.boss && (
        <div className="absolute top-[16%] left-1/2 -translate-x-1/2 w-[min(78vw,460px)] boss-hud">
          <div className="flex items-end justify-between gap-3 mb-1.5">
            <div>
              <div className="font-pixel text-[8px] sm:text-[9px] tracking-[0.24em] uppercase text-rose-200/75">{hud.boss.title}</div>
              <div className="font-title text-sm sm:text-base tracking-[0.2em] uppercase text-white" style={{ textShadow: '0 0 14px rgba(255,100,120,0.6)' }}>{hud.boss.name}</div>
            </div>
            <div className="font-pixel text-[8px] text-rose-100/80">FAZA {hud.boss.phase}</div>
          </div>
          <div className={`boss-health-track ${hud.boss.vulnerable ? 'boss-vulnerable' : ''}`}>
            <div className="boss-health-fill" style={{ width: `${Math.max(0, (hud.boss.hp / hud.boss.maxHp) * 100)}%` }} />
            {hud.boss.vulnerable && <div className="boss-open-mark">ODSŁONIĘTY RDZEŃ</div>}
          </div>
        </div>
      )}

      {/* bottom-center: sign / message / prompt */}
      <div className={`absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-[min(92vw,640px)] ${touch ? 'bottom-32' : 'bottom-6'}`}>
        {hud.sign && (
          <div className="sign-box px-5 py-3 text-center text-[0.95rem] sm:text-base text-cyan-50 leading-snug w-full">
            <div className="font-pixel text-[8px] text-cyan-300/80 tracking-widest mb-1">◆ ZAPIS NA KAMIENIU ◆</div>
            {hud.sign}
          </div>
        )}
        {hud.prompt && !touch && (
          <div className="text-[11px] tracking-[0.25em] uppercase text-cyan-100/90 bg-slate-950/60 px-3 py-1 border border-cyan-300/20">{hud.prompt}</div>
        )}
        {hud.message && (
          <div key={hud.message} className="toast absolute -top-10 left-1/2 whitespace-nowrap text-sm sm:text-base font-semibold text-white tracking-wide px-4 py-1.5" style={{ background: 'rgba(8,14,28,0.8)', border: '1px solid rgba(111,243,255,0.3)', textShadow: '0 0 10px rgba(111,243,255,0.6)' }}>
            {hud.message}
          </div>
        )}
      </div>
    </div>
  );
}

export function AreaBanner({ name, subtitle, k }: { name: string; subtitle: string; k: number }) {
  return (
    <div key={k} className="fixed inset-x-0 top-[22%] z-20 pointer-events-none flex flex-col items-center banner">
      <div className="font-title text-2xl sm:text-4xl md:text-5xl tracking-[0.25em] uppercase text-white" style={{ textShadow: '0 0 20px rgba(111,243,255,0.8), 0 0 60px rgba(111,243,255,0.4)' }}>{name}</div>
      <div className="mt-2 text-xs sm:text-sm tracking-[0.5em] uppercase text-cyan-100/80">{subtitle}</div>
      <div className="mt-3 h-px w-48 bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
    </div>
  );
}
