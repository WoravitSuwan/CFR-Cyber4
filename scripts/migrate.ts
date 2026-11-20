import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("กรุณากำหนด DATABASE_URL หรือ POSTGRES_URL");
  process.exit(1);
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const sql = postgres(url, { ssl: /sslmode=/.test(url) ? undefined : local ? false : "require", prepare: false, onnotice: () => {} });
await sql.unsafe(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
console.log("✔ สร้าง/อัปเดตตารางเรียบร้อย");
await sql.end();
