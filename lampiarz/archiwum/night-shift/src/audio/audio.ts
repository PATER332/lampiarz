// Procedural, positional audio for NIGHT SHIFT. Separate buses for music, effects
// and ambience; nothing plays before the user has interacted with the page.

export type Mood = 'menu' | 'calm' | 'tension' | 'chase' | 'final' | 'silence';

interface Bed {
  gain: GainNode;
  stop: () => void;
}

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private uiBus!: GainNode;
  private noise!: AudioBuffer;
  private brown!: AudioBuffer;
  private beds: Record<string, Bed> = {};
  private mood: Mood = 'silence';
  private moodGain: GainNode | null = null;
  private moodNodes: AudioScheduledSourceNode[] = [];
  private moodTimer = 0;
  private moodNext = 0;
  private active = 0;
  private vol = { music: 0.7, sfx: 0.85, ambient: 0.8 };
  private heart = 0;
  private heartT = 0;
  private voiceUntil = 0;

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
    comp.threshold.value = -16;
    comp.ratio.value = 3.5;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.uiBus = ctx.createGain();
    for (const b of [this.musicBus, this.sfxBus, this.ambBus, this.uiBus]) b.connect(this.master);
    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const n = this.noise.getChannelData(0);
    const br = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      n[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * n[i]) / 1.02;
      br[i] = last * 3.5;
    }
    this.applyVolumes();
    const m = this.mood;
    this.mood = 'silence';
    this.setMood(m);
  }

  setVolumes(music: number, sfx: number, ambient: number) {
    this.vol = { music, sfx, ambient };
    this.applyVolumes();
  }
  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.1);
    this.uiBus.gain.setTargetAtTime(Math.max(0.2, this.vol.sfx) * 0.6, t, 0.1);
    this.ambBus.gain.setTargetAtTime(this.vol.ambient * 0.8, t, 0.1);
  }

  suspend(on: boolean) {
    if (!this.ctx) return;
    if (on) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  // ------------------------------------------------------------------ listener
  listener(x: number, y: number, z: number, yaw: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const L = ctx.listener;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (L.positionX) {
      const t = ctx.currentTime;
      L.positionX.setTargetAtTime(x, t, 0.02);
      L.positionY.setTargetAtTime(y, t, 0.02);
      L.positionZ.setTargetAtTime(z, t, 0.02);
      L.forwardX.setTargetAtTime(fx, t, 0.02);
      L.forwardY.setTargetAtTime(0, t, 0.02);
      L.forwardZ.setTargetAtTime(fz, t, 0.02);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      (L as unknown as { setPosition: (a: number, b: number, c: number) => void }).setPosition(x, y, z);
      (L as unknown as { setOrientation: (...a: number[]) => void }).setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  // ------------------------------------------------------------------ primitives
  private out(pos?: [number, number, number], bus: GainNode = this.sfxBus, ref = 1.6): AudioNode {
    const ctx = this.ctx!;
    if (!pos) return bus;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1.3;
    p.maxDistance = 60;
    if (p.positionX) {
      p.positionX.value = pos[0];
      p.positionY.value = pos[1];
      p.positionZ.value = pos[2];
    } else (p as unknown as { setPosition: (a: number, b: number, c: number) => void }).setPosition(...pos);
    p.connect(bus);
    return p;
  }

  private env(g: GainNode, t: number, v: number, a: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + Math.max(0.002, a));
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(dest: AudioNode, t: number, o: { type?: OscillatorType; f: number; f2?: number; dur: number; vol: number; a?: number }) {
    const ctx = this.ctx!;
    const os = ctx.createOscillator();
    os.type = o.type ?? 'sine';
    os.frequency.setValueAtTime(o.f, t);
    if (o.f2) os.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2), t + o.dur);
    const g = ctx.createGain();
    this.env(g, t, o.vol, o.a ?? 0.005, o.dur);
    os.connect(g).connect(dest);
    os.start(t);
    os.stop(t + (o.a ?? 0.005) + o.dur + 0.05);
  }

  private noiseHit(dest: AudioNode, t: number, o: { type?: BiquadFilterType; f: number; f2?: number; q?: number; dur: number; vol: number; a?: number; brown?: boolean }) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = o.brown ? this.brown : this.noise;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    this.env(g, t, o.vol, o.a ?? 0.003, o.dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 2);
    s.stop(t + (o.a ?? 0.003) + o.dur + 0.05);
  }

  // ------------------------------------------------------------------ sound effects
  sfx(name: string, pos?: [number, number, number], vol = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.active > 26 && (name.startsWith('step') || name === 'enemyStep')) return;
    this.active++;
    window.setTimeout(() => this.active--, 500);
    const t = ctx.currentTime + 0.005;
    const r = () => 0.9 + Math.random() * 0.2;
    const o = this.out(pos);
    const v = vol;
    switch (name) {
      case 'step':
      case 'stepRun':
      case 'stepSoft': {
        const k = name === 'stepRun' ? 1.5 : name === 'stepSoft' ? 0.45 : 1;
        this.noiseHit(o, t, { type: 'lowpass', f: 900 * r(), f2: 200, dur: 0.07, vol: 0.18 * k * v });
        this.noiseHit(o, t + 0.02, { type: 'bandpass', f: 2400 * r(), q: 2, dur: 0.03, vol: 0.04 * k * v });
        break;
      }
      case 'enemyStep':
        this.noiseHit(o, t, { type: 'lowpass', f: 380 * r(), f2: 90, dur: 0.16, vol: 0.55 * v, brown: true });
        this.tone(o, t, { f: 70 * r(), f2: 45, dur: 0.12, vol: 0.18 * v, type: 'triangle' });
        if (Math.random() < 0.35) this.noiseHit(o, t + 0.08, { type: 'highpass', f: 3500, dur: 0.15, vol: 0.05 * v }); // tape rustle
        break;
      case 'ventRattle':
        for (let i = 0; i < 9; i++) this.noiseHit(o, t + i * 0.09 + Math.random() * 0.05, { f: 600 + Math.random() * 900, q: 4, dur: 0.06, vol: 0.4 * v });
        this.noiseHit(o, t, { type: 'lowpass', f: 200, dur: 1.6, vol: 0.3 * v, a: 0.3, brown: true });
        break;
      case 'ventExit':
      case 'ventEnter':
        this.noiseHit(o, t, { f: 700, q: 3, dur: 0.25, vol: 0.6 * v });
        this.tone(o, t, { f: 110, f2: 60, dur: 0.4, vol: 0.25 * v, type: 'square' });
        this.noiseHit(o, t + 0.2, { type: 'lowpass', f: 300, dur: 0.3, vol: 0.4 * v, brown: true });
        break;
      case 'ventKnock':
        for (let i = 0; i < 3; i++) this.noiseHit(o, t + i * 0.32 + Math.random() * 0.1, { f: 420, q: 6, dur: 0.12, vol: 0.5 * v });
        break;
      case 'notice':
        // magnetic tape rewinding: a falling, warbling screech
        this.tone(o, t, { type: 'sawtooth', f: 1800, f2: 240, dur: 0.6, vol: 0.12 * v, a: 0.02 });
        this.tone(o, t, { type: 'square', f: 1830, f2: 250, dur: 0.6, vol: 0.06 * v, a: 0.02 });
        this.noiseHit(o, t, { type: 'bandpass', f: 3000, f2: 600, q: 2, dur: 0.6, vol: 0.3 * v });
        break;
      case 'screech':
        this.tone(o, t, { type: 'sawtooth', f: 260, f2: 2200, dur: 0.8, vol: 0.14 * v, a: 0.05 });
        this.noiseHit(o, t, { type: 'highpass', f: 2000, dur: 0.9, vol: 0.3 * v, a: 0.05 });
        break;
      case 'lockerRip':
        this.noiseHit(o, t, { f: 900, q: 2, dur: 0.4, vol: 0.9 * v });
        this.tone(o, t, { type: 'square', f: 180, f2: 60, dur: 0.3, vol: 0.3 * v });
        break;
      case 'lockerIn':
      case 'lockerOut':
        this.noiseHit(o, t, { f: 1200, q: 3, dur: 0.12, vol: 0.35 * v });
        this.tone(o, t + 0.1, { type: 'triangle', f: 320, dur: 0.15, vol: 0.12 * v });
        break;
      case 'doorOpen':
      case 'doorClose':
      case 'doorForce': {
        // servo whine + latch
        const up = name !== 'doorClose';
        this.tone(o, t, { type: 'sawtooth', f: up ? 140 : 190, f2: up ? 190 : 120, dur: 0.75, vol: 0.06 * v, a: 0.05 });
        this.noiseHit(o, t, { type: 'bandpass', f: 500, q: 1, dur: 0.8, vol: 0.18 * v, a: 0.05 });
        this.noiseHit(o, t + 0.75, { type: 'lowpass', f: 600, dur: 0.12, vol: 0.5 * v });
        if (name === 'doorForce') this.noiseHit(o, t, { f: 1600, q: 3, dur: 0.3, vol: 0.4 * v });
        break;
      }
      case 'shelfSlide':
        this.noiseHit(o, t, { type: 'lowpass', f: 300, dur: 2.2, vol: 0.5 * v, a: 0.2, brown: true });
        this.noiseHit(o, t, { f: 1800, q: 5, dur: 2, vol: 0.06 * v, a: 0.1 });
        break;
      case 'deny':
        this.tone(o, t, { type: 'square', f: 180, dur: 0.12, vol: 0.06 * v });
        this.tone(o, t + 0.15, { type: 'square', f: 140, dur: 0.18, vol: 0.06 * v });
        break;
      case 'card':
      case 'codeOk':
      case 'beep':
        this.tone(o, t, { type: 'square', f: 1320, dur: 0.06, vol: 0.05 * v });
        this.tone(o, t + 0.08, { type: 'square', f: 1760, dur: 0.08, vol: 0.05 * v });
        break;
      case 'codeBad':
        this.tone(o, t, { type: 'square', f: 300, dur: 0.35, vol: 0.06 * v });
        break;
      case 'key':
        this.tone(this.uiBus, t, { type: 'square', f: 900 + Math.random() * 300, dur: 0.05, vol: 0.05 * v });
        break;
      case 'pickup':
        this.noiseHit(o, t, { f: 2500, q: 2, dur: 0.08, vol: 0.2 * v });
        this.tone(o, t + 0.03, { type: 'triangle', f: 660, dur: 0.12, vol: 0.06 * v });
        break;
      case 'paper':
        this.noiseHit(this.uiBus, t, { type: 'highpass', f: 2500, f2: 5000, dur: 0.3, vol: 0.18 * v, a: 0.05 });
        break;
      case 'cabinet':
        this.noiseHit(o, t, { f: 400, q: 1, dur: 0.4, vol: 0.4 * v, a: 0.05 });
        this.tone(o, t, { type: 'sawtooth', f: 220, f2: 330, dur: 0.4, vol: 0.03 * v });
        break;
      case 'drawer':
        this.noiseHit(o, t, { type: 'bandpass', f: 800, q: 2, dur: 0.5, vol: 0.4 * v, a: 0.05 });
        this.noiseHit(o, t + 0.5, { f: 300, q: 2, dur: 0.1, vol: 0.4 * v });
        break;
      case 'relayOn':
      case 'relayOff':
        this.noiseHit(o, t, { f: 3000, q: 5, dur: 0.03, vol: 0.3 * v });
        this.tone(o, t, { type: 'sine', f: name === 'relayOn' ? 100 : 80, dur: 0.4, vol: 0.12 * v });
        break;
      case 'powerDown':
        this.tone(this.sfxBus, t, { type: 'sawtooth', f: 120, f2: 25, dur: 2.5, vol: 0.18 * v });
        this.noiseHit(this.sfxBus, t, { type: 'lowpass', f: 900, f2: 60, dur: 2.5, vol: 0.4 * v, brown: true });
        break;
      case 'powerUp':
        this.tone(this.sfxBus, t, { type: 'sawtooth', f: 30, f2: 120, dur: 2.2, vol: 0.14 * v, a: 0.3 });
        for (let i = 0; i < 6; i++) this.noiseHit(this.sfxBus, t + 0.4 + i * 0.22, { f: 2800, q: 6, dur: 0.03, vol: 0.25 * v });
        break;
      case 'bang':
      case 'distantBang':
      case 'slam': {
        const far = name === 'distantBang';
        this.noiseHit(o, t, { type: 'lowpass', f: far ? 400 : 1200, f2: 80, dur: far ? 1.2 : 0.6, vol: (far ? 0.7 : 1.1) * v, brown: true });
        this.tone(o, t, { type: 'sine', f: 70, f2: 35, dur: 0.6, vol: 0.4 * v });
        break;
      }
      case 'alarm':
        for (let i = 0; i < 4; i++) this.tone(o, t + i * 0.7, { type: 'square', f: 620, f2: 480, dur: 0.6, vol: 0.05 * v });
        break;
      case 'cctvOn':
      case 'cctvSwitch':
        this.noiseHit(this.uiBus, t, { type: 'highpass', f: 3000, dur: 0.15, vol: 0.25 * v });
        this.tone(this.uiBus, t, { type: 'sine', f: 15000, dur: 0.2, vol: 0.02 * v });
        break;
      case 'charge':
        this.tone(o, t, { type: 'sine', f: 400, f2: 1600, dur: 3.3, vol: 0.04 * v, a: 0.2 });
        break;
      case 'battery':
        this.noiseHit(this.uiBus, t, { f: 1800, q: 4, dur: 0.05, vol: 0.4 * v });
        this.noiseHit(this.uiBus, t + 0.18, { f: 1400, q: 4, dur: 0.05, vol: 0.4 * v });
        break;
      case 'flashlight':
        this.noiseHit(this.uiBus, t, { f: 3500, q: 6, dur: 0.025, vol: 0.5 * v });
        break;
      case 'clickDead':
        this.noiseHit(this.uiBus, t, { f: 2500, q: 6, dur: 0.02, vol: 0.3 * v });
        this.noiseHit(this.uiBus, t + 0.12, { f: 2500, q: 6, dur: 0.02, vol: 0.3 * v });
        break;
      case 'breath':
        for (let i = 0; i < 3; i++) this.noiseHit(this.uiBus, t + i * 0.7, { type: 'bandpass', f: 900, q: 0.8, dur: 0.5, vol: 0.2 * v, a: 0.15 });
        break;
      case 'fuse':
        this.noiseHit(o, t, { f: 2200, q: 4, dur: 0.05, vol: 0.4 * v });
        this.tone(o, t + 0.05, { type: 'square', f: 50, dur: 0.3, vol: 0.08 * v });
        break;
      case 'lever':
        this.noiseHit(o, t, { f: 600, q: 2, dur: 0.3, vol: 0.6 * v });
        this.noiseHit(o, t + 0.3, { type: 'lowpass', f: 500, dur: 0.2, vol: 0.6 * v });
        break;
      case 'liftCall':
      case 'txStart':
      case 'keyTurn':
      case 'testStart':
        this.tone(o, t, { type: 'square', f: 880, dur: 0.12, vol: 0.05 * v });
        this.tone(o, t + 0.2, { type: 'square', f: 660, dur: 0.12, vol: 0.05 * v });
        this.noiseHit(o, t + 0.3, { type: 'lowpass', f: 200, dur: 2.5, vol: 0.3 * v, a: 0.5, brown: true });
        break;
      case 'liftArrive':
        this.tone(o, t, { type: 'sine', f: 1046, dur: 1.2, vol: 0.12 * v });
        this.noiseHit(o, t + 0.3, { type: 'lowpass', f: 400, dur: 1.5, vol: 0.5 * v, brown: true });
        break;
      case 'caught':
        this.noiseHit(this.sfxBus, t, { type: 'bandpass', f: 2000, f2: 300, q: 1, dur: 1.4, vol: 1.0 * v });
        this.tone(this.sfxBus, t, { type: 'sawtooth', f: 900, f2: 60, dur: 1.4, vol: 0.2 * v });
        this.tone(this.sfxBus, t, { type: 'square', f: 47, dur: 2, vol: 0.2 * v });
        break;
      case 'stingSoft':
        this.tone(this.musicBus, t, { type: 'sine', f: 1975, dur: 2.5, vol: 0.06 * v, a: 0.4 });
        this.tone(this.musicBus, t, { type: 'sine', f: 2093, dur: 2.5, vol: 0.05 * v, a: 0.4 });
        break;
      case 'stingLow':
        this.tone(o, t, { type: 'sawtooth', f: 55, dur: 2.5, vol: 0.12 * v, a: 0.6 });
        this.tone(o, t, { type: 'sawtooth', f: 58.3, dur: 2.5, vol: 0.12 * v, a: 0.6 });
        break;
      case 'flickerBuzz':
        for (let i = 0; i < 5; i++) this.tone(o, t + i * 0.08, { type: 'square', f: 100, dur: 0.05, vol: 0.05 * v });
        break;
      case 'whisperStatic':
        this.noiseHit(o, t, { type: 'bandpass', f: 1200, q: 3, dur: 1.6, vol: 0.18 * v, a: 0.4 });
        this.formantBabble(o, t + 0.3, 1.2, 0.03 * v, 140);
        break;
      default:
        this.tone(o, t, { f: 440, dur: 0.05, vol: 0.02 });
    }
  }

  /** UI click for menus. */
  ui(kind: 'move' | 'ok' | 'back') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(this.uiBus, t, { type: 'triangle', f: kind === 'ok' ? 880 : kind === 'back' ? 330 : 600, dur: 0.05, vol: 0.05 });
  }

  /** Voice-like formant babble: an unintelligible, distorted voice under the subtitles. */
  private formantBabble(dest: AudioNode, t: number, dur: number, vol: number, pitch: number) {
    const ctx = this.ctx!;
    const os = ctx.createOscillator();
    os.type = 'sawtooth';
    os.frequency.setValueAtTime(pitch, t);
    const syll = Math.max(2, Math.floor(dur * 5));
    for (let i = 0; i < syll; i++) os.frequency.linearRampToValueAtTime(pitch * (0.85 + Math.random() * 0.35), t + (i + 1) * (dur / syll));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 8;
    for (let i = 0; i < syll; i++) {
      const st = t + i * (dur / syll);
      g.gain.linearRampToValueAtTime(vol * (0.6 + Math.random() * 0.4), st + 0.03);
      g.gain.linearRampToValueAtTime(vol * 0.15, st + dur / syll - 0.02);
      f1.frequency.setValueAtTime(400 + Math.random() * 500, st);
      f2.frequency.setValueAtTime(1100 + Math.random() * 1200, st);
    }
    g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    os.connect(f1).connect(g);
    os.connect(f2).connect(g);
    g.connect(dest);
    os.start(t);
    os.stop(t + dur + 0.1);
  }

  /** A transmission: radio static + babble, or the clean synthetic voice of NADZORCA. */
  voice(who: string, seconds: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = Math.max(ctx.currentTime + 0.02, this.voiceUntil);
    this.voiceUntil = t + seconds;
    const bus = this.uiBus;
    if (who === 'RADIO') {
      this.noiseHit(bus, t, { type: 'bandpass', f: 1800, q: 0.7, dur: seconds, vol: 0.08, a: 0.1 });
      this.formantBabble(bus, t + 0.15, seconds - 0.3, 0.05, 190);
    } else if (who === 'NADZORCA') {
      this.tone(bus, t, { type: 'sine', f: 1318, dur: 0.12, vol: 0.05 });
      this.tone(bus, t + 0.14, { type: 'sine', f: 988, dur: 0.18, vol: 0.05 });
      this.formantBabble(bus, t + 0.35, seconds - 0.4, 0.035, 110);
    } else if (who === 'TY') {
      this.formantBabble(bus, t, seconds * 0.6, 0.02, 120);
    }
  }

  // ------------------------------------------------------------------ ambience
  private startBeds() {
    const ctx = this.ctx!;
    const mk = (key: string, build: (g: GainNode) => AudioScheduledSourceNode[]) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.ambBus);
      const nodes = build(g);
      this.beds[key] = { gain: g, stop: () => nodes.forEach((n) => n.stop()) };
    };
    // ventilation: brown noise through a lowpass with slow drift
    mk('vent', (g) => {
      const s = ctx.createBufferSource();
      s.buffer = this.brown;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const l = ctx.createOscillator();
      l.frequency.value = 0.07;
      const lg = ctx.createGain();
      lg.gain.value = 80;
      l.connect(lg).connect(f.frequency);
      s.connect(f).connect(g);
      s.start();
      l.start();
      return [s, l];
    });
    // electrical hum of the fluorescent lamps (50 Hz family)
    mk('hum', (g) => {
      const nodes: AudioScheduledSourceNode[] = [];
      for (const [f, v] of [
        [100, 0.5],
        [200, 0.25],
        [300, 0.12],
        [1250, 0.02],
      ]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = v * 0.12;
        o.connect(og).connect(g);
        o.start();
        nodes.push(o);
      }
      return nodes;
    });
    // a sub drone that is felt more than heard
    mk('drone', (g) => {
      const o = ctx.createOscillator();
      o.frequency.value = 41;
      const o2 = ctx.createOscillator();
      o2.frequency.value = 41.6;
      const og = ctx.createGain();
      og.gain.value = 0.18;
      o.connect(og).connect(g);
      o2.connect(og);
      o.start();
      o2.start();
      return [o, o2];
    });
    // tinnitus inside the anechoic chamber
    mk('silence', (g) => {
      const o = ctx.createOscillator();
      o.frequency.value = 8900;
      const og = ctx.createGain();
      og.gain.value = 0.012;
      o.connect(og).connect(g);
      o.start();
      return [o];
    });
    // radio static near the radio / when the enemy is near
    mk('static', (g) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2200;
      f.Q.value = 0.6;
      s.connect(f).connect(g);
      s.start();
      return [s];
    });
  }

  /** Called every frame with the state of the world around the player. */
  ambience(o: { vent: number; hum: number; drone: number; silence: number; staticLvl: number; heart: number }, dt: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.beds.vent) this.startBeds();
    const t = ctx.currentTime;
    this.beds.vent.gain.gain.setTargetAtTime(o.vent * 0.55, t, 0.6);
    this.beds.hum.gain.gain.setTargetAtTime(o.hum, t, 0.15);
    this.beds.drone.gain.gain.setTargetAtTime(o.drone, t, 1.5);
    this.beds.silence.gain.gain.setTargetAtTime(o.silence, t, 1);
    this.beds.static.gain.gain.setTargetAtTime(o.staticLvl * 0.12, t, 0.2);
    // heartbeat when afraid
    this.heart += (o.heart - this.heart) * Math.min(1, dt * 2);
    if (this.heart > 0.15) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 1.05 - this.heart * 0.55;
        const v = 0.25 * this.heart;
        this.tone(this.musicBus, t, { f: 55, f2: 40, dur: 0.12, vol: v });
        this.tone(this.musicBus, t + 0.18, { f: 50, f2: 38, dur: 0.14, vol: v * 0.8 });
      }
    }
  }

  // ------------------------------------------------------------------ music
  setMood(m: Mood) {
    if (m === this.mood) return;
    this.mood = m;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (this.moodGain) {
      const old = this.moodGain;
      const nodes = this.moodNodes;
      old.gain.cancelScheduledValues(t);
      old.gain.setValueAtTime(old.gain.value, t);
      old.gain.linearRampToValueAtTime(0, t + (m === 'chase' ? 0.4 : 2.5));
      window.setTimeout(() => {
        nodes.forEach((n) => {
          try {
            n.stop();
          } catch {
            /* stopped */
          }
        });
        old.disconnect();
      }, 3000);
    }
    this.moodNodes = [];
    this.moodGain = null;
    if (m === 'silence') return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + (m === 'chase' ? 0.3 : 3));
    g.connect(this.musicBus);
    this.moodGain = g;
    const pad = (freqs: number[], vol: number, type: OscillatorType = 'sawtooth', cutoff = 500) => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      const pg = ctx.createGain();
      pg.gain.value = vol;
      f.connect(pg).connect(g);
      for (const fr of freqs)
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = type;
          o.frequency.value = fr;
          o.detune.value = det;
          o.connect(f);
          o.start();
          this.moodNodes.push(o);
        }
      const l = ctx.createOscillator();
      l.frequency.value = 0.05 + Math.random() * 0.05;
      const lg = ctx.createGain();
      lg.gain.value = cutoff * 0.5;
      l.connect(lg).connect(f.frequency);
      l.start();
      this.moodNodes.push(l);
    };
    if (m === 'menu') pad([55, 82.4, 116.5], 0.05, 'sawtooth', 380);
    if (m === 'calm') pad([41.2, 61.7], 0.035, 'triangle', 300);
    if (m === 'tension') {
      pad([46.25, 49, 69.3], 0.05, 'sawtooth', 420);
      pad([370, 392], 0.008, 'sine', 3000);
    }
    if (m === 'chase') {
      pad([55, 58.3, 82.4], 0.06, 'sawtooth', 900);
      pad([440, 466], 0.01, 'sawtooth', 2500);
    }
    if (m === 'final') {
      pad([36.7, 55, 77.8], 0.06, 'sawtooth', 600);
      pad([293.7, 311.1, 415.3], 0.012, 'triangle', 1800);
    }
    this.moodTimer = 0;
    this.moodNext = 0;
  }

  /** Rhythmic elements of the current mood. */
  tick(dt: number) {
    const ctx = this.ctx;
    if (!ctx || !this.moodGain) return;
    this.moodTimer += dt;
    if (this.moodTimer < this.moodNext) return;
    const t = ctx.currentTime + 0.02;
    const g = this.moodGain;
    switch (this.mood) {
      case 'menu':
      case 'calm': {
        this.moodNext = this.moodTimer + 5 + Math.random() * 7;
        // a distant metallic note, detuned
        const f = [196, 207.7, 233.1, 155.6][Math.floor(Math.random() * 4)];
        this.tone(g, t, { type: 'sine', f, dur: 4, vol: 0.035, a: 0.02 });
        this.tone(g, t, { type: 'sine', f: f * 2.76, dur: 2, vol: 0.012, a: 0.02 });
        break;
      }
      case 'tension':
        this.moodNext = this.moodTimer + 1.6;
        this.noiseHit(g, t, { type: 'lowpass', f: 140, dur: 0.4, vol: 0.18, brown: true });
        if (Math.random() < 0.3) this.tone(g, t + 0.8, { type: 'sine', f: 932, f2: 880, dur: 1.5, vol: 0.02, a: 0.2 });
        break;
      case 'chase':
        this.moodNext = this.moodTimer + 0.32;
        this.noiseHit(g, t, { type: 'lowpass', f: 180, dur: 0.15, vol: 0.4, brown: true });
        this.tone(g, t, { type: 'sine', f: 60, f2: 40, dur: 0.15, vol: 0.25 });
        if (Math.random() < 0.4) this.noiseHit(g, t + 0.16, { type: 'highpass', f: 5000, dur: 0.05, vol: 0.08 });
        break;
      case 'final':
        this.moodNext = this.moodTimer + 0.6;
        this.noiseHit(g, t, { type: 'lowpass', f: 200, dur: 0.25, vol: 0.3, brown: true });
        if (Math.random() < 0.25) this.tone(g, t, { type: 'sawtooth', f: 1046, f2: 980, dur: 0.6, vol: 0.015 });
        break;
    }
  }

  get currentMood() {
    return this.mood;
  }
}

export const audio = new Audio();
