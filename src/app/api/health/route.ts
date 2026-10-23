import { pool } from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await pool().query(
      "SELECT extversion AS pgvector FROM pg_extension WHERE extname = 'vector'",
    );
    return Response.json({ ok: true, pgvector: rows[0]?.pgvector ?? null });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
