/** The configured origin, never a request Host header, defines OAuth audiences. */
export function publicOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    url.port
  ) {
    throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without a path, port or credentials');
  }
  if (
    !url.hostname.includes('.') ||
    /(^|\.)(localhost|local)$/.test(url.hostname) ||
    /^\d+(\.\d+){3}$/.test(url.hostname) ||
    url.hostname.startsWith('[')
  )
    throw new Error('A public hostname is required');
  return url.origin;
}

export function canonicalRequest(request: Request, origin: string): Request {
  const source = new URL(request.url),
    target = new URL(publicOrigin(origin));
  target.pathname = source.pathname;
  target.search = source.search;
  return request.url === target.href ? request : new Request(target, request);
}
