import ExcelJS from "exceljs";
import { bankShort } from "../banks";
import { analyzeFlow, maskAccount, sortTx, type Chain } from "../flow";
import { normalizeHeader } from "../normalize";
import type { CfrField, Tx } from "../types";
import { accountMerges, type GridKind } from "./grid";
import { amountFmt, excelDate, excelTime, textDate, type ExportCase } from "./excel";
import type { ExportOptions } from "./options";

/**
 * รูปแบบที่ผู้ใช้นำเข้าเอง (อัปโหลดไฟล์ Excel ตัวอย่าง)
 * - flow:  ตารางเส้นทางเงินแนวนอน (Bank / on Bank / วันที่ / เวลา / ยอดเงิน ต่อกันเป็นชั้น) เช่นไฟล์ 3.case
 * - table: ตารางธุรกรรมหนึ่งแถวต่อหนึ่งรายการ ตามหัวคอลัมน์ที่ระบบรู้จัก (ฟิลด์ CFR หรือภาษาไทย)
 * สไตล์ (สี ฟอนต์ เส้นขอบ รูปแบบตัวเลข ความกว้างคอลัมน์ หัวรายงาน) นำมาจากไฟล์ตัวอย่างโดยตรง
 */
export type FlowPart = "acct" | "tx";

export interface FlowColumn {
  col: number;
  level: number;
  kind: GridKind;
  part: FlowPart;
  header: string;
}

export type TableField = CfrField | "no" | "level";

export interface OtherColumn {
  col: number;
  header: string;
  field: "no" | null;
}

export interface CustomFlowSpec {
  mode: "flow";
  sheet: string;
  headerRow: number;
  dataRow: number | null;
  columns: FlowColumn[];
  others: OtherColumn[];
  acctKinds: GridKind[];
  txKinds: GridKind[];
  levels: number;
  mergeRepeated: boolean;
}

export interface CustomTableSpec {
  mode: "table";
  sheet: string;
  headerRow: number;
  dataRow: number | null;
  columns: { col: number; header: string; field: TableField | null }[];
}

export type CustomSpec = CustomFlowSpec | CustomTableSpec;

export interface TemplateAnalysis {
  spec: CustomSpec;
  title: string[];
  summary: string;
}

// ---------------------------------------------------------------------------
// การจดจำหัวคอลัมน์
// ---------------------------------------------------------------------------
const FLOW_WORDS: Record<GridKind, string[]> = {
  bank: ["bank", "ธนาคาร", "bank_short_name", "bankname", "bank_name", "ธ."],
  account: ["onbank", "on_bank", "account", "account_no", "accountno", "acct", "เลขบัญชี", "บัญชี", "เลขที่บัญชี"],
  name: ["name", "account_name", "ชื่อ", "ชื่อบัญชี", "ชื่อเจ้าของบัญชี", "ชื่อ-สกุล", "ชื่อ-นามสกุล"],
  date: ["transfer_date", "date", "วันที่", "วันที่โอน", "วันโอน"],
  time: ["transfer_time", "time", "เวลา", "เวลาโอน"],
  amount: ["transfer_amount", "amount", "จำนวนเงิน", "ยอดเงิน", "ยอดโอน", "จำนวน", "ยอด"],
};
const NO_WORDS = ["no", "no.", "#", "ลำดับ", "ลำดับที่", "ที่"];
const LEVEL_WORDS = ["level", "ชั้น", "ชั้นที่", "ทอด", "ทอดที่"];

const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && !(v instanceof Date)) {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((x) => x.text).join("");
    if ("result" in o) return cellText(o.result as ExcelJS.CellValue);
    if ("text" in o) return String(o.text);
    return "";
  }
  return String(v);
};

function flowKind(text: string): { kind: GridKind; level: number | null } | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const m = t.match(/\(\s*(\d+)\s*\)\s*$|(\d+)\s*$/);
  const level = m ? Number(m[1] ?? m[2]) : null;
  const base = t.replace(/\(\s*\d+\s*\)\s*$/, "").replace(/\d+\s*$/, "").trim();
  const compact = base.replace(/\s+/g, "");
  for (const kind of Object.keys(FLOW_WORDS) as GridKind[]) {
    if (FLOW_WORDS[kind].some((w) => w === base || w === compact)) return { kind, level };
  }
  return null;
}

