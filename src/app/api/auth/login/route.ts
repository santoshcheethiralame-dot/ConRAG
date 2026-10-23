import { z } from "zod";
import { startSession, verifyLogin } from "@/lib/auth";
import { HttpError, readJson, route } from "@/lib/http";
import { tooMany } from "@/lib/ratelimit";

const body = z.object({ email: z.string().trim().max(254), password: z.string().min(1).max(72) });

export const POST = route(async (req: Request) => {
  const { email, password } = await readJson(req, body);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (tooMany(`login:${ip}:${email.toLowerCase()}`, 10, 15 * 60_000)) {
    throw new HttpError(429, "Too many attempts. Try again in a few minutes.");
  }
  const user = await verifyLogin(email, password);
  if (!user) throw new HttpError(401, "Wrong email or password");
  await startSession(user.id);
  return Response.json({ ok: true, role: user.role });
});
