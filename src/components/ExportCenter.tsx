"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, Download, FileSpreadsheet, FolderOpen, Loader2, Search, Sparkles, XCircle } from "lucide-react";
import type { CaseSummary } from "@/lib/types";
import { ApiError, api, downloadBlob, exportCase, fmtBytes, fmtInt, fmtMoney, zipFiles, type ExportedFile } from "@/lib/client";
import { templateMeta } from "@/lib/export/options";
import { DbNotice } from "./DbNotice";
import { ExportOptionsPanel, useExportOptions } from "./ExportOptionsPanel";
import { Badge, Button, Card, CardHeader, Empty, Progress, Spinner, cx, useToast } from "./ui";

type Job = { caseId: number; caseNo: string; status: "pending" | "working" | "done" | "error"; file?: ExportedFile; error?: string };

export function ExportCenter() {
  const toast = useToast();
  const params = useSearchParams();
  const [opts, update] = useExportOptions();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [zipping, setZipping] = useState(false);

  useEffect(() => {
    api<{ cases: CaseSummary[] }>("/api/cases")
      .then((r) => {
        setCases(r.cases);
        const ids = (params.get("ids") ?? "").split(",").map(Number).filter(Boolean);
        setSel(new Set(ids.length ? ids.filter((id) => r.cases.some((c) => c.id === id)) : []));
      })
      .catch((e) => e instanceof ApiError && e.status === 503 && setDbError(e.message))
      .finally(() => setLoading(false));
  }, [params]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? cases.filter((c) => c.case_no.toLowerCase().includes(s) || (c.title ?? "").toLowerCase().includes(s)) : cases;
  }, [cases, q]);

  const selected = cases.filter((c) => sel.has(c.id));
  const doneJobs = jobs.filter((j) => j.status === "done");
  const progress = jobs.length ? (jobs.filter((j) => j.status === "done" || j.status === "error").length / jobs.length) * 100 : 0;

  async function generate() {
    if (!selected.length) {
      toast("warn", "กรุณาเลือกคดีอย่างน้อย 1 คดี");
      return;
    }
    setRunning(true);
    const list: Job[] = selected.map((c) => ({ caseId: c.id, caseNo: c.case_no, status: "pending" }));
    setJobs(list);
    setPicked(new Set());
    for (let i = 0; i < selected.length; i++) {
      const c = selected[i];
      setJobs((js) => js.map((j) => (j.caseId === c.id ? { ...j, status: "working" } : j)));
      try {
        const file = await exportCase(c, opts, i + 1);
        setJobs((js) => js.map((j) => (j.caseId === c.id ? { ...j, status: "done", file } : j)));
        setPicked((p) => new Set(p).add(c.id));
      } catch (e) {
        setJobs((js) => js.map((j) => (j.caseId === c.id ? { ...j, status: "error", error: e instanceof Error ? e.message : String(e) } : j)));
      }
    }
    setRunning(false);
    toast("success", "สร้างไฟล์เสร็จแล้ว", "เลือกดาวน์โหลดทีละไฟล์ หรือดาวน์โหลดทั้งหมดเป็น ZIP");
  }

  async function downloadZip(only?: Set<number>) {
    const files = doneJobs.filter((j) => !only || only.has(j.caseId)).map((j) => j.file!);
    if (!files.length) return;
    setZipping(true);
    try {
      const blob = await zipFiles(files);
      const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      downloadBlob(blob, `cfr_export_${opts.template}_${files.length}files_${stamp}.zip`);
    } finally {
      setZipping(false);
    }
  }

  if (dbError) return <DbNotice message={dbError} />;

  return (
    <div className="space-y-6">
      <section className="animate-fade-up pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[30px]">
          ส่งออก <span className="grad-text">Excel</span>
        </h1>
        <p className="mt-1.5 text-[14.5px] text-ink-2">เลือกคดีและรูปแบบไฟล์ ระบบจะสร้างไฟล์แยกรายคดี เลือกดาวน์โหลดทีละไฟล์หรือรวมเป็น ZIP ได้</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card className="flex max-h-[760px] flex-col overflow-hidden xl:sticky xl:top-22 xl:self-start">
          <CardHeader
            icon={<FolderOpen className="size-5" />}
            title="1. เลือกคดี"
            subtitle={`${sel.size} จาก ${cases.length} คดี`}
            actions={
              <Button size="sm" variant="ghost" onClick={() => setSel(sel.size === filtered.length ? new Set() : new Set(filtered.map((c) => c.id)))}>
                {sel.size === filtered.length && filtered.length ? "ไม่เลือก" : "เลือกทั้งหมด"}
              </Button>
            }
          />
          <div className="border-b border-line p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาเลขคดี..."
                className="h-9 w-full rounded-xl border border-line bg-surface-2 pr-3 pl-9 text-[13px] outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : !filtered.length ? (
              <Empty icon={<FolderOpen className="size-6" />} title="ไม่มีคดี">
                <Link href="/" className="text-primary hover:underline">
                  นำเข้าข้อมูล
                </Link>
              </Empty>
            ) : (
              <ul className="divide-y divide-line">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <label className={cx("flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-surface-2", sel.has(c.id) && "bg-primary-soft/40")}>
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--primary)]"
                        checked={sel.has(c.id)}
                        onChange={() =>
                          setSel((s) => {
                            const n = new Set(s);
                            if (n.has(c.id)) n.delete(c.id);
                            else n.add(c.id);
                            return n;
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[13.5px] font-semibold text-ink">{c.case_no}</div>
                        <div className="truncate text-[12px] text-ink-3">
                          {c.title ? `${c.title} · ` : ""}
                          {fmtInt(c.tx_count)} รายการ · ฿{fmtMoney(c.total_amount, 0)}
                        </div>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={<Sparkles className="size-5" />} title="2. เลือกรูปแบบและตัวเลือก" subtitle="ตัวเลือกจะถูกจดจำไว้สำหรับครั้งถัดไป" />
            <div className="p-5 sm:p-6">
              <ExportOptionsPanel opts={opts} update={update} sampleCaseNo={selected[0]?.case_no} />
            </div>
            <div className="flex flex-col gap-3 border-t border-line bg-surface-2 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
              <div className="flex-1 text-[13px] text-ink-2">
                จะสร้าง <b className="text-ink">{selected.length}</b> ไฟล์ รูปแบบ <b className="text-ink">{templateMeta(opts.template).name}</b>
              </div>
              <Button variant="primary" size="lg" icon={<FileSpreadsheet className="size-5" />} loading={running} disabled={!selected.length} onClick={generate}>
                สร้างไฟล์ Excel
              </Button>
            </div>
          </Card>

          {jobs.length > 0 && (
            <Card className="animate-fade-up overflow-hidden">
              <CardHeader
                icon={<Download className="size-5" />}
                title="3. ดาวน์โหลด"
                subtitle={running ? "กำลังสร้างไฟล์..." : `พร้อมดาวน์โหลด ${doneJobs.length} ไฟล์`}
                actions={
                  <>
                    <Button
                      size="sm"
                      icon={<Archive className="size-4" />}
                      disabled={running || !picked.size || zipping}
                      onClick={() => downloadZip(picked)}
                    >
                      ZIP ที่เลือก ({picked.size})
                    </Button>
                    <Button size="sm" variant="primary" icon={<Archive className="size-4" />} loading={zipping} disabled={running || !doneJobs.length} onClick={() => downloadZip()}>
                      ดาวน์โหลดทั้งหมด (.zip)
                    </Button>
                  </>
                }
              />
              {running && <Progress value={progress} className="rounded-none" />}
              <ul className="divide-y divide-line">
                {jobs.map((j) => (
                  <li key={j.caseId} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      disabled={j.status !== "done"}
                      checked={picked.has(j.caseId)}
                      onChange={() =>
                        setPicked((p) => {
                          const n = new Set(p);
                          if (n.has(j.caseId)) n.delete(j.caseId);
                          else n.add(j.caseId);
                          return n;
                        })
                      }
                      aria-label={`เลือก ${j.caseNo}`}
                    />
                    <div
                      className={cx(
                        "grid size-10 shrink-0 place-items-center rounded-xl",
                        j.status === "done" ? "bg-ok-soft text-ok" : j.status === "error" ? "bg-danger-soft text-danger" : "bg-surface-3 text-ink-3",
                      )}
                    >
                      {j.status === "working" ? (
                        <Loader2 className="size-5 animate-spin" />
                      ) : j.status === "error" ? (
                        <XCircle className="size-5" />
                      ) : j.status === "done" ? (
                        <FileSpreadsheet className="size-5" />
                      ) : (
                        <FileSpreadsheet className="size-5 opacity-50" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[13.5px] font-medium text-ink">{j.file?.fileName ?? `คดี ${j.caseNo}`}</div>
                      <div className="text-[12px] text-ink-3">
                        {j.status === "done" && (
                          <span className="inline-flex items-center gap-1 text-ok">
                            <CheckCircle2 className="size-3" /> พร้อมดาวน์โหลด · {fmtBytes(j.file!.blob.size)}
                          </span>
                        )}
                        {j.status === "working" && "กำลังสร้าง..."}
                        {j.status === "pending" && "รอคิว"}
                        {j.status === "error" && <span className="text-danger">{j.error}</span>}
                      </div>
                    </div>
                    <Badge tone="primary" className="hidden sm:inline-flex">
                      {templateMeta(opts.template).short}
                    </Badge>
                    <Button size="sm" icon={<Download className="size-4" />} disabled={j.status !== "done"} onClick={() => j.file && downloadBlob(j.file.blob, j.file.fileName)}>
                      ดาวน์โหลด
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
