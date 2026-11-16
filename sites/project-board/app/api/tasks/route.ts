import {listTasks,saveTask} from '../../../lib/tasks';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({tasks:await listTasks(),asOf:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})}
export async function POST(r:Request){
 const origin=r.headers.get('origin'); if(origin&&origin!==new URL(r.url).origin)return new Response('Forbidden',{status:403});
 try{return Response.json({task:await saveTask(await r.json())})}catch(e:any){return Response.json({error:e.message},{status:400})}
}
