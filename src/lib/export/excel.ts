import ExcelJS from "exceljs";
import { bankShort } from "../banks";
import { analyzeFlow, maskAccount, sortTx, type FlowResult } from "../flow";
import { CFR_FIELDS, DATE_FIELDS, type Tx } from "../types";
import { buildCaseGrid, levelFill, levelStrong, type GridKind } from "./grid";
import type { Era, ExportOptions } from "./options";

export interface ExportCase {
  caseNo: string;
  title?: string | null;
  txs: Tx[];
}

const FONT = "Tahoma";
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};
const HAIR = { style: "thin" as const, color: { argb: "FFD0D5DD" } };
const SOFT: Partial<ExcelJS.Borders> = { top: HAIR, left: HAIR, bottom: HAIR, right: HAIR };

const fill = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } });

/** วันที่ 'YYYY-MM-DD' (ค.ศ.) → Date สำหรับ Excel (ปี พ.ศ. ถ้าเลือก BE เหมือนไฟล์ตัวอย่าง) */
function excelDate(ymd: string | null, era: Era): Date | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(era === "BE" ? y + 543 : y, m - 1, d));
}

/** เวลา 'HH:MM:SS' → เศษส่วนของวัน */
function excelTime(hms: string | null): number | null {
  if (!hms) return null;
  const [h, m, s] = hms.split(":").map(Number);
  return (h * 3600 + m * 60 + (s || 0)) / 86400;
}

const textDate = (ymd: string | null, era: Era) => {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-");
  return `${era === "BE" ? Number(y) + 543 : y}-${m}-${d}`;
};

const amountFmt = (v: number | null) => (v !== null && !Number.isInteger(v) ? "#,##0.00" : "#,##0");

function thaiDateTime(d = new Date()) {
  return d.toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" });
}

const ROLE_TH = { source: "บัญชีต้นทาง (ผู้เสียหาย)", mule: "บัญชีทอด", sink: "บัญชีปลายทาง" } as const;

// ---------------------------------------------------------------------------
// 1) เส้นทางเงินแบบ 3.case — ตรงกับไฟล์ตัวอย่าง
// ---------------------------------------------------------------------------
function sheetCaseFlow(wb: ExcelJS.Workbook, c: ExportCase, flow: FlowResult, o: ExportOptions, name = "Sheet1") {
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: true }] });
  const grid = buildCaseGrid(flow, { mask: o.maskAccounts });
  const font = { name: FONT, size: 11 };

  ws.mergeCells("D1:I1");
  const title = ws.getCell("D1");
  title.value = `case ${c.caseNo}`;
  title.font = font;
  title.alignment = { horizontal: "center" };

  const widths: Record<GridKind, number> = {
    bank: 9,
    account: o.maskAccounts ? 12.5 : 15,
    name: 22,
    date: 13.9,
    time: 12.3,
    amount: 15,
  };

  grid.columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = widths[col.kind];
    const cell = ws.getCell(3, i + 1);
    cell.value = col.header;
    cell.font = font;
    cell.border = THIN;
    if (col.kind === "bank" || col.kind === "account") cell.fill = fill(levelFill(col.level));
    if (col.kind === "time") cell.numFmt = "@";
  });

  grid.rows.forEach((row, r) => {
    row.forEach((g, i) => {
      if (!g) return;
      const cell = ws.getCell(4 + r, i + 1);
      cell.font = font;
      cell.border = THIN;
      switch (g.kind) {
        case "bank":
          cell.value = g.value;
          cell.fill = fill(levelFill(g.level));
          break;
        case "account":
          cell.value = g.value;
          cell.numFmt = "@";
          cell.fill = fill(levelFill(g.level));
          break;
        case "date":
          cell.value = excelDate(g.value as string | null, o.era);
          cell.numFmt = "mm-dd-yy";
          break;
        case "time":
          cell.value = excelTime(g.value as string | null);
          cell.numFmt = "h:mm";
          break;
        case "amount":
          cell.value = g.value;
          cell.numFmt = amountFmt(g.value as number | null);
          break;
      }
    });
  });
  return ws;
}

