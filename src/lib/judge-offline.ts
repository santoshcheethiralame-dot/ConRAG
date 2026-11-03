// Rule-based contradiction judge: the no-API-key fallback and the evaluation baseline for
// the LLM judge. Cheap, deterministic, and deliberately conservative about scope.

import { createHash } from "node:crypto";

export type Relation = "contradicts" | "supports" | "neutral";

export interface Judgement {
  relation: Relation;
  confidence: number;
  rationale: string;
}

const NEGATIONS = new Set(
  "not no never cannot nobody nothing none without prohibited forbidden banned disallowed barred unavailable".split(" "),
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
    "from has have had will shall can may must should would per each every any all only also than then so such " +
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

/** Durations are compared in one unit, so "2 hours" and "120 minutes" agree. */
const UNIT_CONVERT: Record<string, [string, number]> = { hour: ["minute", 60], week: ["day", 7], year: ["month", 12] };

const UNIT_LABEL: Record<string, string> = { inr: "amount (Rs)", time: "clock time", "%": "percentage" };
const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const show = (unit: string, vals: Set<number>) => [...vals].map((v) => (unit === "time" ? hhmm(v) : v)).join(", ");

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const NUMBER_WORD = new RegExp(
  `\\b(?:(${Object.keys(TENS).join("|")})(?:[- ](one|two|three|four|five|six|seven|eight|nine))?|(${Object.keys(SMALL).join("|")}))(?:\\s+(hundred|thousand))?\\b`,
  "g",
);
const UNIT_WORD = /^(rupees?|rs|percent|days?|hours?|hrs?|weeks?|months?|years?|minutes?|mins?|marks?|credits?|students?|books?|am|pm|experiments?|papers?|attempts?)\b/;

/**
 * "two rupees" -> "2 rupees", "twenty five percent" -> "25 percent", "three-fourths" -> "75 percent".
 * A bare "one" is left alone unless a unit follows ("no one", "one of" stay words).
 */
export function numberWordsToDigits(t: string): string {
  return t
    .replace(/\bthree[- ](?:fourths?|quarters?)\b/g, "75 percent")
    .replace(/\bone[- ]half\b/g, "50 percent")
    .replace(/\bone[- ](?:fourth|quarter)\b/g, "25 percent")
    .replace(NUMBER_WORD, (m, tens, unit, small, mult, offset: number, whole: string) => {
      let v = tens ? TENS[tens] + (unit ? SMALL[unit] : 0) : SMALL[small];
      if (mult) v *= mult === "hundred" ? 100 : 1000;
      else if (small === "one" && !UNIT_WORD.test(whole.slice(offset + m.length).trimStart())) return m;
      return String(v);
    });
}

function normalise(t: string): string {
  return numberWordsToDigits(t.toLowerCase())
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
  let rest = numberWordsToDigits(t.toLowerCase());
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
    const conv = UNIT_CONVERT[unit];
    if (conv) add(conv[0], Number(num) * conv[1]);
    else add(unit, Number(num));
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

const HIGHER = new Set("higher greater more larger longer bigger later costlier older".split(" "));
const LOWER = new Set("lower less smaller shorter fewer cheaper earlier younger".split(" "));
const COMPARATIVE_RE = new RegExp(
  `^(.*?)\\b(?:is|are|was|were)\\s+(?:much |slightly |significantly )?(${[...HIGHER, ...LOWER].join("|")})\\s+than\\s+(.*?)\\.?$`,
);

function parseComparative(t: string): { x: Set<string>; y: Set<string>; dir: 1 | -1 } | null {
  const m = COMPARATIVE_RE.exec(t);
  if (!m) return null;
  return { x: contentWords(m[1]), y: contentWords(m[3]), dir: HIGHER.has(m[2]) ? 1 : -1 };
}

/** "A is higher than B" against "B is higher than A": same words, reversed claim. */
function judgeComparative(ta: string, tb: string): Judgement | null {
  const pa = parseComparative(ta);
  const pb = parseComparative(tb);
  if (!pa || !pb || pa.x.size === 0 || pa.y.size === 0) return null;
  const same = sameSet(pa.x, pb.x) && sameSet(pa.y, pb.y);
  const swapped = sameSet(pa.x, pb.y) && sameSet(pa.y, pb.x);
  if (!same && !swapped) return null;
  const agree = same ? pa.dir === pb.dir : pa.dir !== pb.dir;
  return agree
    ? { relation: "supports", confidence: 0.85, rationale: "Same comparison between the same two things." }
    : { relation: "contradicts", confidence: 0.9, rationale: "Same two things, but the comparison is reversed." };
}

const DAYS = "monday tuesday wednesday thursday friday saturday sunday".split(" ");
const ENTITY_SKIP = new Set(["dr", "prof", "mr", "mrs", "ms", "rs", "no", "st", ...DAYS]);

/** Capitalised words inside a sentence ("Rao", "Iyer"); sentence-initial words and acronyms are ignored. */
export function entityTokens(raw: string): Set<string> {
  const out = new Set<string>();
  for (const m of raw.matchAll(/\b[A-Z][a-z]+\b/g)) {
    const before = raw.slice(0, m.index).trimEnd();
    if (before === "" || (/[.!?]$/.test(before) && !/\b(Dr|Prof|Mr|Mrs|Ms|Rs|No|St)\.$/.test(before))) continue;
    const w = m[0].toLowerCase();
    if (ENTITY_SKIP.has(w) || STOPWORDS.has(w) || MONTHS.includes(w)) continue;
    out.add(w);
  }
  return out;
}

const CONDITION_RE = /\b(?:only if|if|unless|provided that|as long as)\b.*$/;

/** Split "phones are allowed if switched off" into the rule and its condition. */
function splitCondition(t: string): { core: string; cond: string | null } {
  const m = CONDITION_RE.exec(t);
  return m && m.index > 0 ? { core: t.slice(0, m.index).replace(/[,\s]+$/, ""), cond: m[0] } : { core: t, cond: null };
}

/**
 * Key shared by claims about the same attribute that differ only in value or polarity: md5 of the
 * sorted content words after quantities are masked and negations, antonyms and months are dropped.
 * Stored in claims.attribute_key and used to find conflict candidates that embeddings miss.
 * Null when the claim has too few content words to be a useful key.
 */
export function attributeKey(text: string): string | null {
  const words = [...contentWords(splitCondition(maskQuantities(text)).core)].sort();
  if (words.length < 2) return null;
  return createHash("md5").update(words.join(" ")).digest("hex");
}

export function judgeOffline(
  a: string,
  b: string,
  opts: { similarity?: number; maskedSimilarity?: number } = {},
): Judgement {
  let ta = normalise(a);
  let tb = normalise(b);

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

  const cmp = judgeComparative(ta, tb);
  if (cmp) return cmp;

  // A condition ("... if switched off") narrows a rule. Compare the rules themselves, and say so.
  const ca = splitCondition(ta);
  const cb = splitCondition(tb);
  const conditional = ca.cond !== null || cb.cond !== null;
  if (conditional) {
    if (ca.cond !== null && cb.cond !== null) {
      const x = contentWords(ca.cond);
      const y = contentWords(cb.cond);
      if (intersect(x, y).length / Math.max(1, new Set([...x, ...y]).size) < 0.6) {
        return { relation: "neutral", confidence: 0.6, rationale: "Each claim applies under a different condition." };
      }
    }
    ta = ca.core;
    tb = cb.core;
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

  const ea = entityTokens(a);
  const eb = entityTokens(b);
  const onlyA = [...ea].filter((x) => !eb.has(x));
  const onlyB = [...eb].filter((x) => !ea.has(x));
  const namesDiffer = onlyA.length > 0 && onlyB.length > 0;
  // "Dr. Rao is the Dean" against "Dr. Iyer is the Dean": a unique role held by two different people.
  if (namesDiffer && /\b(?:is|are|was) the\b/.test(ta) && /\b(?:is|are|was) the\b/.test(tb)) {
    reasons.push(`different names (${onlyA} vs ${onlyB})`);
  }

  if (reasons.length > 0) {
    const raw = Math.round((0.6 + 0.3 * overlap) * 100) / 100;
    return {
      relation: "contradicts",
      confidence: Math.min(conditional ? 0.7 : 0.95, raw),
      rationale: `Same topic but ${reasons.join("; ")}${conditional ? " (one claim is conditional)" : ""}.`,
    };
  }
  if (namesDiffer) {
    return { relation: "neutral", confidence: 0.55, rationale: `Different named entities (${onlyA} vs ${onlyB}).` };
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
  return numberWordsToDigits(t.toLowerCase())
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)/gi, " # ")
    .replace(/(?:\brs\.?|\binr|₹)?\s*\d[\d,]*(?:\.\d+)?\s*(?:%|percent\b|percentage\b)?/gi, " # ")
    .replace(MONTH_RE, " # ")
    .replace(/(?:#\s*){2,}/g, "# ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Below this masked-embedding similarity two claims are about different attributes. */
export const MASKED_MIN = 0.8;
