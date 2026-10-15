// The application shell: the main loop, screens, the match flow (intro card →
// countdown → play → round result → next round → victory), pause, settings,
// the attract-mode demo behind the menu, audio and the debug hooks for tests.
import { audio } from './audio/audio';
import { Input } from './engine/input';
import { Renderer } from './render/renderer';
import { Bot } from './sim/bot';
import { GAME_BY_ID, GAME_IDS, type GameId } from './sim/games/registry';
import { Round } from './sim/round';
import { Match } from './sim/tournament';
import { LENGTH, loadSettings, loadStats, saveSettings, saveStats, EMPTY_STATS, type Settings, type Stats } from './state';
import { h, setUiSound } from './ui/dom';
import { confirmView, controlsView, drawIcon, errorView, gamesView, introView, liveIcons, loadingView, menuView, pauseView, playersView, resultsView, settingsView, setupView, victoryView, type Screen } from './ui/screens';
import { PK } from './render/fx';
import { PCOL } from './render/character';

type Mode = 'loading' | 'menu' | 'intro' | 'play' | 'paused' | 'results' | 'victory';

export class App {
  canvas: HTMLCanvasElement;
  ui: HTMLElement;
  renderer: Renderer;
  input = new Input();
  settings: Settings = loadSettings();
  stats: Stats = loadStats();
  mode: Mode = 'loading';
  match: Match | null = null;
  round: Round | null = null;
  demo: Round | null = null;
  private demoBots = [new Bot(0, 0.75), new Bot(1, 0.7)];
  private stack: Screen[] = [];
  private intro: (Screen & { ready: (i: 0 | 1) => void }) | null = null;
  private recorded = false;
  private last = 0;
  private raf = 0;
  private iconT = 0;
  private ro: ResizeObserver | null = null;
  debug = new URLSearchParams(location.search).has('debug');
  /** tests: freeze the simulation (rendering continues) */
  frozen = false;
  /** tests: inputs set from outside replace the keyboard */
  forced: [Partial<import('./sim/player').PadInput> | null, Partial<import('./sim/player').PadInput> | null] = [null, null];

  constructor(public root: HTMLElement) {
    root.replaceChildren();
    root.classList.add('rc-root');
    this.canvas = h('canvas', { class: 'rc-canvas', 'aria-label': 'Arena gry RANDOM CHAOS' }) as HTMLCanvasElement;
    this.ui = h('div', { class: 'rc-ui' });
    root.append(this.canvas, this.ui);
    this.renderer = new Renderer(this.canvas);
    setUiSound((k) => audio.sfx(k));
    this.input.onBlur = () => {
      if (this.mode === 'play') this.pause();
    };
  }

