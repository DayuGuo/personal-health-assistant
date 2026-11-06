import { AuthorizationError, authorizationErrorRedirect } from '@cloudflare/workers-oauth-provider';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from '../env';
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const escape = (s: string) => s.replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
import { isChatGPTClient, verifyOwner as owner } from './security';
export const defaultHandler = {
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url),
      oauth = env.OAUTH_PROVIDER;
    try {
      if (u.pathname === '/authorize' && req.method === 'GET') {
        const request = await oauth.parseAuthRequest(req);
        if (!isChatGPTClient(request.clientId, request.redirectUri))
          return new Response('Only the configured ChatGPT client is supported.', { status: 400 });
        if (request.scope.some((s) => !['health:read', 'offline_access'].includes(s)))
          return new Response('Unsupported scope', { status: 400 });
        const details = await oauth.describeConsent(request),
          consent = await oauth.beginConsent(request);
        consent.headers.set('Content-Type', 'text/html; charset=utf-8');
        consent.headers.set('Referrer-Policy', 'no-referrer');
        return new Response(
          `<!doctype html><meta charset="utf-8"><title>连接个人健康助手 / Connect Personal Health</title><h1>允许 ChatGPT 读取你的健康数据？<br>Allow ChatGPT to read your health data?</h1><p>请求客户端 / Client: ${escape(details.clientName)}；客户端域名 / Client domain: ${escape(details.clientDomain || '未验证')}。</p><p>回调目的地 / Redirect host: ${escape(details.redirectHost)}。只允许维护者本人 Google 账户登录。将读取活动、睡眠及健康测量；不会写入健康数据，也不会修改每日同步。</p><p>Only the configured owner may sign in. Read-only access covers activity, sleep and health measurements. Health records and optional daily archiving are not changed.</p><form method="post" action="/authorize"><input type="hidden" name="handle" value="${escape(consent.handle)}"><button name="decision" value="approve">同意并使用 Google 验证本人身份 / Agree and verify with Google</button><button name="decision" value="deny">取消 / Cancel</button></form><p><a href="/privacy/">隐私政策 / Privacy</a></p>`,
          { headers: consent.headers },
        );
      }
      if (u.pathname === '/authorize' && req.method === 'POST') {
        const form = await req.formData(),
          handle = String(form.get('handle') || '');
        if (form.get('decision') !== 'approve') {
          const denied = await oauth.denyConsent(req, handle);
          return new Response(null, { status: 302, headers: denied.headers });
        }
        const approved = await oauth.approveConsent(req, handle, {
          scope: ['health:read', 'offline_access'],
        });
        if (!isChatGPTClient(approved.request.clientId, approved.request.redirectUri))
          return new Response('Unsupported client', { status: 400 });
        const nonce = crypto.randomUUID(),
          verifier = crypto.randomUUID() + crypto.randomUUID();
        const digest = new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
        );
        const challenge = btoa(String.fromCharCode(...digest))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
        const upstream = await oauth.beginUpstream(approved.request, {
          data: { nonce, verifier },
          headers: approved.headers,
        });
        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        url.search = new URLSearchParams({
          client_id: env.LOGIN_CLIENT_ID,
          redirect_uri: env.PUBLIC_ORIGIN + '/login/callback',
          response_type: 'code',
          scope: 'openid email',
          state: upstream.state,
          nonce,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          include_granted_scopes: 'false',
          prompt: 'select_account',
        }).toString();
        upstream.headers.set('Location', url.toString());
        return new Response(null, { status: 302, headers: upstream.headers });
      }
      if (u.pathname === '/login/callback' && req.method === 'GET') {
        const tx = await oauth.finishUpstream<{ nonce: string; verifier: string }>(req);
        if (u.searchParams.has('error')) {
          tx.headers.set('Location', authorizationErrorRedirect(tx.request, 'access_denied'));
          return new Response(null, { status: 302, headers: tx.headers });
        }
        const code = u.searchParams.get('code');
        if (!code) throw new Error('Missing authorization code');
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: env.LOGIN_CLIENT_ID,
            client_secret: env.LOGIN_CLIENT_SECRET,
            code,
            code_verifier: tx.data.verifier,
            redirect_uri: env.PUBLIC_ORIGIN + '/login/callback',
          }),
        });
        if (!response.ok) throw new Error('Identity verification failed');
        const token = (await response.json()) as { id_token?: string };
        if (!token.id_token) throw new Error('Missing identity token');
        const { payload } = await jwtVerify(token.id_token, keys, {
          issuer: ['https://accounts.google.com', 'accounts.google.com'],
          audience: env.LOGIN_CLIENT_ID,
          algorithms: ['RS256'],
        });
        const identity = owner(payload, env, tx.data.nonce);
        const grant = await oauth.completeAuthorization({
          request: tx.request,
          userId: identity.userId,
          metadata: {},
          scope: ['health:read', 'offline_access'],
          props: identity,
        });
        tx.headers.set('Location', grant.redirectTo);
        tx.headers.set('Referrer-Policy', 'no-referrer');
        return new Response(null, { status: 302, headers: tx.headers });
      }
      if (u.pathname === '/health')
        return Response.json({
          status: 'ok',
          version: '0.4.0',
          mode: 'read-only',
          health_data: 'authenticated access only',
        });
      if (['/authorize', '/login/callback'].includes(u.pathname))
        return new Response('Method not allowed', { status: 405 });
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof AuthorizationError && e.redirectTo)
        return Response.redirect(e.redirectTo, 302);
      return new Response(
        'Authorization could not be completed. Restart the connection from ChatGPT; only the owner may connect.',
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'text/plain; charset=utf-8',
            'Referrer-Policy': 'no-referrer',
          },
        },
      );
    }
  },
};
