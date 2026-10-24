import { Badge, Card, PageHeader, Table, Trust } from "@/components/ui";
import { NewSourceForm, SourceTrustEditor } from "@/components/SourceAdmin";
import { requirePage } from "@/lib/auth";
import { listSources } from "@/lib/queries";

export const metadata = { title: "Sources · ConRAG" };

export default async function SourcesPage() {
  const s = await requirePage();
  const sources = await listSources();
  const isAdmin = s.role === "admin";
  return (
    <>
      <PageHeader
        title="Sources"
        subtitle="Trust is set by an admin. Contradicted is the share of a source's claims that conflict with another source. Reliability is trust discounted by how often the source's claims lost a resolved conflict (a stored function over the resolutions table)."
      />
      {isAdmin && (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">Add a source</h2>
          <NewSourceForm />
        </Card>
      )}
      <Table head={["Source", "Kind", "Trust", "Reliability", "Documents", "Claims", "Contradicted", ...(isAdmin ? ["Edit"] : [])]}>
        {sources.map((r) => (
          <tr key={r.source_id}>
            <td className="px-3 py-2 font-medium">{r.name}</td>
            <td className="px-3 py-2">
              <Badge tone="indigo">{r.kind}</Badge>
            </td>
            <td className="px-3 py-2">
              <Trust value={r.trust_score} />
            </td>
            <td className="px-3 py-2">
              <Trust value={r.reliability} />
            </td>
            <td className="px-3 py-2 tabular-nums">{r.documents}</td>
            <td className="px-3 py-2 tabular-nums">{r.claims}</td>
            <td className="px-3 py-2 tabular-nums">
              {r.contradicted}
              {r.claims > 0 && <span className="ml-1 text-xs text-slate-500">({Math.round((100 * r.contradicted) / r.claims)}%)</span>}
            </td>
            {isAdmin && (
              <td className="px-3 py-2">
                <SourceTrustEditor source={r} />
              </td>
            )}
          </tr>
        ))}
      </Table>
    </>
  );
}
