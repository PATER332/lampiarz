// Derived character stats from level, attributes, weapon and relics.
import { ATTR, BASE, WEAPONS, type RelicId } from './data/content';
import type { SaveData } from './save';

export interface Stats {
  maxHp: number;
  maxStamina: number;
  staminaRegen: number;
  dmgMul: number;
  heavyMul: number;
  heavyStamina: number;
  flasks: number;
  flaskHeal: number;
  flaskTime: number;
  flaskUninterruptible: boolean;
  pips: number;
  skillMul: number;
  resonanceGain: number;
  parryMul: number;
  blockLeakMul: number;
  lowHpBonus: number;
  killHeal: number;
  dodgeBuff: number;
  enemyWindupMul: number;
  revealSecrets: boolean;
  weaponPlus: number;
}

export function has(save: SaveData, r: RelicId) {
  return save.equipped.includes(r);
}

export function computeStats(save: SaveData): Stats {
  const a = save.attrs;
  const s: Stats = {
    maxHp: BASE.hp + a.wigor * ATTR.wigor.hp,
    maxStamina: BASE.stamina + a.wytrwalosc * ATTR.wytrwalosc.stamina,
    staminaRegen: BASE.staminaRegen * (1 + a.wytrwalosc * 0.025),
    dmgMul: 1 + a.sila * ATTR.sila.dmg,
    heavyMul: 1,
    heavyStamina: 0,
    flasks: BASE.flasks + save.flaskSeeds.length,
    flaskHeal: BASE.flaskHeal,
    flaskTime: 0.75,
    flaskUninterruptible: false,
    pips: Math.min(6, BASE.pips + Math.floor(a.rezonans / 3)),
    skillMul: 1 + a.rezonans * ATTR.rezonans.skill,
    resonanceGain: 1,
    parryMul: 1,
    blockLeakMul: 1,
    lowHpBonus: 0,
    killHeal: 0,
    dodgeBuff: 0,
    enemyWindupMul: 1,
    revealSecrets: false,
    weaponPlus: save.weapons[save.weapon] ?? 0,
  };
  s.dmgMul *= 1 + s.weaponPlus * WEAPONS[save.weapon].upgradeDmg;
  if (has(save, 'tanczacy_popiol')) {
    s.dodgeBuff = 0.6;
    s.maxStamina -= 15;
  }
  if (has(save, 'gorzka_modlitwa')) {
    s.heavyMul = 1.35;
    s.heavyStamina = 12;
  }
  if (has(save, 'woskowe_serce')) {
    s.flasks += 1;
    s.flaskHeal *= 0.75;
  }
  if (has(save, 'pekniety_klosz')) {
    s.parryMul = 1.8;
    s.blockLeakMul = 2;
  }
  if (has(save, 'zalobny_welon')) s.lowHpBonus = 0.35;
  if (has(save, 'pierscien_wdowy')) {
    s.killHeal = 7;
    s.maxHp -= 20;
  }
  if (has(save, 'kosc_dzwonka')) {
    s.resonanceGain = 1.6;
    s.skillMul *= 0.8;
  }
  if (has(save, 'oko_cmy')) {
    s.enemyWindupMul = 1.15;
    s.revealSecrets = true;
  }
  if (has(save, 'zelazny_rozaniec')) {
    s.flaskUninterruptible = true;
    s.flaskTime *= 1.3;
  }
  return s;
}
