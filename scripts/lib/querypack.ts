export interface QueryBlock {
  name: string;
  shows: string;
  sql: string;
}

/** Split db/queries.sql into blocks headed by "-- name:" and "-- shows:". */
export function parseQueryPack(text: string): QueryBlock[] {
  return text
    .split(/^-- name: /m)
    .slice(1)
    .map((chunk) => {
      const [first, ...rest] = chunk.split("\n");
      const lines = rest.filter((l) => l.trim() !== "");
      const shows = (lines.find((l) => l.startsWith("-- shows:")) ?? "").replace("-- shows:", "").trim();
      const sql = lines.filter((l) => !l.startsWith("--")).join("\n").trim();
      return { name: first.trim(), shows, sql };
    });
}
