"""Optional real-browser acceptance and screenshots. NOT RUN in the cloud delivery environment.
Install test tooling outside the project: pip install playwright; python -m playwright install chromium
Build and serve dist with a static server, then run this script with --url.
"""
import argparse,base64,json,pathlib
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:4173')
parser.add_argument('--output',default='browser-acceptance-results')
parser.add_argument('--browser-executable')
args=parser.parse_args();out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True)
SIZES=[(390,844),(360,800),(430,932),(405,810),(1280,720),(1920,1080),(844,390)]
results=[];errors=[]
def record(name,fn):
 try: fn();results.append({'name':name,'status':'PASS'})
 except Exception as e: results.append({'name':name,'status':'FAIL','error':str(e)})
def eq(a,b):
 if a!=b: raise AssertionError(f'{a!r} != {b!r}')
with sync_playwright() as pw:
 options={'headless':True}
 if args.browser_executable: options['executable_path']=args.browser_executable
 browser=pw.chromium.launch(**options);context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page()
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(args.url+'/?debug=1&seed=741');page.wait_for_function('!!window.__gemcard')
 def api(code): return page.evaluate('window.__gemcard.'+code)
 def run(): return api('runSnapshot()')
 def shot(name): page.screenshot(path=str(out/(name+'.png')),full_page=True)
 def settle(): page.wait_for_timeout(1900)
 def prepare_break(hp=1,fight=1):
  api(f'debugJumpFight({fight})');api('dealCards([1])');api(f'setMonsterHp({hp})');api('play(0)')
 def screenshot_matrix():
  for w,h in SIZES:
   page.set_viewport_size({'width':w,'height':h});prefix=f'{w}x{h}'
   api('goHome()');settle();shot(prefix+'-home')
   api('startAdventure()');settle();shot(prefix+'-battle')
   prepare_break(100);page.wait_for_timeout(800);shot(prefix+'-broken')
   api('end()');settle();eq(run()['phase'],'loot');eq(len(run()['loot']),3);shot(prefix+'-loot-3')
   prepare_break(1);api('end()');settle();eq(len(run()['loot']),4);shot(prefix+'-loot-4')
   prepare_break(1,3);api('end()');page.get_by_text('背包变大',exact=True).wait_for();shot(prefix+'-elite-reward');page.wait_for_timeout(1500)
   prepare_break(1,6);api('end()');settle();page.locator('.result-panel').wait_for();shot(prefix+'-victory')
   api('startAdventure()');api('setHearts(1)')
   for _ in range(3): api('end()');page.wait_for_timeout(1900)
   eq(run()['phase'],'defeat');page.locator('.result-panel').wait_for();shot(prefix+'-defeat')
   api('practice()');settle();shot(prefix+'-practice')
 record('Seven sizes × nine requested screens (63 real screenshots)',screenshot_matrix)
 def refresh_checks():
  api('startAdventure()');api('dealCards([1,"lens"])');api('play(0)');before=run();page.reload();page.wait_for_function('!!window.__gemcard');eq(run(),before)
  api('undo()');before=run();page.reload();page.wait_for_function('!!window.__gemcard');eq(run(),before)
  api('end()');before=run();page.reload();page.wait_for_function('!!window.__gemcard');eq(run(),before)
  prepare_break();api('end()');settle();before=run();page.reload();page.wait_for_function('!!window.__gemcard');eq(run(),before)
  page.keyboard.press('1');eq(run()['phase'],'loot');page.keyboard.press('Enter');page.wait_for_timeout(700);before=run();page.reload();page.wait_for_function('!!window.__gemcard');eq(run(),before)
 record('Play/undo/end/loot/choice refresh preservation',refresh_checks)
 def keyboard_and_repeated_loot():
  prepare_break();api('end()');settle();before=len(run()['cards']);page.locator('[data-loot-index="0"]').click();eq(run()['phase'],'loot');page.locator('[data-loot-index="0"]').dblclick();page.wait_for_timeout(800);eq(run()['fight'],2);eq(len(run()['cards']),before+1)
 record('Two-step loot and repeated clicks grant exactly one card',keyboard_and_repeated_loot)
 def normal_page():
  page.goto(args.url);page.wait_for_selector('#stage');eq(page.evaluate('typeof window.__gemcard'),'undefined');eq(page.locator('[data-debug-case]').count(),0)
 record('No debug API on the normal page',normal_page)
 def performance_trace():
  page.goto(args.url+'/?debug=1&seed=741');page.wait_for_function('!!window.__gemcard');page.set_viewport_size({'width':390,'height':844})
  api('startAdventure()');api('dealCards([1,3,2,6,4,5,"hammer","hammer"])');api('setMonsterHp(1000)');settle()
  cdp=context.new_cdp_session(page);cdp.send('Emulation.setCPUThrottlingRate',{'rate':4});complete=[]
  cdp.on('Tracing.tracingComplete',lambda e:complete.append(e))
  cdp.send('Tracing.start',{'categories':'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.screenshot','transferMode':'ReturnAsStream'})
  page.evaluate('for(let i=0;i<8;i++)window.__gemcard.play(0)');page.wait_for_timeout(1000);api('end()');page.wait_for_timeout(4200);shot('cpu-4x-loot-scene')
  cdp.send('Tracing.end')
  for _ in range(50):
   if complete: break
   page.wait_for_timeout(100)
  if not complete: raise RuntimeError('No tracingComplete event')
  stream=complete[0]['stream'];data=bytearray()
  while True:
   chunk=cdp.send('IO.read',{'handle':stream});data.extend(base64.b64decode(chunk['data']) if chunk.get('base64Encoded') else chunk['data'].encode())
   if chunk.get('eof'): break
  cdp.send('IO.close',{'handle':stream});cdp.send('Emulation.setCPUThrottlingRate',{'rate':1});(out/'chrome-cpu-4x-trace.json').write_bytes(data)
 record('CPU ×4 Chrome trace: rapid eight cards → break → loot',performance_trace)
 results.append({'name':'Browser console page errors','status':'FAIL' if errors else 'PASS','errors':errors})
 (out/'browser-results.json').write_text(json.dumps({'results':results,'note':'CPU trace must be opened in Chrome DevTools for visual FPS review. A scene screenshot is not an FPS screenshot. Real Android/iPhone and app-switch/lock recovery remain manual.'},ensure_ascii=False,indent=2))
 browser.close()
if any(r['status']=='FAIL' for r in results): raise SystemExit(1)
