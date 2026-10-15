// In-game HUD: objective, health, flashlight battery, ammunition, crosshair and
// interaction prompt, subtitles, short messages and hiding overlays.
import type { Sim } from '../game/sim';
import type { Line } from '../game/story';
import { h, setText } from './dom';

interface Toast {
  el: HTMLElement;
  until: number;
}

export class Hud {
  root: HTMLElement;
  private objTitle = h('b');
  private objText = h('div');
  private zone = h('div', { class: 'bd-clock' });
  private health = h('i', { class: 'bd-health' });
  private healthLabel = h('span');
  private battery = h('i');
  private batteryLabel = h('span');
  private stamina = h('i');
  private staminaRow: HTMLElement;
  private items = h('span');
  private ammo = h('div', { class: 'bd-ammo' });
  private cross = h('div', { class: 'bd-cross' });
  private prompt = h('div', { class: 'bd-prompt' });
  private subs = h('div', { class: 'bd-subs', 'aria-live': 'polite' });
  private toasts = h('div', { class: 'bd-toasts', 'aria-live': 'polite' });
  private final = h('div', { class: 'bd-final' });
  private finalText = h('span');
  private finalBar = h('i');
  private hidden = h('div', { class: 'bd-hidden-tag' });
  private locker = h('div', { class: 'bd-locker' });
  private blood = h('div', { class: 'bd-blood' });
  private saved = h('div', { class: 'bd-saved' }, 'ZAPISANO');
  private toastList: Toast[] = [];
  private subQueue: Line[] = [];
  private subUntil = 0;
  private savedUntil = 0;
  time = 0;
  onLine: (l: Line, seconds: number) => void = () => {};

