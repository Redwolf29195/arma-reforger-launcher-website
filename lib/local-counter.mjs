import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export async function createLocalCounter(filename) {
  const { DatabaseSync } = await import('node:sqlite');
  if (filename !== ':memory:') await mkdir(path.dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const migrations = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    sqlite.exec(await readFile(new URL(name, migrations), 'utf8'));
  }
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
