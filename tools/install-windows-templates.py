#!/usr/bin/env python3
"""Verify the official archive and install missing Windows files, never overwrite."""
import hashlib,json,pathlib,zipfile
root=pathlib.Path(__file__).resolve().parent.parent
archive=pathlib.Path('/tmp/gemcard-Godot_v4.7.2-stable_export_templates.tpz')
name='Godot_v4.7.2-stable_export_templates.tpz'
release=json.loads((root/'artifacts/godot-release.json').read_text())
assert release['tag_name']=='4.7.2-stable' and not release['prerelease']
asset=next(a for a in release['assets'] if a['name']==name)
assert asset['browser_download_url'].startswith('https://github.com/godotengine/godot/releases/download/4.7.2-stable/')
lines=(root/'artifacts/Godot-4.7.2-SHA512-SUMS.txt').read_text().splitlines()
expected=next(line.split()[0] for line in lines if line.split()[-1].lstrip('*')==name)
sha512=hashlib.sha512();sha256=hashlib.sha256()
with archive.open('rb') as source:
 for chunk in iter(lambda:source.read(1024*1024),b''):sha512.update(chunk);sha256.update(chunk)
assert sha512.hexdigest()==expected,'Official SHA512 checksum mismatch'
assert asset.get('digest') in (None,'sha256:'+sha256.hexdigest()),'Official Release digest mismatch'
target=pathlib.Path.home()/'Library/Application Support/Godot/export_templates/4.7.2.stable'
assert target.is_dir()
existing={p.name:{'size':p.stat().st_size,'mtime_ns':p.stat().st_mtime_ns} for p in target.iterdir() if p.is_file()}
installed=[];skipped=[]
with zipfile.ZipFile(archive) as bundle:
 for entry in bundle.infolist():
  file=pathlib.PurePosixPath(entry.filename)
  if len(file.parts)!=2 or file.parts[0]!='templates' or not file.name.startswith('windows_') or not file.name.endswith('.exe'):continue
  output=target/file.name
  if output.exists():skipped.append(file.name);continue
  with bundle.open(entry) as source,output.open('xb') as destination:
   for chunk in iter(lambda:source.read(1024*1024),b''):destination.write(chunk)
  installed.append(file.name)
for name,metadata in existing.items():
 p=target/name
 assert p.stat().st_size==metadata['size'] and p.stat().st_mtime_ns==metadata['mtime_ns'],'Existing template changed: '+name
report={'version':'4.7.2-stable','source':asset['browser_download_url'],'sha512':sha512.hexdigest(),'sha256':sha256.hexdigest(),'official_checksum_verified':True,'target':str(target),'installed':installed,'skipped':skipped,'existing_unchanged':existing}
(root/'artifacts/windows-template-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
