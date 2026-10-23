import { requireApi } from "@/lib/auth";
import { pool } from "@/lib/db";
import { HttpError, intParam, route } from "@/lib/http";
import { getDocument } from "@/lib/queries";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireApi();
  const found = await getDocument(intParam((await ctx.params).id));
  if (!found) throw new HttpError(404, "Document not found");
  return Response.json(found);
});

/** Deleting a document cascades to its chunks, claims, relations and resolutions. */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireApi(["admin"]);
  const res = await pool().query("DELETE FROM documents WHERE id = $1", [intParam((await ctx.params).id)]);
  if (res.rowCount === 0) throw new HttpError(404, "Document not found");
  return Response.json({ ok: true });
});
