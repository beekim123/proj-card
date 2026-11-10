"""Optional local browser acceptance. NOT executed in the delivery environment.
Install separately: python -m pip install playwright && python -m playwright install chromium
Start built app: npm run build && npm run preview -- --port 4173
Run: python verification/browser/browser_smoke.py --url http://127.0.0.1:4173
"""
import argparse, json, pathlib
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:4173')
parser.add_argument('--output',default='local-browser-results')
parser.add_argument('--browser-executable')
args=parser.parse_args()
output=pathlib.Path(args.output);output.mkdir(parents=True,exist_ok=True)
results=[]

def record(name,fn):
    try:
        fn();results.append({'name':name,'status':'PASS'})
    except Exception as error:
        results.append({'name':name,'status':'FAIL','error':str(error)})

def snapshot(page): return page.evaluate('window.__gemcard.snapshot()')
def stable(state): return {k:state[k] for k in ('turn','total','row','hand','xp')}
def wait_ready(page): page.wait_for_function('!!window.__gemcard')
def settle(page): page.wait_for_timeout(1050)
def assert_equal(a,b):
    if a!=b: raise AssertionError(f'{a!r} != {b!r}')

def drag_mouse(page):
    card=page.locator('.hand-card').last.bounding_box();stage=page.locator('#stage').bounding_box()
    x=card['x']+card['width']/2;y=card['y']+card['height']/2
    target=(stage['x']+stage['width']/2,stage['y']+stage['height']*.49)
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(*target,steps=12)
    page.locator('.row-preview').wait_for()
    page.mouse.up()

