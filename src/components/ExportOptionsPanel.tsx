"use client";

import { useEffect, useState } from "react";
import { Check, FileSpreadsheet, GitBranch, Layers, ListOrdered, Sheet, Table2, Users } from "lucide-react";
import { buildFileName, DEFAULT_EXPORT_OPTIONS, TEMPLATES, type ExportOptions, type TemplateId } from "@/lib/export/options";
import type { LinkStrategy } from "@/lib/flow";
import { Segmented, Toggle, cx } from "./ui";

const ICONS: Record<TemplateId, React.ReactNode> = {
  "case-flow": <GitBranch className="size-5" />,
  "case-flow-detail": <Layers className="size-5" />,
  transactions: <ListOrdered className="size-5" />,
  accounts: <Users className="size-5" />,
  raw: <Table2 className="size-5" />,
  full: <Sheet className="size-5" />,
};

/** ภาพย่อแสดงหน้าตาของแต่ละรูปแบบ */
function Thumb({ id }: { id: TemplateId }) {
  const c = ["#C0E6F5", "#FBE2D5", "#C1F0C8", "#F2CEEF", "#FFFFCC"];
  if (id === "case-flow" || id === "case-flow-detail")
    return (
      <div className="flex gap-[3px]">
        {c.slice(0, 4).map((col, i) => (
          <div key={i} className="flex gap-[2px]">
            <div className="flex flex-col gap-[2px]">
              {id === "case-flow-detail" && <div className="h-1 w-5 rounded-sm opacity-90" style={{ background: col, filter: "saturate(3) brightness(.8)" }} />}
              {[0, 1, 2].map((r) => (
                <div key={r} className="h-1.5 w-5 rounded-[2px]" style={{ background: col, opacity: r === 2 && i > 1 ? 0 : 1 }} />
              ))}
            </div>
            {i < 3 && (
              <div className="flex flex-col gap-[2px]">
                {id === "case-flow-detail" && <div className="h-1 w-3" />}
                {[0, 1, 2].map((r) => (
                  <div key={r} className="h-1.5 w-3 rounded-[2px] bg-line-strong" style={{ opacity: r === 2 && i > 0 ? 0 : 0.7 }} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  if (id === "full")
    return (
      <div className="relative h-8 w-20">
        {[0, 1, 2].map((i) => (
          <div key={i} className="absolute h-6 w-14 rounded-md border border-line-strong bg-surface" style={{ left: i * 8, top: i * 3 }}>
            <div className="m-1 h-1 rounded-sm" style={{ background: c[i] }} />
            <div className="mx-1 h-1 rounded-sm bg-line" />
          </div>
        ))}
      </div>
    );
  return (
    <div className="flex flex-col gap-[2px]">
      <div className={cx("h-1.5 w-24 rounded-[2px]", id === "raw" ? "bg-slate-700" : id === "accounts" ? "bg-emerald-700" : "bg-indigo-800")} />
      {[0, 1, 2, 3].map((r) => (
        <div key={r} className="flex gap-[2px]">
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <div key={k} className="h-1.5 w-[14px] rounded-[2px]" style={{ background: id === "accounts" && k < 2 ? c[r % 4] : r % 2 ? "var(--surface-3)" : "var(--border)" }} />
          ))}
        </div>
      ))}
    </div>
  );
}

const STORAGE_KEY = "cfr-export-options-v1";

export function useExportOptions() {
  const [opts, setOpts] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setOpts({ ...DEFAULT_EXPORT_OPTIONS, ...JSON.parse(raw) });
    } catch {}
  }, []);
  const update = (patch: Partial<ExportOptions>) =>
    setOpts((o) => {
      const n = { ...o, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(n));
      } catch {}
      return n;
    });
  return [opts, update] as const;
}

const STRATEGIES: { value: LinkStrategy; label: string; hint: string }[] = [
  { value: "time", label: "ตามลำดับเวลา", hint: "จับคู่กับรายการโอนออกถัดไปหลังเวลารับเงิน (แต่ละรายการใช้ครั้งเดียว) — ตรงกับไฟล์ 3.case" },
  { value: "amount", label: "ตามยอดเงินใกล้เคียง", hint: "เลือกรายการโอนออกหลังเวลารับเงินที่ยอดใกล้เคียงยอดรับมากที่สุด" },
  { value: "reuse", label: "แสดงทุกเส้นทาง", hint: "ยอมให้รายการโอนออกเดียวกันปรากฏได้หลายเส้นทาง" },
];

export function ExportOptionsPanel({
  opts,
  update,
  sampleCaseNo = "150225671",
  compact,
}: {
  opts: ExportOptions;
  update: (p: Partial<ExportOptions>) => void;
  sampleCaseNo?: string;
  compact?: boolean;
}) {
  const usesFlow = opts.template === "case-flow" || opts.template === "case-flow-detail" || opts.template === "full";
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">
          <FileSpreadsheet className="size-4" /> รูปแบบไฟล์ที่ต้องการ
        </div>
        <div className={cx("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3")}>
          {TEMPLATES.map((t) => {
            const active = opts.template === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => update({ template: t.id })}
                className={cx(
                  "group relative flex flex-col gap-3 rounded-2xl border p-4 text-left transition-all",
                  active
                    ? "border-primary bg-primary-soft/50 shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_18%,transparent)]"
                    : "border-line bg-surface hover:border-line-strong hover:bg-surface-2",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={cx("grid size-9 place-items-center rounded-xl", active ? "bg-primary text-white" : "bg-surface-3 text-ink-2")}>{ICONS[t.id]}</div>
                  <div className="flex items-center gap-2">
                    {t.badge && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent">{t.badge}</span>}
                    <span className={cx("grid size-5 place-items-center rounded-full border", active ? "border-primary bg-primary text-white" : "border-line-strong")}>
                      {active && <Check className="size-3" strokeWidth={3} />}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-ink">{t.name}</div>
                  <div className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{t.description}</div>
                </div>
                <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                  <Thumb id={t.id} />
                  <span className="text-[10.5px] text-ink-3">{t.sheets.length > 1 ? `${t.sheets.length} ชีต` : t.sheets[0]}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className={cx("grid gap-6", !compact && "lg:grid-cols-2")}>
        <div className="space-y-4">
          <div className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">การแสดงผล</div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-2">
            <div>
              <div className="text-sm font-medium text-ink">ปีในวันที่</div>
              <div className="text-[12px] text-ink-2">ไฟล์ตัวอย่างใช้ปี พ.ศ. (เช่น 15/02/2567)</div>
            </div>
            <Segmented
              value={opts.era}
              onChange={(era) => update({ era })}
              options={[
                { value: "BE", label: "พ.ศ." },
                { value: "CE", label: "ค.ศ." },
              ]}
            />
          </div>
          <Toggle
            checked={opts.maskAccounts}
            onChange={(maskAccounts) => update({ maskAccounts })}
            label="ปิดบังเลขบัญชีบางส่วน"
            hint="เช่น 4390712341 → 43907xxxx1 (ตามไฟล์ตัวอย่าง)"
          />
          <label className="block rounded-xl p-2">
            <div className="text-sm font-medium text-ink">รูปแบบชื่อไฟล์</div>
            <div className="mb-2 text-[12px] text-ink-2">
              ใช้ได้: <code>{"{case}"}</code> เลขคดี · <code>{"{index}"}</code> ลำดับ · <code>{"{title}"}</code> ชื่อคดี · <code>{"{template}"}</code> รูปแบบ · <code>{"{date}"}</code> วันที่
            </div>
            <input
              value={opts.fileNamePattern}
              onChange={(e) => update({ fileNamePattern: e.target.value })}
              className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 font-mono text-[13px] outline-none focus:border-primary focus:bg-surface"
            />
            <div className="mt-1.5 truncate text-[12px] text-ink-3">
              ตัวอย่าง: <span className="font-mono text-ink-2">{buildFileName(opts.fileNamePattern, { caseNo: sampleCaseNo, index: 1, template: opts.template })}</span>
            </div>
          </label>
        </div>

        <div className={cx("space-y-4", !usesFlow && "opacity-50")}>
          <div className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">
            การเชื่อมโยงเส้นทางเงิน {!usesFlow && <span className="normal-case">(ใช้กับรูปแบบเส้นทางเงิน)</span>}
          </div>
          <div className="space-y-2">
            {STRATEGIES.map((s) => (
              <label
                key={s.value}
                className={cx(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                  opts.strategy === s.value ? "border-primary/60 bg-primary-soft/40" : "border-line hover:bg-surface-2",
                )}
              >
                <input type="radio" className="mt-1 accent-[var(--primary)]" checked={opts.strategy === s.value} onChange={() => update({ strategy: s.value })} />
                <span>
                  <span className="block text-sm font-medium text-ink">{s.label}</span>
                  <span className="block text-[12px] text-ink-2">{s.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <Toggle
            checked={opts.includeUnlinked}
            onChange={(includeUnlinked) => update({ includeUnlinked })}
            label="แสดงธุรกรรมที่ไม่เชื่อมกับบัญชีต้นทาง"
            hint="เพิ่มเป็นแถวท้ายตาราง โดยเริ่มที่คอลัมน์ชั้นของบัญชีผู้โอน"
          />
          <label className="flex items-center justify-between gap-3 rounded-xl p-2">
            <span>
              <span className="block text-sm font-medium text-ink">จำนวนทอดสูงสุด</span>
              <span className="block text-[12px] text-ink-2">จำกัดความยาวของแต่ละเส้นทาง</span>
            </span>
            <input
              type="number"
              min={1}
              max={100}
              value={opts.maxHops}
              onChange={(e) => update({ maxHops: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
              className="h-10 w-20 rounded-xl border border-line bg-surface-2 px-3 text-center text-sm outline-none focus:border-primary"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
