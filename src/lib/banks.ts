export interface BankInfo {
  code: string;
  short: string;
  name: string;
  color: string;
}

/** ธนาคารในประเทศไทย (รหัสตามธนาคารแห่งประเทศไทย) */
export const BANKS: BankInfo[] = [
  { code: "002", short: "BBL", name: "ธนาคารกรุงเทพ", color: "#1e4598" },
  { code: "004", short: "KBNK", name: "ธนาคารกสิกรไทย", color: "#138f2d" },
  { code: "006", short: "KTB", name: "ธนาคารกรุงไทย", color: "#1ba5e1" },
  { code: "011", short: "TTB", name: "ธนาคารทหารไทยธนชาต", color: "#0050f0" },
  { code: "014", short: "SCB", name: "ธนาคารไทยพาณิชย์", color: "#4e2e7f" },
  { code: "017", short: "CITI", name: "ธนาคารซิตี้แบงก์", color: "#1576bc" },
  { code: "018", short: "SMBC", name: "ธนาคารซูมิโตโม มิตซุย", color: "#0b7f4b" },
  { code: "020", short: "SCBT", name: "ธนาคารสแตนดาร์ดชาร์เตอร์ด", color: "#0f6e3b" },
  { code: "022", short: "CIMBT", name: "ธนาคารซีไอเอ็มบี ไทย", color: "#7e2f36" },
  { code: "024", short: "UOBT", name: "ธนาคารยูโอบี", color: "#0b3979" },
  { code: "025", short: "BAY", name: "ธนาคารกรุงศรีอยุธยา", color: "#d4a20a" },
  { code: "030", short: "GSB", name: "ธนาคารออมสิน", color: "#eb198d" },
  { code: "031", short: "HSBC", name: "ธนาคารเอชเอสบีซี", color: "#db0011" },
  { code: "033", short: "GHB", name: "ธนาคารอาคารสงเคราะห์", color: "#f57d23" },
  { code: "034", short: "BAAC", name: "ธ.ก.ส.", color: "#4b9b1d" },
  { code: "035", short: "EXIM", name: "ธนาคารเพื่อการส่งออกฯ", color: "#0d4a8f" },
  { code: "039", short: "MHCB", name: "ธนาคารมิซูโฮ", color: "#00205b" },
  { code: "045", short: "BNPP", name: "ธนาคารบีเอ็นพี พารีบาส์", color: "#00965e" },
  { code: "066", short: "ISBT", name: "ธนาคารอิสลามแห่งประเทศไทย", color: "#00703c" },
  { code: "067", short: "TISCO", name: "ธนาคารทิสโก้", color: "#12549f" },
  { code: "069", short: "KKP", name: "ธนาคารเกียรตินาคินภัทร", color: "#635f98" },
  { code: "070", short: "ICBCT", name: "ธนาคารไอซีบีซี (ไทย)", color: "#c50f1c" },
  { code: "071", short: "TCRB", name: "ธนาคารไทยเครดิต", color: "#00a19a" },
  { code: "073", short: "LHBANK", name: "ธนาคารแลนด์ แอนด์ เฮ้าส์", color: "#6d6e71" },
  { code: "098", short: "SME", name: "ธนาคารพัฒนาวิสาหกิจฯ (SME D Bank)", color: "#0a5ea8" },
];

const byCode = new Map(BANKS.map((b) => [b.code, b]));
const byShort = new Map(BANKS.map((b) => [b.short.toUpperCase(), b]));

export function bankShort(code: string | null | undefined, short: string | null | undefined): string {
  if (short && short.trim()) return short.trim();
  if (code) {
    const b = byCode.get(code.padStart(3, "0"));
    if (b) return b.short;
    return code;
  }
  return "-";
}

export function bankInfo(code: string | null | undefined, short: string | null | undefined): BankInfo | undefined {
  if (short) {
    const b = byShort.get(short.trim().toUpperCase());
    if (b) return b;
  }
  if (code) return byCode.get(code.padStart(3, "0"));
  return undefined;
}

export function bankColor(code: string | null | undefined, short: string | null | undefined): string {
  const b = bankInfo(code, short);
  if (b) return b.color;
  // สีคงที่จาก hash ของชื่อธนาคาร
  const key = (short || code || "?").toUpperCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 45%)`;
}
