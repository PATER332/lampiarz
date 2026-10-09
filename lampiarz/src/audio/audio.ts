// All sound is synthesised locally with the Web Audio API — no audio files.
// The context is created lazily on the first user gesture (autoplay policy).

import type { Fx } from '../game/types';

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

type Sfx =
  | 'step'
  | 'bump'
  | 'swing'
  | 'hit'
  | 'hurt'
  | 'death'
  | 'light'
  | 'brazier'
  | 'lighthouse'
  | 'snuff'
  | 'oil'
  | 'embers'
  | 'flare'
  | 'hammer'
  | 'fire'
  | 'spawn'
  | 'gateOpen'
  | 'gateClose'
  | 'lunge'
  | 'pulse'
  | 'deny'
  | 'click'
  | 'hover'
  | 'heal'
  | 'victory'
  | 'defeat'
  | 'achievement'
  | 'page';

const PENTA = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0]; // D minor pentatonic-ish

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private settings: AudioSettings = { master: 0.8, music: 0.55, sfx: 0.8, muted: false };
  private musicOn = false;
  private droneFilter: BiquadFilterNode | null = null;
  private intensity = 0;
  private lastStep = 0;

  get ready() {
    return !!this.ctx;
  }

  /** Must be called from a user gesture handler. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    if (!this.musicOn) this.startMusic();
  }

  private build() {
    const c = this.ctx!;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = c.createGain();
    this.master.connect(comp);
    comp.connect(c.destination);
    this.musicBus = c.createGain();
    this.sfxBus = c.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    // generated reverb impulse
    this.reverb = c.createConvolver();
    const len = Math.floor(c.sampleRate * 2.4);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb.buffer = ir;
    this.reverbSend = c.createGain();
    this.reverbSend.gain.value = 0.28;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);
    // noise
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.apply();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend().catch(() => undefined);
      else void this.ctx.resume().catch(() => undefined);
    });
  }

  configure(s: AudioSettings) {
    this.settings = { ...s };
    this.apply();
  }

  private apply() {
    if (!this.ctx) return;
    const s = this.settings;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, now, 0.05);
    this.musicBus.gain.setTargetAtTime(s.music * 0.6, now, 0.1);
    this.sfxBus.gain.setTargetAtTime(s.sfx, now, 0.05);
  }

  /** 0..1 — raises the drone's brightness when danger is near. */
  setIntensity(v: number) {
    this.intensity = Math.max(0, Math.min(1, v));
    if (this.ctx && this.droneFilter) this.droneFilter.frequency.setTargetAtTime(260 + this.intensity * 520, this.ctx.currentTime, 1.2);
  }

  // ------------------------------------------------------------------ primitives
  private env(g: GainNode, t: number, a: number, peak: number, dec: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  private tone(freq: number, opts: { type?: OscillatorType; t?: number; a?: number; dec?: number; gain?: number; to?: number; rev?: number; detune?: number } = {}) {
    const c = this.ctx!;
    const t = c.currentTime + (opts.t ?? 0);
    const o = c.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.detune) o.detune.value = opts.detune;
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + (opts.a ?? 0.01) + (opts.dec ?? 0.2));
    const g = c.createGain();
    this.env(g, t, opts.a ?? 0.005, opts.gain ?? 0.2, opts.dec ?? 0.2);
    o.connect(g);
    g.connect(this.sfxBus);
    if (opts.rev) {
      const s = c.createGain();
      s.gain.value = opts.rev;
      g.connect(s);
      s.connect(this.reverbSend);
    }
    o.start(t);
    o.stop(t + (opts.a ?? 0.005) + (opts.dec ?? 0.2) + 0.05);
  }

  private noise(opts: { t?: number; a?: number; dec?: number; gain?: number; type?: BiquadFilterType; f?: number; fTo?: number; q?: number; rev?: number }) {
    const c = this.ctx!;
    const t = c.currentTime + (opts.t ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.f ?? 1000, t);
    if (opts.fTo) f.frequency.exponentialRampToValueAtTime(opts.fTo, t + (opts.a ?? 0.01) + (opts.dec ?? 0.2));
    f.Q.value = opts.q ?? 1;
    const g = c.createGain();
    this.env(g, t, opts.a ?? 0.005, opts.gain ?? 0.2, opts.dec ?? 0.2);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    if (opts.rev) {
      const s = c.createGain();
      s.gain.value = opts.rev;
      g.connect(s);
      s.connect(this.reverbSend);
    }
    src.start(t, Math.random() * 0.5);
    src.stop(t + (opts.a ?? 0.005) + (opts.dec ?? 0.2) + 0.05);
  }

  private bell(freq: number, t = 0, gain = 0.12, dec = 1.4) {
    this.tone(freq, { t, gain, dec, rev: 0.8 });
    this.tone(freq * 2.01, { t, gain: gain * 0.35, dec: dec * 0.6, rev: 0.6 });
    this.tone(freq * 3.02, { t, gain: gain * 0.15, dec: dec * 0.35, rev: 0.5 });
  }

  // ------------------------------------------------------------------ sfx
  play(name: Sfx) {
    if (!this.ctx || this.settings.muted) return;
    const r = () => 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'step': {
        const now = performance.now();
        if (now - this.lastStep < 60) return;
        this.lastStep = now;
        this.noise({ f: 900 * r(), q: 2, gain: 0.07, dec: 0.06 });
        this.tone(90 * r(), { gain: 0.05, dec: 0.05 });
        break;
      }
      case 'bump':
        this.tone(70, { gain: 0.12, dec: 0.1, to: 50 });
        break;
      case 'swing':
        this.noise({ type: 'highpass', f: 900, fTo: 3000, gain: 0.08, a: 0.03, dec: 0.1 });
        break;
      case 'hit':
        this.noise({ f: 1800 * r(), q: 1.5, gain: 0.16, dec: 0.08 });
        this.tone(420 * r(), { type: 'triangle', to: 120, gain: 0.12, dec: 0.14 });
        break;
      case 'hurt':
        this.tone(140, { type: 'square', to: 55, gain: 0.12, dec: 0.25 });
        this.noise({ type: 'lowpass', f: 600, gain: 0.25, dec: 0.2 });
        break;
      case 'death':
        this.noise({ f: 1400, fTo: 180, q: 4, gain: 0.16, a: 0.02, dec: 0.55, rev: 0.6 });
        this.tone(660 * r(), { gain: 0.04, dec: 0.6, rev: 0.8 });
        break;
      case 'light':
        this.noise({ f: 400, fTo: 2400, q: 1.2, gain: 0.12, a: 0.05, dec: 0.25 });
        this.bell(587.33 * (Math.random() < 0.5 ? 1 : 1.122), 0.05, 0.08);
        break;
      case 'brazier':
        this.noise({ type: 'lowpass', f: 300, fTo: 1800, gain: 0.25, a: 0.08, dec: 0.5, rev: 0.4 });
        this.bell(293.66, 0.08, 0.12, 2);
        this.bell(440, 0.2, 0.08, 1.8);
        break;
      case 'lighthouse':
        this.noise({ type: 'lowpass', f: 200, fTo: 3000, gain: 0.3, a: 0.2, dec: 1.2, rev: 0.6 });
        [293.66, 369.99, 440, 587.33, 739.99].forEach((f, i) => this.bell(f, 0.15 + i * 0.12, 0.1, 2.6));
        break;
      case 'snuff':
        this.noise({ type: 'highpass', f: 3000, fTo: 600, gain: 0.12, a: 0.02, dec: 0.4 });
        this.tone(220, { to: 110, gain: 0.05, dec: 0.4, rev: 0.4 });
        break;
      case 'oil':
        this.tone(320, { to: 180, gain: 0.12, dec: 0.12 });
        this.tone(260, { t: 0.1, to: 150, gain: 0.1, dec: 0.14 });
        break;
      case 'embers':
        this.tone(1318.5, { gain: 0.05, dec: 0.25, rev: 0.4 });
        this.tone(1760, { t: 0.05, gain: 0.04, dec: 0.25, rev: 0.4 });
        break;
      case 'flare':
        this.noise({ f: 300, fTo: 4000, q: 0.7, gain: 0.22, a: 0.05, dec: 0.45, rev: 0.5 });
        this.bell(880, 0.03, 0.06, 1);
        break;
      case 'hammer':
        this.tone(110, { type: 'square', to: 40, gain: 0.2, dec: 0.25 });
        this.noise({ type: 'lowpass', f: 1200, gain: 0.35, dec: 0.18, rev: 0.4 });
        this.bell(1046, 0.0, 0.05, 0.6);
        break;
      case 'fire':
        this.noise({ type: 'lowpass', f: 500, fTo: 2500, gain: 0.25, a: 0.1, dec: 0.6, rev: 0.3 });
        break;
      case 'spawn':
        this.tone(70, { type: 'sawtooth', to: 48, gain: 0.05, a: 0.2, dec: 0.6, rev: 0.6 });
        break;
      case 'gateOpen':
        [293.66, 440, 587.33].forEach((f, i) => this.bell(f, i * 0.09, 0.1, 2));
        this.noise({ type: 'lowpass', f: 300, gain: 0.15, dec: 0.5 });
        break;
      case 'gateClose':
        this.tone(98, { type: 'square', gain: 0.1, dec: 0.4, rev: 0.5 });
        this.tone(103.8, { type: 'square', gain: 0.08, dec: 0.4 });
        break;
      case 'lunge':
        this.noise({ type: 'highpass', f: 1500, fTo: 5000, gain: 0.12, a: 0.02, dec: 0.18 });
        break;
      case 'pulse':
        this.tone(55, { type: 'sine', to: 30, gain: 0.4, a: 0.05, dec: 1.2, rev: 0.6 });
        this.noise({ type: 'lowpass', f: 2000, fTo: 100, gain: 0.25, a: 0.3, dec: 0.8, rev: 0.6 });
        break;
      case 'deny':
        this.tone(160, { type: 'triangle', gain: 0.08, dec: 0.07 });
        this.tone(130, { type: 'triangle', t: 0.08, gain: 0.08, dec: 0.09 });
        break;
      case 'click':
        this.tone(1200, { type: 'triangle', gain: 0.04, dec: 0.03 });
        break;
      case 'hover':
        this.tone(1800, { gain: 0.012, dec: 0.02 });
        break;
      case 'page':
        this.noise({ type: 'bandpass', f: 2500, q: 0.6, gain: 0.05, a: 0.02, dec: 0.12 });
        break;
      case 'heal':
        [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, { t: i * 0.06, gain: 0.05, dec: 0.4, rev: 0.6 }));
        break;
      case 'victory':
        [293.66, 369.99, 440, 587.33, 739.99, 880].forEach((f, i) => this.bell(f, i * 0.16, 0.11, 2.8));
        break;
      case 'defeat':
        [293.66, 261.63, 220, 174.61].forEach((f, i) => this.bell(f, i * 0.28, 0.1, 2.2));
        this.tone(55, { gain: 0.2, a: 0.3, dec: 2, rev: 0.5 });
        break;
      case 'achievement':
        [880, 1108.73, 1318.5, 1760].forEach((f, i) => this.tone(f, { t: i * 0.07, gain: 0.05, dec: 0.5, rev: 0.7 }));
        break;
    }
  }

  playFx(list: Fx[], cls: string) {
    if (!this.ctx) return;
    let embersPlayed = false;
    for (const f of list) {
      switch (f.k) {
        case 'step':
          this.play('step');
          break;
        case 'bump':
          this.play('bump');
          break;
        case 'attack':
          if (f.from === -1) this.play('swing');
          break;
        case 'hit':
          this.play(f.target === 'player' ? 'hurt' : 'hit');
          break;
        case 'death':
          this.play('death');
          break;
        case 'light':
          this.play(f.kind === 'lamp' ? 'light' : f.kind === 'brazier' ? 'brazier' : 'lighthouse');
          break;
        case 'snuff':
        case 'drain':
          this.play('snuff');
          break;
        case 'pickup':
          if (f.kind === 'oil') this.play('oil');
          else if (!embersPlayed) {
            this.play('embers');
            embersPlayed = true;
          }
          break;
        case 'flare':
          this.play(cls === 'kowalka' ? 'hammer' : cls === 'alchemik' ? 'fire' : 'flare');
          break;
        case 'spawn':
          if (f.visible) this.play('spawn');
          break;
        case 'gate':
          this.play(f.open ? 'gateOpen' : 'gateClose');
          break;
        case 'lunge':
          this.play('lunge');
          break;
        case 'pulse':
          this.play('pulse');
          break;
        case 'deny':
          this.play('deny');
          break;
        case 'heal':
          this.play('heal');
          break;
        case 'complete':
          this.play('gateOpen');
          break;
        case 'victory':
          this.play('victory');
          break;
        case 'defeat':
          this.play('defeat');
          break;
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------------ music
  private startMusic() {
    const c = this.ctx;
    if (!c || this.musicOn) return;
    this.musicOn = true;
    // drone
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 260;
    filt.Q.value = 0.8;
    this.droneFilter = filt;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.09, c.currentTime + 4);
    for (const [f, det] of [
      [73.42, -6],
      [73.42, 7],
      [110, 3],
    ] as const) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(filt);
      o.start();
    }
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoG = c.createGain();
    lfoG.gain.value = 70;
    lfo.connect(lfoG);
    lfoG.connect(filt.frequency);
    lfo.start();
    filt.connect(g);
    g.connect(this.musicBus);
    // wind
    const wind = c.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    const wf = c.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 500;
    wf.Q.value = 0.6;
    const wg = c.createGain();
    wg.gain.value = 0.025;
    const wl = c.createOscillator();
    wl.frequency.value = 0.08;
    const wlg = c.createGain();
    wlg.gain.value = 300;
    wl.connect(wlg);
    wlg.connect(wf.frequency);
    wl.start();
    wind.connect(wf);
    wf.connect(wg);
    wg.connect(this.musicBus);
    wind.start();
    // sparse bells
    const schedule = () => {
      if (!this.ctx) return;
      const ctx = this.ctx;
      if (ctx.state === 'running') {
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const f = PENTA[Math.floor(Math.random() * PENTA.length)] * (Math.random() < 0.3 ? 2 : 1);
          const t = ctx.currentTime + i * (0.4 + Math.random() * 0.6);
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = f;
          const og = ctx.createGain();
          og.gain.setValueAtTime(0.0001, t);
          og.gain.exponentialRampToValueAtTime(0.035, t + 0.02);
          og.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
          o.connect(og);
          og.connect(this.musicBus);
          const s = ctx.createGain();
          s.gain.value = 1.2;
          og.connect(s);
          s.connect(this.reverbSend);
          o.start(t);
          o.stop(t + 3.6);
        }
        if (this.intensity > 0.55) {
          // low heartbeat
          for (const off of [0, 0.28]) {
            const t = ctx.currentTime + off;
            const o = ctx.createOscillator();
            o.frequency.setValueAtTime(62, t);
            o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
            const og = ctx.createGain();
            og.gain.setValueAtTime(0.0001, t);
            og.gain.exponentialRampToValueAtTime(0.12 * this.intensity, t + 0.02);
            og.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
            o.connect(og);
            og.connect(this.musicBus);
            o.start(t);
            o.stop(t + 0.3);
          }
        }
      }
      window.setTimeout(schedule, 2600 + Math.random() * 3800);
    };
    window.setTimeout(schedule, 1500);
  }
}

export const audio = new AudioEngine();
export type { Sfx };
