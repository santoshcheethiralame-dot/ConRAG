# ConRAG: problem, scope and plan

**ConRAG: a contradiction-aware retrieval-augmented generation system for detecting conflicting knowledge.**
Course: PES DBMS Experiential Learning, Level 3. Requirement-by-requirement coverage: [requirements-map.md](requirements-map.md).

## Problem statement

A plain RAG system retrieves the top-k chunks and answers from them. When two documents in the knowledge base disagree (an old circular says 75 % attendance, a department notice says 85 %), it picks one and answers confidently. The user never learns a conflict existed, and wrong-but-confident answers are the worst failure of a knowledge assistant.

Real knowledge bases are full of such conflicts: policies change, sources differ in authority, wikis go stale. Today they are found by accident, if at all.

## Motivation for the database angle

The interesting part is not calling a language model; it is **storing knowledge so that conflicts are first-class data**: claims with provenance and vectors, pairwise relations with confidence, resolutions that change what is retrieved, an audit trail, and per-source reliability computed from the history. That is a relational-plus-vector problem, which is why it fits a DBMS project and why it is not CRUD.

## Objectives

1. Ingest documents from sources of different trust.
2. Split documents into atomic claims and find claims that contradict (or corroborate) each other across documents.
3. Answer questions showing both sides of any conflict, with provenance and a justified lean.
4. Let an admin resolve conflicts; resolved-away claims stop being retrieved and the losing source's reliability drops.
5. Enforce the integrity of all of this in the database, not only in application code.
6. Measure it against a plain RAG on a labelled corpus.

## Scope

**In:** text and markdown documents; one embedding model; a pluggable judge (rule-based fallback, Claude optional); three roles; Next.js interface for asking, reviewing, ingesting, searching and administration; evaluation harness; automated tests.

**Out (cut list):** PDF/OCR parsing; multi-language; streaming answers; a fine-tuned NLI model; multi-tenant organisations; email verification and password reset; distributed rate limiting.

## Functional requirements

| # | Requirement | Role |
|---|---|---|
| F1 | Register (viewer), sign in, sign out | public |
| F2 | Ask a question and receive an answer with supporting and contradicting evidence, source, date and trust | all |
| F3 | See what a plain RAG would answer for the same question | all |
| F4 | Browse and filter conflicts (status, source, confidence, text) | all |
| F5 | Search documents with full-text queries; view a document with its claims and their relations | all |
| F6 | Ingest a document and see the claims and conflicts it created | analyst, admin |
| F7 | Resolve a conflict by keeping one claim, dismiss a false alarm, undo a resolution | admin |
| F8 | Manage sources (trust, kind) and see computed reliability | admin (edit), all (view) |
| F9 | Manage users and roles; never lose the last admin | admin |
| F10 | View question history with the evidence used; view the audit log | own history: all; all history and audit: admin |
| F11 | Every change to relations, resolutions and sources is audited by the database | system |

Non-functional: parameterised SQL only, secrets from the environment, bcrypt passwords, validation in the database, ingest is atomic, answers in well under a second on the demo corpus.

## Architecture and design

See [ARCHITECTURE.md](ARCHITECTURE.md) (components, pipelines, scoring) and [DESIGN.md](DESIGN.md) (database choice, relational schema, vector model, integrity, decisions).

## Phases and status

| # | Deliverable | Status |
|---|---|---|
| 0 | Repo, schema, dev database, tests | done |
| 1 | Auth, roles, sources and users administration | done |
| 2 | Ingest pipeline (chunk, embed, claims, shortlist, judge, one transaction) | done |
| 3 | Ask pipeline and interface (grouping, scoring, plain-RAG comparison) | done |
| 4 | Conflicts review, resolve, dismiss, undo; audit | done |
| 5 | Evaluation harness and labelled corpus | done |
| 6 | Documentation, screenshots, ER image, data dictionary, query pack, demo script | done |

## Team and contributions

Built by one student working alone. The brief expects two-member teams, so this needs the instructor's approval (see the open questions in the requirements map). All database, backend and interface work is in this repository's history. If a team is formed later, the natural split is *database and pipelines* (`db/`, `src/lib/ingest.ts`, `src/lib/ask.ts`, `src/lib/judge-offline.ts`) versus *application* (`src/app`, `src/components`, auth, tests).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Judge errors (false contradictions on different scopes) | Scope and audience guards; masked-embedding gate; confidence stored; admin can dismiss; evaluation lists every disagreement with the labels |
| Judge cost and latency | Vector shortlist (5 per claim) bounds calls; judging happens once at ingest |
| Embedding model weak on negation | Embeddings only shortlist; the judge decides |
| Prompt injection through documents | Pattern rejection, fenced prompts, no tool access for the model |
| No Docker on a development machine | `npm run db:dev` runs PostgreSQL + pgvector in-process; docker-compose is provided for a real server |
| Single-process rate limiter | Documented limit; move counters to the database if scaled out |

## Future work

Model-based judge calibration on a larger human-labelled set; temporal validity ("true until 2025-06") as a first-class column; claim-level provenance spans in the original text; scheduled re-judging when the judge improves; PDF ingestion; per-source reliability learned from resolutions with a proper Bayesian update.
