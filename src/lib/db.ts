import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// BIGINT ids and NUMERIC scores arrive as strings by default; all ours fit in a JS number.
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => parseFloat(v));
// DATE columns stay plain 'YYYY-MM-DD' strings (no timezone shifting).
types.setTypeParser(1082, (v) => v);

const g = globalThis as unknown as { pgPool?: Pool };

export function pool(): Pool {
  if (!g.pgPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.pgPool = new Pool({ connectionString: url, max: 5 });
  }
  return g.pgPool;
}

export async function rows<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await pool().query<T>(sql, params)).rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  return (await rows<T>(sql, params))[0] ?? null;
}

/** Run fn inside BEGIN/COMMIT on one connection; roll back on any error. */
export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** pgvector text literal for a parameter cast with ::vector. */
export function vec(v: number[]): string {
  return "[" + v.join(",") + "]";
}
