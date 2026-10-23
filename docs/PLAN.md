# ConRAG plan

**ConRAG: a contradiction-aware retrieval-augmented generation system for detecting conflicting knowledge.**
Course: PES DBMS Experiential Learning, Level 3 (2-member team). Requirement-by-requirement coverage is in [requirements-map.md](requirements-map.md).

## Problem

A plain RAG system retrieves the top-k chunks and answers from them. When two documents disagree (an old circular says 75% attendance, a department notice says 85%), it picks one and answers confidently. The user never learns a conflict existed.

ConRAG detects the conflict at **ingest time**, stores it as data, and at **query time** answers with the supporting evidence, the contradicting evidence, and a source-weighted lean. Humans (admins) can resolve a conflict, which feeds back into retrieval and source reliability.

## Objectives

1. Ingest documents from sources with different trust levels.
2. Break documents into atomic claims and find claims that contradict each other across documents.
3. Answer questions showing both sides of any conflict, with provenance.
4. Let an admin resolve conflicts; resolved-away claims stop being retrieved.
5. Measure it: ConRAG vs plain RAG on questions with planted conflicts.

## Scope

In: text/markdown documents, one embedding model, one judge model, three roles, conflicts dashboard, evaluation set.
Out (cut list): PDF/OCR parsing, multi-language, streaming UI polish, fine-tuned NLI model, multi-tenant orgs.

## Database choice (PostgreSQL + pgvector, SQL + vector option)

| Data | Store | Why |
|---|---|---|
| Users, sources, documents, claims, relations, resolutions, queries, audit | PostgreSQL tables | Strongly related, needs FKs, constraints, transactions, aggregates. |
| Chunk and claim embeddings | pgvector `vector(384)` + HNSW (cosine) | Retrieval and candidate-conflict search are nearest-neighbour. Same engine means one transaction can write a claim and its embedding, and one query can join similarity to trust scores. |
| Keyword search over documents | Postgres `tsvector` + GIN | Exact-term lookup complements semantic search. |

A separate vector DB or document store would add a second system with no cross-store transactions; the claim/relation data is relational, so a document store buys nothing. Graph (Neo4j) was considered for the contradiction graph and rejected: the graph is shallow (pairs), and a recursive CTE covers any clustering we need.

## Architecture

```
Next.js (App Router)
 ├─ UI: login, Ask, Conflicts, Ingest, Sources/Admin
 └─ Route Handlers  (/api/*)  ── session cookie (jose) + role check
        │
        ├─ ingest:  chunk → embed → extract claims → candidate search → judge → store   (one transaction)
        ├─ ask:     embed question → find_similar_claims → retrieve_conflicts → answer
        └─ admin:   resolve conflict, edit source trust
        │
   PostgreSQL 17 + pgvector   (docker compose, or `npm run db:dev` with no Docker)
```

### Pipelines

**Ingest** (`analyst`, `admin`): 1) hash the body, reject duplicates (`content_hash UNIQUE`); 2) split into chunks (~200 tokens, small overlap); 3) embed chunks locally with `Xenova/all-MiniLM-L6-v2` (384-d, cosine) through `@huggingface/transformers`, no API key; 4) the LLM extracts atomic claims per chunk; 5) embed each claim; 6) for every new claim, `find_similar_claims(vec, 10, exclude_doc)` gives cross-document candidates above a similarity floor; 7) the LLM judge labels each pair `contradicts | supports | neutral` with confidence and rationale; 8) insert documents, chunks, claims, relations inside one `BEGIN … COMMIT`.

**Ask** (any role): embed the question; `find_similar_claims` for top-k; `retrieve_conflicts` for contradiction pairs inside that set; group claims into "agree" and "disagree"; weight sides by `source_reliability`, recency and corroboration count; the LLM writes an answer given both sides and must cite claim ids; store the query and `query_evidence`.

**Resolve** (`admin`): insert a `conflict_resolutions` row; trigger supersedes the loser; reliability of the loser's source drops.

### Models

