import { bankShort } from "./banks";
import type { Tx } from "./types";

/**
 * วิธีเชื่อมต่อธุรกรรมเป็นเส้นทางเงิน
 * - time:   เลือกธุรกรรมขาออกถัดไปตามลำดับเวลา (แต่ละรายการใช้ได้ครั้งเดียว) — ตรงกับรูปแบบ 3.case
 * - amount: เลือกธุรกรรมขาออกที่ยอดเงินใกล้เคียงกับยอดที่รับเข้ามามากที่สุด (หลังเวลารับเงิน)
 * - reuse:  เหมือน time แต่ธุรกรรมขาออกหนึ่งรายการแสดงได้ในหลายเส้นทาง
 */
export type LinkStrategy = "time" | "amount" | "reuse";

export interface FlowOptions {
  strategy: LinkStrategy;
  /** แสดงธุรกรรมที่ไม่ได้อยู่ในเส้นทางจากบัญชีต้นทาง เป็นแถวเพิ่มเติม (เริ่มที่ชั้นของบัญชีนั้น) */
  includeUnlinked: boolean;
  /** จำนวนทอดสูงสุดต่อหนึ่งเส้นทาง */
  maxHops: number;
}

export const DEFAULT_FLOW_OPTIONS: FlowOptions = { strategy: "time", includeUnlinked: true, maxHops: 30 };

export type AccountRole = "source" | "mule" | "sink";

export interface Account {
  key: string;
  bankCode: string | null;
  bank: string;
  accountNo: string | null;
  name: string | null;
  idNo: string | null;
  idType: string | null;
  phone: string | null;
  status: string | null;
  level: number;
  inCount: number;
  inAmount: number;
  outCount: number;
  outAmount: number;
  firstDate: string | null;
  lastDate: string | null;
  role: AccountRole;
}

export interface Edge {
  from: string;
  to: string;
  count: number;
  amount: number;
}

/** หนึ่งแถวในรายงานเส้นทางเงิน: hops[0] เริ่มที่คอลัมน์ชั้น offset */
export interface Chain {
  offset: number;
  hops: Tx[];
  linked: boolean;
}

export interface FlowResult {
  accounts: Map<string, Account>;
  edges: Edge[];
  chains: Chain[];
  roots: string[];
  /** จำนวนชั้นบัญชีสูงสุดในรายงาน (รวมบัญชีต้นทาง) */
  depth: number;
  txLevel: Map<number, number>;
}

