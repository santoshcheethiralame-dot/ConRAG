import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { DeleteButton } from "@/components/DeleteButton";
import { requirePage } from "@/lib/auth";
import { getDocument } from "@/lib/queries";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePage();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const found = await getDocument(id);
  if (!found) notFound();
  const { doc, claims } = found;

  return (
    <>
      <PageHeader title={doc.title} subtitle={`${doc.source_name} · ${doc.published_at ?? "undated"}${doc.uploader ? ` · added by ${doc.uploader}` : ""}`}>
        {s.role === "admin" && (
          <DeleteButton path={`/api/documents/${doc.id}`} redirectTo="/documents" confirmText="Delete this document with its claims and any conflicts they are part of?" />
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Original text</h2>
          <p className="whitespace-pre-line text-sm leading-6">{doc.body}</p>
        </Card>
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Extracted claims ({claims.length})</h2>
          <div className="space-y-3">
            {claims.map((c) => (
              <Card key={c.id} className={c.status === "superseded" ? "opacity-60" : ""}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm">{c.text}</p>
                  {c.status === "superseded" && <Badge tone="rose">superseded</Badge>}
                </div>
                {c.relations.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs">
                    {c.relations.map((r) => (
                      <li key={r.relation_id} className="flex flex-wrap items-center gap-2">
                        <Badge tone={r.relation === "contradicts" ? "amber" : r.relation === "supports" ? "emerald" : "slate"}>{r.relation}</Badge>
                        <span className="text-slate-600">
                          {r.other_source}: &ldquo;{r.other_text}&rdquo; ({Math.round(r.confidence * 100)}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            <Link href="/documents" className="underline">Back to documents</Link>
          </p>
        </section>
      </div>
    </>
  );
}
