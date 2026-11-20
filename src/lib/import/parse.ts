"use client";

import type { TxRecord } from "../types";
import { CFR_FIELDS } from "../types";
import { detectHeaderRow, extractCaseNo, normalizeRow, type CellValue } from "../normalize";

export interface ParsedFile {
  uid: string;
  path: string;
  name: string;
  size: number;
  caseNo: string | null;
  rows: (TxRecord & { row_hash: string })[];
  skipped: number;
  sheets: string[];
  error?: string;
  bankCaseIds: string[];
  total: number;
}

const SUPPORTED = /\.(xlsx|xlsm|csv|txt)$/i;

/** แฮช 53 บิต (cyrb53) */
function cyrb53(str: string, seed = 0) {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** ใส่ row_hash ให้แต่ละแถว (แถวที่เหมือนกันทุกช่องจะได้ลำดับที่ต่อท้ายต่างกัน) เพื่อกันข้อมูลซ้ำเมื่อนำเข้าซ้ำ */
function withHashes(rows: TxRecord[]) {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const key = CFR_FIELDS.map((f) => r[f] ?? "").join("␟");
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const k = `${key}#${n}`;
    return { ...r, row_hash: cyrb53(k, 1) + cyrb53(k, 7) };
  });
}

function cellToPrimitive(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((x) => x.text).join("");
    if ("result" in o) return cellToPrimitive(o.result);
    if ("text" in o) return cellToPrimitive(o.text);
    if ("error" in o) return null;
  }
  return String(v);
}

function rowsToRecords(table: CellValue[][]): { rows: TxRecord[]; skipped: number } | null {
  const header = detectHeaderRow(table);
  if (!header) return null;
  const rows: TxRecord[] = [];
  let skipped = 0;
  for (let i = header.index + 1; i < table.length; i++) {
    const cells = table[i];
    if (!cells || cells.every((c) => c === null || c === undefined || c === "")) continue;
    const rec = normalizeRow(cells, header.map);
    if (rec) rows.push(rec);
    else skipped++;
  }
  return { rows, skipped };
}

async function parseXlsx(buf: ArrayBuffer) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const rows: TxRecord[] = [];
  const sheets: string[] = [];
  let skipped = 0;
  wb.eachSheet((ws) => {
    const table: CellValue[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rn) => {
      const vals = row.values as unknown[];
      table[rn - 1] = (Array.isArray(vals) ? vals.slice(1) : []).map(cellToPrimitive);
    });
    for (let i = 0; i < table.length; i++) table[i] ??= [];
    const r = rowsToRecords(table);
    if (r) {
      rows.push(...r.rows);
      skipped += r.skipped;
      sheets.push(ws.name);
    }
  });
  if (!sheets.length) throw new Error("ไม่พบหัวคอลัมน์ข้อมูล CFR (เช่น from_account_no, to_account_no) ในไฟล์");
  return { rows, skipped, sheets };
}

function decodeText(buf: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (!utf8.includes("�")) return utf8.replace(/^﻿/, "");
  try {
    return new TextDecoder("windows-874").decode(buf);
  } catch {
    return utf8;
  }
}

/** ตัวแยก CSV ตาม RFC 4180 (รองรับ , ; และ tab) */
export function parseCsv(text: string): string[][] {
  const nl = text.indexOf("\n");
  const firstLine = nl < 0 ? text : text.slice(0, nl);
  const delim = [",", "\t", ";", "|"].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ",");
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      out.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    out.push(row);
  }
  return out;
}

function parseCsvBuffer(buf: ArrayBuffer) {
  const table = parseCsv(decodeText(buf)).map((r) => r.map((c) => (c.trim() === "" ? null : c.trim())));
  const r = rowsToRecords(table);
  if (!r) throw new Error("ไม่พบหัวคอลัมน์ข้อมูล CFR ในไฟล์ CSV");
  return { ...r, sheets: ["CSV"] };
}

let uidCounter = 0;

