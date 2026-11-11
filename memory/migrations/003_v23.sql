ALTER TABLE reply_outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reply_outbox ADD COLUMN lease_until REAL;
ALTER TABLE reply_outbox ADD COLUMN error TEXT;
CREATE INDEX replies_pending ON reply_outbox(status,lease_until);
CREATE TABLE campaign_imports(id TEXT PRIMARY KEY,source TEXT NOT NULL,source_sha256 TEXT NOT NULL UNIQUE,dataset_kind TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE competency_runs(id TEXT PRIMARY KEY,proposal_id TEXT NOT NULL,source_url TEXT NOT NULL,source_sha256 TEXT NOT NULL,assessment TEXT NOT NULL,created_at TEXT NOT NULL);