with sync_playwright() as pw:
    options={'headless':True}
    if args.browser_executable: options['executable_path']=args.browser_executable
    browser=pw.chromium.launch(**options)
    context=browser.new_context(viewport={'width':390,'height':844})
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(args.url+'/?debug=1&layout=portrait');wait_ready(page)
    def viewport_checks():
        for w,h in [(390,844),(360,800),(430,932)]:
            page.set_viewport_size({'width':w,'height':h})
            box=page.locator('#stage').bounding_box()
            assert box['x']>=-.5 and box['y']>=-.5 and box['x']+box['width']<=w+.5 and box['y']+box['height']<=h+.5
            assert_equal(page.locator('#stage').get_attribute('data-layout'),'portrait')
            page.screenshot(path=str(output/f'portrait-{w}x{h}.png'),full_page=True)
    record('Three portrait viewport stage bounds/screenshots',viewport_checks)
    for case,expected in [(9,209000),(10,267100),(11,865000),(13,1553000)]:
        def test_case(case=case,expected=expected):
            page.evaluate('(n)=>window.__gemcard.deal(n)',case)
            count=len(snapshot(page)['hand'])
            for _ in range(count): page.evaluate('window.__gemcard.play(0)')
            settle(page)
            state=snapshot(page)
            assert_equal(state['turnDmg'],expected)
            assert_equal(int(page.locator('.turn-damage').get_attribute('data-value')),expected)
            assert_equal(len(state['row']),count)
            assert_equal(sum(c['rainbow']>0 for c in state['row']),1)
            page.screenshot(path=str(output/f'case-{case}.png'),full_page=True)
        record(f'UI case {case}, rapid play and rainbow once',test_case)
    def mouse_undo_keyboard():
        page.evaluate('window.__gemcard.deal(9)');before=snapshot(page)
        drag_mouse(page);assert_equal(len(snapshot(page)['row']),1)
        page.keyboard.press('z');assert_equal(snapshot(page),before)
        drag_mouse(page);page.keyboard.press('Space');assert_equal(snapshot(page)['turn'],2)
        assert_equal(page.locator('[data-action="undo"]').is_disabled(),True)
    record('Mouse drag / Z exact undo / Space finish turn',mouse_undo_keyboard)
    def dialogs_and_settings():
        page.locator('[data-action="rules"]').click();page.get_by_role('dialog',name='规则',exact=True).wait_for()
        page.keyboard.press('Escape');assert_equal(page.get_by_role('dialog').count(),0)
        page.locator('[data-gem="red"]').click();page.get_by_role('dialog').wait_for();page.keyboard.press('Escape')
        page.locator('[data-action="deck"]').click();assert '弃牌堆' in page.get_by_role('dialog').inner_text();page.keyboard.press('Escape')
        page.locator('[data-action="settings"]').click()
        page.locator('.setting-row').filter(has_text='手牌').get_by_role('button',name='8',exact=True).click()
        page.keyboard.press('Escape');assert_equal(snapshot(page)['opts']['hand'],8)
        page.reload();wait_ready(page);assert_equal(len(snapshot(page)['hand']),8)
        assert_equal(snapshot(page)['turn'],1)
    record('Four dialog types, dismiss, settings persist only',dialogs_and_settings)
    def layout_switch():
        page.goto(args.url+'/?debug=1');wait_ready(page)
        page.evaluate('window.__gemcard.deal(9)');page.evaluate('window.__gemcard.play(0)');before=stable(snapshot(page))
        page.set_viewport_size({'width':1280,'height':720});assert_equal(page.locator('#stage').get_attribute('data-layout'),'landscape')
        assert_equal(stable(snapshot(page)),before);settle(page)
        page.screenshot(path=str(output/'landscape-1280x720.png'),full_page=True)
        page.locator('[data-action="settings"]').click()
        page.locator('.setting-row').filter(has_text='布局').get_by_role('button',name='竖屏',exact=True).click()
        assert_equal(page.locator('#stage').get_attribute('data-layout'),'portrait')
        page.keyboard.press('Escape');assert_equal(stable(snapshot(page)),before)
    record('Automatic resize + layout setting preserves round',layout_switch)
    def art_gallery():
        page.goto(args.url+'/?page=art');page.locator('.art-item').first.wait_for()
        assert_equal(page.locator('.art-item').count(),34)
        assert_equal(page.locator('.art-composed-cards .gem-card').count(),24)
        page.get_by_role('button',name='切换浅色底',exact=True).click()
        assert_equal(page.locator('.art-inspector').get_attribute('data-theme'),'light')
        page.locator('.art-composed-cards select').select_option('3')
        page.get_by_role('button',name='同时播放两个实例',exact=True).click()
        ids=page.locator('svg [id]').evaluate_all('(els)=>els.map(e=>e.id)')
        assert_equal(len(ids),len(set(ids)))
        page.screenshot(path=str(output/'art-gallery.png'),full_page=True)
    record('Art gallery 34 assets / 24 cards / variants / IDs / theme',art_gallery)
    def touch_emulation():
        touch=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        tp=touch.new_page();tp.goto(args.url+'/?debug=1&layout=portrait');wait_ready(tp)
        tp.evaluate('window.__gemcard.deal(9)')
        card=tp.locator('.hand-card').last.bounding_box();stage=tp.locator('#stage').bounding_box()
        x=card['x']+card['width']/2;y=card['y']+card['height']/2
        session=touch.new_cdp_session(tp)
        session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
        session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':stage['x']+stage['width']/2,'y':stage['y']+stage['height']*.49}]})
        tp.locator('.row-preview').wait_for()
        session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        assert_equal(len(snapshot(tp)['row']),1)
        tp.screenshot(path=str(output/'touch-emulated.png'),full_page=True);touch.close()
    record('Chromium touch emulation drag (not real-device proof)',touch_emulation)
    record('No runtime JavaScript exceptions',lambda:assert_equal(errors,[]))
    browser.close()
report={'executedBy':'Local tester running browser_smoke.py','results':results,'notCovered':['Real iPhone Safari','Real Android Chrome/performance','TapTap upload','dist/art file replacement (manual separate test)','Exact visual fidelity and animation timing review']}
(output/'browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(1 if any(r['status']=='FAIL' for r in results) else 0)
