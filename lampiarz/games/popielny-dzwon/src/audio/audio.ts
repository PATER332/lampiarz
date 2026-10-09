// Procedural audio: a small synthesizer for sound effects and a beat-scheduled
// music system with crossfaded moods. Nothing is loaded from files.
import type { SfxName } from '../world/types';
import type { Settings } from '../save';

export type Mood = 'title' | 'hub' | 'explore' | 'tension' | 'boss' | 'victory' | 'silence' | 'ending';
export interface MoodOpts {
  scene?: 'rynek' | 'ogrod' | 'katedra' | 'krypta';
  boss?: 'kat' | 'pasterz' | 'dzwon';
  phase?: number;
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ------------------------------------------------------------------ music tracks
interface Track {
  key: string;
  gain: GainNode;
  beat: number; // seconds per beat
  next: number; // time of next beat
  i: number; // beat index
  play(i: number, t: number): void;
  stop(t: number): void;
  sustained: AudioScheduledSourceNode[];
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfxBus!: GainNode;
  private reverb!: ConvolverNode;
  private revSend!: GainNode;
  private noise!: AudioBuffer;
  private track: Track | null = null;
  private old: Track[] = [];
  private mood: Mood = 'silence';
  private moodKey = '';
  private pendingMood: [Mood, MoodOpts] | null = null;
  private active = 0;
  private settings: Settings | null = null;
  private seed = 1;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    // reverb: generated impulse of a stone hall
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 3.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb.buffer = ir;
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 0.32;
    this.revSend.connect(this.reverb).connect(this.master);
    const nlen = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    if (this.settings) this.apply(this.settings);
    if (this.pendingMood) {
      const [m, o] = this.pendingMood;
      this.pendingMood = null;
      this.mood = 'silence';
      this.moodKey = '';
      this.setMood(m, o);
    }
  }

  apply(s: Settings) {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
    this.music.gain.setTargetAtTime(s.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.05);
  }

  suspend(on: boolean) {
    if (!this.ctx) return;
    if (on) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  /** Lower the music while a menu is open. */
  duck(on: boolean) {
    if (!this.ctx || !this.settings) return;
    this.music.gain.setTargetAtTime(this.settings.music * 0.55 * (on ? 0.4 : 1), this.ctx.currentTime, 0.2);
  }

  // ------------------------------------------------------------------ primitives
  private out(pan: number, rev: number): AudioNode {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxBus);
    if (rev > 0) {
      const s = ctx.createGain();
      s.gain.value = rev;
      p.connect(s).connect(this.revSend);
    }
    return p;
  }

  private env(g: GainNode, t: number, vol: number, attack: number, dur: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.max(0.002, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  }

  private tone(dest: AudioNode, t: number, o: { type?: OscillatorType; f: number; f2?: number; dur: number; vol: number; attack?: number; detune?: number }) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    this.env(g, t, o.vol, o.attack ?? 0.005, o.dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + (o.attack ?? 0.005) + o.dur + 0.05);
    return osc;
  }

