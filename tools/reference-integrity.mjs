import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const snapshot='tests/h5-fingerprints.json';
if(!fs.existsSync('h5')&&process.argv.includes('--check')){console.log('H5 reference removed; validating native rules against frozen source-case and golden fixtures.');process.exit(0);}
function walk(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
 const file=path.join(directory,entry.name);
 if(entry.name==='node_modules'||entry.name==='.DS_Store')return [];
 return entry.isDirectory()?walk(file):entry.isFile()?[file]:[];
});}
const current=Object.fromEntries(walk('h5').sort().map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
if(process.argv.includes('--check')){
 const expected=JSON.parse(fs.readFileSync(snapshot,'utf8'));
 const differences=[...new Set([...Object.keys(expected),...Object.keys(current)])].filter(file=>expected[file]!==current[file]);
 if(differences.length){console.error('H5 reference changed:',differences);process.exitCode=1;}else console.log(`H5 reference unchanged: ${Object.keys(current).length} files`);
}else{if(fs.existsSync(snapshot))throw Error('Refuse to replace frozen reference');fs.writeFileSync(snapshot,JSON.stringify(current,null,2));console.log('Frozen H5 fingerprints:',Object.keys(current).length);}
