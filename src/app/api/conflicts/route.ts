import { z } from "zod";
import { requireApi } from "@/lib/auth";
import { route } from "@/lib/http";
import { listConflicts } from "@/lib/queries";

const query = z.object({
  status: z.enum(["open", "resolved"]).default("open"),
  minConfidence: z.coerce.number().min(0).max(1).default(0),
  source: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
});

export const GET = route(async (req: Request) => {
  await requireApi();
  const p = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return Response.json(
    await listConflicts({ status: p.status, minConfidence: p.minConfidence, source: p.source, text: p.q }),
  );
});
