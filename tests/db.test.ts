// Database-level behaviour: constraints, triggers, functions, views, indexes.
// Every test runs inside a transaction that is rolled back.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { PoolClient } from "pg";
import { pool } from "@/lib/db";

const hot = (...idx: number[]) => "[" + Array.from({ length: 384 }, (_, i) => (idx.includes(i) ? 1 : 0)).join(",") + "]";
const HASH = "$2b$10$" + "a".repeat(53);

async function tx(fn: (c: PoolClient) => Promise<void>) {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    await fn(c);
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
}

async function fails(c: PoolClient, code: string, sql: string, params: unknown[] = []) {
  await c.query("SAVEPOINT s");
  await assert.rejects(c.query(sql, params), (e: { code?: string }) => e.code === code, `expected SQLSTATE ${code}`);
  await c.query("ROLLBACK TO SAVEPOINT s");
}

let n = 0;
const uniq = () => `x${++n}`;

async function world(c: PoolClient) {
  const src = async (trust = 0.5) =>
    (await c.query("INSERT INTO sources (name, kind, trust_score) VALUES ($1, 'wiki', $2) RETURNING id", [uniq(), trust])).rows[0].id as number;
  const doc = async (sourceId: number, title = "t", body = "b") =>
    (await c.query("INSERT INTO documents (source_id, title, body, content_hash) VALUES ($1, $2, $3, $4) RETURNING id", [sourceId, title, body, uniq().padEnd(64, "0")])).rows[0].id as number;
  const claim = async (docId: number, vecHot: number[], text = uniq() + " claim text here", ordinal?: number) => {
    const ord = ordinal ?? ++n;
    const ch = await c.query("INSERT INTO chunks (document_id, ordinal, text, embedding) VALUES ($1, $2, $3, $4::vector) RETURNING id", [docId, ord, text, hot(...vecHot)]);
    return (await c.query("INSERT INTO claims (chunk_id, document_id, text, embedding) VALUES ($1, $2, $3, $4::vector) RETURNING id", [ch.rows[0].id, docId, text, hot(...vecHot)])).rows[0].id as number;
  };
  const relate = async (x: number, y: number, rel = "contradicts") =>
    (await c.query("INSERT INTO claim_relations (claim_a, claim_b, relation, confidence, judged_by) VALUES ($1, $2, $3, 0.9, 't') RETURNING id", [Math.min(x, y), Math.max(x, y), rel])).rows[0].id as number;
  const resolve = (rel: number, winner: number) =>
    c.query("INSERT INTO conflict_resolutions (relation_id, winner_claim_id) VALUES ($1, $2)", [rel, winner]);
  const status = async (id: number) => (await c.query("SELECT status FROM claims WHERE id = $1", [id])).rows[0].status as string;
  return { src, doc, claim, relate, resolve, status };
}

