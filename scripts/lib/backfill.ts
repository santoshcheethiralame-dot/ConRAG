import type { Client } from "pg";
import { attributeKey } from "../../src/lib/judge-offline";

/** Fill claims.attribute_key for claims ingested before migration 005. Returns how many rows were set. */
export async function backfillAttributeKeys(client: Client): Promise<number> {
  const { rows } = await client.query<{ id: number; text: string }>("SELECT id, text FROM claims WHERE attribute_key IS NULL");
  let n = 0;
  for (const r of rows) {
    const key = attributeKey(r.text);
    if (!key) continue;
    await client.query("UPDATE claims SET attribute_key = $2 WHERE id = $1", [r.id, key]);
    n++;
  }
  return n;
}
