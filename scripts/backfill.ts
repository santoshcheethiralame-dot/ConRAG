// Fill claims.attribute_key for claims ingested before migration 005 (idempotent).
//   npm run db:backfill
import { Client } from "pg";
import { backfillAttributeKeys } from "./lib/backfill";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString: url });
  await client.connect();
  console.log(`set attribute_key on ${await backfillAttributeKeys(client)} claims`);
  await client.end();
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
