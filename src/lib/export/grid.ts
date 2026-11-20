import { bankShort } from "../banks";
import { fromKey, maskAccount, toKey, type Chain, type FlowResult } from "../flow";
import type { Tx } from "../types";

/** สีพื้นของแต่ละชั้น (ตามธีมในไฟล์ตัวอย่าง 3.case) */
export const LEVEL_FILLS = ["C0E6F5", "FBE2D5", "C1F0C8", "F2CEEF", "FFFFCC", "FFC7CE", "DDEBF7", "E2EFDA", "FCE4D6", "EDEDED"];
/** สีเข้มสำหรับหัวตารางแบบละเอียด */
export const LEVEL_STRONG = ["156082", "C0504D", "196B24", "A02B93", "B08900", "9C0006", "2F5597", "548235", "C55A11", "595959"];

export const levelFill = (lv: number) => LEVEL_FILLS[lv % LEVEL_FILLS.length];
export const levelStrong = (lv: number) => LEVEL_STRONG[lv % LEVEL_STRONG.length];

export type GridKind = "bank" | "account" | "name" | "date" | "time" | "amount";

export interface GridColumn {
  level: number;
  kind: GridKind;
  header: string;
}

export interface GridCell {
  kind: GridKind;
  level: number;
  value: string | number | null;
}

export interface CaseGrid {
  columns: GridColumn[];
  rows: (GridCell | null)[][];
  levels: number;
}

const FLOW_HEADERS: Record<GridKind, (lv: number) => string> = {
  bank: (lv) => (lv === 0 ? "Bank" : `Bank(${lv})`),
  account: (lv) => (lv === 0 ? "on Bank" : `on Bank(${lv})`),
  name: (lv) => (lv === 0 ? "account_name" : `account_name(${lv})`),
  date: () => "transfer_date",
  time: () => "transfer_time",
  amount: () => "transfer_amount",
};

const THAI_HEADERS: Record<GridKind, string> = {
  bank: "ธนาคาร",
  account: "เลขบัญชี",
  name: "ชื่อบัญชี",
  date: "วันที่โอน",
  time: "เวลา",
  amount: "จำนวนเงิน",
};

/**
 * แปลงผลวิเคราะห์เส้นทางเงินเป็นตาราง (ใช้ทั้งการพรีวิวบนหน้าเว็บและการเขียนไฟล์ Excel)
 * แต่ละชั้น = [ธนาคาร, เลขบัญชี, (ชื่อ)] + [วันที่, เวลา, ยอดเงิน] ที่โอนต่อไปยังชั้นถัดไป
 */
export function buildCaseGrid(
  flow: FlowResult,
  opts: { mask: boolean; withName?: boolean; thai?: boolean },
): CaseGrid {
  const levels = flow.depth;
  const acctKinds: GridKind[] = opts.withName ? ["bank", "account", "name"] : ["bank", "account"];
  const txKinds: GridKind[] = ["date", "time", "amount"];
  const columns: GridColumn[] = [];
  const startCol: number[] = [];
  for (let lv = 0; lv < levels; lv++) {
    startCol[lv] = columns.length;
    for (const k of acctKinds) columns.push({ level: lv, kind: k, header: opts.thai ? THAI_HEADERS[k] : FLOW_HEADERS[k](lv) });
    if (lv < levels - 1)
      for (const k of txKinds) columns.push({ level: lv, kind: k, header: opts.thai ? THAI_HEADERS[k] : FLOW_HEADERS[k](lv) });
  }

  const acctCells = (lv: number, side: "from" | "to", t: Tx): GridCell[] => {
    const bank = side === "from" ? bankShort(t.from_bank_code, t.from_bank_short_name) : bankShort(t.to_bank_code, t.to_bank_short_name);
    const no = side === "from" ? t.from_account_no : t.to_account_no;
    const name = side === "from" ? t.from_account_name : t.to_account_name;
    const cells: GridCell[] = [
      { kind: "bank", level: lv, value: bank },
      { kind: "account", level: lv, value: maskAccount(no, opts.mask) },
    ];
    if (opts.withName) cells.push({ kind: "name", level: lv, value: name ?? "" });
    return cells;
  };

  const rows = flow.chains.map((chain) => {
    const row: (GridCell | null)[] = new Array(columns.length).fill(null);
    chain.hops.forEach((t, i) => {
      const lv = chain.offset + i;
      const c0 = startCol[lv];
      const cells = [
        ...acctCells(lv, "from", t),
        { kind: "date", level: lv, value: t.transfer_date } as GridCell,
        { kind: "time", level: lv, value: t.transfer_time } as GridCell,
        { kind: "amount", level: lv, value: t.transfer_amount } as GridCell,
      ];
      cells.forEach((c, j) => (row[c0 + j] = c));
    });
    const last = chain.hops[chain.hops.length - 1];
    const lv = chain.offset + chain.hops.length;
    acctCells(lv, "to", last).forEach((c, j) => (row[startCol[lv] + j] = c));
    return row;
  });

  return { columns, rows, levels };
}

/**
 * หาช่วงแถวที่ควรรวมเซลล์ (แนวตั้ง) ของบัญชีแต่ละชั้น:
 * แถวติดกันที่มีเส้นทางบัญชีเหมือนกันตั้งแต่ต้นทางจนถึงชั้นนั้น จะถูกรวมเป็นเซลล์เดียว
 * คืนค่า level → รายการช่วงแถว (index เริ่มที่ 0 ตามลำดับ chains)
 */
export function accountMerges(chains: Chain[]): Map<number, { r1: number; r2: number }[]> {
  const keys = chains.map((c) => {
    const m = new Map<number, string>();
    let acc = `o${c.offset}`;
    for (let i = 0; i <= c.hops.length; i++) {
      acc += `|${i < c.hops.length ? fromKey(c.hops[i]) : toKey(c.hops[c.hops.length - 1])}`;
      m.set(c.offset + i, acc);
    }
    return m;
  });
  const levels = new Set<number>();
  keys.forEach((m) => m.forEach((_, lv) => levels.add(lv)));
  const out = new Map<number, { r1: number; r2: number }[]>();
  for (const lv of levels) {
    const ranges: { r1: number; r2: number }[] = [];
    let start = 0;
    for (let r = 1; r <= keys.length; r++) {
      const prev = keys[r - 1].get(lv);
      const cur = r < keys.length ? keys[r].get(lv) : undefined;
      if (prev === undefined || cur !== prev) {
        if (prev !== undefined && r - 1 > start) ranges.push({ r1: start, r2: r - 1 });
        start = r;
      }
    }
    if (ranges.length) out.set(lv, ranges);
  }
  return out;
}

/** แผนที่ rowSpan สำหรับแสดงผล: `${row}:${level}` → span (0 = ถูกรวมเข้ากับแถวบน) */
export function mergeSpans(chains: Chain[]): Map<string, number> {
  const spans = new Map<string, number>();
  accountMerges(chains).forEach((ranges, lv) => {
    for (const { r1, r2 } of ranges) {
      spans.set(`${r1}:${lv}`, r2 - r1 + 1);
      for (let r = r1 + 1; r <= r2; r++) spans.set(`${r}:${lv}`, 0);
    }
  });
  return spans;
}
