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
  assert.equal(searchGames({ category: 'puzzle' })[0]?.slug, 'echobound');
  const counts = categoryCounts();
  assert.equal(counts.roguelite, 1);
  assert.equal(counts.horror, 1);
  assert.equal(searchGames({ q: 'babcia' })[0]?.slug, 'babcia');
  assert.equal(searchGames({ q: 'dom bez wyjscia' })[0]?.slug, 'babcia');
  assert.equal(counts.akcja, 2);
  assert.equal(counts.imprezowe, 1);
  assert.equal(counts.symulacje, 1);
  assert.equal(searchGames({ q: 'skrzynkomat' })[0]?.slug, 'skrzynkomat');
  assert.equal(searchGames({ q: 'upgrader' })[0]?.slug, 'skrzynkomat');
  assert.equal(searchGames({ category: 'symulacje' })[0]?.slug, 'skrzynkomat');
  assert.equal(searchGames({ q: 'random chaos' })[0]?.slug, 'random-chaos');
  assert.equal(searchGames({ q: '2 graczy' })[0]?.slug, 'random-chaos');
  assert.equal(searchGames({ category: 'imprezowe' })[0]?.slug, 'random-chaos');
  assert.equal(counts.puzzle, 1);
  assert.equal(counts.przygodowe, 2);
  assert.equal(searchGames({ q: 'echobound' })[0]?.slug, 'echobound');
  assert.equal(searchGames({ q: 'echa czasu' })[0]?.slug, 'echobound');
  assert.equal(searchGames({ category: 'horror' })[0]?.slug, 'babcia');
  assert.ok(searchGames({ category: 'horror' }).some((g) => g.slug === 'babcia'));
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0) >= publishedGames().length, true);
  assert.equal(norm('Łódź Świętość'), 'lodz swietosc');
  assert.equal(findGame('nope'), undefined);
  // removed titles are gone from the site
  for (const slug of ['popielny-dzwon', 'night-shift', 'backrooms-the-descent']) assert.equal(findGame(slug), undefined);
  assert.deepEqual(publishedGames().map((g) => g.slug).sort(), ['babcia', 'echobound', 'lampiarz', 'random-chaos', 'skrzynkomat']);
});

test('routes parse', () => {
  assert.deepEqual(parse('/'), { name: 'home' });
  assert.deepEqual(parse('/games/'), { name: 'library' });
  assert.deepEqual(parse('/games/lampiarz'), { name: 'game', slug: 'lampiarz' });
  assert.deepEqual(parse('/play/lampiarz'), { name: 'play', slug: 'lampiarz' });
  assert.deepEqual(parse('/play/random-chaos'), { name: 'play', slug: 'random-chaos' });
  assert.deepEqual(parse('/play/skrzynkomat'), { name: 'play', slug: 'skrzynkomat' });
  assert.deepEqual(parse('/play/babcia'), { name: 'play', slug: 'babcia' });
  assert.deepEqual(parse('/play/echobound'), { name: 'play', slug: 'echobound' });
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