async function parseOne(path: string, buf: ArrayBuffer): Promise<ParsedFile> {
  const name = path.split("/").pop() ?? path;
  const base: ParsedFile = {
    uid: `f${Date.now().toString(36)}${(uidCounter++).toString(36)}`,
    path,
    name,
    size: buf.byteLength,
    caseNo: extractCaseNo(path),
    rows: [],
    skipped: 0,
    sheets: [],
    bankCaseIds: [],
    total: 0,
  };
  try {
    const r = /\.(xlsx|xlsm)$/i.test(name) ? await parseXlsx(buf) : parseCsvBuffer(buf);
    base.rows = withHashes(r.rows);
    base.skipped = r.skipped;
    base.sheets = r.sheets;
    base.bankCaseIds = [...new Set(r.rows.map((x) => x.bank_case_id).filter(Boolean) as string[])];
    base.total = r.rows.reduce((s, x) => s + (x.transfer_amount ?? 0), 0);
    if (!base.caseNo) base.caseNo = base.bankCaseIds[0] ?? name.replace(/\.[^.]+$/, "");
    if (!r.rows.length) base.error = "ไม่พบแถวข้อมูลธุรกรรมในไฟล์";
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e);
    base.caseNo ??= name.replace(/\.[^.]+$/, "");
  }
  return base;
}

async function expandZip(path: string, buf: ArrayBuffer, depth: number, out: { path: string; buf: ArrayBuffer }[], errors: ParsedFile[]) {
  const JSZip = (await import("jszip")).default;
  try {
    const zip = await JSZip.loadAsync(buf);
    const entries = Object.values(zip.files).filter(
      (f) => !f.dir && !/(^|\/)(__MACOSX|\.)/.test(f.name) && !/(^|\/)~\$/.test(f.name),
    );
    for (const e of entries) {
      const p = `${path}/${e.name}`;
      if (/\.zip$/i.test(e.name) && depth < 4) {
        await expandZip(p, await e.async("arraybuffer"), depth + 1, out, errors);
      } else if (SUPPORTED.test(e.name)) {
        out.push({ path: p, buf: await e.async("arraybuffer") });
      }
    }
  } catch (e) {
    errors.push({
      uid: `z${uidCounter++}`,
      path,
      name: path.split("/").pop() ?? path,
      size: buf.byteLength,
      caseNo: null,
      rows: [],
      skipped: 0,
      sheets: [],
      bankCaseIds: [],
      total: 0,
      error: `เปิดไฟล์ ZIP ไม่ได้: ${e instanceof Error ? e.message : e}`,
    });
  }
}

/** อ่านไฟล์ที่ผู้ใช้เลือก (รองรับ .xlsx .csv และ .zip ที่มีหลายไฟล์/ซ้อนกัน) */
export async function parseUploads(files: File[], onProgress?: (done: number, total: number, name: string) => void): Promise<ParsedFile[]> {
  const queue: { path: string; buf: ArrayBuffer }[] = [];
  const results: ParsedFile[] = [];
  for (const f of files) {
    const buf = await f.arrayBuffer();
    if (/\.zip$/i.test(f.name)) await expandZip(f.name, buf, 0, queue, results);
    else if (SUPPORTED.test(f.name)) queue.push({ path: f.name, buf });
    else
      results.push({
        uid: `u${uidCounter++}`,
        path: f.name,
        name: f.name,
        size: f.size,
        caseNo: null,
        rows: [],
        skipped: 0,
        sheets: [],
        bankCaseIds: [],
        total: 0,
        error: /\.xls$/i.test(f.name)
          ? "ไฟล์ .xls รุ่นเก่ายังไม่รองรับ กรุณาบันทึกเป็น .xlsx ก่อน"
          : "ชนิดไฟล์ไม่รองรับ (รองรับ .xlsx .csv .zip)",
      });
  }
  for (let i = 0; i < queue.length; i++) {
    onProgress?.(i, queue.length, queue[i].path);
    results.push(await parseOne(queue[i].path, queue[i].buf));
  }
  onProgress?.(queue.length, queue.length, "");
  return results;
}
