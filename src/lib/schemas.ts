import { z } from "zod";

export const sourceFields = {
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().max(500).regex(/^https?:\/\//, "URL must start with http:// or https://").nullable().optional(),
  kind: z.enum(["official", "news", "wiki", "forum", "internal"]),
  trustScore: z.number().min(0).max(1),
};
