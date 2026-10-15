// All sound is synthesised with the Web Audio API: no audio files, no licences
// to worry about. Effects are short envelopes over oscillators and filtered
// noise; music is a small step sequencer (drums, bass, chords, lead) with one
// pattern set per arena mood. The context starts on the first key or click.
import type { MusicId } from '../sim/games/base';

type Osc = OscillatorType;

interface Pattern {
  bpm: number;
  /** scale degrees per 16th for the bass (null = rest), 2 bars */
  bass: (number | null)[];
  /** chord roots per bar (semitones from the key) */
  chords: number[];
  /** lead notes per 16th (semitones), 2 bars */
  lead: (number | null)[];
  kick: string;
  snare: string;
  hat: string;
  key: number;
  leadWave: Osc;
  bassWave: Osc;
  swing?: number;
}

const _ = null;
const P: Record<MusicId | 'menu', Pattern> = {
  menu: {
    bpm: 104,
    key: 57,
    bass: [0, _, _, 0, _, _, 7, _, 5, _, _, 5, _, _, 3, _, 0, _, _, 0, _, _, 7, _, 10, _, _, 7, _, 5, _, _],
    chords: [0, 5, 3, 7],
    lead: [12, _, 15, _, 19, _, 17, 15, _, _, 12, _, 10, _, _, _, 12, _, 15, _, 19, _, 22, _, 19, _, 17, _, 15, _, _, _],
    kick: 'x.......x.......x.......x.......',
    snare: '....x.......x.......x.......x...',
    hat: '..x...x...x...x...x...x...x...x.',
    leadWave: 'triangle',
    bassWave: 'triangle',
    swing: 0.12,
  },
  bounce: {
    bpm: 128,
    key: 60,
    bass: [0, _, 0, _, 7, _, 0, _, 5, _, 5, _, 7, _, 10, _, 0, _, 0, _, 7, _, 0, _, 3, _, 3, _, 5, _, 7, _],
    chords: [0, 5, 7, 5],
    lead: [12, 14, 16, _, 19, _, 16, _, 17, _, 16, 14, 12, _, _, _, 12, 14, 16, _, 19, _, 21, _, 19, _, 17, _, 16, _, 14, _],
    kick: 'x...x...x...x...x...x...x...x...',
    snare: '....x.......x.......x.......x.x.',
    hat: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.',
    leadWave: 'square',
    bassWave: 'square',
  },
  lava: {
    bpm: 140,
    key: 52,
    bass: [0, 0, _, 0, 0, _, 1, _, 0, 0, _, 0, 3, _, 1, _, 0, 0, _, 0, 0, _, 1, _, 6, _, 5, _, 3, _, 1, _],
    chords: [0, 1, 0, 6],
    lead: [12, _, 13, _, 12, _, 10, _, 12, _, _, _, 7, _, 8, _, 12, _, 13, _, 15, _, 13, _, 12, _, 10, _, 8, _, 7, _],
    kick: 'x..x..x.x..x..x.x..x..x.x..x..x.',
    snare: '....x.......x.......x.......x...',
    hat: '.xx.xx.xx.xx.xx..xx.xx.xx.xx.xx.',
    leadWave: 'sawtooth',
    bassWave: 'sawtooth',
  },
  fight: {
    bpm: 136,
    key: 50,
    bass: [0, _, 0, 12, _, 0, _, 10, 0, _, 0, 12, _, 7, _, 5, 0, _, 0, 12, _, 0, _, 10, 3, _, 3, 15, _, 5, _, 7],
    chords: [0, 3, 5, 7],
    lead: [_, _, 12, _, 15, _, 12, _, 17, _, 15, _, 12, _, 10, _, _, _, 12, _, 15, _, 19, _, 17, _, 15, _, 12, _, _, _],
    kick: 'x.....x.x.....x.x.....x.x.....x.',
    snare: '....x.......x.......x.......x...',
    hat: 'x.xxx.xxx.xxx.xxx.xxx.xxx.xxx.xx',
    leadWave: 'square',
    bassWave: 'sawtooth',
  },
  race: {
    bpm: 150,
    key: 55,
    bass: [0, _, 0, _, 0, _, 0, _, 5, _, 5, _, 5, _, 5, _, 7, _, 7, _, 7, _, 7, _, 3, _, 3, _, 5, _, 7, _],
    chords: [0, 5, 7, 3],
    lead: [12, _, 16, _, 19, 16, 12, _, 17, _, 21, _, 24, 21, 17, _, 19, _, 23, _, 26, 23, 19, _, 15, _, 19, _, 22, _, 24, _],
    kick: 'x...x...x...x...x...x...x...x...',
    snare: '....x.......x.......x.......x...',
    hat: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    leadWave: 'square',
    bassWave: 'triangle',
  },
  funk: {
    bpm: 112,
    key: 53,
    bass: [0, _, _, 0, _, 12, _, 10, _, 7, _, 0, _, _, 3, 5, 0, _, _, 0, _, 12, _, 10, _, 7, _, 5, _, 3, _, 2],
    chords: [0, 0, 5, 3],
    lead: [_, 12, _, 15, _, 17, 15, _, _, 12, _, 10, 12, _, _, _, _, 12, _, 15, _, 19, 17, _, 15, _, 12, _, 10, _, _, _],
    kick: 'x.....x...x.....x.....x...x.....',
    snare: '....x.......x.......x.......x..x',
    hat: 'x.xxx.xxx.xxx.xxx.xxx.xxx.xxx.xx',
    leadWave: 'triangle',
    bassWave: 'square',
    swing: 0.18,
  },
  disco: {
    bpm: 122,
    key: 58,
    bass: [0, 12, 0, 12, 0, 12, 0, 12, 5, 17, 5, 17, 5, 17, 5, 17, 3, 15, 3, 15, 3, 15, 3, 15, 7, 19, 7, 19, 7, 19, 7, 19],
    chords: [0, 5, 3, 7],
    lead: [19, _, 17, _, 15, _, 17, _, 19, _, _, _, 22, _, 19, _, 17, _, 15, _, 14, _, 15, _, 17, _, _, _, 12, _, _, _],
    kick: 'x...x...x...x...x...x...x...x...',
    snare: '....x.......x.......x.......x...',
    hat: '..x...x...x...x...x...x...x...x.',
    leadWave: 'square',
    bassWave: 'sawtooth',
  },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musBus!: GainNode;
  private noise!: AudioBuffer;
  private music: MusicId | 'menu' | null = null;
  private wantMusic: MusicId | 'menu' | null = null;
  private step = 0;
  private nextT = 0;
  private timer = 0;
  private recent = new Map<string, number>();
  volumes = { music: 0.6, sfx: 0.8 };
  /** listener x for stereo panning of world sounds (world units) */
  listenX = 640;
  muted = false;

  /** Create the context (call from a user gesture). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfxBus = c.createGain();
    this.musBus = c.createGain();
    this.sfxBus.connect(this.master);
    this.musBus.connect(this.master);
    this.applyVolumes();
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.timer = window.setInterval(() => this.schedule(), 40);
    if (this.wantMusic) this.playMusic(this.wantMusic);
  }

  get state() {
    return this.ctx ? this.ctx.state : 'none';
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.muted ? 0 : this.volumes.sfx, t, 0.02);
    this.musBus.gain.setTargetAtTime(this.muted ? 0 : this.volumes.music * 0.42, t, 0.05);
  }
  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolumes();
  }

  dispose() {
    window.clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }

  // ---------------------------------------------------------------- music
  playMusic(id: MusicId | 'menu' | null) {
    this.wantMusic = id;
    if (!this.ctx || this.music === id) return;
    this.music = id;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
  }

  private schedule() {
    const c = this.ctx;
    if (!c || !this.music || c.state !== 'running') return;
    const pat = P[this.music];
    const s16 = 60 / pat.bpm / 4;
    while (this.nextT < c.currentTime + 0.15) {
      const i = this.step % 32;
      const swing = i % 2 === 1 ? (pat.swing ?? 0) * s16 : 0;
      this.playStep(pat, i, this.nextT + swing, s16);
      this.nextT += s16;
      this.step++;
    }
  }

  private playStep(p: Pattern, i: number, t: number, s16: number) {
    const bus = this.musBus;
    if (p.kick[i] === 'x') this.kick(bus, t);
    if (p.snare[i] === 'x') this.snare(bus, t);
    if (p.hat[i] === 'x') this.hat(bus, t, i % 4 === 2 ? 0.06 : 0.035);
    const b = p.bass[i];
    if (b !== null) this.voice(bus, t, mtof(p.key - 24 + b), s16 * 1.6, 0.16, p.bassWave, 900);
    const l = p.lead[i];
    if (l !== null) this.voice(bus, t, mtof(p.key + l), s16 * 1.8, 0.06, p.leadWave, 2600);
    if (i % 16 === 0) {
      const root = p.key - 12 + p.chords[Math.floor(i / 16 + (this.step >> 5) * 2) % p.chords.length];
      for (const iv of [0, 3, 7, 10]) this.voice(bus, t, mtof(root + iv), s16 * 15, 0.022, 'sawtooth', 1200, 0.08);
    }
  }

  // ---------------------------------------------------------------- building blocks
  private panner(x?: number): AudioNode {
    const c = this.ctx!;
    if (x === undefined || !c.createStereoPanner) return this.sfxBus;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-0.8, Math.min(0.8, (x - this.listenX) / 900));
    p.connect(this.sfxBus);
    return p;
  }
  private voice(dest: AudioNode, t: number, f: number, dur: number, vol: number, type: Osc, cut = 3000, att = 0.005) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = cut;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl).connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private sweep(dest: AudioNode, t: number, f0: number, f1: number, dur: number, vol: number, type: Osc = 'sine') {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private burst(dest: AudioNode, t: number, dur: number, vol: number, type: BiquadFilterType, f: number, q = 1, f2?: number) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }
  private kick(dest: AudioNode, t: number) {
    this.sweep(dest, t, 150, 42, 0.22, 0.55);
  }
  private snare(dest: AudioNode, t: number) {
    this.burst(dest, t, 0.14, 0.22, 'bandpass', 1900, 0.8);
    this.sweep(dest, t, 240, 160, 0.08, 0.12, 'triangle');
  }
  private hat(dest: AudioNode, t: number, v: number) {
    this.burst(dest, t, 0.04, v, 'highpass', 7000);
  }

  // ---------------------------------------------------------------- effects
  sfx(name: string, x?: number, vol = 1) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    // the same sound many times in one instant gets loud and muddy
    const now = c.currentTime;
    if ((this.recent.get(name) ?? -1) > now - 0.03) return;
    this.recent.set(name, now);
    const t = now + 0.005;
    const o = this.panner(x);
    const v = vol;
    const r = () => 0.92 + Math.random() * 0.16;
    switch (name) {
      case 'jump':
        this.sweep(o, t, 260 * r(), 620, 0.14, 0.18 * v, 'square');
        break;
      case 'land':
        this.burst(o, t, 0.09, 0.35 * v, 'lowpass', 500);
        this.sweep(o, t, 120, 60, 0.08, 0.2 * v);
        break;
      case 'dash':
        this.burst(o, t, 0.16, 0.25 * v, 'bandpass', 1200, 1.2, 3200);
        break;
      case 'slamStart':
        this.sweep(o, t, 900, 200, 0.18, 0.14 * v, 'sawtooth');
        break;
      case 'slam':
        this.sweep(o, t, 140, 35, 0.4, 0.6 * v);
        this.burst(o, t, 0.3, 0.4 * v, 'lowpass', 400);
        break;
      case 'hit':
        this.burst(o, t, 0.12, 0.6 * v, 'lowpass', 2400);
        this.sweep(o, t, 200, 70, 0.14, 0.5 * v, 'triangle');
        break;
      case 'stomp':
        this.sweep(o, t, 500, 1100, 0.08, 0.2 * v, 'square');
        this.sweep(o, t + 0.06, 300, 120, 0.12, 0.3 * v);
        break;
      case 'bump':
        this.sweep(o, t, 300, 180, 0.1, 0.25 * v, 'triangle');
        break;
      case 'spring':
        for (let i = 0; i < 3; i++) this.sweep(o, t + i * 0.05, 300 + i * 120, 900 + i * 200, 0.12, 0.16 * v, 'triangle');
        break;
      case 'coin':
        this.voice(o, t, 1318, 0.08, 0.16 * v, 'square', 6000);
        this.voice(o, t + 0.07, 1760, 0.18, 0.16 * v, 'square', 6000);
        break;
      case 'bigCoin':
        for (let i = 0; i < 4; i++) this.voice(o, t + i * 0.06, mtof(84 + [0, 4, 7, 12][i]), 0.16, 0.14 * v, 'square', 6000);
        break;
      case 'coinDrop':
        for (let i = 0; i < 4; i++) this.voice(o, t + i * 0.05, 1500 - i * 220, 0.07, 0.1 * v, 'square', 5000);
        break;
      case 'crack':
      case 'crumble':
        for (let i = 0; i < 3; i++) this.burst(o, t + i * 0.04, 0.06, 0.25 * v, 'highpass', 1500 + i * 600);
        break;
      case 'drop':
        this.sweep(o, t, 400, 90, 0.4, 0.3 * v, 'sawtooth');
        break;
      case 'appear':
        this.sweep(o, t, 300, 900, 0.12, 0.12 * v, 'triangle');
        break;
      case 'explode':
        this.burst(o, t, 0.6, 0.9 * v, 'lowpass', 1200, 0.7, 80);
        this.sweep(o, t, 90, 30, 0.5, 0.6 * v);
        break;
      case 'thud':
        this.sweep(o, t, 90, 40, 0.25, 0.5 * v);
        this.burst(o, t, 0.15, 0.35 * v, 'lowpass', 300);
        break;
      case 'warn':
        this.voice(o, t, 880, 0.08, 0.1 * v, 'square', 3000);
        this.voice(o, t + 0.12, 880, 0.08, 0.1 * v, 'square', 3000);
        break;
      case 'charge':
        this.sweep(o, t, 200, 1600, 0.9, 0.08 * v, 'sawtooth');
        break;
      case 'laser':
        this.sweep(o, t, 1800, 300, 0.35, 0.22 * v, 'sawtooth');
        this.burst(o, t, 0.3, 0.2 * v, 'bandpass', 3000, 2);
        break;
      case 'rumble':
        this.burst(o, t, 0.9, 0.4 * v, 'lowpass', 160);
        break;
      case 'ouch':
      case 'hurt':
        this.sweep(o, t, 900, 300, 0.18, 0.2 * v, 'square');
        break;
      case 'fall':
        this.sweep(o, t, 1400, 200, 0.7, 0.16 * v, 'sine');
        break;
      case 'ko':
        this.sweep(this.sfxBus, t, 1200, 100, 0.6, 0.3 * v, 'square');
        this.burst(this.sfxBus, t + 0.1, 0.5, 0.5 * v, 'lowpass', 700);
        break;
      case 'respawn':
        this.sweep(o, t, 400, 1200, 0.2, 0.12 * v, 'triangle');
        break;
      case 'count':
        this.voice(this.sfxBus, t, 660, 0.16, 0.2 * v, 'square', 4000);
        break;
      case 'go':
        this.voice(this.sfxBus, t, 990, 0.4, 0.22 * v, 'square', 5000);
        this.voice(this.sfxBus, t, 1320, 0.4, 0.12 * v, 'square', 5000);
        break;
      case 'roundWin':
        [0, 4, 7, 12, 7, 12].forEach((n, i) => this.voice(this.sfxBus, t + i * 0.09, mtof(72 + n), 0.22, 0.14 * v, 'square', 5000));
        break;
      case 'draw':
        [7, 6, 5, 0].forEach((n, i) => this.voice(this.sfxBus, t + i * 0.18, mtof(60 + n), 0.3, 0.14 * v, 'triangle', 3000));
        break;
      case 'victory':
        [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.voice(this.sfxBus, t + i * 0.1, mtof(67 + n), 0.5, 0.13 * v, 'square', 6000));
        [0, 4, 7].forEach((n) => this.voice(this.sfxBus, t + 0.75, mtof(55 + n), 1.2, 0.08 * v, 'sawtooth', 2000));
        break;
      case 'point':
        [0, 7, 12].forEach((n, i) => this.voice(this.sfxBus, t + i * 0.07, mtof(76 + n), 0.15, 0.12 * v, 'square', 6000));
        break;
      case 'click':
        this.voice(this.sfxBus, t, 1200, 0.04, 0.08 * v, 'square', 5000);
        break;
      case 'hover':
        this.voice(this.sfxBus, t, 1800, 0.025, 0.035 * v, 'triangle', 6000);
        break;
      case 'wind':
        this.burst(this.sfxBus, t, 2.2, 0.25 * v, 'bandpass', 500, 0.6, 1400);
        break;
      case 'reverse':
        this.sweep(this.sfxBus, t, 900, 300, 0.3, 0.16 * v, 'sawtooth');
        this.sweep(this.sfxBus, t + 0.15, 900, 300, 0.3, 0.16 * v, 'sawtooth');
        break;
      case 'unreverse':
        this.sweep(this.sfxBus, t, 300, 900, 0.25, 0.14 * v, 'triangle');
        break;
      case 'sudden':
        for (let i = 0; i < 3; i++) this.voice(this.sfxBus, t + i * 0.2, 440, 0.15, 0.18 * v, 'sawtooth', 3000);
        break;
      case 'move':
        this.sweep(this.sfxBus, t, 500, 800, 0.2, 0.12 * v, 'triangle');
        break;
      case 'tick':
        this.voice(o, t, 2200, 0.03, 0.06 * v, 'square', 8000);
        break;
      case 'button':
        this.voice(o, t, 520, 0.06, 0.15 * v, 'square', 3000);
        this.voice(o, t + 0.08, 780, 0.1, 0.15 * v, 'square', 3000);
        break;
      case 'gate':
        this.burst(o, t, 0.3, 0.25 * v, 'lowpass', 600);
        break;
      case 'color0':
      case 'color1':
      case 'color2': {
        const base = [76, 69, 81][Number(name.slice(5))];
        [0, 4, 7, 12].forEach((n, i) => this.voice(this.sfxBus, t + i * 0.06, mtof(base + n), 0.18, 0.12 * v, 'triangle', 5000));
        break;
      }
      case 'whistle':
        this.sweep(this.sfxBus, t, 2400, 900, 0.8, 0.07 * v, 'sine');
        break;
      case 'blast':
        this.sweep(o, t, 200, 40, 0.5, 0.6 * v);
        this.burst(o, t, 0.4, 0.45 * v, 'lowpass', 900, 0.6, 100);
        break;
      case 'impact':
        this.burst(o, t, 0.15, 0.4 * v, 'lowpass', 1200);
        break;
      default:
        break;
    }
  }
}

export const audio = new Audio();
