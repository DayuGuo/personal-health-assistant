/** Emits endpoint/status/count only. Never emits tokens, identity or measurements. */
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {GoogleHealthProvider} from '../src/providers/google';
import {GoogleClient} from '../src/providers/google/client';
import {z} from 'zod';
import type {Env} from '../src/env';
const credentials=JSON.parse(await readFile('.bootstrap-secrets.json','utf8'));
const r=spawnSync('pnpm',['exec','wrangler','kv','key','get','health:token-bundle','--binding','TOKENS','--remote','--text'],{encoding:'utf8'});
if(r.status!==0){console.log('Health bundle not available');process.exit(1);}
let bundle:unknown;try{bundle=JSON.parse(r.stdout);}catch{console.log('Unable to read health bundle safely');process.exit(1);}
const env={...credentials,TOKENS:{get:async(key:string,type?:string)=>key==='health:token-bundle'?(type==='json'?bundle:JSON.stringify(bundle)):null,put:async()=>{throw Error('Diagnostic cannot persist credentials; rerun setup if expired');}}} as unknown as Env;
const client=new GoogleClient(env),provider=new GoogleHealthProvider(env);const end=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const start=new Date(Date.parse(end+'T12:00:00Z')-6*86400000).toISOString().slice(0,10);
const probes:[string,()=>Promise<unknown>][]=[['health.identity',()=>client.requestJson(z.object({healthUserId:z.string()}),{path:'/v4/users/me/identity'})],['health.steps',()=>provider.getActivityTimeSeries('steps',start,end)],['health.sleep',()=>provider.getSleepRange(start,end)],['health.hrv',()=>provider.getHRV(start,end)],['health.spo2',()=>provider.getSpO2(start,end)]];
let failures=0;for(const[name,fn]of probes){try{await fn();console.log(JSON.stringify({check:name,http:200}));}catch(e){failures++;const code=(e as {status?:number}).status;console.log(JSON.stringify({check:name,http:code||null,failed:true}));}}process.exitCode=failures?1:0;
