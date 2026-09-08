import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalCounter } from '../lib/local-counter.mjs';
import { downloadFromWebsite, downloadStats } from '../lib/download-counter.mjs';

// Counter behavior must not depend on which platforms are publicly released yet.
const formats = {
  setup: 'x64-Setup.exe', portable: 'x64-Portable.exe',
  deb: 'linux-x64.deb', appimage: 'linux-x64.AppImage'
};
const release = {
  version: '9.8.7',
  downloads: Object.fromEntries(Object.entries(formats).map(([kind, suffix]) => {
    const filename = `Arma-Reforger-Launcher-9.8.7-${suffix}`;
    return [kind, { filename, available: true,
      url: `https://github.com/Redwolf29195/arma-reforger-launcher-updates/releases/download/v9.8.7/${filename}` }];
  }))
};
const kinds = Object.keys(formats);
const browserCookie = () => `__Host-arma_download=${crypto.randomUUID()}`;
const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0];
const request = (kind = 'setup', options = {}) => {
  const headers = new Headers(options.headers);
  if (!headers.has('Cookie')) headers.set('Cookie', browserCookie());
  return new Request(`https://armalauncher.net/get/${kind}`, { ...options, headers });
};
const stats = async database => (await downloadStats(new Request('https://armalauncher.net/api/download-stats'), database)).json();

test('counts all four formats from different browsers atomically in the historical buckets', async () => {
  const database = await createLocalCounter(':memory:');
  try {
    assert.equal((await stats(database)).total, 0);
    const results = await Promise.all(Array.from({ length: 120 }, (_, index) => {
      const kind = kinds[index % kinds.length];
      return downloadFromWebsite(request(kind), kind, { database, loadRelease: async () => release });
    }));
    assert(results.every(result => result.status === 302 && result.headers.get('cache-control') === 'no-store'));
    results.forEach((result, index) => assert.equal(result.headers.get('location'), release.downloads[kinds[index % kinds.length]].url));
    assert.deepEqual(await stats(database), { total:120, setup:60, portable:60, source:'website', excludesUpdates:true });
  } finally { database.close(); }
});

test('simultaneous first requests from one identified browser increment once', async () => {
  const database = await createLocalCounter(':memory:');
  const headers = { Cookie: browserCookie() };
  try {
    const responses = await Promise.all(Array.from({ length:40 }, () =>
      downloadFromWebsite(request('setup', { headers }), 'setup', { database, loadRelease: async () => release })));
    assert(responses.every(response => response.status === 302));
    assert.equal((await stats(database)).total, 1);
  } finally { database.close(); }
});

test('repeat downloads share one count across concurrent clicks, Windows, Linux and releases', async () => {
  const database = await createLocalCounter(':memory:');
  const headers = { Cookie: browserCookie() };
  try {
    await downloadFromWebsite(request('setup', { headers }), 'setup', { database, loadRelease: async () => release });
    const newer = structuredClone(release);
    newer.version = '99.0.0';
    for (const download of Object.values(newer.downloads)) {
      download.filename = download.filename.replace(release.version, newer.version);
      download.url = download.url.replaceAll(release.version, newer.version);
    }
    const results = await Promise.all(Array.from({ length: 80 }, (_, index) => {
      const kind = kinds[index % kinds.length];
      return downloadFromWebsite(request(kind, { headers }), kind, { database, loadRelease: async () => index % 3 ? release : newer });
    }));
    assert(results.every(response => response.status === 302));
    assert.deepEqual(await stats(database), { total:1, setup:1, portable:0, source:'website', excludesUpdates:true });
    assert.equal((await database.prepare('SELECT COUNT(*) AS total FROM download_visitors').first()).total, 1);
  } finally { database.close(); }
});

test('a Linux-first browser stays deduplicated when it later downloads either operating system', async () => {
  const database = await createLocalCounter(':memory:');
  const headers = { Cookie: browserCookie() };
  try {
    const first = await downloadFromWebsite(request('appimage', { headers }), 'appimage', { database, loadRelease: async () => release });
    assert.equal(first.headers.get('location'), release.downloads.appimage.url);
    for (const kind of kinds) {
      assert.equal((await downloadFromWebsite(request(kind, { headers }), kind, { database, loadRelease: async () => release })).status, 302);
    }
    assert.deepEqual(await stats(database), { total:1, setup:0, portable:1, source:'website', excludesUpdates:true });
    assert.equal((await database.prepare('SELECT COUNT(*) AS total FROM download_visitors').first()).total, 1);
  } finally { database.close(); }
});

