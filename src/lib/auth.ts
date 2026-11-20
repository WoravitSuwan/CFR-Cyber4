/** การป้องกันด้วยรหัสผ่าน (ใช้ได้ทั้ง Edge และ Node) — เปิดใช้เมื่อกำหนด APP_PASSWORD */
export const AUTH_COOKIE = "cfr_session";

export function authEnabled() {
  return !!process.env.APP_PASSWORD;
}

export async function sessionToken(password = process.env.APP_PASSWORD ?? ""): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`cfr-money-trail:${process.env.AUTH_SECRET ?? "v1"}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
