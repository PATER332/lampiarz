"""Popielny Dzwon — end-to-end checks in Chromium.

Usage: python3 games/popielny-dzwon/tests/e2e.py <base_url> <screenshot_dir>
Runs against a built site (node build.mjs && node tools/serve.mjs). Uses the ?debug hooks
only to shorten long walks (teleport near enemies / the boss gate); everything else is
driven through real keyboard input and real UI clicks.
"""
import json, sys, time
from playwright.sync_api import sync_playwright

base, out = sys.argv[1].rstrip('/'), sys.argv[2]
URL = base + '/g/popielny-dzwon/?debug'
results, errors = [], []


def check(name, ok, extra=''):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {extra}' if extra else ''))


def state(pg):
    return pg.evaluate('__pd.state()')


def screens(pg):
    return state(pg)['screens']


def wait_screen(pg, name, timeout=8):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if name in screens(pg):
            return True
        time.sleep(0.1)
    return False


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx = b.new_context(viewport={'width': 1280, 'height': 720})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    pg.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)

    # a foreign save from another EVGAMES title must survive untouched
    pg.goto(URL)
    pg.evaluate("localStorage.setItem('lampiarz.profile.v1', '{\"keep\":true}')")
    pg.reload(); pg.wait_for_selector('.pd-logo'); time.sleep(0.8)
    check('title screen renders', pg.locator('canvas.pd-canvas').count() == 1 and pg.locator('.pd-logo').inner_text() == 'Popielny Dzwon')
    check('continue disabled without a save', pg.get_by_role('button', name='Kontynuuj').is_disabled())
    pg.screenshot(path=f'{out}/pd-01-title.png')

    # settings: keyboard navigation + persistence
    pg.get_by_role('button', name='Ustawienia').click(); time.sleep(0.3)
    music = pg.locator('input[aria-label=Muzyka]')
    music.focus(); pg.keyboard.press('ArrowLeft'); pg.keyboard.press('ArrowLeft'); time.sleep(0.2)
    saved = json.loads(pg.evaluate("localStorage.getItem('popielnydzwon.settings.v1')") or '{}')
    check('settings slider works with keyboard and persists', abs(saved.get('music', 0) - 0.5) < 1e-6, str(saved))
    pg.get_by_role('button', name='Gotowe').click(); time.sleep(0.2)

    # controls screen
    pg.get_by_role('button', name='Sterowanie i walka').click(); time.sleep(0.3)
    check('controls screen lists the bindings', pg.locator('.pd-table tr').count() >= 10)
    pg.keyboard.press('Escape'); time.sleep(0.3)
    check('Esc closes a menu', 'controls' not in screens(pg))

    # new game -> intro -> hub
    pg.get_by_role('button', name='Nowa gra').click(); time.sleep(0.3)
    check('intro story shown', 'intro' in screens(pg))
    pg.get_by_role('button', name='Obudź się').click(); time.sleep(1.8)
    s = state(pg)
    check('new game starts in the hub', s['mode'] == 'play' and s['location'] == 'krypta', json.dumps(s))
    check('save written under own key', pg.evaluate("!!localStorage.getItem('popielnydzwon.save.v1')"))
    check('foreign Lampiarz key untouched', pg.evaluate("localStorage.getItem('lampiarz.profile.v1')") == '{"keep":true}')

    # walk to Halszka with the keyboard and talk to her
    x0 = state(pg)['x']
    pg.keyboard.down('a'); time.sleep(1.4); pg.keyboard.up('a'); time.sleep(0.2)
    check('keyboard movement moves the player', state(pg)['x'] < x0 - 100)
    pg.evaluate("(() => { const w=__pd.world; const h=w.interactables.find(i=>i.data==='h'); w.player.body.x=h.x+10; })()"); time.sleep(0.3)
    pg.keyboard.press('e')
    check('E opens the Halszka dialogue', wait_screen(pg, 'halszka'))
    pg.screenshot(path=f'{out}/pd-02-halszka.png')
    pg.get_by_role('button', name='Odejdź').click(); time.sleep(0.3)

    # Tab opens character sheet, tabs switch
    pg.keyboard.press('Tab'); time.sleep(0.3)
    check('Tab opens the character sheet', 'inventory' in screens(pg))
    pg.get_by_role('button', name='Kronika', exact=True).click(); time.sleep(0.2)
    check('chronicle tab shows 5 pages', pg.get_by_text('karta nieodnaleziona').count() == 5)
    pg.keyboard.press('Escape'); time.sleep(0.2)

    # map table -> expedition (first one includes the tutorial)
    pg.evaluate("(() => { const w=__pd.world; const t=w.interactables.find(i=>i.data==='t'); w.player.body.x=t.x-10; })()"); time.sleep(0.3)
    pg.keyboard.press('e'); wait_screen(pg, 'map')
    check('locked locations are shown as locked', pg.get_by_role('button', name='Wyrusz').count() == 1)
    pg.get_by_role('button', name='Wyrusz').click(); time.sleep(2.2)
    s = state(pg)
    check('expedition to Rynek started', s['location'] == 'rynek' and s['enemies'] > 5, json.dumps(s))
    tutorial = pg.evaluate("__pd.world.level.rooms.map(r=>r.id).filter(i=>i.startsWith('nauka')).length")
    check('first expedition contains the tutorial rooms', tutorial == 3)
    pg.evaluate("(() => { const w=__pd.world; const h=w.interactables.find(i=>i.kind==='hint'); w.player.body.x=h.x; })()"); time.sleep(0.4)
    check('tutorial stone shows a hint', bool(pg.evaluate('__pd.world.hint')))
    pg.screenshot(path=f'{out}/pd-03-tutorial.png')

    # shrine: rest + save
    pg.evaluate("(() => { const w=__pd.world; const s=w.interactables.find(i=>i.kind==='shrine'); w.player.body.x=s.x-9; w.enemies=w.enemies.filter(e=>Math.abs(e.cx-s.x)>500); })()"); time.sleep(0.3)
    pg.keyboard.press('e')
    check('shrine menu opens', wait_screen(pg, 'shrine'))
    ex = pg.evaluate("JSON.parse(localStorage.getItem('popielnydzwon.save.v1')).expedition")
    check('resting saves the respawn point', ex and ex['shrine'] is not None, json.dumps(ex)[:120])
    pg.get_by_role('button', name='Ruszaj dalej').click(); time.sleep(0.3)

    # real combat with keyboard: kill a Wyrwany
    pg.evaluate("__pd.near('wyrwany'); __pd.god()"); time.sleep(0.2)
    z0 = state(pg)['zuzel']
    kills0 = pg.evaluate('__pd.world.run.kills')
    for _ in range(30):
        pg.keyboard.down('d'); time.sleep(0.05); pg.keyboard.up('d')
        pg.keyboard.press('j'); time.sleep(0.25)
        if pg.evaluate('__pd.world.run.kills') > kills0:
            break
    check('enemy killed with J attacks', pg.evaluate('__pd.world.run.kills') > kills0)
    check('kill grants żużel', state(pg)['zuzel'] > z0)
    pg.screenshot(path=f'{out}/pd-04-combat.png')
    pg.evaluate('__pd.god(false)')

    # pause
    pg.keyboard.press('Escape'); time.sleep(0.3)
    check('Esc pauses', 'pause' in screens(pg))
    t_before = pg.evaluate('__pd.world.time'); time.sleep(0.5)
    check('simulation frozen while paused', pg.evaluate('__pd.world.time') == t_before)
    pg.keyboard.press('Escape'); time.sleep(0.3)

    # death -> ash -> respawn -> recover
    pg.evaluate("__pd.game.save.zuzel = 321; __pd.kill()")
    check('death screen appears', wait_screen(pg, 'death', 6))
    pg.screenshot(path=f'{out}/pd-05-death.png')
    pg.get_by_role('button', name='Powstań przy kapliczce').click(); time.sleep(1.8)
    lost = pg.evaluate("JSON.parse(localStorage.getItem('popielnydzwon.save.v1')).lost")
    check('carried ash stays in the world after death', lost and lost['amount'] == 321 and state(pg)['zuzel'] == 0, json.dumps(lost))
    pg.evaluate("(() => { const w=__pd.world, p=w.player, a=w.lostAsh; w.enemies=[]; p.body.x=a.x-9; p.body.y=a.y-p.body.h-1; })()"); time.sleep(0.4)
    check('ash recovered by walking over it', state(pg)['zuzel'] == 321)

    # reload -> continue keeps progress
    pg.reload(); pg.wait_for_selector('.pd-logo'); time.sleep(0.6)
    check('continue enabled after reload', not pg.get_by_role('button', name='Kontynuuj').is_disabled())
    pg.get_by_role('button', name='Kontynuuj').click(); time.sleep(2)
    s = state(pg)
    check('continue resumes the expedition at the shrine', s['location'] == 'rynek' and s['zuzel'] == 321, json.dumps(s))

    # boss: gate closes, intro, phases, reward, portal home
    pg.evaluate("__pd.god(); __pd.toBoss()")
    pg.keyboard.down('d'); time.sleep(1.0); pg.keyboard.up('d'); time.sleep(3.2)
    s = state(pg)
    check('boss fight starts at the arena', s['boss'] and s['boss']['id'] == 'kat', json.dumps(s['boss']))
    check('arena gate closed behind the player', pg.evaluate("__pd.world.level.tile(__pd.world.level.gateCol, 13) === 5"))
    pg.screenshot(path=f'{out}/pd-06-boss.png')
    pg.evaluate("__pd.hurtBoss(0.49)")
    t0 = time.time()
    while time.time() - t0 < 20 and state(pg)['boss']['phase'] < 2:
        pg.evaluate("(() => { const w=__pd.world, p=w.player, b=w.boss; p.body.x = b.cx - 60; p.face = 1; })()")
        pg.keyboard.press('j'); time.sleep(0.3)
    check('boss enters phase two', state(pg)['boss']['phase'] == 2)
    pg.evaluate("__pd.hurtBoss(0.02)")
    t0 = time.time()
    while time.time() - t0 < 30 and not (state(pg)['bosses'] or {}).get('kat'):
        pg.evaluate("(() => { const w=__pd.world, p=w.player, b=w.boss; if (b && !b.dead) { p.body.x = b.cx - 60; p.face = 1; } })()")
        pg.keyboard.press('j'); time.sleep(0.3)
    time.sleep(3)
    sv = json.loads(pg.evaluate("localStorage.getItem('popielnydzwon.save.v1')"))
    check('Kat defeated and saved', sv['bosses'].get('kat') is True)
    check('reward: Sierpy Żałobnicy unlocked', 'sierpy' in sv['weapons'])
    portal = pg.evaluate("__pd.world.interactables.some(i => i.kind === 'portal')")
    check('portal home appears', portal)
    pg.evaluate("(() => { const w=__pd.world; const t=w.interactables.find(i=>i.kind==='portal'); w.player.body.x=t.x-9; })()"); time.sleep(0.4)
    pg.keyboard.press('e')
    check('expedition summary after the portal', wait_screen(pg, 'summary', 6))
    pg.screenshot(path=f'{out}/pd-07-summary.png')
    pg.get_by_role('button', name='Do Krypty').click(); time.sleep(0.4)
    check('back in the hub', state(pg)['location'] == 'krypta')
    pg.evaluate("__pd.screens.mapScreen(__pd.game)"); time.sleep(0.3)
    check('Ogród unlocked on the map', pg.get_by_role('button', name='Wyrusz').count() == 2)
    pg.keyboard.press('Escape')

    # anvil and weapon switch
    pg.evaluate("__pd.give(2000, 5); __pd.screens.anvilScreen(__pd.game)"); time.sleep(0.3)
    pg.get_by_role('button', name='Ulepsz do +1').first.click(); time.sleep(0.2)
    pg.get_by_role('button', name='Weź do ręki').first.click(); time.sleep(0.2)
    sv = json.loads(pg.evaluate("localStorage.getItem('popielnydzwon.save.v1')"))
    check('anvil upgrade and weapon switch saved', sv['weapons']['klucz'] == 1 and sv['weapon'] == 'sierpy', json.dumps(sv['weapons']) + sv['weapon'])
    pg.keyboard.press('Escape')

    # corrupted save is handled
    pg.evaluate("localStorage.setItem('popielnydzwon.save.v1', '{broken')")
    pg.reload(); pg.wait_for_selector('.pd-logo'); time.sleep(0.6)
    check('corrupted save -> warning on title', pg.locator('.pd-warning').count() >= 1 and 'uszkodzony' in pg.locator('.pd-warning').first.inner_text())
    check('corrupted save backed up', pg.evaluate("!!localStorage.getItem('popielnydzwon.save.v1.corrupt')"))
    check('continue disabled after corruption', pg.get_by_role('button', name='Kontynuuj').is_disabled())
    pg.screenshot(path=f'{out}/pd-08-corrupt.png')

    # new game over an existing save asks for confirmation
    pg.get_by_role('button', name='Nowa gra').click(); time.sleep(0.3)
    pg.get_by_role('button', name='Obudź się').click(); time.sleep(1.5)
    pg.evaluate("__pd.game.toTitle()"); time.sleep(0.5)
    pg.get_by_role('button', name='Nowa gra').click(); time.sleep(0.3)
    check('new game over a save asks for confirmation', 'confirm' in screens(pg))
    pg.get_by_role('button', name='Anuluj').click()
    ctx.close()
    b.close()

print(f"\n{sum(ok for _, ok in results)}/{len(results)} checks passed")
print('ERRORS:', json.dumps(errors, ensure_ascii=False, indent=1) if errors else 'none')
sys.exit(0 if all(ok for _, ok in results) and not errors else 1)