test('deb and AppImage increment existing installer and portable totals without new database kinds', async () => {
  const database = await createLocalCounter(':memory:');
  try {
    await database.prepare("UPDATE download_counts SET total = CASE kind WHEN 'setup' THEN 14 ELSE 13 END").run();
    for (const kind of ['deb', 'appimage']) {
      const response = await downloadFromWebsite(request(kind), kind, { database, loadRelease: async () => release });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), release.downloads[kind].url);
    }
    assert.deepEqual(await stats(database), { total:29, setup:15, portable:14, source:'website', excludesUpdates:true });
    assert.equal((await database.prepare("SELECT COUNT(*) AS total FROM download_counts WHERE kind NOT IN ('setup', 'portable')").first()).total, 0);
  } finally { database.close(); }
});

test('stats prepares a private browser cookie without counting a download', async () => {
  const database = await createLocalCounter(':memory:');
  try {
    const response = await downloadStats(new Request('https://armalauncher.net/api/download-stats'), database);
    const cookie = cookieFrom(response);
    assert.match(cookie, /^__Host-arma_download=[0-9a-f-]{36}$/);
    assert.match(response.headers.get('set-cookie'), /Path=\/; Max-Age=34560000; HttpOnly; SameSite=Lax; Secure$/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).total, 0);
    const repeated = await downloadStats(new Request('https://armalauncher.net/api/download-stats', { headers: { Cookie: cookie } }), database);
    assert.equal(cookieFrom(repeated), cookie);
    const head = await downloadStats(new Request('https://armalauncher.net/api/download-stats', { method:'HEAD' }), database);
    assert.equal(head.headers.get('set-cookie'), null);
    assert.equal(await head.text(), '');
    await downloadFromWebsite(request('portable', { headers: { Cookie: cookie } }), 'portable', { database, loadRelease: async () => release });
    assert.equal((await stats(database)).total, 1);
  } finally { database.close(); }
});

test('direct links confirm a cookie once and never loop if cookies are blocked', async () => {
  const database = await createLocalCounter(':memory:');
  try {
    for (const Cookie of ['', '__Host-arma_download=invalid']) {
      const first = await downloadFromWebsite(request('setup', { headers: { Cookie } }), 'setup', { database, loadRelease: async () => release });
      const retry = first.headers.get('location');
      assert.match(retry, /^https:\/\/armalauncher.net\/get\/setup\?__arma_cookie_check=1$/);
      assert.equal((await stats(database)).total, 0);
      const blocked = await downloadFromWebsite(new Request(retry), 'setup', { database, loadRelease: async () => release });
      assert.equal(blocked.headers.get('location'), release.downloads.setup.url);
      assert.equal(blocked.headers.get('set-cookie'), null);
      assert.equal((await stats(database)).total, 0);
    }
    const first = await downloadFromWebsite(request('setup', { headers: { Cookie: '' } }), 'setup', { database, loadRelease: async () => release });
    const cookie = cookieFrom(first);
    const accepted = await downloadFromWebsite(new Request(first.headers.get('location'), { headers: { Cookie: cookie } }), 'setup', { database, loadRelease: async () => release });
    assert.equal(accepted.headers.get('location'), release.downloads.setup.url);
    await downloadFromWebsite(request('portable', { headers: { Cookie: cookie } }), 'portable', { database, loadRelease: async () => release });
    assert.equal((await stats(database)).total, 1);
  } finally { database.close(); }
});

test('HEAD, prefetch, invalid kinds and stats reads never increase the counter', async () => {
  const database = await createLocalCounter(':memory:');
  try {
    for (const kind of kinds) {
      for (const options of [{ method:'HEAD' },{ headers:{Purpose:'prefetch'} },{ headers:{'Sec-Purpose':'prefetch;prerender'} }]) {
        const response = await downloadFromWebsite(request(kind, options), kind, { database, loadRelease:async () => release });
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('set-cookie'), null);
        assert.equal(response.headers.get('location'), release.downloads[kind].url);
        assert.equal(await response.text(), '');
      }
      assert.equal((await downloadFromWebsite(request(kind, {method:'POST'}), kind, { database, loadRelease:async () => release })).status, 405);
    }
    assert.equal((await downloadFromWebsite(request('invalid'), 'invalid', { database, loadRelease:async () => release })).status, 404);
    assert.equal((await downloadFromWebsite(request('setup', {method:'POST'}), 'setup', { database, loadRelease:async () => release })).status, 405);
    await stats(database); await stats(database);
    assert.equal((await stats(database)).total, 0);
  } finally { database.close(); }
});