describe("table constraints", () => {
  it("rejects malformed users and sources", () =>
    tx(async (c) => {
      await fails(c, "23514", "INSERT INTO users (email, password_hash) VALUES ('nope', $1)", [HASH]);
      await fails(c, "23514", "INSERT INTO users (email, password_hash) VALUES ('a@b.co', 'plaintext')");
      await fails(c, "23514", "INSERT INTO sources (name, kind, trust_score) VALUES ('s', 'news', 1.5)");
      await fails(c, "23514", "INSERT INTO sources (name, kind, url) VALUES ('s', 'news', 'ftp://x')");
      await fails(c, "23514", "INSERT INTO sources (name, kind) VALUES ('   ', 'news')");
      await fails(c, "22P02", "INSERT INTO sources (name, kind) VALUES ('s', 'blog')");
    }));

  it("enforces case-insensitive unique emails and unique source names", () =>
    tx(async (c) => {
      await c.query("INSERT INTO users (email, password_hash) VALUES ('Dup@x.io', $1)", [HASH]);
      await fails(c, "23505", "INSERT INTO users (email, password_hash) VALUES ('dup@X.io', $1)", [HASH]);
      await c.query("INSERT INTO sources (name, kind) VALUES ('same', 'news')");
      await fails(c, "23505", "INSERT INTO sources (name, kind) VALUES ('same', 'wiki')");
    }));

  it("validates documents, chunks and evidence fields", () =>
    tx(async (c) => {
      const w = await world(c);
      const s = await w.src();
      await fails(c, "23514", "INSERT INTO documents (source_id, title, body, content_hash) VALUES ($1, '', 'b', $2)", [s, "h1".padEnd(64, "0")]);
      await fails(c, "23514", "INSERT INTO documents (source_id, title, body, content_hash, published_at) VALUES ($1, 't', 'b', $2, '1980-01-01')", [s, "h2".padEnd(64, "0")]);
      await fails(c, "23503", "INSERT INTO documents (source_id, title, body, content_hash) VALUES (999999, 't', 'b', $1)", ["h3".padEnd(64, "0")]);
      const d = await w.doc(s);
      await fails(c, "23514", "INSERT INTO chunks (document_id, ordinal, text, embedding) VALUES ($1, -1, 't', $2::vector)", [d, hot(0)]);
      await fails(c, "22000", "INSERT INTO chunks (document_id, ordinal, text, embedding) VALUES ($1, 0, 't', '[1,2,3]'::vector)", [d]);
    }));

  it("a claim cannot point at a document its chunk does not belong to", () =>
    tx(async (c) => {
      const w = await world(c);
      const s = await w.src();
      const d1 = await w.doc(s);
      const d2 = await w.doc(s);
      await w.claim(d1, [0]);
      await fails(c, "23503", "INSERT INTO claims (chunk_id, document_id, text, embedding) SELECT id, $2, 'x', embedding FROM chunks WHERE document_id = $1", [d1, d2]);
    }));
});

describe("claim relations", () => {
  it("stores each pair once, ordered, across documents only", () =>
    tx(async (c) => {
      const w = await world(c);
      const s = await w.src();
      const d1 = await w.doc(s);
      const d2 = await w.doc(s);
      const a = await w.claim(d1, [0]);
      const a2 = await w.claim(d1, [1]);
      const b = await w.claim(d2, [2]);
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
      await fails(c, "23514", "INSERT INTO claim_relations (claim_a, claim_b, relation, confidence, judged_by) VALUES ($1, $2, 'contradicts', .9, 't')", [hi, lo]);
      await fails(c, "23514", "INSERT INTO claim_relations (claim_a, claim_b, relation, confidence, judged_by) VALUES ($1, $2, 'contradicts', .9, 't')", [Math.min(a, a2), Math.max(a, a2)]);
      await fails(c, "23514", "INSERT INTO claim_relations (claim_a, claim_b, relation, confidence, judged_by) VALUES ($1, $2, 'contradicts', 1.5, 't')", [lo, hi]);
      await w.relate(a, b);
      await fails(c, "23505", "INSERT INTO claim_relations (claim_a, claim_b, relation, confidence, judged_by) VALUES ($1, $2, 'supports', .9, 't')", [lo, hi]);
    }));

  it("writes an audit row for every insert, update and delete", () =>
    tx(async (c) => {
      const w = await world(c);
      const s = await w.src();
      const a = await w.claim(await w.doc(s), [0]);
      const b = await w.claim(await w.doc(s), [1]);
      const rel = await w.relate(a, b);
      await c.query("UPDATE claim_relations SET relation = 'neutral' WHERE id = $1", [rel]);
      await c.query("DELETE FROM claim_relations WHERE id = $1", [rel]);
      const r = await c.query("SELECT action, old_data IS NULL AS no_old, new_data IS NULL AS no_new FROM audit_log WHERE table_name = 'claim_relations' AND row_id = $1 ORDER BY id", [rel]);
      assert.deepEqual(r.rows, [
        { action: "INSERT", no_old: true, no_new: false },
        { action: "UPDATE", no_old: false, no_new: false },
        { action: "DELETE", no_old: false, no_new: true },
      ]);
    }));
});

