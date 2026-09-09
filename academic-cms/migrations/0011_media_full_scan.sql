-- Last full-scan job and per-media inspection results. Media contents are never deleted.
CREATE TABLE media_scan_jobs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  state_json TEXT NOT NULL CHECK (json_valid(state_json))
);
CREATE TABLE media_inspections (
  media_uid TEXT PRIMARY KEY REFERENCES media_assets(uid) ON DELETE CASCADE,
  result_json TEXT NOT NULL CHECK (json_valid(result_json))
);