export function accountKey(no: string | null, name: string | null): string {
  const n = (no ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (n) return n;
  if (name && name.trim()) return `NAME:${name.trim()}`;
  return "UNKNOWN";
}

export const fromKey = (t: Tx) => accountKey(t.from_account_no, t.from_account_name);
export const toKey = (t: Tx) => accountKey(t.to_account_no, t.to_account_name);

function cmpTx(a: Tx, b: Tx): number {
  const da = a.transfer_date ?? "9999-99-99";
  const db = b.transfer_date ?? "9999-99-99";
  if (da !== db) return da < db ? -1 : 1;
  const ta = a.transfer_time ?? "";
  const tb = b.transfer_time ?? "";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id - b.id;
}

/** ธุรกรรม b เกิดขึ้นหลัง (หรือพร้อม) a หรือไม่ — ถ้าไม่มีข้อมูลเวลาถือว่าเป็นไปได้ */
function isAfter(a: Tx, b: Tx): boolean {
  if (!a.transfer_date || !b.transfer_date) return true;
  if (b.transfer_date > a.transfer_date) return true;
  if (b.transfer_date < a.transfer_date) return false;
  if (!a.transfer_time || !b.transfer_time) return true;
  return b.transfer_time >= a.transfer_time;
}

export function sortTx(txs: Tx[]): Tx[] {
  return [...txs].sort(cmpTx);
}

export function analyzeFlow(input: Tx[], opts: FlowOptions = DEFAULT_FLOW_OPTIONS): FlowResult {
  const txs = sortTx(input);
  const accounts = new Map<string, Account>();
  const edgeMap = new Map<string, Edge>();
  const outgoing = new Map<string, Tx[]>();

  const touch = (
    key: string,
    side: { code: string | null; short: string | null; no: string | null; name: string | null },
  ): Account => {
    let a = accounts.get(key);
    if (!a) {
      a = {
        key,
        bankCode: side.code,
        bank: bankShort(side.code, side.short),
        accountNo: side.no,
        name: side.name,
        idNo: null,
        idType: null,
        phone: null,
        status: null,
        level: -1,
        inCount: 0,
        inAmount: 0,
        outCount: 0,
        outAmount: 0,
        firstDate: null,
        lastDate: null,
        role: "mule",
      };
      accounts.set(key, a);
    } else {
      if (a.bank === "-" && (side.code || side.short)) a.bank = bankShort(side.code, side.short);
      a.bankCode ??= side.code;
      a.accountNo ??= side.no;
      a.name ??= side.name;
    }
    return a;
  };

  for (const t of txs) {
    const fk = fromKey(t);
    const tk = toKey(t);
    const amt = t.transfer_amount ?? 0;
    const fa = touch(fk, { code: t.from_bank_code, short: t.from_bank_short_name, no: t.from_account_no, name: t.from_account_name });
    const ta = touch(tk, { code: t.to_bank_code, short: t.to_bank_short_name, no: t.to_account_no, name: t.to_account_name });
    ta.idNo ??= t.to_id;
    ta.idType ??= t.to_id_type;
    ta.phone ??= t.phone_number;
    ta.status ??= t.to_account_status;
    fa.outCount++;
    fa.outAmount += amt;
    ta.inCount++;
    ta.inAmount += amt;
    for (const a of [fa, ta]) {
      if (t.transfer_date) {
        if (!a.firstDate || t.transfer_date < a.firstDate) a.firstDate = t.transfer_date;
        if (!a.lastDate || t.transfer_date > a.lastDate) a.lastDate = t.transfer_date;
      }
    }
    const ek = `${fk}→${tk}`;
    const e = edgeMap.get(ek) ?? { from: fk, to: tk, count: 0, amount: 0 };
    e.count++;
    e.amount += amt;
    edgeMap.set(ek, e);
    if (!outgoing.has(fk)) outgoing.set(fk, []);
    outgoing.get(fk)!.push(t);
  }

  // บัญชีต้นทาง: มีเงินออกแต่ไม่มีเงินเข้า
  let roots = [...accounts.values()].filter((a) => a.outCount > 0 && a.inCount === 0).map((a) => a.key);
  if (!roots.length && txs.length) roots = [fromKey(txs[0])];
  // เรียงบัญชีต้นทางตามเวลาธุรกรรมแรก
  const firstIdx = new Map<string, number>();
  txs.forEach((t, i) => {
    const k = fromKey(t);
    if (!firstIdx.has(k)) firstIdx.set(k, i);
  });
  roots.sort((a, b) => (firstIdx.get(a) ?? 0) - (firstIdx.get(b) ?? 0));

  // ระดับชั้นของบัญชี (BFS จากบัญชีต้นทาง)
  const bfs = (starts: string[]) => {
    const q = [...starts];
    for (const s of starts) accounts.get(s)!.level = 0;
    while (q.length) {
      const k = q.shift()!;
      const lv = accounts.get(k)!.level;
      for (const t of outgoing.get(k) ?? []) {
        const n = accounts.get(toKey(t))!;
        if (n.level < 0) {
          n.level = lv + 1;
          q.push(n.key);
        }
      }
    }
  };
  bfs(roots);
  // บัญชีที่ไม่เชื่อมกับต้นทาง
  for (const t of txs) {
    const a = accounts.get(fromKey(t))!;
    if (a.level < 0) {
      bfs([a.key]);
    }
  }
  for (const a of accounts.values()) {
    if (a.level < 0) a.level = 0;
    a.role = a.inCount === 0 ? "source" : a.outCount === 0 ? "sink" : "mule";
  }

  // สร้างเส้นทาง
  const used = new Set<number>();
  const inChain = new Set<number>();
  const chains: Chain[] = [];

  const pick = (last: Tx, visited: Set<string>): Tx | null => {
    const list = outgoing.get(toKey(last));
    if (!list) return null;
    let best: Tx | null = null;
    let bestDiff = Infinity;
    for (const c of list) {
      if (opts.strategy !== "reuse" && used.has(c.id)) continue;
      if (c.id === last.id || visited.has(toKey(c))) continue;
      if (!isAfter(last, c)) continue;
      if (opts.strategy !== "amount") return c;
      const diff = Math.abs((c.transfer_amount ?? 0) - (last.transfer_amount ?? 0));
      if (diff < bestDiff) {
        best = c;
        bestDiff = diff;
      }
    }
    return best;
  };

  const build = (start: Tx, linked: boolean, offset: number) => {
    const hops = [start];
    used.add(start.id);
    inChain.add(start.id);
    const visited = new Set([fromKey(start), toKey(start)]);
    while (hops.length < opts.maxHops) {
      const next = pick(hops[hops.length - 1], visited);
      if (!next) break;
      hops.push(next);
      used.add(next.id);
      inChain.add(next.id);
      visited.add(toKey(next));
    }
    chains.push({ offset, hops, linked });
  };

  const rootSet = new Set(roots);
  for (const r of roots) {
    for (const t of outgoing.get(r) ?? []) {
      if (opts.strategy !== "reuse" && used.has(t.id)) continue;
      build(t, true, 0);
    }
  }
  if (opts.includeUnlinked) {
    for (const t of txs) {
      if (inChain.has(t.id) || rootSet.has(fromKey(t))) continue;
      build(t, false, accounts.get(fromKey(t))!.level);
    }
  }

  const txLevel = new Map<number, number>();
  for (const t of txs) txLevel.set(t.id, accounts.get(fromKey(t))!.level + 1);

  let depth = 1;
  for (const c of chains) depth = Math.max(depth, c.offset + c.hops.length + 1);

  return { accounts, edges: [...edgeMap.values()], chains, roots, depth, txLevel };
}

/** ปิดบังเลขบัญชี: แสดงครึ่งแรก + xxxx + ตัวสุดท้าย เช่น 4390712341 → 43907xxxx1 */
export function maskAccount(no: string | null | undefined, enabled = true): string {
  if (!no) return "";
  if (!enabled || no.length <= 5) return no;
  return `${no.slice(0, Math.floor(no.length / 2))}xxxx${no.slice(-1)}`;
}
