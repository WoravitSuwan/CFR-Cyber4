import { fail, json, route } from "@/lib/api";
import { finishFile, insertRows, startImport } from "@/lib/repo";
import type { ImportMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * นำเข้าข้อมูลเป็นชุด (เพื่อไม่ให้เกินขนาด request 4.5MB ของ Vercel)
 * 1) { action: "start", caseNo, title?, mode, fileName } → { caseId, fileId }
 * 2) { action: "rows", caseId, fileId, rows: [...] }     → { inserted, duplicates }
 * 3) { action: "finish", caseId, fileId }                → { removed } (ลบประวัติไฟล์ถ้าซ้ำทั้งหมด)
 */
export const POST = route(async (req: Request) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail("ข้อมูลไม่ถูกต้อง");
  if (body.action === "start") {
    const mode = (["append", "replace", "new"].includes(body.mode as string) ? body.mode : "append") as ImportMode;
    const res = await startImport({
      caseNo: String(body.caseNo ?? ""),
      title: body.title ? String(body.title) : null,
      mode,
      fileName: String(body.fileName ?? "unknown"),
    });
    return json(res);
  }
  if (body.action === "rows") {
    const caseId = Number(body.caseId);
    const fileId = Number(body.fileId);
    if (!Number.isSafeInteger(caseId) || !Number.isSafeInteger(fileId)) return fail("caseId/fileId ไม่ถูกต้อง");
    if (!Array.isArray(body.rows)) return fail("rows ต้องเป็น array");
    if (body.rows.length > 5000) return fail("ส่งได้ไม่เกิน 5,000 แถวต่อครั้ง");
    return json(await insertRows(caseId, fileId, body.rows as Record<string, unknown>[]));
  }
  if (body.action === "finish") {
    const caseId = Number(body.caseId);
    const fileId = Number(body.fileId);
    if (!Number.isSafeInteger(caseId) || !Number.isSafeInteger(fileId)) return fail("caseId/fileId ไม่ถูกต้อง");
    return json(await finishFile(caseId, fileId));
  }
  return fail("action ไม่ถูกต้อง");
});
