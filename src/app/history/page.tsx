import Link from "next/link";
import { Badge, Empty, PageHeader, Table } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { listQueries } from "@/lib/queries";

export const metadata = { title: "History · ConRAG" };

export default async function HistoryPage() {
  const s = await requirePage();
  const admin = s.role === "admin";
  const qs = await listQueries(admin ? null : s.userId, 100);
  return (
    <>
      <PageHeader title="History" subtitle={admin ? "Every question asked, newest first." : "Your past questions."} />
      {qs.length === 0 ? (
        <Empty>No questions yet.</Empty>
      ) : (
        <Table head={["Question", ...(admin ? ["Asked by"] : []), "Conflicts", "Time", "When"]}>
          {qs.map((q) => (
            <tr key={q.id} className="hover:bg-slate-50">
              <td className="px-3 py-2">
                <Link className="text-indigo-700 hover:underline" href={`/history/${q.id}`}>
                  {q.question}
                </Link>
              </td>
              {admin && <td className="px-3 py-2 text-slate-600">{q.asker ?? "deleted user"}</td>}
              <td className="px-3 py-2">{q.conflicts > 0 ? <Badge tone="amber">{q.conflicts}</Badge> : <Badge tone="emerald">none</Badge>}</td>
              <td className="px-3 py-2 tabular-nums text-slate-600">{q.latency_ms} ms</td>
              <td className="px-3 py-2 text-slate-600">{q.created_at.slice(0, 16)}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
