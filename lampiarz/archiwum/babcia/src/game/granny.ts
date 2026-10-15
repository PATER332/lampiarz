import * as THREE from "three";
import { CELL, DOOR_OPEN, DoorObj, GH, GW, Level, Nav, PATROL, cellX, cellZ, worldX, worldZ } from "./level";
import { sound } from "./audio";
import { fabricTex } from "./textures";

export interface Difficulty {
  name: string;
  speed: number;
  huntSpeed: number;
  sight: number;
  hear: number;
  reaction: number;
}

export const DIFFICULTIES: Record<string, Difficulty> = {
  easy: { name: "Spokojna babcia", speed: 1.55, huntSpeed: 3.1, sight: 15, hear: 0.75, reaction: 0.55 },
  normal: { name: "Babcia", speed: 1.95, huntSpeed: 3.7, sight: 18, hear: 1, reaction: 0.38 },
  hard: { name: "Wściekła babcia", speed: 2.35, huntSpeed: 4.35, sight: 22, hear: 1.3, reaction: 0.22 },
};

export type GrannyState = "patrol" | "investigate" | "hunt" | "search" | "idle" | "scripted";

/** Grid-based line of sight test. */
export function hasLOS(level: Level, from: THREE.Vector3, to: THREE.Vector3): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.001) return true;
  const steps = Math.ceil(dist / (CELL * 0.28));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = cellX(from.x + dx * t);
    const z = cellZ(from.z + dz * t);
    if (x < 0 || z < 0 || x >= GW || z >= GH) return false;
    const i2 = z * GW + x;
    if (level.floor[i2] !== 1) return false;
    if (level.losBlock[i2]) return false;
    const door = level.doors.find((d) => d.cx === x && d.cz === z);
    if (door && !door.open) return false;
  }
  return true;
}

export class Granny {
  root = new THREE.Group();
  private body = new THREE.Group();
  private torsoGroup = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  private legL: THREE.Mesh = new THREE.Mesh();
  private legR: THREE.Mesh = new THREE.Mesh();
  private footL: THREE.Mesh = new THREE.Mesh();
  private footR: THREE.Mesh = new THREE.Mesh();
  private jaw: THREE.Mesh = new THREE.Mesh();
  private eyeLight: THREE.PointLight = new THREE.PointLight(0xff3311, 0, 3.2, 2);

  state: GrannyState = "patrol";
  pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private path: [number, number][] = [];
  private pathIdx = 0;
  private repathTimer = 0;
  private patrolIdx = 0;
  private target = new THREE.Vector3();
  private hasTarget = false;
  private lastKnown = new THREE.Vector3();
  private searchTimer = 0;
  private stateTimer = 0;
  private stepPhase = 0;
  private stepDist = 0;
  private humTimer = 4;
  private idleTimer = 0;
  private noticeProgress = 0;
  private scaring = false;
  rage = 0;
  sawPlayerHide = false;
  private eyeMats: THREE.MeshStandardMaterial[] = [];

  constructor(
    scene: THREE.Scene,
    private level: Level,
    private nav: Nav,
    public diff: Difficulty,
  ) {
    this.build();
    scene.add(this.root);
  }

