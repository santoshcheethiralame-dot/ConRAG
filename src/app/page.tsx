import Link from "next/link";
import { Badge, btn, Card, ConflictCompare, Empty, PageHeader, Stat } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { dashboardStats, listConflicts, listQueries } from "@/lib/queries";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const s = await requirePage();
  const { denied } = await searchParams;
  const [stats, conflicts, recent] = await Promise.all([
    dashboardStats(),
    listConflicts({ status: "open" }),
    listQueries(s.role === "admin" ? null : s.userId, 5),
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="ConRAG finds claims that contradict each other across your documents, weighs the sources, and answers with both sides."
      >
        <Link href="/ask" className={btn}>
          Ask a question
        </Link>
      </PageHeader>

      {denied && (
        <p role="alert" className="mb-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your role does not allow that page.
        </p>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Documents" value={stats!.documents} />
        <Stat label="Active claims" value={stats!.active_claims} />
        <Stat label="Open conflicts" value={stats!.open_conflicts} tone="amber" />
        <Stat label="Resolved" value={stats!.resolved_conflicts} tone="emerald" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Strongest open conflicts</h2>
            <Link href="/conflicts" className="text-sm text-indigo-700 underline">
              All conflicts
            </Link>
          </div>
          {conflicts.length === 0 ? (
            <Empty>No open conflicts. Ingest documents from different sources to see some.</Empty>
          ) : (
            <div className="space-y-4">
              {conflicts.slice(0, 3).map((c) => (
                <Card key={c.relation_id}>
                  <ConflictCompare
                    a={{ claimId: c.claim_a, text: c.text_a, source: c.source_a, trust: c.trust_a, date: c.date_a }}
                    b={{ claimId: c.claim_b, text: c.text_b, source: c.source_b, trust: c.trust_b, date: c.date_b }}
                    confidence={c.confidence}
                    rationale={c.rationale}
                  />
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">{s.role === "admin" ? "Recent questions" : "Your recent questions"}</h2>
            <Link href="/history" className="text-sm text-indigo-700 underline">
              History
            </Link>
          </div>
          {recent.length === 0 ? (
            <Empty>No questions yet.</Empty>
          ) : (
            <Card className="divide-y divide-slate-100 p-0">
              {recent.map((q) => (
                <Link key={q.id} href={`/history/${q.id}`} className="block px-4 py-3 text-sm hover:bg-slate-50">
                  <div className="font-medium">{q.question}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    {q.conflicts > 0 ? <Badge tone="amber">conflict</Badge> : <Badge tone="emerald">clean</Badge>}
                    <span>{q.created_at.slice(0, 16)}</span>
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