  private noiseHit(dest: AudioNode, t: number, o: { type?: BiquadFilterType; f: number; f2?: number; q?: number; dur: number; vol: number; attack?: number; rate?: number }) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = o.rate ?? 1;
    const flt = ctx.createBiquadFilter();
    flt.type = o.type ?? 'bandpass';
    flt.frequency.setValueAtTime(o.f, t);
    if (o.f2) flt.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    flt.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    this.env(g, t, o.vol, o.attack ?? 0.003, o.dur);
    src.connect(flt).connect(g).connect(dest);
    const off = Math.random() * 1.5;
    src.start(t, off);
    src.stop(t + (o.attack ?? 0.003) + o.dur + 0.05);
  }

  /** Inharmonic bell partials — the voice of the whole game. */
  private bell(dest: AudioNode, t: number, f: number, vol: number, decay: number) {
    const parts: [number, number, number][] = [
      [0.5, 0.5, 1.4],
      [1, 1, 1],
      [1.19, 0.6, 0.8],
      [1.56, 0.45, 0.6],
      [2, 0.4, 0.55],
      [2.74, 0.22, 0.35],
      [3.76, 0.16, 0.25],
      [5.4, 0.08, 0.15],
    ];
    for (const [r, a, d] of parts) this.tone(dest, t, { f: f * r, dur: decay * d, vol: vol * a, attack: 0.002 });
  }

  // ------------------------------------------------------------------ sound effects
  sfx(name: SfxName, pan = 0, vol = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.settings || this.settings.muted) return;
    if (this.active > 28 && (name === 'step' || name === 'land')) return;
    this.active++;
    window.setTimeout(() => this.active--, 400);
    const t = ctx.currentTime + 0.005;
    const v = vol;
    const r = () => 0.92 + Math.random() * 0.16; // pitch variation
    const o = (rev = 0.15) => this.out(pan, rev);
    switch (name) {
      case 'swing':
        this.noiseHit(o(0.05), t, { f: 800 * r(), f2: 2600, q: 1.4, dur: 0.13, vol: 0.32 * v, attack: 0.03 });
        break;
      case 'swingBlade':
        this.noiseHit(o(0.05), t, { type: 'highpass', f: 2500 * r(), f2: 6000, q: 0.8, dur: 0.09, vol: 0.28 * v, attack: 0.015 });
        this.tone(o(0.1), t + 0.03, { f: 3100 * r(), dur: 0.12, vol: 0.03 * v });
        break;
      case 'swingHeavy':
        this.noiseHit(o(0.08), t, { type: 'lowpass', f: 300, f2: 1100, q: 1, dur: 0.28, vol: 0.5 * v, attack: 0.07 });
        this.tone(o(0), t, { f: 90 * r(), f2: 60, dur: 0.2, vol: 0.12 * v, attack: 0.04 });
        break;
      case 'hitFlesh':
        this.noiseHit(o(0.05), t, { type: 'lowpass', f: 900 * r(), f2: 200, dur: 0.12, vol: 0.55 * v });
        this.tone(o(0), t, { f: 150 * r(), f2: 55, dur: 0.12, vol: 0.35 * v, type: 'triangle' });
        break;
      case 'hitArmor':
        this.noiseHit(o(0.2), t, { f: 2600 * r(), q: 6, dur: 0.08, vol: 0.4 * v });
        this.tone(o(0.3), t, { f: 1720 * r(), dur: 0.3, vol: 0.07 * v, type: 'triangle' });
        this.tone(o(0.3), t, { f: 2630 * r(), dur: 0.22, vol: 0.05 * v });
        break;
      case 'hitSpirit':
        this.tone(o(0.4), t, { f: 980 * r(), f2: 280, dur: 0.25, vol: 0.16 * v });
        this.noiseHit(o(0.3), t, { type: 'highpass', f: 4000, dur: 0.2, vol: 0.12 * v });
        break;
      case 'hitPlayer':
        this.tone(o(0), t, { f: 120, f2: 38, dur: 0.22, vol: 0.55 * v, type: 'triangle' });
        this.noiseHit(o(0.1), t, { type: 'lowpass', f: 700, f2: 150, dur: 0.2, vol: 0.6 * v });
        break;
      case 'block':
        this.noiseHit(o(0.2), t, { f: 1500 * r(), q: 3, dur: 0.07, vol: 0.45 * v });
        this.tone(o(0.25), t, { f: 1180 * r(), dur: 0.2, vol: 0.08 * v, type: 'triangle' });
        this.tone(o(0), t, { f: 160, f2: 80, dur: 0.1, vol: 0.2 * v });
        break;
      case 'parry':
        this.noiseHit(o(0.3), t, { type: 'highpass', f: 3000, dur: 0.05, vol: 0.5 * v });
        this.bell(o(0.6), t, 1318 * r(), 0.16 * v, 1.4);
        this.tone(o(0.4), t, { f: 2637, dur: 0.6, vol: 0.06 * v });
        break;
      case 'guardBreak':
        this.tone(o(0.2), t, { f: 420, f2: 70, dur: 0.45, vol: 0.12 * v, type: 'square' });
        this.tone(o(0.2), t, { f: 433, f2: 72, dur: 0.45, vol: 0.1 * v, type: 'square' });
        this.noiseHit(o(0.2), t, { type: 'lowpass', f: 1200, f2: 200, dur: 0.4, vol: 0.4 * v });
        break;
      case 'roll':
        this.noiseHit(o(0.05), t, { type: 'lowpass', f: 380, f2: 900, dur: 0.24, vol: 0.32 * v, attack: 0.05 });
        break;
      case 'perfectDodge':
        this.tone(o(0.6), t, { f: 320, f2: 1300, dur: 0.3, vol: 0.12 * v, attack: 0.05 });
        this.bell(o(0.7), t + 0.05, 1975, 0.05 * v, 1);
        break;
      case 'step': {
        const surf = this.moodScene;
        if (surf === 'ogrod') this.noiseHit(o(0), t, { type: 'highpass', f: 1800 * r(), dur: 0.05, vol: 0.12 * v });
        else if (surf === 'katedra' || surf === 'krypta') this.noiseHit(o(0.05), t, { f: 500 * r(), q: 2, dur: 0.05, vol: 0.2 * v });
        else this.noiseHit(o(0), t, { type: 'lowpass', f: 700 * r(), dur: 0.045, vol: 0.2 * v });
        break;
      }
      case 'jump':
        this.noiseHit(o(0), t, { f: 700, f2: 1400, dur: 0.08, vol: 0.14 * v });
        break;
      case 'land':
        this.noiseHit(o(0), t, { type: 'lowpass', f: 260, dur: 0.08, vol: 0.32 * v });
        break;
      case 'heal':
        for (const [i, f] of [523, 659, 784].entries()) this.tone(o(0.6), t + i * 0.06, { f, dur: 0.9, vol: 0.06 * v, attack: 0.08 });
        this.noiseHit(o(0.3), t, { type: 'highpass', f: 5000, dur: 0.6, vol: 0.05 * v, attack: 0.2 });
        break;
      case 'skill':
        this.bell(o(0.8), t, 110, 0.35 * v, 3);
        this.bell(o(0.8), t, 220 * 1.5, 0.12 * v, 2);
        this.noiseHit(o(0.4), t, { type: 'lowpass', f: 200, f2: 2000, dur: 0.5, vol: 0.4 * v, attack: 0.02 });
        break;
      case 'charge':
        this.tone(o(0.3), t, { f: 240, f2: 720, dur: 0.3, vol: 0.08 * v, type: 'triangle', attack: 0.05 });
        this.bell(o(0.5), t + 0.25, 1568, 0.05 * v, 0.6);
        break;
      case 'telegraphWhite':
        this.tone(o(0.3), t, { f: 2349, dur: 0.18, vol: 0.12 * v });
        this.tone(o(0.3), t + 0.02, { f: 3520, dur: 0.12, vol: 0.05 * v });
        break;
      case 'telegraphRed':
        this.tone(o(0.2), t, { f: 1046, dur: 0.32, vol: 0.06 * v, type: 'square' });
        this.tone(o(0.2), t, { f: 1108, dur: 0.32, vol: 0.06 * v, type: 'square' });
        this.tone(o(0.2), t, { f: 180, f2: 140, dur: 0.3, vol: 0.18 * v, type: 'sawtooth' });
        break;
      case 'enemyDeath':
        this.noiseHit(o(0.2), t, { type: 'lowpass', f: 1600, f2: 120, dur: 0.6, vol: 0.4 * v, attack: 0.01 });
        this.tone(o(0.3), t, { f: 330 * r(), f2: 90, dur: 0.5, vol: 0.06 * v, type: 'triangle' });
        break;
      case 'chest':
        this.tone(o(0.1), t, { f: 110, f2: 82, dur: 0.35, vol: 0.12 * v, type: 'sawtooth', attack: 0.05 });
        for (let i = 0; i < 4; i++) this.bell(o(0.5), t + 0.25 + i * 0.07, [1568, 1760, 2093, 2637][i], 0.04 * v, 0.7);
        break;
      case 'pickup':
        for (let i = 0; i < 3; i++) this.bell(o(0.5), t + i * 0.08, [784, 988, 1175][i], 0.06 * v, 0.8);
        break;
      case 'interact':
        this.tone(o(0.1), t, { f: 660, dur: 0.08, vol: 0.08 * v, type: 'triangle' });
        break;
      case 'shrine':
        this.bell(o(0.9), t, 392, 0.2 * v, 3);
        this.bell(o(0.9), t + 0.12, 588, 0.1 * v, 2.5);
        this.noiseHit(o(0.3), t, { type: 'lowpass', f: 300, f2: 1500, dur: 0.7, vol: 0.25 * v, attack: 0.2 });
        break;
      case 'lore':
        this.noiseHit(o(0.1), t, { type: 'highpass', f: 2200, f2: 4000, dur: 0.25, vol: 0.14 * v, attack: 0.05 });
        this.bell(o(0.8), t + 0.15, 587, 0.08 * v, 2);
        break;
      case 'wallBreak':
        this.noiseHit(o(0.4), t, { type: 'lowpass', f: 400, f2: 80, dur: 1.1, vol: 0.7 * v });
        for (let i = 0; i < 5; i++) this.noiseHit(o(0.2), t + 0.08 + i * 0.09, { f: 900 + Math.random() * 600, q: 2, dur: 0.06, vol: 0.2 * v });
        break;
      case 'cast':
        this.tone(o(0.5), t, { f: 520 * r(), f2: 980, dur: 0.4, vol: 0.06 * v, attack: 0.1 });
        this.noiseHit(o(0.4), t, { f: 1800, q: 4, dur: 0.35, vol: 0.12 * v, attack: 0.1 });
        break;
      case 'lament':
        this.choirSfx(o(0.8), t, [293.7, 349.2, 415.3], 1.6, 0.06 * v);
        break;
      case 'bark':
        for (let i = 0; i < 2; i++) {
          this.noiseHit(o(0.2), t + i * 0.16, { f: 700, q: 2, dur: 0.07, vol: 0.3 * v });
          this.tone(o(0.2), t + i * 0.16, { f: 320, f2: 210, dur: 0.08, vol: 0.08 * v, type: 'sawtooth' });
        }
        break;
      case 'pendulum':
        this.noiseHit(o(0.2), t, { type: 'lowpass', f: 180, f2: 700, dur: 0.35, vol: 0.4 * v, attack: 0.15 });
        break;
      case 'bossRoar':
        this.tone(o(0.5), t, { f: 70, f2: 38, dur: 1.4, vol: 0.4 * v, type: 'sawtooth', attack: 0.1 });
        this.tone(o(0.5), t, { f: 73, f2: 40, dur: 1.4, vol: 0.3 * v, type: 'sawtooth', attack: 0.1 });
        this.noiseHit(o(0.5), t, { type: 'lowpass', f: 600, f2: 120, dur: 1.3, vol: 0.5 * v, attack: 0.1 });
        break;
      case 'bossIntro':
        this.bell(o(1), t, 73.4, 0.5 * v, 6);
        this.tone(o(0.8), t, { f: 36.7, dur: 4, vol: 0.3 * v, attack: 0.5 });
        break;
      case 'bellToll':
        this.bell(o(1), t, 98, 0.45 * v, 4.5);
        break;
      case 'bellDrop':
        this.tone(o(0.3), t, { f: 90, f2: 30, dur: 0.6, vol: 0.7 * v, type: 'triangle' });
        this.noiseHit(o(0.4), t, { type: 'lowpass', f: 500, f2: 60, dur: 0.8, vol: 0.8 * v });
        this.bell(o(1), t + 0.01, 146.8, 0.25 * v, 3);
        break;
      case 'fire':
        this.noiseHit(o(0.2), t, { type: 'lowpass', f: 1400, f2: 300, dur: 0.6, vol: 0.4 * v, attack: 0.04 });
        for (let i = 0; i < 4; i++) this.noiseHit(o(0.1), t + Math.random() * 0.4, { type: 'highpass', f: 3000, dur: 0.02, vol: 0.2 * v });
        break;
      case 'teleport':
        this.tone(o(0.7), t, { f: 1200, f2: 300, dur: 0.3, vol: 0.08 * v });
        this.tone(o(0.7), t, { f: 300, f2: 1200, dur: 0.3, vol: 0.08 * v });
        break;
      case 'death':
        this.bell(o(1), t, 65.4, 0.4 * v, 5);
        this.choirSfx(o(1), t + 0.2, [130.8, 155.6, 196], 2.8, 0.05 * v);
        break;
      case 'victory':
        for (let i = 0; i < 4; i++) this.bell(o(1), t + i * 0.18, [587, 740, 880, 1175][i], 0.12 * v, 3);
        break;
      case 'levelUp':
        for (let i = 0; i < 4; i++) this.bell(o(0.8), t + i * 0.09, [523, 659, 784, 1046][i], 0.08 * v, 1.6);
        break;
      case 'menu':
        this.tone(o(0), t, { f: 880, dur: 0.035, vol: 0.05 * v, type: 'triangle' });
        break;
      case 'deny':
        this.tone(o(0), t, { f: 110, dur: 0.16, vol: 0.08 * v, type: 'square' });
        this.tone(o(0), t, { f: 116, dur: 0.16, vol: 0.08 * v, type: 'square' });
        break;
      case 'travel':
        this.noiseHit(o(0.6), t, { type: 'lowpass', f: 200, f2: 3000, dur: 1, vol: 0.3 * v, attack: 0.5 });
        this.bell(o(1), t + 0.6, 293.7, 0.18 * v, 3);
        break;
    }
  }

  private choirSfx(dest: AudioNode, t: number, freqs: number[], dur: number, vol: number) {
    const ctx = this.ctx!;
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * 0.94, t + dur);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5;
      const lg = ctx.createGain();
      lg.gain.value = f * 0.01;
      lfo.connect(lg).connect(osc.frequency);
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 700;
      f1.Q.value = 5;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 1150;
      f2.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(f1).connect(g);
      osc.connect(f2).connect(g);
      g.connect(dest);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + dur + 0.1);
      lfo.stop(t + dur + 0.1);
    }
  }

  // ------------------------------------------------------------------ music
  private moodScene: MoodOpts['scene'] = 'krypta';

  setMood(mood: Mood, opts: MoodOpts = {}) {
    if (opts.scene) this.moodScene = opts.scene;
    const key = `${mood}:${opts.scene ?? ''}:${opts.boss ?? ''}:${opts.phase ?? 1}`;
    if (!this.ctx) {
      this.pendingMood = [mood, opts];
      return;
    }
    if (key === this.moodKey) return;
    this.mood = mood;
    this.moodKey = key;
    const t = this.ctx.currentTime;
    if (this.track) {
      const old = this.track;
      const fadeT = mood === 'boss' || mood === 'silence' ? 0.6 : 1.6;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fadeT);
      old.stop(t + fadeT + 0.1);
      this.old.push(old);
      window.setTimeout(() => {
        this.old = this.old.filter((x) => x !== old);
        old.gain.disconnect();
      }, (fadeT + 0.5) * 1000);
    }
    this.track = mood === 'silence' ? null : this.makeTrack(mood, opts);
    if (this.track) {
      const g = this.track.gain.gain;
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(1, t + (mood === 'boss' || mood === 'victory' ? 0.3 : 2));
    }
  }

  get currentMood() {
    return this.mood;
  }

  /** Called every animation frame: schedule notes slightly ahead of time. */
  update() {
    const ctx = this.ctx;
    if (!ctx || !this.track) return;
    const tr = this.track;
    const ahead = ctx.currentTime + 0.2;
    if (tr.next < ctx.currentTime - 1) tr.next = ctx.currentTime + 0.05; // after a suspend
    while (tr.next < ahead) {
      tr.play(tr.i, tr.next);
      tr.i++;
      tr.next += tr.beat;
    }
  }

  private rand() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  // instruments ---------------------------------------------------------
  private pad(dest: AudioNode, t: number, notes: number[], dur: number, vol: number, bright = 900, type: OscillatorType = 'sawtooth') {
    const ctx = this.ctx!;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = bright;
    flt.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(vol * 0.8, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
    flt.connect(g).connect(dest);
    for (const m of notes) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(flt);
        o.start(t);
        o.stop(t + dur * 1.1);
      }
    }
  }

  private choir(dest: AudioNode, t: number, notes: number[], dur: number, vol: number) {
    this.choirSfx(dest, t, notes.map(mtof), dur, vol);
  }

  private pluck(dest: AudioNode, t: number, m: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mtof(m);
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = mtof(m);
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(3000, t);
    flt.frequency.exponentialRampToValueAtTime(400, t + 0.4);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.004, 1.2);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(flt);
    o2.connect(g2).connect(flt);
    flt.connect(g).connect(dest);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.3);
    o2.stop(t + 1.3);
  }

  private drum(dest: AudioNode, t: number, vol: number, pitch = 1) {
    this.tone(dest, t, { f: 130 * pitch, f2: 42 * pitch, dur: 0.45, vol, type: 'sine' });
    this.noiseHit(dest, t, { type: 'lowpass', f: 900, f2: 120, dur: 0.12, vol: vol * 0.5 });
  }

  private frame(dest: AudioNode, t: number, vol: number) {
    this.noiseHit(dest, t, { f: 1800, q: 1.2, dur: 0.12, vol });
    this.tone(dest, t, { f: 210, f2: 150, dur: 0.08, vol: vol * 0.4, type: 'triangle' });
  }

  private bass(dest: AudioNode, t: number, m: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(600, t);
    flt.frequency.exponentialRampToValueAtTime(140, t + dur);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.01, dur);
    o.connect(flt).connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private organ(dest: AudioNode, t: number, notes: number[], dur: number, vol: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.4);
    g.gain.setValueAtTime(vol, t + dur - 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(dest);
    for (const m of notes)
      for (const [h, a] of [
        [1, 1],
        [2, 0.5],
        [3, 0.25],
        [4, 0.18],
        [0.5, 0.4],
      ] as [number, number][]) {
        const o = ctx.createOscillator();
        o.frequency.value = mtof(m) * h;
        const og = ctx.createGain();
        og.gain.value = a / notes.length;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
  }

  /** Continuous filtered-noise bed (wind, rain, hearth). */
  private bed(dest: AudioNode, t: number, type: BiquadFilterType, f: number, vol: number, lfo: number): AudioScheduledSourceNode[] {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = vol;
    const l = ctx.createOscillator();
    l.frequency.value = lfo;
    const lg = ctx.createGain();
    lg.gain.value = f * 0.5;
    l.connect(lg).connect(flt.frequency);
    src.connect(flt).connect(g).connect(dest);
    src.start(t);
    l.start(t);
    return [src, l];
  }

  // compositions --------------------------------------------------------
  private makeTrack(mood: Mood, o: MoodOpts): Track {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.connect(this.music);
    const rev = ctx.createGain();
    rev.gain.value = 0.9;
    gain.connect(rev).connect(this.revSend);
    const sustained: AudioScheduledSourceNode[] = [];
    const t0 = ctx.currentTime + 0.1;
    const tr: Track = {
      key: mood,
      gain,
      beat: 1,
      next: t0,
      i: 0,
      sustained,
      play: () => undefined,
      stop: (t) => {
        for (const s of sustained) {
          try {
            s.stop(t);
          } catch {
            /* already stopped */
          }
        }
      },
    };
    const d = gain;
    const scene = o.scene ?? 'rynek';
    const root = scene === 'ogrod' ? 52 : scene === 'katedra' ? 49 : scene === 'krypta' ? 45 : 50; // E3 / C#3 / A2 / D3
    switch (mood) {
      case 'title': {
        tr.beat = 1;
        const chords = [
          [50, 53, 57],
          [46, 50, 53],
          [43, 46, 50],
          [45, 49, 52],
        ];
        const motif = [69, 65, 64, 62, 65, 64, 60, 62];
        tr.play = (i, t) => {
          const bar = Math.floor(i / 4) % 4;
          if (i % 4 === 0) {
            this.pad(d, t, chords[bar], 4.2, 0.05, 700);
            this.choir(d, t, chords[bar].map((m) => m + 12), 4, 0.018);
          }
          if (i % 8 === 0) this.bell(d, t, mtof(38), 0.12, 6);
          if (i % 2 === 1 && this.rand() < 0.7) this.bell(d, t, mtof(motif[(i >> 1) % motif.length] + 12), 0.03, 2.5);
        };
        sustained.push(...this.bed(d, t0, 'bandpass', 500, 0.04, 0.07));
        break;
      }
      case 'hub': {
        tr.beat = 0.42;
        const prog = [
          [57, 60, 64],
          [53, 57, 60],
          [48, 52, 55],
          [55, 59, 62],
        ];
        tr.play = (i, t) => {
          const bar = Math.floor(i / 8) % 4;
          const ch = prog[bar];
          if (i % 8 === 0) this.pad(d, t, ch.map((m) => m - 12), 8 * tr.beat, 0.035, 600, 'triangle');
          const arp = [0, 1, 2, 1, 2, 0, 1, 2];
          if (this.rand() < 0.85) this.pluck(d, t, ch[arp[i % 8]] + (i % 16 >= 8 ? 12 : 0), 0.05);
          if (i % 32 === 28) this.bell(d, t, mtof(81), 0.02, 3);
        };
        sustained.push(...this.bed(d, t0, 'highpass', 3500, 0.012, 2.3)); // hearth crackle hiss
        break;
      }
      case 'explore': {
        tr.beat = 1.15;
        const scale = scene === 'ogrod' ? [0, 1, 3, 5, 7, 8, 10] : scene === 'katedra' ? [0, 2, 3, 5, 7, 8, 11] : [0, 2, 3, 5, 7, 8, 10];
        tr.play = (i, t) => {
          if (i % 8 === 0) {
            if (scene === 'katedra') this.organ(d, t, [root - 12, root - 5, root + 3], 8 * tr.beat, 0.05);
            else this.pad(d, t, [root - 12, root - 5], 8 * tr.beat, 0.05, 420);
          }
          if (i % 16 === 8) this.pad(d, t, [root + (scene === 'ogrod' ? 1 : 3), root + 7], 7 * tr.beat, 0.025, 800);
          if (this.rand() < 0.38) {
            const m = root + 12 + scale[Math.floor(this.rand() * scale.length)];
            if (scene === 'ogrod') this.pluck(d, t, m, 0.04);
            else this.bell(d, t, mtof(m + 12), 0.025, 2.5);
          }
          if (i % 32 === 0) this.bell(d, t, mtof(root - 12), 0.06, 6);
        };
        sustained.push(...this.bed(d, t0, 'bandpass', scene === 'katedra' ? 300 : 520, 0.05, 0.05));
        if (scene === 'ogrod') sustained.push(...this.bed(d, t0, 'highpass', 5000, 0.03, 0.3));
        break;
      }
      case 'tension': {
        tr.beat = 0.6;
        tr.play = (i, t) => {
          if (i % 2 === 0) {
            this.drum(d, t, 0.18, 0.8);
            this.drum(d, t + 0.16, 0.1, 0.7);
          }
          if (i % 8 === 0) this.pad(d, t, [root - 12, root - 11], 8 * tr.beat, 0.04, 500);
          if (i % 4 === 0) this.bass(d, t, root - 24 + (i % 16 === 12 ? 1 : 0), tr.beat * 3.5, 0.08);
          if (i % 2 === 1) this.pad(d, t, [root + 12, root + 13], tr.beat * 0.9, 0.012, 2400);
        };
        sustained.push(...this.bed(d, t0, 'bandpass', 380, 0.05, 0.11));
        break;
      }
      case 'boss': {
        const b = o.boss ?? 'kat';
        const p2 = (o.phase ?? 1) >= 2;
        const r = b === 'pasterz' ? 52 : b === 'dzwon' ? 49 : 50;
        tr.beat = b === 'pasterz' ? 0.5 : p2 ? 0.43 : 0.47;
        const chords = b === 'pasterz' ? [[0, 4, 8], [2, 6, 10], [0, 4, 8], [-2, 2, 6]] : [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-5, -1, 2]];
        const bassLine = b === 'pasterz' ? [0, 0, 2, 0, 4, 0, 2, -2] : [0, 0, 0, -4, 0, 0, -5, -1];
        tr.play = (i, t) => {
          const step = i % 16;
          const bar = Math.floor(i / 16) % 4;
          const drums = b === 'pasterz' ? [0, 6, 10] : [0, 3, 6, 8, 11, 14];
          if (drums.includes(step)) this.drum(d, t, (b === 'kat' ? 0.34 : 0.26) * (step === 0 ? 1.2 : 1), b === 'kat' ? 0.85 : 1);
          if (step === 4 || step === 12) this.frame(d, t, 0.14);
          if (p2 && step % 2 === 1) this.frame(d, t, 0.06);
          if (i % 2 === 0) this.bass(d, t, r - 24 + bassLine[(i >> 1) % 8], tr.beat * 1.8, 0.1);
          if (step === 0) {
            const ch = chords[bar].map((x) => r + x);
            this.choir(d, t, ch.map((m) => m + (p2 ? 12 : 0)), 16 * tr.beat, 0.022);
            this.pad(d, t, ch, 16 * tr.beat, 0.03, p2 ? 1600 : 1000);
          }
          if ((b === 'dzwon' && step === 0) || (step === 0 && bar % 2 === 0)) this.bell(d, t, mtof(r - 12), b === 'dzwon' ? 0.12 : 0.07, 4);
          if (b === 'dzwon' && p2 && step === 8) this.bell(d, t, mtof(r - 5), 0.06, 3);
          if (b === 'pasterz' && step % 4 === 2 && this.rand() < 0.6) this.bell(d, t, mtof(r + 24 + [0, 4, 8, 10][Math.floor(this.rand() * 4)]), 0.02, 2);
        };
        break;
      }
      case 'victory': {
        tr.beat = 0.8;
        tr.play = (i, t) => {
          if (i === 0) {
            this.choir(d, t, [62, 66, 69, 74], 6, 0.03);
            this.pad(d, t, [50, 57, 62, 66], 6, 0.05, 1200);
            for (let k = 0; k < 4; k++) this.bell(d, t + k * 0.3, mtof([74, 78, 81, 86][k]), 0.05, 4);
          }
          if (i === 6) this.bell(d, t, mtof(50), 0.1, 6);
        };
        break;
      }
      case 'ending': {
        tr.beat = 1.2;
        const prog = [
          [50, 54, 57],
          [47, 50, 54],
          [43, 47, 50],
          [45, 49, 52],
        ];
        tr.play = (i, t) => {
          const ch = prog[Math.floor(i / 4) % 4];
          if (i % 4 === 0) {
            this.pad(d, t, ch, 4 * tr.beat + 0.5, 0.045, 900);
            this.choir(d, t, ch.map((m) => m + 12), 4 * tr.beat, 0.02);
          }
          if (this.rand() < 0.5) this.bell(d, t, mtof(ch[Math.floor(this.rand() * 3)] + 24), 0.025, 3);
        };
        break;
      }
    }
    return tr;
  }
}

export const audio = new AudioEngine();
