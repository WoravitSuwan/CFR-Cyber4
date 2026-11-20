"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  CloudUpload,
  FileSpreadsheet,
  FileText,
  FolderInput,
  Layers,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ParsedFile } from "@/lib/import/parse";
import type { CaseSummary, ImportMode } from "@/lib/types";
import { fmtBytes, fmtInt, fmtMoney, importGroup, type ImportResult } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Progress, cx, useToast } from "./ui";

const MODE_LABEL: Record<ImportMode, string> = {
  append: "เพิ่มเข้าคดีเดิม (ข้ามรายการซ้ำ)",
  replace: "แทนที่ข้อมูลเดิมทั้งหมด",
  new: "สร้างเป็นคดีใหม่แยกต่างหาก",
};

export function ImportPanel({ existing, onImported }: { existing: CaseSummary[]; onImported: (results: ImportResult[]) => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [parsing, setParsing] = useState<{ done: number; total: number; name: string } | null>(null);
  const [modes, setModes] = useState<Record<string, ImportMode>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState<{ pct: number; label: string } | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const existingByNo = useMemo(() => new Map(existing.map((c) => [c.case_no, c])), [existing]);

  const groups = useMemo(() => {
    const m = new Map<string, ParsedFile[]>();
    for (const f of files) {
      if (f.error || !f.rows.length) continue;
      const k = (f.caseNo ?? "").trim() || "(ไม่ระบุ)";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(f);
    }
    return [...m.entries()].map(([caseNo, fs]) => ({
      caseNo,
      files: fs,
      rows: fs.reduce((s, f) => s + f.rows.length, 0),
      total: fs.reduce((s, f) => s + f.total, 0),
      existing: existingByNo.get(caseNo),
    }));
  }, [files, existingByNo]);

  const errored = files.filter((f) => f.error);

  async function handleFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    if (!arr.length) return;
    setResults(null);
    setParsing({ done: 0, total: arr.length, name: arr[0].name });
    try {
      const { parseUploads } = await import("@/lib/import/parse");
      const parsed = await parseUploads(arr, (done, total, name) => setParsing({ done, total, name }));
      setFiles((prev) => [...prev, ...parsed]);
      const ok = parsed.filter((p) => !p.error).length;
      const bad = parsed.length - ok;
      toast(bad ? "warn" : "success", `อ่านไฟล์แล้ว ${ok} ไฟล์${bad ? ` (ผิดพลาด ${bad})` : ""}`, `พบธุรกรรม ${fmtInt(parsed.reduce((s, p) => s + p.rows.length, 0))} รายการ`);
    } catch (e) {
      toast("error", "อ่านไฟล์ไม่สำเร็จ", e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(null);
    }
  }

  function setCaseNo(uid: string, v: string) {
    setFiles((fs) => fs.map((f) => (f.uid === uid ? { ...f, caseNo: v } : f)));
  }

  async function runImport() {
    const valid = groups.filter((g) => g.caseNo !== "(ไม่ระบุ)");
    if (valid.length !== groups.length) {
      toast("warn", "กรุณาระบุเลขคดีให้ครบทุกไฟล์");
      return;
    }
    const totalRows = groups.reduce((s, g) => s + g.rows, 0);
    let doneRows = 0;
    const out: ImportResult[] = [];
    setImporting({ pct: 0, label: "กำลังเริ่ม..." });
    try {
      for (const g of groups) {
        const before = doneRows;
        const r = await importGroup(
          { caseNo: g.caseNo, title: titles[g.caseNo], mode: g.existing ? (modes[g.caseNo] ?? "append") : "append", files: g.files },
          (p) => {
            doneRows = before + p.sent;
            setImporting({ pct: (doneRows / Math.max(totalRows, 1)) * 100, label: `คดี ${p.caseNo} • ${p.file}` });
          },
        );
        out.push(r);
      }
      setResults(out);
      setFiles([]);
      setModes({});
      setTitles({});
      onImported(out);
      const ins = out.reduce((s, r) => s + r.inserted, 0);
      const dup = out.reduce((s, r) => s + r.duplicates, 0);
      toast("success", `นำเข้าสำเร็จ ${out.length} คดี`, `เพิ่ม ${fmtInt(ins)} รายการ${dup ? ` • ข้ามรายการซ้ำ ${fmtInt(dup)}` : ""}`);
    } catch (e) {
      toast("error", "นำเข้าไม่สำเร็จ", e instanceof Error ? e.message : String(e));
      if (out.length) onImported(out);
    } finally {
      setImporting(null);
    }
  }

  const busy = !!parsing || !!importing;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<CloudUpload className="size-5" />}
        title="นำเข้าข้อมูลเส้นทางเงิน CFR"
        subtitle="รองรับไฟล์ .xlsx / .csv และ .zip ที่รวมหลายไฟล์ (ZIP ซ้อน ZIP ได้) — ไฟล์ถูกอ่านบนเบราว์เซอร์ของคุณ"
        actions={
          files.length > 0 && (
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setFiles([])} disabled={busy}>
              ล้างรายการ
            </Button>
          )
        }
      />

      <div className="p-5 sm:p-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (!busy) handleFiles(e.dataTransfer.files);
          }}
          onClick={() => !busy && inputRef.current?.click()}
          className={cx(
            "group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line-strong bg-surface-2 px-6 py-10 text-center transition-all hover:border-primary/60",
            drag && "dropzone-active",
            busy && "pointer-events-none opacity-70",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xlsm,.csv,.txt,.zip,.xls"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/30 to-teal-400/30 blur-xl transition-opacity group-hover:opacity-100 sm:opacity-60" />
            <div className="relative grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-teal-500 text-white shadow-xl">
              {parsing ? <FolderInput className="size-7 animate-pulse" /> : <Upload className="size-7" />}
            </div>
          </div>
          {parsing ? (
            <div className="w-full max-w-sm">
              <div className="mb-2 text-sm font-medium text-ink">
                กำลังอ่านไฟล์ {parsing.done}/{parsing.total}
              </div>
              <Progress value={(parsing.done / Math.max(parsing.total, 1)) * 100} />
              <div className="mt-2 truncate text-[12px] text-ink-3">{parsing.name}</div>
            </div>
          ) : (
            <>
              <div>
                <div className="text-[15px] font-semibold text-ink">ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</div>
                <div className="mt-1 text-[13px] text-ink-2">เลือกได้หลายไฟล์พร้อมกัน · ระบบดึงเลขคดีจากชื่อไฟล์/โฟลเดอร์ให้อัตโนมัติ</div>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Badge tone="primary">
                  <FileSpreadsheet className="size-3" /> .xlsx
                </Badge>
                <Badge tone="accent">
                  <FileText className="size-3" /> .csv
                </Badge>
                <Badge tone="warn">
                  <Archive className="size-3" /> .zip (หลายไฟล์)
                </Badge>
              </div>
            </>
          )}
        </div>

        {errored.length > 0 && (
          <div className="mt-5 space-y-2">
            {errored.map((f) => (
              <div key={f.uid} className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{f.path}</div>
                  <div className="text-[13px] text-danger">{f.error}</div>
                </div>
                <button className="text-ink-3 hover:text-ink" onClick={() => setFiles((fs) => fs.filter((x) => x.uid !== f.uid))} aria-label="ลบ">
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {groups.length > 0 && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-ink-2">
                <Layers className="size-4" />
                พร้อมนำเข้า <b className="text-ink">{groups.length}</b> คดี จาก{" "}
                <b className="text-ink">{groups.reduce((s, g) => s + g.files.length, 0)}</b> ไฟล์ —{" "}
                <b className="text-ink">{fmtInt(groups.reduce((s, g) => s + g.rows, 0))}</b> ธุรกรรม
              </div>
            </div>

            {groups.map((g) => (
              <div key={g.caseNo} className="animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface-2">
                <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3">
                  <div className="grid size-8 place-items-center rounded-lg bg-primary-soft text-[12px] font-bold text-primary-text">#</div>
                  <div className="min-w-0">
                    <div className="text-[13px] text-ink-2">เลขคดี</div>
                    <div className="font-mono text-[15px] font-semibold text-ink">{g.caseNo}</div>
                  </div>
                  <div className="ml-2 hidden h-8 w-px bg-line sm:block" />
                  <div className="text-[13px] text-ink-2">
                    {g.files.length} ไฟล์ · {fmtInt(g.rows)} รายการ · <span className="font-medium text-ink">฿{fmtMoney(g.total)}</span>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <input
                      placeholder="ชื่อคดี / หมายเหตุ (ไม่บังคับ)"
                      value={titles[g.caseNo] ?? ""}
                      onChange={(e) => setTitles((t) => ({ ...t, [g.caseNo]: e.target.value }))}
                      className="h-9 w-56 rounded-lg border border-line bg-surface px-3 text-[13px] outline-none focus:border-primary"
                    />
                    {g.existing ? (
                      <select
                        value={modes[g.caseNo] ?? "append"}
                        onChange={(e) => setModes((m) => ({ ...m, [g.caseNo]: e.target.value as ImportMode }))}
                        className="h-9 rounded-lg border border-warn/40 bg-warn-soft px-2 text-[13px] text-ink outline-none"
                        title="มีคดีนี้อยู่ในระบบแล้ว"
                      >
                        {(Object.keys(MODE_LABEL) as ImportMode[]).map((m) => (
                          <option key={m} value={m}>
                            {MODE_LABEL[m]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge tone="ok">คดีใหม่</Badge>
                    )}
                  </div>
                </div>
                {g.existing && (
                  <div className="border-b border-line bg-warn-soft/60 px-4 py-2 text-[12.5px] text-warn">
                    มีคดี {g.caseNo} ในระบบแล้ว ({fmtInt(g.existing.tx_count)} รายการ) — เลือกวิธีนำเข้าด้านบน
                  </div>
                )}
                <ul className="divide-y divide-line">
                  {g.files.map((f) => (
                    <li key={f.uid} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <FileSpreadsheet className="size-4 shrink-0 text-ok" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-medium text-ink" title={f.path}>
                          {f.name}
                        </div>
                        <div className="truncate text-[11.5px] text-ink-3">
                          {f.path !== f.name && <>{f.path.slice(0, -f.name.length - 1)} · </>}
                          {fmtBytes(f.size)} · ชีต {f.sheets.join(", ")}
                          {f.bankCaseIds.length > 0 && <> · bank case {f.bankCaseIds.slice(0, 2).join(", ")}{f.bankCaseIds.length > 2 ? "…" : ""}</>}
                          {f.skipped > 0 && <> · ข้าม {f.skipped} แถว</>}
                        </div>
                      </div>
                      <div className="text-right text-[12.5px] text-ink-2">
                        <div className="font-medium text-ink">{fmtInt(f.rows.length)} รายการ</div>
                        <div>฿{fmtMoney(f.total)}</div>
                      </div>
                      <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
                        เลขคดี
                        <input
                          value={f.caseNo ?? ""}
                          onChange={(e) => setCaseNo(f.uid, e.target.value)}
                          className="h-8 w-36 rounded-lg border border-line bg-surface px-2 font-mono text-[13px] text-ink outline-none focus:border-primary"
                        />
                      </label>
                      <button
                        className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-danger-soft hover:text-danger"
                        onClick={() => setFiles((fs) => fs.filter((x) => x.uid !== f.uid))}
                        aria-label="นำออก"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center">
              {importing ? (
                <div className="flex-1">
                  <div className="mb-2 flex justify-between text-[13px]">
                    <span className="truncate text-ink-2">{importing.label}</span>
                    <span className="font-medium text-ink">{importing.pct.toFixed(0)}%</span>
                  </div>
                  <Progress value={importing.pct} />
                </div>
              ) : (
                <div className="flex-1 text-[13px] text-ink-2">
                  ไฟล์ที่มีเลขคดีเดียวกันจะถูกรวมเป็นคดีเดียว แก้ไขเลขคดีได้ในแต่ละไฟล์ · รายการที่ซ้ำกับข้อมูลเดิมจะถูกข้ามอัตโนมัติ
                </div>
              )}
              <Button variant="primary" size="lg" onClick={runImport} loading={!!importing} icon={<CloudUpload className="size-5" />}>
                นำเข้าฐานข้อมูล ({groups.length} คดี)
              </Button>
            </div>
          </div>
        )}

        {results && (
          <div className="mt-5 rounded-2xl border border-ok/30 bg-ok-soft/60 p-4">
            <div className="mb-2 flex items-center gap-2 font-medium text-ok">
              <CheckCircle2 className="size-5" /> นำเข้าเรียบร้อย
            </div>
            <ul className="grid gap-1 text-[13px] text-ink-2 sm:grid-cols-2">
              {results.map((r) => (
                <li key={r.caseNo + r.caseId}>
                  <a href={`/cases/${r.caseId}`} className="font-mono font-medium text-ink underline-offset-2 hover:underline">
                    {r.caseNo}
                  </a>{" "}
                  — เพิ่ม {fmtInt(r.inserted)} รายการ{r.duplicates ? ` • ซ้ำ ${fmtInt(r.duplicates)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
