// Frame rendering: shadow pass for the flashlight, lit forward pass into an HDR
// target, dust, bloom and the final grade. Also renders CCTV views and the small
// live feed shown on the monitor wall.
import type { Sim } from '../game/sim';
import type { Settings } from '../game/state';
import { buildScene, MATS, type DynDef, type MatKey } from '../world/scene';
import { CAMERAS, LIGHTS, PICKUPS, type LightDef } from '../world/map';
import { Level } from '../world/level';
import { Screens, type ScreenId } from '../world/screens';
import { createShadowTarget, createTarget, deleteMesh, deleteTarget, drawMesh, Program, solidTexture, textureFromCanvas, updateTexture, type GL, type Mesh, type ShadowTarget, type Target } from './gl';
import { compose, forward, lookAt, mat4, multiply, perspective, type Mat4, type Vec3 } from './math';
import { MeshBuilder } from './mesh';
import { BLUR_FS, BRIGHT_FS, DEPTH_FS, DEPTH_VS, DUST_FS, DUST_VS, LIT_FS, LIT_VS, MAX_LIGHTS, POST_FS, QUAD_VS } from './shaders';
import { GENERATORS, signCanvas, type MaterialName } from './textures';

interface MatGL {
  albedo: WebGLTexture;
  normal: WebGLTexture;
  def: (typeof MATS)[MatKey];
}

interface Dyn {
  def: DynDef;
  mesh: Mesh;
  model: Mat4;
  tex?: WebGLTexture;
  emissive: number;
  emisColor: Vec3;
  visible: boolean;
  castShadow: boolean;
}

export interface ViewParams {
  /** CCTV camera index or -1 for the player's eyes */
  cctv: number;
  fear: number;
  hurt: number;
  glitch: number;
  fade: number;
  bob: [number, number];
}

const LIGHT_COLOR: Record<LightDef['kind'], Vec3> = {
  fluo: [0.82, 0.93, 1.0],
  cold: [0.62, 0.8, 1.05],
  red: [1.0, 0.1, 0.06],
  warm: [1.0, 0.7, 0.42],
  lamp: [1.0, 0.68, 0.38],
  screen: [0.35, 0.65, 1.0],
};