// ---------------------------------------------------------------------------
// 2) เส้นทางเงินแบบละเอียด
// ---------------------------------------------------------------------------
function sheetCaseFlowDetail(wb: ExcelJS.Workbook, c: ExportCase, flow: FlowResult, o: ExportOptions, name = "เส้นทางเงิน") {
  const grid = buildCaseGrid(flow, { mask: o.maskAccounts, withName: true, thai: true });
  const ws = wb.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 5, xSplit: 0, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  const ncol = Math.max(grid.columns.length, 6);
  const total = c.txs.reduce((s, t) => s + (t.transfer_amount ?? 0), 0);

  ws.mergeCells(1, 1, 1, ncol);
  const t1 = ws.getCell(1, 1);
  t1.value = `รายงานเส้นทางการเงิน  คดี ${c.caseNo}${c.title ? `  —  ${c.title}` : ""}`;
  t1.font = { name: FONT, size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  t1.fill = fill("1E293B");
  t1.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, ncol);
  const t2 = ws.getCell(2, 1);
  t2.value = `ธุรกรรม ${c.txs.length.toLocaleString("th-TH")} รายการ  •  บัญชีที่เกี่ยวข้อง ${flow.accounts.size.toLocaleString("th-TH")} บัญชี  •  ${grid.levels - 1} ทอด  •  ยอดโอนรวม ${total.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท  •  ออกรายงาน ${thaiDateTime()}`;
  t2.font = { name: FONT, size: 10, color: { argb: "FF334155" } };
  t2.fill = fill("E2E8F0");
  t2.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(2).height = 22;

  // แถว 4: กลุ่มชั้น, แถว 5: หัวคอลัมน์
  for (let lv = 0; lv < grid.levels; lv++) {
    const cols = grid.columns.map((col, i) => ({ col, i })).filter((x) => x.col.level === lv);
    const a = cols[0].i + 1;
    const b = cols[cols.length - 1].i + 1;
    if (b > a) ws.mergeCells(4, a, 4, b);
    const g = ws.getCell(4, a);
    g.value = lv === 0 ? "บัญชีต้นทาง (ผู้เสียหาย)" : `บัญชีชั้นที่ ${lv}`;
    g.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    g.fill = fill(levelStrong(lv));
    g.alignment = { horizontal: "center", vertical: "middle" };
    g.border = THIN;
  }
  ws.getRow(4).height = 22;

  const widths: Record<GridKind, number> = { bank: 9, account: o.maskAccounts ? 14 : 16, name: 24, date: 12.5, time: 8.5, amount: 14 };
  grid.columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = widths[col.kind];
    const h = ws.getCell(5, i + 1);
    h.value = col.header;
    h.font = { name: FONT, size: 10, bold: true, color: { argb: "FF1E293B" } };
    h.fill = fill(levelFill(col.level));
    h.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    h.border = THIN;
  });
  ws.getRow(5).height = 20;

  grid.rows.forEach((row, r) => {
    const linked = flow.chains[r].linked;
    row.forEach((g, i) => {
      const cell = ws.getCell(6 + r, i + 1);
      cell.border = SOFT;
      cell.font = { name: FONT, size: 10, italic: !linked, color: { argb: linked ? "FF0F172A" : "FF64748B" } };
      if (!g) return;
      if (g.kind === "bank" || g.kind === "account" || g.kind === "name") {
        cell.fill = fill(levelFill(g.level));
        cell.value = g.value;
        if (g.kind === "account") cell.numFmt = "@";
        if (g.kind === "bank") {
          cell.alignment = { horizontal: "center" };
          cell.font = { ...cell.font, bold: true };
        }
      } else if (g.kind === "date") {
        cell.value = excelDate(g.value as string | null, o.era);
        cell.numFmt = "dd/mm/yyyy";
        cell.alignment = { horizontal: "center" };
      } else if (g.kind === "time") {
        cell.value = excelTime(g.value as string | null);
        cell.numFmt = "hh:mm";
        cell.alignment = { horizontal: "center" };
      } else {
        cell.value = g.value;
        cell.numFmt = "#,##0.00";
        cell.font = { ...cell.font, bold: true, color: { argb: "FF0F766E" } };
      }
    });
  });
  const note = ws.getCell(6 + grid.rows.length + 1, 1);
  note.value =
    "หมายเหตุ: แถวตัวเอียงสีเทาคือธุรกรรมที่ไม่สามารถเชื่อมโยงกับบัญชีต้นทางได้โดยตรง แสดงเริ่มที่ชั้นของบัญชีผู้โอน";
  note.font = { name: FONT, size: 9, italic: true, color: { argb: "FF64748B" } };
  return ws;
}

