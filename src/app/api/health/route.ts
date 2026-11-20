import { json, route } from "@/lib/api";
import { databaseUrl, db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  if (!databaseUrl()) return json({ ok: false, db: "not_configured" }, { status: 503 });
  const sql = await db();
  const [r] = await sql`SELECT version() AS version`;
  return json({ ok: true, db: "connected", version: String(r.version).split(" ").slice(0, 2).join(" ") });
});
