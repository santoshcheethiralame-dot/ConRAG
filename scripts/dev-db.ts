// Docker-free Postgres for local dev: persistent data in .pgdata on port 5433.
import { startPgServer } from "./lib/pgserver";

async function main() {
  const server = await startPgServer({ port: 5433, dataDir: "./.pgdata" });
  console.log("dev db listening on 127.0.0.1:5433 (data in .pgdata)");
  process.on("SIGINT", async () => {
    await server.stop();
    process.exit(0);
  });
}
main();
