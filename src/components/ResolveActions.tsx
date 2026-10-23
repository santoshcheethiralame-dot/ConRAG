"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useAction } from "@/lib/client";
import { btnDanger, btnGhost, input } from "./ui";

export function ResolveActions({ relationId, claimA, claimB, resolved }: { relationId: number; claimA: number; claimB: number; resolved: boolean }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  const [note, setNote] = useState("");

  async function go(fn: () => ReturnType<typeof api>) {
    const r = await run(fn);
    if (r.ok) router.refresh();
  }
  const keep = (winnerClaimId: number) => go(() => api(`/api/conflicts/${relationId}/resolve`, "POST", { winnerClaimId, note: note || undefined }));

  if (resolved) {
    return (
      <div className="mt-3 flex items-center gap-3">
        <button className={btnGhost} disabled={busy} onClick={() => go(() => api(`/api/conflicts/${relationId}/resolve`, "DELETE"))}>
          Undo resolution
        </button>
        {error && <span role="alert" className="text-xs text-rose-700">{error}</span>}
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <input className={input} placeholder="Optional note for the audit trail" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="Resolution note" />
      <div className="flex flex-wrap gap-2">
        <button className={btnGhost} disabled={busy} onClick={() => keep(claimA)}>
          Keep left claim
        </button>
        <button className={btnGhost} disabled={busy} onClick={() => keep(claimB)}>
          Keep right claim
        </button>
        <button className={btnDanger} disabled={busy} onClick={() => go(() => api(`/api/conflicts/${relationId}/dismiss`, "POST"))}>
          Not a conflict
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
