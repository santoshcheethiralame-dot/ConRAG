// Docker-free Postgres for local dev: PGlite (real Postgres in WASM) + pgvector,
// exposed over the wire protocol so the app and `pg` connect normally.
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

async function main() {
  const db = await PGlite.create({ dataDir: "./.pgdata", extensions: { vector } });
  const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 5433, maxConnections: 10 });
  await server.start();
  console.log("dev db listening on 127.0.0.1:5433 (data in .pgdata)");
  process.on("SIGINT", async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}
main();
