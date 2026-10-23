# Security

## Controls

| Area | What is done | Where |
|---|---|---|
| Passwords | bcrypt (cost 10); hash shape enforced by a `CHECK`; plaintext is never stored or logged. Passwords over 72 bytes are rejected (bcrypt would truncate them). | `src/lib/auth.ts`, migration 001 |
| Login | Same response for unknown email and wrong password; a dummy bcrypt compare equalises timing; 10 attempts per 15 minutes per IP and email | `verifyLogin`, `api/auth/login` |
| Sessions | HS256 JWT in an HTTP-only, `SameSite=Lax` cookie (`Secure` in production), 8 hours. Each request re-reads the user row, so role changes and deletions apply at once. | `src/lib/auth.ts` |
| Authorisation | Role check in every route handler (`requireApi`) and every protected page (`requirePage`); never only in the UI | `src/lib/auth.ts` |
| CSRF | JSON-only API (`Content-Type: application/json` required, so a cross-site form cannot submit) plus `SameSite=Lax` | `src/lib/http.ts` |
| Input validation | zod in every handler; again in the database with `CHECK`, `UNIQUE`, foreign keys and triggers | `src/app/api`, `db/migrations` |
| SQL injection | Every statement is parameterised. The one dynamic `ILIKE` escapes `%`, `_` and `\`. | `src/lib/queries.ts` |
| XSS | React escapes output. The only `dangerouslySetInnerHTML` renders a search snippet after escaping everything except `<b>` | `src/app/documents/page.tsx` |
| Secrets | `DATABASE_URL`, `SESSION_SECRET` and API keys come from the environment (validated at first use); `.env` is git-ignored; `.env.example` has no values | `src/lib/env.ts` |
| Prompt injection | Documents are untrusted input to a language model. Instruction-like text is rejected at ingest; every prompt fences claims in tags and says to treat them as data; model replies are parsed and validated, never executed | `src/lib/injection.ts`, `src/lib/llm.ts` |
| Rate limits | Login, register, ask | `src/lib/ratelimit.ts` |
| Headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` | `next.config.ts` |
| Auditability | Triggers log every change to relations, resolutions and sources, independent of application code | migration 003 |
| Privilege escalation | Public registration always yields a viewer; roles change only through an admin-only endpoint; a trigger keeps at least one admin | `api/auth/register`, migration 004 |
| Errors | Unexpected errors return a generic message; details go to the server log only | `src/lib/http.ts` |

## Tested

`tests/e2e/app.e2e.ts` checks that anonymous users are redirected, wrong passwords are refused, a viewer cannot reach ingest/users pages or call their APIs (`403`), non-JSON bodies get `415`, malformed JSON `400`, and instruction-like documents `422`. `tests/db.test.ts` attacks the integrity rules directly.

## Known limits (honest list)

- **Rate limiting is per process.** Behind several instances, move the counters to the database.
- **Demo users share a documented password** from `SEED_PASSWORD`. Use a strong one and do not seed in production.
- **No email verification or password reset.** Out of scope for the course project.
- **A stolen session cookie works until it expires (8 hours) or its user is deleted.** There is no per-token revocation list.
- **Prompt-injection defence is best effort.** Pattern rejection and fencing reduce, but cannot eliminate, the risk of hostile text steering a model. The model never has tools or write access, so the worst case is a wrong answer or a wrong judgement, both of which an admin can correct.
- **The offline judge can be wrong** (see [EVALUATION.md](EVALUATION.md)); conflicts are advisory until an admin resolves them.
