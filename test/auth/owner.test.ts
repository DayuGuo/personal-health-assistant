import {describe,it,expect} from 'vitest';
import {isChatGPTClient,verifyOwner} from '../../src/auth/security';
import {createMockEnv} from '../helpers/mock-env';
describe('Owner and MCP client boundaries',()=>{
 it('accepts stable ChatGPT CIMD and redirect',()=>expect(isChatGPTClient('https://chatgpt.com/oauth/client.json','https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true));
 it.each([['https://chatgpt.com.evil.test/oauth/client.json','https://chatgpt.com/connector_platform_oauth_redirect'],['https://chatgpt.com/oauth/client.json','https://evil.test/callback'],['https://chatgpt.com/oauth/client.json','http://chatgpt.com/connector_platform_oauth_redirect']])('rejects foreign clients/redirects', (c,r)=>expect(isChatGPTClient(c,r)).toBe(false));
 it('requires verified owner email and exact nonce',()=>{const env=createMockEnv({}, {OWNER_EMAIL:'owner@example.com'});const p={email:'owner@example.com',email_verified:true,nonce:'nonce',sub:'sub'};expect(verifyOwner(p,env,'nonce').userId).toBe('sub');expect(()=>verifyOwner({...p,email_verified:false},env,'nonce')).toThrow();expect(()=>verifyOwner({...p,email:'stranger@example.com'},env,'nonce')).toThrow();expect(()=>verifyOwner(p,env,'wrong')).toThrow();});
});
