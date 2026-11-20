import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { parseCsv, parseUploads } from "../src/lib/import/parse";
import { CFR_FIELDS } from "../src/lib/types";

/** สร้างไฟล์ xlsx ข้อมูลดิบจำลองตามรูปแบบ CFR */
async function rawXlsx(rows: Record<string, unknown>[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Worksheet");
  ws.addRow([...CFR_FIELDS]);
  for (const r of rows) ws.addRow(CFR_FIELDS.map((f) => r[f] ?? null));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const row = (from: string, to: string, amount: number) => ({
  response_id: 1,
  bank_case_id: "25670227SCB00001",
  from_bank_code: "014",
  from_bank_short_name: "SCB",
  from_account_no: from,
  to_bank_code: "025",
  to_bank_short_name: "BAY",
  to_account_no: to,
  transfer_date: "2567-02-27",
  transfer_amount: amount,
});

test("parseCsv รองรับเครื่องหมายคำพูดและขึ้นบรรทัดใหม่", () => {
  assert.deepEqual(parseCsv('a,b\n"1,000","x ""y"""\r\n'), [
    ["a", "b"],
    ["1,000", 'x "y"'],
  ]);
});

test("parseUploads อ่าน ZIP ซ้อนหลายไฟล์และดึงเลขคดีจากโฟลเดอร์", async () => {
  const inner = new JSZip();
  inner.file("case_150225672/raw.xlsx", await rawXlsx([row("1111111111", "2222222222", 500)]));
  const outer = new JSZip();
  outer.file("case_150225671/a.xlsx", await rawXlsx([row("1111111111", "2222222222", 100), row("1111111111", "2222222222", 100)]));
  outer.file("nested.zip", await inner.generateAsync({ type: "uint8array" }));
  outer.file("case_150225673.csv", `${CFR_FIELDS.join(",")}\n${CFR_FIELDS.map((f) => (f === "from_account_no" ? "123" : f === "to_account_no" ? "456" : f === "transfer_amount" ? "1,500" : "")).map((v) => `"${v}"`).join(",")}\n`);
  outer.file("__MACOSX/._junk.xlsx", "junk");
  outer.file("readme.pdf", "x");
  const buf = await outer.generateAsync({ type: "arraybuffer" });
  const files = await parseUploads([new File([buf], "batch.zip")]);
  const byCase = Object.fromEntries(files.map((f) => [f.caseNo, f]));
  assert.equal(files.length, 3);
  assert.equal(byCase["150225671"].rows.length, 2);
  assert.notEqual(byCase["150225671"].rows[0].row_hash, byCase["150225671"].rows[1].row_hash, "แถวซ้ำต้องได้ hash ต่างกัน");
  assert.equal(byCase["150225671"].rows[0].transfer_date, "2024-02-27");
  assert.equal(byCase["150225672"].rows[0].transfer_amount, 500);
  assert.equal(byCase["150225673"].rows[0].transfer_amount, 1500);
  assert.ok(files.every((f) => !f.error));
});

test("parseUploads แจ้งเตือนไฟล์ที่ไม่รองรับ", async () => {
  const [f] = await parseUploads([new File([new Uint8Array([1, 2])], "old.xls")]);
  assert.match(f.error ?? "", /\.xls/);
});
