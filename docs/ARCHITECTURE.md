# Architecture

## Components

```
Browser
  │  pages (server components) + client components (forms)
  ▼
Next.js 16 app (Node)
  ├─ src/app/**/page.tsx     server-rendered pages, read through src/lib/queries.ts
  ├─ src/app/api/**/route.ts route handlers: the HTTP API, one per resource
  ├─ src/lib/auth.ts         signed session cookie, role checks (requirePage / requireApi)
  ├─ src/lib/ingest.ts       ingest pipeline
  ├─ src/lib/ask.ts          ask pipeline, evidence grouping
  ├─ src/lib/llm.ts          Llm interface: offline rules | Anthropic
  ├─ src/lib/judge-offline.ts rule-based contradiction judge
  ├─ src/lib/embed.ts        local MiniLM (transformers.js) or hash embeddings
  └─ src/lib/db.ts           pg pool, transactions, type parsers
  ▼
PostgreSQL 17 + pgvector
  tables · HNSW and GIN indexes · stored functions · triggers · views
```

Reads for pages go straight through `src/lib/queries.ts` (server components). Every mutation goes through a route handler, so the HTTP API is the only way to change data from the browser, and every handler checks the role before it touches the database.

## Data flow

### Ingest (`POST /api/ingest`, analyst or admin)

1. **Guard:** reject instruction-like text (`src/lib/injection.ts`), reject an identical document (`content_hash UNIQUE`, checked before and enforced by the database), reject an unknown source.
2. **Chunk:** paragraphs are packed up to 700 characters, never splitting a sentence.
3. **Embed** chunks with MiniLM (384-d, unit length, so cosine similarity is a dot product).
4. **Extract claims** from each chunk: Claude (JSON list) or, offline, one claim per sentence of five or more words. Claims are de-duplicated within the document.
5. **Embed claims.**
6. **Shortlist:** for each new claim, `find_similar_claims(vec, 5)` returns the nearest active claims from the *existing* knowledge base above a similarity floor (0.6). This keeps judging at O(claims × 5), not O(claims²).
7. **Judge** each pair as `contradicts | supports | neutral` with confidence and a rationale (Claude, or the offline judge). At most 200 pairs per document.
8. **Write** the document, chunks, claims and non-neutral relations inside one `BEGIN … COMMIT`. All slow work (embedding, model calls) happens before `BEGIN`, so no connection is held open for it. If anything fails, nothing is stored.

Neutral pairs are not stored: they carry no information and would dominate the table.

### Ask (`POST /api/ask`, any signed-in user)

1. Embed the question.
2. `find_similar_claims(q, k=8)` over **active** claims, joined to document, source and `source_reliability(source)`, keeping similarity ≥ 0.35. Corroboration is the number of active claims linked by a `supports` relation.
3. `retrieve_conflicts(q, k)` returns the contradiction edges whose both ends are in that retrieved set; a `supports` query returns the corroboration edges.
4. **Group** (`groupEvidence`): claims joined by `supports` form one *position*; positions joined by `contradicts` form one *conflict*. Three claims saying 75 % against one saying 85 % is one two-sided conflict with the corroborating claims attached, not three pair conflicts. Conflicts whose closest claim is below similarity 0.5 are dropped as off-topic.
5. **Score** each claim: `similarity × reliability × recency × corroboration` (see below) and lean to the higher side. Within 10 % the result is *undecided* and the answer tells the user an admin should resolve it.
6. **Answer** with the `Llm`: offline template, or Claude given the evidence with source, date and reliability, instructed to state the disagreement and cite claim ids.
7. **Log** the question, the answer and every claim used (`queries`, `query_evidence`, role *supporting* or *contradicting*) in one transaction.

With `compare: true` a second retrieval simulates a plain RAG (same nearest claims, including superseded ones, no conflict data, no weighting) so the UI can show both answers side by side.

### Resolve (`POST /api/conflicts/:id/resolve`, admin)

An `INSERT INTO conflict_resolutions` is all the application does. The database does the rest:

- `trg_resolution_check` (BEFORE): the relation must be a contradiction, the winner must be one of its two claims, and neither claim may already be superseded.
- `trg_resolution_apply` (AFTER): the loser's `status` becomes `superseded`.
- `trg_audit_resolutions`: the change is written to `audit_log`.

Deleting the resolution (undo) fires `trg_resolution_undo`, which reactivates the loser unless it also lost another conflict. `find_similar_claims` and `v_open_conflicts` only see active claims, so the loser disappears from retrieval, and `source_reliability` drops for the loser's source.

## Scoring

| Factor | Definition |
|---|---|
| similarity | cosine similarity between question and claim |
| reliability | `source_reliability(source)`: declared trust × (1 − 0.5 × share of the source's claims that lost resolved conflicts) |
| recency | 1 − 0.05 per year of age, floor 0.8; unknown date 0.95 |
| corroboration | 1 + 0.15 per supporting active claim, capped at 3 |

The weights are simple and inspectable on purpose. They live in `src/lib/score.ts` with unit tests.

## Judges

| | Offline (default without a key) | Anthropic (with `ANTHROPIC_API_KEY`) |
|---|---|---|
| Claim extraction | one claim per sentence | model returns a JSON list of self-contained claims |
| Contradiction | rules over numbers with units, clock times, dates, negation, antonyms; scope and audience tokens (first-year vs final-year, girls vs boys, students vs faculty) make a pair neutral; **masked-embedding similarity** (numbers and dates replaced by `#` before embedding) must be ≥ 0.8, which separates "same attribute, different value" from "different attribute" | prompt defines contradiction as "cannot both be true for the same scope", tells the model that different scopes are not contradictions and that a newer document changing a rule is |
| Answer | template listing both sides and the reason one leads | model answer under 150 words citing claim ids |

Untrusted text (claims, documents) is fenced in tags in every prompt, with an instruction never to follow instructions inside it. If a model reply cannot be parsed, extraction falls back to the offline extractor and judging falls back to *neutral with confidence 0* rather than failing the ingest.

## Deployment shape

One Next.js server process and one PostgreSQL. The rate limiter is in process memory, so run one server instance or move it to the database (see [SECURITY.md](SECURITY.md)). The embedding model (~25 MB) is downloaded on first use and cached by `@huggingface/transformers`.
