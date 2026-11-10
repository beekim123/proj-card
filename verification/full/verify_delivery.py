"""Verify built game packaging and preserve the accepted pure-rule baseline."""
from pathlib import Path
import hashlib,json,re,sys
ROOT=Path(__file__).resolve().parents[2]
BASELINE=ROOT/'verification/full/rules-baseline-sha256.json'
checks=[]
def check(name,ok,detail=''):
 checks.append({'name':name,'status':'PASS' if ok else 'FAIL','detail':detail})
manifest=json.loads((ROOT/'public/art-manifest.json').read_text())
check('Manifest contains exactly 63 unique assets',len(manifest['assets'])==len({a['id'] for a in manifest['assets']})==63)
check('Runtime has only specified development dependencies',set(json.loads((ROOT/'package.json').read_text()).get('devDependencies',{}))=={'typescript','vite','vitest'} and not json.loads((ROOT/'package.json').read_text()).get('dependencies'))
check('Relative Vite build base',bool(re.search(r'base\s*:\s*[\"\']\./[\"\']',(ROOT/'vite.config.ts').read_text())))
if BASELINE.exists():
 base=json.loads(BASELINE.read_text()); differences=[name for name,digest in base.items() if not (ROOT/name).exists() or hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=digest]
 added=[str(p.relative_to(ROOT)) for p in (ROOT/'src/rules').rglob('*') if p.is_file() and str(p.relative_to(ROOT)) not in base]
 check('Accepted rules directory is byte-identical',not differences and not added,', '.join(differences+added))
else: check('Accepted rules baseline is available',False,str(BASELINE))
ui='\n'.join(p.read_text() for p in (ROOT/'src').rglob('*.ts') if 'rules' not in p.parts and not p.name.endswith('.test.ts'))
check('No Math.random outside the accepted rules',not re.search(r'\bMath\.random\b',ui))
keys=sorted(set(re.findall(r"['\"](gemcard\.[\w.-]+)['\"]",ui)))
check('Only the three specified persistence keys',keys==['gemcard.records','gemcard.run','gemcard.settings'],', '.join(keys))
index=ROOT/'dist/index.html'
check('Built index exists',index.is_file())
if index.exists():
 text=index.read_text();refs=re.findall(r'(?:src|href)="([^"#]+)"',text)
 bad=[ref for ref in refs if ref.startswith(('http:','https:','//','/')) or not (ROOT/'dist'/ref).is_file()]
 check('Built page references local relative existing assets',not bad,', '.join(bad))
 check('Built manifest matches source', (ROOT/'dist/art-manifest.json').read_bytes()==(ROOT/'public/art-manifest.json').read_bytes())
 for a in manifest['assets']:
  original=ROOT/'public/art'/(a['id']+'.svg')
  if original.exists(): check('External-replaceable real art: '+a['id'],(ROOT/'dist/art'/original.name).is_file() and (ROOT/'dist/art'/original.name).read_bytes()==original.read_bytes())
out=ROOT/'verification/full/delivery-check.json';out.write_text(json.dumps({'checks':checks,'pass':all(c['status']=='PASS' for c in checks)},ensure_ascii=False,indent=2)+'\n')
for c in checks: print(c['status'],c['name'],c['detail'])
sys.exit(0 if all(c['status']=='PASS' for c in checks) else 1)
