// Demo users (one per role) and the demo sources. Documents come from `npm run demo:load`.
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { loadSources } from "./lib/corpus";

const USERS = [
  ["admin@conrag.test", "admin"],
  ["analyst@conrag.test", "analyst"],
  ["viewer@conrag.test", "viewer"],
] as const;

async function main() {
  const { DATABASE_URL, SEED_PASSWORD } = process.env;
  if (!DATABASE_URL || !SEED_PASSWORD) throw new Error("DATABASE_URL and SEED_PASSWORD must be set");
  if (SEED_PASSWORD.length < 8) throw new Error("SEED_PASSWORD must be at least 8 characters");
  const hash = await bcrypt.hash(SEED_PASSWORD, 10);
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  for (const [email, role] of USERS) {
    await client.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [email, hash, role],
    );
  }
  for (const s of loadSources()) {
    await client.query(
      "INSERT INTO sources (name, kind, trust_score, url) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING",
      [s.name, s.kind, s.trust, s.url],
    );
  }
  await client.end();
  console.log("seeded users and sources");
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
