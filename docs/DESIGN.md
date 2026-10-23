# Database design

Companion to the [ER diagram](er-diagram.md) and the generated [data dictionary](DATA-DICTIONARY.md).

## Why PostgreSQL + pgvector

The brief asks for a SQL database plus a NoSQL or vector one, with the choice justified per type of data.

| Data | Shape | Store | Why |
|---|---|---|---|
| Users, sources, documents, claims, relations, resolutions, questions, evidence, audit | Highly related, needs referential integrity, uniqueness, transactions, aggregation | PostgreSQL tables | The product *is* its relationships: claim ↔ claim, claim ↔ source, resolution ↔ relation. Foreign keys, CHECKs and triggers enforce them in the database where the application cannot bypass them. |
| Chunk and claim embeddings | 384-d float vectors searched by nearest neighbour | pgvector `vector(384)` + HNSW (cosine) | Retrieval and conflict-candidate search are both nearest-neighbour queries. Because the vectors live in the same database, one query joins similarity to source trust and claim status, and one transaction writes a claim together with its vector. |
| Document text search | Keyword and phrase queries | `tsvector` generated column + GIN | Exact terms complement semantic search; no second system. |

**Why not a separate vector database (Qdrant, Chroma, Pinecone)?** Every query ConRAG makes needs relational filters on the vector hit: only `active` claims, join to the source's reliability, exclude the same document. A separate vector store would force a two-step lookup and has no transaction shared with the claim rows, so a failed ingest could leave orphaned vectors. At this scale (thousands of claims) pgvector's HNSW is more than fast enough.

**Why not MongoDB?** Claims have a fixed, small shape and are constantly joined and aggregated. A document store buys nothing and loses foreign keys.

**Why not Neo4j for the contradiction graph?** The graph is shallow (pairs and short chains). A recursive CTE (`conflict_cluster`) covers transitive conflicts, and keeping the edges in `claim_relations` lets constraints, triggers and audit apply to them.

## Relational schema

`PK` primary key, `FK` foreign key, `UQ` unique. Full column types and every constraint are in the [data dictionary](DATA-DICTIONARY.md).

```
users(id PK, email UQ(lower), password_hash, role, created_at)
sources(id PK, name UQ, url, kind, trust_score, created_by FK→users, created_at)
documents(id PK, source_id FK→sources, title, body, published_at, content_hash UQ, tsv generated, uploaded_by FK→users, created_at)
chunks(id PK, document_id FK→documents, ordinal, text, embedding vector(384), UQ(document_id, ordinal), UQ(id, document_id))
claims(id PK, chunk_id, document_id, subject, text, embedding vector(384), extracted_at, status, superseded_at,
       FK(chunk_id, document_id)→chunks(id, document_id))
claim_relations(id PK, claim_a FK→claims, claim_b FK→claims, relation, confidence, rationale, judged_by, judged_at,
                CHECK claim_a < claim_b, UQ(claim_a, claim_b))
conflict_resolutions(id PK, relation_id FK→claim_relations UQ, winner_claim_id FK→claims, resolved_by FK→users, note, resolved_at)
queries(id PK, user_id FK→users, question, answer, latency_ms, created_at)
query_evidence(query_id FK→queries, claim_id FK→claims, role, rank, similarity, PK(query_id, claim_id))
audit_log(id PK, table_name, row_id, action, old_data jsonb, new_data jsonb, at)
```

### Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| source → documents | 1 : N | deleting a source cascades |
| document → chunks → claims | 1 : N : N | cascades; claims carry `document_id` too |
| claim ↔ claim (`claim_relations`) | M : N, self-referencing | each unordered pair once |
| relation → resolution | 1 : 0..1 | `relation_id UNIQUE` |
| query ↔ claim (`query_evidence`) | M : N | carries role, rank, similarity |
| user → sources, documents, queries, resolutions | 1 : N | `ON DELETE SET NULL` keeps history when a user is removed |

### Normalisation

Third normal form throughout, with one deliberate, enforced denormalisation: `claims.document_id`. The composite foreign key `(chunk_id, document_id) → chunks(id, document_id)` makes it impossible for the two to disagree, and it removes a join from the hottest queries (the cross-document filter and the claim → source path).

## Vector data model

