import Link from "next/link";
import { Badge, btn, Empty, input, PageHeader, Table } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { listAudit } from "@/lib/queries";

export const metadata = { title: "Audit · ConRAG" };

const TABLES = ["claim_relations", "conflict_resolutions", "sources"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  await requirePage(["admin"]);
  const { table } = await searchParams;
  const t = TABLES.includes(table ?? "") ? table : undefined;
  const rows = await listAudit(200, t);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Written by database triggers on claim_relations, conflict_resolutions and sources. The application cannot skip it." />
      <form className="mb-4 flex gap-2">
        <select name="table" defaultValue={t ?? ""} className={`${input} !w-60`} aria-label="Table">
          <option value="">All tables</option>
          {TABLES.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <button className={btn}>Filter</button>
        <Link href="/audit" className="self-center text-sm text-slate-500 underline">
          reset
        </Link>
      </form>
      {rows.length === 0 ? (
        <Empty>No audited changes yet.</Empty>
      ) : (
        <Table head={["#", "When", "Table", "Row", "Action", "Data"]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 text-slate-400">{r.id}</td>
              <td className="px-3 py-2 whitespace-nowrap text-slate-600">{r.at.slice(0, 19)}</td>
              <td className="px-3 py-2">{r.table_name}</td>
              <td className="px-3 py-2 tabular-nums">{r.row_id}</td>
              <td className="px-3 py-2">
                <Badge tone={r.action === "DELETE" ? "rose" : r.action === "UPDATE" ? "amber" : "emerald"}>{r.action}</Badge>
              </td>
              <td className="max-w-md truncate px-3 py-2 font-mono text-xs text-slate-500" title={r.summary}>
                {r.summary}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
