/**
 * โครงสร้างข้อมูลธุรกรรมตามรูปแบบไฟล์ข้อมูลดิบของ CFR (Central Fraud Registry)
 * ชื่อฟิลด์ตรงกับหัวคอลัมน์ในไฟล์ต้นฉบับและคอลัมน์ในตาราง PostgreSQL
 */
export const CFR_FIELDS = [
  "response_id",
  "bank_case_id",
  "timestamp_insert",
  "from_bank_code",
  "from_bank_short_name",
  "from_account_no",
  "from_account_name",
  "to_bank_code",
  "to_bank_short_name",
  "to_bank_branch",
  "to_id_type",
  "to_id",
  "first_name",
  "last_name",
  "phone_number",
  "promptpay_type",
  "promptpay_id",
  "to_account_no",
  "to_account_name",
  "to_account_status",
  "to_open_date",
  "to_close_date",
  "to_balance",
  "transfer_date",
  "transfer_channel",
  "transfer_channel_detail",
  "transfer_time",
  "transfer_amount",
  "transfer_description",
  "transfer_ref",
] as const;

export type CfrField = (typeof CFR_FIELDS)[number];

/** ฟิลด์ที่เป็นตัวเลข */
export const NUMERIC_FIELDS: CfrField[] = ["to_balance", "transfer_amount"];
/** ฟิลด์ที่เป็นวันที่ (เก็บเป็น ค.ศ. YYYY-MM-DD) */
export const DATE_FIELDS: CfrField[] = ["to_open_date", "to_close_date", "transfer_date"];

/** ธุรกรรมที่ผ่านการทำความสะอาดแล้ว (วันที่เป็น ค.ศ. 'YYYY-MM-DD', เวลา 'HH:MM:SS') */
export type TxRecord = {
  [K in CfrField]: K extends "to_balance" | "transfer_amount" ? number | null : string | null;
};

/** ธุรกรรมที่อ่านจากฐานข้อมูล */
export interface Tx extends TxRecord {
  id: number;
}

export interface CaseSummary {
  id: number;
  case_no: string;
  title: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  tx_count: number;
  total_amount: number;
  account_count: number;
  file_count: number;
  first_date: string | null;
  last_date: string | null;
  bank_case_ids: string[];
}

export interface CaseFile {
  id: number;
  file_name: string;
  row_count: number;
  imported_at: string;
}

export type ImportMode = "append" | "replace" | "new";
