import type { Env } from '../env';
export function isChatGPTClient(clientId:string,redirectUri:string):boolean{
 try{const c=new URL(clientId),r=new URL(redirectUri);return c.protocol==='https:'&&c.hostname==='chatgpt.com'&&!c.username&&!c.password&&c.pathname.startsWith('/oauth/')&&c.pathname.endsWith('/client.json')&&r.protocol==='https:'&&r.hostname==='chatgpt.com'&&!r.username&&!r.password&&(r.pathname.startsWith('/connector/oauth/')||r.pathname==='/connector_platform_oauth_redirect');}catch{return false;}
}
function owner(payload:{email?:unknown;email_verified?:unknown;nonce?:unknown;sub?:unknown},env:Env,nonce:string){
 if(payload.email_verified!==true||typeof payload.email!=='string'||payload.email.toLowerCase()!==env.OWNER_EMAIL.toLowerCase()||payload.nonce!==nonce||typeof payload.sub!=='string')throw new Error('Owner verification failed');
 return{email:payload.email.toLowerCase(),userId:payload.sub};
}
export { owner as verifyOwner };