  async start() {
    this.ui.replaceChildren(loadingView());
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.root);
    const unlock = () => {
      audio.unlock();
      this.applyAudio();
    };
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('pointerdown', unlock, { capture: true });
    try {
      await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
    } catch {
      /* fonts are optional */
    }
    this.applyAudio();
    this.newDemo();
    this.showMenu();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    if (this.debug) this.exposeDebug();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.input.dispose();
    audio.dispose();
  }

  private resize() {
    const r = this.root.getBoundingClientRect();
    this.renderer.resize(Math.max(1, r.width), Math.max(1, r.height));
  }

  private applyAudio() {
    audio.volumes.music = this.settings.music;
    audio.volumes.sfx = this.settings.sfx;
    audio.applyVolumes();
  }
  private saveSettings = () => {
    saveSettings(this.settings);
    this.applyAudio();
  };

  // ---------------------------------------------------------------- screens
  private show(s: Screen | null, push = false) {
    if (!push) this.stack = [];
    if (s) this.stack.push(s);
    this.ui.replaceChildren(...(s ? [s.el] : []));
    this.ui.classList.toggle('dim', !!s && this.mode !== 'intro' && this.mode !== 'results' && this.mode !== 'victory');
    window.setTimeout(() => (s?.focus ?? s?.el.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true }), 0);
  }
  private popScreen() {
    this.stack.pop();
    const s = this.stack[this.stack.length - 1] ?? null;
    this.ui.replaceChildren(...(s ? [s.el] : []));
    window.setTimeout(() => (s?.focus ?? s?.el.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true }), 0);
  }
  private get top() {
    return this.stack[this.stack.length - 1] ?? null;
  }

  showMenu() {
    this.mode = 'menu';
    this.match = null;
    this.round = null;
    this.input.capture = false;
    if (!this.demo) this.newDemo();
    audio.playMusic('menu');
    this.ui.classList.remove('dim');
    this.show(
      menuView({
        names: this.settings.names,
        target: this.settings.target,
        onPlay: () => this.quickMatch(),
        onTournament: () => this.show(setupView(this.settings, this.saveSettings, () => this.tournament(), () => this.showMenu()), true),
        onGames: () => this.show(gamesView((id) => this.single(id), () => this.popScreen()), true),
        onSettings: () => this.openSettings(),
        onControls: () => this.show(controlsView(this.settings.names, () => this.popScreen(), () => ({ pads: [this.input.pad(0), this.input.pad(1)], gamepads: this.input.gamepadCount() })), true),
        onPlayers: () => this.show(playersView(this.settings, this.stats, this.saveSettings, () => this.showMenu()), true),
      }),
    );
  }
  private openSettings() {
    this.show(
      settingsView(this.settings, this.saveSettings, () => this.popScreen(), {
        isFs: () => !!document.fullscreenElement,
        toggleFs: () => this.toggleFullscreen(),
        resetStats: () =>
          this.show(
            confirmView('Wyzerować statystyki?', 'Wyzeruj', () => {
              this.stats = structuredClone(EMPTY_STATS);
              saveStats(this.stats);
              this.popScreen();
            }, () => this.popScreen()),
            true,
          ),
      }),
      true,
    );
  }
  toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void this.root.requestFullscreen?.().catch(() => {});
  }

  // ---------------------------------------------------------------- the match
  private matchOptions(games: GameId[], target: number) {
    return {
      target,
      games,
      modFreq: this.settings.modFreq,
      mods: [...this.settings.mods],
      length: LENGTH[this.settings.length].k,
      names: [...this.settings.names] as [string, string],
      seed: (Math.random() * 0x7fffffff) | 0,
    };
  }
  quickMatch() {
    this.startMatch(new Match(this.matchOptions([...this.settings.games], this.settings.target)));
  }
  tournament() {
    this.startMatch(new Match(this.matchOptions([...this.settings.games], this.settings.target)));
  }
  single(id: GameId) {
    this.startMatch(new Match(this.matchOptions([id], 3)));
  }
  startMatch(m: Match) {
    this.match = m;
    this.demo = null;
    this.nextRound();
  }

  nextRound(force?: { game: GameId; mod: import('./sim/modifiers').ModId | null }) {
    const m = this.match;
    if (!m) return;
    const cur = m.next();
    if (!cur) return;
    if (force) {
      cur.game = force.game;
      cur.mod = force.mod;
    }
    this.round = new Round({ game: cur.game, mod: cur.mod, seed: cur.seed, length: m.opts.length, names: m.opts.names });
    this.recorded = false;
    this.renderer.attach(this.round);
    this.mode = 'intro';
    this.input.capture = true;
    audio.playMusic(GAME_BY_ID[cur.game].music);
    this.intro = introView({
      def: GAME_BY_ID[cur.game],
      mod: cur.mod,
      round: m.history.length + 1,
      score: [...m.score] as [number, number],
      target: m.opts.target,
      names: m.opts.names,
      onGo: () => this.beginRound(),
    });
    this.show(this.intro);
  }

  beginRound() {
    if (this.mode !== 'intro') return;
    this.intro = null;
    this.mode = 'play';
    this.show(null);
    this.ui.classList.remove('dim');
  }

  private restartRound() {
    if (!this.round || !this.match) return;
    const c = this.round.cfg;
    this.round = new Round({ ...c });
    this.recorded = false;
    this.renderer.attach(this.round);
    this.mode = 'play';
    this.show(null);
  }

  pause() {
    // once the round has a result there is nothing left to pause or restart
    if (this.mode !== 'play' || !this.round || this.round.result) return;
    this.mode = 'paused';
    this.input.releaseAll();
    const r = this.round;
    this.show(
      pauseView({
        game: r.game.def,
        onResume: () => this.resume(),
        onRestart: () => this.restartRound(),
        onUnstick: () => {
          r.unstickAll();
          this.resume();
        },
        onSettings: () => this.openSettings(),
        onControls: () => this.show(controlsView(this.settings.names, () => this.popScreen(), () => ({ pads: [this.input.pad(0), this.input.pad(1)], gamepads: this.input.gamepadCount() })), true),
        onQuit: () => this.show(confirmView('Wyjść do menu? Mecz zostanie przerwany.', 'Wyjdź', () => this.showMenu(), () => this.popScreen()), true),
      }),
    );
  }
  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'play';
    this.input.releaseAll();
    this.show(null);
  }

  private onRoundOver() {
    const r = this.round!;
    const m = this.match!;
    if (this.recorded || !r.result) return;
    this.recorded = true;
    m.record(r.result);
    const st = this.stats;
    if (r.result.winner >= 0) {
      const w = r.result.winner as 0 | 1;
      st.rounds[w]++;
      const pg = (st.perGame[r.cfg.game] ??= [0, 0]);
      pg[w]++;
    } else st.draws++;
    if (m.over) {
      st.matches++;
      st.wins[m.winner!]++;
    }
    saveStats(st);
  }

  private showResults() {
    const r = this.round!;
    const m = this.match!;
    this.mode = 'results';
    this.input.capture = false;
    audio.sfx(r.result!.winner >= 0 ? 'point' : 'draw');
    this.show(
      resultsView({
        result: r.result!,
        match: m,
        names: m.opts.names,
        game: r.game.def,
        onNext: () => (m.over ? this.showVictory() : this.nextRound()),
        onMenu: () => this.show(confirmView('Wyjść do menu? Mecz zostanie przerwany.', 'Wyjdź', () => this.showMenu(), () => this.popScreen()), true),
      }),
    );
  }

  private showVictory() {
    const m = this.match!;
    if (m.winner === null) return;
    this.mode = 'victory';
    audio.sfx('victory');
    audio.playMusic('menu');
    if (this.round) {
      for (const p of this.round.players) p.winT = p.id === m.winner ? 0.01 : 0;
    }
    this.show(
      victoryView({
        winner: m.winner,
        match: m,
        names: m.opts.names,
        onRematch: () => this.startMatch(m.rematch((Math.random() * 0x7fffffff) | 0)),
        onMenu: () => this.showMenu(),
      }),
    );
  }

  // ---------------------------------------------------------------- demo behind the menu
  private newDemo() {
    const pick: GameId[] = ['king', 'knockout', 'coins', 'dodge'];
    const game = pick[Math.floor(Math.random() * pick.length)];
    this.demo = new Round({ game, mod: null, seed: (Math.random() * 1e9) | 0, length: 1.3, names: [...this.settings.names] as [string, string] });
    this.demo.countdown = 0.3;
    this.renderer.attach(this.demo);
  }

  // ---------------------------------------------------------------- loop
  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.1);
    try {
      this.frame(dt);
    } catch (e) {
      console.error(e);
      cancelAnimationFrame(this.raf);
      this.ui.replaceChildren(errorView(String((e as Error)?.message ?? e)));
    }
  };

  frame(dt: number) {
    // keyboard
    for (const code of this.input.take()) this.key(code);
    const R = this.renderer;
    // a quick tap stays "pressed" until the simulation has actually seen it
    let tapsSeen = true;
    let shown: Round | null = null;
    if (this.mode === 'menu' && this.demo) {
      const d = this.demo;
      for (const b of this.demoBots) b.think(d, dt, d.inputs[b.id]);
      if (!this.frozen) d.update(dt);
      if (d.result && d.overT > 2.5) this.newDemo();
      shown = this.demo;
    } else if (this.round) {
      const r = this.round;
      shown = r;
      if (this.mode === 'intro' && this.intro) {
        if (this.input.pad(0).jump) this.intro.ready(0);
        if (this.input.pad(1).jump) this.intro.ready(1);
      }
      if (this.mode === 'play' || this.mode === 'results' || this.mode === 'victory') {
        for (const i of [0, 1] as const) {
          const f = this.forced[i];
          r.inputs[i] = f ? { left: !!f.left, right: !!f.right, jump: !!f.jump, action: !!f.action } : this.input.pad(i);
        }
        if (R.hitStop > 0) {
          R.hitStop -= dt;
          tapsSeen = false;
        } else if (!this.frozen) tapsSeen = r.update(r.phase === 'over' && r.overT < 0.6 ? dt * 0.35 : dt) > 0;
        if (r.result && !this.recorded) this.onRoundOver();
        if (this.mode === 'play' && r.result && r.overT > 2.1) this.showResults();
      }
      if (this.mode === 'victory') {
        // confetti
        if (Math.random() < dt * 30) {
          const x = R.cam.x + (Math.random() - 0.5) * 1280 / R.cam.z;
          const y = R.cam.y - 360 / R.cam.z - 20;
          R.fx.spawn(PK.Confetti, x, y, (Math.random() - 0.5) * 120, 80 + Math.random() * 120, 4, 6, ['#ffd23f', '#ff4fa3', '#2fe0d0', PCOL[this.match?.winner ?? 0].light][Math.floor(Math.random() * 4)], 60, 0.4);
        }
      }
    }
    audio.listenX = R.cam.x;
    R.frame(shown, dt, {
      shake: this.settings.reduced ? 0 : this.settings.shake,
      reduced: this.settings.reduced,
      hud: shown !== null && shown !== this.demo && this.mode !== 'victory',
      panel: this.mode === 'results',
      match: this.match ? { score: this.match.score, target: this.match.opts.target } : undefined,
      sfx: (n, x, v) => {
        if (shown !== this.demo) audio.sfx(n, x, v ?? 1);
      },
    });
    this.top?.tick?.(dt);
    // animated icons on screen
    this.iconT += dt;
    for (const e of liveIcons) {
      if (!e.c.isConnected) {
        liveIcons.delete(e);
        continue;
      }
      drawIcon(e, this.iconT);
    }
    if (tapsSeen) this.input.endFrame();
  }

  private key(code: string) {
    // the top screen first
    const top = this.top;
    if (top?.key?.(code)) return;
    if (code === 'Escape') {
      if (this.mode === 'play') this.pause();
      else if (this.mode === 'paused' && this.stack.length > 1) this.popScreen();
      return;
    }
    // (R restarts the round only from the pause menu: R sits right next to WASD,
    // and a stray press in the middle of a round used to throw the round away)
    // menus: arrows move between buttons (never while playing)
    if (!this.input.capture && (code === 'ArrowDown' || code === 'ArrowUp') && top) {
      const items = [...top.el.querySelectorAll<HTMLElement>('button:not([disabled]), a.rc-btn, input')];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      const n = code === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[n].focus();
    }
  }

  // ---------------------------------------------------------------- tests
  private exposeDebug() {
    const app = this;
    (window as unknown as { __rc: unknown }).__rc = {
      app,
      get mode() {
        return app.mode;
      },
      get round() {
        return app.round;
      },
      get match() {
        return app.match;
      },
      audioState: () => audio.state,
      games: GAME_IDS,
      /** play a match of one specific minigame (and modifier) */
      play(game: GameId, mod: import('./sim/modifiers').ModId | null = null, target = 3) {
        app.match = new Match({ ...app.matchOptions([game], target), modFreq: 'off' });
        app.demo = null;
        app.nextRound({ game, mod });
      },
      go: () => app.beginRound(),
      freeze: (on: boolean) => (app.frozen = on),
      pad(i: 0 | 1, p: Partial<import('./sim/player').PadInput> | null) {
        app.forced[i] = p;
      },
      tick(sec: number) {
        const r = app.round;
        if (!r) return;
        const n = Math.ceil(sec * 120);
        for (let i = 0; i < n; i++) {
          for (const k of [0, 1] as const) {
            const f = app.forced[k];
            if (f) r.inputs[k] = { left: !!f.left, right: !!f.right, jump: !!f.jump, action: !!f.action };
          }
          r.step();
        }
      },
      /** let bots play the current round */
      bots(sec = 60) {
        const r = app.round;
        if (!r) return null;
        const bs = [new Bot(0, 0.85), new Bot(1, 0.7)];
        for (let i = 0; i < sec * 60 && !r.result; i++) {
          for (const b of bs) b.think(r, 1 / 60, r.inputs[b.id]);
          r.update(1 / 60);
          r.world.events.length = 0;
        }
        return r.result;
      },
    };
  }
}
