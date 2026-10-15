// Application shell: owns the canvas, renderer, audio, UI layers and the current
// simulation, routes input and simulation events, and handles saving, death,
// endings and the lifecycle of the page.
import { audio, type Mood } from './audio/audio';
import { Renderer, type ViewParams } from './engine/renderer';
import { clamp, dist2d } from './engine/math';
import { Sim, type Controls, type SimEvent } from './game/sim';
import { clearState, hasState, loadMeta, loadSettings, loadState, newState, saveMeta, saveSettings, writeState, type GameState, type Meta, type Settings } from './game/state';
import { ENDINGS, MISSIONS, type EndingId } from './game/story';
import { CAMERAS } from './world/map';
import { h } from './ui/dom';
import { Hud } from './ui/hud';
import {
  cctvView,
  chamberTerminal,
  confirmView,
  controlsView,
  deathView,
  docView,
  endingsView,
  endingView,
  errorView,
  gateView,
  keypadView,
  labTerminal,
  loadingView,
  mapBoardView,
  menuView,
  optionsView,
  pauseView,
  powerPanelView,
  radioView,
  receptionTerminal,
  tabletView,
  type Modal,
} from './ui/views';

type Mode = 'loading' | 'gate' | 'menu' | 'play' | 'dead' | 'ending' | 'error';

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyC', 'ControlLeft']);

export class App {
  canvas = h('canvas', { class: 'ns-canvas', 'aria-label': 'Widok gry NIGHT SHIFT: 03:17' }) as HTMLCanvasElement;
  ui = h('div', { class: 'ns-ui' });
  layerHost = h('div');
  clickOverlay = h('div', { class: 'ns-click', role: 'button', tabindex: '0' }, 'KLIKNIJ, ABY KONTYNUOWAĆ', h('br'), h('span', { class: 'ns-dim', style: 'font-size:13px' }, 'Esc — pauza'));
  hud = new Hud();
  renderer!: Renderer;
  sim: Sim | null = null;
  menuSim!: Sim;
  settings: Settings = loadSettings();
  meta: Meta = loadMeta();
  mode: Mode = 'loading';
  stack: Modal[] = [];
  keys = new Set<string>();
  locked = false;
  debug = new URLSearchParams(location.search).has('debug');
  frozen = false;
  private raf = 0;
  private last = 0;
  private ac = new AbortController();
  private unlockAt = 0;
  private expectUnlock = false;
  fade = 1;
  fadeTarget = 0;
  private hurt = 0;
  private glitch = 0;
  private pendingSave = false;
  private deathT = 0;
  private endT = 0;
  private refreshT = 0;
  private perf = { t: 0, frames: 0, sum: 0, done: false };
  private saveWarning: string | null = null;
  private menuT = 0;
  private menuGhostT = 12;

  constructor(public root: HTMLElement) {}

  // ------------------------------------------------------------------ boot
  async start() {
    this.root.replaceChildren(this.canvas, this.ui);
    this.ui.append(this.hud.root, this.clickOverlay, this.layerHost);
    this.hud.show(false);
    this.clickOverlay.style.display = 'none';
    this.hud.onLine = (l, sec) => audio.voice(l.who, Math.min(sec, 4.5));
    try {
      this.renderer = new Renderer(this.canvas);
    } catch {
      this.fatal('Brak WebGL 2', 'Ta gra wymaga przeglądarki z obsługą WebGL 2 (aktualny Chrome, Edge, Firefox lub Safari 15+) i włączonej akceleracji sprzętowej grafiki. Sprawdź ustawienia przeglądarki lub sterowniki karty graficznej.');
      return;
    }
    const loading = loadingView();
    this.layerHost.replaceChildren(loading.el);
    try {
      await document.fonts?.ready;
    } catch {
      /* fonts are optional */
    }
    try {
      await this.renderer.load((d, t, label) => loading.set(d, t, label));
    } catch (e) {
      console.error(e);
      this.fatal('Błąd grafiki', `Nie udało się przygotować grafiki: ${(e as Error).message}. Spróbuj odświeżyć stronę albo wybrać niższą jakość.`);
      return;
    }
    this.renderer.setSettings(this.settings);
    this.menuSim = new Sim(newState(7));
    this.placeMenuCamera();
    this.bindInput();
    this.applyAudioSettings();
    this.mode = 'gate';
    const enter = () => {
      audio.unlock();
      this.applyAudioSettings();
      this.showMenu();
    };
    this.layerHost.replaceChildren(gateView(enter));
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    if (this.debug) this.exposeDebug();
  }

