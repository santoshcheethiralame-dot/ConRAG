"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useAction } from "@/lib/client";
import type { AskResult } from "@/lib/ask";
import type { EvidenceClaim } from "@/lib/llm";
import { Badge, btn, Card, ConflictCompare, Trust, input, type Side } from "./ui";

const side = (c: EvidenceClaim, also: EvidenceClaim[]): Side => ({
  claimId: c.id,
  text: c.text,
  source: c.source,
  trust: c.reliability,
  date: c.date,
  also,
});

const SAMPLES = [
  "What is the minimum attendance for the end-semester exam?",
  "Are mobile phones allowed in the examination hall?",
  "What is the library fine per day?",
  "How many books can faculty members borrow?",
];

export function AskPanel({ initial = "", canSeeAdminLinks = false }: { initial?: string; canSeeAdminLinks?: boolean }) {
  const [question, setQuestion] = useState(initial);
  const [compare, setCompare] = useState(true);
  const [result, setResult] = useState<AskResult | null>(null);
  const { busy, error, run } = useAction();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(() => api<AskResult>("/api/ask", "POST", { question, compare }));
    if (r.ok) setResult(r.data);
  }

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={submit} className="space-y-3" role="search">
          <label className="block text-sm font-medium" htmlFor="question">
            Your question
          </label>
          <input
            id="question"
            className={input}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. What is the library fine per day?"
            maxLength={500}
            required
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
              Also show what a plain RAG would answer
            </label>
            <button className={btn} disabled={busy || question.trim().length < 3}>
              {busy ? "Thinking…" : "Ask"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {SAMPLES.map((s) => (
              <button type="button" key={s} onClick={() => setQuestion(s)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
                {s}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
        </form>
      </Card>

      {result && (
        <div className="space-y-6" data-testid="ask-result">
          <Card className={result.conflicts.length ? "border-amber-300" : ""}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">ConRAG answer</h2>
              {result.conflicts.length > 0 ? (
                <Badge tone="amber">
                  {result.conflicts.length} conflict{result.conflicts.length > 1 ? "s" : ""} found
                </Badge>
              ) : (
                <Badge tone="emerald">no conflicts</Badge>
              )}
            </div>
            <p className="whitespace-pre-line text-sm leading-6" data-testid="answer-text">
              {result.answer}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {result.llm} · {result.ms} ms · saved in <Link className="underline" href={`/history/${result.queryId}`}>history</Link>
            </p>
          </Card>

          {result.conflicts.length > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Where the sources disagree</h2>
              <div className="space-y-4">
                {result.conflicts.map((c) => (
                  <Card key={c.relationId}>
                    <ConflictCompare a={side(c.a, c.alsoA)} b={side(c.b, c.alsoB)} lean={c.lean} confidence={c.confidence} rationale={c.rationale} />
                    {canSeeAdminLinks && (
                      <p className="mt-2 text-xs">
                        <Link className="text-indigo-700 underline" href="/conflicts">Review in the conflicts queue</Link>
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          )}

          {result.claims.length > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Other relevant evidence</h2>
              <Card className="divide-y divide-slate-100 p-0">
                {result.claims.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                    <span className="flex-1">{c.text}</span>
                    <Badge tone="indigo">{c.source}</Badge>
                    <Trust value={c.reliability} />
                    <span className="text-xs text-slate-500">sim {c.similarity}</span>
                  </div>
                ))}
              </Card>
            </section>
          )}

          {result.plain && (
            <Card className="border-slate-300 bg-slate-50">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-lg font-semibold">Plain RAG answer</h2>
                <Badge>no conflict awareness</Badge>
              </div>
              <p className="whitespace-pre-line text-sm leading-6" data-testid="plain-text">
                {result.plain.answer}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Same retrieval, but no conflict data, no source weighting, and superseded claims still count.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
