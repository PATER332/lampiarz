// Top-level controller: title ↔ play ↔ ending, the frame loop, world events,
// saving and transitions. Screens live in ui/screens.ts.
import { audio, type Mood } from './audio/audio';
import { Input, type Action } from './core/input';
import { BOSSES, LOCATIONS, type LocationId } from './data/content';
import { Renderer } from './render/renderer';
import { loadSave, loadSettings, newSave, saveSettings, writeSave, type SaveData, type Settings } from './save';
import * as S from './ui/screens';
import { UI } from './ui/ui';
import { T } from './world/level';
import { World, type Interactable, type WorldEvent } from './world/world';

export type Mode = 'title' | 'play' | 'ending';

export interface RunInfo {
  kills: number;
  zuzel: number;
  items: string[];
  time: number;
  deaths: number;
}

const STEP = 1 / 60;

export class Game {
  renderer: Renderer;
  ui: UI;
  input: Input;
  settings: Settings;
  save: SaveData | null = null;
  world: World | null = null;
  warning: string | null = null;
  mode: Mode = 'title';
  /** true while a rest point (shrine / hearth) menu is open — equipment can change */
  atRest = false;
  private last = 0;
  private acc = 0;
  private fadeTarget = 0;
  private fadeCb: (() => void) | null = null;
  private bossPhase = 0;
  private endingTimer = -1;
  adaptive = true;
  /** debug: stop the simulation but keep rendering */
  frozen = false;
  private frameAvg = 1 / 60;
  private slowT = 0;
  hiddenPause = false;

