import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from './env';
import { GoogleHealthProvider } from './providers/google';
import { registerAllTools } from './tools';
export function buildServer(env:Env):McpServer{
 const server=new McpServer({name:'personal-health-assistant',version:'0.2.0'},{instructions:'Read-only Google Health tools. Check freshness and record dates. Missing values are not zero; today may be incomplete. Compare identical sources only. No medical diagnosis. Existing daily Apps Script sync is separate.'});
 const original=server.registerTool.bind(server);
 // Shared metadata, with real authentication enforced before every MCP request.
 server.registerTool=((name:string,config:any,handler:any)=>original(name,{...config,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:{...config._meta,securitySchemes:[{type:'oauth2',scopes:['health:read']}]},outputSchema:config.outputSchema?{...config.outputSchema,freshness:z.array(z.object({cache_hit:z.boolean(),fetched_at_utc:z.string(),expires_at_utc:z.string()}))}:undefined},async(...args:any[])=>{
  const mark=env.REQUEST_CACHE_META?.length??0;
  const result=await handler(...args);if(result.isError)return result;
  const freshness=env.REQUEST_CACHE_META?.slice(mark)??[];
  return {...result,structuredContent:result.structuredContent?{...result.structuredContent,freshness}:undefined,content:[...(result.content??[]),{type:'text',text:JSON.stringify({freshness,timezone:'Europe/London'})}]};
 })) as typeof server.registerTool;
 registerAllTools(server,new GoogleHealthProvider(env),env);
 server.registerTool('get_connection_status',{title:'Check private bridge configuration',description:'Check whether Health credentials have been configured. This does not claim API access has been verified.',inputSchema:{},outputSchema:{configured:z.boolean(),timezone:z.string(),freshness:z.array(z.object({cache_hit:z.boolean(),fetched_at_utc:z.string(),expires_at_utc:z.string()}))}},async()=>({structuredContent:{configured:!!await env.TOKENS.get('health:token-bundle'),timezone:'Europe/London'},content:[{type:'text',text:'Daily Apps Script sync is separate and remains enabled.'}]}));
 return server;
}
