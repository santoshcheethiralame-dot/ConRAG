import { Pool } from "pg";

const g = globalThis as unknown as { pgPool?: Pool };

export function pool(): Pool {
  if (!g.pgPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.pgPool = new Pool({ connectionString: url, max: 5 });
  }
  return g.pgPool;
}
