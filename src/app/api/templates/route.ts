import { fail, json, route } from "@/lib/api";
import { createTemplate, listTemplates } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024;

export const GET = route(async () => json({ templates: await listTemplates() }));

/** บันทึกรูปแบบใหม่: { name, summary, spec, fileName, fileBase64 } (ผลวิเคราะห์ทำบนเบราว์เซอร์) */
export const POST = route(async (req: Request) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail("ข้อมูลไม่ถูกต้อง");
  const name = String(body.name ?? "").trim().slice(0, 200);
  if (!name) return fail("กรุณาตั้งชื่อรูปแบบ");
  const spec = body.spec as { mode?: string } | undefined;
  if (!spec || typeof spec !== "object" || (spec.mode !== "flow" && spec.mode !== "table")) return fail("ผลวิเคราะห์รูปแบบไม่ถูกต้อง");
  if (typeof body.fileBase64 !== "string") return fail("ไม่พบไฟล์ตัวอย่าง");
  const file = Buffer.from(body.fileBase64, "base64");
  if (!file.length || file.length > MAX_BYTES) return fail("ไฟล์ตัวอย่างต้องมีขนาดไม่เกิน 3 MB");
  if (file.subarray(0, 2).toString("latin1") !== "PK") return fail("ไฟล์ตัวอย่างต้องเป็น .xlsx");
  const t = await createTemplate({
    name,
    summary: body.summary ? String(body.summary).slice(0, 500) : null,
    spec,
    fileName: body.fileName ? String(body.fileName).slice(0, 300) : null,
    file,
  });
  return json({ template: t });
});
