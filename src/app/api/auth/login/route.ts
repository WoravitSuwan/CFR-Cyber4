import { NextResponse } from "next/server";
import { AUTH_COOKIE, authEnabled, safeEqual, sessionToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!authEnabled()) return NextResponse.json({ ok: true });
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const given = await sessionToken(String(body.password ?? ""));
  const expected = await sessionToken();
  if (!safeEqual(given, expected)) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "รหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