  fatal(title: string, text: string) {
    this.mode = 'error';
    cancelAnimationFrame(this.raf);
    this.root.replaceChildren(errorView(title, text));
  }

  private placeMenuCamera() {
    const p = this.menuSim.player;
    p.x = 22;
    p.z = 22;
    p.yaw = -Math.PI / 2;
    p.pitch = -0.04;
  }

  // ------------------------------------------------------------------ settings
  applyAudioSettings() {
    audio.setVolumes(this.settings.music, this.settings.sfx, this.settings.ambient);
  }
  onSettings = (s: Settings) => {
    this.settings = s;
    saveSettings(s);
    this.applyAudioSettings();
    this.renderer.setSettings(s);
  };
  isFullscreen = () => !!document.fullscreenElement;
  toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.().catch(() => this.hud.toast('Przeglądarka nie zezwoliła na pełny ekran.', 'deny'));
    } catch {
      /* not supported */
    }
  };

  // ------------------------------------------------------------------ modal stack
  get top(): Modal | null {
    return this.stack[this.stack.length - 1] ?? null;
  }
  private renderTop() {
    const t = this.top;
    this.layerHost.replaceChildren(...(t ? [t.el] : []));
    const first = t?.el.querySelector<HTMLElement>('.ns-primary, button:not([disabled])');
    if (first && t && t.kind !== 'cctv') first.focus({ preventScroll: true });
  }
  open(m: Modal, replace = false) {
    if (replace) this.stack.pop();
    this.stack.push(m);
    if (this.mode === 'play') this.releaseLock();
    this.keys.clear();
    this.renderTop();
  }
  close() {
    const m = this.stack.pop();
    if (m?.kind === 'cctv' && this.sim) this.sim.cctv = null;
    this.renderTop();
    if (!this.top && this.mode === 'play') this.resumePlay();
  }
  closeAll() {
    if (this.sim) this.sim.cctv = null;
    this.stack = [];
    this.renderTop();
  }

  // ------------------------------------------------------------------ pointer lock
  private releaseLock() {
    if (document.pointerLockElement) {
      this.expectUnlock = true;
      document.exitPointerLock();
    }
  }
  requestLock() {
    if (this.locked) return;
    try {
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      /* shown as the click overlay */
    }
  }
  private resumePlay() {
    this.requestLock();
    this.canvas.focus?.();
  }

  // ------------------------------------------------------------------ menus
  showMenu() {
    this.mode = 'menu';
    this.sim = null;
    this.stack = [];
    this.hud.show(false);
    this.hud.clearSubs();
    this.releaseLock();
    this.fade = 1;
    this.fadeTarget = 0;
    this.hurt = 0;
    audio.setMood('menu');
    this.open(this.buildMenu());
  }
  private buildMenu(): Modal {
    const { state, warning } = loadState();
    if (warning) this.saveWarning = warning;
    const w = this.saveWarning;
    this.saveWarning = null;
    return menuView({
      save: state ? { mission: state.mission, playTime: state.playTime, clock: state.clock } : null,
      warning: w,
      endings: this.meta.endings.length,
      onContinue: () => this.continueGame(),
      onNew: () => this.newGame(),
      onOptions: () => this.open(optionsView(this.settings, this.onSettings, () => this.close(), this.isFullscreen, this.toggleFullscreen)),
      onControls: () => this.open(controlsView(() => this.close())),
      onEndings: () => this.open(endingsView(this.meta, () => this.close())),
    });
  }
  newGame() {
    audio.ui('ok');
    const go = () => {
      clearState();
      this.startGame(newState(), true);
    };
    if (hasState())
      this.open(
        confirmView('Nowa zmiana?', 'Istniejący zapis zostanie nadpisany. Tej operacji nie można cofnąć.', 'Nadpisz zapis', go, () => this.close()),
      );
    else go();
  }
  continueGame() {
    audio.ui('ok');
    const { state, warning } = loadState();
    if (!state) {
      this.saveWarning = warning ?? 'Nie znaleziono zapisu.';
      this.stack = [];
      this.open(this.buildMenu());
      return;
    }
    this.startGame(state, false);
  }

  startGame(state: GameState, fresh: boolean) {
    const sim = new Sim(state);
    this.sim = sim;
    sim.listeners.push((e) => this.onSimEvent(sim, e));
    this.mode = 'play';
    this.stack = [];
    this.renderTop();
    this.hud.clearSubs();
    this.hud.show(true);
    this.fade = 1;
    this.fadeTarget = 0;
    this.hurt = 0;
    this.glitch = 0;
    this.deathT = 0;
    this.endT = 0;
    this.pendingSave = false;
    audio.setMood('calm');
    if (fresh) {
      this.saveNow(false);
      this.hud.toast('WASD — ruch · mysz — rozglądanie · E — interakcja · Tab — tablet');
    } else this.hud.toast(`Wczytano: ${MISSIONS[Math.min(state.mission, 7)].title}`);
    this.requestLock();
  }

  // ------------------------------------------------------------------ saving
  saveNow(flash = true): boolean {
    const sim = this.sim;
    if (!sim) return false;
    sim.syncState();
    const ok = writeState(sim.state);
    if (flash && ok) this.hud.flashSaved();
    if (!ok) this.hud.toast('Nie udało się zapisać gry (pamięć przeglądarki zablokowana lub pełna).', 'deny');
    this.pendingSave = false;
    return ok;
  }
  saveReason(sim: Sim) {
    if (sim.enemy.hunting) return 'Przestój cię ściga';
    if (sim.final) return 'trwa procedura 03:17';
    if (sim.player.hidden) return 'wyjdź z szafki';
    return '';
  }

  // ------------------------------------------------------------------ pause
  pause() {
    const sim = this.sim;
    if (!sim || this.mode !== 'play' || (this.top && this.top.pausesSim)) return;
    audio.ui('back');
    const build = (): Modal =>
      pauseView({
        canSave: sim.canSave(),
        saveReason: this.saveReason(sim),
        onResume: () => this.close(),
        onSave: () => {
          if (sim.canSave() && this.saveNow()) {
            const b = this.top?.el.querySelector('[data-id="save"] small') ?? this.top?.el.querySelector('[data-id="save"]');
            const small = this.top?.el.querySelector('[data-id="save"]');
            if (small && !small.querySelector('small')) small.append(h('small', null, 'zapisano'));
            else if (b) b.textContent = 'zapisano';
          }
        },
        onOptions: () => this.open(optionsView(this.settings, this.onSettings, () => this.close(), this.isFullscreen, this.toggleFullscreen)),
        onControls: () => this.open(controlsView(() => this.close())),
        onMenu: () => {
          if (sim.canSave()) {
            this.saveNow(false);
            this.showMenu();
          } else
            this.open(
              confirmView('Wyjść do menu?', 'Teraz nie można zapisać. Wrócisz do ostatniego automatycznego zapisu.', 'Wyjdź', () => this.showMenu(), () => this.close()),
            );
        },
      });
    const m = build();
    m.key = (e) => {
      if (e.code === 'Escape' && performance.now() - this.unlockAt > 350) {
        this.close();
        return true;
      }
      return e.code === 'Escape';
    };
    this.open(m);
  }

  // ------------------------------------------------------------------ simulation events
  private onSimEvent(sim: Sim, e: SimEvent) {
    if (sim !== this.sim) return;
    switch (e.type) {
      case 'say':
        this.hud.say(e.lines);
        break;
      case 'message':
        this.hud.toast(e.text, e.tone);
        break;
      case 'pickup':
        this.hud.toast(`Zabrano: ${e.text}`, 'good');
        break;
      case 'doc':
        if (this.mode === 'play') this.open(docView(e.id, () => this.close()));
        break;
      case 'mission':
        this.hud.toast(`Nowe zadanie: ${MISSIONS[Math.min(e.index, 7)].title}`, 'good');
        audio.ui('ok');
        break;
      case 'ui':
        this.openDevice(sim, e.screen, e.ref);
        break;
      case 'sfx':
        audio.sfx(e.name, e.x !== undefined && e.z !== undefined ? [e.x, e.y ?? 1.2, e.z] : undefined, e.vol ?? 1);
        break;
      case 'death':
        this.onDeath(sim);
        break;
      case 'ending':
        this.onEnding(sim, e.id);
        break;
      case 'checkpoint':
        this.pendingSave = true;
        break;
      case 'power':
        this.top?.refresh?.();
        break;
      case 'scare':
        this.glitch = Math.max(this.glitch, e.kind === 'slam' ? 0.5 : e.kind === 'chase' ? 0.35 : 0.8);
        break;
    }
  }

  private openDevice(sim: Sim, screen: string, ref?: string) {
    if (this.mode !== 'play') return;
    switch (screen) {
      case 'terminal':
        audio.sfx('beep');
        if (ref === 'lab')
          this.open(
            labTerminal(sim, () => this.close(), () => {
              audio.sfx('whisperStatic', undefined, 0.9);
              this.hud.toast('Szum wentylacji… a pod nim czyjś oddech. Twój.');
            }),
          );
        else this.open(receptionTerminal(sim, () => this.close()));
        break;
      case 'cctv':
        this.open(
          cctvView(sim, {
            onClose: () => this.close(),
            onSwitch: (d) => {
              if (!sim.cctv) return;
              sim.cctv = { cam: (sim.cctv.cam + d + CAMERAS.length * 4) % CAMERAS.length, viewT: 0 };
              audio.sfx('cctvSwitch');
              this.glitch = Math.max(this.glitch, 0.35);
              this.top?.refresh?.();
            },
            onRelease: () => {
              sim.serviceDoorRelease();
              this.top?.refresh?.();
            },
          }),
        );
        break;
      case 'panel':
        audio.sfx('relayOff', undefined, 0.4);
        this.open(powerPanelView(sim, { onClose: () => this.close(), onChange: () => {} }));
        break;
      case 'keypad':
        this.open(keypadView(sim, ref!, { onClose: () => this.close(), onSuccess: () => this.close(), onPress: () => audio.ui('move') }));
        break;
      case 'radio':
        audio.sfx('whisperStatic', [11.6, 1.2, 16.6], 0.4);
        this.open(
          radioView(sim, {
            onClose: () => this.close(),
            onLog: () => sim.readDoc('d09'),
            onTransmit: () => {
              if (sim.transmit()) this.close();
            },
          }),
        );
        break;
      case 'chamber':
        audio.sfx('beep');
        this.open(
          chamberTerminal(sim, {
            onClose: () => this.close(),
            onRead: () => sim.chamberRead(),
            onTest: () => {
              this.closeAll();
              sim.runTest();
            },
            onStop: () => {
              if (sim.stopContinuity()) this.close();
            },
          }),
        );
        break;
      case 'map':
        this.open(mapBoardView(sim, () => this.close()));
        break;
    }
  }

  private onDeath(sim: Sim) {
    this.mode = 'dead';
    this.closeAll();
    this.releaseLock();
    this.hud.clearSubs();
    this.deathT = 0;
    this.glitch = 1;
    audio.setMood('silence');
    window.setTimeout(() => {
      if (this.sim !== sim || this.mode !== 'dead') return;
      this.hud.show(false);
      this.open(
        deathView({
          hasSave: hasState(),
          deaths: sim.state.deaths,
          onLoad: () => {
            const { state } = loadState();
            if (!state) return this.showMenu();
            state.deaths = Math.max(state.deaths, sim.state.deaths);
            writeState(state);
            this.startGame(state, false);
          },
          onMenu: () => this.showMenu(),
        }),
      );
    }, 2200);
  }

  private onEnding(sim: Sim, id: EndingId) {
    this.mode = 'ending';
    this.closeAll();
    this.releaseLock();
    this.hud.clearSubs();
    this.endT = 0;
    this.fadeTarget = 1;
    audio.setMood('silence');
    const time = sim.state.playTime;
    const isNew = !this.meta.endings.includes(id);
    if (isNew) this.meta.endings.push(id);
    const newBest = this.meta.bestTime === null || time < this.meta.bestTime;
    if (newBest) this.meta.bestTime = time;
    saveMeta(this.meta);
    window.setTimeout(() => {
      if (this.sim !== sim) return;
      this.hud.show(false);
      audio.setMood(ENDINGS[id].tone === 'loop' ? 'menu' : 'calm');
      this.open(
        endingView({
          id,
          time,
          docs: sim.state.docs.length,
          deaths: sim.state.deaths,
          endings: this.meta.endings.length,
          newBest,
          hasSave: hasState(),
          onReplay: () => this.newGame(),
          onDecision: () => this.continueGame(),
          onMenu: () => this.showMenu(),
        }),
      );
    }, 2800);
  }

  // ------------------------------------------------------------------ input
  private bindInput() {
    const sig = { signal: this.ac.signal };
    window.addEventListener('keydown', this.onKeyDown, sig);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), sig);
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pause();
    }, sig);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        if (this.sim?.canSave() && this.mode === 'play') this.saveNow(false);
        audio.suspend(true);
      } else audio.suspend(false);
    }, sig);
    window.addEventListener('pagehide', () => {
      if (this.sim?.canSave() && this.mode === 'play') this.saveNow(false);
    }, sig);
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked) {
        this.unlockAt = performance.now();
        this.keys.clear();
        if (!this.expectUnlock) this.pause();
      }
      this.expectUnlock = false;
    }, sig);
    document.addEventListener('pointerlockerror', () => {
      this.locked = false;
    }, sig);
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this.mode !== 'play' || this.top || !this.sim) return;
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return; // browser glitch spikes
      const k = 0.0022 * this.settings.sensitivity;
      this.sim.look(-e.movementX * k, -e.movementY * k * (this.settings.invertY ? -1 : 1));
    }, sig);
    this.canvas.addEventListener('click', () => {
      if (this.mode === 'play' && !this.top) this.requestLock();
    }, sig);
    this.clickOverlay.addEventListener('click', () => this.requestLock(), sig);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault(), sig);
    const ro = new ResizeObserver(() => this.renderer.resize(this.root.clientWidth, this.root.clientHeight));
    ro.observe(this.root);
    this.ac.signal.addEventListener('abort', () => ro.disconnect());
    this.canvas.addEventListener('webglcontextlost', () => {
      if (this.sim?.canSave()) this.saveNow(false);
      this.fatal('Utracono grafikę', 'Przeglądarka odebrała grze dostęp do karty graficznej. Odśwież stronę — postęp zapisany w ostatnim punkcie kontrolnym zostanie zachowany.');
    }, sig);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Tab') e.preventDefault();
    if (this.mode === 'gate') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        (this.layerHost.querySelector('[data-id="enter"]') as HTMLElement | null)?.click();
      }
      return;
    }
    const top = this.top;
    if (top) {
      if (e.repeat && !/^(Digit|Numpad|Backspace)/.test(e.code)) return;
      if (top.key?.(e)) e.preventDefault();
      return;
    }
    if (this.mode !== 'play' || !this.sim) return;
    const sim = this.sim;
    if (MOVE_KEYS.has(e.code)) {
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    }
    if (e.repeat) return;
    if (!this.locked && !this.debug && e.code !== 'Escape') return;
    switch (e.code) {
      case 'KeyE':
        sim.interact();
        break;
      case 'KeyF':
        sim.toggleFlashlight();
        break;
      case 'KeyR':
        sim.useBattery();
        break;
      case 'Tab':
        audio.ui('move');
        this.open(tabletView(sim, 'zadania', () => this.close()));
        break;
      case 'Escape':
        if (performance.now() - this.unlockAt > 350) this.pause();
        break;
    }
  };

  private controls(): Controls {
    const k = this.keys;
    const can = this.mode === 'play' && !this.top && (this.locked || this.debug);
    if (!can) return { fwd: 0, side: 0, sprint: false, crouch: false };
    return {
      fwd: (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0),
      side: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      crouch: k.has('KeyC') || k.has('ControlLeft'),
    };
  }

  // ------------------------------------------------------------------ frame
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.mode === 'error') return;
    try {
      if (this.mode === 'play' || this.mode === 'dead' || this.mode === 'ending') this.playFrame(dt);
      else if (this.mode === 'menu' || this.mode === 'gate') this.menuFrame(dt);
      audio.tick(dt);
    } catch (err) {
      console.error(err);
      if (this.sim?.canSave()) this.saveNow(false);
      this.fatal('Błąd gry', `Wystąpił nieoczekiwany błąd: ${(err as Error).message}. Odśwież stronę — postęp z ostatniego zapisu jest bezpieczny.`);
    }
  };

  private menuFrame(dt: number) {
    const sim = this.menuSim;
    this.menuT += dt;
    const p = sim.player;
    p.yaw = -Math.PI / 2 + Math.sin(this.menuT * 0.06) * 0.55;
    p.pitch = -0.04 + Math.sin(this.menuT * 0.11) * 0.03;
    // now and then something stands at the far end of the corridor
    this.menuGhostT -= dt;
    if (this.menuGhostT <= 0) {
      this.menuGhostT = 16 + Math.random() * 12;
      sim.apparitions = [{ x: 50, z: 22.5, yaw: Math.PI / 2, until: this.menuT + 1.6, cameraOnly: false }];
      if (!this.settings.reduced) this.glitch = 0.3;
    }
    sim.apparitions = sim.apparitions.filter((a) => a.until > this.menuT);
    this.glitch = Math.max(0, this.glitch - dt * 1.5);
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 1.5);
    const v: ViewParams = { cctv: -1, fear: 0.08, hurt: 0, glitch: this.glitch, fade: Math.max(this.fade, 0.15), bob: [0, 0] };
    this.renderer.render(sim, dt, v, p.yaw, p.pitch);
    audio.listener(p.x, 1.6, p.z, p.yaw);
    audio.ambience({ vent: 0.6, hum: 0.25, drone: 0.15, silence: 0, staticLvl: 0, heart: 0 }, dt);
  }

  private playFrame(dt: number) {
    const sim = this.sim!;
    const top = this.top;
    const running = !this.frozen && (!top || !top.pausesSim || this.mode !== 'play');
    if (running) sim.update(dt, this.controls());
    else if (this.mode === 'play') this.keys.clear();
    // CCTV can be cut off by a power change
    if (top?.kind === 'cctv' && !sim.cctv) this.close();
    if (sim.zone && !sim.has(`v:${sim.zone}`)) sim.setFlag(`v:${sim.zone}`);
    if (this.pendingSave && sim.canSave() && this.mode === 'play') this.saveNow();
    // periodic refresh of live device screens
    this.refreshT -= dt;
    if (this.refreshT <= 0) {
      this.refreshT = 0.3;
      if (top?.kind === 'cctv') top.refresh?.();
    }
    // click-to-play overlay when the pointer is free with nothing else on screen
    this.clickOverlay.style.display = this.mode === 'play' && !this.top && !this.locked && !this.debug ? '' : 'none';

    // visual state
    if (this.mode === 'dead') {
      this.deathT += dt;
      this.hurt = Math.min(0.85, this.hurt + dt * 1.2);
      this.fadeTarget = this.deathT > 1.2 ? 0.92 : 0.2;
    } else if (this.mode === 'ending') {
      this.endT += dt;
      this.fadeTarget = 1;
    } else {
      this.hurt = Math.max(0, this.hurt - dt);
      this.fadeTarget = 0;
    }
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * (this.mode === 'play' ? 1.6 : 1.2));
    const near = this.mode === 'play' && sim.enemy.visible && sim.enemyDist < 6 ? (1 - sim.enemyDist / 6) * 0.35 : 0;
    this.glitch = Math.max(near, this.glitch - dt * 1.2);
    let bob: [number, number] = [0, 0];
    if (this.settings.headBob && !this.settings.reduced && !sim.player.hidden) {
      const m = sim.moving;
      bob = [Math.sin(sim.bob) * 0.035 * m, Math.abs(Math.cos(sim.bob)) * 0.05 * m];
    }
    const cam = sim.cctv ? sim.cctv.cam : -1;
    const v: ViewParams = { cctv: cam, fear: clamp(sim.fear, 0, 1), hurt: this.hurt, glitch: this.glitch, fade: this.fade, bob };
    this.renderer.render(sim, running ? dt : 0, v, sim.player.yaw, sim.player.pitch);

    // HUD
    this.hud.update(sim, running ? dt : 0, { showPrompt: !top && this.mode === 'play' && !sim.cctv, minimal: !!sim.cctv });

    // audio: listener, ambience and music mood
    const [ex, ey, ez] = sim.eyePos();
    audio.listener(ex, ey, ez, sim.player.yaw);
    const inChamber = sim.zone === 'komora';
    const dRadio = dist2d(ex, ez, 11.6, 16.6);
    audio.ambience(
      {
        vent: inChamber ? 0 : 0.9,
        hum: inChamber ? 0 : clamp(sim.lit(ex, ez), 0, 1) * 0.55,
        drone: 0.12 + sim.fear * 0.6 + (sim.final ? 0.3 : 0),
        silence: inChamber ? 1 : 0,
        staticLvl: Math.max(dRadio < 4 ? 1 - dRadio / 4 : 0, sim.enemy.visible && sim.enemyDist < 10 ? (1 - sim.enemyDist / 10) * 0.9 : 0),
        heart: this.mode === 'play' ? sim.fear : 0,
      },
      dt,
    );
    if (this.mode === 'play') {
      let mood: Mood = 'calm';
      if (sim.final) mood = 'final';
      else if (sim.enemy.hunting) mood = 'chase';
      else if (inChamber) mood = 'silence';
      else if (sim.phase() >= 1 || sim.fear > 0.25) mood = 'tension';
      audio.setMood(mood);
    }
    this.adaptPerformance(dt);
  }

  /** If the first seconds of play are very slow, drop the render resolution once. */
  private adaptPerformance(dt: number) {
    const p = this.perf;
    if (p.done || this.mode !== 'play' || this.top) return;
    p.t += dt;
    if (p.t < 2) return; // warm-up
    p.frames++;
    p.sum += dt;
    if (p.t < 7) return;
    p.done = true;
    const avg = p.sum / p.frames;
    if (avg > 1 / 24 && this.settings.renderScale > 0.5) {
      const s = { ...this.settings, renderScale: this.settings.renderScale > 0.75 ? 0.75 : 0.5 };
      this.onSettings(s);
      this.hud.toast(`Obniżono rozdzielczość renderu do ${Math.round(s.renderScale * 100)}% dla płynności (Ustawienia).`);
    }
  }

  // ------------------------------------------------------------------ lifecycle
  dispose() {
    cancelAnimationFrame(this.raf);
    this.ac.abort();
    this.releaseLock();
    this.renderer?.dispose();
    audio.suspend(true);
    this.root.replaceChildren();
  }

  // ------------------------------------------------------------------ test hooks (?debug only)
  private exposeDebug() {
    const app = this;
    (window as unknown as { __ns: unknown }).__ns = {
      app,
      get sim() {
        return app.sim;
      },
      get mode() {
        return app.mode;
      },
      get modal() {
        return app.top?.kind ?? null;
      },
      freeze(on: boolean) {
        app.frozen = on;
      },
      noFade() {
        app.fade = 0;
        app.fadeTarget = 0;
      },
      audioState() {
        return audio.ctx ? audio.ctx.state : 'none';
      },
      lights() {
        return app.renderer ? { quality: app.renderer.quality, scale: app.renderer.renderScale, w: app.renderer.width, h: app.renderer.height } : null;
      },
      tick(seconds: number, c: Partial<Controls> = {}) {
        const sim = app.sim!;
        const steps = Math.ceil(seconds * 30);
        for (let i = 0; i < steps; i++) sim.update(1 / 30, { fwd: 0, side: 0, sprint: false, crouch: false, ...c });
      },
      teleport(x: number, z: number, yaw = 0, pitch = 0) {
        const p = app.sim!.player;
        p.x = x;
        p.z = z;
        p.yaw = yaw;
        p.pitch = pitch;
        app.sim!.updateFocus();
      },
      aim(id: string) {
        return app.sim!.aimAt(id);
      },
      focus() {
        return app.sim?.focus ? { id: app.sim.focus.id, label: app.sim.focus.label() } : null;
      },
      interact() {
        app.sim!.interact();
      },
      /** stand next to an interactable (free floor, no furniture) and aim at it */
      approach(id: string) {
        const sim = app.sim!;
        const it = sim.interactables.find((i) => i.id === id);
        if (!it) return false;
        const cx = (it.box.x0 + it.box.x1) / 2;
        const cz = (it.box.z0 + it.box.z1) / 2;
        for (const d of [1.1, 1.5, 1.9, 0.8])
          for (let k = 0; k < 24; k++) {
            const a = (k / 24) * Math.PI * 2;
            const x = cx + Math.cos(a) * d;
            const z = cz + Math.sin(a) * d;
            const L = sim.level;
            const c = L.cell(Math.floor(x / 2), Math.floor(z / 2));
            if (c !== 1) continue;
            if (L.propBoxes.some(({ box }) => x > box.x0 - 0.32 && x < box.x1 + 0.32 && z > box.z0 - 0.32 && z < box.z1 + 0.32)) continue;
            // stay clear of walls
            if ([[-0.32, 0], [0.32, 0], [0, -0.32], [0, 0.32]].some(([dx, dz]) => L.cell(Math.floor((x + dx) / 2), Math.floor((z + dz) / 2)) === 0)) continue;
            sim.player.x = x;
            sim.player.z = z;
            sim.zone = sim.level.zoneAt(x, z);
            if (sim.aimAt(id)) return true;
          }
        return false;
      },
      fps() {
        return new Promise<number>((res) => {
          let n = 0;
          const t0 = performance.now();
          const f = () => {
            n++;
            if (performance.now() - t0 < 2000) requestAnimationFrame(f);
            else res((n * 1000) / (performance.now() - t0));
          };
          requestAnimationFrame(f);
        });
      },
    };
  }
}
