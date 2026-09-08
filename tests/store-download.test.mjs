import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadStoreInstaller, STORE_INSTALLERS } from '../lib/store-download.mjs';
import { onRequest } from '../functions/store/[[path]].js';

const route = Object.keys(STORE_INSTALLERS)[0];
const original = STORE_INSTALLERS[route];
const file = new Uint8Array([77, 90, 1, 2, 3, 4]);
const fixture = { ...original, bytes: file.length };
const publicUrl = `https://armalauncher.net${route}`;

function setup({ redirectStatus = 302, redirectUrl, upstreamStatus, upstreamHeaders = {}, fail = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), ...options });
    assert.equal(options.redirect, 'manual');
    if (fail) throw new Error('Simulated upstream outage');
    if (calls.length === 1) return new Response(null, {
      status: redirectStatus,
      headers: { Location: redirectUrl || `https://release-assets.githubusercontent.com${fixture.assetPath}?temporary=test` }
    });
    const range = new Headers(options.headers).get('range');
    const match = range?.match(/^bytes=(\d+)-(\d+)$/);
    const bytes = match ? file.slice(Number(match[1]), Number(match[2]) + 1) : file;
    return new Response(options.method === 'HEAD' ? null : bytes, {
      status: upstreamStatus ?? (range ? 206 : 200),
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.length),
        ETag: fixture.upstreamETag,
        'Set-Cookie': 'upstream=private',
        ...(range ? { 'Content-Range': `bytes ${match[1]}-${match[2]}/${file.length}` } : {}),
        ...upstreamHeaders
      }
    });
  };
  const run = (options = {}, url = publicUrl) => downloadStoreInstaller(new Request(url, options), {
    fetchImpl, installers: { [route]: fixture }
  });
  return { calls, run };
}

test('direct GET streams the fixed installer without redirects, cookies or forwarded credentials', async () => {
  const { calls, run } = setup();
  const result = await run({ headers: { Cookie: 'visitor=secret', Authorization: 'Bearer private', 'X-Forwarded-For': '192.0.2.1' } });
  assert.equal(result.status, 200);
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), file);
  assert.equal(result.headers.get('content-length'), String(file.length));
  assert.equal(result.headers.get('location'), null);
  assert.equal(result.headers.get('set-cookie'), null);
  assert.equal(result.headers.get('content-disposition'), `attachment; filename="${fixture.filename}"`);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, fixture.source);
  assert.equal(new Headers(calls[1].headers).get('if-match'), fixture.upstreamETag);
  for (const call of calls) {
    const headers = new Headers(call.headers);
    for (const name of ['cookie', 'authorization', 'x-forwarded-for']) assert.equal(headers.get(name), null);
  }
});

test('HEAD verifies the origin and returns full metadata without downloading a body', async () => {
  const { calls, run } = setup();
  const result = await run({ method: 'HEAD', headers: { Range: 'bytes=0-1' } });
  assert.equal(result.status, 200);
  assert.equal(result.body, null);
  assert.equal(result.headers.get('content-length'), String(file.length));
  assert.equal(result.headers.get('accept-ranges'), 'bytes');
  assert.ok(calls.every(call => call.method === 'HEAD'));
  assert.equal(new Headers(calls[1].headers).get('range'), null);
});

for (const [value, start, end] of [['bytes=0-1', 0, 1], ['bytes=2-', 2, 5], ['bytes=-2', 4, 5], ['bytes=-100', 0, 5], ['bytes=3-100', 3, 5]]) {
  test(`resumable download ${value}`, async () => {
    const { run } = setup();
    const result = await run({ headers: { Range: value } });
    assert.equal(result.status, 206);
    assert.equal(result.headers.get('content-range'), `bytes ${start}-${end}/${file.length}`);
    assert.equal(result.headers.get('content-length'), String(end - start + 1));
    assert.deepEqual(new Uint8Array(await result.arrayBuffer()), file.slice(start, end + 1));
  });
}

test('If-Range only allows a partial response for the pinned file validator', async () => {
  for (const validator of [`"sha256-${fixture.sha256}"`, fixture.lastModified, '"old-version"']) {
    const { run } = setup();
    const result = await run({ headers: { Range: 'bytes=0-1', 'If-Range': validator } });
    assert.equal(result.status, validator === '"old-version"' ? 200 : 206);
    await result.body.cancel();
  }
});

test('invalid ranges return 416 before making an upstream request', async () => {
  for (const value of ['bytes=6-', 'bytes=4-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4', 'items=0-1', 'bytes=9007199254740992-']) {
    const { calls, run } = setup();
    const result = await run({ headers: { Range: value } });
    assert.equal(result.status, 416, value);
    assert.equal(result.headers.get('content-range'), `bytes */${file.length}`);
    assert.equal(calls.length, 0);
  }
});

test('only allowlisted exact version URLs and read-only methods are accepted', async () => {
  for (const [url, method, status] of [
    [publicUrl, 'POST', 405],
    [publicUrl + '?url=https://example.com', 'GET', 404],
    [publicUrl + '/', 'HEAD', 404],
    ['https://armalauncher.net/store/latest/setup.exe', 'GET', 404],
    ['https://armalauncher.net/store/0.3.99/setup.exe', 'GET', 404]
  ]) {
    const { calls, run } = setup();
    const result = await run({ method }, url);
    assert.equal(result.status, status);
    assert.equal(result.headers.get('location'), null);
    assert.equal(calls.length, 0);
    if (method === 'HEAD') assert.equal(result.body, null);
  }
});

test('replaced assets and unsafe redirects fail closed without fetching their bodies', async () => {
  for (const redirectUrl of [
    'https://example.com/installer.exe',
    `http://release-assets.githubusercontent.com${fixture.assetPath}`,
    `https://release-assets.githubusercontent.com${fixture.assetPath}-replacement`,
    `https://user:password@release-assets.githubusercontent.com${fixture.assetPath}`
  ]) {
    const { calls, run } = setup({ redirectUrl });
    const result = await run();
    assert.equal(result.status, 502);
    assert.equal(calls.length, 1);
    assert.equal(result.headers.get('location'), null);
  }
});

test('upstream outages and changes cannot become successful or cached downloads', async () => {
  for (const options of [
    { fail: true }, { redirectStatus: 404 }, { upstreamStatus: 403 },
    { upstreamHeaders: { ETag: '"replacement"' } },
    { upstreamHeaders: { 'Content-Length': '999' } },
    { upstreamHeaders: { 'Content-Type': 'text/html' } },
    { upstreamHeaders: { 'Content-Encoding': 'gzip' } }
  ]) {
    const { run } = setup(options);
    const result = await run();
    assert.equal(result.status, 502);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(result.headers.get('set-cookie'), null);
  }
  const { run } = setup({ upstreamHeaders: { 'Content-Range': 'bytes 0-1/999' } });
  assert.equal((await run({ headers: { Range: 'bytes=0-1' } })).status, 502);
});

test('Pages entry point rejects unknown versions without assets, counters or other bindings', async () => {
  const result = await onRequest({ request: new Request('https://armalauncher.net/store/unknown.exe') });
  assert.equal(result.status, 404);
});
