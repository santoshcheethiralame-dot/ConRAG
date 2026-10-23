# ER diagram

Mermaid source; renders on GitHub. Export a PNG/PDF for the submission (mermaid.live or `npx @mermaid-js/mermaid-cli`).

```mermaid
erDiagram
  USERS ||--o{ SOURCES : creates
  USERS ||--o{ DOCUMENTS : uploads
  USERS ||--o{ QUERIES : asks
  USERS ||--o{ CONFLICT_RESOLUTIONS : resolves
  SOURCES ||--o{ DOCUMENTS : publishes
  DOCUMENTS ||--o{ CHUNKS : "split into"
  CHUNKS ||--o{ CLAIMS : yields
  CLAIMS ||--o{ CLAIM_RELATIONS : "claim_a"
  CLAIMS ||--o{ CLAIM_RELATIONS : "claim_b"
  CLAIM_RELATIONS ||--o| CONFLICT_RESOLUTIONS : "resolved by"
  CLAIMS ||--o{ CONFLICT_RESOLUTIONS : "winner"
  QUERIES ||--o{ QUERY_EVIDENCE : cites
  CLAIMS ||--o{ QUERY_EVIDENCE : "cited in"

  USERS {
    bigint id PK
    text email UK
    text password_hash
    user_role role
    timestamptz created_at
  }
  SOURCES {
    bigint id PK
    text name UK
    text url
    source_kind kind
    numeric trust_score "0..1"
    bigint created_by FK
  }
  DOCUMENTS {
    bigint id PK
    bigint source_id FK
    text title
    text body
    date published_at
    char content_hash UK
    tsvector tsv "generated"
    bigint uploaded_by FK
  }
  CHUNKS {
    bigint id PK
    bigint document_id FK
    int ordinal "UK with document_id"
    text text
    vector384 embedding "HNSW cosine"
  }
  CLAIMS {
    bigint id PK
    bigint chunk_id FK "composite FK with document_id"
    bigint document_id FK
    text subject
    text text
    vector384 embedding "HNSW cosine"
    claim_status status
    timestamptz superseded_at
  }
  CLAIM_RELATIONS {
    bigint id PK
    bigint claim_a FK "claim_a < claim_b"
    bigint claim_b FK
    relation_type relation
    numeric confidence "0..1"
    text rationale
    text judged_by
  }
  CONFLICT_RESOLUTIONS {
    bigint id PK
    bigint relation_id FK "unique"
    bigint winner_claim_id FK
    bigint resolved_by FK
    text note
  }
  QUERIES {
    bigint id PK
    bigint user_id FK
    text question
    text answer
    int latency_ms
  }
  QUERY_EVIDENCE {
    bigint query_id PK_FK
    bigint claim_id PK_FK
    evidence_role role
    smallint rank
    real similarity
  }
  AUDIT_LOG {
    bigint id PK
    text table_name
    bigint row_id
    text action
    jsonb old_data
    jsonb new_data
  }
```

`AUDIT_LOG` has no FKs on purpose: it must survive deletion of the rows it describes. It is written only by triggers on `claim_relations`, `conflict_resolutions`, `sources`.

## Normalisation notes

- 3NF throughout. `claims.document_id` is a deliberate, enforced denormalisation: the composite FK `(chunk_id, document_id) → chunks(id, document_id)` makes it impossible to disagree with the chunk, and it lets the "different document" filter and the claim→source join skip a hop on the hot path.
- `claim_relations` stores each unordered pair once (`claim_a < claim_b`, `UNIQUE (claim_a, claim_b)`).
- `query_evidence` resolves the M:N between queries and claims and carries the role/rank of each claim.

## Vector / retrieval data model (course item 4, vector part)

| Item | Decision |
|---|---|
| What is embedded | chunk text (retrieval) and claim text (conflict candidates) |
| Model | `Xenova/all-MiniLM-L6-v2`, 384 dims, run locally |
| Storage | `vector(384)` columns in `chunks` and `claims` |
| Metric | cosine distance (`<=>`); similarity = `1 - distance` |
| Index | HNSW `vector_cosine_ops` |
| Metadata | source, trust, publish date, status joined from relational tables at query time |
| Retrieval | top-k by cosine over `status = 'active'` claims, then `retrieve_conflicts` over that set |
