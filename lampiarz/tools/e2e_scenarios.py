"""Loads generated save states into the real game and screenshots each phase."""
import json, sys, time
from playwright.sync_api import sync_playwright
base, scen_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
scen = json.load(open(scen_path))
errors = []
PROFILE = json.dumps({"version":1,"achievements":{},"stats":{"runs":3,"wins":0,"deaths":3,"kills":20,"lamps":20,"embers":40,"turns":400,"bestScore":180,"deepest":3,"winsByClass":{"lampiarz":0,"kowalka":0,"alchemik":0},"maxNightWon":0},"nightUnlocked":1,"seenEnemies":["cien","smigacz","gasiciel","smolnik","lowca"],"seenRelics":["szeroki_knot","iskrownik","mapa"],"daily":{},"history":[],"settings":{"master":0.8,"music":0.55,"sfx":0.8,"muted":False,"shake":True,"reducedMotion":False,"showGrid":False},"tutorialSeen":True})

with sync_playwright() as p:
    b = p.chromium.launch()
    for vw, vh, tag in [(1440, 900, 'd'), (390, 844, 'm')]:
        ctx = b.new_context(viewport={'width': vw, 'height': vh}, device_scale_factor=1 if tag == 'd' else 2, has_touch=(tag == 'm'))
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
        page.goto(base)
        for name, run in scen.items():
            run = dict(run); vm = run.pop('__victoryMove', None)
            page.evaluate("([r, p]) => { localStorage.setItem('lampiarz.run.v1', r); localStorage.setItem('lampiarz.profile.v1', p); }", [json.dumps(run), PROFILE])
            page.reload(); page.wait_for_selector('.loading.done', state='attached', timeout=8000); time.sleep(0.7)
            page.get_by_role('button', name='Kontynuuj noc').click(); time.sleep(1.0)
            if name == 'victory':
                key = {(1,0):'ArrowRight',(-1,0):'ArrowLeft',(0,1):'ArrowDown',(0,-1):'ArrowUp'}[(vm['dx'], vm['dy'])]
                page.keyboard.press(key); time.sleep(2.6)
            if name == 'death':
                page.keyboard.press('Space'); time.sleep(2.2)
            if name == 'combat' and tag == 'd':
                # hover over an enemy for inspect panel
                page.mouse.move(vw/2 + 60, vh/2); time.sleep(0.3)
            page.screenshot(path=f'{out}/s-{tag}-{name}.png')
            if name == 'victory':
                st = page.evaluate("JSON.parse(localStorage.getItem('lampiarz.profile.v1'))")
                print('victory recorded:', st['stats']['wins'] == 1, 'nightUnlocked', st['nightUnlocked'], 'ach', sorted(st['achievements'].keys()))
                print('run save cleared:', page.evaluate("localStorage.getItem('lampiarz.run.v1')") is None)
            if name == 'death':
                st = page.evaluate("JSON.parse(localStorage.getItem('lampiarz.profile.v1'))")
                print('death recorded:', st['stats']['deaths'] == 4, 'history', len(st['history']))
                page.get_by_role('button', name='Kolejna noc').click(); time.sleep(0.5)
                print('after death -> setup screen:', page.locator('.setup').count() == 1)
        ctx.close()
    b.close()
print('ERRORS:', errors or 'none')
