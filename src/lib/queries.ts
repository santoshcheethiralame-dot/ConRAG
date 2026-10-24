// Read-side SQL used by server-rendered pages and GET route handlers.
import { one, rows } from "./db";

export interface Stats {
  documents: number;
  claims: number;
  active_claims: number;
  sources: number;
  open_conflicts: number;
  resolved_conflicts: number;
  queries: number;
}

export function dashboardStats() {
  return one<Stats>(`
    SELECT
      (SELECT count(*) FROM documents)::int AS documents,
      (SELECT count(*) FROM claims)::int AS claims,
      (SELECT count(*) FROM claims WHERE status = 'active')::int AS active_claims,
      (SELECT count(*) FROM sources)::int AS sources,
      (SELECT count(*) FROM v_open_conflicts)::int AS open_conflicts,
      (SELECT count(*) FROM conflict_resolutions)::int AS resolved_conflicts,
      (SELECT count(*) FROM queries)::int AS queries`);
}

export interface ConflictRow {
  relation_id: number;
  confidence: number;
  rationale: string | null;
  claim_a: number;
  text_a: string;
  source_a: string;
  trust_a: number;
  date_a: string | null;
  claim_b: number;
  text_b: string;
  source_b: string;
  trust_b: number;
  date_b: string | null;
  resolved?: {
    winner_claim_id: number;
    resolved_at: string;
    resolver: string | null;
    note: string | null;
  } | null;
}

export interface ConflictFilter {
  status: "open" | "resolved";
  minConfidence?: number;
  source?: string;
  text?: string;
}

export async function listConflicts(f: ConflictFilter): Promise<ConflictRow[]> {
  const params: unknown[] = [f.minConfidence ?? 0];
  const where: string[] = ["x.confidence >= $1"];
  if (f.source) {
    params.push(f.source);
    where.push(`(x.source_a = $${params.length} OR x.source_b = $${params.length})`);
  }
  if (f.text) {
    params.push(`%${f.text.replace(/[%_\\]/g, "\\$&")}%`);
    where.push(`(x.text_a ILIKE $${params.length} OR x.text_b ILIKE $${params.length})`);
  }
  if (f.status === "open") {
    return rows<ConflictRow>(
      `SELECT x.* FROM v_open_conflicts x WHERE ${where.join(" AND ")} ORDER BY x.confidence DESC, x.relation_id`,
      params,
    );
  }
  const res = await rows<ConflictRow & { winner_claim_id: number; resolved_at: string; resolver: string | null; note: string | null }>(
    `WITH x AS (
       SELECT r.id AS relation_id, r.confidence, r.rationale,
              ca.id AS claim_a, ca.text AS text_a, sa.name AS source_a, sa.trust_score AS trust_a, da.published_at AS date_a,
              cb.id AS claim_b, cb.text AS text_b, sb.name AS source_b, sb.trust_score AS trust_b, db.published_at AS date_b
       FROM claim_relations r
       JOIN claims ca ON ca.id = r.claim_a JOIN documents da ON da.id = ca.document_id JOIN sources sa ON sa.id = da.source_id
       JOIN claims cb ON cb.id = r.claim_b JOIN documents db ON db.id = cb.document_id JOIN sources sb ON sb.id = db.source_id
     )
     SELECT x.*, cr.winner_claim_id, cr.resolved_at::text AS resolved_at, u.email AS resolver, cr.note
     FROM conflict_resolutions cr
     JOIN x ON x.relation_id = cr.relation_id
     LEFT JOIN users u ON u.id = cr.resolved_by
     WHERE ${where.join(" AND ")}
     ORDER BY cr.resolved_at DESC`,
    params,
  );
  return res.map(({ winner_claim_id, resolved_at, resolver, note, ...rest }) => ({
    ...rest,
    resolved: { winner_claim_id, resolved_at, resolver, note },
  }));
}

export async function conflictSources(): Promise<string[]> {
  return (await rows<{ name: string }>("SELECT name FROM sources ORDER BY name")).map((r) => r.name);
}

export interface DocRow {
  id: number;
  title: string;
  source_name: string;
  published_at: string | null;
  claims: number;
  conflicts: number;
  snippet?: string;
}

export async function listDocuments(q?: string): Promise<DocRow[]> {
  if (q && q.trim()) {
    return rows<DocRow>(
      `SELECT s.document_id AS id, s.title, s.source_name, d.published_at, s.snippet,
              (SELECT count(*) FROM claims c WHERE c.document_id = d.id)::int AS claims, 0 AS conflicts
       FROM search_documents($1, 50) s JOIN documents d ON d.id = s.document_id
       ORDER BY s.rank DESC`,
      [q],
    );
  }
  return rows<DocRow>(
    `SELECT d.id, d.title, s.name AS source_name, d.published_at,
            count(DISTINCT c.id)::int AS claims,
            count(DISTINCT r.id) FILTER (WHERE r.relation = 'contradicts')::int AS conflicts
     FROM documents d
     JOIN sources s ON s.id = d.source_id
     LEFT JOIN claims c ON c.document_id = d.id
     LEFT JOIN claim_relations r ON c.id IN (r.claim_a, r.claim_b)
     GROUP BY d.id, s.name
     ORDER BY d.created_at DESC, d.id DESC`,
  );
}

export interface DocDetail {
  id: number;
  title: string;
  body: string;
  source_name: string;
  source_id: number;
  published_at: string | null;
  uploader: string | null;
  created_at: string;
}