// ---------------------------------------------------------------------------
// ตารางทั่วไปที่มีหัวรายงาน
// ---------------------------------------------------------------------------
interface ColDef {
  header: string;
  width: number;
  fmt?: string;
  align?: "left" | "center" | "right";
  sum?: boolean;
}

function styledTable(
  wb: ExcelJS.Workbook,
  name: string,
  title: string,
  subtitle: string,
  cols: ColDef[],
  rows: (string | number | Date | null)[][],
  accent = "1E3A8A",
) {
  const ws = wb.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  const n = cols.length;
  ws.mergeCells(1, 1, 1, n);
  const t1 = ws.getCell(1, 1);
  t1.value = title;
  t1.font = { name: FONT, size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  t1.fill = fill(accent);
  t1.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, n);
  const t2 = ws.getCell(2, 1);
  t2.value = subtitle;
  t2.font = { name: FONT, size: 10, color: { argb: "FF334155" } };
  t2.fill = fill("E2E8F0");
  t2.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(2).height = 22;

  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
    const h = ws.getCell(4, i + 1);
    h.value = c.header;
    h.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    h.fill = fill("334155");
    h.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    h.border = THIN;
  });
  ws.getRow(4).height = 24;

  rows.forEach((r, ri) => {
    const zebra = ri % 2 === 1;
    r.forEach((v, ci) => {
      const cell = ws.getCell(5 + ri, ci + 1);
      cell.value = v;
      const c = cols[ci];
      cell.font = { name: FONT, size: 10 };
      cell.border = SOFT;
      if (zebra) cell.fill = fill("F8FAFC");
      if (c.fmt) cell.numFmt = c.fmt;
      if (c.align) cell.alignment = { horizontal: c.align };
    });
  });

  if (rows.length && cols.some((c) => c.sum)) {
    const tr = 5 + rows.length;
    const firstSum = cols.findIndex((c) => c.sum);
    if (firstSum > 0) {
      ws.mergeCells(tr, 1, tr, firstSum);
      ws.getCell(tr, 1).value = "รวมทั้งสิ้น";
    }
    cols.forEach((c, ci) => {
      const cell = ws.getCell(tr, ci + 1);
      if (c.sum) {
        const L = ws.getColumn(ci + 1).letter;
        cell.value = { formula: `SUBTOTAL(9,${L}5:${L}${tr - 1})` };
        cell.numFmt = c.fmt ?? "#,##0.00";
      }
      cell.font = { name: FONT, size: 10, bold: true };
      cell.fill = fill("FEF3C7");
      cell.border = { top: { style: "medium", color: { argb: "FF92400E" } }, bottom: { style: "double", color: { argb: "FF92400E" } } };
      if (ci === 0) cell.alignment = { horizontal: "right" };
    });
  }
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: n } };
  return ws;
}

