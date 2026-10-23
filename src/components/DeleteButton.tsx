"use client";
import { useRouter } from "next/navigation";
import { api, useAction } from "@/lib/client";
import { btnDanger } from "./ui";

export function DeleteButton({ path, confirmText, redirectTo, label = "Delete" }: { path: string; confirmText: string; redirectTo: string; label?: string }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className={btnDanger}
        disabled={busy}
        onClick={async () => {
          if (!confirm(confirmText)) return;
          const r = await run(() => api(path, "DELETE"));
          if (r.ok) {
            router.push(redirectTo);
            router.refresh();
          }
        }}
      >
        {label}
      </button>
      {error && <span role="alert" className="text-xs text-rose-700">{error}</span>}
    </span>
  );
}
