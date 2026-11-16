async function request(path:string,options:RequestInit={},blob=false):Promise<any>{
 const headers=new Headers(options.headers);headers.set('Content-Type','application/json');
 const response=await fetch('/api/staff'+path.slice(4),{...options,headers,cache:'no-store'});
 if(!response.ok){const data=await response.json().catch(()=>({}));throw Object.assign(new Error(data.error||'Content Studio request failed'),{status:response.status,retryAfterMs:Number(response.headers.get('Retry-After'))*1000});}
 return blob?response.blob():response.json();
}
export const apiClient={get:(p:string)=>request(p),getBlob:(p:string)=>request(p,{},true),post:(p:string,b:any)=>request(p,{method:'POST',body:JSON.stringify(b)}),put:(p:string,b:any)=>request(p,{method:'PUT',body:JSON.stringify(b)})};
