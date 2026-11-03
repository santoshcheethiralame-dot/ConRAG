# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it reaches 1.0.

## [Unreleased]

### Added

- **Attribute-key candidates.** Migration `005` adds `claims.attribute_key` (an md5 of a claim's content words after quantities are masked and negations, antonyms and months dropped), a partial index on it, and the `claims_with_attribute()` function. Ingest now judges every existing claim that shares a key with a new claim, in addition to its nearest vector neighbours, so same-attribute conflicts that embeddings place far apart are found. `npm run db:backfill` fills the key for claims ingested earlier.
- **Graph-expanded retrieval.** A question now pulls in claims linked to a retrieved claim by a contradiction edge, and the claims that corroborate either side, even when they rank outside the top-k. Controlled by `EXPAND_LIMIT` (default 20; `0` disables).
- **Offline judge coverage** for number words ("two" vs "five"), fractions (`three-fourths`), durations across units (`2 hours` = `120 minutes`), reversed comparisons, different names holding a unique role, conditional rules ("allowed if switched off"), "each" and "every", and "nobody" and "nothing".
- **CI.** GitHub Actions workflow running lint, type check, tests and an evaluation gate. `npm run eval -- --check` fails when a metric drops below the floors in `eval/thresholds.json`; `--no-write` leaves the generated documents untouched.
- `SUPPORT_MIN_CONFIDENCE` and `EXPAND_LIMIT` settings.
- Tests: 95 in total (was 72), including database-level proofs for the new constraints.
- Project documentation: contributing guide, security policy, code of conduct, issue and pull request templates, documentation index and roadmap.

### Changed

- **The duplicate rule is per source.** `documents.content_hash` is now unique together with `source_id` (it was unique globally). The same text published by a second source is accepted and recorded as corroboration; re-uploading it to the same source still returns `409`.
- A *supports* edge below `SUPPORT_MIN_CONFIDENCE` (0.7) no longer merges claims into one position or counts as corroboration.
- When a side of a conflict was pulled in by expansion, the sides are compared on source reliability, recency and corroboration without the question-similarity term.
- Masked-embedding similarity now normalises number words before masking.

### Fixed

- The offline judge no longer calls "two rupees" and "five rupees", "ten pm" and "9 pm", a reversed comparison, or two different people in the same role mutually *supporting*.
- "No one" and "nobody" are no longer judged as contradicting each other.

### Migration notes

Run `npm run db:migrate`, then `npm run db:backfill` on an existing database. The evaluation figures in `docs/EVALUATION.md` predate these changes; run `npm run eval` to refresh them.

## [0.1.0] - 2026-10-24

Initial release.

### Added

- Document ingest: chunking, local embeddings (MiniLM, 384-d), atomic claim extraction, vector shortlist, pairwise judgement (*contradicts*, *supports*, *neutral*), all written in one transaction.
- Question answering that reports both sides of a conflict with sources, dates and a justified lean, groups corroborating claims into positions, and can show a plain-RAG answer for comparison.
- Admin review: keep one side, dismiss a false alarm, undo a resolution. Triggers supersede and reactivate claims and audit every change.
- Rule-based offline judge and template answers (no API key), plus an optional free-tier chat-model provider (Groq, Gemini, OpenRouter).
- PostgreSQL schema with CHECK and composite foreign-key constraints, six triggers, stored functions, views, HNSW and GIN indexes, full-text search.
- Next.js interface (dashboard, ask, conflicts, documents, ingest, sources, history, audit, users), session authentication and three roles.
- Evaluation harness with a labelled demo corpus, test suites (database, unit, provider, pipeline, query pack, end-to-end), and a documentation set.

[Unreleased]: https://github.com/santoshcheethiralame-dot/ConRAG/compare/aab746b...HEAD
[0.1.0]: https://github.com/santoshcheethiralame-dot/ConRAG/commit/aab746b
