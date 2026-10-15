import * as THREE from "three";
import {
  bloodTex,
  ceilingTex,
  cobwebTex,
  doorNormal,
  doorTex,
  exitDoorTex,
  fabricTex,
  floorNormal,
  floorTex,
  portraitTex,
  rugTex,
  tileNormal,
  tileTex,
  wallNormal,
  wallTex,
  windowTex,
} from "./textures";
import type { Surface } from "./audio";

export const CELL = 2.0;
export const WALL_H = 3.3;
export const WALL_T = 0.32;
/** Door open angle (≈70°) — keeps the leaf out of the adjacent wall. */
export const DOOR_OPEN = 1.22;

export const GW = 40;
export const GH = 28;

type RoomStyle = "bedroom" | "bath" | "study" | "pantry" | "laundry" | "hall" | "passage" | "living" | "kitchen" | "dining" | "granny" | "shed";

export type FurnType =
  | "wardrobe"
  | "bed"
  | "tableBig"
  | "table"
  | "shelf"
  | "sofa"
  | "chair"
  | "crate"
  | "fridge"
  | "stove"
  | "counter"
  | "sink"
  | "tub"
  | "washer"
  | "dresser"
  | "clock"
  | "piano"
  | "tv";

export interface Furn {
  x: number;
  z: number;
  w: number;
  h: number;
  type: FurnType;
}

export interface DoorObj {
  cx: number;
  cz: number;
  pos: THREE.Vector3;
  pivot: THREE.Group;
  panel: THREE.Mesh;
  open: boolean;
  angle: number;
  target: number;
  axis: "x" | "z";
  isExit: boolean;
  locks: number;
  lockGroup: THREE.Group;
}

export interface HideSpot {
  /** Camera position while tucked inside / under the furniture. */
  pos: THREE.Vector3;
  /** Physical position used when stepping out of the furniture. */
  exit: THREE.Vector3;
  type: FurnType;
  cell: number;
  furn: Furn;
  /** Wardrobe leaves that visually close once the player is inside. */
  leaves?: [THREE.Group, THREE.Group];
  leafOpen?: [number, number];
  doorAmount: number;
  doorTarget: number;
}

export interface Lamp {
  light: THREE.PointLight;
  base: number;
  flicker: number;
  mesh: THREE.Mesh;
}

export interface ItemSpawn {
  pos: THREE.Vector3;
  cell: number;
}

export const worldX = (x: number) => (x + 0.5) * CELL;
export const worldZ = (z: number) => (z + 0.5) * CELL;
export const cellX = (wx: number) => Math.floor(wx / CELL);
export const cellZ = (wz: number) => Math.floor(wz / CELL);

const ROOMS: { x: number; z: number; w: number; h: number; name: string; style: RoomStyle }[] = [
  { x: 1, z: 1, w: 9, h: 7, name: "sypialnia gościnna", style: "bedroom" },
  { x: 11, z: 1, w: 6, h: 7, name: "łazienka", style: "bath" },
  { x: 18, z: 1, w: 7, h: 7, name: "gabinet", style: "study" },
  { x: 26, z: 1, w: 6, h: 7, name: "spiżarnia", style: "pantry" },
  { x: 33, z: 1, w: 6, h: 7, name: "pralnia", style: "laundry" },
  { x: 1, z: 9, w: 38, h: 3, name: "korytarz portretów", style: "hall" },
  { x: 14, z: 13, w: 3, h: 14, name: "wąskie przejście", style: "passage" },
  { x: 1, z: 13, w: 12, h: 14, name: "salon z kominkiem", style: "living" },
  { x: 18, z: 13, w: 11, h: 7, name: "kuchnia", style: "kitchen" },
  { x: 18, z: 21, w: 11, h: 6, name: "jadalnia", style: "dining" },
  { x: 30, z: 13, w: 9, h: 7, name: "sanktuarium babci", style: "granny" },
  { x: 30, z: 21, w: 8, h: 6, name: "warsztat przy wyjściu", style: "shed" },
];

const DOORS: [number, number][] = [
  [5, 8],
  [13, 8],
  [21, 8],
  [28, 8],
  [35, 8],
  [7, 12],
  [15, 12],
  [22, 12],
  [34, 12],
  [13, 17],
  [17, 16],
  [17, 24],
  [24, 20],
  [29, 17],
  [29, 24],
  [34, 20],
];

export const EXIT_CELL: [number, number] = [33, 27];

const FURN: Furn[] = [
  // --- sypialnia
  { x: 1, z: 2, w: 2, h: 2, type: "bed" },
  { x: 8, z: 1, w: 1, h: 1, type: "wardrobe" },
  { x: 5, z: 1, w: 2, h: 1, type: "dresser" },
  { x: 7, z: 5, w: 1, h: 1, type: "chair" },
  // --- łazienka
  { x: 11, z: 5, w: 2, h: 1, type: "tub" },
  { x: 11, z: 1, w: 1, h: 1, type: "sink" },
  { x: 15, z: 1, w: 1, h: 1, type: "shelf" },
  { x: 16, z: 4, w: 1, h: 2, type: "dresser" },
  // --- gabinet
  { x: 19, z: 2, w: 2, h: 1, type: "table" },
  { x: 19, z: 4, w: 1, h: 1, type: "chair" },
  { x: 18, z: 6, w: 1, h: 2, type: "shelf" },
  { x: 24, z: 2, w: 1, h: 3, type: "shelf" },
  { x: 22, z: 6, w: 1, h: 1, type: "wardrobe" },
  { x: 20, z: 1, w: 1, h: 1, type: "clock" },
  // --- spiżarnia
  { x: 26, z: 1, w: 3, h: 1, type: "shelf" },
  { x: 27, z: 4, w: 1, h: 1, type: "crate" },
  { x: 28, z: 4, w: 1, h: 1, type: "crate" },
  { x: 27, z: 5, w: 2, h: 1, type: "crate" },
  { x: 31, z: 2, w: 1, h: 1, type: "wardrobe" },
  { x: 30, z: 6, w: 1, h: 1, type: "crate" },
  { x: 26, z: 6, w: 2, h: 1, type: "shelf" },
  // --- pralnia
  { x: 33, z: 1, w: 1, h: 1, type: "washer" },
  { x: 33, z: 3, w: 1, h: 1, type: "shelf" },
  { x: 38, z: 1, w: 1, h: 1, type: "wardrobe" },
  { x: 36, z: 5, w: 1, h: 1, type: "crate" },
  { x: 37, z: 6, w: 1, h: 1, type: "tub" },
  // --- korytarz
  { x: 12, z: 9, w: 1, h: 1, type: "dresser" },
  { x: 8, z: 11, w: 1, h: 1, type: "table" },
  { x: 25, z: 11, w: 1, h: 1, type: "clock" },
  { x: 31, z: 9, w: 1, h: 1, type: "dresser" },
  { x: 2, z: 9, w: 1, h: 1, type: "shelf" },
  // --- przejście
  { x: 14, z: 20, w: 1, h: 1, type: "crate" },
  { x: 16, z: 13, w: 1, h: 1, type: "shelf" },
  // --- salon
  { x: 2, z: 15, w: 3, h: 1, type: "sofa" },
  { x: 3, z: 18, w: 2, h: 2, type: "tableBig" },
  { x: 1, z: 24, w: 1, h: 1, type: "wardrobe" },
  { x: 6, z: 15, w: 1, h: 1, type: "chair" },
  { x: 11, z: 20, w: 1, h: 2, type: "tv" },
  { x: 12, z: 14, w: 1, h: 3, type: "shelf" },
  { x: 9, z: 25, w: 2, h: 1, type: "piano" },
  // --- kuchnia
  { x: 20, z: 13, w: 3, h: 1, type: "counter" },
  { x: 28, z: 14, w: 1, h: 4, type: "counter" },
  { x: 28, z: 18, w: 1, h: 1, type: "stove" },
  { x: 20, z: 18, w: 1, h: 1, type: "fridge" },
  { x: 24, z: 17, w: 2, h: 1, type: "table" },
  { x: 24, z: 19, w: 1, h: 1, type: "chair" },
  { x: 26, z: 18, w: 1, h: 1, type: "chair" },
  // --- jadalnia
  { x: 20, z: 23, w: 4, h: 2, type: "tableBig" },
  { x: 19, z: 23, w: 1, h: 1, type: "chair" },
  { x: 25, z: 23, w: 1, h: 1, type: "chair" },
  { x: 21, z: 25, w: 1, h: 1, type: "chair" },
  { x: 24, z: 26, w: 1, h: 1, type: "chair" },
  { x: 26, z: 26, w: 2, h: 1, type: "dresser" },
  { x: 28, z: 21, w: 1, h: 1, type: "wardrobe" },
  // --- pokój babci
  { x: 37, z: 13, w: 2, h: 2, type: "bed" },
  { x: 30, z: 13, w: 1, h: 1, type: "wardrobe" },
  { x: 33, z: 18, w: 1, h: 1, type: "chair" },
  { x: 35, z: 13, w: 1, h: 1, type: "dresser" },
  { x: 30, z: 18, w: 1, h: 2, type: "shelf" },
  { x: 38, z: 18, w: 1, h: 1, type: "clock" },
  // --- przybudówka (wyjście)
  { x: 30, z: 21, w: 1, h: 1, type: "shelf" },
  { x: 37, z: 23, w: 1, h: 1, type: "table" },
  { x: 30, z: 26, w: 2, h: 1, type: "dresser" },
];