test('a statistics failure does not break downloads and is never reported as a zero', async () => {
  const broken = { prepare() { throw new Error('Simulated database failure'); } };
  const response = await downloadFromWebsite(request(), 'setup', { database:broken, loadRelease:async () => release });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), release.downloads.setup.url);
  const unavailable = await downloadStats(new Request('https://armalauncher.net/api/download-stats'), broken);
  assert.equal(unavailable.status, 503); assert.equal('total' in await unavailable.json(), false);
  assert.equal((await downloadStats(new Request('https://armalauncher.net/api/download-stats'), null)).status, 503);
});

test('unavailable releases, wrong OS formats and foreign URLs cannot count or redirect any download', async () => {
  const database = await createLocalCounter(':memory:');
  try {
    for (const kind of kinds) {
      for (const mutation of [
        { available:false }, { available:'true' }, { url:'https://example.com/other.exe' },
        { filename:'other.exe' }, { filename:release.downloads[kind === 'setup' ? 'deb' : 'setup'].filename },
        { url:release.downloads[kind].url.replace('/v9.8.7/', '/v9.8.6/') },
        { url:`${release.downloads[kind].url}?redirect=elsewhere` }
      ]) {
        const invalid = structuredClone(release);
        Object.assign(invalid.downloads[kind], mutation);
        const response = await downloadFromWebsite(request(kind), kind, { database, loadRelease:async () => invalid });
        assert.equal(response.status, 503);
        assert.equal(response.headers.get('location'), null);
        assert.equal(response.headers.get('set-cookie'), null);
      }
      const missing = structuredClone(release);
      delete missing.downloads[kind];
      assert.equal((await downloadFromWebsite(request(kind), kind, { database, loadRelease:async () => missing })).status, 503);
    }
    assert.equal((await stats(database)).total, 0);
  } finally { database.close(); }
});

test('historical totals and browser deduplication survive restarts and migration reapplication', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'launcher-download-counter-'));
  const filename = path.join(directory, 'counter.sqlite');
  let database = await createLocalCounter(filename);
  const headers = { Cookie: browserCookie() };
  try {
    await database.prepare("UPDATE download_counts SET total = CASE kind WHEN 'setup' THEN 14 ELSE 13 END").run();
    await downloadFromWebsite(request('deb', { headers }), 'deb', { database, loadRelease:async () => release });
    database.close();
    database = await createLocalCounter(filename);
    await downloadFromWebsite(request('appimage', { headers }), 'appimage', { database, loadRelease:async () => release });
    await downloadFromWebsite(request('setup', { headers }), 'setup', { database, loadRelease:async () => release });
    assert.deepEqual(await stats(database), { total:28, setup:15, portable:13, source:'website', excludesUpdates:true });
  } finally { database.close(); await rm(directory, { recursive:true, force:true }); }
});

test('a failed increment rolls back the visitor so a later download can be counted', async () => {
  const database = await createLocalCounter(':memory:');
  const headers = { Cookie: browserCookie() };
  try {
    await database.prepare("CREATE TRIGGER simulate_outage BEFORE UPDATE ON download_counts BEGIN SELECT RAISE(ABORT, 'test outage'); END").run();
    const failed = await downloadFromWebsite(request('setup', { headers }), 'setup', { database, loadRelease:async () => release });
    assert.equal(failed.status, 302);
    assert.equal((await stats(database)).total, 0);
    assert.equal((await database.prepare('SELECT COUNT(*) AS total FROM download_visitors').first()).total, 0);
    await database.prepare('DROP TRIGGER simulate_outage').run();
    await downloadFromWebsite(request('setup', { headers }), 'setup', { database, loadRelease:async () => release });
    assert.equal((await stats(database)).total, 1);
  } finally { database.close(); }
});
