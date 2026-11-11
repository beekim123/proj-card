import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from '../../h5/node_modules/typescript/lib/typescript.js';
const source=fs.readFileSync('h5/src/ui/game.ts','utf8');
const file=ts.createSourceFile('game.ts',source,ts.ScriptTarget.Latest,true);
let method;
function walk(node){if(ts.isMethodDeclaration(node)&&node.name?.getText(file)==='showRules')method=node;ts.forEachChild(node,walk);}walk(file);
if(!method)throw Error('H5 showRules not found');
const result={source:'h5/src/ui/game.ts',source_sha256:crypto.createHash('sha256').update(source).digest('hex')};
for(const statement of method.body.statements){if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations){const name=declaration.name.getText(file);if(['rules','sections'].includes(name))result[name]=vm.runInNewContext('('+declaration.initializer.getText(file)+')');}}
if(result.rules?.length!==8||result.sections?.length!==3)throw Error('Unexpected H5 rule text shape');
fs.writeFileSync('data/ui-copy.json',JSON.stringify(result,null,2)+'\n');console.log('Copied exact H5 rules prose:',result.rules.length,'intro paragraphs;',result.sections.length,'sections');
