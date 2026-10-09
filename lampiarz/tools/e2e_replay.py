"""Replays a Node-generated key sequence in the browser and compares the resulting state (determinism + UI wiring)."""
import json, sys, time
from playwright.sync_api import sync_playwright
base, rp, out = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.load(open(rp))
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(base)
    page.evaluate("localStorage.clear(); localStorage.setItem('lampiarz.profile.v1', JSON.stringify({version:1,achievements:{},stats:{runs:0,wins:0,deaths:0,kills:0,lamps:0,embers:0,turns:0,bestScore:0,deepest:0,winsByClass:{lampiarz:0,kowalka:0,alchemik:0},maxNightWon:0},nightUnlocked:1,seenEnemies:[],seenRelics:[],daily:{},history:[],settings:{master:0,music:0,sfx:0,muted:true,shake:false,reducedMotion:true,showGrid:false},tutorialSeen:true}))")
    page.reload(); page.wait_for_selector('.loading.done', state='attached'); time.sleep(0.5)
    page.get_by_role('button', name='Nowa noc').click(); time.sleep(0.3)
    page.fill('#seed', 'TST-2KAB')
    page.get_by_role('button', name='Zapal pierwszą latarnię').click(); time.sleep(0.6)
    for k in data['keys']:
        page.keyboard.press(k); time.sleep(0.07)
    time.sleep(0.8)
    st = page.evaluate("JSON.parse(localStorage.getItem('lampiarz.run.v1'))")
    got = {'phase': st['phase'], 'turn': st['district']['turn'], 'player': [st['player']['x'], st['player']['y'], st['player']['hp'], st['player']['oil'], st['player']['embers']], 'enemies': len(st['district']['enemies']), 'rng': st['rngState']}
    exp = {k: data[k] for k in got}
    print('browser:', got); print('node:   ', exp)
    print('MATCH' if got == exp else 'MISMATCH')
    page.screenshot(path=f'{out}/r-summary.png')
    page.get_by_role('button', name='Do warsztatu').click(); time.sleep(0.4)
    page.get_by_role('button', name='Ruszaj dalej').click(); time.sleep(0.4)
    page.locator('.path').first.click(); time.sleep(0.8)
    st = page.evaluate("JSON.parse(localStorage.getItem('lampiarz.run.v1'))")
    print('entered district', st['depth'], st['district']['name'], 'phase', st['phase'])
    page.screenshot(path=f'{out}/r-d2.png')
    b.close()
print('ERRORS:', errors or 'none')
