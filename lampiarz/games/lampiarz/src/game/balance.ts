// Balance configuration. Every gameplay number lives here so tuning never
// requires touching engine code.

export const BALANCE = {
  map: { w: 23, h: 17 },
  totalDepth: 6, // 5 districts + the Lighthouse

  lantern: {
    burnEvery: 15, // turns per 1 oil
    burnEveryFrugal: 24,
    dryRadius: 1.6, // lantern radius when oil = 0
  },

  light: {
    lampCost: 1,
    lampRadius: 2.6,
    brazierCost: 2,
    brazierRadius: 3.6,
    lighthouseCost: 3,
    lighthouseRadius: 6,
    holyBurnDamage: 2,
    burningRadius: 1.1,
    drainRefund: 1,
  },

  items: {
    oilCan: 3,
    emberMin: 3,
    emberMax: 5,
    lampsMin: 6,
    lampsMax: 9,
    oilMin: 5,
    oilMax: 6,
    emberPilesMin: 3,
    emberPilesMax: 5,
    eventChance: 0.55,
    shrineChance: 0.18,
  },

  mrok: {
    threshold: 10,
    base: 0.75,
    perDepth: 0.13,
    perNight: 0.12,
    perLitLamp: 0.07,
    minRate: 0.35,
    deepNightTurn: 160,
    maxAliveBase: 4,
    maxAlivePerDepth: 2,
  },

  enemies: {
    startBase: 2,
    eliteFromDepth: 3,
    eliteChancePerDepth: 0.08,
    oilDropChance: 0.25,
  },

  boss: {
    hp: 12,
    hpPerNight: 2,
    pulseEvery: 4,
    pulseRadius: 2.6,
    broodEvery: 6,
    damage: 2,
  },

  rest: {
    turns: 4, // consecutive waits in brazier warmth to heal 1
  },

  rewards: {
    districtHeal: 1,
    districtOil: 1,
    fullLightEmbers: 5,
  },

  workshop: {
    priceCommon: 8,
    priceUncommon: 11,
    priceRare: 15,
    rerollCost: 2,
    healCost: 5,
    healCostStep: 2,
    oilCost: 3,
    oilAmount: 3,
    night4PriceMult: 1.3,
  },

  score: {
    perEmber: 1,
    perLamp: 3,
    perKill: 2,
    perDistrict: 30,
    victory: 150,
    nightMult: 0.25,
  },
} as const;
