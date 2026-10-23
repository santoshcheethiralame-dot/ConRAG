# ConRAG

A contradiction-aware retrieval-augmented generation system. When documents in a knowledge base disagree, ConRAG finds the conflict, weighs the sources, and answers with the supporting and the contradicting evidence instead of silently picking one.

Stack: Next.js (App Router) · PostgreSQL 17 + pgvector · local embeddings (MiniLM, 384-d) · Anthropic API for claim extraction, contradiction judging, answers.

Project plan: [docs/PLAN.md](docs/PLAN.md) · ER diagram: [docs/er-diagram.md](docs/er-diagram.md) · Requirements coverage: [docs/requirements-map.md](docs/requirements-map.md)

## Setup

Needs Node 20+.

```bash
npm install
cp .env.example .env     # then fill in the values
```

**Database, option A: Docker (real PostgreSQL, used for the demo)**

```bash
docker compose up -d
```

**Database, option B: no Docker (in-process Postgres + pgvector, dev only)**

```bash
npm run db:dev           # leave running; listens on 127.0.0.1:5433
```

Then, in another terminal:

```bash
npm run db:migrate       # applies db/migrations/*.sql
npm run db:seed          # demo users (admin/analyst/viewer) and sources
npm run db:test          # constraint/trigger/function smoke test
npm run dev              # http://localhost:3000, health check at /api/health
```

Demo users are `admin@conrag.test`, `analyst@conrag.test`, `viewer@conrag.test`; the password is whatever `SEED_PASSWORD` is in your `.env`.

## Layout

```
db/migrations/   versioned DDL, functions, triggers, views
db/tests/        database smoke test (rolls back)
scripts/         migrate, seed, dev-db
src/app/         Next.js pages and /api route handlers
src/lib/         db pool and shared server code
docs/            plan, ER diagram, requirements map
```

## Status

Phase 0 done: schema, migrations, dev DB, smoke test, app skeleton. See the phase table in the plan.
