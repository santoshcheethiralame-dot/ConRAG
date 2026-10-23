"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useAction } from "@/lib/client";
import { btn, Card, input } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = mode === "login";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(() => api(`/api/auth/${mode}`, "POST", { email, password }));
    if (r.ok) {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{login ? "Sign in" : "Create an account"}</h1>
      <p className="mb-5 text-sm text-slate-600">
        {login ? "Ask questions and review conflicts across your sources." : "New accounts get the viewer role; an admin can promote you."}
      </p>
      <Card>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <label className="block text-sm font-medium">
            Email
            <input className={`${input} mt-1`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              className={`${input} mt-1`}
              type="password"
              autoComplete={login ? "current-password" : "new-password"}
              required
              minLength={login ? undefined : 8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {!login && <span className="mt-1 block text-xs font-normal text-slate-500">At least 8 characters.</span>}
          </label>
          {error && (
            <p role="alert" className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
          <button className={`${btn} w-full`} disabled={busy}>
            {busy ? "Please wait…" : login ? "Sign in" : "Register"}
          </button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-600">
        {login ? (
          <>
            No account? <Link className="text-indigo-700 underline" href="/register">Register</Link>
          </>
        ) : (
          <>
            Have an account? <Link className="text-indigo-700 underline" href="/login">Sign in</Link>
          </>
        )}
      </p>
    </div>
  );
}