  constructor(public host: HTMLElement) {
    this.settings = loadSettings();
    this.renderer = new Renderer(host);
    this.ui = new UI(host);
    this.ui.sound = (n) => audio.sfx(n);
    this.input = new Input(this.renderer.canvas);
    this.input.onPress = (a, ev) => this.onPress(a, ev);
    audio.apply(this.settings);
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      audio.suspend(document.hidden);
      if (document.hidden && this.mode === 'play' && !this.ui.blocking) {
        this.hiddenPause = true;
        S.pauseScreen(this);
      }
    });
    window.addEventListener('blur', () => {
      if (this.mode === 'play' && !this.ui.blocking && this.world && !this.hiddenPause) S.pauseScreen(this);
    });
    const r = loadSave();
    this.save = r.save;
    this.warning = r.warning;
  }

  start() {
    this.toTitle();
    requestAnimationFrame((t) => {
      this.last = t;
      requestAnimationFrame(this.frame);
    });
  }

  // ------------------------------------------------------------------ input
  private onPress(a: Action, ev?: KeyboardEvent) {
    audio.unlock();
    if (this.fadeCb) return;
    if (this.ui.stack.length) {
      if (this.ui.action(a, ev)) return;
      return;
    }
    if (this.mode !== 'play' || !this.world) return;
    if (a === 'pause') S.pauseScreen(this);
    else if (a === 'inventory') S.inventoryScreen(this, false);
  }

  // ------------------------------------------------------------------ loop
  private frame = (ts: number) => {
    const dt = Math.min(0.1, Math.max(0, (ts - this.last) / 1000));
    this.last = ts;
    try {
      this.tick(dt);
    } catch (err) {
      console.error(err);
      this.crash(err);
      return;
    }
    requestAnimationFrame(this.frame);
  };

  private tick(dt: number) {
    this.input.pollPad();
    audio.update();
    // transitions
    const r = this.renderer;
    if (r.fade !== this.fadeTarget) {
      r.fade = this.fadeTarget > r.fade ? Math.min(this.fadeTarget, r.fade + dt * 3.2) : Math.max(this.fadeTarget, r.fade - dt * 2.2);
      if (r.fade >= 1 && this.fadeCb) {
        const cb = this.fadeCb;
        this.fadeCb = null;
        cb();
        this.fadeTarget = 0;
      }
    }
    const w = this.world;
    if (this.mode !== 'play' || !w) {
      r.renderTitle(dt);
      if (r.fade > 0) {
        r.g.fillStyle = `rgba(0,0,0,${r.fade})`;
        r.g.fillRect(0, 0, r.viewW, r.viewH);
      }
      return;
    }
    const blocked = this.ui.blocking || !!this.fadeCb || this.frozen;
    this.input.enabled = !blocked;
    if (!blocked) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 5) {
        w.step(STEP);
        this.acc -= STEP;
        n++;
      }
      if (n === 5) this.acc = 0;
      if (this.save) this.save.playTime += dt;
      // adaptive quality: sustained slow frames drop the costliest cosmetics
      this.frameAvg += (dt - this.frameAvg) * 0.05;
      this.slowT = this.frameAvg > 0.026 ? this.slowT + dt : Math.max(0, this.slowT - dt);
      if (this.adaptive && !r.lowQuality && this.slowT > 3) r.setLowQuality(true);
      if (this.endingTimer > 0) {
        this.endingTimer -= dt;
        if (this.endingTimer <= 0) S.endingChoiceScreen(this);
      }
    }
    // boss phase → music intensity
    const b = w.boss;
    if (b && w.bossStarted && !b.dead && b.state !== 'dying' && b.phase !== this.bossPhase) {
      this.bossPhase = b.phase;
      if (this.bossPhase > 1) this.music('boss');
    }
    r.render(w, dt, { usingPad: this.input.usingPad, halszkaNew: this.halszkaNew(), hudVisible: !this.ui.stack.some((s) => s.cls?.includes('pd-black')) });
  }

  private crash(err: unknown) {
    const box = document.createElement('div');
    box.className = 'pd-error';
    box.innerHTML = '<h2 style="margin-top:0">Coś pękło w spiżu</h2><p>Gra napotkała błąd i musiała się zatrzymać. Twój ostatni zapis jest bezpieczny — odśwież stronę, aby kontynuować.</p>';
    const pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;font-size:12px;opacity:.6';
    pre.textContent = String((err as Error)?.message ?? err);
    box.appendChild(pre);
    this.host.appendChild(box);
  }

  /** Fade to black, run `fn`, fade back. */
  transition(fn: () => void) {
    if (this.fadeCb) return;
    this.fadeCb = fn;
    this.fadeTarget = 1;
  }

  // ------------------------------------------------------------------ persistence
  persist() {
    if (!this.save) return;
    if (!writeSave(this.save)) this.renderer.hud.toast('Nie udało się zapisać gry', 'pamięć przeglądarki jest niedostępna');
  }

  applySettings() {
    saveSettings(this.settings);
    audio.apply(this.settings);
  }

  // ------------------------------------------------------------------ flow
  toTitle() {
    if (this.save && this.world) this.persist();
    this.ui.closeAll();
    this.mode = 'title';
    this.world = null;
    this.atRest = false;
    this.music('title');
    S.titleScreen(this);
  }

  newGame() {
    this.save = newSave();
    this.warning = null;
    this.persist();
    this.ui.closeAll();
    S.introScreen(this, () => this.transition(() => this.enterPlay()));
  }

  continueGame() {
    const r = loadSave();
    if (!r.save) {
      this.warning = r.warning ?? 'Nie znaleziono zapisu.';
      this.save = null;
      this.ui.closeAll();
      S.titleScreen(this);
      return;
    }
    this.save = r.save;
    this.ui.closeAll();
    this.transition(() => this.enterPlay());
  }

  private makeWorld(save: SaveData) {
    const w = new World(save, this.settings, this.input);
    w.sfxHook = (n, pan, vol) => audio.sfx(n, pan, vol);
    w.listeners.push((e) => this.onWorld(e));
    this.world = w;
    return w;
  }

  private enterPlay() {
    const save = this.save!;
    const w = this.makeWorld(save);
    this.mode = 'play';
    this.bossPhase = 0;
    if (save.expedition && !save.inHub) {
      w.loadExpedition();
      this.announceLocation(save.expedition.location, true);
    } else {
      save.inHub = true;
      w.loadHub();
      this.renderer.hud.announce('Krypta Odlewników', 'schronienie pod spalonym miastem', true, 3.6);
      if (save.halszkaTalked < 0) window.setTimeout(() => this.renderer.hud.toast('Porozmawiaj z Halszką', 'podejdź i wciśnij E'), 2500);
    }
    this.input.flush();
  }

  announceLocation(loc: LocationId, returning = false) {
    const def = LOCATIONS[loc];
    this.renderer.hud.announce(def.name, returning ? 'Powstajesz przy kapliczce' : def.intro, true, 4.2);
  }

  startExpedition(loc: LocationId) {
    const save = this.save!;
    let lostNote = false;
    if (save.lost) {
      save.lost = null;
      lostNote = true;
    }
    save.expedition = { location: loc, seed: (Math.random() * 0x7fffffff) | 0, shrine: null, shrines: [], chests: [], walls: [], events: [], flaskPenalty: 0 };
    save.inHub = false;
    save.stats.expeditions++;
    this.persist();
    this.ui.closeAll();
    audio.sfx('travel');
    this.transition(() => {
      const w = this.world!;
      w.loadExpedition();
      w.run = { kills: 0, zuzel: 0, items: [], time: 0, deaths: 0 };
      this.bossPhase = 0;
      this.announceLocation(loc);
      if (lostNote) window.setTimeout(() => this.renderer.hud.toast('Popiół z poprzedniej wyprawy rozwiał wiatr'), 4500);
      this.input.flush();
    });
  }

  returnToHub(reason: 'shrine' | 'portal' | 'death' | 'ending') {
    const w = this.world!;
    const save = this.save!;
    const run: RunInfo = { ...w.run };
    const loc = w.location;
    // ash left in this expedition can never be recovered; abandoning a death loses the carried ash too
    let lost = save.lost?.amount ?? 0;
    if (reason === 'death') {
      lost += save.zuzel;
      save.zuzel = 0;
    }
    save.lost = null;
    save.expedition = null;
    save.inHub = true;
    this.persist();
    this.ui.closeAll();
    this.atRest = false;
    audio.sfx('travel');
    this.transition(() => {
      w.loadHub();
      this.bossPhase = 0;
      this.input.flush();
      if (reason !== 'ending' && loc !== 'krypta') S.summaryScreen(this, run, loc, reason, lost);
    });
  }

  respawn() {
    this.ui.closeAll();
    this.transition(() => {
      const w = this.world!;
      w.respawn();
      this.bossPhase = 0;
      this.announceLocation(w.save.expedition!.location, true);
      this.input.flush();
    });
  }

  music(mood: Mood) {
    const w = this.world;
    const scene = w ? w.location : 'rynek';
    const boss = w?.boss?.bossId ?? (w && w.location !== 'krypta' ? LOCATIONS[w.location].boss : undefined);
    audio.setMood(mood, { scene, boss, phase: w?.boss?.phase ?? 1 });
  }

  halszkaNew() {
    const s = this.save;
    if (!s) return false;
    return s.halszkaTalked < this.bossCount();
  }

  bossCount() {
    const s = this.save;
    return s ? (['kat', 'pasterz', 'dzwon'] as const).filter((b) => s.bosses[b]).length : 0;
  }

  // ------------------------------------------------------------------ world events
  private onWorld(e: WorldEvent) {
    const w = this.world!;
    const hud = this.renderer.hud;
    switch (e.type) {
      case 'interact':
        this.interact(e.it);
        break;
      case 'died':
        S.deathScreen(this);
        break;
      case 'bossIntro':
        hud.announce(e.name, e.title, true, 3.4);
        break;
      case 'bossDefeated': {
        const def = BOSSES[e.boss.bossId];
        audio.sfx('victory');
        hud.announce(def.heart, 'odzyskane', true, 4.5);
        window.setTimeout(() => hud.toast(def.defeat), 1200);
        if (e.boss.bossId === 'dzwon') this.endingTimer = 4.5;
        else window.setTimeout(() => hud.toast(`Nagroda: ${def.reward}`, 'Portal do Krypty otworzył się'), 2600);
        break;
      }
      case 'announce':
        hud.announce(e.text, e.sub, false, 2.4);
        break;
      case 'loot':
        hud.toast(e.text, e.sub);
        break;
      case 'save':
        this.persist();
        break;
      case 'music':
        if (e.mood === 'tension' && w.bossStarted) break;
        this.music(e.mood);
        break;
    }
  }

  private interact(it: Interactable) {
    const w = this.world!;
    audio.sfx('interact');
    switch (it.kind) {
      case 'shrine': {
        const first = !it.used;
        w.rest(it);
        this.renderer.hud.announce(first ? 'Kapliczka zapłonęła' : 'Odpoczynek', 'zdrowie i Łzy Wosku odnowione · wrogowie powrócili', false, 2.6);
        S.shrineScreen(this, it);
        break;
      }
      case 'chest': {
        const text = w.openChest(it);
        this.renderer.hud.toast(text, it.secret ? 'ukryta skrytka' : 'skrzynia');
        break;
      }
      case 'lore': {
        it.used = true;
        if (!this.save!.lore.includes(it.data)) this.save!.lore.push(it.data);
        audio.sfx('lore');
        this.persist();
        S.loreScreen(this, it.data);
        break;
      }
      case 'event':
        S.eventScreen(this, it);
        break;
      case 'station':
        if (it.data === 'h') S.halszkaScreen(this);
        else if (it.data === 'a') S.anvilScreen(this);
        else if (it.data === 'S') {
          w.player.restoreAll();
          audio.sfx('shrine');
          S.hearthScreen(this);
        } else if (it.data === 'm') S.shopScreen(this);
        else if (it.data === 't') S.mapScreen(this);
        break;
      case 'portal':
        this.returnToHub('portal');
        break;
    }
  }

  // ------------------------------------------------------------------ debug hooks for automated tests
  installDebug() {
    const g = this;
    (window as unknown as { __pd: unknown }).__pd = {
      game: g,
      get world() {
        return g.world;
      },
      state() {
        const w = g.world;
        return {
          mode: g.mode,
          screens: g.ui.stack.map((s) => s.el.getAttribute('data-screen')),
          location: w?.location ?? null,
          hp: w?.player.hp,
          x: w?.player.cx,
          zuzel: g.save?.zuzel,
          enemies: w?.enemies.filter((e) => !e.dead).length,
          boss: w?.boss ? { id: w.boss.bossId, hp: w.boss.hp, state: w.boss.state, phase: w.boss.phase } : null,
          bosses: g.save?.bosses,
          fps: 0,
        };
      },
      toBoss() {
        const w = g.world!;
        const p = w.player;
        p.body.x = (w.level.gateCol + 2) * T;
        p.body.y = 15 * T - p.body.h;
        p.body.vx = p.body.vy = 0;
        w.snapCamera();
      },
      screens: S,
      freeze(on = true) {
        g.frozen = on;
      },
      highQuality() {
        g.adaptive = false;
        g.renderer.setLowQuality(false);
      },
      near(kind?: string) {
        const w = g.world!;
        const e = w.enemies.find((x) => !x.dead && (!kind || x.kind === kind));
        if (!e) return false;
        const p = w.player;
        p.body.x = e.cx - 170;
        p.body.y = e.feet - p.body.h - 2;
        p.body.vx = p.body.vy = 0;
        p.face = 1;
        w.snapCamera();
        return true;
      },
      kill() {
        const w = g.world!;
        w.player.hp = 1;
        w.hurtPlayerRaw(99, 'debug');
      },
      god(on = true) {
        const w = g.world!;
        w.player.maxHp = on ? 99999 : w.player.stats.maxHp;
        w.player.hp = w.player.maxHp;
      },
      hurtBoss(frac: number) {
        const b = g.world?.boss;
        if (b) b.hp = Math.max(1, b.maxHp * frac);
      },
      give(z: number, shards = 0) {
        if (!g.save) return;
        g.save.zuzel += z;
        g.save.shards += shards;
      },
    };
  }
}
