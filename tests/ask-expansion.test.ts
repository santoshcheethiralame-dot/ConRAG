// Graph expansion and the supports confidence bar in ask (hash embeddings, offline judge).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ask } from "@/lib/ask";
import { pool } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { ingestDocument } from "@/lib/ingest";
import { closePool, makeSource, makeUser, resetData } from "./helpers";

const Q = "What is the library fine per day for each overdue book?";
let official: number;
let news: number;
let wiki: number;
let admin: number;

function withEnv(vars: Record<string, string>) {
  const old: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    old[k] = process.env[k];
    process.env[k] = v;
  }
  resetEnvCache();
  return () => {
    for (const [k, v] of Object.entries(old)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetEnvCache();
  };
}

before(async () => {
  await resetData();
  official = await makeSource("Official", "official", 0.9);
  news = await makeSource("News", "news", 0.5);
  wiki = await makeSource("Wiki", "wiki", 0.3);
  admin = await makeUser("admin@t.io", "admin");
  // OLD is worded like the question; NEW says the same attribute with different words, so it sits far from the question.
  await ingestDocument({ sourceId: official, title: "Rules", body: "The library fine is Rs 2 per day for each overdue book.", publishedAt: "2025-01-01", userId: admin });
  await ingestDocument({ sourceId: wiki, title: "Wiki", body: "Overdue book library fine day Rs 5.", publishedAt: "2024-01-01", userId: admin });
});

describe("graph expansion", () => {
  it("control: with expansion off and a strict similarity floor, the far side of the conflict is missed", async () => {
    const restore = withEnv({ MIN_SIMILARITY: "0.7", EXPAND_LIMIT: "0" });
    try {
      const r = await ask(Q, admin);
      assert.equal(r.conflicts.length, 0);
    } finally {
      restore();
    }
  });

  it("pulls in the contradicting claim from outside the retrieved set and leans on strength, not wording", async () => {
    const restore = withEnv({ MIN_SIMILARITY: "0.7", EXPAND_LIMIT: "20" });
    try {
      const r = await ask(Q, admin);
      assert.equal(r.conflicts.length, 1);
      const c = r.conflicts[0];
      assert.ok(c.a.expanded || c.b.expanded, "one side was pulled in by expansion");
      const favoured = c.lean === "a" ? c.a : c.lean === "b" ? c.b : null;
      assert.ok(favoured && /Rs 2/.test(favoured.text), "the official, newer claim is favoured");
      assert.match(r.answer, /disagree/);
    } finally {
      restore();
    }
  });

  it("never shows an expanded claim that is not part of a conflict", async () => {
    const r = await ask(Q, admin);
    assert.ok(r.claims.every((c) => !c.expanded));
  });
});

describe("supports confidence bar", () => {
  before(async () => {
    await resetData();
    official = await makeSource("Official", "official", 0.9);
    news = await makeSource("News", "news", 0.5);
    wiki = await makeSource("Wiki", "wiki", 0.3);
    admin = await makeUser("admin@t.io", "admin");
    const docs: [number, string, string][] = [
      [official, "d1", "The library fine is Rs 2 per day for each overdue book."],
      [news, "d3", "The library fine is Rs 2 per day for each overdue book borrowed."],
      [wiki, "d4", "The library fine is Rs 5 per day for each overdue book."],
    ];
    for (const [s, t, body] of docs) await ingestDocument({ sourceId: s, title: t, body, publishedAt: "2025-01-01", userId: admin });
    await pool().query("UPDATE claim_relations SET confidence = 0.5 WHERE relation = 'supports'");
  });

  it("a weak supports edge does not merge claims into one position or count as corroboration", async () => {
    const r = await ask(Q, admin);
    const c = r.conflicts[0];
    assert.equal(c.alsoA.length + c.alsoB.length, 0);
    assert.equal(Math.max(c.a.corroboration, c.b.corroboration), 0);
  });

  it("a confident supports edge does", async () => {
    await pool().query("UPDATE claim_relations SET confidence = 0.9 WHERE relation = 'supports'");
    const r = await ask(Q, admin);
    const c = r.conflicts[0];
    assert.equal(c.alsoA.length + c.alsoB.length, 1);
  });
});

after(async () => {
  await resetData();
  await closePool();
});
