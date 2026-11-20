"use client";

import { useRef, useState } from "react";
import { Check, FileUp, Loader2, Merge, Trash2, Upload, Wand2, X } from "lucide-react";
import type { CustomSpec, TemplateAnalysis } from "@/lib/export/custom";
import type { GridKind } from "@/lib/export/grid";
import { levelFill } from "@/lib/export/grid";
import { deleteTemplate, saveTemplate, updateTemplateSpec, type CustomTemplate } from "@/lib/client";
import type { ExportOptions } from "@/lib/export/options";
import { reloadCustomTemplates, useCustomTemplates } from "./useCustomTemplates";
import { Badge, Button, Toggle, cx, useToast } from "./ui";

const KIND_TH: Record<GridKind, string> = {
  bank: "ธนาคาร",
  account: "เลขบัญชี",
  name: "ชื่อบัญชี",
  date: "วันที่",
  time: "เวลา",
  amount: "ยอดเงิน",
};

const FIELD_TH: Record<string, string> = {
  no: "ลำดับ",
  level: "ชั้น",
  transfer_date: "วันที่โอน",
  transfer_time: "เวลา",
  transfer_amount: "ยอดเงิน",
  from_bank_short_name: "ธนาคารต้นทาง",
  from_bank_code: "รหัสธนาคารต้นทาง",
  from_account_no: "บัญชีต้นทาง",
  from_account_name: "ชื่อบัญชีต้นทาง",
  to_bank_short_name: "ธนาคารปลายทาง",
  to_bank_code: "รหัสธนาคารปลายทาง",
  to_account_no: "บัญชีปลายทาง",
  to_account_name: "ชื่อบัญชีปลายทาง",
  to_id: "เลขประจำตัว",
};

export function customMeta(t: CustomTemplate) {
  return t.summary ?? (t.spec.mode === "flow" ? "เส้นทางเงินแนวนอน" : "ตารางธุรกรรม");
}

/** แสดงการจับคู่หัวคอลัมน์ที่ระบบวิเคราะห์ได้ */
function SpecColumns({ spec }: { spec: CustomSpec }) {
  if (spec.mode === "flow")
    return (
      <div className="flex flex-wrap gap-1.5">
        {spec.others.map((o) => (
          <span key={`o${o.col}`} className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-[12px] text-ink-2">
            {o.header} <span className="text-ink-3">→ {o.field === "no" ? "ลำดับ" : "เว้นว่าง"}</span>
          </span>
        ))}
        {spec.columns.map((c) => (
          <span
            key={c.col}
            className="rounded-lg px-2 py-1 text-[12px] text-slate-900"
            style={{ background: c.part === "acct" ? `#${levelFill(c.level)}` : "var(--surface-3)", color: c.part === "acct" ? "#0f172a" : undefined }}
            title={`ชั้น ${c.level}`}
          >
            <b className="font-semibold">{c.header}</b> <span className="opacity-70">· {KIND_TH[c.kind]}</span>
          </span>
        ))}
      </div>
    );
  return (
    <div className="flex flex-wrap gap-1.5">
      {spec.columns.map((c) => (
        <span
          key={c.col}
          className={cx("rounded-lg px-2 py-1 text-[12px]", c.field ? "bg-primary-soft text-primary-text" : "border border-dashed border-line-strong text-ink-3")}
        >
          <b className="font-semibold">{c.header}</b> → {c.field ? (FIELD_TH[c.field] ?? c.field) : "ไม่รู้จัก (เว้นว่าง)"}
        </span>
      ))}
    </div>
  );
}

interface Pending {
  file: File;
  buf: ArrayBuffer;
  analysis: TemplateAnalysis | null;
  error: string | null;
}