const ITEM_CELLS: [number, number, number][] = [
  // [cx, cz, heightAboveFloor]  (height 0.35 = leży na podłodze)
  [5, 1, 1.0],
  [11, 1, 1.0],
  [19, 2, 0.95],
  [21, 3, 0.35],
  [29, 3, 0.35],
  [33, 1, 1.0],
  [8, 11, 0.9],
  [12, 9, 1.0],
  [3, 18, 0.85],
  [7, 20, 0.35],
  [24, 17, 0.95],
  [28, 15, 1.0],
  [21, 23, 0.85],
  [26, 26, 1.0],
  [37, 13, 0.7],
  [35, 13, 1.0],
  [37, 23, 0.9],
  [15, 18, 0.35],
  [15, 7, 0.35],
  [12, 25, 0.35],
];

const LAMPS: [number, number, number][] = [
  [5, 10, 0.5],
  [20, 10, 0.45],
  [34, 10, 0.4],
  [6, 19, 0.5],
  [23, 16, 0.5],
  [22, 24, 0.45],
  [33, 24, 0.6],
  [5, 4, 0.35],
  [34, 16, 0.3],
];

const CREAKY: [number, number][] = [
  [3, 10],
  [10, 10],
  [17, 10],
  [24, 10],
  [30, 10],
  [36, 10],
  [15, 15],
  [15, 22],
  [7, 13],
  [5, 9],
  [26, 12],
  [34, 14],
  [9, 22],
  [24, 22],
  [12, 26],
];

export const PATROL: [number, number][] = [
  [5, 4],
  [5, 10],
  [20, 10],
  [21, 4],
  [34, 10],
  [34, 16],
  [33, 24],
  [22, 24],
  [23, 16],
  [6, 19],
  [6, 25],
  [15, 20],
  [28, 6],
  [35, 4],
];

export interface Level {
  group: THREE.Group;
  floor: number[];
  blocked: Uint8Array;
  losBlock: Uint8Array;
  doors: DoorObj[];
  hideSpots: HideSpot[];
  lamps: Lamp[];
  itemSpawns: ItemSpawn[];
  creaky: Set<number>;
  exitDoor: DoorObj;
  playerStart: THREE.Vector3;
  grannyStart: THREE.Vector3;
  roomName: (wx: number, wz: number) => string;
  surfaceAt: (wx: number, wz: number) => Surface;
}

const idx = (x: number, z: number) => z * GW + x;

export function isFurnHide(t: FurnType) {
  return t === "wardrobe" || t === "bed" || t === "tableBig";
}

function furnBlocksLos(t: FurnType) {
  return t === "wardrobe" || t === "shelf" || t === "fridge" || t === "clock" || t === "piano" || t === "tv";
}

