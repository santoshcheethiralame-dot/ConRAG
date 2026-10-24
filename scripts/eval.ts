// Evaluation: ingest the labelled corpus into a throwaway database, then measure
//   1. pair-level conflict detection (precision / recall / F1) against eval/labels.json
//   2. question-level behaviour of ConRAG vs plain RAG against eval/questions.json
// Writes docs/EVALUATION.md and eval/results.json.
//   npm run eval                      local MiniLM embeddings + offline judge (or a free-tier chat model if LLM_PROVIDER and LLM_API_KEY are set)
//   EMBEDDING_PROVIDER=hash npm run eval
import { writeFileSync } from "node:fs";
import { Client } from "pg";
import { loadCorpus, loadLabels, loadQuestions, loadSources } from "./lib/corpus";
import { migrate } from "./lib/migrate";
import { startPgServer } from "./lib/pgserver";

const PORT = 5435;
type Rel = "contradicts" | "supports" | "neutral";
const m = (s: string, needle: string) => s.toLowerCase().includes(needle.toLowerCase());
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(0)}% (${n}/${d})`);
const f2 = (x: number) => x.toFixed(2);

async function main() {
  const server = await startPgServer({ port: PORT });
  const url = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
  process.env.DATABASE_URL = url;
  process.env.SESSION_SECRET ??= "eval-secret-eval-secret-eval-secret-1";
  const setup = new Client({ connectionString: url });
  await setup.connect();
  await migrate(setup);
  for (const s of loadSources()) {
    await setup.query("INSERT INTO sources (name, kind, trust_score) VALUES ($1, $2, $3)", [s.name, s.kind, s.trust]);
  }
  await setup.end();

  const { pool, rows } = await import("@/lib/db");
  const { ingestDocument } = await import("@/lib/ingest");
  const { ask } = await import("@/lib/ask");
  const { getLlm } = await import("@/lib/llm");
  const { env } = await import("@/lib/env");

  const corpus = loadCorpus();
  const labels = loadLabels(corpus);
  const questions = loadQuestions();
  const llm = getLlm();
  const t0 = Date.now();
  for (const d of corpus) {
    const src = await pool().query("SELECT id FROM sources WHERE name = $1", [d.source]);
    await ingestDocument({ sourceId: src.rows[0].id, title: d.title, body: d.body, publishedAt: d.date, userId: null });
  }
  const ingestMs = Date.now() - t0;

  const claims = await rows<{ id: number; text: string; title: string }>(
    "SELECT c.id, c.text, d.title FROM claims c JOIN documents d ON d.id = c.document_id",
  );
  const stored = await rows<{ claim_a: number; claim_b: number; relation: Rel; confidence: number; rationale: string }>(
    "SELECT claim_a, claim_b, relation, confidence, rationale FROM claim_relations",
  );
  const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const byKey = new Map(stored.map((r) => [key(r.claim_a, r.claim_b), r]));
  const title = (n: number) => corpus.find((c) => c.number === n)!.title;
  const idOf = (n: number, text: string) => claims.find((c) => c.title === title(n) && c.text === text)?.id;
  const textOf = new Map(claims.map((c) => [c.id, `[${c.title}] ${c.text}`]));

  /* ---- pair level ---- */
  const matrix: Record<Rel, Record<Rel, number>> = {
    contradicts: { contradicts: 0, supports: 0, neutral: 0 },
    supports: { contradicts: 0, supports: 0, neutral: 0 },
    neutral: { contradicts: 0, supports: 0, neutral: 0 },
  };
  const labelled = new Set<string>();
  const wrong: string[] = [];
  const notExtracted: string[] = [];
  for (const p of labels) {
    const a = idOf(...p.a);
    const b = idOf(...p.b);
    if (a === undefined || b === undefined) {
      notExtracted.push(`${p.a[1]} / ${p.b[1]}`);
      continue;
    }
    labelled.add(key(a, b));
    const got = byKey.get(key(a, b));
    const pred: Rel = got?.relation ?? "neutral";
    matrix[p.relation][pred]++;
    if (pred !== p.relation) {
      wrong.push(`${p.hard ? "(hard) " : ""}expected ${p.relation}, got ${pred}${got ? ` @${got.confidence}` : ""}: ${textOf.get(a)}  <>  ${textOf.get(b)}${p.note ? `  (${p.note})` : ""}`);
    }
  }
  const unlabelled = stored.filter((r) => r.relation === "contradicts" && !labelled.has(key(r.claim_a, r.claim_b)));
  const tp = matrix.contradicts.contradicts;
  const labelledPositives = labels.filter((l) => l.relation === "contradicts").length;
  const predictedPositives = stored.filter((r) => r.relation === "contradicts").length;
  const precision = predictedPositives ? tp / predictedPositives : 0;
  const recall = tp / labelledPositives;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  /* ---- question level ---- */
  const qrows: string[] = [];
  let cQ = 0, disclosed = 0, leanRight = 0, leanWrong = 0, undecided = 0, plainRight = 0, plainWrong = 0, plainBoth = 0;
  let nQ = 0, falseAlarms = 0;
  let totalMs = 0;
  for (const q of questions) {
    const r = await ask(q.q, null, { compare: true });
    totalMs += r.ms;
    if (q.expect === "conflict") {
      cQ++;
      const [n0, n1] = q.needles!;
      const hit = r.conflicts.find((c) => (m(c.a.text, n0) && m(c.b.text, n1)) || (m(c.a.text, n1) && m(c.b.text, n0)));
      let leanTxt = "-";
      if (hit) {
        disclosed++;
        if (hit.lean === "undecided") {
          undecided++;
          leanTxt = "undecided";
        } else {
          const winner = hit.lean === "a" ? hit.a.text : hit.b.text;
          const ok = m(winner, q.needles![q.correct!]);
          if (ok) leanRight++;
          else leanWrong++;
          leanTxt = ok ? "correct" : "WRONG";
        }
      }
      const pa = r.plain!.answer;
      const has0 = m(pa, n0), has1 = m(pa, n1);
      const right = m(pa, q.needles![q.correct!]) && !m(pa, q.needles![1 - q.correct!]);
      if (has0 && has1) plainBoth++;
      if (right) plainRight++;
      else plainWrong++;
      qrows.push(`| ${q.id} | ${q.q} | ${hit ? "yes" : "NO"} | ${leanTxt} | ${right ? "correct" : has0 || has1 ? "WRONG" : "no match"} |`);
    } else {
      nQ++;
      const fa = r.conflicts.some((c) => m(c.a.text, q.focus!) || m(c.b.text, q.focus!));
      if (fa) falseAlarms++;
      qrows.push(`| ${q.id} | ${q.q} | ${fa ? "FALSE ALARM" : "ok"} | - | - |`);
    }
  }

  const relCounts = ["contradicts", "supports"].map((k) => `${stored.filter((r) => r.relation === k).length} ${k}`).join(", ");
  const md = `# Evaluation

