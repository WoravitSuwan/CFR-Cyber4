import "server-only";
import { NextResponse } from "next/server";
import { DbConfigError } from "./db";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return json({ error: message, ...extra }, { status });
}

export function parseId(v: string): number | null {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** ครอบ route handler ให้คืน error เป็น JSON ภาษาไทย */
export function route<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof DbConfigError) return fail(e.message, 503, { code: "DB_NOT_CONFIGURED" });
      const err = e as { code?: string; message?: string };
      if (err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND" || err?.code === "CONNECT_TIMEOUT")
        return fail("เชื่อมต่อฐานข้อมูล PostgreSQL ไม่ได้ กรุณาตรวจสอบ DATABASE_URL", 503, { code: "DB_UNREACHABLE" });
      console.error(e);
      return fail(err?.message || "เกิดข้อผิดพลาดภายในระบบ", 500);
    }
  };
}
