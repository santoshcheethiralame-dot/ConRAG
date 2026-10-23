import { z } from "zod";
import { requireApi } from "@/lib/auth";
import { pool } from "@/lib/db";
import { HttpError, intParam, readJson, route } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({ role: z.enum(["admin", "analyst", "viewer"]) });

/** The last-admin trigger rejects demoting the only admin (422). */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireApi(["admin"]);
  const { role } = await readJson(req, body);
  const res = await pool().query("UPDATE users SET role = $2 WHERE id = $1", [intParam((await ctx.params).id), role]);
  if (res.rowCount === 0) throw new HttpError(404, "User not found");
  return Response.json({ ok: true });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireApi(["admin"]);
  const res = await pool().query("DELETE FROM users WHERE id = $1", [intParam((await ctx.params).id)]);
  if (res.rowCount === 0) throw new HttpError(404, "User not found");
  return Response.json({ ok: true });
});
