"""End-to-end smoke test in a real Chromium (Playwright). Usage: python3 tools/e2e.py <base_url> <outdir>"""
import json, sys, time
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4173'
out = sys.argv[2] if len(sys.argv) > 2 else 'shots'
errors = []

def shot(page, name):
    page.screenshot(path=f'{out}/{name}.png')

with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(base)
    page.wait_for_selector('.loading.done', state='attached', timeout=8000)
    time.sleep(2.2)
    shot(page, '01-menu')
    page.get_by_role('button', name='Nowa noc').click()
    time.sleep(0.4)
    shot(page, '02-setup')
    page.get_by_role('button', name='Zapal pierwszą latarnię').click()
    time.sleep(1.0)
    shot(page, '03-tutorial')
    page.get_by_role('button', name='Do roboty').click()
    time.sleep(0.4)
    # play: walk around with keys
    keys = ['ArrowRight'] * 4 + ['ArrowDown'] * 3 + ['ArrowRight'] * 4 + ['ArrowUp'] * 3 + ['KeyQ'] + ['ArrowRight'] * 3 + ['Space'] * 2
    for k in keys:
        page.keyboard.press(k)
        time.sleep(0.12)
    time.sleep(0.6)
    shot(page, '04-play')
    state = page.evaluate("JSON.parse(localStorage.getItem('lampiarz.run.v1'))")
    print('turn after keys:', state['district']['turn'], 'player', state['player']['x'], state['player']['y'], 'oil', state['player']['oil'])
    # hover inspect
    page.mouse.move(720, 450)
    time.sleep(0.3)
    # pause
    page.keyboard.press('Escape')
    time.sleep(0.4)
    shot(page, '05-pause')
    page.keyboard.press('Escape')
    time.sleep(0.3)
    # reload keeps progress
    page.reload()
    page.wait_for_selector('.loading.done', state='attached', timeout=8000)
    time.sleep(1.0)
    cont = page.get_by_role('button', name='Kontynuuj noc')
    print('continue visible after reload:', cont.count() == 1)
    cont.click()
    time.sleep(0.8)
    state2 = page.evaluate("JSON.parse(localStorage.getItem('lampiarz.run.v1'))")
    print('turn after reload:', state2['district']['turn'], 'same:', state2['district']['turn'] == state['district']['turn'])
    # book & settings from menu
    page.keyboard.press('Escape'); time.sleep(0.3)
    page.get_by_role('button', name='Zapisz i wyjdź do menu').click(); time.sleep(0.6)
    page.get_by_role('button', name='Księga lampiarza').click(); time.sleep(0.4)
    shot(page, '06-book')
    page.get_by_role('tab', name='Bestiariusz').click(); time.sleep(0.4)
    shot(page, '07-bestiary')
    page.keyboard.press('Escape'); time.sleep(0.3)
    page.get_by_role('button', name='Ustawienia').click(); time.sleep(0.3)
    shot(page, '08-settings')
    page.keyboard.press('Escape'); time.sleep(0.3)
    page.get_by_role('button', name='Jak grać').click(); time.sleep(0.3)
    shot(page, '09-howto')
    page.keyboard.press('Escape'); time.sleep(0.3)
    # corrupted save handling
    page.evaluate("localStorage.setItem('lampiarz.run.v1', '{not json')")
    page.reload(); page.wait_for_selector('.loading.done', state='attached', timeout=8000); time.sleep(1.0)
    toast = page.locator('.toast').count()
    print('corrupt save -> toast shown:', toast > 0, '| continue hidden:', page.get_by_role('button', name='Kontynuuj noc').count() == 0)
    shot(page, '10-corrupt')
    page.evaluate("localStorage.setItem('lampiarz.profile.v1', '[1,2,3]')")
    page.reload(); page.wait_for_selector('.loading.done', state='attached', timeout=8000); time.sleep(0.8)
    print('corrupt profile -> app alive:', page.locator('.menu').count() == 1)
    ctx.close()

    # mobile
    m = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    mp = m.new_page()
    mp.on('pageerror', lambda e: errors.append(f'pageerror(mobile): {e}'))
    mp.goto(base); mp.wait_for_selector('.loading.done', state='attached', timeout=8000); time.sleep(1.5)
    shot(mp, '11-mobile-menu')
    mp.get_by_role('button', name='Nowa noc').tap(); time.sleep(0.4)
    shot(mp, '12-mobile-setup')
    mp.get_by_role('button', name='Zapal pierwszą latarnię').tap(); time.sleep(0.8)
    mp.get_by_role('button', name='Do roboty').tap(); time.sleep(0.3)
    for _ in range(4):
        mp.get_by_role('button', name='Prawo').dispatch_event('pointerdown'); time.sleep(0.15)
    time.sleep(0.5)
    shot(mp, '13-mobile-game')
    m.close()
    b.close()

print('ERRORS:', json.dumps(errors, ensure_ascii=False, indent=1) if errors else 'none')
