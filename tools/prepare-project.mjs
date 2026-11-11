// Stage native resources only. The Godot editor never scans or writes h5/.
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),stage=path.join(root,'artifacts/godot-project');
fs.mkdirSync(stage,{recursive:true});
for(const name of ['project.godot','export_presets.cfg','ASSET-NOTICES.md'])fs.copyFileSync(path.join(root,name),path.join(stage,name));
for(const name of ['scripts','rules','scenes','data','art','audio','fonts'])fs.cpSync(path.join(root,name),path.join(stage,name),{recursive:true});
console.log(stage);
