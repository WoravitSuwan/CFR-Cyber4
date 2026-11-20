import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authEnabled, safeEqual, sessionToken } from "./lib/auth";

export async function middleware(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/") || pathname === "/api/health") return NextResponse.next();
  const cookie = req.cookies.get(AUTH_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, await sessionToken())) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
