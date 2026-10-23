import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { getQuery } from "@/lib/queries";

export default async function QueryPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePage();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const found = await getQuery(id, s.role === "admin" ? null : s.userId);
  if (!found) notFound();
  const { query, evidence } = found;
  return (
    <>
      <PageHeader title={query.question} subtitle={`${query.created_at.slice(0, 16)}${query.asker ? ` · ${query.asker}` : ""} · ${query.latency_ms} ms`} />
      <Card className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Answer given</h2>
        <p className="whitespace-pre-line text-sm leading-6">{query.answer}</p>
      </Card>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Evidence used (query_evidence)</h2>
      <Card className="divide-y divide-slate-100 p-0">
        {evidence.map((e) => (
          <div key={e.claim_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
            <span className="w-6 text-slate-400">#{e.rank}</span>
            <Badge tone={e.role === "supporting" ? "emerald" : "amber"}>{e.role}</Badge>
            <span className="flex-1">{e.text}</span>
            <Badge tone="indigo">{e.source_name}</Badge>
            <span className="text-xs text-slate-500">sim {e.similarity?.toFixed(2)}</span>
          </div>
        ))}
      </Card>
      <p className="mt-4 text-sm">
        <Link className="text-indigo-700 underline" href={`/ask?q=${encodeURIComponent(query.question)}`}>
          Ask again
        </Link>
      </p>
    </>
  );
}
