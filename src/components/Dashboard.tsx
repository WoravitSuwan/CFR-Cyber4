"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Banknote, FileStack, FolderKanban, Receipt } from "lucide-react";
import type { CaseSummary } from "@/lib/types";
import { ApiError, api, fmtInt, fmtMoney } from "@/lib/client";
import { CaseTable } from "./CaseTable";
import { DbNotice } from "./DbNotice";
import { ImportPanel } from "./ImportPanel";
import { Stat } from "./ui";

interface Stats {
  cases: number;
  transactions: number;
  amount: number;
  files: number;
}

export function Dashboard() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [allCases, setAllCases] = useState<CaseSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        api<{ cases: CaseSummary[] }>(`/api/cases${q ? `?q=${encodeURIComponent(q)}` : ""}`),
        api<Stats>("/api/stats"),
      ]);
      setCases(c.cases);
      if (!q) setAllCases(c.cases);
      setStats(s);
      setDbError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) setDbError(e.message);
      else setDbError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onQuery = (q: string) => {
    setQuery(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(q), 300);
  };

  return (
    <div className="space-y-6">
      <section className="animate-fade-up flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[12px] text-ink-2 shadow-sm">
            <span className="size-1.5 rounded-full bg-ok shadow-[0_0_0_3px_var(--ok-soft)]" /> Central Fraud Registry · Money Trail
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[32px] sm:leading-tight">
            วิเคราะห์ <span className="grad-text">เส้นทางการเงิน</span> จากข้อมูล CFR
          </h1>
          <p className="mt-2 max-w-2xl text-[14.5px] text-ink-2">
            นำเข้าไฟล์ข้อมูลดิบหลายไฟล์พร้อมกันผ่าน ZIP ระบบจะเชื่อมโยงธุรกรรมเป็นเส้นทางเงินทีละทอด แล้วส่งออกเป็นไฟล์ Excel
            แยกรายคดีตามรูปแบบที่ต้องการ
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat icon={<FolderKanban className="size-5" />} label="คดีทั้งหมด" value={stats ? fmtInt(stats.cases) : "–"} />
        <Stat icon={<Receipt className="size-5" />} label="ธุรกรรม" value={stats ? fmtInt(stats.transactions) : "–"} tone="accent" />
        <Stat icon={<Banknote className="size-5" />} label="ยอดเงินรวม (บาท)" value={stats ? fmtMoney(stats.amount, 0) : "–"} tone="warn" />
        <Stat icon={<FileStack className="size-5" />} label="ไฟล์ที่นำเข้า" value={stats ? fmtInt(stats.files) : "–"} tone="ok" />
      </section>

      {dbError && <DbNotice message={dbError} />}

      <ImportPanel existing={allCases} onImported={() => load(query)} />

      <CaseTable cases={cases} loading={loading} query={query} onQuery={onQuery} onChanged={() => load(query)} />
    </div>
  );
}
