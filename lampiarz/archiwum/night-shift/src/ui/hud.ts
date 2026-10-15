// The in-game HUD: objective, clock, flashlight/stamina meters, crosshair and
// interaction prompt, subtitles, short messages and the final countdown.
// Updated every frame, but the DOM is only touched when a value changes.
import type { Sim } from '../game/sim';
import { clockText, MISSIONS, type Line } from '../game/story';
import { h, setText } from './dom';

interface Toast {
  el: HTMLElement;
  until: number;
}

export class Hud {
  root: HTMLElement;
  private objTitle = h('b');
  private objText = h('div');
  private objHint = h('div', { class: 'ns-sub' });
  private clock = h('span');
  private zone = h('small');
  private battery = h('i');
  private batteryLabel = h('span');
  private stamina = h('i');
  private staminaRow: HTMLElement;
  private items = h('span');
  private cross = h('div', { class: 'ns-cross' });
  private prompt = h('div', { class: 'ns-prompt' });
  private subs = h('div', { class: 'ns-subs', 'aria-live': 'polite' });
  private toasts = h('div', { class: 'ns-toasts', 'aria-live': 'polite' });
  private final = h('div', { class: 'ns-final' });
  private finalText = h('span');
  private finalBar = h('i');
  private hidden = h('div', { class: 'ns-hidden-tag' }, 'UKRYTY W SZAFCE  ·  E — wyjdź');
  private locker = h('div', { class: 'ns-locker' });
  private saved = h('div', { class: 'ns-saved' }, 'ZAPISANO');
  private objective: HTMLElement;
  private toastList: Toast[] = [];
  private subQueue: Line[] = [];
  private subUntil = 0;
  private savedUntil = 0;
  private missionShownAt = 0;
  private lastMission = -1;
  time = 0;
  /** called when a new subtitle starts (for the voice sound) */
  onLine: (l: Line, seconds: number) => void = () => {};

  constructor() {
    this.objective = h('div', { class: 'ns-objective' }, this.objTitle, this.objText, this.objHint);
    this.staminaRow = h('div', { class: 'ns-meter' }, h('span', null, 'KONDYCJA'), this.stamina);
    this.final.append(this.finalText, this.finalBar);
    this.root = h(
      'div',
      { class: 'ns-hud' },
      this.locker,
      this.objective,
      h('div', { class: 'ns-clock' }, this.clock, this.zone),
      h('div', { class: 'ns-status' }, h('div', { class: 'ns-meter' }, this.batteryLabel, this.battery), this.staminaRow, this.items),
      this.cross,
      this.prompt,
      this.final,
      this.hidden,
      this.subs,
      this.toasts,
      this.saved,
    );
  }

  say(lines: Line[]) {
    this.subQueue.push(...lines);
  }
  clearSubs() {
    this.subQueue = [];
    this.subUntil = 0;
    this.subs.replaceChildren();
  }

  toast(text: string, tone: 'info' | 'deny' | 'good' = 'info') {
    // the same message twice in a row just refreshes
    const last = this.toastList[this.toastList.length - 1];
    if (last && last.el.textContent === text) {
      last.until = this.time + 3.2;
      return;
    }
    const el = h('div', { class: `ns-toast ${tone}` }, text);
    this.toasts.append(el);
    this.toastList.push({ el, until: this.time + 3.2 + text.length * 0.02 });
    while (this.toastList.length > 3) this.toastList.shift()!.el.remove();
  }

  flashSaved() {
    this.savedUntil = this.time + 2;
  }

