import { z } from "zod";

// Empty strings in .env mean "unset".
const blank = (v: unknown) => (v === "" ? undefined : v);

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ANTHROPIC_API_KEY: z.preprocess(blank, z.string().optional()),
  CLAUDE_FAST_MODEL: z.preprocess(blank, z.string().default("claude-haiku-5-5")),
  CLAUDE_ANSWER_MODEL: z.preprocess(blank, z.string().default("claude-sonnet-5-5")),
  // auto: Anthropic when a key is set, otherwise the offline heuristics.
  LLM_PROVIDER: z.preprocess(blank, z.enum(["auto", "anthropic", "offline"]).default("auto")),
  // local: MiniLM via transformers.js. hash: deterministic bag-of-words vectors (tests, no download).
  EMBEDDING_PROVIDER: z.preprocess(blank, z.enum(["local", "hash"]).default("local")),
  RETRIEVAL_K: z.preprocess(blank, z.coerce.number().int().min(2).max(50).default(8)),
  MIN_SIMILARITY: z.preprocess(blank, z.coerce.number().min(0).max(1).default(0.35)),
  // A conflict is reported only if at least one side is this close to the question.
  CONFLICT_MIN_SIMILARITY: z.preprocess(blank, z.coerce.number().min(0).max(1).default(0.5)),
  CANDIDATE_MIN_SIMILARITY: z.preprocess(blank, z.coerce.number().min(0).max(1).default(0.6)),
  CANDIDATES_PER_CLAIM: z.preprocess(blank, z.coerce.number().int().min(1).max(20).default(5)),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment: ${msg}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Test hook: forget the parsed environment. */
export function resetEnvCache() {
  cached = undefined;
}
