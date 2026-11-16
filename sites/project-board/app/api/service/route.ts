import {listService,saveService} from '../../../lib/service';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({records:await listService(),asOf:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});}
export async function POST(r:Request){if(r.headers.get('origin')&&r.headers.get('origin')!==new URL(r.url).origin)return new Response('Forbidden',{status:403});try{return Response.json({record:await saveService(await r.json())})}catch(e:any){return Response.json({error:e.message},{status:400})}}
