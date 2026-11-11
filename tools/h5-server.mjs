import { createServer } from '../h5/node_modules/vite/dist/node/index.js';
import path from 'node:path';
const root=path.resolve('h5');
const port=Number(process.env.GEMCARD_H5_PORT??8780);
const server=await createServer({root,configFile:false,cacheDir:path.resolve('artifacts/h5-vite-cache'),server:{host:'127.0.0.1',port,strictPort:true},logLevel:'warn'});
await server.listen();console.log('H5_REFERENCE_READY http://127.0.0.1:'+port);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await server.close();process.exit(0);});
