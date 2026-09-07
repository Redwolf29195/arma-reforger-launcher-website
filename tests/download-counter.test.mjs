import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalCounter } from '../lib/local-counter.mjs';
import { downloadFromWebsite, downloadStats } from '../lib/download-counter.mjs';

const release = JSON.parse(await readFile(new URL('../release.json', import.meta.url), 'utf8'));
const request = (kind = 'setup', options = {}) => new Request(`https://armalaucher.com/get/${kind}`, options);
const stats = async database => (await downloadStats(new Request('https://armalaucher.com/api/download-stats'), database)).json();

test('counts Setup and Portable requests atomically without losing concurrent downloads', async () => {
  const database = await createLocalCounter(':memory:');
  try {
    assert.equal((await stats(database)).total, 0);
    const results = await Promise.all(Array.from({ length: 120 }, (_, index) => {
      const kind = index % 3 ? 'setup' : 'portable';
      return downloadFromWebsite(request(kind), kind, { database, loadRelease: async () => release });
    }));
    assert(results.every(result => result.status === 302 && result.headers.get('cache-control') === 'no-store'));
    assert.deepEqual(await stats(database), { total:120, setup:80, portable:40, source:'website', excludesUpdates:true });
  } finally { database.close(); }
});

test('HEAD, prefetch, invalid kinds and stats reads never increase the counter', async () => {
  const database = await createLocalCounter(':memory:');
  try {
    for (const options of [{ method:'HEAD' },{ headers:{Purpose:'prefetch'} },{ headers:{'Sec-Purpose':'prefetch;prerender'} }]) {
      assert.equal((await downloadFromWebsite(request('setup', options), 'setup', { database, loadRelease:async () => release })).status, 302);
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
  const unavailable = await downloadStats(new Request('https://armalaucher.com/api/download-stats'), broken);
  assert.equal(unavailable.status, 503); assert.equal('total' in await unavailable.json(), false);
  assert.equal((await downloadStats(new Request('https://armalaucher.com/api/download-stats'), null)).status, 503);
});

test('unavailable releases and foreign URLs cannot count or redirect downloads', async () => {
  const database = await createLocalCounter(':memory:');
  try {
    for (const mutation of [{ available:false },{ url:'https://example.com/other.exe' },{ filename:'other.exe' }]) {
      const invalid = structuredClone(release);
      Object.assign(invalid.downloads.setup, mutation);
      assert.equal((await downloadFromWebsite(request(), 'setup', { database, loadRelease:async () => invalid })).status, 503);
    }
    assert.equal((await stats(database)).total, 0);
  } finally { database.close(); }
});

test('download totals survive restarting the backend and reapplying the migration', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'launcher-download-counter-'));
  const filename = path.join(directory, 'counter.sqlite');
  let database = await createLocalCounter(filename);
  await downloadFromWebsite(request(), 'setup', { database, loadRelease:async () => release });
  database.close();
  database = await createLocalCounter(filename);
  try { assert.equal((await stats(database)).total, 1); } finally { database.close(); }
});
