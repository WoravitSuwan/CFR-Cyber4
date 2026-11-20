import "server-only";
import { db } from "./db";
import { CFR_FIELDS, DATE_FIELDS, NUMERIC_FIELDS, type CaseFile, type CaseSummary, type ImportMode, type Tx } from "./types";

const TX_COLUMNS = `
  id::float8 AS id, response_id, bank_case_id,
  to_char(timestamp_insert, 'YYYY-MM-DD HH24:MI:SS') AS timestamp_insert,
  from_bank_code, from_bank_short_name, from_account_no, from_account_name,
  to_bank_code, to_bank_short_name, to_bank_branch, to_id_type, to_id, first_name, last_name, phone_number,
  promptpay_type, promptpay_id, to_account_no, to_account_name, to_account_status,
  to_open_date::text AS to_open_date, to_close_date::text AS to_close_date, to_balance::float8 AS to_balance,
  transfer_date::text AS transfer_date, transfer_channel, transfer_channel_detail,
  to_char(transfer_time, 'HH24:MI:SS') AS transfer_time, transfer_amount::float8 AS transfer_amount,
  transfer_description, transfer_ref`;

const SUMMARY_SQL = `
  SELECT c.id::float8 AS id, c.case_no, c.title, c.note, c.created_at, c.updated_at,
    COALESCE(s.tx_count, 0)::int AS tx_count,
    COALESCE(s.total_amount, 0)::float8 AS total_amount,
    COALESCE(a.account_count, 0)::int AS account_count,
    COALESCE(f.file_count, 0)::int AS file_count,
    s.first_date::text AS first_date, s.last_date::text AS last_date,
    COALESCE(s.bank_case_ids, '{}') AS bank_case_ids
  FROM cases c
  LEFT JOIN LATERAL (
    SELECT count(*) AS tx_count, sum(transfer_amount) AS total_amount,
      min(transfer_date) AS first_date, max(transfer_date) AS last_date,
      array_remove(array_agg(DISTINCT bank_case_id), NULL) AS bank_case_ids
    FROM transactions t WHERE t.case_id = c.id
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS account_count FROM (
      SELECT from_account_no AS acc FROM transactions WHERE case_id = c.id AND from_account_no IS NOT NULL
      UNION SELECT to_account_no FROM transactions WHERE case_id = c.id AND to_account_no IS NOT NULL
    ) x
  ) a ON true
  LEFT JOIN LATERAL (SELECT count(*) AS file_count FROM case_files WHERE case_id = c.id) f ON true`;

export async function listCases(q?: string): Promise<CaseSummary[]> {
  const sql = await db();
  if (q && q.trim()) {
    const like = `%${q.trim().replace(/[%_\\]/g, "\\$&")}%`;
    return (await sql.unsafe(
      `${SUMMARY_SQL}
       WHERE c.case_no ILIKE $1 OR c.title ILIKE $1 OR EXISTS (
         SELECT 1 FROM transactions t WHERE t.case_id = c.id AND (
           t.from_account_no ILIKE $1 OR t.to_account_no ILIKE $1 OR t.to_account_name ILIKE $1
           OR t.from_account_name ILIKE $1 OR t.bank_case_id ILIKE $1 OR t.to_id ILIKE $1))
       ORDER BY c.updated_at DESC LIMIT 500`,
      [like],
    )) as unknown as CaseSummary[];
  }
  return (await sql.unsafe(`${SUMMARY_SQL} ORDER BY c.updated_at DESC LIMIT 500`)) as unknown as CaseSummary[];
}

export async function getCase(id: number): Promise<(CaseSummary & { files: CaseFile[] }) | null> {
  const sql = await db();
  const rows = (await sql.unsafe(`${SUMMARY_SQL} WHERE c.id = $1`, [id])) as unknown as CaseSummary[];
  if (!rows.length) return null;
  const files = (await sql`
    SELECT id::float8 AS id, file_name, row_count, imported_at FROM case_files WHERE case_id = ${id} ORDER BY id`) as unknown as CaseFile[];
  return { ...rows[0], files };
}

