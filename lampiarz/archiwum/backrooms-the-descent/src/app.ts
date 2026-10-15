// Application shell: canvas, renderer, audio, UI layers and the current simulation;
// input, simulation events, saving, death, endings and the page lifecycle.
import { audio, type Mood } from './audio/audio';
import { clamp, dist2d } from './engine/math';
import { Renderer, type ViewParams } from './engine/renderer';
import { codeOf } from './game/puzzle';
import { Sim, type Controls, type SimEvent } from './game/sim';
import { clearState, hasState, loadMeta, loadSettings, loadState, newState, saveMeta, saveSettings, writeState, type GameState, type Meta, type Settings } from './game/state';
import { DIFF, type EndingId } from './game/story';
import { CAMERAS, PROP_BY_ID, type Difficulty } from './world/map';
import { clockFace, drawHands, paintCanvas, plateCanvas, rosterCanvas, uvCanvas } from './world/puzzleArt';
import { h } from './ui/dom';
import { Hud } from './ui/hud';
import {
  cctvView,
  confirmView,
  controlsView,
  deathView,
  difficultyView,
  docView,
  endingsView,
  endingView,
  errorView,
  generatorView,
  imageView,
  journalView,
  keypadView,
  loadingView,
  menuView,
  optionsView,
  pauseView,
  radioView,
  terminalView,
  warningView,
  type Modal,
} from './ui/views';

type Mode = 'loading' | 'gate' | 'menu' | 'play' | 'dead' | 'ending' | 'error';
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyC', 'ControlLeft']);

