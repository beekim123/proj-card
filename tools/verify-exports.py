#!/usr/bin/env python3
"""Check actual output structures and local signatures, preserving evidence."""
import pathlib,struct,plistlib,subprocess,json,hashlib
root=pathlib.Path(__file__).resolve().parent.parent
app=root/'exports/macos/新卡牌.app'
windows=root/'exports/windows/新卡牌.exe'
archive=root/'exports/macos/新卡牌.zip'
assert app.is_dir() and windows.is_file() and archive.is_file()
with (app/'Contents/Info.plist').open('rb') as source:info=plistlib.load(source)
assert info['CFBundleExecutable']=='GemcardLauncher'
assert info.get('GemcardEngineExecutable')
for name in ['GemcardLauncher','display-probe',info['GemcardEngineExecutable']]:assert (app/'Contents/MacOS'/name).is_file()
subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict',str(app)],check=True)
with windows.open('rb') as source:
 assert source.read(2)==b'MZ'
 source.seek(0x3c);offset=struct.unpack('<I',source.read(4))[0]
 source.seek(offset);assert source.read(4)==b'PE\0\0'
 assert struct.unpack('<H',source.read(2))[0]==0x8664
 source.seek(-4,2);assert source.read(4)==b'GDPC','Embedded PCK footer missing'
packs=list((app/'Contents/Resources').rglob('*.pck'));assert len(packs)==1
with packs[0].open('rb') as source:assert source.read(4)==b'GDPC'
def sha(file):
 h=hashlib.sha256()
 with file.open('rb') as source:
  for chunk in iter(lambda:source.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
report={'macos_app':str(app),'macos_zip':{'path':str(archive),'bytes':archive.stat().st_size,'sha256':sha(archive)},'macos_signature_verified':True,'macos_launcher':info['CFBundleExecutable'],'macos_native_engine':info['GemcardEngineExecutable'],'macos_pack':str(packs[0]),'windows':{'path':str(windows),'architecture':'x86_64','embedded_pck_verified':True,'bytes':windows.stat().st_size,'sha256':sha(windows)},'windows_os_runtime_tested':False}
(root/'artifacts/export-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
