/**
 * แปลง connection string เป็น (url, ssl) สำหรับ postgres.js
 * - postgres.js ถือว่า key `ssl` ที่ส่งมา (แม้ค่าเป็น undefined) คือการตั้งค่าโดยตรง จึงต้องกำหนดค่าเองเสมอ
 * - ตัด sslmode / channel_binding ออกจาก URL (Neon ใส่มา) เพื่อไม่ให้ถูกส่งเป็น startup parameter
 */
export function pgConnection(raw: string): { url: string; ssl: false | "require" | "prefer" } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { url: raw, ssl: "require" };
  }
  const mode = (url.searchParams.get("sslmode") ?? "").toLowerCase();
  for (const k of ["sslmode", "channel_binding", "ssl"]) url.searchParams.delete(k);
  const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  let ssl: false | "require" | "prefer";
  if (mode === "disable") ssl = false;
  else if (mode === "prefer" || mode === "allow") ssl = "prefer";
  else if (mode) ssl = "require"; // require / verify-ca / verify-full
  else ssl = local ? false : "require";
  return { url: url.toString(), ssl };
}
