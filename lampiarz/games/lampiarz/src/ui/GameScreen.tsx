import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { audio } from '../audio/audio';
import { ENEMIES, EVENT_MAP } from '../game/content';
import {
  barrelAt,
  choosePath,
  computeIntents,
  enemyAt,
  gateOpen,
  itemAt,
  lampAt,
  lampCost,
  openWorkshop,
  playerAct,
  resolveEvent,
  workshopAct,
  type WorkshopAction,
} from '../game/engine';
import { bfs, DIRS4 } from '../game/grid';
import { computeLight } from '../game/light';
import { unlockedSet, type Profile } from '../game/meta';
import { tutorialAdvance, TUTORIAL_STEPS } from '../game/tutorial';
import type { Action, EnemyType, Fx, Point, Run, ThemeId } from '../game/types';
import { TILE_WALL } from '../game/types';
import { Renderer } from '../render/renderer';
import { anyModalOpen, Modal } from './common';
import { Hud, type InspectInfo } from './Hud';
import { EventModal, PathModal, PauseModal, RunEndModal, SummaryModal, WorkshopModal } from './RunModals';

export interface GameScreenProps {
  run: Run;
  profile: Profile;
  /** Persist + achievements. Returns newly earned achievement ids. */
  onRunChanged: (run: Run) => string[];
  onExitToMenu: () => void;
  onNewRun: () => void;
  onAbandon: () => void;
  onOpenSettings: () => void;
  onOpenHowTo: () => void;
  onToggleMute: () => void;
  overlayOpen: boolean;
  /** tutorial only: start the tutorial again */
  onTutorialRestart?: () => void;
}

const KEY_DIRS: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyW: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
};

const MIN_ACTION_GAP = 105; // ms between actions when holding a key