export function CustomTemplates({ opts, update }: { opts: ExportOptions; update: (p: Partial<ExportOptions>) => void }) {
  const toast = useToast();
  const { list } = useCustomTemplates();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [name, setName] = useState("");
  const [merge, setMerge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  function select(t: CustomTemplate) {
    update({ template: `custom:${t.id}`, ...(t.spec.mode === "flow" ? { mergeRepeated: t.spec.mergeRepeated } : {}) });
  }

  async function onFile(f: File) {
    if (!/\.(xlsx|xlsm)$/i.test(f.name)) {
      toast("error", "รองรับเฉพาะไฟล์ .xlsx");
      return;
    }
    setAnalyzing(true);
    const buf = await f.arrayBuffer();
    try {
      const { analyzeTemplate } = await import("@/lib/export/custom");
      const analysis = await analyzeTemplate(buf);
      setPending({ file: f, buf, analysis, error: null });
      setMerge(analysis.spec.mode === "flow" && analysis.spec.mergeRepeated);
    } catch (e) {
      setPending({ file: f, buf, analysis: null, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setName(f.name.replace(/\.[^.]+$/, ""));
      setAnalyzing(false);
    }
  }

  async function save() {
    if (!pending?.analysis) return;
    setBusy(true);
    try {
      const spec = pending.analysis.spec.mode === "flow" ? { ...pending.analysis.spec, mergeRepeated: merge } : pending.analysis.spec;
      const t = await saveTemplate({ name: name.trim() || pending.file.name, summary: pending.analysis.summary, spec, fileName: pending.file.name, file: pending.buf });
      await reloadCustomTemplates();
      select(t);
      setPending(null);
      toast("success", "บันทึกรูปแบบแล้ว", `เลือก "${t.name}" เป็นรูปแบบส่งออกเรียบร้อย`);
    } catch (e) {
      toast("error", "บันทึกรูปแบบไม่สำเร็จ", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: CustomTemplate) {
    if (!confirm(`ลบรูปแบบ "${t.name}"?`)) return;
    try {
      await deleteTemplate(t.id);
      if (opts.template === `custom:${t.id}`) update({ template: "case-flow" });
      await reloadCustomTemplates();
      toast("success", "ลบรูปแบบแล้ว");
    } catch (e) {
      toast("error", "ลบไม่สำเร็จ", e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleMerge(t: CustomTemplate, v: boolean) {
    if (t.spec.mode !== "flow") return;
    update({ mergeRepeated: v });
    try {
      await updateTemplateSpec(t.id, { spec: { ...t.spec, mergeRepeated: v } });
      reloadCustomTemplates();
    } catch {}
  }

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">
          <Wand2 className="size-4" /> รูปแบบของฉัน (นำเข้าจากไฟล์ตัวอย่าง)
        </div>
        <Button size="sm" variant="soft" icon={analyzing ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} onClick={() => inputRef.current?.click()} disabled={analyzing}>
          นำเข้ารูปแบบ
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((t) => {
          const active = opts.template === `custom:${t.id}`;
          return (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => select(t)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && select(t)}
              className={cx(
                "group relative flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 text-left transition-all",
                active
                  ? "border-primary bg-primary-soft/50 shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_18%,transparent)]"
                  : "border-line bg-surface hover:border-line-strong hover:bg-surface-2",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={cx("grid size-9 place-items-center rounded-xl", active ? "bg-primary text-white" : "bg-accent-soft text-accent")}>
                  <Wand2 className="size-5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    className="grid size-7 place-items-center rounded-lg text-ink-3 opacity-70 hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(t);
                    }}
                    title="ลบรูปแบบ"
                  >
                    <Trash2 className="size-4" />
                  </button>
                  <span className={cx("grid size-5 place-items-center rounded-full border", active ? "border-primary bg-primary text-white" : "border-line-strong")}>
                    {active && <Check className="size-3" strokeWidth={3} />}
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold text-ink">{t.name}</div>
                <div className="mt-0.5 text-[12.5px] text-ink-2">{customMeta(t)}</div>
                {t.file_name && <div className="mt-1 truncate text-[11px] text-ink-3">จากไฟล์ {t.file_name}</div>}
              </div>
              {active && t.spec.mode === "flow" && (
                <div onClick={(e) => e.stopPropagation()} className="-mx-2">
                  <Toggle checked={opts.mergeRepeated} onChange={(v) => toggleMerge(t, v)} label="รวมเซลล์บัญชีที่ซ้ำกัน" />
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface-2 p-4 text-center text-ink-2 transition-all hover:border-primary/60 hover:text-ink"
        >
          {analyzing ? <Loader2 className="size-6 animate-spin text-primary" /> : <Upload className="size-6" />}
          <span className="text-[13.5px] font-semibold">อัปโหลดไฟล์ตัวอย่างรูปแบบที่ต้องการ</span>
          <span className="max-w-64 text-[12px] text-ink-3">ระบบจะเรียนรู้หัวตาราง สี ฟอนต์ รูปแบบวันที่/ตัวเลข และการรวมเซลล์จากไฟล์ .xlsx ของคุณ</span>
        </button>
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => !busy && setPending(null)}>
          <div className="card animate-fade-up max-h-[90dvh] w-full max-w-3xl overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="flex items-start gap-3 border-b border-line px-6 py-4">
              <div className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
                <Wand2 className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[16px] font-semibold text-ink">นำเข้ารูปแบบจากไฟล์ตัวอย่าง</h3>
                <p className="truncate text-[13px] text-ink-2">{pending.file.name}</p>
              </div>
              <button className="text-ink-3 hover:text-ink" onClick={() => setPending(null)} aria-label="ปิด">
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              {pending.error ? (
                <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">{pending.error}</div>
              ) : (
                pending.analysis && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="ok">
                        <Check className="size-3" /> วิเคราะห์สำเร็จ
                      </Badge>
                      <Badge tone="primary">{pending.analysis.spec.mode === "flow" ? "รูปแบบเส้นทางเงิน" : "รูปแบบตารางธุรกรรม"}</Badge>
                      <span className="text-[13px] text-ink-2">{pending.analysis.summary}</span>
                    </div>

                    {pending.analysis.title.length > 0 && (
                      <div>
                        <div className="mb-1.5 text-[12.5px] font-medium text-ink-2">หัวรายงาน (เลขคดีจะถูกแทนด้วยคดีที่ส่งออก)</div>
                        <div className="flex flex-wrap gap-1.5">
                          {pending.analysis.title.map((t, i) => (
                            <span key={i} className="rounded-lg bg-surface-3 px-2 py-1 font-mono text-[12px] text-ink">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="mb-1.5 text-[12.5px] font-medium text-ink-2">
                        หัวคอลัมน์ที่ตรวจพบ (แถวที่ {pending.analysis.spec.headerRow})
                        {pending.analysis.spec.mode === "flow" && " — ชั้นที่เกินจากไฟล์ตัวอย่างจะวนใช้สีและหัวคอลัมน์แบบเดียวกัน"}
                      </div>
                      <SpecColumns spec={pending.analysis.spec} />
                    </div>

                    <label className="block">
                      <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">ชื่อรูปแบบ</span>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-primary focus:bg-surface"
                      />
                    </label>

                    {pending.analysis.spec.mode === "flow" && (
                      <div className="rounded-xl border border-line">
                        <Toggle
                          checked={merge}
                          onChange={setMerge}
                          label={
                            <span className="inline-flex items-center gap-1.5">
                              <Merge className="size-4" /> รวมเซลล์ธนาคาร/เลขบัญชีที่ซ้ำกันในแถวติดกัน
                            </span>
                          }
                          hint={pending.analysis.spec.mergeRepeated ? "ตรวจพบการรวมเซลล์ในไฟล์ตัวอย่าง จึงเปิดให้อัตโนมัติ" : "เช่น บัญชีต้นทางเดียวกันหลายแถวจะแสดงเป็นเซลล์เดียว"}
                        />
                      </div>
                    )}
                  </>
                )
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-line bg-surface-2 px-6 py-4">
              <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
                ยกเลิก
              </Button>
              {pending.error ? (
                <Button variant="primary" icon={<FileUp className="size-4" />} onClick={() => inputRef.current?.click()}>
                  เลือกไฟล์ใหม่
                </Button>
              ) : (
                <Button variant="primary" icon={<Check className="size-4" />} loading={busy} onClick={save}>
                  บันทึกและใช้รูปแบบนี้
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
