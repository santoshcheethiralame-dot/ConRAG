import { IngestForm } from "@/components/IngestForm";
import { Empty, PageHeader } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { rows } from "@/lib/db";

export const metadata = { title: "Ingest · ConRAG" };

export default async function IngestPage() {
  await requirePage(["admin", "analyst"]);
  const sources = await rows<{ id: number; name: string }>("SELECT id, name FROM sources ORDER BY name");
  return (
    <>
      <PageHeader title="Ingest a document" subtitle="New claims are compared with everything already in the knowledge base." />
      {sources.length === 0 ? <Empty>Create a source first (Sources page, admin only).</Empty> : <IngestForm sources={sources} />}
    </>
  );
}
