import { fail, json, route } from "@/lib/api";
import { deleteCases, listCases } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const q = new URL(req.url).searchParams.get("q") ?? undefined;
  return json({ cases: await listCases(q) });
});

/** ลบหลายคดี: { ids: number[] } */
export const DELETE = route(async (req: Request) => {
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body!.ids.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0) : [];
  if (!ids.length) return fail("ไม่ได้ระบุคดีที่ต้องการลบ");
  return json({ deleted: await deleteCases(ids) });
});
