import { requireApi } from "@/lib/auth";
import { route } from "@/lib/http";
import { dashboardStats } from "@/lib/queries";

export const GET = route(async () => {
  await requireApi();
  return Response.json(await dashboardStats());
});