// ---------------------------------------------------------------------------
// 3) รายการธุรกรรม
// ---------------------------------------------------------------------------
function sheetTransactions(wb: ExcelJS.Workbook, c: ExportCase, flow: FlowResult, o: ExportOptions, name = "ธุรกรรม") {
  const txs = sortTx(c.txs);
  const total = txs.reduce((s, t) => s + (t.transfer_amount ?? 0), 0);
  const cols: ColDef[] = [
    { header: "ลำดับ", width: 7, align: "center" },
    { header: "ชั้นที่", width: 7, align: "center" },
    { header: "วันที่โอน", width: 12, fmt: "dd/mm/yyyy", align: "center" },
    { header: "เวลา", width: 9, fmt: "hh:mm:ss", align: "center" },
    { header: "ธนาคารต้นทาง", width: 10, align: "center" },
    { header: "เลขบัญชีต้นทาง", width: 16, fmt: "@" },
    { header: "ชื่อบัญชีต้นทาง", width: 24 },
    { header: "ธนาคารปลายทาง", width: 10, align: "center" },
    { header: "เลขบัญชีปลายทาง", width: 16, fmt: "@" },
    { header: "ชื่อบัญชีปลายทาง", width: 24 },
    { header: "ประเภทบุคคล", width: 13 },
    { header: "เลขประจำตัว", width: 16, fmt: "@" },
    { header: "เบอร์โทร", width: 13, fmt: "@" },
    { header: "ช่องทาง", width: 10 },
    { header: "จำนวนเงิน (บาท)", width: 16, fmt: "#,##0.00", sum: true },
    { header: "รายละเอียด", width: 20 },
    { header: "เลขอ้างอิง", width: 16, fmt: "@" },
    { header: "เลขเคสธนาคาร", width: 19, fmt: "@" },
  ];
  const rows = txs.map((t, i) => [
    i + 1,
    flow.txLevel.get(t.id) ?? null,
    excelDate(t.transfer_date, o.era),
    excelTime(t.transfer_time),
    bankShort(t.from_bank_code, t.from_bank_short_name),
    maskAccount(t.from_account_no, o.maskAccounts),
    t.from_account_name,
    bankShort(t.to_bank_code, t.to_bank_short_name),
    maskAccount(t.to_account_no, o.maskAccounts),
    t.to_account_name,
    t.to_id_type,
    t.to_id,
    t.phone_number,
    [t.transfer_channel, t.transfer_channel_detail].filter(Boolean).join(" / ") || null,
    t.transfer_amount,
    t.transfer_description,
    t.transfer_ref,
    t.bank_case_id,
  ]) as (string | number | Date | null)[][];
  return styledTable(
    wb,
    name,
    `รายการธุรกรรม  คดี ${c.caseNo}${c.title ? `  —  ${c.title}` : ""}`,
    `ทั้งหมด ${txs.length.toLocaleString("th-TH")} รายการ  •  ยอดรวม ${total.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท  •  ออกรายงาน ${thaiDateTime()}`,
    cols,
    rows,
    "1E3A8A",
  );
}

// ---------------------------------------------------------------------------
// 4) สรุปบัญชี
// ---------------------------------------------------------------------------
function sheetAccounts(wb: ExcelJS.Workbook, c: ExportCase, flow: FlowResult, o: ExportOptions, name = "บัญชี") {
  const accts = [...flow.accounts.values()].sort((a, b) => a.level - b.level || b.inAmount - a.inAmount || b.outAmount - a.outAmount);
  const cols: ColDef[] = [
    { header: "ลำดับ", width: 7, align: "center" },
    { header: "ชั้นที่", width: 7, align: "center" },
    { header: "บทบาท", width: 22 },
    { header: "ธนาคาร", width: 9, align: "center" },
    { header: "เลขบัญชี", width: 16, fmt: "@" },
    { header: "ชื่อบัญชี", width: 26 },
    { header: "ประเภทบุคคล", width: 13 },
    { header: "เลขประจำตัว", width: 16, fmt: "@" },
    { header: "เบอร์โทร", width: 13, fmt: "@" },
    { header: "รับเข้า (ครั้ง)", width: 10, fmt: "#,##0", align: "center", sum: true },
    { header: "ยอดรับเข้า (บาท)", width: 16, fmt: "#,##0.00", sum: true },
    { header: "โอนออก (ครั้ง)", width: 10, fmt: "#,##0", align: "center", sum: true },
    { header: "ยอดโอนออก (บาท)", width: 16, fmt: "#,##0.00", sum: true },
    { header: "ส่วนต่าง (รับ-โอน)", width: 16, fmt: "#,##0.00;[Red]-#,##0.00" },
    { header: "วันที่แรก", width: 12, fmt: "dd/mm/yyyy", align: "center" },
    { header: "วันที่ล่าสุด", width: 12, fmt: "dd/mm/yyyy", align: "center" },
  ];
  const rows = accts.map((a, i) => [
    i + 1,
    a.level,
    ROLE_TH[a.role],
    a.bank,
    maskAccount(a.accountNo, o.maskAccounts),
    a.name,
    a.idType,
    a.idNo,
    a.phone,
    a.inCount,
    a.inAmount,
    a.outCount,
    a.outAmount,
    a.inAmount - a.outAmount,
    excelDate(a.firstDate, o.era),
    excelDate(a.lastDate, o.era),
  ]) as (string | number | Date | null)[][];
  const ws = styledTable(
    wb,
    name,
    `สรุปบัญชีที่เกี่ยวข้อง  คดี ${c.caseNo}${c.title ? `  —  ${c.title}` : ""}`,
    `บัญชีทั้งหมด ${accts.length.toLocaleString("th-TH")} บัญชี  •  ต้นทาง ${accts.filter((a) => a.role === "source").length}  •  บัญชีทอด ${accts.filter((a) => a.role === "mule").length}  •  ปลายทาง ${accts.filter((a) => a.role === "sink").length}`,
    cols,
    rows,
    "065F46",
  );
  // ไฮไลต์ชั้นด้วยสี
  accts.forEach((a, i) => {
    for (const col of [2, 3, 4, 5]) ws.getCell(5 + i, col).fill = fill(levelFill(a.level));
  });
  return ws;
}

