export interface Scorable {
  similarity: number;
  reliability: number;
  publishedAt: string | null;
  corroboration: number;
}

const DAY = 86_400_000;

/** Older claims lose 5% per year, floored at 0.8; an unknown date counts as slightly stale. */
export function recencyFactor(publishedAt: string | null, now = Date.now()): number {
  if (!publishedAt) return 0.95;
  const years = Math.max(0, (now - Date.parse(publishedAt)) / (365 * DAY));
  return Math.max(0.8, 1 - 0.05 * years);
}

/** Each independent supporting claim adds 15%, capped at three. */
export function corroborationFactor(n: number): number {
  return 1 + 0.15 * Math.min(Math.max(n, 0), 3);
}

export function claimScore(c: Scorable, now = Date.now()): number {
  return c.similarity * c.reliability * recencyFactor(c.publishedAt, now) * corroborationFactor(c.corroboration);
}

export type Lean = "a" | "b" | "undecided";

/** Which side of a contradiction the evidence favours. Within 10% counts as undecided. */
export function lean(scoreA: number, scoreB: number): Lean {
  const hi = Math.max(scoreA, scoreB);
  if (hi === 0 || Math.abs(scoreA - scoreB) / hi < 0.1) return "undecided";
  return scoreA > scoreB ? "a" : "b";
}

export interface Suggestion {
  side: Lean;
  reasons: string[];
}

/**
 * Which side of an open conflict an admin should probably keep, from source reliability and recency alone
 * (no question is involved, so similarity is not a factor).
 */
export function suggestResolution(
  a: { reliability: number; date: string | null },
  b: { reliability: number; date: string | null },
  now = Date.now(),
): Suggestion {
  const sa = a.reliability * recencyFactor(a.date, now);
  const sb = b.reliability * recencyFactor(b.date, now);
  const side = lean(sa, sb);
  if (side === "undecided") return { side, reasons: [] };
  const [w, l] = side === "a" ? [a, b] : [b, a];
  const reasons: string[] = [];
  if (w.reliability > l.reliability) reasons.push("more reliable source");
  if (w.date && l.date && w.date > l.date) reasons.push("newer");
  return { side, reasons };
}
