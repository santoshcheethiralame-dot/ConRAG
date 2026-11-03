// Candidate generation and the duplicate rule at ingest (hash embeddings, offline judge).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { one, rows } from "@/lib/db";
import { hashEmbed } from "@/lib/embed";
import { ingestDocument } from "@/lib/ingest";
import { attributeKey } from "@/lib/judge-offline";
import { closePool, makeSource, makeUser, resetData } from "./helpers";

let official: number;
let wiki: number;
let admin: number;

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

before(async () => {
  await resetData();
  official = await makeSource("Official", "official", 0.9);
  wiki = await makeSource("Wiki", "wiki", 0.3);
  admin = await makeUser("admin@t.io", "admin");
});

describe("duplicate rule", () => {
  const body = "The gymnasium is open from 6 am to 9 pm every day of the week.";

  it("refuses the same text twice for one source", async () => {
    await ingestDocument({ sourceId: official, title: "Gym", body, userId: admin });
    await assert.rejects(ingestDocument({ sourceId: official, title: "Gym again", body: body + " ", userId: admin }), { status: 409 });
  });

  it("accepts the same text from another source and records it as corroboration", async () => {
    const r = await ingestDocument({ sourceId: wiki, title: "Gym (mirror)", body, userId: admin });
    assert.equal(r.supports, 1);
    assert.equal(r.contradicts, 0);
    const rel = await one<{ relation: string }>("SELECT relation FROM claim_relations");
    assert.equal(rel?.relation, "supports");
  });
});

describe("attribute-key candidates", () => {
  const OLD = "The library fine is Rs 2 per day for each overdue book.";
  const NEW = "Overdue book library fine day Rs 5.";

  it("fixture: same attribute key, embedding similarity below the shortlist floor", () => {
    assert.equal(attributeKey(OLD), attributeKey(NEW));
    assert.ok(dot(hashEmbed(OLD), hashEmbed(NEW)) < 0.6);
  });

  it("finds and flags a conflict the vector shortlist alone would miss", async () => {
    await ingestDocument({ sourceId: official, title: "Library rules", body: OLD, userId: admin });
    const r = await ingestDocument({ sourceId: wiki, title: "Library wiki", body: NEW, userId: admin });
    assert.equal(r.contradicts, 1);
  });

  it("stores the key on every new claim and it is queryable", async () => {
    const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM claims WHERE attribute_key IS NULL");
    assert.equal(n?.n, 0);
    const found = await rows("SELECT * FROM claims_with_attribute($1, $2::vector, 10)", [
      attributeKey(OLD),
      "[" + hashEmbed(OLD).join(",") + "]",
    ]);
    assert.equal(found.length, 2);
  });
});

after(async () => {
  await resetData();
  await closePool();
});
