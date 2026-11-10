"""Create one delivery bundle with a directly runnable root and source project."""
from pathlib import Path
import zipfile,json,hashlib
ROOT=Path(__file__).resolve().parents[2]
OUTPUT=ROOT.parent/'delivery'
OUTPUT.mkdir(exist_ok=True)
RUNTIME=OUTPUT/'gemcard-demo-runtime.zip'
BUNDLE=OUTPUT/'gemcard-demo-full-20261109.zip'
def addtree(z,base,prefix,exclude=()):
 for p in sorted(base.rglob('*')):
  if not p.is_file() or any(part in exclude for part in p.relative_to(base).parts): continue
  z.write(p, str(Path(prefix)/p.relative_to(base)))
assert (ROOT/'dist/index.html').is_file(), 'Run npm run build first'
with zipfile.ZipFile(RUNTIME,'w',zipfile.ZIP_DEFLATED) as z:
 addtree(z,ROOT/'dist','gemcard-demo')
with zipfile.ZipFile(BUNDLE,'w',zipfile.ZIP_DEFLATED) as z:
 addtree(z,ROOT/'dist','gemcard-demo')
 addtree(z,ROOT,'gemcard-demo/project',exclude=('node_modules','dist','.git','.DS_Store','__pycache__'))
 z.write(RUNTIME,'gemcard-demo/gemcard-demo-runtime.zip')
 for name in ['HANDOFF.md','04-验收清单.md']:
  if (ROOT/name).exists(): z.write(ROOT/name,'gemcard-demo/'+name)
 z.writestr('gemcard-demo/打开方式.txt','直接试玩：用静态服务器打开本目录 index.html。\n开发源码：进入 project 目录，npm ci，然后 npm run dev。\n单独上传 TapTap 的运行包：gemcard-demo-runtime.zip，内部最外层为 gemcard-demo/，直接包含 index.html。\n验收限制请先阅读 HANDOFF.md 与 04-验收清单.md。\n')
for p in [RUNTIME,BUNDLE]:
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  assert 'gemcard-demo/index.html' in z.namelist()
  assert all(name.startswith('gemcard-demo/') for name in z.namelist())
 print(json.dumps({'path':str(p),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()},ensure_ascii=False))
