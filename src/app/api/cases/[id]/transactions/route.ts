import { fail, json, parseId, route } from "@/lib/api";
import { getTransactions } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** ดึงธุรกรรมแบบแบ่งหน้า ?offset=0&limit=5000 */
export const GET = route<Ctx>(async (req, { params }) => {
  const id = parseId((await params).id);
  if (!id) return fail("รหัสคดีไม่ถูกต้อง");
  const sp = new URL(req.url).searchParams;
  const offset = Number(sp.get("offset") ?? 0) || 0;
  const limit = Number(sp.get("limit") ?? 5000) || 5000;
  const rows = await getTransactions(id, offset, limit);
  return json({ rows, offset, limit, hasMore: rows.length === Math.min(limit, 10000) });
});
