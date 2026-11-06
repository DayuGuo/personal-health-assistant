import type { Env } from '../env';
export const DEFAULT_CACHE_TTL_SEC=300;
export async function getCached<T>(env:Env,key:string,fetcher:()=>Promise<T>,opts:{ttlSec?:number}={}):Promise<T>{
 const ttl=Math.min(300,Math.max(60,opts.ttlSec??DEFAULT_CACHE_TTL_SEC));
 const k='health-cache:v2:'+key;
 const hit=await env.CACHE.get<{data:T;fetchedAt:string;expiresAt:string}>(k,'json');
 if(hit&&Date.parse(hit.expiresAt)>Date.now()){env.REQUEST_CACHE_META?.push({cache_hit:true,fetched_at_utc:hit.fetchedAt,expires_at_utc:hit.expiresAt});return hit.data;}
 const data=await fetcher(),fetchedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+ttl*1000).toISOString();
 await env.CACHE.put(k,JSON.stringify({data,fetchedAt,expiresAt}),{expirationTtl:ttl});env.REQUEST_CACHE_META?.push({cache_hit:false,fetched_at_utc:fetchedAt,expires_at_utc:expiresAt});return data;
}
export async function invalidate(env:Env,...keys:string[]):Promise<void>{await Promise.all(keys.map(k=>env.CACHE.delete('health-cache:v2:'+k)));}
export function cacheKey(endpoint:string,args:Record<string,unknown>={}):string{const parts=Object.entries(args).filter(([,v])=>v!==undefined&&v!==null).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${String(v)}`).join('&');return parts?`${endpoint}?${parts}`:endpoint;}