Local embeddings (free, offline). Judge and answer generation use Anthropic via `@anthropic-ai/sdk`: a small, cheap model for claim extraction and pair judging, a stronger one for the final answer. Model ids live in `.env`/constants, not scattered.

## Schema summary

Full DDL: `db/migrations/`. ER diagram: [er-diagram.md](er-diagram.md).

- `001_init.sql`: tables, PK/FK, CHECK/UNIQUE/NOT NULL, HNSW/GIN/btree/partial indexes.
- `002_claim_status.sql`: `ALTER TABLE` (adds `claims.status`) plus a constraint tying status to `superseded_at`.
- `003_functions_triggers_views.sql`: `find_similar_claims`, `retrieve_conflicts`, `source_reliability`; triggers `relation_guard`, `resolution_check`, `resolution_apply`, `audit_row`; views `v_open_conflicts`, `v_source_stats`.

Advanced concepts demonstrated (need ≥4, we have 8): transactions (ingest), views, stored functions, triggers, indexing (HNSW, GIN, partial), full-text search, vector similarity search, composite-FK integrity.

## Roles

| Role | Can |
|---|---|
| `admin` | everything; resolve conflicts, edit sources and trust, manage users |
| `analyst` | ingest documents, ask, view conflicts |
| `viewer` | ask, view conflicts |

Passwords bcrypt-hashed; session is a signed httpOnly cookie; secrets only in `.env`; every query parameterised; role checked server-side in each route handler.

## Phases

| # | Deliverable | Done when |
|---|---|---|
| 0 | Repo, schema, dev DB, smoke test | `npm run db:migrate && npm run db:test` pass. **Done.** |
| 1 | Auth + roles; sources CRUD (admin) | login works, viewer blocked from ingest |
| 2 | Ingest pipeline | upload a doc, see claims and relations rows |
| 3 | Ask pipeline + UI | answer shows supporting / contradicting evidence |
| 4 | Conflicts dashboard + resolve flow | resolve changes retrieval and reliability |
| 5 | Evaluation | table: plain RAG vs ConRAG over the labelled set |
| 6 | Docs, screenshots, demo script | every item in the PDF's documentation list present |

Phase order is strict: nothing in 3 until 2 produces real relations.

## Demo corpus

Synthetic campus-policy documents (attendance, exam rules, fee deadlines, hostel timings) across four sources of differing trust, with deliberately planted contradictions and some near-misses that are *not* contradictions (different scope, different year). 30 labelled questions: 15 with a real conflict, 10 without, 5 where the conflict is a false alarm. Synthetic on purpose: ground truth is known and nothing copyrighted or private is ingested.

## Evaluation

Plain RAG baseline (same embeddings, top-k chunks, same answer model, no conflict data) vs ConRAG. Metrics: conflict detection precision/recall on labelled pairs; "answer discloses the conflict" rate; wrong-confident-answer rate; latency.

## Team split (2 members)

Both members touch database and application, as the brief requires. Suggested ownership, swap pieces as needed:

| | Member A | Member B |
|---|---|---|
| Primary | schema, migrations, SQL functions/triggers, ingest pipeline, judge prompts | auth, route handlers, Next.js UI (Ask, Conflicts, Admin) |
| Secondary | Ask API endpoint | one trigger + one view + the evaluation harness |
| Shared | ER diagram, tests, docs, demo | |

Rule for the "individual contributions" requirement: small commits under each member's own git identity, feature branches, PRs reviewed by the other member.

## Risks

- **Judge errors** (false contradictions: different scope or date). Mitigation: judge prompt forces scope/date comparison; confidence stored; low-confidence relations shown as "possible".
- **Cost/latency** of pairwise judging. Mitigation: vector shortlist (k≤10, similarity floor) so judging is O(claims × k), not O(claims²).
- **Embedding model weak on negation** (contradictory sentences embed close, which is what we want for candidate search, but unrelated pairs may too). Mitigation: judge is the arbiter; embeddings only shortlist.
- **No Docker on dev machine.** `npm run db:dev` runs PGlite (Postgres in WASM + pgvector); real Postgres via compose is the target for the demo and is what the docs describe.
