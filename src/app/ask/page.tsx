import { AskPanel } from "@/components/AskPanel";
import { PageHeader } from "@/components/ui";
import { requirePage } from "@/lib/auth";

export const metadata = { title: "Ask · ConRAG" };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requirePage();
  const { q } = await searchParams;
  return (
    <>
      <PageHeader
        title="Ask"
        subtitle="Answers cite the evidence. When sources disagree you see both sides and which one the evidence favours."
      />
      <AskPanel initial={q ?? ""} canSeeAdminLinks={s.role === "admin"} />
    </>
  );
}
