// Material table: which texture, tint and surface response every surface uses.
import type { MaterialName } from '../engine/textures';

export interface MatDef {
  tex: MaterialName;
  tint: [number, number, number];
  rough: number;
  spec: number;
}

const m = (tex: MaterialName, tint: [number, number, number], rough: number, spec: number): MatDef => ({ tex, tint, rough, spec });

export const MATS = {
  wallMaze: m('wallpaper', [1, 1, 1], 0.85, 0.05),
  wallDirty: m('wallpaperDirty', [1, 1, 1], 0.85, 0.05),
  wallDark: m('concrete', [0.8, 0.8, 0.78], 0.8, 0.12),
  wallStore: m('concrete', [1.08, 1.06, 1.02], 0.8, 0.1),
  wallRed: m('concreteRed', [1, 1, 1], 0.75, 0.12),
  wallMetal: m('metalPanel', [1, 1, 1], 0.5, 0.35),
  wallDeep: m('concrete', [0.58, 0.62, 0.64], 0.45, 0.45),
  floorCarpet: m('carpet', [1, 1, 1], 0.95, 0.03),
  floorCarpetWet: m('carpet', [0.62, 0.6, 0.55], 0.25, 0.55),
  floorConcrete: m('floorConcrete', [1, 1, 1], 0.75, 0.12),
  floorWet: m('floorWet', [1, 1, 1], 0.12, 0.85),
  floorGrate: m('grating', [1, 1, 1], 0.5, 0.4),
  ceilTile: m('ceilingTile', [1, 1, 1], 0.95, 0.02),
  ceilConcrete: m('concrete', [0.62, 0.62, 0.62], 0.9, 0.05),
  ceilMetal: m('darkMetal', [1, 1, 1], 0.6, 0.2),
  skirting: m('wood', [0.55, 0.45, 0.35], 0.6, 0.15),
  paint: m('paint', [1, 1, 1], 0.55, 0.3),
  wood: m('wood', [1, 1, 1], 0.6, 0.15),
  darkMetal: m('darkMetal', [1, 1, 1], 0.5, 0.35),
  steel: m('steel', [1, 1, 1], 0.3, 0.6),
  rust: m('rust', [1, 1, 1], 0.7, 0.2),
  cardboard: m('cardboard', [1, 1, 1], 0.9, 0.04),
  fabric: m('fabric', [1, 1, 1], 0.95, 0.03),
  orange: m('orange', [1, 1, 1], 0.8, 0.08),
  paper: m('paper', [1, 1, 1], 0.9, 0.05),
  plastic: m('plastic', [1, 1, 1], 0.45, 0.3),
  plasticDark: m('plastic', [0.22, 0.22, 0.24], 0.4, 0.35),
  plasticRed: m('plastic', [0.9, 0.12, 0.1], 0.4, 0.35),
  hazard: m('hazard', [1, 1, 1], 0.6, 0.15),
  diffuser: m('diffuser', [0.55, 0.53, 0.5], 0.4, 0.2),
  skinPale: m('skinPale', [0.86, 0.84, 0.82], 0.3, 0.55),
  skinGrey: m('skinGrey', [1, 1, 1], 0.25, 0.65),
  skinDark: m('skinGrey', [0.45, 0.42, 0.42], 0.3, 0.55),
  mask: m('mask', [1, 1, 1], 0.2, 0.55),
  gunMetal: m('gunMetal', [1, 1, 1], 0.25, 0.75),
  gunGrip: m('gunGrip', [1, 1, 1], 0.6, 0.2),
  sleeve: m('fabric', [0.75, 0.7, 0.62], 0.95, 0.03),
  skinHand: m('skinPale', [1.05, 0.86, 0.74], 0.6, 0.15),
  black: m('darkMetal', [0.15, 0.15, 0.15], 0.5, 0.2),
} satisfies Record<string, MatDef>;

export type MatKey = keyof typeof MATS;
