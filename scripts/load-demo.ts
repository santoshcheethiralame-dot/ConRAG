// Ingest the demo corpus (eval/corpus) into the database at DATABASE_URL.
// Run after `npm run db:seed`. Already-ingested documents are skipped.
import { loadCorpus } from "./lib/corpus";

export async function loadDemo() {
  const { one, pool } = await import("@/lib/db");
  const { ingestDocument } = await import("@/lib/ingest");
  const admin = await one<{ id: number }>("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  let found = 0;
  for (const doc of loadCorpus()) {
    const src = await one<{ id: number }>("SELECT id FROM sources WHERE name = $1", [doc.source]);
    if (!src) throw new Error(`source "${doc.source}" missing; run npm run db:seed first`);
    try {
      const r = await ingestDocument({ sourceId: src.id, title: doc.title, body: doc.body, publishedAt: doc.date, userId: admin?.id ?? null });
      found += r.contradicts;
      console.log(`+ ${doc.file}: ${r.claims} claims, ${r.contradicts} contradictions, ${r.supports} supports (${r.ms} ms)`);
    } catch (e) {
      if ((e as { status?: number }).status === 409) console.log(`= ${doc.file}: already ingested`);
      else throw e;
    }
  }
  console.log(`done, ${found} contradictions found`);
  await pool().end();
}
if (/load-demo\.ts$/.test(process.argv[1] ?? "")) {
  loadDemo().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
