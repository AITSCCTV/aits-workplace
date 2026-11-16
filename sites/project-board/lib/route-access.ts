// Only use platform-injected identity after Sites dispatch authentication.
export function canVisit(email:string|null,path:string){if(!email||email.toLowerCase()==='info@aitscctv.com')return true;return path.startsWith('/forms/')||path==='/api/forms'||path.startsWith('/assets/')||path.startsWith('/_next/')||path==='/favicon.ico';}