| Item | Decision |
|---|---|
| What is embedded | chunk text (document-level retrieval) and each claim's text (conflict candidates and question retrieval) |
| Model | `Xenova/all-MiniLM-L6-v2`, 384 dimensions, mean pooled and normalised, run locally through transformers.js |
| Storage | `vector(384)` columns in `chunks` and `claims` |
| Similarity | cosine distance `<=>`; similarity = 1 − distance |
| Index | HNSW with `vector_cosine_ops` on both columns |
| Retrieval | `find_similar_claims(q, k, exclude_doc)`: nearest active claims, joined to source trust |
| Metadata | source, trust, publish date, status are joined from relational tables at query time, not copied into the vector row |
| Extra trick | *masked* embeddings: numbers, times, dates and amounts are replaced with `#` before embedding, so "fine is Rs 2" and "fine is Rs 5" become identical and "library hours" vs "health-centre hours" stay different. Used by the offline judge to tell "same attribute, different value" from "different attribute". |

A pure hash embedding (`EMBEDDING_PROVIDER=hash`) exists for tests and for running without the model download. It is lexical only.

## Integrity: what the database enforces

The brief asks for validation at the database level. None of these depend on the application behaving.

| Rule | Mechanism |
|---|---|
| Valid email, bcrypt-shaped hash, case-insensitive unique email | `CHECK`, unique index on `lower(email)` |
| Source trust in [0, 1], http(s) URL, non-blank name, unique name | `CHECK`, `UNIQUE` |
| No empty documents; no dates before 1990; no duplicate document text | `CHECK`, `content_hash UNIQUE` |
| A claim belongs to the document its chunk belongs to | composite FK |
| A relation links two *different* documents, each pair stored once and ordered | trigger `relation_guard`, `CHECK (claim_a < claim_b)`, `UNIQUE` |
| Confidence in [0, 1]; ranks positive; chunk ordinals non-negative | `CHECK` |
| `status = 'superseded'` exactly when `superseded_at` is set | `CHECK` |
| A resolution's winner is one of the pair; only contradictions are resolved; superseded claims cannot be re-argued | trigger `resolution_check` |
| Resolving supersedes the loser; undoing reactivates it unless it lost elsewhere | triggers `resolution_apply`, `resolution_undo` |
| The system always has an admin | trigger `protect_last_admin` |
| Every change to relations, resolutions and sources is recorded | trigger `audit_row` on three tables |
| Ingest is all-or-nothing | one transaction |

`tests/db.test.ts` proves each rule by trying to break it.

## Advanced database features used

| Feature | Where |
|---|---|
| Transactions | document ingest; question logging; every migration |
| Views | `v_open_conflicts` (8-table join), `v_source_stats` |
| Stored functions | `find_similar_claims`, `retrieve_conflicts`, `source_reliability`, `search_documents`, `conflict_cluster` |
| Triggers | six: relation guard, resolution check/apply/undo, last-admin guard, audit |
| Indexing | HNSW (2), GIN on tsvector, partial indexes (`WHERE relation = 'contradicts'`, `WHERE status = 'active'`), composite and covering btrees |
| Full-text search | generated `tsvector`, `websearch_to_tsquery`, `ts_rank`, `ts_headline` |
| Vector similarity search | pgvector cosine, HNSW |
| Recursive CTE, window functions, GROUPING SETS | `conflict_cluster`, query pack |

## Decisions

| Decision | Reason |
|---|---|
| Detect conflicts at ingest, not at question time | Judging pairs is the slow, costly step. Paying it once per document keeps questions fast and makes conflicts first-class data that can be reviewed, resolved and audited. |
| Store only contradictions and supports, not neutral pairs | Neutral carries no information and would be the bulk of the table. |
| Vector shortlist before judging | Bounds model calls at claims × 5 instead of claims². |
| Judge fallback that needs no API key | The application, tests and demo run offline; the model-based judge is an upgrade, not a dependency. |
| Position grouping before reporting conflicts | Without it, one disagreement backed by several sources shows up as several pair conflicts. |
| Keep the conflict lean advisory and explicit | When scores are within 10 % the answer says *undecided* and sends it to an admin rather than guessing. |
| Admin resolution as a first-class action | Retrieval, reliability and the audit log all react to it, closing the loop. |
| Sessions re-read the user row on each request | A demoted or deleted user loses access immediately instead of when the token expires. |
| Route handlers for all mutations, direct SQL for page reads | Satisfies the "database through an API layer" requirement for changes while keeping server-rendered pages simple. |
| Cache components disabled | Every page is per-user and dynamic; the Next.js 16 cache model adds nothing here. |
