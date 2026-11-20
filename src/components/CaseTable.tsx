"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Download, FileSpreadsheet, FolderOpen, Loader2, Search, Trash2 } from "lucide-react";
import type { CaseSummary } from "@/lib/types";
import { api, downloadBlob, exportCase, fmtDate, fmtDateTime, fmtInt, fmtMoney } from "@/lib/client";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/export/options";
import { Badge, Button, Card, CardHeader, Empty, Spinner, cx, useToast } from "./ui";

export function CaseTable({
  cases,
  loading,
  query,
  onQuery,
  onChanged,
}: {
  cases: CaseSummary[];
  loading: boolean;
  query: string;
  onQuery: (q: string) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const allSelected = cases.length > 0 && cases.every((c) => sel.has(c.id));
  const toggle = (id: number) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function quickExport(c: CaseSummary) {
    setBusyId(c.id);
    try {
      const f = await exportCase(c, DEFAULT_EXPORT_OPTIONS, 1);
      downloadBlob(f.blob, f.fileName);
      toast("success", "ดาวน์โหลดแล้ว", f.fileName);
    } catch (e) {
      toast("error", "ส่งออกไม่สำเร็จ", e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function removeSelected() {
    const ids = [...sel];
    if (!ids.length) return;
    if (!confirm(`ยืนยันการลบ ${ids.length} คดี และธุรกรรมทั้งหมดในคดี? การลบไม่สามารถย้อนกลับได้`)) return;
    setDeleting(true);
    try {
      await api("/api/cases", { method: "DELETE", body: JSON.stringify({ ids }) });
      setSel(new Set());
      toast("success", `ลบ ${ids.length} คดีแล้ว`);
      onChanged();
    } catch (e) {
      toast("error", "ลบไม่สำเร็จ", e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  const selectedIds = [...sel].filter((id) => cases.some((c) => c.id === id));

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<FolderOpen className="size-5" />}
        title="คดีในระบบ"
        subtitle="เลือกคดีเพื่อดูเส้นทางเงิน หรือเลือกหลายคดีเพื่อส่งออกพร้อมกัน"
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="ค้นหาเลขคดี เลขบัญชี ชื่อ..."
              className="h-9 w-64 rounded-xl border border-line bg-surface-2 pr-3 pl-9 text-[13px] outline-none focus:border-primary focus:bg-surface"
            />
          </div>
        }
      />

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-primary-soft/60 px-5 py-2.5 sm:px-6">
          <span className="text-[13px] font-medium text-primary-text">เลือก {selectedIds.length} คดี</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="primary" icon={<FileSpreadsheet className="size-4" />} onClick={() => router.push(`/export?ids=${selectedIds.join(",")}`)}>
              ส่งออกที่เลือก
            </Button>
            <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} loading={deleting} onClick={removeSelected}>
              ลบ
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}

      {loading && !cases.length ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !cases.length ? (
        <Empty icon={<FolderOpen className="size-6" />} title={query ? "ไม่พบคดีที่ค้นหา" : "ยังไม่มีคดีในระบบ"}>
          {query ? "ลองค้นหาด้วยคำอื่น" : "เริ่มต้นโดยนำเข้าไฟล์ข้อมูลดิบจาก CFR ด้านบน"}
        </Empty>
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-[12px] text-ink-2">
                <th className="w-12 py-3 pl-5 sm:pl-6">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={allSelected}
                    onChange={() => setSel(allSelected ? new Set() : new Set(cases.map((c) => c.id)))}
                    aria-label="เลือกทั้งหมด"
                  />
                </th>
                <th className="py-3 font-medium">เลขคดี</th>
                <th className="py-3 font-medium">ช่วงวันที่โอน</th>
                <th className="py-3 text-right font-medium">ธุรกรรม</th>
                <th className="py-3 text-right font-medium">บัญชี</th>
                <th className="py-3 text-right font-medium">ยอดรวม (บาท)</th>
                <th className="py-3 pl-6 font-medium">อัปเดต</th>
                <th className="py-3 pr-5 text-right font-medium sm:pr-6">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {cases.map((c) => (
                <tr key={c.id} className={cx("group transition-colors hover:bg-surface-2", sel.has(c.id) && "bg-primary-soft/40")}>
                  <td className="py-3 pl-5 sm:pl-6">
                    <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={`เลือก ${c.case_no}`} />
                  </td>
                  <td className="py-3">
                    <Link href={`/cases/${c.id}`} className="block">
                      <div className="font-mono font-semibold text-ink group-hover:text-primary">{c.case_no}</div>
                      <div className="flex items-center gap-1.5 text-[12px] text-ink-3">
                        {c.title ? <span className="max-w-64 truncate text-ink-2">{c.title}</span> : null}
                        <Badge>{c.file_count} ไฟล์</Badge>
                        {c.bank_case_ids.slice(0, 1).map((b) => (
                          <span key={b} className="font-mono">
                            {b}
                          </span>
                        ))}
                      </div>
                    </Link>
                  </td>
                  <td className="py-3 text-ink-2">
                    {c.first_date ? (
                      <>
                        {fmtDate(c.first_date)}
                        {c.last_date && c.last_date !== c.first_date ? ` – ${fmtDate(c.last_date)}` : ""}
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-3 text-right font-medium text-ink">{fmtInt(c.tx_count)}</td>
                  <td className="py-3 text-right text-ink-2">{fmtInt(c.account_count)}</td>
                  <td className="py-3 text-right font-semibold text-ink">{fmtMoney(c.total_amount)}</td>
                  <td className="py-3 pl-6 text-[12.5px] text-ink-2">{fmtDateTime(c.updated_at)}</td>
                  <td className="py-3 pr-5 sm:pr-6">
                    <div className="flex justify-end gap-1">
                      <button
                        className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-primary-soft hover:text-primary-text"
                        title="ดาวน์โหลด Excel (แบบ 3.case)"
                        onClick={() => quickExport(c)}
                        disabled={busyId === c.id}
                      >
                        {busyId === c.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                      </button>
                      <Link href={`/cases/${c.id}`} className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-3 hover:text-ink" title="ดูรายละเอียด">
                        <ChevronRight className="size-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