describe("vector search functions", () => {
  it("find_similar_claims orders by cosine similarity, honours k and exclude_doc, skips superseded", () =>
    tx(async (c) => {
      const w = await world(c);
      const s = await w.src();
      const d1 = await w.doc(s);
      const d2 = await w.doc(s);
      const near = await w.claim(d1, [0, 1]);
      const mid = await w.claim(d2, [0]);
      const far = await w.claim(d2, [5]);
      const q = hot(0, 1);
      const ids = async (sql: string, p: unknown[]) => (await c.query(sql, p)).rows.map((r) => Number(r.claim_id));
      assert.deepEqual(await ids("SELECT claim_id FROM find_similar_claims($1::vector, 3)", [q]), [near, mid, far]);
      assert.deepEqual(await ids("SELECT claim_id FROM find_similar_claims($1::vector, 1)", [q]), [near]);
      assert.deepEqual(await ids("SELECT claim_id FROM find_similar_claims($1::vector, 3, $2)", [q, d1]), [mid, far]);
      const sim = (await c.query("SELECT similarity FROM find_similar_claims($1::vector, 1)", [q])).rows[0].similarity;
      assert.ok(Math.abs(sim - 1) < 1e-4);
      await c.query("UPDATE claims SET status = 'superseded', superseded_at = now() WHERE id = $1", [near]);
      assert.ok(!(await ids("SELECT claim_id FROM find_similar_claims($1::vector, 3)", [q])).includes(near));
    }));

  it("retrieve_conflicts returns only contradictions inside the retrieved set", () =>
    tx(async (c) => {
      const w = await world(c);
      const s = await w.src();
      const a = await w.claim(await w.doc(s), [0]);
      const b = await w.claim(await w.doc(s), [1]);
      const out = await w.claim(await w.doc(s), [200]);
      const rel = await w.relate(a, b);
      await w.relate(a, out);
      await w.relate(b, out, "supports");
      const q = hot(0, 1);
      const r = await c.query("SELECT relation_id FROM retrieve_conflicts($1::vector, 2)", [q]);
      assert.deepEqual(r.rows.map((x) => Number(x.relation_id)), [rel]);
    }));

  it("uses the HNSW and GIN indexes when the planner is steered to them", () =>
    tx(async (c) => {
      await c.query("SET LOCAL enable_seqscan = off");
      const plan = async (sql: string) => (await c.query("EXPLAIN " + sql)).rows.map((r) => r["QUERY PLAN"]).join("\n");
      const w = await world(c);
      const s = await w.src();
      await w.claim(await w.doc(s, "attendance policy", "minimum attendance is 75 percent"), [0]);
      assert.match(await plan(`SELECT id FROM claims ORDER BY embedding <=> '${hot(0)}'::vector LIMIT 3`), /claims_embedding_hnsw/);
      assert.match(await plan("SELECT id FROM documents WHERE tsv @@ websearch_to_tsquery('english', 'attendance')"), /documents_tsv_gin/);
    }));
});

