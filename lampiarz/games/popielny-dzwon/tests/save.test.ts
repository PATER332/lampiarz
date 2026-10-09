import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSave, loadSettings, newSave, SAVE_KEY, SETTINGS_KEY, validateSave, writeSave, DEFAULT_SETTINGS } from '../src/save';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

function withStorage() {
  const s = new MemStorage();
  (globalThis as unknown as { window: unknown }).window = { localStorage: s };
  return s;
}

test('a fresh save is valid and round-trips through storage', () => {
  const st = withStorage();
  const s = newSave();
  assert.ok(validateSave(s));
  s.zuzel = 321;
  s.bosses.kat = true;
  assert.ok(writeSave(s));
  assert.ok(st.getItem(SAVE_KEY));
  const r = loadSave();
  assert.equal(r.warning, null);
  assert.equal(r.save?.zuzel, 321);
  assert.equal(r.save?.bosses.kat, true);
});

test('missing save is not an error', () => {
  withStorage();
  const r = loadSave();
  assert.equal(r.save, null);
  assert.equal(r.warning, null);
});

test('corrupted save is detected, backed up and cleared', () => {
  const st = withStorage();
  st.setItem(SAVE_KEY, '{"version":1,"level":"oops"');
  const r = loadSave();
  assert.equal(r.save, null);
  assert.match(r.warning ?? '', /uszkodzony/);
  assert.equal(st.getItem(SAVE_KEY), null);
  assert.ok(st.getItem(SAVE_KEY + '.corrupt'));
});

test('structurally wrong saves are rejected', () => {
  const good = newSave();
  assert.equal(validateSave({ ...good, version: 99 }), false);
  assert.equal(validateSave({ ...good, weapon: 'mlot' }), false, 'weapon must be owned');
  assert.equal(validateSave({ ...good, attrs: { wigor: 1 } }), false);
  assert.equal(validateSave({ ...good, expedition: { location: 'rynek' } }), false);
  assert.equal(validateSave(null), false);
  assert.equal(validateSave([]), false);
});

test('older saves without newer fields are upgraded on load', () => {
  const st = withStorage();
  const s = newSave() as unknown as Record<string, unknown>;
  delete s.endingsSeen;
  (s.stats as Record<string, unknown>) = { deaths: 4 };
  st.setItem(SAVE_KEY, JSON.stringify(s));
  const r = loadSave();
  assert.deepEqual(r.save?.endingsSeen, []);
  assert.equal(r.save?.stats.deaths, 4);
  assert.equal(r.save?.stats.parries, 0);
});

test('settings fall back to defaults and merge partial data', () => {
  const st = withStorage();
  assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
  st.setItem(SETTINGS_KEY, JSON.stringify({ music: 0.2 }));
  assert.equal(loadSettings().music, 0.2);
  assert.equal(loadSettings().sfx, DEFAULT_SETTINGS.sfx);
  st.setItem(SETTINGS_KEY, 'not json');
  assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
});

test('storage keys are namespaced to this game', () => {
  assert.match(SAVE_KEY, /^popielnydzwon\./);
  assert.match(SETTINGS_KEY, /^popielnydzwon\./);
});
