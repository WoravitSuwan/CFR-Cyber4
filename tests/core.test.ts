import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { analyzeFlow, maskAccount } from "../src/lib/flow";
import { buildWorkbook } from "../src/lib/export/excel";
import { buildFileName, DEFAULT_EXPORT_OPTIONS, TEMPLATES } from "../src/lib/export/options";
import { detectHeaderRow, extractCaseNo, normalizeDate, normalizeRow, normalizeTime } from "../src/lib/normalize";
import { SCHEMA_SQL } from "../src/lib/schema";
import { CFR_FIELDS, type Tx } from "../src/lib/types";

let nextId = 1;
function tx(p: Partial<Tx>): Tx {
  const base = Object.fromEntries(CFR_FIELDS.map((f) => [f, null])) as unknown as Tx;
  return { ...base, id: nextId++, ...p };
}

const A = { from_bank_short_name: "GSB", from_account_no: "203000123450" };
const acct = (bank: string, no: string, side: "from" | "to") =>
  side === "from" ? { from_bank_short_name: bank, from_account_no: no } : { to_bank_short_name: bank, to_account_no: no };

/** ข้อมูลจำลองที่ให้ผลลัพธ์ตรงกับไฟล์ตัวอย่าง 3.case_150225671.xlsx */
function sampleCase(): Tx[] {
  nextId = 1;
  const B = "4390712341"; // SCB
  const C = "9808312340"; // BBL
  const D = "1772612342"; // KBNK
  const E = "5527412344"; // BBL
  const F = "1000012348"; // KKP
  const G = "2023812349"; // KKP
  const H = "1771812344"; // KBNK
  const I = "9808312343"; // BBL
  const d = "2024-02-15";
  return [
    tx({ ...A, ...acct("SCB", B, "to"), transfer_date: d, transfer_time: "09:35:00", transfer_amount: 800 }),
    tx({ ...acct("SCB", B, "from"), ...acct("BBL", C, "to"), transfer_date: d, transfer_time: "09:36:00", transfer_amount: 31000 }),
    tx({ ...acct("BBL", C, "from"), ...acct("KBNK", D, "to"), transfer_date: d, transfer_time: "09:39:00", transfer_amount: 113000 }),
    tx({ ...acct("KBNK", D, "from"), ...acct("BBL", E, "to"), transfer_date: d, transfer_time: "09:42:00", transfer_amount: 112000 }),
    tx({ ...acct("BBL", E, "from"), ...acct("KKP", F, "to"), transfer_date: d, transfer_time: "09:42:00", transfer_amount: 112000 }),
    tx({ ...A, ...acct("SCB", B, "to"), transfer_date: d, transfer_time: "10:20:00", transfer_amount: 2400 }),
    tx({ ...acct("SCB", B, "from"), ...acct("BBL", C, "to"), transfer_date: d, transfer_time: "10:21:00", transfer_amount: 2400 }),
    tx({ ...A, ...acct("SCB", B, "to"), transfer_date: d, transfer_time: "11:39:00", transfer_amount: 14400 }),
    tx({ ...acct("SCB", B, "from"), ...acct("BBL", C, "to"), transfer_date: d, transfer_time: "11:40:00", transfer_amount: 14600 }),
    tx({ ...A, ...acct("KKP", G, "to"), transfer_date: d, transfer_time: "14:44:00", transfer_amount: 43200 }),
    tx({ ...acct("KKP", G, "from"), ...acct("KBNK", H, "to"), transfer_date: d, transfer_time: "14:45:00", transfer_amount: 43200 }),
    tx({ ...acct("KBNK", H, "from"), ...acct("BBL", I, "to"), transfer_date: d, transfer_time: "14:49:00", transfer_amount: 63000 }),
  ];
}

test("maskAccount ตรงกับรูปแบบไฟล์ตัวอย่าง", () => {
  assert.equal(maskAccount("4390712341"), "43907xxxx1");
  assert.equal(maskAccount("203000123450"), "203000xxxx0");
  assert.equal(maskAccount("4390712341", false), "4390712341");
});

test("normalize วันที่ พ.ศ./ค.ศ. และเวลา", () => {
  assert.equal(normalizeDate("2567-02-27"), "2024-02-27");
  assert.equal(normalizeDate("27/02/2567"), "2024-02-27");
  assert.equal(normalizeDate("2024-02-27"), "2024-02-27");
  assert.equal(normalizeDate(new Date(Date.UTC(2567, 1, 15))), "2024-02-15");
  assert.equal(normalizeDate(45337), "2024-02-15");
  assert.equal(normalizeTime("9:35"), "09:35:00");
  assert.equal(normalizeTime(0.3993055555), "09:35:00");
  assert.equal(normalizeTime(new Date(Date.UTC(1899, 11, 30, 14, 44))), "14:44:00");
});