const isNo = (t: string) => NO_WORDS.includes(t.trim().toLowerCase());
const isLevel = (t: string) => LEVEL_WORDS.includes(t.trim().toLowerCase());

function rowTexts(ws: ExcelJS.Worksheet, r: number): { col: number; text: string }[] {
  const out: { col: number; text: string }[] = [];
  const row = ws.getRow(r);
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    if (cell.isMerged && cell.master.address !== cell.address) return;
    const text = cellText(cell.value).trim();
    if (text) out.push({ col, text });
  });
  return out;
}

function buildFlowColumns(cells: { col: number; text: string }[]) {
  const columns: FlowColumn[] = [];
  const others: OtherColumn[] = [];
  let level = -1;
  let acctSeen = new Set<GridKind>();
  let hasTx = false;
  for (const { col, text } of cells) {
    const k = flowKind(text);
    if (!k) {
      if (level < 0) others.push({ col, header: text, field: isNo(text) ? "no" : null });
      continue;
    }
    if (k.kind === "date" || k.kind === "time" || k.kind === "amount") {
      if (level < 0) continue;
      columns.push({ col, level, kind: k.kind, part: "tx", header: text });
      hasTx = true;
    } else {
      if (level < 0 || hasTx || acctSeen.has(k.kind)) {
        level++;
        acctSeen = new Set();
        hasTx = false;
      }
      acctSeen.add(k.kind);
      columns.push({ col, level, kind: k.kind, part: "acct", header: text });
    }
  }
  return { columns, others };
}

/** วิเคราะห์ไฟล์ตัวอย่างเพื่อสร้างรูปแบบการส่งออก */
export async function analyzeTemplate(buf: ArrayBuffer): Promise<TemplateAnalysis> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  let best: { score: number; analysis: TemplateAnalysis } | null = null;

  for (const ws of wb.worksheets) {
    const maxRow = Math.min(ws.rowCount, 30);
    for (let r = 1; r <= maxRow; r++) {
      const cells = rowTexts(ws, r);
      if (cells.length < 2) continue;
      const dataRow = ws.rowCount > r ? r + 1 : null;
      const title = [];
      for (let t = 1; t < r; t++) title.push(...rowTexts(ws, t).map((x) => x.text));

      // แบบเส้นทางเงิน
      const { columns, others } = buildFlowColumns(cells);
      const banks = columns.filter((c) => c.kind === "bank").length;
      const accts = columns.filter((c) => c.kind === "account").length;
      const onBank = cells.some((c) => /^on\s*bank/i.test(c.text));
      if ((banks >= 2 || onBank || (banks >= 1 && accts >= 1 && columns.some((c) => c.part === "tx"))) && columns.length >= 3) {
        const lv0 = columns.filter((c) => c.level === 0);
        const acctKinds = lv0.filter((c) => c.part === "acct").map((c) => c.kind);
        let txKinds = lv0.filter((c) => c.part === "tx").map((c) => c.kind);
        if (!txKinds.length) txKinds = [...new Set(columns.filter((c) => c.part === "tx").map((c) => c.kind))];
        const levels = Math.max(...columns.map((c) => c.level)) + 1;
        const vMerges = (ws.model.merges ?? []).some((m) => {
          const [a, b] = m.split(":");
          const ra = ws.getCell(a).row;
          const rb = ws.getCell(b).row;
          return Number(ra) > r && Number(rb) > Number(ra);
        });
        const spec: CustomFlowSpec = {
          mode: "flow",
          sheet: ws.name,
          headerRow: r,
          dataRow,
          columns,
          others,
          acctKinds,
          txKinds: txKinds.length ? txKinds : ["date", "time", "amount"],
          levels,
          mergeRepeated: vMerges,
        };
        const score = 100 + columns.length;
        if (!best || score > best.score)
          best = {
            score,
            analysis: {
              spec,
              title,
              summary: `เส้นทางเงินแนวนอน · ชั้นละ ${acctKinds.length + spec.txKinds.length} คอลัมน์ · ตัวอย่าง ${levels} ชั้น${vMerges ? " · รวมเซลล์บัญชีที่ซ้ำ" : ""}`,
            },
          };
        continue;
      }

      // แบบตารางธุรกรรม
      const tcols = cells.map(({ col, text }) => ({
        col,
        header: text,
        field: (isNo(text) ? "no" : isLevel(text) ? "level" : normalizeHeader(text)) as TableField | null,
      }));
      const known = tcols.filter((c) => c.field && c.field !== "no").length;
      if (known >= 2) {
        const score = known;
        if (!best || score > best.score)
          best = {
            score,
            analysis: {
              spec: { mode: "table", sheet: ws.name, headerRow: r, dataRow, columns: tcols },
              title,
              summary: `ตารางธุรกรรม · ${tcols.length} คอลัมน์ (รู้จัก ${known} คอลัมน์)`,
            },
          };
      }
    }
  }
  if (!best)
    throw new Error(
      "ไม่พบหัวตารางที่ระบบรู้จัก — รูปแบบเส้นทางเงินต้องมีคอลัมน์ Bank / on Bank (ธนาคาร / เลขบัญชี) ส่วนรูปแบบตารางต้องใช้ชื่อคอลัมน์ CFR เช่น from_account_no, transfer_amount",
    );
  return best.analysis;
}

