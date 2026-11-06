import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { StreamableHTTPTransport } from '@hono/mcp';
import { Hono } from 'hono';
import type { Env } from './env';
import { buildServer } from './server';
import { defaultHandler } from './auth/handler';
const origin='https://health.anotherdayu.com';
const mcp=new Hono<{Bindings:Env}>();
mcp.all('/mcp',async c=>{
 const ctx=c.executionCtx as ExecutionContext & {props?:{email?:string};auth?:{scope:string[]}};
 if(!ctx.props?.email||ctx.props.email.toLowerCase()!==c.env.OWNER_EMAIL.toLowerCase()||!ctx.auth?.scope.includes('health:read'))return c.text('Forbidden',403);
 if(c.req.method==='GET'||c.req.method==='DELETE')return c.text('Stateless MCP supports POST',405);
 if(c.req.method!=='POST')return c.text('Method not allowed',405);
 const env={...c.env,REQUEST_CACHE_META:[]};const server=buildServer(env),transport=new StreamableHTTPTransport();await server.connect(transport);return(await transport.handleRequest(c))??c.body(null,202);
});
export default new OAuthProvider<Env>({apiRoute:'/mcp',apiHandler:mcp,defaultHandler,authorizeEndpoint:'/authorize',tokenEndpoint:'/oauth/token',scopesSupported:['health:read','offline_access'],resourceMetadata:{resource:origin+'/mcp',authorization_servers:[origin]},requiredScopes:['health:read'],clientIdMetadataDocumentEnabled:true,accessTokenTTL:3600,refreshTokenTTL:90*86400,refreshTokenIdleTTL:90*86400});
