import { requireApi } from "@/lib/auth";
import { route } from "@/lib/http";
import { listUsers } from "@/lib/queries";

export const GET = route(async () => {
  await requireApi(["admin"]);
  return Response.json(await listUsers());
});
