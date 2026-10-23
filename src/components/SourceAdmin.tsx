"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useAction } from "@/lib/client";
import type { SourceRow } from "@/lib/queries";
import { btn, btnDanger, btnGhost, input } from "./ui";

const KINDS = ["official", "news", "wiki", "forum", "internal"] as const;

export function NewSourceForm() {
  const router = useRouter();
  const { busy, error, run } = useAction();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("official");
  const [trust, setTrust] = useState(0.5);
  const [url, setUrl] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(() => api("/api/sources", "POST", { name, kind, trustScore: trust, url: url || null }));
    if (r.ok) {
      setName("");
      setUrl("");
      router.refresh();
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_2fr_auto] sm:items-end">
      <label className="text-xs font-medium">
        Name
        <input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
      </label>
      <label className="text-xs font-medium">
        Kind
        <select className={`${input} mt-1`} value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}>
          {KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium">
        Trust (0-1)
        <input className={`${input} mt-1`} type="number" min={0} max={1} step={0.05} value={trust} onChange={(e) => setTrust(Number(e.target.value))} />
      </label>
      <label className="text-xs font-medium">
        URL (optional)
        <input className={`${input} mt-1`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
      </label>
      <button className={btn} disabled={busy}>
        Add source
      </button>
      {error && <p role="alert" className="text-xs text-rose-700 sm:col-span-5">{error}</p>}
    </form>
  );
}

export function SourceTrustEditor({ source }: { source: SourceRow }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  const [trust, setTrust] = useState(source.trust_score);
  const [kind, setKind] = useState(source.kind);
  const dirty = trust !== source.trust_score || kind !== source.kind;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label={`Kind of ${source.name}`} className={`${input} !w-28 !py-1`} value={kind} onChange={(e) => setKind(e.target.value)}>
        {KINDS.map((k) => (
          <option key={k}>{k}</option>
        ))}
      </select>
      <input aria-label={`Trust of ${source.name}`} className={`${input} !w-20 !py-1`} type="number" min={0} max={1} step={0.05} value={trust} onChange={(e) => setTrust(Number(e.target.value))} />
      <button
        className={btnGhost}
        disabled={busy || !dirty}
        onClick={async () => {
          const r = await run(() => api(`/api/sources/${source.source_id}`, "PATCH", { trustScore: trust, kind }));
          if (r.ok) router.refresh();
        }}
      >
        Save
      </button>
      <button
        className={btnDanger}
        disabled={busy}
        onClick={async () => {
          if (!confirm(`Delete "${source.name}" and its ${source.documents} document(s)? This also removes their claims and conflicts.`)) return;
          const r = await run(() => api(`/api/sources/${source.source_id}`, "DELETE"));
          if (r.ok) router.refresh();
        }}
      >
        Delete
      </button>
      {error && <span role="alert" className="text-xs text-rose-700">{error}</span>}
    </div>
  );
}