// ---------------------------------------------------------------------------
// การสร้างไฟล์จากรูปแบบที่นำเข้า
// ---------------------------------------------------------------------------
const clone = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

function captureColumn(ws: ExcelJS.Worksheet, headerRow: number, dataRow: number | null, col: number) {
  const h = ws.getCell(headerRow, col);
  const d = dataRow ? ws.getCell(dataRow, col) : null;
  const dStyle = d ? clone(d.isMerged ? d.master.style : d.style) : null;
  return { header: clone(h.style), data: dStyle && Object.keys(dStyle).length ? dStyle : null, width: ws.getColumn(col).width };
}

/** ลบเซลล์รวมที่ทับแถว >= fromRow และลบแถวตั้งแต่ fromRow ลงไป */
function clearFrom(ws: ExcelJS.Worksheet, fromRow: number) {
  for (const m of [...(ws.model.merges ?? [])]) {
    const [a, b] = m.split(":");
    if (Number(ws.getCell(b ?? a).row) >= fromRow) ws.unMergeCells(m);
  }
  const n = ws.rowCount - fromRow + 1;
  if (n > 0) ws.spliceRows(fromRow, n);
}

function fillTitle(ws: ExcelJS.Worksheet, headerRow: number, c: ExportCase) {
  const today = new Date();
  for (let r = 1; r < headerRow; r++) {
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value !== "string") return;
      let v = cell.value;
      if (/\{(case|title|date)\}/.test(v)) {
        v = v
          .replaceAll("{case}", c.caseNo)
          .replaceAll("{title}", c.title ?? "")
          .replaceAll("{date}", today.toLocaleDateString("th-TH", { dateStyle: "long" }));
      } else if (/\d{5,}/.test(v)) {
        // ข้อความตัวอย่างเช่น "case 150225671" → แทนเลขคดีด้วยคดีที่ส่งออก
        v = v.replace(/[A-Za-z0-9\-]*\d{5,}[A-Za-z0-9\-]*/, c.caseNo);
      }
      cell.value = v;
    });
  }
}

const DEFAULT_FMT: Partial<Record<GridKind, string>> = { date: "mm-dd-yy", time: "h:mm", account: "@" };

function writeValue(cell: ExcelJS.Cell, kind: GridKind, v: string | number | Date | null) {
  cell.value = v;
  const fmt = cell.numFmt;
  if (!fmt || fmt === "General") {
    if (kind === "amount") cell.numFmt = amountFmt(typeof v === "number" ? v : null);
    else if (DEFAULT_FMT[kind]) cell.numFmt = DEFAULT_FMT[kind]!;
  }
}