  update(sim: Sim, dt: number, o: { showPrompt: boolean; minimal?: boolean }) {
    this.time += dt;
    this.root.classList.toggle('ns-min', !!o.minimal);
    const st = sim.state;
    // objective (+ hint after a while without progress)
    if (st.mission !== this.lastMission) {
      this.lastMission = st.mission;
      this.missionShownAt = this.time;
    }
    const m = MISSIONS[Math.min(st.mission, MISSIONS.length - 1)];
    setText(this.objTitle, `${String(Math.min(st.mission, 7) + 1).padStart(2, '0')} · ${m.title.toUpperCase()}`);
    setText(this.objText, sim.objective());
    setText(this.objHint, m.hint && this.time - this.missionShownAt > 75 && !sim.final ? `Wskazówka: ${m.hint}` : '');
    setText(this.clock, clockText(st.clock));
    setText(this.zone, sim.zoneName());
    // meters
    const b = Math.round(st.battery * 100);
    setText(this.batteryLabel, sim.flashlight ? 'LATARKA ●' : 'LATARKA ○');
    this.battery.style.setProperty('--v', `${b}%`);
    this.battery.style.setProperty('--c', st.battery < 0.2 ? 'var(--red)' : st.battery < 0.45 ? 'var(--amber)' : 'var(--teal)');
    this.stamina.style.setProperty('--v', `${Math.round(sim.stamina * 100)}%`);
    this.stamina.style.setProperty('--c', sim.exhausted ? 'var(--red)' : 'var(--ink)');
    this.staminaRow.style.opacity = sim.stamina < 0.99 ? '1' : '0';
    const bats = sim.batteries;
    const fuses = st.inventory.filter((i) => i === 'fuseA' || i === 'fuseB').length;
    const parts = [`AKUMULATORY ×${bats}`];
    if (fuses) parts.push(`BEZPIECZNIKI ×${fuses}`);
    if (sim.hasItem('card3')) parts.push('KARTA 3');
    if (sim.hasItem('tape')) parts.push('TAŚMA');
    if (sim.hasItem('key')) parts.push('KLUCZ');
    if (sim.charging > 0) parts.push('ŁADOWANIE…');
    setText(this.items, parts.join('  ·  '));
    // prompt
    const label = o.showPrompt && !sim.dead && !sim.ended ? sim.focus?.label() ?? null : null;
    this.cross.className = `ns-cross${label ? ' on' : ''}`;
    this.cross.style.display = sim.player.hidden ? 'none' : '';
    if (label) {
      if (this.prompt.dataset.label !== label) {
        this.prompt.dataset.label = label;
        this.prompt.replaceChildren(h('span', { class: 'ns-key' }, 'E'), label);
      }
      this.prompt.style.display = sim.player.hidden ? 'none' : '';
    } else {
      this.prompt.style.display = 'none';
      this.prompt.dataset.label = '';
    }
    // hiding
    this.hidden.style.display = sim.player.hidden ? '' : 'none';
    this.locker.style.display = sim.player.hidden ? '' : 'none';
    // final countdown
    if (sim.final && !sim.final.done) {
      this.final.style.display = '';
      const f = sim.final;
      const name = f.kind === 'lift' ? 'WINDA EWAKUACYJNA' : f.kind === 'tx' ? 'TRANSMISJA' : 'WYŁĄCZANIE CIĄGŁOŚCI';
      const inZone = sim.zone === f.zone || f.kind === 'lift';
      setText(this.finalText, `${name} ${Math.floor((f.t / f.need) * 100)}%${inZone ? '' : ' — WRÓĆ!'}`);
      this.finalBar.style.setProperty('--v', `${(f.t / f.need) * 100}%`);
    } else this.final.style.display = 'none';
    // subtitles
    if (this.time >= this.subUntil) {
      const next = this.subQueue.shift();
      if (next) {
        const sec = next.t ?? Math.max(3, 1.2 + next.text.length * 0.055);
        this.subUntil = this.time + sec;
        this.subs.replaceChildren(h('span', null, h('em', { class: next.who }, next.who), next.text));
        this.onLine(next, sec);
      } else if (this.subs.firstChild) this.subs.replaceChildren();
    }
    // toasts
    while (this.toastList.length && this.toastList[0].until < this.time) this.toastList.shift()!.el.remove();
    this.saved.className = `ns-saved${this.time < this.savedUntil ? ' on' : ''}`;
  }

  show(on: boolean) {
    this.root.style.display = on ? '' : 'none';
  }
}
