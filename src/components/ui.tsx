// Small presentational pieces shared by server and client components (no hooks, no state).
import type { ReactNode } from "react";

export const btn =
  "inline-flex items-center justify-center rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
export const btnDanger =
  "inline-flex items-center justify-center rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50";
export const input =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-600">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, className = "", ...rest }: { children: ReactNode; className?: string; "data-testid"?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function Stat({ label, value, tone = "slate" }: { label: string; value: number | string; tone?: "slate" | "amber" | "emerald" }) {
  const tones = { slate: "text-slate-900", amber: "text-amber-700", emerald: "text-emerald-700" };
  return (
    <Card>
      <div className={`text-3xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </Card>
  );
}

const BADGES = {
  slate: "bg-slate-100 text-slate-700",
  indigo: "bg-indigo-50 text-indigo-700",
  amber: "bg-amber-100 text-amber-800",
  emerald: "bg-emerald-100 text-emerald-800",
  rose: "bg-rose-100 text-rose-800",
};
export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: keyof typeof BADGES }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${BADGES[tone]}`}>{children}</span>;
}

export function Trust({ value }: { value: number }) {
  return (
    <span title={`trust ${value}`} className="inline-flex items-center gap-1 text-xs text-slate-500">
      <span className="inline-block h-1.5 w-10 overflow-hidden rounded bg-slate-200">
        <span className="block h-full bg-indigo-500" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      {value.toFixed(2)}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</p>;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export const fmtDate = (d: string | null) => d ?? "undated";

export interface Side {
  claimId: number;
  text: string;
  source: string;
  trust: number;
  date: string | null;
  also?: { source: string; text: string }[];
  winner?: boolean;
}

/** Two opposing claims, side by side. `lean` highlights the side the evidence favours. */
export function ConflictCompare({ a, b, lean, confidence, rationale }: { a: Side; b: Side; lean?: "a" | "b" | "undecided" | null; confidence: number; rationale?: string | null }) {
  const side = (s: Side, mine: "a" | "b") => {
    const favoured = lean === mine || s.winner;
    return (
      <div className={`rounded-md border p-3 ${favoured ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="indigo">{s.source}</Badge>
          <Trust value={s.trust} />
          <span className="text-slate-500">{fmtDate(s.date)}</span>
          {s.winner && <Badge tone="emerald">kept</Badge>}
          {!s.winner && lean === mine && <Badge tone="emerald">evidence favours</Badge>}
        </div>
        <p className="text-sm">&ldquo;{s.text}&rdquo;</p>
        {s.also && s.also.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">Also stated by {s.also.map((x) => x.source).join(", ")}</p>
        )}
      </div>
    );
  };
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {side(a, "a")}
        {side(b, "b")}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Judged contradictory ({Math.round(confidence * 100)}% confidence){rationale ? `: ${rationale}` : ""}
        {lean === "undecided" && " · evidence does not clearly favour either side"}
      </p>
    </div>
  );
}