export function buildLevel(scene: THREE.Scene): Level {
  const floor = new Array<number>(GW * GH).fill(0);
  const blocked = new Uint8Array(GW * GH);
  const losBlock = new Uint8Array(GW * GH);

  for (const r of ROOMS) {
    for (let z = r.z; z < r.z + r.h; z++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        floor[idx(x, z)] = 1;
      }
    }
  }

  // carve doorways FIRST so that wall panels leave the gaps open
  for (const [dx, dz] of DOORS) floor[idx(dx, dz)] = 1;
  floor[idx(EXIT_CELL[0], EXIT_CELL[1])] = 1;

  const group = new THREE.Group();
  scene.add(group);

  // ---------- materials
  const wallMap = wallTex();
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallMap,
    normalMap: wallNormal(),
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.92,
    metalness: 0,
    color: 0xcfc6b4,
  });
  const floorMap = floorTex();
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorMap,
    normalMap: floorNormal(),
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.62,
    metalness: 0.05,
    color: 0xb8aa98,
  });
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilingTex(), color: 0x807a70, roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({
    map: doorTex(),
    normalMap: doorNormal(),
    normalScale: new THREE.Vector2(0.6, 0.6),
    color: 0x9a8670,
    roughness: 0.75,
  });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x2f241a, roughness: 0.85 });
  const fabricMat = new THREE.MeshStandardMaterial({ map: fabricTex("#4a2b2b", "a"), color: 0x9a8a86, roughness: 1 });
  const sheetMat = new THREE.MeshStandardMaterial({ map: fabricTex("#7c7466", "b"), color: 0xa09a90, roughness: 1 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x6e7379, roughness: 0.4, metalness: 0.7 });
  const porcelainMat = new THREE.MeshStandardMaterial({ color: 0xb9bcb6, roughness: 0.25, metalness: 0.05 });

  // ---------- floor + ceiling
  const fTex = floorTex();
  fTex.repeat.set(GW / 2, GH / 2);
  floorNormal().repeat.set(GW / 2, GH / 2);
  wallNormal().repeat.set(1, 1);
  const floorGeo = new THREE.PlaneGeometry(GW * CELL, GH * CELL);
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set((GW * CELL) / 2, 0, (GH * CELL) / 2);
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  const cTex = ceilingTex();
  cTex.repeat.set(GW / 2, GH / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(GW * CELL, GH * CELL), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((GW * CELL) / 2, WALL_H, (GH * CELL) / 2);
  group.add(ceil);

  // ---------- walls (instanced panels on floor-cell edges)
  const panels: { x: number; z: number; axis: "x" | "z"; side: number }[] = [];
  const isSolid = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= GW || z >= GH) return true;
    return floor[idx(x, z)] === 0;
  };
  for (let z = 0; z < GH; z++) {
    for (let x = 0; x < GW; x++) {
      if (floor[idx(x, z)] !== 1) continue;
      if (isSolid(x - 1, z)) panels.push({ x, z, axis: "z", side: -1 });
      if (isSolid(x + 1, z)) panels.push({ x, z, axis: "z", side: 1 });
      if (isSolid(x, z - 1)) panels.push({ x, z, axis: "x", side: -1 });
      const isExitCell = x === EXIT_CELL[0] && z === EXIT_CELL[1];
      if (isSolid(x, z + 1) && !isExitCell) panels.push({ x, z, axis: "x", side: 1 });
    }
  }
  const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, WALL_T);
  const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, panels.length);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);
  panels.forEach((p, i) => {
    const wx = worldX(p.x);
    const wz = worldZ(p.z);
    const off = p.side * (CELL / 2 - WALL_T / 2);
    if (p.axis === "z") {
      q.setFromAxisAngle(yAxis, Math.PI / 2);
      m.compose(new THREE.Vector3(wx + off, WALL_H / 2, wz), q, one);
    } else {
      q.setFromAxisAngle(yAxis, 0);
      m.compose(new THREE.Vector3(wx, WALL_H / 2, wz + off), q, one);
    }
    wallMesh.setMatrixAt(i, m);
  });
  wallMesh.instanceMatrix.needsUpdate = true;
  group.add(wallMesh);

  // ---------- doors
  const DOOR_H = 2.3;
  const DOOR_W = CELL - 2 * 0.18; // between the posts
  const doors: DoorObj[] = [];
  const frameMat = darkWood;
  const doorNorm = doorNormal();

  const makeDoor = (cx: number, cz: number, isExit: boolean): DoorObj => {
    floor[idx(cx, cz)] = 1;
    const axis: "x" | "z" = isSolid(cx - 1, cz) && isSolid(cx + 1, cz) ? "x" : "z";
    const wx = worldX(cx);
    const wz = worldZ(cz);

    // frame: two posts + lintel filling the gap up to the ceiling
    const postGeo = new THREE.BoxGeometry(0.18, WALL_H, 0.42);
    const p1 = new THREE.Mesh(postGeo, frameMat);
    const p2 = new THREE.Mesh(postGeo, frameMat);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(CELL, WALL_H - DOOR_H, 0.42), frameMat);
    const header = new THREE.Mesh(new THREE.BoxGeometry(CELL + 0.1, 0.12, 0.5), frameMat);
    if (axis === "x") {
      p1.position.set(wx - CELL / 2 + 0.09, WALL_H / 2, wz);
      p2.position.set(wx + CELL / 2 - 0.09, WALL_H / 2, wz);
      lintel.position.set(wx, DOOR_H + (WALL_H - DOOR_H) / 2, wz);
      header.position.set(wx, DOOR_H + 0.06, wz);
    } else {
      for (const o of [p1, p2, lintel, header]) o.rotation.y = Math.PI / 2;
      p1.position.set(wx, WALL_H / 2, wz - CELL / 2 + 0.09);
      p2.position.set(wx, WALL_H / 2, wz + CELL / 2 - 0.09);
      lintel.position.set(wx, DOOR_H + (WALL_H - DOOR_H) / 2, wz);
      header.position.set(wx, DOOR_H + 0.06, wz);
    }
    for (const o of [p1, p2, lintel, header]) {
      o.castShadow = true;
      o.receiveShadow = true;
      group.add(o);
    }

    // hinge pivot sits at the post edge; the leaf extends from the hinge across the opening
    const pivot = new THREE.Group();
    const hingeIn = 0.07; // tuck the hinge into the post so the open leaf clears the wall
    if (axis === "x") pivot.position.set(wx - DOOR_W / 2 + hingeIn, 0, wz);
    else pivot.position.set(wx, 0, wz - DOOR_W / 2 + hingeIn);
    group.add(pivot);

    const mat = isExit
      ? new THREE.MeshStandardMaterial({ map: exitDoorTex(), color: 0x8a7a66, roughness: 0.8 })
      : new THREE.MeshStandardMaterial({ map: doorTex(), normalMap: doorNorm, normalScale: new THREE.Vector2(0.7, 0.7), color: 0xa08d74, roughness: 0.8 });
    // leaf geometry is built along +X from the hinge; rotate the pivot for z-axis doors
    const leaf = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W - 0.04, DOOR_H - 0.04, 0.09), mat);
    panel.castShadow = true;
    panel.receiveShadow = true;
    panel.position.set(DOOR_W / 2, DOOR_H / 2, 0);
    leaf.add(panel);
    // handle on both sides
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xb59a4a, metalness: 0.8, roughness: 0.35 });
    for (const side of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), handleMat);
      h.rotation.z = Math.PI / 2;
      h.position.set(DOOR_W - 0.22, 1.05, side * 0.08);
      leaf.add(h);
      const rosette = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.015, 10), handleMat);
      rosette.rotation.x = Math.PI / 2;
      rosette.position.set(DOOR_W - 0.16, 1.05, side * 0.05);
      leaf.add(rosette);
    }
    // hinges
    for (const hy of [0.3, DOOR_H / 2, DOOR_H - 0.3]) {
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), metalMat);
      hinge.position.set(0.01, hy, 0);
      leaf.add(hinge);
    }
    if (axis === "z") leaf.rotation.y = -Math.PI / 2;
    pivot.add(leaf);

    const lockGroup = new THREE.Group();
    lockGroup.position.set(0, 0, 0);
    panel.add(lockGroup);

    const d: DoorObj = {
      cx,
      cz,
      pos: new THREE.Vector3(worldX(cx), 1.2, worldZ(cz)),
      pivot,
      panel,
      open: false,
      angle: 0,
      target: 0,
      axis,
      isExit,
      locks: isExit ? 4 : 0,
      lockGroup,
    };
    doors.push(d);
    return d;
  };

  for (const [dx, dz] of DOORS) makeDoor(dx, dz, false);
  const exitDoor = makeDoor(EXIT_CELL[0], EXIT_CELL[1], true);

  // exit door locks (planks, padlock, fuse box, keyhole)
  // (lockGroup is centred on the leaf; the player approaches from -Z, so locks sit on the -Z face)
  const plankMat = new THREE.MeshStandardMaterial({ map: doorTex(), color: 0x7a5c38, roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W * 1.05, 0.2, 0.08), plankMat);
    plank.position.set(0, -0.75 + i * 0.5, -0.09);
    plank.rotation.z = (i % 2 === 0 ? 1 : -1) * (0.08 + Math.random() * 0.1);
    plank.name = "plank" + i;
    plank.castShadow = true;
    exitDoor.lockGroup.add(plank);
    for (const sx of [-0.6, 0.6]) {
      const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6), metalMat);
      nail.rotation.x = Math.PI / 2;
      nail.position.set(sx, -0.75 + i * 0.5 + sx * Math.sin(plank.rotation.z) * 0.8, -0.135);
      exitDoor.lockGroup.add(nail);
    }
  }
  // hasp + padlock
  const hasp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.03), metalMat);
  hasp.position.set(0.55, 0.05, -0.06);
  exitDoor.lockGroup.add(hasp);
  const padlock = new THREE.Group();
  const lockBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.06), new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.8, roughness: 0.35 }));
  padlock.add(lockBody);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 14, Math.PI), metalMat);
  shackle.position.y = 0.08;
  padlock.add(shackle);
  padlock.position.set(0.62, -0.08, -0.09);
  padlock.name = "padlock";
  exitDoor.lockGroup.add(padlock);
  // fuse box with a red indicator
  const fuseBox = new THREE.Group();
  const fb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.1), new THREE.MeshStandardMaterial({ color: 0x2b2f33, metalness: 0.6, roughness: 0.5 }));
  fuseBox.add(fb);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: new THREE.Color(0xff2020), emissiveIntensity: 2 }));
  led.position.set(0.08, 0.12, -0.055);
  led.name = "fuseled";
  fuseBox.add(led);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  cable.position.set(0, 0.55, -0.02);
  fuseBox.add(cable);
  fuseBox.position.set(-0.6, 0.1, -0.1);
  fuseBox.name = "fusebox";
  exitDoor.lockGroup.add(fuseBox);
  // keyhole plate
  const keyPlate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.02), new THREE.MeshStandardMaterial({ color: 0x8a7a40, metalness: 0.8, roughness: 0.3 }));
  keyPlate.position.set(0.55, -0.35, -0.055);
  exitDoor.lockGroup.add(keyPlate);

  // ---------- furniture
  const hideSpots: HideSpot[] = [];
  const wardrobeDoors = new Map<Furn, { leaves: [THREE.Group, THREE.Group]; open: [number, number] }>();
  const addBox = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    ry = 0,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  for (const f of FURN) {
    const cx = worldX(f.x) + ((f.w - 1) * CELL) / 2;
    const cz = worldZ(f.z) + ((f.h - 1) * CELL) / 2;
    const w = f.w * CELL - 0.18;
    const d = f.h * CELL - 0.18;
    for (let z = f.z; z < f.z + f.h; z++) {
      for (let x = f.x; x < f.x + f.w; x++) {
        if (x >= 0 && z >= 0 && x < GW && z < GH) {
          floor[idx(x, z)] = 1;
          blocked[idx(x, z)] = 1;
          if (furnBlocksLos(f.type)) losBlock[idx(x, z)] = 1;
        }
      }
    }
    switch (f.type) {
      case "wardrobe": {
        // A proper wardrobe shell: dark interior, sides and two hinged doors.
        // The open front faces +Z, matching the generated hide-spot exit point.
        const shellMat = new THREE.MeshStandardMaterial({ map: doorTex(), normalMap: doorNormal(), color: 0x8c795f, roughness: 0.82 });
        const interiorMat = new THREE.MeshStandardMaterial({ color: 0x080706, roughness: 1 });
        const th = 0.09;
        addBox(w, 2.3, th, cx, 1.15, cz - d / 2 + th / 2, shellMat);
        addBox(th, 2.3, d, cx - w / 2 + th / 2, 1.15, cz, shellMat);
        addBox(th, 2.3, d, cx + w / 2 - th / 2, 1.15, cz, shellMat);
        addBox(w, th, d, cx, 2.3 - th / 2, cz, shellMat);
        addBox(w - th * 2, th, d, cx, th / 2, cz, shellMat);
        addBox(w - th * 2, 2.16, 0.02, cx, 1.14, cz - d / 2 + th + 0.015, interiorMat);
        addBox(w - 0.28, 0.035, 0.035, cx, 1.82, cz - d * 0.15, metalMat);
        for (let i = 0; i < 4; i++) {
          const hanger = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.009, 5, 8, Math.PI), metalMat);
          hanger.position.set(cx - w * 0.3 + i * (w * 0.2), 1.7, cz - d * 0.13);
          hanger.rotation.y = Math.PI;
          group.add(hanger);
        }
        const makeLeaf = (left: boolean) => {
          const pivot = new THREE.Group();
          const hingeX = left ? cx - w / 2 + th : cx + w / 2 - th;
          pivot.position.set(hingeX, 0, cz + d / 2 + 0.01);
          const leafW = w / 2 - th;
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, 2.24, 0.07), shellMat);
          leaf.position.set(left ? leafW / 2 : -leafW / 2, 1.12, 0);
          pivot.add(leaf);
          // recessed panel and a handle on every leaf
          const panel = new THREE.Mesh(new THREE.BoxGeometry(leafW * 0.72, 1.65, 0.02), darkWood);
          panel.position.set(left ? leafW / 2 : -leafW / 2, 1.15, 0.045);
          pivot.add(panel);
          const handle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0xb89c50, metalness: 0.8, roughness: 0.35 }));
          handle.position.set(left ? leafW - 0.1 : -leafW + 0.1, 1.12, 0.08);
          pivot.add(handle);
          group.add(pivot);
          return pivot;
        };
        const leftLeaf = makeLeaf(true);
        const rightLeaf = makeLeaf(false);
        // Wardrobes start visibly ajar, inviting the player to enter.
        leftLeaf.rotation.y = -0.72;
        rightLeaf.rotation.y = 0.72;
        wardrobeDoors.set(f, { leaves: [leftLeaf, rightLeaf], open: [-0.72, 0.72] });
        break;
      }
      case "bed": {
        addBox(w, 0.42, d, cx, 0.21, cz, darkWood);
        addBox(w, 0.3, d, cx, 0.55, cz, sheetMat);
        addBox(w, 0.9, 0.16, cx, 0.6, cz - d / 2 + 0.08, darkWood);
        const pil = addBox(w * 0.8, 0.18, 0.4, cx, 0.75, cz - d / 2 + 0.35, fabricMat);
        pil.rotation.x = -0.1;
        break;
      }
      case "tableBig":
      case "table": {
        const top = f.type === "tableBig" ? 0.78 : 0.74;
        addBox(w, 0.1, d, cx, top, cz, woodMat);
        const leg = 0.12;
        for (const sx of [-1, 1])
          for (const sz of [-1, 1])
            addBox(leg, top, leg, cx + (sx * (w - leg)) / 2, top / 2, cz + (sz * (d - leg)) / 2, darkWood);
        break;
      }
      case "shelf": {
        addBox(w, 2.1, d * 0.8, cx, 1.05, cz, woodMat);
        for (let i = 0; i < 4; i++) addBox(w * 0.9, 0.05, d * 0.7, cx, 0.4 + i * 0.5, cz, darkWood);
        break;
      }
      case "sofa": {
        addBox(w, 0.45, d, cx, 0.28, cz, fabricMat);
        addBox(w, 0.7, 0.3, cx, 0.65, cz - d / 2 + 0.15, fabricMat);
        addBox(0.25, 0.55, d, cx - w / 2 + 0.12, 0.6, cz, fabricMat);
        addBox(0.25, 0.55, d, cx + w / 2 - 0.12, 0.6, cz, fabricMat);
        break;
      }
      case "chair": {
        addBox(0.55, 0.08, 0.55, cx, 0.46, cz, woodMat);
        addBox(0.55, 0.6, 0.08, cx, 0.76, cz - 0.24, woodMat);
        for (const sx of [-0.22, 0.22])
          for (const sz of [-0.22, 0.22]) addBox(0.07, 0.46, 0.07, cx + sx, 0.23, cz + sz, darkWood);
        break;
      }
      case "crate": {
        addBox(w * 0.9, 0.8, d * 0.9, cx, 0.4, cz, darkWood, Math.random() * 0.4);
        addBox(w * 0.7, 0.5, d * 0.7, cx + 0.1, 1.0, cz - 0.1, woodMat, Math.random() * 0.6);
        break;
      }
      case "fridge": {
        addBox(w * 0.8, 1.9, d * 0.8, cx, 0.95, cz, porcelainMat);
        addBox(0.06, 0.4, 0.06, cx + w * 0.3, 1.2, cz + d * 0.42, metalMat);
        break;
      }
      case "stove":
      case "washer": {
        addBox(w * 0.85, 0.95, d * 0.85, cx, 0.48, cz, porcelainMat);
        addBox(w * 0.55, 0.06, d * 0.55, cx, 0.98, cz, darkWood);
        break;
      }
      case "counter":
      case "dresser": {
        addBox(w, 0.92, d, cx, 0.46, cz, woodMat);
        addBox(w * 1.02, 0.07, d * 1.02, cx, 0.94, cz, darkWood);
        for (let i = 0; i < 3; i++) addBox(w * 0.8, 0.04, 0.04, cx, 0.3 + i * 0.28, cz + d / 2 + 0.01, metalMat);
        break;
      }
      case "sink":
      case "tub": {
        const long = f.type === "tub" ? 1.1 : 0.7;
        addBox(w * 0.9, long, d * 0.9, cx, 0.45, cz, porcelainMat);
        addBox(w * 0.7, long - 0.2, d * 0.7, cx, 0.52, cz, new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.2 }));
        break;
      }
      case "clock": {
        addBox(0.6, 2.1, 0.4, cx, 1.05, cz, woodMat);
        addBox(0.44, 0.44, 0.06, cx, 1.8, cz + 0.2, porcelainMat);
        break;
      }
      case "piano": {
        addBox(w, 1.15, d, cx, 0.58, cz, darkWood);
        addBox(w * 0.8, 0.06, 0.4, cx, 1.0, cz + d / 2 - 0.2, new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.3 }));
        break;
      }
      case "tv": {
        addBox(w, 0.6, d, cx, 0.3, cz, woodMat);
        addBox(w * 0.7, 0.5, 0.1, cx, 1.0, cz, new THREE.MeshStandardMaterial({ color: 0x0a0d10, roughness: 0.25, emissive: 0x0a1418 }));
        break;
      }
    }
    if (isFurnHide(f.type)) {
      const wardrobe = wardrobeDoors.get(f);
      const front = new THREE.Vector3(cx, 0, cz + d / 2 + 0.62);
      hideSpots.push({
        pos: new THREE.Vector3(cx, f.type === "wardrobe" ? 1.18 : f.type === "bed" ? 0.34 : 0.4, cz + (f.type === "wardrobe" ? d * 0.08 : 0)),
        exit: front,
        type: f.type,
        cell: idx(f.x, f.z),
        furn: f,
        leaves: wardrobe?.leaves,
        leafOpen: wardrobe?.open,
        doorAmount: wardrobe ? 1 : 0,
        doorTarget: wardrobe ? 1 : 0,
      });
    }
  }

  // ---------- creaky boards
  const creaky = new Set<number>();
  const creakMat = new THREE.MeshStandardMaterial({ color: 0x2a1d12, roughness: 1 });
  for (const [cx, cz] of CREAKY) {
    if (floor[idx(cx, cz)] !== 1 || blocked[idx(cx, cz)]) continue;
    creaky.add(idx(cx, cz));
    const p = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.92, 0.03, CELL * 0.92), creakMat);
    p.position.set(worldX(cx), 0.015, worldZ(cz));
    p.receiveShadow = true;
    group.add(p);
  }

  // ---------- lamps
  const lamps: Lamp[] = [];
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffcf87, emissiveIntensity: 2.2 });
  for (const [cx, cz, inten] of LAMPS) {
    const wx = worldX(cx);
    const wz = worldZ(cz);
    const light = new THREE.PointLight(0xffb070, inten * 14, 12, 2);
    light.position.set(wx, WALL_H - 0.45, wz);
    group.add(light);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), bulbMat);
    mesh.position.copy(light.position);
    group.add(mesh);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.34, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x2b2620, side: THREE.DoubleSide, roughness: 0.9 }),
    );
    shade.position.set(wx, WALL_H - 0.28, wz);
    group.add(shade);
    lamps.push({ light, base: light.intensity, flicker: Math.random() * 10, mesh });
  }

  // ================================================================ DECOR
  const surface = new Uint8Array(GW * GH); // 0 wood, 1 tile, 2 carpet

  // ---- tiled floors (bathroom, kitchen, laundry)
  const tileMat = new THREE.MeshStandardMaterial({
    map: tileTex(),
    normalMap: tileNormal(),
    roughness: 0.35,
    metalness: 0.08,
    color: 0xd0ccc4,
  });
  for (const name of ["łazienka", "kuchnia", "pralnia"]) {
    const r = ROOMS.find((rr) => rr.name === name)!;
    const t = tileTex().clone();
    t.needsUpdate = true;
    t.repeat.set(r.w / 1.5, r.h / 1.5);
    const tn = tileNormal().clone();
    tn.needsUpdate = true;
    tn.repeat.set(r.w / 1.5, r.h / 1.5);
    const mat = tileMat.clone();
    mat.map = t;
    mat.normalMap = tn;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r.w * CELL - 0.2, r.h * CELL - 0.2), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(worldX(r.x) + ((r.w - 1) * CELL) / 2, 0.012, worldZ(r.z) + ((r.h - 1) * CELL) / 2);
    mesh.receiveShadow = true;
    group.add(mesh);
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) surface[idx(x, z)] = 1;
  }

  // ---- rugs
  const RUGS: [number, number, number, number][] = [
    [4, 17, 5, 5],
    [3, 3, 4, 4],
    [3, 10, 34, 1],
    [32, 15, 4, 4],
    [20, 22, 5, 4],
    [19, 3, 4, 3],
  ];
  for (const [rx, rz, rw, rh] of RUGS) {
    const t = rugTex().clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(rw / 3)), Math.max(1, Math.round(rh / 3)));
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 1, color: 0xb9a89a });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rw * CELL - 0.5, rh * CELL - 0.5), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(worldX(rx) + ((rw - 1) * CELL) / 2, 0.02, worldZ(rz) + ((rh - 1) * CELL) / 2);
    mesh.receiveShadow = true;
    group.add(mesh);
    for (let z = rz; z < rz + rh; z++) for (let x = rx; x < rx + rw; x++) if (surface[idx(x, z)] === 0) surface[idx(x, z)] = 2;
  }

  // ---- ceiling beams
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x1e1510, roughness: 0.95 });
  const beamGeo = new THREE.BoxGeometry(GW * CELL, 0.22, 0.26);
  for (let z = 2; z < GH; z += 3) {
    const b = new THREE.Mesh(beamGeo, beamMat);
    b.position.set((GW * CELL) / 2, WALL_H - 0.11, worldZ(z));
    b.castShadow = true;
    group.add(b);
  }

  // ---- wall decor helpers
  type Side = "N" | "S" | "E" | "W";
  const wallAnchor = (cx: number, cz: number, side: Side, y: number, inset = WALL_T + 0.02) => {
    const pos = new THREE.Vector3(worldX(cx), y, worldZ(cz));
    let ry = 0;
    if (side === "N") {
      pos.z -= CELL / 2 - inset;
      ry = 0;
    } else if (side === "S") {
      pos.z += CELL / 2 - inset;
      ry = Math.PI;
    } else if (side === "W") {
      pos.x -= CELL / 2 - inset;
      ry = Math.PI / 2;
    } else {
      pos.x += CELL / 2 - inset;
      ry = -Math.PI / 2;
    }
    return { pos, ry };
  };

  // ---- room identity: every room gets a different light language and story prop set
  const themedWood = new THREE.MeshStandardMaterial({ map: doorTex(), normalMap: doorNormal(), color: 0x7a654f, roughness: 0.78 });
  const rustyMetal = new THREE.MeshStandardMaterial({ color: 0x5a3730, roughness: 0.65, metalness: 0.65 });
  const blackGlass = new THREE.MeshPhysicalMaterial({ color: 0x0b1118, roughness: 0.08, metalness: 0.45, clearcoat: 1 });
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x263943, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.6, clearcoat: 1 });
  const roomCenter = (r: (typeof ROOMS)[number]) => new THREE.Vector3(worldX(r.x) + ((r.w - 1) * CELL) / 2, 0, worldZ(r.z) + ((r.h - 1) * CELL) / 2);
  const glow = (r: (typeof ROOMS)[number], color: number, intensity: number, distance: number, y = 2.4) => {
    const p = roomCenter(r);
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.set(p.x, y, p.z);
    group.add(l);
    lamps.push({ light: l, base: intensity, flicker: Math.random() * 9, mesh: new THREE.Mesh() });
    return l;
  };
  const floorPuddle = (x: number, z: number, sx: number, sz: number, rot = 0) => {
    const p = new THREE.Mesh(new THREE.CircleGeometry(1, 24), waterMat);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = rot;
    p.scale.set(sx, sz, 1);
    p.position.set(x, 0.026, z);
    group.add(p);
  };
  const bookStack = (x: number, y: number, z: number, count: number) => {
    const colors = [0x5e1d1d, 0x263c4d, 0x4c3c25, 0x453447];
    for (let i = 0; i < count; i++) {
      const b = addBox(0.26 + (i % 2) * 0.04, 0.055, 0.38, x + (i % 2) * 0.02, y + i * 0.06, z + (i % 3) * 0.015, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.9 }), (i % 2) * 0.08);
      b.castShadow = true;
    }
  };
  const sconce = (cx: number, cz: number, side: Side, color: number) => {
    const a = wallAnchor(cx, cz, side, 2.0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.08), rustyMetal);
    base.position.copy(a.pos);
    base.rotation.y = a.ry;
    group.add(base);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 3 }));
    bulb.position.copy(a.pos).add(new THREE.Vector3(0, 0.13, 0.13).applyAxisAngle(new THREE.Vector3(0, 1, 0), a.ry));
    group.add(bulb);
    const l = new THREE.PointLight(color, 3.5, 5, 2);
    l.position.copy(bulb.position);
    group.add(l);
    lamps.push({ light: l, base: l.intensity, flicker: Math.random() * 7, mesh: bulb });
  };

  for (const r of ROOMS) {
    const c = roomCenter(r);
    switch (r.style) {
      case "bedroom": {
        glow(r, 0x6e88d8, 2.5, 8, 2.2);
        const nightstand = addBox(0.65, 0.62, 0.55, worldX(4), 0.31, worldZ(2), themedWood);
        nightstand.castShadow = true;
        bookStack(worldX(4), 0.66, worldZ(2), 3);
        const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.42), new THREE.MeshStandardMaterial({ map: portraitTex(17), roughness: 0.7 }));
        photo.position.set(worldX(4), 0.9, worldZ(2) - 0.22);
        photo.rotation.x = -0.18;
        group.add(photo);
        break;
      }
      case "bath": {
        glow(r, 0x9ab7a6, 3, 7, 2.55);
        const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.05), blackGlass);
        mirror.position.set(worldX(11) + 0.02, 1.75, worldZ(1) - CELL / 2 + WALL_T + 0.04);
        group.add(mirror);
        const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.2, 0.06), rustyMetal);
        mirrorFrame.position.copy(mirror.position).add(new THREE.Vector3(0, 0, -0.03));
        group.add(mirrorFrame);
        floorPuddle(worldX(14), worldZ(5), 0.9, 0.42, 0.3);
        floorPuddle(worldX(13), worldZ(3), 0.55, 0.23, -0.5);
        break;
      }
      case "study": {
        glow(r, 0x507244, 2.8, 8, 1.65);
        const deskLamp = new THREE.Group();
        deskLamp.position.set(worldX(19) + 0.25, 1.04, worldZ(2));
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.38, 8), rustyMetal);
        stem.position.y = 0.18;
        deskLamp.add(stem);
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.16, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a512b, side: THREE.DoubleSide }));
        shade.position.y = 0.37;
        shade.rotation.x = Math.PI;
        deskLamp.add(shade);
        const dl = new THREE.PointLight(0xb9e36c, 3, 4, 2);
        dl.position.set(0, 0.3, 0.15);
        deskLamp.add(dl);
        group.add(deskLamp);
        bookStack(worldX(19) - 0.3, 1.02, worldZ(2), 5);
        break;
      }
      case "pantry": {
        glow(r, 0xa75f2b, 1.8, 6, 2.4);
        // hanging jars and hooks make the pantry feel cramped and different
        for (let i = 0; i < 6; i++) {
          const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.3 + (i % 2) * 0.1, 10), new THREE.MeshPhysicalMaterial({ color: i % 2 ? 0x5f261c : 0x39482e, transparent: true, opacity: 0.75, roughness: 0.2, metalness: 0.1 }));
          jar.position.set(worldX(27) + (i % 3) * 0.55, 2.4 - (i % 2) * 0.18, worldZ(3) + Math.floor(i / 3) * 0.6);
          group.add(jar);
        }
        break;
      }
      case "laundry": {
        glow(r, 0x78b6c4, 2.4, 7, 2.45);
        // exposed copper pipes across the north wall
        for (const y of [1.25, 1.7]) {
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 7.5, 8), rustyMetal);
          pipe.rotation.z = Math.PI / 2;
          pipe.position.set(c.x, y, worldZ(1) - 0.72);
          group.add(pipe);
        }
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 7, 6), new THREE.MeshStandardMaterial({ color: 0x1c1715 }));
        line.rotation.z = Math.PI / 2;
        line.position.set(c.x, 2.35, c.z);
        group.add(line);
        for (let i = 0; i < 4; i++) {
          const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8 + (i % 2) * 0.2), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x7e7770 : 0x433f47, roughness: 1, side: THREE.DoubleSide }));
          cloth.position.set(c.x - 2 + i * 1.25, 1.9, c.z);
          group.add(cloth);
        }
        floorPuddle(worldX(36), worldZ(4), 0.8, 0.3, 0.5);
        break;
      }
      case "hall": {
        sconce(10, 9, "N", 0xd87339);
        sconce(20, 9, "N", 0xd87339);
        sconce(30, 9, "N", 0xd87339);
        break;
      }
      case "passage": {
        glow(r, 0x556066, 1.3, 5, 2.7);
        for (let y = 0.7; y < 2.6; y += 0.6) {
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 7), rustyMetal);
          pipe.rotation.z = Math.PI / 2;
          pipe.position.set(worldX(14) + 0.25, y, c.z);
          group.add(pipe);
        }
        break;
      }
      case "living": {
        // Fireplace at the west wall; its orange glow contrasts the moonlight.
        const fpX = worldX(1) - CELL / 2 + WALL_T + 0.22;
        const fp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.6, 1.8), new THREE.MeshStandardMaterial({ color: 0x21130e, roughness: 0.95 }));
        fp.position.set(fpX, 0.8, worldZ(22));
        group.add(fp);
        const ember = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.75), new THREE.MeshStandardMaterial({ color: 0xff4010, emissive: new THREE.Color(0xff2105), emissiveIntensity: 3, transparent: true, opacity: 0.75 }));
        ember.position.set(fpX + 0.19, 0.7, worldZ(22));
        ember.rotation.y = Math.PI / 2;
        group.add(ember);
        const fire = new THREE.PointLight(0xff5420, 7, 8, 2);
        fire.position.set(fpX + 0.9, 1.0, worldZ(22));
        group.add(fire);
        lamps.push({ light: fire, base: fire.intensity, flicker: Math.random() * 5, mesh: ember });
        break;
      }
      case "kitchen": {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.24), new THREE.MeshStandardMaterial({ color: 0xcce8ff, emissive: new THREE.Color(0x9ec7ff), emissiveIntensity: 2.2 }));
        strip.position.set(c.x, WALL_H - 0.22, c.z);
        group.add(strip);
        const fl = new THREE.PointLight(0xb8d8ff, 5.5, 9, 2);
        fl.position.set(c.x, WALL_H - 0.35, c.z);
        group.add(fl);
        lamps.push({ light: fl, base: fl.intensity, flicker: Math.random() * 6, mesh: strip });
        for (let i = 0; i < 3; i++) {
          const pan = new THREE.Mesh(new THREE.TorusGeometry(0.13 + i * 0.02, 0.022, 6, 12), rustyMetal);
          pan.position.set(worldX(23) + i * 0.4, 2.15, worldZ(13) + 0.25);
          pan.rotation.x = Math.PI / 2;
          group.add(pan);
        }
        floorPuddle(worldX(24), worldZ(16), 0.7, 0.28, 0.15);
        break;
      }
      case "dining": {
        // Low chandelier above the table, whose candles already flicker below it.
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.15, 6), rustyMetal);
        chain.position.set(c.x, WALL_H - 0.58, c.z);
        group.add(chain);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 18), rustyMetal);
        ring.position.set(c.x, WALL_H - 1.15, c.z);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
        const chandelierWax = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6 });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.25, 7), chandelierWax);
          candle.position.set(c.x + Math.cos(a) * 0.55, WALL_H - 1.0, c.z + Math.sin(a) * 0.55);
          group.add(candle);
        }
        glow(r, 0xe28d3c, 2.4, 7, 2.5);
        break;
      }
      case "granny": {
        glow(r, 0x8a3d82, 3.6, 9, 2.1);
        // An unsettling altar at the north wall.
        const altar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 0.55), themedWood);
        altar.position.set(worldX(34), 0.55, worldZ(13) + 0.25);
        group.add(altar);
        const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.8), new THREE.MeshStandardMaterial({ map: portraitTex(33), emissive: new THREE.Color(0x2a061f), emissiveIntensity: 0.5 }));
        icon.position.set(worldX(34), 1.6, worldZ(13) + 0.55);
        group.add(icon);
        for (let i = 0; i < 4; i++) {
          const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xbdb6a6, roughness: 0.8 }));
          skull.position.set(worldX(33) + i * 0.32, 1.16, worldZ(13) + 0.3);
          group.add(skull);
        }
        break;
      }
      case "shed": {
        glow(r, 0x7295b4, 1.7, 8, 2.55);
        const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.45, 0.08), new THREE.MeshStandardMaterial({ color: 0x473b2d, roughness: 1 }));
        board.position.set(worldX(31), 1.5, worldZ(21) + 0.75);
        group.add(board);
        for (let i = 0; i < 5; i++) {
          const tool = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6 + (i % 2) * 0.2, 0.04), rustyMetal);
          tool.position.set(worldX(30) + i * 0.38, 1.5, worldZ(21) + 0.81);
          tool.rotation.z = (i - 2) * 0.12;
          group.add(tool);
        }
        break;
      }
    }
  }

  // ---- portraits
  const PORTRAITS: [number, number, Side][] = [
    [3, 1, "N"],
    [20, 1, "N"],
    [8, 9, "N"],
    [16, 9, "N"],
    [27, 9, "N"],
    [6, 13, "N"],
    [1, 20, "W"],
    [22, 13, "N"],
    [31, 13, "N"],
    [36, 21, "N"],
    [14, 26, "S"],
    [38, 15, "E"],
    [24, 26, "S"],
  ];
  const picFrameMat = new THREE.MeshStandardMaterial({ color: 0x3a2a14, roughness: 0.6, metalness: 0.3 });
  PORTRAITS.forEach(([cx, cz, side], i) => {
    if (floor[idx(cx, cz)] !== 1) return;
    const { pos, ry } = wallAnchor(cx, cz, side, 1.75);
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = ry;
    const w = 0.7 + (i % 3) * 0.12;
    const h = 0.9 + (i % 2) * 0.15;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.06), picFrameMat);
    g.add(frame);
    const pic = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: portraitTex(i + 1), roughness: 0.7 }),
    );
    pic.position.z = 0.035;
    g.add(pic);
    g.rotation.z = (Math.random() - 0.5) * 0.08;
    group.add(g);
  });

  // ---- windows (fake, emissive) + moonlight
  const WINDOWS: [number, number, Side][] = [
    [3, 1, "N"],
    [14, 1, "N"],
    [22, 1, "N"],
    [36, 1, "N"],
    [1, 17, "W"],
    [38, 16, "E"],
    [6, 26, "S"],
    [35, 21, "N"],
  ];
  const winMat = new THREE.MeshStandardMaterial({
    map: windowTex(),
    emissive: new THREE.Color(0x3b5a9a),
    emissiveMap: windowTex(),
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });
  const winFrame = new THREE.MeshStandardMaterial({ color: 0x1a140d, roughness: 0.8 });
  const sillMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.8 });
  const moonBeamMat = new THREE.MeshBasicMaterial({ color: 0x8fb6ff, transparent: true, opacity: 0.075, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (const [cx, cz, side] of WINDOWS) {
    if (floor[idx(cx, cz)] !== 1) continue;
    const { pos, ry } = wallAnchor(cx, cz, side, 1.75);
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = ry;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), winMat);
    pane.position.z = 0.02;
    g.add(pane);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.6, 0.08), winFrame);
    fr.position.z = -0.03;
    g.add(fr);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.22), sillMat);
    sill.position.set(0, -0.82, 0.08);
    g.add(sill);
    // torn curtain
    const curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 1.7, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a4a44, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    curtain.position.set(-0.6, 0.05, 0.14);
    curtain.rotation.y = 0.25;
    g.add(curtain);
    group.add(g);
    // moonlight pool
    const moon = new THREE.SpotLight(0x8fb0ff, 7, 9, Math.PI / 4, 0.7, 1.4);
    moon.position.copy(pos).add(new THREE.Vector3(0, 0.4, 0));
    const inward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    moon.target.position.copy(pos).add(inward.multiplyScalar(2.6)).setY(0);
    group.add(moon, moon.target);
    // A subtle floor-projected shaft keeps moonlit rooms readable without becoming a UI overlay.
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 4.4), moonBeamMat);
    beam.rotation.x = -Math.PI / 2;
    beam.rotation.y = Math.atan2(inward.x, -inward.z);
    beam.position.copy(pos).add(inward.multiplyScalar(2.1)).setY(0.04);
    group.add(beam);
  }

  // ---- cobwebs in upper corners
  const webMat = new THREE.MeshBasicMaterial({ map: cobwebTex(), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const WEBS: [number, number, number][] = [
    [1, 1, 0],
    [9, 1, 1],
    [18, 7, 3],
    [1, 11, 3],
    [38, 9, 1],
    [1, 13, 0],
    [12, 26, 2],
    [18, 13, 0],
    [28, 26, 2],
    [30, 13, 0],
    [38, 19, 2],
    [37, 26, 2],
    [14, 13, 0],
    [16, 26, 2],
  ];
  for (const [cx, cz, corner] of WEBS) {
    const web = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), webMat);
    const sx = corner === 0 || corner === 3 ? -1 : 1;
    const sz = corner < 2 ? -1 : 1;
    web.position.set(worldX(cx) + sx * (CELL / 2 - WALL_T - 0.35), WALL_H - 0.5, worldZ(cz) + sz * (CELL / 2 - WALL_T - 0.35));
    web.rotation.y = Math.atan2(-sx, -sz) + Math.PI / 4;
    web.rotation.x = -Math.PI / 4;
    group.add(web);
  }

  // ---- blood decals
  const BLOOD: [number, number][] = [
    [4, 10],
    [19, 10],
    [31, 24],
    [15, 19],
    [22, 15],
    [36, 15],
    [5, 21],
    [27, 4],
  ];
  BLOOD.forEach(([cx, cz], i) => {
    if (floor[idx(cx, cz)] !== 1) return;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6 + (i % 3) * 0.5, 1.6 + (i % 2) * 0.5),
      new THREE.MeshStandardMaterial({ map: bloodTex(i + 1), transparent: true, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = i * 1.7;
    m.position.set(worldX(cx) + (i % 2) * 0.4, 0.035, worldZ(cz) - (i % 3) * 0.3);
    m.receiveShadow = true;
    group.add(m);
  });
  // blood smear on the exit door wall
  {
    const { pos, ry } = wallAnchor(31, 26, "S", 1.3);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), new THREE.MeshStandardMaterial({ map: bloodTex(9), transparent: true, roughness: 0.3, depthWrite: false }));
    m.position.copy(pos);
    m.rotation.y = ry;
    group.add(m);
  }

  // ---- candles (flickering)
  const CANDLES: [number, number, number][] = [
    [35, 13, 0.98],
    [26, 26, 0.98],
    [12, 9, 0.98],
    [37, 23, 0.78],
    [20, 1, 1.9],
  ];
  const waxMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6 });
  const flameMat = new THREE.MeshStandardMaterial({ color: 0xffd080, emissive: new THREE.Color(0xff9a2a), emissiveIntensity: 4 });
  for (const [cx, cz, y] of CANDLES) {
    if (floor[idx(cx, cz)] !== 1) continue;
    const wx = worldX(cx) + 0.3;
    const wz = worldZ(cz) - 0.2;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.18, 8), waxMat);
    c.position.set(wx, y + 0.09, wz);
    group.add(c);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), flameMat);
    fl.scale.set(1, 1.8, 1);
    fl.position.set(wx, y + 0.22, wz);
    group.add(fl);
    const light = new THREE.PointLight(0xff9a3a, 3.2, 6, 2);
    light.position.set(wx, y + 0.3, wz);
    group.add(light);
    lamps.push({ light, base: light.intensity, flicker: Math.random() * 10, mesh: fl });
  }

  // ---- hanging cords for lamps
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const l of lamps) {
    if (l.light.position.y < WALL_H - 1) continue;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), cordMat);
    cord.position.set(l.light.position.x, WALL_H - 0.22, l.light.position.z);
    group.add(cord);
  }

  // ---------- item spawn points
  const itemSpawns: ItemSpawn[] = ITEM_CELLS.filter(([cx, cz]) => floor[idx(cx, cz)] === 1).map(([cx, cz, y]) => ({
    pos: new THREE.Vector3(worldX(cx), y + 0.12, worldZ(cz)),
    cell: idx(cx, cz),
  }));

  const roomName = (wx: number, wz: number) => {
    const cx = cellX(wx);
    const cz = cellZ(wz);
    for (const r of ROOMS) {
      if (cx >= r.x && cx < r.x + r.w && cz >= r.z && cz < r.z + r.h) return r.name;
    }
    return "korytarz";
  };

  const surfaceAt = (wx: number, wz: number): Surface => {
    const cx = cellX(wx);
    const cz = cellZ(wz);
    if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return "wood";
    const s = surface[idx(cx, cz)];
    return s === 1 ? "tile" : s === 2 ? "carpet" : "wood";
  };

  return {
    surfaceAt,
    group,
    floor,
    blocked,
    losBlock,
    doors,
    hideSpots,
    lamps,
    itemSpawns,
    creaky,
    exitDoor,
    playerStart: new THREE.Vector3(worldX(3), 0, worldZ(4)),
    grannyStart: new THREE.Vector3(worldX(33), 0, worldZ(24)),
    roomName,
  };
}

