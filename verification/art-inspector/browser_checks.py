"""Local Chromium acceptance of cards/art inspector. Requires a running Vite server."""
import argparse, json, pathlib
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:4197')
parser.add_argument('--output',default='verification/art-inspector')
args=parser.parse_args()
output=pathlib.Path(args.output);output.mkdir(parents=True,exist_ok=True)
results=[]
def equal(a,b):
    assert a==b, f'{a!r} != {b!r}'
def check(name,fn):
    try:
        fn();results.append({'name':name,'status':'PASS'})
    except Exception as e: results.append({'name':name,'status':'FAIL','error':str(e)})

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium')
    page=browser.new_page(viewport={'width':1280,'height':900});errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto(args.url+'/?page=art');page.wait_for_selector('.art-tool-cards');page.wait_for_timeout(200)
    def count_and_filters():
        equal(page.locator('[data-asset-id]').count(),63)
        equal(page.locator('.art-composed-cards .gem-card').count(),24)
        equal(page.locator('.art-tool-cards .gem-card').count(),10)
        page.locator('[data-action="filter-changed"]').click()
        equal(page.locator('[data-asset-id][data-status="已有"]:visible').count(),0)
        assert page.locator('[data-asset-id][data-status="新画"]:visible').count()>0
        page.locator('[data-action="filter-changed"]').click()
        equal(page.locator('[data-asset-id]:visible').count(),63)
    check('63 assets, 24 base cards, 10 tool cards and changed-art filter',count_and_filters)
    def idle_pair():
        item=page.locator('[data-asset-id="gem_red_rough"]')
        equal(item.locator('[data-variant="animated"]').count(),1)
        equal(item.locator('[data-variant="static"]').count(),1)
        urls=item.locator('img').evaluate_all('(els)=>els.map(e=>e.src)')
        assert urls[0]!=urls[1]
        texts=page.evaluate('async (urls)=>Promise.all(urls.map(u=>fetch(u).then(r=>r.text())))',urls)
        assert 'animation:none!important' not in texts[0]
        assert 'animation:none!important' in texts[1]
    check('Idle asset dynamic/static blobs differ and static CSS is present',idle_pair)
    def stay_and_slots():
        item=page.locator('[data-asset-id="mon_chest"]')
        item.locator('[data-event="daze"]').click()
        equal(item.locator('svg[data-art-id="mon_chest"]').first.get_attribute('data-anim'),'daze')
        item.locator('[data-event="hit"]').click()
        equal(item.locator('svg[data-art-id="mon_chest"]').first.get_attribute('data-anim'),'hit')
        page.wait_for_timeout(480)
        equal(item.locator('svg[data-art-id="mon_chest"]').first.get_attribute('data-anim'),'daze')
        item.locator('[data-event="daze"]').click()
        equal(item.locator('svg[data-art-id="mon_chest"]').first.get_attribute('data-anim'),None)
        clock=page.locator('[data-asset-id="mon_clock"]')
        equal(clock.locator('.art-cross-anchor').count(),5)
        equal(clock.locator('.art-cross-hitPoint').count(),5)
        for value in (1,2,3):
            clock.get_by_role('button',name=f'倒计时 {value}',exact=True).click()
            texts=clock.locator('[id$="-countdown_slot"] text').all_text_contents()
            equal(texts,[str(value)]*5)
    check('Stay daze/hit/daze toggle and all five clock slot previews',stay_and_slots)
    def tools():
        for tool in ('bag','lens','hammer','mirror','stone'):
            group=page.locator('.art-tool-pair[data-tool="'+tool+'"]')
            hand=group.locator('.gem-card').nth(0);row=group.locator('.gem-card').nth(1)
            equal(hand.get_attribute('data-static'),'false');equal(row.get_attribute('data-static'),'true')
            equal(row.locator('.card-tool-art').evaluate('(e)=>getComputedStyle(e).animationPlayState'),'paused')
            group.get_by_role('button').click()
            assert 'card-playing' in row.get_attribute('class')
            equal(row.locator('.card-tool-art').get_attribute('data-anim'),'play')
            equal(row.locator('.card-tool-art').evaluate('(e)=>getComputedStyle(e).animationPlayState'),'running')
            page.wait_for_timeout(650)
            assert 'card-playing' not in row.get_attribute('class')
            equal(row.locator('.card-tool-art').evaluate('(e)=>getComputedStyle(e).animationPlayState'),'paused')
        group=page.locator('.art-tool-pair[data-tool="mirror"]')
        equal(group.locator('[data-card-text="value"]').nth(0).text_content(),'?')
        equal(group.locator('[data-card-text="value"]').nth(1).text_content(),'200')
        colors=[]
        for mask,value in [('0','0'),('1','100'),('3','200'),('7','300')]:
            page.get_by_label('桌面镜子的宝石').select_option(mask)
            group=page.locator('.art-tool-pair[data-tool="mirror"]')
            equal(group.locator('[data-card-text="value"]').nth(1).text_content(),value)
            equal(group.locator('.gem-card').nth(1).get_attribute('data-mask'),mask)
            colors.append(group.locator('.card-tool-art').nth(1).evaluate('(e)=>getComputedStyle(e).color'))
        equal(len(set(colors)),4)
    check('Five tool cards play then pause, mirror resolves mask/value/tint',tools)
    def composed_and_theme():
        equal(page.locator('.art-hp').count(),3)
        equal(page.locator('.art-hp-fill').evaluate_all('(els)=>els.map(e=>e.style.width)'),['100%','37%','0%'])
        equal(page.locator('.art-hearts [data-art-id="ui_heart"]').count(),2)
        equal(page.locator('.art-hearts [data-art-id="ui_heart_empty"]').count(),1)
        equal(page.locator('.art-banner span').text_content(),'战利品')
        page.get_by_role('button',name='切换浅色底',exact=True).click()
        equal(page.locator('.art-inspector').get_attribute('data-theme'),'light')
        page.get_by_role('button',name='切换深色底',exact=True).click()
        ids=page.locator('svg [id]').evaluate_all('(els)=>els.map(e=>e.id)')
        equal(len(ids),len(set(ids)))
    check('Composed HP/hearts/banner, theme and unique inline SVG IDs',composed_and_theme)
    def viewport_shots():
        for width,height in [(1280,900),(390,844)]:
            page.set_viewport_size({'width':width,'height':height})
            page.evaluate('scrollTo(0,0)')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=str(output/f'inspector-{width}x{height}.png'))
            page.locator('.art-tool-cards').scroll_into_view_if_needed()
            page.screenshot(path=str(output/f'tools-{width}x{height}.png'))
        equal(errors,[])
    check('Mobile/desktop no page horizontal overflow, screenshots, no console errors',viewport_shots)
    browser.close()
(output/'browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
if any(r['status']=='FAIL' for r in results): raise SystemExit(1)
