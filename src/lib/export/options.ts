import { DEFAULT_FLOW_OPTIONS, type FlowOptions } from "../flow";

export type TemplateId = "case-flow" | "case-flow-detail" | "transactions" | "accounts" | "raw" | "full";

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  short: string;
  description: string;
  sheets: string[];
  badge?: string;
}

export const TEMPLATES: TemplateMeta[] = [
  {
    id: "case-flow",
    name: "เส้นทางเงิน (แบบ 3.case)",
    short: "3.case",
    description: "Bank → on Bank → วันที่/เวลา/ยอดเงิน ต่อกันเป็นทอดๆ ในแถวเดียว ไล่สีตามชั้น ตรงกับไฟล์ตัวอย่าง",
    sheets: ["Sheet1"],
    badge: "ค่าเริ่มต้น",
  },
  {
    id: "case-flow-detail",
    name: "เส้นทางเงินแบบละเอียด",
    short: "ละเอียด",
    description: "เส้นทางเงินพร้อมชื่อเจ้าของบัญชี หัวตารางภาษาไทย แบ่งกลุ่มตามชั้นบัญชี และสรุปยอดหัวรายงาน",
    sheets: ["เส้นทางเงิน"],
  },
  {
    id: "transactions",
    name: "รายการธุรกรรม",
    short: "ธุรกรรม",
    description: "ธุรกรรมทั้งหมดเรียงตามเวลา พร้อมชั้นของบัญชี ตัวกรองอัตโนมัติ และแถวรวมยอด",
    sheets: ["ธุรกรรม"],
  },
  {
    id: "accounts",
    name: "สรุปบัญชีที่เกี่ยวข้อง",
    short: "บัญชี",
    description: "สรุปแต่ละบัญชี: ชั้น บทบาท (ต้นทาง/บัญชีทอด/ปลายทาง) ยอดรับ ยอดโอนออก และส่วนต่าง",
    sheets: ["บัญชี"],
  },
  {
    id: "raw",
    name: "ข้อมูลดิบ CFR",
    short: "ข้อมูลดิบ",
    description: "คอลัมน์ตามไฟล์ต้นฉบับของ CFR ครบทุกฟิลด์ (ข้อมูลที่ทำความสะอาดแล้ว)",
    sheets: ["Worksheet"],
  },
  {
    id: "full",
    name: "รายงานฉบับเต็ม",
    short: "ฉบับเต็ม",
    description: "รวมทุกรูปแบบไว้ในไฟล์เดียว แยกเป็นแผ่นงาน (Sheet) ละรูปแบบ",
    sheets: ["เส้นทางเงิน", "เส้นทางเงิน (ละเอียด)", "ธุรกรรม", "บัญชี", "ข้อมูลดิบ"],
  },
];

export type Era = "BE" | "CE";

export interface ExportOptions extends FlowOptions {
  template: TemplateId;
  maskAccounts: boolean;
  era: Era;
  /** รูปแบบชื่อไฟล์ รองรับ {case} {index} {title} {template} {date} */
  fileNamePattern: string;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  ...DEFAULT_FLOW_OPTIONS,
  template: "case-flow",
  maskAccounts: true,
  era: "BE",
  fileNamePattern: "3.case_{case}",
};

export function templateMeta(id: TemplateId): TemplateMeta {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

export function buildFileName(
  pattern: string,
  vars: { caseNo: string; index: number; title?: string | null; template: TemplateId },
): string {
  const today = new Date();
  const ymd = `${today.getFullYear() + 543}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const name = (pattern || DEFAULT_EXPORT_OPTIONS.fileNamePattern)
    .replaceAll("{case}", vars.caseNo)
    .replaceAll("{index}", String(vars.index))
    .replaceAll("{title}", vars.title ?? "")
    .replaceAll("{template}", templateMeta(vars.template).short)
    .replaceAll("{date}", ymd)
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
    .trim();
  return `${name || `case_${vars.caseNo}`}.xlsx`;
}
