import { createHash } from "node:crypto";
import { chunkText } from "./chunk";
import { one, rows, vec, withTx } from "./db";
import { embed } from "./embed";
import { env } from "./env";
import { HttpError } from "./http";
import { findInjection } from "./injection";
import { getLlm, type Judgement } from "./llm";

export interface IngestInput {
  sourceId: number;
  title: string;
  body: string;
  publishedAt?: string | null;
  userId: number | null;
}

export interface IngestResult {
  documentId: number;
  chunks: number;
  claims: number;
  judged: number;
  contradicts: number;
  supports: number;
  llm: string;
  ms: number;
}

const MAX_CLAIMS = 300;
const MAX_JUDGEMENTS = 200;
const CONCURRENCY = 4;

export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

export const contentHash = (body: string) =>
  createHash("sha256").update(body.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex");

interface Candidate {
  claim_id: number;
  text: string;
  similarity: number;
  source_name: string;
  published_at: string | null;
}

/**
 * Chunk, embed, extract claims, shortlist cross-document candidates by vector
 * similarity, judge each pair, then write everything in one transaction.
 * All slow work (embedding, LLM) happens before BEGIN so no connection is held open for it.
 */
export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  const t0 = Date.now();
  const cfg = env();
  const body = input.body.trim();

  const bad = findInjection(input.title + "\n" + body);
  if (bad) throw new HttpError(422, "Document contains instruction-like text and was rejected", { match: bad });

  const hash = contentHash(body);
  const dup = await one<{ id: number }>("SELECT id FROM documents WHERE content_hash = $1", [hash]);
  if (dup) throw new HttpError(409, "This document was already ingested", { documentId: dup.id });

  const src = await one<{ name: string }>("SELECT name FROM sources WHERE id = $1", [input.sourceId]);
  if (!src) throw new HttpError(422, "Unknown source");

  const llm = getLlm();
  const chunks = chunkText(body);
  if (chunks.length === 0) throw new HttpError(422, "Document is empty");
  const chunkVecs = await embed(chunks);

  const perChunk = await mapLimit(chunks, CONCURRENCY, (c) => llm.extractClaims(c));
  const seen = new Set<string>();
  const claims: { chunk: number; text: string }[] = [];
  perChunk.forEach((list, chunk) => {
    for (const text of list) {
      const key = text.toLowerCase();
      if (!seen.has(key) && claims.length < MAX_CLAIMS) {
        seen.add(key);
        claims.push({ chunk, text });
      }
    }
  });
  const claimVecs = await embed(claims.map((c) => c.text));

  // Candidate pairs against claims already in the knowledge base.
  const candidates = await mapLimit(claims, CONCURRENCY, (_, i) =>
    rows<Candidate>(
      `SELECT f.claim_id, f.text, f.similarity, s.name AS source_name, d.published_at
       FROM find_similar_claims($1::vector, $2) f
       JOIN documents d ON d.id = f.document_id
       JOIN sources s ON s.id = d.source_id
       WHERE f.similarity >= $3`,
      [vec(claimVecs[i]), cfg.CANDIDATES_PER_CLAIM, cfg.CANDIDATE_MIN_SIMILARITY],
    ),
  );
  const pairs = candidates
    .flatMap((list, ci) => list.map((cand) => ({ ci, cand })))
    .sort((x, y) => y.cand.similarity - x.cand.similarity)
    .slice(0, MAX_JUDGEMENTS);

  const verdicts = await mapLimit(pairs, CONCURRENCY, ({ ci, cand }) =>
    llm.judge(
      { text: claims[ci].text, source: src.name, date: input.publishedAt ?? null },
      { text: cand.text, source: cand.source_name, date: cand.published_at },
      { similarity: cand.similarity },
    ),
  );

  const judgedBy = llm.name;
  return withTx(async (c) => {
    const doc = await c.query<{ id: number }>(
      `INSERT INTO documents (source_id, title, body, published_at, content_hash, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [input.sourceId, input.title.trim(), body, input.publishedAt || null, hash, input.userId],
    );
    const documentId = doc.rows[0].id;

    const chunkIds: number[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const r = await c.query<{ id: number }>(
        "INSERT INTO chunks (document_id, ordinal, text, embedding) VALUES ($1, $2, $3, $4::vector) RETURNING id",
        [documentId, i, chunks[i], vec(chunkVecs[i])],
      );
      chunkIds.push(r.rows[0].id);
    }

    const claimIds: number[] = [];
    for (let i = 0; i < claims.length; i++) {
      const r = await c.query<{ id: number }>(
        `INSERT INTO claims (chunk_id, document_id, text, embedding)
         VALUES ($1, $2, $3, $4::vector) RETURNING id`,
        [chunkIds[claims[i].chunk], documentId, claims[i].text, vec(claimVecs[i])],
      );
      claimIds.push(r.rows[0].id);
    }

    let contradicts = 0;
    let supports = 0;
    for (let i = 0; i < pairs.length; i++) {
      const v: Judgement = verdicts[i];
      if (v.relation === "neutral") continue; // neutral pairs carry no information; not stored
      const newId = claimIds[pairs[i].ci];
      const oldId = pairs[i].cand.claim_id;
      await c.query(
        `INSERT INTO claim_relations (claim_a, claim_b, relation, confidence, rationale, judged_by)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (claim_a, claim_b) DO NOTHING`,
        [Math.min(newId, oldId), Math.max(newId, oldId), v.relation, v.confidence, v.rationale || null, judgedBy],
      );
      if (v.relation === "contradicts") contradicts++;
      else supports++;
    }

    return {
      documentId,
      chunks: chunks.length,
      claims: claims.length,
      judged: pairs.length,
      contradicts,
      supports,
      llm: judgedBy,
      ms: Date.now() - t0,
    };
  });
}