test("normalizeRow อ่านแถวข้อมูลดิบ CFR", () => {
  const header = detectHeaderRow([[...CFR_FIELDS]]);
  assert.ok(header);
  const cells = CFR_FIELDS.map((f) =>
    ({
      from_bank_code: "14",
      from_account_no: 8162345213,
      to_account_no: "0057014824",
      to_id: 3230400206644,
      first_name: "สมชาย",
      last_name: "ใจดี",
      transfer_date: "2567-02-27",
      timestamp_insert: "2567-02-28 14:52:02",
      transfer_amount: "48,000.50",
    })[f as string] ?? null,
  );
  const r = normalizeRow(cells as never, header!.map)!;
  assert.equal(r.from_bank_code, "014");
  assert.equal(r.from_account_no, "8162345213");
  assert.equal(r.to_account_no, "0057014824");
  assert.equal(r.to_id, "3230400206644");
  assert.equal(r.to_account_name, "สมชาย ใจดี");
  assert.equal(r.transfer_date, "2024-02-27");
  assert.equal(r.timestamp_insert, "2024-02-28 14:52:02");
  assert.equal(r.transfer_amount, 48000.5);
});

test("extractCaseNo จากชื่อไฟล์และโฟลเดอร์", () => {
  assert.equal(extractCaseNo("3.case_150225671.xlsx"), "150225671");
  assert.equal(extractCaseNo("batch.zip/คดี 66012345/raw.xlsx"), "66012345");
  assert.equal(extractCaseNo("ข้อมูลดิบ_150225671.xlsx"), "150225671");
  assert.equal(extractCaseNo("data.xlsx"), null);
});

test("analyzeFlow สร้างเส้นทางเหมือนไฟล์ 3.case", () => {
  const flow = analyzeFlow(sampleCase());
  assert.equal(flow.roots.length, 1);
  assert.equal(flow.chains.length, 4);
  const amounts = flow.chains.map((c) => c.hops.map((h) => h.transfer_amount));
  assert.deepEqual(amounts, [[800, 31000, 113000, 112000, 112000], [2400, 2400], [14400, 14600], [43200, 43200, 63000]]);
  assert.equal(flow.depth, 6);
});

test("buildWorkbook รูปแบบ 3.case เขียนเซลล์ตรงตามตัวอย่าง", async () => {
  const buf = await buildWorkbook({ caseNo: "150225671", txs: sampleCase() }, DEFAULT_EXPORT_OPTIONS);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  assert.equal(ws.getCell("D1").value, "case 150225671");
  const header = Array.from({ length: 27 }, (_, i) => ws.getCell(3, i + 1).value);
  assert.deepEqual(header.slice(0, 7), ["Bank", "on Bank", "transfer_date", "transfer_time", "transfer_amount", "Bank(1)", "on Bank(1)"]);
  assert.equal(header[25], "Bank(5)");
  assert.equal(header[26], "on Bank(5)");
  assert.equal(ws.getCell("A4").value, "GSB");
  assert.equal(ws.getCell("B4").value, "203000xxxx0");
  const d = ws.getCell("C4").value as Date;
  assert.equal(d.getUTCFullYear(), 2567);
  assert.equal(ws.getCell("E4").value, 800);
  assert.equal(ws.getCell("G4").value, "43907xxxx1");
  assert.equal(ws.getCell("AA4").value, "10000xxxx8");
  assert.equal(ws.getCell("L5").value, "98083xxxx0");
  assert.equal(ws.getCell("M5").value, null);
  assert.equal(ws.getCell("Q7").value, "98083xxxx3");
  assert.equal((ws.getCell("A3").fill as ExcelJS.FillPattern).fgColor?.argb, "FFC0E6F5");
});

test("ทุกรูปแบบสร้างไฟล์ได้", async () => {
  for (const t of TEMPLATES) {
    const buf = await buildWorkbook({ caseNo: "X1", title: "ทดสอบ", txs: sampleCase() }, { ...DEFAULT_EXPORT_OPTIONS, template: t.id });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    assert.equal(wb.worksheets.length, t.sheets.length, t.id);
  }
});

test("buildFileName", () => {
  assert.equal(buildFileName("3.case_{case}", { caseNo: "150225671", index: 1, template: "case-flow" }), "3.case_150225671.xlsx");
  assert.equal(buildFileName("{index}_{case}/{template}", { caseNo: "9", index: 2, template: "accounts" }), "2_9_บัญชี.xlsx");
});

test("schema.ts ตรงกับ db/schema.sql", () => {
  assert.equal(SCHEMA_SQL, readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
});

test("pgConnection เปิด SSL สำหรับ Neon และตัดพารามิเตอร์ที่ไม่รองรับ", async () => {
  const { pgConnection } = await import("../src/lib/pg-options");
  const neon = pgConnection("postgresql://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require");
  assert.equal(neon.ssl, "require");
  assert.equal(neon.url, "postgresql://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb");
  assert.equal(pgConnection("postgres://u:p@db.example.com/x").ssl, "require");
  assert.equal(pgConnection("postgres://u:p@localhost:5432/x").ssl, false);
  assert.equal(pgConnection("postgres://u:p@db.example.com/x?sslmode=disable").ssl, false);
});
