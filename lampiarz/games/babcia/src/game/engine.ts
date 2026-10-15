import * as THREE from "three";
import { DOOR_OPEN, GH, GW, HideSpot, Level, Nav, cellX, cellZ, buildLevel, worldX, worldZ } from "./level";
import { DIFFICULTIES, Difficulty, Granny } from "./granny";
import { sound } from "./audio";
import { PostFX } from "./postfx";
import { Dust } from "./dust";

export type ItemId = "key" | "crowbar" | "fuse" | "padlock";

export const ITEM_INFO: Record<ItemId, { name: string; desc: string; color: number }> = {
  key: { name: "Klucz główny", desc: "Otwiera zamek w drzwiach wyjściowych", color: 0xd8b24a },
  crowbar: { name: "Łom", desc: "Zerwie zablokowane deski", color: 0x9b3b2e },
  fuse: { name: "Bezpiecznik", desc: "Włączy zasilanie zamka elektronicznego", color: 0x4ac0d8 },
  padlock: { name: "Klucz do kłódki", desc: "Zerwze kłódkę na drzwiach", color: 0xc8ccd4 },
};

export interface HudState {
  nights: number;
  maxNights: number;
  stamina: number;
  battery: number;
  flashlight: boolean;
  crouched: boolean;
  hidden: boolean;
  hideType: "wardrobe" | "bed" | "tableBig" | null;
  items: ItemId[];
  batteries: number;
  prompt: string;
  message: string;
  dread: number;
  room: string;
  locks: number;
  time: number;
  locked: boolean;
}

interface Pickup {
  id: ItemId | "battery";
  mesh: THREE.Group;
  taken: boolean;
  spawn: number;
}

type Phase = "idle" | "intro" | "playing" | "paused" | "caught" | "over" | "escaping" | "won";

export interface IntroLine {
  at: number;
  speaker: "BABCIA" | "TY" | "";
  text: string;
  dur: number;
}

const INTRO_LINES: IntroLine[] = [
  { at: 1.6, speaker: "BABCIA", text: "Ciii... nie ruszaj się, dziecko.", dur: 3.2 },
  { at: 5.2, speaker: "BABCIA", text: "Spałeś tak słodko. Prawie jak mój wnuczek... zanim odszedł.", dur: 4.4 },
  { at: 10.0, speaker: "BABCIA", text: "Będziesz tu bezpieczny. Drzwi są dobrze zamknięte.", dur: 3.8 },
  { at: 14.2, speaker: "BABCIA", text: "Masz pięć nocy, żeby nauczyć się zasad tego domu.", dur: 3.8 },
  { at: 18.3, speaker: "BABCIA", text: "Pierwsza zasada: babcia słyszy wszystko.", dur: 3.4 },
  { at: 22.6, speaker: "TY", text: "Gdzie... gdzie ja jestem?", dur: 2.6 },
  { at: 25.6, speaker: "BABCIA", text: "W domu, kochanie. Już na zawsze.", dur: 3.0 },
];
const INTRO_LEAVE_AT = 21.8;
const INTRO_SLAM_AT = 28.9;
const INTRO_END_AT = 30.6;

