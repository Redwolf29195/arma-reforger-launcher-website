const DOWNLOAD_KINDS = new Set(['setup', 'portable']);
const RELEASE_ROOT = 'https://github.com/Redwolf29195/arma-reforger-launcher-updates/releases/download';

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': status === 200 ? 'public, max-age=15, s-maxage=15' : 'no-store',
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
    const response = json({ ...counts, source: 'website', excludesUpdates: true });
    return request.method === 'HEAD' ? new Response(null, response) : response;
  } catch {
    return json({ error: 'Counter unavailable' }, 503);
  }
}

export async function downloadFromWebsite(request, kind, { database, loadRelease }) {
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, HEAD' });
  if (!DOWNLOAD_KINDS.has(kind)) return json({ error: 'Unknown download' }, 404);
  let target;
  try {
    const release = await loadRelease();
    if (!/^\d+\.\d+\.\d+$/.test(release.version)) throw new Error('Invalid release');
    const download = release.downloads?.[kind];
    const suffix = kind === 'setup' ? 'Setup' : 'Portable';
    const filename = `Arma-Reforger-Launcher-${release.version}-x64-${suffix}.exe`;
    target = `${RELEASE_ROOT}/v${release.version}/${filename}`;
    if (download?.available !== true || download.filename !== filename || download.url !== target) throw new Error('Unavailable release');
  } catch {
    return json({ error: 'Download temporarily unavailable' }, 503);
  }

  const purpose = `${request.headers.get('purpose') || ''} ${request.headers.get('sec-purpose') || ''}`;
  // Auto-updates use the existing GitHub URLs and never call this website route.
  // HEAD checks and browser prefetches must not count as download requests.
  if (request.method === 'GET' && !/prefetch|prerender/i.test(purpose) && database) {
    try {
      await database.prepare(`INSERT INTO download_counts (kind, total) VALUES (?, 1)
        ON CONFLICT(kind) DO UPDATE SET total = total + 1, updated_at = CURRENT_TIMESTAMP`).bind(kind).run();
    } catch {
      // A statistics outage must not prevent someone from downloading the launcher.
      console.warn('Website download counter write unavailable');
    }
  }
  return new Response(null, { status: 302, headers: {
    Location: target,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow'
  } });
}
