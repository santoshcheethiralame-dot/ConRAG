// PGlite (real Postgres compiled to WASM) + pgvector behind the Postgres wire protocol.
// Used for docker-free dev (persistent) and for the test runner (in memory).
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

export async function startPgServer(opts: { port: number; dataDir?: string }) {
  const db = await PGlite.create({ dataDir: opts.dataDir, extensions: { vector } });
  const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: opts.port, maxConnections: 10 });
  await server.start();
  return {
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}
