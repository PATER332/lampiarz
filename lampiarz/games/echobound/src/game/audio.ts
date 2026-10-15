import type { Settings } from './types';
import type { Theme } from './types';

export type Sfx =
  | 'jump' | 'land' | 'crystal' | 'bigCrystal' | 'plateOn' | 'plateOff' | 'lever' | 'doorOpen' | 'doorClose'
  | 'recStart' | 'recStop' | 'summon' | 'echoFade' | 'echoEaten' | 'hurt' | 'death' | 'checkpoint' | 'secret'
  | 'shadowAlert' | 'guardianStep' | 'devourer' | 'stomp' | 'uiHover' | 'uiClick' | 'levelDone' | 'victory'
  | 'crumble' | 'respawn' | 'upgrade' | 'denied' | 'tick' | 'splash' | 'latch' | 'awakening'
  | 'spring' | 'portal' | 'prism' | 'key' | 'snap' | 'wraith' | 'veil' | 'lift'
  | 'dash' | 'blink' | 'anchor' | 'wallKick' | 'swap' | 'unlock' | 'cage' | 'waterDrip'
  | 'bossRoar' | 'bossTelegraph' | 'bossHit' | 'bossBreak' | 'bossImpact';

type Wave = OscillatorType;

interface ToneOpts {
  type?: Wave; f0: number; f1?: number; dur: number; vol?: number; delay?: number; attack?: number;
  detune?: number; filter?: { type: BiquadFilterType; f0: number; f1?: number; q?: number };
}
interface NoiseOpts {
  dur: number; vol?: number; delay?: number; attack?: number;
  filter?: { type: BiquadFilterType; f0: number; f1?: number; q?: number };
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private ambGain!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private settings: Settings = { master: 0.8, sfx: 0.9, ambient: 0.6, music: 0.7, muted: false, touch: 'auto', shake: true };
  private ambientNodes: AudioNode[] = [];
  private ambientTimer: number | null = null;
  private ambientTheme: Theme | null = null;
  private crystalCombo = 0;
  private lastCrystal = 0;
  // procedural horror score
  private musicGain!: GainNode;
  private musicBus: GainNode | null = null;
  private musicNodes: AudioNode[] = [];
  private musicTimer: number | null = null;
  private musicTheme: Theme | null = null;
  private tensionGain: GainNode | null = null;
  private tension = 0;
  private nextBeat = 0;
  private nextNote = 0;
  private nextSwell = 0;
  private nextEvent = 0;
  private lastPlay: Partial<Record<Sfx, number>> = {};

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.sfxGain = c.createGain();
    this.ambGain = c.createGain();
    this.musicGain = c.createGain();
    this.sfxGain.connect(this.master);
    this.ambGain.connect(this.master);
    this.musicGain.connect(this.master);
    this.master.connect(c.destination);
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = w * 0.6 + last * 3;
    }
    this.applySettings(this.settings);
    if (this.ambientTheme) this.startAmbient(this.ambientTheme);
    if (this.musicTheme) {
      const theme = this.musicTheme;
      this.musicTheme = null;
      this.startMusic(theme);
    }
  }

  get ready() { return !!this.ctx; }

  applySettings(s: Settings) {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.ambGain.gain.setTargetAtTime(s.ambient * 0.5, t, 0.05);
    this.musicGain.gain.setTargetAtTime((s.music ?? 0.7) * 0.6, t, 0.05);
  }

  /* --------------------------- primitives --------------------------- */
  private tone(o: ToneOpts, dest?: AudioNode) {
    const c = this.ctx;
    if (!c) return;
    const t0 = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain();
    const vol = o.vol ?? 0.2;
    const atk = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node: AudioNode = osc;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = o.filter.type;
      f.frequency.setValueAtTime(o.filter.f0, t0);
      if (o.filter.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(1, o.filter.f1), t0 + o.dur);
      f.Q.value = o.filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(dest ?? this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  private noise(o: NoiseOpts, dest?: AudioNode) {
    const c = this.ctx;
    if (!c || !this.noiseBuf) return;
    const t0 = c.currentTime + (o.delay ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const g = c.createGain();
    const vol = o.vol ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node: AudioNode = src;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = o.filter.type;
      f.frequency.setValueAtTime(o.filter.f0, t0);
      if (o.filter.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(1, o.filter.f1), t0 + o.dur);
      f.Q.value = o.filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(dest ?? this.sfxGain);
    src.start(t0);
    src.stop(t0 + o.dur + 0.05);
  }

  /* ------------------------------ sfx ------------------------------- */
  play(name: Sfx) {
    if (!this.ctx) return;
    const now = performance.now();
    const last = this.lastPlay[name] ?? 0;
    if (now - last < 35) return;
    this.lastPlay[name] = now;
    switch (name) {
      case 'jump':
        this.tone({ type: 'square', f0: 240, f1: 520, dur: 0.14, vol: 0.08 });
        this.tone({ type: 'sine', f0: 320, f1: 640, dur: 0.1, vol: 0.06 });
        break;
      case 'land':
        this.noise({ dur: 0.09, vol: 0.14, filter: { type: 'lowpass', f0: 500, f1: 150 } });
        this.tone({ type: 'sine', f0: 120, f1: 60, dur: 0.08, vol: 0.1 });
        break;
      case 'bossRoar':
        this.tone({ type: 'sawtooth', f0: 88, f1: 31, dur: 1.35, vol: 0.22, attack: 0.24, filter: { type: 'lowpass', f0: 480, f1: 90, q: 3 } });
        this.noise({ dur: 1.1, vol: 0.17, attack: 0.18, filter: { type: 'bandpass', f0: 190, f1: 80, q: 2 } });
        this.tone({ type: 'sine', f0: 41, f1: 27, dur: 1.8, vol: 0.18, delay: 0.12 });
        break;
      case 'bossTelegraph':
        this.tone({ type: 'sine', f0: 112, f1: 168, dur: 0.38, vol: 0.13 });
        this.tone({ type: 'sawtooth', f0: 224, f1: 337, dur: 0.32, vol: 0.07, delay: 0.08, filter: { type: 'lowpass', f0: 560 } });
        break;
      case 'bossHit':
        this.noise({ dur: 0.13, vol: 0.18, filter: { type: 'bandpass', f0: 680, f1: 170, q: 2 } });
        this.tone({ type: 'square', f0: 170, f1: 65, dur: 0.2, vol: 0.12 });
        this.tone({ type: 'triangle', f0: 880, f1: 330, dur: 0.18, vol: 0.05, delay: 0.025 });
        break;
      case 'bossBreak':
        this.noise({ dur: 0.9, vol: 0.2, attack: 0.04, filter: { type: 'lowpass', f0: 1600, f1: 100 } });
        this.tone({ type: 'sawtooth', f0: 180, f1: 36, dur: 1.1, vol: 0.16, attack: 0.02, filter: { type: 'lowpass', f0: 520, f1: 80 } });
        [392, 523, 784].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.55, vol: 0.07, delay: 0.25 + i * 0.09 }));
        break;
      case 'bossImpact':
        this.noise({ dur: 0.28, vol: 0.25, filter: { type: 'lowpass', f0: 220, f1: 60 } });
        this.tone({ type: 'sine', f0: 55, f1: 28, dur: 0.34, vol: 0.22 });
        this.tone({ type: 'square', f0: 90, f1: 45, dur: 0.2, vol: 0.08, delay: 0.04 });
        break;
      case 'waterDrip':
        this.tone({ type: 'sine', f0: 1260, f1: 540, dur: 0.13, vol: 0.025 });
        this.tone({ type: 'sine', f0: 1760, f1: 900, dur: 0.09, vol: 0.012, delay: 0.035 });
        break;
      case 'crystal': {
        if (now - this.lastCrystal < 1800) this.crystalCombo = Math.min(this.crystalCombo + 1, 8); else this.crystalCombo = 0;
        this.lastCrystal = now;
        const base = 880 * Math.pow(1.0595, this.crystalCombo * 2);
        this.tone({ type: 'sine', f0: base, dur: 0.35, vol: 0.14 });
        this.tone({ type: 'triangle', f0: base * 1.5, dur: 0.25, vol: 0.06, delay: 0.03 });
        this.tone({ type: 'sine', f0: base * 2, dur: 0.5, vol: 0.04, delay: 0.05 });
        break;
      }
      case 'bigCrystal':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.5, vol: 0.1, delay: i * 0.07 }));
        this.noise({ dur: 0.6, vol: 0.05, filter: { type: 'highpass', f0: 3000 } });
        break;
      case 'plateOn':
        this.noise({ dur: 0.04, vol: 0.15, filter: { type: 'bandpass', f0: 1200, q: 2 } });
        this.tone({ type: 'sine', f0: 330, f1: 220, dur: 0.12, vol: 0.14 });
        this.tone({ type: 'triangle', f0: 660, dur: 0.2, vol: 0.05, delay: 0.05 });
        break;
      case 'plateOff':
        this.tone({ type: 'sine', f0: 220, f1: 300, dur: 0.1, vol: 0.08 });
        break;
      case 'lever':
        [0, 0.05, 0.1].forEach((d) => this.noise({ dur: 0.03, vol: 0.12, delay: d, filter: { type: 'bandpass', f0: 2000, q: 3 } }));
        this.tone({ type: 'triangle', f0: 440, f1: 660, dur: 0.25, vol: 0.1, delay: 0.14 });
        break;
      case 'latch':
        this.tone({ type: 'square', f0: 180, f1: 90, dur: 0.3, vol: 0.1 });
        [660, 880, 1320].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.4, vol: 0.08, delay: 0.2 + i * 0.08 }));
        break;
      case 'doorOpen':
        this.noise({ dur: 0.7, vol: 0.18, attack: 0.1, filter: { type: 'lowpass', f0: 180, f1: 90 } });
        this.tone({ type: 'sine', f0: 70, f1: 45, dur: 0.7, vol: 0.14, attack: 0.1 });
        this.tone({ type: 'triangle', f0: 520, f1: 780, dur: 0.4, vol: 0.05, delay: 0.1 });
        break;
      case 'doorClose':
        this.noise({ dur: 0.35, vol: 0.16, filter: { type: 'lowpass', f0: 200, f1: 80 } });
        this.tone({ type: 'sine', f0: 60, f1: 40, dur: 0.3, vol: 0.14 });
        this.noise({ dur: 0.05, vol: 0.14, delay: 0.3, filter: { type: 'bandpass', f0: 900, q: 2 } });
        break;
      case 'recStart':
        this.tone({ type: 'sine', f0: 1200, dur: 0.06, vol: 0.1 });
        this.tone({ type: 'sine', f0: 1600, dur: 0.08, vol: 0.1, delay: 0.1 });
        break;
      case 'recStop':
        this.tone({ type: 'sine', f0: 1600, dur: 0.06, vol: 0.1 });
        this.tone({ type: 'sine', f0: 1100, dur: 0.1, vol: 0.1, delay: 0.08 });
        break;
      case 'summon':
        [392, 494, 587, 740, 880].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.45, vol: 0.09, delay: i * 0.06, detune: 5 }));
        this.noise({ dur: 0.6, vol: 0.08, attack: 0.1, filter: { type: 'highpass', f0: 800, f1: 4000 } });
        this.tone({ type: 'sine', f0: 196, f1: 392, dur: 0.5, vol: 0.08, attack: 0.1 });
        break;
      case 'spring':
        this.tone({ type: 'square', f0: 180, f1: 720, dur: 0.22, vol: 0.09 });
        this.tone({ type: 'sine', f0: 260, f1: 900, dur: 0.18, vol: 0.08, delay: 0.02 });
        this.noise({ dur: 0.08, vol: 0.08, filter: { type: 'bandpass', f0: 900, q: 2 } });
        break;
      case 'portal':
        this.tone({ type: 'sine', f0: 300, f1: 1200, dur: 0.35, vol: 0.09 });
        this.tone({ type: 'triangle', f0: 1200, f1: 300, dur: 0.35, vol: 0.06, delay: 0.1 });
        this.noise({ dur: 0.4, vol: 0.07, attack: 0.05, filter: { type: 'bandpass', f0: 1800, f1: 400, q: 3 } });
        break;
      case 'prism':
        [660, 880, 1320, 1760].forEach((f, i) => this.tone({ type: 'sine', f0: f, dur: 0.35, vol: 0.08, delay: i * 0.04 }));
        this.tone({ type: 'triangle', f0: 440, f1: 880, dur: 0.4, vol: 0.05 });
        this.noise({ dur: 0.3, vol: 0.04, filter: { type: 'highpass', f0: 5000 } });
        break;
      case 'key':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.3, vol: 0.08, delay: i * 0.07 }));
        this.tone({ type: 'sine', f0: 2349, dur: 0.5, vol: 0.03, delay: 0.25 });
        break;
      case 'snap':
        this.noise({ dur: 0.06, vol: 0.18, filter: { type: 'bandpass', f0: 1400, q: 2 } });
        this.tone({ type: 'square', f0: 220, f1: 90, dur: 0.12, vol: 0.09, delay: 0.03 });
        break;
      case 'wraith':
        this.tone({ type: 'sawtooth', f0: 160, f1: 70, dur: 0.5, vol: 0.05, filter: { type: 'lowpass', f0: 500, f1: 150 } });
        this.noise({ dur: 0.5, vol: 0.06, attack: 0.1, filter: { type: 'bandpass', f0: 500, f1: 200, q: 4 } });
        break;
      case 'veil':
        this.tone({ type: 'sine', f0: 900, f1: 200, dur: 0.3, vol: 0.07 });
        this.noise({ dur: 0.25, vol: 0.06, filter: { type: 'highpass', f0: 2500 } });
        break;
      case 'lift':
        this.tone({ type: 'square', f0: 110, f1: 140, dur: 0.18, vol: 0.05, filter: { type: 'lowpass', f0: 600 } });
        this.noise({ dur: 0.12, vol: 0.06, filter: { type: 'bandpass', f0: 700, q: 2 } });
        break;
      case 'dash':
        this.noise({ dur: 0.18, vol: 0.14, filter: { type: 'bandpass', f0: 1800, f1: 5200, q: 1.5 } });
        this.tone({ type: 'sawtooth', f0: 560, f1: 140, dur: 0.16, vol: 0.05, filter: { type: 'lowpass', f0: 2600, f1: 500 } });
        break;
      case 'blink':
        this.tone({ type: 'sine', f0: 1700, f1: 280, dur: 0.12, vol: 0.09 });
        this.tone({ type: 'sine', f0: 280, f1: 1900, dur: 0.18, vol: 0.09, delay: 0.1 });
        this.noise({ dur: 0.25, vol: 0.06, delay: 0.05, filter: { type: 'highpass', f0: 4000 } });
        break;
      case 'anchor':
        this.tone({ type: 'sine', f0: 230, f1: 110, dur: 0.3, vol: 0.12 });
        [523, 392, 330].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.4, vol: 0.06, delay: 0.05 + i * 0.07 }));
        this.noise({ dur: 0.2, vol: 0.05, filter: { type: 'bandpass', f0: 900, f1: 300, q: 3 } });
        break;
      case 'wallKick':
        this.noise({ dur: 0.08, vol: 0.12, filter: { type: 'bandpass', f0: 1200, q: 2 } });
        this.tone({ type: 'square', f0: 280, f1: 640, dur: 0.14, vol: 0.07 });
        break;
      case 'swap':
        [392, 523, 659, 784].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.3, vol: 0.07, delay: i * 0.05 }));
        this.noise({ dur: 0.3, vol: 0.05, attack: 0.05, filter: { type: 'highpass', f0: 3000, f1: 6000 } });
        break;
      case 'unlock':
        [392, 494, 587, 784, 988, 1175, 1568].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.9, vol: 0.08, delay: i * 0.09, attack: 0.03 }));
        [196, 247].forEach((f, i) => this.tone({ type: 'sine', f0: f, dur: 2.2, vol: 0.08, delay: 0.2 + i * 0.1, attack: 0.3 }));
        this.noise({ dur: 1.0, vol: 0.05, attack: 0.2, filter: { type: 'highpass', f0: 2500, f1: 7000 } });
        break;
      case 'cage':
        [0, 0.05, 0.11, 0.18].forEach((d) => this.noise({ dur: 0.05, vol: 0.12, delay: d, filter: { type: 'bandpass', f0: 1800 + d * 3000, q: 4 } }));
        this.tone({ type: 'square', f0: 140, f1: 70, dur: 0.3, vol: 0.07 });
        break;
      case 'awakening':
        this.tone({ type: 'sine', f0: 42, f1: 58, dur: 2.8, vol: 0.16, attack: 1.2 });
        this.tone({ type: 'triangle', f0: 110, f1: 220, dur: 2.2, vol: 0.045, delay: 0.4, attack: 0.9, filter: { type: 'lowpass', f0: 360, f1: 900 } });
        this.tone({ type: 'sine', f0: 440, f1: 660, dur: 1.6, vol: 0.025, delay: 1.8, attack: 0.8 });
        this.noise({ dur: 3, vol: 0.025, attack: 1.5, filter: { type: 'lowpass', f0: 180, f1: 500 } });
        break;
      case 'echoFade':
        [880, 740, 587, 494].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.3, vol: 0.05, delay: i * 0.07 }));
        this.noise({ dur: 0.4, vol: 0.04, filter: { type: 'highpass', f0: 4000, f1: 1000 } });
        break;
      case 'echoEaten':
        this.tone({ type: 'sawtooth', f0: 300, f1: 60, dur: 0.4, vol: 0.1, filter: { type: 'lowpass', f0: 1200, f1: 200 } });
        this.noise({ dur: 0.3, vol: 0.1, filter: { type: 'bandpass', f0: 600, f1: 150, q: 2 } });
        break;
      case 'hurt':
        this.noise({ dur: 0.2, vol: 0.18, filter: { type: 'lowpass', f0: 1500, f1: 300 } });
        this.tone({ type: 'sawtooth', f0: 220, f1: 70, dur: 0.25, vol: 0.1 });
        break;
      case 'death':
        [330, 277, 220, 165].forEach((f, i) => this.tone({ type: 'sawtooth', f0: f, f1: f * 0.7, dur: 0.6, vol: 0.08, delay: i * 0.18, filter: { type: 'lowpass', f0: 1200, f1: 200 } }));
        this.noise({ dur: 1.2, vol: 0.1, attack: 0.2, filter: { type: 'lowpass', f0: 600, f1: 60 } });
        break;
      case 'respawn':
        [220, 330, 440, 660].forEach((f, i) => this.tone({ type: 'sine', f0: f, dur: 0.4, vol: 0.08, delay: i * 0.08 }));
        break;
      case 'checkpoint':
        [440, 554, 659].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.8, vol: 0.08, delay: i * 0.05, attack: 0.05 }));
        this.tone({ type: 'sine', f0: 1318, dur: 0.6, vol: 0.05, delay: 0.2 });
        break;
      case 'secret':
        [523, 659, 784, 988, 1175, 1568].forEach((f, i) => this.tone({ type: 'sine', f0: f, dur: 0.35, vol: 0.09, delay: i * 0.06 }));
        this.noise({ dur: 0.5, vol: 0.04, delay: 0.1, filter: { type: 'highpass', f0: 5000 } });
        break;
      case 'shadowAlert':
        this.noise({ dur: 0.45, vol: 0.12, filter: { type: 'bandpass', f0: 700, f1: 1800, q: 4 } });
        this.tone({ type: 'sawtooth', f0: 90, f1: 140, dur: 0.3, vol: 0.05, filter: { type: 'lowpass', f0: 400 } });
        break;
      case 'guardianStep':
        this.tone({ type: 'sine', f0: 55, f1: 30, dur: 0.18, vol: 0.18 });
        this.noise({ dur: 0.1, vol: 0.1, filter: { type: 'lowpass', f0: 300 } });
        break;
      case 'devourer':
        this.tone({ type: 'sawtooth', f0: 85, f1: 60, dur: 0.5, vol: 0.07, filter: { type: 'bandpass', f0: 300, f1: 120, q: 3 } });
        this.tone({ type: 'sine', f0: 170, f1: 90, dur: 0.3, vol: 0.05, delay: 0.1 });
        break;
      case 'stomp':
        this.tone({ type: 'sine', f0: 320, f1: 90, dur: 0.12, vol: 0.14 });
        this.noise({ dur: 0.12, vol: 0.1, filter: { type: 'bandpass', f0: 500, q: 1 } });
        break;
      case 'crumble':
        this.noise({ dur: 0.3, vol: 0.14, filter: { type: 'lowpass', f0: 900, f1: 200 } });
        [0, 0.06, 0.13].forEach((d) => this.noise({ dur: 0.03, vol: 0.1, delay: d, filter: { type: 'bandpass', f0: 1500, q: 2 } }));
        break;
      case 'splash':
        this.noise({ dur: 0.4, vol: 0.16, filter: { type: 'lowpass', f0: 1200, f1: 300 } });
        this.tone({ type: 'sine', f0: 300, f1: 120, dur: 0.2, vol: 0.06 });
        break;
      case 'uiHover':
        this.tone({ type: 'sine', f0: 900, dur: 0.04, vol: 0.03 });
        break;
      case 'uiClick':
        this.tone({ type: 'triangle', f0: 660, f1: 880, dur: 0.08, vol: 0.06 });
        this.tone({ type: 'sine', f0: 1320, dur: 0.12, vol: 0.03, delay: 0.03 });
        break;
      case 'upgrade':
        [523, 659, 784, 1046].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.4, vol: 0.09, delay: i * 0.08 }));
        this.tone({ type: 'sine', f0: 2093, dur: 0.6, vol: 0.04, delay: 0.3 });
        break;
      case 'denied':
        this.tone({ type: 'square', f0: 200, f1: 150, dur: 0.12, vol: 0.06 });
        this.tone({ type: 'square', f0: 160, f1: 120, dur: 0.15, vol: 0.06, delay: 0.12 });
        break;
      case 'tick':
        this.tone({ type: 'square', f0: 1400, dur: 0.03, vol: 0.04 });
        break;
      case 'levelDone':
        [392, 494, 587, 784].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.7, vol: 0.1, delay: i * 0.12, attack: 0.03 }));
        this.noise({ dur: 1.0, vol: 0.05, attack: 0.3, filter: { type: 'highpass', f0: 2000, f1: 6000 } });
        break;
      case 'victory':
        [392, 494, 587, 784, 988, 1175].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 1.2, vol: 0.09, delay: i * 0.15, attack: 0.05 }));
        [196, 247, 294].forEach((f, i) => this.tone({ type: 'sine', f0: f, dur: 2.5, vol: 0.08, delay: 0.3 + i * 0.1, attack: 0.3 }));
        break;
    }
  }

  /* ---------------------------- ambient ----------------------------- */
  startAmbient(theme: Theme) {
    if (this.ctx && this.ambientTheme === theme && this.ambientNodes.length > 0) return;
    this.ambientTheme = theme;
    const c = this.ctx;
    if (!c) return;
    this.stopAmbient(true);
    const nodes: AudioNode[] = [];
    const t = c.currentTime;
    const base: Record<Theme, number> = {
      cave: 55, ruins: 49, archive: 41, gardens: 58, forge: 44, spire: 52, heart: 62,
      abyss: 38, mire: 45, citadel: 52, rift: 33,
    };
    const f = base[theme];
    const bus = c.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(1, t + 2.5);
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 320;
    filt.Q.value = 2;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(filt.frequency);
    lfo.start();
    [[f, 'sine', 0.35], [f * 1.5, 'triangle', 0.12], [f * 2.01, 'sine', 0.1], [f * 0.5, 'sine', 0.25]].forEach(([fr, type, vol]) => {
      const o = c.createOscillator();
      o.type = type as Wave;
      o.frequency.value = fr as number;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = c.createGain();
      g.gain.value = vol as number;
      o.connect(g);
      g.connect(filt);
      o.start();
      nodes.push(o, g);
    });
    // wind / water bed
    if (this.noiseBuf) {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const nf = c.createBiquadFilter();
      nf.type = 'lowpass';
      nf.frequency.value = theme === 'archive' ? 420 : 240;
      const ng = c.createGain();
      ng.gain.value = theme === 'archive' ? 0.12 : 0.07;
      const nl = c.createOscillator();
      nl.frequency.value = 0.08;
      const nlg = c.createGain();
      nlg.gain.value = 0.04;
      nl.connect(nlg);
      nlg.connect(ng.gain);
      nl.start();
      src.connect(nf);
      nf.connect(ng);
      ng.connect(bus);
      src.start();
      nodes.push(src, nf, ng, nl, nlg);
    }
    filt.connect(bus);
    bus.connect(this.ambGain);
    nodes.push(filt, lfo, lfoGain, bus);
    this.ambientNodes = nodes;
    // drips & distant echoes
    const schedule = () => {
      if (!this.ctx) return;
      const r = Math.random();
      if (r < 0.6) {
        const fr = 1400 + Math.random() * 1200;
        this.tone({ type: 'sine', f0: fr, f1: fr * 0.6, dur: 0.12, vol: 0.05 }, this.ambGain);
        this.tone({ type: 'sine', f0: fr * 0.98, f1: fr * 0.6, dur: 0.12, vol: 0.025, delay: 0.23 }, this.ambGain);
        this.tone({ type: 'sine', f0: fr * 0.96, f1: fr * 0.6, dur: 0.12, vol: 0.012, delay: 0.46 }, this.ambGain);
      } else if (r < 0.8) {
        this.noise({ dur: 1.5, vol: 0.05, attack: 0.6, filter: { type: 'bandpass', f0: 300 + Math.random() * 300, q: 6 } }, this.ambGain);
      } else if (theme === 'heart') {
        this.tone({ type: 'sine', f0: f * 4, dur: 1.5, vol: 0.05, attack: 0.4 }, this.ambGain);
      } else {
        this.tone({ type: 'triangle', f0: 200 + Math.random() * 200, f1: 150, dur: 0.8, vol: 0.02, attack: 0.3 }, this.ambGain);
      }
      this.ambientTimer = window.setTimeout(schedule, 1500 + Math.random() * 4500);
    };
    this.ambientTimer = window.setTimeout(schedule, 1200);
  }

  /* ------------------------- horror score --------------------------- */
  /** Starts the procedural background score. Each area gets its own low root note. */
  startMusic(theme: Theme) {
    if (this.ctx && this.musicTheme === theme && this.musicNodes.length > 0) return;
    this.musicTheme = theme;
    const c = this.ctx;
    if (!c) return;
    this.stopMusic(true);
    const t = c.currentTime;
    const ROOT: Record<Theme, number> = {
      cave: 36.71, ruins: 41.2, archive: 34.65, gardens: 43.65, forge: 32.7, spire: 38.89, heart: 30.87,
      abyss: 27.5, mire: 30.87, citadel: 36.71, rift: 24.5,
    };
    const root = ROOT[theme];
    const nodes: AudioNode[] = [];
    const osc = (type: Wave, freq: number, detune = 0) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      o.start();
      nodes.push(o);
      return o;
    };
    const gain = (v: number) => { const g = c.createGain(); g.gain.value = v; nodes.push(g); return g; };

    // master bus with a slow fade-in and a dark, long echo tail
    const bus = c.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(1, t + 6);
    const delay = c.createDelay(2);
    delay.delayTime.value = 0.43;
    const fb = gain(0.42);
    const dlp = c.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 1600;
    const wet = gain(0.5);
    bus.connect(this.musicGain);
    bus.connect(delay);
    delay.connect(dlp); dlp.connect(fb); fb.connect(delay);
    dlp.connect(wet); wet.connect(this.musicGain);
    nodes.push(bus, delay, dlp);
    this.musicBus = bus;

    // 1) breathing sub drone: two detuned saws through a slowly opening resonant filter
    const droneF = c.createBiquadFilter();
    droneF.type = 'lowpass';
    droneF.frequency.value = 170;
    droneF.Q.value = 5;
    const droneLfo = osc('sine', 0.031);
    const droneLfoG = gain(80);
    droneLfo.connect(droneLfoG); droneLfoG.connect(droneF.frequency);
    const droneG = gain(0.2);
    osc('sawtooth', root).connect(droneF);
    osc('sawtooth', root, 9).connect(droneF);
    osc('sine', root * 2).connect(droneF);
    droneF.connect(droneG); droneG.connect(bus);
    nodes.push(droneF);

    // 2) a tritone that drifts in and out of the drone — the "something is wrong" interval
    const triG = gain(0.035);
    const triLfo = osc('sine', 0.017);
    const triLfoG = gain(0.035);
    triLfo.connect(triLfoG); triLfoG.connect(triG.gain);
    osc('sine', root * 2 * Math.pow(2, 6 / 12), -6).connect(triG);
    triG.connect(bus);

    // 3) tension layer: trembling minor-second strings, faded in by nearby danger
    const tensionG = gain(0);
    const strF = c.createBiquadFilter();
    strF.type = 'bandpass';
    strF.frequency.value = 900;
    strF.Q.value = 1.2;
    const trem = gain(0.5);
    const tremLfo = osc('sine', 6.5);
    const tremLfoG = gain(0.5);
    tremLfo.connect(tremLfoG); tremLfoG.connect(trem.gain);
    osc('sawtooth', root * 16, -8).connect(strF);
    osc('sawtooth', root * 16 * Math.pow(2, 1 / 12), 7).connect(strF);
    strF.connect(trem); trem.connect(tensionG); tensionG.connect(bus);
    nodes.push(strF);
    this.tensionGain = tensionG;

    this.musicNodes = nodes;
    this.nextBeat = t + 2;
    this.nextNote = t + 4;
    this.nextSwell = t + 3;
    this.nextEvent = t + 12;
    const tick = () => {
      if (!this.ctx || this.musicTheme !== theme || !this.musicBus) return;
      this.scheduleMusic(root);
      this.musicTimer = window.setTimeout(tick, 200);
    };
    tick();
  }

  /** Lookahead scheduler for the sparse musical events. */
  private scheduleMusic(root: number) {
    const c = this.ctx;
    const bus = this.musicBus;
    if (!c || !bus) return;
    const now = c.currentTime;
    const horizon = now + 0.6;
    const T = this.tension;
    const at = (when: number) => Math.max(0, when - now);

    // slow heartbeat — almost silent when calm, loud and fast when hunted
    while (this.nextBeat < horizon) {
      const v = 0.05 + T * 0.32;
      this.tone({ type: 'sine', f0: 72, f1: 36, dur: 0.3, vol: v, delay: at(this.nextBeat) }, bus);
      this.tone({ type: 'sine', f0: 64, f1: 32, dur: 0.34, vol: v * 0.75, delay: at(this.nextBeat + 0.25) }, bus);
      this.nextBeat += 1.4 - T * 0.65;
    }

    // detuned music box playing fragments of a locrian-like scale, with long silences
    const SCALE = [0, 1, 3, 5, 6, 8, 10, 12];
    while (this.nextNote < horizon) {
      if (Math.random() < 0.72) {
        const deg = SCALE[Math.floor(Math.random() * SCALE.length)];
        const oct = Math.random() < 0.25 ? 32 : 16;
        const f = root * oct * Math.pow(2, deg / 12);
        const detune = (Math.random() - 0.5) * 45;
        this.tone({ type: 'triangle', f0: f, dur: 2.4, vol: 0.04, delay: at(this.nextNote), detune }, bus);
        this.tone({ type: 'sine', f0: f * 2.01, dur: 1.1, vol: 0.012, delay: at(this.nextNote), detune }, bus);
      }
      this.nextNote += Math.random() < 0.22 ? 4 + Math.random() * 5 : 0.55 + Math.random() * 0.55;
    }

    // dissonant cluster swells
    if (this.nextSwell < horizon) {
      const chord = Math.random() < 0.5 ? [0, 1, 6] : [0, 3, 4];
      for (const s of chord) {
        this.tone({
          type: 'sawtooth', f0: root * 4 * Math.pow(2, s / 12), dur: 7.5, vol: 0.028, attack: 3.2,
          delay: at(this.nextSwell), detune: (Math.random() - 0.5) * 16, filter: { type: 'lowpass', f0: 450, f1: 1000 },
        }, bus);
      }
      this.nextSwell += 9 + Math.random() * 9;
    }

    // rare unsettling events: distant boom, metallic scrape, or whispers
    if (this.nextEvent < horizon) {
      const d = at(this.nextEvent);
      const r = Math.random();
      if (r < 0.35) {
        this.tone({ type: 'sine', f0: 55, f1: 26, dur: 3.2, vol: 0.26, delay: d }, bus);
        this.noise({ dur: 2.6, vol: 0.12, delay: d, filter: { type: 'lowpass', f0: 180, f1: 60 } }, bus);
      } else if (r < 0.7) {
        this.noise({ dur: 2.8, vol: 0.05, attack: 1.2, delay: d, filter: { type: 'bandpass', f0: 420, f1: 2600, q: 9 } }, bus);
      } else {
        this.noise({ dur: 1.6, vol: 0.035, attack: 0.4, delay: d, filter: { type: 'bandpass', f0: 1900, f1: 900, q: 3 } }, bus);
        this.noise({ dur: 1.3, vol: 0.025, attack: 0.3, delay: d + 0.9, filter: { type: 'bandpass', f0: 1500, f1: 2200, q: 3 } }, bus);
      }
      this.nextEvent += 14 + Math.random() * 16;
    }

    this.tensionGain?.gain.setTargetAtTime(T * 0.045, now, 1.2);
  }

  /** 0 = calm, 1 = enemies very close or player near death. */
  setMusicTension(v: number) {
    this.tension = Math.max(0, Math.min(1, v));
  }

  stopMusic(keepTheme = false) {
    if (!keepTheme) this.musicTheme = null;
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    const nodes = this.musicNodes;
    const bus = this.musicBus;
    this.musicNodes = [];
    this.musicBus = null;
    this.tensionGain = null;
    if (!nodes.length) return;
    // short fade so level changes don't click
    if (this.ctx && bus) bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    window.setTimeout(() => {
      for (const n of nodes) {
        try {
          if (n instanceof OscillatorNode || n instanceof AudioBufferSourceNode) n.stop();
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    }, 1500);
  }

  stopAmbient(keepTheme = false) {
    if (!keepTheme) this.ambientTheme = null;
    if (this.ambientTimer !== null) {
      clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
    }
    for (const n of this.ambientNodes) {
      try {
        if (n instanceof OscillatorNode || n instanceof AudioBufferSourceNode) n.stop();
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.ambientNodes = [];
  }
}
