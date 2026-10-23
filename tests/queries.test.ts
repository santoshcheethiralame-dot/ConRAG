// Every query in db/queries.sql must parse and run, on an empty database and on loaded data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import { pool } from "@/lib/db";
import { parseQueryPack } from "../scripts/lib/querypack";
import { resetData } from "./helpers";

const blocks = parseQueryPack(readFileSync("db/queries.sql", "utf8"));

describe("db/queries.sql", () => {
  it("has the documented queries", () => {
    assert.ok(blocks.length >= 15);
    for (const b of blocks) assert.ok(b.name && b.shows && /^\s*(WITH|SELECT)/i.test(b.sql), b.name);
  });
  it("runs every query on an empty database", async () => {
    await resetData();
    for (const b of blocks) await pool().query(b.sql).catch((e) => assert.fail(`${b.name}: ${e.message}`));
  });
  after(() => pool().end());
});
