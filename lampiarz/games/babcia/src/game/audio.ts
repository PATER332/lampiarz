/**
 * Fully procedural audio engine (WebAudio). No external files.
 */
export type Surface = "wood" | "tile" | "carpet";

export class SoundEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private droneNodes: AudioNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;
  private started = false;
  volume = 0.8;

  init() {
    if (this.started) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    // pre-render noise buffer
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    this.started = true;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(pos: { x: number; y: number; z: number }, fwd: { x: number; y: number; z: number }) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      (l as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(pos.x, pos.y, pos.z);
      (l as unknown as { setOrientation: (a: number, b: number, c: number, d: number, e: number, f: number) => void }).setOrientation(
        fwd.x,
        fwd.y,
        fwd.z,
        0,
        1,
        0,
      );
    }
  }

  private panner(pos: { x: number; y: number; z: number }): PannerNode | null {
    if (!this.ctx || !this.master) return null;
    const p = this.ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "exponential";
    p.refDistance = 1.6;
    p.maxDistance = 90;
    p.rolloffFactor = 1.25;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else {
      (p as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(pos.x, pos.y, pos.z);
    }
    p.connect(this.master);
    return p;
  }

  private noiseSource(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noiseBuffer) return null;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuffer;
    s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.5;
    return s;
  }

  /**
   * Layered footstep synthesis.
   * surface: wood (resonant knock), tile (bright click + ring), carpet (soft muffled shuffle)
   * foot: -1 left / 1 right (stereo offset for local steps)
   * heavy: granny's slippers – slower attack, shuffle tail, lower thump
   */
  footstep(opts: {
    pos?: { x: number; y: number; z: number };
    surface: Surface;
    vol?: number;
    foot?: number;
    heavy?: boolean;
    sprint?: boolean;
  }) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = opts.vol ?? 1;
    const heavy = !!opts.heavy;
    const foot = opts.foot ?? 0;

    // output: positional for others, stereo-local for the player
    let out: AudioNode;
    if (opts.pos) {
      const p = this.panner(opts.pos);
      if (!p) return;
      out = p;
    } else {
      const pan = ctx.createStereoPanner();
      pan.pan.value = foot * 0.22;
      pan.connect(this.master);
      out = pan;
    }
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(out);

    const pitch = 0.9 + Math.random() * 0.2;
    const S = opts.surface;

    // 1) heel thump (sub)
    {
      const o = ctx.createOscillator();
      o.type = "sine";
      const f0 = (heavy ? 70 : S === "carpet" ? 80 : 95) * pitch;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.42, t + (heavy ? 0.2 : 0.12));
      const g = ctx.createGain();
      const amp = (heavy ? 0.55 : S === "carpet" ? 0.3 : S === "tile" ? 0.22 : 0.4) * vol;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + (heavy ? 0.018 : 0.006));
      g.gain.exponentialRampToValueAtTime(0.0005, t + (heavy ? 0.26 : 0.16));
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.3);
    }

    // 2) impact body (filtered noise burst)
    {
      const src = this.noiseSource();
      if (src) {
        src.playbackRate.value = pitch;
        const f = ctx.createBiquadFilter();
        if (S === "tile") {
          f.type = "bandpass";
          f.frequency.value = 2400 * pitch + Math.random() * 800;
          f.Q.value = 3.5;
        } else if (S === "carpet") {
          f.type = "lowpass";
          f.frequency.value = 520 * pitch;
          f.Q.value = 0.6;
        } else {
          f.type = "bandpass";
          f.frequency.value = (heavy ? 420 : 620) * pitch + Math.random() * 180;
          f.Q.value = 1.6;
        }
        const g = ctx.createGain();
        const amp = (S === "tile" ? 0.5 : S === "carpet" ? 0.28 : 0.55) * vol;
        const dur = S === "carpet" ? 0.2 : S === "tile" ? 0.06 : 0.1;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(amp, t + (heavy ? 0.012 : 0.004));
        g.gain.exponentialRampToValueAtTime(0.0005, t + dur + (heavy ? 0.08 : 0));
        src.connect(f).connect(g).connect(bus);
        src.start(t);
        src.stop(t + 0.5);
      }
    }

    // 3) surface character
    if (S === "wood") {
      // hollow floorboard resonance
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = (110 + Math.random() * 90) * pitch;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + 0.004);
      g.gain.linearRampToValueAtTime(0.18 * vol, t + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0004, t + 0.2);
      o.connect(f).connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.25);
    } else if (S === "tile") {
      // glassy ring
      [3150, 4700].forEach((fr, i) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = fr * pitch * (1 + Math.random() * 0.03);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime((i ? 0.035 : 0.06) * vol, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0003, t + 0.18 + Math.random() * 0.08);
        o.connect(g).connect(bus);
        o.start(t);
        o.stop(t + 0.3);
      });
    }

    // 4) toe / scuff follow-up
    {
      const delay = heavy ? 0.14 + Math.random() * 0.05 : opts.sprint ? 0.05 : 0.075 + Math.random() * 0.03;
      const src = this.noiseSource();
      if (src) {
        const f = ctx.createBiquadFilter();
        f.type = S === "tile" ? "highpass" : "bandpass";
        f.frequency.value = S === "tile" ? 2800 : S === "carpet" ? 700 : 1100;
        f.Q.value = 1;
        const g = ctx.createGain();
        const amp = (heavy ? 0.22 : S === "carpet" ? 0.08 : 0.14) * vol;
        g.gain.setValueAtTime(0.0001, t + delay);
        g.gain.linearRampToValueAtTime(amp, t + delay + (heavy ? 0.03 : 0.004));
        g.gain.exponentialRampToValueAtTime(0.0003, t + delay + (heavy ? 0.22 : 0.05));
        src.connect(f).connect(g).connect(bus);
        src.start(t + delay);
        src.stop(t + delay + 0.35);
      }
    }

    // 5) heavy: slipper drag
    if (heavy) {
      const src = this.noiseSource();
      if (src) {
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.setValueAtTime(900, t + 0.1);
        f.frequency.linearRampToValueAtTime(400, t + 0.42);
        f.Q.value = 0.8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + 0.1);
        g.gain.linearRampToValueAtTime(0.12 * vol, t + 0.2);
        g.gain.exponentialRampToValueAtTime(0.0003, t + 0.45);
        src.connect(f).connect(g).connect(bus);
        src.start(t + 0.1);
        src.stop(t + 0.5);
      }
    }
  }

  /** Legacy wrapper. */
  step(pos: { x: number; y: number; z: number }, vol = 1, hard = false) {
    this.footstep({ pos, surface: "wood", vol, heavy: hard });
  }

  /** Granny dragging her bat along the floor while hunting. */
  batDrag(pos: { x: number; y: number; z: number }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const p = this.panner(pos);
    if (!p) return;
    const src = this.noiseSource();
    if (!src) return;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(1800, t);
    f.frequency.linearRampToValueAtTime(900, t + 0.8);
    f.Q.value = 6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.2);
    g.gain.linearRampToValueAtTime(0.1, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0003, t + 0.9);
    src.connect(f).connect(g).connect(p);
    src.start(t);
    src.stop(t + 1);
  }

  /** Raspy old-woman whisper (formant-filtered breath). */
  whisper(dur = 1.4, vol = 1) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    if (!src) return;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.linearRampToValueAtTime(0.16 * vol, t + 0.12);
    // syllable-like amplitude wobble
    const syll = 3 + Math.floor(dur * 4);
    for (let i = 1; i <= syll; i++) {
      const at = t + (i / syll) * dur;
      bus.gain.linearRampToValueAtTime((0.05 + Math.random() * 0.14) * vol, at - dur / syll / 2);
      bus.gain.linearRampToValueAtTime((0.02 + Math.random() * 0.05) * vol, at);
    }
    bus.gain.exponentialRampToValueAtTime(0.0003, t + dur + 0.25);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(0.3, t);
    pan.pan.linearRampToValueAtTime(-0.2, t + dur);
    bus.connect(pan).connect(this.master);
    [[650, 6], [1400, 8], [2600, 10]].forEach(([f, q]) => {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(f, t);
      bp.frequency.linearRampToValueAtTime(f * (0.8 + Math.random() * 0.4), t + dur);
      bp.Q.value = q;
      src.connect(bp).connect(bus);
    });
    src.start(t);
    src.stop(t + dur + 0.4);
  }

  /** Heavy door slam, non-positional. */
  slam() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.9);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1);
    const src = this.noiseSource();
    if (src) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(3000, t);
      lp.frequency.exponentialRampToValueAtTime(200, t + 0.4);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.7, t);
      ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
      src.connect(lp).connect(ng).connect(this.master);
      src.start(t);
      src.stop(t + 0.6);
    }
    // rattle after-shock
    for (let i = 1; i <= 3; i++) {
      const r = this.noiseSource();
      if (!r) continue;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 500 + i * 300;
      const rg = ctx.createGain();
      const at = t + 0.12 * i;
      rg.gain.setValueAtTime(0.0001, at);
      rg.gain.linearRampToValueAtTime(0.12 / i, at + 0.01);
      rg.gain.exponentialRampToValueAtTime(0.0003, at + 0.12);
      r.connect(bp).connect(rg).connect(this.master);
      r.start(at);
      r.stop(at + 0.2);
    }
  }

  /** Cloth rustle when crouching / hiding. */
  rustle(vol = 1) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const src = this.noiseSource();
    if (!src) return;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1500;
    f.Q.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.08 * vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0003, t + 0.3);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.35);
  }

  /** Wooden creak. */
  creak(pos: { x: number; y: number; z: number }, vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const p = this.panner(pos);
    if (!p) return;
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    const f0 = 180 + Math.random() * 160;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (1.4 + Math.random()), t + 0.5);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16 * vol, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.75);
    o.connect(lp).connect(g).connect(p);
    o.start(t);
    o.stop(t + 0.8);
  }

  /** Metallic / wooden bang. */
  bang(pos: { x: number; y: number; z: number }, vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const p = this.panner(pos);
    if (!p) return;
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g).connect(p);
    o.start(t);
    o.stop(t + 0.45);
    const src = this.noiseSource();
    if (src) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1600;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.3 * vol, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      src.connect(bp).connect(ng).connect(p);
      src.start(t);
      src.stop(t + 0.25);
    }
  }

  pickup() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.linearRampToValueAtTime(0.12, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0005, t + i * 0.09 + 0.4);
      o.connect(g).connect(this.master!);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 0.5);
    });
  }

  unlock() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator();
      o.type = "square";
      o.frequency.value = 300 + i * 120;
      const g = this.ctx.createGain();
      const s = t + i * 0.11;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.1, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0004, s + 0.18);
      o.connect(g).connect(this.master);
      o.start(s);
      o.stop(s + 0.2);
    }
  }

  heartbeat(intensity: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const thump = (at: number, amp: number) => {
      const o = this.ctx!.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(78, at);
      o.frequency.exponentialRampToValueAtTime(34, at + 0.18);
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(amp, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0005, at + 0.24);
      o.connect(g).connect(this.master!);
      o.start(at);
      o.stop(at + 0.3);
    };
    thump(t, 0.22 * intensity);
    thump(t + 0.19, 0.14 * intensity);
  }

  breath(vol = 1) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const src = this.noiseSource();
    if (!src) return;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.linearRampToValueAtTime(1100, t + 0.5);
    bp.Q.value = 1.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09 * vol, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 0.75);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.8);
  }

  /** Granny's creepy hum, positional. */
  hum(pos: { x: number; y: number; z: number }) {
    if (!this.ctx) return;
    const notes = [329.6, 293.7, 246.9, 261.6];
    const start = this.ctx.currentTime + 0.05;
    const p = this.panner(pos);
    if (!p) return;
    notes.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = "triangle";
      o.frequency.value = f * (Math.random() < 0.15 ? 0.5 : 1);
      const lp = this.ctx!.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 800;
      const g = this.ctx!.createGain();
      const s = start + i * 0.42;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.075, s + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0004, s + 0.4);
      o.connect(lp).connect(g).connect(p!);
      o.start(s);
      o.stop(s + 0.45);
    });
  }

  scream() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.5);
    g.connect(this.master);
    [420, 610, 905].forEach((f) => {
      const o = this.ctx!.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 1.7, t + 0.3);
      o.frequency.linearRampToValueAtTime(f * 0.55, t + 1.3);
      const bp = this.ctx!.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1200;
      bp.Q.value = 2;
      o.connect(bp).connect(g);
      o.start(t);
      o.stop(t + 1.6);
    });
    const src = this.noiseSource();
    if (src) {
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 700;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.3, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      src.connect(hp).connect(ng).connect(g);
      src.start(t);
      src.stop(t + 1.3);
    }
  }

  sting() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    [110, 116, 220, 233].forEach((f) => {
      const o = this.ctx!.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, t);
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.13, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 1.1);
      o.connect(g).connect(this.master!);
      o.start(t);
      o.stop(t + 1.2);
    });
  }

  victory() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    [261.6, 329.6, 392, 523.3].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      const g = this.ctx!.createGain();
      const s = t + i * 0.14;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.14, s + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0005, s + 1.4);
      o.connect(g).connect(this.master!);
      o.start(s);
      o.stop(s + 1.5);
    });
  }

  /** Continuous dread drone. */
  startAmbient() {
    if (!this.ctx || !this.master || this.ambientGain) return;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.14, this.ctx.currentTime + 4);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 340;
    lp.connect(g).connect(this.master);
    [41, 55, 82.4, 61.7].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = i % 2 ? "sine" : "triangle";
      o.frequency.value = f;
      const lfo = this.ctx!.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.037;
      const lg = this.ctx!.createGain();
      lg.gain.value = 0.6;
      lfo.connect(lg).connect(o.frequency);
      o.connect(lp);
      o.start();
      lfo.start();
      this.droneNodes.push(o, lfo);
    });
    // airy noise layer
    const src = this.noiseSource();
    if (src) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 260;
      bp.Q.value = 0.7;
      const ng = this.ctx.createGain();
      ng.gain.value = 0.09;
      src.connect(bp).connect(ng).connect(lp);
      src.start();
      this.droneNodes.push(src);
    }
    this.ambientGain = g;
  }

  setDread(v: number) {
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(0.1 + v * 0.35, this.ctx.currentTime, 0.6);
    }
  }

  stopAmbient() {
    if (!this.ctx) return;
    this.droneNodes.forEach((n) => {
      try {
        (n as OscillatorNode).stop();
      } catch {
        /* noop */
      }
      n.disconnect();
    });
    this.droneNodes = [];
    if (this.ambientGain) {
      this.ambientGain.disconnect();
      this.ambientGain = null;
    }
  }
}

export const sound = new SoundEngine();
