import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (base, file) => readFile(path.join(base, file), 'utf8');

test('production build has one canonical site, valid metadata and compatible downloads', async t => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'armalauncher-seo-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  for (const dir of ['tools', 'lib', 'public']) await cp(path.join(root, dir), path.join(fixture, dir), { recursive: true });
  await cp(path.join(root, 'release.json'), path.join(fixture, 'release.json'));
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
  assert.equal(graph.find(item => item['@type'] === 'SoftwareApplication').operatingSystem, 'Windows 10/11 x64');
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
  const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: '0', WEBSITE_COUNTER_PATH: ':memory:' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); });
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
  assert.equal((await fetch(address + '/api/release')).status, 200);
  const unknownStoreInstaller = await fetch(address + '/store/0.0.0/missing.exe');
  assert.equal(unknownStoreInstaller.status, 404);
  assert.equal(unknownStoreInstaller.headers.get('location'), null);
  for (const kind of ['setup', 'portable']) {
    const response = await fetch(`${address}/get/${kind}`, { method: 'HEAD', redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location'), /^https:\/\/github.com\/Redwolf29195\/arma-reforger-launcher-updates\/releases\/download\//);
  }
  const initialStats = await fetch(address + '/api/download-stats');
  assert.equal((await initialStats.json()).total, 0);
  const cookie = initialStats.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^arma_download=/);
  for (const kind of ['setup', 'portable', 'setup']) {
    const response = await fetch(`${address}/get/${kind}`, { headers: { Cookie: cookie }, redirect:'manual' });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location'), /^https:\/\/github.com\//);
  }
  assert.equal((await (await fetch(address + '/api/download-stats')).json()).total, 1);
});
