import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function createLocalCounter(filename) {
  const { DatabaseSync } = await import('node:sqlite');
  if (filename !== ':memory:') await mkdir(path.dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  sqlite.exec(await readFile(new URL('../migrations/0001_download_counts.sql', import.meta.url), 'utf8'));
  return {
    close: () => sqlite.close(),
    prepare(sql) {
      let parameters = [];
      return {
        bind(...values) { parameters = values; return this; },
        async first() { return sqlite.prepare(sql).get(...parameters); },
        async run() { return sqlite.prepare(sql).run(...parameters); }
      };
    }
  };
}