export async function getStats() {
  const sql = await db();
  const [r] = await sql`
    SELECT (SELECT count(*) FROM cases)::int AS cases,
           (SELECT count(*) FROM transactions)::int AS transactions,
           (SELECT COALESCE(sum(transfer_amount), 0) FROM transactions)::float8 AS amount,
           (SELECT count(*) FROM case_files)::int AS files`;
  return r as { cases: number; transactions: number; amount: number; files: number };
}

export async function startImport(input: { caseNo: string; title?: string | null; mode: ImportMode; fileName: string }) {
  const sql = await db();
  const caseNo = input.caseNo.trim().slice(0, 200);
  if (!caseNo) throw new Error("กรุณาระบุเลขคดี");
  return sql.begin(async (tx) => {
    let caseId: number | null = null;
    if (input.mode !== "new") {
      const [ex] = await tx`SELECT id::float8 AS id FROM cases WHERE case_no = ${caseNo} ORDER BY id DESC LIMIT 1`;
      if (ex) caseId = ex.id as number;
    }
    if (caseId !== null && input.mode === "replace") {
      await tx`DELETE FROM transactions WHERE case_id = ${caseId}`;
      await tx`DELETE FROM case_files WHERE case_id = ${caseId}`;
    }
    if (caseId === null) {
      const [c] = await tx`INSERT INTO cases (case_no, title) VALUES (${caseNo}, ${input.title?.trim() || null}) RETURNING id::float8 AS id`;
      caseId = c.id as number;
    } else {
      await tx`UPDATE cases SET updated_at = now(), title = COALESCE(${input.title?.trim() || null}, title) WHERE id = ${caseId}`;
    }
    const [f] = await tx`INSERT INTO case_files (case_id, file_name) VALUES (${caseId}, ${input.fileName.slice(0, 500)}) RETURNING id::float8 AS id`;
    return { caseId, fileId: f.id as number };
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;

function sanitizeRow(r: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const f of CFR_FIELDS) {
    const v = r[f];
    if (v === null || v === undefined || v === "") {
      out[f] = null;
    } else if (NUMERIC_FIELDS.includes(f)) {
      const n = typeof v === "number" ? v : Number(v);
      out[f] = Number.isFinite(n) && Math.abs(n) < 1e17 ? n : null;
    } else if (DATE_FIELDS.includes(f)) {
      out[f] = typeof v === "string" && DATE_RE.test(v) ? v : null;
    } else if (f === "transfer_time") {
      out[f] = typeof v === "string" && TIME_RE.test(v) ? v : null;
    } else if (f === "timestamp_insert") {
      out[f] = typeof v === "string" && TS_RE.test(v) ? v : null;
    } else {
      out[f] = String(v).slice(0, 1000);
    }
  }
  const hash = typeof r.row_hash === "string" ? r.row_hash.slice(0, 64) : "";
  if (!hash) return null;
  out.row_hash = hash;
  return out;
}

export async function insertRows(caseId: number, fileId: number, rows: Record<string, unknown>[]) {
  const sql = await db();
  const clean = rows.map(sanitizeRow).filter(Boolean).map((r) => ({ ...r!, case_id: caseId, file_id: fileId }));
  if (!clean.length) return { inserted: 0, duplicates: 0 };
  const columns = ["case_id", "file_id", "row_hash", ...CFR_FIELDS];
  let inserted = 0;
  for (let i = 0; i < clean.length; i += 1000) {
    const chunk = clean.slice(i, i + 1000);
    const res = await sql`
      INSERT INTO transactions ${sql(chunk as Record<string, unknown>[] as never, columns as never)}
      ON CONFLICT (case_id, row_hash) DO NOTHING RETURNING 1`;
    inserted += res.length;
  }
  await sql`UPDATE case_files SET row_count = row_count + ${inserted} WHERE id = ${fileId}`;
  await sql`UPDATE cases SET updated_at = now() WHERE id = ${caseId}`;
  return { inserted, duplicates: clean.length - inserted };
}

/** ปิดการนำเข้าไฟล์: ถ้าไม่มีแถวใหม่เลย (ซ้ำทั้งหมด) ให้ลบประวัติไฟล์ทิ้ง */
export async function finishFile(caseId: number, fileId: number) {
  const sql = await db();
  const res = await sql`DELETE FROM case_files WHERE id = ${fileId} AND case_id = ${caseId} AND row_count = 0 RETURNING id`;
  return { removed: res.length > 0 };
}

export async function getTransactions(caseId: number, offset = 0, limit = 5000): Promise<Tx[]> {
  const sql = await db();
  return (await sql.unsafe(
    `SELECT ${TX_COLUMNS} FROM transactions WHERE case_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
    [caseId, Math.min(Math.max(limit, 1), 10000), Math.max(offset, 0)],
  )) as unknown as Tx[];
}

export async function updateCase(id: number, patch: { case_no?: string; title?: string | null; note?: string | null }) {
  const sql = await db();
  const [c] = await sql`
    UPDATE cases SET
      case_no = COALESCE(${patch.case_no?.trim() || null}, case_no),
      title = ${patch.title === undefined ? sql`title` : patch.title?.trim() || null},
      note = ${patch.note === undefined ? sql`note` : patch.note?.trim() || null},
      updated_at = now()
    WHERE id = ${id} RETURNING id::float8 AS id`;
  return !!c;
}

export async function deleteCases(ids: number[]) {
  const sql = await db();
  if (!ids.length) return 0;
  const res = await sql`DELETE FROM cases WHERE id = ANY(${ids}::bigint[]) RETURNING id`;
  return res.length;
}

export async function deleteFile(caseId: number, fileId: number) {
  const sql = await db();
  await sql`DELETE FROM transactions WHERE case_id = ${caseId} AND file_id = ${fileId}`;
  const res = await sql`DELETE FROM case_files WHERE case_id = ${caseId} AND id = ${fileId} RETURNING id`;
  await sql`UPDATE cases SET updated_at = now() WHERE id = ${caseId}`;
  return res.length > 0;
}

// ---------------------------------------------------------------------------
// รูปแบบการส่งออกที่ผู้ใช้นำเข้า
// ---------------------------------------------------------------------------
export interface TemplateRow {
  id: number;
  name: string;
  summary: string | null;
  spec: unknown;
  file_name: string | null;
  created_at: string;
}

export async function listTemplates(): Promise<TemplateRow[]> {
  const sql = await db();
  return (await sql`
    SELECT id::float8 AS id, name, summary, spec, file_name, created_at
    FROM export_templates ORDER BY id`) as unknown as TemplateRow[];
}

export async function getTemplate(id: number): Promise<(TemplateRow & { file_data: Buffer }) | null> {
  const sql = await db();
  const [r] = await sql`
    SELECT id::float8 AS id, name, summary, spec, file_name, created_at, file_data
    FROM export_templates WHERE id = ${id}`;
  return (r as unknown as TemplateRow & { file_data: Buffer }) ?? null;
}

export async function createTemplate(t: { name: string; summary: string | null; spec: unknown; fileName: string | null; file: Buffer }) {
  const sql = await db();
  const [r] = await sql`
    INSERT INTO export_templates (name, summary, spec, file_name, file_data)
    VALUES (${t.name}, ${t.summary}, ${sql.json(t.spec as never)}, ${t.fileName}, ${t.file})
    RETURNING id::float8 AS id, name, summary, spec, file_name, created_at`;
  return r as unknown as TemplateRow;
}

export async function updateTemplate(id: number, patch: { name?: string; spec?: unknown }) {
  const sql = await db();
  const [r] = await sql`
    UPDATE export_templates SET
      name = COALESCE(${patch.name ?? null}, name),
      spec = COALESCE(${patch.spec === undefined ? null : sql.json(patch.spec as never)}, spec)
    WHERE id = ${id}
    RETURNING id::float8 AS id, name, summary, spec, file_name, created_at`;
  return (r as unknown as TemplateRow) ?? null;
}

export async function deleteTemplate(id: number) {
  const sql = await db();
  const res = await sql`DELETE FROM export_templates WHERE id = ${id} RETURNING id`;
  return res.length > 0;
}
