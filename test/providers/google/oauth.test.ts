import {afterEach,describe,it,expect,vi} from 'vitest';
import {getAccessToken,refreshTokens,invalidateAccessToken,validateScopes} from '../../../src/providers/google/oauth';
import {createMockEnv} from '../../helpers/mock-env';
const fixture=()=>createMockEnv({access_token:'current',refresh_token:'retain',expires_at:String(Math.floor(Date.now()/1000)+3600)});
afterEach(()=>vi.unstubAllGlobals());
describe('Health token isolation and refresh',()=>{
 it('returns valid token without a network call',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);expect(await getAccessToken(fixture())).toBe('current');expect(f).not.toHaveBeenCalled();});
 it('rejects missing credentials and a mismatched client',async()=>{await expect(getAccessToken(createMockEnv())).rejects.toThrow(/authorization required/);const e=fixture();e.GOOGLE_CLIENT_ID='other';await expect(getAccessToken(e)).rejects.toThrow(/authorization required/);});
 it('rejects mixed or empty scopes',()=>{expect(()=>validateScopes('')).toThrow();expect(()=>validateScopes('https://www.googleapis.com/auth/drive.file')).toThrow();});
 it('preserves refresh token, writes one coherent bundle and puts credentials only in the token form body',async()=>{const f=vi.fn(async()=>Response.json({access_token:'new',expires_in:3600}));vi.stubGlobal('fetch',f);const e=fixture();const t=await refreshTokens(e,'retain');expect(t.refreshToken).toBe('retain');expect((await e.TOKENS.get('health:token-bundle','json') as any).accessToken).toBe('new');const opts=(f.mock.calls as any)[0][1];expect(opts.body.get('client_secret')).toBe(e.GOOGLE_CLIENT_SECRET);expect(opts.headers.Authorization).toBeUndefined();expect(e.TOKENS.put).toHaveBeenCalledTimes(1);});
 it('redacts token exchange errors',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('sensitive-token',{status:400})));await expect(refreshTokens(fixture(),'retain')).rejects.toThrow(/HTTP 400/);try{await refreshTokens(fixture(),'retain');}catch(e){expect(String(e)).not.toContain('sensitive-token');}});
 it('forces refresh after invalidation',async()=>{const e=fixture();await invalidateAccessToken(e);expect((await e.TOKENS.get('health:token-bundle','json') as any).expiresAt).toBe(0);});
});