export interface TouchState {
  move: { x: number; y: number };
  look: { x: number; y: number };
  sprint: boolean;
}

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  level: Level;
  nav: Nav;
  granny: Granny;
  clock = new THREE.Clock();
  fx: PostFX;
  dust: Dust;
  private flashWhite = 0;
  private footSide = 1;
  private stepKick = 0;
  private elapsed = 0;

  phase: Phase = "idle";
  onHud: (h: HudState) => void = () => {};
  onPhase: (p: Phase) => void = () => {};
  onIntro: (line: IntroLine | null, progress: number) => void = () => {};
  private introT = 0;
  private introLeft = false;
  private introSlammed = false;
  private introLineIdx = -1;
  private fade = 0;
  private blur = 0;
  private introBedPos = new THREE.Vector3();

  // player
  pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private eye = 1.62;
  private crouched = false;
  private stamina = 100;
  private exhausted = 0;
  private stepDist = 0;
  private bob = 0;
  private hidden: HideSpot | null = null;
  private shake = 0;
  private catchCam: THREE.Vector3 | null = null;

  // flashlight
  private flash: THREE.SpotLight;
  private flashHolder = new THREE.Group();
  flashlightOn = false;
  private wasFlashlight = false;
  private battery = 100;
  private batteries = 0;
  private flicker = 0;

  // inventory
  private items = new Set<ItemId>();
  private locks = 4;
  private planks: THREE.Mesh[] = [];
  private padlockMesh: THREE.Object3D | null = null;
  private fuseMesh: THREE.Object3D | null = null;
  private fuseDone = false;
  private keyDone = false;

  private pickups: Pickup[] = [];
  private phaseTimer = 0;
  private hudTimer = 0;
  private message = "";
  private messageTimer = 0;
  private prompt = "";
  private dread = 0;
  private heartTimer = 0;
  private time = 0;
  nights = 1;
  maxNights = 5;
  private difficulty: Difficulty = DIFFICULTIES.normal;
  private mouseSens = 1;

  keys: Record<string, boolean> = {};
  touch: TouchState = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, sprint: false };
  isTouch = false;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(74, container.clientWidth / container.clientHeight, 0.06, 120);
    this.scene.fog = new THREE.FogExp2(0x05060b, 0.048);
    this.scene.background = new THREE.Color(0x03040a);

    this.level = buildLevel(this.scene);
    this.nav = new Nav(this.level);
    this.granny = new Granny(this.scene, this.level, this.nav, this.difficulty);

    this.buildOutside();
    this.buildAmbient();

    this.flash = new THREE.SpotLight(0xffe9c4, 0, 32, Math.PI / 6.5, 0.55, 1.25);
    this.flash.castShadow = true;
    this.flash.shadow.mapSize.set(2048, 2048);
    this.flash.shadow.camera.near = 0.3;
    this.flash.shadow.camera.far = 32;
    this.flash.shadow.bias = -0.0012;
    this.flash.shadow.normalBias = 0.02;
    this.flash.shadow.radius = 4;
    this.flashHolder.add(this.flash);
    this.flash.position.set(0.18, -0.12, 0);
    this.scene.add(this.flashHolder);
    this.scene.add(this.flash.target);

    const pr = Math.min(window.devicePixelRatio, 1.8);
    this.fx = new PostFX(this.renderer, this.scene, this.camera, container.clientWidth * pr, container.clientHeight * pr);
    this.dust = new Dust(this.scene);
    this.dust.seed(this.level.playerStart);

    this.isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onPointerLock);

    this.spawnItems();
    this.resetNight(true);
    this.loop();
  }

  dispose() {
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onPointerLock);
    sound.stopAmbient();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  // ---------------------------------------------------------------- setup
  private buildOutside() {
    const g = new THREE.Group();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ color: 0x10170f, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(worldX(33), -0.02, worldZ(27) + 60);
    g.add(ground);
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(6, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xcdd8ff }),
    );
    moon.position.set(worldX(33) - 30, 45, worldZ(27) + 110);
    g.add(moon);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x070a09, roughness: 1 });
    for (let i = 0; i < 22; i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(1.4 + Math.random() * 1.4, 9 + Math.random() * 7, 6), treeMat);
      t.position.set(worldX(33) - 34 + Math.random() * 68, 4, worldZ(27) + 7 + Math.random() * 40);
      g.add(t);
    }
    // porch light outside the exit door
    const porch = new THREE.PointLight(0xffb066, 14, 16, 2);
    porch.position.set(worldX(33), 3.1, worldZ(27) + 2.6);
    g.add(porch);
    const porchBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: new THREE.Color(0xffa64d), emissiveIntensity: 3 }),
    );
    porchBulb.position.copy(porch.position);
    g.add(porchBulb);
    this.scene.add(g);
  }

  private buildAmbient() {
    this.scene.add(new THREE.AmbientLight(0x16203a, 0.32));
    const hemi = new THREE.HemisphereLight(0x25304a, 0x0b0908, 0.3);
    this.scene.add(hemi);
  }

  private makeGlow(color: number) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.35, "rgba(255,255,255,0.25)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    );
    sprite.scale.setScalar(0.85);
    return sprite;
  }

  private makeItemMesh(id: ItemId | "battery"): THREE.Group {
    const g = new THREE.Group();
    const info = id === "battery" ? { color: 0x6cf08a } : ITEM_INFO[id];
    const mat = new THREE.MeshStandardMaterial({
      color: info.color,
      emissive: new THREE.Color(info.color),
      emissiveIntensity: 0.55,
      roughness: 0.4,
      metalness: 0.5,
    });
    if (id === "key" || id === "padlock") {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 8, 14), mat);
      g.add(ring);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.19), mat);
      shaft.position.z = 0.12;
      g.add(shaft);
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.03), mat);
      tooth.position.set(0, -0.03, 0.18);
      g.add(tooth);
    } else if (id === "crowbar") {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.62), mat);
      g.add(a);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), mat);
      b.position.set(0, 0.07, -0.3);
      g.add(b);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), mat);
      c.position.set(0.02, 0.05, 0.3);
      c.rotation.x = 0.5;
      g.add(c);
    } else if (id === "fuse") {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 12), mat);
      body.rotation.z = Math.PI / 2;
      g.add(body);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.9, roughness: 0.3 }));
      cap.rotation.z = Math.PI / 2;
      cap.position.x = 0.09;
      g.add(cap);
    } else {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.17, 12), mat);
      g.add(body);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9 }));
      tip.position.y = 0.09;
      g.add(tip);
    }
    g.add(this.makeGlow(info.color));
    return g;
  }

  private spawnItems() {
    const spawns = [...this.level.itemSpawns];
    // shuffle
    for (let i = spawns.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spawns[i], spawns[j]] = [spawns[j], spawns[i]];
    }
    const ids: (ItemId | "battery")[] = ["key", "crowbar", "fuse", "padlock", "battery", "battery", "battery", "battery"];
    ids.forEach((id, i) => {
      const spawn = spawns[i % spawns.length];
      const mesh = this.makeItemMesh(id);
      mesh.position.copy(spawn.pos);
      mesh.position.y += 0.05;
      this.scene.add(mesh);
      this.pickups.push({ id, mesh, taken: false, spawn: i });
    });
    // exit door lock meshes
    this.level.exitDoor.lockGroup.traverse((o) => {
      if (o instanceof THREE.Mesh && o.name.startsWith("plank")) this.planks.push(o);
      else if (o.name === "padlock") this.padlockMesh = o;
      else if (o.name === "fuseled") this.fuseMesh = o;
    });
  }

  private setFuseLed(on: boolean) {
    const led = this.fuseMesh as THREE.Mesh | null;
    if (!led) return;
    const c = on ? 0x30ff60 : 0xff2020;
    led.material = new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 2 });
  }

  // ---------------------------------------------------------------- lifecycle
  start(difficulty: keyof typeof DIFFICULTIES, shadows: boolean, sens: number, skipIntro = false) {
    this.difficulty = DIFFICULTIES[difficulty] ?? DIFFICULTIES.normal;
    this.granny.setDifficulty(this.difficulty);
    this.renderer.shadowMap.enabled = shadows;
    this.mouseSens = sens;
    this.nights = 1;
    this.maxNights = 5;
    this.items.clear();
    this.locks = 4;
    this.battery = 100;
    this.batteries = 0;
    this.time = 0;
    this.pickups.forEach((p) => {
      p.taken = false;
      p.mesh.visible = true;
    });
    this.planks.forEach((p) => (p.visible = true));
    this.fuseDone = false;
    this.keyDone = false;
    if (this.padlockMesh) this.padlockMesh.visible = true;
    this.setFuseLed(false);
    this.level.doors.forEach((d) => {
      d.open = false;
      d.target = 0;
      d.angle = 0;
      d.pivot.rotation.y = 0;
    });
    this.level.hideSpots.forEach((h) => {
      h.doorAmount = 1;
      h.doorTarget = 1;
      if (h.leaves && h.leafOpen) {
        h.leaves[0].rotation.y = h.leafOpen[0];
        h.leaves[1].rotation.y = h.leafOpen[1];
      }
    });
    this.resetNight(true);
    sound.resume();
    sound.startAmbient();
    this.requestLock();
    if (skipIntro) {
      this.beginPlay();
    } else {
      this.startIntro();
    }
  }

  private beginPlay() {
    this.phase = "playing";
    this.onPhase(this.phase);
    this.onIntro(null, 1);
    this.setMessage("Znajdź 4 przedmioty i otwórz drzwi wyjściowe. Nie hałasuj.", 5);
  }

  // ---------------------------------------------------------------- intro cutscene
  private startIntro() {
    this.phase = "intro";
    this.onPhase(this.phase);
    this.introT = 0;
    this.introLeft = false;
    this.introSlammed = false;
    this.introLineIdx = -1;
    this.fade = 1;
    this.blur = 1;
    this.flashlightOn = false;
    this.flash.intensity = 0;
    // lying on the bedroom bed (furniture at cells 1-2 × 2-3)
    const bed = this.level.hideSpots.find((h) => h.type === "bed" && h.furn.x === 1 && h.furn.z === 2);
    const bx = bed ? bed.pos.x : worldX(1) + 1;
    const bz = bed ? bed.pos.z : worldZ(2) + 1;
    // head on the pillow near the bed's east edge (bed spans two cells in X)
    this.introBedPos.set(bx + 1.25, 0.98, bz + 0.2);
    this.camera.position.copy(this.introBedPos);
    this.yaw = -Math.PI / 2; // facing +X, where she stands
    this.pitch = 1.3; // staring at the ceiling
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    // granny standing on the floor just past the bed frame, leaning over
    this.granny.reset(new THREE.Vector3(bx + 2.75, 0, bz + 0.05), 0);
    this.granny.root.rotation.y = -Math.PI / 2;
    // bedroom door closed, player start next to the bed
    this.level.doors.forEach((d) => {
      d.open = false;
      d.target = 0;
      d.angle = 0;
      d.pivot.rotation.y = 0;
    });
    sound.breath(0.6);
    this.onIntro(null, 0);
  }

  skipIntro() {
    if (this.phase !== "intro") return;
    this.finishIntro();
  }

  private finishIntro() {
    this.introT = INTRO_END_AT;
    this.onIntro(null, 1);
    this.resetNight(true);
    this.fade = 1;
    this.blur = 0;
    this.flashlightOn = true;
    this.beginPlay();
    this.requestLock();
  }

  private updateIntro(dt: number) {
    const prev = this.introT;
    this.introT += dt;
    const t = this.introT;

    // eyes opening: fade & blur clear over the first seconds, with a couple of blinks
    const open = THREE.MathUtils.smoothstep(t, 0.4, 3.0);
    let fade = 1 - open;
    if (t > 7.5 && t < 8.0) fade = Math.max(fade, 1 - Math.abs((t - 7.75) / 0.25)); // blink
    if (t > 16.4 && t < 16.8) fade = Math.max(fade, 1 - Math.abs((t - 16.6) / 0.2));
    if (t > INTRO_SLAM_AT) fade = Math.max(fade, THREE.MathUtils.smoothstep(t, INTRO_SLAM_AT, INTRO_END_AT - 0.4));
    this.fade = fade;
    this.blur = Math.max(0, 1 - THREE.MathUtils.smoothstep(t, 1.5, 9.0)) + (t > 7.5 && t < 8.6 ? 0.35 : 0);

    // head tilts from the ceiling down toward her face, with drowsy drift
    const lookDown = THREE.MathUtils.smoothstep(t, 2.2, 5.5);
    const targetPitch = THREE.MathUtils.lerp(1.3, 0.72, lookDown) + Math.sin(t * 0.6) * 0.03;
    const targetYaw = -Math.PI / 2 + Math.sin(t * 0.45) * 0.05 + (this.introLeft ? THREE.MathUtils.smoothstep(t, INTRO_LEAVE_AT, INTRO_LEAVE_AT + 3) * 0.9 : 0);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 2.2);
    this.yaw += (targetYaw - this.yaw) * Math.min(1, dt * 2);
    // when she walks away, the view follows her toward the door; pitch levels out
    if (this.introLeft) this.pitch += (0.25 - this.pitch) * Math.min(1, dt * 0.9);
    const breathe = Math.sin(t * 1.4) * 0.012;
    this.camera.position.set(this.introBedPos.x, this.introBedPos.y + breathe, this.introBedPos.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(t * 0.37) * 0.04, "YXZ");

    // subtitles
    let idx = -1;
    for (let i = 0; i < INTRO_LINES.length; i++) {
      const l = INTRO_LINES[i];
      if (t >= l.at && t < l.at + l.dur) idx = i;
    }
    if (idx !== this.introLineIdx) {
      this.introLineIdx = idx;
      const line = idx >= 0 ? INTRO_LINES[idx] : null;
      this.onIntro(line, t / INTRO_END_AT);
      if (line && line.speaker === "BABCIA") sound.whisper(line.dur * 0.8, 1);
    }
    const speaking = idx >= 0 && INTRO_LINES[idx].speaker === "BABCIA";

    // granny behaviour
    if (!this.introLeft) {
      this.granny.loom(dt, this.camera.position, speaking, t);
      if (t >= INTRO_LEAVE_AT) {
        this.introLeft = true;
        this.granny.scriptedGoTo(worldX(5), worldZ(10));
        sound.creak(this.granny.pos, 0.8);
      }
    } else {
      this.granny.update(dt, this.camera.position, true, false, false, this.forward());
      if (!this.introSlammed && t >= INTRO_SLAM_AT) {
        this.introSlammed = true;
        const door = this.level.doors.find((d) => d.cx === 5 && d.cz === 8);
        if (door) {
          door.open = false;
          door.target = 0;
          door.angle = 0;
          door.pivot.rotation.y = 0;
        }
        sound.slam();
        sound.sting();
        this.shake = 0.1;
      }
    }
    // ambient creaks of the old house
    if (Math.floor(prev / 6.5) !== Math.floor(t / 6.5)) {
      sound.creak(new THREE.Vector3(this.camera.position.x + (Math.random() - 0.5) * 8, 2, this.camera.position.z + (Math.random() - 0.5) * 8), 0.5);
    }

    if (t >= INTRO_END_AT) this.finishIntro();
  }

  private resetNight(first: boolean) {
    this.pos.copy(this.level.playerStart);
    this.yaw = 3.4;
    this.pitch = 0;
    this.vel.set(0, 0, 0);
    this.crouched = false;
    this.hidden = null;
    this.stamina = 100;
    this.exhausted = 0;
    this.flashlightOn = first ? true : this.flashlightOn;
    this.level.hideSpots.forEach((h) => {
      h.doorTarget = 1;
      h.doorAmount = 1;
      if (h.leaves && h.leafOpen) {
        h.leaves[0].rotation.y = h.leafOpen[0];
        h.leaves[1].rotation.y = h.leafOpen[1];
      }
    });
    const spots = [this.level.grannyStart, new THREE.Vector3(worldX(20), 0, worldZ(10)), new THREE.Vector3(worldX(6), 0, worldZ(19)), new THREE.Vector3(worldX(22), 0, worldZ(24))];
    const far = spots.sort((a, b) => b.distanceTo(this.pos) - a.distanceTo(this.pos))[0];
    this.granny.reset(far.clone(), (this.nights - 1) * 0.34);
    this.level.doors.forEach((d) => {
      if (!d.isExit) {
        d.open = false;
        d.target = 0;
        d.angle = 0;
        d.pivot.rotation.y = 0;
      }
    });
  }

  requestLock() {
    if (this.isTouch) return;
    const el = this.renderer.domElement;
    if (el.requestPointerLock) void el.requestPointerLock();
  }

  pause() {
    if (this.phase !== "playing") return;
    this.phase = "paused";
    this.onPhase(this.phase);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resume() {
    if (this.phase !== "paused") return;
    this.phase = "playing";
    this.onPhase(this.phase);
    this.requestLock();
  }

  togglePause() {
    if (this.phase === "playing") this.pause();
    else if (this.phase === "paused") this.resume();
  }

  // ---------------------------------------------------------------- input
  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    const pr = Math.min(window.devicePixelRatio, 1.8);
    this.fx.setSize(w * pr, h * pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (this.phase === "intro") {
      if (e.code === "Enter" || e.code === "Space" || e.code === "Escape") {
        e.preventDefault();
        this.skipIntro();
      }
      return;
    }
    if (e.code === "Escape") {
      this.togglePause();
      return;
    }
    if (this.phase !== "playing") return;
    if (e.code === "KeyE") this.interact();
    if (e.code === "KeyF") this.toggleFlashlight();
    if (e.code === "KeyR") this.swapBattery();
    if (e.code === "KeyC" || e.code === "ControlLeft") {
      if (!this.hidden) {
        this.crouched = !this.crouched;
        sound.rustle(0.9);
      }
    }
    if (["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.phase !== "playing" || !document.pointerLockElement) return;
    const s = 0.0022 * this.mouseSens;
    this.yaw -= e.movementX * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * s, -1.35, 1.35);
  };

  private onPointerLock = () => {
    if (!document.pointerLockElement && this.phase === "playing" && !this.isTouch) this.pause();
  };

  // ---------------------------------------------------------------- helpers
  private setMessage(msg: string, t = 2.6) {
    this.message = msg;
    this.messageTimer = t;
  }

  private emitNoise(radius: number, pos?: THREE.Vector3) {
    this.granny.hear(pos ?? this.pos, radius);
  }

  /** Smoothly open/close wardrobe doors rather than popping the player into a box. */
  private updateHideDoors(dt: number) {
    for (const h of this.level.hideSpots) {
      if (!h.leaves || !h.leafOpen) continue;
      h.doorAmount += (h.doorTarget - h.doorAmount) * Math.min(1, dt * 8);
      h.leaves[0].rotation.y = h.leafOpen[0] * h.doorAmount;
      h.leaves[1].rotation.y = h.leafOpen[1] * h.doorAmount;
    }
  }

  private forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  private free(x: number, z: number, r: number) {
    for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      const cx = cellX(x + ox);
      const cz = cellZ(z + oz);
      if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return false;
      const i = cz * GW + cx;
      if (this.level.floor[i] !== 1) return false;
      if (this.level.blocked[i]) return false;
      const door = this.level.doors.find((d) => d.cx === cx && d.cz === cz);
      if (door && !door.open && door.angle < 0.5) return false;
    }
    return true;
  }

  private flashDirSmooth = new THREE.Vector3(0, 0, -1);
  private flashOffsetWorld = new THREE.Vector3();

  /** Points the spotlight exactly where the camera looks, with a touch of hand-lag. */
  private aimFlashlight(dt: number) {
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    // slight lag like a hand-held torch
    const lag = Math.min(1, dt * 14);
    this.flashDirSmooth.lerp(camDir, lag).normalize();
    // offset the lamp to the lower-right of the camera (held in the hand)
    this.flashOffsetWorld
      .set(0.16, -0.14, 0)
      .applyQuaternion(this.camera.quaternion);
    this.flashHolder.position.copy(this.camera.position).add(this.flashOffsetWorld);
    this.flash.position.set(0, 0, 0);
    this.flash.target.position.copy(this.camera.position).addScaledVector(this.flashDirSmooth, 12);
    this.flash.target.updateMatrixWorld();
  }

  toggleFlashlight() {
    if (this.battery <= 0) {
      this.setMessage("Bateria jest pusta. Znajdź baterie.", 2);
      return;
    }
    this.flashlightOn = !this.flashlightOn;
    if (this.flashlightOn) sound.pickup();
  }

  // ---------------------------------------------------------------- interaction
  private bestInteractable(): { kind: "item" | "door" | "hide" | "exit"; obj: unknown; label: string } | null {
    const eye = new THREE.Vector3(this.pos.x, this.eye, this.pos.z);
    const fwd = this.forward();
    let best: { kind: "item" | "door" | "hide" | "exit"; obj: unknown; label: string; d: number } | null = null;
    const consider = (p: THREE.Vector3, kind: "item" | "door" | "hide" | "exit", obj: unknown, label: string, range = 2.5) => {
      const to = new THREE.Vector3(p.x - eye.x, p.y - eye.y, p.z - eye.z);
      const d = to.length();
      if (d > range) return;
      to.normalize();
      const flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
      const flatTo = new THREE.Vector3(to.x, 0, to.z).normalize();
      if (flat.dot(flatTo) < 0.45) return;
      if (!best || d < best.d) best = { kind, obj, label, d };
    };

    if (!this.hidden) {
      for (const p of this.pickups) {
        if (p.taken) continue;
        consider(p.mesh.position, "item", p, p.id === "battery" ? "Podnieś baterię" : `Podnieś: ${ITEM_INFO[p.id as ItemId].name}`, 2.6);
      }
      for (const d of this.level.doors) {
        if (d.isExit) continue;
        consider(d.pos, "door", d, d.open ? "Zamknij drzwi" : "Otwórz drzwi", 2.3);
      }
      for (const h of this.level.hideSpots) {
        consider(new THREE.Vector3(h.exit.x, 1, h.exit.z), "hide", h, h.type === "wardrobe" ? "Wejdź do szafy" : h.type === "bed" ? "Schowaj się pod łóżkiem" : "Schowaj się pod stołem", 2.4);
      }
    }
    const ex = this.level.exitDoor;
    consider(ex.pos, "exit", ex, this.locks > 0 ? "Obejrzyj drzwi wyjściowe" : "UCIEKAJ!", 3.0);
    return best;
  }

  interact() {
    if (this.phase !== "playing") return;
    if (this.hidden) {
      this.leaveHiding();
      return;
    }
    const target = this.bestInteractable();
    if (!target) return;
    if (target.kind === "item") {
      const p = target.obj as Pickup;
      p.taken = true;
      p.mesh.visible = false;
      sound.pickup();
      if (p.id === "battery") {
        this.batteries = Math.min(4, this.batteries + 1);
        this.setMessage("Bateria w kieszeni. Wciśnij R, aby wymienić.", 3);
      } else {
        const id = p.id as ItemId;
        this.items.add(id);
        this.setMessage(`Zdobyto: ${ITEM_INFO[id].name} — ${ITEM_INFO[id].desc}`, 3.4);
      }
      return;
    }
    if (target.kind === "door") {
      const d = target.obj as (typeof this.level.doors)[number];
      d.open = !d.open;
      if (d.open) {
        // swing away from the player
        const away = d.axis === "x" ? Math.sign(d.pos.z - this.pos.z) || 1 : Math.sign(d.pos.x - this.pos.x) || 1;
        d.target = (d.axis === "x" ? -away : away) * DOOR_OPEN;
      } else {
        d.target = 0;
      }
      sound.creak(d.pos, 1);
      this.emitNoise(10, d.pos);
      return;
    }
    if (target.kind === "hide") {
      this.enterHiding(target.obj as HideSpot);
      return;
    }
    if (target.kind === "exit") this.useExitDoor();
  }

  private enterHiding(h: HideSpot) {
    const seen = this.granny.canSee(this.pos, false, this.crouched, this.flashlightOn, this.forward());
    this.hidden = h;
    this.crouched = false;
    this.vel.set(0, 0, 0);
    // The player really moves into the furniture, which keeps the camera,
    // enemy distance and exit point in a single coherent place.
    this.pos.copy(h.pos).setY(0);
    this.wasFlashlight = this.flashlightOn;
    this.flashlightOn = false;
    h.doorTarget = 0;
    this.granny.sawPlayerHide = seen;
    if (seen) this.setMessage("ZOBACZYŁA CIĘ! Zaraz tu będzie...", 3);
    else this.setMessage(h.type === "wardrobe" ? "W szafie. Drzwi są zamknięte. Nie ruszaj się." : "Skulony. Nie hałasuj.", 3);
    sound.creak(h.pos, 0.7);
    this.emitNoise(h.type === "wardrobe" ? 3.5 : 5, h.pos);
  }

  private leaveHiding() {
    if (!this.hidden) return;
    const h = this.hidden;
    const exit = h.exit;
    // Step out through the actual opening. If it is obstructed, try either side.
    if (this.free(exit.x, exit.z, 0.3)) {
      this.pos.set(exit.x, 0, exit.z);
    } else {
      const side = new THREE.Vector3(exit.z - h.pos.z, 0, h.pos.x - exit.x).normalize().multiplyScalar(0.75);
      const a = new THREE.Vector3(exit.x + side.x, 0, exit.z + side.z);
      const b = new THREE.Vector3(exit.x - side.x, 0, exit.z - side.z);
      if (this.free(a.x, a.z, 0.3)) this.pos.copy(a);
      else if (this.free(b.x, b.z, 0.3)) this.pos.copy(b);
      else this.pos.set(exit.x, 0, exit.z);
    }
    h.doorTarget = 1;
    this.hidden = null;
    this.granny.sawPlayerHide = false;
    if (this.wasFlashlight && this.battery > 0) this.flashlightOn = true;
    this.wasFlashlight = false;
    sound.creak(new THREE.Vector3(this.pos.x, 1, this.pos.z), 0.8);
    this.emitNoise(7);
  }

  private useExitDoor() {
    const ex = this.level.exitDoor;
    if (this.locks <= 0) {
      ex.open = true;
      ex.target = -Math.PI / 2; // outward (+Z)
      sound.creak(ex.pos, 1.4);
      this.phase = "escaping";
      this.phaseTimer = 0;
      this.onPhase(this.phase);
      sound.victory();
      return;
    }
    const fuseDone = this.fuseDone;
    const steps: { id: ItemId; done: boolean; apply: () => void; msg: string; noise: number; loud?: boolean }[] = [
      {
        id: "crowbar",
        done: !this.planks.some((p) => p.visible),
        apply: () => this.planks.forEach((p) => (p.visible = false)),
        msg: "Deski zerwane. Babcia to na pewno słyszała!",
        noise: 70,
        loud: true,
      },
      {
        id: "padlock",
        done: !this.padlockMesh?.visible,
        apply: () => {
          if (this.padlockMesh) this.padlockMesh.visible = false;
        },
        msg: "Kłódka otwarta.",
        noise: 18,
      },
      {
        id: "fuse",
        done: fuseDone,
        apply: () => {
          this.setFuseLed(true);
          this.fuseDone = true;
        },
        msg: "Zasilanie przywrócone. Zamek kliknął.",
        noise: 26,
      },
      {
        id: "key",
        done: this.keyDone,
        apply: () => {
          this.keyDone = true;
        },
        msg: "Zamek otwarty!",
        noise: 14,
      },
    ];

    const next = steps.find((s) => !s.done);
    if (!next) return;
    if (!this.items.has(next.id)) {
      const missing = steps.filter((s) => !s.done && !this.items.has(s.id)).map((s) => ITEM_INFO[s.id].name);
      this.setMessage(`Drzwi są zabezpieczone. Brakuje: ${missing.join(", ")}`, 3.2);
      return;
    }
    next.apply();
    this.locks = Math.max(0, this.locks - 1);
    if (next.loud) {
      sound.bang(ex.pos, 1.3);
      for (let i = 0; i < 3; i++) setTimeout(() => sound.bang(ex.pos, 1), 250 + i * 320);
    } else {
      sound.unlock();
    }
    this.setMessage(next.msg, 3.2);
    this.emitNoise(next.noise, ex.pos);
    this.pushHud();
  }

  swapBattery() {
    if (this.batteries <= 0) {
      this.setMessage("Nie masz baterii.", 2);
      return;
    }
    this.batteries--;
    this.battery = 100;
    sound.pickup();
    this.setMessage("Nowa bateria.", 2);
  }

  // ---------------------------------------------------------------- loop
  private loop = () => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    if (this.phase === "playing") this.update(dt);
    else if (this.phase === "intro") this.updateIntro(dt);
    else if (this.phase === "caught") this.updateCaught(dt);
    else if (this.phase === "escaping") this.updateEscape(dt);
    this.updateDoors(dt);
    this.updateHideDoors(dt);
    this.updateVisuals(dt);
    if (this.phase !== "intro") {
      // fade back in after the cutscene / clear any leftover blur
      this.fade = Math.max(0, this.fade - dt * 0.9);
      this.blur = Math.max(0, this.blur - dt * 1.5);
    }

    // dust + post
    const fdir = new THREE.Vector3();
    this.flash.target.getWorldPosition(fdir).sub(this.camera.position).normalize();
    this.dust.update(dt, this.elapsed, this.camera.position, this.camera.position, fdir, this.flash.intensity > 0.5);
    this.flashWhite = Math.max(0, this.flashWhite - dt * 2.2);
    const dreadFx = this.phase === "caught" ? 1 : this.phase === "idle" ? 0.12 : this.phase === "intro" ? 0.08 : this.dread;
    this.fx.update(this.elapsed, dreadFx, this.flashWhite, this.blur, this.fade);
    this.fx.render();
  };

  private updateDoors(dt: number) {
    for (const d of this.level.doors) {
      if (Math.abs(d.target - d.angle) > 0.001) {
        d.angle += (d.target - d.angle) * Math.min(1, dt * 4.5);
        d.pivot.rotation.y = d.angle;
      }
    }
  }

  private update(dt: number) {
    this.time += dt;
    if (this.messageTimer > 0) this.messageTimer -= dt;

    // ---- look (touch)
    if (this.isTouch && (this.touch.look.x || this.touch.look.y)) {
      const s = 0.045 * this.mouseSens;
      this.yaw -= this.touch.look.x * s;
      this.pitch = THREE.MathUtils.clamp(this.pitch - this.touch.look.y * s, -1.35, 1.35);
    }

    const hidden = !!this.hidden;
    // ---- movement
    const fwd = this.forward();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let ix = 0;
    let iz = 0;
    if (!hidden) {
      if (this.keys["KeyW"] || this.keys["ArrowUp"]) iz += 1;
      if (this.keys["KeyS"] || this.keys["ArrowDown"]) iz -= 1;
      if (this.keys["KeyD"] || this.keys["ArrowRight"]) ix += 1;
      if (this.keys["KeyA"] || this.keys["ArrowLeft"]) ix -= 1;
      ix += this.touch.move.x;
      iz += this.touch.move.y;
    }
    const len = Math.hypot(ix, iz);
    if (len > 1) {
      ix /= len;
      iz /= len;
    }
    const wantSprint = (this.keys["ShiftLeft"] || this.keys["ShiftRight"] || this.touch.sprint) && !this.crouched && !hidden && iz > 0.2 && this.exhausted <= 0;
    let speed = this.crouched ? 1.35 : 2.7;
    if (wantSprint && this.stamina > 0) {
      speed = 4.6;
      this.stamina = Math.max(0, this.stamina - dt * 21);
      if (this.stamina <= 0) {
        this.exhausted = 3.2;
        this.setMessage("Brak tchu...", 2);
      }
    } else {
      this.stamina = Math.min(100, this.stamina + dt * (this.crouched ? 17 : 11));
    }
    if (this.exhausted > 0) {
      this.exhausted -= dt;
      speed = Math.min(speed, 1.9);
      if (Math.random() < dt * 1.4) sound.breath(1);
    }

    const desired = new THREE.Vector3(fwd.x * iz + right.x * ix, 0, fwd.z * iz + right.z * ix).multiplyScalar(speed);
    this.vel.x += (desired.x - this.vel.x) * Math.min(1, dt * 11);
    this.vel.z += (desired.z - this.vel.z) * Math.min(1, dt * 11);
    if (hidden) this.vel.set(0, 0, 0);

    const r = 0.33;
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    if (!hidden) {
      if (this.free(nx, this.pos.z, r)) this.pos.x = nx;
      else this.vel.x *= -0.05;
      if (this.free(this.pos.x, nz, r)) this.pos.z = nz;
      else this.vel.z *= -0.05;
    }

    // ---- crouch smoothing + hide position
    const targetEye = hidden ? this.hidden!.pos.y : this.crouched ? 0.98 : 1.62;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 8);

    // ---- footsteps & noise
    const moved = this.vel.length() * dt;
    this.stepDist += moved;
    const stride = this.crouched ? 1.15 : wantSprint ? 1.05 : 0.92;
    if (this.stepDist > stride && !hidden) {
      this.stepDist = 0;
      this.footSide = -this.footSide;
      const vol = this.crouched ? 0.3 : wantSprint ? 1.0 : 0.62;
      const surface = this.level.surfaceAt(this.pos.x, this.pos.z);
      sound.footstep({ surface, vol, foot: this.footSide, sprint: !!wantSprint });
      const cellIdx = cellZ(this.pos.z) * GW + cellX(this.pos.x);
      let noise = this.crouched ? 1.6 : wantSprint ? 15 : 6;
      if (surface === "tile") noise *= 1.5;
      if (surface === "carpet") noise *= 0.5;
      if (this.level.creaky.has(cellIdx)) {
        sound.creak({ x: this.pos.x, y: 0, z: this.pos.z }, 0.9);
        noise = Math.max(noise, this.crouched ? 8 : 22);
      }
      this.emitNoise(noise);
      // step-induced camera dip
      this.stepKick = wantSprint ? 0.035 : this.crouched ? 0.008 : 0.018;
    }
    this.stepKick = Math.max(0, this.stepKick - dt * 0.25);

    // ---- battery
    if (this.flashlightOn) {
      this.battery = Math.max(0, this.battery - dt * 1.35);
      if (this.battery <= 0) {
        this.flashlightOn = false;
        this.setMessage("Latarka zgasła!", 2.5);
      }
    }

    // ---- granny
    const grannyVisible = this.granny.canSee(this.pos, hidden, this.crouched, this.flashlightOn, fwd);
    this.granny.update(dt, this.pos, hidden, this.crouched, this.flashlightOn, fwd);
    void grannyVisible;

    // being pulled out of hiding
    if (hidden && this.granny.sawPlayerHide && this.granny.distanceTo(this.pos) < 1.5) {
      this.startCatch();
      return;
    }
    if (!hidden && this.granny.distanceTo(this.pos) < 1.05) {
      this.startCatch();
      return;
    }

    // ---- dread / heartbeat
    const d = this.granny.distanceTo(this.pos);
    const seen = this.granny.state === "hunt";
    const near = THREE.MathUtils.clamp(1 - (d - 2) / 16, 0, 1);
    this.dread = THREE.MathUtils.clamp(near * (seen ? 1.5 : 0.85), 0, 1);
    sound.setDread(this.dread);
    this.heartTimer -= dt;
    const bpm = 0.95 - this.dread * 0.62;
    if (this.heartTimer <= 0 && this.dread > 0.12) {
      this.heartTimer = bpm;
      sound.heartbeat(this.dread);
    }

    // ---- head bob & camera
    this.bob += moved * (wantSprint ? 7 : 5.2);
    const bobY = Math.sin(this.bob) * (wantSprint ? 0.055 : 0.03) * (this.crouched ? 0.4 : 1);
    const bobX = Math.cos(this.bob * 0.5) * 0.02;
    let px = this.pos.x;
    let pz = this.pos.z;
    if (hidden) {
      px = this.hidden!.pos.x;
      pz = this.hidden!.pos.z;
    }
    this.shake = Math.max(0, this.shake - dt * 2);
    const sh = this.shake + this.dread * (seen ? 0.035 : 0.012);
    this.camera.position.set(
      px + bobX + (Math.random() - 0.5) * sh,
      this.eye + bobY - this.stepKick + (Math.random() - 0.5) * sh,
      pz + (Math.random() - 0.5) * sh,
    );
    const roll = Math.sin(this.bob * 0.5) * (wantSprint ? 0.012 : 0.006) * (hidden ? 0 : 1);
    this.camera.rotation.set(this.pitch, this.yaw, roll, "YXZ");

    // ---- flashlight follow
    this.aimFlashlight(dt);
    this.flicker += dt * 9;
    const nearGranny = d < 7;
    let intensity = this.flashlightOn ? 36 : 0;
    if (this.flashlightOn) {
      if (this.battery < 18) intensity *= 0.55 + Math.random() * 0.45;
      if (nearGranny && Math.sin(this.flicker * 2.3) > 0.86) intensity *= 0.25;
      if (this.dread > 0.85 && Math.random() < 0.09) intensity *= 0.3;
    }
    this.flash.intensity = intensity;

    // ---- item bobbing
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 1.1;
      p.mesh.position.y += Math.sin(this.time * 2 + p.spawn) * dt * 0.05;
    }

    // ---- lamps flicker
    for (const l of this.level.lamps) {
      l.flicker += dt * (1 + Math.random() * 3);
      const base = l.base;
      const f = 0.82 + Math.sin(l.flicker * 3.1) * 0.08 + (Math.random() < 0.006 ? -0.7 : 0);
      l.light.intensity = base * f;
    }

    // ---- prompt
    const t = this.bestInteractable();
    this.prompt = hidden ? "E — wyjdź z ukrycia" : t ? `E — ${t.label}` : "";

    // ---- hud
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.pushHud();
    }
  }

  private updateCaught(dt: number) {
    this.phaseTimer += dt;
    const g = this.granny;
    const cam = this.catchCam ?? this.camera.position.clone();
    this.catchCam = cam;
    // granny lunges into the camera
    const dir = new THREE.Vector3(cam.x - g.pos.x, 0, cam.z - g.pos.z).normalize();
    const want = new THREE.Vector3(cam.x - dir.x * 0.8, 0, cam.z - dir.z * 0.8);
    g.pos.lerp(want, Math.min(1, dt * 7));
    g.root.position.copy(g.pos);
    const yaw = Math.atan2(cam.x - g.pos.x, cam.z - g.pos.z);
    g.root.rotation.y = yaw;
    this.shake = 0.075;
    this.camera.position.set(
      cam.x + (Math.random() - 0.5) * this.shake,
      cam.y + (Math.random() - 0.5) * this.shake,
      cam.z + (Math.random() - 0.5) * this.shake,
    );
    // snap the view onto her face
    const toHer = new THREE.Vector3(g.pos.x - cam.x, 0, g.pos.z - cam.z);
    const wantYaw = Math.atan2(-toHer.x, -toHer.z);
    const curYaw = this.camera.rotation.y;
    const dYaw = Math.atan2(Math.sin(wantYaw - curYaw), Math.cos(wantYaw - curYaw));
    this.yaw = curYaw + dYaw * Math.min(1, dt * 9);
    this.pitch = THREE.MathUtils.lerp(this.camera.rotation.x, -0.08, Math.min(1, dt * 6));
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.phaseTimer * 26) * 0.035, "YXZ");
    // she raises the bat and screams into the lens
    g.root.scale.setScalar(1.02);
    g.scareUpdate(this.phaseTimer);
    this.aimFlashlight(dt);
    this.flash.intensity = 14 + Math.random() * 18;
    if (this.phaseTimer > 1.9) {
      this.afterCatch();
    }
  }

  private startCatch() {
    if (this.phase !== "playing") return;
    this.phase = "caught";
    this.phaseTimer = 0;
    this.onPhase(this.phase);
    sound.scream();
    sound.sting();
    this.hidden = null;
    this.flashlightOn = false;
    this.catchCam = this.camera.position.clone();
    this.granny.scarePose();
    this.shake = 0.12;
    this.flashWhite = 1;
    this.pushHud();
  }

  private afterCatch() {
    if (this.nights >= this.maxNights) {
      this.phase = "over";
      this.onPhase(this.phase);
      sound.stopAmbient();
      return;
    }
    this.nights++;
    this.resetNight(false);
    this.phase = "playing";
    this.onPhase(this.phase);
    this.setMessage(`Noc ${this.nights} z ${this.maxNights}. Babcia jest szybsza...`, 4);
  }

  private updateEscape(dt: number) {
    this.phaseTimer += dt;
    // walk out through the open door, facing +Z
    const wantYaw = Math.PI;
    const d = Math.atan2(Math.sin(wantYaw - this.yaw), Math.cos(wantYaw - this.yaw));
    this.yaw += d * Math.min(1, dt * 3);
    this.pitch = THREE.MathUtils.lerp(this.pitch, 0.05, dt * 2);
    this.camera.position.z += dt * 2.2;
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, worldX(33), dt * 2);
    this.camera.position.y = 1.6 + Math.sin(this.phaseTimer * 9) * 0.03;
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    this.aimFlashlight(dt);
    this.dread = Math.max(0, this.dread - dt);
    if (this.phaseTimer > 2.4) {
      this.phase = "won";
      this.onPhase(this.phase);
      sound.stopAmbient();
    }
  }

  private menuTime = 0;

  private updateMenuCam(dt: number) {
    this.menuTime += dt;
    const cx = worldX(33);
    const cz = worldZ(24);
    const a = this.menuTime * 0.11;
    const r = 4.2;
    this.camera.position.set(cx + Math.sin(a) * r, 1.72 + Math.sin(this.menuTime * 0.4) * 0.08, cz + Math.cos(a) * r);
    this.camera.lookAt(cx, 1.15, worldZ(26.6));
    this.camera.rotation.z = Math.sin(this.menuTime * 0.23) * 0.02;
    this.flash.intensity = 0;
    this.granny.update(dt, this.camera.position, true, false, false, this.forward());
  }

  private updateVisuals(dt: number) {
    if (this.phase === "idle") this.updateMenuCam(dt);
    // lamps keep flickering slowly when paused for atmosphere
    if (this.phase !== "playing") {
      for (const l of this.level.lamps) {
        l.flicker += dt * 0.7;
        l.light.intensity = l.base * (0.85 + Math.sin(l.flicker * 2.4) * 0.1);
      }
    }
    const fwd = this.forward();
    sound.setListener(
      { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      { x: fwd.x, y: Math.sin(this.pitch) * 0.5, z: fwd.z },
    );
  }

  pushHud() {
    this.onHud({
      nights: this.nights,
      maxNights: this.maxNights,
      stamina: this.stamina,
      battery: this.battery,
      flashlight: this.flashlightOn,
      crouched: this.crouched,
      hidden: !!this.hidden,
      hideType: (this.hidden?.type as "wardrobe" | "bed" | "tableBig" | undefined) ?? null,
      items: [...this.items],
      batteries: this.batteries,
      prompt: this.prompt,
      message: this.messageTimer > 0 ? this.message : "",
      dread: this.dread,
      room: this.level.roomName(this.pos.x, this.pos.z),
      locks: this.locks,
      time: this.time,
      locked: this.isTouch || !!document.pointerLockElement,
    });
  }

  setSensitivity(s: number) {
    this.mouseSens = s;
  }

  setShadows(on: boolean) {
    this.renderer.shadowMap.enabled = on;
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material.needsUpdate = true;
    });
  }
}
