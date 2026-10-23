import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface CorpusDoc {
  number: number;
  file: string;
  title: string;
  source: string;
  date: string;
  body: string;
}

export interface SourceSpec {
  name: string;
  kind: string;
  trust: number;
  url: string | null;
}

const dir = (p: string) => join(process.cwd(), "eval", p);

export function loadSources(): SourceSpec[] {
  return JSON.parse(readFileSync(dir("sources.json"), "utf8"));
}

export function loadCorpus(): CorpusDoc[] {
  return readdirSync(dir("corpus"))
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const raw = readFileSync(join(dir("corpus"), file), "utf8").replace(/\r\n/g, "\n");
      const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
      if (!m) throw new Error(`${file}: missing front matter`);
      const meta = Object.fromEntries(
        m[1].split("\n").map((l) => {
          const i = l.indexOf(":");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
      );
      for (const k of ["title", "source", "date"]) if (!meta[k]) throw new Error(`${file}: missing ${k}`);
      return { number: Number(file.slice(0, 2)), file, title: meta.title, source: meta.source, date: meta.date, body: m[2].trim() };
    });
}

export interface LabelledPair {
  relation: "contradicts" | "supports" | "neutral";
  hard?: boolean;
  note?: string;
  a: [number, string];
  b: [number, string];
}

export interface Question {
  id: string;
  q: string;
  expect: "conflict" | "none";
  needles?: [string, string];
  correct?: 0 | 1;
  focus?: string;
}

export function loadLabels(corpus: CorpusDoc[]): LabelledPair[] {
  const pairs: LabelledPair[] = JSON.parse(readFileSync(dir("labels.json"), "utf8")).pairs;
  for (const p of pairs) {
    for (const [n, text] of [p.a, p.b]) {
      const d = corpus.find((c) => c.number === n);
      if (!d) throw new Error(`labels: no corpus doc ${n}`);
      if (!d.body.includes(text)) throw new Error(`labels: text not found in doc ${n}: ${text}`);
    }
  }
  return pairs;
}

export function loadQuestions(): Question[] {
  return JSON.parse(readFileSync(dir("questions.json"), "utf8")).questions;
}
