import { fail, json, parseId, route } from "@/lib/api";
import { deleteTemplate, getTemplate, updateTemplate } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** คืนข้อมูลรูปแบบพร้อมไฟล์ตัวอย่าง (base64) สำหรับสร้างไฟล์บนเบราว์เซอร์ */
export const GET = route<Ctx>(async (_req, { params }) => {
  const id = parseId((await params).id);
  if (!id) return fail("รหัสไม่ถูกต้อง");
  const t = await getTemplate(id);
  if (!t) return fail("ไม่พบรูปแบบ", 404);
  const { file_data, ...rest } = t;
  return json({ template: rest, fileBase64: Buffer.from(file_data).toString("base64") });
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const id = parseId((await params).id);
  if (!id) return fail("รหัสไม่ถูกต้อง");
  const body = (await req.json().catch(() => ({}))) as { name?: string; spec?: unknown };
  const t = await updateTemplate(id, {
    name: body.name !== undefined ? String(body.name).trim().slice(0, 200) || undefined : undefined,
    spec: body.spec,
  });
  return t ? json({ template: t }) : fail("ไม่พบรูปแบบ", 404);
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const id = parseId((await params).id);
  if (!id) return fail("รหัสไม่ถูกต้อง");
  return (await deleteTemplate(id)) ? json({ ok: true }) : fail("ไม่พบรูปแบบ", 404);
});
