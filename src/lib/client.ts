"use client";
import { useState } from "react";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/** JSON fetch for client components. Always sends Content-Type: application/json (the CSRF guard needs it). */
export async function api<T = unknown>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const issues = Array.isArray(data.issues) ? ": " + data.issues.map((i: { message: string }) => i.message).join("; ") : "";
      return { ok: false, status: res.status, error: (data.error ?? `Request failed (${res.status})`) + issues };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, error: "Network error" };
  }
}

/** Busy flag and error message around an async action. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.error);
    return r;
  }
  return { busy, error, setError, run };
}
