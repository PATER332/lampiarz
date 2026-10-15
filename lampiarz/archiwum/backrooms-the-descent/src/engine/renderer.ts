// Frame rendering: flashlight shadow, a second shadow map for the lamp nearest to a
// creature (its shadow reaches round corners before it does), lit forward pass into
// an HDR target, decals, particles, dust, creatures, the view model, bloom and grade.
import { hitSpheres, type Sim } from '../game/sim';
import type { Monster } from '../game/monsters';
import type { Settings } from '../game/state';
import { CAMERAS, H, PICKUPS, PROP_BY_ID, type LightDef, type LightKind } from '../world/map';
import { MATS, type MatKey } from '../world/materials';
import { Level } from '../world/level';
import { clockFace, drawHands, paintCanvas, plateCanvas, rosterCanvas, scribbleCanvas, tallyCanvas, uvCanvas } from '../world/puzzleArt';
import { groundedMatrices, poseOf, RIGS } from '../world/rig';
import { buildScene, revolverParts, type DecalDef, type DynDef } from '../world/scene';
import { createShadowTarget, createTarget, deleteMesh, deleteTarget, drawMesh, Program, solidTexture, textureFromCanvas, updateTexture, type GL, type Mesh, type ShadowTarget, type Target } from './gl';
import { compose, forward, lookAt, mat4, multiply, perspective, wrapAngle, type Mat4, type Vec3 } from './math';
import { MeshBuilder } from './mesh';
import { BLUR_FS, BRIGHT_FS, DEPTH_FS, DEPTH_VS, DUST_FS, DUST_VS, LIT_FS, LIT_VS, MAX_LIGHTS, PART_FS, PART_VS, POST_FS, QUAD_VS } from './shaders';
import { DECALS, GENERATORS, canvas as mkCanvas, type DecalName, type MaterialName } from './textures';

interface MatGL {
  albedo: WebGLTexture;
  normal: WebGLTexture;
  def: (typeof MATS)[MatKey];
}
interface DynGL {
  def: DynDef;
  parts: { mat: MatKey; mesh: Mesh }[];
  model: Mat4;
  tex?: WebGLTexture;
  emissive: number;
  emis: Vec3;
  visible: boolean;
  shadow: boolean;
}
interface RigGL {
  parts: { bone: number; mat: MatKey; mesh: Mesh }[];
  mats: Mat4[];
}

export interface ViewParams {
  cctv: number;
  fear: number;
  hurt: number;
  glitch: number;
  fade: number;
  bob: [number, number];
  shake: number;
  zoom: number;
}

const LIGHT_COLOR: Record<LightKind | 'flash', Vec3> = {
  fluo: [1.0, 0.92, 0.7],
  cold: [0.82, 0.92, 1.0],
  red: [1.0, 0.1, 0.05],
  lamp: [1.0, 0.68, 0.4],
  uv: [0.45, 0.2, 1.0],
  core: [0.7, 0.85, 1.0],
  bulb: [1.0, 0.76, 0.48],
  flash: [1.0, 0.8, 0.5],
};

export class Renderer {
  gl: GL;
  lit!: Program;
  depth!: Program;
  dust!: Program;
  part!: Program;
  bright!: Program;
  blur!: Program;
  post!: Program;
  mats = new Map<MatKey, MatGL>();
  statics: { mat: MatKey; mesh: Mesh }[] = [];
  decalMeshes: { tex: WebGLTexture; mesh: Mesh; uvInk?: boolean }[] = [];
  decalTex = new Map<string, WebGLTexture>();
  dyns: DynGL[] = [];
  rigs = new Map<string, RigGL>();
  view: { parts: { mat: MatKey; mesh: Mesh; tag: string }[] } = { parts: [] };
  unitQuad!: Mesh;
  unitSphere!: Mesh;
  flashQuad!: Mesh;
  dustVao!: WebGLVertexArrayObject;
  partVao!: WebGLVertexArrayObject;
  partBuf!: WebGLBuffer;
  emptyVao!: WebGLVertexArrayObject;
  scene!: Target;
  bloomA!: Target;
  bloomB!: Target;
  shadow: ShadowTarget | null = null;
  shadow2: ShadowTarget | null = null;
  dummyShadow!: ShadowTarget;
  shadowSize = 0;
  white!: WebGLTexture;
  flatNormal!: WebGLTexture;
  width = 1;
  height = 1;
  time = 0;
  floatOK = false;
  quality: Settings['quality'] = 'medium';
  renderScale = 1;
  reduced = false;
  gore = true;
  lost = false;
  private vp = mat4();
  private proj = mat4();
  private viewM = mat4();
  private shadowVP = mat4();
  private shadow2VP = mat4();
  private sh2Light = -1;
  private lightPos = new Float32Array(MAX_LIGHTS * 4);
  private lightCol = new Float32Array(MAX_LIGHTS * 3);
  private nLights = 0;
  private spot = { pos: [0, 0, 0] as Vec3, dir: [0, 0, -1] as Vec3, col: [0, 0, 0] as Vec3 };
  private camPos: Vec3 = [0, 0, 0];
  private canvases = new Map<string, { c: HTMLCanvasElement; tex: WebGLTexture }>();
  private dynDecalKey = '';
  private dynDecalMeshes: { tex: WebGLTexture; mesh: Mesh }[] = [];
  private screenT = 0;
  private clockSec = -1;
  private uvTex!: WebGLTexture;

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

