import { pool } from "@/lib/db";

export async function resetData() {
  await pool().query(
    `TRUNCATE query_evidence, queries, conflict_resolutions, claim_relations, claims, chunks,
              documents, sources, users, audit_log RESTART IDENTITY CASCADE`,
  );
}

const HASH = "$2b$10$" + "a".repeat(53); // shape-valid bcrypt string for rows that never log in

export async function makeUser(email: string, role: "admin" | "analyst" | "viewer" = "viewer") {
  const r = await pool().query("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id", [email, HASH, role]);
  return r.rows[0].id as number;
}

export async function makeSource(name: string, kind = "official", trust = 0.8) {
  const r = await pool().query("INSERT INTO sources (name, kind, trust_score) VALUES ($1, $2, $3) RETURNING id", [name, kind, trust]);
  return r.rows[0].id as number;
}

export async function closePool() {
  await pool().end();
}