function buildFlowSheet(ws: ExcelJS.Worksheet, spec: CustomFlowSpec, c: ExportCase, o: ExportOptions) {
  const flow = analyzeFlow(c.txs, o);
  const depth = flow.depth;
  const { headerRow, dataRow } = spec;

  // เก็บสไตล์จากไฟล์ตัวอย่างก่อนล้างข้อมูล
  const styles = new Map<number, ReturnType<typeof captureColumn>>();
  for (const col of [...spec.columns.map((x) => x.col), ...spec.others.map((x) => x.col)])
    styles.set(col, captureColumn(ws, headerRow, dataRow, col));
  const headerHeight = ws.getRow(headerRow).height;
  const dataHeight = dataRow ? ws.getRow(dataRow).height : undefined;
  const firstFlowCol = Math.min(...spec.columns.map((x) => x.col));

  clearFrom(ws, headerRow);
  fillTitle(ws, headerRow, c);

  /** เลือกคอลัมน์ต้นแบบของชั้น L ชนิด kind (วนสีตามจำนวนชั้นในไฟล์ตัวอย่าง) */
  const source = (L: number, kind: GridKind, part: FlowPart): FlowColumn | undefined => {
    const list = spec.columns.filter((x) => x.kind === kind && x.part === part);
    if (!list.length) return undefined;
    const exact = list.find((x) => x.level === L);
    if (exact) return exact;
    const levels = [...new Set(list.map((x) => x.level))].sort((a, b) => a - b);
    const lv = levels[L % levels.length];
    return list.find((x) => x.level === lv);
  };
  const label = (L: number, kind: GridKind, part: FlowPart): string => {
    const list = spec.columns.filter((x) => x.kind === kind && x.part === part);
    const exact = list.find((x) => x.level === L);
    if (exact) return exact.header;
    const numbered = list.find((x) => x.level >= 1 && new RegExp(`${x.level}(?!.*\\d)`).test(x.header));
    if (numbered) return numbered.header.replace(new RegExp(`${numbered.level}(?!.*\\d)`), String(L));
    return source(L, kind, part)?.header ?? kind;
  };

  // จัดคอลัมน์ใหม่ตามจำนวนชั้นจริง
  const layout: { col: number; level: number; kind: GridKind; part: FlowPart }[] = [];
  let col = firstFlowCol;
  for (let L = 0; L < depth; L++) {
    for (const k of spec.acctKinds) layout.push({ col: col++, level: L, kind: k, part: "acct" });
    if (L < depth - 1) for (const k of spec.txKinds) layout.push({ col: col++, level: L, kind: k, part: "tx" });
  }

  // หัวตาราง
  const hRow = ws.getRow(headerRow);
  if (headerHeight) hRow.height = headerHeight;
  for (const oc of spec.others) {
    const cell = ws.getCell(headerRow, oc.col);
    cell.style = clone(styles.get(oc.col)!.header);
    cell.value = oc.header;
  }
  for (const l of layout) {
    const src = source(l.level, l.kind, l.part);
    const st = src ? styles.get(src.col)! : undefined;
    const cell = ws.getCell(headerRow, l.col);
    if (st) cell.style = clone(st.header);
    cell.value = label(l.level, l.kind, l.part);
    if (st?.width) ws.getColumn(l.col).width = st.width;
  }

  // ข้อมูล
  const colOf = new Map(layout.map((l) => [`${l.level}:${l.part}:${l.kind}`, l]));
  const acctValue = (t: Tx, side: "from" | "to", kind: GridKind) => {
    if (kind === "bank") return side === "from" ? bankShort(t.from_bank_code, t.from_bank_short_name) : bankShort(t.to_bank_code, t.to_bank_short_name);
    if (kind === "account") return maskAccount(side === "from" ? t.from_account_no : t.to_account_no, o.maskAccounts);
    if (kind === "name") return (side === "from" ? t.from_account_name : t.to_account_name) ?? "";
    return null;
  };
  const put = (r: number, L: number, part: FlowPart, kind: GridKind, v: string | number | Date | null) => {
    const l = colOf.get(`${L}:${part}:${kind}`);
    if (!l) return;
    const src = source(L, kind, part);
    const st = src ? styles.get(src.col) : undefined;
    const cell = ws.getCell(r, l.col);
    cell.style = clone(st?.data ?? { border: st?.header?.border, font: st?.header?.font });
    writeValue(cell, kind, v);
  };

  flow.chains.forEach((chain: Chain, i) => {
    const r = headerRow + 1 + i;
    if (dataHeight) ws.getRow(r).height = dataHeight;
    for (const oc of spec.others) {
      const cell = ws.getCell(r, oc.col);
      const st = styles.get(oc.col)!;
      cell.style = clone(st.data ?? { border: st.header.border, font: st.header.font });
      if (oc.field === "no") cell.value = i + 1;
    }
    chain.hops.forEach((t, j) => {
      const L = chain.offset + j;
      for (const k of spec.acctKinds) put(r, L, "acct", k, acctValue(t, "from", k));
      for (const k of spec.txKinds) {
        const v = k === "date" ? excelDate(t.transfer_date, o.era) : k === "time" ? excelTime(t.transfer_time) : k === "amount" ? t.transfer_amount : null;
        put(r, L, "tx", k, v);
      }
    });
    const last = chain.hops[chain.hops.length - 1];
    const L = chain.offset + chain.hops.length;
    for (const k of spec.acctKinds) put(r, L, "acct", k, acctValue(last, "to", k));
  });

  if (o.mergeRepeated) {
    const first = headerRow + 1;
    accountMerges(flow.chains).forEach((ranges, L) => {
      for (const k of spec.acctKinds) {
        const l = colOf.get(`${L}:acct:${k}`);
        if (!l) continue;
        for (const { r1, r2 } of ranges) {
          ws.mergeCells(first + r1, l.col, first + r2, l.col);
          const m = ws.getCell(first + r1, l.col);
          m.alignment = { ...(m.alignment ?? {}), horizontal: m.alignment?.horizontal ?? "center", vertical: "middle" };
        }
      }
    });
  }
}

