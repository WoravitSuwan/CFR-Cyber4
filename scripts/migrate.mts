import { readFileSync } from "node:fs";
import postgres from "postgres";
import { pgConnection } from "../src/lib/pg-options.ts";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("กรุณากำหนด DATABASE_URL หรือ POSTGRES_URL");
  process.exit(1);
}
const conn = pgConnection(url);
const sql = postgres(conn.url, { ssl: conn.ssl, prepare: false, onnotice: () => {} });
await sql.unsafe(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
console.log("✔ สร้าง/อัปเดตตารางเรียบร้อย");
await sql.end();