describe("conflict resolution", () => {
  it("rejects bad winners and non-contradictions", () =>
    tx(async (c) => {
      const w = await world(c);
      const s = await w.src();
      const a = await w.claim(await w.doc(s), [0]);
      const b = await w.claim(await w.doc(s), [1]);
      const x = await w.claim(await w.doc(s), [2]);
      const rel = await w.relate(a, b);
      const sup = await w.relate(a, x, "supports");
      await fails(c, "23514", "INSERT INTO conflict_resolutions (relation_id, winner_claim_id) VALUES ($1, $2)", [rel, x]);
      await fails(c, "23514", "INSERT INTO conflict_resolutions (relation_id, winner_claim_id) VALUES ($1, $2)", [sup, a]);
    }));

  it("supersedes the loser, closes the conflict, hides the loser, lowers its source's reliability", () =>
    tx(async (c) => {
      const w = await world(c);
      const good = await w.src(0.9);
      const bad = await w.src(0.4);
      const a = await w.claim(await w.doc(good), [0]);
      const b = await w.claim(await w.doc(bad), [1]);
      const rel = await w.relate(a, b);
      const open = async () => Number((await c.query("SELECT count(*) FROM v_open_conflicts WHERE relation_id = $1", [rel])).rows[0].count);
      assert.equal(await open(), 1);
      await w.resolve(rel, a);
      assert.equal(await w.status(b), "superseded");
      assert.equal(await w.status(a), "active");
      assert.equal(await open(), 0);
      assert.ok(Number((await c.query("SELECT source_reliability($1) r", [bad])).rows[0].r) < 0.4);
      assert.equal(Number((await c.query("SELECT source_reliability($1) r", [good])).rows[0].r), 0.9);
      await fails(c, "23514", "INSERT INTO conflict_resolutions (relation_id, winner_claim_id) VALUES ($1, $2)", [rel, a]);
    }));

  it("allows one resolution per relation", () =>
    tx(async (c) => {
      const w = await world(c);
      const s = await w.src();
      const a = await w.claim(await w.doc(s), [0]);
      const b = await w.claim(await w.doc(s), [1]);
      const rel = await w.relate(a, b);
      await w.resolve(rel, a);
      await c.query("UPDATE claims SET status = 'active', superseded_at = NULL WHERE id = $1", [b]);
      await fails(c, "23505", "INSERT INTO conflict_resolutions (relation_id, winner_claim_id) VALUES ($1, $2)", [rel, b]);
    }));

  it("undoing a resolution reactivates the loser unless it lost another conflict", () =>
    tx(async (c) => {
      const w = await world(c);
      const s = await w.src();
      const a = await w.claim(await w.doc(s), [0]);
      const b = await w.claim(await w.doc(s), [1]);
      const x = await w.claim(await w.doc(s), [2]);
      const r1 = await w.relate(a, b);
      await w.resolve(r1, a);
      assert.equal(await w.status(b), "superseded");
      await c.query("DELETE FROM conflict_resolutions WHERE relation_id = $1", [r1]);
      assert.equal(await w.status(b), "active");

      const r2 = await w.relate(b, x);
      await w.resolve(r1, a); // b loses to a
      assert.equal(await w.status(b), "superseded");
      await c.query("UPDATE claims SET status = 'active', superseded_at = NULL WHERE id = $1", [b]);
      await w.resolve(r2, x); // b loses to x as well
      await c.query("DELETE FROM conflict_resolutions WHERE relation_id = $1", [r1]);
      assert.equal(await w.status(b), "superseded", "still lost to x");
    }));

  it("cannot resolve a conflict that involves an already superseded claim", () =>
    tx(async (c) => {
      const w = await world(c);
      const s = await w.src();
      const a = await w.claim(await w.doc(s), [0]);
      const b = await w.claim(await w.doc(s), [1]);
      const x = await w.claim(await w.doc(s), [2]);
      await w.resolve(await w.relate(a, b), a);
      const r2 = await w.relate(b, x);
      await fails(c, "23514", "INSERT INTO conflict_resolutions (relation_id, winner_claim_id) VALUES ($1, $2)", [r2, x]);
    }));

  it("keeps status and superseded_at consistent", () =>
    tx(async (c) => {
      const w = await world(c);
      const id = await w.claim(await w.doc(await w.src()), [0]);
      await fails(c, "23514", "UPDATE claims SET status = 'superseded' WHERE id = $1", [id]);
      await fails(c, "23514", "UPDATE claims SET superseded_at = now() WHERE id = $1", [id]);
    }));
});

