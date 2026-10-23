import { requireApi } from "@/lib/auth";
import { pool } from "@/lib/db";
import { HttpError, intParam, route } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Mark an open conflict as a false alarm: the relation becomes neutral and stays in the audit log. */
export const POST = route(async (_req: Request, ctx: Ctx) => {
  const s = await requireApi(["admin"]);
  const res = await pool().query(
    `UPDATE claim_relations
        SET relation = 'neutral', judged_by = 'admin:' || $2::text,
            rationale = trim(coalesce(rationale, '') || ' Dismissed by admin.')
      WHERE id = $1 AND relation = 'contradicts'
        AND NOT EXISTS (SELECT 1 FROM conflict_resolutions WHERE relation_id = $1)`,
    [intParam((await ctx.params).id), s.userId],
  );
  if (res.rowCount === 0) throw new HttpError(404, "No open conflict with that id");
  return Response.json({ ok: true });
});
