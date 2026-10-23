import { one, rows, vec, withTx } from "./db";
import { embed } from "./embed";
import { env } from "./env";
import { getLlm, type ConflictView, type EvidenceClaim } from "./llm";
import { claimScore, lean } from "./score";

export interface AskResult {
  queryId: number;
  answer: string;
  conflicts: ConflictView[];
  /** Relevant, uncontested claims. */
  claims: EvidenceClaim[];
  /** Plain RAG over the same data, only when compare = true. */
  plain?: { answer: string; claims: EvidenceClaim[] };
  llm: string;
  ms: number;
}

interface ClaimRow {
  claim_id: number;
  text: string;
  similarity: number;
  doc_title: string;
  published_at: string | null;
  source_name: string;
  trust_score: number;
  reliability: number;
  corroboration: number;
}

const toEvidence = (r: ClaimRow): EvidenceClaim => {
  const base = {
    id: r.claim_id,
    text: r.text,
    source: r.source_name,
    documentTitle: r.doc_title,
    trust: r.trust_score,
    reliability: r.reliability,
    date: r.published_at,
    similarity: Math.round(r.similarity * 1000) / 1000,
    corroboration: r.corroboration,
  };
  return {
    ...base,
    score: Math.round(
      claimScore({ similarity: r.similarity, reliability: r.reliability, publishedAt: r.published_at, corroboration: r.corroboration }) * 1000,
    ) / 1000,
  };
};

/** Active claims nearest the question, with provenance, reliability and corroboration. */
async function retrieveClaims(qv: string, k: number, minSim: number): Promise<ClaimRow[]> {
  return rows<ClaimRow>(
    `SELECT f.claim_id, f.text, f.similarity, d.title AS doc_title, d.published_at,
            s.name AS source_name, s.trust_score, source_reliability(s.id) AS reliability,
            (SELECT count(*) FROM claim_relations r
               JOIN claims o ON o.id = CASE WHEN r.claim_a = f.claim_id THEN r.claim_b ELSE r.claim_a END
              WHERE r.relation = 'supports' AND f.claim_id IN (r.claim_a, r.claim_b) AND o.status = 'active')::int AS corroboration
     FROM find_similar_claims($1::vector, $2) f
     JOIN documents d ON d.id = f.document_id
     JOIN sources s ON s.id = d.source_id
     WHERE f.similarity >= $3
     ORDER BY f.similarity DESC`,
    [qv, k, minSim],
  );
}

/** What a plain RAG sees: the nearest claims, whether or not they were superseded, no conflict data. */
async function retrievePlain(qv: string, k: number, minSim: number): Promise<ClaimRow[]> {
  return rows<ClaimRow>(
    `SELECT c.id AS claim_id, c.text, (1 - (c.embedding <=> $1::vector))::float AS similarity,
            d.title AS doc_title, d.published_at, s.name AS source_name, s.trust_score,
            s.trust_score AS reliability, 0 AS corroboration
     FROM claims c
     JOIN documents d ON d.id = c.document_id
     JOIN sources s ON s.id = d.source_id
     WHERE 1 - (c.embedding <=> $1::vector) >= $3
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    [qv, k, minSim],
  );
}

/** Pure grouping step, exported for tests: split retrieved claims into conflicts and uncontested claims. */
export function groupEvidence(
  retrieved: EvidenceClaim[],
  pairs: { relation_id: number; claim_a: number; claim_b: number; confidence: number; rationale: string | null }[],
): { conflicts: ConflictView[]; claims: EvidenceClaim[] } {
  const byId = new Map(retrieved.map((c) => [c.id, c]));
  const conflicts: ConflictView[] = [];
  const contested = new Set<number>();
  for (const p of pairs) {
    const a = byId.get(p.claim_a);
    const b = byId.get(p.claim_b);
    if (!a || !b) continue;
    contested.add(a.id).add(b.id);
    conflicts.push({ relationId: p.relation_id, confidence: p.confidence, rationale: p.rationale, a, b, lean: lean(a.score, b.score) });
  }
  conflicts.sort((x, y) => Math.max(y.a.similarity, y.b.similarity) - Math.max(x.a.similarity, x.b.similarity));
  return { conflicts, claims: retrieved.filter((c) => !contested.has(c.id)) };
}

export async function ask(question: string, userId: number | null, opts: { compare?: boolean } = {}): Promise<AskResult> {
  const t0 = Date.now();
  const cfg = env();
  const llm = getLlm();
  const [qvRaw] = await embed([question]);
  const qv = vec(qvRaw);

  const retrieved = (await retrieveClaims(qv, cfg.RETRIEVAL_K, cfg.MIN_SIMILARITY)).map(toEvidence);
  const pairs = retrieved.length
    ? await rows<{ relation_id: number; claim_a: number; claim_b: number; confidence: number; rationale: string | null }>(
        "SELECT relation_id, claim_a, claim_b, confidence, rationale FROM retrieve_conflicts($1::vector, $2)",
        [qv, cfg.RETRIEVAL_K],
      )
    : [];
  const { conflicts, claims } = groupEvidence(retrieved, pairs);

  const answer = await llm.answer({ question, claims, conflicts });

  let plain: AskResult["plain"];
  if (opts.compare) {
    const plainClaims = (await retrievePlain(qv, cfg.RETRIEVAL_K, cfg.MIN_SIMILARITY)).map(toEvidence);
    plain = { answer: await llm.answerPlain(question, plainClaims), claims: plainClaims.slice(0, 3) };
  }

  const ms = Date.now() - t0;
  const queryId = await withTx(async (c) => {
    const q = await c.query<{ id: number }>(
      "INSERT INTO queries (user_id, question, answer, latency_ms) VALUES ($1, $2, $3, $4) RETURNING id",
      [userId, question, answer, ms],
    );
    const id = q.rows[0].id;
    let rank = 1;
    const put = (claim: EvidenceClaim, role: "supporting" | "contradicting") =>
      c.query(
        "INSERT INTO query_evidence (query_id, claim_id, role, rank, similarity) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
        [id, claim.id, role, rank++, claim.similarity],
      );
    for (const x of claims) await put(x, "supporting");
    for (const cf of conflicts) {
      const [win, lose] = cf.lean === "b" ? [cf.b, cf.a] : [cf.a, cf.b];
      await put(win, "supporting");
      await put(lose, "contradicting");
    }
    return id;
  });

  return { queryId, answer, conflicts, claims, plain, llm: llm.name, ms };
}

export async function queryExists(id: number) {
  return !!(await one("SELECT 1 FROM queries WHERE id = $1", [id]));
}
