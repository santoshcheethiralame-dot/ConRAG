# Testing

Four layers, all runnable offline with no API key.

| Layer | Command | Tests | What it proves |
|---|---|---|---|
| Database | `npm test` | 20 in `tests/db.test.ts` | constraints, triggers, functions, views, indexes, cascades, behave as designed |
| Unit | `npm test` | 34 in `tests/unit.test.ts` | chunking, offline judge, scoring, grouping, parsing, rate limiter, injection filter |
| Pipeline + query pack | `npm test` | 8 in `tests/pipeline.test.ts` and `tests/queries.test.ts` | ingest → ask → resolve → undo through the real code; all 15 documented queries run |
| End to end | `npm run test:e2e` | 17 in `tests/e2e/app.e2e.ts` | real browser against the production build: auth, roles, ask, resolve, ingest, search, admin |

`npm test` starts an in-memory PostgreSQL + pgvector (PGlite), applies the migrations, runs the suites one at a time and tears everything down. `npm run test:e2e` additionally builds the app, loads the demo corpus with the real MiniLM embeddings, starts `next start`, and drives Edge (or Chrome) with Playwright. Raw output: [test-output.txt](test-output.txt), [e2e-output.txt](e2e-output.txt). Screenshots from the e2e run are in [screenshots/](screenshots).

**Result at the time of writing: 62 of 62 and 17 of 17 passing; `tsc` and ESLint clean; `next build` succeeds.**

## Database tests (`tests/db.test.ts`)

Each test runs in a transaction that is rolled back. Failures are asserted by SQLSTATE, so the test proves the *database* refused, not the application.

| Group | Cases |
|---|---|
| Table constraints | malformed email, non-bcrypt hash, trust out of range, bad URL, blank name, bad enum; case-insensitive unique email, unique source name; blank title, date before 1990, missing source, negative ordinal, wrong vector dimension; claim cannot reference a foreign document's chunk |
| Claim relations | pair order, same-document ban, confidence range, duplicate pair; audit row for insert, update and delete with correct old/new data |
| Vector functions | ordering by cosine, `k`, `exclude_doc`, superseded claims hidden, similarity value; `retrieve_conflicts` only returns contradiction edges inside the set; **HNSW and GIN indexes appear in the query plans** |
| Conflict resolution | bad winner, non-contradiction; supersede + view + reliability; one resolution per relation; undo reactivates, unless the claim lost elsewhere; cannot resolve with a superseded claim; status/timestamp consistency |
| Users | last admin cannot be demoted or deleted |
| Search and graph | ranked full-text with websearch syntax and highlighted snippet; recursive cluster across a cycle |
| Cascades and views | deleting a document removes dependants and leaves the winner untouched; `v_source_stats` counts |

## Unit tests (`tests/unit.test.ts`)

Chunker (decimals, abbreviations such as `Rs.`, size limit, no split sentences); hash embedding (dimension, unit length, topical closeness); offline judge (different numbers, clock times, dates, negation, antonyms, supports, scope and audience guards, units and times normalised, bare years ignored); claim extraction; model reply parsing (JSON in prose and fences, validation, bad confidence); scoring (recency, corroboration cap, ranking, undecided band); evidence grouping (positions and conflicts, far-from-question conflicts dropped); offline answer text; injection filter; rate limiter window; content hash; bounded concurrency; forged and missing tokens.

## Pipeline tests (`tests/pipeline.test.ts`)

- Ingesting a second document that contradicts the first stores exactly one `contradicts` relation judged by `offline-rules`.
- Duplicate text → 409, unknown source → 422, instruction-like text → 422.
- **Atomicity:** a document that fails a database check (date before 1990) leaves no document, chunk or claim behind.
- `ask` reports the conflict, leans to the more reliable and recent source, and logs `query_evidence` rows with both roles.
- An unrelated question gets no invented conflict.
- After an admin resolves against a claim, `ask` stops returning it and plain RAG still does; after undo the conflict returns.

## End-to-end tests (`tests/e2e/app.e2e.ts`)

| Area | Test |
|---|---|
| Access control | anonymous → login; wrong password message; viewer cannot see or open ingest/users; API returns 403 / 415 / 400 / 422 / 401 as documented; registration creates a viewer |
| Asking | conflicting question shows both sides and the plain-RAG contrast; clean question shows no conflict; question lands in history with its evidence |
| Conflict review | list and filters (text, source, confidence); resolve with a note → loser hidden from the answer, plain RAG unchanged, undo restores; dismiss a false alarm and see the audit row |
| Ingest and search | analyst ingests a contradicting document and sees the contradiction on its page; duplicate and injection refused; full-text search finds and excludes |
| Administration | add and validate a source; promote a user; demoting the last admin shows the database's error; dashboard renders |

## Evaluation (accuracy, not correctness of code)

[EVALUATION.md](EVALUATION.md) measures detection and answer quality on a labelled corpus. Summary with the offline judge and real embeddings:

| | |
|---|---|
| Contradiction precision / recall / F1 | 0.85 / 1.00 / 0.92 |
| Questions with a real conflict where ConRAG says the sources disagree | 16 / 16 |
| … and leans to the better-supported side | 16 / 16 |
| Same questions, plain RAG gives the better-supported answer | 8 / 16, with no warning on the other 8 |
| False alarms on questions with no conflict | 1 / 12 |

## Not covered

- The Anthropic-backed judge and answerer: the code is exercised only through reply-parsing tests, because the suite must run without a key. Run `ANTHROPIC_API_KEY=… npm run eval` to measure it.
- Load and concurrency beyond a handful of simultaneous requests.
- Accessibility audit beyond semantic HTML, labels and keyboard-reachable controls.
