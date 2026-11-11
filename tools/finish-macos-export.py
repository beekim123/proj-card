#!/usr/bin/env python3
import pathlib,zipfile,shutil,subprocess,plistlib,sys
root=pathlib.Path(__file__).resolve().parent.parent
directory=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'exports/macos'
archive=directory/'新卡牌.zip'
with zipfile.ZipFile(archive) as bundle:bundle.extractall(directory)
apps=list(directory.glob('*.app'))
assert len(apps)==1
app=apps[0]
for path in (app/'Contents/MacOS').iterdir():
 if path.is_file():path.chmod(path.stat().st_mode|0o111)
probe=root/'artifacts/tools/display-probe'
assert probe.is_file(),'Run tools/run.sh once to compile the native display probe.'
shutil.copy2(probe,app/'Contents/MacOS/display-probe')
shutil.copy2(probe,app/'Contents/MacOS/GemcardLauncher')
info_path=app/'Contents/Info.plist'
with info_path.open('rb') as source: info=plistlib.load(source)
info['GemcardEngineExecutable']=info['CFBundleExecutable']
info['CFBundleExecutable']='GemcardLauncher'
with info_path.open('wb') as destination: plistlib.dump(info,destination)
subprocess.run(['/usr/bin/codesign','--force','--deep','--sign','-',str(app)],check=True)
updated=archive.with_suffix('.new.zip')
subprocess.run(['/usr/bin/ditto','-c','-k','--sequesterRsrc','--keepParent',str(app),str(updated)],check=True)
updated.replace(archive)
print(app)
