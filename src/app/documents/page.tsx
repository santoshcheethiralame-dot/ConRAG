import Link from "next/link";
import { Badge, btn, Empty, input, PageHeader, Table } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { listDocuments } from "@/lib/queries";

export const metadata = { title: "Documents · ConRAG" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requirePage();
  const { q } = await searchParams;
  const docs = await listDocuments(q);
  return (
    <>
      <PageHeader title="Documents" subtitle="Full-text search (PostgreSQL tsvector + GIN) across everything ingested.">
        {(s.role === "admin" || s.role === "analyst") && (
          <Link href="/ingest" className={btn}>
            Ingest a document
          </Link>
        )}
      </PageHeader>
      <form className="mb-4 flex gap-2" role="search">
        <input name="q" defaultValue={q ?? ""} className={input} placeholder='Search, e.g. attendance, "library fine", hostel -boys' aria-label="Search documents" />
        <button className={btn}>Search</button>
      </form>
      {docs.length === 0 ? (
        <Empty>{q ? "No documents match." : "No documents yet."}</Empty>
      ) : (
        <Table head={["Title", "Source", "Published", "Claims", q ? "Match" : "Conflicts"]}>
          {docs.map((d) => (
            <tr key={d.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 font-medium">
                <Link href={`/documents/${d.id}`} className="text-indigo-700 hover:underline">
                  {d.title}
                </Link>
              </td>
              <td className="px-3 py-2">{d.source_name}</td>
              <td className="px-3 py-2 text-slate-600">{d.published_at ?? "undated"}</td>
              <td className="px-3 py-2 tabular-nums">{d.claims}</td>
              <td className="px-3 py-2">
                {q ? (
                  <span className="text-xs text-slate-600" dangerouslySetInnerHTML={{ __html: sanitizeHeadline(d.snippet ?? "") }} />
                ) : d.conflicts > 0 ? (
                  <Badge tone="amber">{d.conflicts}</Badge>
                ) : (
                  <span className="text-slate-400">0</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

/** ts_headline output contains <b> around matches; escape everything else before rendering it as HTML. */
function sanitizeHeadline(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/&lt;b>/g, "<b>")
    .replace(/&lt;\/b>/g, "</b>");
}
