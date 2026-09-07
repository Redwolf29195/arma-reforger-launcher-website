CREATE TABLE IF NOT EXISTS download_counts (
  kind TEXT PRIMARY KEY CHECK (kind IN ('setup', 'portable')),
  total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO download_counts (kind, total) VALUES ('setup', 0), ('portable', 0);