  constructor() {
    this.staminaRow = h('div', { class: 'bd-meter' }, h('span', null, 'ODDECH'), this.stamina);
    this.final.append(this.finalText, this.finalBar);
    this.root = h(
      'div',
      { class: 'bd-hud' },
      this.locker,
      this.blood,
      h('div', { class: 'bd-objective' }, this.objTitle, this.objText),
      this.zone,
      h('div', { class: 'bd-status' }, h('div', { class: 'bd-meter' }, this.healthLabel, this.health), h('div', { class: 'bd-meter' }, this.batteryLabel, this.battery), this.staminaRow, this.items),
      this.ammo,
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
    for (const t of this.toastList) t.el.remove();
    this.toastList = [];
  }
  toast(text: string, tone: 'info' | 'deny' | 'good' = 'info') {
    const last = this.toastList[this.toastList.length - 1];
    if (last && last.el.textContent === text) {
      last.until = this.time + 3.2;
      return;
    }
    const el = h('div', { class: `bd-toast ${tone}` }, text);
    this.toasts.append(el);
    this.toastList.push({ el, until: this.time + 3.2 + text.length * 0.02 });
    while (this.toastList.length > 3) this.toastList.shift()!.el.remove();
  }
  flashSaved() {
    this.savedUntil = this.time + 2;
  }

  update(sim: Sim, dt: number, o: { showPrompt: boolean; minimal?: boolean }) {
    this.time += dt;
    this.root.classList.toggle('bd-min', !!o.minimal);
    const st = sim.state;
    setText(this.objTitle, st.area === 'descent' ? 'ZEJŚCIE' : 'CEL');
    setText(this.objText, sim.objective());
    setText(this.zone, sim.zoneName());
    // health
    const hp = Math.round(st.health);
    setText(this.healthLabel, `ZDROWIE ${hp}`);
    this.health.style.setProperty('--v', `${hp}%`);
    this.health.style.setProperty('--c', hp < 30 ? 'var(--red)' : hp < 60 ? 'var(--amber)' : 'var(--ink)');
    this.blood.style.opacity = String(Math.max(sim.hurtFlash * 0.9, hp < 40 ? (40 - hp) / 60 + Math.sin(this.time * 4) * 0.05 : 0));
    // battery
    const b = Math.round(st.battery * 100);
    setText(this.batteryLabel, sim.flashlight ? 'LATARKA ●' : 'LATARKA ○');
    this.battery.style.setProperty('--v', `${b}%`);
    this.battery.style.setProperty('--c', st.battery < 0.2 ? 'var(--red)' : st.battery < 0.45 ? 'var(--amber)' : 'var(--teal)');
    this.stamina.style.setProperty('--v', `${Math.round(sim.stamina * 100)}%`);
    this.stamina.style.setProperty('--c', sim.exhausted ? 'var(--red)' : 'var(--ink)');
    this.staminaRow.style.opacity = sim.stamina < 0.99 ? '1' : '0';
    const parts = [`BATERIE ×${st.inv.battery}`, `APTECZKI ×${st.inv.medkit}`];
    if (st.inv.tags) parts.push(`NIEŚMIERTELNIKI ${st.inv.tags}/5`);
    parts.push(`ZNAKI ${sim.symbolsKnown().length}/5`);
    setText(this.items, parts.join('  ·  '));
    // ammunition
    if (st.revolver) {
      this.ammo.style.display = '';
      const txt = sim.reloadT > 0 ? 'ŁADUJĘ…' : `${st.loaded} / ${st.inv.ammo}`;
      if (this.ammo.dataset.v !== txt) {
        this.ammo.dataset.v = txt;
        this.ammo.replaceChildren(h('small', null, sim.drawn ? 'REWOLWER .38' : 'REWOLWER (Q — wyciągnij)'), txt);
      }
    } else this.ammo.style.display = 'none';
    // crosshair and prompt
    const hiding = sim.player.hide && sim.player.hide.kind !== 'alcove';
    const label = o.showPrompt && !sim.dead && !sim.ended ? sim.focus?.label() ?? null : null;
    this.cross.className = `bd-cross${label ? ' on' : ''}`;
    this.cross.style.display = hiding ? 'none' : '';
    if (label) {
      if (this.prompt.dataset.label !== label) {
        this.prompt.dataset.label = label;
        this.prompt.replaceChildren(h('span', { class: 'bd-key' }, 'E'), label);
      }
      this.prompt.style.display = '';
    } else {
      this.prompt.style.display = 'none';
      this.prompt.dataset.label = '';
    }
    // hiding
    const hk = sim.player.hide?.kind;
    setText(this.hidden, hk === 'locker' ? 'W SZAFCE  ·  E — wyjdź' : hk === 'table' ? 'POD STOŁEM  ·  E — wyjdź' : hk === 'alcove' ? 'W CIENIU WNĘKI — nie ruszaj się' : '');
    this.hidden.style.display = hk ? '' : 'none';
    this.locker.style.display = hk === 'locker' ? '' : 'none';
    // collapse
    if (sim.collapse) {
      this.final.style.display = '';
      const left = Math.max(0, sim.collapse.need - sim.collapse.t);
      setText(this.finalText, `ZAKŁADKA SIĘ ZAPADA — ${Math.ceil(left)} s`);
      this.finalBar.style.setProperty('--v', `${(left / sim.collapse.need) * 100}%`);
    } else if (sim.calling) {
      this.final.style.display = '';
      setText(this.finalText, sim.calling.t < 20 ? 'ZWIAD 4 NADCHODZI' : 'DRZWI OTWARTE');
      this.finalBar.style.setProperty('--v', `${Math.min(1, sim.calling.t / 20) * 100}%`);
    } else this.final.style.display = 'none';
    // subtitles
    if (this.time >= this.subUntil) {
      const next = this.subQueue.shift();
      if (next) {
        const sec = next.t ?? Math.max(2.8, 1.1 + next.text.length * 0.055);
        this.subUntil = this.time + sec;
        this.subs.replaceChildren(h('span', null, h('em', { class: next.who === 'GŁOS' ? 'RADIO' : next.who === 'INSTYTUT' ? 'NADZORCA' : next.who }, next.who), next.text));
        this.onLine(next, sec);
      } else if (this.subs.firstChild) this.subs.replaceChildren();
    }
    while (this.toastList.length && this.toastList[0].until < this.time) this.toastList.shift()!.el.remove();
    this.saved.className = `bd-saved${this.time < this.savedUntil ? ' on' : ''}`;
  }

  show(on: boolean) {
    this.root.style.display = on ? '' : 'none';
  }
}
