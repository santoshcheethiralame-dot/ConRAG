import { z } from "zod";
import { hashPassword, startSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { HttpError, readJson, route } from "@/lib/http";
import { tooMany } from "@/lib/ratelimit";

// bcrypt only looks at the first 72 bytes, so longer passwords are rejected rather than silently truncated.
const body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

/** Public sign-up always creates a viewer. Elevated roles are granted by an admin. */
export const POST = route(async (req: Request) => {
  const { email, password } = await readJson(req, body);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (tooMany(`register:${ip}`, 10, 60 * 60_000)) throw new HttpError(429, "Too many sign-ups from this address");
  const user = await one<{ id: number }>(
    "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'viewer') RETURNING id",
    [email, await hashPassword(password)],
  ).catch((e) => {
    if (e?.code === "23505") throw new HttpError(409, "An account with this email already exists");
    throw e;
  });
  await startSession(user!.id);
  return Response.json({ ok: true, role: "viewer" }, { status: 201 });
});
