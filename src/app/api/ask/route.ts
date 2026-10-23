import { z } from "zod";
import { ask } from "@/lib/ask";
import { requireApi } from "@/lib/auth";
import { HttpError, readJson, route } from "@/lib/http";
import { tooMany } from "@/lib/ratelimit";

const body = z.object({
  question: z.string().trim().min(3, "Ask a full question").max(500),
  compare: z.boolean().optional(),
});

export const POST = route(async (req: Request) => {
  const s = await requireApi();
  const { question, compare } = await readJson(req, body);
  if (tooMany(`ask:${s.userId}`, 30, 60_000)) throw new HttpError(429, "Slow down: 30 questions per minute");
  return Response.json(await ask(question, s.userId, { compare }));
});
