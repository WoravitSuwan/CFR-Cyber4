"use client";

import type { CaseSummary, ImportMode, Tx } from "./types";
import type { ParsedFile } from "./import/parse";
import { buildFileName, type ExportOptions } from "./export/options";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !url.includes("/api/auth/")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  if (!res.ok) throw new ApiError(data.error || `HTTP ${res.status}`, res.status, data.code);
  return data as T;
}

export interface ImportGroup {
  caseNo: string;
  title?: string;
  mode: ImportMode;
  files: ParsedFile[];
}

export interface ImportProgress {
  caseNo: string;
  file: string;
  sent: number;
  total: number;
}

export interface ImportResult {
  caseNo: string;
  caseId: number;
  inserted: number;
  duplicates: number;
}

const CHUNK = 1500;

/** อัปโหลดข้อมูลที่อ่านแล้วเข้าฐานข้อมูลเป็นชุดๆ */
export async function importGroup(g: ImportGroup, onProgress?: (p: ImportProgress) => void): Promise<ImportResult> {
  let caseId = 0;
  let inserted = 0;
  let duplicates = 0;
  const total = g.files.reduce((s, f) => s + f.rows.length, 0);
  let sent = 0;
  for (let i = 0; i < g.files.length; i++) {
    const f = g.files[i];
    // ไฟล์แรกใช้โหมดที่เลือก ไฟล์ถัดไปในกลุ่มเดียวกันให้ต่อท้ายคดีเดียวกัน
    const mode: ImportMode = i === 0 ? g.mode : "append";
    const start = await api<{ caseId: number; fileId: number }>("/api/import", {
      method: "POST",
      body: JSON.stringify({ action: "start", caseNo: g.caseNo, title: g.title, mode, fileName: f.path }),
    });
    caseId = start.caseId;
    for (let j = 0; j < f.rows.length; j += CHUNK) {
      const rows = f.rows.slice(j, j + CHUNK);
      const r = await api<{ inserted: number; duplicates: number }>("/api/import", {
        method: "POST",
        body: JSON.stringify({ action: "rows", caseId: start.caseId, fileId: start.fileId, rows }),
      });
      inserted += r.inserted;
      duplicates += r.duplicates;
      sent += rows.length;
      onProgress?.({ caseNo: g.caseNo, file: f.name, sent, total });
    }
    await api("/api/import", { method: "POST", body: JSON.stringify({ action: "finish", caseId: start.caseId, fileId: start.fileId }) });
  }
  return { caseNo: g.caseNo, caseId, inserted, duplicates };
}

export async function fetchAllTransactions(caseId: number): Promise<Tx[]> {
  const out: Tx[] = [];
  const limit = 5000;
  for (let offset = 0; ; offset += limit) {
    const r = await api<{ rows: Tx[]; hasMore: boolean }>(`/api/cases/${caseId}/transactions?offset=${offset}&limit=${limit}`);
    out.push(...r.rows);
    if (!r.hasMore) break;
  }
  return out;
}

export interface ExportedFile {
  caseId: number;
  caseNo: string;
  fileName: string;
  blob: Blob;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** สร้างไฟล์ Excel ของหนึ่งคดีบนเบราว์เซอร์ */
export async function exportCase(c: Pick<CaseSummary, "id" | "case_no" | "title">, opts: ExportOptions, index: number, txs?: Tx[]): Promise<ExportedFile> {
  const [{ buildWorkbook }, rows] = await Promise.all([import("./export/excel"), txs ? Promise.resolve(txs) : fetchAllTransactions(c.id)]);
  const buf = await buildWorkbook({ caseNo: c.case_no, title: c.title, txs: rows }, opts);
  return {
    caseId: c.id,
    caseNo: c.case_no,
    fileName: buildFileName(opts.fileNamePattern, { caseNo: c.case_no, index, title: c.title, template: opts.template }),
    blob: new Blob([buf], { type: XLSX_MIME }),
  };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** รวมไฟล์เป็น ZIP (ชื่อไฟล์ซ้ำจะเติม (2), (3) ...) */
export async function zipFiles(files: { fileName: string; blob: Blob }[]): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const used = new Map<string, number>();
  for (const f of files) {
    let name = f.fileName;
    const n = used.get(name) ?? 0;
    used.set(name, n + 1);
    if (n > 0) name = name.replace(/(\.xlsx)$/i, ` (${n + 1})$1`);
    zip.file(name, f.blob);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export const fmtMoney = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "-" : n.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: 2 });

export const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? "-" : n.toLocaleString("th-TH"));

/** 'YYYY-MM-DD' → '27/02/2567' */
export function fmtDate(ymd: string | null | undefined, era: "BE" | "CE" = "BE") {
  if (!ymd) return "-";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${era === "BE" ? Number(y) + 543 : y}`;
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export const fmtTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : "-");

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
