// DB-level smoke test: constraints, triggers, functions, views. Runs in a transaction and rolls back.
import assert from "node:assert/strict";
import { Client } from "pg";

const vec = (hot: number) => "[" + Array.from({ length: 384 }, (_, i) => (i === hot ? 1 : 0)).join(",") + "]";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("BEGIN");
  const one = async (sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows[0];

  async function rejects(name: string, sql: string, p: unknown[], code: string) {
    await c.query("SAVEPOINT t");
    try {
      await c.query(sql, p);
      assert.fail(`${name}: expected ${code}`);
    } catch (e) {
      assert.equal((e as { code?: string }).code, code, name);
    }
    await c.query("ROLLBACK TO SAVEPOINT t");
    console.log("ok  ", name);
  }

  await rejects("bad email", "INSERT INTO users (email, password_hash) VALUES ('nope', repeat('x', 60))", [], "23514");
  await rejects("trust out of range", "INSERT INTO sources (name, kind, trust_score) VALUES ('s', 'news', 1.5)", [], "23514");

  const src = await one("INSERT INTO sources (name, kind, trust_score) VALUES ('smoke-a', 'official', 0.9) RETURNING id");
  const src2 = await one("INSERT INTO sources (name, kind, trust_score) VALUES ('smoke-b', 'wiki', 0.4) RETURNING id");
  const doc = async (s: number, h: string) =>
    (await one("INSERT INTO documents (source_id, title, body, content_hash) VALUES ($1, 't', 'b', $2) RETURNING id", [s, h])).id;
  const d1 = await doc(src.id, "a".repeat(64));
  const d2 = await doc(src2.id, "b".repeat(64));
  const claim = async (d: number, hot: number, text: string) => {
    const ch = await one("INSERT INTO chunks (document_id, ordinal, text, embedding) VALUES ($1, $4, $2, $3) RETURNING id", [d, text, vec(hot), hot]);
    return Number((await one("INSERT INTO claims (chunk_id, document_id, text, embedding) VALUES ($1, $2, $3, $4) RETURNING id", [ch.id, d, text, vec(hot)])).id);
  };
  const a = await claim(d1, 0, "Attendance minimum is 75%");
  const b = await claim(d2, 1, "Attendance minimum is 85%");
  const a2 = await claim(d1, 2, "Another claim from doc 1");
  const [lo, hi] = a < b ? [a, b] : [b, a];

  await rejects("claim must belong to its chunk's document", "INSERT INTO claims (chunk_id, document_id, text, embedding) SELECT id, $2, 'x', embedding FROM chunks WHERE document_id = $1", [d1, d2], "23503");
  await rejects("relation needs ordered pair", "INSERT INTO claim_relations (claim_a, claim_b, relation, confidence, judged_by) VALUES ($1, $2, 'contradicts', 0.9, 't')", [hi, lo], "23514");
  await rejects("same-document relation", "INSERT INTO claim_relations (claim_a, claim_b, relation, confidence, judged_by) VALUES ($1, $2, 'contradicts', 0.9, 't')", [Math.min(a, a2), Math.max(a, a2)], "23514");

  const rel = await one("INSERT INTO claim_relations (claim_a, claim_b, relation, confidence, judged_by) VALUES ($1, $2, 'contradicts', 0.93, 'smoke') RETURNING id", [lo, hi]);
  assert.equal((await one("SELECT count(*)::int n FROM audit_log WHERE table_name = 'claim_relations' AND row_id = $1", [rel.id])).n, 1);
  console.log("ok   audit trigger");

  const qv = "[" + Array.from({ length: 384 }, (_, i) => (i < 2 ? 1 : 0)).join(",") + "]"; // equidistant from a and b
  const sim = (await c.query("SELECT claim_id FROM find_similar_claims($1, 2)", [qv])).rows.map((r) => Number(r.claim_id));
  assert.deepEqual(new Set(sim), new Set([a, b]));
  const conf = await c.query("SELECT relation_id FROM retrieve_conflicts($1, 2)", [qv]);
  assert.equal(conf.rowCount, 1);
  assert.equal((await c.query("SELECT 1 FROM v_open_conflicts WHERE relation_id = $1", [rel.id])).rowCount, 1);
  console.log("ok   vector search, retrieve_conflicts, v_open_conflicts");

  await rejects("winner must be in the pair", "INSERT INTO conflict_resolutions (relation_id, winner_claim_id) VALUES ($1, $2)", [rel.id, a2], "23514");
  await c.query("INSERT INTO conflict_resolutions (relation_id, winner_claim_id) VALUES ($1, $2)", [rel.id, a]);
  assert.equal((await one("SELECT status FROM claims WHERE id = $1", [b])).status, "superseded");
  assert.equal((await c.query("SELECT 1 FROM v_open_conflicts WHERE relation_id = $1", [rel.id])).rowCount, 0);
  assert.ok(!(await c.query("SELECT claim_id FROM find_similar_claims($1, 5)", [qv])).rows.some((r) => Number(r.claim_id) === b));
  assert.ok(Number((await one("SELECT source_reliability($1) r", [src2.id])).r) < 0.4);
  console.log("ok   resolution supersedes loser, reliability drops");

  await c.query("ROLLBACK");
  await c.end();
  console.log("smoke passed");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
