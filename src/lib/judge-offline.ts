// Rule-based contradiction judge: the no-API-key fallback and the evaluation baseline for
// the LLM judge. Cheap, deterministic, and deliberately conservative about scope.

export type Relation = "contradicts" | "supports" | "neutral";

export interface Judgement {
  relation: Relation;
  confidence: number;
  rationale: string;
}

const NEGATIONS = new Set(
  "not no never cannot without prohibited forbidden banned disallowed barred unavailable".split(" "),
);
const ANTONYMS: [string, string][] = [
  ["allowed", "prohibited"], ["allowed", "forbidden"], ["permitted", "forbidden"], ["permitted", "prohibited"],
  ["mandatory", "optional"], ["compulsory", "optional"], ["required", "optional"],
  ["open", "closed"], ["free", "charged"], ["free", "chargeable"], ["increase", "decrease"],
  ["earlier", "later"], ["before", "after"], ["accepted", "rejected"], ["eligible", "ineligible"],
];
const SYNONYMS: Record<string, string> = {
  examination: "exam", examinations: "exam", exams: "exam", tests: "test", fees: "fee",
  charges: "fee", charge: "fee", penalty: "fine", fines: "fine", penalties: "fine",
  hostels: "hostel", students: "student", timing: "time", timings: "time", hours: "hour",
};
const STOPWORDS = new Set(
  ("a an the of to in on at for and or is are was were be been being by with as it its this that these those " +
    "from has have had will shall can may must should would per each any all only also than then so such " +
    "who which when where what their there they them his her our your you we i").split(" "),
);
const MONTHS = "january february march april may june july august september october november december".split(" ");

const SCOPE_PATTERNS: RegExp[] = [
  /\b(first|second|third|fourth|final|last)[- ]year\b/g,
  /\bsemester[- ]?\d\b/g,
  /\b(ug|pg|phd|mba|b\.?tech|m\.?tech|undergraduate|postgraduate)\b/g,
  /\b(boys|girls|men|women|male|female)\b/g,
  /\bhostel [a-z]\b/g,
  /\b(cse|ece|eee|mech|civil|isc|ise|aiml)\b/g,
  /\b(international|foreign|day scholars?|hostellers?|scholarship holders?|visiting)\b/g,
];

const ROLE_RE = /\b(student|faculty|staff|alumni|researcher|visitor|parent|guest)s?\b/g;

const UNIT_ALIASES: [RegExp, string][] = [
  [/^(%|percent|percentage)$/, "%"],
  [/^(rs\.?|inr|₹|rupees?)$/, "inr"],
  [/^days?$/, "day"], [/^(hours?|hrs?)$/, "hour"], [/^weeks?$/, "week"], [/^months?$/, "month"],
  [/^years?$/, "year"], [/^(minutes?|mins?)$/, "minute"], [/^marks?$/, "mark"], [/^credits?$/, "credit"],
  [/^students?$/, "student"], [/^books?$/, "book"],
];

const UNIT_LABEL: Record<string, string> = { inr: "amount (Rs)", time: "clock time", "%": "percentage" };
const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const show = (unit: string, vals: Set<number>) => [...vals].map((v) => (unit === "time" ? hhmm(v) : v)).join(", ");

