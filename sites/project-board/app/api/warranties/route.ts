import {listWarranties,saveWarranty} from '../../../lib/warranties';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({warranties:await listWarranties(),asOf:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})}
export async function POST(r:Request){const origin=r.headers.get('origin');if(origin&&origin!==new URL(r.url).origin)return new Response('Forbidden',{status:403});try{return Response.json({warranty:await saveWarranty(await r.json())})}catch(e:any){return Response.json({error:e.message},{status:400})}}
