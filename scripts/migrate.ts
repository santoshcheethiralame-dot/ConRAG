import { readFileSync } from "node:fs";
import { Client } from "pg";
import { migrate } from "./lib/migrate";

// `--reset` runs db/reset.sql (DROPs everything) first.
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString: url });
  await client.connect();
  if (process.argv.includes("--reset")) {
    await client.query(readFileSync("db/reset.sql", "utf8"));
    console.log("dropped all objects");
  }
  const applied = await migrate(client);
  for (const f of applied) console.log("applied", f);
  if (applied.length === 0) console.log("up to date");
  await client.end();
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