  private build() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xb09a84, roughness: 0.85 });
    const skinDark = new THREE.MeshStandardMaterial({ color: 0x3a2622, roughness: 1 });
    const dress = new THREE.MeshStandardMaterial({ map: fabricTex("#2a2434", "dress"), color: 0x9a96b0, roughness: 0.95, side: THREE.DoubleSide });
    const cardigan = new THREE.MeshStandardMaterial({ map: fabricTex("#4a3f36", "shawl"), color: 0xb0a496, roughness: 1 });
    const hair = new THREE.MeshStandardMaterial({ color: 0xe0ddd2, roughness: 0.75 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4326, roughness: 0.85 });
    const stocking = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 1 });
    const slipper = new THREE.MeshStandardMaterial({ color: 0x5a2a2a, roughness: 1 });
    const lace = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 1 });

    // ---------- skirt (lathe with ragged hem)
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      prof.push(new THREE.Vector2(0.26 + t * t * 0.42, 1.25 - t * 1.2));
    }
    const skirtGeo = new THREE.LatheGeometry(prof, 24);
    const sp = skirtGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      if (sp.getY(i) < 0.12) {
        const a = Math.atan2(sp.getZ(i), sp.getX(i));
        sp.setY(i, sp.getY(i) + Math.sin(a * 7) * 0.07 + Math.sin(a * 13 + 1) * 0.04);
      }
    }
    skirtGeo.computeVertexNormals();
    this.body.add(new THREE.Mesh(skirtGeo, dress));
    const underskirt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 1.0, 16), new THREE.MeshStandardMaterial({ color: 0x0c0a0e }));
    underskirt.position.y = 0.62;
    this.body.add(underskirt);

    // ---------- legs & slippers
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.42, 4, 8), stocking);
      leg.position.set(s * 0.13, 0.3, 0);
      this.body.add(leg);
      const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.14, 4, 8), slipper);
      foot.rotation.x = Math.PI / 2;
      foot.position.set(s * 0.13, 0.055, 0.08);
      this.body.add(foot);
      if (s < 0) {
        this.legL = leg;
        this.footL = foot;
      } else {
        this.legR = leg;
        this.footR = foot;
      }
    }

    // ---------- torso (hunched)
    const tg = this.torsoGroup;
    tg.position.y = 1.2;
    tg.rotation.x = 0.22;
    this.body.add(tg);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.4, 6, 14), dress);
    torso.scale.set(1.1, 1, 0.8);
    torso.position.y = 0.3;
    tg.add(torso);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), cardigan);
    chest.scale.set(1.05, 0.75, 0.75);
    chest.position.set(0, 0.42, -0.02);
    tg.add(chest);
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), cardigan);
    hump.scale.set(1, 0.85, 0.9);
    hump.position.set(0, 0.5, -0.17);
    tg.add(hump);
    const placket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.02), new THREE.MeshStandardMaterial({ color: 0x2a221c }));
    placket.position.set(0, 0.35, 0.235);
    tg.add(placket);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), new THREE.MeshStandardMaterial({ color: 0xd8cca8, metalness: 0.3 }));
      b.position.set(0, 0.17 + i * 0.12, 0.25);
      tg.add(b);
    }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 16), lace);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.6, 0.02);
    tg.add(collar);
    // apron with stain
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.95, 1, 4),
      new THREE.MeshStandardMaterial({ map: fabricTex("#8a8070", "apron"), color: 0xcfc6b4, roughness: 1, side: THREE.DoubleSide }),
    );
    apron.position.set(0, 0.72, 0.4);
    apron.rotation.x = -0.1;
    this.body.add(apron);
    const stain = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), new THREE.MeshStandardMaterial({ color: 0x3a0606, roughness: 0.5 }));
    stain.position.set(0.05, 0.7, 0.412);
    stain.rotation.x = -0.1;
    this.body.add(stain);

    // ---------- neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.16, 8), skin);
    neck.position.set(0, 0.68, 0.06);
    neck.rotation.x = -0.3;
    tg.add(neck);

    this.head.position.set(0, 0.78, 0.12);
    this.head.rotation.x = -0.3;
    tg.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 16), skin);
    skull.scale.set(0.9, 1.08, 0.98);
    this.head.add(skull);
    for (const s of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), skinDark);
      cheek.scale.set(0.8, 1.1, 0.4);
      cheek.position.set(s * 0.12, -0.06, 0.13);
      this.head.add(cheek);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), skin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(s * 0.175, -0.01, 0.0);
      this.head.add(ear);
    }
    // jaw (animated when screaming)
    this.jaw = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), skin);
    this.jaw.scale.set(0.95, 0.75, 1);
    this.jaw.position.set(0, -0.12, 0.05);
    this.head.add(this.jaw);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), skin);
    chin.position.set(0, -0.075, 0.08);
    this.jaw.add(chin);
    // mouth interior + lower teeth attached to the jaw
    const mouthIn = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03), new THREE.MeshStandardMaterial({ color: 0x1a0606 }));
    mouthIn.position.set(0, 0.03, 0.12);
    this.jaw.add(mouthIn);
    const teethMat = new THREE.MeshStandardMaterial({ color: 0xd8cfa8, roughness: 0.5 });
    for (let i = -2; i <= 2; i++) {
      if (i === 1) continue; // missing tooth
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, 0.01), teethMat);
      tooth.position.set(i * 0.019, -0.1, 0.172);
      this.head.add(tooth);
    }
    // hair: bun + strands
    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.205, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
    hairMesh.scale.set(0.95, 1.05, 1);
    hairMesh.position.set(0, 0.02, -0.03);
    this.head.add(hairMesh);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), hair);
    bun.position.set(0, 0.1, -0.2);
    this.head.add(bun);
    for (let i = 0; i < 11; i++) {
      const a = -1.15 + (i / 10) * 2.3;
      const len = 0.25 + Math.random() * 0.2;
      const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.002, len, 4), hair);
      strand.position.set(Math.sin(a) * 0.17, -0.02 - len / 2 + 0.08, Math.cos(a) * 0.15);
      strand.rotation.z = -Math.sin(a) * 0.3;
      strand.rotation.x = Math.cos(a) * 0.3 + (Math.random() - 0.5) * 0.15;
      this.head.add(strand);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.15, 8), skin);
    nose.rotation.x = Math.PI / 2 + 0.25;
    nose.position.set(0, -0.04, 0.2);
    this.head.add(nose);
    // sockets, brows, eyes
    for (const s of [-1, 1]) {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skinDark);
      socket.scale.set(1.1, 0.85, 0.5);
      socket.position.set(s * 0.072, 0.02, 0.155);
      this.head.add(socket);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.03), hair);
      brow.position.set(s * 0.072, 0.08, 0.17);
      brow.rotation.z = s * 0.25;
      this.head.add(brow);
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0x1a0404,
        emissive: new THREE.Color(0xff2a12),
        emissiveIntensity: 1.4,
        roughness: 0.3,
      });
      this.eyeMats.push(eyeMat);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), eyeMat);
      eye.position.set(s * 0.072, 0.02, 0.17);
      this.head.add(eye);
    }
    this.eyeLight = new THREE.PointLight(0xff3311, 0, 3.2, 2);
    this.eyeLight.position.set(0, 0, 0.3);
    this.head.add(this.eyeLight);
    // spectacles
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.3 });
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 6, 16), glassMat);
      rim.position.set(s * 0.072, 0.02, 0.19);
      this.head.add(rim);
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.048, 16),
        new THREE.MeshStandardMaterial({ color: 0x8aa0c0, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.5 }),
      );
      lens.position.set(s * 0.072, 0.02, 0.191);
      this.head.add(lens);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.16), glassMat);
      arm.position.set(s * 0.16, 0.025, 0.1);
      this.head.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.005, 0.005), glassMat);
    bridge.position.set(0, 0.03, 0.19);
    this.head.add(bridge);

    // ---------- arms
    const mkArm = (g: THREE.Group, elbow: THREE.Group, side: number) => {
      g.position.set(side * 0.3, 0.55, 0.02);
      tg.add(g);
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), cardigan);
      g.add(shoulder);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), cardigan);
      upper.position.y = -0.18;
      g.add(upper);
      elbow.position.y = -0.36;
      elbow.rotation.x = -0.35;
      g.add(elbow);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.28, 4, 8), cardigan);
      fore.position.y = -0.16;
      elbow.add(fore);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.015, 6, 12), lace);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.31;
      elbow.add(cuff);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skin);
      hand.scale.set(0.9, 1.2, 0.6);
      hand.position.y = -0.37;
      elbow.add(hand);
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.07, 3, 5), skin);
        f.position.set((i - 1.5) * 0.022, -0.44, 0.01);
        f.rotation.x = 0.5;
        elbow.add(f);
      }
    };
    mkArm(this.armL, this.elbowL, -1);
    mkArm(this.armR, this.elbowR, 1);

    // nailed baseball bat in the right hand
    const bat = new THREE.Group();
    bat.position.set(0, -0.4, 0.02);
    bat.rotation.x = 0.4;
    const batBody = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.062, 0.9, 10), wood);
    batBody.position.y = -0.3;
    bat.add(batBody);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0x151010 }));
    grip.position.y = 0.2;
    bat.add(grip);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.03, 8), wood);
    knob.position.y = 0.32;
    bat.add(knob);
    const nailMat = new THREE.MeshStandardMaterial({ color: 0x777b80, metalness: 0.9, roughness: 0.3 });
    for (let i = 0; i < 6; i++) {
      const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 4), nailMat);
      const a = i * 1.1;
      nail.position.set(Math.cos(a) * 0.05, -0.55 - i * 0.04, Math.sin(a) * 0.05);
      nail.rotation.z = Math.PI / 2 - a * 0.3;
      nail.rotation.y = a;
      bat.add(nail);
    }
    this.elbowR.add(bat);

    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.root.add(this.body);
  }

  reset(pos: THREE.Vector3, rage: number) {
    this.pos.copy(pos);
    this.rage = rage;
    this.state = "patrol";
    this.path = [];
    this.pathIdx = 0;
    this.hasTarget = false;
    this.searchTimer = 0;
    this.stateTimer = 0;
    this.noticeProgress = 0;
    this.sawPlayerHide = false;
    this.idleTimer = 0;
    this.scaring = false;
    this.root.position.copy(pos);
    this.root.visible = true;
    this.root.scale.setScalar(1);
    this.jaw.position.y = -0.12;
  }

  setDifficulty(d: Difficulty) {
    this.diff = d;
  }

  /** React to a noise event. */
  hear(pos: THREE.Vector3, radius: number) {
    const d = this.pos.distanceTo(pos);
    if (d > radius * this.diff.hear) return;
    if (this.state === "hunt" || this.state === "scripted") return;
    this.state = "investigate";
    this.stateTimer = 0;
    this.target.copy(pos);
    this.hasTarget = true;
    this.path = [];
    this.pathIdx = 0;
  }

  /** Is the player currently visible to her? */
  canSee(playerPos: THREE.Vector3, playerHidden: boolean, crouched: boolean, flashlightOn: boolean, flashDir: THREE.Vector3): boolean {
    if (this.state === "scripted") return false;
    if (playerHidden) return this.sawPlayerHide && this.pos.distanceTo(playerPos) < 2.2;
    const eye = new THREE.Vector3(this.pos.x, 1.55, this.pos.z);
    const to = new THREE.Vector3(playerPos.x, crouched ? 0.9 : 1.55, playerPos.z);
    const dist = eye.distanceTo(to);
    let range = this.diff.sight + this.rage * 2.2;
    if (crouched) range *= 0.72;
    if (flashlightOn) {
      const flat = new THREE.Vector3(flashDir.x, 0, flashDir.z).normalize();
      const toHer = new THREE.Vector3(this.pos.x - playerPos.x, 0, this.pos.z - playerPos.z).normalize();
      if (flat.dot(toHer) > 0.55) range *= 1.7;
      else range *= 1.15;
    }
    if (dist > range) return false;
    if (!hasLOS(this.level, eye, to)) return false;
    if (dist > 2.4) {
      const fwd = new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
      const dir = new THREE.Vector3(to.x - eye.x, 0, to.z - eye.z).normalize();
      const fov = this.state === "hunt" ? 0.15 : 0.42;
      if (fwd.dot(dir) < fov) return false;
    }
    return true;
  }

  private setPathTo(wx: number, wz: number) {
    const sx = cellX(this.pos.x);
    const sz = cellZ(this.pos.z);
    let tx = cellX(wx);
    let tz = cellZ(wz);
    if (!this.nav.walkable(tx, tz)) {
      let best = 99;
      let bx = tx;
      let bz = tz;
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          if (this.nav.walkable(tx + dx, tz + dz)) {
            const dd = Math.abs(dx) + Math.abs(dz);
            if (dd < best) {
              best = dd;
              bx = tx + dx;
              bz = tz + dz;
            }
          }
        }
      tx = bx;
      tz = bz;
    }
    if (!this.nav.walkable(tx, tz)) return;
    this.path = this.nav.findPath(sx, sz, tx, tz);
    this.pathIdx = 0;
  }

  private nextPatrol() {
    this.patrolIdx = (this.patrolIdx + 1) % PATROL.length;
    const [cx, cz] = PATROL[this.patrolIdx];
    this.target.set(worldX(cx), 0, worldZ(cz));
    this.hasTarget = true;
    this.setPathTo(this.target.x, this.target.z);
  }

  update(dt: number, playerPos: THREE.Vector3, playerHidden: boolean, crouched: boolean, flashlightOn: boolean, flashDir: THREE.Vector3) {
    this.stateTimer += dt;
    this.repathTimer -= dt;
    this.humTimer -= dt;
    this.idleTimer -= dt;

    const sees = this.canSee(playerPos, playerHidden, crouched, flashlightOn, flashDir);
    if (sees && !playerHidden) {
      this.noticeProgress += dt / this.diff.reaction;
      if (this.noticeProgress >= 1) {
        if (this.state !== "hunt") {
          sound.scream();
          sound.sting();
        }
        this.state = "hunt";
        this.stateTimer = 0;
        this.lastKnown.copy(playerPos);
        this.hasTarget = true;
        this.target.copy(playerPos);
        this.path = [];
      }
    } else {
      this.noticeProgress = Math.max(0, this.noticeProgress - dt * 0.6);
    }

    let speed = this.diff.speed + this.rage * 0.22;
    switch (this.state) {
      case "patrol": {
        speed = this.diff.speed + this.rage * 0.18;
        if (!this.hasTarget || (this.path.length === 0 && this.idleTimer <= 0)) {
          this.nextPatrol();
          this.idleTimer = 1.2;
        }
        if (this.humTimer <= 0 && this.pos.distanceTo(playerPos) < 26) {
          sound.hum(this.pos);
          this.humTimer = 7 + Math.random() * 6;
        }
        break;
      }
      case "investigate": {
        speed = this.diff.speed * 1.25 + this.rage * 0.2;
        if (this.path.length === 0 && this.repathTimer <= 0) {
          this.setPathTo(this.target.x, this.target.z);
          this.repathTimer = 1;
        }
        if (this.pos.distanceTo(this.target) < 1.6 || this.stateTimer > 16) {
          this.state = "search";
          this.stateTimer = 0;
          this.searchTimer = 7;
        }
        break;
      }
      case "hunt": {
        speed = this.diff.huntSpeed + this.rage * 0.35;
        if (this.repathTimer <= 0) {
          this.target.copy(playerHidden && !this.sawPlayerHide ? this.lastKnown : playerPos);
          this.setPathTo(this.target.x, this.target.z);
          this.repathTimer = 0.4;
        }
        if (!sees && !playerHidden) {
          this.lastKnown.copy(playerPos);
          if (this.stateTimer > 3.2 && this.noticeProgress <= 0) {
            this.state = "search";
            this.stateTimer = 0;
            this.searchTimer = 8;
            this.target.copy(this.lastKnown);
            this.setPathTo(this.target.x, this.target.z);
          }
        }
        break;
      }
      case "search": {
        speed = this.diff.speed * 1.1;
        this.searchTimer -= dt;
        if (this.path.length === 0 && this.repathTimer <= 0) {
          const ang = Math.random() * Math.PI * 2;
          const r = 3 + Math.random() * 8;
          const nx = THREE.MathUtils.clamp(this.lastKnown.x + Math.cos(ang) * r, 1, (GW - 1) * CELL);
          const nz = THREE.MathUtils.clamp(this.lastKnown.z + Math.sin(ang) * r, 1, (GH - 1) * CELL);
          this.setPathTo(nx, nz);
          this.repathTimer = 0.8;
        }
        if (this.searchTimer <= 0) {
          this.state = "patrol";
          this.hasTarget = false;
          this.path = [];
          this.nextPatrol();
        }
        break;
      }
      case "scripted": {
        speed = this.diff.speed * 0.85;
        break;
      }
      default:
        break;
    }

    this.moveAlongPath(dt, speed, playerPos);
    this.animate(dt, playerPos);
  }

  private moveAlongPath(dt: number, speed: number, playerPos: THREE.Vector3) {
    let wx: number;
    let wz: number;
    let door: DoorObj | null = null;
    let arrival = 0.35;
    let direct = false;

    const eye = new THREE.Vector3(this.pos.x, 1.5, this.pos.z);
    const prey = new THREE.Vector3(playerPos.x, 1.1, playerPos.z);
    const distToPlayer = eye.distanceTo(prey);
    if (this.state === "hunt" && distToPlayer > 0.85 && hasLOS(this.level, eye, prey)) {
      wx = playerPos.x;
      wz = playerPos.z;
      direct = true;
      arrival = 0.8;
    } else if (this.path.length > 0 && this.pathIdx < this.path.length) {
      const [cx, cz] = this.path[this.pathIdx];
      wx = worldX(cx);
      wz = worldZ(cz);
      door = this.nav.doorAt(cx, cz) ?? null;
      if (door && !door.open && !door.isExit) {
        const d = Math.hypot(wx - this.pos.x, wz - this.pos.z);
        if (d < 1.9) {
          door.open = true;
          // swing away from her
          const away = door.axis === "x" ? Math.sign(door.pos.z - this.pos.z) || 1 : Math.sign(door.pos.x - this.pos.x) || 1;
          door.target = (door.axis === "x" ? -away : away) * DOOR_OPEN;
          sound.creak(door.pos, 1);
          if (this.state === "hunt") sound.bang(door.pos, 0.8);
          return;
        }
      }
    } else {
      this.path = [];
      this.vel.multiplyScalar(0.9);
      return;
    }

    const dirX = wx - this.pos.x;
    const dirZ = wz - this.pos.z;
    const dist = Math.hypot(dirX, dirZ);
    if (dist < arrival) {
      if (!direct) {
        this.pathIdx++;
        if (this.pathIdx >= this.path.length) this.path = [];
      }
      return;
    }
    const nx = dirX / dist;
    const nz = dirZ / dist;
    this.vel.x += (nx * speed - this.vel.x) * Math.min(1, dt * 6);
    this.vel.z += (nz * speed - this.vel.z) * Math.min(1, dt * 6);

    const px = this.pos.x + this.vel.x * dt;
    const pz = this.pos.z + this.vel.z * dt;
    const rad = 0.38;
    const okX = this.free(px, this.pos.z, rad);
    const okZ = this.free(this.pos.x, pz, rad);
    if (okX) this.pos.x = px;
    else this.vel.x = 0;
    if (okZ) this.pos.z = pz;
    else this.vel.z = 0;
    if (!okX && !okZ) this.path = [];

    if (this.vel.lengthSq() > 0.02) {
      const yaw = Math.atan2(this.vel.x, this.vel.z);
      const cur = this.root.rotation.y;
      const diff = Math.atan2(Math.sin(yaw - cur), Math.cos(yaw - cur));
      this.root.rotation.y = cur + diff * Math.min(1, dt * 8);
    }

    this.stepDist += this.vel.length() * dt;
    const stride = this.state === "hunt" ? 1.05 : 1.25;
    if (this.stepDist > stride) {
      this.stepDist = 0;
      const hunting = this.state === "hunt";
      sound.footstep({
        pos: this.pos,
        surface: this.level.surfaceAt(this.pos.x, this.pos.z),
        vol: hunting ? 1.3 : 0.9,
        heavy: true,
        sprint: hunting,
      });
      if (hunting && Math.random() < 0.25) sound.batDrag(this.pos);
      else if (!hunting && Math.random() < 0.08) sound.creak(this.pos, 0.5);
    }
  }

  private free(x: number, z: number, r: number) {
    for (const [ox, oz] of [
      [-r, -r],
      [r, -r],
      [-r, r],
      [r, r],
    ]) {
      const cx = cellX(x + ox);
      const cz = cellZ(z + oz);
      if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return false;
      const i = cz * GW + cx;
      if (this.level.floor[i] !== 1 || this.level.blocked[i]) return false;
      const door = this.nav.doorAt(cx, cz);
      if (door && !door.open && door.angle < 0.6) return false;
    }
    return true;
  }

  private animate(dt: number, playerPos: THREE.Vector3) {
    if (this.scaring) return;
    const hunting = this.state === "hunt";
    const moving = this.vel.length() > 0.15;
    this.stepPhase += dt * (moving ? (hunting ? 11 : 6.5) : 1.5);
    const sw = Math.sin(this.stepPhase);
    const amp = moving ? 1 : 0.12;
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.body.position.y = Math.abs(sw) * (hunting ? 0.07 : 0.04) * amp;
    this.body.rotation.z = sw * 0.06 * amp;
    this.torsoGroup.rotation.x = (hunting ? 0.42 : 0.22) + Math.sin(this.stepPhase * 0.5) * 0.02;
    this.torsoGroup.rotation.y = sw * 0.08 * amp;

    // arms swing; when hunting the bat arm is drawn back, the other reaches forward
    this.armL.rotation.x = sw * (hunting ? 0.9 : 0.5) * amp - (hunting ? 0.9 : 0.05);
    this.armR.rotation.x = -sw * (hunting ? 0.5 : 0.5) * amp + (hunting ? 0.55 : -0.1);
    this.armL.rotation.z = 0.15 + (hunting ? 0.25 : 0);
    this.armR.rotation.z = -0.15 - (hunting ? 0.45 : 0);
    this.elbowL.rotation.x = -0.35 - (hunting ? 0.6 : 0);
    this.elbowR.rotation.x = -0.35 - (hunting ? 1.3 : 0.1);

    // shuffling legs
    const lift = moving ? 0.07 : 0;
    this.legL.position.y = 0.3 + Math.max(0, sw) * lift;
    this.legR.position.y = 0.3 + Math.max(0, -sw) * lift;
    this.legL.position.z = sw * 0.12 * amp;
    this.legR.position.z = -sw * 0.12 * amp;
    this.footL.position.set(-0.13, 0.055 + Math.max(0, sw) * lift, 0.08 + sw * 0.12 * amp);
    this.footR.position.set(0.13, 0.055 + Math.max(0, -sw) * lift, 0.08 - sw * 0.12 * amp);

    // head tracks the player
    const toPlayer = new THREE.Vector3(playerPos.x - this.pos.x, 0, playerPos.z - this.pos.z);
    const dist = toPlayer.length();
    let headYaw = 0;
    if (dist < 16) {
      const want = Math.atan2(toPlayer.x, toPlayer.z) - this.root.rotation.y;
      headYaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(want), Math.cos(want)), -1.1, 1.1);
    }
    this.head.rotation.y += (headYaw - this.head.rotation.y) * Math.min(1, dt * 5);
    this.head.rotation.x = -0.3 + (hunting ? -0.15 : 0) + Math.sin(this.stepPhase * 0.7) * 0.03;
    this.head.rotation.z = hunting ? Math.sin(this.stepPhase * 0.3) * 0.12 : 0.08;
    this.jaw.position.y = -0.12 - (hunting ? 0.02 + Math.abs(Math.sin(this.stepPhase * 0.8)) * 0.02 : 0);

    const glow = hunting ? 1 : this.noticeProgress > 0 ? 0.6 : 0.22;
    this.eyeMats.forEach((m) => (m.emissiveIntensity = 0.7 + glow * 2.6));
    this.eyeLight.intensity = hunting ? 1.5 : 0.25;
  }

  distanceTo(p: THREE.Vector3) {
    return this.pos.distanceTo(p);
  }

  /** Arms raised, jaw dropped, eyes blazing — used for the jumpscare close-up. */
  scarePose() {
    this.scaring = true;
    this.body.position.y = 0;
    this.body.rotation.z = 0;
    this.torsoGroup.rotation.set(-0.05, 0, 0);
    this.armL.rotation.set(-2.6, 0, 0.5);
    this.armR.rotation.set(-2.8, 0, -0.5);
    this.elbowL.rotation.x = -0.9;
    this.elbowR.rotation.x = -1.1;
    this.head.rotation.set(0.05, 0, 0);
    this.jaw.position.y = -0.2;
    this.jaw.rotation.x = 0.35;
    this.eyeMats.forEach((m) => (m.emissiveIntensity = 4.5));
    this.eyeLight.intensity = 2.4;
  }

  /** Intro: standing over the bed, bent low, face tracking the player. */
  loom(dt: number, lookAt: THREE.Vector3, speaking: boolean, t: number) {
    this.scaring = false;
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.body.position.y = 0;
    this.body.rotation.z = Math.sin(t * 0.7) * 0.02;
    this.torsoGroup.rotation.x = 0.78 + Math.sin(t * 0.9) * 0.03;
    this.torsoGroup.rotation.y = 0;
    // arms: one braced on the bed, the other hovering over the player
    this.armL.rotation.set(-1.25 + Math.sin(t * 1.3) * 0.05, 0, 0.35);
    this.elbowL.rotation.x = -0.4;
    this.armR.rotation.set(-0.4, 0, -0.3);
    this.elbowR.rotation.x = -0.6;
    this.legL.position.set(-0.13, 0.3, 0.05);
    this.legR.position.set(0.13, 0.3, -0.05);
    this.root.updateMatrixWorld(true);
    this.head.lookAt(lookAt);
    this.head.rotateZ(Math.sin(t * 0.5) * 0.18 + 0.1);
    this.jaw.position.y = speaking ? -0.14 - Math.abs(Math.sin(t * 11) * Math.sin(t * 3.1)) * 0.05 : -0.12;
    this.eyeMats.forEach((m) => (m.emissiveIntensity = 1.6 + Math.sin(t * 2) * 0.3));
    this.eyeLight.intensity = 0.45;
    void dt;
  }

  /** Intro: walk to a point ignoring the player. */
  scriptedGoTo(wx: number, wz: number) {
    this.state = "scripted";
    this.hasTarget = true;
    this.target.set(wx, 0, wz);
    this.setPathTo(wx, wz);
    this.repathTimer = 0;
  }

  /** Called every frame during the jumpscare so she shakes and snaps her jaw. */
  scareUpdate(t: number) {
    this.head.rotation.z = Math.sin(t * 40) * 0.08;
    this.head.rotation.y = Math.sin(t * 27) * 0.1;
    this.jaw.position.y = -0.17 - Math.abs(Math.sin(t * 18)) * 0.05;
    this.body.position.y = Math.sin(t * 50) * 0.01;
  }
}
