import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateSiteUrl, contentSecurityPolicy } from '../lib/site-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
validateSiteUrl(process.env.SITE_URL);
const isPreview = process.env.CF_PAGES === '1' && process.env.CF_PAGES_BRANCH && process.env.CF_PAGES_BRANCH !== 'main';
const release = JSON.parse(await readFile(path.join(root, 'release.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(release.version)) throw new Error('Invalid release version');
const releases = 'https://github.com/Redwolf29195/arma-reforger-launcher-updates/releases';
const downloadRoot = `${releases}/download/v${release.version}`;
const redirects = [
  '/api/release /release.json 200',
  '/health /health.json 200',
  '/updates /#download 302',
  '/updates/ /#download 302',
  `/updates/latest.yml ${releases}/latest/download/latest.yml 302`
];

await mkdir(output, { recursive: true });
await cp(path.join(root, 'public'), output, { recursive: true });
let html = await readFile(path.join(output, 'index.html'), 'utf8');
for (const [kind, download] of Object.entries(release.downloads)) {
  if (!download.filename.startsWith(`Arma-Reforger-Launcher-${release.version}-`)
      || path.basename(download.filename) !== download.filename) {
    throw new Error(`Invalid ${kind} download filename`);
  }
  download.url = `${downloadRoot}/${encodeURIComponent(download.filename)}`;
  redirects.push(`/updates/${download.filename} ${download.url} 302`);
  redirects.push(`/downloads/${download.filename} ${download.url} 302`);
  html = html.replaceAll(
    new RegExp(`(data-download="${kind}" href=")[^"]+`, 'g'),
    `$1/get/${kind}`
  );
  html = html.replaceAll(
    new RegExp(`(<[^>]+data-release-size="${kind}"[^>]*>)[^<]+`, 'g'),
    `$1${(download.bytes / 1024 / 1024).toFixed(1)} MB`
  );
}
const setup = release.downloads.setup.filename;
for (const suffix of ['.blockmap', '.algz.json']) {
  redirects.push(`/updates/${setup}${suffix} ${downloadRoot}/${setup}${suffix} 302`);
}

// A build pins filenames to their release so later releases cannot break existing links.
html = html.replace(/(<[^>]+data-release-version[^>]*>)[^<]+/g, `$1${release.version}`);
html = html.replace(/data-copy-hash="[^"]*"/, `data-copy-hash="${release.downloads.setup.sha256}"`);
for (const asset of ['app.js', 'styles.css']) {
  const digest = createHash('sha256').update(await readFile(path.join(output, asset))).digest('hex').slice(0, 12);
  html = html.replaceAll(new RegExp(`(/${asset.replace('.', '\\.')})(?:\\?v=[^"\\s]*)?(?=")`, 'g'), `$1?v=${digest}`);
}
await writeFile(path.join(output, 'index.html'), html);
await writeFile(path.join(output, 'release.json'), `${JSON.stringify(release, null, 2)}\n`);
await writeFile(path.join(output, 'health.json'), JSON.stringify({ status: 'ok', version: release.version }));
await writeFile(path.join(output, '_redirects'), `${redirects.join('\n')}\n`);
await writeFile(path.join(output, '_routes.json'), JSON.stringify({
  version: 1,
  include: ['/get/*', '/api/download-stats', '/api/download-stats/', '/store/*'],
  exclude: []
}));
await writeFile(path.join(output, '_headers'), `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: ${contentSecurityPolicy(html)}
${isPreview ? '  X-Robots-Tag: noindex\n' : ''}/404
  X-Robots-Tag: noindex
/404.html
  X-Robots-Tag: noindex
/release.json
  Cache-Control: no-cache
  X-Robots-Tag: noindex
/api/release
  Cache-Control: no-cache
  X-Robots-Tag: noindex
/health
  X-Robots-Tag: noindex
/health.json
  X-Robots-Tag: noindex
`);
console.log(`Cloudflare Pages build ready: dist (release ${release.version})`);
