import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env";
import { one } from "./db";
import { HttpError } from "./http";

export type Role = "admin" | "analyst" | "viewer";
export interface Session {
  userId: number;
  email: string;
  role: Role;
}

export const SESSION_COOKIE = "conrag_session";
const MAX_AGE_S = 60 * 60 * 8;

const key = () => new TextEncoder().encode(env().SESSION_SECRET);

// Compared against when the email is unknown, so timing does not reveal which emails exist.
let dummyHash: string | undefined;
const dummy = () => (dummyHash ??= bcrypt.hashSync("not-a-real-password", 10));

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);

export async function verifyLogin(email: string, password: string) {
  const user = await one<{ id: number; email: string; role: Role; password_hash: string }>(
    "SELECT id, email, role, password_hash FROM users WHERE lower(email) = lower($1)",
    [email],
  );
  const ok = await bcrypt.compare(password, user?.password_hash ?? dummy());
  return user && ok ? user : null;
}

export async function signToken(userId: number): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(key());
}

export async function startSession(userId: number) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Validate the cookie, then load the user so role changes and deletions apply immediately. */
export async function sessionFromToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const id = Number(payload.sub);
    if (!Number.isSafeInteger(id)) return null;
    const u = await one<{ id: number; email: string; role: Role }>(
      "SELECT id, email, role FROM users WHERE id = $1",
      [id],
    );
    return u ? { userId: u.id, email: u.email, role: u.role } : null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  return sessionFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export const can = {
  ask: (r: Role) => ["admin", "analyst", "viewer"].includes(r),
  ingest: (r: Role) => r === "admin" || r === "analyst",
  admin: (r: Role) => r === "admin",
};

/** For pages: redirect anonymous users to /login, send under-privileged ones home. */
export async function requirePage(allowed?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (allowed && !allowed.includes(s.role)) redirect("/?denied=1");
  return s;
}

/** For route handlers: throw 401/403 as JSON. */
export async function requireApi(allowed?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Not signed in");
  if (allowed && !allowed.includes(s.role)) throw new HttpError(403, "Not allowed for your role");
  return s;
}
