import "server-only";
import postgres from "postgres";
import { pgConnection } from "./pg-options";
import { SCHEMA_SQL } from "./schema";

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { __cfrSql?: Sql; __cfrSchema?: Promise<void> };

export function databaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    undefined
  );
}

export class DbConfigError extends Error {
  constructor() {
    super("ยังไม่ได้ตั้งค่าฐานข้อมูล: กรุณากำหนดตัวแปร DATABASE_URL (หรือ POSTGRES_URL) เป็น connection string ของ PostgreSQL");
  }
}

function createClient(): Sql {
  const url = databaseUrl();
  if (!url) throw new DbConfigError();
  const conn = pgConnection(url);
  return postgres(conn.url, {
    max: process.env.VERCEL ? 1 : 5,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false, // รองรับ connection pooler (Neon / Supabase / PgBouncer)
    ssl: conn.ssl,
    onnotice: () => {},
  });
}

export function sql(): Sql {
  if (!globalForDb.__cfrSql) globalForDb.__cfrSql = createClient();
  return globalForDb.__cfrSql;
}

/** สร้างตาราง (ถ้ายังไม่มี) หนึ่งครั้งต่อ process */
export async function db(): Promise<Sql> {
  const s = sql();
  if (!globalForDb.__cfrSchema) {
    globalForDb.__cfrSchema = s.unsafe(SCHEMA_SQL).then(
      () => undefined,
      (e) => {
        globalForDb.__cfrSchema = undefined;
        throw e;
      },
    );
  }
  await globalForDb.__cfrSchema;
  return s;
}
