import { requireApi } from "@/lib/auth";
import { route } from "@/lib/http";
import { listAudit } from "@/lib/queries";

export const GET = route(async (req: Request) => {
  await requireApi(["admin"]);
  const table = new URL(req.url).searchParams.get("table") ?? undefined;
  return Response.json(await listAudit(200, table));
});
