"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  CalendarRange,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  GitBranch,
  ListOrdered,
  Pencil,
  Receipt,
  Save,
  Search,
  Settings2,
  Table2,
  Trash2,
  Users,
  Workflow,
  X,
} from "lucide-react";
import type { CaseFile, CaseSummary, Tx } from "@/lib/types";
import { analyzeFlow, maskAccount, sortTx } from "@/lib/flow";
import { bankColor, bankShort } from "@/lib/banks";
import { TEMPLATES, type TemplateKey } from "@/lib/export/options";
import { useCustomTemplates } from "./useCustomTemplates";
import { api, downloadBlob, exportCase, fetchAllTransactions, fmtDate, fmtDateTime, fmtInt, fmtMoney, fmtTime } from "@/lib/client";
import { CaseGridPreview } from "./CaseGridPreview";
import { ExportOptionsPanel, useExportOptions } from "./ExportOptionsPanel";
import { FlowGraph } from "./FlowGraph";
import { Badge, BankChip, Button, Card, CardHeader, Empty, Spinner, Stat, cx, useToast } from "./ui";

type Detail = CaseSummary & { files: CaseFile[] };
type Tab = "graph" | "preview" | "tx" | "accounts";

const ROLE_TH = { source: "ต้นทาง", mule: "บัญชีทอด", sink: "ปลายทาง" } as const;
const ROLE_TONE = { source: "danger", mule: "warn", sink: "accent" } as const;

