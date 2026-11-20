import { CFR_FIELDS, type CfrField, type TxRecord } from "./types";

export type CellValue = string | number | boolean | Date | null | undefined;

/** ชื่อหัวคอลัมน์อื่นๆ (เช่น ภาษาไทย) ที่ map เข้ากับฟิลด์มาตรฐาน */
const HEADER_ALIASES: Record<string, CfrField> = {
  "ธนาคารต้นทาง": "from_bank_short_name",
  "รหัสธนาคารต้นทาง": "from_bank_code",
  "เลขบัญชีต้นทาง": "from_account_no",
  "บัญชีต้นทาง": "from_account_no",
  "ชื่อบัญชีต้นทาง": "from_account_name",
  "ธนาคารปลายทาง": "to_bank_short_name",
  "รหัสธนาคารปลายทาง": "to_bank_code",
  "สาขา": "to_bank_branch",
  "เลขบัญชีปลายทาง": "to_account_no",
  "บัญชีปลายทาง": "to_account_no",
  "ชื่อบัญชีปลายทาง": "to_account_name",
  "เลขประจำตัว": "to_id",
  "เลขบัตรประชาชน": "to_id",
  "ประเภทบัตร": "to_id_type",
  "ชื่อ": "first_name",
  "นามสกุล": "last_name",
  "เบอร์โทร": "phone_number",
  "เบอร์โทรศัพท์": "phone_number",
  "วันที่โอน": "transfer_date",
  "วันที่": "transfer_date",
  "เวลาโอน": "transfer_time",
  "เวลา": "transfer_time",
  "จำนวนเงิน": "transfer_amount",
  "ยอดเงิน": "transfer_amount",
  "ช่องทาง": "transfer_channel",
  "รายละเอียด": "transfer_description",
  "เลขอ้างอิง": "transfer_ref",
  "ยอดคงเหลือ": "to_balance",
};

const FIELD_SET = new Set<string>(CFR_FIELDS);

export function normalizeHeader(h: CellValue): CfrField | null {
  if (h === null || h === undefined) return null;
  const s = String(h).trim();
  if (!s) return null;
  const snake = s.toLowerCase().replace(/[\s\-.]+/g, "_");
  if (FIELD_SET.has(snake)) return snake as CfrField;
  return HEADER_ALIASES[s] ?? null;
}

/** หาแถวหัวตาราง: แถวแรกที่มีชื่อคอลัมน์ที่รู้จักอย่างน้อย 3 คอลัมน์ (ค้นใน 15 แถวแรก) */
export function detectHeaderRow(rows: CellValue[][]): { index: number; map: (CfrField | null)[] } | null {
  const limit = Math.min(rows.length, 15);
  for (let i = 0; i < limit; i++) {
    const map = (rows[i] ?? []).map(normalizeHeader);
    const known = new Set(map.filter(Boolean));
    if (known.size >= 3 && (known.has("from_account_no") || known.has("to_account_no"))) {
      return { index: i, map };
    }
  }
  return null;
}

const pad = (n: number, l = 2) => String(n).padStart(l, "0");

/** แปลงปี พ.ศ. → ค.ศ. (ถ้าปีมากกว่า 2400 ถือว่าเป็น พ.ศ.) */
const toCE = (y: number) => (y > 2400 ? y - 543 : y);

function isValidYMD(y: number, m: number, d: number) {
  return y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/** Excel serial → { y, m, d, frac } (ระบบ 1900) */
function fromExcelSerial(serial: number) {
  const ms = Math.round((serial - 25569) * 86400000);
  const dt = new Date(ms);
  return dt;
}

/** แปลงค่าใดๆ ให้เป็นวันที่ ค.ศ. รูปแบบ YYYY-MM-DD */
export function normalizeDate(v: CellValue): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const y = toCE(v.getUTCFullYear());
    const m = v.getUTCMonth() + 1;
    const d = v.getUTCDate();
    return isValidYMD(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }
  if (typeof v === "number") {
    if (v > 1000 && v < 2958466) return normalizeDate(fromExcelSerial(Math.floor(v)));
    return null;
  }
  const s = String(v).trim();
  if (!s) return null;
  // YYYY-MM-DD / YYYY/MM/DD (อาจมีเวลาต่อท้าย)
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const y = toCE(+m[1]);
    if (isValidYMD(y, +m[2], +m[3])) return `${y}-${pad(+m[2])}-${pad(+m[3])}`;
  }
  // DD/MM/YYYY หรือ DD-MM-YYYY (รูปแบบไทย)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += y > 40 ? 2500 : 2000; // 67 → 2567, 24 → 2024
    y = toCE(y);
    if (isValidYMD(y, +m[2], +m[1])) return `${y}-${pad(+m[2])}-${pad(+m[1])}`;
  }
  // YYYYMMDD
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const y = toCE(+m[1]);
    if (isValidYMD(y, +m[2], +m[3])) return `${y}-${m[2]}-${m[3]}`;
  }
  return null;
}

