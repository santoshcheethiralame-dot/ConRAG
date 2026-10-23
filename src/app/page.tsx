export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-24">
      <h1 className="text-3xl font-semibold">ConRAG</h1>
      <p className="mt-3 text-neutral-600">
        Contradiction-aware retrieval-augmented generation. Ask a question; see the answer, the
        evidence behind it, and the sources that disagree.
      </p>
    </main>
  );
}