export function CaseDetail({ id }: { id: number }) {
  const toast = useToast();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("graph");
  const [opts, update] = useExportOptions();
  const { list: customList } = useCustomTemplates();
  const [showOpts, setShowOpts] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ case_no: "", title: "", note: "" });
  const [txQuery, setTxQuery] = useState("");
  const [revealed, setRevealed] = useState(false);

  async function load() {
    try {
      const [d, t] = await Promise.all([api<{ case: Detail }>(`/api/cases/${id}`), fetchAllTransactions(id)]);
      setDetail(d.case);
      setTxs(t);
      setForm({ case_no: d.case.case_no, title: d.case.title ?? "", note: d.case.note ?? "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const flow = useMemo(() => (txs ? analyzeFlow(txs, opts) : null), [txs, opts]);
  const mask = opts.maskAccounts && !revealed;

  const sortedTx = useMemo(() => {
    if (!txs) return [];
    const s = txQuery.trim().toLowerCase();
    const list = sortTx(txs);
    if (!s) return list;
    return list.filter((t) =>
      [t.from_account_no, t.to_account_no, t.from_account_name, t.to_account_name, t.to_id, t.from_bank_short_name, t.to_bank_short_name, String(t.transfer_amount ?? "")]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [txs, txQuery]);

  async function doExport(template?: TemplateKey) {
    if (!detail || !txs) return;
    setExporting(true);
    try {
      const f = await exportCase(detail, template ? { ...opts, template } : opts, 1, txs);
      downloadBlob(f.blob, f.fileName);
      toast("success", "ดาวน์โหลดแล้ว", f.fileName);
    } catch (e) {
      toast("error", "ส่งออกไม่สำเร็จ", e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  async function save() {
    try {
      const r = await api<{ case: Detail }>(`/api/cases/${id}`, { method: "PATCH", body: JSON.stringify(form) });
      setDetail(r.case);
      setEditing(false);
      toast("success", "บันทึกแล้ว");
    } catch (e) {
      toast("error", "บันทึกไม่สำเร็จ", e instanceof Error ? e.message : String(e));
    }
  }

  async function removeCase() {
    if (!confirm(`ยืนยันการลบคดี ${detail?.case_no} และธุรกรรมทั้งหมด?`)) return;
    await api(`/api/cases/${id}`, { method: "DELETE" });
    toast("success", "ลบคดีแล้ว");
    router.push("/");
  }

  async function removeFile(f: CaseFile) {
    if (!confirm(`ลบไฟล์ ${f.file_name} และธุรกรรมที่นำเข้าจากไฟล์นี้?`)) return;
    await api(`/api/cases/${id}/files/${f.id}`, { method: "DELETE" });
    toast("success", "ลบไฟล์แล้ว");
    setTxs(null);
    load();
  }

  if (error)
    return (
      <Card>
        <Empty icon={<X className="size-6" />} title="ไม่สามารถโหลดคดีได้">
          {error}
          <div className="mt-3">
            <Link href="/" className="text-primary hover:underline">
              กลับหน้าหลัก
            </Link>
          </div>
        </Empty>
      </Card>
    );

  if (!detail || !txs || !flow)
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-ink-2">
        <Spinner className="size-7" />
        กำลังโหลดข้อมูลคดี...
      </div>
    );

  const accounts = [...flow.accounts.values()].sort((a, b) => a.level - b.level || b.inAmount - a.inAmount);
  const hops = Math.max(0, flow.depth - 1);

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "graph", label: "แผนภาพเส้นทางเงิน", icon: <Workflow className="size-4" /> },
    { id: "preview", label: "ตัวอย่างไฟล์ 3.case", icon: <Table2 className="size-4" />, count: flow.chains.length },
    { id: "tx", label: "ธุรกรรม", icon: <ListOrdered className="size-4" />, count: txs.length },
    { id: "accounts", label: "บัญชี", icon: <Users className="size-4" />, count: flow.accounts.size },
  ];

  return (
    <div className="space-y-6">
      <div className="animate-fade-up flex flex-wrap items-start gap-4 pt-1">
        <Link href="/" className="mt-1 grid size-10 place-items-center rounded-xl border border-line bg-surface text-ink-2 hover:text-ink">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="grid max-w-2xl gap-2">
              <input
                value={form.case_no}
                onChange={(e) => setForm({ ...form, case_no: e.target.value })}
                className="h-11 rounded-xl border border-line bg-surface px-3 font-mono text-lg font-semibold outline-none focus:border-primary"
                placeholder="เลขคดี"
              />
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-10 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-primary"
                placeholder="ชื่อคดี / ผู้เสียหาย"
              />
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="หมายเหตุ"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="primary" icon={<Save className="size-4" />} onClick={save}>
                  บันทึก
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
                <span>คดี</span>
                {detail.bank_case_ids.map((b) => (
                  <Badge key={b} className="font-mono">
                    {b}
                  </Badge>
                ))}
              </div>
              <h1 className="flex items-center gap-2 font-mono text-2xl font-semibold tracking-tight text-ink sm:text-[30px]">
                {detail.case_no}
                <button className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-3 hover:text-ink" onClick={() => setEditing(true)} title="แก้ไข">
                  <Pencil className="size-4" />
                </button>
              </h1>
              {detail.title && <div className="text-[15px] text-ink-2">{detail.title}</div>}
              {detail.note && <div className="mt-1 max-w-3xl text-[13px] whitespace-pre-wrap text-ink-3">{detail.note}</div>}
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={opts.template}
            onChange={(e) => {
              const v = e.target.value as TemplateKey;
              const ct = customList.find((t) => `custom:${t.id}` === v);
              update({ template: v, ...(ct?.spec.mode === "flow" ? { mergeRepeated: ct.spec.mergeRepeated } : {}) });
            }}
            className="h-10 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-primary"
            aria-label="รูปแบบไฟล์"
          >
            <optgroup label="รูปแบบมาตรฐาน">
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
            {customList.length > 0 && (
              <optgroup label="รูปแบบของฉัน">
                {customList.map((t) => (
                  <option key={t.id} value={`custom:${t.id}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <Button icon={<Settings2 className="size-4" />} onClick={() => setShowOpts((s) => !s)} variant={showOpts ? "soft" : "secondary"}>
            ตัวเลือก
          </Button>
          <Button variant="primary" icon={<Download className="size-4" />} loading={exporting} onClick={() => doExport()}>
            ดาวน์โหลด Excel
          </Button>
        </div>
      </div>

      {showOpts && (
        <Card className="animate-fade-up">
          <CardHeader
            icon={<Settings2 className="size-5" />}
            title="ตัวเลือกการส่งออก"
            subtitle="การเปลี่ยนตัวเลือกจะแสดงผลในแผนภาพและตัวอย่างทันที"
            actions={
              <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setShowOpts(false)}>
                ปิด
              </Button>
            }
          />
          <div className="p-5 sm:p-6">
            <ExportOptionsPanel opts={opts} update={update} sampleCaseNo={detail.case_no} />
          </div>
        </Card>
      )}

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat icon={<Receipt className="size-5" />} label="ธุรกรรม" value={fmtInt(txs.length)} hint={`${detail.files.length} ไฟล์ที่นำเข้า`} />
        <Stat icon={<Banknote className="size-5" />} label="ยอดโอนรวม (บาท)" value={fmtMoney(detail.total_amount)} tone="warn" />
        <Stat
          icon={<Users className="size-5" />}
          label="บัญชีที่เกี่ยวข้อง"
          value={fmtInt(flow.accounts.size)}
          hint={`${hops} ทอด · ต้นทาง ${flow.roots.length} บัญชี`}
          tone="accent"
        />
        <Stat
          icon={<CalendarRange className="size-5" />}
          label="ช่วงวันที่โอน"
          value={<span className="text-base sm:text-lg">{detail.first_date ? fmtDate(detail.first_date, opts.era) : "-"}</span>}
          hint={detail.last_date && detail.last_date !== detail.first_date ? `ถึง ${fmtDate(detail.last_date, opts.era)}` : undefined}
          tone="ok"
        />
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 sm:px-4">
          <div className="scroll-thin flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cx(
                  "flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13.5px] font-medium whitespace-nowrap transition-colors",
                  tab === t.id ? "bg-primary-soft text-primary-text" : "text-ink-2 hover:bg-surface-3 hover:text-ink",
                )}
              >
                {t.icon}
                {t.label}
                {t.count !== undefined && <span className="rounded-full bg-surface-3 px-1.5 text-[11px] text-ink-2">{fmtInt(t.count)}</span>}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {opts.maskAccounts && (
              <Button size="sm" variant="ghost" icon={revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />} onClick={() => setRevealed((r) => !r)}>
                {revealed ? "ซ่อนเลขบัญชี" : "แสดงเลขบัญชีเต็ม"}
              </Button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {tab === "graph" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-ink-2">
                <GitBranch className="size-4" /> เส้นแสดงทิศทางการโอน ความหนาตามยอดเงิน · ชี้ที่บัญชีเพื่อไฮไลต์ความเชื่อมโยง
              </div>
              <FlowGraph flow={flow} mask={mask} />
            </div>
          )}

          {tab === "preview" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[12.5px] text-ink-2">
                  ตัวอย่างหน้าตาไฟล์ <b className="text-ink">เส้นทางเงิน (แบบ 3.case)</b> · {fmtInt(flow.chains.length)} เส้นทาง · {hops} ทอด
                  {flow.chains.some((c) => !c.linked) && " · แถวตัวเอียง = ธุรกรรมที่ไม่เชื่อมกับบัญชีต้นทาง"}
                </div>
                <Button size="sm" icon={<FileSpreadsheet className="size-4" />} onClick={() => doExport("case-flow")} loading={exporting}>
                  ดาวน์โหลดแบบนี้
                </Button>
              </div>
              <CaseGridPreview flow={flow} caseNo={detail.case_no} mask={mask} era={opts.era} merge={opts.mergeRepeated} />
            </div>
          )}

          {tab === "tx" && (
            <div className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                <input
                  value={txQuery}
                  onChange={(e) => setTxQuery(e.target.value)}
                  placeholder="ค้นหาเลขบัญชี ชื่อ ยอดเงิน..."
                  className="h-9 w-full rounded-xl border border-line bg-surface-2 pr-3 pl-9 text-[13px] outline-none focus:border-primary"
                />
              </div>
              <div className="scroll-thin max-h-[600px] overflow-auto rounded-2xl border border-line">
                <table className="w-full min-w-[1000px] text-left text-[13px]">
                  <thead className="sticky top-0 z-10 bg-surface-2 text-[12px] text-ink-2 shadow-[0_1px_0_var(--border)]">
                    <tr>
                      <th className="py-2.5 pl-4 font-medium">#</th>
                      <th className="py-2.5 font-medium">ชั้น</th>
                      <th className="py-2.5 font-medium">วันที่ / เวลา</th>
                      <th className="py-2.5 font-medium">จาก</th>
                      <th className="py-2.5 font-medium">ไปยัง</th>
                      <th className="py-2.5 font-medium">ช่องทาง</th>
                      <th className="py-2.5 pr-4 text-right font-medium">จำนวนเงิน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {sortedTx.slice(0, 1000).map((t, i) => (
                      <tr key={t.id} className="hover:bg-surface-2">
                        <td className="py-2 pl-4 text-ink-3">{i + 1}</td>
                        <td className="py-2">
                          <Badge tone="primary">{flow.txLevel.get(t.id) ?? "-"}</Badge>
                        </td>
                        <td className="py-2 whitespace-nowrap text-ink-2">
                          {fmtDate(t.transfer_date, opts.era)} <span className="text-ink-3">{t.transfer_time ? fmtTime(t.transfer_time) : ""}</span>
                        </td>
                        <td className="py-2">
                          <AcctCell code={t.from_bank_code} short={t.from_bank_short_name} no={t.from_account_no} name={t.from_account_name} mask={mask} />
                        </td>
                        <td className="py-2">
                          <AcctCell code={t.to_bank_code} short={t.to_bank_short_name} no={t.to_account_no} name={t.to_account_name} mask={mask} />
                        </td>
                        <td className="py-2 text-ink-2">{t.transfer_channel ?? "-"}</td>
                        <td className="py-2 pr-4 text-right font-semibold whitespace-nowrap text-ink">{fmtMoney(t.transfer_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sortedTx.length > 1000 && <div className="p-3 text-center text-[12px] text-ink-3">แสดง 1,000 จาก {fmtInt(sortedTx.length)} รายการ</div>}
                {!sortedTx.length && <Empty icon={<Search className="size-6" />} title="ไม่พบรายการ" />}
              </div>
            </div>
          )}

          {tab === "accounts" && (
            <div className="scroll-thin max-h-[600px] overflow-auto rounded-2xl border border-line">
              <table className="w-full min-w-[960px] text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-surface-2 text-[12px] text-ink-2 shadow-[0_1px_0_var(--border)]">
                  <tr>
                    <th className="py-2.5 pl-4 font-medium">ชั้น</th>
                    <th className="py-2.5 font-medium">บทบาท</th>
                    <th className="py-2.5 font-medium">บัญชี</th>
                    <th className="py-2.5 font-medium">เลขประจำตัว</th>
                    <th className="py-2.5 text-right font-medium">รับเข้า</th>
                    <th className="py-2.5 text-right font-medium">โอนออก</th>
                    <th className="py-2.5 pr-4 text-right font-medium">ส่วนต่าง</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {accounts.map((a) => (
                    <tr key={a.key} className="hover:bg-surface-2">
                      <td className="py-2 pl-4">
                        <Badge tone="primary">{a.level}</Badge>
                      </td>
                      <td className="py-2">
                        <Badge tone={ROLE_TONE[a.role]}>{ROLE_TH[a.role]}</Badge>
                      </td>
                      <td className="py-2">
                        <AcctCell code={a.bankCode} short={a.bank} no={a.accountNo} name={a.name} mask={mask} />
                      </td>
                      <td className="py-2 font-mono text-[12px] text-ink-2">
                        {a.idNo ?? "-"}
                        {a.idType && <div className="font-sans text-[11px] text-ink-3">{a.idType}</div>}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap text-ok">
                        {a.inCount ? (
                          <>
                            {fmtMoney(a.inAmount)} <span className="text-[11px] text-ink-3">({a.inCount})</span>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap text-danger">
                        {a.outCount ? (
                          <>
                            {fmtMoney(a.outAmount)} <span className="text-[11px] text-ink-3">({a.outCount})</span>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right font-semibold whitespace-nowrap text-ink">{fmtMoney(a.inAmount - a.outAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<FileSpreadsheet className="size-5" />}
          title="ไฟล์ที่นำเข้า"
          subtitle={`สร้างเมื่อ ${fmtDateTime(detail.created_at)} · อัปเดตล่าสุด ${fmtDateTime(detail.updated_at)}`}
          actions={
            <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={removeCase}>
              ลบคดี
            </Button>
          }
        />
        <ul className="divide-y divide-line">
          {detail.files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
              <FileSpreadsheet className="size-4 text-ok" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-ink">{f.file_name}</div>
                <div className="text-[12px] text-ink-3">
                  {fmtInt(f.row_count)} รายการ · {fmtDateTime(f.imported_at)}
                </div>
              </div>
              <button className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-danger-soft hover:text-danger" onClick={() => removeFile(f)} title="ลบไฟล์นี้">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function AcctCell({ code, short, no, name, mask }: { code: string | null; short: string | null; no: string | null; name: string | null; mask: boolean }) {
  const bank = bankShort(code, short);
  return (
    <div className="flex items-center gap-2">
      <BankChip bank={bank} color={bankColor(code, short)} />
      <div className="min-w-0">
        <div className="font-mono text-[12.5px] font-medium text-ink">{maskAccount(no, mask) || "-"}</div>
        <div className="max-w-52 truncate text-[11.5px] text-ink-3">{name ?? ""}</div>
      </div>
    </div>
  );
}