/** แปลงค่าใดๆ ให้เป็นเวลา HH:MM:SS */
export function normalizeTime(v: CellValue): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  }
  if (typeof v === "number") {
    const frac = v - Math.floor(v);
    if (v >= 0 && (v < 1 || frac > 0)) {
      const secs = Math.round(frac * 86400) % 86400;
      return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
    }
    // 935 → 09:35, 93512 → 09:35:12
    if (Number.isInteger(v) && v >= 0 && v <= 235959) return normalizeTime(String(v).padStart(v > 2359 ? 6 : 4, "0"));
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/);
  if (m && +m[1] < 24 && +m[2] < 60) return `${pad(+m[1])}:${m[2]}:${m[3] ?? "00"}`;
  m = s.match(/^(\d{2})(\d{2})(\d{2})?$/);
  if (m && +m[1] < 24 && +m[2] < 60) return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
  return null;
}

/** แปลง timestamp (อาจเป็น พ.ศ.) → 'YYYY-MM-DD HH:MM:SS' (ค.ศ.) */
export function normalizeTimestamp(v: CellValue): string | null {
  const d = normalizeDate(v);
  if (!d) return null;
  let t: string | null = null;
  if (v instanceof Date) t = normalizeTime(v);
  else if (typeof v === "number") t = normalizeTime(v);
  else {
    const m = String(v).match(/[ T](\d{1,2}[:.]\d{2}(?:[:.]\d{2})?)/);
    t = m ? normalizeTime(m[1]) : null;
  }
  return `${d} ${t ?? "00:00:00"}`;
}

export function normalizeNumber(v: CellValue): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "boolean" || v instanceof Date) return null;
  const s = String(v).replace(/[,\s฿]/g, "").replace(/บาท$/, "");
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/** ข้อความทั่วไป: ตัวเลขยาวแปลงเป็นข้อความโดยไม่มีทศนิยม/สัญกรณ์วิทยาศาสตร์ */
export function normalizeText(v: CellValue): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === "number") {
    if (Number.isInteger(v)) return BigInt(v).toString();
    return String(v);
  }
  const s = String(v).replace(/ /g, " ").trim();
  return s === "" ? null : s;
}

/** เลขบัญชี/เลขประจำตัว: ลบช่องว่าง ขีด และเครื่องหมายคำพูดนำหน้า */
export function normalizeAccount(v: CellValue): string | null {
  const s = normalizeText(v);
  if (!s) return null;
  const cleaned = s.replace(/^'+/, "").replace(/[\s-]/g, "");
  return cleaned === "" ? null : cleaned;
}

const ACCOUNT_FIELDS = new Set<CfrField>(["from_account_no", "to_account_no", "to_id", "promptpay_id", "phone_number"]);
const CODE_FIELDS = new Set<CfrField>(["from_bank_code", "to_bank_code"]);

/** แปลงข้อมูลหนึ่งแถว (ตาม header map) ให้เป็น TxRecord */
export function normalizeRow(cells: CellValue[], map: (CfrField | null)[]): TxRecord | null {
  const rec = Object.fromEntries(CFR_FIELDS.map((f) => [f, null])) as unknown as TxRecord;
  let filled = 0;
  map.forEach((field, i) => {
    if (!field) return;
    const v = cells[i];
    let out: string | number | null;
    switch (field) {
      case "transfer_amount":
      case "to_balance":
        out = normalizeNumber(v);
        break;
      case "transfer_date":
      case "to_open_date":
      case "to_close_date":
        out = normalizeDate(v);
        break;
      case "transfer_time":
        out = normalizeTime(v);
        break;
      case "timestamp_insert":
        out = normalizeTimestamp(v);
        break;
      default:
        if (ACCOUNT_FIELDS.has(field)) out = normalizeAccount(v);
        else if (CODE_FIELDS.has(field)) {
          const t = normalizeText(v);
          out = t && /^\d{1,3}$/.test(t) ? t.padStart(3, "0") : t;
        } else out = normalizeText(v);
    }
    if (out !== null) filled++;
    (rec as Record<string, unknown>)[field] = out;
  });
  if (!filled) return null;
  // ต้องมีบัญชีต้นทางหรือปลายทางอย่างน้อยหนึ่งฝั่ง
  if (!rec.from_account_no && !rec.to_account_no) return null;
  // ชื่อบัญชีปลายทางว่าง → ใช้ชื่อ-นามสกุล
  if (!rec.to_account_name && (rec.first_name || rec.last_name)) {
    rec.to_account_name = [rec.first_name, rec.last_name].filter(Boolean).join(" ");
  }
  return rec;
}

/** ดึงเลขคดีจากชื่อไฟล์หรือ path เช่น "3.case_150225671.xlsx" → "150225671" */
export function extractCaseNo(path: string): string | null {
  const segments = path.split(/[\\/]/).reverse();
  for (const seg of segments) {
    const name = seg.replace(/\.[a-z0-9]+$/i, "");
    const m = name.match(/(?:case|คดี|เคส)[\s_#:\-.]*([A-Za-z0-9\-]*\d{4,}[A-Za-z0-9\-]*)/i);
    if (m) return m[1];
  }
  for (const seg of segments) {
    const name = seg.replace(/\.[a-z0-9]+$/i, "");
    const runs = name.match(/\d{6,}/g);
    if (runs) return runs.sort((a, b) => b.length - a.length)[0];
  }
  return null;
}
