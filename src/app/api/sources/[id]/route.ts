import { z } from "zod";
import { requireApi } from "@/lib/auth";
import { pool } from "@/lib/db";
import { HttpError, intParam, readJson, route } from "@/lib/http";
import { sourceFields } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

const patch = z.object(sourceFields).partial().refine((o) => Object.keys(o).length > 0, "Nothing to update");

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireApi(["admin"]);
  const id = intParam((await ctx.params).id);
  const b = await readJson(req, patch);
  const res = await pool().query(
    `UPDATE sources SET
       name = coalesce($2, name),
       url = CASE WHEN $3::boolean THEN $4 ELSE url END,
       kind = coalesce($5::source_kind, kind),
       trust_score = coalesce($6, trust_score)
     WHERE id = $1`,
    [id, b.name ?? null, "url" in b, b.url || null, b.kind ?? null, b.trustScore ?? null],
  );
  if (res.rowCount === 0) throw new HttpError(404, "Source not found");
  return Response.json({ ok: true });
});

/** Deleting a source deletes its documents and everything derived from them. */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireApi(["admin"]);
  const res = await pool().query("DELETE FROM sources WHERE id = $1", [intParam((await ctx.params).id)]);
  if (res.rowCount === 0) throw new HttpError(404, "Source not found");
  return Response.json({ ok: true });
});