Generated by \`npm run eval\` on ${new Date().toISOString().slice(0, 10)}. Do not edit by hand; re-run the script.

## Setup

| | |
|---|---|
| Corpus | ${corpus.length} synthetic campus-policy documents, ${claims.length} claims, 5 sources of differing trust |
| Embeddings | ${env().EMBEDDING_PROVIDER === "local" ? "Xenova/all-MiniLM-L6-v2 (384-d, cosine)" : "feature-hashing (lexical, 384-d)"} |
| Claim extractor, judge, answerer | \`${llm.name}\` |
| Stored relations | ${relCounts} (neutral pairs are not stored) |
| Candidate shortlist | top ${env().CANDIDATES_PER_CLAIM} claims per new claim with cosine similarity ≥ ${env().CANDIDATE_MIN_SIMILARITY} |
| Ingest time | ${(ingestMs / 1000).toFixed(1)} s for the whole corpus |
| Ground truth | \`eval/labels.json\` (${labels.length} labelled pairs), \`eval/questions.json\` (${questions.length} questions) |

## 1. Pair-level conflict detection

Ground truth: ${labelledPositives} contradicting pairs, ${labels.filter((l) => l.relation === "supports").length} supporting pairs, ${labels.filter((l) => l.relation === "neutral").length} look-alike pairs that must **not** be flagged (different scope, audience or topic; one is a hard case, a general rule vs a narrower exception).

| | predicted contradicts | predicted supports | predicted none |
|---|---|---|---|
| **true contradicts** | ${matrix.contradicts.contradicts} | ${matrix.contradicts.supports} | ${matrix.contradicts.neutral} |
| **true supports** | ${matrix.supports.contradicts} | ${matrix.supports.supports} | ${matrix.supports.neutral} |
| **true neutral** | ${matrix.neutral.contradicts} | ${matrix.neutral.supports} | ${matrix.neutral.neutral} |

Contradiction **precision ${f2(precision)}**, **recall ${f2(recall)}**, **F1 ${f2(f1)}**. Precision counts every contradiction the system stored, including ${unlabelled.length} pair(s) not in the labels.

${notExtracted.length ? `Labelled pairs whose sentence was not extracted as a claim: ${notExtracted.length}\n\n${notExtracted.map((x) => `- ${x}`).join("\n")}\n\n` : ""}### Disagreements with the labels

${wrong.length ? wrong.map((w) => `- ${w}`).join("\n") : "None."}

### Contradictions stored that are not in the labels

${unlabelled.length ? unlabelled.map((r) => `- @${r.confidence}: ${textOf.get(r.claim_a)}  <>  ${textOf.get(r.claim_b)}  (${r.rationale})`).join("\n") : "None."}

## 2. Question level: ConRAG vs plain RAG

Plain RAG here means the same retrieval and the same answer model, but no conflict data, no source weighting, and no knowledge of resolved conflicts. It answers from the top-ranked evidence.

**Questions with a real conflict (${cQ})**

| | ConRAG | Plain RAG |
|---|---|---|
| Tells the user the sources disagree | ${pct(disclosed, cQ)} | ${pct(plainBoth, cQ)} |
| Gives or leans to the better-supported answer | ${pct(leanRight, cQ)}${undecided ? `, ${undecided} undecided` : ""}${leanWrong ? `, ${leanWrong} leaned wrong` : ""} | ${pct(plainRight, cQ)} |
| Gives only the worse-supported answer, with no warning | 0 | ${pct(plainWrong, cQ)} |

**Questions with no real conflict (${nQ}):** false alarms (ConRAG reports a conflict about the thing asked): ${pct(falseAlarms, nQ)}.

Average ConRAG answer time ${Math.round(totalMs / questions.length)} ms per question (retrieval, scoring and answer, plus the plain-RAG comparison).

| id | question | conflict reported | lean | plain RAG answer |
|---|---|---|---|---|
${qrows.join("\n")}

## Reading the numbers

- The corpus and labels are written by the authors, so they are a regression and sanity check, not a benchmark of real-world performance.
- Without an API key the judge is a rule-based fallback (numbers, times, dates, negation, antonyms, scope and audience tokens). With \`ANTHROPIC_API_KEY\` set the same script exercises the language-model judge; rerun it and compare.
- The hard pair (a general rule against a narrower exception) is the kind of case rules cannot settle and a language model usually can.
`;
  writeFileSync("docs/EVALUATION.md", md);
  writeFileSync(
    "eval/results.json",
    JSON.stringify({ llm: llm.name, matrix, precision, recall, f1, questions: { cQ, disclosed, leanRight, leanWrong, undecided, plainRight, plainWrong, nQ, falseAlarms } }, null, 2) + "\n",
  );
  console.log(md.split("## 2.")[0].split("## 1.")[1]);
  console.log(`questions: disclosed ${disclosed}/${cQ}, lean right ${leanRight}, lean wrong ${leanWrong}, undecided ${undecided}; plain right ${plainRight}/${cQ}; false alarms ${falseAlarms}/${nQ}`);
  await pool().end();
  await server.stop();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
