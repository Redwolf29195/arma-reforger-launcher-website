import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (base, file) => readFile(path.join(base, file), 'utf8');

// Exercise every supported route even before Linux assets reach release.json.
const fixtureRelease = {
  version: '9.8.7',
  publishedAt: '2026-01-01T00:00:00Z',
  platform: 'Windows 10/11 x64; Linux x64 (Ubuntu / Linux Mint)',
  downloads: Object.fromEntries(Object.entries({
    setup: 'x64-Setup.exe', portable: 'x64-Portable.exe',
    deb: 'linux-x64.deb', appimage: 'linux-x64.AppImage'
  }).map(([kind, suffix]) => {
    const filename = `Arma-Reforger-Launcher-9.8.7-${suffix}`;
    return [kind, { filename, bytes: 12345678, sha256: 'A'.repeat(64), available: true,
      url: `https://github.com/Redwolf29195/arma-reforger-launcher-updates/releases/download/v9.8.7/${filename}` }];
  }))
};

test('production build has one canonical site, valid metadata and compatible downloads', async t => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'armalauncher-seo-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  for (const dir of ['tools', 'lib', 'public']) await cp(path.join(root, dir), path.join(fixture, dir), { recursive: true });
  await writeFile(path.join(fixture, 'release.json'), JSON.stringify(fixtureRelease));
  const env = { ...process.env, SITE_URL: '', CF_PAGES: '1', CF_PAGES_BRANCH: 'main', CF_PAGES_URL: 'https://test-build.pages.dev' };
  const build = (extra = {}) => execFileSync(process.execPath, ['tools/build-pages.mjs'], { cwd: fixture, env: { ...env, ...extra }, stdio: 'pipe' });
  build();
  const dist = path.join(fixture, 'dist');
  const html = await read(dist, 'index.html');
  assert.match(html, /<title>ArmaLauncher — Launcher for Arma Reforger<\/title>/);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  assert.match(html, /<h1>ArmaLauncher<\/h1>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/armalauncher.net\/">/);
  assert.doesNotMatch(html, /armalaucher\.com|playit\.plus|pages\.dev|localhost|noindex|nofollow/i);
  for (const property of ['title', 'description', 'url', 'site_name', 'type', 'image']) assert.match(html, new RegExp(`property="og:${property}" content="[^"]+"`));
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  const graph = JSON.parse(json)['@graph'];
  const website = graph.find(item => item['@type'] === 'WebSite');
  assert.equal(website.name, 'ArmaLauncher');
  assert.equal(website.url, 'https://armalauncher.net/');
  assert.deepEqual(website.alternateName, ['Arma Launcher', 'Arma Reforger Launcher']);
  assert.equal(graph.find(item => item['@type'] === 'SoftwareApplication').operatingSystem, 'Windows 10/11 x64; Linux x64 (Ubuntu / Linux Mint)');
  assert.doesNotMatch(json, /aggregateRating|reviewCount|offers|price|datePublished/);
  const headers = await read(dist, '_headers');
  const digest = createHash('sha256').update(json.replace(/\r\n/g, '\n')).digest('base64');
  assert.ok(headers.includes(`'sha256-${digest}'`), 'JSON-LD allowed by the exact CSP hash');
  assert.doesNotMatch(headers.split('/404')[0], /noindex|unsafe-inline/);
  const robots = await read(dist, 'robots.txt');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/armalauncher.net\/sitemap.xml/);
  assert.doesNotMatch(robots, /Disallow: \//);
  const sitemap = await read(dist, 'sitemap.xml');
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]), ['https://armalauncher.net/']);
  assert.match(await read(dist, '404.html'), /name="robots" content="noindex"/);
  const release = JSON.parse(await read(dist, 'release.json'));
  assert.ok(html.includes(`data-copy-hash="${release.downloads.setup.sha256}"`));
  const redirects = await read(dist, '_redirects');
  for (const [kind, download] of Object.entries(release.downloads)) {
    assert.ok(html.includes(`data-download="${kind}" href="/get/${kind}"`));
    assert.ok(redirects.includes(`/downloads/${download.filename} ${download.url} 302`));
    assert.ok(redirects.includes(`/updates/${download.filename} ${download.url} 302`));
  }
  assert.ok(redirects.includes('/updates/latest.yml https://github.com/Redwolf29195/arma-reforger-launcher-updates/releases/latest/download/latest.yml 302'));
  assert.deepEqual(JSON.parse(await read(dist, '_routes.json')).include, ['/get/*', '/api/download-stats', '/api/download-stats/', '/store/*']);
  for (const [, src] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)/g)) await readFile(path.join(dist, src));
  for (const [img] of html.matchAll(/<img\b[^>]*>/g)) assert.ok(/width="\d+"/.test(img) && /height="\d+"/.test(img), img);
  build({ CF_PAGES_BRANCH: 'seo-preview' });
  assert.match((await read(dist, '_headers')).split('/404')[0], /X-Robots-Tag: noindex/);
  assert.match(await read(dist, 'index.html'), /canonical" href="https:\/\/armalauncher.net\/"/);
  assert.throws(() => build({ SITE_URL: 'https://obsolete.example' }), /SITE_URL must be/);
});