// ---------------------------------------------------------------------------
// 5) ข้อมูลดิบ
// ---------------------------------------------------------------------------
function sheetRaw(wb: ExcelJS.Workbook, c: ExportCase, _flow: FlowResult, o: ExportOptions, name = "Worksheet") {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = CFR_FIELDS.map((f) => ({ header: f, key: f, width: Math.max(12, Math.min(26, f.length + 4)) }));
  const head = ws.getRow(1);
  head.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = fill("0F172A");
  head.height = 20;
  const masked = new Set(["from_account_no", "to_account_no"]);
  const txs = [...c.txs].sort((a, b) => a.id - b.id);
  for (const t of txs) {
    const rec: Record<string, unknown> = {};
    for (const f of CFR_FIELDS) {
      let v: unknown = t[f];
      if (DATE_FIELDS.includes(f)) v = textDate(v as string | null, o.era);
      else if (f === "timestamp_insert" && typeof v === "string") v = `${textDate(v.slice(0, 10), o.era)}${v.slice(10)}`;
      else if (masked.has(f)) v = maskAccount(v as string | null, o.maskAccounts) || null;
      rec[f] = v;
    }
    const row = ws.addRow(rec);
    row.font = { name: FONT, size: 10 };
  }
  ws.getColumn("transfer_amount").numFmt = "#,##0.00";
  ws.getColumn("to_balance").numFmt = "#,##0.00";
  for (const f of ["from_account_no", "to_account_no", "to_id", "promptpay_id", "phone_number"]) ws.getColumn(f).numFmt = "@";
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: CFR_FIELDS.length } };
  return ws;
}

/** สร้างไฟล์ Excel ของหนึ่งคดีตามรูปแบบที่เลือก */
export async function buildWorkbook(c: ExportCase, o: ExportOptions): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CFR Money Trail";
  wb.created = new Date();
  wb.title = `case ${c.caseNo}`;
  const flow = analyzeFlow(c.txs, o);

  switch (o.template) {
    case "case-flow":
      sheetCaseFlow(wb, c, flow, o);
      break;
    case "case-flow-detail":
      sheetCaseFlowDetail(wb, c, flow, o);
      break;
    case "transactions":
      sheetTransactions(wb, c, flow, o);
      break;
    case "accounts":
      sheetAccounts(wb, c, flow, o);
      break;
    case "raw":
      sheetRaw(wb, c, flow, o);
      break;
    case "full":
      sheetCaseFlow(wb, c, flow, o, "เส้นทางเงิน");
      sheetCaseFlowDetail(wb, c, flow, o, "เส้นทางเงิน (ละเอียด)");
      sheetTransactions(wb, c, flow, o, "ธุรกรรม");
      sheetAccounts(wb, c, flow, o, "บัญชี");
      sheetRaw(wb, c, flow, o, "ข้อมูลดิบ");
      break;
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