export function GameScreen(props: GameScreenProps) {
  const { run, profile } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState<Point | null>(null);
  const [endShown, setEndShown] = useState(false);
  const [runAchievements, setRunAchievements] = useState<string[]>([]);
  const [showTutorial, setShowTutorial] = useState(!profile.tutorialSeen && !profile.tutorialDone && !run.tutorial);
  const [enemyHint, setEnemyHint] = useState<EnemyType | null>(null);
  const lastAction = useRef(0);
  const propsRef = useRef(props);
  propsRef.current = props;
  const unlocked = useMemo(() => unlockedSet(profile), [profile, runAchievements]);

  const rerender = useCallback(() => setTick((t) => t + 1), []);

  // ---------------------------------------------------------------- renderer lifecycle
  useEffect(() => {
    const cv = canvasRef.current!;
    let r: Renderer;
    try {
      r = new Renderer(cv);
    } catch {
      return;
    }
    rendererRef.current = r;
    r.settings = rendererSettings(profile, run);
    r.resize();
    r.sync(run);
    let raf = 0;
    const loop = (now: number) => {
      r.frame(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => r.resize());
    ro.observe(cv);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const r = rendererRef.current;
    if (r) r.settings = rendererSettings(profile, run);
  }, [profile.settings.shake, profile.settings.reducedMotion, profile.settings.showGrid, profile.settings.hints, profile.settings.effects, run]);

  // keep the player out from under the objective box / tutorial card
  useEffect(() => {
    const r = rendererRef.current;
    const cv = canvasRef.current;
    if (!r || !cv) return;
    const top = cv.getBoundingClientRect().top;
    // the objective box / tutorial card sit just below the district header, however tall it wraps
    const head = document.querySelector<HTMLElement>('.hud-top .district');
    const game = cv.parentElement;
    if (head && game) game.style.setProperty('--obj-top', `${Math.round(head.getBoundingClientRect().bottom - game.getBoundingClientRect().top + 8)}px`);
    let inset = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.objective, .tut-card'))) {
      const b = el.getBoundingClientRect();
      if (b.width > window.innerWidth * 0.6 || el.classList.contains('objective')) inset = Math.max(inset, b.bottom - top + 6);
    }
    r.topInset = inset;
  });

  // a different Run object (new night) — resync
  useEffect(() => {
    rendererRef.current?.sync(run);
    setEndShown(false);
    setRunAchievements([]);
    setPaused(false);
  }, [run]);

  // ---------------------------------------------------------------- after any state change
  const afterChange = useCallback(
    (fx: Fx[]) => {
      const r = rendererRef.current;
      const cur = propsRef.current.run;
      r?.sync(cur);
      r?.fx(fx);
      audio.playFx(fx, cur.cls);
      // danger intensity for music
      const d = cur.district;
      const near = d.enemies.reduce((m, e) => Math.min(m, Math.abs(e.x - cur.player.x) + Math.abs(e.y - cur.player.y)), 99);
      audio.setIntensity(cur.player.hp <= 1 ? 1 : near <= 2 ? 0.8 : near <= 4 ? 0.5 : 0.15);
      // first time ever meeting an enemy type: a short card explaining it
      const prof = propsRef.current.profile;
      if (!cur.tutorial && prof.settings.hints) {
        const fresh = cur.seenEnemies.find((t) => !prof.hintsSeen.includes(t));
        if (fresh) {
          prof.hintsSeen.push(fresh);
          setEnemyHint(fresh);
        }
      }
      const fresh = propsRef.current.onRunChanged(cur);
      if (fresh.length) {
        audio.play('achievement');
        setRunAchievements((a) => [...a, ...fresh]);
      }
      if (cur.phase === 'victory' || cur.phase === 'defeat') {
        window.setTimeout(() => setEndShown(true), cur.phase === 'victory' ? 1600 : 1300);
      }
      rerender();
    },
    [rerender],
  );

  const act = useCallback(
    (a: Action) => {
      const cur = propsRef.current.run;
      if (cur.phase !== 'play' || paused || propsRef.current.overlayOpen || anyModalOpen()) return;
      audio.unlock();
      lastAction.current = performance.now();
      const fx = playerAct(cur, a);
      if (cur.tutorial) fx.push(...tutorialAdvance(cur));
      afterChange(fx);
    },
    [afterChange, paused],
  );

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyM') {
        propsRef.current.onToggleMute();
        return;
      }
      if (anyModalOpen() || propsRef.current.overlayOpen) return;
      const cur = propsRef.current.run;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (cur.phase === 'play') {
          audio.play('click');
          setPaused(true);
        }
        return;
      }
      if (enemyHint && (e.code === 'Enter' || e.code === 'Escape')) {
        e.preventDefault();
        setEnemyHint(null);
        return;
      }
      if (showTutorial && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        dismissTutorial();
        return;
      }
      if (cur.phase !== 'play' || paused) return;
      const now = performance.now();
      const isGameKey = e.code in KEY_DIRS || ['Space', 'Period', 'KeyQ', 'KeyF', 'KeyE', 'Numpad5'].includes(e.code);
      if (!isGameKey) return;
      e.preventDefault();
      if (e.repeat && now - lastAction.current < MIN_ACTION_GAP + 40) return;
      if (!e.repeat && now - lastAction.current < 40) return;
      if (showTutorial) dismissTutorial();
      const dir = KEY_DIRS[e.code];
      if (dir) act({ type: 'move', dx: dir.x, dy: dir.y });
      else if (e.code === 'Space' || e.code === 'Period' || e.code === 'Numpad5') act({ type: 'wait' });
      else if (e.code === 'KeyQ') act({ type: 'ability' });
      else if (e.code === 'KeyF' || e.code === 'KeyE') act({ type: 'interact' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act, paused, showTutorial, enemyHint]);

  const dismissTutorial = () => {
    setShowTutorial(false);
    propsRef.current.profile.tutorialSeen = true;
    propsRef.current.onRunChanged(propsRef.current.run);
  };

  // ---------------------------------------------------------------- pointer
  const onPointerMove = (e: RPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const r = rendererRef.current;
    if (!r) return;
    const t = r.tileAt(e.clientX, e.clientY);
    r.hover = t;
    setHover((h) => (h?.x === t?.x && h?.y === t?.y ? h : t));
  };
  const onPointerLeave = () => {
    if (rendererRef.current) rendererRef.current.hover = null;
    setHover(null);
  };
  const onPointerDown = (e: RPointerEvent) => {
    const r = rendererRef.current;
    const cur = propsRef.current.run;
    if (!r || cur.phase !== 'play') return;
    if (showTutorial) {
      dismissTutorial();
      return;
    }
    const t = r.tileAt(e.clientX, e.clientY);
    if (!t) return;
    const step = stepTowards(cur, t);
    if (step === 'wait') act({ type: 'wait' });
    else if (step) act({ type: 'move', dx: step.x, dy: step.y });
  };

  // ---------------------------------------------------------------- phase handlers
  const chooseEvent = (id: string) => {
    const fx = resolveEvent(run, id, unlocked);
    afterChange(fx);
  };
  const toWorkshop = () => {
    openWorkshop(run, unlocked);
    afterChange([]);
  };
  const doWorkshop = (a: WorkshopAction) => {
    const msg = workshopAct(run, a, unlocked);
    afterChange([]);
    return msg;
  };
  const pickPath = (t: ThemeId) => {
    choosePath(run, t);
    afterChange([]);
  };

  const inspect = useMemo(() => (hover ? describeTile(run, hover) : null), [hover, run, run.district.turn, run.district.enemies.length, run.player.x, run.player.y]);

  return (
    <div className="game">
      <canvas
        ref={canvasRef}
        className="board"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        aria-label="Plansza gry"
        role="img"
      />
      <div className="vignette" />
      <Hud
        run={run}
        onAction={act}
        onPause={() => (audio.play('click'), setPaused(true))}
        muted={profile.settings.muted}
        onMute={props.onToggleMute}
        inspect={inspect}
        showHints={profile.settings.hints}
      />

      {run.tutorial && !run.tutorial.done && run.phase === 'play' ? <TutorialCard run={run} /> : null}

      {enemyHint && run.phase === 'play' ? (
        <div className="panel enemy-hint" role="dialog" aria-label={`Nowy wróg: ${ENEMIES[enemyHint].name}`}>
          <div className="sub">Nowy wróg</div>
          <b>{ENEMIES[enemyHint].name}</b>
          <div>{ENEMIES[enemyHint].desc}</div>
          <button className="btn small" onClick={() => setEnemyHint(null)}>
            Rozumiem
          </button>
        </div>
      ) : null}

      {showTutorial && run.phase === 'play' ? (
        <div className="panel tutorial" role="dialog" aria-label="Pierwsze kroki">
          <p className="eyebrow">Pierwsze kroki</p>
          <h2 style={{ margin: 0, color: 'var(--parchment)' }}>Zapal miasto</h2>
          <ol>
            <li>
              Ruch: <b>WASD / strzałki</b> albo kliknij pole. Gra jest turowa — wrogowie ruszają się dopiero po tobie.
            </li>
            <li>
              Wejdź w latarnię, by ją zapalić (1 olej). W jej <b>blasku cienie nie mogą wejść</b>.
            </li>
            <li>
              Cel: zapal <b>trzy znicze</b> (po 2 oleju) — brama otworzy się na dobre. Ramka „Cel” u góry i strzałki na brzegu ekranu zawsze pokazują, co dalej.
            </li>
            <li>
              Atakujesz, wchodząc we wroga. <b>Q</b> — umiejętność, <b>F</b> — zgaś latarnię i odzyskaj olej.
            </li>
          </ol>
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
            Wolisz spokojnie przećwiczyć? Wyjdź do menu i wybierz „Samouczek”.
          </p>
          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={dismissTutorial}>
              Do roboty
            </button>
          </div>
        </div>
      ) : null}

      {run.phase === 'event' ? <EventModal run={run} onChoose={chooseEvent} /> : null}
      {run.phase === 'summary' && !run.tutorial ? <SummaryModal run={run} onNext={toWorkshop} /> : null}
      {run.tutorial && run.tutorial.done ? <TutorialDoneModal onPlay={props.onNewRun} onMenu={props.onExitToMenu} /> : null}
      {run.phase === 'workshop' ? <WorkshopModal run={run} onAct={doWorkshop} /> : null}
      {run.phase === 'path' ? <PathModal run={run} onChoose={pickPath} /> : null}
      {run.tutorial && run.phase === 'defeat' && endShown ? (
        <Modal labelledBy="tut-fail">
          <p className="eyebrow">Samouczek</p>
          <h2 id="tut-fail">Latarnia zgasła</h2>
          <p className="muted">Nic straconego — w samouczku nic się nie liczy. Pamiętaj: stój w blasku latarni i uderzaj pierwszy.</p>
          <div className="modal-actions">
            <button className="btn" onClick={props.onExitToMenu}>
              Menu
            </button>
            <button className="btn primary" onClick={props.onTutorialRestart}>
              Spróbuj jeszcze raz
            </button>
          </div>
        </Modal>
      ) : null}
      {!run.tutorial && (run.phase === 'victory' || run.phase === 'defeat') && endShown ? (
        <RunEndModal run={run} newAchievements={runAchievements} onAgain={props.onNewRun} onMenu={props.onExitToMenu} />
      ) : null}
      {paused && run.phase === 'play' && !props.overlayOpen ? (
        <PauseModal
          run={run}
          onResume={() => setPaused(false)}
          onSettings={props.onOpenSettings}
          onHowTo={props.onOpenHowTo}
          onQuit={props.onExitToMenu}
          onAbandon={() => {
            setPaused(false);
            props.onAbandon();
            afterChange([{ k: 'defeat' }]);
          }}
        />
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ helpers
/** First step of a path toward the clicked tile, or 'wait' when clicking yourself. */
function stepTowards(run: Run, target: Point): Point | 'wait' | null {
  const d = run.district;
  const p = run.player;
  if (target.x === p.x && target.y === p.y) return 'wait';
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  if (Math.abs(dx) + Math.abs(dy) === 1) return { x: dx, y: dy };
  if (!d.explored[target.y * d.w + target.x]) {
    // walking into the unknown: step along the dominant axis, falling back to the other one
    const open = (x: number, y: number) => d.tiles[y * d.w + x] !== TILE_WALL && !lampAt(d, x, y) && !barrelAt(d, x, y);
    const ax = { x: Math.sign(dx), y: 0 };
    const ay = { x: 0, y: Math.sign(dy) };
    const order = Math.abs(dx) >= Math.abs(dy) ? [ax, ay] : [ay, ax];
    for (const o of order) if ((o.x || o.y) && open(p.x + o.x, p.y + o.y)) return o;
    return null;
  }
  const blocked = (x: number, y: number) =>
    d.tiles[y * d.w + x] === TILE_WALL ||
    !!lampAt(d, x, y) ||
    !!enemyAt(d, x, y) ||
    !!barrelAt(d, x, y) ||
    (x === d.gate.x && y === d.gate.y && !gateOpen(d));
  const goals: Point[] = [];
  if (blocked(target.x, target.y)) {
    for (const dir of DIRS4) {
      const nx = target.x + dir.x;
      const ny = target.y + dir.y;
      if (nx >= 0 && ny >= 0 && nx < d.w && ny < d.h && !blocked(nx, ny)) goals.push({ x: nx, y: ny });
    }
  } else goals.push(target);
  if (!goals.length) return null;
  const map = bfs(d.w, d.h, goals, (x, y) => !blocked(x, y) && (d.explored[y * d.w + x] === 1 || (x === p.x && y === p.y)));
  let best: Point | null = null;
  let bv = Infinity;
  for (const dir of DIRS4) {
    const nx = p.x + dir.x;
    const ny = p.y + dir.y;
    if (nx < 0 || ny < 0 || nx >= d.w || ny >= d.h) continue;
    const v = map[ny * d.w + nx];
    if (v >= 0 && v < bv) {
      bv = v;
      best = dir;
    }
  }
  // standing next to a blocked goal (lamp / enemy): bump into it
  if (!best && Math.abs(dx) + Math.abs(dy) === 1) return { x: dx, y: dy };
  return best;
}

function describeTile(run: Run, t: Point): InspectInfo | null {
  const d = run.district;
  const i = t.y * d.w + t.x;
  const light = computeLight(run);
  const visible = light.visible[i] === 1;
  if (!d.explored[i] && !visible) return null;
  const e = enemyAt(d, t.x, t.y);
  if (e && visible) {
    const def = ENEMIES[e.type];
    const intents = computeIntents(run, light);
    const it = intents.get(e.id);
    const intentText =
      it?.kind === 'attack'
        ? 'Zaatakuje cię w następnej turze.'
        : it?.kind === 'drain'
          ? 'Wyssie olej z twojej latarni.'
          : it?.kind === 'aim'
            ? 'Szarżuje po czerwonej linii!'
            : it?.kind === 'snuff'
              ? 'Gasi płomień obok siebie.'
              : it?.kind === 'hunt'
                ? 'Idzie zgasić latarnię (przerywana linia).'
                : it?.kind === 'soot'
                    ? it.attack
                      ? 'Uderzy cię szczotką w tej turze.'
                      : it.left <= 0
                        ? 'Ciska sadzą w tej turze!'
                        : `Sadza za ${it.left} t.${it.lamp ? '' : ' (nie ma w zasięgu płonącej latarni)'}`
              : it?.kind === 'boss'
                ? it.pulse <= 0
                  ? 'Zaćmienie w następnej turze!'
                  : `Zaćmienie za ${it.pulse} t., nowe cienie za ${it.brood} t.`
                : it?.kind === 'move'
                  ? 'Zbliża się.'
                  : 'Czeka.';
    return { sub: e.elite ? 'wróg · elita' : 'wróg', title: `${def.name} — ${e.hp}/${e.maxHp}`, text: def.desc, intent: intentText };
  }
  const l = lampAt(d, t.x, t.y);
  if (l) {
    const names = { lamp: 'Latarnia uliczna', brazier: 'Znicz', lighthouse: 'Latarnia morska' } as const;
    const text = l.lit
      ? l.kind === 'lamp'
        ? 'Płonie. Chroni okolicę przed cieniami. Możesz ją zgasić, by odzyskać olej [F].'
        : l.kind === 'brazier'
          ? 'Płonie. W jego blasku możesz odpocząć i leczyć rany.'
          : 'Płonie.'
      : l.kind === 'lighthouse' && !gateOpen(d)
        ? 'Wymaga trzech płonących zniczy.'
        : `Zgaszona. Zapalenie kosztuje ${lampCost(run, l)} oleju.`;
    return { sub: l.lit ? 'płonie' : 'zgaszona', title: names[l.kind], text };
  }
  const b = barrelAt(d, t.x, t.y);
  if (b) return { sub: 'beczka', title: 'Beczka z olejem', text: 'Wejdź w nią, a wybuchnie: 3 obrażeń wszystkim wrogom w promieniu 1,5 pola i ogień na 4 tury. Ciebie nie rani — zwab cienie i odpal.' };
  const it = itemAt(d, t.x, t.y);
  if (it) {
    const map = {
      oil: ['Kanister oleju', `+${it.amount} oleju dla twojej latarni.`],
      embers: ['Stos żaru', 'Żar — waluta warsztatu.'],
      event: [it.eventId ? EVENT_MAP[it.eventId]?.title ?? 'Spotkanie' : 'Spotkanie', 'Ktoś czeka w mroku. Wejdź, by porozmawiać.'],
      shrine: ['Zapomniana kapliczka', 'Coś tli się w niszy.'],
    } as const;
    const [title, text] = map[it.kind];
    return { sub: 'przedmiot', title, text };
  }
  if (t.x === d.gate.x && t.y === d.gate.y) {
    return { sub: 'brama', title: 'Brama dzielnicy', text: gateOpen(d) ? 'Otwarta. Przejdź, by opuścić dzielnicę.' : 'Zamknięta. Zapal wszystkie trzy znicze.' };
  }
  if (d.tiles[i] === TILE_WALL) return null;
  if (light.holy[i]) return { sub: 'teren', title: 'Święte światło', text: 'Cienie nie mogą tu wejść.' };
  if (!visible) return { sub: 'teren', title: 'Zapamiętana ulica', text: 'Nie widzisz, co tu teraz jest.' };
  return null;
}


function rendererSettings(profile: Profile, run: Run) {
  return {
    shake: profile.settings.shake,
    reducedMotion: profile.settings.reducedMotion,
    showGrid: profile.settings.showGrid,
    showObjective: profile.settings.hints || !!run.tutorial,
    hiFx: profile.settings.effects !== false,
  };
}

function TutorialCard({ run }: { run: Run }) {
  const t = run.tutorial!;
  const st = TUTORIAL_STEPS[t.step];
  return (
    <div className="tut-card" role="status" aria-live="polite" key={t.step}>
      <div className="tut-head">
        <span className="tut-step">
          Samouczek · krok {t.step + 1} z {TUTORIAL_STEPS.length}
        </span>
      </div>
      <h3>{st.title}</h3>
      <p>{st.text}</p>
      {st.keys?.length ? (
        <div className="tut-keys">
          {st.keys.map((k) => (
            <span key={k}>{k}</span>
          ))}
        </div>
      ) : null}
      <div className="tut-progress" aria-hidden>
        {TUTORIAL_STEPS.map((_, i) => (
          <i key={i} className={i < t.step ? 'done' : i === t.step ? 'now' : ''} />
        ))}
      </div>
    </div>
  );
}

function TutorialDoneModal({ onPlay, onMenu }: { onPlay: () => void; onMenu: () => void }) {
  return (
    <Modal labelledBy="tut-done">
      <p className="eyebrow">Samouczek ukończony</p>
      <h2 id="tut-done">Jesteś gotów na prawdziwą noc</h2>
      <ul className="tut-recap">
        <li>Noc to 5 dzielnic i Cypel Latarni. W każdej dzielnicy: <b>3 znicze → brama</b>.</li>
        <li>
          Pasek <b>Mrok</b> u góry pokazuje, kiedy pojawi się nowy cień. Im dłużej zwlekasz, tym ich więcej — po 160 turach zapada głęboka noc.
        </li>
        <li>Między dzielnicami: warsztat (relikty, leczenie, olej za żar) i wybór kolejnej drogi.</li>
        <li>
          Nowi wrogowie: <b>Śmigacz</b> (2 pola na turę), <b>Smolnik</b> (kradnie olej), <b>Łowca</b> (szarżuje po czerwonej linii — zejdź z niej).
        </li>
        <li>
          Po drodze: <b>beczki z olejem</b> (pułapka na cienie), <b>pogoda</b> i w 3. dzielnicy{' '}
          <b>Kominiarz Cieni</b>. Szczegóły w „Jak grać”.
        </li>
        <li>
          Na końcu <b>Matka Mroku</b>: śpi, dopóki nie zapalisz znicza. Zapal 3 znicze i latarnię morską — albo ją pokonaj.
        </li>
      </ul>
      <div className="modal-actions">
        <button className="btn" onClick={onMenu}>
          Menu
        </button>
        <button className="btn primary" onClick={onPlay}>
          Zacznij pierwszą noc
        </button>
      </div>
    </Modal>
  );
}
