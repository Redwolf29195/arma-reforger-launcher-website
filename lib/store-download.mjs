// Keep submitted installers independent of release.json. Add new versions;
// never replace an existing entry or repoint it at a different release asset.
export const STORE_INSTALLERS = Object.freeze({
  '/store/0.3.42/Arma-Reforger-Launcher-0.3.42-x64-Setup.exe': Object.freeze({
    filename: 'Arma-Reforger-Launcher-0.3.42-x64-Setup.exe',
    source: 'https://github.com/Redwolf29195/arma-reforger-launcher-updates/releases/download/v0.3.42/Arma-Reforger-Launcher-0.3.42-x64-Setup.exe',
    assetPath: '/github-production-release-asset/1353307565/9f410e3a-60bd-48e6-b08d-92387b9847f1',
    upstreamETag: '"0x8DF0D1210DEFD9E"',
    bytes: 86066542,
    sha256: '4c57097d766a5040d6175a82412c502dde22d8f8163ddebcdd361b02d8378aba',
    lastModified: 'Mon, 07 Sep 2026 18:58:55 GMT'
  })
});

function errorResponse(request, status, message, extraHeaders = {}) {
  return new Response(request.method === 'HEAD' ? null : message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      ...extraHeaders
    }
  });
}

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ([first, last].some(number => number !== null && !Number.isSafeInteger(number))) return null;
  if (first === null) {
    if (last <= 0) return null;
    return { start: Math.max(0, size - last), end: size - 1 };
  }
  if (first >= size || (last !== null && last < first)) return null;
  return { start: first, end: last === null ? size - 1 : Math.min(last, size - 1) };
}

async function cancelBody(response) {
  try { await response?.body?.cancel(); } catch { /* Already closed. */ }
}

async function fetchHeaders(fetchImpl, url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetchImpl(url, { ...options, redirect: 'manual', signal: controller.signal });
  } finally {
    // Only bound the wait for headers: slow clients may stream the full installer.
    clearTimeout(timeout);
  }
}

export async function downloadStoreInstaller(request, { fetchImpl = globalThis.fetch, installers = STORE_INSTALLERS } = {}) {
  const url = new URL(request.url);
  const installer = Object.hasOwn(installers, url.pathname) ? installers[url.pathname] : null;
  if (!installer || url.search) return errorResponse(request, 404, 'Installer version not found.');
  if (!['GET', 'HEAD'].includes(request.method)) {
    return errorResponse(request, 405, 'Method not allowed.', { Allow: 'GET, HEAD' });
  }

  const etag = `"sha256-${installer.sha256}"`;
  const rangeHeader = request.method === 'GET' ? request.headers.get('range') : null;
  const ifRange = request.headers.get('if-range');
  let range = null;
  if (rangeHeader && (!ifRange || ifRange === etag || ifRange === installer.lastModified)) {
    range = parseRange(rangeHeader, installer.bytes);
    if (!range) return errorResponse(request, 416, 'Requested range not satisfiable.', {
      'Content-Range': `bytes */${installer.bytes}`,
      'Accept-Ranges': 'bytes'
    });
  }

  const outboundHeaders = {
    Accept: 'application/octet-stream',
    'Accept-Encoding': 'identity',
    'User-Agent': 'ArmaLauncher-Store-Download'
  };
  let upstream;
  try {
    // Resolve the temporary GitHub URL on the server; never expose a redirect or
    // store an expiring signed URL. The pinned blob path rejects replaced assets.
    const redirect = await fetchHeaders(fetchImpl, installer.source, {
      method: 'HEAD', headers: { ...outboundHeaders, 'Cache-Control': 'no-cache' }
    });
    const location = redirect.headers.get('location');
    await cancelBody(redirect);
    if (![301, 302, 303, 307, 308].includes(redirect.status) || !location) throw new Error('Missing asset redirect');
    const assetUrl = new URL(location);
    if (assetUrl.origin !== 'https://release-assets.githubusercontent.com'
        || assetUrl.username || assetUrl.password || assetUrl.pathname !== installer.assetPath) {
      throw new Error('Release asset identity changed');
    }

    const assetHeaders = { ...outboundHeaders, 'If-Match': installer.upstreamETag };
    if (range) assetHeaders.Range = `bytes=${range.start}-${range.end}`;
    upstream = await fetchHeaders(fetchImpl, assetUrl.href, { method: request.method, headers: assetHeaders });
    const status = range ? 206 : 200;
    const length = range ? range.end - range.start + 1 : installer.bytes;
    const contentRange = range ? `bytes ${range.start}-${range.end}/${installer.bytes}` : null;
    if (upstream.status !== status
        || upstream.headers.get('etag') !== installer.upstreamETag
        || upstream.headers.get('content-length') !== String(length)
        || upstream.headers.get('content-type')?.split(';')[0].trim() !== 'application/octet-stream'
        || upstream.headers.get('content-range') !== contentRange
        || ![null, 'identity'].includes(upstream.headers.get('content-encoding'))) {
      throw new Error('Release asset response did not match the pinned installer');
    }

    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${installer.filename}"`,
      'Content-Length': String(length),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400, immutable, no-transform',
      ETag: etag,
      'Last-Modified': installer.lastModified,
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow'
    };
    if (range) headers['Content-Range'] = contentRange;
    if (request.method === 'HEAD') await cancelBody(upstream);
    // Forward the stream without buffering the 86 MB installer in Worker memory.
    // No visitor cookies, credentials, counter writes or client headers are copied.
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status, headers });
  } catch {
    await cancelBody(upstream);
    return errorResponse(request, 502, 'This installer is temporarily unavailable. Please try again later.', { 'Retry-After': '60' });
  }
}
