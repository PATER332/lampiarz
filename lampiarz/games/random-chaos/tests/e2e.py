"""End-to-end test of RANDOM CHAOS in headless Chromium (Playwright).

Needs a built site served locally (node build.mjs && node tools/serve.mjs):

    python3 games/random-chaos/tests/e2e.py [base_url] [screenshot_dir]

The game runs with ?debug (window.__rc). Menus, the intro card, pause, results,
victory, rematch, settings and the tournament setup are driven through the real
UI with the real keyboard and mouse. Rounds are either played with real key
presses (movement, jumping, two players at once) or, to reach a result quickly,
by the built-in bots via __rc.bots().
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4321'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
URL = BASE + '/g/random-chaos/?debug'
CHROMIUM = os.environ.get('CHROMIUM', '/opt/pw-browsers/chromium')

results = []
errors = []


def ensure_play(pg):
    """Random arenas have hazards: if the round already ended by itself, start it again."""
    if pg.evaluate('__rc.mode') == 'play' and pg.evaluate('__rc.round.result === null'):
        return
    pg.evaluate('__rc.app.restartRound()')
    pg.wait_for_function('__rc.mode === "play" && __rc.round.phase === "play"', timeout=8000)


def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{info}]' if info else ''), flush=True)


def shot(pg, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        pg.wait_for_timeout(350)
        pg.screenshot(path=os.path.join(SHOTS, name + '.png'))


def ev(pg, js):
    return pg.evaluate(js)


def mode(pg):
    return ev(pg, '__rc.mode')


def wait_mode(pg, m, ms=8000):
    pg.wait_for_function(f'window.__rc && __rc.mode === {m!r}', timeout=ms)


def click(pg, data_id):
    pg.locator(f'.rc-ui [data-id="{data_id}"]').first.click()


def players(pg):
    return ev(pg, '__rc.round.players.map(p => ({x: p.cx, b: p.bottom, g: p.grounded, alive: p.alive}))')


def finish_round(pg):
    """let the bots play the current round to its result, then wait for the results screen"""
    ev(pg, '__rc.freeze(true)')
    res = ev(pg, '__rc.bots(240)')
    ev(pg, '__rc.freeze(false)')
    wait_mode(pg, 'results', 10000)
    return res


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROMIUM, args=['--autoplay-policy=user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 720})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)

    # ------------------------------------------------------------- start
    pg.goto(URL)
    pg.wait_for_selector('.rc-ui [data-id="play"]', timeout=30000)
    pg.wait_for_timeout(1200)
    check('menu: logo, GRAJ, TURNIEJ, MINIGRY, Gracze, Ustawienia, Sterowanie, powrót do EVGAMES',
          all(pg.locator(f'.rc-ui [data-id="{i}"]').count() for i in ['play', 'tournament', 'games', 'players', 'settings', 'controls', 'evgames']))
    check('the EVGAMES link points to the platform', pg.locator('[data-id="evgames"]').get_attribute('href') == '/')
    check('audio waits for a gesture (no AudioContext before)', ev(pg, '__rc.audioState()') == 'none', ev(pg, '__rc.audioState()'))
    check('a bot demo plays behind the menu', ev(pg, '__rc.app.demo !== null'))
    shot(pg, '01_menu')

    # ------------------------------------------------------------- quick match through the real UI
    click(pg, 'play')
    wait_mode(pg, 'intro')
    check('audio unlocked by the click', ev(pg, '__rc.audioState()') == 'running', ev(pg, '__rc.audioState()'))
    check('intro card shows name, rules and START', pg.locator('.rc-intro h2').count() == 1 and pg.locator('.rc-intro li').count() == 3)
    shot(pg, '02_intro')
    pg.keyboard.down('KeyW')
    pg.wait_for_timeout(120)
    pg.keyboard.down('ArrowUp')
    pg.wait_for_timeout(120)
    pg.keyboard.up('KeyW')
    pg.keyboard.up('ArrowUp')
    wait_mode(pg, 'play', 3000)
    check('both players pressing jump start the round', mode(pg) == 'play')
    check('countdown first', ev(pg, '__rc.round.phase') == 'countdown')
    pg.wait_for_timeout(400)
    shot(pg, '03_countdown')
    # keyboard checks below run on a calm arena (Coins: nobody can fall out and end
    # the round by accident); the random quick match itself was checked above
    ev(pg, "__rc.app.nextRound({ game: 'coins', mod: null })")
    ev(pg, '__rc.go()')
    wait_mode(pg, 'play', 3000)
    pg.wait_for_function('__rc.round.phase === "play"', timeout=6000)
    # put both on the ground first (some arenas have platforms above the spawn)
    pg.wait_for_function('__rc.round.players.every(p => p.grounded)', timeout=3000)
    before = players(pg)
    sy0 = ev(pg, 'window.scrollY')
    pg.keyboard.down('KeyD')
    pg.keyboard.down('ArrowLeft')
    pg.wait_for_timeout(250)
    pg.keyboard.down('KeyW')
    pg.keyboard.down('ArrowUp')
    pg.wait_for_timeout(180)
    mid = players(pg)
    pg.keyboard.up('KeyW')
    pg.keyboard.up('ArrowUp')
    pg.wait_for_timeout(200)
    pg.keyboard.up('KeyD')
    pg.keyboard.up('ArrowLeft')
    after = players(pg)
    check('P1 (D) moved right while P2 (←) moved left at the same time',
          (after[0]['x'] > before[0]['x'] + 30 and after[1]['x'] < before[1]['x'] - 30)
          # spawned close together: they walk into each other — both inputs still registered
          or (after[0]['x'] > before[0]['x'] + 8 and after[1]['x'] < before[1]['x'] - 8 and abs(after[0]['x'] - after[1]['x']) < 70),
          f"{before[0]['x']:.0f}->{after[0]['x']:.0f} / {before[1]['x']:.0f}->{after[1]['x']:.0f}")
    check('both jumped at the same time (W and ↑)', mid[0]['b'] < before[0]['b'] - 20 and mid[1]['b'] < before[1]['b'] - 20,
          f"{before[0]['b']-mid[0]['b']:.0f} / {before[1]['b']-mid[1]['b']:.0f} px")
    check('arrow keys do not scroll the page', ev(pg, 'window.scrollY') == sy0 == 0)
    shot(pg, '04_play')

    # a random arena/modifier may already have ended the round (somebody fell off): start it again
    if ev(pg, '__rc.round.result !== null'):
        ev(pg, '__rc.app.restartRound()')
    pg.wait_for_function('__rc.round.phase === "play"', timeout=6000)
    # stuck keys: hold D, lose focus -> released + auto pause
    for _attempt in range(3):
        pg.keyboard.down('KeyD')
        pg.wait_for_timeout(100)
        ev(pg, 'window.dispatchEvent(new Event("blur"))')
        pg.wait_for_timeout(100)
        if ev(pg, '__rc.round.result === null'):
            break
        # the random arena ended the round in that split second (someone fell off): try again
        pg.keyboard.up('KeyD')
        if mode(pg) == 'paused':
            pg.keyboard.press('Escape')
        ev(pg, '__rc.app.restartRound()')
        pg.wait_for_function('__rc.round.phase === "play"', timeout=6000)
    check('focus loss releases keys', ev(pg, '__rc.app.input.down.size') == 0)
    check('focus loss pauses the round', mode(pg) == 'paused')
    pg.keyboard.up('KeyD')
    shot(pg, '05_pause')
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(150)
    check('Esc resumes', mode(pg) == 'play')
    pg.wait_for_timeout(300)
    pads = ev(pg, '[__rc.app.input.pad(0), __rc.app.input.pad(1), __rc.round.inputs[0]]')
    check('no key stuck after resume (no input held for either player)', all(not any(pd.values()) for pd in pads), str(pads))

    # Esc pause, R restart: the round starts over, the match score is unchanged
    ensure_play(pg)
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(150)
    check('Esc pauses', mode(pg) == 'paused')
    t_before = ev(pg, '__rc.round.t')
    score_before = ev(pg, '[...__rc.match.score]')
    pg.keyboard.press('KeyR')
    pg.wait_for_timeout(150)
    check('R in the pause menu restarts the round', mode(pg) == 'play' and ev(pg, '__rc.round.phase') == 'countdown' and t_before > 1,
          f't before {t_before:.1f}')
    check('...without touching the match score', ev(pg, '[...__rc.match.score]') == score_before)
    pg.wait_for_function('__rc.round.phase === "play"', timeout=6000)
    pg.wait_for_timeout(500)
    ensure_play(pg)
    t_play = ev(pg, '__rc.round.t')
    pg.keyboard.press('KeyR')
    pg.wait_for_timeout(150)
    check('a stray R during play does NOT throw the round away', ev(pg, '__rc.round.phase') == 'play' and ev(pg, '__rc.round.t') >= t_play)

    # player 2 alternative keys (ghosting-safe): L moves right, I jumps
    ensure_play(pg)
    x0 = ev(pg, '__rc.round.players[1].x')
    pg.keyboard.down('KeyL')
    pg.wait_for_timeout(350)
    pg.keyboard.up('KeyL')
    check('player 2 moves with L (IJKL layout)', ev(pg, '__rc.round.players[1].x') > x0 + 20, f'dx {ev(pg, "__rc.round.players[1].x") - x0:.0f}')
    # a tap shorter than one frame (down+up in the same task) still makes a jump
    ensure_play(pg)
    pg.wait_for_function('__rc.round.players[0].grounded', timeout=4000)
    pg.evaluate("() => { const o = {code:'KeyW', key:'w', bubbles:true}; window.dispatchEvent(new KeyboardEvent('keydown', o)); window.dispatchEvent(new KeyboardEvent('keyup', o)); }")
    pg.wait_for_timeout(120)
    check('an ultra-short tap of W still jumps', not ev(pg, '__rc.round.players[0].grounded') or ev(pg, '__rc.round.players[0].vy') < 0)

    # unstick from the pause menu
    ensure_play(pg)
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(150)
    ev(pg, '(() => { const s = __rc.round.world.solids.filter(s => !s.oneway && s.active !== false && !s.path && s.w > 60).sort((a, b) => b.h - a.h)[0]; const p = __rc.round.players[0]; p.x = s.x + 10; p.y = s.y + 5; })()')
    click(pg, 'unstick')
    pg.wait_for_timeout(150)
    stuck = ev(pg, '(() => { const p = __rc.round.players[0]; return __rc.round.world.solids.some(s => !s.oneway && s.active !== false && p.x < s.x + s.w && p.x + p.w > s.x && p.y < s.y + s.h && p.bottom > s.y + 1); })()')
    check('"Odblokuj postacie" frees a character stuck inside a wall', not stuck and mode(pg) == 'play', f'stuck={stuck} mode={mode(pg)}')

    # finish the round, results, exactly one point
    res = finish_round(pg)
    sc = ev(pg, '[...__rc.match.score]')
    check('the round ends with a result and the results screen', res is not None and pg.locator('.rc-results').count() == 1, str(res))
    check('exactly one point awarded (or none for a draw)', sum(sc) == (1 if res['winner'] >= 0 else 0), str(sc))
    pg.wait_for_timeout(1500)
    check('no extra point while the arena keeps running behind the results', ev(pg, '[...__rc.match.score]') == sc)
    check('Esc does not pause after the round ended', (pg.keyboard.press('Escape'), pg.wait_for_timeout(100), mode(pg))[2] == 'results')
    shot(pg, '06_results')
    pg.keyboard.press('Enter')
    wait_mode(pg, 'intro')
    check('Enter: next round, a different minigame', ev(pg, '__rc.round.cfg.game') != ev(pg, '__rc.match.history[0].game'))

    # quit with confirmation from the pause menu
    pg.keyboard.press('Enter')
    wait_mode(pg, 'play')
    pg.wait_for_timeout(200)
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(150)
    click(pg, 'quit')
    pg.wait_for_timeout(150)
    check('quitting asks for confirmation', pg.locator('.rc-ui [data-id="yes"]').count() == 1)
    click(pg, 'no')
    pg.wait_for_timeout(100)
    check('"Anuluj" goes back to the pause menu', pg.locator('.rc-ui [data-id="resume"]').count() == 1)
    click(pg, 'quit')
    click(pg, 'yes')
    wait_mode(pg, 'menu')
    check('confirmed quit returns to the menu', mode(pg) == 'menu')

    # ------------------------------------------------------------- every minigame reaches a result
    for gid in ev(pg, '__rc.games'):
        ev(pg, f'__rc.play({gid!r})')
        wait_mode(pg, 'intro')
        shot(pg, f'10_intro_{gid}')
        ev(pg, '__rc.go()')
        ev(pg, '__rc.freeze(true)')
        ev(pg, '__rc.tick(3.4)')
        ev(pg, '__rc.bots(4)')
        ev(pg, '__rc.freeze(false)')
        pg.wait_for_timeout(200)
        shot(pg, f'11_play_{gid}')
        res = finish_round(pg)
        sc = ev(pg, '[...__rc.match.score]')
        check(f'{gid}: result + results screen, score consistent', res is not None and sum(sc) == (1 if res['winner'] >= 0 else 0),
              f"{res['reason'] if res else None} {sc}")

    # ------------------------------------------------------------- victory, rematch, menu
    ev(pg, "__rc.play('coins', null, 1)")
    wait_mode(pg, 'intro')
    ev(pg, '__rc.go()')
    ev(pg, '__rc.freeze(true)')
    ev(pg, '__rc.tick(3.4)')
    ev(pg, '(() => { const g = __rc.round.game; g.score = [9, 2]; __rc.round.t = __rc.round.limit; })()')
    ev(pg, '__rc.tick(0.02)')
    ev(pg, '__rc.freeze(false)')
    wait_mode(pg, 'results', 8000)
    check('target reached: match over', ev(pg, '__rc.match.over') and ev(pg, '__rc.match.winner') == 0)
    pg.keyboard.press('Enter')
    wait_mode(pg, 'victory')
    pg.wait_for_timeout(1200)
    check('victory screen with the winner and the round history',
          pg.locator('.rc-victory h1').inner_text() == ev(pg, '__rc.match.opts.names[0]') and pg.locator('.rc-history li').count() == 1)
    shot(pg, '20_victory')
    pg.keyboard.press('Enter')
    wait_mode(pg, 'intro')
    check('rematch: same options, score back to 0:0', ev(pg, '[...__rc.match.score]') == [0, 0] and ev(pg, '__rc.match.opts.target') == 1)
    ev(pg, '__rc.go()')
    ev(pg, '__rc.freeze(true)')
    ev(pg, '__rc.tick(3.4)')
    ev(pg, '(() => { const g = __rc.round.game; g.score = [1, 6]; __rc.round.t = __rc.round.limit; })()')
    ev(pg, '__rc.tick(0.02)')
    ev(pg, '__rc.freeze(false)')
    wait_mode(pg, 'results', 8000)
    pg.keyboard.press('Enter')
    wait_mode(pg, 'victory')
    click(pg, 'menu')
    wait_mode(pg, 'menu')
    check('victory -> main menu', mode(pg) == 'menu')

    # ------------------------------------------------------------- tournament setup: games and modifiers
    click(pg, 'tournament')
    pg.wait_for_selector('.rc-ui [data-id="start"]')
    shot(pg, '30_setup')
    click(pg, 'target-5')
    click(pg, 'modFreq-always')
    for g in ['race', 'lavaRush', 'dodge', 'knockout', 'king', 'colors']:
        click(pg, f'game-{g}')
    check('only two minigames left on', ev(pg, 'JSON.parse(localStorage.getItem("randomchaos.settings.v1")).games.length') == 2)
    for g in ['coins', 'lastStanding']:
        click(pg, f'game-{g}')
    check('the last minigame cannot be switched off', ev(pg, 'JSON.parse(localStorage.getItem("randomchaos.settings.v1")).games') == ['coins'] or
          ev(pg, 'JSON.parse(localStorage.getItem("randomchaos.settings.v1")).games') == ['lastStanding'])
    click(pg, 'game-lastStanding') if ev(pg, 'JSON.parse(localStorage.getItem("randomchaos.settings.v1")).games') == ['coins'] else click(pg, 'game-coins')
    # only "giant" allowed
    for m in ev(pg, 'JSON.parse(localStorage.getItem("randomchaos.settings.v1")).mods'):
        if m != 'giant':
            click(pg, f'mod-{m}')
    pg.keyboard.press('Enter')
    wait_mode(pg, 'intro')
    check('tournament: target 5, modifiers always, only the allowed one',
          ev(pg, '__rc.match.opts.target') == 5 and ev(pg, '__rc.match.current.mod') == 'giant' and pg.locator('.rc-modcard').count() == 1)
    check('tournament: only the enabled minigames', ev(pg, '__rc.round.cfg.game') in ('coins', 'lastStanding'))
    shot(pg, '31_intro_mod')
    pg.keyboard.press('Enter')
    wait_mode(pg, 'play')
    pg.wait_for_timeout(3600)
    check('the modifier is applied (giant players)', ev(pg, '__rc.round.players[0].h') > 60)
    shot(pg, '32_play_giant')
    pg.keyboard.press('Escape')
    click(pg, 'quit')
    click(pg, 'yes')
    wait_mode(pg, 'menu')
    click(pg, 'tournament')
    click(pg, 'modFreq-off')
    pg.keyboard.press('Enter')
    wait_mode(pg, 'intro')
    rounds_mods = [ev(pg, '__rc.match.current.mod')]
    check('modifiers off: no modifier', rounds_mods == [None] and pg.locator('.rc-modcard').count() == 0)
    pg.keyboard.press('Enter')
    wait_mode(pg, 'play')
    pg.keyboard.press('Escape')
    click(pg, 'quit')
    click(pg, 'yes')
    wait_mode(pg, 'menu')

    # ------------------------------------------------------------- settings, players, controls, persistence
    click(pg, 'settings')
    pg.wait_for_selector('[data-setting="music"]')
    pg.locator('[data-setting="music"]').fill('0.25')
    pg.locator('[data-setting="music"]').dispatch_event('input')
    shot(pg, '40_settings')
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(100)
    check('Esc goes back from the settings', pg.locator('.rc-ui [data-id="play"]').count() == 1)
    click(pg, 'players')
    pg.wait_for_selector('[data-setting="name0"]')
    pg.locator('[data-setting="name0"]').fill('Kuba')
    shot(pg, '41_players')
    pg.keyboard.press('Escape')
    click(pg, 'controls')
    pg.wait_for_timeout(150)
    pg.keyboard.down('KeyK')
    pg.keyboard.down('KeyA')
    pg.wait_for_timeout(120)
    check('controls tester lights up the keys the game sees', pg.locator('.rc-pad.p2 .rc-key.on').count() == 1 and pg.locator('.rc-pad.p1 .rc-key.on').count() == 1)
    shot(pg, '42_controls')
    pg.keyboard.up('KeyK')
    pg.keyboard.up('KeyA')
    pg.wait_for_timeout(80)
    check('tester lights go off on release', pg.locator('.rc-key.on').count() == 0)
    pg.keyboard.press('Escape')
    click(pg, 'games')
    pg.wait_for_timeout(150)
    shot(pg, '43_games')
    pg.keyboard.press('Escape')
    stats_before = ev(pg, 'localStorage.getItem("randomchaos.stats.v1")')
    pg.reload()
    pg.wait_for_selector('.rc-ui [data-id="play"]', timeout=30000)
    s = ev(pg, 'JSON.parse(localStorage.getItem("randomchaos.settings.v1"))')
    check('settings survive a reload (volume, name, points, modifiers, games)',
          abs(s['music'] - 0.25) < 0.01 and s['names'][0] == 'Kuba' and s['target'] == 5 and s['modFreq'] == 'off' and s['mods'] == ['giant'] and len(s['games']) == 2, str(s))
    check('statistics survive a reload', ev(pg, 'localStorage.getItem("randomchaos.stats.v1")') == stats_before and ev(pg, 'JSON.parse(localStorage.getItem("randomchaos.stats.v1")).rounds').__len__() == 2)
    st = ev(pg, 'JSON.parse(localStorage.getItem("randomchaos.stats.v1"))')
    check('statistics counted the rounds and matches played', sum(st['rounds']) + st['draws'] >= 10 and st['matches'] >= 2, str(st))
    click(pg, 'players')
    check('the new name is shown after reload', pg.locator('[data-setting="name0"]').input_value() == 'Kuba')
    pg.keyboard.press('Escape')
    # broken storage must not break the game
    ev(pg, 'localStorage.setItem("randomchaos.settings.v1", "{broken"); localStorage.setItem("randomchaos.stats.v1", "[1,2")')
    pg.reload()
    pg.wait_for_selector('.rc-ui [data-id="play"]', timeout=30000)
    check('corrupted saves fall back to defaults', pg.locator('.rc-ui [data-id="play"]').count() == 1)

    # ------------------------------------------------------------- small window
    pg.set_viewport_size({'width': 800, 'height': 500})
    pg.wait_for_timeout(500)
    check('scales to a small window without page scrollbars', ev(pg, 'document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight'))
    shot(pg, '50_small')

    real = [e for e in errors if 'favicon' not in e]
    check('no console errors or exceptions', not real, '; '.join(real[:5]))
    b.close()

failed = [r for r in results if not r[1]]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
sys.exit(1 if failed else 0)
