// Shared constants. Units: pixels of the low-resolution game buffer, seconds.

export const TILE = 16;
export const VIEW_W = 480;
export const VIEW_H = 270;
export const STEP = 1 / 60; // fixed simulation step

export const GRAVITY = 1250;
export const MAX_FALL = 430;

export const PLAYER = {
  w: 10,
  h: 22,
  runSpeed: 118,
  accelGround: 1500,
  accelAir: 1050,
  friction: 1700,
  jumpSpeed: 345,
  doubleJumpSpeed: 315,
  jumpCut: 0.45, // velocity kept when the jump key is released early
  coyote: 0.09,
  jumpBuffer: 0.12,
  dashSpeed: 330,
  dashTime: 0.16,
  dashCooldown: 0.42,
  dashIframes: 0.22,
  hurtIframes: 0.8,
  baseHp: 100,
  baseEnergy: 100,
  energyRegen: 9, // per second
  chargeTime: 0.5, // hold J this long for a charged attack
};

export const AREA_COUNT = 5;
