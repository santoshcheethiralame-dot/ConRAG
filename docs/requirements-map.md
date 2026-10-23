# Requirements map

Maps each item in "DBMS Experiential Learning – Level 3 Project" to where ConRAG satisfies it. Status: **done** (exists and tested), **planned** (phase in [PLAN.md](PLAN.md)).

| # | Requirement | Where | Status |
|---|---|---|---|
| 1 | Unique title, real problem, not CRUD | ConRAG; conflict detection and reasoning, not record management. **Title must be confirmed unique in the section with the instructor.** | planned |
| 2 | 2-member team, both do DB and app | team split in PLAN.md | planned |
| 3 | SQL + vector DB | PostgreSQL + pgvector (Option 2) | done |
| 4 | ER diagram, relational schema, vector data model | `docs/er-diagram.md`, `db/migrations/001_init.sql` | done (export diagram image for submission) |
| 5 | DDL: CREATE, ALTER, DROP, PK/FK, constraints, indexes, views | `001` CREATE, `002` ALTER, `003` views; DROP: add `db/reset.sql` in phase 1 | partly done |
| 6 | DML + JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries | `v_source_stats`, `source_reliability`, route handlers; add a documented query pack `db/queries.sql` | partly done |
| 7 | ≥4 advanced concepts | transactions, views, functions, triggers, indexing, full-text, vector search (7+) | done in schema; transactions land with ingest |
| 8 | Embeddings + similarity (optional) | what/model/storage/metric/retrieval table in `er-diagram.md` | done (doc), pipeline planned |
| 9 | Next.js web UI with forms, tables, search, filters, dashboard | Ask, Conflicts, Ingest, Sources pages | planned (scaffold done) |
| 10 | API layer, no hard-coded creds, env vars | Route Handlers, `.env`, `src/lib/db.ts` | done |
| 11 | Auth, ≥2 roles | `users.role` admin/analyst/viewer, jose session | schema done, app planned |
| 12 | DB-level validation and integrity | CHECK/UNIQUE/FK, composite FK, triggers; `db/tests/smoke.ts` proves them | done |
| 13 | Security: hashed passwords, no plain creds | bcrypt, `password_hash` CHECK, `.env` git-ignored, parameterised queries | done (hash), app planned |
| 14 | Documentation list | PLAN (problem, objectives, scope, architecture), ER, schema, queries; screenshots, test results, conclusion at phase 6 | partly done |
| 15 | Git/GitHub, per-member commits, README | repo initialised, README with setup | done; push to GitHub and each member commits under own identity |
| 16 | Final demo contents | demo script at phase 6 | planned |
| 17 | Originality | own schema and pipeline; do not copy tutorials | ongoing |
| 18 | Beyond CRUD, DB choice justified | PLAN.md "Database choice" table | done |

## Open questions for the instructor

1. Is "ConRAG" free in the section? (Item 1.)
2. Is calling an external LLM API acceptable for the judge/answer step, as long as all persistent data and retrieval live in the databases? (We keep embeddings local.)
3. Does PGlite (Postgres in WASM) count for dev only, with real PostgreSQL for the demo? (We plan real PostgreSQL via docker compose for the demo.)