/** A* navigation over the level grid. */
export class Nav {
  constructor(private level: Level) {}

  walkable(x: number, z: number) {
    if (x < 0 || z < 0 || x >= GW || z >= GH) return false;
    const i = z * GW + x;
    return this.level.floor[i] === 1 && this.level.blocked[i] === 0;
  }

  doorAt(x: number, z: number) {
    return this.level.doors.find((d) => d.cx === x && d.cz === z);
  }

  findPath(sx: number, sz: number, tx: number, tz: number): [number, number][] {
    if (sx === tx && sz === tz) return [];
    const start = sz * GW + sx;
    const goal = tz * GW + tx;
    const open: number[] = [start];
    const gScore = new Map<number, number>([[start, 0]]);
    const fScore = new Map<number, number>([[start, this.h(sx, sz, tx, tz)]]);
    const came = new Map<number, number>();
    const closed = new Set<number>();
    const inOpen = new Set<number>([start]);
    let guard = 0;
    while (open.length && guard++ < 12000) {
      let best = 0;
      for (let i = 1; i < open.length; i++) {
        if ((fScore.get(open[i]) ?? 1e9) < (fScore.get(open[best]) ?? 1e9)) best = i;
      }
      const cur = open.splice(best, 1)[0];
      inOpen.delete(cur);
      if (cur === goal) return this.reconstruct(came, cur);
      closed.add(cur);
      const cx = cur % GW;
      const cz = (cur - cx) / GW;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.walkable(nx, nz)) continue;
          if (dx && dz && (!this.walkable(cx + dx, cz) || !this.walkable(cx, cz + dz))) continue;
          const ni = nz * GW + nx;
          if (closed.has(ni)) continue;
          const door = this.doorAt(nx, nz);
          const penalty = door && !door.open ? 2.2 : 0;
          const tentative = (gScore.get(cur) ?? 1e9) + (dx && dz ? 1.414 : 1) + penalty;
          if (tentative < (gScore.get(ni) ?? 1e9)) {
            came.set(ni, cur);
            gScore.set(ni, tentative);
            fScore.set(ni, tentative + this.h(nx, nz, tx, tz));
            if (!inOpen.has(ni)) {
              open.push(ni);
              inOpen.add(ni);
            }
          }
        }
      }
    }
    return [];
  }

  private h(a: number, b: number, c: number, d: number) {
    return Math.hypot(a - c, b - d);
  }

  private reconstruct(came: Map<number, number>, cur: number): [number, number][] {
    const path: [number, number][] = [];
    let c = cur;
    let guard = 0;
    while (came.has(c) && guard++ < 5000) {
      const x = c % GW;
      const z = (c - x) / GW;
      path.push([x, z]);
      c = came.get(c)!;
    }
    return path.reverse();
  }
}
