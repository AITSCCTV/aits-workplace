import {AsyncLocalStorage} from 'node:async_hooks';
const storage=new AsyncLocalStorage();
export const runWithContext=(value,fn)=>storage.run(value,fn);
export const env=new Proxy({}, {get(_target,key){const context=storage.getStore();if(!context)throw Error('Request context missing');return context.env[key];}});
export async function headers(){const context=storage.getStore();if(!context)throw Error('Request context missing');return context.request.headers;}
