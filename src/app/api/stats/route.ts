import { json, route } from "@/lib/api";
import { getStats } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => json(await getStats()));
