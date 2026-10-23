// Abbreviations whose full stop does not end a sentence ("Rs. 500", "Dr. Rao").
const ABBREV = /\b(Rs|Dr|Mr|Mrs|Ms|Prof|Nos?|vs|St|approx)\./g;
const DOT = "\u0001";

/**
 * Split prose into sentences. A boundary is .!? followed by whitespace and an
 * uppercase letter, digit or opening quote (optionally after a bullet mark).
 */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(ABBREV, (_, a) => a + DOT)
    .split(/(?<=[.!?])\s+(?=[-*•]?\s*[A-Z0-9"'(])/)
    .map((s) => s.replaceAll(DOT, ".").trim())
    .filter(Boolean);
}

/**
 * Greedy chunker: paragraphs are packed up to maxChars; a paragraph longer than
 * that is packed sentence by sentence. Chunks never split a sentence.
 */
export function chunkText(body: string, maxChars = 700): string[] {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const units = paragraphs.flatMap((p) => (p.length > maxChars ? splitSentences(p) : [p]));
  const chunks: string[] = [];
  let cur = "";
  for (const u of units) {
    if (cur && cur.length + 1 + u.length > maxChars) {
      chunks.push(cur);
      cur = u;
    } else {
      cur = cur ? cur + " " + u : u;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
