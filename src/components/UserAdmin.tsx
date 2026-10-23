"use client";
import { useRouter } from "next/navigation";
import { api, useAction } from "@/lib/client";
import { btnDanger, input } from "./ui";

export function UserControls({ id, email, role, isSelf }: { id: number; email: string; role: string; isSelf: boolean }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={`Role of ${email}`}
        className={`${input} !w-28 !py-1`}
        value={role}
        disabled={busy}
        onChange={async (e) => {
          const r = await run(() => api(`/api/users/${id}`, "PATCH", { role: e.target.value }));
          router.refresh();
          if (!r.ok) e.target.value = role;
        }}
      >
        <option>admin</option>
        <option>analyst</option>
        <option>viewer</option>
      </select>
      <button
        className={btnDanger}
        disabled={busy || isSelf}
        title={isSelf ? "You cannot delete your own account" : undefined}
        onClick={async () => {
          if (!confirm(`Delete ${email}? Their past questions are kept but made anonymous.`)) return;
          const r = await run(() => api(`/api/users/${id}`, "DELETE"));
          if (r.ok) router.refresh();
        }}
      >
        Delete
      </button>
      {error && <span role="alert" className="text-xs text-rose-700">{error}</span>}
    </div>
  );
}
