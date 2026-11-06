/** One-time local bootstrap. Secrets read from an ignored, owner-readable JSON file.
 * No tokens, codes, URLs, credentials, or token responses are printed. */
import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {validateScopes} from '../src/providers/google/oauth';
const secrets=JSON.parse(await readFile(resolve('.bootstrap-secrets.json'),'utf8')) as Record<string,string>;
if(!secrets.GOOGLE_CLIENT_ID||!secrets.GOOGLE_CLIENT_SECRET)throw Error('Configure ignored .bootstrap-secrets.json first');
const redirect='http://127.0.0.1:8787/oauth/callback';
const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
const scopes=['activity_and_fitness','health_metrics_and_measurements','sleep'].map(x=>'https://www.googleapis.com/auth/googlehealth.'+x+'.readonly').join(' ');
const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');auth.search=new URLSearchParams({client_id:secrets.GOOGLE_CLIENT_ID,redirect_uri:redirect,response_type:'code',scope:scopes,access_type:'offline',prompt:'consent',include_granted_scopes:'false',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',login_hint:'guozydayu@gmail.com'}).toString();
async function wrangler(args:string[],input?:string){await new Promise<void>((ok,fail)=>{const p=spawn('pnpm',['exec','wrangler',...args],{stdio:['pipe','pipe','pipe']});p.stdin.end(input||'');p.stdout.on('data',()=>{});p.stderr.on('data',()=>{});p.on('error',()=>fail(Error('Wrangler could not start')));p.on('exit',c=>c===0?ok():fail(Error('Wrangler operation failed; no secret values logged')));});}
let handling=false;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url||'/','http://127.0.0.1:8787');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 if(url.pathname==='/auth'){res.writeHead(302,{Location:auth.toString()});res.end();return;}
 if(url.pathname!=='/oauth/callback'){res.writeHead(404);res.end();return;}
 if(handling||url.searchParams.get('state')!==state){res.writeHead(400);res.end('Invalid or already-used request');return;}handling=true;
 try{
  const code=url.searchParams.get('code');if(!code||url.searchParams.has('error'))throw Error('Authorization not completed');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:secrets.GOOGLE_CLIENT_ID!,client_secret:secrets.GOOGLE_CLIENT_SECRET!,redirect_uri:redirect,code,code_verifier:verifier})});if(!r.ok)throw Error('Token exchange failed');
  const b=await r.json() as Record<string,unknown>;if(typeof b.access_token!=='string'||typeof b.refresh_token!=='string'||typeof b.expires_in!=='number'||typeof b.scope!=='string')throw Error('Offline authorization incomplete');validateScopes(b.scope);
  const identity=await fetch('https://health.googleapis.com/v4/users/me/identity',{headers:{Authorization:'Bearer '+b.access_token}});if(!identity.ok)throw Error('Health identity probe failed HTTP '+identity.status);const account=await identity.json() as {healthUserId?:string};if(!account.healthUserId)throw Error('No Health identity');
  const dir=await mkdtemp(resolve(tmpdir(),'health-bootstrap-'));try{
   const file=resolve(dir,'bundle.json');await writeFile(file,JSON.stringify({accessToken:b.access_token,refreshToken:b.refresh_token,expiresAt:Math.floor(Date.now()/1000)+b.expires_in,clientId:secrets.GOOGLE_CLIENT_ID,scope:b.scope}),{mode:0o600});
   await wrangler(['secret','bulk','--name','personal-health-assistant'],JSON.stringify(secrets));
   await wrangler(['kv','key','put','health:token-bundle','--binding','TOKENS','--remote','--path',file]);
  }finally{await rm(dir,{recursive:true,force:true});}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>Health connected</title><p>Google Health 授权成功，凭据已安全写入 Cloudflare。可以返回原聊天继续验证。</p>');console.log('Health identity HTTP 200; credentials safely stored.');
 }catch(e){res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'});res.end('Authorization not completed. Return to Codex for safe diagnostics.');console.log('Health bootstrap did not complete; no credentials logged.');}
 finally{server.close();}
});
server.listen(8787,'127.0.0.1',()=>console.log('Ready: open http://127.0.0.1:8787/auth locally.'));
setTimeout(()=>{server.close();console.log('Authorization window expired.');},10*60*1000).unref();
