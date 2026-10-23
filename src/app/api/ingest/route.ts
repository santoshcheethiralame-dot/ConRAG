import { z } from "zod";
import { requireApi } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { ingestDocument } from "@/lib/ingest";

const body = z.object({
  sourceId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(20, "Document is too short").max(100_000),
  publishedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable()
    .optional(),
});

export const POST = route(async (req: Request) => {
  const s = await requireApi(["admin", "analyst"]);
  const input = await readJson(req, body);
  const result = await ingestDocument({ ...input, userId: s.userId });
  return Response.json(result, { status: 201 });
});