export interface DocClaim {
  id: number;
  text: string;
  status: "active" | "superseded";
  relations: { relation_id: number; relation: string; confidence: number; other_id: number; other_text: string; other_source: string }[];
}

export async function getDocument(id: number): Promise<{ doc: DocDetail; claims: DocClaim[] } | null> {
  const doc = await one<DocDetail>(
    `SELECT d.id, d.title, d.body, s.name AS source_name, s.id AS source_id, d.published_at, u.email AS uploader, d.created_at::text
     FROM documents d JOIN sources s ON s.id = d.source_id LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.id = $1`,
    [id],
  );
  if (!doc) return null;
  const claims = await rows<{ id: number; text: string; status: "active" | "superseded" }>(
    "SELECT c.id, c.text, c.status FROM claims c JOIN chunks k ON k.id = c.chunk_id WHERE c.document_id = $1 ORDER BY k.ordinal, c.id",
    [id],
  );
  const rels = await rows<{ me: number; relation_id: number; relation: string; confidence: number; other_id: number; other_text: string; other_source: string }>(
    `SELECT me.id AS me, r.id AS relation_id, r.relation, r.confidence, o.id AS other_id, o.text AS other_text, s.name AS other_source
     FROM claims me
     JOIN claim_relations r ON me.id IN (r.claim_a, r.claim_b)
     JOIN claims o ON o.id = CASE WHEN r.claim_a = me.id THEN r.claim_b ELSE r.claim_a END
     JOIN documents d ON d.id = o.document_id
     JOIN sources s ON s.id = d.source_id
     WHERE me.document_id = $1
     ORDER BY r.relation, r.confidence DESC`,
    [id],
  );
  return {
    doc,
    claims: claims.map((c) => ({
      ...c,
      relations: rels
        .filter((r) => r.me === c.id)
        .map((r) => ({ relation_id: r.relation_id, relation: r.relation, confidence: r.confidence, other_id: r.other_id, other_text: r.other_text, other_source: r.other_source })),
    })),
  };
}

export interface SourceRow {
  source_id: number;
  name: string;
  kind: string;
  trust_score: number;
  documents: number;
  claims: number;
  reliability: number;
  url: string | null;
  contradicted: number;
}

export function listSources() {
  return rows<SourceRow>(
    `SELECT v.source_id, v.name, v.kind, v.trust_score, v.documents, v.claims, v.reliability, s.url,
            (SELECT count(DISTINCT c.id)::int
               FROM claims c JOIN documents d ON d.id = c.document_id
               JOIN claim_relations r ON c.id IN (r.claim_a, r.claim_b) AND r.relation = 'contradicts'
              WHERE d.source_id = s.id) AS contradicted
     FROM v_source_stats v JOIN sources s ON s.id = v.source_id
     ORDER BY v.trust_score DESC, v.name`,
  );
}

export interface UserRow {
  id: number;
  email: string;
  role: string;
  created_at: string;
  queries: number;
}

export function listUsers() {
  return rows<UserRow>(
    `SELECT u.id, u.email, u.role, u.created_at::text, count(q.id)::int AS queries
     FROM users u LEFT JOIN queries q ON q.user_id = u.id
     GROUP BY u.id ORDER BY u.id`,
  );
}

export interface AuditRow {
  id: number;
  table_name: string;
  row_id: number | null;
  action: string;
  at: string;
  summary: string;
}

export function listAudit(limit = 100, table?: string) {
  return rows<AuditRow>(
    `SELECT id, table_name, row_id, action, at::text,
            coalesce(new_data::text, old_data::text) AS summary
     FROM audit_log
     WHERE ($2::text IS NULL OR table_name = $2)
     ORDER BY id DESC LIMIT $1`,
    [limit, table ?? null],
  );
}

export interface QueryRow {
  id: number;
  question: string;
  answer: string | null;
  latency_ms: number | null;
  created_at: string;
  asker: string | null;
  conflicts: number;
}

export function listQueries(userId: number | null, limit = 50) {
  return rows<QueryRow>(
    `SELECT q.id, q.question, q.answer, q.latency_ms, q.created_at::text, u.email AS asker,
            (SELECT count(*) FROM query_evidence e WHERE e.query_id = q.id AND e.role = 'contradicting')::int AS conflicts
     FROM queries q LEFT JOIN users u ON u.id = q.user_id
     WHERE ($1::bigint IS NULL OR q.user_id = $1)
     ORDER BY q.id DESC LIMIT $2`,
    [userId, limit],
  );
}

export async function getQuery(id: number, userId: number | null) {
  const q = await one<QueryRow>(
    `SELECT q.id, q.question, q.answer, q.latency_ms, q.created_at::text, u.email AS asker, 0 AS conflicts
     FROM queries q LEFT JOIN users u ON u.id = q.user_id
     WHERE q.id = $1 AND ($2::bigint IS NULL OR q.user_id = $2)`,
    [id, userId],
  );
  if (!q) return null;
  const evidence = await rows<{ claim_id: number; text: string; role: string; rank: number; similarity: number; source_name: string; published_at: string | null }>(
    `SELECT e.claim_id, c.text, e.role, e.rank, e.similarity, s.name AS source_name, d.published_at
     FROM query_evidence e
     JOIN claims c ON c.id = e.claim_id
     JOIN documents d ON d.id = c.document_id
     JOIN sources s ON s.id = d.source_id
     WHERE e.query_id = $1 ORDER BY e.rank`,
    [id],
  );
  return { query: q, evidence };
}