const MASKED = new Set<TableField>(["from_account_no", "to_account_no"]);
const DATE_TF = new Set<TableField>(["transfer_date", "to_open_date", "to_close_date"]);

function buildTableSheet(ws: ExcelJS.Worksheet, spec: CustomTableSpec, c: ExportCase, o: ExportOptions) {
  const flow = analyzeFlow(c.txs, o);
  const { headerRow, dataRow } = spec;
  const styles = new Map(spec.columns.map((x) => [x.col, captureColumn(ws, headerRow, dataRow, x.col)]));
  const dataHeight = dataRow ? ws.getRow(dataRow).height : undefined;
  clearFrom(ws, headerRow + 1);
  fillTitle(ws, headerRow, c);

  sortTx(c.txs).forEach((t, i) => {
    const r = headerRow + 1 + i;
    if (dataHeight) ws.getRow(r).height = dataHeight;
    for (const col of spec.columns) {
      const cell = ws.getCell(r, col.col);
      const st = styles.get(col.col)!;
      cell.style = clone(st.data ?? { border: st.header.border, font: st.header.font });
      const f = col.field;
      let v: string | number | Date | null = null;
      let kind: GridKind | null = null;
      if (f === "no") v = i + 1;
      else if (f === "level") v = flow.txLevel.get(t.id) ?? null;
      else if (f && DATE_TF.has(f)) {
        v = excelDate(t[f as "transfer_date"], o.era);
        kind = "date";
      } else if (f === "transfer_time") {
        v = excelTime(t.transfer_time);
        kind = "time";
      } else if (f === "transfer_amount" || f === "to_balance") {
        v = t[f];
        kind = "amount";
      } else if (f === "timestamp_insert") v = t.timestamp_insert ? `${textDate(t.timestamp_insert.slice(0, 10), o.era)}${t.timestamp_insert.slice(10)}` : null;
      else if (f === "from_bank_short_name") v = bankShort(t.from_bank_code, t.from_bank_short_name);
      else if (f === "to_bank_short_name") v = bankShort(t.to_bank_code, t.to_bank_short_name);
      else if (f && MASKED.has(f)) {
        v = maskAccount(t[f as "from_account_no"], o.maskAccounts) || null;
        kind = "account";
      } else if (f) v = t[f] as string | null;
      if (kind) writeValue(cell, kind, v);
      else cell.value = v;
    }
  });
}

/** สร้างไฟล์ Excel ของหนึ่งคดีด้วยรูปแบบที่ผู้ใช้นำเข้า */
export async function buildCustomWorkbook(template: ArrayBuffer, spec: CustomSpec, c: ExportCase, o: ExportOptions): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template);
  const ws = wb.getWorksheet(spec.sheet) ?? wb.worksheets[0];
  // เก็บเฉพาะแผ่นงานของรูปแบบ (ไม่ให้ข้อมูลตัวอย่างในแผ่นอื่นติดไปด้วย)
  for (const other of [...wb.worksheets]) if (other.id !== ws.id) wb.removeWorksheet(other.id);
  if (spec.mode === "flow") buildFlowSheet(ws, spec, c, o);
  else buildTableSheet(ws, spec, c, o);
  wb.creator = "CFR Money Trail";
  wb.modified = new Date();
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
