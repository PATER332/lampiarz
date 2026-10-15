// Synthesised sound effects and a generative ambient score (Web Audio API, no files).

export type Sfx =
  | 'step'
  | 'jump'
  | 'djump'
  | 'land'
  | 'dash'
  | 'swing'
  | 'swingHeavy'
  | 'shot'
  | 'charge'
  | 'chargeRelease'
  | 'hit'
  | 'hitHeavy'
  | 'enemyDie'
  | 'hurt'
  | 'special'
  | 'pickup'
  | 'door'
  | 'checkpoint'
  | 'telegraph'
  | 'laser'
  | 'enemyShot'
  | 'bossRoar'
  | 'bossDie'
  | 'death'
  | 'heal'
  | 'upgrade'
  | 'ui'
  | 'uiBack'
  | 'lightning'
  | 'explosion'
  | 'terminal';

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private musicArea = -1;
  private musicStep = 0;
  private droneNodes: AudioNode[] = [];
  private settings: AudioSettings = { master: 0.8, music: 0.5, sfx: 0.8 };
  private lastPlay = new Map<Sfx, number>();

  /** Must be called from a user gesture (browser autoplay rules). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply(this.settings);
    if (this.musicArea >= 0) this.startMusic(this.musicArea, true);
  }

  apply(s: AudioSettings) {
    this.settings = { ...s };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.music * 0.55, t, 0.2);
  }

  private osc(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, when = 0, bus?: AudioNode) {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, fType: BiquadFilterType, f0: number, f1: number, when = 0, q = 1) {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = fType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  play(id: Sfx) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const last = this.lastPlay.get(id) ?? -1;
    if (now - last < 0.035) return; // avoid stacking the same sound in one frame
    this.lastPlay.set(id, now);
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    switch (id) {
      case 'step':
        this.noise(0.05, 0.05, 'bandpass', r(900, 1300), 400, 0, 2);
        break;
      case 'jump':
        this.osc('square', 220, 420, 0.1, 0.06);
        this.noise(0.08, 0.04, 'highpass', 2000, 900);
        break;
      case 'djump':
        this.osc('triangle', 320, 760, 0.14, 0.09);
        this.osc('sine', 640, 1200, 0.12, 0.04, 0.02);
        break;
      case 'land':
        this.noise(0.09, 0.09, 'lowpass', 600, 120);
        break;
      case 'dash':
        this.noise(0.2, 0.13, 'bandpass', 3000, 500, 0, 1.5);
        this.osc('sawtooth', 180, 90, 0.18, 0.04);
        break;
      case 'swing':
        this.noise(0.12, 0.12, 'bandpass', r(2600, 3400), 900, 0, 2.5);
        this.osc('sawtooth', r(900, 1100), 300, 0.09, 0.03);
        break;
      case 'swingHeavy':
        this.noise(0.22, 0.16, 'bandpass', 1400, 300, 0, 1.6);
        this.osc('sawtooth', 300, 80, 0.22, 0.06);
        break;
      case 'shot':
        this.osc('square', r(900, 1000), 180, 0.12, 0.07);
        this.noise(0.06, 0.05, 'highpass', 4000, 2000);
        break;
      case 'charge':
        this.osc('sine', 200, 900, 0.5, 0.05);
        break;
      case 'chargeRelease':
        this.noise(0.35, 0.2, 'bandpass', 2400, 200, 0, 1.2);
        this.osc('sawtooth', 420, 60, 0.35, 0.09);
        this.osc('sine', 120, 40, 0.4, 0.15);
        break;
      case 'hit':
        this.noise(0.08, 0.16, 'bandpass', r(1800, 2600), 700, 0, 1.8);
        this.osc('square', r(160, 200), 60, 0.08, 0.08);
        break;
      case 'hitHeavy':
        this.noise(0.16, 0.22, 'lowpass', 2400, 200);
        this.osc('sine', 110, 35, 0.2, 0.2);
        break;
      case 'enemyDie':
        this.noise(0.35, 0.17, 'bandpass', 1600, 120, 0, 0.9);
        this.osc('sawtooth', 300, 40, 0.35, 0.06);
        break;
      case 'hurt':
        this.osc('square', 300, 90, 0.22, 0.1);
        this.noise(0.18, 0.12, 'lowpass', 1800, 300);
        break;
      case 'special':
        this.osc('sawtooth', 160, 520, 0.25, 0.08);
        this.osc('sine', 80, 320, 0.3, 0.12);
        this.noise(0.3, 0.1, 'bandpass', 900, 3000, 0, 2);
        break;
      case 'pickup':
        this.osc('sine', r(1200, 1400), 2000, 0.08, 0.05);
        this.osc('sine', 1800, 2600, 0.08, 0.04, 0.05);
        break;
      case 'door':
        this.noise(0.5, 0.12, 'lowpass', 400, 90);
        this.osc('square', 70, 50, 0.45, 0.05);
        break;
      case 'checkpoint':
        [523, 659, 784, 1047].forEach((f, i) => this.osc('triangle', f, f, 0.25, 0.07, i * 0.07));
        break;
      case 'telegraph':
        this.osc('square', 880, 880, 0.07, 0.05);
        this.osc('square', 880, 880, 0.07, 0.05, 0.12);
        break;
      case 'laser':
        this.osc('sawtooth', 1400, 900, 0.35, 0.06);
        this.noise(0.35, 0.06, 'highpass', 5000, 3000);
        break;
      case 'enemyShot':
        this.osc('square', 600, 240, 0.12, 0.05);
        break;
      case 'bossRoar':
        this.osc('sawtooth', 90, 40, 1.2, 0.18);
        this.osc('sawtooth', 93, 41, 1.2, 0.12);
        this.noise(1.1, 0.12, 'lowpass', 900, 100);
        break;
      case 'bossDie':
        for (let i = 0; i < 6; i++) this.noise(0.5, 0.18, 'lowpass', 2000, 80, i * 0.18);
        this.osc('sine', 200, 30, 2, 0.2);
        break;
      case 'death':
        this.osc('sawtooth', 400, 40, 1.2, 0.12);
        this.noise(1, 0.12, 'lowpass', 1500, 60);
        break;
      case 'heal':
        [392, 523, 659].forEach((f, i) => this.osc('sine', f, f * 1.5, 0.3, 0.06, i * 0.06));
        break;
      case 'upgrade':
        [440, 554, 659, 880, 1108].forEach((f, i) => this.osc('triangle', f, f, 0.3, 0.06, i * 0.06));
        break;
      case 'ui':
        this.osc('square', 1200, 1400, 0.04, 0.03);
        break;
      case 'uiBack':
        this.osc('square', 700, 500, 0.05, 0.03);
        break;
      case 'lightning':
        this.noise(0.18, 0.15, 'highpass', 6000, 2500);
        this.osc('square', 2000, 400, 0.12, 0.04);
        break;
      case 'explosion':
        this.noise(0.6, 0.25, 'lowpass', 1800, 60);
        this.osc('sine', 90, 30, 0.6, 0.2);
        break;
      case 'terminal':
        [0, 1, 2, 3].forEach((i) => this.osc('square', r(1500, 2500), r(1500, 2500), 0.03, 0.025, i * 0.05));
        break;
    }
  }

  // ------------------------------------------------------------- music
  /** Each area gets its own key, tempo and texture. */
  startMusic(area: number, force = false) {
    if (this.musicArea === area && !force) return;
    this.musicArea = area;
    if (!this.ctx) return;
    this.stopMusic(false);
    const c = this.ctx;
    const roots = [55, 49, 58.27, 61.74, 41.2];
    const root = roots[area % roots.length] ?? 55;
    // slow pad drone
    for (const mult of [1, 1.5, 2.002]) {
      const o = c.createOscillator();
      const g = c.createGain();
      const f = c.createBiquadFilter();
      o.type = area === 4 ? 'sawtooth' : 'triangle';
      o.frequency.value = root * mult;
      f.type = 'lowpass';
      f.frequency.value = 380 + area * 60;
      g.gain.value = 0.05;
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 0.07 + mult * 0.03;
      lg.gain.value = 0.03;
      lfo.connect(lg);
      lg.connect(g.gain);
      o.connect(f);
      f.connect(g);
      g.connect(this.musicBus);
      o.start();
      lfo.start();
      this.droneNodes.push(o, lfo);
    }
    const scale = area === 4 ? [0, 1, 5, 6, 10] : [0, 3, 5, 7, 10];
    const tempo = [0.42, 0.5, 0.38, 0.3, 0.34][area] ?? 0.4;
    this.musicStep = 0;
    const tick = () => {
      if (!this.ctx) return;
      const s = this.musicStep++;
      if (s % 2 === 0 || Math.random() < 0.35) {
        const deg = scale[(s * 3 + ((s >> 3) % 3)) % scale.length];
        const oct = s % 16 < 8 ? 4 : 8;
        const f = root * oct * Math.pow(2, deg / 12);
        this.osc('sine', f, f * 0.999, tempo * 2.2, 0.035, 0, this.musicBus);
        if (area >= 3 && s % 4 === 0) this.osc('square', f / 2, f / 2, 0.08, 0.012, 0, this.musicBus);
      }
      if (s % 8 === 0) this.osc('sine', root * 2, root * 1.9, tempo * 3, 0.06, 0, this.musicBus);
      this.musicTimer = window.setTimeout(tick, tempo * 1000);
    };
    tick();
  }

  stopMusic(forget = true) {
    if (this.musicTimer !== null) window.clearTimeout(this.musicTimer);
    this.musicTimer = null;
    for (const n of this.droneNodes) {
      try {
        (n as OscillatorNode).stop();
      } catch {
        /* already stopped */
      }
    }
    this.droneNodes = [];
    if (forget) this.musicArea = -1;
  }
}

/** Silent stand-in for tests (no Web Audio in Node). */
export const silentAudio = { play: (_: Sfx) => {}, startMusic: (_: number) => {}, stopMusic: () => {} };
export type AudioLike = Pick<AudioEngine, 'play' | 'startMusic' | 'stopMusic'>;
