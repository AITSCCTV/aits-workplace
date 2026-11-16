export const staffKey='aits-content-staff';
export const signOut=()=>{sessionStorage.removeItem(staffKey);window.dispatchEvent(new Event('aits-staff-session'));};
async function request(path:string, options:RequestInit={}, blob=false, retry=true):Promise<any>{
 const session=JSON.parse(sessionStorage.getItem(staffKey)||'null');
 const headers=new Headers(options.headers);headers.set('Content-Type','application/json');
 if(session?.token)headers.set('X-AITS-Staff-Token',session.token);
 const response=await fetch('/api/staff'+path.slice(4),{...options,headers,cache:'no-store'});
 if(response.status===403&&session&&retry&&path!=='/api/auth/refresh'){
  try{const data=await request('/api/auth/refresh',{method:'POST',body:'{}'},false,false);sessionStorage.setItem(staffKey,JSON.stringify(data));return request(path,options,blob,false);}catch{signOut();}
 }
 if(!response.ok){const data=await response.json().catch(()=>({}));throw Object.assign(new Error(data.error||'Content Studio request failed'),{status:response.status,retryAfterMs:Number(response.headers.get('Retry-After'))*1000});}
 return blob?response.blob():response.json();
}
export const apiClient={get:(p:string)=>request(p),getBlob:(p:string)=>request(p,{},true),post:(p:string,b:any)=>request(p,{method:'POST',body:JSON.stringify(b)}),put:(p:string,b:any)=>request(p,{method:'PUT',body:JSON.stringify(b)})};
