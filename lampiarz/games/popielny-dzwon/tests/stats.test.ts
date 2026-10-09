import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE, levelCost, RELICS, WEAPONS, type RelicId } from '../src/data/content';
import { newSave } from '../src/save';
import { computeStats } from '../src/stats';

test('attributes raise the matching stats', () => {
  const s = newSave();
  const base = computeStats(s);
  s.attrs = { wigor: 5, wytrwalosc: 5, sila: 5, rezonans: 6 };
  const up = computeStats(s);
  assert.ok(up.maxHp > base.maxHp);
  assert.ok(up.maxStamina > base.maxStamina);
  assert.ok(up.dmgMul > base.dmgMul);
  assert.equal(up.pips, BASE.pips + 2);
});

test('every relic has an effect, and relics with a price have a real drawback', () => {
  const s = newSave();
  const base = computeStats(s);
  for (const id of Object.keys(RELICS) as RelicId[]) {
    s.equipped = [id];
    const st = computeStats(s);
    assert.notDeepEqual(st, base, `${id} changes nothing`);
    if (RELICS[id].cost) {
      // the drawback is reflected in at least one stat getting worse
      const worse = st.maxHp < base.maxHp || st.maxStamina < base.maxStamina || st.heavyStamina > 0 || st.flaskHeal < base.flaskHeal || st.blockLeakMul > 1 || st.skillMul < base.skillMul || st.flaskTime > base.flaskTime;
      assert.ok(worse, `${id} cost not applied`);
    }
  }
});

test('weapon upgrades and seeds scale correctly', () => {
  const s = newSave();
  const a = computeStats(s).dmgMul;
  s.weapons.klucz = 2;
  assert.ok(Math.abs(computeStats(s).dmgMul - a * (1 + 2 * WEAPONS.klucz.upgradeDmg)) < 1e-9);
  s.flaskSeeds = ['rynek', 'ogrod'];
  assert.equal(computeStats(s).flasks, BASE.flasks + 2);
});

test('level costs grow monotonically', () => {
  for (let l = 1; l < 40; l++) assert.ok(levelCost(l + 1) > levelCost(l));
});

test('weapons differ in how they play', () => {
  const k = WEAPONS.klucz;
  const s = WEAPONS.sierpy;
  const m = WEAPONS.mlot;
  assert.ok(s.combo.length > k.combo.length && k.combo.length > m.combo.length, 'combo length');
  assert.ok(s.parryWindow > k.parryWindow && k.parryWindow > m.parryWindow, 'parry windows');
  assert.ok(m.hyperArmor && !k.hyperArmor && !s.hyperArmor, 'hyper armor only on the hammer');
  assert.ok(s.heavy.spin && m.heavy.shockwave, 'unique heavy attacks');
});
