-- 001: base schema. Entities, keys, constraints, indexes.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE user_role     AS ENUM ('admin', 'analyst', 'viewer');
CREATE TYPE source_kind   AS ENUM ('official', 'news', 'wiki', 'forum', 'internal');
CREATE TYPE relation_type AS ENUM ('contradicts', 'supports', 'neutral');
CREATE TYPE evidence_role AS ENUM ('supporting', 'contradicting');

CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash TEXT NOT NULL CHECK (password_hash LIKE '$2%' AND length(password_hash) = 60),
  role          user_role NOT NULL DEFAULT 'viewer',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

CREATE TABLE sources (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  url         TEXT CHECK (url IS NULL OR url ~* '^https?://'),
  kind        source_kind NOT NULL,
  trust_score NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (trust_score BETWEEN 0 AND 1),
  created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id    BIGINT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (length(trim(title)) > 0),
  body         TEXT NOT NULL CHECK (length(trim(body)) > 0),
  published_at DATE CHECK (published_at >= DATE '1990-01-01'),
  content_hash CHAR(64) NOT NULL UNIQUE,
  tsv          TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || body)) STORED,
  uploaded_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX documents_source_idx ON documents (source_id);
CREATE INDEX documents_tsv_gin    ON documents USING GIN (tsv);

CREATE TABLE chunks (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal     INT NOT NULL CHECK (ordinal >= 0),
  text        TEXT NOT NULL CHECK (length(trim(text)) > 0),
  embedding   vector(384) NOT NULL,
  UNIQUE (document_id, ordinal),
  UNIQUE (id, document_id)
);
CREATE INDEX chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);

-- A claim is one atomic factual statement extracted from a chunk.
-- (chunk_id, document_id) is a composite FK so a claim can never point at a
-- document its chunk does not belong to.
CREATE TABLE claims (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chunk_id     BIGINT NOT NULL,
  document_id  BIGINT NOT NULL,
  subject      TEXT,
  text         TEXT NOT NULL CHECK (length(trim(text)) > 0),
  embedding    vector(384) NOT NULL,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (chunk_id, document_id) REFERENCES chunks (id, document_id) ON DELETE CASCADE
);
CREATE INDEX claims_document_idx    ON claims (document_id);
CREATE INDEX claims_embedding_hnsw  ON claims USING hnsw (embedding vector_cosine_ops);

-- Pairwise judgement between two claims. claim_a < claim_b stores each pair once.
CREATE TABLE claim_relations (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  claim_a    BIGINT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  claim_b    BIGINT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  relation   relation_type NOT NULL,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  rationale  TEXT,
  judged_by  TEXT NOT NULL,
  judged_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (claim_a < claim_b),
  UNIQUE (claim_a, claim_b)
);
CREATE INDEX claim_relations_b_idx ON claim_relations (claim_b);
CREATE INDEX claim_relations_contra_idx ON claim_relations (relation) WHERE relation = 'contradicts';

CREATE TABLE conflict_resolutions (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  relation_id      BIGINT NOT NULL UNIQUE REFERENCES claim_relations(id) ON DELETE CASCADE,
  winner_claim_id  BIGINT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  resolved_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  note             TEXT,
  resolved_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE queries (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  question   TEXT NOT NULL CHECK (length(trim(question)) > 0),
  answer     TEXT,
  latency_ms INT CHECK (latency_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX queries_user_idx ON queries (user_id, created_at DESC);

-- M:N between queries and claims, with the role the claim played in the answer.
CREATE TABLE query_evidence (
  query_id   BIGINT NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
  claim_id   BIGINT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  role       evidence_role NOT NULL,
  rank       SMALLINT NOT NULL CHECK (rank > 0),
  similarity REAL CHECK (similarity BETWEEN -1 AND 1),
  PRIMARY KEY (query_id, claim_id)
);

CREATE TABLE audit_log (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id     BIGINT,
  action     TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data   JSONB,
  new_data   JSONB,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_table_idx ON audit_log (table_name, at DESC);
