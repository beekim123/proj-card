import {report} from './assert-harness.mjs';
const files=process.argv.slice(2);
for(const path of files) await import(new URL(path,`file://${process.cwd()}/`));
report();
