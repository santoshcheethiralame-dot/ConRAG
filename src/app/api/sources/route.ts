import { z } from "zod";
import { requireApi } from "@/lib/auth";
import { one } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { listSources } from "@/lib/queries";
import { sourceFields } from "@/lib/schemas";

const body = z.object(sourceFields);

export const GET = route(async () => {
  await requireApi();
  return Response.json(await listSources());
});

export const POST = route(async (req: Request) => {
  const s = await requireApi(["admin"]);
  const b = await readJson(req, body);
  const row = await one<{ id: number }>(
    "INSERT INTO sources (name, url, kind, trust_score, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [b.name, b.url || null, b.kind, b.trustScore, s.userId],
  );
  return Response.json({ id: row!.id }, { status: 201 });
});