export class App {
  canvas = h('canvas', { class: 'bd-canvas', 'aria-label': 'Widok gry BACKROOMS: THE DESCENT' }) as HTMLCanvasElement;
  ui = h('div', { class: 'bd-ui' });
  layerHost = h('div');
  clickOverlay = h('div', { class: 'bd-click', role: 'button', tabindex: '0' }, 'KLIKNIJ, ABY KONTYNUOWAĆ', h('br'), h('span', { class: 'bd-dim', style: 'font-size:13px' }, 'Esc — pauza'));
  hud = new Hud();
  renderer!: Renderer;
  sim: Sim | null = null;
  menuSim!: Sim;
  settings: Settings = loadSettings();
  meta: Meta = loadMeta();
  mode: Mode = 'loading';
  stack: Modal[] = [];
  keys = new Set<string>();
  mouse = { fire: false, aim: false };
  locked = false;
  debug = new URLSearchParams(location.search).has('debug');
  frozen = false;
  fade = 1;
  fadeTarget = 0;
  private raf = 0;
  private last = 0;
  private ac = new AbortController();
  private unlockAt = 0;
  private expectUnlock = false;
  private hurt = 0;
  private glitch = 0;
  private shake = 0;
  private pendingSave = false;
  private deathT = 0;
  private refreshT = 0;
  private tickT = 0;
  private perf = { t: 0, frames: 0, sum: 0, done: false };
  private saveWarning: string | null = null;
  private menuT = 0;
  private menuGhostT = 10;
  private puzzleSeed = -1;

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
      this.fatal('Brak WebGL 2', 'Ta gra wymaga przeglądarki z obsługą WebGL 2 (aktualny Chrome, Edge, Firefox lub Safari 15+) i włączonej akceleracji sprzętowej grafiki.');
      return;
    }
    const loading = loadingView();
    this.layerHost.replaceChildren(loading.el);
    try {
      await document.fonts?.ready;
    } catch {
      /* fonts are optional */
    }
    this.menuSim = new Sim(newState('normal', 20260917));
    try {
      await this.renderer.load(this.menuSim, (d, t, label) => loading.set(d, t, label));
    } catch (e) {
      console.error(e);
      this.fatal('Błąd grafiki', `Nie udało się przygotować grafiki: ${(e as Error).message}. Odśwież stronę albo wybierz niższą jakość.`);
      return;
    }
    this.puzzleSeed = this.menuSim.state.seed;
    this.renderer.setSettings(this.settings);
    this.placeMenuCamera();
    this.bindInput();
    this.applyAudioSettings();
    this.mode = 'gate';
    const enter = () => {
      audio.unlock();
      this.applyAudioSettings();
      this.meta.warned = true;
      saveMeta(this.meta);
      this.showMenu();
    };
    this.layerHost.replaceChildren(warningView(enter));
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
    p.x = 46;
    p.z = 59;
    p.yaw = -Math.PI / 2;
    p.pitch = 0;
    this.menuSim.zone = 'maze';
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
    const first = t?.el.querySelector<HTMLElement>('.bd-primary, button:not([disabled])');
    if (first && t && t.kind !== 'cctv') first.focus({ preventScroll: true });
  }
  open(m: Modal, replace = false) {
    if (replace) this.stack.pop()?.onClose?.();
    this.stack.push(m);
    if (this.mode === 'play') this.releaseLock();
    this.keys.clear();
    this.mouse.fire = this.mouse.aim = false;
    this.renderTop();
  }
  close() {
    const m = this.stack.pop();
    m?.onClose?.();
    if (m?.kind === 'cctv' && this.sim) this.sim.cctv = null;
    if (m?.kind === 'radio') audio.radioStop();
    this.renderTop();
    if (!this.top && this.mode === 'play') this.resumePlay();
  }
  closeAll() {
    if (this.sim) this.sim.cctv = null;
    for (const m of this.stack) m.onClose?.();
    audio.radioStop();
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
      /* the click overlay covers it */
    }
  }
  private resumePlay() {
    this.requestLock();
  }

  // ------------------------------------------------------------------ menus
  showMenu() {
    this.mode = 'menu';
    this.sim = null;
    this.closeAll();
    this.hud.show(false);
    this.hud.clearSubs();
    this.releaseLock();
    this.fade = 1;
    this.fadeTarget = 0;
    this.hurt = 0;
    audio.setMood('menu');
    audio.setLoop('gen', 'machine', [104, 1, 67.5], 0);
    this.open(this.buildMenu());
  }
  private buildMenu(): Modal {
    const { state, warning } = loadState();
    if (warning) this.saveWarning = warning;
    const w = this.saveWarning;
    this.saveWarning = null;
    return menuView({
      save: state ? { difficulty: state.difficulty, area: state.area, playTime: state.playTime } : null,
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
    const pick = () =>
      this.open(
        difficultyView(
          (d) => {
            clearState();
            this.startGame(newState(d), true);
          },
          () => this.close(),
        ),
        this.top?.kind === 'confirm',
      );
    if (hasState()) this.open(confirmView('Nowa gra?', 'Istniejący zapis zostanie nadpisany. Tej operacji nie można cofnąć.', 'Nadpisz zapis', pick, () => this.close()));
    else pick();
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
    if (state.seed !== this.puzzleSeed) {
      this.renderer.setPuzzle(sim.puzzle);
      this.puzzleSeed = state.seed;
    }
    sim.listeners.push((e) => this.onSimEvent(sim, e));
    this.mode = 'play';
    this.closeAll();
    this.hud.clearSubs();
    this.hud.show(true);
    this.fade = 1;
    this.fadeTarget = 0;
    this.hurt = 0;
    this.glitch = 0;
    this.deathT = 0;
    this.pendingSave = false;
    audio.setMood('calm');
    if (fresh) {
      this.saveNow(false);
      this.hud.toast('WASD — ruch · mysz — rozglądanie · E — interakcja · F — latarka · Tab — dziennik');
    } else this.hud.toast(`Wczytano · ${DIFF[state.difficulty].name}`);
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

  // ------------------------------------------------------------------ pause
  pause() {
    const sim = this.sim;
    if (!sim || this.mode !== 'play' || (this.top && this.top.pausesSim)) return;
    audio.ui('back');
    const m = pauseView({
      save: sim.manualSaveAllowed(),
      diff: sim.state.difficulty,
      onResume: () => this.close(),
      onSave: () => {
        if (sim.manualSaveAllowed().ok && this.saveNow()) {
          const b = this.top?.el.querySelector('[data-id="save"]');
          if (b && !b.querySelector('small')) b.append(h('small', null, 'zapisano'));
          else if (b) b.querySelector('small')!.textContent = 'zapisano';
        }
      },
      onOptions: () => this.open(optionsView(this.settings, this.onSettings, () => this.close(), this.isFullscreen, this.toggleFullscreen)),
      onControls: () => this.open(controlsView(() => this.close())),
      onMenu: () =>
        this.open(confirmView('Wyjść do menu?', sim.diff.manualSave === 'none' ? 'Wrócisz do ostatniego automatycznego zapisu.' : 'Postęp od ostatniego zapisu przepadnie, jeśli go nie zapisałeś.', 'Wyjdź', () => this.showMenu(), () => this.close())),
    });
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
      case 'echoCall': {
        const d = dist2d(e.x, e.z, sim.player.x, sim.player.z);
        if (d < 32) this.hud.say([{ who: 'GŁOS', text: d > 18 ? `(z daleka) ${e.text}` : e.text, t: 2.6 }]);
        break;
      }
      case 'message':
        this.hud.toast(e.text, e.tone);
        break;
      case 'pickup':
        this.hud.toast(`Zabrano: ${e.text}`, 'good');
        break;
      case 'doc':
        if (this.mode === 'play') this.open(docView(sim, e.id, () => this.close()));
        break;
      case 'ui':
        this.openDevice(sim, e.screen, e.ref);
        break;
      case 'sfx':
        if (e.x !== undefined && e.z !== undefined) {
          // behind walls or a closed door, sounds come through dull
          const p = sim.player;
          let muffle = 0;
          if (dist2d(p.x, p.z, e.x, e.z) > 1.2 && !sim.level.lineClear(p.x, p.z, e.x, e.z)) muffle = 1;
          else if (dist2d(p.x, p.z, e.x, e.z) > 1.2 && !sim.level.lineClear(p.x, p.z, e.x, e.z, (cx, cz) => sim.closedDoorAt(cx, cz))) muffle = 0.6;
          audio.sfx(e.name, [e.x, e.y ?? 1.2, e.z], e.vol ?? 1, muffle);
        } else audio.sfx(e.name, undefined, e.vol ?? 1);
        break;
      case 'hurt':
        this.shake = Math.max(this.shake, 0.8);
        this.glitch = Math.max(this.glitch, 0.3);
        break;
      case 'death':
        this.onDeath(sim, e.by);
        break;
      case 'ending':
        this.onEnding(sim, e.id);
        break;
      case 'checkpoint':
        this.pendingSave = true;
        break;
      case 'observe':
        if (sim.diff.journal !== 'none' && e.id !== 'order') this.hud.toast('Zapisano w dzienniku (Tab).', 'good');
        break;
      case 'power':
        this.top?.refresh?.();
        break;
      case 'scare':
        this.glitch = Math.max(this.glitch, e.strength * 0.8);
        this.shake = Math.max(this.shake, e.strength * 0.6);
        if (e.kind !== 'chase' && e.kind !== 'quake') audio.sfx('sting', undefined, e.strength);
        break;
      case 'lift':
        if (e.phase === 'start') {
          this.closeAll();
          this.fadeTarget = 0.7;
        } else {
          this.fade = 1;
          this.fadeTarget = 0;
        }
        break;
      case 'shot':
        this.shake = Math.max(this.shake, 0.25);
        break;
    }
  }

  private openDevice(sim: Sim, screen: string, ref?: string) {
    if (this.mode !== 'play') return;
    const P = sim.puzzle;
    switch (screen) {
      case 'keypad':
        this.open(
          keypadView(sim, {
            onClose: () => this.close(),
            onPress: () => audio.sfx('key'),
            onResult: (r) => {
              if (r === 'ok') this.close();
            },
          }),
        );
        break;
      case 'generator': {
        const m = generatorView(sim, {
          onClose: () => this.close(),
          onAction: (a) => {
            const r = sim.genAction(a);
            const msg = r === 'flood' ? 'SILNIK ZALANY. Huk niesie się po korytarzach. Odczekaj chwilę.' : r === 'cooldown' ? 'Silnik jeszcze zalany. Odczekaj kilka sekund.' : sim.state.gen.on ? 'Agregat ruszył.' : `Krok ${sim.state.gen.step}/3 przyjęty.`;
            (m as Modal & { drawMsg: (s: string) => void }).drawMsg(msg);
          },
        });
        this.open(m);
        break;
      }
      case 'radio': {
        const m = radioView(sim, {
          onClose: () => this.close(),
          onTune: (f) => {
            sim.radioFreq = f;
            audio.radioPlay('noise', '', 0.6, false);
          },
          onListen: () => this.listenRadio(sim, m as Modal & { log: HTMLElement }),
        });
        audio.radioPlay('noise', '', 0.6, false);
        this.open(m);
        break;
      }
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
          }),
        );
        break;
      case 'roster':
        this.open(imageView('Lista Zwiadu 4', 'Tablica w obozie', rosterCanvas(P), 'Dziewięć nazwisk. Krzyżyki przy niektórych z nich.', () => this.close()));
        break;
      case 'clock': {
        const i = Number(ref);
        const live = i === P.liveClock;
        const c = clockFace(live ? null : P.clocks[i].h, live ? null : P.clocks[i].m);
        if (live) drawHands(c.getContext('2d')!, P.clocks[i].h, Math.min(59, P.clocks[i].m + sim.state.playTime / 60), Math.floor(performance.now() / 1000) % 60);
        this.open(imageView(`Zegar ${i + 1}`, 'Pokój zegarów', c, live ? 'Wskazówka sekundowa się porusza. Słychać tykanie.' : 'Zegar stoi. Wskazówki nie drgną.', () => this.close()));
        break;
      }
      case 'note':
        if (ref === 'uv') this.open(imageView('Znaki w świetle UV', 'Magazyn chemiczny', uvCanvas(P.digits.eye), 'Napis świeci tylko pod lampą UV.', () => this.close()));
        else if (ref === 'paint') this.open(imageView('Napis farbą', 'Magazyn chemiczny', paintCanvas(P.uvFake), 'Zwykła farba, świeża, starannie wymalowana.', () => this.close()));
        else this.open(imageView('Tabliczka nad zamkiem', 'Zbrojownia', plateCanvas(P.order), 'Kolejność znaków kodu.', () => this.close()));
        break;
      case 'terminal':
        audio.sfx('beep');
        this.open(
          terminalView(sim, {
            onClose: () => this.close(),
            onChoice: (c) => {
              if (sim.anchorChoice(c)) this.close();
            },
          }),
        );
        break;
    }
  }

  private listenRadio(sim: Sim, m: Modal & { log: HTMLElement }) {
    const st = sim.stationAt(sim.radioFreq);
    const P = sim.puzzle;
    if (!st) {
      audio.radioPlay('noise', '', 0.9, false);
      m.log.textContent = '[szum]';
      return;
    }
    const real = P.radio.real === st;
    const n = real ? P.digits.triangle : P.radio.fake;
    const words = `Trójkąt. ${n}. Trójkąt. ${n}.`;
    const dur = audio.radioPlay(real ? 'real' : 'fake', words, 1, this.settings.voice);
    m.log.textContent = real ? '[szum] [trzask] [trzask] [trzask] …' : '[cisza] …';
    window.setTimeout(() => {
      if (this.top !== m) return;
      m.log.textContent = `${real ? '[szum] [trzask] [trzask] [trzask]' : '[cisza]'}  „${words}”`;
      sim.observe(`radio_${st}`);
    }, Math.max(1500, (dur - 1.5) * 1000));
  }

  private onDeath(sim: Sim, by: string) {
    this.mode = 'dead';
    this.closeAll();
    this.releaseLock();
    this.hud.clearSubs();
    this.deathT = 0;
    this.glitch = 1;
    this.shake = 1.5;
    audio.setMood('silence');
    window.setTimeout(() => {
      if (this.sim !== sim || this.mode !== 'dead') return;
      this.hud.show(false);
      this.open(
        deathView({
          by,
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
    }, 2400);
  }

  private onEnding(sim: Sim, id: EndingId) {
    this.mode = 'ending';
    this.closeAll();
    this.releaseLock();
    this.hud.clearSubs();
    this.fadeTarget = 1;
    audio.setMood('silence');
    const time = sim.state.playTime;
    if (!this.meta.endings.includes(id)) this.meta.endings.push(id);
    const newBest = this.meta.bestTime === null || time < this.meta.bestTime;
    if (newBest) this.meta.bestTime = time;
    saveMeta(this.meta);
    window.setTimeout(() => {
      if (this.sim !== sim) return;
      this.hud.show(false);
      audio.setMood(id === 'zejscie' ? 'tension' : 'calm');
      this.open(
        endingView({
          id,
          sim,
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
      this.mouse.fire = this.mouse.aim = false;
      this.pause();
    }, sig);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        audio.suspend(true);
      } else audio.suspend(false);
    }, sig);
    window.addEventListener('pagehide', () => {
      if (this.sim?.manualSaveAllowed().ok && this.mode === 'play') this.saveNow(false);
    }, sig);
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked) {
        this.unlockAt = performance.now();
        this.keys.clear();
        this.mouse.fire = this.mouse.aim = false;
        if (!this.expectUnlock) this.pause();
      }
      this.expectUnlock = false;
    }, sig);
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this.mode !== 'play' || this.top || !this.sim) return;
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      const k = 0.0022 * this.settings.sensitivity * (this.sim.aimT > 0.5 ? 0.6 : 1);
      this.sim.look(-e.movementX * k, -e.movementY * k * (this.settings.invertY ? -1 : 1));
    }, sig);
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.mode !== 'play' || this.top) return;
      if (!this.locked && !this.debug) {
        this.requestLock();
        return;
      }
      if (e.button === 0) this.mouse.fire = true;
      if (e.button === 2) this.mouse.aim = true;
    }, sig);
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.fire = false;
      if (e.button === 2) this.mouse.aim = false;
    }, sig);
    this.clickOverlay.addEventListener('click', () => this.requestLock(), sig);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault(), sig);
    const ro = new ResizeObserver(() => this.renderer.resize(this.root.clientWidth, this.root.clientHeight));
    ro.observe(this.root);
    this.ac.signal.addEventListener('abort', () => ro.disconnect());
    this.canvas.addEventListener('webglcontextlost', () => {
      this.fatal('Utracono grafikę', 'Przeglądarka odebrała grze dostęp do karty graficznej. Odśwież stronę — postęp z ostatniego zapisu jest bezpieczny.');
    }, sig);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // typing in the journal: only Escape and Tab leave the field
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && (t as HTMLInputElement).type !== 'range' && e.code !== 'Escape' && e.code !== 'Tab') return;
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
      if (e.repeat && !/^(Digit|Numpad|Backspace|Arrow)/.test(e.code)) return;
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
      case 'KeyB':
        sim.useBattery();
        break;
      case 'KeyH':
        sim.useMedkit();
        break;
      case 'KeyQ':
        sim.toggleWeapon();
        break;
      case 'KeyR':
        sim.reload();
        break;
      case 'Tab':
        audio.sfx('paper');
        this.open(journalView(sim, () => this.close()));
        break;
      case 'Escape':
        if (performance.now() - this.unlockAt > 350) this.pause();
        break;
    }
  };

  private controls(): Controls {
    const k = this.keys;
    const can = this.mode === 'play' && !this.top && (this.locked || this.debug);
    if (!can) return { fwd: 0, side: 0, sprint: false, crouch: false, fire: false, aim: false };
    return {
      fwd: (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0),
      side: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      crouch: k.has('KeyC') || k.has('ControlLeft'),
      fire: this.mouse.fire,
      aim: this.mouse.aim,
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
      this.fatal('Błąd gry', `Wystąpił nieoczekiwany błąd: ${(err as Error).message}. Odśwież stronę — postęp z ostatniego zapisu jest bezpieczny.`);
    }
  };

  private menuFrame(dt: number) {
    const sim = this.menuSim;
    this.menuT += dt;
    const p = sim.player;
    // a slow walk down the corridor that never arrives
    p.x = 46 - ((this.menuT * 0.3) % 6);
    p.yaw = Math.PI / 2 + Math.sin(this.menuT * 0.05) * 0.25;
    p.pitch = Math.sin(this.menuT * 0.09) * 0.03;
    this.menuGhostT -= dt;
    if (this.menuGhostT <= 0) {
      this.menuGhostT = 14 + Math.random() * 10;
      sim.apparitions = [{ type: 'stalker', x: 27, z: 59, yaw: -Math.PI / 2, until: sim.time + 1.8 }];
      this.glitch = this.settings.reduced ? 0 : 0.3;
    }
    sim.time += dt;
    sim.apparitions = sim.apparitions.filter((a) => a.until > sim.time);
    this.glitch = Math.max(0, this.glitch - dt * 1.5);
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 1.5);
    const v: ViewParams = { cctv: -1, fear: 0.1, hurt: 0, glitch: this.glitch, fade: Math.max(this.fade, 0.12), bob: [0, Math.sin(this.menuT * 2) * 0.01], shake: 0, zoom: 0 };
    this.renderer.render(sim, dt, v, p.yaw, p.pitch, false);
    audio.listener(p.x, 1.6, p.z, p.yaw);
    audio.ambience({ vent: 0.5, hum: 0.6, drone: 0.12, silence: 0, staticLvl: 0, heart: 0 }, dt);
  }

  private playFrame(dt: number) {
    const sim = this.sim!;
    const top = this.top;
    const running = !this.frozen && (!top || !top.pausesSim || this.mode !== 'play');
    if (running) sim.update(dt, this.controls());
    else if (this.mode === 'play') this.keys.clear();
    if (top?.kind === 'cctv' && !sim.cctv) this.close();
    if (this.pendingSave && sim.canSave() && this.mode === 'play') this.saveNow();
    this.refreshT -= dt;
    if (this.refreshT <= 0) {
      this.refreshT = 0.3;
      if (top?.kind === 'cctv') top.refresh?.();
    }
    this.clickOverlay.style.display = this.mode === 'play' && !this.top && !this.locked && !this.debug ? '' : 'none';

    // visual state
    if (this.mode === 'dead') {
      this.deathT += dt;
      this.hurt = Math.min(0.85, this.hurt + dt * 1.2);
      this.fadeTarget = this.deathT > 1.4 ? 0.92 : 0.25;
    } else if (this.mode === 'ending') this.fadeTarget = 1;
    else if (sim.lift) this.fadeTarget = sim.lift.t > 6.5 ? 1 : 0.55 + Math.random() * 0.1 * (sim.lift.t > 3 ? 1 : 0);
    else {
      this.hurt = Math.max(0, this.hurt - dt);
      this.fadeTarget = 0;
    }
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * (this.mode === 'play' ? 1.6 : 1.2));
    const near = sim.monsters.some((m) => m.visible && m.alive && dist2d(m.x, m.z, sim.player.x, sim.player.z) < 5) ? 0.15 : 0;
    this.glitch = Math.max(near, this.glitch - dt * 1.2);
    this.shake = Math.max(sim.collapse ? 0.35 : sim.lift && sim.lift.t > 0.5 ? 0.25 : 0, this.shake - dt * 2.5);
    let bob: [number, number] = [0, 0];
    if (this.settings.headBob && !this.settings.reduced && !sim.player.hide) {
      const m = sim.moving;
      bob = [Math.sin(sim.bob) * 0.03 * m, Math.abs(Math.cos(sim.bob)) * 0.045 * m];
    }
    const cam = sim.cctv ? sim.cctv.cam : -1;
    const hurt = Math.max(this.hurt, sim.state.health < 30 && this.mode === 'play' ? (30 - sim.state.health) / 120 : 0);
    const v: ViewParams = { cctv: cam, fear: clamp(sim.fear, 0, 1), hurt, glitch: this.glitch, fade: this.fade, bob, shake: this.shake, zoom: sim.aimT };
    this.renderer.render(sim, running ? dt : 0, v, sim.player.yaw, sim.player.pitch, this.mode === 'play' && !sim.cctv);
    this.hud.update(sim, running ? dt : 0, { showPrompt: !top && this.mode === 'play' && !sim.cctv, minimal: !!sim.cctv });

    // audio
    const [ex, ey, ez] = sim.eyePos();
    audio.listener(ex, ey, ez, sim.player.yaw);
    const z = sim.zone;
    const echo = sim.monsters.find((m) => m.type === 'echo' && m.visible && m.alive);
    const echoD = echo ? dist2d(echo.x, echo.z, ex, ez) : 99;
    audio.ambience(
      {
        vent: z === 'secret' ? 0.2 : 0.8,
        hum: clamp(sim.lit(ex, ez), 0, 1) * (z === 'maze' || z === 'start' ? 0.9 : 0.4),
        drone: 0.1 + sim.fear * 0.6 + (sim.collapse ? 0.4 : 0) + (sim.state.area === 'descent' ? 0.15 : 0),
        silence: z === 'secret' ? 0.6 : 0,
        staticLvl: echoD < 12 ? (1 - echoD / 12) * 0.9 : 0,
        heart: this.mode === 'play' ? sim.fear : 0,
      },
      dt,
    );
    audio.setLoop('gen', 'machine', [104, 1, 67.5], sim.state.gen.on && sim.state.area === 'upper' ? 0.9 : 0);
    // the clock that still ticks
    const P = sim.puzzle;
    const clock = PROP_BY_ID[`clock${P.liveClock}`];
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 1;
      if (sim.state.area === 'upper' && dist2d(clock.x, clock.z, ex, ez) < 16 && running) audio.sfx('tick', [clock.x, 1.86, clock.z], 0.9);
    }
    if (this.mode === 'play') {
      let mood: Mood = 'calm';
      if (sim.collapse) mood = 'final';
      else if (sim.monsters.some((m) => m.hunting && m.alive)) mood = 'chase';
      else if (z === 'secret') mood = 'silence';
      else if (sim.fear > 0.2 || sim.state.area === 'descent') mood = 'tension';
      audio.setMood(mood);
    }
    this.adaptPerformance(dt);
  }

  private adaptPerformance(dt: number) {
    const p = this.perf;
    if (p.done || this.mode !== 'play' || this.top) return;
    p.t += dt;
    if (p.t < 2) return;
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

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ac.abort();
    this.releaseLock();
    audio.radioStop();
    this.renderer?.dispose();
    audio.suspend(true);
    this.root.replaceChildren();
  }

  // ------------------------------------------------------------------ test hooks (?debug only)
  private exposeDebug() {
    const app = this;
    const idle: Controls = { fwd: 0, side: 0, sprint: false, crouch: false, fire: false, aim: false };
    (window as unknown as { __bd: unknown }).__bd = {
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
      code() {
        return app.sim ? codeOf(app.sim.puzzle) : null;
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
      tick(seconds: number, c: Partial<Controls> = {}) {
        const sim = app.sim!;
        const steps = Math.ceil(seconds * 30);
        for (let i = 0; i < steps; i++) sim.update(1 / 30, { ...idle, ...c });
      },
      teleport(x: number, z: number, yaw = 0, pitch = 0) {
        const p = app.sim!.player;
        p.x = x;
        p.z = z;
        p.yaw = yaw;
        p.pitch = pitch;
        app.sim!.zone = app.sim!.level.zoneAt(x, z);
        app.sim!.updateFocus();
      },
      calm() {
        for (const m of app.sim!.monsters) {
          m.active = false;
          m.set('dormant');
          m.x = m.z = -100;
        }
      },
      focus() {
        return app.sim?.focus ? { id: app.sim.focus.id, label: app.sim.focus.label() } : null;
      },
      interact() {
        app.sim!.interact();
      },
      approach(id: string) {
        const sim = app.sim!;
        const it = sim.interactables.find((i) => i.id === id);
        if (!it) return false;
        const cx = (it.box.x0 + it.box.x1) / 2;
        const cz = (it.box.z0 + it.box.z1) / 2;
        const L = sim.level;
        for (const d of [1.1, 1.5, 1.9, 0.8])
          for (let k = 0; k < 24; k++) {
            const a = (k / 24) * Math.PI * 2;
            const x = cx + Math.cos(a) * d;
            const z = cz + Math.sin(a) * d;
            const t = L.cell(Math.floor(x / 2), Math.floor(z / 2));
            if (t !== 1 && t !== 3) continue;
            if (L.propBoxes.some(({ box }) => x > box.x0 - 0.32 && x < box.x1 + 0.32 && z > box.z0 - 0.32 && z < box.z1 + 0.32)) continue;
            if ([[-0.32, 0], [0.32, 0], [0, -0.32], [0, 0.32]].some(([dx, dz]) => L.isSolid(Math.floor((x + dx) / 2), Math.floor((z + dz) / 2)))) continue;
            sim.player.x = x;
            sim.player.z = z;
            sim.zone = L.zoneAt(x, z);
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
      lights() {
        return { quality: app.renderer.quality, scale: app.renderer.renderScale, w: app.renderer.width, h: app.renderer.height };
      },
    };
  }
}

export type { Difficulty };
