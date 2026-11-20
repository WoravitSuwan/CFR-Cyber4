import { fail, json, parseId, route } from "@/lib/api";
import { deleteCases, getCase, updateCase } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const id = parseId((await params).id);
  if (!id) return fail("รหัสคดีไม่ถูกต้อง");
  const c = await getCase(id);
  return c ? json({ case: c }) : fail("ไม่พบคดี", 404);
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const id = parseId((await params).id);
  if (!id) return fail("รหัสคดีไม่ถูกต้อง");
  const body = (await req.json().catch(() => ({}))) as { case_no?: string; title?: string | null; note?: string | null };
  if (body.case_no !== undefined && !String(body.case_no).trim()) return fail("เลขคดีห้ามว่าง");
  const ok = await updateCase(id, {
    case_no: body.case_no === undefined ? undefined : String(body.case_no).slice(0, 200),
    title: body.title === undefined ? undefined : body.title === null ? null : String(body.title).slice(0, 500),
    note: body.note === undefined ? undefined : body.note === null ? null : String(body.note).slice(0, 5000),
  });
  return ok ? json({ case: await getCase(id) }) : fail("ไม่พบคดี", 404);
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const id = parseId((await params).id);
  if (!id) return fail("รหัสคดีไม่ถูกต้อง");
  return json({ deleted: await deleteCases([id]) });
});
