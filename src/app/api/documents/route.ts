import { requireApi } from "@/lib/auth";
import { route } from "@/lib/http";
import { listDocuments } from "@/lib/queries";

export const GET = route(async (req: Request) => {
  await requireApi();
  const q = new URL(req.url).searchParams.get("q") ?? undefined;
  return Response.json(await listDocuments(q));
});
