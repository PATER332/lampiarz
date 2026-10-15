"""End-to-end test of NIGHT SHIFT: 03:17 in headless Chromium (Playwright).

Requires a built site served locally (node build.mjs && node tools/serve.mjs) and
Playwright for Python. Usage:

    python3 games/night-shift/tests/e2e.py [base_url] [screenshot_dir]

The game runs with ?debug, which exposes window.__ns: the simulation is frozen
and advanced with deterministic ticks, and the player is placed next to objects
with __ns.approach(). Everything else (terminals, keypads, the power panel,
cameras, menus, saving) goes through the real DOM UI and real key presses.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4321'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
URL = BASE + '/g/night-shift/?debug'
CHROMIUM = os.environ.get('CHROMIUM', '/opt/pw-browsers/chromium')

results = []
errors = []


def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{info}]' if info else ''), flush=True)


def shot(pg, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        pg.screenshot(path=os.path.join(SHOTS, name + '.png'))


def ev(pg, js):
    return pg.evaluate(js)


def tick(pg, sec, **c):
    pg.evaluate(f'__ns.tick({sec}, {json.dumps(c)})')


def calm(pg):
    """Keep Przestój away so that the scripted run stays deterministic."""
    pg.evaluate("__ns.sim.enemy.set('hidden'); __ns.sim.enemy.hiddenFor = 1e9; __ns.sim.enemy.x = -100; __ns.sim.enemy.z = -100")


def use(pg, iid):
    ok = pg.evaluate(f'__ns.approach({json.dumps(iid)})')
    if not ok:
        print('  could not approach', iid, pg.evaluate('JSON.stringify(__ns.focus())'))
    pg.evaluate('__ns.interact()')
    return ok


def modal(pg):
    return pg.evaluate('__ns.modal')


def click(pg, data_id):
    pg.click(f'.ns-layer [data-id="{data_id}"], .ns-cctv [data-id="{data_id}"]')


def boot(pg, fresh=True):
    pg.goto(URL)
    pg.wait_for_selector('[data-id=enter]', timeout=90000)
    check('no audio before the first click', ev(pg, '__ns.audioState()') == 'none')
    pg.click('[data-id=enter]')
    pg.wait_for_selector('.ns-menu', timeout=10000)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
    ctx = browser.new_context(viewport={'width': 800, 'height': 450})
    ctx.add_init_script("if (!localStorage.getItem('nightshift.settings.v1')) localStorage.setItem('nightshift.settings.v1', JSON.stringify({quality:'low', renderScale:0.5}))")
    pg = ctx.new_page()
    pg.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))

    # ------------------------------------------------------------ boot & menu
    boot(pg)
    check('audio context created only after the click', ev(pg, '__ns.audioState()') in ('running', 'suspended'), ev(pg, '__ns.audioState()'))
    check('menu: no Continue without a save', pg.query_selector('[data-id=continue]') is None)
    check('menu: back-to-EVGAMES link targets the top window', pg.get_attribute('[data-id=evgames]', 'target') == '_top')
    shot(pg, '01_menu')

    # options really change and persist settings
    pg.click('[data-id=options]')
    pg.fill('input[data-setting=music]', '0.3')
    pg.dispatch_event('input[data-setting=music]', 'input')
    pg.click('[data-setting=quality] button:has-text("Średnia")')
    pg.click('[data-setting=invertY]')
    st = json.loads(ev(pg, "localStorage.getItem('nightshift.settings.v1')"))
    check('options: music volume saved', abs(st['music'] - 0.3) < 1e-6, str(st['music']))
    check('options: quality applied to renderer', ev(pg, '__ns.lights().quality') == 'medium' and st['quality'] == 'medium')
    check('options: invert Y saved', st['invertY'] is True)
    pg.click('[data-setting=quality] button:has-text("Niska")')
    pg.click('[data-setting=invertY]')
    pg.click('[data-id=back]')
    pg.click('[data-id=controls]')
    check('controls screen lists keys', 'Shift' in pg.inner_text('.ns-layer'))
    pg.click('[data-id=back]')

    # ------------------------------------------------------------ new game
    pg.click('[data-id=new]')
    pg.wait_for_timeout(300)
    ev(pg, '__ns.freeze(true); __ns.noFade()')
    check('new game starts in play mode', ev(pg, '__ns.mode') == 'play')
    check('new game writes a save', ev(pg, "!!localStorage.getItem('nightshift.save.v1')"))
    calm(pg)

    # movement & collisions: walk into the corridor's north wall, then into a bench
    ev(pg, '__ns.teleport(30, 22, 0, 0)')  # facing -Z
    tick(pg, 4, fwd=1)
    zz = ev(pg, '__ns.sim.player.z')
    check('collision: player stops at the wall', 20.25 < zz < 20.4, f'z={zz:.3f}')
    ev(pg, '__ns.teleport(7, 30.5, Math.PI/2, 0)')  # facing -X towards a bench
    tick(pg, 4, fwd=1)
    x = ev(pg, '__ns.sim.player.x')
    check('collision: furniture blocks the player', 5 < x < 5.6, f'x={x:.3f}')
    ev(pg, '__ns.teleport(9, 35.5, 0, 0)')
    tick(pg, 1, fwd=1)
    z = ev(pg, '__ns.sim.player.z')
    check('movement: W walks forward (-Z at yaw 0)', 32.5 < z < 34, f'z={z:.2f}')
    tick(pg, 1.2, fwd=1, sprint=True)
    check('sprint drains stamina', ev(pg, '__ns.sim.stamina') < 0.9)

    # locked door
    use(pg, 'door:rm')
    check('monitoring door locked before login', ev(pg, '__ns.sim.state.doors.rm.open') is False)

    # reception terminal → login
    use(pg, 'prop:term_reception')
    check('terminal opens', modal(pg) == 'terminal')
    shot(pg, '02_terminal')
    click(pg, 'login')
    check('login advances to mission 2 (cameras)', ev(pg, '__ns.sim.state.mission') == 1)
    pg.keyboard.press('Escape')
    check('Esc closes the terminal', modal(pg) is None)

    # evacuation plan → map
    use(pg, 'prop:board_reception')
    check('evacuation plan shows the map', modal(pg) == 'map')
    pg.keyboard.press('Escape')

    # documents
    use(pg, 'door:rm')
    tick(pg, 1)
    check('monitoring door opens after login', ev(pg, '__ns.sim.doorAnim.rm') > 0.9)
    use(pg, 'pick:p_d02')
    check('document opens a reader', modal(pg) == 'doc')
    shot(pg, '03_document')
    pg.keyboard.press('KeyE')
    check('document recorded', 'd02' in ev(pg, '__ns.sim.state.docs'))

    # CCTV: check all six cameras
    use(pg, 'prop:cctv')
    check('CCTV console opens', modal(pg) == 'cctv')
    for i in range(6):
        tick(pg, 1.4)
        if i < 5:
            pg.keyboard.press('KeyD')
    seen = ev(pg, '__ns.sim.state.camerasSeen.length')
    check('all six cameras checked', seen == 6, f'seen={seen}')
    shot(pg, '04_cctv')
    pg.keyboard.press('KeyQ')
    check('service door released from CCTV', ev(pg, "__ns.sim.has('serviceUnlocked')"))
    pg.keyboard.press('KeyE')
    tick(pg, 4)
    check('power outage after the camera round (mission 3)', ev(pg, '__ns.sim.state.mission') == 2 and ev(pg, '__ns.sim.state.power.main') is False)
    calm(pg)

    # tablet
    pg.keyboard.press('Tab')
    check('Tab opens the tablet', modal(pg) == 'tablet')
    pg.click('[data-id=tab-mapa]')
    check('tablet map renders', pg.query_selector('.ns-layer canvas.ns-map') is not None)
    pg.click('[data-id=tab-dokumenty]')
    check('tablet lists found documents', 'Kartka przyklejona' in pg.inner_text('.ns-layer'))
    shot(pg, '05_tablet')
    pg.keyboard.press('Tab')
    check('Tab closes the tablet', modal(pg) is None)

    # flashlight & battery
    ev(pg, '__ns.sim.toggleFlashlight()')
    b0 = ev(pg, '__ns.sim.state.battery')
    tick(pg, 10)
    check('flashlight drains the battery', ev(pg, '__ns.sim.state.battery') < b0)
    use(pg, 'pick:p_bat1')
    check('battery picked up', ev(pg, '__ns.sim.batteries') == 1)

    # technical room → mission 4
    ev(pg, '__ns.teleport(30, 33, 0, 0)')
    tick(pg, 0.5)
    check('reaching the technical room starts the fuse mission', ev(pg, '__ns.sim.state.mission') == 3)

    # fuse A in the lab cabinet
    use(pg, 'door:lc')
    tick(pg, 1.5)
    calm(pg)
    use(pg, 'prop:cab_lab')
    tick(pg, 0.3)
    use(pg, 'pick:p_fuseA')
    check('fuse A taken from the lab cabinet', 'fuseA' in ev(pg, '__ns.sim.state.inventory'))
    use(pg, 'pick:p_d04')
    pg.keyboard.press('Escape')
    calm(pg)

    # archive keypad: wrong code, then the right one
    use(pg, 'door:ac')
    check('archive door asks for a code', modal(pg) == 'keypad')
    for k in '1234':
        pg.keyboard.press(f'Digit{k}')
    pg.keyboard.press('Enter')
    check('wrong code is rejected', 'BŁĄD' in pg.inner_text('.ns-display') and ev(pg, '__ns.sim.state.doors.ac.open') is False)
    for k in '1411':
        pg.keyboard.press(f'Digit{k}')
    shot(pg, '06_keypad')
    pg.keyboard.press('Enter')
    check('correct code 1411 opens the archive', ev(pg, '__ns.sim.state.doors.ac.open') is True and modal(pg) is None)
    tick(pg, 1.5)
    use(pg, 'prop:drawer_archive')
    tick(pg, 0.3)
    use(pg, 'pick:p_fuseB')
    use(pg, 'pick:p_card3')
    check('fuse B and the level 3 card taken', 'fuseB' in ev(pg, '__ns.sim.state.inventory') and ev(pg, "__ns.sim.hasItem('card3')"))

    # power panel
    use(pg, 'prop:panel')
    check('power panel opens', modal(pg) == 'panel')
    click(pg, 'fuses')
    click(pg, 'main')
    tick(pg, 0.2)
    check('main power restored (mission 6)', ev(pg, '__ns.sim.state.power.main') and ev(pg, '__ns.sim.state.mission') == 5)
    click(pg, 'c-evac')  # 3 units: total 2 + 3 = 5
    click(pg, 'c-sector_c')  # +2 = 7
    check('power budget: evac + sector C fit into 7', ev(pg, '__ns.sim.used') == 7)
    click(pg, 'c-transmitter')
    check('power budget: over-capacity circuit refused', not ev(pg, "__ns.sim.powered('transmitter')"))
    shot(pg, '07_panel')
    click(pg, 'c-evac')
    pg.keyboard.press('Escape')
    calm(pg)

    # Sector C
    use(pg, 'door:kc')
    tick(pg, 1.5)
    check('card + power open Sector C', ev(pg, '__ns.sim.state.doors.kc.open'))
    ev(pg, '__ns.teleport(62, 22, -Math.PI/2, 0)')
    tick(pg, 0.5)
    check('entering Sector C starts mission 7', ev(pg, '__ns.sim.state.mission') == 6)
    calm(pg)
    use(pg, 'door:kk')
    tick(pg, 1.5)
    use(pg, 'prop:term_chamber')
    check('chamber terminal opens', modal(pg) == 'chamber')
    click(pg, 'read')
    tick(pg, 1)
    check('reading the archive reveals the truth (mission 8)', ev(pg, '__ns.sim.state.mission') == 7 and ev(pg, "__ns.sim.has('truth')"))
    shot(pg, '08_chamber')
    pg.keyboard.press('Escape')
    calm(pg)
    ev(pg, '__ns.sim.enemy.state="hidden"')

    # Room 0 behind the archive shelf
    use(pg, 'door:as')
    check('secret shelf asks for a code', modal(pg) == 'keypad')
    for k in '0317':
        pg.keyboard.press(f'Digit{k}')
    pg.keyboard.press('Enter')
    tick(pg, 3)
    check('code 0317 slides the shelf open', ev(pg, '__ns.sim.doorAnim["as"]') > 0.9)
    use(pg, 'pick:p_key')
    use(pg, 'pick:p_tape')
    check('key and tape taken from Room 0', ev(pg, "__ns.sim.hasItem('key') && __ns.sim.hasItem('tape')"))
    use(pg, 'pick:p_d11')
    pg.keyboard.press('Escape')
    calm(pg)

    # save in pause and reload → continue
    ev(pg, '__ns.teleport(41, 13, 0, 0)')
    tick(pg, 0.2)
    pg.wait_for_timeout(450)  # the game ignores a second Esc within 350 ms of closing a window
    pg.keyboard.press('Escape')
    check('Esc opens pause', modal(pg) == 'pause')
    click(pg, 'save')
    saved = json.loads(ev(pg, "localStorage.getItem('nightshift.save.v1')"))
    check('pause → save writes the state', saved['mission'] == 7 and 'key' in saved['inventory'])
    pg.reload()
    pg.wait_for_selector('[data-id=enter]', timeout=90000)
    pg.click('[data-id=enter]')
    pg.wait_for_selector('[data-id=continue]')
    check('Continue offered after reload', True)
    pg.click('[data-id=continue]')
    pg.wait_for_timeout(200)
    ev(pg, '__ns.freeze(true); __ns.noFade()')
    calm(pg)
    check('Continue restores mission, items and position', ev(pg, '__ns.sim.state.mission') == 7 and ev(pg, "__ns.sim.hasItem('key')") and abs(ev(pg, '__ns.sim.player.x') - 41) < 0.01)

    # ending 1: Cisza (turn the continuity key in the chamber)
    use(pg, 'prop:term_chamber')
    click(pg, 'stop')
    calm(pg)
    ev(pg, '__ns.teleport(70, 21, 0, 0)')
    tick(pg, 26)
    check('continuity key → ending "Cisza"', ev(pg, '__ns.sim.ended') == 'cisza')
    pg.wait_for_selector('.ns-ending', timeout=10000)
    check('ending screen shows title and stats', 'cisza' in pg.inner_text('.ns-ending').lower() and 'dokumenty' in pg.inner_text('.ns-ending'))
    shot(pg, '09_ending_cisza')

    # back to the decision → ending 2: Następna zmiana (run the test)
    click(pg, 'decision')
    pg.wait_for_timeout(200)
    ev(pg, '__ns.freeze(true); __ns.noFade()')
    calm(pg)
    use(pg, 'prop:term_chamber')
    click(pg, 'test')
    click(pg, 'test-yes')
    check('running the test → ending "Następna zmiana"', ev(pg, '__ns.sim.ended') == 'test')
    pg.wait_for_selector('.ns-ending', timeout=10000)

    # ending 3: Sygnał (transmit the tape from the radio console)
    click(pg, 'decision')
    pg.wait_for_timeout(200)
    ev(pg, '__ns.freeze(true); __ns.noFade()')
    calm(pg)
    use(pg, 'prop:panel')
    click(pg, 'c-sector_c')
    click(pg, 'c-transmitter')
    pg.keyboard.press('Escape')
    use(pg, 'prop:radio')
    check('radio console opens', modal(pg) == 'radio')
    click(pg, 'log')
    check('radio log is a readable document (d09)', modal(pg) == 'doc')
    pg.keyboard.press('Escape')
    click(pg, 'transmit')
    calm(pg)
    ev(pg, '__ns.teleport(9, 21, 0, 0)')
    tick(pg, 46)
    check('transmission → ending "Sygnał"', ev(pg, '__ns.sim.ended') == 'sygnal')
    pg.wait_for_selector('.ns-ending', timeout=10000)

    # ending 4: Koniec zmiany (evacuation lift)
    click(pg, 'decision')
    pg.wait_for_timeout(200)
    ev(pg, '__ns.freeze(true); __ns.noFade()')
    calm(pg)
    use(pg, 'prop:switch_emergency')
    check('emergency switch unlocks the evacuation zone', ev(pg, "__ns.sim.has('emergencyUnlocked')"))
    use(pg, 'prop:panel')
    click(pg, 'c-sector_c')
    click(pg, 'c-evac')
    pg.keyboard.press('Escape')
    use(pg, 'door:pe')
    tick(pg, 1.5)
    calm(pg)
    use(pg, 'prop:lift')
    check('lift called', ev(pg, "__ns.sim.final && __ns.sim.final.kind") == 'lift')
    calm(pg)
    tick(pg, 41)
    calm(pg)
    use(pg, 'prop:lift')
    check('boarding the lift → ending "Koniec zmiany"', ev(pg, '__ns.sim.ended') == 'ewakuacja')
    pg.wait_for_selector('.ns-ending', timeout=10000)
    meta = json.loads(ev(pg, "localStorage.getItem('nightshift.meta.v1')"))
    check('all four endings recorded in meta', sorted(meta['endings']) == ['cisza', 'ewakuacja', 'sygnal', 'test'], str(meta['endings']))
    shot(pg, '10_ending_lift')

    # death: Przestój catches the player → death screen → load
    click(pg, 'decision')
    pg.wait_for_timeout(200)
    ev(pg, '__ns.freeze(true); __ns.noFade()')
    ev(pg, '__ns.teleport(30, 22, Math.PI/2, 0); __ns.sim.enemy.hiddenFor = 0; __ns.sim.enemy.x = 36; __ns.sim.enemy.z = 22; __ns.sim.enemy.set("chase"); __ns.sim.enemy.lastKnown=[30,22]')
    for _ in range(40):
        tick(pg, 0.5)
        if ev(pg, '__ns.sim.dead'):
            break
    check('Przestój can catch the player', ev(pg, '__ns.sim.dead'))
    pg.wait_for_selector('.ns-death', timeout=10000)
    shot(pg, '11_death')
    click(pg, 'load')
    pg.wait_for_timeout(200)
    check('death → load last save', ev(pg, '__ns.mode') == 'play' and ev(pg, '__ns.sim.state.deaths') >= 1)

    # locker hiding
    ev(pg, '__ns.freeze(true); __ns.noFade()')
    calm(pg)
    use(pg, 'prop:locker_c1')
    check('hiding in a locker', ev(pg, '__ns.sim.player.hidden'))
    pg.keyboard.press('Escape')
    check('cannot save while hidden', pg.query_selector('[data-id=save][disabled]') is not None)
    pg.keyboard.press('Escape')
    ev(pg, '__ns.interact()')
    check('leaving the locker', not ev(pg, '__ns.sim.player.hidden'))

    # main menu → new game asks before overwriting
    pg.keyboard.press('Escape')
    click(pg, 'menu')
    pg.wait_for_selector('.ns-menu')
    pg.click('[data-id=new]')
    check('new game asks for confirmation when a save exists', pg.query_selector('[data-id=yes]') is not None)
    pg.click('[data-id=no]')

    # corrupted save
    ev(pg, "localStorage.setItem('nightshift.save.v1', '{broken json')")
    pg.reload()
    pg.wait_for_selector('[data-id=enter]', timeout=90000)
    pg.click('[data-id=enter]')
    pg.wait_for_selector('.ns-menu')
    txt = pg.inner_text('.ns-menu')
    check('corrupted save: warning shown, no Continue', 'uszkodzony' in txt and pg.query_selector('[data-id=continue]') is None)
    check('corrupted save moved aside', ev(pg, "localStorage.getItem('nightshift.save.v1.corrupt')") == '{broken json')
    shot(pg, '12_corrupt')

    browser.close()

bad = [r for r in results if not r[1]]
print(f'\n{len(results) - len(bad)}/{len(results)} checks passed')
if errors:
    print('Console errors:')
    for e in errors[:20]:
        print('  ', e)
sys.exit(1 if bad or errors else 0)
