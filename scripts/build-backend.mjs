import {build} from 'esbuild';
import path from 'node:path';
await build({entryPoints:['backend/worker.mjs'],outfile:'backend/dist/worker.js',bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['node:async_hooks'],conditions:['workerd','browser'],plugins:[{name:'request-context',setup(b){b.onResolve({filter:/^(cloudflare:workers|next\/headers)$/},()=>({path:path.resolve('backend/context.mjs')}));}}]});
console.log('Built independent API Worker');
