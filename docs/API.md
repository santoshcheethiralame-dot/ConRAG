# HTTP API

All endpoints are Next.js Route Handlers under `/api`. Bodies are JSON and **must** send `Content-Type: application/json` (otherwise `415`); this doubles as a CSRF defence.

Auth is a signed, HTTP-only, `SameSite=Lax` session cookie set by login/register. Roles: `admin` ⊃ `analyst` ⊃ `viewer`.

## Endpoints

| Method and path | Role | Body / query | Success | Notes |
|---|---|---|---|---|
| `POST /api/auth/register` | public | `{email, password(8-72)}` | `201 {ok, role:"viewer"}` | always creates a viewer; sets the session |
| `POST /api/auth/login` | public | `{email, password}` | `200 {ok, role}` | 10 attempts per 15 min per IP+email |
| `POST /api/auth/logout` | any | | `200` | |
| `GET /api/health` | public | | `{ok, pgvector}` | |
| `POST /api/ask` | any | `{question(3-500), compare?}` | `AskResult` (below) | 30 per minute per user |
| `POST /api/ingest` | analyst, admin | `{sourceId, title, body(20-100000), publishedAt?: "YYYY-MM-DD"}` | `201 IngestResult` | `409` duplicate, `422` unknown source or instruction-like text |
| `GET /api/documents` | any | `?q=` full-text query | `DocRow[]` | websearch syntax: `"phrase"`, `-exclude`, `or` |
| `GET /api/documents/:id` | any | | `{doc, claims[]}` | claims include their relations |
| `DELETE /api/documents/:id` | admin | | `200` | cascades to claims, relations, resolutions |
| `GET /api/conflicts` | any | `?status=open\|resolved&minConfidence&source&q` | `ConflictRow[]` | |
| `POST /api/conflicts/:id/resolve` | admin | `{winnerClaimId, note?}` | `201` | `409` already resolved, `422` winner not in the pair or claim already superseded |
| `DELETE /api/conflicts/:id/resolve` | admin | | `200` | undo; `404` if none |
| `POST /api/conflicts/:id/dismiss` | admin | | `200` | marks a false alarm (relation becomes `neutral`) |
| `GET /api/sources` | any | | `SourceRow[]` | includes computed reliability |
| `POST /api/sources` | admin | `{name, kind, trustScore(0-1), url?}` | `201 {id}` | `409` duplicate name |
| `PATCH /api/sources/:id` | admin | any subset of the above | `200` | |
| `DELETE /api/sources/:id` | admin | | `200` | cascades to its documents |
| `GET /api/users` | admin | | `UserRow[]` | |
| `PATCH /api/users/:id` | admin | `{role}` | `200` | `422` if it would remove the last admin |
| `DELETE /api/users/:id` | admin | | `200` | questions are kept, anonymised |
| `GET /api/audit` | admin | `?table=` | `AuditRow[]` | newest 200 |
| `GET /api/stats` | any | | counts | |

## Errors

```json
{ "error": "Invalid input", "issues": [{ "path": "question", "message": "Ask a full question" }] }
```

| Status | Meaning |
|---|---|
| 400 | malformed JSON or id |
| 401 | not signed in |
| 403 | role not allowed |
| 404 | not found |
| 409 | duplicate or already resolved; also a referenced row is missing or in use |
| 415 | not `application/json` |
| 422 | validation failed, in the handler (zod) or in the database (CHECK / trigger) |
| 429 | rate limit |
| 500 | unexpected; details only in the server log |

Database constraint violations are mapped in `src/lib/http.ts`: `23505 → 409`, `23503 → 409`, `23502/23514/22P02/22001/22003 → 422`.

## Shapes

```ts
interface AskResult {
  queryId: number;
  answer: string;
  conflicts: {
    relationId: number; confidence: number; rationale: string | null;
    a: Evidence; b: Evidence; alsoA: Evidence[]; alsoB: Evidence[];   // alsoX: other claims saying the same thing
    lean: "a" | "b" | "undecided";
  }[];
  claims: Evidence[];                       // relevant, uncontested
  plain?: { answer: string; claims: Evidence[] };   // when compare = true
  llm: string; ms: number;
}
interface Evidence {
  id: number; text: string; source: string; documentTitle: string;
  trust: number; reliability: number; date: string | null;
  similarity: number; corroboration: number; score: number;
}
interface IngestResult {
  documentId: number; chunks: number; claims: number; judged: number;
  contradicts: number; supports: number; llm: string; ms: number;
}
```

## Example

```bash
curl -c jar -H 'Content-Type: application/json' \
  -d '{"email":"viewer@conrag.test","password":"<SEED_PASSWORD>"}' http://localhost:3000/api/auth/login

curl -b jar -H 'Content-Type: application/json' \
  -d '{"question":"What is the minimum attendance?","compare":true}' http://localhost:3000/api/ask
```