test('local HTTP serves indexable HTML, real 404s and safe download HEAD requests', async t => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'armalauncher-http-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    await rm(fixture, { recursive: true, force: true });
  });
  for (const dir of ['lib', 'public', 'migrations']) await cp(path.join(root, dir), path.join(fixture, dir), { recursive: true });
  await cp(path.join(root, 'server.mjs'), path.join(fixture, 'server.mjs'));
  await writeFile(path.join(fixture, 'release.json'), JSON.stringify(fixtureRelease));
  child = spawn(process.execPath, ['server.mjs'], { cwd: fixture, env: { ...process.env, HOST: '127.0.0.1', PORT: '0', WEBSITE_COUNTER_PATH: ':memory:' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const address = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', data => { output += data; const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/); if (match) resolve(`http://127.0.0.1:${match[1]}`); });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  const home = await fetch(address);
  assert.equal(home.status, 200);
  assert.equal(home.headers.get('x-robots-tag'), null);
  assert.match(await home.text(), /<h1>ArmaLauncher<\/h1>/);
  for (const route of ['/missing-seo-test', '/download', '/assets/']) {
    const response = await fetch(address + route);
    assert.equal(response.status, 404, route);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex');
    assert.match(await response.text(), /Page not found/);
  }
  const releaseResponse = await fetch(address + '/api/release');
  assert.equal(releaseResponse.status, 200);
  assert.deepEqual(await releaseResponse.json(), fixtureRelease);
  const unknownStoreInstaller = await fetch(address + '/store/0.0.0/missing.exe');
  assert.equal(unknownStoreInstaller.status, 404);
  assert.equal(unknownStoreInstaller.headers.get('location'), null);
  for (const kind of Object.keys(fixtureRelease.downloads)) {
    const response = await fetch(`${address}/get/${kind}`, { method: 'HEAD', redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), fixtureRelease.downloads[kind].url);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(await response.text(), '');
  }
  const initialStats = await fetch(address + '/api/download-stats');
  assert.equal((await initialStats.json()).total, 0);
  const cookie = initialStats.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^arma_download=/);
  for (const kind of Object.keys(fixtureRelease.downloads)) {
    const prefetch = await fetch(`${address}/get/${kind}`, { headers: { Cookie: cookie, Purpose: 'prefetch' }, redirect: 'manual' });
    assert.equal(prefetch.status, 302);
    assert.equal(prefetch.headers.get('location'), fixtureRelease.downloads[kind].url);
    assert.equal(prefetch.headers.get('set-cookie'), null);
  }
  assert.equal((await (await fetch(address + '/api/download-stats')).json()).total, 0);
  for (const kind of ['appimage', 'deb', 'setup', 'portable', 'appimage']) {
    const response = await fetch(`${address}/get/${kind}`, { headers: { Cookie: cookie }, redirect:'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), fixtureRelease.downloads[kind].url);
  }
  const repeatedStats = await fetch(address + '/api/download-stats');
  assert.deepEqual(await repeatedStats.json(), { total:1, setup:0, portable:1, source:'website', excludesUpdates:true });
  const secondCookie = repeatedStats.headers.get('set-cookie').split(';')[0];
  const installer = await fetch(`${address}/get/deb`, { headers: { Cookie: secondCookie }, redirect: 'manual' });
  assert.equal(installer.status, 302);
  assert.deepEqual(await (await fetch(address + '/api/download-stats')).json(), { total:2, setup:1, portable:1, source:'website', excludesUpdates:true });
});
