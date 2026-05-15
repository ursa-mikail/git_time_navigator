-- Git Time Navigator — Database Schema
-- Runs automatically on first docker compose up

CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- trigram for fuzzy search
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Repositories tracked by the UI
CREATE TABLE IF NOT EXISTS repositories (
    id          SERIAL PRIMARY KEY,
    url         TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    owner       TEXT NOT NULL,
    local_path  TEXT,
    default_branch TEXT NOT NULL DEFAULT 'main',
    last_synced TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- All commits for a repo
CREATE TABLE IF NOT EXISTS commits (
    id          SERIAL PRIMARY KEY,
    repo_id     INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    hash        CHAR(40) NOT NULL,
    short_hash  CHAR(7)  NOT NULL,
    author_name TEXT NOT NULL,
    author_email TEXT NOT NULL,
    message     TEXT NOT NULL,
    committed_at TIMESTAMPTZ NOT NULL,
    branch      TEXT NOT NULL DEFAULT 'main',
    parents     TEXT[],           -- array of parent hashes
    files_changed TEXT[],         -- list of files touched
    insertions  INTEGER DEFAULT 0,
    deletions   INTEGER DEFAULT 0,
    search_vector tsvector,
    UNIQUE(repo_id, hash)
);

-- Full-text + trigram indexes
CREATE INDEX IF NOT EXISTS idx_commits_search   ON commits USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_commits_message  ON commits USING GIN(message gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_commits_author   ON commits USING GIN(author_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_commits_repo     ON commits(repo_id);
CREATE INDEX IF NOT EXISTS idx_commits_date     ON commits(committed_at DESC);
CREATE INDEX IF NOT EXISTS idx_commits_branch   ON commits(branch);

-- Auto-update tsvector on insert/update
CREATE OR REPLACE FUNCTION commits_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
      setweight(to_tsvector('english', coalesce(NEW.message, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(NEW.author_name, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(NEW.hash, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS commits_search_trigger ON commits;
CREATE TRIGGER commits_search_trigger
    BEFORE INSERT OR UPDATE ON commits
    FOR EACH ROW EXECUTE FUNCTION commits_search_update();

-- Saved filter presets
CREATE TABLE IF NOT EXISTS filter_presets (
    id          SERIAL PRIMARY KEY,
    repo_id     INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    filters     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log of time-travel actions
CREATE TABLE IF NOT EXISTS navigation_log (
    id          SERIAL PRIMARY KEY,
    repo_id     INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,  -- 'checkout','reset','push'
    from_hash   TEXT,
    to_hash     TEXT NOT NULL,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
