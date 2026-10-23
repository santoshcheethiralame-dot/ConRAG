"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useAction } from "@/lib/client";
import type { IngestResult } from "@/lib/ingest";
import { btn, Card, input } from "./ui";

export function IngestForm({ sources }: { sources: { id: number; name: string }[] }) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? 0);
  const [title, setTitle] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<IngestResult | null>(null);
  const { busy, error, run } = useAction();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBody(await f.text());
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    const r = await run(() => api<IngestResult>("/api/ingest", "POST", { sourceId, title, body, publishedAt: publishedAt || null }));
    if (r.ok) {
      setResult(r.data);
      setTitle("");
      setBody("");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Source
              <select className={`${input} mt-1`} value={sourceId} onChange={(e) => setSourceId(Number(e.target.value))}>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Published on
              <input className={`${input} mt-1`} type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Title
            <input className={`${input} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
          </label>
          <label className="block text-sm font-medium">
            Text
            <textarea className={`${input} mt-1 h-56 font-mono`} value={body} onChange={(e) => setBody(e.target.value)} required minLength={20} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="text-sm text-slate-600">
              or load a .txt / .md file <input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={onFile} className="ml-1 text-xs" />
            </label>
            <button className={btn} disabled={busy || !sourceId}>
              {busy ? "Analysing…" : "Ingest document"}
            </button>
          </div>
          {error && (
            <p role="alert" className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
        </form>
      </Card>
      <div className="space-y-4">
        {result && (
          <Card className="border-emerald-300" data-testid="ingest-result">
            <h2 className="mb-2 font-semibold">Ingested</h2>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-slate-500">Chunks</dt><dd>{result.chunks}</dd>
              <dt className="text-slate-500">Claims</dt><dd>{result.claims}</dd>
              <dt className="text-slate-500">Pairs judged</dt><dd>{result.judged}</dd>
              <dt className="text-slate-500">Contradictions</dt><dd className="font-semibold text-amber-700">{result.contradicts}</dd>
              <dt className="text-slate-500">Supports</dt><dd>{result.supports}</dd>
            </dl>
            <p className="mt-2 text-xs text-slate-500">{result.llm} · {result.ms} ms</p>
            <Link className="mt-3 inline-block text-sm text-indigo-700 underline" href={`/documents/${result.documentId}`}>
              View document and its claims
            </Link>
          </Card>
        )}
        <Card>
          <h2 className="mb-1 text-sm font-semibold">What happens</h2>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-600">
            <li>The text is chunked and embedded (384-d vectors).</li>
            <li>Atomic claims are extracted from each chunk.</li>
            <li>Each claim is compared with the nearest claims from other documents.</li>
            <li>A judge labels each pair contradicts / supports / neutral.</li>
            <li>Everything is saved in one transaction.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
