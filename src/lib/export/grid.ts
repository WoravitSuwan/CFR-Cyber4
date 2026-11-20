import { bankShort } from "../banks";
import { maskAccount, type FlowResult } from "../flow";
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
