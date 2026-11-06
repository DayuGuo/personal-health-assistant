import {it,expect} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {buildServer} from '../../src/server';
import {createMockEnv} from '../helpers/mock-env';
it('advertises only read tools with correct security metadata',async()=>{const server=buildServer(createMockEnv());const client=new Client({name:'test',version:'1'});const[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);const{tools}=await client.listTools();expect(tools.length).toBeGreaterThan(8);for(const t of tools){expect(t.annotations?.readOnlyHint).toBe(true);expect(t.name).not.toMatch(/^(log|delete|create|update|save|remove|set)_/);expect((t._meta as any).securitySchemes).toEqual([{type:'oauth2',scopes:['health:read']}]);}await client.close();await server.close();});
