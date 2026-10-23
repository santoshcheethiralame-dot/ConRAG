import { z, ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type PgError = { code?: string; constraint?: string; message: string };

/** Map database constraint violations to client-facing statuses. */
function fromPg(e: PgError): HttpError | null {
  switch (e.code) {
    case "23505":
      return new HttpError(409, "Already exists", { constraint: e.constraint });
    case "23503":
      return new HttpError(409, "Referenced row does not exist or is still in use", { constraint: e.constraint });
    case "23502":
    case "23514":
    case "22P02":
    case "22001":
    case "22003":
      return new HttpError(422, e.message, { constraint: e.constraint });
    default:
      return null;
  }
}

export function toResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message, ...e.extra }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return Response.json(
      { error: "Invalid input", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 422 },
    );
  }
  const mapped = typeof e === "object" && e && "code" in e ? fromPg(e as PgError) : null;
  if (mapped) return toResponse(mapped);
  console.error(e);
  return Response.json({ error: "Internal error" }, { status: 500 });
}

/** Wrap a route handler so thrown HttpError / ZodError / pg errors become JSON responses. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      return toResponse(e);
    }
  };
}

/**
 * Parse a JSON body. Requiring application/json makes cross-site form posts
 * (which cannot set that header without a CORS preflight) fail: CSRF defence
 * on top of SameSite=Lax.
 */
export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Malformed JSON");
  }
  return schema.parse(body);
}

export function intParam(raw: string): number {
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, "Invalid id");
  return n;
}
