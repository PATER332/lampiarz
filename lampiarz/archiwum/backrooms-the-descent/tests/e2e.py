"""End-to-end test of BACKROOMS: THE DESCENT in headless Chromium (Playwright).

Needs a built site served locally (node build.mjs && node tools/serve.mjs):

    python3 games/backrooms-the-descent/tests/e2e.py [base_url] [screenshot_dir]

The game runs with ?debug (window.__bd): the simulation is frozen and advanced in
deterministic ticks and the player is placed next to objects with __bd.approach().
Everything else goes through the real UI: menus, the keypad, the generator panel,
the radio, the cameras, the journal, saving and loading. The five digits of the
code are deduced by this script from the journal observations alone, exactly as
a player would, and then typed into the keypad.
"""
import json
import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4321'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
URL = BASE + '/g/backrooms-the-descent/?debug'
CHROMIUM = os.environ.get('CHROMIUM', '/opt/pw-browsers/chromium')

results = []
errors = []


def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{info}]' if info else ''), flush=True)


def shot(pg, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        pg.wait_for_timeout(400)
        pg.screenshot(path=os.path.join(SHOTS, name + '.png'))


def ev(pg, js):
    return pg.evaluate(js)


def tick(pg, sec, **c):
    pg.evaluate(f'__bd.tick({sec}, {json.dumps(c)})')


def modal(pg):
    return pg.evaluate('__bd.modal')


def click(pg, data_id):
    pg.click(f'.bd-layer [data-id="{data_id}"], .bd-cctv [data-id="{data_id}"]')


def use(pg, iid):
    ok = pg.evaluate(f'__bd.approach({json.dumps(iid)})')
    if not ok:
        print('   could not approach', iid, pg.evaluate('JSON.stringify(__bd.focus())'))
    pg.evaluate('__bd.interact()')
    return ok


def calm(pg):
    pg.evaluate('__bd.calm()')


def obs_lines(pg):
    return pg.evaluate("__bd.sim.state.obs.map(id => id)")


def enter_game(pg, diff='normal'):
    pg.click('[data-id=new]')
    if pg.query_selector('.bd-layer [data-id=yes]'):
        pg.click('.bd-layer [data-id=yes]')
    pg.click(f'[data-id=diff-{diff}]')
    pg.wait_for_timeout(300)
    ev(pg, '__bd.freeze(true); __bd.noFade()')
    calm(pg)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
    ctx = browser.new_context(viewport={'width': 800, 'height': 450})
    ctx.add_init_script("if (!localStorage.getItem('backroomsthedescent.settings.v1')) localStorage.setItem('backroomsthedescent.settings.v1', JSON.stringify({quality:'low', renderScale:0.5, voice:false}))")
    pg = ctx.new_page()
    pg.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type == 'error' or 'WebGL' in m.text else None)
    pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))

    # ------------------------------------------------------------ boot, 18+ warning, menu
    pg.goto(URL)
    pg.wait_for_selector('[data-id=enter]', timeout=120000)
    check('18+ warning before anything else', '18+' in pg.inner_text('.bd-layer') and 'przemoc' in pg.inner_text('.bd-layer'))
    check('no audio before the first click', ev(pg, '__bd.audioState()') == 'none')
    shot(pg, '00_warning')
    pg.click('[data-id=enter]')
    pg.wait_for_selector('.bd-menu')
    check('audio starts after the click', ev(pg, '__bd.audioState()') in ('running', 'suspended'))
    check('menu: no Continue without a save', pg.query_selector('[data-id=continue]') is None)
    check('menu: back-to-EVGAMES link targets the top window', pg.get_attribute('.bd-menu [data-id=evgames]', 'target') == '_top')
    shot(pg, '01_menu')

    pg.click('[data-id=options]')
    pg.fill('input[data-setting=sfx]', '0.4')
    pg.dispatch_event('input[data-setting=sfx]', 'input')
    pg.click('[data-setting=gore]')
    pg.click('[data-setting=quality] button:has-text("Średnia")')
    st = json.loads(ev(pg, "localStorage.getItem('backroomsthedescent.settings.v1')"))
    check('options persist (sfx, gore, quality)', abs(st['sfx'] - 0.4) < 1e-6 and st['gore'] is False and st['quality'] == 'medium')
    check('quality reaches the renderer', ev(pg, '__bd.lights().quality') == 'medium')
    pg.click('[data-setting=gore]')
    pg.click('[data-setting=quality] button:has-text("Niska")')
    pg.click('[data-id=back]')

    # ------------------------------------------------------------ new game
    pg.click('[data-id=new]')
    check('difficulty selection with four modes', pg.query_selector_all('.bd-diff').__len__() == 4)
    shot(pg, '02_difficulty')
    pg.click('[data-id=diff-normal]')
    pg.wait_for_timeout(300)
    ev(pg, '__bd.freeze(true); __bd.noFade()')
    calm(pg)
    check('new game saves immediately', ev(pg, "!!localStorage.getItem('backroomsthedescent.save.v1')"))
    check('difficulty stored in the save', json.loads(ev(pg, "localStorage.getItem('backroomsthedescent.save.v1')"))['difficulty'] == 'normal')
    ev(pg, '__bd.teleport(4.2, 74.6, Math.PI/2, 0)')
    tick(pg, 3, fwd=1)
    x = ev(pg, '__bd.sim.player.x')
    check('collision with the closet wall', 2.29 <= x < 2.6, f'x={x:.2f}')

    use(pg, 'pick:p_d01')
    check('the first note opens', modal(pg) == 'doc')
    shot(pg, '03_note')
    pg.keyboard.press('Escape')
    use(pg, 'door:start')
    tick(pg, 1.2)
    check('closet door opens', ev(pg, '__bd.sim.doorAnim.start') > 0.9)

    # ------------------------------------------------------------ ○ the clocks
    use(pg, 'door:clock')
    tick(pg, 1.2)
    for i in range(5):
        use(pg, f'prop:clock{i}')
        if i == 0:
            check('a clock opens a close-up', modal(pg) == 'image')
            shot(pg, '04_clock')
        pg.keyboard.press('Escape')
    use(pg, 'pick:p_d02')
    pg.keyboard.press('Escape')

    # the armory door: order plate and a wrong code
    use(pg, 'prop:armory_keypad')
    check('keypad opens with the symbol order', modal(pg) == 'keypad' and len(pg.query_selector_all('.bd-order svg')) == 5)
    for k in '12345':
        pg.keyboard.press(f'Digit{k}')
    pg.keyboard.press('Enter')
    check('a wrong code is rejected and counted', ev(pg, '__bd.sim.state.codeTries') == (0 if ev(pg, '__bd.code()') == '12345' else 1))
    pg.keyboard.press('Escape')
    use(pg, 'wall:door')
    pg.keyboard.press('Escape')

    # ------------------------------------------------------------ the generator (mechanism)
    use(pg, 'door:mzdark')
    tick(pg, 1.2)
    calm(pg)
    use(pg, 'door:gen')
    tick(pg, 1.2)
    use(pg, 'pick:p_d05')
    pg.keyboard.press('Escape')
    use(pg, 'prop:genpanel')
    check('generator panel opens', modal(pg) == 'generator')
    click(pg, 'choke')
    check('wrong order floods the engine', ev(pg, '__bd.sim.state.gen.step') == 0 and 'ZALANY' in pg.inner_text('.bd-layer'))
    tick(pg, 5.5)
    click(pg, 'pump')
    click(pg, 'choke')
    click(pg, 'start')
    check('the right order starts the generator', ev(pg, '__bd.sim.state.gen.on') is True)
    shot(pg, '05_generator')
    pg.keyboard.press('Escape')
    calm(pg)

    # ------------------------------------------------------------ △ the radio (two stations, one lies)
    use(pg, 'door:radio')
    tick(pg, 1.2)
    use(pg, 'pick:p_d04')
    pg.keyboard.press('Escape')
    use(pg, 'prop:radio')
    check('radio opens', modal(pg) == 'radio')
    for f in ('3.17', '4.02'):
        pg.fill('[data-id=freq]', f)
        pg.dispatch_event('[data-id=freq]', 'input')
        click(pg, 'listen')
        pg.wait_for_timeout(5200)
    shot(pg, '06_radio')
    check('both stations heard and logged', 'radio_A' in obs_lines(pg) and 'radio_B' in obs_lines(pg))
    pg.keyboard.press('Escape')
    calm(pg)

    # ------------------------------------------------------------ □ camera 3 and ◉ UV paint
    use(pg, 'door:darkstore')
    tick(pg, 1.2)
    use(pg, 'door:cam')
    tick(pg, 1.2)
    use(pg, 'prop:console')
    check('camera console opens', modal(pg) == 'cctv')
    pg.keyboard.press('KeyD')
    pg.keyboard.press('KeyD')
    tick(pg, 2)
    check('camera 3 shows the cage (observation logged)', 'cam3' in obs_lines(pg))
    shot(pg, '07_cctv_cage')
    pg.keyboard.press('KeyE')
    use(pg, 'door:chem')
    tick(pg, 1.2)
    use(pg, 'prop:uvswitch')
    check('UV lamp on', ev(pg, '__bd.sim.state.uvOn') is True)
    use(pg, 'wall:uv')
    pg.keyboard.press('Escape')
    use(pg, 'wall:paint')
    pg.keyboard.press('Escape')
    check('UV writing and the painted lie observed', 'uv' in obs_lines(pg) and 'uvfake' in obs_lines(pg))
    ev(pg, '__bd.teleport(58, 31, Math.PI/2, 0)')
    shot(pg, '08_uv')
    calm(pg)

    # ------------------------------------------------------------ ✕ the roster in the red sector
    use(pg, 'door:power')
    tick(pg, 1.5)
    check('the power lock opens with the generator running', ev(pg, '__bd.sim.state.doors.power.open') is True)
    use(pg, 'door:camp')
    tick(pg, 1.2)
    calm(pg)
    use(pg, 'prop:roster')
    check('roster opens', modal(pg) == 'image')
    shot(pg, '09_roster')
    pg.keyboard.press('Escape')
    use(pg, 'pick:p_d08')
    pg.keyboard.press('Escape')

    # ------------------------------------------------------------ deduce the code from the journal, like a player
    pg.keyboard.press('Tab')
    check('Tab opens the journal', modal(pg) == 'journal')
    click(pg, 'tab-obserwacje')
    lines = pg.inner_text('.bd-obs')
    shot(pg, '10_journal')
    d = {}
    for ln in lines.split('\n'):
        m = re.search(r'TYKA\. Wskazuje (\d+):', ln)
        if m:
            d['circle'] = m.group(1)
        m = re.search(r'szum, trzy trzaski, potem głos.*Trójkąt\. (\d)', ln)
        if m:
            d['triangle'] = m.group(1)
        m = re.search(r'kwadrat i (\d) pionowych kresek', ln)
        if m:
            d['square'] = m.group(1)
        m = re.search(r'(\d) czarnych krzyżyków', ln)
        if m:
            d['cross'] = m.group(1)
        m = re.search(r'UV: oko i (\d) kropek', ln)
        if m:
            d['eye'] = m.group(1)
    check('all five digits deducible from the journal', len(d) == 5, json.dumps(d))
    order = ev(pg, '__bd.sim.puzzle.order')
    guess = ''.join(d.get(s, '?') for s in order)
    check('deduced code matches the lock', guess == ev(pg, '__bd.code()'), guess)
    click(pg, 'tab-znaki')
    for s in order:
        pg.fill(f'.bd-layer input[data-sym={s}]', d.get(s, ''))
    check('hypotheses written in the journal', ev(pg, '__bd.sim.state.hypotheses.circle') == d.get('circle'))
    pg.keyboard.press('Tab')

    # ------------------------------------------------------------ the armory
    use(pg, 'prop:armory_keypad')
    for k in guess:
        pg.keyboard.press(f'Digit{k}')
    pg.keyboard.press('Enter')
    tick(pg, 3)
    check('the code opens the armory door', ev(pg, '__bd.sim.state.doors.armory.open') is True and ev(pg, '__bd.sim.doorAnim.armory') > 0.6)
    tick(pg, 2)
    calm(pg)
    use(pg, 'pick:p_revolver')
    check('the revolver can be picked up', ev(pg, '__bd.sim.state.revolver') is True and ev(pg, '__bd.sim.state.loaded') == 6)
    use(pg, 'pick:p_liftcard')
    use(pg, 'pick:p_ammo1')
    use(pg, 'pick:p_d10')
    pg.keyboard.press('Escape')
    check('lift card and ammunition taken', ev(pg, '__bd.sim.state.liftcard') is True and ev(pg, '__bd.sim.state.inv.ammo') >= 6)
    ev(pg, '__bd.teleport(58, 52, 0, -0.1)')
    shot(pg, '11_armory')

    # ------------------------------------------------------------ combat
    ev(pg, "__bd.teleport(70, 59, 0, -0.3); const c=__bd.sim.monster('crawlerA'); c.active=true; c.x=70; c.z=55; c.set('patrol'); c.path=[]")
    shots = 0
    while ev(pg, "__bd.sim.monster('crawlerA').alive") and shots < 8:
        # (it may have bitten and gone for a vent between shots: put it back in the corridor)
        ev(pg, "const c=__bd.sim.monster('crawlerA'); if (c.alive && !['patrol','chase','attack','listen','notice','rest','investigate','search'].includes(c.state)) { c.set('patrol'); c.path=[]; c.active=true; } c.x=70; c.z=55; const p=__bd.sim.player; p.yaw=Math.atan2(-(c.x-p.x),-(c.z-p.z)); p.pitch=Math.atan2(0.45-__bd.sim.eye, Math.hypot(c.x-p.x,c.z-p.z))")
        tick(pg, 0.05, fire=True, aim=True)
        tick(pg, 0.6)
        shots += 1
    check('shooting kills a crawler', not ev(pg, "__bd.sim.monster('crawlerA').alive"), f'shots={shots}')
    fired = ev(pg, '__bd.sim.state.stats.shots')
    check('shots use ammunition', ev(pg, '__bd.sim.state.loaded') == 6 - fired and fired >= 2, f'fired={fired}')
    ev(pg, '__bd.freeze(false)')
    pg.wait_for_timeout(1200)
    shot(pg, '12_crawler_dead')
    ev(pg, '__bd.freeze(true)')
    pg.keyboard.press('KeyR')
    tick(pg, 2.6)
    check('reload refills the cylinder', ev(pg, '__bd.sim.state.loaded') == 6)
    calm(pg)

    # ------------------------------------------------------------ hiding
    use(pg, 'prop:locker_radio')
    check('hiding in a locker', ev(pg, "__bd.sim.player.hide && __bd.sim.player.hide.kind") == 'locker')
    tick(pg, 1)
    shot(pg, '13_locker')
    pg.keyboard.press('KeyE')
    check('leaving the locker', ev(pg, '__bd.sim.player.hide') is None)

    # ------------------------------------------------------------ save, reload, continue
    ev(pg, '__bd.teleport(58, 50, 0, 0)')
    tick(pg, 0.2)
    pg.wait_for_timeout(450)  # a second Esc within 350 ms of closing a window is ignored on purpose
    pg.keyboard.press('Escape')
    check('pause opens', modal(pg) == 'pause')
    click(pg, 'save')
    saved = json.loads(ev(pg, "localStorage.getItem('backroomsthedescent.save.v1')"))
    check('manual save written', saved['revolver'] is True and saved['hypotheses']['circle'] == d.get('circle'))
    pg.reload()
    pg.wait_for_selector('[data-id=enter]', timeout=120000)
    pg.click('[data-id=enter]')
    pg.wait_for_selector('[data-id=continue]')
    pg.click('[data-id=continue]')
    pg.wait_for_timeout(300)
    ev(pg, '__bd.freeze(true); __bd.noFade()')
    calm(pg)
    check('continue restores progress and position', ev(pg, '__bd.sim.state.doors.armory.unlocked') and abs(ev(pg, '__bd.sim.player.x') - 58) < 0.01 and ev(pg, '__bd.sim.state.gen.on'))
    check('the same code survives a reload', ev(pg, '__bd.code()') == guess)

    # ------------------------------------------------------------ the lift down
    use(pg, 'door:lift')
    tick(pg, 1.5)
    check('the lift card opens the freight lift', ev(pg, '__bd.sim.state.doors.lift.open') is True)
    calm(pg)
    use(pg, 'prop:liftpanel')
    tick(pg, 9)
    check('the lift takes you down to the Descent', ev(pg, '__bd.sim.state.area') == 'descent')
    calm(pg)
    ev(pg, '__bd.sim.fire("descentStalker")')
    shot(pg, '14_descent')
    for lv in ('lever_a', 'lever_b', 'lever_c'):
        use(pg, f'prop:{lv}')
        calm(pg)
    tick(pg, 4)
    calm(pg)
    check('three stabilizers open the anchor chamber', ev(pg, '__bd.sim.state.doors.anchor.open') is True)
    ev(pg, '__bd.teleport(97, 96, 0, 0)')
    pg.keyboard.press('Escape')
    click(pg, 'save')
    pg.keyboard.press('Escape')

    def terminal_choice(choice):
        use(pg, 'prop:anchor_terminal')
        click(pg, choice)
        click(pg, 'yes')
        calm(pg)

    # ending: Zejście
    terminal_choice('open')
    tick(pg, 3)
    ev(pg, '__bd.teleport(114.2, 97, -Math.PI/2, 0)')
    tick(pg, 0.3)
    check('opening the exit → ending "Zejście"', ev(pg, '__bd.sim.ended') == 'zejscie')
    pg.wait_for_selector('.bd-ending', timeout=10000)
    shot(pg, '15_ending')

    # ending: Przebudzenie
    click(pg, 'decision')
    pg.wait_for_timeout(300)
    ev(pg, '__bd.freeze(true); __bd.noFade()')
    calm(pg)
    terminal_choice('destroy')
    check('destroying the anchor starts the collapse', ev(pg, '__bd.sim.collapse !== null'))
    tick(pg, 3)
    calm(pg)
    ev(pg, '__bd.teleport(114.2, 97, -Math.PI/2, 0)')
    tick(pg, 0.3)
    check('escaping the collapse → ending "Przebudzenie"', ev(pg, '__bd.sim.ended') == 'przebudzenie')
    pg.wait_for_selector('.bd-ending', timeout=10000)

    # secret ending: Zwiad 4
    click(pg, 'decision')
    pg.wait_for_timeout(300)
    ev(pg, '__bd.freeze(true); __bd.noFade()')
    calm(pg)
    ev(pg, '__bd.sim.state.inv.tags = 5')
    terminal_choice('call')
    tick(pg, 21)
    calm(pg)
    ev(pg, '__bd.teleport(114.2, 97, -Math.PI/2, 0)')
    tick(pg, 0.3)
    check('five dog tags → secret ending "Zwiad 4"', ev(pg, '__bd.sim.ended') == 'zwiad')
    pg.wait_for_selector('.bd-ending', timeout=10000)
    meta = json.loads(ev(pg, "localStorage.getItem('backroomsthedescent.meta.v1')"))
    check('three endings recorded', sorted(meta['endings']) == ['przebudzenie', 'zejscie', 'zwiad'])

    # ------------------------------------------------------------ death
    click(pg, 'decision')
    pg.wait_for_timeout(300)
    ev(pg, '__bd.freeze(true); __bd.noFade()')
    ev(pg, "__bd.teleport(20, 86, -Math.PI/2, 0); const m=__bd.sim.monster('stalkerD'); m.active=true; m.x=26; m.z=86; m.set('patrol'); m.yaw=Math.PI/2; m.dormantFor=0")
    for _ in range(40):
        tick(pg, 0.5)
        if ev(pg, '__bd.sim.dead'):
            break
    check('the Stalker can kill the player', ev(pg, '__bd.sim.dead'))
    pg.wait_for_selector('.bd-death', timeout=10000)
    shot(pg, '16_death')
    click(pg, 'load')
    pg.wait_for_timeout(300)
    check('death → back to the last save', ev(pg, '__bd.mode') == 'play' and ev(pg, '__bd.sim.state.deaths') >= 1)

    # ------------------------------------------------------------ NO MERCY has no manual saving; overwrite asks first
    pg.keyboard.press('Escape')
    click(pg, 'menu')
    click(pg, 'yes')
    pg.wait_for_selector('.bd-menu')
    pg.click('[data-id=new]')
    check('new game over a save asks for confirmation', pg.query_selector('.bd-layer [data-id=yes]') is not None)
    pg.click('.bd-layer [data-id=yes]')
    pg.click('[data-id=diff-nomercy]')
    pg.wait_for_timeout(300)
    ev(pg, '__bd.freeze(true); __bd.noFade()')
    calm(pg)
    pg.keyboard.press('Escape')
    check('NO MERCY: manual save disabled', pg.query_selector('[data-id=save][disabled]') is not None and 'NO MERCY' in pg.inner_text('.bd-layer'))
    pg.keyboard.press('Escape')

    # ------------------------------------------------------------ corrupted save
    ev(pg, "localStorage.setItem('backroomsthedescent.save.v1', '{broken')")
    pg.reload()
    pg.wait_for_selector('[data-id=enter]', timeout=120000)
    pg.click('[data-id=enter]')
    pg.wait_for_selector('.bd-menu')
    check('corrupted save: warning, no Continue', 'uszkodzony' in pg.inner_text('.bd-menu') and pg.query_selector('[data-id=continue]') is None)
    check('corrupted save moved aside', ev(pg, "localStorage.getItem('backroomsthedescent.save.v1.corrupt')") == '{broken')

    browser.close()

bad = [r for r in results if not r[1]]
print(f'\n{len(results) - len(bad)}/{len(results)} checks passed')
if errors:
    print('Console errors / WebGL warnings:')
    for e in errors[:20]:
        print('  ', e)
sys.exit(1 if bad or errors else 0)