describe("users", () => {
  it("never leaves the system without an admin", () =>
    tx(async (c) => {
      await c.query("TRUNCATE users CASCADE");
      const a = (await c.query("INSERT INTO users (email, password_hash, role) VALUES ('a1@x.io', $1, 'admin') RETURNING id", [HASH])).rows[0].id;
      await fails(c, "23514", "UPDATE users SET role = 'viewer' WHERE id = $1", [a]);
      await fails(c, "23514", "DELETE FROM users WHERE id = $1", [a]);
      const b = (await c.query("INSERT INTO users (email, password_hash, role) VALUES ('a2@x.io', $1, 'admin') RETURNING id", [HASH])).rows[0].id;
      await c.query("UPDATE users SET role = 'viewer' WHERE id = $1", [a]);
      await fails(c, "23514", "DELETE FROM users WHERE id = $1", [b]);
    }));
});

describe("search and graph functions", () => {
  it("search_documents ranks by relevance, supports websearch syntax, highlights", () =>
    tx(async (c) => {
      const w = await world(c);
      const s = await w.src();
      const strong = await w.doc(s, "Attendance rules", "Minimum attendance is 75 percent. Attendance below this bars you from the exam.");
      const weak = await w.doc(s, "Library", "Books can be borrowed for 14 days. Attendance is not checked here.");
      await w.doc(s, "Hostel", "Hostel curfew is 10 pm.");
      const hits = (await c.query("SELECT document_id, snippet FROM search_documents('attendance')")).rows;
      assert.deepEqual(hits.map((h) => Number(h.document_id)), [strong, weak]);
      assert.match(hits[0].snippet, /<b>[Aa]ttendance<\/b>/);
      const excl = (await c.query("SELECT document_id FROM search_documents('attendance -library')")).rows;
      assert.deepEqual(excl.map((h) => Number(h.document_id)), [strong]);
    }));

  it("conflict_cluster follows contradictions transitively and survives cycles", () =>
    tx(async (c) => {
      const w = await world(c);
      const s = await w.src();
      const [a, b, x, y, lone] = [
        await w.claim(await w.doc(s), [0]),
        await w.claim(await w.doc(s), [1]),
        await w.claim(await w.doc(s), [2]),
        await w.claim(await w.doc(s), [3]),
        await w.claim(await w.doc(s), [4]),
      ];
      await w.relate(a, b);
      await w.relate(b, x);
      await w.relate(x, a); // cycle
      await w.relate(y, lone, "supports"); // not a contradiction edge
      const r = await c.query("SELECT claim_id, depth FROM conflict_cluster($1)", [a]);
      assert.deepEqual(new Set(r.rows.map((x) => Number(x.claim_id))), new Set([a, b, x]));
      assert.equal(r.rows.find((x) => Number(x.claim_id) === a).depth, 0);
      assert.equal((await c.query("SELECT count(*) FROM conflict_cluster($1)", [lone])).rows[0].count, 1);
    }));
});

describe("cascades and views", () => {
  it("deleting a document removes its chunks, claims, relations and resolutions", () =>
    tx(async (c) => {
      const w = await world(c);
      const s = await w.src();
      const d1 = await w.doc(s);
      const a = await w.claim(d1, [0]);
      const b = await w.claim(await w.doc(s), [1]);
      const rel = await w.relate(a, b);
      await w.resolve(rel, b);
      await c.query("DELETE FROM documents WHERE id = $1", [d1]);
      const n = async (t: string) => Number((await c.query(`SELECT count(*) FROM ${t}`)).rows[0].count);
      assert.equal(await n("claim_relations"), 0);
      assert.equal(await n("conflict_resolutions"), 0);
      assert.equal(await w.status(b), "active", "winner untouched");
    }));

  it("v_source_stats counts documents and claims per source", () =>
    tx(async (c) => {
      const w = await world(c);
      const s = await w.src(0.7);
      const d = await w.doc(s);
      await w.doc(s);
      await w.claim(d, [0]);
      await w.claim(d, [1]);
      const r = (await c.query("SELECT documents, claims, reliability FROM v_source_stats WHERE source_id = $1", [s])).rows[0];
      assert.deepEqual({ d: Number(r.documents), c: Number(r.claims), rel: Number(r.reliability) }, { d: 2, c: 2, rel: 0.7 });
    }));
});

after(() => pool().end());
