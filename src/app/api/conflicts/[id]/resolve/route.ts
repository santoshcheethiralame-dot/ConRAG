import { z } from "zod";
import { requireApi } from "@/lib/auth";
import { pool } from "@/lib/db";
import { HttpError, intParam, readJson, route } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  winnerClaimId: z.number().int().positive(),
  note: z.string().trim().max(500).optional(),
});

/** Pick the winning claim. Triggers validate the winner and supersede the loser. */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const s = await requireApi(["admin"]);
  const id = intParam((await ctx.params).id);
  const { winnerClaimId, note } = await readJson(req, body);
  if ((await pool().query("SELECT 1 FROM conflict_resolutions WHERE relation_id = $1", [id])).rowCount) {
    throw new HttpError(409, "This conflict is already resolved");
  }
  const res = await pool().query(
    "INSERT INTO conflict_resolutions (relation_id, winner_claim_id, resolved_by, note) VALUES ($1, $2, $3, $4) RETURNING id",
    [id, winnerClaimId, s.userId, note || null],
  ).catch((e) => {
    if (e?.code === "23503") throw new HttpError(404, "Conflict or claim not found");
    if (e?.code === "23505") throw new HttpError(409, "This conflict is already resolved");
    throw e;
  });
  return Response.json({ ok: true, resolutionId: res.rows[0].id }, { status: 201 });
});

/** Undo a resolution; a trigger reactivates the superseded claim. */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireApi(["admin"]);
  const res = await pool().query("DELETE FROM conflict_resolutions WHERE relation_id = $1", [intParam((await ctx.params).id)]);
  if (res.rowCount === 0) throw new HttpError(404, "No resolution to undo");
  return Response.json({ ok: true });
});
