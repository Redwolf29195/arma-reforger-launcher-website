// Keep the historical database buckets by installation format, across both OSes.
const DOWNLOAD_FORMATS = new Map([
  ['setup', { suffix: 'x64-Setup.exe', bucket: 'setup' }],
  ['portable', { suffix: 'x64-Portable.exe', bucket: 'portable' }],
  ['deb', { suffix: 'linux-x64.deb', bucket: 'setup' }],
  ['appimage', { suffix: 'linux-x64.AppImage', bucket: 'portable' }]
]);
const RELEASE_ROOT = 'https://github.com/Redwolf29195/arma-reforger-launcher-updates/releases/download';
const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COOKIE_CHECK = '__arma_cookie_check';

function cookieName(request) {
  return new URL(request.url).protocol === 'https:' ? '__Host-arma_download' : 'arma_download';
}

function visitorId(request) {
  const prefix = `${cookieName(request)}=`;
  const value = (request.headers.get('cookie') || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(prefix))?.slice(prefix.length);
  return value && VISITOR_ID.test(value) ? value : null;
}

function visitorCookie(request, id) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(request)}=${id}; Path=/; Max-Age=34560000; HttpOnly; SameSite=Lax${secure}`;
}

function isInteractiveGet(request) {
  const purpose = `${request.headers.get('purpose') || ''} ${request.headers.get('sec-purpose') || ''}`;
  return request.method === 'GET' && !/prefetch|prerender/i.test(purpose);
}

function redirect(target, cookie) {
  return new Response(null, { status: 302, headers: {
    Location: target,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    ...(cookie ? { 'Set-Cookie': cookie } : {})
  } });
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

export async function downloadStats(request, database) {
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, HEAD' });
  if (!database) return json({ error: 'Counter unavailable' }, 503);
  try {
    const counts = await database.prepare(`SELECT
      COALESCE(SUM(total), 0) AS total,
      COALESCE(SUM(CASE WHEN kind = 'setup' THEN total ELSE 0 END), 0) AS setup,
      COALESCE(SUM(CASE WHEN kind = 'portable' THEN total ELSE 0 END), 0) AS portable
      FROM download_counts`).first();
    if (!counts || !['total', 'setup', 'portable'].every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0)
        || counts.total !== counts.setup + counts.portable) throw new Error('Invalid counter data');
    // The page loads statistics before a normal download click. Prepare its
    // browser ID here, without creating a download or sharing cookies via caches.
    const headers = { 'X-Robots-Tag': 'noindex', Vary: 'Cookie' };
    if (isInteractiveGet(request)) {
      headers['Set-Cookie'] = visitorCookie(request, visitorId(request) || crypto.randomUUID());
    }
    const response = json({ ...counts, source: 'website', excludesUpdates: true }, 200, headers);
    return request.method === 'HEAD' ? new Response(null, response) : response;
  } catch {
    return json({ error: 'Counter unavailable' }, 503);
  }
}

export async function downloadFromWebsite(request, kind, { database, loadRelease }) {
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, HEAD' });
  const format = DOWNLOAD_FORMATS.get(kind);
  if (!format) return json({ error: 'Unknown download' }, 404);
  let target;
  try {
    const release = await loadRelease();
    if (!/^\d+\.\d+\.\d+$/.test(release.version)) throw new Error('Invalid release');
    const download = release.downloads?.[kind];
    const filename = `Arma-Reforger-Launcher-${release.version}-${format.suffix}`;
    target = `${RELEASE_ROOT}/v${release.version}/${filename}`;
    if (download?.available !== true || download.filename !== filename || download.url !== target) throw new Error('Unavailable release');
  } catch {
    return json({ error: 'Download temporarily unavailable' }, 503);
  }

  // Auto-updates use the existing GitHub URLs and never call this website route.
  // Direct links also work without JS. Try the cookie once; a browser that blocks
  // cookies still gets the file, without a redirect loop or repeated increments.
  let cookie;
  if (isInteractiveGet(request) && database) {
    const id = visitorId(request);
    if (!id) {
      const retry = new URL(request.url);
      if (!retry.searchParams.has(COOKIE_CHECK)) {
        retry.searchParams.set(COOKIE_CHECK, '1');
        return redirect(retry.href, visitorCookie(request, crypto.randomUUID()));
      }
      return redirect(target);
    }
    cookie = visitorCookie(request, id);
    try {
      // The unique key and migration trigger count only the first successful
      // insert, atomically, even for concurrent clicks or another release/kind.
      await database.prepare(`INSERT INTO download_visitors (visitor_id, kind) VALUES (?, ?)
        ON CONFLICT(visitor_id) DO NOTHING`).bind(id, format.bucket).run();
    } catch {
      // A statistics outage must not prevent someone from downloading the launcher.
      console.warn('Website download counter write unavailable');
    }
  }
  return redirect(target, cookie);
}
