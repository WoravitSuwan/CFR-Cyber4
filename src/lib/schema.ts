// สร้างจาก db/schema.sql — แก้ไขทั้งสองที่ให้ตรงกัน (มี test ตรวจสอบ)
export const SCHEMA_SQL = `-- CFR Money Trail — โครงสร้างฐานข้อมูล PostgreSQL
-- รันซ้ำได้ (idempotent) ระบบจะสร้างตารางให้อัตโนมัติเมื่อเรียกใช้ครั้งแรก

CREATE TABLE IF NOT EXISTS cases (
  id          BIGSERIAL PRIMARY KEY,
  case_no     TEXT        NOT NULL,
  title       TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cases_case_no_idx ON cases (case_no);

CREATE TABLE IF NOT EXISTS case_files (
  id           BIGSERIAL PRIMARY KEY,
  case_id      BIGINT      NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  file_name    TEXT        NOT NULL,
  row_count    INTEGER     NOT NULL DEFAULT 0,
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_files_case_idx ON case_files (case_id);

CREATE TABLE IF NOT EXISTS transactions (
  id                       BIGSERIAL PRIMARY KEY,
  case_id                  BIGINT  NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  file_id                  BIGINT  REFERENCES case_files(id) ON DELETE SET NULL,
  row_hash                 TEXT    NOT NULL,
  response_id              TEXT,
  bank_case_id             TEXT,
  timestamp_insert         TIMESTAMP,
  from_bank_code           TEXT,
  from_bank_short_name     TEXT,
  from_account_no          TEXT,
  from_account_name        TEXT,
  to_bank_code             TEXT,
  to_bank_short_name       TEXT,
  to_bank_branch           TEXT,
  to_id_type               TEXT,
  to_id                    TEXT,
  first_name               TEXT,
  last_name                TEXT,
  phone_number             TEXT,
  promptpay_type           TEXT,
  promptpay_id             TEXT,
  to_account_no            TEXT,
  to_account_name          TEXT,
  to_account_status        TEXT,
  to_open_date             DATE,
  to_close_date            DATE,
  to_balance               NUMERIC(20, 2),
  transfer_date            DATE,
  transfer_channel         TEXT,
  transfer_channel_detail  TEXT,
  transfer_time            TIME,
  transfer_amount          NUMERIC(20, 2),
  transfer_description     TEXT,
  transfer_ref             TEXT,
  CONSTRAINT transactions_case_row_uq UNIQUE (case_id, row_hash)
);
CREATE INDEX IF NOT EXISTS transactions_case_idx ON transactions (case_id, transfer_date, transfer_time);
CREATE INDEX IF NOT EXISTS transactions_from_acct_idx ON transactions (from_account_no);
CREATE INDEX IF NOT EXISTS transactions_to_acct_idx ON transactions (to_account_no);

-- รูปแบบการส่งออกที่ผู้ใช้นำเข้า (ไฟล์ Excel ตัวอย่าง + ผลวิเคราะห์)
CREATE TABLE IF NOT EXISTS export_templates (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  summary     TEXT,
  spec        JSONB       NOT NULL,
  file_name   TEXT,
  file_data   BYTEA       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