  /** Load everything; progress receives real steps. */
  async load(sim: Sim, progress: (done: number, total: number, label: string) => void) {
    const gl = this.gl;
    const names = Object.keys(GENERATORS) as MaterialName[];
    const total = names.length + 8;
    let done = 0;
    const step = async (label: string) => {
      done++;
      progress(done, total, label);
      await new Promise((r) => setTimeout(r, 0));
    };
    this.lit = new Program(gl, LIT_VS, LIT_FS, 'lit');
    this.depth = new Program(gl, DEPTH_VS, DEPTH_FS, 'depth');
    this.dust = new Program(gl, DUST_VS, DUST_FS, 'dust');
    this.part = new Program(gl, PART_VS, PART_FS, 'part');
    this.bright = new Program(gl, QUAD_VS, BRIGHT_FS, 'bright');
    this.blur = new Program(gl, QUAD_VS, BLUR_FS, 'blur');
    this.post = new Program(gl, QUAD_VS, POST_FS, 'post');
    await step('Kompilacja shaderów');
    this.white = solidTexture(gl, 255, 255, 255);
    this.flatNormal = solidTexture(gl, 128, 128, 255);
    this.dummyShadow = createShadowTarget(gl, 4);
    const tex = new Map<MaterialName, { a: WebGLTexture; n: WebGLTexture }>();
    for (const n of names) {
      const t = GENERATORS[n]();
      tex.set(n, { a: textureFromCanvas(gl, t.albedo, { aniso: 8 }), n: textureFromCanvas(gl, t.normal, { aniso: 8 }) });
      await step(`Materiały: ${n}`);
    }
    for (const [k, def] of Object.entries(MATS) as [MatKey, (typeof MATS)[MatKey]][]) {
      const t = tex.get(def.tex)!;
      this.mats.set(k, { albedo: t.a, normal: t.n, def });
    }
    // decal and puzzle images
    for (const [n, fn] of Object.entries(DECALS) as [DecalName, () => HTMLCanvasElement][]) this.decalTex.set(n, textureFromCanvas(gl, fn(), { repeat: false }));
    const P = sim.puzzle;
    this.decalTex.set('tally', textureFromCanvas(gl, tallyCanvas(P.digits.square), { repeat: false }));
    this.decalTex.set('paint', textureFromCanvas(gl, paintCanvas(P.uvFake), { repeat: false }));
    for (const k of ['count', 'arrow', 'nie', 'help', 'eye', 'run'] as const) this.decalTex.set(`scribble_${k}`, textureFromCanvas(gl, scribbleCanvas(k), { repeat: false }));
    this.uvTex = textureFromCanvas(gl, uvCanvas(P.digits.eye), { repeat: false });
    this.addCanvas('roster', rosterCanvas(P));
    this.addCanvas('plate', plateCanvas(P.order));
    P.clocks.forEach((c, i) => this.addCanvas(`clock${i}`, clockFace(i === P.liveClock ? null : c.h, i === P.liveClock ? null : c.m)));
    this.addCanvas('clockBase', clockFace(null, null));
    for (const k of ['console0', 'console1', 'console2', 'terminal', 'radio']) this.addCanvas(k, mkCanvas(256, 160)[0]);
    await step('Obrazy i znaki');
    // geometry
    const data = buildScene(new Level(), sim.lights);
    for (const [mat, mb] of data.statics) this.statics.push({ mat, mesh: mb.build(gl) });
    this.buildDecals(data.decals);
    await step('Geometria poziomu');
    for (const def of data.dyn) {
      const d: DynGL = { def, parts: def.parts.map((p) => ({ mat: p.mat, mesh: p.mb.build(gl) })), model: compose([def.x, def.y, def.z], def.yaw), emissive: 0, emis: [1, 1, 1], visible: true, shadow: def.kind === 'door' };
      if (def.kind === 'clock') d.tex = this.canvases.get(def.ref!)?.tex;
      if (def.kind === 'board') d.tex = this.canvases.get('roster')!.tex;
      if (def.kind === 'plate') d.tex = this.canvases.get('plate')!.tex;
      if (def.kind === 'screen') d.tex = this.canvases.get(def.key)?.tex ?? this.canvases.get(def.ref!)?.tex;
      this.dyns.push(d);
    }
    await step('Obiekty ruchome');
    // creatures
    for (const [type, rig] of Object.entries(RIGS)) {
      const parts: RigGL['parts'] = [];
      rig.bones.forEach((b, i) => b.parts.forEach((p) => parts.push({ bone: i, mat: p.mat, mesh: p.mb.build(gl) })));
      this.rigs.set(type, { parts, mats: [] });
    }
    await step('Istoty');
    this.buildViewModel();
    const q = new MeshBuilder();
    q.quad([-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [0, -1, 0], [1, 0, 0], [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    this.unitQuad = q.build(gl);
    const sph = new MeshBuilder();
    sph.ellipsoid([0, 0, 0], 1, 1, 1, 10, 8);
    this.unitSphere = sph.build(gl);
    const fq = new MeshBuilder();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      fq.quad([-Math.cos(a) * 0.5, -Math.sin(a) * 0.5, 0], [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0], [Math.cos(a) * 0.5, Math.sin(a) * 0.5, -0.02], [-Math.cos(a) * 0.5, -Math.sin(a) * 0.5, -0.02], [0, 0, 1], [1, 0, 0], [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]);
    }
    this.flashQuad = fq.build(gl);
    await step('Broń');
    // dust and particles
    const N = 900;
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pts[i * 3] = Math.random() * 12;
      pts[i * 3 + 1] = Math.random() * H;
      pts[i * 3 + 2] = Math.random() * 12;
    }
    this.dustVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.dustVao);
    const db = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, db);
    gl.bufferData(gl.ARRAY_BUFFER, pts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.partVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.partVao);
    this.partBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 400 * 16, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    this.emptyVao = gl.createVertexArray()!;
    gl.bindVertexArray(null);
    await step('Atmosfera');
    this.resize(this.canvas.clientWidth || 1280, this.canvas.clientHeight || 720);
    await step('Bufory obrazu');
    await step('Gotowe');
  }

  /** A new game has a new code: repaint every image that carries the puzzle. */
  setPuzzle(P: Sim['puzzle']) {
    const gl = this.gl;
    const swap = (key: string, c: HTMLCanvasElement) => {
      const old = this.decalTex.get(key)!;
      updateTexture(gl, old, c, true);
    };
    swap('tally', tallyCanvas(P.digits.square));
    swap('paint', paintCanvas(P.uvFake));
    updateTexture(gl, this.uvTex, uvCanvas(P.digits.eye), true);
    const put = (key: string, c: HTMLCanvasElement) => {
      const e = this.canvases.get(key)!;
      e.c = c;
      updateTexture(gl, e.tex, c, true);
    };
    put('roster', rosterCanvas(P));
    put('plate', plateCanvas(P.order));
    P.clocks.forEach((c, i) => put(`clock${i}`, clockFace(i === P.liveClock ? null : c.h, i === P.liveClock ? null : c.m)));
    for (const d of this.dyns) if (d.def.kind === 'clock') d.tex = this.canvases.get(d.def.ref!)?.tex;
    this.clockSec = -1;
  }

  private addCanvas(key: string, c: HTMLCanvasElement) {
    this.canvases.set(key, { c, tex: textureFromCanvas(this.gl, c, { repeat: false }) });
  }

  private buildDecals(list: DecalDef[]) {
    const by = new Map<string, MeshBuilder>();
    for (const d of list) {
      let mb = by.get(d.name);
      if (!mb) by.set(d.name, (mb = new MeshBuilder()));
      decalQuad(mb, d.p, d.n, d.w, d.h, d.rot);
    }
    for (const [name, mb] of by) this.decalMeshes.push({ tex: this.decalTex.get(name)!, mesh: mb.build(this.gl) });
  }

  private buildViewModel() {
    const gl = this.gl;
    const add = (ps: Map<MatKey, MeshBuilder>, tag: string) => {
      for (const [mat, mb] of ps) this.view.parts.push({ mat, mesh: mb.build(gl), tag });
    };
    add(revolverParts(1).parts, 'gun');
    // the right hand around the grip and a sleeve
    const hand = new Map<MatKey, MeshBuilder>();
    const hb = new MeshBuilder();
    hb.ellipsoid([0, -0.05, 0.05], 0.035, 0.05, 0.045, 10, 8);
    hb.limb(0.07, 0.012, 0.01, 6);
    const fing = new MeshBuilder();
    fing.mergeTransformed(hb, compose([0, 0, 0]));
    hand.set('skinHand', fing);
    const sleeve = new MeshBuilder();
    const arm = new MeshBuilder();
    arm.limb(0.42, 0.055, 0.045, 10);
    sleeve.mergeTransformed(arm, compose([0, -0.07, 0.07], 0, -1.25));
    hand.set('sleeve', sleeve);
    add(hand, 'gun');
    // the flashlight in the left hand
    const fl = new Map<MatKey, MeshBuilder>();
    const body = new MeshBuilder();
    body.cylinder(0, 0, 0, 0.022, 0.2, 'z', 12);
    body.cylinder(0, 0, -0.1, 0.03, 0.04, 'z', 12);
    fl.set('darkMetal', body);
    const lhand = new MeshBuilder();
    lhand.ellipsoid([0, -0.01, 0.03], 0.04, 0.045, 0.06, 10, 8);
    fl.set('skinHand', lhand);
    const lsl = new MeshBuilder();
    const la = new MeshBuilder();
    la.limb(0.4, 0.055, 0.045, 10);
    lsl.mergeTransformed(la, compose([0, -0.02, 0.08], 0, -1.3));
    fl.set('sleeve', lsl);
    add(fl, 'torch');
    const lens = new MeshBuilder();
    lens.cylinder(0, 0, -0.121, 0.026, 0.004, 'z', 12);
    this.view.parts.push({ mat: 'plastic', mesh: lens.build(gl), tag: 'lens' });
  }

  private brightness = 1;
  setSettings(s: Settings) {
    const changed = s.quality !== this.quality || s.renderScale !== this.renderScale;
    this.quality = s.quality;
    this.renderScale = s.renderScale;
    this.reduced = s.reduced;
    this.gore = s.gore;
    this.brightness = s.brightness;
    if (changed) this.resize(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  resize(cssW: number, cssH: number) {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.25);
    this.width = Math.max(1, Math.round(cssW * dpr));
    this.height = Math.max(1, Math.round(cssH * dpr));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const k = this.renderScale * (this.quality === 'low' ? 0.75 : 1);
    const sw = Math.max(1, Math.round(this.width * k));
    const sh = Math.max(1, Math.round(this.height * k));
    if (this.scene) deleteTarget(gl, this.scene);
    if (this.bloomA) deleteTarget(gl, this.bloomA);
    if (this.bloomB) deleteTarget(gl, this.bloomB);
    this.scene = createTarget(gl, sw, sh, { float: this.floatOK, depth: true });
    this.bloomA = createTarget(gl, Math.max(1, sw >> 2), Math.max(1, sh >> 2), { float: this.floatOK });
    this.bloomB = createTarget(gl, Math.max(1, sw >> 2), Math.max(1, sh >> 2), { float: this.floatOK });
    const ss = this.quality === 'high' ? 1024 : this.quality === 'medium' ? 512 : 0;
    if (ss !== this.shadowSize) {
      for (const t of [this.shadow, this.shadow2]) if (t) {
        gl.deleteFramebuffer(t.fb);
        gl.deleteTexture(t.tex);
      }
      this.shadow = ss ? createShadowTarget(gl, ss) : null;
      this.shadow2 = ss ? createShadowTarget(gl, ss) : null;
      this.shadowSize = ss;
    }
  }

  // ------------------------------------------------------------------ lights
  private pickLights(sim: Sim, cam: Vec3) {
    const cand: { i: number; d: number; l: LightDef; k: number }[] = [];
    sim.lights.forEach((l, i) => {
      if (!sim.lightActive(l, i)) return;
      const d = Math.hypot(l.x - cam[0], l.z - cam[2]);
      if (d - l.range > 18) return;
      let k = 1;
      if (l.flicker && !this.reduced) {
        const t = this.time * (6 + (i % 7));
        const n = Math.sin(t) * Math.sin(t * 2.3 + i) * Math.sin(t * 0.37 + i * 3.1);
        if (n > 1 - l.flicker * 1.6) k = 0.1;
      }
      if (l.id === 'core') k *= 0.65 + 0.35 * Math.sin(this.time * 2.2) + (sim.collapse ? Math.random() * 0.6 : 0);
      if (l.kind === 'red' && sim.collapse) k *= 0.5 + 0.5 * Math.max(0, Math.sin(this.time * 7));
      cand.push({ i, d, l, k });
    });
    cand.sort((a, b) => a.d - b.d);
    let n = 0;
    // the muzzle flash takes the first slot
    if (sim.flashT > 0) {
      const f = forward(sim.player.yaw, sim.player.pitch);
      this.lightPos.set([cam[0] + f[0] * 0.6, cam[1] - 0.1, cam[2] + f[2] * 0.6, 9], 0);
      this.lightCol.set(LIGHT_COLOR.flash.map((c) => c * 4) as unknown as number[], 0);
      n = 1;
    }
    const picked: { i: number; k: number; slot: number }[] = [];
    for (const c of cand) {
      if (n >= MAX_LIGHTS) break;
      const col = LIGHT_COLOR[c.l.kind];
      this.lightPos.set([c.l.x, c.l.y - 0.12, c.l.z, c.l.range], n * 4);
      this.lightCol.set([col[0] * c.l.intensity * c.k, col[1] * c.l.intensity * c.k, col[2] * c.l.intensity * c.k], n * 3);
      picked.push({ i: c.i, k: c.k, slot: n });
      n++;
    }
    this.nLights = n;
    return picked;
  }

  // ------------------------------------------------------------------ per-frame objects
  private updateDyns(sim: Sim, dt: number) {
    const st = sim.state;
    for (const d of this.dyns) {
      const def = d.def;
      d.visible = true;
      d.emissive = 0;
      switch (def.kind) {
        case 'door': {
          const a = sim.doorAnim[def.ref!] ?? 0;
          if (def.anim === 'swing') {
            // rotate the leaf around its hinge, into the room
            const ang = a * 1.6;
            const hinge = def.hingeSide ?? 0;
            const c = Math.cos(def.yaw);
            const s = Math.sin(def.yaw);
            const hx = def.x + hinge * c;
            const hz = def.z - hinge * s;
            d.model = compose([hx, 0, hz], def.yaw + ang);
          } else {
            const off = (def.slide ?? 1) * a;
            const c = Math.cos(def.yaw);
            const s = Math.sin(def.yaw);
            d.model = compose([def.x + off * c, 0, def.z - off * s], def.yaw);
          }
          break;
        }
        case 'vent': {
          // hinged at the top: the bottom swings out into the room
          const open = sim.ventOpen(def.ref!);
          const shake = open > 0 && open < 1 ? Math.sin(this.time * 60) * 0.05 : 0;
          d.model = compose([def.x, def.y, def.z], def.yaw, open * 1.25 + shake);
          break;
        }
        case 'lever': {
          const on = st.stabilizers.includes(def.ref!);
          d.model = compose([def.x, def.y, def.z], def.yaw, on ? 1.1 : -0.9);
          break;
        }
        case 'keypadLed':
          d.emissive = 2.4;
          d.emis = st.doors.armory.unlocked ? [0.1, 1, 0.3] : st.lockUntil > st.playTime ? [1, 0.5, 0] : [1, 0.08, 0.05];
          break;
        case 'genLamp': {
          const i = def.index!;
          const on = st.gen.on || st.gen.step > i;
          d.emissive = on ? 2.5 : 0.05;
          d.emis = st.gen.on ? [0.2, 1, 0.3] : [1, 0.55, 0.1];
          break;
        }
        case 'button':
          d.emissive = def.ref === 'uvswitch' ? (st.uvOn ? 2 : 0.2) : st.liftcard ? 2 : 0.4;
          d.emis = def.ref === 'uvswitch' ? [0.6, 0.3, 1] : [0.2, 1, 0.3];
          break;
        case 'screen': {
          const on = def.ref === 'terminal' ? true : st.gen.on;
          d.emissive = on ? 1.2 : 0.02;
          d.emis = [1, 1, 1];
          break;
        }
        case 'clock':
          d.emissive = 0.08;
          break;
        case 'core':
          d.emissive = def.index ? 0 : (sim.collapse ? 2 + Math.random() * 3 : 1.4 + 0.6 * Math.sin(this.time * 2.2));
          d.emis = sim.collapse ? [1, 0.35, 0.2] : [0.6, 0.85, 1.0];
          d.model = compose([def.x, def.y + Math.sin(this.time * 0.8) * 0.05, def.z], this.time * (def.index ? -0.4 : 0.25) * (sim.collapse ? 6 : 1), def.index ? 0.2 : 0);
          d.visible = !sim.has('choice_destroy') || !!sim.collapse || def.index === 1;
          break;
        case 'pickup': {
          const pk = PICKUPS.find((p) => p.id === def.ref)!;
          d.visible = sim.pickupAvailable(pk) || (!sim.state.pickedUp.includes(pk.id) && (pk.id === 'p_revolver' || pk.id === 'p_liftcard' || pk.id.startsWith('p_d1') || pk.id === 'p_med2' || pk.id === 'p_ammo2' || pk.id === 'p_ammo1') && (!pk.only || pk.only.includes(st.difficulty)));
          const near = Math.hypot(pk.x - sim.player.x, pk.z - sim.player.z) < 3.5 && sim.pickupAvailable(pk);
          d.emissive = near ? 0.2 + 0.15 * Math.sin(this.time * 3) : 0;
          d.emis = [1, 0.95, 0.8];
          break;
        }
      }
    }
    // live clock: the second hand moves
    const P = sim.puzzle;
    const sec = Math.floor(this.time);
    if (sec !== this.clockSec) {
      this.clockSec = sec;
      const live = this.canvases.get(`clock${P.liveClock}`)!;
      const g = live.c.getContext('2d')!;
      g.drawImage(this.canvases.get('clockBase')!.c, 0, 0);
      const mins = Math.min(59, P.clocks[P.liveClock].m + sim.state.playTime / 60);
      drawHands(g, P.clocks[P.liveClock].h, mins, sec % 60);
      updateTexture(this.gl, live.tex, live.c);
    }
    // screens at 4 Hz
    this.screenT -= dt;
    if (this.screenT <= 0) {
      this.screenT = 0.25;
      this.drawScreens(sim);
    }
  }

  private drawScreens(sim: Sim) {
    const st = sim.state;
    for (const key of ['console0', 'console1', 'console2']) {
      const s = this.canvases.get(key)!;
      const g = s.c.getContext('2d')!;
      const img = g.createImageData(256, 160);
      for (let k = 0; k < img.data.length; k += 4) {
        const v = st.gen.on ? Math.random() * 50 + 15 : 0;
        img.data[k] = v * 0.7;
        img.data[k + 1] = v;
        img.data[k + 2] = v * 0.75;
        img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      if (st.gen.on) {
        g.fillStyle = '#cfe8d0';
        g.font = '16px "BD Mono", monospace';
        g.fillText(`KAM ${Number(key.slice(-1)) + 1}`, 10, 22);
      }
      updateTexture(this.gl, s.tex, s.c);
    }
    const t = this.canvases.get('terminal')!;
    {
      const g = t.c.getContext('2d')!;
      g.fillStyle = '#020a10';
      g.fillRect(0, 0, 256, 160);
      g.fillStyle = sim.collapse ? '#ff6050' : '#9fd8ff';
      g.font = '18px "BD Mono", monospace';
      const lines = sim.collapse ? ['KOTWICA: AWARIA', 'ZAKŁADKA', 'NIESTABILNA'] : st.stabilizers.length < 3 ? ['KOTWICA', `STAB: ${st.stabilizers.length}/3`] : ['KOTWICA', 'CZEKAM NA', 'POLECENIE'];
      lines.forEach((l, i) => g.fillText(l, 12, 34 + i * 26));
      updateTexture(this.gl, t.tex, t.c);
    }
    const r = this.canvases.get('radio')!;
    {
      const g = r.c.getContext('2d')!;
      g.fillStyle = '#120802';
      g.fillRect(0, 0, 256, 160);
      g.fillStyle = st.gen.on ? '#ffb050' : '#2a1608';
      g.font = 'bold 64px "BD Mono", monospace';
      g.fillText(`${sim.radioFreq.toFixed(2)}`, 20, 110);
      updateTexture(this.gl, r.tex, r.c);
    }
  }

  private updateDynDecals(sim: Sim) {
    const key = `${sim.decals.length}:${sim.decals[sim.decals.length - 1]?.t ?? 0}`;
    if (key === this.dynDecalKey) return;
    this.dynDecalKey = key;
    for (const d of this.dynDecalMeshes) deleteMesh(this.gl, d.mesh);
    this.dynDecalMeshes = [];
    const by = new Map<string, MeshBuilder>();
    for (const d of sim.decals) {
      const name = d.kind === 'hole' ? 'hole' : d.kind === 'splat' ? 'splat' : 'blood';
      let mb = by.get(name);
      if (!mb) by.set(name, (mb = new MeshBuilder()));
      const seed = (d.x * 13.7 + d.z * 7.1) % 6.28;
      decalQuad(mb, [d.x, d.y, d.z], [d.nx, d.ny, d.nz], d.size, d.size, seed);
    }
    for (const [name, mb] of by) this.dynDecalMeshes.push({ tex: this.decalTex.get(name)!, mesh: mb.build(this.gl) });
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
    p.f1('u_spec', tex ? 0.2 : m.def.spec);
  }

  private setFrame(p: Program, ambient: Vec3, fogCol: Vec3, fog: number, spotOn: boolean, shadowOn: boolean, sh2: boolean) {
    const gl = this.gl;
    p.m4('u_vp', this.vp);
    p.m4('u_shadowVP', this.shadowVP);
    p.m4('u_shadow2VP', this.shadow2VP);
    p.v3('u_camPos', this.camPos);
    p.i1('u_nLights', this.nLights);
    p.f4v('u_lightPos', this.lightPos);
    p.f3v('u_lightCol', this.lightCol);
    p.v3('u_spotPos', this.spot.pos);
    p.v3('u_spotDir', this.spot.dir);
    p.v3('u_spotCol', this.spot.col);
    p.f2('u_spotCone', Math.cos(0.21), Math.cos(0.44));
    p.f1('u_spotRange', spotOn ? 20 : 0);
    p.f1('u_shadowOn', shadowOn ? 1 : 0);
    p.i1('u_sh2Light', sh2 ? this.sh2Light : -1);
    p.v3('u_ambient', ambient);
    p.v3('u_fogCol', fogCol);
    p.f1('u_fogDensity', fog);
    p.f1('u_time', this.time);
    p.f1('u_alpha', 1);
    p.f2('u_uvScale', 1, 1);
    p.f1('u_emissive', 0);
    p.i1('u_albedo', 0);
    p.i1('u_normal', 1);
    p.i1('u_shadowMap', 2);
    p.i1('u_shadowMap2', 3);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, shadowOn && this.shadow ? this.shadow.tex : this.dummyShadow.tex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, sh2 && this.shadow2 ? this.shadow2.tex : this.dummyShadow.tex);
  }

  /** opaque world: statics, dynamic objects and creatures */
  private drawWorld(p: Program, sim: Sim, cctv: number, depthOnly: boolean, forShadow = false) {
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
      if (depthOnly && !d.shadow) continue;
      for (const part of d.parts) {
        if (!depthOnly) {
          this.bindMat(p, part.mat, d.tex);
          p.f1('u_emissive', d.emissive);
          p.v3('u_emisColor', d.emis);
        }
        p.m4('u_model', d.model);
        drawMesh(gl, part.mesh);
      }
    }
    this.drawCreatures(p, sim, cctv, depthOnly, forShadow);
  }

  private drawCreatures(p: Program, sim: Sim, cctv: number, depthOnly: boolean, forShadow: boolean) {
    const gl = this.gl;
    const cam = this.camPos;
    const list: { m: Monster; alpha: number }[] = [];
    for (const m of sim.monsters) if (m.visible) list.push({ m, alpha: 1 });
    for (const a of sim.apparitions) {
      const fake = { type: a.type, x: a.x, z: a.z, yaw: a.yaw, state: 'listen', stateT: 1, anim: 0, speed: 0, twitch: 0.2, hitT: 0, deathT: 0, attackT: -1, K: { attackTime: 1 }, moving: false, hunting: false } as unknown as Monster;
      list.push({ m: fake, alpha: 1 });
    }
    for (const { m } of list) {
      if (forShadow && m.type === 'echo') continue; // the Echo casts no shadow
      if (Math.hypot(m.x - cam[0], m.z - cam[2]) > 40) continue;
      const rig = this.rigs.get(m.type)!;
      const toCam = Math.atan2(-(cam[0] - m.x), -(cam[2] - m.z));
      const { pose, lift, pitch, roll } = poseOf(m, this.time, cctv >= 0 ? 0 : wrapAngle(toCam - m.yaw));
      const root = compose([m.x, 0, m.z], m.yaw, pitch, roll);
      // feet on the floor; only the Crawler's pounce leaves the ground on purpose
      const air = m.type === 'crawler' && m.state === 'attack' ? lift : 0;
      const mats = groundedMatrices(RIGS[m.type], root, pose, m.state === 'dead', air, rig.mats);
      for (const part of rig.parts) {
        if (!depthOnly) {
          this.bindMat(p, part.mat);
          p.f1('u_emissive', 0);
        }
        p.m4('u_model', mats[part.bone]);
        drawMesh(gl, part.mesh);
      }
    }
  }

  private drawDecals(sim: Sim) {
    const gl = this.gl;
    const p = this.lit;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-2, -4);
    const ident = mat4();
    p.m4('u_model', ident);
    p.f1('u_emissive', 0);
    const draw = (tex: WebGLTexture, mesh: Mesh, spec: number) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.flatNormal);
      p.v3('u_tint', [1, 1, 1]);
      p.f1('u_rough', 0.3);
      p.f1('u_spec', spec);
      drawMesh(gl, mesh);
    };
    for (const d of this.decalMeshes) {
      if (!this.gore && (d.tex === this.decalTex.get('blood') || d.tex === this.decalTex.get('bloodSmear') || d.tex === this.decalTex.get('drag') || d.tex === this.decalTex.get('hand') || d.tex === this.decalTex.get('splat'))) continue;
      draw(d.tex, d.mesh, d.tex === this.decalTex.get('puddle') ? 0.9 : 0.25);
    }
    this.updateDynDecals(sim);
    for (const d of this.dynDecalMeshes) {
      if (!this.gore && d.tex !== this.decalTex.get('hole')) continue;
      draw(d.tex, d.mesh, 0.5);
    }
    // the UV writing glows only under the UV lamp
    if (sim.state.uvOn && sim.state.gen.on) {
      const mb = new MeshBuilder();
      decalQuad(mb, [52.03, 1.5, 30], [1, 0, 0], 2.0, 1.0, 0);
      const mesh = mb.build(gl);
      p.f1('u_emissive', 2.2);
      p.v3('u_emisColor', [0.75, 0.6, 1.0]);
      draw(this.uvTex, mesh, 0);
      deleteMesh(gl, mesh);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /** the glowing parts of the lamps that are on */
  private drawEmitters(sim: Sim, picked: { i: number; k: number }[]) {
    const gl = this.gl;
    const p = this.lit;
    const on = new Map(picked.map((x) => [x.i, x.k]));
    const cam = this.camPos;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.flatNormal);
    sim.lights.forEach((l, i) => {
      if (Math.hypot(l.x - cam[0], l.z - cam[2]) > 32) return;
      if (!sim.lightActive(l, i)) return;
      const k = on.get(i) ?? 1;
      const col = LIGHT_COLOR[l.kind];
      p.v3('u_emisColor', col);
      p.v3('u_tint', [0, 0, 0]);
      p.f1('u_spec', 0);
      gl.activeTexture(gl.TEXTURE0);
      if (l.panel) {
        gl.bindTexture(gl.TEXTURE_2D, this.mats.get('diffuser')!.albedo);
        p.f1('u_emissive', 3.2 * k * l.intensity);
        p.m4('u_model', compose([l.x, H - 0.03, l.z], 0, 0, 0, [1.2, 1, 0.6]));
        drawMesh(gl, this.unitQuad);
      } else if (l.kind !== 'uv') {
        gl.bindTexture(gl.TEXTURE_2D, this.white);
        p.f1('u_emissive', (l.kind === 'core' ? 0 : 3.5) * k);
        if (l.kind === 'core') return;
        p.m4('u_model', compose([l.x, l.y, l.z], 0, 0, 0, [0.06, 0.08, 0.06]));
        drawMesh(gl, this.unitSphere);
      } else {
        gl.bindTexture(gl.TEXTURE_2D, this.white);
        p.f1('u_emissive', 4);
        p.m4('u_model', compose([l.x, H - 0.1, l.z], 0, 0, 0, [1.5, 1, 0.15]));
        drawMesh(gl, this.unitQuad);
      }
    });
  }

  // ------------------------------------------------------------------ main render
  render(sim: Sim, dt: number, v: ViewParams, eyeYaw: number, eyePitch: number, viewModel: boolean) {
    if (this.lost) return;
    const gl = this.gl;
    this.time += dt;
    let eye: Vec3;
    let target: Vec3;
    const cctv = v.cctv;
    if (cctv >= 0) {
      const c = CAMERAS[cctv];
      // the eye sits just in front of the lens so the housing never fills the frame
      const dx = c.target[0] - c.pos[0], dy = c.target[1] - c.pos[1], dz = c.target[2] - c.pos[2];
      const dl = Math.hypot(dx, dy, dz) || 1;
      eye = [c.pos[0] + (dx / dl) * 0.4, c.pos[1] + (dy / dl) * 0.4, c.pos[2] + (dz / dl) * 0.4];
      const sway = Math.sin(this.time * 0.3) * 0.12;
      target = [c.target[0] + sway, c.target[1], c.target[2]];
    } else {
      const e = sim.eyePos();
      const sh = v.shake * (this.reduced ? 0.3 : 1);
      eye = [e[0] + (Math.random() - 0.5) * sh * 0.06, e[1] + v.bob[1] + (Math.random() - 0.5) * sh * 0.06, e[2]];
      eye[0] += Math.cos(eyeYaw) * v.bob[0];
      eye[2] += -Math.sin(eyeYaw) * v.bob[0];
      const f = forward(eyeYaw, eyePitch + sim.recoil * 0.05);
      target = [eye[0] + f[0], eye[1] + f[1], eye[2] + f[2]];
    }
    this.camPos = eye;
    const aspect = this.width / this.height;
    perspective(cctv >= 0 ? CAMERAS[cctv].fov ?? 1.2 : 1.22 - v.zoom * 0.28, aspect, 0.04, 70, this.proj);
    lookAt(eye, target, [0, 1, 0], this.viewM);
    multiply(this.proj, this.viewM, this.vp);

    const picked = this.pickLights(sim, eye);
    this.updateDyns(sim, dt);

    // flashlight
    const sp = sim.player;
    const spotOn = sim.flashlight && cctv < 0 && !(sp.hide && sp.hide.kind !== 'alcove');
    if (spotOn) {
      const f = forward(eyeYaw, eyePitch);
      const r: Vec3 = [Math.cos(eyeYaw), 0, -Math.sin(eyeYaw)];
      this.spot.pos = [eye[0] - r[0] * 0.2, eye[1] - 0.2, eye[2] - r[2] * 0.2];
      this.spot.dir = f;
      const b = sim.state.battery;
      let k = b < 0.15 ? (Math.random() < 0.88 ? 1 : 0.15) : 1;
      k *= 0.5 + 0.5 * Math.min(1, b * 3);
      this.spot.col = [2.5 * k, 2.35 * k, 2.1 * k];
    }
    const shadowOn = spotOn && !!this.shadow;
    if (shadowOn) {
      const sproj = perspective(1.0, 1, 0.1, 22);
      const sview = lookAt(this.spot.pos, [this.spot.pos[0] + this.spot.dir[0], this.spot.pos[1] + this.spot.dir[1], this.spot.pos[2] + this.spot.dir[2]], Math.abs(this.spot.dir[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0]);
      multiply(sproj, sview, this.shadowVP);
      this.depthPass(this.shadow!, this.shadowVP, sim, cctv);
    }
    // the lamp nearest to a creature throws its shadow
    const sh2 = this.creatureShadow(sim, picked, cctv);

    // main pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb);
    gl.viewport(0, 0, this.scene.w, this.scene.h);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    const { fog, fogD, amb } = this.atmosphere(sim, cctv);
    gl.clearColor(fog[0], fog[1], fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.lit.use();
    this.setFrame(this.lit, amb, fog, fogD, spotOn, shadowOn, sh2);
    this.drawWorld(this.lit, sim, cctv, false);
    this.drawEmitters(sim, picked);
    this.drawDecals(sim);
    this.drawParticles(sim);

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
      this.dust.f2('u_spotCone', Math.cos(0.2), Math.cos(0.42));
      this.dust.f1('u_spotOn', spotOn ? 1 : 0);
      this.dust.f1('u_px', this.scene.h * 0.004);
      gl.bindVertexArray(this.dustVao);
      gl.drawArrays(gl.POINTS, 0, 900);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // the hands and the gun
    if (viewModel && cctv < 0) this.drawViewModel(sim, eye, eyeYaw, eyePitch, amb, fog, fogD, spotOn);

    this.finish(v, cctv);
  }

  private atmosphere(sim: Sim, cctv: number) {
    const z = cctv >= 0 ? null : sim.zone;
    let fog: Vec3 = [0.01, 0.01, 0.01];
    let fogD = 0.05;
    let amb: Vec3 = [0.01, 0.01, 0.012];
    switch (z) {
      case 'maze':
      case 'start':
      case 'secret':
        fog = [0.05, 0.043, 0.022];
        fogD = 0.032;
        amb = [0.03, 0.026, 0.016];
        break;
      case 'armory':
        fog = [0.02, 0.022, 0.024];
        fogD = 0.03;
        amb = [0.02, 0.022, 0.024];
        break;
      case 'dark':
        fog = [0.004, 0.004, 0.005];
        fogD = 0.06;
        amb = [0.006, 0.006, 0.008];
        break;
      case 'storage':
        fog = [0.015, 0.016, 0.018];
        fogD = 0.035;
        amb = [0.012, 0.013, 0.015];
        break;
      case 'red':
        fog = [0.03, 0.004, 0.003];
        fogD = 0.05;
        amb = [0.016, 0.005, 0.004];
        break;
      case 'descent':
      case 'anchor':
      case 'lift':
        fog = [0.004, 0.008, 0.012];
        fogD = 0.065;
        amb = [0.006, 0.009, 0.012];
        break;
    }
    if (cctv >= 0) {
      fog = [0.01, 0.012, 0.012];
      fogD = 0.025;
      amb = [0.05, 0.055, 0.05];
    }
    return { fog, fogD, amb };
  }

  private depthPass(t: ShadowTarget, vp: Mat4, sim: Sim, cctv: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, t.size, t.size);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 4);
    this.depth.use();
    this.depth.m4('u_vp', vp);
    this.drawWorld(this.depth, sim, cctv, true, true);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }

  private creatureShadow(sim: Sim, picked: { i: number; slot: number }[], cctv: number): boolean {
    this.sh2Light = -1;
    if (!this.shadow2 || this.reduced) return false;
    const cam = this.camPos;
    let best: Monster | null = null;
    let bd = 24;
    for (const m of sim.monsters) {
      if (!m.visible || m.type === 'echo' || !m.alive) continue;
      const d = Math.hypot(m.x - cam[0], m.z - cam[2]);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (!best) return false;
    let slot = -1;
    let ld = 7;
    let lpos: Vec3 = [0, 0, 0];
    for (const p of picked) {
      const l = sim.lights[p.i];
      const d = Math.hypot(l.x - best.x, l.z - best.z);
      if (d < ld && sim.level.lineClear(l.x, l.z, best.x, best.z)) {
        ld = d;
        slot = p.slot;
        lpos = [l.x, l.y - 0.15, l.z];
      }
    }
    if (slot < 0) return false;
    const proj = perspective(2.4, 1, 0.08, 9);
    const view = lookAt(lpos, [lpos[0], lpos[1] - 1, lpos[2]], [0, 0, 1]);
    multiply(proj, view, this.shadow2VP);
    this.depthPass(this.shadow2, this.shadow2VP, sim, cctv);
    this.sh2Light = slot;
    return true;
  }

  private drawParticles(sim: Sim) {
    const n = Math.min(400, sim.particles.length);
    if (!n) return;
    const gl = this.gl;
    const data = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const p = sim.particles[i];
      data[i * 4] = p.x;
      data[i * 4 + 1] = p.y;
      data[i * 4 + 2] = p.z;
      data[i * 4 + 3] = p.kind === 'blood' ? (this.gore ? 0 : 3) : p.kind === 'black' ? 1 : p.kind === 'spark' ? 2 : 3;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    this.part.use();
    this.part.m4('u_vp', this.vp);
    this.part.f1('u_px', this.scene.h * 0.012);
    gl.bindVertexArray(this.partVao);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.lit.use();
  }

  private drawViewModel(sim: Sim, eye: Vec3, yaw: number, pitch: number, amb: Vec3, fog: Vec3, fogD: number, spotOn: boolean) {
    const gl = this.gl;
    const p = this.lit;
    p.use();
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const vproj = perspective(0.95, this.width / this.height, 0.01, 3);
    const saveVP = this.vp;
    this.vp = multiply(vproj, this.viewM);
    p.m4('u_vp', this.vp);
    p.i1('u_sh2Light', -1);
    p.f1('u_shadowOn', 0);
    const cam = compose(eye, yaw, pitch);
    const bobX = Math.sin(sim.bob) * 0.012 * sim.moving;
    const bobY = Math.abs(Math.cos(sim.bob)) * 0.012 * sim.moving;
    const breathe = Math.sin(this.time * 1.6) * 0.004;
    const st = sim.state;
    const hidden = sim.player.hide && sim.player.hide.kind !== 'alcove';
    // the gun
    if (st.revolver && sim.drawn && !hidden) {
      const draw = Math.min(1, sim.drawT / 0.45);
      const aim = sim.aimT;
      const rl = sim.reloadT > 0 ? Math.sin(Math.min(1, (2.3 - sim.reloadT) / 2.3) * Math.PI) : 0;
      const x = 0.19 * (1 - aim) + bobX;
      const y = -0.18 * (1 - aim) - 0.1 * aim + bobY + breathe - (1 - draw) * 0.35 - rl * 0.1;
      const z = -0.44 + aim * 0.1 + sim.recoil * 0.06;
      const local = compose([x, y, z], rl * 0.5, sim.recoil * 0.4 - rl * 0.3, rl * 0.9);
      const model = multiply(cam, local);
      for (const part of this.view.parts) {
        if (part.tag !== 'gun') continue;
        this.bindMat(p, part.mat);
        p.f1('u_emissive', 0);
        p.m4('u_model', model);
        drawMesh(gl, part.mesh);
      }
      if (sim.flashT > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.depthMask(false);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.white);
        p.v3('u_tint', [0, 0, 0]);
        p.f1('u_emissive', 6);
        p.v3('u_emisColor', [1, 0.7, 0.3]);
        p.m4('u_model', multiply(model, compose([0, 0.035, -0.25], Math.random() * 3, 0, 0, [0.12, 0.12, 0.12])));
        drawMesh(gl, this.flashQuad);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
    }
    // the flashlight in the left hand
    if (!hidden) {
      const local = compose([-0.21 + bobX * 0.5, -0.2 + bobY + breathe, -0.36], -0.38, 0.12);
      const model = multiply(cam, local);
      for (const part of this.view.parts) {
        if (part.tag !== 'torch' && part.tag !== 'lens') continue;
        this.bindMat(p, part.mat);
        p.f1('u_emissive', part.tag === 'lens' && spotOn ? 4 : 0);
        p.v3('u_emisColor', [1, 0.95, 0.8]);
        p.m4('u_model', model);
        drawMesh(gl, part.mesh);
      }
    }
    void amb;
    void fog;
    void fogD;
    this.vp = saveVP;
  }

  private finish(v: ViewParams, cctv: number) {
    const gl = this.gl;
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    const P = this.post;
    P.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
    P.i1('u_scene', 0);
    P.i1('u_bloom', 1);
    P.f1('u_bloomOn', bloom ? 1 : 0);
    P.f1('u_time', this.time);
    P.f1('u_grain', this.reduced ? 0.008 : cctv >= 0 ? 0.06 : 0.03 + v.fear * 0.025);
    P.f1('u_ca', this.reduced ? 0 : 0.003 + v.fear * 0.01);
    P.f1('u_fear', this.reduced ? v.fear * 0.4 : v.fear);
    P.f1('u_cctv', cctv >= 0 ? 1 : 0);
    P.f1('u_exposure', (cctv >= 0 ? 1.4 : 1.3) * this.brightness);
    P.f1('u_fade', v.fade);
    P.f1('u_glitch', this.reduced ? 0 : v.glitch);
    P.f1('u_hurt', v.hurt);
    P.f2('u_res', this.width, this.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    const gl = this.gl;
    for (const s of this.statics) deleteMesh(gl, s.mesh);
    for (const d of this.dyns) for (const p of d.parts) deleteMesh(gl, p.mesh);
    for (const d of this.decalMeshes) deleteMesh(gl, d.mesh);
    for (const r of this.rigs.values()) for (const p of r.parts) deleteMesh(gl, p.mesh);
    for (const m of this.mats.values()) {
      gl.deleteTexture(m.albedo);
      gl.deleteTexture(m.normal);
    }
    for (const c of this.canvases.values()) gl.deleteTexture(c.tex);
    for (const t of this.decalTex.values()) gl.deleteTexture(t);
    if (this.scene) deleteTarget(gl, this.scene);
    this.statics = [];
    this.dyns = [];
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** A quad lying on a surface with normal n (decal), rotated by `rot` around the normal. */
function decalQuad(mb: MeshBuilder, p: Vec3, n: Vec3, w: number, h: number, rot: number) {
  // tangent frame: up = world Y for walls, Z for floors
  const up: Vec3 = Math.abs(n[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  let tx = up[1] * n[2] - up[2] * n[1];
  let ty = up[2] * n[0] - up[0] * n[2];
  let tz = up[0] * n[1] - up[1] * n[0];
  const tl = Math.hypot(tx, ty, tz) || 1;
  tx /= tl;
  ty /= tl;
  tz /= tl;
  let bx = n[1] * tz - n[2] * ty;
  let by = n[2] * tx - n[0] * tz;
  let bz = n[0] * ty - n[1] * tx;
  // rotate the frame around the normal
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const T: Vec3 = [tx * c + bx * s, ty * c + by * s, tz * c + bz * s];
  const B: Vec3 = [bx * c - tx * s, by * c - ty * s, bz * c - tz * s];
  bx = B[0];
  by = B[1];
  bz = B[2];
  const o = 0.004;
  const P = (a: number, b: number): Vec3 => [p[0] + n[0] * o + T[0] * a * w * 0.5 + bx * b * h * 0.5, p[1] + n[1] * o + T[1] * a * w * 0.5 + by * b * h * 0.5, p[2] + n[2] * o + T[2] * a * w * 0.5 + bz * b * h * 0.5];
  mb.quad(P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), n, T, [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ]);
}

export { hitSpheres, PROP_BY_ID };
