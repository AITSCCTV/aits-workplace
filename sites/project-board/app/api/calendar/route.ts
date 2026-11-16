import {snapshot} from '../../../lib/calendar-snapshot';
export const dynamic='force-dynamic';
export async function GET(){return Response.json(snapshot,{headers:{'Cache-Control':'no-store'}})}
