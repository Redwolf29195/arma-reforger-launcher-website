-- Existing totals remain intact; historical requests have no visitor IDs.
CREATE TABLE IF NOT EXISTS download_visitors (
  visitor_id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('setup', 'portable'))
);

-- Insertion and increment are one atomic statement. A duplicate ID does neither.
CREATE TRIGGER IF NOT EXISTS count_first_website_download
AFTER INSERT ON download_visitors
BEGIN
  INSERT INTO download_counts (kind, total) VALUES (NEW.kind, 1)
  ON CONFLICT(kind) DO UPDATE SET total = total + 1, updated_at = CURRENT_TIMESTAMP;
END;
