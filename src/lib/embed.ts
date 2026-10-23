import { createHash } from "node:crypto";
import { env } from "./env";

export const EMBEDDING_DIM = 384;

const STOP = new Set(
  "a an the of to in on at for and or is are was were be been by with as it its this that from".split(" "),
);

/**
 * Deterministic feature-hashing embedding: unigrams and bigrams hashed into 384 buckets,
 * L2-normalised. Lexical only, but needs no model download. Used by tests and as an
 * explicit offline mode (EMBEDDING_PROVIDER=hash).
 */
export function hashEmbed(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9]+(?:\.[0-9]+)?%?/g) ?? [];
  const content = words.filter((w) => !STOP.has(w));
  const feats = [...content, ...content.slice(1).map((w, i) => content[i] + "_" + w)];
  for (const f of feats) {
    const h = createHash("md5").update(f).digest();
    const idx = h.readUInt16BE(0) % EMBEDDING_DIM;
    v[idx] += h[2] & 1 ? 1 : -1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

type Extractor = (texts: string[], opts: object) => Promise<{ tolist(): number[][] }>;
const g = globalThis as unknown as { miniLm?: Promise<Extractor> };

function loadMiniLm(): Promise<Extractor> {
  g.miniLm ??= import("@huggingface/transformers").then(
    (m) => m.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "fp32" }) as unknown as Promise<Extractor>,
  );
  return g.miniLm;
}

/** Unit-length 384-d vectors, so cosine similarity equals the dot product. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (env().EMBEDDING_PROVIDER === "hash") return texts.map(hashEmbed);
  const extract = await loadMiniLm();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 16) {
    const res = await extract(texts.slice(i, i + 16), { pooling: "mean", normalize: true });
    out.push(...res.tolist());
  }
  return out;
}
