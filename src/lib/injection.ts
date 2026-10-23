// Documents are untrusted input that ends up inside LLM prompts. Refuse the obvious
// instruction-injection phrasings at ingest; the prompts also fence claims as data.
const PATTERNS: RegExp[] = [
  /ignore (all |any )?(the )?(previous|prior|above|earlier) (instructions|prompts?|rules)/i,
  /disregard (all |any )?(the )?(previous|prior|above|earlier) (instructions|prompts?|rules)/i,
  /(reveal|print|show|repeat) (your |the )?(system|hidden) prompt/i,
  /you are now (in )?(developer|dan|jailbreak)/i,
  /<\/?(system|assistant|claim|evidence)>/i,
];

export function findInjection(text: string): string | null {
  for (const p of PATTERNS) {
    const m = p.exec(text);
    if (m) return m[0];
  }
  return null;
}