function normalise(t: string): string {
  return t
    .toLowerCase()
    .replace(/won't/g, "will not")
    .replace(/can't/g, "cannot")
    .replace(/n't\b/g, " not")
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Audiences a claim talks about (students, faculty, visitors...). */
export function roleTokens(t: string): Set<string> {
  return new Set([...t.matchAll(ROLE_RE)].map((m) => m[1]));
}

export function scopeTokens(t: string): Set<string> {
  const out = new Set<string>();
  for (const re of SCOPE_PATTERNS) for (const m of t.matchAll(re)) out.add(m[0].replace(/[- ]/g, ""));
  return out;
}

/** Numbers grouped by unit; clock times become minutes-since-midnight under the "time" unit. */
export function numbersByUnit(t: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  const add = (unit: string, v: number) => {
    if (!out.has(unit)) out.set(unit, new Set());
    out.get(unit)!.add(v);
  };
  let rest = t.toLowerCase();
  for (const re of SCOPE_PATTERNS) rest = rest.replace(re, " ");
  rest = rest.replace(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/g, (_, h, m, ap) => {
    let hh = Number(h) % 12;
    if (/^p/.test(ap)) hh += 12;
    add("time", hh * 60 + Number(m ?? 0));
    return " ";
  });
  rest = rest.replace(/\b(19|20)\d{2}\b/g, " "); // bare years are dates, not quantities
  const re = /(rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(%|percent|percentage|rs\.?|inr|₹|rupees?|[a-z]+)?/g;
  for (const m of rest.matchAll(re)) {
    const [, pre, num, post] = m;
    let unit = "";
    if (pre) unit = "inr";
    else if (post) {
      const hit = UNIT_ALIASES.find(([r]) => r.test(post));
      if (hit) unit = hit[1];
    }
    add(unit, Number(num));
  }
  return out;
}

function months(t: string): Set<string> {
  return new Set(MONTHS.filter((m) => new RegExp(`\\b${m}\\b`).test(t) && !(m === "may" && !/\bmay \d|\d may\b/.test(t))));
}

function contentWords(t: string): Set<string> {
  const skip = new Set([...NEGATIONS, ...ANTONYMS.flat(), ...MONTHS]);
  const out = new Set<string>();
  for (const w of t.match(/[a-z]+/g) ?? []) {
    if (STOPWORDS.has(w) || skip.has(w)) continue;
    let s = SYNONYMS[w] ?? w;
    if (s.length > 4 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
    out.add(s);
  }
  return out;
}

const hasNegation = (t: string) => (t.match(/[a-z]+/g) ?? []).some((w) => NEGATIONS.has(w));
const intersect = <T,>(a: Set<T>, b: Set<T>) => [...a].filter((x) => b.has(x));
const sameSet = <T,>(a: Set<T>, b: Set<T>) => a.size === b.size && intersect(a, b).length === a.size;

export function judgeOffline(
  a: string,
  b: string,
  opts: { similarity?: number; maskedSimilarity?: number } = {},
): Judgement {
  const ta = normalise(a);
  const tb = normalise(b);

  const sa = scopeTokens(ta);
  const sb = scopeTokens(tb);
  if (sa.size > 0 && sb.size > 0 && !sameSet(sa, sb)) {
    return { relation: "neutral", confidence: 0.7, rationale: `Different scope: [${[...sa]}] vs [${[...sb]}].` };
  }

  const ra = roleTokens(ta);
  const rb = roleTokens(tb);
  if (ra.size > 0 && rb.size > 0 && intersect(ra, rb).length === 0) {
    return { relation: "neutral", confidence: 0.7, rationale: `Different audience: [${[...ra]}] vs [${[...rb]}].` };
  }

  const wa = contentWords(ta);
  const wb = contentWords(tb);
  const shared = intersect(wa, wb).length;
  const overlap = shared / Math.max(1, Math.min(wa.size, wb.size));
  const jaccard = shared / Math.max(1, new Set([...wa, ...wb]).size);
  const threshold = (opts.similarity ?? 0) >= 0.75 ? 0.3 : 0.45;
  const different = opts.maskedSimilarity !== undefined ? opts.maskedSimilarity < MASKED_MIN : jaccard < threshold;
  if (different) {
    return { relation: "neutral", confidence: 0.6, rationale: "Claims are about different things." };
  }

  const reasons: string[] = [];
  let agree = false;

  const na = numbersByUnit(ta);
  const nb = numbersByUnit(tb);
  for (const unit of na.keys()) {
    if (!nb.has(unit)) continue;
    const x = na.get(unit)!;
    const y = nb.get(unit)!;
    const common = intersect(x, y).length;
    if (sameSet(x, y)) agree = true;
    else if (common < x.size && common < y.size) {
      reasons.push(`different ${UNIT_LABEL[unit] ?? (unit || "numeric")} values (${show(unit, x)} vs ${show(unit, y)})`);
    }
  }
  const ma = months(ta);
  const mb = months(tb);
  if (ma.size && mb.size) {
    if (sameSet(ma, mb)) agree = true;
    else reasons.push(`different dates (${[...ma]} vs ${[...mb]})`);
  }
  if (hasNegation(ta) !== hasNegation(tb)) reasons.push("one claim negates the other");
  const wordsA = new Set(ta.match(/[a-z]+/g) ?? []);
  const wordsB = new Set(tb.match(/[a-z]+/g) ?? []);
  for (const [x, y] of ANTONYMS) {
    if ((wordsA.has(x) && wordsB.has(y)) || (wordsA.has(y) && wordsB.has(x))) {
      reasons.push(`"${x}" vs "${y}"`);
      break;
    }
  }

  if (reasons.length > 0) {
    return {
      relation: "contradicts",
      confidence: Math.min(0.95, Math.round((0.6 + 0.3 * overlap) * 100) / 100),
      rationale: `Same topic but ${reasons.join("; ")}.`,
    };
  }
  const alike = (opts.maskedSimilarity ?? 0) >= MASKED_MIN && jaccard >= 0.4;
  if (agree || jaccard >= 0.6 || alike) {
    return {
      relation: "supports",
      confidence: Math.min(0.95, Math.round((0.6 + 0.3 * Math.max(jaccard, overlap)) * 100) / 100),
      rationale: "Same topic and the same specifics.",
    };
  }
  return { relation: "neutral", confidence: 0.5, rationale: "Related but neither confirms nor conflicts." };
}

const MONTH_RE = new RegExp("\\b(?:" + MONTHS.join("|") + ")\\b", "gi");

/**
 * Replace every quantity (clock time, money, percentage, bare number, month) with "#".
 * Two claims about the same attribute that differ only in the value become near-identical
 * after masking, so their embedding similarity separates "same attribute, different value"
 * from "different attribute".
 */
export function maskQuantities(t: string): string {
  return t
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)/gi, " # ")
    .replace(/(?:\brs\.?|\binr|₹)?\s*\d[\d,]*(?:\.\d+)?\s*(?:%|percent\b|percentage\b)?/gi, " # ")
    .replace(MONTH_RE, " # ")
    .replace(/(?:#\s*){2,}/g, "# ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Below this masked-embedding similarity two claims are about different attributes. */
export const MASKED_MIN = 0.8;
