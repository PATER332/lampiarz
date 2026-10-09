import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { CATEGORIES, GAMES, categoryCounts, featuredGame, findGame, norm, publishedGames, searchGames } from '../src/catalog';
import { parse } from '../src/router';

test('catalog entries are complete and point at real files', () => {
  const slugs = new Set<string>();
  for (const g of GAMES) {
    assert.ok(!slugs.has(g.slug), `duplicate slug ${g.slug}`);
    slugs.add(g.slug);
    assert.match(g.slug, /^[a-z0-9-]+$/);
    assert.ok(CATEGORIES.some((c) => c.id === g.category));
    for (const img of [g.thumbnail, g.cover, ...(g.screenshots ?? []).map((s) => s.src)]) assert.ok(existsSync('public' + img), `missing ${img}`);
    if (g.status === 'published') {
      const m = /^\/g\/([a-z0-9-]+)\/index\.html$/.exec(g.entry);
      assert.ok(m, `entry must be /g/<slug>/index.html, got ${g.entry}`);
      assert.ok(existsSync(`games/${m![1]}/src/main.tsx`) || existsSync(`games/${m![1]}/src/main.ts`), `game sources missing for ${g.slug}`);
    }
  }
});

test('search, categories and featured game', () => {
  assert.equal(featuredGame()?.slug, 'lampiarz');
  assert.equal(searchGames({ q: 'LAMPIARZ' }).length, 1);
  assert.equal(searchGames({ q: 'swietle mroku' }).length, 1);
  assert.equal(searchGames({ q: 'nie-ma-takiej-gry' }).length, 0);
  assert.equal(searchGames({ category: 'puzzle' }).length, 0);
  const counts = categoryCounts();
  assert.equal(counts.roguelite, 2);
  assert.equal(counts.akcja, 1);
  assert.equal(searchGames({ q: 'popielny dzwon' }).length, 1);
  assert.equal(searchGames({ q: 'parowanie' })[0]?.slug, 'popielny-dzwon');
  assert.equal(searchGames({ category: 'akcja' })[0]?.slug, 'popielny-dzwon');
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0) >= publishedGames().length, true);
  assert.equal(norm('Łódź Świętość'), 'lodz swietosc');
  assert.equal(findGame('nope'), undefined);
});

test('routes parse', () => {
  assert.deepEqual(parse('/'), { name: 'home' });
  assert.deepEqual(parse('/games/'), { name: 'library' });
  assert.deepEqual(parse('/games/lampiarz'), { name: 'game', slug: 'lampiarz' });
  assert.deepEqual(parse('/play/popielny-dzwon'), { name: 'play', slug: 'popielny-dzwon' });
  assert.deepEqual(parse('/play/lampiarz'), { name: 'play', slug: 'lampiarz' });
  assert.deepEqual(parse('/x/y'), { name: 'notfound' });
});

test('games never share localStorage keys', () => {
  const seen = new Map<string, string>();
  for (const g of GAMES)
    for (const k of g.storageKeys ?? []) {
      assert.ok(!seen.has(k), `${k} used by ${seen.get(k)} and ${g.slug}`);
      seen.set(k, g.slug);
      // each key is namespaced by its game
      assert.ok(k.startsWith(g.slug.replace(/-/g, '')), `${k} is not namespaced to ${g.slug}`);
    }
});
