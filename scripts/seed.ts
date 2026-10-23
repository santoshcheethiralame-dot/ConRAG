// Demo users (one per role) and sources. Documents/claims come from the ingest pipeline.
import bcrypt from "bcryptjs";
import { Client } from "pg";

const USERS = [
  ["admin@conrag.test", "admin"],
  ["analyst@conrag.test", "analyst"],
  ["viewer@conrag.test", "viewer"],
] as const;

const SOURCES = [
  ["University Circular", "official", 0.9],
  ["Department Notice Board", "internal", 0.6],
  ["Student Wiki", "wiki", 0.4],
  ["Campus News Blog", "news", 0.5],
] as const;

async function main() {
  const { DATABASE_URL, SEED_PASSWORD } = process.env;
  if (!DATABASE_URL || !SEED_PASSWORD) throw new Error("DATABASE_URL and SEED_PASSWORD must be set");
  const hash = await bcrypt.hash(SEED_PASSWORD, 10);
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  for (const [email, role] of USERS) {
    await client.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [email, hash, role],
    );
  }
  for (const [name, kind, trust] of SOURCES) {
    await client.query(
      "INSERT INTO sources (name, kind, trust_score) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING",
      [name, kind, trust],
    );
  }
  await client.end();
  console.log("seeded");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
