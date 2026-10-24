// End-to-end run: in-memory Postgres + demo data, the production Next.js server, a real browser (Edge/Chrome).
//   npm run test:e2e          builds first, then runs tests/e2e/*.e2e.ts and saves screenshots to docs/screenshots
//   npm run test:e2e -- --report   also writes docs/e2e-output.txt
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { Client } from "pg";
import { migrate } from "./lib/migrate";
import { startPgServer } from "./lib/pgserver";

const DB_PORT = 5436;
const WEB_PORT = 3333;
const PASSWORD = "e2e-password-123";

async function waitFor(url: string, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function main() {
  const report = process.argv.includes("--report");
  const dbUrl = `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: dbUrl,
    SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-123",
    SEED_PASSWORD: PASSWORD,
    LLM_PROVIDER: "offline",
    LLM_API_KEY: "",
    EMBEDDING_PROVIDER: "local",
    NODE_NO_WARNINGS: "1",
  };

  const pg = await startPgServer({ port: DB_PORT });
  let web: ChildProcess | undefined;
  let code = 1;
  try {
    const c = new Client({ connectionString: dbUrl });
    await c.connect();
    await migrate(c);
    await c.end();
    Object.assign(process.env, env);
    await (await import("./seed")).seed();
    await (await import("./load-demo")).loadDemo();

    web = spawn("npx", ["next", "start", "-p", String(WEB_PORT)], { env, stdio: "inherit", shell: process.platform === "win32" });
    await waitFor(`http://localhost:${WEB_PORT}/api/health`, 60_000);

    mkdirSync("docs/screenshots", { recursive: true });
    const out = report ? createWriteStream("docs/e2e-output.txt") : null;
    const t = spawn(
      process.execPath,
      ["--import", "tsx", "--test", "--test-concurrency=1", "--test-reporter=spec", "--test-timeout=900000", "tests/e2e/app.e2e.ts"],
      { env: { ...env, BASE_URL: `http://localhost:${WEB_PORT}`, E2E_PASSWORD: PASSWORD }, stdio: ["ignore", "pipe", "inherit"] },
    );
    t.stdout.on("data", (d) => {
      process.stdout.write(d);
      out?.write(d);
    });
    code = await new Promise((res) => t.on("close", (c) => res(c ?? 1)));
    out?.end();
  } finally {
    if (web?.pid) spawnSync("taskkill", ["/pid", String(web.pid), "/T", "/F"], { stdio: "ignore" });
    await pg.stop();
  }
  process.exit(code);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
