#!/usr/bin/env python3
import pathlib,shutil
root=pathlib.Path(__file__).resolve().parent.parent
stage=root/'artifacts/godot-project'
shutil.copytree(stage/'.godot',root/'.godot',dirs_exist_ok=True)
for name in ('art','audio','fonts'):
 for source in (stage/name).rglob('*.import'):
  shutil.copy2(source,root/source.relative_to(stage))
print('Native import cache synchronized; H5 was not scanned.')
