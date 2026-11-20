import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { analyzeTemplate, buildCustomWorkbook } from "../src/lib/export/custom";
import { accountMerges } from "../src/lib/export/grid";
import { DEFAULT_EXPORT_OPTIONS } from "../src/lib/export/options";
import { analyzeFlow } from "../src/lib/flow";
import { CFR_FIELDS, type Tx } from "../src/lib/types";

let nextId = 1;
const tx = (fb: string, fa: string, tb: string, ta: string, time: string, amt: number): Tx => ({
  ...(Object.fromEntries(CFR_FIELDS.map((f) => [f, null])) as unknown as Tx),
  id: nextId++,
  from_bank_short_name: fb,
  from_account_no: fa,
  to_bank_short_name: tb,
  to_account_no: ta,
  transfer_date: "2024-02-15",
  transfer_time: time,
  transfer_amount: amt,
});

function sample(): Tx[] {
  nextId = 1;
  const A = "203000123450", B = "4390712341", C = "9808312340", G = "2023812349", H = "1771812344";
  return [
    tx("GSB", A, "SCB", B, "09:35:00", 800),
    tx("SCB", B, "BBL", C, "09:36:00", 31000),
    tx("GSB", A, "SCB", B, "10:20:00", 2400),
    tx("SCB", B, "BBL", C, "10:21:00", 2400),
    tx("GSB", A, "KKP", G, "14:44:00", 43200),
    tx("KKP", G, "KBNK", H, "14:45:00", 43200),
    tx("KBNK", H, "TTB", "1112223334", "14:50:00", 43000),
    tx("TTB", "1112223334", "GHB", "5556667778", "14:55:00", 42000),
  ];
}

/** ไฟล์ตัวอย่างแบบ 3.case 2 ชั้น พร้อมเซลล์รวมและหัวรายงาน */
async function flowTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.mergeCells("D1:I1");
  ws.getCell("D1").value = "case 150225671";
  ["Bank", "on Bank", "transfer_date", "transfer_time", "transfer_amount", "Bank(1)", "on Bank(1)"].forEach((h, i) => {
    const c = ws.getCell(3, i + 1);
    c.value = h;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i < 2 ? "FFC0E6F5" : i > 4 ? "FFFBE2D5" : "FFFFFFFF" } };
  });
  ws.getCell("A4").value = "GSB";
  ws.getCell("C4").value = new Date(Date.UTC(2567, 1, 15));
  ws.getCell("C4").numFmt = "dd/mm/yyyy";
  ws.getCell("E4").numFmt = "#,##0.00";
  ws.getCell("G4").value = "x";
  ws.getCell("A5").value = "GSB";
  ws.mergeCells("A4:A5");
  wb.addWorksheet("ข้อมูลอื่น").getCell("A1").value = "ข้อมูลตัวอย่างที่ไม่ควรติดไป";
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

test("accountMerges รวมแถวที่มีเส้นทางบัญชีเดียวกัน", () => {
  const flow = analyzeFlow(sample());
  const m = accountMerges(flow.chains);
  assert.deepEqual(m.get(0), [{ r1: 0, r2: 2 }]);
  assert.deepEqual(m.get(1), [{ r1: 0, r2: 1 }]);
  assert.deepEqual(m.get(2), [{ r1: 0, r2: 1 }]);
  assert.equal(m.get(3), undefined);
});

test("analyzeTemplate ตรวจพบรูปแบบเส้นทางเงินและการรวมเซลล์", async () => {
  const a = await analyzeTemplate(await flowTemplate());
  assert.equal(a.spec.mode, "flow");
  if (a.spec.mode !== "flow") return;
  assert.equal(a.spec.headerRow, 3);
  assert.deepEqual(a.spec.acctKinds, ["bank", "account"]);
  assert.deepEqual(a.spec.txKinds, ["date", "time", "amount"]);
  assert.equal(a.spec.levels, 2);
  assert.equal(a.spec.mergeRepeated, true);
  assert.deepEqual(a.title, ["case 150225671"]);
});

test("buildCustomWorkbook ใช้สไตล์จากไฟล์ตัวอย่างและขยายชั้นอัตโนมัติ", async () => {
  const tpl = await flowTemplate();
  const a = await analyzeTemplate(tpl);
  const out = await buildCustomWorkbook(tpl, a.spec, { caseNo: "999888777", txs: sample() }, { ...DEFAULT_EXPORT_OPTIONS, mergeRepeated: true });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Sheet1"]);
  const ws = wb.worksheets[0];
  assert.equal(ws.getCell("D1").value, "case 999888777");
  // 4 ทอด → 5 ชั้น → Bank(4) อยู่คอลัมน์ U
  assert.equal(ws.getCell("K3").value, "Bank(2)");
  assert.equal(ws.getCell("U3").value, "Bank(4)");
  assert.equal(ws.getCell("Z3").value, null);
  assert.equal(ws.getCell("A4").value, "GSB");
  assert.equal(ws.getCell("B4").value, "203000xxxx0");
  assert.equal(ws.getCell("C4").numFmt, "dd/mm/yyyy");
  assert.equal(ws.getCell("E4").numFmt, "#,##0.00");
  assert.equal(ws.getCell("E4").value, 800);
  // ชั้นที่ 2 วนใช้สีของชั้น 0, ชั้นที่ 3 ใช้สีของชั้น 1
  assert.equal((ws.getCell("K3").fill as ExcelJS.FillPattern).fgColor?.argb, "FFC0E6F5");
  assert.equal((ws.getCell("P3").fill as ExcelJS.FillPattern).fgColor?.argb, "FFFBE2D5");
  const merges = ws.model.merges.sort();
  assert.ok(merges.includes("A4:A6") && merges.includes("B4:B6") && merges.includes("F4:F5") && merges.includes("D1:I1"), merges.join(","));
  assert.ok(!merges.includes("A4:A5"));
});

test("analyzeTemplate รูปแบบตารางธุรกรรม", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("รายการ");
  ws.getCell("A1").value = "รายงานคดี {case}";
  ["ลำดับ", "วันที่โอน", "บัญชีต้นทาง", "บัญชีปลายทาง", "จำนวนเงิน", "หมายเหตุ"].forEach((h, i) => (ws.getCell(2, i + 1).value = h));
  const tpl = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const a = await analyzeTemplate(tpl);
  assert.equal(a.spec.mode, "table");
  const out = await buildCustomWorkbook(tpl, a.spec, { caseNo: "123456789", txs: sample() }, DEFAULT_EXPORT_OPTIONS);
  const r = new ExcelJS.Workbook();
  await r.xlsx.load(out);
  const s = r.worksheets[0];
  assert.equal(s.getCell("A1").value, "รายงานคดี 123456789");
  assert.equal(s.getCell("A3").value, 1);
  assert.equal(s.getCell("C3").value, "203000xxxx0");
  assert.equal(s.getCell("E3").value, 800);
  assert.equal(s.getCell("F3").value, null);
  assert.equal(s.rowCount, 2 + 8);
});
