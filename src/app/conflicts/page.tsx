import { Badge, btn, Card, ConflictCompare, Empty, input, PageHeader } from "@/components/ui";
import { ResolveActions } from "@/components/ResolveActions";
import { requirePage } from "@/lib/auth";
import { conflictSources, listConflicts } from "@/lib/queries";

export const metadata = { title: "Conflicts · ConRAG" };

type Params = { status?: string; minConfidence?: string; source?: string; q?: string };

export default async function ConflictsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await requirePage();
  const p = await searchParams;
  const status = p.status === "resolved" ? "resolved" : "open";
  const minConfidence = Math.min(1, Math.max(0, Number(p.minConfidence) || 0));
  const [rows, sources] = await Promise.all([
    listConflicts({ status, minConfidence, source: p.source || undefined, text: p.q?.trim() || undefined }),
    conflictSources(),
  ]);
  const isAdmin = s.role === "admin";

  return (
    <>
      <PageHeader
        title="Conflicts"
        subtitle={
          isAdmin
            ? "Pick the claim to keep. The other is superseded and stops being retrieved. Mark false alarms as not a conflict."
            : "Pairs of claims from different documents that cannot both be true. Admins resolve them."
        }
      />

      <form className="mb-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_1fr_2fr_auto] sm:items-end" role="search">
        <label className="text-xs font-medium">
          Status
          <select name="status" defaultValue={status} className={`${input} mt-1`}>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label className="text-xs font-medium">
          Source
          <select name="source" defaultValue={p.source ?? ""} className={`${input} mt-1`}>
            <option value="">Any</option>
            {sources.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Min confidence
          <select name="minConfidence" defaultValue={String(minConfidence)} className={`${input} mt-1`}>
            {[0, 0.5, 0.7, 0.9].map((v) => (
              <option key={v} value={v}>
                {v === 0 ? "Any" : `${Math.round(v * 100)}%`}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Text contains
          <input name="q" defaultValue={p.q ?? ""} className={`${input} mt-1`} placeholder="e.g. attendance" />
        </label>
        <button className={btn}>Filter</button>
      </form>

      <p className="mb-3 text-sm text-slate-600" aria-live="polite" data-testid="conflict-count">
        {rows.length} {status} conflict{rows.length === 1 ? "" : "s"}
      </p>

      {rows.length === 0 ? (
        <Empty>{status === "open" ? "Nothing to review with these filters." : "No resolved conflicts yet."}</Empty>
      ) : (
        <div className="space-y-4">
          {rows.map((c) => (
            <Card key={c.relation_id} data-testid="conflict-card">
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                <Badge tone={status === "open" ? "amber" : "emerald"}>{status}</Badge>
                <span>#{c.relation_id}</span>
                {c.resolved && (
                  <span>
                    resolved {c.resolved.resolved_at.slice(0, 10)} by {c.resolved.resolver ?? "unknown"}
                    {c.resolved.note ? ` · "${c.resolved.note}"` : ""}
                  </span>
                )}
              </div>
              <ConflictCompare
                a={{ claimId: c.claim_a, text: c.text_a, source: c.source_a, trust: c.trust_a, date: c.date_a, winner: c.resolved?.winner_claim_id === c.claim_a }}
                b={{ claimId: c.claim_b, text: c.text_b, source: c.source_b, trust: c.trust_b, date: c.date_b, winner: c.resolved?.winner_claim_id === c.claim_b }}
                confidence={c.confidence}
                rationale={c.rationale}
              />
              {isAdmin && <ResolveActions relationId={c.relation_id} claimA={c.claim_a} claimB={c.claim_b} resolved={status === "resolved"} />}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