export class Renderer {
  gl: GL;
  lit!: Program;
  depth!: Program;
  dust!: Program;
  bright!: Program;
  blur!: Program;
  post!: Program;
  mats = new Map<MatKey, MatGL>();
  statics: { mat: MatKey; mesh: Mesh }[] = [];
  dyns: Dyn[] = [];
  unitBox!: Mesh;
  dustVao!: WebGLVertexArrayObject;
  dustBuf!: WebGLBuffer;
  emptyVao!: WebGLVertexArrayObject;
  scene!: Target;
  feed!: Target;
  bloomA!: Target;
  bloomB!: Target;
  shadow!: ShadowTarget;
  dummyShadow!: ShadowTarget;
  shadowSize = 0;
  white!: WebGLTexture;
  flatNormal!: WebGLTexture;
  screens = new Screens();
  screenTex = new Map<string, WebGLTexture>();
  signTex = new Map<string, WebGLTexture>();
  signText = new Map<string, string>();
  width = 1;
  height = 1;
  time = 0;
  feedCam = 0;
  feedT = 0;
  feedSwitchT = 0;
  floatOK = false;
  private vp = mat4();
  private proj = mat4();
  private view = mat4();
  private shadowVP = mat4();
  private lightPos = new Float32Array(MAX_LIGHTS * 4);
  private lightCol = new Float32Array(MAX_LIGHTS * 3);
  private nLights = 0;
  private spot = { on: false, pos: [0, 0, 0] as Vec3, dir: [0, 0, -1] as Vec3, col: [0, 0, 0] as Vec3 };
  private camPos: Vec3 = [0, 0, 0];
  quality: Settings['quality'] = 'medium';
  renderScale = 1;
  reduced = false;
  lost = false;

  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WEBGL2_UNAVAILABLE');
    this.gl = gl;
    this.floatOK = !!gl.getExtension('EXT_color_buffer_float');
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
  }

  /** Load everything; `progress` receives (done, total, label) after each real step. */
  async load(progress: (done: number, total: number, label: string) => void) {
    const gl = this.gl;
    const names = Object.keys(GENERATORS) as MaterialName[];
    const total = names.length + 6;
    let done = 0;
    const step = async (label: string) => {
      done++;
      progress(done, total, label);
      await new Promise((r) => setTimeout(r, 0));
    };
    this.lit = new Program(gl, LIT_VS, LIT_FS, 'lit');
    this.depth = new Program(gl, DEPTH_VS, DEPTH_FS, 'depth');
    this.dust = new Program(gl, DUST_VS, DUST_FS, 'dust');
    this.bright = new Program(gl, QUAD_VS, BRIGHT_FS, 'bright');
    this.blur = new Program(gl, QUAD_VS, BLUR_FS, 'blur');
    this.post = new Program(gl, QUAD_VS, POST_FS, 'post');
    await step('Kompilacja shaderów');
    this.white = solidTexture(gl, 255, 255, 255);
    this.flatNormal = solidTexture(gl, 128, 128, 255);
    this.dummyShadow = createShadowTarget(gl, 4);
    const texByName = new Map<MaterialName, { a: WebGLTexture; n: WebGLTexture }>();
    for (const n of names) {
      const t = GENERATORS[n]();
      texByName.set(n, { a: textureFromCanvas(gl, t.albedo, { aniso: 8 }), n: textureFromCanvas(gl, t.normal, { aniso: 8 }) });
      await step(`Materiały: ${n}`);
    }
    for (const [k, def] of Object.entries(MATS) as [MatKey, (typeof MATS)[MatKey]][]) {
      const t = texByName.get(def.tex)!;
      this.mats.set(k, { albedo: t.a, normal: t.n, def });
    }
    // geometry
    const level = new Level();
    const data = buildScene(level);
    for (const [mat, mb] of data.statics) this.statics.push({ mat, mesh: mb.build(gl) });
    await step('Geometria ośrodka');
    for (const def of data.dyn) {
      const d: Dyn = { def, mesh: def.mb.build(gl), model: compose([def.x, def.y, def.z], def.yaw), emissive: 0, emisColor: [1, 1, 1], visible: true, castShadow: def.kind === 'door' || def.kind === 'doorSecret' || def.kind === 'container' || def.kind === 'lift' };
      if (def.kind === 'sign') {
        const tex = textureFromCanvas(gl, signCanvas(def.sign!.text, def.sign!.sub, def.ref === 'exitSign' ? { bg: '#0a3a1a', fg: '#a8ffc0', w: 256, h: 96 } : {}), { repeat: false });
        d.tex = tex;
        this.signTex.set(def.key, tex);
        this.signText.set(def.key, def.sign!.text);
      }
      if (def.kind === 'screen') {
        const id = def.screen!;
        if (id === 'feed') continue;
        const c = this.screens.canvases.get(id as ScreenId);
        if (c && !this.screenTex.has(id)) this.screenTex.set(id, textureFromCanvas(gl, c, { repeat: false, mips: false }));
        d.tex = this.screenTex.get(id);
      }
      this.dyns.push(d);
    }
    // the live feed on the monitor wall
    this.feed = createTarget(gl, 320, 180, { depth: true });
    for (const def of data.dyn)
      if (def.kind === 'screen' && def.screen === 'feed') {
        this.dyns.push({ def, mesh: def.mb.build(gl), model: compose([def.x, def.y, def.z], def.yaw), tex: this.feed.tex, emissive: 1, emisColor: [1, 1, 1], visible: true, castShadow: false });
      }
    await step('Obiekty ruchome');
    const ub = new MeshBuilder();
    ub.box(0, 0, 0, 1, 1, 1, { uv: 0.6 });
    this.unitBox = ub.build(gl);
    // dust
    const N = 900;
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pts[i * 3] = Math.random() * 12;
      pts[i * 3 + 1] = Math.random() * 3.2;
      pts[i * 3 + 2] = Math.random() * 12;
    }
    this.dustVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.dustVao);
    this.dustBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dustBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.emptyVao = gl.createVertexArray()!;
    gl.bindVertexArray(null);
    await step('Pył i atmosfera');
    this.resize(this.canvas.clientWidth || 1280, this.canvas.clientHeight || 720);
    await step('Bufory obrazu');
    // warm up: compile all program variants by drawing one frame later
    await step('Gotowe');
  }

  setSettings(s: Settings) {
    const changed = s.quality !== this.quality || s.renderScale !== this.renderScale;
    this.quality = s.quality;
    this.renderScale = s.renderScale;
    this.reduced = s.reduced;
    if (changed) this.resize(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  resize(cssW: number, cssH: number) {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.25);
    this.width = Math.max(1, Math.round(cssW * dpr));
    this.height = Math.max(1, Math.round(cssH * dpr));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const sw = Math.max(1, Math.round(this.width * this.renderScale * (this.quality === 'low' ? 0.75 : 1)));
    const sh = Math.max(1, Math.round(this.height * this.renderScale * (this.quality === 'low' ? 0.75 : 1)));
    if (this.scene) deleteTarget(gl, this.scene);
    if (this.bloomA) deleteTarget(gl, this.bloomA);
    if (this.bloomB) deleteTarget(gl, this.bloomB);
    this.scene = createTarget(gl, sw, sh, { float: this.floatOK, depth: true });
    this.bloomA = createTarget(gl, Math.max(1, sw >> 2), Math.max(1, sh >> 2), { float: this.floatOK });
    this.bloomB = createTarget(gl, Math.max(1, sw >> 2), Math.max(1, sh >> 2), { float: this.floatOK });
    const ss = this.quality === 'high' ? 1024 : this.quality === 'medium' ? 512 : 0;
    if (ss !== this.shadowSize) {
      this.shadowSize = ss;
      if (this.shadow) {
        gl.deleteFramebuffer(this.shadow.fb);
        gl.deleteTexture(this.shadow.tex);
      }
      if (ss) this.shadow = createShadowTarget(gl, ss);
    }
  }

  // ------------------------------------------------------------------ per-frame state
  private pickLights(sim: Sim, camPos: Vec3, extraFlicker: number) {
    const cand: { i: number; d: number; l: LightDef; k: number }[] = [];
    LIGHTS.forEach((l, i) => {
      if (!sim.lightActive(l, i)) return;
      const d = Math.hypot(l.x - camPos[0], l.z - camPos[2]);
      if (d - l.range > 22) return;
      let k = 1;
      if (l.flicker && !this.reduced) {
        const t = this.time * (7 + i);
        const n = Math.sin(t) * Math.sin(t * 2.3 + i) * Math.sin(t * 0.37 + i * 3.1);
        if (n > 1 - l.flicker * 1.6) k = 0.15;
      }
      if (extraFlicker > 0 && Math.random() < extraFlicker * 0.3 && l.kind !== 'red') k *= 0.3;
      if (l.id === 'beacon') k *= 0.4 + 0.6 * Math.max(0, Math.sin(this.time * 6));
      cand.push({ i, d, l, k });
    });
    cand.sort((a, b) => a.d - b.d);
    const n = Math.min(MAX_LIGHTS, cand.length);
    for (let j = 0; j < n; j++) {
      const { l, k } = cand[j];
      const c = LIGHT_COLOR[l.kind];
      this.lightPos.set([l.x, l.y - 0.1, l.z, l.range], j * 4);
      this.lightCol.set([c[0] * l.intensity * k, c[1] * l.intensity * k, c[2] * l.intensity * k], j * 3);
    }
    this.nLights = n;
    return cand;
  }

  private updateDyns(sim: Sim, lit: { i: number; k: number }[]) {
    const litMap = new Map(lit.map((x) => [x.i, x.k]));
    const sp = sim.player;
    for (const d of this.dyns) {
      const def = d.def;
      d.visible = true;
      d.emissive = 0;
      switch (def.kind) {
        case 'door':
        case 'doorSecret': {
          const a = sim.doorAnim[def.ref!] ?? 0;
          const s = def.slide!;
          d.model = compose([def.x + s[0] * a, def.y + s[1] * a, def.z + s[2] * a], def.yaw);
          break;
        }
        case 'container': {
          const open = sim.state.opened.includes(def.ref!) ? 1 : 0;
          if (def.slide) {
            const ox = Math.sin(def.yaw);
            const oz = Math.cos(def.yaw);
            // slide out along the front (-Z local)
            d.model = compose([def.x + ox * def.slide[2] * open, def.y, def.z + oz * def.slide[2] * open], def.yaw);
          } else d.model = compose([def.x, def.y, def.z], def.yaw + open * -1.9);
          break;
        }
        case 'lift': {
          const a = sim.liftOpen;
          const s = def.slide!;
          const c = Math.cos(def.yaw);
          const si = Math.sin(def.yaw);
          d.model = compose([def.x + (s[0] * c) * a, def.y, def.z - s[0] * si * a], def.yaw);
          break;
        }
        case 'fixture': {
          const l = LIGHTS[def.index!];
          const k = litMap.get(def.index!);
          const on = sim.lightActive(l, def.index!);
          d.emissive = on ? (k ?? 1) * (l.kind === 'red' ? 2.2 : 3.2) : 0.0;
          d.emisColor = LIGHT_COLOR[l.kind];
          break;
        }
        case 'led': {
          if (def.ref === 'charger') {
            d.emissive = sim.powered('cameras') ? 2.5 : 0;
            d.emisColor = sim.charging > 0 ? [1, 0.6, 0.1] : [0.2, 1, 0.3];
            break;
          }
          const dd = sim.doorDef(def.ref!);
          const st = sim.state.doors[def.ref!];
          const powered = sim.doorPowered(dd);
          d.emissive = dd.external ? 2 : powered ? 2.4 : 0;
          d.emisColor = dd.external ? [1, 0.1, 0.05] : st.open || st.unlocked ? [0.15, 1, 0.3] : [1, 0.12, 0.05];
          break;
        }
        case 'sign': {
          d.emissive = def.ref === 'exitSign' ? 1.4 : 0.06;
          d.emisColor = [1, 1, 1];
          const want = sim.signOverride && def.ref === sim.signOverride.id ? sim.signOverride.text : def.sign!.text;
          if (this.signText.get(def.key) !== want) {
            this.signText.set(def.key, want);
            updateTexture(this.gl, d.tex!, signCanvas(want, want === def.sign!.text ? def.sign!.sub : '', {}), true);
          }
          break;
        }
        case 'screen': {
          const id = def.screen!;
          const powered = id === 'feed' || id === 'wall' ? sim.powered('cameras') : id === 'term_chamber' ? sim.powered('sector_c') : id === 'radio' ? true : id === 'lift' ? true : id === 'panel' ? true : sim.state.power.main || sim.powered('lights_rooms');
          d.emissive = powered ? (id === 'feed' ? 1.6 : 1.1) : 0.02;
          d.emisColor = [1, 1, 1];
          if (id === 'feed') d.visible = sim.powered('cameras');
          break;
        }
        case 'pickup': {
          const pk = PICKUPS.find((p) => p.id === def.ref)!;
          d.visible = sim.pickupAvailable(pk) || (!!pk.inside && !sim.state.pickedUp.includes(pk.id));
          const near = Math.hypot(pk.x - sp.x, pk.z - sp.z) < 4.5 && sim.pickupAvailable(pk);
          d.emissive = near ? 0.18 + 0.12 * Math.sin(this.time * 3) : 0;
          d.emisColor = [1, 0.9, 0.7];
          break;
        }
        case 'lever':
          d.model = compose([def.x, def.y, def.z], def.yaw, sim.has('emergencyUnlocked') ? 2.6 : 0.4);
          break;
      }
    }
  }

  // ------------------------------------------------------------------ drawing helpers
  private bindMat(p: Program, key: MatKey, tex?: WebGLTexture) {
    const gl = this.gl;
    const m = this.mats.get(key)!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex ?? m.albedo);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex ? this.flatNormal : m.normal);
    p.v3('u_tint', tex ? [1, 1, 1] : m.def.tint);
    p.f1('u_rough', m.def.rough);
    p.f1('u_spec', tex ? 0.4 : m.def.spec);
  }

  private setFrame(p: Program, ambient: Vec3, fogCol: Vec3, fog: number, spotOn: boolean, shadowOn: boolean) {
    const gl = this.gl;
    p.m4('u_vp', this.vp);
    p.m4('u_shadowVP', this.shadowVP);
    p.v3('u_camPos', this.camPos);
    p.i1('u_nLights', this.nLights);
    p.f4v('u_lightPos', this.lightPos);
    p.f3v('u_lightCol', this.lightCol);
    p.v3('u_spotPos', this.spot.pos);
    p.v3('u_spotDir', this.spot.dir);
    p.v3('u_spotCol', this.spot.col);
    p.f2('u_spotCone', Math.cos(0.2), Math.cos(0.42));
    p.f1('u_spotRange', spotOn ? 19 : 0);
    p.f1('u_shadowOn', shadowOn ? 1 : 0);
    p.v3('u_ambient', ambient);
    p.v3('u_fogCol', fogCol);
    p.f1('u_fogDensity', fog);
    p.f1('u_time', this.time);
    p.f1('u_alpha', 1);
    p.f2('u_uvScale', 1, 1);
    p.i1('u_albedo', 0);
    p.i1('u_normal', 1);
    p.i1('u_shadowMap', 2);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, shadowOn ? this.shadow.tex : this.dummyShadow.tex);
  }

  private drawWorld(p: Program, sim: Sim, cameraView: number, depthOnly: boolean) {
    const gl = this.gl;
    const ident = mat4();
    for (const s of this.statics) {
      if (!depthOnly) {
        this.bindMat(p, s.mat);
        p.f1('u_emissive', 0);
      }
      p.m4('u_model', ident);
      drawMesh(gl, s.mesh);
    }
    for (const d of this.dyns) {
      if (!d.visible) continue;
      if (depthOnly && !d.castShadow) continue;
      if (!depthOnly) {
        this.bindMat(p, d.def.mat, d.tex);
        p.f1('u_emissive', d.emissive);
        p.v3('u_emisColor', d.emisColor);
      }
      p.m4('u_model', d.model);
      drawMesh(gl, d.mesh);
    }
    this.drawFigures(p, sim, cameraView, depthOnly);
  }

  /** Przestój and the apparitions, built from boxes and animated procedurally. */
  private drawFigures(p: Program, sim: Sim, cameraView: number, depthOnly: boolean) {
    const e = sim.enemy;
    const figs: { x: number; z: number; yaw: number; walk: number; twitch: number; alpha: number }[] = [];
    if (e.visible) figs.push({ x: e.x, z: e.z, yaw: e.yaw, walk: e.speed > 0.1 && e.state !== 'notice' ? e.anim * e.speed * 2.2 : 0, twitch: e.twitch, alpha: 1 });
    for (const a of sim.apparitions) if (!a.cameraOnly || (cameraView >= 0 && CAMERAS[cameraView].id === a.camera)) figs.push({ x: a.x, z: a.z, yaw: a.yaw, walk: 0, twitch: 0.2, alpha: 1 });
    if (!figs.length) return;
    if (!depthOnly) {
      this.bindMat(p, 'fabric');
      p.v3('u_tint', [0.42, 0.43, 0.46]);
      p.f1('u_emissive', 0);
    }
    for (const f of figs) {
      const base = compose([f.x, 0, f.z], f.yaw);
      const jit = f.twitch > 0 && !this.reduced ? (Math.random() - 0.5) * f.twitch * 0.25 : 0;
      const sw = Math.sin(f.walk) * 0.55;
      const part = (pos: Vec3, rx: number, rz: number, size: Vec3, pivotY: number, mat?: MatKey) => {
        if (!depthOnly && mat) this.bindMat(p, mat);
        const joint = compose([pos[0], pos[1], pos[2]], 0, rx, rz);
        const local = compose([0, -pivotY, 0], 0, 0, 0, size);
        const m = multiply(base, multiply(joint, local));
        p.m4('u_model', m);
        drawMesh(this.gl, this.unitBox);
      };
      // legs: thigh and shin
      for (const s of [-1, 1]) {
        const a = sw * s;
        part([s * 0.13, 1.05, 0], a, 0, [0.12, 0.55, 0.12], 0.27);
        const kx = s * 0.13;
        const kz = -Math.sin(a) * 0.55;
        const ky = 1.05 - Math.cos(a) * 0.55;
        part([kx, ky, kz], a + Math.max(0, -a) * 1.2 + 0.05, 0, [0.1, 0.52, 0.1], 0.26);
      }
      // long coat
      part([0, 1.0, 0.02], 0.04 + jit, 0, [0.48, 0.75, 0.3], -0.2, 'fabric');
      // chest, stooped forward
      part([0, 1.42, 0], 0.32 + jit, 0, [0.44, 0.62, 0.26], -0.3);
      // arms: too long, hanging forward
      for (const s of [-1, 1]) {
        const a = -sw * s * 0.6 + 0.35;
        part([s * 0.28, 1.95, -0.18], a, s * 0.08, [0.09, 0.62, 0.09], 0.3);
        const ex = s * 0.3;
        const ez = -0.18 - Math.sin(a) * 0.62;
        const ey = 1.95 - Math.cos(a) * 0.62;
        part([ex, ey, ez], a + 0.4, s * 0.05, [0.08, 0.6, 0.08], 0.3);
        // fingers
        part([ex, ey - Math.cos(a + 0.4) * 0.6, ez - Math.sin(a + 0.4) * 0.6], a + 0.5, 0, [0.07, 0.22, 0.04], 0.1);
      }
      // head wrapped in magnetic tape, tilted
      const ht = 0.5 + jit * 3;
      if (!depthOnly) {
        this.bindMat(p, 'plasticDark');
        p.v3('u_tint', [0.18, 0.15, 0.13]);
      }
      part([0.02, 2.12, -0.32], ht, 0.35 + jit, [0.24, 0.3, 0.26], -0.1);
      for (let i = 0; i < 5; i++) part([-0.1 + i * 0.05, 2.0, -0.42], ht + 0.2, (i - 2) * 0.12, [0.012, 0.5 + (i % 2) * 0.25, 0.012], 0.25);
    }
  }

  // ------------------------------------------------------------------ main render
  render(sim: Sim, dt: number, v: ViewParams, eyeYaw: number, eyePitch: number) {
    if (this.lost) return;
    const gl = this.gl;
    this.time += dt;
    const sp = sim.player;
    const cctv = v.cctv;
    let eye: Vec3;
    let target: Vec3;
    if (cctv >= 0) {
      const c = CAMERAS[cctv];
      eye = [...c.pos];
      const sway = Math.sin(this.time * 0.3) * 0.15;
      target = [c.target[0] + sway, c.target[1], c.target[2]];
    } else {
      const e = sim.eyePos();
      eye = [e[0], e[1] + v.bob[1], e[2]];
      const f = forward(eyeYaw, eyePitch);
      const rx = Math.cos(eyeYaw) * v.bob[0];
      const rz = -Math.sin(eyeYaw) * v.bob[0];
      eye[0] += rx;
      eye[2] += rz;
      target = [eye[0] + f[0], eye[1] + f[1], eye[2] + f[2]];
    }
    this.camPos = eye;
    const aspect = this.width / this.height;
    perspective(cctv >= 0 ? 1.15 : 1.22, aspect, 0.05, 80, this.proj);
    lookAt(eye, target, [0, 1, 0], this.view);
    multiply(this.proj, this.view, this.vp);

    const lit = this.pickLights(sim, eye, sim.fear > 0.5 ? sim.fear : 0);
    this.updateDyns(sim, lit);
    // screens
    for (const id of this.screens.update(sim, dt)) {
      const t = this.screenTex.get(id);
      if (t) updateTexture(gl, t, this.screens.canvases.get(id)!);
    }

    // flashlight
    const spotOn = sim.flashlight && cctv < 0 && !sp.hidden;
    if (spotOn) {
      const f = forward(eyeYaw, eyePitch);
      const r: Vec3 = [Math.cos(eyeYaw), 0, -Math.sin(eyeYaw)];
      this.spot.pos = [eye[0] + r[0] * 0.18, eye[1] - 0.22, eye[2] + r[2] * 0.18];
      this.spot.dir = f;
      const b = sim.state.battery;
      let k = b < 0.15 ? 0.4 + 0.6 * (Math.random() < 0.85 ? 1 : 0.2) : 1;
      k *= 0.55 + 0.45 * Math.min(1, b * 3);
      this.spot.col = [2.6 * k, 2.4 * k, 2.1 * k];
    }
    const shadowOn = spotOn && this.shadowSize > 0;
    if (shadowOn) {
      const sproj = perspective(0.95, 1, 0.1, 22);
      const sview = lookAt(this.spot.pos, [this.spot.pos[0] + this.spot.dir[0], this.spot.pos[1] + this.spot.dir[1], this.spot.pos[2] + this.spot.dir[2]], Math.abs(this.spot.dir[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0]);
      multiply(sproj, sview, this.shadowVP);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.fb);
      gl.viewport(0, 0, this.shadow.size, this.shadow.size);
      gl.enable(gl.DEPTH_TEST);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(2, 4);
      this.depth.use();
      this.depth.m4('u_vp', this.shadowVP);
      this.drawWorld(this.depth, sim, cctv, true);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // live feed for the monitor wall
    if (cctv < 0 && sim.zone === 'monitoring' && sim.powered('cameras')) this.renderFeed(sim, dt);

    // main pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb);
    gl.viewport(0, 0, this.scene.w, this.scene.h);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    const fog: Vec3 = cctv >= 0 ? [0.01, 0.012, 0.012] : [0.006, 0.008, 0.012];
    gl.clearColor(fog[0], fog[1], fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.lit.use();
    const amb: Vec3 = cctv >= 0 ? [0.05, 0.055, 0.05] : [0.012, 0.014, 0.019];
    this.setFrame(this.lit, amb, fog, cctv >= 0 ? 0.03 : 0.055, spotOn, shadowOn);
    this.drawWorld(this.lit, sim, cctv, false);

    // dust
    if (!this.reduced && cctv < 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false);
      this.dust.use();
      this.dust.m4('u_vp', this.vp);
      this.dust.v3('u_center', eye);
      this.dust.f1('u_time', this.time);
      this.dust.v3('u_spotPos', this.spot.pos);
      this.dust.v3('u_spotDir', this.spot.dir);
      this.dust.f2('u_spotCone', Math.cos(0.18), Math.cos(0.4));
      this.dust.f1('u_spotOn', spotOn ? 1 : 0);
      this.dust.f1('u_px', this.scene.h * 0.004);
      gl.bindVertexArray(this.dustVao);
      gl.drawArrays(gl.POINTS, 0, 900);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // bloom
    const bloom = this.quality !== 'low' && !this.reduced;
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.emptyVao);
    if (bloom) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.fb);
      gl.viewport(0, 0, this.bloomA.w, this.bloomA.h);
      this.bright.use();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
      this.bright.i1('u_tex', 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.blur.use();
      this.blur.i1('u_tex', 0);
      for (let i = 0; i < 2; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomB.fb);
        gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
        this.blur.f2('u_dir', 1 / this.bloomA.w, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.fb);
        gl.bindTexture(gl.TEXTURE_2D, this.bloomB.tex);
        this.blur.f2('u_dir', 0, 1 / this.bloomA.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
    // final
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    this.post.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
    const P = this.post;
    P.i1('u_scene', 0);
    P.i1('u_bloom', 1);
    P.f1('u_bloomOn', bloom ? 1 : 0);
    P.f1('u_time', this.time);
    P.f1('u_grain', this.reduced ? 0.01 : cctv >= 0 ? 0.06 : 0.035 + v.fear * 0.03);
    P.f1('u_ca', this.reduced ? 0 : 0.004 + v.fear * 0.012);
    P.f1('u_fear', this.reduced ? v.fear * 0.5 : v.fear);
    P.f1('u_cctv', cctv >= 0 ? 1 : 0);
    P.f1('u_exposure', cctv >= 0 ? 1.4 : 1.25);
    P.f1('u_fade', v.fade);
    P.f1('u_glitch', this.reduced ? 0 : v.glitch);
    P.f1('u_hurt', v.hurt);
    P.f2('u_res', this.width, this.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Small live view for the monitor wall, a few times per second. */
  private renderFeed(sim: Sim, dt: number) {
    this.feedT -= dt;
    this.feedSwitchT -= dt;
    if (this.feedSwitchT <= 0) {
      this.feedSwitchT = 4;
      this.feedCam = (this.feedCam + 1) % 5;
    }
    if (this.feedT > 0) return;
    this.feedT = 0.2;
    const gl = this.gl;
    const c = CAMERAS[this.feedCam];
    const proj = perspective(1.1, 16 / 9, 0.05, 60);
    const view = lookAt(c.pos, c.target);
    const saveVP = this.vp;
    const saveCam = this.camPos;
    this.vp = multiply(proj, view);
    this.camPos = [...c.pos];
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.feed.fb);
    gl.viewport(0, 0, this.feed.w, this.feed.h);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.lit.use();
    this.setFrame(this.lit, [0.08, 0.1, 0.08], [0.01, 0.012, 0.012], 0.03, false, false);
    this.drawWorld(this.lit, sim, this.feedCam, false);
    this.vp = saveVP;
    this.camPos = saveCam;
  }

  dispose() {
    const gl = this.gl;
    for (const s of this.statics) deleteMesh(gl, s.mesh);
    for (const d of this.dyns) deleteMesh(gl, d.mesh);
    for (const m of this.mats.values()) {
      gl.deleteTexture(m.albedo);
      gl.deleteTexture(m.normal);
    }
    for (const t of this.screenTex.values()) gl.deleteTexture(t);
    for (const t of this.signTex.values()) gl.deleteTexture(t);
    if (this.scene) deleteTarget(gl, this.scene);
    if (this.feed) deleteTarget(gl, this.feed);
    this.statics = [];
    this.dyns = [];
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
