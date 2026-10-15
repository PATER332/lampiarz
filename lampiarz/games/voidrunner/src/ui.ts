// The whole user interface (Polish): title, base (permanent upgrades), HUD, pause, upgrade
// choice, equipment, settings, controls, death and victory screens, touch controls.

import { AudioEngine } from './core/audio';
import { STEP, TILE, VIEW_H, VIEW_W } from './core/consts';
import { ACTIONS, DEFAULT_KEYS, Input, Keyboard, keyLabel, MAX_BINDS, type Action } from './core/input';
import { clearRun, loadMeta, loadRun, saveMeta, saveRun, type Meta } from './core/save';
import { COSMETICS, PERMS, UPGRADES, WEAPONS, type CosmeticId, type UpgradeId, type WeaponId } from './game/data';
import { Game } from './game/game';
import type { GameEvent } from './game/types';
import { background } from './render/background';
import { Renderer } from './render/renderer';
import { AREAS } from './world/areas';
import { ROOMS_PER_AREA } from './world/expedition';

type Overlay = null | 'pause' | 'choice' | 'inventory' | 'settings' | 'controls' | 'dead' | 'victory' | 'guide';

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class App {
  meta: Meta = loadMeta();
  input = new Input();
  audio = new AudioEngine();
  keyboard: Keyboard;
  game: Game;
  renderer: Renderer;
  mode: 'title' | 'hub' | 'play' = 'title';
  overlay: Overlay = null;
  private back: Overlay[] = []; // overlay to return to (settings opened from pause, …)
  private acc = 0;
  private last = 0;
  private titleT = 0;
  private hud!: HTMLElement;
  private screen!: HTMLElement;
  private touch!: HTMLElement;
  private toastWrap!: HTMLElement;
  private dialogEl: HTMLElement | null = null;
  private dialogTimer = 0;
  private signEl: HTMLElement | null = null;
  private ghostHp = 1;
  private rebinding: Action | null = null;
  private pendingEnd: { kind: 'dead' | 'victory'; t: number } | null = null;
  private lastGain = 0;
  private hudCache = '';

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="vr-stage"><canvas class="vr-game"></canvas><canvas class="vr-text"></canvas></div>
      <div class="vr-hud hidden"></div>
      <div class="touch" hidden></div>
      <div class="vr-layer"></div>`;
    const stage = root.querySelector('.vr-stage')!;
    this.renderer = new Renderer(stage.querySelector('.vr-game') as HTMLCanvasElement, stage.querySelector('.vr-text') as HTMLCanvasElement);
    this.hud = root.querySelector('.vr-hud') as HTMLElement;
    this.touch = root.querySelector('.touch') as HTMLElement;
    this.screen = root.querySelector('.vr-layer') as HTMLElement;
    this.keyboard = new Keyboard(this.input, this.meta.keys);
    this.keyboard.onPause = () => this.onEscape();
    this.keyboard.stage = stage as HTMLElement;
    this.game = new Game(this.meta, this.audio, this.input);
    this.audio.apply(this.meta.settings);
    this.renderer.shakeOn = this.meta.settings.shake;
    this.renderer.bloomOn = this.meta.settings.effects;
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.menuKeys(e), true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play' && !this.overlay) this.openPause();
    });
    this.buildTouch();
    this.resize();
    this.showTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  private resize() {
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  private saveMeta() {
    saveMeta(this.meta);
  }

  // ================================================================== main loop
  private frame(now: number) {
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : STEP);
    this.last = now;
    if (this.mode === 'play') {
      if (!this.overlay) {
        if (this.input.pressed.has('inventory')) {
          this.input.pressed.delete('inventory');
          this.openOverlay('inventory');
        }
        this.acc += dt;
        let n = 0;
        while (this.acc >= STEP && n < 5 && !this.overlay) {
          this.game.step();
          this.acc -= STEP;
          n++;
        }
        if (n >= 5) this.acc = 0;
      } else this.acc = 0;
      this.renderer.render(this.game, this.overlay ? 0 : dt);
      this.processEvents();
      this.updateHud(dt);
      if (this.pendingEnd) {
        this.pendingEnd.t -= dt;
        if (this.pendingEnd.t <= 0) {
          const k = this.pendingEnd.kind;
          this.pendingEnd = null;
          this.openOverlay(k);
        }
      }
    } else this.renderTitle(dt);
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Slow parallax fly-through behind the menus. */
  private renderTitle(dt: number) {
    this.titleT += dt;
    const c = this.renderer.c;
    const area = this.mode === 'hub' ? 3 : 0;
    const bg = background(area);
    c.drawImage(bg.sky, 0, 0);
    bg.layers.forEach((L, i) => {
      const off = -((this.titleT * (6 + i * 10)) % L.cv.width);
      for (let x = off - L.cv.width; x < VIEW_W; x += L.cv.width) c.drawImage(L.cv, Math.round(x), VIEW_H - L.cv.height + 40);
    });
    const g = c.createRadialGradient(VIEW_W * 0.72, VIEW_H * 0.45, 10, VIEW_W * 0.72, VIEW_H * 0.45, 200);
    g.addColorStop(0, area === 3 ? 'rgba(62,230,255,0.18)' : 'rgba(196,92,255,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    this.renderer.oc.save();
    this.renderer.oc.setTransform(1, 0, 0, 1, 0, 0);
    this.renderer.oc.clearRect(0, 0, this.renderer.overlay.width, this.renderer.overlay.height);
    this.renderer.oc.restore();
  }

  // ================================================================== game flow
  startNewRun() {
    clearRun();
    this.game.newRun();
    this.enterPlay();
    if (!this.meta.tutorialDone && this.meta.stats.runs === 0) this.openOverlay('guide');
  }

  continueRun() {
    const s = loadRun();
    if (!s) return;
    this.game.continueRun(s);
    this.enterPlay();
  }

  private enterPlay() {
    this.mode = 'play';
    this.overlay = null;
    this.back = [];
    this.pendingEnd = null;
    this.screen.innerHTML = '';
    this.hud.classList.remove('hidden');
    this.hudCache = '';
    this.ghostHp = 1;
    this.keyboard.enabled = true;
    this.input.clear();
    this.updateTouchVisibility();
    this.audio.play('ui');
  }

  private processEvents() {
    const evs = this.game.events.splice(0);
    for (const e of evs) this.onEvent(e);
    // sign boxes follow the player's position
    const s = this.game.activeSign;
    if (s && !this.signEl) {
      this.signEl = this.dialog('INSTRUKCJA', s, 'sign');
    } else if (!s && this.signEl) {
      this.signEl.remove();
      this.signEl = null;
    } else if (s && this.signEl && this.signEl.dataset.text !== s) {
      this.signEl.remove();
      this.signEl = this.dialog('INSTRUKCJA', s, 'sign');
    }
  }

  private onEvent(e: GameEvent) {
    switch (e.type) {
      case 'areaEnter':
        this.banner(AREAS[e.area].name, AREAS[e.area].subtitle);
        break;
      case 'roomEnter':
        this.hudCache = '';
        if (this.meta.tutorialDone) this.saveMeta();
        break;
      case 'dialog': {
        this.dialogEl?.remove();
        this.dialogEl = this.dialog(e.speaker, e.text, e.speaker === 'TERMINAL' ? 'terminal' : '');
        window.clearTimeout(this.dialogTimer);
        const el = this.dialogEl;
        this.dialogTimer = window.setTimeout(() => {
          el.remove();
          if (this.dialogEl === el) this.dialogEl = null;
        }, (e.duration ?? 6) * 1000);
        break;
      }
      case 'choice':
        this.openOverlay('choice');
        break;
      case 'death': {
        this.endRun();
        this.pendingEnd = { kind: 'dead', t: 0.3 };
        break;
      }
      case 'victory':
        this.endRun();
        this.pendingEnd = { kind: 'victory', t: 1.6 };
        break;
      case 'bossStart':
        this.banner(e.name, e.title, true);
        break;
      case 'bossDefeated':
        this.toast(`${e.name} pokonany`, '#ff3d5e');
        break;
      case 'checkpoint':
        saveRun(this.game.snapshot());
        this.saveMeta();
        this.toast('Zapis postępów', '#5dff9b');
        break;
      case 'toast':
        this.toast(e.text, e.color);
        break;
      case 'doorUnlocked':
        this.toast('Przejście otwarte', '#3ee6ff');
        break;
      case 'sign':
        break;
    }
  }

  private endRun() {
    const before = this.meta.fragments;
    this.game.settle();
    this.lastGain = this.meta.fragments - before;
    clearRun();
    this.saveMeta();
  }

  // ================================================================== HUD
  private updateHud(dt: number) {
    const g = this.game;
    const p = g.player;
    const area = AREAS[g.run.area];
    const hpK = Math.max(0, p.hp / p.maxHp);
    this.ghostHp += (hpK - this.ghostHp) * Math.min(1, dt * 2.5);
    if (this.ghostHp < hpK) this.ghostHp = hpK;
    const boss = g.boss();
    const ups = (Object.keys(g.run.upgrades) as UpgradeId[]).filter((id) => g.up(id) > 0);
    const w = WEAPONS[g.weapon];
    this.updateCombo(g);
    this.updateMinimap(g);
    const key = [Math.ceil(p.hp), p.maxHp, Math.floor(p.energy), p.healCharges, g.run.fragments, g.run.area, g.run.room, ups.map((u) => u + g.up(u)).join(), boss ? Math.ceil(boss.hp) + ':' + boss.phase : '', g.weapon, this.ghostHp.toFixed(2)].join('|');
    if (key === this.hudCache) return;
    this.hudCache = key;
    const pips = Array.from({ length: ROOMS_PER_AREA }, (_, i) => {
      const cls = i < g.run.room ? 'done' : i === g.run.room ? 'now' : '';
      return `<span class="${cls} ${i === ROOMS_PER_AREA - 1 ? 'boss' : ''}"></span>`;
    }).join('');
    const heals = Array.from({ length: Math.max(g.maxHealCharges(), p.healCharges) }, (_, i) => `<span class="${i < p.healCharges ? '' : 'off'}"></span>`).join('');
    this.hud.innerHTML = `
      <div class="hud-tl">
        <div class="bar hp"><i class="ghost" style="width:calc(${this.ghostHp * 100}% - 2px)"></i><i style="width:calc(${hpK * 100}% - 2px)"></i><b>${Math.ceil(p.hp)} / ${p.maxHp}</b></div>
        <div class="bar en"><i style="width:calc(${(p.energy / p.maxEnergy) * 100}% - 2px)"></i></div>
        <div class="hud-meta"><div class="heals" title="Nanoapteczki (Q)">${heals}</div><span class="frag">${g.run.fragments}</span></div>
      </div>
      <div class="hud-tr">
        <div class="area-name">${esc(area.name)}</div>
        <div class="area-sub">Sektor ${g.run.area + 1}/5 · ${esc(area.subtitle.split('—')[1]?.trim() ?? '')}</div>
        <div class="room-pips">${pips}</div>
      </div>
      <div class="hud-bl">
        <div class="weapon-box">${esc(w.name)}<small>K: ${esc(w.special.name)} (${w.special.cost} energii)</small></div>
        <div class="ups">${ups.map((u) => `<span style="border-color:${UPGRADES[u].color};color:${UPGRADES[u].color}" title="${esc(UPGRADES[u].name)}">${g.up(u)}</span>`).join('')}</div>
      </div>
      ${
        boss && !boss.dead
          ? `<div class="boss-bar"><div class="name">${esc(g.enemyName(boss) || bossName(boss.boss))}<span class="phase">${boss.phase > 1 ? 'faza ' + boss.phase : ''}</span></div><div class="bar"><i style="width:calc(${(boss.hp / boss.maxHp) * 100}% - 2px)"></i></div></div>`
          : ''
      }
      <div class="toast-wrap"></div>`;
    // keep toasts across HUD rebuilds
    const tw = this.hud.querySelector('.toast-wrap') as HTMLElement;
    if (this.toastWrap) for (const ch of [...this.toastWrap.children]) tw.appendChild(ch);
    this.toastWrap = tw;
    if (this.dialogEl) this.hud.appendChild(this.dialogEl);
    if (this.signEl) this.hud.appendChild(this.signEl);
    for (const b of this.banners) this.hud.appendChild(b);
    if (this.comboEl) this.hud.appendChild(this.comboEl);
    if (this.mapEl) this.hud.appendChild(this.mapEl);
  }

  /** Room minimap (bottom right): walls, platforms, hazards, the exit, objects, enemies and you. */
  private mapEl: HTMLElement | null = null;
  private mapCv: HTMLCanvasElement | null = null;
  private mapBase: HTMLCanvasElement | null = null;
  private mapKey = '';
  private mapScale = 2;
  private updateMinimap(g: Game) {
    if (!this.mapEl) {
      this.mapEl = document.createElement('div');
      this.mapEl.className = 'minimap';
      this.mapEl.innerHTML = '<canvas></canvas><div class="mm-info"></div>';
      this.mapCv = this.mapEl.querySelector('canvas');
      this.hud.appendChild(this.mapEl);
    }
    if (!this.mapEl.isConnected) this.hud.appendChild(this.mapEl);
    // on touch screens the action buttons live in that corner
    this.mapEl.style.display = this.touch.hidden ? '' : 'none';
    const gr = g.grid;
    const key = `${g.run.seed}:${g.run.area}:${g.run.room}`;
    const accent = AREAS[g.run.area].palette.accent;
    if (key !== this.mapKey || !this.mapBase) {
      this.mapKey = key;
      const sc = Math.max(1, Math.min(3, Math.floor(150 / gr.w), Math.floor(90 / gr.h)));
      this.mapScale = sc;
      const base = document.createElement('canvas');
      base.width = gr.w * sc;
      base.height = gr.h * sc;
      const c = base.getContext('2d')!;
      c.fillStyle = 'rgba(6,8,16,0.85)';
      c.fillRect(0, 0, base.width, base.height);
      for (let y = 0; y < gr.h; y++)
        for (let x = 0; x < gr.w; x++) {
          const t = gr.tiles[y * gr.w + x];
          if (t === 1 || t === 4) {
            // only the outer skin of the rock, so the map reads as corridors
            let edge = false;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < gr.w && ny < gr.h && gr.tiles[ny * gr.w + nx] !== 1 && gr.tiles[ny * gr.w + nx] !== 4) edge = true;
            }
            c.fillStyle = edge ? '#7a86a8' : '#2a3044';
            c.fillRect(x * sc, y * sc, sc, sc);
          } else if (t === 2) {
            c.fillStyle = accent;
            c.fillRect(x * sc, y * sc, sc, 1);
          } else if (t === 3) {
            c.fillStyle = '#ff4a5a';
            c.fillRect(x * sc, y * sc + sc - 1, sc, 1);
          }
        }
      this.mapBase = base;
      this.mapCv!.width = base.width;
      this.mapCv!.height = base.height;
      this.mapCv!.style.width = `${base.width * 2}px`;
      this.mapCv!.style.height = `${base.height * 2}px`;
    }
    const c = this.mapCv!.getContext('2d')!;
    const sc = this.mapScale;
    const P = TILE / sc; // pixels per map pixel
    c.drawImage(this.mapBase, 0, 0);
    // camera window
    const r = this.renderer;
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.lineWidth = 1;
    c.strokeRect(Math.round(r.camX / P) + 0.5, Math.round(r.camY / P) + 0.5, Math.round(VIEW_W / P) - 1, Math.round(VIEW_H / P) - 1);
    const dot = (x: number, y: number, col: string, size = 2) => {
      c.fillStyle = col;
      c.fillRect(Math.round(x / P - size / 2), Math.round(y / P - size / 2), size, size);
    };
    // exit
    const ex = g.room.exit;
    dot(ex.x * TILE + 8, (ex.y - 1) * TILE + 8, g.doorLocked ? '#ff4a5a' : '#5dff9b', 3);
    for (const o of g.objects) if (!o.used || o.kind === 'checkpoint') dot(o.x, o.y - 8, o.kind === 'checkpoint' ? '#3ee6ff' : o.kind === 'altar' || o.kind === 'chest' || o.kind === 'secret' ? '#ffe066' : '#c8d2e6');
    for (const pr of g.props) if (pr.kind === 'saw' || pr.kind === 'flame' || pr.kind === 'spiketrap') dot(pr.x + 8, pr.y + 8, '#ffb23e', 1);
    else if (pr.kind === 'mover') {
      c.fillStyle = accent;
      c.fillRect(Math.round(pr.x / P), Math.round(pr.y / P), Math.max(2, Math.round(pr.w / P)), 1);
    }
    for (const e of g.enemies) if (!e.dead) dot(e.x + e.w / 2, e.y + e.h / 2, e.type === 'boss' ? '#ff3d5e' : '#ff6a3a', e.type === 'boss' ? 4 : 2);
    const p = g.player;
    dot(p.x + p.w / 2, p.y + p.h / 2, '#ffffff', 3);
    // info line: what to do in this room
    const alive = g.enemies.filter((e) => !e.dead).length;
    const info = g.doorLocked ? (alive ? `Wyjście zamknięte · wrogowie: ${alive}` : 'Wyjście zamknięte') : 'Wyjście otwarte →';
    const el = this.mapEl.querySelector('.mm-info') as HTMLElement;
    if (el.textContent !== info) {
      el.textContent = info;
      el.classList.toggle('open', !g.doorLocked);
    }
  }

  /** Combo counter: a persistent element updated in place every frame (no HUD rebuild). */
  private comboEl: HTMLElement | null = null;
  private comboShown = 0;
  private updateCombo(g: Game) {
    const n = g.run.combo;
    if (!this.comboEl) {
      this.comboEl = document.createElement('div');
      this.comboEl.className = 'combo';
      this.comboEl.innerHTML = '<b></b><span>SERIA</span><i><u></u></i>';
      this.hud.appendChild(this.comboEl);
    }
    const el = this.comboEl;
    if (!el.isConnected) this.hud.appendChild(el);
    const show = n >= 3;
    el.classList.toggle('on', show);
    if (!show) {
      this.comboShown = 0;
      return;
    }
    if (n !== this.comboShown) {
      this.comboShown = n;
      (el.firstElementChild as HTMLElement).textContent = `×${n}`;
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
      el.style.setProperty('--combo-col', n >= 30 ? '#ff3d5e' : n >= 20 ? '#ffb23e' : n >= 10 ? '#ffe066' : '#3ee6ff');
    }
    (el.querySelector('u') as HTMLElement).style.width = `${Math.max(0, Math.min(1, g.run.comboT / 2.4)) * 100}%`;
  }

  private banners: HTMLElement[] = [];
  private banner(title: string, sub: string, boss = false) {
    for (const old of this.banners) old.remove();
    this.banners = [];
    const b = document.createElement('div');
    b.className = 'banner' + (boss ? ' boss' : '');
    b.innerHTML = `<h2>${esc(title)}</h2><p>${esc(sub)}</p>`;
    this.hud.appendChild(b);
    this.banners.push(b);
    window.setTimeout(() => {
      b.remove();
      this.banners = this.banners.filter((x) => x !== b);
    }, 3700);
  }

  private toast(text: string, color = '#ffffff') {
    if (!this.toastWrap) this.toastWrap = this.hud.querySelector('.toast-wrap') as HTMLElement;
    if (!this.toastWrap) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.color = color;
    el.textContent = text;
    this.toastWrap.appendChild(el);
    while (this.toastWrap.children.length > 3) this.toastWrap.firstElementChild?.remove();
    window.setTimeout(() => el.remove(), 1850);
  }

  private dialog(who: string, text: string, cls: string) {
    const el = document.createElement('div');
    el.className = `dialog ${cls}`;
    el.dataset.text = text;
    el.innerHTML = `<div class="who">${esc(who)}</div>${esc(text)}`;
    this.hud.appendChild(el);
    return el;
  }

  // ================================================================== overlays
  private onEscape() {
    if (this.rebinding) return;
    if (this.mode !== 'play') return;
    if (!this.overlay) this.openPause();
  }

  private openPause() {
    this.openOverlay('pause');
  }

  private openOverlay(o: Overlay, from: Overlay = null) {
    if (from) this.back.push(from);
    this.overlay = o;
    this.keyboard.enabled = o === null;
    this.input.clear();
    this.renderOverlay();
    this.audio.play('ui');
  }

  private closeOverlay() {
    const prev = this.back.pop() ?? null;
    if (this.overlay === 'choice') return; // a choice must be made
    if (this.overlay === 'dead' || this.overlay === 'victory') return;
    this.overlay = prev;
    this.keyboard.enabled = prev === null && this.mode === 'play';
    this.input.clear();
    if (prev) this.renderOverlay();
    else if (this.mode === 'play') this.screen.innerHTML = '';
    else if (this.mode === 'hub') this.showHub();
    else this.showTitle();
    this.audio.play('uiBack');
  }

  private renderOverlay() {
    const o = this.overlay;
    if (o === 'pause') this.screen.innerHTML = this.pauseHtml();
    else if (o === 'choice') this.screen.innerHTML = this.choiceHtml();
    else if (o === 'inventory') this.screen.innerHTML = this.inventoryHtml();
    else if (o === 'settings') this.screen.innerHTML = this.settingsHtml();
    else if (o === 'controls' || o === 'guide') this.screen.innerHTML = this.controlsHtml(o === 'guide');
    else if (o === 'dead') this.screen.innerHTML = this.endHtml(false);
    else if (o === 'victory') this.screen.innerHTML = this.endHtml(true);
    this.wire();
    const first = this.screen.querySelector('.card, .btn.primary, .btn') as HTMLElement | null;
    first?.focus();
  }

  // ---------------------------------------------------------------- title & base
  showTitle() {
    this.mode = 'title';
    this.overlay = null;
    this.back = [];
    this.keyboard.enabled = false;
    this.hud.classList.add('hidden');
    this.touch.hidden = true;
    this.dialogEl?.remove();
    this.signEl?.remove();
    this.dialogEl = this.signEl = null;
    this.audio.stopMusic();
    const run = loadRun();
    this.screen.innerHTML = `
      <div class="vr-screen title-screen">
        <div class="title-frag frag" title="Fragmenty Pustki">${this.meta.fragments}</div>
        <h1 class="logo" data-text="VOIDRUNNER">VOID<span>RUNNER</span></h1>
        <div class="tagline">Rok 2197 · kompleks badawczy · Pustka</div>
        <div class="menu">
          <button class="btn primary" data-act="new">Nowa gra <small>nowa wyprawa</small></button>
          <button class="btn" data-act="continue" ${run ? '' : 'disabled'}>Kontynuuj <small>${run ? `${esc(AREAS[run.area].name)} · ${fmtTime(run.time)}` : 'brak zapisu'}</small></button>
          <button class="btn" data-act="hub">Ulepszenia <small>baza · ${this.meta.fragments} fragmentów</small></button>
          <button class="btn" data-act="settings">Ustawienia</button>
          <button class="btn" data-act="controls">Sterowanie</button>
        </div>
        <div class="confirm-slot"></div>
        <div class="title-foot">Wyprawy: ${this.meta.stats.runs} · zwycięstwa: ${this.meta.stats.wins} · najgłębszy sektor: ${this.meta.stats.bestArea || '—'}</div>
      </div>`;
    this.wire();
    (this.screen.querySelector('.btn.primary') as HTMLElement | null)?.focus();
  }

  showHub() {
    this.mode = 'hub';
    this.overlay = null;
    this.back = [];
    this.keyboard.enabled = false;
    this.hud.classList.add('hidden');
    this.touch.hidden = true;
    const m = this.meta;
    const perm = PERMS.map((p) => {
      const lvl = m.perm[p.id] ?? 0;
      const max = p.costs.length;
      const cost = lvl < max ? p.costs[lvl] : 0;
      return `<div class="hub-card">
        <b>${esc(p.name)}</b>
        <button class="btn sm buy" data-act="perm" data-id="${p.id}" ${lvl >= max || m.fragments < cost ? 'disabled' : ''}>${lvl >= max ? 'MAKS.' : `${cost} ◆`}</button>
        <p>${esc(p.desc(lvl))}</p>
        <div class="lv">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
      </div>`;
    }).join('');
    const weapons = (Object.keys(WEAPONS) as WeaponId[])
      .map((id) => {
        const w = WEAPONS[id];
        const owned = m.weapons.includes(id);
        return `<div class="hub-card ${m.weapon === id ? 'sel' : ''}">
        <b>${esc(w.name)}</b>
        ${owned ? `<button class="btn sm buy" data-act="weapon" data-id="${id}" ${m.weapon === id ? 'disabled' : ''}>${m.weapon === id ? 'WYBRANA' : 'WYBIERZ'}</button>` : `<button class="btn sm buy" data-act="weapon" data-id="${id}" ${m.fragments < w.cost ? 'disabled' : ''}>${w.cost} ◆</button>`}
        <p>${esc(w.desc)} <br>Atak naładowany: ${esc(w.charged.name)} · Umiejętność: ${esc(w.special.name)}</p>
      </div>`;
      })
      .join('');
    const skins = (Object.keys(COSMETICS) as CosmeticId[])
      .map((id) => {
        const s = COSMETICS[id];
        const owned = m.cosmetics.includes(id);
        return `<div class="hub-card ${m.cosmetic === id ? 'sel' : ''}">
        <b><span class="swatch" style="background:${s.armorHi};box-shadow:inset 0 -4px 0 ${s.glow}"></span>${esc(s.name)}</b>
        ${owned ? `<button class="btn sm buy" data-act="skin" data-id="${id}" ${m.cosmetic === id ? 'disabled' : ''}>${m.cosmetic === id ? 'NOSZONY' : 'ZAŁÓŻ'}</button>` : `<button class="btn sm buy" data-act="skin" data-id="${id}" ${m.fragments < s.cost ? 'disabled' : ''}>${s.cost} ◆</button>`}
      </div>`;
      })
      .join('');
    this.screen.innerHTML = `
      <div class="vr-screen dim">
        <div class="panel wide">
          <button class="close-x" data-act="back" aria-label="Wróć">×</button>
          <h2>Baza</h2>
          <p class="lead">Fragmenty Pustki zostają z tobą po każdej wyprawie. Wydawaj je na trwałe ulepszenia. <span class="frag">${m.fragments}</span></p>
          <div class="hub-grid">
            <div><h3>Trwałe ulepszenia</h3>${perm}</div>
            <div><h3>Bronie</h3>${weapons}<h3>Wygląd</h3>${skins}</div>
          </div>
          <h3>Statystyki</h3>
          <div class="stats">
            <div><b>${m.stats.runs}</b><span>wypraw</span></div>
            <div><b>${m.stats.wins}</b><span>zwycięstw</span></div>
            <div><b>${m.stats.kills}</b><span>pokonanych wrogów</span></div>
            <div><b>${m.stats.bosses}</b><span>pokonanych strażników</span></div>
            <div><b>${m.stats.bestArea || '—'}</b><span>najgłębszy sektor</span></div>
            <div><b>${m.totalFragments}</b><span>zebrane fragmenty</span></div>
          </div>
          <div class="row" style="margin-top:16px">
            <button class="btn primary" data-act="new">Rozpocznij kolejną wyprawę</button>
            <button class="btn" data-act="back">Menu główne</button>
          </div>
        </div>
      </div>`;
    this.wire();
  }

  // ---------------------------------------------------------------- overlay html
  private pauseHtml() {
    const hasSave = !!loadRun();
    return `<div class="vr-screen dim"><div class="panel">
      <h2>Pauza</h2>
      <p class="lead">${esc(AREAS[this.game.run.area].name)} · pomieszczenie ${this.game.run.room + 1}/${ROOMS_PER_AREA} · czas ${fmtTime(this.game.run.time)}</p>
      <div class="menu">
        <button class="btn primary" data-act="resume">Wznów</button>
        <button class="btn" data-act="inventory">Ekwipunek <small>I</small></button>
        <button class="btn" data-act="settings">Ustawienia</button>
        <button class="btn" data-act="controls">Sterowanie</button>
        <button class="btn" data-act="restart" ${hasSave ? '' : 'disabled'}>Uruchom ponownie <small>od ostatniego zapisu</small></button>
        <button class="btn danger" data-act="menu">Powrót do menu <small>wyprawa zostaje zapisana w punkcie zapisu</small></button>
      </div></div></div>`;
  }

  private choiceHtml() {
    const ch = this.game.pendingChoice;
    if (!ch) return '';
    return `<div class="vr-screen dim"><div class="panel wide">
      <h2>Wybierz ulepszenie</h2>
      <p class="lead">${esc(ch.reason)} — ulepszenie działa do końca wyprawy. Klawisze 1–${ch.options.length} albo kliknij.</p>
      <div class="choice-cards ${ch.options.length === 2 ? 'two' : ''}">
        ${ch.options
          .map((id, i) => {
            const u = UPGRADES[id];
            const have = this.game.up(id);
            return `<button class="card" style="--c:${u.color}" data-act="choose" data-id="${id}"><span class="key">${i + 1}</span><span class="icon"></span><b>${esc(u.name)}</b><p>${esc(u.desc(have))}</p><small>${have ? `posiadasz: poziom ${have} → ${have + 1}` : 'nowe'} · maks. ${u.max}</small></button>`;
          })
          .join('')}
      </div></div></div>`;
  }

  private inventoryHtml() {
    const g = this.game;
    const w = WEAPONS[g.weapon];
    const ups = (Object.keys(g.run.upgrades) as UpgradeId[]).filter((id) => g.up(id) > 0);
    return `<div class="vr-screen dim"><div class="panel wide">
      <button class="close-x" data-act="close" aria-label="Zamknij">×</button>
      <h2>Ekwipunek</h2>
      <div class="hub-grid">
        <div>
          <h3>Broń — ${esc(w.name)}</h3>
          <p class="lead">${esc(w.desc)}</p>
          <div class="kv">
            ${w.stats.map((s) => `<span>${esc(s.label)}</span><b>${esc(s.value)}</b>`).join('')}
            <span>Atak naładowany</span><b>${esc(w.charged.name)} (${w.charged.dmg})</b>
            <span>Umiejętność (K)</span><b>${esc(w.special.name)} — ${w.special.cost} energii</b>
          </div>
          <h3>Stan</h3>
          <div class="kv">
            <span>Zdrowie</span><b>${Math.ceil(g.player.hp)} / ${g.player.maxHp}</b>
            <span>Energia</span><b>${Math.floor(g.player.energy)} / ${g.player.maxEnergy}</b>
            <span>Nanoapteczki</span><b>${g.player.healCharges}</b>
            <span>Mnożnik obrażeń</span><b>×${g.dmgMult().toFixed(2)}</b>
            <span>Fragmenty z tej wyprawy</span><b>${g.run.fragments}</b>
            <span>Pokonani wrogowie</span><b>${g.run.kills}</b>
          </div>
        </div>
        <div>
          <h3>Ulepszenia wyprawy</h3>
          ${ups.length ? `<div class="up-list">${ups.map((u) => `<div style="--c:${UPGRADES[u].color}"><b>${esc(UPGRADES[u].name)}</b> · poziom ${g.up(u)}<br>${esc(UPGRADES[u].desc(g.up(u) - 1))}</div>`).join('')}</div>` : '<p class="lead">Jeszcze żadnych. Szukaj ołtarzy ulepszeń i pokonuj strażników.</p>'}
          <h3>Odblokowane bronie</h3>
          <div class="up-list">${this.meta.weapons.map((id) => `<div style="--c:${id === g.weapon ? '#3ee6ff' : '#5a6680'}"><b>${esc(WEAPONS[id].name)}</b>${id === g.weapon ? ' · w rękach' : ''}<br>${WEAPONS[id].stats.map((s) => `${esc(s.label)}: ${esc(s.value)}`).join(' · ')}<br>J (przytrzymaj): ${esc(WEAPONS[id].charged.name)} · K: ${esc(WEAPONS[id].special.name)}</div>`).join('')}</div>
          <p class="hint">Broń na wyprawę wybierasz w bazie.</p>
          <h3>Trwałe ulepszenia</h3>
          <div class="kv">${PERMS.map((p) => `<span>${esc(p.name)}</span><b>${this.meta.perm[p.id] ?? 0}/${p.costs.length}</b>`).join('')}</div>
        </div>
      </div>
      <p class="hint">I albo Esc — zamknij</p>
      </div></div>`;
  }

  private settingsHtml() {
    const s = this.meta.settings;
    const slider = (k: 'master' | 'music' | 'sfx', label: string) => `<div class="set-row"><span>${label}</span><input type="range" min="0" max="100" value="${Math.round(s[k] * 100)}" data-set="${k}"><b>${Math.round(s[k] * 100)}%</b></div>`;
    return `<div class="vr-screen dim"><div class="panel">
      <button class="close-x" data-act="close" aria-label="Zamknij">×</button>
      <h2>Ustawienia</h2>
      ${slider('master', 'Głośność ogólna')}
      ${slider('music', 'Muzyka')}
      ${slider('sfx', 'Efekty')}
      <div class="set-row"><span>Wstrząsy ekranu</span><span></span><button class="toggle ${s.shake ? 'on' : ''}" data-act="toggle" data-id="shake">${s.shake ? 'WŁ.' : 'WYŁ.'}</button></div>
      <div class="set-row"><span>Liczby obrażeń</span><span></span><button class="toggle ${s.damageNumbers ? 'on' : ''}" data-act="toggle" data-id="damageNumbers">${s.damageNumbers ? 'WŁ.' : 'WYŁ.'}</button></div>
      <div class="set-row"><span>Efekty graficzne (poświata, pierwszy plan)</span><span></span><button class="toggle ${s.effects ? 'on' : ''}" data-act="toggle" data-id="effects">${s.effects ? 'WŁ.' : 'WYŁ.'}</button></div>
      <div class="set-row"><span>Przyciski dotykowe</span><span></span><button class="toggle on" data-act="touchmode">${s.touch === 'auto' ? 'AUTO' : s.touch === 'on' ? 'WŁ.' : 'WYŁ.'}</button></div>
      ${this.mode !== 'play' ? `<div class="set-row"><span>Postęp</span><span></span><button class="toggle" data-act="reset">RESETUJ</button></div><div class="confirm-slot"></div>` : ''}
      <div class="row" style="margin-top:14px"><button class="btn primary" data-act="close">Gotowe</button></div>
      </div></div>`;
  }

  private controlsHtml(guide: boolean) {
    const rows = ACTIONS.map(
      (a) =>
        `<span>${esc(a.label)}</span><span class="k">${this.meta.keys[a.id].map((k, i) => `<span class="kbd ${this.rebinding === a.id && i === 0 ? 'wait' : ''}" data-act="rebind" data-id="${a.id}">${this.rebinding === a.id && i === 0 ? '…' : esc(keyLabel(k))}</span>`).join('')}</span>`,
    ).join('');
    return `<div class="vr-screen dim"><div class="panel">
      ${guide ? '' : '<button class="close-x" data-act="close" aria-label="Zamknij">×</button>'}
      <h2>Sterowanie</h2>
      <p class="lead">${guide ? 'Pierwsza wyprawa. Tak sterujesz cyborgiem — w pierwszym pomieszczeniu tablice przypomną ci najważniejsze ruchy.' : 'Kliknij pole, żeby je zmienić, potem naciśnij nowy klawisz — albo kliknij pole „…” wybranym przyciskiem myszy (Esc anuluje). Atak działa domyślnie pod J, R i lewym przyciskiem myszy, umiejętność pod K i prawym przyciskiem.'}</p>
      <div class="keys-table">${rows}</div>
      <p class="hint">W powietrzu SPACJA = podwójny skok. Atak: J, R albo lewy przycisk myszy (LPM) — przytrzymaj i puść = atak naładowany. Umiejętność: K albo prawy przycisk myszy (PPM). Zryw (SHIFT) daje chwilę nietykalności — zryw tuż przed trafieniem to <b>perfekcyjny unik</b> (spowolnienie czasu, energia i mocniejsza kontra).</p>
      <p class="hint">Przy ścianie: dociśnij kierunek, żeby się zsuwać, SPACJA = odbicie od ściany. W powietrzu ↓ + atak = cięcie w dół (odbija od wrogów, skrzyń i kolców), ↑ + atak = cięcie w górę. Tarczownika atakuj od tyłu albo przełam gardę atakiem naładowanym. Kolejne trafienia bez otrzymania obrażeń budują serię (co 10 — bonusowe Fragmenty).</p>
      <div class="row" style="margin-top:14px">
        ${guide ? '<button class="btn primary" data-act="close">Zaczynamy</button>' : '<button class="btn" data-act="defaultkeys">Przywróć domyślne</button><button class="btn primary" data-act="close">Gotowe</button>'}
      </div></div></div>`;
  }

  private endHtml(win: boolean) {
    const g = this.game;
    const area = AREAS[g.run.area];
    return `<div class="vr-screen dim"><div class="panel">
      <h1 class="end-title ${win ? 'win' : 'dead'}">${win ? 'Misja zakończona' : 'Wyprawa zakończona'}</h1>
      <p class="lead">${win ? 'Serce Pustki zniszczone. Szczelina się zamyka — ARIA prowadzi cię na powierzchnię.' : `Zostałeś pokonany w sektorze: ${esc(area.name)}.`}</p>
      <div class="stats">
        <div><b>${g.run.fragments}</b><span>zebrane fragmenty</span></div>
        <div><b>${g.run.kills}</b><span>pokonani wrogowie</span></div>
        <div><b>${g.run.bosses}</b><span>pokonani strażnicy</span></div>
        <div><b>${g.run.area + 1}/5</b><span>sektor</span></div>
        <div><b>${fmtTime(g.run.time)}</b><span>czas wyprawy</span></div>
        <div><b>${Object.values(g.run.upgrades).reduce((a, b) => a + (b ?? 0), 0)}</b><span>ulepszenia</span></div>
      </div>
      <div class="gain">Trwały postęp: <b>+${this.lastGain}</b> Fragmentów Pustki${win ? ' (w tym 50 za ukończenie misji)' : ''} · razem w bazie: <b>${this.meta.fragments}</b></div>
      <div class="menu">
        ${win ? '<button class="btn primary" data-act="hub">Powrót do bazy</button><button class="btn" data-act="new">Rozpocznij kolejną wyprawę</button>' : '<button class="btn primary" data-act="new">Spróbuj ponownie</button><button class="btn" data-act="hub">Powrót do bazy <small>wydaj fragmenty</small></button>'}
        <button class="btn" data-act="menu">Menu główne</button>
      </div></div></div>`;
  }

  // ---------------------------------------------------------------- wiring
  private wire() {
    this.screen.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        this.act(el.dataset.act!, el.dataset.id, el);
      };
    });
    this.screen.querySelectorAll<HTMLInputElement>('input[data-set]').forEach((inp) => {
      inp.oninput = () => {
        const k = inp.dataset.set as 'master' | 'music' | 'sfx';
        this.meta.settings[k] = Number(inp.value) / 100;
        (inp.nextElementSibling as HTMLElement).textContent = `${inp.value}%`;
        this.audio.apply(this.meta.settings);
        this.saveMeta();
      };
      inp.onchange = () => this.audio.play('ui');
    });
  }

  private act(a: string, id?: string, el?: HTMLElement) {
    switch (a) {
      case 'new':
        if (this.mode === 'title' && loadRun()) {
          const slot = this.screen.querySelector('.confirm-slot')!;
          slot.innerHTML = `<div class="confirm">Masz zapisaną wyprawę. Nowa gra ją usunie (zebrane w niej fragmenty przepadną).<div class="row" style="margin-top:8px"><button class="btn sm danger" data-act="newsure">Zacznij od nowa</button><button class="btn sm" data-act="cancel">Anuluj</button></div></div>`;
          this.wire();
          (slot.querySelector('.btn') as HTMLElement).focus();
          return;
        }
        this.startNewRun();
        break;
      case 'newsure':
        this.startNewRun();
        break;
      case 'cancel': {
        const slot = this.screen.querySelector('.confirm-slot');
        if (slot) slot.innerHTML = '';
        break;
      }
      case 'continue':
        this.continueRun();
        break;
      case 'hub':
        this.audio.play('ui');
        this.showHub();
        break;
      case 'settings':
        this.openOverlay('settings', this.mode === 'play' ? this.overlay : null);
        break;
      case 'controls':
        this.openOverlay('controls', this.mode === 'play' ? this.overlay : null);
        break;
      case 'inventory':
        this.openOverlay('inventory', this.overlay);
        break;
      case 'resume':
      case 'close':
        this.rebinding = null;
        this.keyboard.onAnyKey = null;
        this.closeOverlay();
        break;
      case 'back':
        this.audio.play('uiBack');
        this.showTitle();
        break;
      case 'menu':
        this.saveMeta();
        this.showTitle();
        break;
      case 'restart': {
        const s = loadRun();
        if (s) {
          this.game.continueRun(s);
          this.enterPlay();
        }
        break;
      }
      case 'choose':
        this.game.choose(id as UpgradeId);
        this.overlay = null;
        this.back = [];
        this.keyboard.enabled = true;
        this.screen.innerHTML = '';
        break;
      case 'perm': {
        const def = PERMS.find((p) => p.id === id)!;
        const lvl = this.meta.perm[def.id] ?? 0;
        const cost = def.costs[lvl];
        if (cost !== undefined && this.meta.fragments >= cost) {
          this.meta.fragments -= cost;
          this.meta.perm[def.id] = lvl + 1;
          this.audio.play('upgrade');
          this.saveMeta();
          this.showHub();
        }
        break;
      }
      case 'weapon': {
        const wid = id as WeaponId;
        if (!this.meta.weapons.includes(wid)) {
          if (this.meta.fragments < WEAPONS[wid].cost) return;
          this.meta.fragments -= WEAPONS[wid].cost;
          this.meta.weapons.push(wid);
          this.audio.play('upgrade');
        } else this.audio.play('ui');
        this.meta.weapon = wid;
        this.saveMeta();
        this.showHub();
        break;
      }
      case 'skin': {
        const sid = id as CosmeticId;
        if (!this.meta.cosmetics.includes(sid)) {
          if (this.meta.fragments < COSMETICS[sid].cost) return;
          this.meta.fragments -= COSMETICS[sid].cost;
          this.meta.cosmetics.push(sid);
          this.audio.play('upgrade');
        } else this.audio.play('ui');
        this.meta.cosmetic = sid;
        this.saveMeta();
        this.showHub();
        break;
      }
      case 'toggle': {
        const k = id as 'shake' | 'damageNumbers' | 'effects';
        this.meta.settings[k] = !this.meta.settings[k];
        this.renderer.shakeOn = this.meta.settings.shake;
        this.renderer.bloomOn = this.meta.settings.effects;
    this.renderer.bloomOn = this.meta.settings.effects;
        this.saveMeta();
        this.renderOverlay();
        break;
      }
      case 'touchmode': {
        const order = ['auto', 'on', 'off'] as const;
        this.meta.settings.touch = order[(order.indexOf(this.meta.settings.touch) + 1) % 3];
        this.saveMeta();
        this.updateTouchVisibility();
        this.renderOverlay();
        break;
      }
      case 'reset': {
        const slot = this.screen.querySelector('.confirm-slot');
        if (!slot) return;
        slot.innerHTML = `<div class="confirm">Usunąć cały postęp (fragmenty, ulepszenia, statystyki)? Tego nie da się cofnąć.<div class="row" style="margin-top:8px"><button class="btn sm danger" data-act="resetsure">Usuń postęp</button><button class="btn sm" data-act="cancel">Anuluj</button></div></div>`;
        this.wire();
        break;
      }
      case 'resetsure': {
        const keys = this.meta.keys;
        const settings = this.meta.settings;
        this.meta = loadMeta();
        Object.assign(this.meta, { fragments: 0, totalFragments: 0, perm: {}, weapons: ['blade'], weapon: 'blade', cosmetics: ['standard'], cosmetic: 'standard', stats: { runs: 0, wins: 0, deaths: 0, kills: 0, bosses: 0, bestArea: 0, bestTime: 0 }, tutorialDone: false, keys, settings });
        this.game.meta = this.meta;
        clearRun();
        this.saveMeta();
        this.overlay = null;
        this.showTitle();
        break;
      }
      case 'rebind': {
        const action = id as Action;
        this.rebinding = action;
        this.renderOverlay();
        this.keyboard.onAnyKey = (code) => {
          if (code !== 'Escape') {
            // a key belongs to one action only
            for (const k of Object.keys(this.meta.keys) as Action[]) this.meta.keys[k] = this.meta.keys[k].filter((c) => c !== code);
            this.meta.keys[action] = [code, ...this.meta.keys[action].filter((c) => c !== code)].slice(0, MAX_BINDS);
            if (!this.meta.keys.pause.length) this.meta.keys.pause = ['Escape'];
            this.keyboard.setKeys(this.meta.keys);
            this.saveMeta();
          }
          this.rebinding = null;
          this.renderOverlay();
          return true;
        };
        void el;
        break;
      }
      case 'defaultkeys':
        this.meta.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS));
        this.keyboard.setKeys(this.meta.keys);
        this.saveMeta();
        this.renderOverlay();
        break;
    }
  }

  /** Arrow keys / Enter / Space / Esc / 1-3 inside menus. */
  private menuKeys(e: KeyboardEvent) {
    if (this.rebinding) return;
    const inMenu = this.mode !== 'play' || this.overlay;
    if (!inMenu) return;
    if (this.overlay === 'choice' && /^Digit[1-3]$/.test(e.code)) {
      const cards = this.screen.querySelectorAll<HTMLElement>('.card');
      cards[Number(e.code.slice(5)) - 1]?.click();
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape' || (this.overlay === 'inventory' && e.code === 'KeyI')) {
      e.preventDefault();
      e.stopPropagation();
      if (this.overlay) this.closeOverlay();
      else if (this.mode === 'hub') this.showTitle();
      return;
    }
    const items = [...this.screen.querySelectorAll<HTMLElement>('.btn:not(:disabled), .card, .toggle, .kbd, input[type=range]')];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (['ArrowDown', 'ArrowRight', 'KeyS', 'KeyD'].includes(e.code) && !(document.activeElement instanceof HTMLInputElement && e.code.startsWith('Arrow') && (e.code === 'ArrowRight' || e.code === 'ArrowLeft'))) {
      e.preventDefault();
      items[(i + 1 + items.length) % items.length].focus();
    } else if (['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA'].includes(e.code) && !(document.activeElement instanceof HTMLInputElement && (e.code === 'ArrowRight' || e.code === 'ArrowLeft'))) {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length].focus();
    } else if ((e.code === 'Enter' || e.code === 'Space') && i >= 0) {
      e.preventDefault();
      items[i].click();
    }
  }

  // ================================================================== touch
  private buildTouch() {
    const b: [string, string, Action][] = [
      ['tl', '◀', 'left'],
      ['tr', '▶', 'right'],
      ['td', 'DÓŁ', 'down'],
      ['ta', 'ATAK', 'attack'],
      ['tj', 'SKOK', 'jump'],
      ['tdash', 'ZRYW', 'dash'],
      ['tk', 'MOC', 'special'],
      ['te', 'E', 'interact'],
      ['th', 'LECZ', 'heal'],
    ];
    this.touch.innerHTML = b.map(([cls, label, a]) => `<button class="${cls}" data-a="${a}" aria-label="${label}">${label}</button>`).join('') + '<button class="tp" data-pause="1" aria-label="Pauza">II</button>';
    this.touch.querySelectorAll<HTMLElement>('button[data-a]').forEach((el) => {
      const a = el.dataset.a as Action;
      const down = (ev: Event) => {
        ev.preventDefault();
        this.audio.unlock();
        el.classList.add('on');
        this.input.press(a);
      };
      const up = (ev: Event) => {
        ev.preventDefault();
        el.classList.remove('on');
        this.input.release(a);
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    });
    (this.touch.querySelector('[data-pause]') as HTMLElement).onclick = () => this.mode === 'play' && !this.overlay && this.openPause();
  }

  private updateTouchVisibility() {
    const s = this.meta.settings.touch;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
    this.touch.hidden = !(this.mode === 'play' && (s === 'on' || (s === 'auto' && coarse)));
  }
}

function bossName(b?: string) {
  return b === 'matka' ? 'Matka Roju' : b === 'straznik' ? 'Strażnik Rdzenia' : b === 'serce' ? 'Serce Pustki' : '';
}
