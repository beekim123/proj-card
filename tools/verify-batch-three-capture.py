"""Validate real capture sidecars; never synthesize screenshots or state."""
import json, sys
p, scene = sys.argv[1:]
d = json.load(open(p)); r=d.get('run'); records=d['records']; profile=d['profile']; view=d['viewState']
assert view['scenario'] == 'batch3-'+scene
if scene.startswith('difficulty'):
    assert d['screen']=='difficulty'
    assert records['fullWins']==(0 if scene.endswith('locked') and not scene.endswith('unlocked') else 3)
elif scene.startswith('collection'):
    assert d['screen']=='collection' and len(profile['collected'])==19
    assert view['collectionScroll']==0 if scene.endswith('top') else view['collectionScroll']>0
elif scene=='act2-choice':
    assert r['phase']=='act_choice' and r['act']==2 and len(r['relics'])==5
else:
    assert r['act']==3
    if scene.startswith('victory'):
        assert r['phase']=='victory' and len(r['relics'])==6
        assert r['result']['recordsApplied'] == (scene=='victory')
        assert records['fullWins']==(1 if scene=='victory' else 0)
    else:
        assert r['phase']=='battle'
        assert r['monster']['key']=={'vault-regrow':'tree','vault-cap':'armor','vault-dragon':'dragon'}[scene]
        if scene=='vault-dragon': assert len(r['relics'])==6 and r['monster']['layer']==3
print('Validated actual sidecar:', scene)
