import { fail, json, parseId, route } from "@/lib/api";
import { deleteFile } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

/** ลบไฟล์ที่นำเข้า (และธุรกรรมของไฟล์นั้น) ออกจากคดี */
export const DELETE = route<Ctx>(async (_req, { params }) => {
  const p = await params;
  const id = parseId(p.id);
  const fileId = parseId(p.fileId);
  if (!id || !fileId) return fail("รหัสไม่ถูกต้อง");
  return (await deleteFile(id, fileId)) ? json({ ok: true }) : fail("ไม่พบไฟล์", 404);
});
