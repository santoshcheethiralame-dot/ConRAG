# Requirements map

Each item of "DBMS Experiential Learning – Level 3 Project" and where ConRAG satisfies it.

| # | Requirement | Where | Status |
|---|---|---|---|
| 1 | Unique title, real-world problem, not CRUD | *ConRAG: contradiction-aware RAG*; conflict detection, source weighting and resolution feedback, see [PLAN.md](PLAN.md). **Title uniqueness in the section must be confirmed with the instructor.** | done / confirm |
| 2 | 2-member team, both do DB and app | Built solo; **needs instructor approval**. Responsibility split suggested in PLAN.md if a second member joins. | open |
| 3 | SQL + vector database | PostgreSQL 17 + pgvector (Option 2) | done |
| 4 | ER diagram, relational schema, vector/NoSQL documentation | [er-diagram.md](er-diagram.md) + `er-diagram.png`; relational schema, vector model and retrieval strategy in [DESIGN.md](DESIGN.md); [DATA-DICTIONARY.md](DATA-DICTIONARY.md) | done |
| 5 | DDL: CREATE, ALTER, DROP, keys, constraints, indexes, views | `001` CREATE (tables, keys, constraints, indexes); `002` ALTER TABLE ADD COLUMN/CONSTRAINT; `003`–`004` views and functions; `db/reset.sql` DROP | done |
| 6 | DML and JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries | 15 documented queries in `db/queries.sql`, executed by tests, shown with output in [QUERIES.md](QUERIES.md); DML in route handlers and libs (table at the end of QUERIES.md) | done |
| 7 | ≥ 4 advanced concepts | transactions, views, stored functions, six triggers, indexing (HNSW, GIN, partial), full-text search, vector similarity, recursive CTE, window functions; see DESIGN.md | done (8+) |
| 8 | Embeddings and similarity search (optional) | what/model/storage/metric/index/retrieval table in DESIGN.md; implemented in `src/lib/embed.ts`, `find_similar_claims` | done |
| 9 | Next.js interface: forms, tables, search, filters, dashboards | Dashboard, Ask, Conflicts (filters), Documents (search), Document detail, Ingest, Sources, History, Users, Audit; [screenshots](screenshots) | done |
| 10 | Backend/API layer, no hard-coded credentials, env vars | Route Handlers under `src/app/api` ([API.md](API.md)); `src/lib/env.ts`; `.env.example` | done |
| 11 | Authentication, ≥ 2 roles | admin / analyst / viewer; signed session cookie; role checks in every handler and page | done |
| 12 | Validation at the database level; integrity | CHECK, UNIQUE, FK, composite FK, six triggers; proved by `tests/db.test.ts` | done |
| 13 | Security basics; no plaintext secrets | bcrypt, env-only secrets, parameterised SQL, rate limits, headers; [SECURITY.md](SECURITY.md) | done |
| 14 | Documentation list | problem, objectives, scope, requirements: PLAN.md · ER diagram: er-diagram.md · relational schema, database choice: DESIGN.md · data dictionary: DATA-DICTIONARY.md · implementation: `db/migrations` · important queries: QUERIES.md · architecture: ARCHITECTURE.md · screenshots: `docs/screenshots` · testing: TESTING.md + `test-output.txt`, `e2e-output.txt` · conclusion and future work: PLAN.md | done |
| 15 | Git/GitHub, individual contributions, README | Git history in small commits; README with setup and execution. **Push to GitHub is still to do.** | done / push |
| 16 | Final demonstration | [DEMO.md](DEMO.md) | done |
| 17 | Originality | Original schema, pipelines, judge and evaluation; no tutorial or repository copied | done |
| 18 | Beyond CRUD; DB choice justified | DESIGN.md "Why PostgreSQL + pgvector" | done |

## Open questions for the instructor

1. Is the title "ConRAG" free in the section?
2. Is a solo project acceptable?
3. Is an in-process PostgreSQL (PGlite) acceptable for development, with real PostgreSQL via `docker-compose.yml` for the demo? (The SQL is identical.)
4. Is it acceptable that claim extraction and judging can use an external language model API, as long as all persistent data, retrieval and integrity live in the database? (The default configuration needs no external API.)
