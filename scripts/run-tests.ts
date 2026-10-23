// Self-contained test run: in-memory Postgres+pgvector, migrations, then node:test.
//   npm test                 all tests in tests/*.test.ts
//   npm test -- chunk        only files whose name contains "chunk"
//   npm test -- --report     also write docs/test-output.txt
import { spawn } from "node:child_process";
import { createWriteStream, readdirSync } from "node:fs";
import { Client } from "pg";
import { migrate } from "./lib/migrate";
import { startPgServer } from "./lib/pgserver";

const PORT = 5434;

async function main() {
  const args = process.argv.slice(2);
  const report = args.includes("--report");
  const filters = args.filter((a) => !a.startsWith("--"));
  const files = readdirSync("tests")
    .filter((f) => f.endsWith(".test.ts") && (filters.length === 0 || filters.some((x) => f.includes(x))))
    .sort()
    .map((f) => `tests/${f}`);
  if (files.length === 0) throw new Error("no test files matched");

  const server = await startPgServer({ port: PORT });
  const url = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
  const client = new Client({ connectionString: url });
  await client.connect();
  await migrate(client);
  await client.end();

  const out = report ? createWriteStream("docs/test-output.txt") : null;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--test", "--test-concurrency=1", "--test-reporter=spec", ...files],
    {
      env: {
        ...process.env,
        DATABASE_URL: url,
        SESSION_SECRET: "test-secret-test-secret-test-secret-1",
        EMBEDDING_PROVIDER: "hash",
        LLM_PROVIDER: "offline",
        ANTHROPIC_API_KEY: "",
        NODE_NO_WARNINGS: "1",
      },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  child.stdout.on("data", (d) => {
    process.stdout.write(d);
    out?.write(d);
  });
  const code: number = await new Promise((res) => child.on("close", (c) => res(c ?? 1)));
  out?.end();
  await server.stop();
  process.exit(code);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
